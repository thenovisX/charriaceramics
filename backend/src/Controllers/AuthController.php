<?php
declare(strict_types=1);

namespace Charria\Controllers;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Auth;
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
     * POST /setup { token, email, password, name, seed }
     * Instalación inicial: crea las tablas y el primer administrador.
     * Solo funciona si SETUP_TOKEN está en el .env y todavía no hay ningún admin.
     */
    public function setup(Request $r): Response
    {
        $expected = Env::get('SETUP_TOKEN');
        $v = new Validator($r->body());
        $token = $v->string('token', true, 200);
        $email = $v->email('email', true);
        $password = $v->string('password', true, 200, 10);
        $name = $v->string('name', false, 120) ?? '';
        $seed = $v->bool('seed') ?? false;
        $v->check();
        if (!$expected || strlen($expected) < 16 || !hash_equals($expected, (string) $token)) {
            sleep(1); // frena los intentos de adivinar el token (aún puede no haber tablas para RateLimiter)
            throw new HttpError(403, 'forbidden', 'Token de instalación incorrecto (SETUP_TOKEN, mínimo 16 caracteres)');
        }

        $db = Database::get();
        $db->runSqlFile(BACKEND_DIR . '/database/schema.sql');
        if ((int) $db->value('SELECT COUNT(*) FROM admins') > 0) {
            throw new HttpError(409, 'already_installed', 'Ya existe un administrador. Borra SETUP_TOKEN del .env.');
        }
        Auth::createAdmin($email, $password, $name);
        $seeded = false;
        if ($seed && (int) $db->value('SELECT COUNT(*) FROM products') === 0) {
            $db->runSqlFile(BACKEND_DIR . '/database/seed.sql');
            $seeded = true;
        }
        return Response::created(['installed' => true, 'seeded' => $seeded]);
    }
}
