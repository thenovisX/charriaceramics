<?php
declare(strict_types=1);

namespace Charria\Controllers\Admin;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Catalog;
use Charria\Services\ImageProcessor;
use Charria\Services\Messages;
use Charria\Validator;

/** Clases, horarios (sesiones) y precios desde el panel. */
final class ClassAdminController
{
    private function findClass(int $id): array
    {
        $row = Database::get()->one('SELECT * FROM classes WHERE id = ?', [$id]);
        if (!$row) {
            throw HttpError::notFound('Clase no encontrada');
        }
        return $row;
    }

    private function present(int $id): array
    {
        return Catalog::classes([$this->findClass($id)], true)[0];
    }

    private function validateClass(array $body, bool $creating): array
    {
        $v = new Validator($body);
        $data = array_filter([
            'title' => $v->string('title', $creating, 160, 2),
            'kind' => $v->enum('kind', ['group', 'private'], $creating),
            'description' => $v->string('description', false, 5000),
            'duration_minutes' => $v->int('duration_minutes', false, 15, 6000),
            'price_cents' => $v->int('price_cents', $creating, 0, 10_000_000),
            'capacity' => $v->int('capacity', false, 1, 100),
            'pay_in_person' => ($b = $v->bool('pay_in_person')) === null ? null : (int) $b,
            'pay_online' => ($b = $v->bool('pay_online')) === null ? null : (int) $b,
            'pay_subscription' => ($b = $v->bool('pay_subscription')) === null ? null : (int) $b,
            'monthly_price_cents' => $v->has('monthly_price_cents') && ($body['monthly_price_cents'] === null || $body['monthly_price_cents'] === '')
                ? null : $v->int('monthly_price_cents', false, 0, 10_000_000),
            'price_period' => $v->enum('price_period', ['session', 'month'], false) ?: null,
            'show_date' => ($b = $v->bool('show_date')) === null ? null : (int) $b,
            'is_active' => ($b = $v->bool('is_active')) === null ? null : (int) $b,
            'sort_order' => $v->int('sort_order', false, -1000, 1000),
        ], static fn ($x) => $x !== null);
        // monthly_price_cents puede ser null a propósito (sin cuota): el filtro de arriba lo quitaría
        if ($v->has('monthly_price_cents') && ($body['monthly_price_cents'] === null || $body['monthly_price_cents'] === '')) {
            $data['monthly_price_cents'] = null;
        }
        $v->check();
        return $data;
    }

    /** Una clase en grupo necesita al menos una forma de pago, y la suscripción una cuota mensual. */
    private function checkPayments(array $class): void
    {
        if ($class['kind'] !== 'group') {
            return;
        }
        $errors = [];
        if (!$class['pay_online'] && !$class['pay_subscription'] && !$class['pay_in_person']) {
            $errors['pay_online'] = 'Activa al menos una forma de pago';
        }
        if ($class['pay_subscription'] && (int) $class['monthly_price_cents'] <= 0) {
            $errors['monthly_price_cents'] = 'Indica la cuota mensual de la suscripción';
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }
    }

    public function index(Request $r): Response
    {
        $rows = Database::get()->all('SELECT * FROM classes ORDER BY kind, sort_order, id');
        return Response::json(Catalog::classes($rows, true));
    }

    public function store(Request $r): Response
    {
        $data = $this->validateClass($r->body(), true);
        $db = Database::get();
        $base = Validator::slugify($data['title']);
        $slug = $base;
        for ($i = 2; $db->value('SELECT id FROM classes WHERE slug = ?', [$slug]); $i++) {
            $slug = "$base-$i";
        }
        $this->checkPayments($data + ['pay_online' => 1, 'pay_subscription' => 0, 'pay_in_person' => 1, 'monthly_price_cents' => null]);
        $id = $db->insert('classes', $data + ['slug' => $slug]);
        return Response::created($this->present($id));
    }

    public function update(Request $r): Response
    {
        $id = $r->intParam('id');
        $class = $this->findClass($id);
        $data = $this->validateClass($r->body(), false);
        $this->checkPayments($data + $class);
        Database::get()->update('classes', $data, 'id = :id', ['id' => $id]);
        return Response::json($this->present($id));
    }

    /** Borra la clase y sus horarios. Las reservas existentes se conservan (con el título copiado). */
    public function destroy(Request $r): Response
    {
        $id = $r->intParam('id');
        $class = $this->findClass($id);
        Database::get()->exec('DELETE FROM classes WHERE id = ?', [$id]);
        if ($class['image_id']) {
            ImageProcessor::delete((int) $class['image_id']);
        }
        return Response::noContent();
    }

