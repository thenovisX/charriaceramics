<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Env;
use Charria\Http\HttpError;

/**
 * Cliente mínimo de la API de Stripe (sin Composer): Checkout Sessions y
 * verificación de la firma de los webhooks. El pago se hace en la página
 * segura de Stripe, así que los datos de tarjeta nunca pasan por este servidor.
 */
final class Stripe
{
    private static function base(): string
    {
        // STRIPE_API_BASE solo se cambia en los tests automáticos
        return rtrim(Env::get('STRIPE_API_BASE', 'https://api.stripe.com'), '/');
    }

    public static function isConfigured(): bool
    {
        return Env::get('STRIPE_SECRET_KEY') !== null;
    }

    /** Petición a la API. $params se codifica como formulario con corchetes (line_items[0][quantity]=1). */
    public static function request(string $method, string $path, array $params = []): array
    {
        $key = Env::get('STRIPE_SECRET_KEY');
        if (!$key) {
            throw new HttpError(503, 'payments_unavailable', 'Los pagos no están configurados todavía');
        }
        $url = self::base() . $path;
        $body = http_build_query($params, '', '&', PHP_QUERY_RFC1738);
        $ch = curl_init($method === 'GET' && $body ? "$url?$body" : $url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $key,
                'Stripe-Version: 2024-06-20',
                'Content-Type: application/x-www-form-urlencoded',
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        if ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        $data = is_string($raw) ? json_decode($raw, true) : null;
        if ($raw === false || !is_array($data) || $status >= 400) {
            Log::error('Stripe error', ['status' => $status, 'curl' => $err, 'body' => is_string($raw) ? substr($raw, 0, 1000) : null]);
            throw new HttpError(502, 'payment_provider_error', 'No se pudo conectar con la pasarela de pago. Inténtalo de nuevo.');
        }
        return $data;
    }

    /**
     * Crea una sesión de Stripe Checkout.
     * $lines: [['name' => ..., 'unit_amount' => céntimos, 'quantity' => n, 'image' => url?]]
     */
    public static function createCheckoutSession(array $opts): array
    {
        $lineItems = [];
        foreach ($opts['lines'] as $line) {
            $item = [
                'quantity' => $line['quantity'],
                'price_data' => [
                    'currency' => Settings::currency(),
                    'unit_amount' => $line['unit_amount'],
                    'product_data' => ['name' => $line['name']],
                ],
            ];
            if (!empty($line['image']) && str_starts_with($line['image'], 'https://')) {
                $item['price_data']['product_data']['images'] = [$line['image']];
            }
            $lineItems[] = $item;
        }

        $params = [
            'mode' => 'payment',
            'locale' => 'es',
            'line_items' => $lineItems,
            'customer_email' => $opts['email'],
            'client_reference_id' => $opts['reference'],
            'success_url' => $opts['success_url'],
            'cancel_url' => $opts['cancel_url'],
            'expires_at' => $opts['expires_at'],
            'metadata' => ['type' => $opts['type'], 'reference' => $opts['reference']],
            'payment_intent_data' => ['metadata' => ['type' => $opts['type'], 'reference' => $opts['reference']]],
        ];
        if (isset($opts['shipping'])) {
            $params['shipping_options'] = [[
                'shipping_rate_data' => [
                    'type' => 'fixed_amount',
                    'display_name' => mb_substr($opts['shipping']['name'], 0, 100),
                    'fixed_amount' => ['amount' => $opts['shipping']['amount'], 'currency' => Settings::currency()],
                ],
            ]];
        }
        return self::request('POST', '/v1/checkout/sessions', $params);
    }

    public static function retrieveCheckoutSession(string $id): array
    {
        return self::request('GET', '/v1/checkout/sessions/' . rawurlencode($id));
    }

    public static function expireCheckoutSession(string $id): void
    {
        try {
            self::request('POST', '/v1/checkout/sessions/' . rawurlencode($id) . '/expire');
        } catch (HttpError) {
            // Ya pagada o ya caducada: no pasa nada
        }
    }

    /**
     * Verifica la cabecera Stripe-Signature (HMAC-SHA256 de "timestamp.payload")
     * y devuelve el evento decodificado. Rechaza firmas de hace más de 5 minutos.
     */
    public static function verifyWebhook(string $payload, ?string $header, int $tolerance = 300): array
    {
        $secret = Env::get('STRIPE_WEBHOOK_SECRET');
        if (!$secret) {
            throw new HttpError(503, 'webhook_not_configured', 'Falta STRIPE_WEBHOOK_SECRET');
        }
        $timestamp = null;
        $signatures = [];
        foreach (explode(',', (string) $header) as $part) {
            [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($k === 't') {
                $timestamp = (int) $v;
            } elseif ($k === 'v1') {
                $signatures[] = $v;
            }
        }
        if (!$timestamp || !$signatures) {
            throw new HttpError(400, 'invalid_signature', 'Firma de Stripe ausente o mal formada');
        }
        if (abs(time() - $timestamp) > $tolerance) {
            throw new HttpError(400, 'invalid_signature', 'Firma de Stripe caducada');
        }
        $expected = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
        $valid = false;
        foreach ($signatures as $sig) {
            $valid = $valid || hash_equals($expected, $sig);
        }
        if (!$valid) {
            throw new HttpError(400, 'invalid_signature', 'Firma de Stripe no válida');
        }
        $event = json_decode($payload, true);
        if (!is_array($event) || !isset($event['id'], $event['type'])) {
            throw new HttpError(400, 'invalid_payload', 'Evento de Stripe no válido');
        }
        return $event;
    }
}
