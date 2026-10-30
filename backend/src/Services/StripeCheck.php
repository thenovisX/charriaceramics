<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Env;
use Charria\Http\HttpError;
use Charria\Http\Request;

/**
 * «Probar conexión con Stripe» (Panel → Ajustes → Pagos): repasa todo lo que hace
 * falta para cobrar y dice, en palabras sencillas, qué falla y cómo arreglarlo.
 * Cada comprobación es ['status' => ok|warn|bad, 'title', 'detail', 'fix'?].
 */
final class StripeCheck
{
    /** Eventos sin los que los pedidos y las reservas no se confirman / liberan solos */
    private const CORE_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'];
    /** Solo hacen falta si alguna clase tiene suscripción mensual */
    private const SUBSCRIPTION_EVENTS = ['invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted'];

    private array $checks = [];

    public static function run(Request $r): array
    {
        $self = new self();
        $self->all($r);
        $bad = count(array_filter($self->checks, static fn ($c) => $c['status'] === 'bad'));
        $warn = count(array_filter($self->checks, static fn ($c) => $c['status'] === 'warn'));
        return [
            'ok' => $bad === 0,
            'message' => $bad ? ($bad === 1 ? 'Hay 1 cosa que impide cobrar con Stripe' : "Hay $bad cosas que impiden cobrar con Stripe")
                : ($warn ? 'Stripe funciona, con algún aviso' : 'Stripe está bien configurado'),
            'checks' => $self->checks,
        ];
    }

    private function add(string $status, string $title, string $detail = '', ?array $fix = null): void
    {
        $this->checks[] = array_filter(['status' => $status, 'title' => $title, 'detail' => $detail, 'fix' => $fix], static fn ($v) => $v !== null && $v !== '');
    }

    private function all(Request $r): void
    {
        $key = (string) Env::get('STRIPE_SECRET_KEY');
        $live = str_contains($key, '_live_');
        $modeName = $live ? 'modo real' : 'modo prueba';

        $this->siteAddress($r);

        // 1. Clave secreta
        if ($key === '') {
            $this->add('bad', 'Falta la clave secreta de Stripe', 'Cópiala en Stripe → Desarrolladores → Claves de API («Clave secreta», empieza por sk_live_ o sk_test_) y pégala arriba.');
            return;
        }
        if (str_starts_with($key, 'rk_')) {
            $this->add('warn', 'Estás usando una clave restringida (rk_)', 'Funciona solo si tiene permiso de escritura en «Checkout Sessions» y de lectura en «Webhook endpoints». Si algo falla abajo, usa la clave secreta normal (sk_).');
        }
        try {
            $account = Stripe::request('GET', '/v1/account');
        } catch (HttpError) {
            $this->add('bad', 'Stripe rechaza la clave secreta', (Stripe::$lastError ? 'Stripe dice: «' . Stripe::$lastError . '». ' : '') . 'Vuelve a copiarla entera desde Stripe → Desarrolladores → Claves de API.');
            return;
        }
        $name = $account['settings']['dashboard']['display_name'] ?? $account['business_profile']['name'] ?? $account['email'] ?? '';
        $this->add($live ? 'ok' : 'warn', 'Clave correcta' . ($name ? " · $name" : '') . " ($modeName)",
            $live ? 'Los pagos son reales.' : 'Con una clave sk_test_ los pagos son de prueba: se paga con la tarjeta 4242 4242 4242 4242 y no se cobra nada. Para cobrar de verdad pon la clave sk_live_ (y el webhook y su secreto de modo real).');
        if ($live && (($account['charges_enabled'] ?? true) === false)) {
            $this->add('bad', 'Tu cuenta de Stripe todavía no puede cobrar', 'Entra en Stripe y termina de activar la cuenta (datos del negocio, identidad y cuenta bancaria). Hasta entonces Stripe no acepta pagos reales.');
        }

        // 2. Crear un pago de prueba igual que los de la web (se cancela al momento)
        $sessionOk = false;
        try {
            $session = Stripe::createCheckoutSession([
                'lines' => [['name' => 'Comprobación desde el panel', 'unit_amount' => 100, 'quantity' => 1]],
                'email' => null,
                'reference' => 'PRUEBA-' . date('His'),
                'type' => 'check',
                'success_url' => Settings::appUrl() . '/gracias.html?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => Settings::appUrl() . '/productos.html',
                'expires_at' => time() + Settings::holdMinutes() * 60,
            ]);
            if (!empty($session['id'])) {
                Stripe::expireCheckoutSession($session['id']);
            }
            $sessionOk = true;
            $this->add('ok', 'Stripe acepta crear pagos', 'Se ha preparado un pago de prueba de 1 € y se ha cancelado al momento (no se cobra nada).');
        } catch (HttpError) {
            $this->add('bad', 'Stripe no deja crear el pago', 'Stripe dice: «' . (Stripe::$lastError ?? 'error desconocido') . '». Es lo mismo que les pasa a los clientes al pulsar «Pagar».');
        }

        // 3. Webhook: secreto, destino en Stripe y avisos recibidos
        $expected = Settings::appUrl() . '/api/webhooks/stripe';
        if (!Env::get('STRIPE_WEBHOOK_SECRET')) {
            $this->add('bad', 'Falta el secreto del webhook (whsec_…)', 'Sin él la web no se entera de los pagos por su cuenta: los pedidos y reservas pueden quedarse «pendientes» si el cliente cierra la pestaña de Stripe. Está en Stripe → Webhooks → tu destino → «Secreto de firma».');
        }
        $this->endpoints($expected, $modeName);
        $this->deliveries();

        $last = Stripe::noted('stripe_last_error');
        if ($last && $sessionOk) {
            $this->add('warn', 'Último error de Stripe con un cliente: ' . self::when($last['at']), '«' . $last['message'] . '». Si ya lo has corregido, ignóralo.');
        }
    }

