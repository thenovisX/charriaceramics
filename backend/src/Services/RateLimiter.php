<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;

/** Límite de intentos por ventana de tiempo, guardado en MySQL (funciona en hosting compartido). */
final class RateLimiter
{
    /** Cuenta un intento y lanza un 429 si se supera el máximo de la ventana. */
    public static function hit(string $bucket, int $max, int $windowSeconds): void
    {
        if (!self::allow($bucket, $max, $windowSeconds)) {
            throw new HttpError(429, 'too_many_requests', 'Demasiados intentos. Espera unos minutos y vuelve a probar.');
        }
    }

    /**
     * Cuenta un intento y dice si cabe en el límite (sin lanzar error).
     * Primero se apunta y después se cuenta lo anterior a uno mismo: así, 100 peticiones
     * simultáneas no pueden leer todas «0 intentos» antes de que nadie se apunte.
     */
    public static function allow(string $bucket, int $max, int $windowSeconds): bool
    {
        $db = Database::get();
        $bucket = substr($bucket, 0, 190);
        $db->exec('INSERT INTO rate_limits (bucket) VALUES (?)', [$bucket]);
        $mine = (int) $db->pdo()->lastInsertId();
        $before = (int) $db->value(
            'SELECT COUNT(*) FROM rate_limits WHERE bucket = ? AND id < ? AND created_at > (NOW() - INTERVAL ? SECOND)',
            [$bucket, $mine, $windowSeconds]
        );
        // Limpieza ocasional de registros viejos
        if (random_int(1, 50) === 1) {
            $db->exec('DELETE FROM rate_limits WHERE created_at < (NOW() - INTERVAL 1 DAY)');
        }
        return $before < $max;
    }

    public static function clear(string $bucket): void
    {
        Database::get()->exec('DELETE FROM rate_limits WHERE bucket = ?', [substr($bucket, 0, 190)]);
    }

    /**
     * Identificador de un cliente sin guardar su IP en claro: HMAC con la clave de la web.
     * Las IPv6 se agrupan por /64, porque quien tiene una red tiene trillones de direcciones.
     */
    public static function clientKey(string $ip): string
    {
        $packed = @inet_pton($ip);
        if ($packed !== false && strlen($packed) === 16) {
            $ip = inet_ntop(substr($packed, 0, 8) . str_repeat("\0", 8));
        }
        $key = Env::get('APP_KEY') ?: ('charria|' . Env::get('DB_NAME', '') . '|' . Env::get('DB_PASS', ''));
        return hash_hmac('sha256', $ip, $key);
    }
}
