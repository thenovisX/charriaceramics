<?php
declare(strict_types=1);

namespace Charria\Services;

/** Registro en backend/storage/logs/app.log (carpeta no accesible desde la web). */
final class Log
{
    public static function error(string $message, array $context = []): void
    {
        self::write('ERROR', $message, $context);
    }

    public static function info(string $message, array $context = []): void
    {
        self::write('INFO', $message, $context);
    }

    private static function write(string $level, string $message, array $context): void
    {
        $line = sprintf("[%s] %s %s %s\n", date('c'), $level, $message, $context ? json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '');
        @file_put_contents(BACKEND_DIR . '/storage/logs/app.log', $line, FILE_APPEND | LOCK_EX);
    }
}
