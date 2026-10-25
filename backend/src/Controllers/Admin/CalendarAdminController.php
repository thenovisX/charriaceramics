<?php
declare(strict_types=1);

namespace Charria\Controllers\Admin;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\PaymentAlerts;
use Charria\Services\Settings;
use Charria\Validator;

/** Calendario de reservas del panel: ver cada día, añadir reservas a mano y avisos de cobro. */
final class CalendarAdminController
{
    /**
     * GET /admin/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD (máx. 100 días)
     * Las suscripciones salen cada semana, el mismo día y hora, desde su primera fecha hasta que se cancelan.
     */
    public function index(Request $r): Response
    {
        $v = new Validator($r->query);
        $from = $v->date('from', true);
        $to = $v->date('to', true);
        $v->check();
        $a = new \DateTimeImmutable($from);
        $b = new \DateTimeImmutable($to);
        if ($b < $a || $a->diff($b)->days > 100) {
            throw HttpError::validation(['to' => 'Rango de fechas no válido (máximo 100 días)']);
        }
        $rows = Database::get()->all(
            "SELECT * FROM bookings
             WHERE status IN ('confirmed','pending_payment') AND starts_at IS NOT NULL
               AND ((billing_type = 'single' AND starts_at >= ? AND starts_at < ?)
                 OR (billing_type = 'subscription' AND starts_at < ?))
             ORDER BY TIME(starts_at)",
            [$a->format('Y-m-d 00:00:00'), $b->modify('+1 day')->format('Y-m-d 00:00:00'), $b->modify('+1 day')->format('Y-m-d 00:00:00')]
        );
        $entries = [];
        foreach ($rows as $row) {
            $first = new \DateTimeImmutable($row['starts_at']);
            if ($row['billing_type'] === 'subscription') {
                $day = $first;
                if ($day < $a) {
                    $day = $a->modify('+' . (((int) $first->format('N') - (int) $a->format('N') + 7) % 7) . ' days');
                }
                for (; $day <= $b; $day = $day->modify('+7 days')) {
                    $entries[] = $this->entry($row, $day->format('Y-m-d'), true);
                }
            } else {
                $entries[] = $this->entry($row, $first->format('Y-m-d'), false);
            }
        }
        usort($entries, static fn ($x, $y) => [$x['date'], $x['time']] <=> [$y['date'], $y['time']]);
        return Response::json($entries);
    }

    private function entry(array $row, string $date, bool $recurring): array
    {
        return [
            'date' => $date,
            'time' => substr($row['starts_at'], 11, 5),
            'recurring' => $recurring,
            'paid' => PaymentAlerts::paidForMonth($row, $date),
            'booking' => ClassAdminController::booking($row),
        ];
    }

    /** GET /admin/payment-alerts — cobros atrasados (los mismos que avisan por email) */
    public function alerts(Request $r): Response
    {
        return Response::json(array_map([ClassAdminController::class, 'booking'], PaymentAlerts::overdue()));
    }

    /**
     * POST /admin/bookings { customer_name, customer_phone?, customer_email?, class_id? | class_title, starts_at,
     *   seats?, total_cents, billing_type: single|subscription, paid?, notes? }
     * Reserva a mano (el cliente paga en el taller). No comprueba plazas: aquí manda el estudio.
     */
    public function store(Request $r): Response
    {
        $v = new Validator($r->body());
        $classId = $v->int('class_id', false, 1);
        $class = $classId ? Database::get()->one('SELECT id, title FROM classes WHERE id = ?', [$classId]) : null;
        if ($classId && !$class) {
            $v->addError('class_id', 'La clase no existe');
        }
        $title = $v->string('class_title', !$class, 160) ?: ($class['title'] ?? '');
        $seats = $v->int('seats', false, 1, 100) ?? 1;
        $total = $v->int('total_cents', false, 0, 10_000_000) ?? 0;
        $paid = $v->bool('paid');
        $data = [
            'reference' => Settings::reference('CL'),
            'class_id' => $class['id'] ?? null,
            'customer_name' => $v->string('customer_name', true, 160, 2),
            'customer_email' => $v->email('customer_email') ?? '',
            'customer_phone' => $v->string('customer_phone', false, 40) ?? '',
            'class_title' => $title,
            'starts_at' => $v->datetime('starts_at', true),
            'seats' => $seats,
            'unit_price_cents' => intdiv($total, $seats),
            'total_cents' => $total,
            'payment_method' => 'in_person',
            'billing_type' => $v->enum('billing_type', ['single', 'subscription']) ?? 'single',
            'source' => 'manual',
            'status' => 'confirmed',
            'notes' => $v->string('notes', false, 2000),
            'paid_at' => $paid ? date('Y-m-d H:i:s') : null,
        ];
        $v->check();
        $id = Database::get()->insert('bookings', $data);
        return Response::created(ClassAdminController::booking(Database::get()->one('SELECT * FROM bookings WHERE id = ?', [$id])));
    }
}
