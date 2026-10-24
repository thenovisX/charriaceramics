<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Env;

/**
 * Opciones de envío calculadas en el servidor a partir de la cesta ya validada.
 * - Con PACKLINK_API_KEY: tarifas reales de Packlink PRO (+ SHIPPING_MARKUP_CENTS).
 * - Sin ella: una tarifa plana (SHIPPING_FLAT_CENTS) para poder vender desde el día 1.
 * - Recogida gratis en el estudio si SHIPPING_PICKUP=true.
 * - Envío gratis a partir de SHIPPING_FREE_FROM_CENTS (0 = desactivado).
 * El checkout vuelve a calcular las opciones y busca la elegida por id,
 * así que el navegador nunca decide el precio del envío.
 */
final class Shipping
{
    public const COUNTRIES = ['ES', 'PT', 'FR', 'IT', 'DE', 'BE', 'NL', 'AD'];

    /** Paquete para Packlink: peso en kg y medidas en cm. */
    public static function package(array $quote): array
    {
        [$bl, $bw, $bh] = array_map('intval', explode('x', Env::get('SHIPPING_BOX_CM', '30x30x30')) + [30, 30, 30]);
        [$l, $w, $h] = $quote['max_dimensions_cm'];
        // Cerámica: caja con al menos 5 cm de relleno por cada lado
        return [
            'weight' => round(($quote['weight_grams'] + Env::int('SHIPPING_PACKAGING_GRAMS', 600)) / 1000, 2),
            'length' => max($bl, $l + 10),
            'width' => max($bw, $w + 10),
            'height' => max($bh, $h + 10),
        ];
    }

    public static function options(array $quote, string $country, string $zip): array
    {
        $options = [];
        if (Env::bool('SHIPPING_PICKUP', true)) {
            $options[] = [
                'id' => 'pickup',
                'method' => 'pickup',
                'name' => 'Recogida en el estudio',
                'carrier' => 'Charria Ceramics',
                'price_cents' => 0,
                'transit_hours' => null,
            ];
        }

        // Sin código postal todavía: solo se puede ofrecer la recogida
        if ($zip === '') {
            return $options;
        }

        $delivery = [];
        if (Packlink::isConfigured()) {
            try {
                $markup = Env::int('SHIPPING_MARKUP_CENTS', 0);
                foreach (Packlink::services($country, $zip, self::package($quote)) as $s) {
                    if ($s['parcelshop']) {
                        continue;
                    }
                    $delivery[] = [
                        'id' => 'pl:' . $s['id'],
                        'method' => 'delivery',
                        'name' => trim($s['carrier'] . ' · ' . $s['name'], ' ·'),
                        'carrier' => $s['carrier'],
                        'price_cents' => $s['price_cents'] + $markup,
                        'transit_hours' => $s['transit_hours'],
                    ];
                }
                usort($delivery, static fn ($a, $b) => $a['price_cents'] <=> $b['price_cents']);
                $delivery = array_slice($delivery, 0, Env::int('SHIPPING_MAX_OPTIONS', 4));
            } catch (\Throwable $e) {
                Log::error('Packlink quote failed, using flat rate', ['error' => $e->getMessage()]);
            }
        }
        if (!$delivery) {
            $delivery[] = [
                'id' => 'flat',
                'method' => 'delivery',
                'name' => Env::get('SHIPPING_FLAT_NAME', 'Envío estándar 48/72 h'),
                'carrier' => '',
                'price_cents' => Env::int('SHIPPING_FLAT_CENTS', 690),
                'transit_hours' => 72,
            ];
        }

        $freeFrom = Env::int('SHIPPING_FREE_FROM_CENTS', 0);
        if ($freeFrom > 0 && $quote['items_total_cents'] >= $freeFrom) {
            // La opción más barata pasa a ser gratis
            $delivery[0]['price_cents'] = 0;
        }
        return array_merge($options, $delivery);
    }

    /** Opción elegida por el cliente, recalculada en el servidor. */
    public static function find(array $quote, string $country, string $zip, string $id): ?array
    {
        foreach (self::options($quote, $country, $zip) as $option) {
            if ($option['id'] === $id) {
                return $option;
            }
        }
        return null;
    }
}
