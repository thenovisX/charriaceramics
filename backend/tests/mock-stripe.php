<?php
/*
 * Imitación mínima de la API de Stripe para los tests (php -S localhost:8099 mock-stripe.php).
 * Guarda las sesiones creadas en un fichero temporal para poder consultarlas.
 */
$store = sys_get_temp_dir() . '/charria-mock-stripe.json';
$sessions = is_file($store) ? json_decode(file_get_contents($store), true) : [];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
header('Content-Type: application/json');
// sk_test_mock: la del .env de test · sk_test_mockpanel123456: la que se guarda desde el panel en los tests
if (!in_array($_SERVER['HTTP_AUTHORIZATION'] ?? '', ['Bearer sk_test_mock', 'Bearer sk_test_mockpanel123456'], true)) {
    http_response_code(401);
    exit(json_encode(['error' => ['message' => 'bad key']]));
}
if ($path === '/v1/account') {
    exit(json_encode(['id' => 'acct_mock', 'object' => 'account', 'settings' => ['dashboard' => ['display_name' => 'Charria Mock']]]));
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $path === '/v1/checkout/sessions') {
    parse_str(file_get_contents('php://input'), $p);
    $id = 'cs_test_' . bin2hex(random_bytes(12));
    $total = 0;
    foreach ($p['line_items'] as $li) {
        $total += (int) $li['price_data']['unit_amount'] * (int) $li['quantity'];
    }
    $total += (int) ($p['shipping_options'][0]['shipping_rate_data']['fixed_amount']['amount'] ?? 0);
    $sessions[$id] = ['id' => $id, 'object' => 'checkout.session', 'url' => "https://checkout.stripe.test/$id",
        'amount_total' => $total, 'payment_status' => 'unpaid', 'metadata' => $p['metadata'],
        'client_reference_id' => $p['client_reference_id'], 'payment_intent' => 'pi_' . bin2hex(random_bytes(6)), 'params' => $p];
    file_put_contents($store, json_encode($sessions));
    exit(json_encode($sessions[$id]));
}
if (preg_match('#^/v1/checkout/sessions/([^/]+)(/expire)?$#', $path, $m) && isset($sessions[$m[1]])) {
    exit(json_encode($sessions[$m[1]]));
}
// Atajo de test: marcar una sesión como pagada
if (preg_match('#^/test/pay/([^/]+)$#', $path, $m) && isset($sessions[$m[1]])) {
    $sessions[$m[1]]['payment_status'] = 'paid';
    file_put_contents($store, json_encode($sessions));
    exit(json_encode($sessions[$m[1]]));
}
http_response_code(404);
echo json_encode(['error' => ['message' => 'not found']]);
