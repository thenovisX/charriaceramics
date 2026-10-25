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

echo "Instalador y ajustes\n";
[$s, $j] = call('POST', "$base/setup", ['db' => ['name' => 'x', 'user' => 'x', 'pass' => 'x'], 'email' => 'otro@charria.test', 'password' => 'otraclave123']);
check('el instalador queda cerrado una vez instalada', $s === 409, $j);
[$s, $j] = call('GET', "$base/health");
check('health dice que está instalada', $s === 200 && ($j['data']['installed'] ?? null) === true, $j);
[$s] = call('GET', "$base/admin/settings");
check('ajustes sin token responde 401', $s === 401);
[$s, $j] = call('GET', "$base/admin/settings", null, $token);
$raw = json_encode($j);
check('los ajustes nunca devuelven las claves secretas', $s === 200 && isset($j['data']['secrets']['STRIPE_SECRET_KEY']) && !preg_match('/sk_(test|live)_[A-Za-z0-9]{6}|whsec_[A-Za-z0-9]{6}/', $raw), $j);
[$s, $j] = call('PUT', "$base/admin/settings", ['values' => ['STRIPE_SECRET_KEY' => 'pk_live_123456789012', 'MAIL_FROM' => 'nope']], $token);
check('ajustes: rechaza clave publicable y email malo', $s === 422 && isset($j['error']['fields']['STRIPE_SECRET_KEY'], $j['error']['fields']['MAIL_FROM']), $j);
[$s, $j] = call('PUT', "$base/admin/settings", ['values' => ['STRIPE_SECRET_KEY' => '', 'SHIPPING_FLAT_NAME' => 'Envío test']], $token);
check('ajustes: secreto vacío no cambia la clave', $s === 200 && $j['data']['secrets']['STRIPE_SECRET_KEY']['set'] && $j['data']['values']['SHIPPING_FLAT_NAME'] === 'Envío test', $j);
call('PUT', "$base/admin/settings", ['values' => ['SHIPPING_FLAT_NAME' => '']], $token);
[$s, $j] = call('PUT', "$base/admin/settings", ['values' => ['SITE_PHONE' => '+34 600 111 222', 'SITE_HOURS' => "Mar–Sáb 10–20\nDom cerrado", 'SITE_INSTAGRAM' => 'instagram.com/x']], $token);
check('datos de la web: rechaza enlace sin https', $s === 422 && isset($j['error']['fields']['SITE_INSTAGRAM']), $j);
call('PUT', "$base/admin/settings", ['values' => ['SITE_PHONE' => '+34 600 111 222', 'SITE_HOURS' => "Mar–Sáb 10–20\nDom cerrado"]], $token);
[$s, $j] = call('GET', "$base/site");
check('datos de la web públicos en /site (sin claves secretas)', $s === 200 && $j['data']['phone'] === '+34 600 111 222' && str_contains($j['data']['hours'], "\n") && !isset($j['data']['STRIPE_SECRET_KEY']) && count($j['data']) === 16, $j);
call('PUT', "$base/admin/settings", ['values' => ['SITE_PHONE' => '', 'SITE_HOURS' => '']], $token);
[$s, $j] = call('PUT', "$base/admin/settings", ['values' => ['LEGAL_TAX_ID' => 'hola', 'GA_MEASUREMENT_ID' => 'UA-1234']], $token);
check('datos legales: rechaza NIF y Google Analytics no válidos', $s === 422 && isset($j['error']['fields']['LEGAL_TAX_ID'], $j['error']['fields']['GA_MEASUREMENT_ID']), $j);
[$s, $j] = call('PUT', "$base/admin/settings", ['values' => ['LEGAL_OWNER' => 'Ana Charria', 'LEGAL_TAX_ID' => '12345678z', 'GA_MEASUREMENT_ID' => 'g-ab12cd34']], $token);
[, $site] = call('GET', "$base/site");
check('datos legales y ID de Analytics públicos en /site', $s === 200 && $site['data']['legal_tax_id'] === '12345678Z' && $site['data']['ga_id'] === 'G-AB12CD34', $site);
[, $stats] = call('GET', "$base/admin/stats", null, $token);
check('el resumen avisa de los datos legales que faltan', in_array('LEGAL_ADDRESS', $stats['data']['legal_missing'] ?? [], true) && !in_array('LEGAL_OWNER', $stats['data']['legal_missing'], true), $stats);
call('PUT', "$base/admin/settings", ['values' => ['LEGAL_OWNER' => '', 'LEGAL_TAX_ID' => '', 'GA_MEASUREMENT_ID' => '']], $token);

