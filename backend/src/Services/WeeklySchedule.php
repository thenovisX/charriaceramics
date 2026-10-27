<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;

/**
 * Clases semanales: en el panel se dice, para cada día de la semana, si sale en la
 * web y qué clases hay a qué hora y precio (weekly_days + weekly_slots). Las fechas
 * que se reservan siguen siendo class_sessions (con slot_id), así las plazas, los
 * pagos, el calendario y los emails funcionan igual que con una fecha suelta.
 * sync() crea las de las próximas WEEKS semanas y se llama al pedir las clases:
 * no hace falta cron, cada semana nueva aparece sola.
 */
final class WeeklySchedule
{
    public const WEEKS = 8;
    public const DAYS = [1 => 'Lunes', 2 => 'Martes', 3 => 'Miércoles', 4 => 'Jueves', 5 => 'Viernes', 6 => 'Sábado', 7 => 'Domingo'];

    /** weekday => abierto. Un día sin fila cuenta como abierto. */
    public static function days(): array
    {
        $open = array_fill_keys(array_keys(self::DAYS), true);
        foreach (Database::get()->all('SELECT weekday, is_open FROM weekly_days') as $d) {
            $open[(int) $d['weekday']] = (bool) $d['is_open'];
        }
        return $open;
    }

    public static function slots(): array
    {
        return Database::get()->all('SELECT * FROM weekly_slots ORDER BY weekday, start_time, id');
    }

    public static function presentSlot(array $s, ?array $class = null): array
    {
        return [
            'id' => (int) $s['id'],
            'weekday' => (int) $s['weekday'],
            'class_id' => (int) $s['class_id'],
            'time' => substr((string) $s['start_time'], 0, 5),
            'price_cents' => $s['price_cents'] === null ? ($class ? (int) $class['price_cents'] : null) : (int) $s['price_cents'],
            'price_override_cents' => $s['price_cents'] === null ? null : (int) $s['price_cents'],
            'price_period' => $s['price_period'],
            'capacity' => $s['capacity'] === null ? ($class ? (int) $class['capacity'] : null) : (int) $s['capacity'],
            'capacity_override' => $s['capacity'] === null ? null : (int) $s['capacity'],
        ];
    }

    /**
     * Para la web: los días abiertos con sus clases (solo clases en grupo visibles).
     * [{weekday, name, slots: [{id, class_id, time, price_cents, price_period, capacity}]}]
     */
    public static function forWeb(): array
    {
        $db = Database::get();
        $open = self::days();
        $classes = array_column($db->all("SELECT * FROM classes WHERE kind = 'group' AND is_active = 1"), null, 'id');
        $out = [];
        foreach (self::slots() as $s) {
            $class = $classes[$s['class_id']] ?? null;
            if (!$class || !$open[(int) $s['weekday']]) {
                continue;
            }
            $out[(int) $s['weekday']] ??= ['weekday' => (int) $s['weekday'], 'name' => self::DAYS[(int) $s['weekday']], 'slots' => []];
            $out[(int) $s['weekday']]['slots'][] = self::presentSlot($s, $class);
        }
        ksort($out);
        return array_values($out);
    }

    /** Próxima fecha (desde mañana si hoy ya pasó la hora) de un día de la semana y hora. */
    private static function occurrences(int $weekday, string $time, \DateTimeImmutable $now): array
    {
        [$h, $m] = array_map('intval', explode(':', $time));
        $first = $now->setTime($h, $m);
        $first = $first->modify('+' . (($weekday - (int) $first->format('N') + 7) % 7) . ' days');
        if ($first <= $now) {
            $first = $first->modify('+1 week');
        }
        $dates = [];
        for ($i = 0; $i < self::WEEKS; $i++) {
            $dates[] = $first->modify("+$i week")->format('Y-m-d H:i:s');
        }
        return $dates;
    }

