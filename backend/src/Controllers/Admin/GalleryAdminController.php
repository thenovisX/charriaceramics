<?php
declare(strict_types=1);

namespace Charria\Controllers\Admin;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Catalog;
use Charria\Services\ImageProcessor;
use Charria\Validator;

/** Galería: subir (con validación de formato, peso y proporción), editar, ordenar y borrar. */
final class GalleryAdminController
{
    /** Etiqueta bajo la obra: Obra única (No disponible) · Disponible bajo pedido · ninguna */
    public const AVAILABILITY = ['unique', 'on_request', 'none'];

    private const SELECT = 'SELECT g.*, i.url, i.thumb_url, i.width, i.height, i.alt FROM gallery_items g JOIN images i ON i.id = g.image_id';

    private function present(int $id): array
    {
        $row = Database::get()->one(self::SELECT . ' WHERE g.id = ?', [$id]);
        if (!$row) {
            throw HttpError::notFound('Obra no encontrada');
        }
        return Catalog::galleryItem($row);
    }

    public function index(Request $r): Response
    {
        $rows = Database::get()->all(self::SELECT . ' ORDER BY g.sort_order, g.id');
        return Response::json(array_map([Catalog::class, 'galleryItem'], $rows));
    }

    /** Reglas de imagen (proporciones, tamaños, peso) para mostrarlas en el panel. */
    public function rules(Request $r): Response
    {
        return Response::json(ImageProcessor::rules());
    }

    /** POST /admin/gallery (multipart: image, title, technique, year, availability, alt, crop=1, is_published) */
    public function store(Request $r): Response
    {
        $v = new Validator($r->post);
        $title = $v->string('title', true, 160);
        $technique = $v->string('technique', false, 160) ?? '';
        $year = $v->string('year', false, 10) ?? date('Y');
        $availability = $v->enum('availability', self::AVAILABILITY) ?: 'unique';
        $alt = $v->string('alt', false, 255) ?? '';
        $published = $v->bool('is_published') ?? true;
        $v->check();

        $image = ImageProcessor::store($r->files['image'] ?? null, 'gallery', $alt ?: $title, filter_var($r->post['crop'] ?? false, FILTER_VALIDATE_BOOLEAN));
        $db = Database::get();
        $id = $db->insert('gallery_items', [
            'image_id' => $image['id'],
            'title' => $title,
            'technique' => $technique,
            'year' => $year,
            'availability' => $availability,
            'is_published' => (int) $published,
            'sort_order' => (int) $db->value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM gallery_items'),
        ]);
        return Response::created($this->present($id));
    }

    public function update(Request $r): Response
    {
        $id = $r->intParam('id');
        $item = $this->present($id);
        $v = new Validator($r->body());
        $data = array_filter([
            'title' => $v->string('title', false, 160, 1),
            'technique' => $v->string('technique', false, 160),
            'year' => $v->string('year', false, 10),
            'availability' => $v->enum('availability', self::AVAILABILITY) ?: null,
            'is_published' => ($b = $v->bool('is_published')) === null ? null : (int) $b,
        ], static fn ($x) => $x !== null);
        $alt = $v->string('alt', false, 255);
        $v->check();
        $db = Database::get();
        $db->update('gallery_items', $data, 'id = :id', ['id' => $id]);
        if ($alt !== null) {
            $db->exec('UPDATE images SET alt = ? WHERE id = ?', [$alt, $item['image']['id']]);
        }
        return Response::json($this->present($id));
    }

    /** PUT /admin/gallery/order { ids: [5, 2, 9, ...] } */
    public function reorder(Request $r): Response
    {
        $ids = $r->input('ids');
        if (!is_array($ids) || !array_is_list($ids)) {
            throw HttpError::validation(['ids' => 'Lista de obras obligatoria']);
        }
        $db = Database::get();
        $db->transaction(static function (Database $db) use ($ids) {
            foreach ($ids as $pos => $id) {
                $db->exec('UPDATE gallery_items SET sort_order = ? WHERE id = ?', [$pos + 1, (int) $id]);
            }
        });
        return $this->index($r);
    }

    public function destroy(Request $r): Response
    {
        $item = $this->present($r->intParam('id'));
        ImageProcessor::delete($item['image']['id']); // borra también la fila de la galería (ON DELETE CASCADE)
        return Response::noContent();
    }
}
