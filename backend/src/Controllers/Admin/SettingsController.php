<?php
declare(strict_types=1);

namespace Charria\Controllers\Admin;

use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\AppSettings;
use Charria\Services\ImageProcessor;
use Charria\Services\Mailer;
use Charria\Services\Packlink;
use Charria\Services\StripeCheck;

/** Ajustes > Stripe, Packlink, envíos y correo (panel). */
final class SettingsController
{
    public function show(Request $r): Response
    {
        return Response::json(AppSettings::forPanel());
    }

    /** PUT /admin/settings { values: {CLAVE: valor}, clear: [CLAVE] } — un secreto vacío no se cambia */
    public function update(Request $r): Response
    {
        $values = $r->input('values', []);
        $clear = $r->input('clear', []);
        if (!is_array($values) || !is_array($clear)) {
            throw HttpError::validation(['values' => 'Formato no válido']);
        }
        AppSettings::save($values, $clear);
        return Response::json(AppSettings::forPanel());
    }

    /** POST /admin/settings/studio-image (multipart: image, alt, crop=1) — foto de «El estudio» en la portada */
    public function studioImage(Request $r): Response
    {
        $alt = trim((string) ($r->post['alt'] ?? '')) ?: 'Trabajando en el torno del estudio';
        $image = ImageProcessor::store($r->files['image'] ?? null, 'site', mb_substr($alt, 0, 255), filter_var($r->post['crop'] ?? false, FILTER_VALIDATE_BOOLEAN));
        AppSettings::setStudioImage((int) $image['id']);
        return Response::json(AppSettings::forPanel());
    }

    /** DELETE /admin/settings/studio-image — vuelve a la foto de ejemplo */
    public function deleteStudioImage(Request $r): Response
    {
        AppSettings::setStudioImage(null);
        return Response::json(AppSettings::forPanel());
    }

    /** POST /admin/settings/test { service: "stripe" | "packlink" | "mail" } — comprueba que las claves funcionan */
    public function test(Request $r): Response
    {
        $service = $r->input('service');
        if ($service === 'stripe') {
            return Response::json(StripeCheck::run($r));
        }
        if ($service === 'packlink') {
            if (!Packlink::isConfigured()) {
                throw HttpError::validation(['PACKLINK_API_KEY' => 'Primero guarda la API key de Packlink']);
            }
            try {
                $services = Packlink::services('ES', '08001', ['weight' => 1, 'length' => 30, 'width' => 30, 'height' => 30]);
            } catch (\Throwable) {
                throw new HttpError(502, 'packlink_error', 'Packlink ha rechazado la petición. Revisa la API key y el código postal del remitente.');
            }
            return Response::json(['ok' => true, 'message' => 'Conectado con Packlink · ' . count($services) . ' tarifas para un paquete de prueba a Barcelona']);
        }
        if ($service === 'mail') {
            $to = Mailer::test();
            return Response::json(['ok' => true, 'message' => "Correo de prueba enviado a $to. Mira la bandeja de entrada (y la de spam)."]);
        }
        throw HttpError::validation(['service' => 'Servicio desconocido']);
    }
}
