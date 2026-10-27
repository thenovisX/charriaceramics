<?php
declare(strict_types=1);

namespace Charria\Controllers;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Catalog;
use Charria\Services\Consents;
use Charria\Services\Customers;
use Charria\Services\Fulfillment;
use Charria\Services\Mailer;
use Charria\Services\Messages;
use Charria\Services\RateLimiter;
use Charria\Services\Settings;
use Charria\Services\Stripe;
use Charria\Validator;

/**
 * Reservas públicas.
 * - Clases en grupo: se reservan plazas de un horario concreto y se pagan con Stripe.
 *   Las plazas quedan retenidas mientras se paga (CHECKOUT_HOLD_MINUTES).
 *   Cada clase activa por separado: pago único online (pay_online), suscripción mensual
 *   de Stripe (pay_subscription, cuota monthly_price_cents) y pagar en el taller.
 *   Si la clase lo admite (pay_in_person) se puede elegir pagar en el taller: la
 *   reserva queda confirmada sin caducidad y el panel la marca como pagada al cobrarla.
 * - Clases privadas: se envía una solicitud (fecha y franja preferidas) y el estudio
 *   la confirma desde el panel.
 */
final class BookingController
{
    /** POST /bookings { session_id, seats, payment_method: online|subscription|in_person, customer: {name, email, phone}, consents: {terms, marketing, profile} } */
    public function createGroup(Request $r): Response
    {
        $v = new Validator($r->body());
        $method = $v->enum('payment_method', ['online', 'subscription', 'in_person']) ?? 'online';
        $inPerson = $method === 'in_person';
        $subscription = $method === 'subscription';
        if (!$inPerson && !Stripe::isConfigured()) {
            throw new HttpError(503, 'payments_unavailable', 'Las reservas online aún no están activas. Escríbenos para reservar.');
        }
        RateLimiter::hit('booking:' . $r->ip, 15, 600);
        if ($inPerson) {
            // Sin pago no hay nada que frene a quien aparta plazas por diversión
            RateLimiter::hit('booking-in-person:' . $r->ip, 5, 3600);
        }
        $sessionId = $v->int('session_id', true, 1);
        $seats = $v->int('seats', true, 1, 10);
        $customer = Customers::validate($v);
        $consents = Consents::validate($v);
        $v->check();

        $db = Database::get();
        $hold = Settings::holdMinutes();
        $booking = $db->transaction(static function (Database $db) use ($sessionId, $seats, $customer, $hold, $consents, $r, $inPerson, $subscription, $method) {
            // Bloquea el horario para que dos personas no se lleven la última plaza a la vez
            $session = $db->one('SELECT * FROM class_sessions WHERE id = ? FOR UPDATE', [$sessionId]);
            // Una clase oculta solo se reserva en sus fechas de «Semanales»
            $class = $session ? $db->one("SELECT * FROM classes WHERE id = ? AND kind = 'group' AND (is_active = 1 OR ? IS NOT NULL)", [$session['class_id'], $session['slot_id'] ?? null]) : null;
            if (!$session || !$class || $session['is_cancelled'] || strtotime($session['starts_at']) <= time()) {
                throw HttpError::notFound('Este horario ya no está disponible');
            }
            // Clase semanal «por mes»: su precio es la cuota mensual, sea cual sea la forma de pago
            $monthly = !empty($session['slot_id'])
                && $db->value("SELECT 1 FROM weekly_slots WHERE id = ? AND price_period = 'month'", [$session['slot_id']]);
            $allowed = match ($method) {
                'in_person' => $class['pay_in_person'],
                'subscription' => $class['pay_subscription'] && ($monthly || (int) $class['monthly_price_cents'] > 0),
                default => $class['pay_online'],
            };
            if (!$allowed) {
                throw HttpError::validation(['payment_method' => 'Esta forma de pago no está disponible para esta clase']);
            }
            $info = Catalog::session($session, $class, Catalog::seatsTaken([$session['id']]));
            // La suscripción cobra la cuota mensual de la clase; lo demás, el precio de este horario
            $unit = $subscription && !$monthly ? (int) $class['monthly_price_cents'] : $info['price_cents'];
            if ($info['seats_left'] < $seats) {
                throw new HttpError(409, 'not_enough_seats', $info['seats_left']
                    ? "Solo quedan {$info['seats_left']} plazas en este horario"
                    : 'Este horario está completo');
            }
            $reference = Settings::reference('CL');
            $customerId = Customers::fromConsents($customer, $consents);
            $id = $db->insert('bookings', [
                'reference' => $reference,
                'class_id' => $class['id'],
                'session_id' => $session['id'],
                'customer_id' => $customerId,
                'customer_name' => $customer['name'],
                'customer_email' => $customer['email'],
                'customer_phone' => $customer['phone'],
                'class_title' => $class['title'],
                'starts_at' => $session['starts_at'],
                'seats' => $seats,
                'unit_price_cents' => $unit,
                'total_cents' => $unit * $seats,
                'payment_method' => $method,
                // En el taller la plaza queda guardada ya; online, solo mientras se paga
                'status' => $inPerson ? 'confirmed' : 'pending_payment',
                'expires_at' => $inPerson ? null : date('Y-m-d H:i:s', time() + $hold * 60),
            ]);
            Consents::recordAll($customer['email'], $consents, 'booking', $r, ['customer_id' => $customerId, 'booking_id' => $id]);
            return ['id' => $id, 'reference' => $reference, 'class' => $class, 'session' => $session, 'price' => $unit];
        });

        if ($inPerson) {
            Fulfillment::bookingConfirmedEmails($db->one('SELECT * FROM bookings WHERE id = ?', [$booking['id']]));
            return Response::created([
                'reference' => $booking['reference'],
                'total_cents' => $booking['price'] * $seats,
                'status' => 'confirmed',
                'payment_method' => 'in_person',
                'confirmation_url' => Fulfillment::bookingUrl($booking['reference']),
            ]);
        }

        $base = Settings::appUrl();
        $when = date('d/m/Y H:i', strtotime($booking['session']['starts_at']));
        try {
            $stripe = Stripe::createCheckoutSession([
                'type' => 'booking',
                'subscription' => $subscription,
                'reference' => $booking['reference'],
                'email' => $customer['email'],
                'lines' => [[
                    'name' => $subscription ? "{$booking['class']['title']} · cuota mensual (desde $when)" : "{$booking['class']['title']} · $when",
                    'unit_amount' => $booking['price'],
                    'quantity' => $seats,
                ]],
                // Al pagar, Stripe vuelve a la página «Reserva confirmada» con todos los datos
                'success_url' => $base . '/reserva.html?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => $base . '/index.html?pago=cancelado#clases',
                'expires_at' => time() + $hold * 60,
            ]);
        } catch (\Throwable $e) {
            $db->exec("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [$booking['id']]);
            throw $e;
        }
        $db->update('bookings', ['stripe_session_id' => $stripe['id']], 'id = :id', ['id' => $booking['id']]);

        return Response::created([
            'reference' => $booking['reference'],
            'total_cents' => $booking['price'] * $seats,
            'payment_method' => $method,
            'checkout_url' => $stripe['url'],
        ]);
    }

    /** POST /bookings/private { class_id, preferred_date, preferred_slot, customer: {name, email, phone}, notes, consents } */
    public function createPrivate(Request $r): Response
    {
        RateLimiter::hit('private:' . $r->ip, 8, 600);
        $v = new Validator($r->body());
        $classId = $v->int('class_id', true, 1);
        $date = $v->date('preferred_date', true);
        $slot = $v->enum('preferred_slot', ['Mañana', 'Tarde'], true);
        $notes = $v->string('notes', false, 1000);
        $customer = Customers::validate($v);
        $consents = Consents::validate($v);
        if ($date && $date < date('Y-m-d')) {
            $v->addError('preferred_date', 'Elige una fecha a partir de hoy');
        }
        $v->check();

        $db = Database::get();
        $class = $db->one("SELECT * FROM classes WHERE id = ? AND kind = 'private' AND is_active = 1", [$classId]);
        if (!$class) {
            throw HttpError::validation(['class_id' => 'Modalidad no disponible']);
        }
        $reference = Settings::reference('CP');
        $customerId = Customers::fromConsents($customer, $consents);
        $id = $db->insert('bookings', [
            'reference' => $reference,
            'class_id' => $class['id'],
            'customer_id' => $customerId,
            'customer_name' => $customer['name'],
            'customer_email' => $customer['email'],
            'customer_phone' => $customer['phone'],
            'class_title' => $class['title'],
            'seats' => 1,
            'unit_price_cents' => $class['price_cents'],
            'total_cents' => $class['price_cents'],
            'payment_method' => 'in_person',
            'status' => 'requested',
            'preferred_date' => $date,
            'preferred_slot' => $slot,
            'notes' => $notes,
        ]);
        Consents::recordAll($customer['email'], $consents, 'private_booking', $r, ['customer_id' => $customerId, 'booking_id' => $id]);
        Messages::record('private_class', $class['title'], $customer,
            "Fecha preferida: $date ($slot)" . ($notes ? "\n\n$notes" : ''), $id);
        Mailer::admin("Solicitud de clase privada $reference",
            "{$class['title']} · " . Mailer::money((int) $class['price_cents']) . "\nFecha preferida: $date ($slot)\n"
            . "Cliente: {$customer['name']} <{$customer['email']}> {$customer['phone']}\n\n" . ($notes ?? ''));
        Mailer::send($customer['email'], 'Hemos recibido tu solicitud · Charria Ceramics',
            "Hola {$customer['name']},\n\nGracias por tu interés en la clase privada ({$class['title']}).\nTe escribiremos en menos de 24 h para confirmar la fecha.\nLa clase se paga en el taller, en efectivo, con tarjeta o por Bizum.\n\nTu solicitud: " . Fulfillment::bookingUrl($reference) . "\n\nCharria Ceramics");

        return Response::created(['reference' => $reference, 'status' => 'requested', 'confirmation_url' => Fulfillment::bookingUrl($reference)]);
    }

    /**
     * GET /bookings/confirmation?session_id=cs_…  (al volver de Stripe)
     *     /bookings/confirmation?ref=CL-…&t=…     (pago en el taller, clase privada y enlace del email)
     * Datos de la página «Reserva confirmada» (reserva.html). Sin el id de Stripe o la firma
     * del enlace no se enseña nada: la referencia sola no basta para ver nombre y email.
     */
    public function confirmation(Request $r): Response
    {
        RateLimiter::hit('booking-view:' . $r->ip, 60, 600);
        $db = Database::get();
        $sessionId = (string) ($r->query['session_id'] ?? '');
        $reference = (string) ($r->query['ref'] ?? '');
        if ($sessionId !== '') {
            if (!preg_match('/^cs_[A-Za-z0-9_]{10,250}$/', $sessionId)) {
                throw HttpError::notFound('No encontramos esta reserva');
            }
            $find = static fn () => $db->one('SELECT * FROM bookings WHERE stripe_session_id = ?', [$sessionId]);
            $b = $find();
            if ($b && $b['status'] === 'pending_payment') {
                // Si el webhook aún no ha llegado, se pregunta a Stripe (servidor a servidor)
                try {
                    Fulfillment::paid(Stripe::retrieveCheckoutSession($sessionId));
                    $b = $find();
                } catch (HttpError) {
                    // Stripe no disponible: se muestra el estado actual
                }
            }
        } else {
            $ok = preg_match('/^C[LP]-[A-Z0-9]{8}$/', $reference)
                && hash_equals(Fulfillment::bookingToken($reference), (string) ($r->query['t'] ?? ''));
            $b = $ok ? $db->one('SELECT * FROM bookings WHERE reference = ?', [$reference]) : null;
        }
        if (!$b) {
            throw HttpError::notFound('No encontramos esta reserva');
        }
        $class = $db->one('SELECT duration_minutes FROM classes WHERE id = ?', [$b['class_id']]);
        $starts = $b['starts_at'] ? strtotime($b['starts_at']) : null;
        $method = $b['payment_method'] ?: 'online';
        $confirmed = $b['status'] === 'confirmed';
        $minutes = (int) ($class['duration_minutes'] ?? 0);
        return Response::json([
            'reference' => $b['reference'],
            'kind' => $b['session_id'] ? 'group' : 'private',
            'status' => $b['status'],
            'confirmed' => $confirmed,
            'payment_method' => $method,
            // En el taller se paga el día de la clase; online, la plaza solo se confirma al pagar
            'paid' => $method === 'in_person' ? $b['paid_at'] !== null : $confirmed,
            'class_title' => $b['class_title'],
            'starts_at' => $starts ? date('Y-m-d\TH:i:s', $starts) : null,
            'ends_at' => $starts && $minutes ? date('Y-m-d\TH:i:s', $starts + $minutes * 60) : null,
            'duration_minutes' => $minutes ?: null,
            'preferred_date' => $b['preferred_date'],
            'preferred_slot' => $b['preferred_slot'],
            'seats' => (int) $b['seats'],
            'unit_price_cents' => (int) $b['unit_price_cents'],
            'total_cents' => (int) $b['total_cents'],
            'customer' => ['name' => $b['customer_name'], 'email' => $b['customer_email'], 'phone' => $b['customer_phone']],
            'created_at' => date('Y-m-d\TH:i:s', strtotime($b['created_at'])),
            'link' => Fulfillment::bookingUrl($b['reference']),
            'studio' => [
                'address' => Env::get('SITE_ADDRESS'),
                'city' => Env::get('SITE_CITY'),
                'maps_url' => Env::get('SITE_MAPS_URL'),
                'email' => Env::get('SITE_EMAIL'),
                'phone' => Env::get('SITE_PHONE'),
            ],
        ]);
    }
}