echo "Productos (panel)\n";
[$s, $j] = call('POST', "$base/admin/products", ['title' => 'Test Cuenco', 'price_cents' => 5000, 'discount_percent' => 15, 'stock' => 2, 'category' => 'Test', 'weight_grams' => 500], $token);
$pid = $j['data']['id'] ?? 0;
check('crear producto', $s === 201 && $j['data']['final_price_cents'] === 4250, $j);
[$s, $j] = call('POST', "$base/admin/products", ['title' => '', 'price_cents' => -5], $token);
check('validación de producto (422 con campos)', $s === 422 && isset($j['error']['fields']['title'], $j['error']['fields']['price_cents']), $j);
[$s, $j] = call('PATCH', "$base/admin/products/$pid", ['description' => 'Editado', 'price_cents' => 6000], $token);
check('editar producto', $s === 200 && $j['data']['description'] === 'Editado' && $j['data']['final_price_cents'] === 5100, $j);
[$s, $j] = call('PATCH', "$base/admin/products/$pid", ['dimensions' => 'Ø 14 × 7 cm', 'material' => 'Gres', 'care' => 'Lavar a mano', 'specs' => [['label' => 'Capacidad', 'value' => '450 ml'], ['label' => '', 'value' => '']]], $token);
check('ficha: medidas, material, cuidados y especificaciones (las filas vacías se descartan)', $s === 200 && $j['data']['material'] === 'Gres' && $j['data']['specs'] === [['label' => 'Capacidad', 'value' => '450 ml']], $j);
[$s, $j] = call('PATCH', "$base/admin/products/$pid", ['specs' => [['label' => 'Capacidad', 'value' => '']]], $token);
check('especificación a medias rechazada', $s === 422 && isset($j['error']['fields']['specs.0']), $j);
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
$second = makeImage(1000, 1250);
[$s, $j] = call('POST', "$base/admin/products/$pid/images", ['__multipart' => 1, 'image' => new CURLFile($second, 'image/jpeg')], $token);
$imgIds = array_column($j['data']['images'] ?? [], 'id');
check('segunda foto del producto', $s === 201 && count($imgIds) === 2, $j);
[$s, $j] = call('PUT', "$base/admin/products/$pid/images", ['ids' => array_reverse($imgIds)], $token);
check('reordenar fotos (la primera es la portada)', $s === 200 && array_column($j['data']['images'], 'id') === array_reverse($imgIds), $j);
[$s, $j] = call('PATCH', "$base/admin/products/$pid/images/{$imgIds[0]}", ['alt' => 'Detalle del borde'], $token);
check('texto alternativo de una foto', $s === 200 && in_array('Detalle del borde', array_column($j['data']['images'], 'alt'), true), $j);
[$s, $j] = call('GET', "$base/products/$pid");
check('la ficha pública trae fotos y especificaciones', $s === 200 && count($j['data']['images']) === 2 && $j['data']['dimensions'] === 'Ø 14 × 7 cm' && !isset($j['data']['stock']), $j);
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
check('sin aceptar condiciones y privacidad no se puede comprar', $s === 422 && isset($j['error']['fields']['consents.terms']), $j);
$checkout['consents'] = ['terms' => true, 'marketing' => true, 'profile' => false];
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
[$s, $j] = call('POST', "$base/admin/classes", ['title' => 'Clase semanal test', 'kind' => 'group', 'price_cents' => 4000, 'capacity' => 4], $token);
$weeklyId = $j['data']['id'] ?? 0;
$first = date('Y-m-d', strtotime('next tuesday')) . 'T18:00';
[$s, $j] = call('POST', "$base/admin/sessions", ['class_id' => $weeklyId, 'starts_at' => $first, 'repeat_weeks' => 4], $token);
[, $all] = call('GET', "$base/admin/classes", null, $token);
$weekly = array_values(array_filter($all['data'] ?? [], fn ($c) => $c['id'] === $weeklyId))[0]['sessions'] ?? [];
$sameSlot = count(array_unique(array_map(fn ($x) => date('N H:i', strtotime($x['starts_at'])), $weekly))) === 1;
check('clase semanal: 4 horarios, mismo día y hora', $s === 201 && ($j['data']['created'] ?? 0) === 4 && count($weekly) === 4 && $sameSlot, $weekly);
[$s] = call('DELETE', "$base/admin/classes/$weeklyId", null, $token);
check('borrar clase semanal', $s === 204);
[$s, $j] = call('PATCH', "$base/admin/sessions/$sid", ['price_cents' => 3500], $token);
check('cambiar precio solo de ese horario', $s === 200 && $j['data']['price_cents'] === 3500, $j);
$booking = ['session_id' => $sid, 'seats' => 3, 'customer' => ['name' => 'Luis', 'email' => 'luis@example.com', 'phone' => '611111111'], 'consents' => ['terms' => true, 'profile' => true]];
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

