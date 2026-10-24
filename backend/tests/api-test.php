<?php
/*
 * Test de extremo a extremo de la API contra una base de datos de pruebas.
 * Ver "Tests" en el README:
 *   php backend/tests/api-test.php http://127.0.0.1:8000 whsec_test
 * Requiere el servidor de desarrollo con STRIPE_API_BASE apuntando a mock-stripe.php.
 * ¡No lo ejecutes contra la base de datos real! Crea y borra datos.
 */
declare(strict_types=1);

$base = rtrim($argv[1] ?? 'http://127.0.0.1:8000', '/') . '/api';
$webhookSecret = $argv[2] ?? 'whsec_test';
$stripeMock = $argv[3] ?? 'http://127.0.0.1:8099';
$adminEmail = $argv[4] ?? 'admin@charria.test';
$adminPass = $argv[5] ?? 'supersecret123';

$passed = 0;
$failed = 0;

function call(string $method, string $url, mixed $body = null, ?string $token = null, array $headers = [], bool $raw = false): array
{
    $ch = curl_init($url);
    $h = $headers;
    if ($token) {
        $h[] = "Authorization: Bearer $token";
    }
    if ($raw || $body === null) {
        $payload = $body;
    } elseif (is_array($body) && isset($body['__multipart'])) {
        unset($body['__multipart']);
        $payload = $body;
    } else {
        $h[] = 'Content-Type: application/json';
        $payload = json_encode($body);
    }
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $h]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    }
    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$status, json_decode((string) $res, true), $res];
}

function check(string $name, bool $ok, mixed $debug = null): void
{
    global $passed, $failed;
    if ($ok) {
        $passed++;
        echo "  ✓ $name\n";
    } else {
        $failed++;
        echo "  ✗ $name\n";
        if ($debug !== null) {
            echo '      ' . substr(is_string($debug) ? $debug : json_encode($debug, JSON_UNESCAPED_UNICODE), 0, 600) . "\n";
        }
    }
}

function webhook(string $base, string $secret, array $event): array
{
    $payload = json_encode($event);
    $t = time();
    $sig = hash_hmac('sha256', "$t.$payload", $secret);
    return call('POST', "$base/webhooks/stripe", $payload, null, ["Stripe-Signature: t=$t,v1=$sig", 'Content-Type: application/json'], true);
}

function makeImage(int $w, int $h): string
{
    $img = imagecreatetruecolor($w, $h);
    imagefill($img, 0, 0, imagecolorallocate($img, 160, 120, 90));
    $file = tempnam(sys_get_temp_dir(), 'img') . '.jpg';
    imagejpeg($img, $file, 90);
    return $file;
}

echo "Autenticación\n";
[$s] = call('GET', "$base/admin/products");
check('el panel sin token responde 401', $s === 401);
[$s] = call('GET', "$base/admin/products", null, str_repeat('a', 64));
check('un token inventado responde 401', $s === 401);
[$s] = call('POST', "$base/auth/login", ['email' => $adminEmail, 'password' => 'mal']);
check('contraseña incorrecta responde 401', $s === 401);
[$s, $j] = call('POST', "$base/auth/login", ['email' => $adminEmail, 'password' => $adminPass]);
$token = $j['data']['token'] ?? '';
check('login correcto devuelve token', $s === 200 && strlen($token) === 64, $j);
[$s, $j] = call('GET', "$base/auth/me", null, $token);
check('/auth/me con token', $s === 200 && $j['data']['email'] === $adminEmail, $j);

