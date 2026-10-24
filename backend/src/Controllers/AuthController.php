<?php
declare(strict_types=1);

namespace Charria\Controllers;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Auth;
use Charria\Services\Installer;
use Charria\Services\Log;
use Charria\Validator;

final class AuthController
{
    /** POST /auth/login { email, password } → { token, expires_at, admin } */
    public function login(Request $r): Response
    {
        $v = new Validator($r->body());
        $email = $v->email('email', true);
        $password = $v->string('password', true, 200);
        $v->check();
        return Response::json(Auth::login($email, $password, $r));
    }

    public function logout(Request $r): Response
    {
        Auth::logout($r);
        return Response::noContent();
    }

    public function me(Request $r): Response
    {
        return Response::json(Auth::publicAdmin($r->admin));
    }

    /** PUT /admin/password { current_password, new_password } */
    public function changePassword(Request $r): Response
    {
        $v = new Validator($r->body());
        $current = $v->string('current_password', true, 200);
        $new = $v->string('new_password', true, 200, 10);
        $v->check();
        if (!password_verify($current, $r->admin['password_hash'])) {
            throw HttpError::validation(['current_password' => 'Contraseña actual incorrecta']);
        }
        $db = Database::get();
        $db->exec('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $r->admin['id']]);
        // Cierra el resto de sesiones abiertas
        $db->exec('DELETE FROM admin_sessions WHERE admin_id = ? AND id <> ?', [$r->admin['id'], $r->admin['session_id']]);
        return Response::noContent();
    }

    /**
     * POST /setup — instalación desde el navegador (admin/setup.html).
     * { db: {host, port, name, user, pass}, name, email, password, seed }
     * Solo funciona mientras no exista ningún administrador.
     */
    public function setup(Request $r): Response
    {
        $v = new Validator($r->body());
        $db = $v->nested('db', static fn (Validator $d) => [
            'host' => $d->string('host', false, 120) ?: 'localhost',
            'port' => $d->int('port', false, 1, 65535) ?? 3306,
            'name' => $d->string('name', true, 64),
            'user' => $d->string('user', true, 64),
            'pass' => (string) ($d->string('pass', false, 200) ?? ''),
        ]);
        $admin = [
            'name' => $v->string('name', false, 120) ?? '',
            'email' => $v->email('email', true),
            'password' => $v->string('password', true, 200, 10),
        ];
        $seed = $v->bool('seed') ?? false;
        $v->check();
        if (Installer::isInstalled()) {
            throw new HttpError(409, 'already_installed', 'La web ya está instalada. Entra en el panel con tu usuario.');
        }
        try {
            return Response::created(Installer::install($db, $admin, $seed, $r));
        } catch (HttpError $e) {
            throw $e;
        } catch (\Throwable $e) {
            // Antes de instalar no hay panel ni logs a mano: se enseña el motivo real para poder arreglarlo
            Log::error('Instalación', ['error' => $e->getMessage(), 'file' => $e->getFile() . ':' . $e->getLine()]);
            throw new HttpError(500, 'install_failed', 'No se pudo terminar la instalación: ' . $e->getMessage());
        }
    }

    /** GET /setup — ¿hace falta instalar? (lo usa setup.html) */
    public function setupStatus(Request $r): Response
    {
        return Response::json([
            'installed' => Installer::isInstalled(),
            'configured' => Env::get('DB_NAME') !== null,
            'php' => PHP_VERSION,
            'missing' => Installer::missingRequirements(),
        ]);
    }
}