echo "Pagar en el taller\n";
[$s, $j] = call('GET', "$base/classes");
$cls = array_values(array_filter($j['data']['group'] ?? [], fn ($c) => $c['id'] === $cid))[0] ?? null;
check('la web sabe si hay pago online y si la clase admite pagar en el taller', ($j['data']['online_payment'] ?? null) === true && ($cls['pay_in_person'] ?? null) === true, $j);
[$s, $j] = call('POST', "$base/admin/sessions", ['class_id' => $cid, 'starts_at' => date('Y-m-d', strtotime('+12 days')) . 'T18:00', 'capacity' => 3], $token);
$sid2 = $j['data']['id'] ?? 0;
$nora = ['session_id' => $sid2, 'seats' => 2, 'payment_method' => 'in_person', 'customer' => ['name' => 'Nora', 'email' => 'nora@example.com'], 'consents' => ['terms' => true]];
[$s, $j] = call('POST', "$base/bookings", $nora);
check('reservar para pagar en el taller: confirmada al momento y sin Stripe', $s === 201 && $j['data']['status'] === 'confirmed' && $j['data']['payment_method'] === 'in_person' && !isset($j['data']['checkout_url']) && $j['data']['total_cents'] === 8000, $j);
[, $j] = call('GET', "$base/admin/bookings?session_id=$sid2", null, $token);
$noraB = $j['data'][0] ?? [];
check('…ocupa plazas y queda sin cobrar', ($noraB['payment_method'] ?? '') === 'in_person' && $noraB['paid_at'] === null && $noraB['status'] === 'confirmed', $j);
[, $j] = call('GET', "$base/classes");
$left = null;
foreach ($j['data']['group'] as $c) {
    foreach ($c['sessions'] as $x) {
        if ($x['id'] === $sid2) {
            $left = $x['seats_left'];
        }
    }
}
check('…y la plaza queda ocupada', $left === 1, $left);
[, $j] = call('GET', "$base/admin/bookings?status=unpaid", null, $token);
check('filtro «por cobrar en el taller»', count(array_filter($j['data'] ?? [], fn ($b) => $b['id'] === $noraB['id'])) === 1, $j);
[, $j] = call('GET', "$base/admin/stats", null, $token);
check('el resumen cuenta las reservas por cobrar', ($j['data']['bookings_unpaid'] ?? 0) >= 1, $j);
[$s, $j] = call('PATCH', "$base/admin/bookings/{$noraB['id']}", ['paid' => true], $token);
check('marcar como cobrada', $s === 200 && $j['data']['paid_at'] !== null && $j['data']['status'] === 'confirmed', $j);
[, $j] = call('GET', "$base/admin/bookings?status=unpaid", null, $token);
check('…y sale de «por cobrar»', !array_filter($j['data'] ?? [], fn ($b) => $b['id'] === $noraB['id']), $j);
[$s, $j] = call('PATCH', "$base/admin/bookings/{$noraB['id']}", ['paid' => false], $token);
check('deshacer el cobro', $s === 200 && $j['data']['paid_at'] === null, $j);
[, $j] = call('GET', "$base/admin/bookings?session_id=$sid", null, $token);
[$s, $j] = call('PATCH', "$base/admin/bookings/{$j['data'][0]['id']}", ['paid' => false], $token);
check('una reserva pagada online no se marca a mano', $s === 422, $j);
[$s, $j] = call('POST', "$base/bookings", array_merge($nora, ['seats' => 2]));
check('pagar en el taller respeta las plazas libres', $s === 409, $j);
[$s, $j] = call('PATCH', "$base/admin/classes/$cid", ['pay_in_person' => false], $token);
check('apagar «se puede pagar en el taller» en la clase', $s === 200 && $j['data']['pay_in_person'] === false, $j);
[$s, $j] = call('POST', "$base/bookings", array_merge($nora, ['seats' => 1]));
check('…y ya no deja reservar sin pagar online', $s === 422 && isset($j['error']['fields']['payment_method']), $j);
call('PATCH', "$base/admin/classes/$cid", ['pay_in_person' => true], $token);
[$s, $j] = call('POST', "$base/admin/customers/erase", ['email' => 'nora@example.com'], $token);
[, $b] = call('GET', "$base/admin/bookings?session_id=$sid2", null, $token);
check('RGPD: borrar libera la plaza sin pagar del taller', $s === 200 && ($b['data'][0]['status'] ?? '') === 'cancelled', $b);

