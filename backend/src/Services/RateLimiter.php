<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Http\HttpError;

/** Límite de intentos por ventana de tiempo, guardado en MySQL (funciona en hosting compartido). */
final class RateLimiter
{
    public static function hit(string $bucket, int $max, int $windowSeconds): void
    {
        $db = Database::get();
        $bucket = substr($bucket, 0, 190);
        $count = (int) $db->value(
            'SELECT COUNT(*) FROM rate_limits WHERE bucket = ? AND created_at > (NOW() - INTERVAL ? SECOND)',
            [$bucket, $windowSeconds]
        );
        if ($count >= $max) {
            throw new HttpError(429, 'too_many_requests', 'Demasiados intentos. Espera unos minutos y vuelve a probar.');
        }
        $db->exec('INSERT INTO rate_limits (bucket) VALUES (?)', [$bucket]);
        // Limpieza ocasional de registros viejos
        if (random_int(1, 50) === 1) {
            $db->exec('DELETE FROM rate_limits WHERE created_at < (NOW() - INTERVAL 1 DAY)');
        }
    }

    public static function clear(string $bucket): void
    {
        Database::get()->exec('DELETE FROM rate_limits WHERE bucket = ?', [substr($bucket, 0, 190)]);
    }
}
