<?php
declare(strict_types=1);

namespace Charria\Controllers\Admin;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\AppSettings;
use Charria\Services\Fulfillment;
use Charria\Services\Messages;
use Charria\Services\Packlink;
use Charria\Services\PaymentAlerts;
use Charria\Services\Privacy;
use Charria\Services\Stripe;
use Charria\Validator;

/** Pedidos, clientes y resumen del panel. */
final class OrderAdminController
{
    private static function order(array $o, ?array $items = null): array
    {
        $out = [
            'id' => (int) $o['id'],
            'reference' => $o['reference'],
            'status' => $o['status'],
            'subtotal_cents' => (int) $o['subtotal_cents'],
            'discount_cents' => (int) $o['discount_cents'],
            'shipping_cents' => (int) $o['shipping_cents'],
            'total_cents' => (int) $o['total_cents'],
            'customer' => ['name' => $o['customer_name'], 'email' => $o['customer_email'], 'phone' => $o['customer_phone']],
            'shipping' => [
                'method' => $o['shipping_method'],
                'service_id' => $o['shipping_service_id'],
                'service_name' => $o['shipping_service_name'],
                'street' => $o['ship_street'],
                'city' => $o['ship_city'],
                'postal_code' => $o['ship_postal_code'],
                'country' => $o['ship_country'],
                'weight_grams' => (int) $o['parcel_weight_grams'],
                'packlink_reference' => $o['packlink_reference'],
                'packlink_error' => $o['packlink_error'],
            ],
            'stripe_payment_intent' => $o['stripe_payment_intent'],
            'privacy_blocked' => !empty($o['privacy_blocked_at']),
            'paid_at' => $o['paid_at'],
            'created_at' => $o['created_at'],
        ];
        if ($items !== null) {
            $out['items'] = array_map(static fn ($i) => [
                'product_id' => $i['product_id'] ? (int) $i['product_id'] : null,
                'title' => $i['title'],
                'quantity' => (int) $i['quantity'],
                'unit_price_cents' => (int) $i['unit_price_cents'],
                'discount_percent' => (int) $i['discount_percent'],
                'unit_final_cents' => (int) $i['unit_final_cents'],
                'line_total_cents' => (int) $i['line_total_cents'],
            ], $items);
        }
        return $out;
    }

    private function find(int $id): array
    {
        $o = Database::get()->one('SELECT * FROM orders WHERE id = ?', [$id]);
        if (!$o) {
            throw HttpError::notFound('Pedido no encontrado');
        }
        return $o;
    }

    /** GET /admin/orders?status=paid (por defecto oculta los pendientes caducados) */
    public function index(Request $r): Response
    {
        $status = $r->query['status'] ?? '';
        $db = Database::get();
        if (in_array($status, ['pending', 'paid', 'shipped', 'cancelled', 'refunded'], true)) {
            $rows = $db->all('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 500', [$status]);
        } else {
            $rows = $db->all("SELECT * FROM orders WHERE status <> 'cancelled' AND NOT (status = 'pending' AND expires_at < NOW()) ORDER BY created_at DESC LIMIT 500");
        }
        return Response::json(array_map(static fn ($o) => self::order($o), $rows));
    }

    public function show(Request $r): Response
    {
        $o = $this->find($r->intParam('id'));
        return Response::json(self::order($o, Database::get()->all('SELECT * FROM order_items WHERE order_id = ?', [$o['id']])));
    }

    /** PATCH /admin/orders/{id} { status: shipped | refunded | cancelled | paid } */
    public function update(Request $r): Response
    {
        $o = $this->find($r->intParam('id'));
        $v = new Validator($r->body());
        $status = $v->enum('status', ['paid', 'shipped', 'cancelled', 'refunded'], true);
        $v->check();
        if ($o['status'] === 'pending' && $status !== 'cancelled') {
            throw new HttpError(409, 'not_paid', 'Un pedido sin pagar solo se puede cancelar');
        }
        if ($o['status'] === 'pending' && $o['stripe_session_id']) {
            Stripe::expireCheckoutSession($o['stripe_session_id']);
        }
        Database::get()->exec('UPDATE orders SET status = ? WHERE id = ?', [$status, $o['id']]);
        // Nota: el reembolso del dinero se hace en el panel de Stripe; aquí solo se marca.
        return $this->show($r);
    }

    /** POST /admin/orders/{id}/packlink — reintenta crear el borrador de envío en Packlink PRO */
    public function packlink(Request $r): Response
    {
        $o = $this->find($r->intParam('id'));
        if (!Packlink::isConfigured()) {
            throw new HttpError(503, 'packlink_not_configured', 'Falta PACKLINK_API_KEY en el .env');
        }
        if (!in_array($o['status'], ['paid', 'shipped'], true) || $o['shipping_method'] !== 'delivery') {
            throw new HttpError(409, 'not_shippable', 'Solo se envían pedidos pagados con entrega a domicilio');
        }
        if (!Fulfillment::createPacklinkDraft($o)) {
            $o = $this->find($o['id']);
            throw new HttpError(502, 'packlink_error', 'Packlink no aceptó el envío: ' . ($o['packlink_error'] ?: 'el servicio elegido no es de Packlink'));
        }
        return $this->show($r);
    }

    /** GET /admin/stats — números para la portada del panel */
    public function stats(Request $r): Response
    {
        $db = Database::get();
        Privacy::anonymizeExpired(); // plazos de conservación, aunque no haya cron
        return Response::json([
            'orders_to_ship' => (int) $db->value("SELECT COUNT(*) FROM orders WHERE status = 'paid' AND shipping_method = 'delivery'"),
            'orders_to_collect' => (int) $db->value("SELECT COUNT(*) FROM orders WHERE status = 'paid' AND shipping_method = 'pickup'"),
            'sales_30d_cents' => (int) $db->value("SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE status IN ('paid','shipped') AND paid_at > NOW() - INTERVAL 30 DAY"),
            'bookings_30d_cents' => (int) $db->value("SELECT COALESCE(SUM(total_cents), 0) FROM bookings WHERE status = 'confirmed' AND paid_at > NOW() - INTERVAL 30 DAY"),
            'bookings_unpaid' => (int) $db->value("SELECT COUNT(*) FROM bookings WHERE status = 'confirmed' AND payment_method IN ('in_person','subscription') AND paid_at IS NULL AND (payment_method = 'subscription' AND subscription_status = 'past_due' OR payment_method = 'in_person' AND (starts_at IS NULL OR starts_at >= CURDATE()))"),
            'payments_overdue' => count(PaymentAlerts::overdue()),
            'private_requests' => (int) $db->value("SELECT COUNT(*) FROM bookings WHERE status = 'requested'"),
            'unread_messages' => Messages::unread(),
            'upcoming_sessions' => (int) $db->value('SELECT COUNT(*) FROM class_sessions WHERE is_cancelled = 0 AND starts_at > NOW()'),
            'low_stock' => array_map(static fn ($p) => ['id' => (int) $p['id'], 'title' => $p['title'], 'stock' => (int) $p['stock']],
                $db->all('SELECT id, title, stock FROM products WHERE is_active = 1 AND sold_out = 0 AND stock <= 1 ORDER BY stock, title')),
            'payments_configured' => Stripe::isConfigured(),
            'packlink_configured' => Packlink::isConfigured(),
            'legal_missing' => AppSettings::legalMissing(),
            'legacy_customers' => (int) $db->value('SELECT COUNT(*) FROM customers WHERE has_profile = 0 AND marketing_opt_in = 0'),
        ]);
    }
}
