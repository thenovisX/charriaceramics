<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;
use Charria\Http\Request;

/**
 * Pedidos y reservas «a medio pagar». Cada uno retiene stock o plazas durante la hora de cortesía,
 * así que sin un tope cualquiera podría vaciar la tienda con peticiones anónimas. Aquí se limita
 * a unos pocos por cliente y se libera lo que la misma persona dejó a medias al volver a empezar.
 */
final class OpenPayments
{
    private const DEFAULT_MAX_PER_CLIENT = 3;

    public static function clientHash(Request $r): string
    {
        return RateLimiter::clientKey($r->ip);
    }

    /**
     * Dentro de la transacción de la compra: cancela lo pendiente del mismo email y comprueba el tope por cliente.
     * Devuelve las sesiones de Stripe a caducar cuando se confirme la transacción.
     *
     * @param 'orders'|'bookings' $table
     * @param int|null $sessionId horario de la reserva
     * @return string[]
     */
    public static function supersede(Database $db, string $table, string $email, string $clientHash, ?int $sessionId = null): array
    {
        $open = $table === 'orders' ? 'pending' : 'pending_payment';
        // En reservas, solo lo pendiente del mismo horario: se puede reservar dos clases distintas a la vez
        $sameSlot = $sessionId !== null ? ' AND session_id = ?' : '';
        $rows = $db->all(
            "SELECT id, stripe_session_id FROM $table WHERE customer_email = ? AND status = ? AND expires_at > NOW()$sameSlot FOR UPDATE",
            $sessionId !== null ? [$email, $open, $sessionId] : [$email, $open]
        );
        $sessions = [];
        foreach ($rows as $row) {
            $db->exec("UPDATE $table SET status = 'cancelled' WHERE id = ?", [$row['id']]);
            if ($row['stripe_session_id']) {
                $sessions[] = $row['stripe_session_id'];
            }
        }
        $max = (int) (Env::get('CHECKOUT_MAX_OPEN_PER_CLIENT') ?: self::DEFAULT_MAX_PER_CLIENT);
        $count = (int) $db->value(
            "SELECT COUNT(*) FROM $table WHERE client_ip_hash = ? AND status = ? AND expires_at > NOW()",
            [$clientHash, $open]
        );
        if ($count >= $max) {
            throw new HttpError(429, 'too_many_open_payments', 'Tienes varios pagos sin terminar. Complétalos o espera unos minutos.');
        }
        return $sessions;
    }

    /** Tras confirmar la transacción: la persona no puede pagar en Stripe lo que ya se canceló aquí. */
    public static function expireSessions(array $sessionIds): void
    {
        foreach ($sessionIds as $id) {
            try {
                Stripe::expireCheckoutSession($id);
            } catch (\Throwable) {
                // si ya estaba pagada o caducada, el webhook se encarga
            }
        }
    }
}
