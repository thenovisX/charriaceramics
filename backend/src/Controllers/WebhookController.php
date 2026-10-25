<?php
declare(strict_types=1);

namespace Charria\Controllers;

use Charria\Database;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Fulfillment;
use Charria\Services\Log;
use Charria\Services\Stripe;

/**
 * POST /webhooks/stripe
 * Stripe avisa aquí de los pagos. Se verifica la firma, cada evento se procesa
 * una sola vez (tabla stripe_events) y se responde 200 para que Stripe no reintente.
 */
final class WebhookController
{
    public function stripe(Request $r): Response
    {
        $event = Stripe::verifyWebhook($r->rawBody, $r->header('stripe-signature'));
        $db = Database::get();
        if ($db->value('SELECT id FROM stripe_events WHERE id = ?', [$event['id']])) {
            return Response::json(['received' => true, 'duplicate' => true]);
        }

        $session = $event['data']['object'] ?? [];
        switch ($event['type']) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                Fulfillment::paid($session);
                break;
            case 'checkout.session.expired':
            case 'checkout.session.async_payment_failed':
                Fulfillment::failed($session);
                break;
            case 'invoice.paid':
                Fulfillment::invoicePaid($session);
                break;
            case 'invoice.payment_failed':
                Fulfillment::invoiceFailed($session);
                break;
            case 'customer.subscription.deleted':
                Fulfillment::subscriptionDeleted($session);
                break;
            default:
                Log::info('Stripe event ignored', ['type' => $event['type']]);
        }
        $db->exec('INSERT IGNORE INTO stripe_events (id, type) VALUES (?, ?)', [$event['id'], substr($event['type'], 0, 80)]);
        return Response::json(['received' => true]);
    }
}
