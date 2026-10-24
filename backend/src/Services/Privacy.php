<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Http\HttpError;

/**
 * Derechos RGPD de los clientes: acceso/portabilidad (export), supresión (erase)
 * y baja de comunicaciones comerciales.
 *
 * Supresión: se borra el perfil, el alta en marketing y todo lo que no haga
 * falta. Lo que la ley obliga a conservar (pedidos y reservas pagados: facturación,
 * Código de Comercio art. 30 y normativa fiscal, 6 años) no se borra: se
 * "bloquea" (LOPDGDD art. 32), quitando el teléfono y las notas, y se marca
 * con privacy_blocked_at. bin/cleanup.php los anonimiza cuando pasa el plazo.
 */
final class Privacy
{
    /** Años que se conservan los pedidos y reservas pagados (Código de Comercio art. 30). */
    public const RETENTION_YEARS = 6;
    private const ANON = 'Datos suprimidos';

    /** Todo lo que hay guardado de un email, en un formato legible y exportable (JSON). */
    public static function export(string $email): array
    {
        $db = Database::get();
        $customer = $db->one('SELECT * FROM customers WHERE email = ?', [$email]);
        $orders = $db->all('SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at', [$email]);
        $bookings = $db->all('SELECT * FROM bookings WHERE customer_email = ? ORDER BY created_at', [$email]);
        return [
            'generated_at' => date('c'),
            'email' => $email,
            'profile' => $customer ? [
                'name' => $customer['name'], 'email' => $customer['email'], 'phone' => $customer['phone'],
                'street' => $customer['street'], 'city' => $customer['city'], 'postal_code' => $customer['postal_code'],
                'country' => $customer['country'], 'profile_saved' => (bool) $customer['has_profile'],
                'marketing_opt_in' => (bool) $customer['marketing_opt_in'], 'created_at' => $customer['created_at'],
            ] : null,
            'orders' => array_map(static fn ($o) => [
                'reference' => $o['reference'], 'status' => $o['status'], 'created_at' => $o['created_at'], 'paid_at' => $o['paid_at'],
                'name' => $o['customer_name'], 'email' => $o['customer_email'], 'phone' => $o['customer_phone'],
                'delivery' => $o['shipping_method'] === 'pickup' ? 'Recogida en el estudio' : trim("{$o['ship_street']}, {$o['ship_postal_code']} {$o['ship_city']} ({$o['ship_country']})"),
                'shipping_service' => $o['shipping_service_name'],
                'items' => array_map(static fn ($i) => ['title' => $i['title'], 'quantity' => (int) $i['quantity'], 'total_eur' => $i['line_total_cents'] / 100],
                    $db->all('SELECT * FROM order_items WHERE order_id = ?', [$o['id']])),
                'total_eur' => $o['total_cents'] / 100,
            ], $orders),
            'bookings' => array_map(static fn ($b) => [
                'reference' => $b['reference'], 'class' => $b['class_title'], 'status' => $b['status'],
                'starts_at' => $b['starts_at'], 'preferred_date' => $b['preferred_date'], 'seats' => (int) $b['seats'],
                'name' => $b['customer_name'], 'email' => $b['customer_email'], 'phone' => $b['customer_phone'],
                'notes' => (string) $b['notes'], 'total_eur' => $b['total_cents'] / 100, 'created_at' => $b['created_at'],
            ], $bookings),
            'consents' => Consents::history($email),
        ];
    }

