<?php
declare(strict_types=1);

namespace Charria\Controllers;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Customers;
use Charria\Services\Fulfillment;
use Charria\Services\Pricing;
use Charria\Services\RateLimiter;
use Charria\Services\Settings;
use Charria\Services\Shipping;
use Charria\Services\Stripe;
use Charria\Validator;

/**
 * Compra de la tienda. El navegador envía solo productos y cantidades
 * (más datos de contacto y la opción de envío elegida). Precios, descuentos,
 * envío y total se calculan aquí y se pasan a Stripe; lo que el cliente
 * mande como precio se ignora.
 */
final class CheckoutController
{
    private static function address(Validator $v, bool $required): array
    {
        return $v->nested('address', static function (Validator $a) use ($required) {
            $country = strtoupper((string) $a->string('country', false, 2)) ?: 'ES';
            if (!in_array($country, Shipping::COUNTRIES, true)) {
                $a->addError('country', 'De momento solo enviamos a: ' . implode(', ', Shipping::COUNTRIES));
            }
            $zip = $a->string('postal_code', $required, 12) ?? '';
            if ($zip !== '' && !preg_match('/^[A-Za-z0-9 -]{3,12}$/', $zip)) {
                $a->addError('postal_code', 'Código postal no válido');
            }
            return [
                'street' => $a->string('street', $required, 255) ?? '',
                'city' => $a->string('city', $required, 120) ?? '',
                'postal_code' => $zip,
                'country' => $country,
            ];
        }, $required);
    }

    /** POST /shipping/quote { items, address: {postal_code, country} } */
    public function shippingQuote(Request $r): Response
    {
        RateLimiter::hit('shipping:' . $r->ip, 40, 600);
        $merged = Pricing::normalizeItems($r->input('items'));
        $v = new Validator($r->body());
        $address = $v->nested('address', static fn (Validator $a) => [
            'postal_code' => $a->string('postal_code', false, 12) ?? '',
            'country' => strtoupper((string) ($a->string('country', false, 2) ?: 'ES')),
        ]);
        $v->check();
        $quote = Pricing::quote($merged);
        if ($quote['errors']) {
            throw new HttpError(409, 'cart_unavailable', $quote['errors'][0]['message'], ['items' => $quote['errors']]);
        }
        return Response::json([
            'options' => Shipping::options($quote, $address['country'], $address['postal_code']),
            'items_total_cents' => $quote['items_total_cents'],
        ]);
    }

