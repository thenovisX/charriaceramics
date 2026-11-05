<?php
/*
 * Servidor local para probar sin Apache:
 *   php -S localhost:8000 backend/dev-router.php
 * Imita las reglas de los .htaccess: /api/* va a la API, /backend y los ficheros
 * ocultos dan 403 y el resto se sirve como fichero estático.
 */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#(^|/)\.|^/backend(/|$)#', $path)) {
    http_response_code(403);
    exit('Forbidden');
}
if (str_starts_with($path, '/api/') || $path === '/api') {
    require __DIR__ . '/../api/index.php';
    return true;
}
if (str_starts_with($path, '/uploads/') && preg_match('/\.php\d?$/i', $path)) {
    http_response_code(403);
    exit('Forbidden');
}
// Web en obras (igual que el .htaccess de la raíz)
if (preg_match('#^/(?!(?:en-obras|404)\.html$)(?:[^/]+\.html)?$#', $path)
    && !is_file(__DIR__ . '/storage/web-abierta')
    && ($_COOKIE['charria_vista'] ?? '') !== 'web') {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    readfile(__DIR__ . '/../en-obras.html');
    return true;
}
if ($path === '/admin' ) {
    header('Location: /admin/');
    return true;
}
return false;
