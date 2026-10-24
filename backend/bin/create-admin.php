<?php
/*
 * Crea (o cambia la contraseña de) un administrador desde la terminal SSH:
 *   php backend/bin/create-admin.php email@dominio.com "Nombre"
 * La contraseña se pide por teclado (no queda en el historial).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("Solo desde la terminal\n");
}
require dirname(__DIR__) . '/bootstrap.php';

use Charria\Database;
use Charria\Services\Auth;

[$_, $email, $name] = $argv + [null, null, ''];
if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    exit("Uso: php backend/bin/create-admin.php email@dominio.com \"Nombre\"\n");
}
echo 'Contraseña (mínimo 10 caracteres): ';
system('stty -echo 2>/dev/null');
$password = trim((string) fgets(STDIN));
system('stty echo 2>/dev/null');
echo "\n";

$db = Database::get();
$db->runSqlFile(BACKEND_DIR . '/database/schema.sql');
if ($db->value('SELECT id FROM admins WHERE email = ?', [strtolower($email)])) {
    if (strlen($password) < 10) {
        exit("La contraseña debe tener al menos 10 caracteres\n");
    }
    $db->exec('UPDATE admins SET password_hash = ?, is_active = 1 WHERE email = ?', [password_hash($password, PASSWORD_DEFAULT), strtolower($email)]);
    $db->exec('DELETE FROM admin_sessions WHERE admin_id = (SELECT id FROM admins WHERE email = ?)', [strtolower($email)]);
    echo "Contraseña actualizada para $email\n";
} else {
    Auth::createAdmin($email, $password, $name);
    echo "Administrador $email creado\n";
}
