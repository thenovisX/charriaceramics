<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Env;
use Charria\Http\HttpError;

/**
 * Emails de aviso. Según Ajustes → Correo (MAIL_PROVIDER):
 *  - hosting (por defecto): mail() de PHP; Hostinger lo permite con un remitente del propio dominio.
 *  - gmail: SMTP de Google (smtp.gmail.com:465) con una contraseña de aplicación.
 *  - smtp: otro servidor (p. ej. el buzón de Hostinger, smtp.hostinger.com:465).
 * Si falla no rompe la compra: solo queda en el log.
 */
final class Mailer
{
    public const PROVIDERS = ['hosting', 'gmail', 'smtp'];

    /** $replyTo: a quién se responde (por defecto, al email de avisos del estudio) */
    public static function send(string $to, string $subject, string $text, ?string $replyTo = null): void
    {
        if (!self::canSend() || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        try {
            self::deliver($to, $subject, $text, $replyTo);
        } catch (\RuntimeException $e) {
            Log::error('email failed', ['to' => $to, 'error' => $e->getMessage()]);
        }
    }

    /** ¿Hay remitente configurado? (sin él no sale ningún email) */
    public static function canSend(): bool
    {
        return (bool) Env::get('MAIL_FROM') && !Env::bool('MAIL_DISABLED');
    }

    public static function admin(string $subject, string $text, ?string $replyTo = null): void
    {
        $admin = Env::get('MAIL_ADMIN');
        if ($admin) {
            self::send($admin, $subject, $text, $replyTo);
        }
    }

    /** Botón «Enviar correo de prueba» del panel: manda uno y devuelve a quién, o lanza el error explicado. */
    public static function test(): string
    {
        $from = Env::get('MAIL_FROM');
        if (!$from) {
            throw HttpError::validation(['MAIL_FROM' => 'Primero pon el email remitente']);
        }
        $provider = self::provider();
        if ($provider !== 'hosting' && !Env::get('SMTP_PASS')) {
            throw HttpError::validation(['SMTP_PASS' => $provider === 'gmail' ? 'Falta la contraseña de aplicación de Google' : 'Falta la contraseña del buzón']);
        }
        if ($provider === 'smtp' && !Env::get('SMTP_HOST')) {
            throw HttpError::validation(['SMTP_HOST' => 'Falta el servidor de correo']);
        }
        $to = Env::get('MAIL_ADMIN') ?: $from;
        try {
            self::deliver($to, 'Correo de prueba · ' . self::fromName(),
                "¡Funciona!\n\nEste es el correo de prueba que has pedido desde Panel → Ajustes → Correo.\n"
                . "Así llegarán a tus clientes las confirmaciones de pedidos y reservas, y a ti los avisos.\n\n"
                . 'Enviado ' . self::via() . ' el ' . date('d/m/Y \a \l\a\s H:i') . '.');
        } catch (\RuntimeException $e) {
            throw new HttpError(502, 'mail_error', $e->getMessage());
        }
        return $to;
    }

    public static function provider(): string
    {
        $p = Env::get('MAIL_PROVIDER', 'hosting');
        return in_array($p, self::PROVIDERS, true) ? $p : 'hosting';
    }

    public static function money(int $cents): string
    {
        return number_format($cents / 100, 2, ',', '.') . ' €';
    }

    private static function deliver(string $to, string $subject, string $text, ?string $replyTo = null): void
    {
        $from = (string) Env::get('MAIL_FROM');
        $replyTo = $replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL) ? $replyTo : (Env::get('MAIL_ADMIN') ?: $from);
        $provider = self::provider();
        if ($provider === 'hosting') {
            $headers = [
                'From: ' . self::encode(self::fromName()) . ' <' . $from . '>',
                'Reply-To: ' . $replyTo,
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
            ];
            if (!@mail($to, self::encode($subject), $text, implode("\r\n", $headers))) {
                throw new \RuntimeException('El hosting no ha aceptado el email (mail() ha fallado). Comprueba que el remitente es un buzón de tu dominio creado en hPanel → Emails, o usa Gmail.');
            }
            return;
        }
        [$host, $port, $user] = $provider === 'gmail'
            ? ['smtp.gmail.com', 465, $from]
            : [(string) Env::get('SMTP_HOST'), (int) (Env::get('SMTP_PORT') ?: 465), Env::get('SMTP_USER') ?: $from];
        (new Smtp($host, $port, $user, (string) Env::get('SMTP_PASS')))
            ->send($from, self::fromName(), $to, $replyTo, $subject, $text);
    }

    private static function via(): string
    {
        return match (self::provider()) {
            'gmail' => 'con Gmail',
            'smtp' => 'con el servidor ' . Env::get('SMTP_HOST'),
            default => 'con el correo del hosting',
        };
    }

    private static function fromName(): string
    {
        return Env::get('MAIL_FROM_NAME') ?: 'Charria Ceramics';
    }

    private static function encode(string $value): string
    {
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }
}
