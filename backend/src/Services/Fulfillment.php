<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;

/**
 * Qué pasa cuando Stripe confirma (o cancela) un pago. Lo llama el webhook,
 * que es la única fuente fiable: la página de "gracias" no confirma nada.
 */
final class Fulfillment
{
    /** checkout.session.completed / async_payment_succeeded */
    public static function paid(array $session): void
    {
        if (($session['payment_status'] ?? '') !== 'paid') {
            return; // pago diferido aún pendiente: llegará async_payment_succeeded
        }
        $type = $session['metadata']['type'] ?? '';
        $reference = $session['metadata']['reference'] ?? $session['client_reference_id'] ?? '';
        if ($type === 'order') {
            self::orderPaid($reference, $session);
        } elseif ($type === 'booking') {
            self::bookingPaid($reference, $session);
        }
    }

    /** checkout.session.expired / async_payment_failed: libera stock y plazas. */
    public static function failed(array $session): void
    {
        $reference = $session['metadata']['reference'] ?? $session['client_reference_id'] ?? '';
        $db = Database::get();
        if (($session['metadata']['type'] ?? '') === 'order') {
            $db->exec("UPDATE orders SET status = 'cancelled' WHERE reference = ? AND status = 'pending'", [$reference]);
        } else {
            $db->exec("UPDATE bookings SET status = 'cancelled' WHERE reference = ? AND status = 'pending_payment'", [$reference]);
        }
    }

    private static function orderPaid(string $reference, array $session): void
    {
        $db = Database::get();
        $order = $db->transaction(static function (Database $db) use ($reference, $session) {
            $order = $db->one('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [$reference]);
            if (!$order || !in_array($order['status'], ['pending', 'cancelled'], true)) {
                return null; // desconocido o ya procesado
            }
            if ((int) ($session['amount_total'] ?? -1) !== (int) $order['total_cents']) {
                // No debería ocurrir nunca: el importe lo fijó este servidor. Se registra para revisarlo.
                Log::error('Stripe amount mismatch', ['order' => $reference, 'stripe' => $session['amount_total'] ?? null, 'db' => $order['total_cents']]);
            }
            $db->update('orders', [
                'status' => 'paid',
                'paid_at' => date('Y-m-d H:i:s'),
                'stripe_payment_intent' => is_string($session['payment_intent'] ?? null) ? $session['payment_intent'] : null,
            ], 'id = :id', ['id' => $order['id']]);
            // Descontar stock; si llega a 0 la pieza aparece como agotada automáticamente
            foreach ($db->all('SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL', [$order['id']]) as $item) {
                $db->exec('UPDATE products SET stock = GREATEST(stock - ?, 0) WHERE id = ?', [$item['quantity'], $item['product_id']]);
            }
            return $db->one('SELECT * FROM orders WHERE id = ?', [$order['id']]);
        });
        if (!$order) {
            return;
        }

        if ($order['shipping_method'] === 'delivery') {
            self::createPacklinkDraft($order);
        }
        $items = $db->all('SELECT * FROM order_items WHERE order_id = ?', [$order['id']]);
        $lines = implode("\n", array_map(static fn ($i) => "  {$i['quantity']} × {$i['title']} · " . Mailer::money((int) $i['line_total_cents']), $items));
        $summary = "Pedido {$order['reference']}\n\n$lines\n\nEnvío: {$order['shipping_service_name']} · " . Mailer::money((int) $order['shipping_cents'])
            . "\nTotal: " . Mailer::money((int) $order['total_cents']);
        Mailer::send($order['customer_email'], "Tu pedido {$order['reference']} · Charria Ceramics",
            "Hola {$order['customer_name']},\n\nGracias por tu compra. Hemos recibido el pago.\n\n$summary\n\nTe avisaremos cuando salga del estudio.\n\nCharria Ceramics");
        Mailer::admin("Nuevo pedido {$order['reference']}", "$summary\n\nCliente: {$order['customer_name']} <{$order['customer_email']}> {$order['customer_phone']}\n"
            . ($order['shipping_method'] === 'pickup' ? 'Recogida en el estudio' : "Dirección: {$order['ship_street']}, {$order['ship_postal_code']} {$order['ship_city']} ({$order['ship_country']})"));
    }

    /** Crea el borrador en Packlink PRO. Si falla, el pedido sigue pagado y se puede reintentar desde el panel. */
    public static function createPacklinkDraft(array $order): ?string
    {
        if (!Packlink::isConfigured() || !str_starts_with($order['shipping_service_id'], 'pl:')) {
            return null;
        }
        $db = Database::get();
        try {
            $items = $db->all(
                'SELECT oi.quantity, p.weight_grams, p.length_cm, p.width_cm, p.height_cm FROM order_items oi
                 LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?',
                [$order['id']]
            );
            $quote = ['weight_grams' => 0, 'max_dimensions_cm' => [0, 0, 0]];
            foreach ($items as $i) {
                $quote['weight_grams'] += (int) ($i['weight_grams'] ?? 1000) * (int) $i['quantity'];
                $quote['max_dimensions_cm'] = [
                    max($quote['max_dimensions_cm'][0], (int) $i['length_cm']),
                    max($quote['max_dimensions_cm'][1], (int) $i['width_cm']),
                    max($quote['max_dimensions_cm'][2], (int) $i['height_cm']),
                ];
            }
            $ref = Packlink::createDraft($order, Shipping::package($quote));
            $db->update('orders', ['packlink_reference' => $ref, 'packlink_error' => ''], 'id = :id', ['id' => $order['id']]);
            return $ref;
        } catch (\Throwable $e) {
            $db->update('orders', ['packlink_error' => mb_substr($e->getMessage(), 0, 500)], 'id = :id', ['id' => $order['id']]);
            return null;
        }
    }

    private static function bookingPaid(string $reference, array $session): void
    {
        $db = Database::get();
        $booking = $db->one('SELECT b.*, c.email, c.name FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id WHERE b.reference = ?', [$reference]);
        if (!$booking || !in_array($booking['status'], ['pending_payment', 'cancelled'], true)) {
            return;
        }
        $db->update('bookings', ['status' => 'confirmed', 'paid_at' => date('Y-m-d H:i:s')], 'id = :id', ['id' => $booking['id']]);
        $when = $booking['starts_at'] ? date('d/m/Y H:i', strtotime($booking['starts_at'])) : '';
        $text = "Reserva {$booking['reference']}\n{$booking['class_title']} · $when\nPlazas: {$booking['seats']}\nTotal: " . Mailer::money((int) $booking['total_cents']);
        Mailer::send((string) $booking['email'], "Reserva confirmada · {$booking['class_title']}",
            "Hola {$booking['name']},\n\nTu plaza está confirmada.\n\n$text\n\nNos vemos en el estudio.\nCharria Ceramics");
        Mailer::admin("Nueva reserva {$booking['reference']}", "$text\nCliente: {$booking['name']} <{$booking['email']}>");
    }
}
