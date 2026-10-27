<?php
declare(strict_types=1);

namespace Charria\Controllers\Admin;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\WeeklySchedule;
use Charria\Validator;

/** Panel → Clases → Semanales: cada día de la semana, si sale y qué clases hay a qué hora y precio. */
final class WeeklyAdminController
{
    private function payload(int $cancelled = 0): array
    {
        $db = Database::get();
        $classes = array_column($db->all("SELECT * FROM classes WHERE kind = 'group' ORDER BY sort_order, id"), null, 'id');
        $open = WeeklySchedule::days();
        $days = [];
        foreach (WeeklySchedule::DAYS as $n => $name) {
            $days[$n] = ['weekday' => $n, 'name' => $name, 'is_open' => $open[$n], 'slots' => []];
        }
        foreach (WeeklySchedule::slots() as $s) {
            $days[(int) $s['weekday']]['slots'][] = WeeklySchedule::presentSlot($s, $classes[$s['class_id']] ?? null);
        }
        return [
            'days' => array_values($days),
            'classes' => array_values(array_map(static fn ($c) => [
                'id' => (int) $c['id'], 'title' => $c['title'], 'price_cents' => (int) $c['price_cents'],
                'capacity' => (int) $c['capacity'], 'is_active' => (bool) $c['is_active'],
            ], $classes)),
            'weeks_ahead' => WeeklySchedule::WEEKS,
            'cancelled_with_bookings' => $cancelled,
        ];
    }

    public function show(Request $r): Response
    {
        WeeklySchedule::sync();
        return Response::json($this->payload());
    }

    /**
     * PUT /admin/weekly { days: [{ weekday: 1, is_open: true,
     *   slots: [{ id?, class_id, time: "18:00", price_cents|null, price_period: "session"|"month", capacity|null }] }] }
     * Guarda la semana entera: las clases que no vengan se quitan.
     */
    public function update(Request $r): Response
    {
        $days = $r->input('days');
        if (!is_array($days)) {
            throw HttpError::validation(['days' => 'Falta la semana']);
        }
        $db = Database::get();
        $groupIds = array_map('intval', array_column($db->all("SELECT id FROM classes WHERE kind = 'group'"), 'id'));
        $existing = array_column(WeeklySchedule::slots(), null, 'id');
        $errors = [];
        $open = [];
        $slots = [];
        foreach (array_values($days) as $i => $day) {
            $v = new Validator(is_array($day) ? $day : []);
            $weekday = $v->int('weekday', true, 1, 7);
            $isOpen = $v->bool('is_open') ?? true;
            if ($v->errors() || $weekday === null) {
                $errors["days.$i"] = 'Día no válido';
                continue;
            }
            $open[$weekday] = $isOpen;
            foreach (array_values(is_array($day['slots'] ?? null) ? $day['slots'] : []) as $j => $slot) {
                $key = "days.$i.slots.$j";
                $sv = new Validator(is_array($slot) ? $slot : []);
                $classId = $sv->int('class_id', true, 1);
                $time = is_string($slot['time'] ?? null) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $slot['time']) ? $slot['time'] : null;
                $period = $sv->enum('price_period', ['session', 'month'], false) ?? 'session';
                $price = ($slot['price_cents'] ?? null) === null || $slot['price_cents'] === '' ? null : $sv->int('price_cents', false, 0, 10_000_000);
                $capacity = ($slot['capacity'] ?? null) === null || $slot['capacity'] === '' ? null : $sv->int('capacity', false, 1, 100);
                $id = isset($slot['id']) && isset($existing[(int) $slot['id']]) ? (int) $slot['id'] : null;
                if (!$classId || !in_array($classId, $groupIds, true)) {
                    $errors["$key.class_id"] = 'Elige una clase';
                } elseif ($time === null) {
                    $errors["$key.time"] = 'Pon la hora (p. ej. 18:00)';
                } elseif ($sv->errors()) {
                    $errors[$key] = implode(' ', $sv->errors());
                } else {
                    $slots[] = compact('id', 'weekday', 'classId', 'time', 'period', 'price', 'capacity');
                }
            }
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }

        $cancelled = $db->transaction(static function (Database $db) use ($open, $slots, $existing) {
            foreach ($open as $weekday => $isOpen) {
                $db->exec('INSERT INTO weekly_days (weekday, is_open) VALUES (?, ?) ON DUPLICATE KEY UPDATE is_open = VALUES(is_open)', [$weekday, (int) $isOpen]);
            }
            $keep = [];
            foreach ($slots as $s) {
                $data = [
                    'weekday' => $s['weekday'], 'class_id' => $s['classId'], 'start_time' => $s['time'] . ':00',
                    'price_cents' => $s['price'], 'price_period' => $s['period'], 'capacity' => $s['capacity'],
                ];
                $old = $s['id'] ? $existing[$s['id']] : null;
                // Otra clase en la misma fila es otra clase semanal: la anterior se quita
                if ($old && (int) $old['class_id'] === $s['classId']) {
                    if ((int) $old['weekday'] !== $s['weekday'] || substr((string) $old['start_time'], 0, 5) !== $s['time']) {
                        WeeklySchedule::move($s['id'], $s['weekday'], $s['time']);
                    }
                    $db->update('weekly_slots', $data, 'id = :id', ['id' => $s['id']]);
                    $keep[] = $s['id'];
                } else {
                    $keep[] = $db->insert('weekly_slots', $data);
                }
            }
            $gone = array_diff(array_map('intval', array_keys($existing)), $keep);
            if ($gone) {
                $db->exec('DELETE FROM weekly_slots WHERE id IN (' . implode(',', $gone) . ')');
            }
            return WeeklySchedule::sync();
        });
        return Response::json($this->payload($cancelled));
    }
}