    /** La dirección guardada (APP_URL) es la que va en los enlaces de vuelta de Stripe y en el webhook */
    private function siteAddress(Request $r): void
    {
        $saved = Settings::appUrl();
        $savedHost = strtolower((string) parse_url($saved, PHP_URL_HOST));
        $host = strtolower(preg_replace('/:\d+$/', '', (string) $r->header('host')));
        $local = (bool) preg_match('/^(localhost|127\.0\.0\.1)$/', $host);
        if ($host !== '' && !$local && $host !== $savedHost) {
            $this->add('bad', 'La web tiene guardada otra dirección', "Está guardada como $saved, pero ahora la estás usando en https://$host. Al pagar, Stripe devuelve a los clientes a la dirección guardada y el webhook también apunta allí. Pulsa «Usar https://$host» y luego revisa el webhook en Stripe.",
                ['action' => 'app_url', 'value' => "https://$host", 'label' => "Usar https://$host"]);
        } elseif (!$local && str_starts_with($saved, 'http://')) {
            $this->add('warn', 'La dirección de la web no usa https', "Está guardada como $saved. Stripe necesita https para volver a la web.",
                ['action' => 'app_url', 'value' => 'https://' . $savedHost, 'label' => 'Usar https://' . $savedHost]);
        } else {
            $this->add('ok', 'Dirección de la web: ' . $saved);
        }
    }

    private function endpoints(string $expected, string $modeName): void
    {
        try {
            $list = Stripe::request('GET', '/v1/webhook_endpoints', ['limit' => 100]);
        } catch (HttpError) {
            $this->add('warn', 'No se han podido consultar los webhooks en Stripe', 'Compruébalo a mano en Stripe → Webhooks: tiene que haber un destino con la URL ' . $expected . '.');
            return;
        }
        $norm = static fn (string $u) => strtolower(rtrim($u, '/'));
        $all = $list['data'] ?? [];
        $match = array_values(array_filter($all, static fn ($e) => $norm((string) ($e['url'] ?? '')) === $norm($expected)));
        if (!$match) {
            $others = array_values(array_filter($all, static fn ($e) => str_contains((string) ($e['url'] ?? ''), '/api/webhooks/stripe')));
            $this->add('bad', "No hay webhook en $modeName apuntando a tu web", $others
                ? 'En Stripe hay un webhook con la dirección ' . $others[0]['url'] . ', pero tu web está en ' . $expected . '. Edita ese destino en Stripe → Webhooks y cambia la URL.'
                : "En Stripe → Webhooks (con el interruptor de $modeName) pulsa «Añadir destino», pega $expected y marca los eventos de la lista. Luego copia su secreto whsec_ aquí.");
            return;
        }
        $endpoint = $match[0];
        if (($endpoint['status'] ?? 'enabled') !== 'enabled') {
            $this->add('bad', 'El webhook está desactivado en Stripe', 'Stripe lo desactiva cuando falla muchos días seguidos. Actívalo de nuevo en Stripe → Webhooks → tu destino.');
        }
        $events = $endpoint['enabled_events'] ?? [];
        if (in_array('*', $events, true)) {
            $this->add('ok', 'Webhook creado en Stripe (recibe todos los eventos)');
            return;
        }
        $missingCore = array_values(array_diff(self::CORE_EVENTS, $events));
        $missingSub = array_values(array_diff(self::SUBSCRIPTION_EVENTS, $events));
        if ($missingCore) {
            $this->add('bad', 'Al webhook le faltan eventos de pago', 'Añade en Stripe → Webhooks → tu destino → «Editar eventos»: ' . implode(', ', $missingCore) . '.');
        }
        if ($missingSub) {
            $this->add('warn', 'Al webhook le faltan los eventos de las suscripciones', 'Solo hacen falta si alguna clase se paga con cuota mensual: ' . implode(', ', $missingSub) . '.');
        }
        if (!$missingCore && !$missingSub) {
            $this->add('ok', 'Webhook creado en Stripe con todos los eventos');
        }
    }

    private function deliveries(): void
    {
        $ok = Stripe::noted('stripe_webhook_ok');
        $rejected = Stripe::noted('stripe_webhook_rejected');
        if ($rejected && (!$ok || $rejected['at'] >= $ok['at'])) {
            $this->add('bad', 'Stripe avisa a la web pero la firma no coincide (' . self::when($rejected['at']) . ')',
                'El secreto whsec_ guardado no es el de este webhook (o es del otro modo, prueba/real). En Stripe → Webhooks → tu destino pulsa «Revelar» en «Secreto de firma», cópialo y pégalo arriba.');
        } elseif ($ok) {
            $this->add('ok', 'Último aviso de Stripe recibido: ' . self::when($ok['at']), 'Evento ' . $ok['message'] . '.');
        } else {
            $this->add('warn', 'Todavía no ha llegado ningún aviso de Stripe', 'Es normal si aún no ha habido pagos desde el último cambio. Haz una compra de prueba y vuelve a pulsar este botón.');
        }
    }

    private static function when(string $at): string
    {
        $t = strtotime($at);
        return $t ? date('d/m/Y H:i', $t) : $at;
    }
}
