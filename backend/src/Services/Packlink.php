<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Env;

/**
 * Cliente de la API de Packlink PRO (https://api.packlink.com/v1).
 * - services(): tarifas de los transportistas para un paquete y un destino;
 * - createDraft(): crea el envío como borrador en Packlink PRO cuando el pedido
 *   se ha pagado. Desde el panel de Packlink se elige recogida, se paga y se
 *   imprime la etiqueta (o se puede automatizar más adelante).
 * La cabecera Authorization lleva la API key tal cual (sin "Bearer").
 */
final class Packlink
{
    public static function isConfigured(): bool
    {
        return Env::get('PACKLINK_API_KEY') !== null;
    }

    private static function base(): string
    {
        return rtrim(Env::get('PACKLINK_API_URL', 'https://api.packlink.com/v1'), '/');
    }

    private static function request(string $method, string $path, ?array $query = null, ?array $body = null): array
    {
        $url = self::base() . $path . ($query ? '?' . http_build_query($query) : '');
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => [
                'Authorization: ' . Env::required('PACKLINK_API_KEY'),
                'Accept: application/json',
                'Content-Type: application/json',
            ],
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 8,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        }
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if ($raw === false || $status >= 400 || !is_array($data)) {
            Log::error('Packlink error', ['path' => $path, 'status' => $status, 'curl' => $err, 'body' => is_string($raw) ? substr($raw, 0, 1000) : null]);
            throw new \RuntimeException("Packlink respondió $status");
        }
        return $data;
    }

    /** Datos del remitente (el estudio), desde el .env */
    public static function sender(): array
    {
        return [
            'name' => Env::get('PACKLINK_SENDER_NAME', 'Charria'),
            'surname' => Env::get('PACKLINK_SENDER_SURNAME', 'Ceramics'),
            'company' => Env::get('PACKLINK_SENDER_COMPANY', 'Charria Ceramics'),
            'street1' => Env::get('PACKLINK_SENDER_STREET', ''),
            'zip_code' => Env::get('PACKLINK_SENDER_ZIP', '28001'),
            'city' => Env::get('PACKLINK_SENDER_CITY', 'Madrid'),
            'country' => Env::get('PACKLINK_SENDER_COUNTRY', 'ES'),
            'phone' => Env::get('PACKLINK_SENDER_PHONE', ''),
            'email' => Env::get('PACKLINK_SENDER_EMAIL', Env::get('MAIL_ADMIN', '')),
        ];
    }

    /**
     * Tarifas disponibles. $package = ['weight' => kg, 'length' => cm, 'width' => cm, 'height' => cm]
     * Devuelve [['id', 'carrier', 'name', 'price_cents', 'transit_hours', 'parcelshop']]
     */
    public static function services(string $toCountry, string $toZip, array $package): array
    {
        $sender = self::sender();
        $data = self::request('GET', '/services', [
            'from' => ['country' => $sender['country'], 'zip' => $sender['zip_code']],
            'to' => ['country' => $toCountry, 'zip' => $toZip],
            'packages' => [$package],
        ]);
        $out = [];
        foreach ($data as $s) {
            if (!is_array($s) || !isset($s['id'])) {
                continue;
            }
            $price = $s['price']['total_price'] ?? $s['total_price'] ?? null;
            if (!is_numeric($price)) {
                continue;
            }
            $out[] = [
                'id' => (string) $s['id'],
                'carrier' => (string) ($s['carrier_name'] ?? ''),
                'name' => (string) ($s['name'] ?? $s['service_name'] ?? ''),
                'price_cents' => (int) round(((float) $price) * 100),
                'transit_hours' => isset($s['transit_hours']) ? (int) $s['transit_hours'] : null,
                // Los servicios a punto de recogida necesitan elegir un punto: se dejan fuera por ahora
                'parcelshop' => (bool) ($s['delivery_to_parcelshop'] ?? false),
            ];
        }
        return $out;
    }

    /** Crea el envío como borrador en Packlink PRO. Devuelve la referencia de Packlink. */
    public static function createDraft(array $order, array $package): string
    {
        [$first, $last] = array_pad(explode(' ', trim($order['customer_name']), 2), 2, '');
        $data = self::request('POST', '/shipments', null, [
            'from' => self::sender(),
            'to' => [
                'name' => $first,
                'surname' => $last ?: '-',
                'street1' => $order['ship_street'],
                'zip_code' => $order['ship_postal_code'],
                'city' => $order['ship_city'],
                'country' => $order['ship_country'],
                'phone' => $order['customer_phone'],
                'email' => $order['customer_email'],
            ],
            'packages' => [$package],
            'service_id' => (int) preg_replace('/^pl:/', '', $order['shipping_service_id']),
            'content' => Env::get('PACKLINK_CONTENT', 'Cerámica artesanal'),
            'contentvalue' => round(($order['total_cents'] - $order['shipping_cents']) / 100, 2),
            'shipment_custom_reference' => $order['reference'],
            'source' => 'API',
        ]);
        $ref = $data['shipment_reference'] ?? $data['reference'] ?? null;
        if (!$ref) {
            throw new \RuntimeException('Packlink no devolvió referencia de envío');
        }
        return (string) $ref;
    }
}