echo "Productos (panel)\n";
[$s, $j] = call('POST', "$base/admin/products", ['title' => 'Test Cuenco', 'price_cents' => 5000, 'discount_percent' => 15, 'stock' => 2, 'category' => 'Test', 'weight_grams' => 500], $token);
$pid = $j['data']['id'] ?? 0;
check('crear producto', $s === 201 && $j['data']['final_price_cents'] === 4250, $j);
[$s, $j] = call('POST', "$base/admin/products", ['title' => '', 'price_cents' => -5], $token);
check('validación de producto (422 con campos)', $s === 422 && isset($j['error']['fields']['title'], $j['error']['fields']['price_cents']), $j);
[$s, $j] = call('PATCH', "$base/admin/products/$pid", ['description' => 'Editado', 'price_cents' => 6000], $token);
check('editar producto', $s === 200 && $j['data']['description'] === 'Editado' && $j['data']['final_price_cents'] === 5100, $j);
[$s, $j] = call('PATCH', "$base/admin/products/$pid/sold-out", ['sold_out' => true], $token);
check('interruptor Agotado: activar', $s === 200 && $j['data']['sold_out'] === true, $j);
[$s, $j] = call('POST', "$base/cart/quote", ['items' => [['product_id' => $pid, 'quantity' => 1]]]);
check('un producto agotado no se puede comprar', $s === 200 && ($j['data']['errors'][0]['code'] ?? '') === 'sold_out', $j);
call('PATCH', "$base/admin/products/$pid/sold-out", ['sold_out' => false], $token);

echo "Imágenes\n";
$bad = makeImage(2400, 1350);
[$s, $j] = call('POST', "$base/admin/products/$pid/images", ['__multipart' => 1, 'image' => new CURLFile($bad, 'image/jpeg')], $token);
check('proporción 16:9 rechazada en producto', $s === 422 && str_contains($j['error']['fields']['image'] ?? '', '4:5'), $j);
[$s, $j] = call('POST', "$base/admin/products/$pid/images", ['__multipart' => 1, 'crop' => '1', 'image' => new CURLFile($bad, 'image/jpeg')], $token);
$img = $j['data']['images'][0] ?? [];
check('con recorte automático se acepta y queda 4:5', $s === 201 && abs($img['width'] / $img['height'] - 0.8) < 0.01, $j);
[$s2, , $bytes] = call('GET', str_replace('/api', '', $base) . ($img['url'] ?? ''));
check('la imagen guardada se sirve', $s2 === 200 && strlen($bytes) > 100);
$small = makeImage(400, 500);
[$s, $j] = call('POST', "$base/admin/products/$pid/images", ['__multipart' => 1, 'image' => new CURLFile($small, 'image/jpeg')], $token);
check('imagen demasiado pequeña rechazada', $s === 422, $j);
$fake = tempnam(sys_get_temp_dir(), 'x') . '.jpg';
file_put_contents($fake, "<?php echo 'hack';");
[$s, $j] = call('POST', "$base/admin/products/$pid/images", ['__multipart' => 1, 'image' => new CURLFile($fake, 'image/jpeg')], $token);
check('un .php disfrazado de .jpg se rechaza', $s === 422, $j);
$gal = makeImage(2000, 2000);
[$s, $j] = call('POST', "$base/admin/gallery", ['__multipart' => 1, 'title' => 'Obra test', 'year' => '2026', 'image' => new CURLFile($gal, 'image/jpeg')], $token);
$gid = $j['data']['id'] ?? 0;
check('subir obra 1:1 a la galería', $s === 201 && $j['data']['image']['width'] <= 2200, $j);
[$s, $j] = call('GET', "$base/gallery");
check('la obra aparece en la galería pública', $s === 200 && in_array($gid, array_column($j['data'], 'id'), true));
[$s, $j] = call('PATCH', "$base/admin/gallery/$gid", ['is_published' => false], $token);
[$s, $j] = call('GET', "$base/gallery");
check('una obra oculta no sale en público', !in_array($gid, array_column($j['data'], 'id'), true));