[$s, $j] = call('GET', "$base/classes");
$privateId = $j['data']['private'][0]['id'] ?? 0;
[$s, $j] = call('POST', "$base/bookings/private", ['class_id' => $privateId, 'preferred_date' => date('Y-m-d', strtotime('+5 days')), 'preferred_slot' => 'Tarde', 'customer' => ['name' => 'Eva', 'email' => 'eva@example.com'], 'consents' => ['terms' => true]]);
check('solicitud de clase privada', $s === 201 && $j['data']['status'] === 'requested', $j);
[$s, $j] = call('POST', "$base/bookings/private", ['class_id' => $privateId, 'preferred_date' => '2020-01-01', 'preferred_slot' => 'Noche', 'customer' => ['name' => 'Eva', 'email' => 'no-es-email']]);
check('validación de la solicitud privada', $s === 422 && count($j['error']['fields']) >= 4 && isset($j['error']['fields']['consents.terms']), $j);

echo "Privacidad (RGPD)\n";
$findCustomer = static function (string $email, string $filter) use ($base, $token) {
    [, $j] = call('GET', "$base/admin/customers?filter=$filter", null, $token);
    return array_values(array_filter($j['data'] ?? [], static fn ($c) => $c['email'] === $email))[0] ?? null;
};
check('compra con marketing y sin perfil: no sale en Perfiles', $findCustomer('ana@example.com', 'profiles') === null);
check('…pero sí en la lista de marketing', ($findCustomer('ana@example.com', 'marketing')['marketing_opt_in'] ?? false) === true);
$luis = $findCustomer('luis@example.com', 'profiles');
check('reserva con «guardar perfil» crea el perfil', $luis && $luis['phone'] === '611111111' && $luis['marketing_opt_in'] === false, $luis);
check('reserva sin casillas opcionales no crea cliente', $findCustomer('eva@example.com', 'profiles') === null && $findCustomer('eva@example.com', 'marketing') === null);
[, $j] = call('GET', "$base/admin/bookings", null, $token);
$eva = array_values(array_filter($j['data'], static fn ($b) => $b['customer']['email'] === 'eva@example.com'))[0] ?? null;
check('la reserva guarda su propio contacto aunque no haya perfil', $eva && $eva['customer']['name'] === 'Eva', $j);
[$s, $j] = call('GET', "$base/admin/customers/{$luis['id']}", null, $token);
$purposes = array_column($j['data']['consents'] ?? [], 'purpose');
check('ficha del cliente con su reserva y consentimientos (fecha y versión)', $s === 200 && count($j['data']['booking_list']) >= 1 && array_slice($purposes, -2) === ['terms', 'profile'] && !empty($j['data']['consents'][0]['text_version']), $j);
[$s, $j] = call('GET', "$base/admin/customers/{$luis['id']}/export", null, $token);
check('exportar datos de un cliente', $s === 200 && $j['data']['profile']['email'] === 'luis@example.com' && count($j['data']['bookings']) >= 1, $j);

