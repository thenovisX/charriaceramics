<?php
declare(strict_types=1);

namespace Charria;

/** Lee un fichero .env sencillo (CLAVE=valor) sin dependencias externas. */
final class Env
{
    private static array $values = [];
    private static array $overrides = [];  // ajustes guardados desde el panel (tabla settings)
    private static ?string $loadedFile = null;

    /** Carga el primer fichero que exista de la lista. Las variables reales del servidor tienen prioridad. */
    public static function load(array $candidates): ?string
    {
        foreach ($candidates as $file) {
            if (!is_file($file) || !is_readable($file)) {
                continue;
            }
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                    continue;
                }
                [$key, $value] = array_map('trim', explode('=', $line, 2));
                if (preg_match('/^(["\'])(.*)\1$/', $value, $m)) {
                    $value = $m[1] === '"' ? str_replace(['\\"', '\\\\'], ['"', '\\'], $m[2]) : $m[2];
                } else {
                    $value = trim(preg_replace('/\s+#.*$/', '', $value));
                }
                self::$values[$key] = $value;
            }
            return self::$loadedFile = $file;
        }
        return null;
    }

    /** Fichero .env que se ha cargado (null si no hay ninguno: web sin instalar). */
    public static function file(): ?string
    {
        return self::$loadedFile;
    }

    /** Los ajustes del panel tienen prioridad sobre el .env. */
    public static function override(array $values): void
    {
        self::$overrides = $values + self::$overrides;
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        if (isset(self::$overrides[$key]) && self::$overrides[$key] !== '') {
            return self::$overrides[$key];
        }
        $real = getenv($key);
        if ($real !== false && $real !== '') {
            return $real;
        }
        $value = self::$values[$key] ?? null;
        return ($value === null || $value === '') ? $default : $value;
    }

    public static function int(string $key, int $default = 0): int
    {
        $value = self::get($key);
        return $value === null ? $default : (int) $value;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $value = self::get($key);
        return $value === null ? $default : in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
    }

    /** Lanza un error claro si falta una variable obligatoria. */
    public static function required(string $key): string
    {
        $value = self::get($key);
        if ($value === null) {
            throw new Http\HttpError(500, 'config_missing', "Falta la variable de entorno $key");
        }
        return $value;
    }
}
