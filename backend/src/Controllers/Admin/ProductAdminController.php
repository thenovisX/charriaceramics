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

/** CRUD de productos del panel (todas las rutas exigen sesión de admin). */
final class ProductAdminController
{
    private function find(int $id): array
    {
        $row = Database::get()->one('SELECT * FROM products WHERE id = ?', [$id]);
        if (!$row) {
            throw HttpError::notFound('Producto no encontrado');
        }
        return $row;
    }

    private function present(int $id): array
    {
        return Catalog::products([$this->find($id)], true)[0];
    }

    /** Campos editables. $creating = true exige título y precio. */
    private function validate(array $body, bool $creating): array
    {
        $v = new Validator($body);
        $data = [
            'title' => $v->string('title', $creating, 160, 2),
            'description' => $v->string('description', false, 5000),
            'category' => $v->string('category', false, 80),
            'price_cents' => $v->int('price_cents', $creating, 0, 10_000_000),
            'discount_percent' => $v->int('discount_percent', false, 0, 90),
            'stock' => $v->int('stock', false, 0, 100_000),
            'sold_out' => $v->bool('sold_out'),
            'is_active' => $v->bool('is_active'),
            'weight_grams' => $v->int('weight_grams', false, 1, 70_000),
            'length_cm' => $v->int('length_cm', false, 0, 300),
            'width_cm' => $v->int('width_cm', false, 0, 300),
            'height_cm' => $v->int('height_cm', false, 0, 300),
            'dimensions' => $v->string('dimensions', false, 160),
            'piece_height_mm' => $v->has('piece_height_mm') ? ($v->int('piece_height_mm', false, 0, 10_000) ?? 0) : null,
            'piece_width_mm' => $v->has('piece_width_mm') ? ($v->int('piece_width_mm', false, 0, 10_000) ?? 0) : null,
            'piece_depth_mm' => $v->has('piece_depth_mm') ? ($v->int('piece_depth_mm', false, 0, 10_000) ?? 0) : null,
            'piece_diameter_mm' => $v->has('piece_diameter_mm') ? ($v->int('piece_diameter_mm', false, 0, 10_000) ?? 0) : null,
            'piece_capacity_ml' => $v->has('piece_capacity_ml') ? ($v->int('piece_capacity_ml', false, 0, 100_000) ?? 0) : null,
            'material' => $v->string('material', false, 160),
            'piece_weight_grams' => $v->has('piece_weight_grams') ? ($v->int('piece_weight_grams', false, 0, 100_000) ?? 0) : null,
            'care' => $v->string('care', false, 3000),
        ];
        $slug = $v->string('slug', false, 160);
        $specs = $v->has('specs') ? $this->specs($v) : null;
        $v->check();
        $data = array_filter($data, static fn ($value) => $value !== null);
        foreach (['sold_out', 'is_active'] as $flag) {
            if (isset($data[$flag])) {
                $data[$flag] = (int) $data[$flag];
            }
        }
        if ($slug) {
            $data['slug'] = Validator::slugify($slug);
        }
        if ($specs !== null) {
            $data['specs'] = json_encode($specs, JSON_UNESCAPED_UNICODE);
        }
        return $data;
    }

    /** specs: [{label, value}] — las filas vacías se descartan; máximo 20. */
    private function specs(Validator $v): array
    {
        $out = [];
        foreach ($v->array('specs') ?? [] as $i => $row) {
            $label = trim((string) (is_array($row) ? ($row['label'] ?? '') : ''));
            $value = trim((string) (is_array($row) ? ($row['value'] ?? '') : ''));
            if ($label === '' && $value === '') {
                continue;
            }
            if ($label === '' || $value === '') {
                $v->addError("specs.$i", 'Rellena el nombre y el valor');
            } elseif (mb_strlen($label) > 60 || mb_strlen($value) > 200) {
                $v->addError("specs.$i", 'Máximo 60 caracteres el nombre y 200 el valor');
            }
            $out[] = ['label' => $label, 'value' => $value];
        }
        if (count($out) > 20) {
            $v->addError('specs', 'Máximo 20 especificaciones');
        }
        return $out;
    }

    private function uniqueSlug(string $base, int $exceptId = 0): string
    {
        $db = Database::get();
        $slug = $base;
        for ($i = 2; $db->value('SELECT id FROM products WHERE slug = ? AND id <> ?', [$slug, $exceptId]); $i++) {
            $slug = "$base-$i";
        }
        return $slug;
    }

