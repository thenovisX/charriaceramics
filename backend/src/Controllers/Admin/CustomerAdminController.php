<?php
declare(strict_types=1);

namespace Charria\Controllers\Admin;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Consents;
use Charria\Services\Customers;
use Charria\Services\Privacy;
use Charria\Validator;

/**
 * Clientes del panel: perfiles guardados con permiso, lista de marketing,
 * exportar o borrar los datos de una persona y registro de solicitudes RGPD.
 */
final class CustomerAdminController
{
    private static function customer(array $c): array
    {
        return [
            'id' => (int) $c['id'], 'name' => $c['name'], 'email' => $c['email'], 'phone' => $c['phone'],
            'street' => $c['street'], 'city' => $c['city'], 'postal_code' => $c['postal_code'], 'country' => $c['country'],
            'has_profile' => (bool) $c['has_profile'], 'marketing_opt_in' => (bool) $c['marketing_opt_in'],
            'marketing_updated_at' => $c['marketing_updated_at'],
            'orders' => (int) ($c['orders'] ?? 0), 'bookings' => (int) ($c['bookings'] ?? 0), 'created_at' => $c['created_at'],
        ];
    }

    private function find(int $id): array
    {
        $c = Database::get()->one('SELECT * FROM customers WHERE id = ?', [$id]);
        if (!$c) {
            throw HttpError::notFound('Cliente no encontrado');
        }
        return $c;
    }

    /** GET /admin/customers?filter=profiles (por defecto) | marketing */
    public function index(Request $r): Response
    {
        $where = ($r->query['filter'] ?? '') === 'marketing' ? 'c.marketing_opt_in = 1' : 'c.has_profile = 1';
        $rows = Database::get()->all(
            "SELECT c.*,
                (SELECT COUNT(*) FROM orders o WHERE o.customer_email = c.email AND o.status IN ('paid','shipped')) AS orders,
                (SELECT COUNT(*) FROM bookings b WHERE b.customer_email = c.email AND b.status IN ('confirmed','requested')) AS bookings
             FROM customers c WHERE $where ORDER BY c.created_at DESC LIMIT 2000"
        );
        return Response::json(array_map([self::class, 'customer'], $rows));
    }

    /** GET /admin/customers/{id} — perfil, pedidos, reservas y consentimientos */
    public function show(Request $r): Response
    {
        $c = $this->find($r->intParam('id'));
        $db = Database::get();
        $out = self::customer($c);
        $out['order_list'] = array_map(static fn ($o) => [
            'id' => (int) $o['id'], 'reference' => $o['reference'], 'status' => $o['status'], 'total_cents' => (int) $o['total_cents'], 'created_at' => $o['created_at'],
        ], $db->all('SELECT id, reference, status, total_cents, created_at FROM orders WHERE customer_email = ? ORDER BY created_at DESC LIMIT 100', [$c['email']]));
        $out['booking_list'] = array_map(static fn ($b) => [
            'id' => (int) $b['id'], 'reference' => $b['reference'], 'status' => $b['status'], 'class_title' => $b['class_title'],
            'starts_at' => $b['starts_at'] ?? $b['preferred_date'], 'total_cents' => (int) $b['total_cents'],
        ], $db->all('SELECT id, reference, status, class_title, starts_at, preferred_date, total_cents FROM bookings WHERE customer_email = ? ORDER BY created_at DESC LIMIT 100', [$c['email']]));
        $out['consents'] = Consents::history($c['email']);
        return Response::json($out);
    }

    /** PATCH /admin/customers/{id} { marketing_opt_in: bool } */
    public function update(Request $r): Response
    {
        $c = $this->find($r->intParam('id'));
        $v = new Validator($r->body());
        $optIn = $v->bool('marketing_opt_in', true);
        $v->check();
        if ($optIn !== (bool) $c['marketing_opt_in']) {
            Customers::setMarketing($c, $optIn);
            Consents::record($c['email'], 'marketing', $optIn, 'panel', $r);
        }
        $after = Database::get()->one('SELECT * FROM customers WHERE id = ?', [$c['id']]);
        return Response::json($after ? self::customer($after) : ['deleted' => true]);
    }

    /** GET /admin/customers/{id}/export — lo mismo que recibe el cliente si pide sus datos */
    public function export(Request $r): Response
    {
        return Response::json(Privacy::export($this->find($r->intParam('id'))['email']));
    }

    /** DELETE /admin/customers/{id} — supresión (derecho al olvido) conservando lo que obliga la ley */
    public function destroy(Request $r): Response
    {
        return self::erase($this->find($r->intParam('id'))['email']);
    }

    /** POST /admin/customers/erase { email } — borrar por email (p. ej. alguien que lo pide por teléfono y no tiene perfil) */
    public function eraseByEmail(Request $r): Response
    {
        $v = new Validator($r->body());
        $email = $v->email('email', true);
        $v->check();
        return self::erase($email);
    }

    /** Borra y deja constancia en el registro de solicitudes (sin el email). */
    private static function erase(string $email): Response
    {
        $summary = Privacy::erase($email);
        Database::get()->insert('privacy_requests', [
            'email' => Privacy::fingerprint($email), 'type' => 'delete', 'token_hash' => hash('sha256', random_bytes(16)),
            'status' => 'done', 'source' => 'panel', 'result' => 'Datos suprimidos desde el panel',
            'expires_at' => date('Y-m-d H:i:s'), 'done_at' => date('Y-m-d H:i:s'),
        ]);
        return Response::json($summary);
    }

    /** GET /admin/marketing — lista para exportar (CSV en el panel) con enlace de baja de cada persona */
    public function marketing(Request $r): Response
    {
        $rows = Database::get()->all('SELECT * FROM customers WHERE marketing_opt_in = 1 ORDER BY created_at');
        return Response::json(array_map(static function ($c) {
            $since = Database::get()->value(
                "SELECT MAX(created_at) FROM consents WHERE subject_email = ? AND purpose = 'marketing' AND granted = 1",
                [mb_strtolower($c['email'])]
            );
            return [
                'name' => $c['name'], 'email' => $c['email'], 'since' => $since ?: $c['marketing_updated_at'],
                'unsubscribe_url' => Privacy::unsubscribeUrl($c['email']),
            ];
        }, $rows));
    }

    /** POST /admin/customers/purge-legacy — borra los clientes creados antes de pedir permiso (sin perfil ni marketing) */
    public function purgeLegacy(Request $r): Response
    {
        $n = Database::get()->exec('DELETE FROM customers WHERE has_profile = 0 AND marketing_opt_in = 0');
        return Response::json(['deleted' => $n]);
    }

    /** GET /admin/privacy-requests — registro de solicitudes (hay que poder demostrar que se atendieron) */
    public function requests(Request $r): Response
    {
        $rows = Database::get()->all('SELECT * FROM privacy_requests ORDER BY created_at DESC LIMIT 200');
        return Response::json(array_map(static fn ($q) => [
            'id' => (int) $q['id'],
            'email' => str_starts_with($q['email'], 'h:') ? '(suprimido)' : $q['email'],
            'type' => $q['type'], 'status' => $q['status'] === 'pending' && strtotime($q['expires_at']) < time() ? 'expired' : $q['status'],
            'source' => $q['source'], 'result' => $q['result'], 'created_at' => $q['created_at'], 'done_at' => $q['done_at'],
        ], $rows));
    }
}