[$s, $j] = call('GET', "$base/admin/marketing", null, $token);
$ana = array_values(array_filter($j['data'] ?? [], static fn ($c) => $c['email'] === 'ana@example.com'))[0] ?? null;
check('lista de marketing con fecha de alta y enlace de baja', $ana && $ana['since'] && str_contains($ana['unsubscribe_url'], 'firma='), $j);
parse_str((string) parse_url($ana['unsubscribe_url'] ?? '', PHP_URL_QUERY), $q);
[$s] = call('POST', "$base/privacy/unsubscribe", ['email' => 'ana@example.com', 'signature' => str_repeat('0', 32)]);
check('enlace de baja con firma falsa rechazado', $s === 403);
[$s, $j] = call('POST', "$base/privacy/unsubscribe", ['email' => $q['baja'] ?? '', 'signature' => $q['firma'] ?? '']);
check('enlace de baja funciona y borra el contacto sin perfil', $s === 200 && $j['data']['unsubscribed'] === true && $findCustomer('ana@example.com', 'marketing') === null, $j);

[$s, $j] = call('POST', "$base/privacy/request", ['email' => 'luis@example.com', 'type' => 'borrar']);
check('solicitud de privacidad: tipo no válido', $s === 422, $j);
[$s, $j] = call('POST', "$base/privacy/request", ['email' => 'luis@example.com', 'type' => 'delete']);
check('solicitud de privacidad sin email configurado avisa de escribir a mano', $s === 503, $j);
[$s] = call('POST', "$base/privacy/confirm", ['token' => str_repeat('a', 48)]);
check('enlace de confirmación inventado no vale', $s === 410);

[$s, $j] = call('DELETE', "$base/admin/customers/{$luis['id']}", null, $token);
check('borrar cliente: perfil fuera, reserva pagada se conserva bloqueada', $s === 200 && $j['data']['profile_deleted'] && $j['data']['bookings_kept'] >= 1, $j);
[, $j] = call('GET', "$base/admin/bookings?session_id=$sid", null, $token);
check('…sin teléfono y marcada como bloqueada', ($j['data'][0]['customer']['phone'] ?? 'x') === '' && ($j['data'][0]['privacy_blocked'] ?? false) === true, $j);
[$s, $j] = call('POST', "$base/admin/customers/erase", ['email' => 'eva@example.com'], $token);
check('borrar por email: la solicitud privada sin pagar se anonimiza y cancela', $s === 200 && $j['data']['bookings_anonymized'] >= 1, $j);
[$s, $j] = call('POST', "$base/admin/customers/erase", ['email' => 'ana@example.com'], $token);
check('borrar por email: el pedido pagado se conserva para la factura', $s === 200 && $j['data']['orders_kept'] >= 1, $j);
[, $j] = call('GET', "$base/admin/privacy-requests", null, $token);
check('registro de solicitudes sin el email borrado', count($j['data'] ?? []) >= 3 && !str_contains(json_encode($j), 'eva@example.com'), $j);

[$s, $j] = call('POST', "$base/contact", ['name' => 'Eva', 'email' => 'eva@example.com', 'message' => 'Hola, una duda']);
check('contacto: pide aceptar la política de privacidad', $s === 422 && isset($j['error']['fields']['consents.privacy']), $j);
[$s] = call('POST', "$base/contact", ['name' => 'Eva', 'email' => 'eva@example.com', 'message' => 'Hola, una duda', 'consents' => ['privacy' => true]]);
check('contacto con la casilla marcada', $s === 201);

