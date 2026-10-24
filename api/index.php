<?php
declare(strict_types=1);

/*
 * Punto de entrada único de la API REST: https://tudominio.com/api/...
 * api/.htaccess envía aquí todas las peticiones.
 */

require dirname(__DIR__) . '/backend/bootstrap.php';

use Charria\Env;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Http\Router;
use Charria\Services\Log;

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

// CORS: solo para otras webs propias que reutilicen esta API (CORS_ALLOWED_ORIGINS, separados por comas)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = array_filter(array_map('trim', explode(',', Env::get('CORS_ALLOWED_ORIGINS', ''))));
if ($origin && in_array($origin, $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Max-Age: 600');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$router = new Router();
(require BACKEND_DIR . '/routes.php')($router);

try {
    $router->dispatch(Request::fromGlobals())->send();
} catch (HttpError $e) {
    Response::error($e);
} catch (\Throwable $e) {
    Log::error('Unhandled', ['error' => $e->getMessage(), 'file' => $e->getFile() . ':' . $e->getLine()]);
    $message = Env::bool('APP_DEBUG') ? $e->getMessage() : 'Error interno. Inténtalo de nuevo en unos minutos.';
    Response::error(new HttpError(500, 'server_error', $message));
}