    /**
     * Deja las fechas futuras al día con lo configurado:
     * - crea las que falten de cada clase de un día abierto (no vuelve a crear una
     *   que se canceló a mano, p. ej. un festivo);
     * - pone el precio y las plazas actuales en las que vienen (las reservas hechas
     *   guardan su precio);
     * - las de un día cerrado o una clase quitada se borran si no tienen reservas y,
     *   si las tienen, se cancelan (no admiten más) y se conservan con sus reservas.
     * Devuelve cuántas fechas con reservas se han cancelado así.
     */
    public static function sync(): int
    {
        $db = Database::get();
        $now = new \DateTimeImmutable();
        $open = self::days();
        $classes = array_column($db->all("SELECT id, kind FROM classes WHERE kind = 'group'"), null, 'id');
        $active = [];
        foreach (self::slots() as $s) {
            if ($open[(int) $s['weekday']] && isset($classes[$s['class_id']])) {
                $active[(int) $s['id']] = $s;
            }
        }

        foreach ($active as $id => $s) {
            foreach (self::occurrences((int) $s['weekday'], (string) $s['start_time'], $now) as $at) {
                // La clave única (slot_id, starts_at) evita duplicados si llegan dos peticiones a la vez
                $db->exec(
                    'INSERT IGNORE INTO class_sessions (class_id, starts_at, label, price_cents, capacity, slot_id) VALUES (?, ?, \'\', ?, ?, ?)',
                    [$s['class_id'], $at, $s['price_cents'], $s['capacity'], $id]
                );
            }
            $db->exec(
                'UPDATE class_sessions SET class_id = ?, price_cents = ?, capacity = ? WHERE slot_id = ? AND starts_at > NOW()',
                [$s['class_id'], $s['price_cents'], $s['capacity'], $id]
            );
        }

        $stale = $db->all(
            'SELECT cs.id, EXISTS(SELECT 1 FROM bookings b WHERE b.session_id = cs.id AND b.status IN (\'confirmed\',\'pending_payment\',\'requested\')) AS booked
             FROM class_sessions cs
             WHERE cs.slot_id IS NOT NULL AND cs.starts_at > NOW() AND cs.is_cancelled = 0'
            . ($active ? ' AND cs.slot_id NOT IN (' . implode(',', array_keys($active)) . ')' : '')
        );
        $kept = 0;
        foreach ($stale as $row) {
            if ($row['booked']) {
                $db->exec('UPDATE class_sessions SET is_cancelled = 1 WHERE id = ?', [$row['id']]);
                $kept++;
            } else {
                $db->exec('DELETE FROM class_sessions WHERE id = ?', [$row['id']]);
            }
        }
        return $kept;
    }

    /**
     * Si una clase cambia de día u hora, sus fechas futuras se mueven dentro de la
     * misma semana (y las reservas con ellas) en lugar de perderse.
     */
    public static function move(int $slotId, int $weekday, string $time): void
    {
        $db = Database::get();
        [$h, $m] = array_map('intval', explode(':', $time));
        $now = new \DateTimeImmutable();
        foreach ($db->all('SELECT id, starts_at FROM class_sessions WHERE slot_id = ? AND starts_at > NOW() ORDER BY starts_at DESC', [$slotId]) as $s) {
            $old = new \DateTimeImmutable($s['starts_at']);
            $new = $old->modify('-' . ((int) $old->format('N') - 1) . ' days')->modify('+' . ($weekday - 1) . ' days')->setTime($h, $m);
            $at = $new->format('Y-m-d H:i:s');
            if ($new <= $now || $db->value('SELECT 1 FROM class_sessions WHERE slot_id = ? AND starts_at = ? AND id <> ?', [$slotId, $at, $s['id']])) {
                // Ya pasó o choca con otra fecha: se queda fuera del horario y sync() la limpia
                $db->exec('UPDATE class_sessions SET slot_id = NULL WHERE id = ?', [$s['id']]);
                if (!$db->value("SELECT 1 FROM bookings WHERE session_id = ? AND status IN ('confirmed','pending_payment','requested')", [$s['id']])) {
                    $db->exec('DELETE FROM class_sessions WHERE id = ?', [$s['id']]);
                } else {
                    $db->exec('UPDATE class_sessions SET is_cancelled = 1 WHERE id = ?', [$s['id']]);
                }
                continue;
            }
            $db->exec('UPDATE class_sessions SET starts_at = ? WHERE id = ?', [$at, $s['id']]);
            $db->exec('UPDATE bookings SET starts_at = ? WHERE session_id = ?', [$at, $s['id']]);
        }
    }
}