echo "Mensajes\n";
[$s] = call('POST', "$base/contact", ['name' => 'Leo', 'email' => 'leo@example.com', 'reason' => 'Encargo personalizado', 'message' => 'Quiero una vajilla de 6 servicios', 'consents' => ['privacy' => true]]);
check('encargo desde el formulario de contacto', $s === 201);
[$s] = call('POST', "$base/bookings/private", ['class_id' => $privateId, 'preferred_date' => date('Y-m-d', strtotime('+6 days')), 'preferred_slot' => 'Mañana', 'notes' => 'Primera vez', 'customer' => ['name' => 'Mia', 'email' => 'mia@example.com'], 'consents' => ['terms' => true]]);
check('solicitud de clase privada', $s === 201);
[, $j] = call('GET', "$base/admin/messages", null, $token);
$byEmail = static fn (array $list, string $email) => array_values(array_filter($list, static fn ($m) => $m['email'] === $email))[0] ?? null;
$leo = $byEmail($j['data'] ?? [], 'leo@example.com');
$mia = $byEmail($j['data'] ?? [], 'mia@example.com');
check('el encargo llega a Mensajes como petición y sin leer', $leo !== null && $leo['type'] === 'request' && !$leo['read'] && $leo['subject'] === 'Encargo personalizado', $j);
check('la clase privada llega a Mensajes con su reserva', $mia !== null && $mia['type'] === 'private_class' && $mia['booking_id'] > 0 && str_contains($mia['body'], 'Primera vez'), $j);
check('el contacto normal llega como contacto', ($byEmail($j['data'] ?? [], 'eva@example.com')['type'] ?? '') === 'contact', $j);
[, $j] = call('GET', "$base/admin/messages?type=request", null, $token);
check('filtro por tipo', (bool) $j['data'] && !array_filter($j['data'], static fn ($m) => $m['type'] !== 'request'), $j);
[, $j] = call('GET', "$base/admin/messages/unread", null, $token);
$unread = $j['data']['unread'] ?? 0;
check('contador de no leídos', $unread >= 3, $j);
[$s, $j] = call('GET', "$base/admin/messages/{$leo['id']}", null, $token);
check('abrir un mensaje lo marca como leído', $s === 200 && $j['data']['read'] === true, $j);
[, $j] = call('GET', "$base/admin/messages/unread", null, $token);
check('…y baja el contador', ($j['data']['unread'] ?? 0) === $unread - 1, $j);
[$s, $j] = call('PATCH', "$base/admin/messages/{$leo['id']}", ['handled' => true], $token);
check('marcar como atendido', $s === 200 && $j['data']['handled'] === true, $j);
[, $j] = call('GET', "$base/admin/messages?status=open", null, $token);
check('los atendidos salen de «por atender»', !$byEmail($j['data'] ?? [], 'leo@example.com'), $j);
call('PATCH', "$base/admin/bookings/{$mia['booking_id']}", ['status' => 'confirmed'], $token);
[, $j] = call('GET', "$base/admin/messages/{$mia['id']}", null, $token);
check('confirmar la reserva privada deja su mensaje atendido', ($j['data']['handled'] ?? false) === true, $j);
[$s] = call('DELETE', "$base/admin/messages/{$mia['id']}", null, $token);
[, $j] = call('GET', "$base/admin/bookings?status=confirmed", null, $token);
check('borrar el mensaje no borra la reserva', $s === 204 && (bool) array_filter($j['data'] ?? [], static fn ($b) => $b['id'] === $mia['booking_id']), $j);
[$s, $j] = call('POST', "$base/admin/customers/erase", ['email' => 'leo@example.com'], $token);
[, $l] = call('GET', "$base/admin/messages", null, $token);
check('RGPD: borrar por email borra sus mensajes', $s === 200 && $j['data']['messages_deleted'] === 1 && !$byEmail($l['data'] ?? [], 'leo@example.com'), $j);
call('POST', "$base/admin/customers/erase", ['email' => 'mia@example.com'], $token);
call('POST', "$base/admin/customers/erase", ['email' => 'eva@example.com'], $token);

