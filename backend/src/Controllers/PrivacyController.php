<?php
declare(strict_types=1);

namespace Charria\Controllers;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Consents;
use Charria\Services\Mailer;
use Charria\Services\Privacy;
use Charria\Services\RateLimiter;
use Charria\Services\Settings;
use Charria\Validator;

/**
 * Página "Mis datos" (mis-datos.html): cualquier persona puede pedir una copia
 * de sus datos, que se borren o darse de baja de las comunicaciones.
 * Para comprobar que el email es suyo se envía un enlace de un solo uso
 * (24 h). La acción se ejecuta al pulsar el botón de la página, nunca al abrir
 * el enlace (los antivirus del correo abren los enlaces solos).
 */
final class PrivacyController
{
    private const TYPES = [
        'export' => 'descargar una copia de tus datos',
        'delete' => 'borrar tus datos',
        'unsubscribe' => 'darte de baja de las comunicaciones comerciales',
    ];

    /** POST /privacy/request { email, type: export | delete | unsubscribe } */
    public function request(Request $r): Response
    {
        RateLimiter::hit('privacy:' . $r->ip, 6, 3600);
        $v = new Validator($r->body());
        $email = $v->email('email', true);
        $type = $v->enum('type', array_keys(self::TYPES), true);
        $v->check();
        RateLimiter::hit('privacy-email:' . mb_strtolower($email), 3, 86400);
        if (!Mailer::canSend()) {
            $contact = Env::get('LEGAL_EMAIL') ?: Env::get('SITE_EMAIL');
            throw new HttpError(503, 'mail_unavailable', 'Ahora mismo no podemos enviar el email de confirmación.'
                . ($contact ? " Escríbenos a $contact y lo gestionamos a mano." : ' Escríbenos y lo gestionamos a mano.'));
        }

        $token = bin2hex(random_bytes(24));
        Database::get()->insert('privacy_requests', [
            'email' => $email,
            'type' => $type,
            'token_hash' => hash('sha256', $token),
            'expires_at' => date('Y-m-d H:i:s', time() + 86400),
        ]);
        $link = Settings::appUrl() . '/mis-datos.html?token=' . $token;
        Mailer::send($email, 'Confirma tu solicitud · Charria Ceramics',
            "Hola,\n\nHemos recibido una solicitud para " . self::TYPES[$type] . " en Charria Ceramics.\n\n"
            . "Para confirmarla abre este enlace y pulsa el botón (caduca en 24 horas):\n$link\n\n"
            . "Si no lo has pedido tú, ignora este email: no se hará nada.\n\nCharria Ceramics");
        // Misma respuesta haya o no datos de ese email: así no se puede averiguar quién es cliente
        return Response::created(['sent' => true]);
    }

    /** POST /privacy/confirm { token } → ejecuta la solicitud */
    public function confirm(Request $r): Response
    {
        RateLimiter::hit('privacy-confirm:' . $r->ip, 20, 3600);
        $token = (string) $r->input('token', '');
        $db = Database::get();
        $req = preg_match('/^[a-f0-9]{48}$/', $token)
            ? $db->one('SELECT * FROM privacy_requests WHERE token_hash = ?', [hash('sha256', $token)])
            : null;
        if (!$req || $req['status'] !== 'pending' || strtotime($req['expires_at']) < time()) {
            throw new HttpError(410, 'link_expired', 'Este enlace ya se ha usado o ha caducado. Puedes pedir uno nuevo desde esta misma página.');
        }
        $email = $req['email'];
        $out = ['type' => $req['type']];
        if ($req['type'] === 'export') {
            $out['data'] = Privacy::export($email);
            $result = 'Datos entregados';
        } elseif ($req['type'] === 'delete') {
            $out['summary'] = Privacy::erase($email);
            $result = 'Datos suprimidos';
        } else {
            $out['unsubscribed'] = self::unsubscribe($email, 'privacy_request', $r);
            $result = 'Baja de comunicaciones';
        }
        $db->update('privacy_requests', ['status' => 'done', 'done_at' => date('Y-m-d H:i:s'), 'result' => $result], 'id = :id', ['id' => $req['id']]);
        Mailer::admin('Solicitud de privacidad atendida', "$result (" . $req['type'] . ")\nEmail: " . ($req['type'] === 'delete' ? '(suprimido)' : $email));
        return Response::json($out);
    }

    /** POST /privacy/unsubscribe { email, signature } — enlace de baja directo (sin email de confirmación) */
    public function unsubscribeLink(Request $r): Response
    {
        RateLimiter::hit('privacy-confirm:' . $r->ip, 20, 3600);
        $v = new Validator($r->body());
        $email = $v->email('email', true);
        $signature = $v->string('signature', true, 64);
        $v->check();
        if (!hash_equals(Privacy::unsubscribeSignature($email), (string) $signature)) {
            throw new HttpError(403, 'bad_signature', 'El enlace de baja no es válido. Puedes darte de baja desde esta misma página con tu email.');
        }
        return Response::json(['unsubscribed' => self::unsubscribe($email, 'unsubscribe_link', $r)]);
    }

    private static function unsubscribe(string $email, string $source, Request $r): bool
    {
        $customer = Database::get()->one('SELECT * FROM customers WHERE email = ?', [$email]);
        if (!$customer || !$customer['marketing_opt_in']) {
            return false;
        }
        \Charria\Services\Customers::setMarketing($customer, false);
        Consents::record($email, 'marketing', false, $source, $r);
        return true;
    }
}
