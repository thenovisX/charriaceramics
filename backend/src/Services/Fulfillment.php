<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Env;

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
        $booking = $db->one('SELECT * FROM bookings WHERE reference = ?', [$reference]);
        if (!$booking || !in_array($booking['status'], ['pending_payment', 'cancelled'], true)) {
            return;
        }
        $data = ['status' => 'confirmed', 'paid_at' => date('Y-m-d H:i:s')];
        if ($booking['payment_method'] === 'subscription') {
            $data += [
                'stripe_subscription_id' => is_string($session['subscription'] ?? null) ? $session['subscription'] : null,
                'subscription_status' => 'active',
                'paid_until' => date('Y-m-d H:i:s', strtotime('+1 month')),
            ];
        }
        $db->update('bookings', $data, 'id = :id', ['id' => $booking['id']]);
        self::bookingConfirmedEmails($booking);
    }

    /** invoice.paid: la cuota de un mes siguiente (la primera la confirma el Checkout). */
    public static function invoicePaid(array $invoice): void
    {
        if (($invoice['billing_reason'] ?? '') !== 'subscription_cycle') {
            return;
        }
        $db = Database::get();
        $booking = self::bookingOfInvoice($invoice);
        if (!$booking) {
            return;
        }
        $end = $invoice['lines']['data'][0]['period']['end'] ?? null;
        $db->update('bookings', [
            'paid_at' => date('Y-m-d H:i:s'),
            'subscription_status' => 'active',
            'paid_until' => date('Y-m-d H:i:s', is_int($end) ? $end : strtotime('+1 month')),
        ], 'id = :id', ['id' => $booking['id']]);
    }

    /** invoice.payment_failed: la cuota del mes no se ha cobrado; la reserva pasa a «sin pagar» y se avisa al estudio. */
    public static function invoiceFailed(array $invoice): void
    {
        $booking = self::bookingOfInvoice($invoice);
        if (!$booking) {
            return;
        }
        Database::get()->update('bookings', ['paid_at' => null, 'subscription_status' => 'past_due'], 'id = :id', ['id' => $booking['id']]);
        Mailer::admin("Cuota sin cobrar · {$booking['reference']}",
            "No se ha podido cobrar la cuota mensual de la suscripción de {$booking['customer_name']} <{$booking['customer_email']}> ({$booking['class_title']}).\n"
            . 'Stripe reintentará el cobro. Lo ves en el panel → Reservas → «Sin pagar».');
    }

    /** customer.subscription.deleted: la suscripción se ha cancelado o ha agotado los reintentos. */
    public static function subscriptionDeleted(array $subscription): void
    {
        $db = Database::get();
        $booking = $db->one('SELECT * FROM bookings WHERE stripe_subscription_id = ?', [$subscription['id'] ?? '']);
        if ($booking) {
            $db->update('bookings', ['subscription_status' => 'canceled'], 'id = :id', ['id' => $booking['id']]);
        }
    }

    private static function bookingOfInvoice(array $invoice): ?array
    {
        $subscription = is_string($invoice['subscription'] ?? null) ? $invoice['subscription'] : '';
        return $subscription === '' ? null
            : Database::get()->one("SELECT * FROM bookings WHERE stripe_subscription_id = ? AND payment_method = 'subscription'", [$subscription]);
    }

    /** Emails de reserva confirmada (al cliente y al estudio), pagada online o por pagar en el taller. */
    public static function bookingConfirmedEmails(array $booking): void
    {
        $method = $booking['payment_method'] ?? 'online';
        $inPerson = $method === 'in_person';
        $when = $booking['starts_at'] ? self::longDate($booking['starts_at']) : '';
        $text = "Reserva {$booking['reference']}\n{$booking['class_title']} · $when\nPlazas: {$booking['seats']}\nTotal: " . Mailer::money((int) $booking['total_cents'])
            . match ($method) {
                'in_person' => "\nPago: en el taller, el día de la clase (pendiente) · efectivo, tarjeta o Bizum",
                'subscription' => "\nPago: suscripción mensual online (primera cuota pagada)",
                default => "\nPago: online (pagado)",
            };
        $where = trim(implode(', ', array_filter([Env::get('SITE_ADDRESS'), Env::get('SITE_CITY')])));
        Mailer::send($booking['customer_email'], "Reserva confirmada · {$booking['class_title']}",
            "Hola {$booking['customer_name']},\n\nTu plaza está confirmada."
            . ($method === 'subscription' ? ' La cuota se cobra cada mes en tu tarjeta; para darte de baja, escríbenos.' : '')
            . ($inPerson ? ' Pagas en el taller el día de la clase, en efectivo, con tarjeta o por Bizum. Si no puedes venir, avísanos para liberar la plaza.' : '')
            . "\n\n$text" . ($where ? "\nDónde: $where" : '')
            . "\n\nTodos los datos de tu reserva:\n" . self::bookingUrl($booking['reference'])
            . "\n\nNos vemos en el estudio.\nCharria Ceramics");
        Mailer::admin(($inPerson ? 'Nueva reserva (pago en el taller) ' : ($method === 'subscription' ? 'Nueva suscripción ' : 'Nueva reserva ')) . $booking['reference'],
            "$text\nCliente: {$booking['customer_name']} <{$booking['customer_email']}> {$booking['customer_phone']}");
    }

    /** Enlace privado a la página «Reserva confirmada» (reserva.html): sin la firma no se ven los datos. */
    public static function bookingUrl(string $reference): string
    {
        return Settings::appUrl() . '/reserva.html?ref=' . rawurlencode($reference) . '&t=' . self::bookingToken($reference);
    }

    public static function bookingToken(string $reference): string
    {
        return substr(AppSettings::sign('booking-view|' . $reference), 0, 32);
    }

    /** «martes 3 de noviembre de 2026, 18:00» (sin depender de las locales del servidor). */
    public static function longDate(string $datetime): string
    {
        $t = strtotime($datetime);
        $days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
        $months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return $days[(int) date('N', $t) - 1] . ' ' . date('j', $t) . ' de ' . $months[(int) date('n', $t) - 1] . ' de ' . date('Y, H:i', $t);
    }
}
