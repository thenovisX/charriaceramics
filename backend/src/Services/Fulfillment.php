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
        $type = $session['metadata']['type'] ?? '';
        $reference = $session['metadata']['reference'] ?? $session['client_reference_id'] ?? '';
        if (($session['payment_status'] ?? '') !== 'paid') {
            // Pago diferido (p. ej. domiciliación SEPA): el cliente ya lo ha enviado y puede tardar días en
            // confirmarse (llegará async_payment_succeeded). Se le sigue guardando el pedido mientras tanto.
            if (($session['status'] ?? '') === 'complete') {
                self::extendHold($type, $reference);
            }
            return;
        }
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

    /** Días que se guarda un pedido o una plaza cuyo pago diferido está en curso. */
    private const DEFERRED_HOLD_DAYS = 7;

    private static function extendHold(string $type, string $reference): void
    {
        $until = date('Y-m-d H:i:s', strtotime('+' . self::DEFERRED_HOLD_DAYS . ' days'));
        $db = Database::get();
        if ($type === 'order') {
            $db->exec("UPDATE orders SET expires_at = ? WHERE reference = ? AND status = 'pending'", [$until, $reference]);
        } elseif ($type === 'booking') {
            $db->exec("UPDATE bookings SET expires_at = ? WHERE reference = ? AND status = 'pending_payment'", [$until, $reference]);
        }
    }

    /**
     * ¿Es esta la sesión de Stripe que creó este servidor para este pedido, con su importe y moneda?
     * Una firma válida solo prueba que el aviso viene de Stripe, no que lo pagado sea lo esperado
     * (p. ej. una clave de Stripe filtrada permitiría crear una sesión de 0,50 € con la referencia de otro pedido).
     */
    private static function matchesSession(?string $expectedSession, int $expectedTotal, string $currency, array $session): bool
    {
        return $expectedSession !== null && $expectedSession !== ''
            && ($session['id'] ?? null) === $expectedSession
            && (int) ($session['amount_total'] ?? -1) === $expectedTotal
            && strtolower((string) ($session['currency'] ?? '')) === strtolower($currency);
    }

    private static function orderPaid(string $reference, array $session): void
    {
        $db = Database::get();
        $order = $db->transaction(static function (Database $db) use ($reference, $session) {
            $order = $db->one('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [$reference]);
            if (!$order || !in_array($order['status'], ['pending', 'cancelled'], true)) {
                return null; // desconocido o ya procesado
            }
            $problem = null;
            $items = $db->all('SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL', [$order['id']]);
            if (!self::matchesSession($order['stripe_session_id'], (int) $order['total_cents'], (string) $order['currency'], $session)) {
                $problem = 'El importe, la moneda o la sesión de pago de Stripe no coinciden con el pedido';
            } else {
                // El pago puede llegar tarde (pago diferido, o con el pedido ya caducado): se mira que siga
                // habiendo pieza, sin contar lo que otros clientes tienen en su cesta ahora mismo.
                foreach ($items as $item) {
                    $stock = $db->value('SELECT stock FROM products WHERE id = ? FOR UPDATE', [$item['product_id']]);
                    $held = (int) $db->value(
                        "SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                         WHERE oi.product_id = ? AND o.status = 'pending' AND o.expires_at > NOW() AND o.id <> ? AND o.customer_email <> ?",
                        [$item['product_id'], $order['id'], $order['customer_email']]
                    );
                    if ($stock === null || (int) $stock - $held < (int) $item['quantity']) {
                        $problem = 'Cuando llegó el pago ya no quedaba stock de alguna pieza';
                        break;
                    }
                }
            }
            $db->update('orders', [
                'status' => $problem ? 'review' : 'paid',
                'paid_at' => date('Y-m-d H:i:s'),
                'stripe_payment_intent' => is_string($session['payment_intent'] ?? null) ? $session['payment_intent'] : null,
            ], 'id = :id', ['id' => $order['id']]);
            if (!$problem) {
                // Descontar stock; si llega a 0 la pieza aparece como agotada automáticamente
                foreach ($items as $item) {
                    $db->exec('UPDATE products SET stock = stock - ? WHERE id = ?', [$item['quantity'], $item['product_id']]);
                }
            }
            return $db->one('SELECT * FROM orders WHERE id = ?', [$order['id']]) + ['problem' => $problem];
        });
        if (!$order) {
            return;
        }
        if ($order['problem']) {
            self::reviewNotice('Pedido', $order, (string) $order['problem']);
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
        $booking = $db->transaction(static function (Database $db) use ($reference, $session) {
            $booking = $db->one('SELECT * FROM bookings WHERE reference = ? FOR UPDATE', [$reference]);
            if (!$booking || !in_array($booking['status'], ['pending_payment', 'cancelled'], true)) {
                return null;
            }
            $problem = null;
            if (!self::matchesSession($booking['stripe_session_id'], (int) $booking['total_cents'], Settings::currency(), $session)) {
                $problem = 'El importe, la moneda o la sesión de pago de Stripe no coinciden con la reserva';
            } elseif ($booking['session_id']) {
                // Igual que con el stock: el pago puede llegar con la reserva ya caducada y el horario lleno
                $class = $db->one('SELECT capacity FROM classes WHERE id = ?', [$booking['class_id']]);
                $slot = $db->one('SELECT * FROM class_sessions WHERE id = ? FOR UPDATE', [$booking['session_id']]);
                if (!$slot || !$class || $slot['is_cancelled']) {
                    $problem = 'El horario ya no existe o se ha cancelado';
                } else {
                    $taken = (int) $db->value(
                        "SELECT COALESCE(SUM(seats), 0) FROM bookings WHERE session_id = ? AND id <> ?
                           AND (status = 'confirmed' OR (status = 'pending_payment' AND expires_at > NOW() AND customer_email <> ?))",
                        [$booking['session_id'], $booking['id'], $booking['customer_email']]
                    );
                    if ($taken + (int) $booking['seats'] > (int) ($slot['capacity'] ?? $class['capacity'])) {
                        $problem = 'Cuando llegó el pago ya no quedaban plazas en ese horario';
                    }
                }
            }
            $data = ['status' => $problem ? 'review' : 'confirmed', 'paid_at' => date('Y-m-d H:i:s')];
            if ($booking['payment_method'] === 'subscription') {
                $data += [
                    'stripe_subscription_id' => is_string($session['subscription'] ?? null) ? $session['subscription'] : null,
                    'subscription_status' => 'active',
                    'paid_until' => date('Y-m-d H:i:s', strtotime('+1 month')),
                ];
            }
            $db->update('bookings', $data, 'id = :id', ['id' => $booking['id']]);
            return $booking + ['problem' => $problem];
        });
        if (!$booking) {
            return;
        }
        if ($booking['problem']) {
            self::reviewNotice('Reserva', $booking, (string) $booking['problem']);
            return;
        }
        self::bookingConfirmedEmails($booking);
    }

    /**
     * Pago recibido pero que no se puede dar por bueno solo: queda en «Revisar» y se avisa al estudio
     * (para resolverlo y reembolsar desde Stripe) y a la persona, sin prometerle nada que no sea cierto.
     */
    private static function reviewNotice(string $what, array $row, string $problem): void
    {
        $email = (string) ($row['customer_email'] ?? '');
        $name = (string) ($row['customer_name'] ?? '');
        Log::error('Pago a revisar', ['ref' => $row['reference'], 'problem' => $problem]);
        Mailer::admin("{$what} cobrado que hay que revisar · {$row['reference']}",
            "{$what} {$row['reference']}: Stripe ha cobrado {$row['total_cents']} céntimos, pero no se ha confirmado solo.\n"
            . "Motivo: $problem.\n\nCliente: $name <$email>\n\n"
            . 'Qué hacer: escribe a la persona y, si no puedes darle lo que pagó, reembolsa desde el panel de Stripe y marca el '
            . strtolower($what) . ' como Cancelado. Si todo está bien, márcalo como Pagado o Confirmada. Está en el panel con la etiqueta «Revisar».');
        Mailer::send($email, "Hemos recibido tu pago · {$row['reference']} · Charria Ceramics",
            "Hola $name,\n\nHemos recibido tu pago ({$row['reference']}), pero tenemos que comprobar un detalle de la disponibilidad antes de confirmártelo. "
            . "Te escribiremos en menos de 24 horas para resolverlo.\n\nCharria Ceramics");
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
        $when = $booking['starts_at'] ? date('d/m/Y H:i', strtotime($booking['starts_at'])) : '';
        $text = "Reserva {$booking['reference']}\n{$booking['class_title']} · $when\nPlazas: {$booking['seats']}\nTotal: " . Mailer::money((int) $booking['total_cents'])
            . match ($method) {
                'in_person' => "\nPago: en el taller, el día de la clase (pendiente) · efectivo, tarjeta o Bizum",
                'subscription' => "\nPago: suscripción mensual online (primera cuota pagada)",
                default => "\nPago: online (pagado)",
            };
        Mailer::send($booking['customer_email'], "Reserva confirmada · {$booking['class_title']}",
            "Hola {$booking['customer_name']},\n\nTu plaza está confirmada."
            . ($method === 'subscription' ? ' La cuota se cobra cada mes en tu tarjeta; para darte de baja, escríbenos.' : '')
            . ($inPerson ? ' Pagas en el taller el día de la clase, en efectivo, con tarjeta o por Bizum. Si no puedes venir, avísanos para liberar la plaza.' : '')
            . "\n\n$text\n\nNos vemos en el estudio.\nCharria Ceramics");
        Mailer::admin(($inPerson ? 'Nueva reserva (pago en el taller) ' : ($method === 'subscription' ? 'Nueva suscripción ' : 'Nueva reserva ')) . $booking['reference'],
            "$text\nCliente: {$booking['customer_name']} <{$booking['customer_email']}> {$booking['customer_phone']}");
    }
}