    /** POST /admin/classes/{id}/image (multipart: image, crop=1) — sustituye la foto de la clase */
    public function uploadImage(Request $r): Response
    {
        $id = $r->intParam('id');
        $class = $this->findClass($id);
        $image = ImageProcessor::store($r->files['image'] ?? null, 'class', $class['title'], filter_var($r->post['crop'] ?? false, FILTER_VALIDATE_BOOLEAN));
        Database::get()->exec('UPDATE classes SET image_id = ? WHERE id = ?', [$image['id'], $id]);
        if ($class['image_id']) {
            ImageProcessor::delete((int) $class['image_id']);
        }
        return Response::json($this->present($id));
    }

    /* ---------------- Horarios ---------------- */

    private function validateSession(array $body, bool $creating): array
    {
        $v = new Validator($body);
        $data = [
            'class_id' => $v->int('class_id', $creating, 1),
            'starts_at' => $v->datetime('starts_at', $creating),
            'label' => $v->string('label', false, 120),
            'is_cancelled' => ($b = $v->bool('is_cancelled')) === null ? null : (int) $b,
        ];
        // price_cents / capacity: null o "" = usar los de la clase
        foreach (['price_cents' => [0, 10_000_000], 'capacity' => [1, 100]] as $field => [$min, $max]) {
            if ($v->has($field)) {
                $data[$field] = ($body[$field] === null || $body[$field] === '') ? null : $v->int($field, false, $min, $max);
            }
        }
        $v->check();
        $data = array_filter($data, static fn ($x, $k) => $x !== null || in_array($k, ['price_cents', 'capacity'], true), ARRAY_FILTER_USE_BOTH);
        if (isset($data['class_id']) && !Database::get()->value("SELECT 1 FROM classes WHERE id = ? AND kind = 'group'", [$data['class_id']])) {
            throw HttpError::validation(['class_id' => 'Los horarios solo se crean para clases en grupo']);
        }
        return $data;
    }

    private function presentSession(int $id): array
    {
        $db = Database::get();
        $s = $db->one('SELECT * FROM class_sessions WHERE id = ?', [$id]);
        if (!$s) {
            throw HttpError::notFound('Horario no encontrado');
        }
        return Catalog::session($s, $this->findClass((int) $s['class_id']), Catalog::seatsTaken([$id]));
    }

    /** POST /admin/sessions { class_id, starts_at, label, price_cents?, capacity? } */
    /**
     * POST /admin/sessions { ..., repeat_weeks: 12 }
     * Con repeat_weeks se crea el mismo horario cada semana (mismo día y hora),
     * cada uno con sus propias plazas: así se reserva una semana concreta.
     */
    public function storeSession(Request $r): Response
    {
        $body = $r->body();
        $v = new Validator($body);
        $weeks = $v->int('repeat_weeks', false, 1, 52) ?? 1;
        $v->check();
        $data = $this->validateSession($body, true);
        $db = Database::get();
        $ids = $db->transaction(function () use ($db, $data, $weeks) {
            $start = new \DateTimeImmutable($data['starts_at']);
            $ids = [];
            for ($i = 0; $i < $weeks; $i++) {
                $ids[] = $db->insert('class_sessions', ['starts_at' => $start->modify("+$i week")->format('Y-m-d H:i:s')] + $data);
            }
            return $ids;
        });
        $first = $this->presentSession($ids[0]);
        return Response::created($first + ['created' => count($ids)]);
    }

    public function updateSession(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->presentSession($id);
        Database::get()->update('class_sessions', $this->validateSession($r->body(), false), 'id = :id', ['id' => $id]);
        return Response::json($this->presentSession($id));
    }

    /** Un horario con reservas confirmadas no se borra: se cancela (is_cancelled) para no perder el historial. */
    public function destroySession(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->presentSession($id);
        $db = Database::get();
        if ($db->value("SELECT 1 FROM bookings WHERE session_id = ? AND status IN ('confirmed','pending_payment') LIMIT 1", [$id])) {
            throw new HttpError(409, 'session_has_bookings', 'Este horario tiene reservas. Márcalo como cancelado en lugar de borrarlo.');
        }
        $db->exec('DELETE FROM class_sessions WHERE id = ?', [$id]);
        return Response::noContent();
    }

    /* ---------------- Reservas ---------------- */

