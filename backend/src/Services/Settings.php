<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Env;

/** Ajustes de negocio leídos del .env, con valores por defecto razonables. */
final class Settings
{
    public static function currency(): string
    {
        return strtolower(Env::get('CURRENCY', 'eur'));
    }

    public static function appUrl(): string
    {
        return rtrim(Env::get('APP_URL', 'http://localhost:8000'), '/');
    }

    /** Minutos que se reservan stock y plazas mientras el cliente paga (Stripe exige al menos 30). */
    public static function holdMinutes(): int
    {
        return max(30, Env::int('CHECKOUT_HOLD_MINUTES', 30));
    }

    public static function uploadsUrl(): string
    {
        return rtrim(Env::get('UPLOADS_URL', '/uploads'), '/');
    }

    /** Referencia legible y no adivinable: CH-7K2P9Q (pedidos) o CL-... (reservas) */
    public static function reference(string $prefix): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $ref = '';
        for ($i = 0; $i < 8; $i++) {
            $ref .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return "$prefix-$ref";
    }
}
