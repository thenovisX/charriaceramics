<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;
use Charria\Http\Request;

/**
 * Instalación desde el navegador (admin/setup.html):
 * 1. La persona escribe los datos de la base de datos creada en hPanel y su usuario.
 * 2. Se prueba la conexión; si funciona se escribe el .env (fuera de public_html
 *    si el hosting lo permite) con una APP_KEY aleatoria.
 * 3. Se crean las tablas y el primer administrador.
 * Seguridad: hace falta conocer usuario y contraseña de MySQL, y en cuanto existe
 * un administrador el instalador queda cerrado para siempre.
 */
final class Installer
{
    /**
     * Estado para /health: la web sabe si tiene que mandar al instalador.
     * null = hay configuración pero MySQL no responde (no se manda al instalador por eso).
     */
    public static function isInstalled(): ?bool
    {
        if (!Env::get('DB_NAME')) {
            return false;
        }
        try {
            return (int) Database::get()->value('SELECT COUNT(*) FROM admins') > 0;
        } catch (\PDOException $e) {
            return ($e->errorInfo[0] ?? '') === '42S02' ? false : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /** Extensiones de PHP que faltan en el servidor (en Hostinger: hPanel → Avanzado → Configuración de PHP). */
    public static function missingRequirements(): array
    {
        $missing = [];
        if (PHP_VERSION_ID < 80100) {
            $missing[] = 'PHP 8.1 o superior (ahora ' . PHP_VERSION . ')';
        }
        foreach (['pdo_mysql', 'curl', 'gd', 'sodium', 'mbstring', 'fileinfo', 'openssl'] as $ext) {
            if (!extension_loaded($ext)) {
                $missing[] = $ext;
            }
        }
        return $missing;
    }

    public static function install(array $db, array $admin, bool $seed, Request $request): array
    {
        if (Env::get('DB_NAME')) {
            // Ya hay configuración: solo se acepta si los datos coinciden (p. ej. .env subido a mano sin admin)
            $same = hash_equals((string) Env::get('DB_NAME'), $db['name'])
                && hash_equals((string) Env::get('DB_USER'), $db['user'])
                && hash_equals((string) Env::get('DB_PASS', ''), $db['pass']);
            if (!$same) {
                sleep(1);
                throw new HttpError(403, 'forbidden', 'La web ya tiene una base de datos configurada y estos datos no coinciden con ella.');
            }
            $written = Env::file();
        } else {
            self::testConnection($db);
            $written = self::writeEnv($db, $request);
            Env::load([$written]);
        }

        $conn = Database::get();
        $conn->runSqlFile(BACKEND_DIR . '/database/schema.sql');
        Migrations::run(); // por si ya había tablas de una versión anterior
        if ((int) $conn->value('SELECT COUNT(*) FROM admins') > 0) {
            throw new HttpError(409, 'already_installed', 'La web ya está instalada. Entra en el panel con tu usuario.');
        }
        Auth::createAdmin($admin['email'], $admin['password'], $admin['name']);
        $seeded = false;
        if ($seed && (int) $conn->value('SELECT COUNT(*) FROM products') === 0) {
            $conn->runSqlFile(BACKEND_DIR . '/database/seed.sql');
            $seeded = true;
        }
        return [
            'installed' => true,
            'seeded' => $seeded,
            'config_outside_public_html' => $written && !str_starts_with(realpath($written) ?: $written, realpath(PUBLIC_DIR) . '/'),
        ];
    }

    private static function testConnection(array $db): void
    {
        try {
            new \PDO(
                sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['host'], $db['port'], $db['name']),
                $db['user'],
                $db['pass'],
                [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_TIMEOUT => 5]
            );
        } catch (\PDOException $e) {
            sleep(1);
            $code = (int) ($e->errorInfo[1] ?? 0);
            $fields = match ($code) {
                1045 => ['db.user' => 'Usuario o contraseña incorrectos', 'db.pass' => 'Usuario o contraseña incorrectos'],
                1044, 1049 => ['db.name' => 'No existe esa base de datos o el usuario no tiene permiso sobre ella'],
                2002, 2005 => ['db.host' => 'No se encuentra el servidor de MySQL (en Hostinger suele ser "localhost")'],
                default => ['db.host' => 'No se pudo conectar con MySQL'],
            };
            throw HttpError::validation($fields, 'No se pudo conectar con la base de datos. Revisa los datos.');
        }
    }

    /** Dónde guardar el .env: fuera de public_html si se puede, si no en backend/ (bloqueado por .htaccess). */
    private static function envPath(): string
    {
        $forced = getenv('CHARRIA_ENV_FILE');
        if ($forced) {
            return $forced;
        }
        $outside = dirname(PUBLIC_DIR);
        return is_writable($outside) ? $outside . '/.env' : BACKEND_DIR . '/.env';
    }

    private static function writeEnv(array $db, Request $request): string
    {
        $host = preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($request->header('host') ?? 'localhost'));
        $local = preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host);
        $q = static fn (string $v) => '"' . str_replace(['\\', '"', "\n", "\r"], ['\\\\', '\\"', '', ''], $v) . '"';
        $lines = [
            '# Charria Ceramics · creado por el instalador el ' . date('Y-m-d H:i'),
            '# Stripe, Packlink, envíos y emails se configuran en el panel (/admin → Ajustes).',
            '# Ver backend/.env.example para el resto de opciones.',
            'APP_URL=' . ($local ? 'http' : 'https') . '://' . $host,
            'APP_TIMEZONE=Europe/Madrid',
            'APP_DEBUG=false',
            'APP_KEY=' . base64_encode(random_bytes(32)),
            'DB_HOST=' . $q($db['host']),
            'DB_PORT=' . $db['port'],
            'DB_NAME=' . $q($db['name']),
            'DB_USER=' . $q($db['user']),
            'DB_PASS=' . $q($db['pass']),
        ];
        $path = self::envPath();
        if (@file_put_contents($path, implode("\n", $lines) . "\n", LOCK_EX) === false) {
            throw new HttpError(500, 'config_not_writable', 'No se pudo guardar la configuración en el servidor (permisos de escritura).');
        }
        @chmod($path, 0600);
        return $path;
    }
}