    /**
     * POST /checkout
     * { items: [{product_id, quantity}], customer: {name, email, phone},
     *   shipping: {option_id: "pickup" | "flat" | "pl:123"}, address: {street, city, postal_code, country} }
     */
    public function checkout(Request $r): Response
    {
        if (!Stripe::isConfigured()) {
            throw new HttpError(503, 'payments_unavailable', 'La tienda online aún no acepta pagos. Escríbenos y te lo preparamos.');
        }
        RateLimiter::hit('checkout:' . $r->ip, 15, 600);

        $merged = Pricing::normalizeItems($r->input('items'));
        $v = new Validator($r->body());
        $optionId = $v->nested('shipping', static fn (Validator $s) => $s->string('option_id', true, 40));
        $isPickup = $optionId === 'pickup';
        $customer = Customers::validate($v, !$isPickup);
        $address = $isPickup ? ['street' => '', 'city' => '', 'postal_code' => '', 'country' => 'ES'] : self::address($v, true);
        $v->check();

        // 1) Envío: se recalcula en el servidor y se busca la opción elegida
        $preQuote = Pricing::quote($merged);
        if ($preQuote['errors']) {
            throw new HttpError(409, 'cart_unavailable', $preQuote['errors'][0]['message'], ['items' => $preQuote['errors']]);
        }
        $option = Shipping::find($preQuote, $address['country'], $address['postal_code'], (string) $optionId);
        if (!$option) {
            throw new HttpError(409, 'shipping_changed', 'La opción de envío ya no está disponible. Vuelve a calcular el envío.');
        }

        // 2) Pedido: precios y stock leídos con bloqueo para que nadie se lleve la misma pieza a la vez
        $db = Database::get();
        $hold = Settings::holdMinutes();
        $order = $db->transaction(static function (Database $db) use ($merged, $customer, $address, $option, $hold) {
            $quote = Pricing::quote($merged, true);
            if ($quote['errors']) {
                throw new HttpError(409, 'cart_unavailable', $quote['errors'][0]['message'], ['items' => $quote['errors']]);
            }
            $customerId = Customers::upsert($customer + $address);
            $reference = Settings::reference('CH');
            $total = $quote['items_total_cents'] + $option['price_cents'];
            $orderId = $db->insert('orders', [
                'reference' => $reference,
                'customer_id' => $customerId,
                'status' => 'pending',
                'currency' => Settings::currency(),
                'subtotal_cents' => $quote['subtotal_cents'],
                'discount_cents' => $quote['discount_cents'],
                'shipping_cents' => $option['price_cents'],
                'total_cents' => $total,
                'customer_name' => $customer['name'],
                'customer_email' => $customer['email'],
                'customer_phone' => $customer['phone'],
                'shipping_method' => $option['method'],
                'shipping_service_id' => $option['id'],
                'shipping_service_name' => $option['name'],
                'ship_street' => $address['street'],
                'ship_city' => $address['city'],
                'ship_postal_code' => $address['postal_code'],
                'ship_country' => $address['country'],
                'parcel_weight_grams' => $quote['weight_grams'],
                'expires_at' => date('Y-m-d H:i:s', time() + $hold * 60),
            ]);
            foreach ($quote['lines'] as $line) {
                $db->insert('order_items', [
                    'order_id' => $orderId,
                    'product_id' => $line['product_id'],
                    'title' => $line['title'],
                    'unit_price_cents' => $line['unit_price_cents'],
                    'discount_percent' => $line['discount_percent'],
                    'unit_final_cents' => $line['unit_final_cents'],
                    'quantity' => $line['quantity'],
                    'line_total_cents' => $line['line_total_cents'],
                ]);
            }
            return ['id' => $orderId, 'reference' => $reference, 'total' => $total, 'quote' => $quote];
        });

        // 3) Sesión de pago de Stripe con los importes del servidor
        $base = Settings::appUrl();
        try {
            $session = Stripe::createCheckoutSession([
                'type' => 'order',
                'reference' => $order['reference'],
                'email' => $customer['email'],
                'lines' => array_map(static fn ($l) => [
                    'name' => $l['title'] . ($l['discount_percent'] ? " (-{$l['discount_percent']} %)" : ''),
                    'unit_amount' => $l['unit_final_cents'],
                    'quantity' => $l['quantity'],
                    'image' => $l['image']['url'] ?? null,
                ], $order['quote']['lines']),
                'shipping' => ['name' => $option['name'], 'amount' => $option['price_cents']],
                'success_url' => $base . '/gracias.html?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => $base . '/productos.html?pago=cancelado',
                'expires_at' => time() + $hold * 60,
            ]);
        } catch (\Throwable $e) {
            $db->exec("UPDATE orders SET status = 'cancelled' WHERE id = ?", [$order['id']]);
            throw $e;
        }
        $db->update('orders', ['stripe_session_id' => $session['id']], 'id = :id', ['id' => $order['id']]);

        return Response::created([
            'reference' => $order['reference'],
            'total_cents' => $order['total'],
            'checkout_url' => $session['url'],
        ]);
    }

    /**
     * GET /checkout/status?session_id=cs_...  (lo usa gracias.html)
     * Si el webhook aún no ha llegado, consulta a Stripe directamente (servidor a servidor).
     */
    public function status(Request $r): Response
    {
        $sessionId = (string) ($r->query['session_id'] ?? '');
        if (!preg_match('/^cs_[A-Za-z0-9_]{10,250}$/', $sessionId)) {
            throw HttpError::notFound();
        }
        $db = Database::get();
        $find = static fn () => $db->one("SELECT 'order' AS type, reference, status, total_cents FROM orders WHERE stripe_session_id = ?", [$sessionId])
            ?? $db->one("SELECT 'booking' AS type, reference, status, total_cents FROM bookings WHERE stripe_session_id = ?", [$sessionId]);
        $row = $find();
        if (!$row) {
            throw HttpError::notFound();
        }
        if (in_array($row['status'], ['pending', 'pending_payment'], true)) {
            try {
                Fulfillment::paid(Stripe::retrieveCheckoutSession($sessionId));
                $row = $find();
            } catch (HttpError) {
                // Stripe no disponible: se muestra el estado actual
            }
        }
        $paid = in_array($row['status'], ['paid', 'shipped', 'confirmed'], true);
        return Response::json([
            'type' => $row['type'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'paid' => $paid,
            'total_cents' => (int) $row['total_cents'],
        ]);
    }
}
