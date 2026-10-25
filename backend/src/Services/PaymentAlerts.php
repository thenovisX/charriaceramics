<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;

/**
 * Avisos de cobros pendientes en el taller.
 * - Suscripción (cuota mensual): se cobra a principios de mes; si pasada la primera
 *   semana (a partir del día 8) no consta cobrada este mes, avisa.
 * - Pago único: la clase ya pasó y sigue sin cobrar.
 * El panel los enseña siempre; además sale un email a MAIL_ADMIN (si hay) y se repite cada semana.
 */
final class PaymentAlerts
{
    public const GRACE_DAY = 8;  // día del mes desde el que una cuota sin cobrar se considera atrasada
    private const REPEAT_DAYS = 7;

    /** Reservas con cobro atrasado, las más antiguas primero. */
    public static function overdue(?\DateTimeImmutable $now = null): array
    {
        $now ??= new \DateTimeImmutable();
        $monthStart = $now->format('Y-m-01 00:00:00');
        $parts = ["(b.billing_type = 'single' AND b.paid_at IS NULL AND b.starts_at IS NOT NULL AND b.starts_at < ?)"];
        $params = [$now->format('Y-m-d 00:00:00')];
        if ((int) $now->format('j') >= self::GRACE_DAY) {
            $parts[] = "(b.billing_type = 'subscription' AND b.starts_at < ? AND (b.paid_at IS NULL OR b.paid_at < ?))";
            array_push($params, $now->format('Y-m-t 23:59:59'), $monthStart);
        }
        return Database::get()->all(
            "SELECT b.* FROM bookings b
             WHERE b.status = 'confirmed' AND b.payment_method = 'in_person' AND (" . implode(' OR ', $parts) . ')
             ORDER BY b.starts_at',
            $params
        );
    }

    /** Un solo email con todos los cobros atrasados que aún no se han avisado (o hace más de una semana). */
    public static function notify(): int
    {
        $due = array_filter(self::overdue(), static fn ($b) => !$b['payment_alert_at'] || strtotime($b['payment_alert_at']) < time() - self::REPEAT_DAYS * 86400);
        if (!$due) {
            return 0;
        }
        if (Mailer::canSend()) {
            $lines = array_map(static fn ($b) => '- ' . ($b['customer_name'] ?: 'Sin nombre') . ' · ' . $b['class_title'] . ' · '
                . ($b['billing_type'] === 'subscription' ? 'suscripción' : 'pago único') . ' · ' . Mailer::money((int) $b['total_cents']), $due);
            Mailer::admin('Cobros pendientes en el taller',
                "Estas reservas siguen sin cobrar:\n\n" . implode("\n", $lines) . "\n\nMárcalas como cobradas en Panel → Calendario.");
        }
        $ids = array_map(static fn ($b) => (int) $b['id'], $due);
        Database::get()->exec('UPDATE bookings SET payment_alert_at = NOW() WHERE id IN (' . implode(',', $ids) . ')');
        return count($ids);
    }

    /** ¿Está la suscripción cobrada en el mes de esa fecha? null si no se puede saber (meses pasados). */
    public static function paidForMonth(array $b, string $date, ?\DateTimeImmutable $now = null): ?bool
    {
        if ($b['billing_type'] !== 'subscription') {
            return $b['paid_at'] ? true : false;
        }
        $now ??= new \DateTimeImmutable();
        $month = substr($date, 0, 7);
        if ($month < $now->format('Y-m')) {
            return null;
        }
        return $month === $now->format('Y-m') ? ($b['paid_at'] && $b['paid_at'] >= $now->format('Y-m-01')) : false;
    }
}
