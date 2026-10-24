<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Http\Request;
use Charria\Validator;

/**
 * Consentimientos (RGPD art. 7: hay que poder demostrar qué aceptó cada persona).
 * Las casillas llegan en el bloque "consents" de la compra, las reservas y el contacto:
 *   terms     → acepta condiciones y política de privacidad (obligatoria)
 *   marketing → quiere recibir comunicaciones comerciales (opcional, LSSI art. 21)
 *   profile   → quiere que se guarde su perfil de cliente (opcional)
 * Cada aceptación se guarda con fecha, origen, IP y la versión de los textos.
 */
final class Consents
{
    /**
     * Versión de los textos legales y de las casillas. Súbela (fecha del cambio)
     * cada vez que cambies la política de privacidad, las condiciones o el texto de las casillas.
     */
    public const VERSION = '2026-10-24';

    /** Lee el bloque "consents". Sin la casilla obligatoria, error en "consents.terms". */
    public static function validate(Validator $v, bool $offerExtras = true): array
    {
        $c = $v->nested('consents', static fn (Validator $c) => [
            'terms' => $c->bool('terms') ?? false,
            'marketing' => $offerExtras && ($c->bool('marketing') ?? false),
            'profile' => $offerExtras && ($c->bool('profile') ?? false),
        ], false);
        if (!$c['terms']) {
            $v->addError('consents.terms', 'Para continuar tienes que aceptar las condiciones y la política de privacidad');
        }
        return $c;
    }

    public static function record(string $email, string $purpose, bool $granted, string $source, ?Request $r = null, array $refs = []): void
    {
        Database::get()->insert('consents', [
            'subject_email' => mb_strtolower($email),
            'customer_id' => $refs['customer_id'] ?? null,
            'order_id' => $refs['order_id'] ?? null,
            'booking_id' => $refs['booking_id'] ?? null,
            'purpose' => $purpose,
            'granted' => (int) $granted,
            'text_version' => self::VERSION,
            'source' => $source,
            'ip' => $r?->ip ?? '',
            'user_agent' => mb_substr((string) ($r?->header('user-agent') ?? ''), 0, 255),
        ]);
    }

    /** Guarda las casillas marcadas en una compra o reserva. */
    public static function recordAll(string $email, array $consents, string $source, Request $r, array $refs): void
    {
        foreach (['terms', 'marketing', 'profile'] as $purpose) {
            if (!empty($consents[$purpose])) {
                self::record($email, $purpose, true, $source, $r, $refs);
            }
        }
    }

    /** Historial para el panel o la exportación de datos. */
    public static function history(string $email): array
    {
        return array_map(static fn ($c) => [
            'purpose' => $c['purpose'],
            'granted' => (bool) $c['granted'],
            'text_version' => $c['text_version'],
            'source' => $c['source'],
            'created_at' => $c['created_at'],
        ], Database::get()->all('SELECT * FROM consents WHERE subject_email = ? ORDER BY created_at, id', [mb_strtolower($email)]));
    }
}
