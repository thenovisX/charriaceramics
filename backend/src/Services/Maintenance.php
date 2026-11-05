<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Http\HttpError;

/**
 * Modo «Web en obras»: mientras está activo, los visitantes ven en-obras.html
 * en lugar de la web (el panel /admin y la API siguen funcionando).
 *
 * El estado es un fichero y no un ajuste de la base de datos porque lo lee
 * Apache directamente en el .htaccess de la raíz (sin pasar por PHP) y porque
 * tiene que funcionar ANTES de instalar, cuando todavía no hay base de datos:
 * - backend/storage/web-abierta existe → la web se ve normal.
 * - no existe (web recién subida, sin instalar) → «en obras».
 * backend/ está bloqueada para el público y el fichero no se sube a Git.
 */
final class Maintenance
{
    public static function file(): string
    {
        return BACKEND_DIR . '/storage/web-abierta';
    }

    public static function on(): bool
    {
        return !is_file(self::file());
    }

    public static function set(bool $on): void
    {
        $file = self::file();
        $ok = $on
            ? (!is_file($file) || @unlink($file))
            : @file_put_contents($file, 'Web abierta desde el panel el ' . date('Y-m-d H:i') . "\n", LOCK_EX) !== false;
        clearstatcache(true, $file);
        if (!$ok) {
            throw new HttpError(500, 'maintenance_not_writable', 'No se pudo cambiar el modo «en obras» (permisos de escritura en backend/storage).');
        }
    }
}