    public function index(Request $r): Response
    {
        $rows = Database::get()->all('SELECT * FROM products ORDER BY created_at DESC, id DESC');
        return Response::json(Catalog::products($rows, true));
    }

    public function show(Request $r): Response
    {
        return Response::json($this->present($r->intParam('id')));
    }

    public function store(Request $r): Response
    {
        $data = $this->validate($r->body(), true);
        $data['slug'] = $this->uniqueSlug($data['slug'] ?? Validator::slugify($data['title']));
        $id = Database::get()->insert('products', $data);
        return Response::created($this->present($id));
    }

    /** PUT/PATCH /admin/products/{id}: solo cambia los campos enviados */
    public function update(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->find($id);
        $data = $this->validate($r->body(), false);
        if (isset($data['slug'])) {
            $data['slug'] = $this->uniqueSlug($data['slug'], $id);
        }
        Database::get()->update('products', $data, 'id = :id', ['id' => $id]);
        return Response::json($this->present($id));
    }

    /** PATCH /admin/products/{id}/sold-out { sold_out: true|false } — interruptor manual "Agotado" */
    public function soldOut(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->find($id);
        $v = new Validator($r->body());
        $soldOut = $v->bool('sold_out', true);
        $v->check();
        Database::get()->exec('UPDATE products SET sold_out = ? WHERE id = ?', [(int) $soldOut, $id]);
        return Response::json($this->present($id));
    }

    public function destroy(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->find($id);
        $db = Database::get();
        $imageIds = $db->all('SELECT image_id FROM product_images WHERE product_id = ?', [$id]);
        // Los pedidos antiguos conservan título y precio (order_items.product_id pasa a NULL)
        $db->exec('DELETE FROM products WHERE id = ?', [$id]);
        foreach ($imageIds as $img) {
            ImageProcessor::delete((int) $img['image_id']);
        }
        return Response::noContent();
    }

    /** POST /admin/products/{id}/images (multipart: image, alt, crop=1) */
    public function uploadImage(Request $r): Response
    {
        $id = $r->intParam('id');
        $product = $this->find($id);
        $image = ImageProcessor::store(
            $r->files['image'] ?? null,
            'product',
            (string) ($r->post['alt'] ?? $product['title']),
            filter_var($r->post['crop'] ?? false, FILTER_VALIDATE_BOOLEAN)
        );
        $db = Database::get();
        $order = (int) $db->value('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM product_images WHERE product_id = ?', [$id]);
        $db->insert('product_images', ['product_id' => $id, 'image_id' => $image['id'], 'sort_order' => $order]);
        return Response::created($this->present($id));
    }

    /** PUT /admin/products/{id}/images { ids: [3, 1, 2] } — la primera es la portada */
    public function reorderImages(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->find($id);
        $ids = $r->input('ids');
        if (!is_array($ids)) {
            throw HttpError::validation(['ids' => 'Lista de imágenes obligatoria']);
        }
        $db = Database::get();
        foreach (array_values($ids) as $pos => $imageId) {
            $db->exec('UPDATE product_images SET sort_order = ? WHERE product_id = ? AND image_id = ?', [$pos, $id, (int) $imageId]);
        }
        return Response::json($this->present($id));
    }

    /** PATCH /admin/products/{id}/images/{imageId} { alt } — texto alternativo de la foto */
    public function updateImage(Request $r): Response
    {
        $id = $r->intParam('id');
        $imageId = $r->intParam('imageId');
        if (!Database::get()->value('SELECT 1 FROM product_images WHERE product_id = ? AND image_id = ?', [$id, $imageId])) {
            throw HttpError::notFound('Imagen no encontrada');
        }
        $v = new Validator($r->body());
        $alt = $v->string('alt', false, 255);
        $v->check();
        Database::get()->exec('UPDATE images SET alt = ? WHERE id = ?', [(string) $alt, $imageId]);
        return Response::json($this->present($id));
    }

    public function deleteImage(Request $r): Response
    {
        $id = $r->intParam('id');
        $imageId = $r->intParam('imageId');
        if (!Database::get()->value('SELECT 1 FROM product_images WHERE product_id = ? AND image_id = ?', [$id, $imageId])) {
            throw HttpError::notFound('Imagen no encontrada');
        }
        ImageProcessor::delete($imageId);
        return Response::json($this->present($id));
    }
}
