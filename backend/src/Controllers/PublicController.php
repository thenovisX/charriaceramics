<?php
declare(strict_types=1);

namespace Charria\Controllers;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Catalog;
use Charria\Services\Installer;
use Charria\Services\Mailer;
use Charria\Services\Packlink;
use Charria\Services\Pricing;
use Charria\Services\RateLimiter;
use Charria\Services\Stripe;
use Charria\Validator;

/** Lectura pública: catálogo, galería y clases. Solo devuelve lo publicado. */
final class PublicController
{
    public function health(Request $r): Response
    {
        $installed = Installer::isInstalled();
        return Response::json([
            'ok' => $installed === true,
            'installed' => $installed,
            'payments' => Stripe::isConfigured(),
            'packlink' => Packlink::isConfigured(),
            'time' => date('c'),
        ]);
    }

    /** GET /products?category=Jarrones */
    public function products(Request $r): Response
    {
        $sql = 'SELECT * FROM products WHERE is_active = 1';
        $params = [];
        if (!empty($r->query['category']) && is_string($r->query['category'])) {
            $sql .= ' AND category = ?';
            $params[] = $r->query['category'];
        }
        $rows = Database::get()->all($sql . ' ORDER BY created_at DESC, id DESC', $params);
        return Response::json(Catalog::products($rows));
    }

    /** GET /products/{id o slug} */
    public function product(Request $r): Response
    {
        $key = $r->param('id');
        $row = Database::get()->one(
            'SELECT * FROM products WHERE is_active = 1 AND ' . (ctype_digit($key) ? 'id = ?' : 'slug = ?'),
            [$key]
        );
        if (!$row) {
            throw HttpError::notFound('Producto no encontrado');
        }
        return Response::json(Catalog::products([$row])[0]);
    }

    public function gallery(Request $r): Response
    {
        $rows = Database::get()->all(
            'SELECT g.*, i.url, i.thumb_url, i.width, i.height, i.alt FROM gallery_items g
             JOIN images i ON i.id = g.image_id
             WHERE g.is_published = 1 ORDER BY g.sort_order, g.id'
        );
        return Response::json(array_map([Catalog::class, 'galleryItem'], $rows));
    }

    /** GET /classes → clases en grupo con sus próximos horarios y modalidades privadas */
    public function classes(Request $r): Response
    {
        $rows = Database::get()->all('SELECT * FROM classes WHERE is_active = 1 ORDER BY sort_order, id');
        $classes = Catalog::classes($rows);
        return Response::json([
            'group' => array_values(array_filter($classes, static fn ($c) => $c['kind'] === 'group')),
            'private' => array_values(array_filter($classes, static fn ($c) => $c['kind'] === 'private')),
        ]);
    }

    /** POST /cart/quote { items: [{product_id, quantity}] } → precios y totales calculados en el servidor */
    public function cartQuote(Request $r): Response
    {
        $quote = Pricing::quote(Pricing::normalizeItems($r->input('items')));
        unset($quote['max_dimensions_cm'], $quote['weight_grams']);
        return Response::json($quote);
    }

    /** POST /contact { name, email, reason, message } → email al estudio (no se guarda en la BD) */
    public function contact(Request $r): Response
    {
        RateLimiter::hit('contact:' . $r->ip, 5, 3600);
        $v = new Validator($r->body());
        $name = $v->string('name', true, 160, 2);
        $email = $v->email('email', true);
        $reason = $v->string('reason', false, 80) ?? 'Consulta general';
        $message = $v->string('message', true, 5000, 5);
        $v->check();
        Mailer::admin("Web · $reason · $name", "$message\n\n— $name <$email>");
        return Response::created(['sent' => true]);
    }
}