    /** GET /admin/bookings?status=confirmed&upcoming=1 (status=unpaid: para pagar en el taller y aún sin cobrar, o suscripciones con la cuota del mes sin pagar) */
    public function bookings(Request $r): Response
    {
        $where = ['1 = 1'];
        $params = [];
        $status = $r->query['status'] ?? '';
        if (in_array($status, ['requested', 'pending_payment', 'confirmed', 'cancelled'], true)) {
            $where[] = 'b.status = ?';
            $params[] = $status;
        } elseif ($status === 'unpaid') {
            $where[] = "b.status = 'confirmed' AND b.paid_at IS NULL AND (b.payment_method = 'in_person' OR (b.payment_method = 'subscription' AND b.subscription_status = 'past_due'))";
        }
        if (!empty($r->query['session_id']) && ctype_digit((string) $r->query['session_id'])) {
            $where[] = 'b.session_id = ?';
            $params[] = (int) $r->query['session_id'];
        }
        if (!empty($r->query['upcoming'])) {
            $where[] = '(b.starts_at IS NULL OR b.starts_at >= CURDATE())';
        }
        $rows = Database::get()->all(
            'SELECT b.* FROM bookings b
             WHERE ' . implode(' AND ', $where) . ' ORDER BY COALESCE(b.starts_at, b.preferred_date, b.created_at) DESC LIMIT 500',
            $params
        );
        return Response::json(array_map([self::class, 'booking'], $rows));
    }

    /**
     * PATCH /admin/bookings/{id} { status, notes, starts_at, paid } — confirmar o cancelar (p. ej. una clase privada)
     * y, en las que se pagan en el taller, marcarlas como cobradas (paid: true) o deshacerlo (paid: false).
     */
    public function updateBooking(Request $r): Response
    {
        $id = $r->intParam('id');
        $db = Database::get();
        $booking = $db->one('SELECT * FROM bookings WHERE id = ?', [$id]);
        if (!$booking) {
            throw HttpError::notFound('Reserva no encontrada');
        }
        $v = new Validator($r->body());
        $data = array_filter([
            'status' => $v->enum('status', ['requested', 'confirmed', 'cancelled']),
            'notes' => $v->string('notes', false, 2000),
            'starts_at' => $v->datetime('starts_at'),
            'billing_type' => $v->enum('billing_type', ['single', 'subscription']),
        ], static fn ($x) => $x !== null);
        $paid = $v->bool('paid');
        if ($paid !== null && $booking['payment_method'] !== 'in_person') {
            $v->addError('paid', 'Las reservas pagadas online se confirman solas con Stripe');
        }
        $v->check();
        if ($paid !== null) {
            // Una suscripción se cobra cada mes: «cobrada» renueva la fecha salvo que ya conste este mes
            $keep = $booking['paid_at'] && ($booking['billing_type'] !== 'subscription' || $booking['paid_at'] >= date('Y-m-01'));
            $data['paid_at'] = $paid ? ($keep ? $booking['paid_at'] : date('Y-m-d H:i:s')) : null;
            $data['payment_alert_at'] = null;
        }
        $db->update('bookings', $data, 'id = :id', ['id' => $id]);
        if (in_array($data['status'] ?? null, ['confirmed', 'cancelled'], true)) {
            Messages::handleBooking($id);
        }
        $row = $db->one(
            'SELECT * FROM bookings WHERE id = ?',
            [$id]
        );
        return Response::json(self::booking($row));
    }

    public static function booking(array $b): array
    {
        return [
            'id' => (int) $b['id'],
            'reference' => $b['reference'],
            'status' => $b['status'],
            'class_id' => $b['class_id'] ? (int) $b['class_id'] : null,
            'session_id' => $b['session_id'] ? (int) $b['session_id'] : null,
            'class_title' => $b['class_title'],
            'starts_at' => $b['starts_at'],
            'preferred_date' => $b['preferred_date'],
            'preferred_slot' => $b['preferred_slot'],
            'seats' => (int) $b['seats'],
            'total_cents' => (int) $b['total_cents'],
            'payment_method' => $b['payment_method'] ?? 'online',
            'billing_type' => $b['billing_type'] ?? 'single',
            'source' => $b['source'] ?? 'web',
            'subscription_status' => (string) ($b['subscription_status'] ?? ''),
            'paid_until' => $b['paid_until'] ?? null,
            'notes' => (string) $b['notes'],
            'customer' => ['name' => $b['customer_name'], 'email' => $b['customer_email'], 'phone' => $b['customer_phone']],
            'privacy_blocked' => !empty($b['privacy_blocked_at']),
            'paid_at' => $b['paid_at'],
            'created_at' => $b['created_at'],
        ];
    }
}
