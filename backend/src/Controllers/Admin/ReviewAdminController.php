<?php
declare(strict_types=1);

namespace Charria\Controllers\Admin;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Catalog;
use Charria\Validator;

/**
 * Reseñas de compradores y alumnos: alta, edición, ocultar, ordenar y borrar.
 * Solo se publican opiniones reales y con permiso de quien la escribe; la web
 * enseña la sección cuando hay al menos una publicada.
 */
final class ReviewAdminController
{
    private function present(int $id): array
    {
        $row = Database::get()->one('SELECT * FROM reviews WHERE id = ?', [$id]);
        if (!$row) {
            throw HttpError::notFound('Reseña no encontrada');
        }
        return Catalog::review($row);
    }

    public function index(Request $r): Response
    {
        $rows = Database::get()->all('SELECT * FROM reviews ORDER BY sort_order, id');
        return Response::json(array_map([Catalog::class, 'review'], $rows));
    }

    /** Campos editables. $creating = true exige autor y texto. */
    private function validate(array $body, bool $creating): array
    {
        $v = new Validator($body);
        $data = [
            'author' => $v->string('author', $creating, 120, $creating ? 0 : 1),
            'context' => $v->string('context', false, 160),
            'body' => $v->string('body', $creating, 2000, $creating ? 0 : 1),
            'is_published' => ($b = $v->bool('is_published')) === null ? null : (int) $b,
        ];
        // Valoración y fecha son opcionales: vacías se guardan como NULL
        $rating = $v->has('rating') ? ['rating' => $v->int('rating', false, 1, 5)] : [];
        $date = $v->has('review_date') ? ['review_date' => $v->date('review_date')] : [];
        $v->check();
        return array_filter($data, static fn ($x) => $x !== null) + $rating + $date;
    }

    public function store(Request $r): Response
    {
        $data = $this->validate($r->body(), true);
        $db = Database::get();
        $data['sort_order'] = (int) $db->value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM reviews');
        return Response::created($this->present($db->insert('reviews', $data)));
    }

    public function update(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->present($id);
        $data = $this->validate($r->body(), false);
        if ($data) {
            Database::get()->update('reviews', $data, 'id = :id', ['id' => $id]);
        }
        return Response::json($this->present($id));
    }

    /** PUT /admin/reviews/order { ids: [5, 2, 9, ...] } */
    public function reorder(Request $r): Response
    {
        $ids = $r->input('ids');
        if (!is_array($ids) || !array_is_list($ids)) {
            throw HttpError::validation(['ids' => 'Lista de reseñas obligatoria']);
        }
        Database::get()->transaction(static function (Database $db) use ($ids) {
            foreach ($ids as $pos => $id) {
                $db->exec('UPDATE reviews SET sort_order = ? WHERE id = ?', [$pos + 1, (int) $id]);
            }
        });
        return $this->index($r);
    }

    public function destroy(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->present($id);
        Database::get()->exec('DELETE FROM reviews WHERE id = ?', [$id]);
        return Response::noContent();
    }
}