echo "Calendario de reservas y avisos de pago\n";
$today = new DateTimeImmutable('today');
$manual = static fn (array $x) => call('POST', "$base/admin/bookings", $x + ['customer_name' => 'Ana Prueba', 'class_title' => 'Torno semanal', 'total_cents' => 8000], $token);
[$s, $j] = $manual(['starts_at' => $today->modify('+2 days')->format('Y-m-d') . ' 18:00', 'billing_type' => 'single']);
$single = $j['data'] ?? [];
check('añadir reserva a mano (pago único, sin pagar)', $s === 201 && $single['source'] === 'manual' && $single['billing_type'] === 'single' && !$single['paid_at'] && $single['status'] === 'confirmed', $j);
[$s] = $manual(['starts_at' => 'mañana', 'billing_type' => 'single']);
check('reserva a mano: fecha no válida → 422', $s === 422);
[$s] = call('POST', "$base/admin/bookings", ['starts_at' => $today->format('Y-m-d') . ' 10:00'], $token);
check('reserva a mano: faltan nombre y clase → 422', $s === 422);
[$s, $j] = $manual(['starts_at' => $today->modify('-10 days')->format('Y-m-d') . ' 11:00', 'billing_type' => 'subscription', 'paid' => true]);
$sub = $j['data'] ?? [];
check('añadir suscripción ya pagada', $s === 201 && $sub['billing_type'] === 'subscription' && $sub['paid_at'], $j);
$from = $today->format('Y-m-d');
$to = $today->modify('+20 days')->format('Y-m-d');
[$s, $j] = call('GET', "$base/admin/calendar?from=$from&to=$to", null, $token);
$cal = $j['data'] ?? [];
$subDays = array_values(array_filter($cal, static fn ($e) => $e['booking']['id'] === $sub['id']));
$singleDay = array_values(array_filter($cal, static fn ($e) => $e['booking']['id'] === $single['id']));
check('calendario: la reserva única sale su día', $s === 200 && count($singleDay) === 1 && $singleDay[0]['date'] === $today->modify('+2 days')->format('Y-m-d') && $singleDay[0]['time'] === '18:00' && $singleDay[0]['paid'] === false, $j);
check('calendario: la suscripción se repite cada semana', count($subDays) >= 2 && $subDays[0]['recurring'] && (new DateTimeImmutable($subDays[1]['date']))->diff(new DateTimeImmutable($subDays[0]['date']))->days === 7 && (new DateTimeImmutable($subDays[0]['date']))->format('N') === (new DateTimeImmutable($sub['starts_at']))->format('N'), $subDays);
[$s] = call('GET', "$base/admin/calendar?from=$from&to=" . $today->modify('+400 days')->format('Y-m-d'), null, $token);
check('calendario: rango demasiado largo → 422', $s === 422);
[$s, $j] = call('GET', "$base/admin/payment-alerts", null, $token);
$ids = array_column($j['data'] ?? [], 'id');
check('aviso: ni la reserva futura ni la suscripción cobrada avisan', $s === 200 && !in_array($single['id'], $ids, true) && !in_array($sub['id'], $ids, true), $j);
[$s, $j] = $manual(['starts_at' => $today->modify('-3 days')->format('Y-m-d') . ' 17:00', 'billing_type' => 'single']);
$past = $j['data'] ?? [];
[, $j] = call('GET', "$base/admin/payment-alerts", null, $token);
check('aviso: clase pasada sin cobrar', in_array($past['id'] ?? 0, array_column($j['data'] ?? [], 'id'), true), $j);
[$s, $j] = call('PATCH', "$base/admin/bookings/{$past['id']}", ['paid' => true], $token);
[, $j] = call('GET', "$base/admin/payment-alerts", null, $token);
check('marcar cobrada quita el aviso', $s === 200 && $j['data'] !== null && !in_array($past['id'], array_column($j['data'], 'id'), true), $j);
[$s, $j] = call('PATCH', "$base/admin/bookings/{$single['id']}", ['billing_type' => 'subscription'], $token);
check('cambiar entre pago único y suscripción', $s === 200 && $j['data']['billing_type'] === 'subscription', $j);
[, $j] = call('GET', "$base/admin/stats", null, $token);
check('resumen: cuenta los cobros atrasados', is_int($j['data']['payments_overdue'] ?? null), $j);
foreach ([$single, $sub, $past] as $b) {
    call('PATCH', "$base/admin/bookings/{$b['id']}", ['status' => 'cancelled'], $token);
}

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