echo "Precios calculados en el servidor\n";
[$s, $j] = call('POST', "$base/cart/quote", ['items' => [['product_id' => $pid, 'quantity' => 2, 'price' => 1, 'unit_price_cents' => 1]]]);
check('el precio enviado por el cliente se ignora', $s === 200 && $j['data']['items_total_cents'] === 10200, $j);
[$s, $j] = call('POST', "$base/cart/quote", ['items' => [['product_id' => $pid, 'quantity' => 3]]]);
check('no se puede pedir más stock del que hay', ($j['data']['errors'][0]['code'] ?? '') === 'insufficient_stock', $j);
[$s, $j] = call('POST', "$base/cart/quote", ['items' => [['product_id' => $pid, 'quantity' => -1]]]);
check('cantidad negativa rechazada', $s === 422);
[$s, $j] = call('POST', "$base/shipping/quote", ['items' => [['product_id' => $pid, 'quantity' => 1]], 'address' => ['postal_code' => '08001', 'country' => 'ES']]);
$opts = array_column($j['data']['options'] ?? [], null, 'id');
check('opciones de envío: recogida y tarifa plana', isset($opts['pickup'], $opts['flat']), $j);

echo "Compra con Stripe\n";
$checkout = [
    'items' => [['product_id' => $pid, 'quantity' => 2]],
    'customer' => ['name' => 'Ana Prueba', 'email' => 'ana@example.com', 'phone' => '600000000'],
    'shipping' => ['option_id' => 'flat'],
    'address' => ['street' => 'Calle Mayor 1', 'city' => 'Barcelona', 'postal_code' => '08001', 'country' => 'ES'],
];
[$s, $j] = call('POST', "$base/checkout", $checkout);
$ref = $j['data']['reference'] ?? '';
check('checkout crea pedido y sesión de pago', $s === 201 && str_starts_with($j['data']['checkout_url'] ?? '', 'https://'), $j);
check('total = 2 × 51,00 + envío 6,90', ($j['data']['total_cents'] ?? 0) === 10200 + 690, $j);
$csId = basename($j['data']['checkout_url'] ?? '');
[, $session] = call('GET', "$stripeMock/v1/checkout/sessions/$csId", null, null, ['Authorization: Bearer sk_test_mock']);
check('Stripe recibe los importes del servidor', ($session['amount_total'] ?? 0) === 10890, $session);
[$s, $j] = call('POST', "$base/checkout", $checkout);
check('el stock queda retenido mientras se paga', $s === 409, $j);

[$s, $j] = call('POST', "$base/webhooks/stripe", '{"id":"evt_x","type":"checkout.session.completed"}', null, ['Stripe-Signature: t=' . time() . ',v1=deadbeef', 'Content-Type: application/json'], true);
check('webhook con firma falsa rechazado', $s === 400, $j);
[, $paidSession] = call('GET', "$stripeMock/test/pay/$csId", null, null, ['Authorization: Bearer sk_test_mock']);
$event = ['id' => 'evt_' . bin2hex(random_bytes(6)), 'type' => 'checkout.session.completed', 'data' => ['object' => $paidSession]];
[$s, $j] = webhook($base, $webhookSecret, $event);
check('webhook firmado aceptado', $s === 200, $j);
[$s, $j] = webhook($base, $webhookSecret, $event);
check('webhook repetido se ignora', $s === 200 && ($j['data']['duplicate'] ?? false), $j);
[$s, $j] = call('GET', "$base/admin/products/$pid", null, $token);
check('el stock baja a 0 tras el pago', $j['data']['stock'] === 0 && $j['data']['sold_out'] === true, $j);
[$s, $j] = call('GET', "$base/checkout/status?session_id=$csId");
check('gracias.html ve el pedido pagado', $s === 200 && $j['data']['paid'] === true && $j['data']['reference'] === $ref, $j);
[$s, $j] = call('GET', "$base/admin/orders", null, $token);
$order = array_values(array_filter($j['data'], static fn ($o) => $o['reference'] === $ref))[0] ?? null;
check('el pedido aparece pagado en el panel', $order && $order['status'] === 'paid', $j);
[$s, $j] = call('PATCH', "$base/admin/orders/{$order['id']}", ['status' => 'shipped'], $token);
check('marcar pedido como enviado', $s === 200 && $j['data']['status'] === 'shipped' && count($j['data']['items']) === 1, $j);

