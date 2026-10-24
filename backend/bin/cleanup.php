<?php
/*
 * Tarea de mantenimiento (opcional, cron diario en hPanel):
 *   php /home/USUARIO/domains/DOMINIO/public_html/backend/bin/cleanup.php
 * Marca como cancelados los pedidos y reservas que nunca se pagaron, borra
 * sesiones y límites caducados y aplica los plazos de conservación de datos
 * (ver Services/Privacy.php). La web funciona igual sin ella: lo caducado
 * ya no retiene stock ni plazas.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("Solo desde la terminal\n");
}
require dirname(__DIR__) . '/bootstrap.php';

$db = Charria\Database::get();
$orders = $db->exec("UPDATE orders SET status = 'cancelled' WHERE status = 'pending' AND expires_at < NOW() - INTERVAL 1 HOUR");
$bookings = $db->exec("UPDATE bookings SET status = 'cancelled' WHERE status = 'pending_payment' AND expires_at < NOW() - INTERVAL 1 HOUR");
$db->exec('DELETE FROM admin_sessions WHERE expires_at < NOW()');
$db->exec('DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL 1 DAY');
$anon = Charria\Services\Privacy::anonymizeExpired();
echo "Pedidos caducados: $orders · Reservas caducadas: $bookings · Anonimizados: {$anon['orders']} pedidos, {$anon['bookings']} reservas\n";