    /**
     * Suprime los datos de un email. Devuelve un resumen de lo hecho.
     * Si hay un pago en curso (sesión de Stripe abierta) se pide esperar: borrar
     * ahora dejaría un pedido pagado sin datos de entrega.
     */
    public static function erase(string $email): array
    {
        $db = Database::get();
        $busy = (int) $db->value("SELECT COUNT(*) FROM orders WHERE customer_email = ? AND status = 'pending' AND expires_at > NOW()", [$email])
            + (int) $db->value("SELECT COUNT(*) FROM bookings WHERE customer_email = ? AND status = 'pending_payment' AND expires_at > NOW()", [$email]);
        if ($busy) {
            throw new HttpError(409, 'payment_in_progress', 'Hay un pago a medias con este email. Vuelve a intentarlo dentro de 30 minutos.');
        }
        return $db->transaction(static function (Database $db) use ($email) {
            $now = date('Y-m-d H:i:s');
            $profiles = $db->exec('DELETE FROM customers WHERE email = ?', [$email]);

            // Pedidos y reservas pagados: se conservan bloqueados (sin teléfono ni notas)
            $keptOrders = $db->exec(
                "UPDATE orders SET customer_phone = '', privacy_blocked_at = COALESCE(privacy_blocked_at, ?)
                 WHERE customer_email = ? AND status IN ('paid','shipped','refunded')",
                [$now, $email]
            );
            $keptBookings = $db->exec(
                "UPDATE bookings SET customer_phone = '', notes = NULL, privacy_blocked_at = COALESCE(privacy_blocked_at, ?)
                 WHERE customer_email = ? AND status = 'confirmed' AND paid_at IS NOT NULL",
                [$now, $email]
            );
            // Lo que no se llegó a pagar no hace falta para nada: se anonimiza
            $anonOrders = $db->exec(
                "UPDATE orders SET customer_name = ?, customer_email = '', customer_phone = '', ship_street = '', ship_city = '',
                   ship_postal_code = '', privacy_blocked_at = COALESCE(privacy_blocked_at, ?)
                 WHERE customer_email = ? AND status IN ('pending','cancelled')",
                [self::ANON, $now, $email]
            );
            $anonBookings = $db->exec(
                "UPDATE bookings SET customer_name = ?, customer_email = '', customer_phone = '', notes = NULL,
                   status = IF(status = 'requested', 'cancelled', status), privacy_blocked_at = COALESCE(privacy_blocked_at, ?)
                 WHERE customer_email = ? AND NOT (status = 'confirmed' AND paid_at IS NOT NULL)",
                [self::ANON, $now, $email]
            );
            // El registro de consentimientos y solicitudes se queda sin el email (solo su huella)
            $hash = self::fingerprint($email);
            $db->exec("UPDATE consents SET subject_email = ?, ip = '', user_agent = '' WHERE subject_email = ?", [$hash, mb_strtolower($email)]);
            $db->exec('UPDATE privacy_requests SET email = ? WHERE email = ?', [$hash, $email]);

            return [
                'profile_deleted' => $profiles > 0,
                'orders_kept' => $keptOrders,
                'bookings_kept' => $keptBookings,
                'orders_anonymized' => $anonOrders,
                'bookings_anonymized' => $anonBookings,
            ];
        });
    }

    /** Huella del email (para el registro de consentimientos tras borrar). Con APP_KEY: no se puede revertir con un diccionario. */
    public static function fingerprint(string $email): string
    {
        return 'h:' . substr(AppSettings::sign('email|' . mb_strtolower(trim($email))), 0, 40);
    }

    /** Firma para el enlace de baja de marketing que va en cada fila de la exportación. */
    public static function unsubscribeSignature(string $email): string
    {
        return substr(AppSettings::sign('unsub|' . mb_strtolower(trim($email))), 0, 32);
    }

    public static function unsubscribeUrl(string $email): string
    {
        return Settings::appUrl() . '/mis-datos.html?baja=' . rawurlencode($email) . '&firma=' . self::unsubscribeSignature($email);
    }

    /**
     * Pasado el plazo legal, los pedidos y reservas pagados se anonimizan; los no pagados, a los 90 días.
     * Lo llaman bin/cleanup.php y el resumen del panel (así funciona aunque no haya cron).
     */
    public static function anonymizeExpired(): array
    {
        $db = Database::get();
        $years = self::RETENTION_YEARS;
        $orders = $db->exec(
            "UPDATE orders SET customer_name = ?, customer_email = '', customer_phone = '', ship_street = '', ship_city = '', ship_postal_code = ''
             WHERE customer_email <> '' AND COALESCE(paid_at, created_at) < NOW() - INTERVAL $years YEAR",
            [self::ANON]
        );
        $bookings = $db->exec(
            "UPDATE bookings SET customer_name = ?, customer_email = '', customer_phone = '', notes = NULL
             WHERE customer_email <> '' AND COALESCE(paid_at, created_at) < NOW() - INTERVAL $years YEAR",
            [self::ANON]
        );
        // Compras que nunca se pagaron: no hacen falta para nada pasados 90 días
        $orders += $db->exec(
            "UPDATE orders SET customer_name = ?, customer_email = '', customer_phone = '', ship_street = '', ship_city = '', ship_postal_code = ''
             WHERE customer_email <> '' AND status IN ('pending','cancelled') AND paid_at IS NULL AND created_at < NOW() - INTERVAL 90 DAY",
            [self::ANON]
        );
        $bookings += $db->exec(
            "UPDATE bookings SET customer_name = ?, customer_email = '', customer_phone = '', notes = NULL
             WHERE customer_email <> '' AND status = 'cancelled' AND paid_at IS NULL AND created_at < NOW() - INTERVAL 90 DAY",
            [self::ANON]
        );
        $db->exec("DELETE FROM privacy_requests WHERE status = 'pending' AND expires_at < NOW() - INTERVAL 30 DAY");
        return ['orders' => $orders, 'bookings' => $bookings];
    }
}