echo "Clases y reservas\n";
[$s, $j] = call('POST', "$base/admin/classes", ['title' => 'Clase test', 'kind' => 'group', 'price_cents' => 4000, 'capacity' => 3], $token);
$cid = $j['data']['id'] ?? 0;
check('crear clase', $s === 201, $j);
[$s, $j] = call('POST', "$base/admin/sessions", ['class_id' => $cid, 'starts_at' => date('Y-m-d', strtotime('+10 days')) . 'T18:00', 'capacity' => 2], $token);
$sid = $j['data']['id'] ?? 0;
check('crear horario con plazas propias', $s === 201 && $j['data']['seats_left'] === 2, $j);
[$s, $j] = call('PATCH', "$base/admin/sessions/$sid", ['price_cents' => 3500], $token);
check('cambiar precio solo de ese horario', $s === 200 && $j['data']['price_cents'] === 3500, $j);
$booking = ['session_id' => $sid, 'seats' => 3, 'customer' => ['name' => 'Luis', 'email' => 'luis@example.com']];
[$s, $j] = call('POST', "$base/bookings", $booking);
check('no se reservan más plazas de las que hay', $s === 409, $j);
$booking['seats'] = 2;
[$s, $j] = call('POST', "$base/bookings", $booking);
check('reservar 2 plazas → pago por 70 €', $s === 201 && $j['data']['total_cents'] === 7000, $j);
$bcs = basename($j['data']['checkout_url'] ?? '');
[$s, $j] = call('GET', "$base/classes");
$sess = null;
foreach ($j['data']['group'] as $c) {
    foreach ($c['sessions'] as $x) {
        if ($x['id'] === $sid) {
            $sess = $x;
        }
    }
}
check('las plazas quedan retenidas durante el pago', $sess && $sess['seats_left'] === 0, $sess);
[, $paidB] = call('GET', "$stripeMock/test/pay/$bcs", null, null, ['Authorization: Bearer sk_test_mock']);
[$s] = webhook($base, $webhookSecret, ['id' => 'evt_' . bin2hex(random_bytes(6)), 'type' => 'checkout.session.completed', 'data' => ['object' => $paidB]]);
[$s, $j] = call('GET', "$base/admin/bookings?session_id=$sid", null, $token);
check('la reserva queda confirmada', ($j['data'][0]['status'] ?? '') === 'confirmed', $j);
[$s, $j] = call('DELETE', "$base/admin/sessions/$sid", null, $token);
check('no se borra un horario con reservas', $s === 409, $j);

[$s, $j] = call('GET', "$base/classes");
$privateId = $j['data']['private'][0]['id'] ?? 0;
[$s, $j] = call('POST', "$base/bookings/private", ['class_id' => $privateId, 'preferred_date' => date('Y-m-d', strtotime('+5 days')), 'preferred_slot' => 'Tarde', 'customer' => ['name' => 'Eva', 'email' => 'eva@example.com']]);
check('solicitud de clase privada', $s === 201 && $j['data']['status'] === 'requested', $j);
[$s, $j] = call('POST', "$base/bookings/private", ['class_id' => $privateId, 'preferred_date' => '2020-01-01', 'preferred_slot' => 'Noche', 'customer' => ['name' => 'Eva', 'email' => 'no-es-email']]);
check('validación de la solicitud privada', $s === 422 && count($j['error']['fields']) >= 3, $j);

echo "Limpieza\n";
[$s] = call('DELETE', "$base/admin/products/$pid", null, $token);
check('borrar producto', $s === 204);
[$s] = call('DELETE', "$base/admin/gallery/$gid", null, $token);
check('borrar obra', $s === 204);
[$s] = call('DELETE', "$base/admin/classes/$cid", null, $token);
check('borrar clase', $s === 204);
[$s] = call('POST', "$base/auth/logout", null, $token);
[$s] = call('GET', "$base/auth/me", null, $token);
check('tras cerrar sesión el token deja de valer', $s === 401);

echo "\n$passed correctos, $failed fallidos\n";
exit($failed ? 1 : 0);
