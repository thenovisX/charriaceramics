<?php
declare(strict_types=1);

namespace Charria\Controllers\Admin;

use Charria\Database;
use Charria\Http\HttpError;
use Charria\Http\Request;
use Charria\Http\Response;
use Charria\Services\Messages;
use Charria\Validator;

/** Mensajes: bandeja con contacto, encargos y clases privadas. Leer, marcar como atendido y borrar. */
final class MessageAdminController
{
    private function find(int $id): array
    {
        $row = Database::get()->one('SELECT * FROM messages WHERE id = ?', [$id]);
        if (!$row) {
            throw HttpError::notFound('Mensaje no encontrado');
        }
        return $row;
    }

    /** GET /admin/messages?type=contact|request|private_class&status=unread|open|handled */
    public function index(Request $r): Response
    {
        $where = [];
        $params = [];
        $type = (string) ($r->query['type'] ?? '');
        if (in_array($type, Messages::TYPES, true)) {
            $where[] = 'type = ?';
            $params[] = $type;
        }
        $status = (string) ($r->query['status'] ?? '');
        if ($status === 'unread') {
            $where[] = 'read_at IS NULL';
        } elseif ($status === 'open') {
            $where[] = 'handled_at IS NULL';
        } elseif ($status === 'handled') {
            $where[] = 'handled_at IS NOT NULL';
        }
        $rows = Database::get()->all(
            'SELECT * FROM messages' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY created_at DESC, id DESC LIMIT 300',
            $params
        );
        return Response::json(array_map([Messages::class, 'present'], $rows));
    }

    /** GET /admin/messages/unread — para el contador del menú */
    public function unread(Request $r): Response
    {
        return Response::json(['unread' => Messages::unread()]);
    }

    /** GET /admin/messages/{id} — abrirlo lo marca como leído */
    public function show(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->find($id);
        Database::get()->exec('UPDATE messages SET read_at = NOW() WHERE id = ? AND read_at IS NULL', [$id]);
        return Response::json(Messages::present($this->find($id)));
    }

    /** PATCH /admin/messages/{id} { read?, handled? } */
    public function update(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->find($id);
        $v = new Validator($r->body());
        $read = $v->bool('read');
        $handled = $v->bool('handled');
        $v->check();
        $now = date('Y-m-d H:i:s');
        $data = [];
        if ($read !== null) {
            $data['read_at'] = $read ? $now : null;
        }
        if ($handled !== null) {
            $data['handled_at'] = $handled ? $now : null;
            if ($handled) {
                $data['read_at'] = $now;
            }
        }
        if ($data) {
            Database::get()->update('messages', $data, 'id = :id', ['id' => $id]);
        }
        return Response::json(Messages::present($this->find($id)));
    }

    /** DELETE /admin/messages/{id} — la reserva de una clase privada no se toca */
    public function destroy(Request $r): Response
    {
        $id = $r->intParam('id');
        $this->find($id);
        Database::get()->exec('DELETE FROM messages WHERE id = ?', [$id]);
        return Response::noContent();
    }
}
