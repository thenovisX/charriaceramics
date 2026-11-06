<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;
use Charria\Http\Request;

/**
 * Autenticación del panel con tokens opacos de sesión:
 * - el token (64 caracteres aleatorios) solo se entrega una vez al hacer login;
 * - en la base de datos solo se guarda su hash SHA-256;
 * - cada petición del panel lo envía en "Authorization: Bearer <token>" y se
 *   comprueba contra la base de datos (caducidad, admin activo), así que cerrar
 *   sesión o desactivar un admin lo invalida al momento.
 */
final class Auth
{
    public static function login(string $email, string $password, Request $request): array
    {
        $email = mb_strtolower(trim($email));
        // Máximo 5 intentos fallidos cada 15 minutos por IP y por email
        RateLimiter::hit('login-ip:' . $request->ip, 5, 900);
        RateLimiter::hit('login-email:' . $email, 5, 900);

        $db = Database::get();
        $admin = $db->one('SELECT * FROM admins WHERE email = ? AND is_active = 1', [$email]);
        // Se verifica un hash ficticio si el email no existe para no revelar qué emails son válidos por el tiempo de respuesta
        $hash = $admin['password_hash'] ?? '$2y$10$AqALYOJ6GHxtTAtn0n/ej.VKpMbgHRvGUcG.4DK5NLGqGaRe0cssa';
        if (!password_verify($password, $hash) || !$admin) {
            throw new HttpError(401, 'invalid_credentials', 'Email o contraseña incorrectos');
        }
        RateLimiter::clear('login-ip:' . $request->ip);
        RateLimiter::clear('login-email:' . $email);

        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) {
            $db->exec('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $admin['id']]);
        }

        // ¿Ya se había entrado desde esta conexión en el último mes? Si no, se avisa por email
        // al administrador: si no has sido tú, sabrás enseguida que alguien tiene tu contraseña.
        $knownIp = (bool) $db->value(
            'SELECT 1 FROM admin_sessions WHERE admin_id = ? AND ip = ? LIMIT 1',
            [$admin['id'], substr($request->ip, 0, 45)]
        );

        $token = bin2hex(random_bytes(32));
        $hours = max(1, Env::int('SESSION_TTL_HOURS', 12));
        $expires = date('Y-m-d H:i:s', time() + $hours * 3600);
        $db->insert('admin_sessions', [
            'admin_id' => $admin['id'],
            'token_hash' => hash('sha256', $token),
            'ip' => substr($request->ip, 0, 45),
            'user_agent' => substr($request->header('user-agent') ?? '', 0, 255),
            'expires_at' => $expires,
        ]);
        $db->exec('UPDATE admins SET last_login_at = NOW() WHERE id = ?', [$admin['id']]);
        // Las sesiones caducadas ya no sirven para entrar (requireAdmin mira expires_at),
        // pero se guardan 30 días para reconocer desde dónde sueles conectarte
        $db->exec('DELETE FROM admin_sessions WHERE expires_at < (NOW() - INTERVAL 30 DAY)');
        if (!$knownIp) {
            Mailer::send($admin['email'], 'Nuevo inicio de sesión en el panel · Charria Ceramics',
                "Hola,\n\nAlguien ha entrado en el panel de la web con tu usuario ({$admin['email']}) desde una conexión nueva.\n\n"
                . 'Fecha: ' . date('d/m/Y H:i') . "\nIP: {$request->ip}\nNavegador: " . substr($request->header('user-agent') ?? '', 0, 160) . "\n\n"
                . "Si has sido tú, no tienes que hacer nada.\n"
                . "Si no has sido tú, entra en el panel, cambia la contraseña en «Cuenta» (eso cierra las demás sesiones).\n");
        }

        return [
            'token' => $token,
            'expires_at' => $expires,
            'admin' => self::publicAdmin($admin),
        ];
    }

    /** Middleware: exige un token válido en cada petición a /admin/*. */
    public static function requireAdmin(Request $request): void
    {
        $header = $request->header('authorization') ?? '';
        if (!preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $header, $m)) {
            throw new HttpError(401, 'unauthenticated', 'Inicia sesión para continuar');
        }
        $admin = Database::get()->one(
            'SELECT a.*, s.id AS session_id FROM admin_sessions s
             JOIN admins a ON a.id = s.admin_id
             WHERE s.token_hash = ? AND s.expires_at > NOW() AND a.is_active = 1',
            [hash('sha256', strtolower($m[1]))]
        );
        if (!$admin) {
            throw new HttpError(401, 'unauthenticated', 'La sesión ha caducado. Vuelve a iniciar sesión.');
        }
        $request->admin = $admin;
    }

    public static function logout(Request $request): void
    {
        // Se marca como caducada (no se borra) para seguir reconociendo esta conexión
        Database::get()->exec('UPDATE admin_sessions SET expires_at = NOW() WHERE id = ?', [$request->admin['session_id']]);
    }

    public static function createAdmin(string $email, string $password, string $name = ''): int
    {
        if (strlen($password) < 10) {
            throw HttpError::validation(['password' => 'Mínimo 10 caracteres']);
        }
        return Database::get()->insert('admins', [
            'email' => mb_strtolower(trim($email)),
            'name' => $name,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);
    }

    public static function publicAdmin(array $admin): array
    {
        return ['id' => (int) $admin['id'], 'email' => $admin['email'], 'name' => $admin['name']];
    }
}
