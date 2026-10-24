<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Validator;

final class Customers
{
    /** Valida el bloque "customer" de una petición pública. */
    public static function validate(Validator $v, bool $phoneRequired = false): array
    {
        return $v->nested('customer', static fn (Validator $c) => [
            'name' => $c->string('name', true, 160, 2),
            'email' => $c->email('email', true),
            'phone' => $c->string('phone', $phoneRequired, 40) ?? '',
        ]);
    }

    /** Crea o actualiza el cliente por email y devuelve su id. */
    public static function upsert(array $data): int
    {
        $db = Database::get();
        $fields = array_filter([
            'name' => $data['name'] ?? '',
            'phone' => $data['phone'] ?? '',
            'street' => $data['street'] ?? '',
            'city' => $data['city'] ?? '',
            'postal_code' => $data['postal_code'] ?? '',
            'country' => $data['country'] ?? '',
        ], static fn ($v) => $v !== '' && $v !== null);
        $id = $db->value('SELECT id FROM customers WHERE email = ?', [$data['email']]);
        if ($id) {
            $db->update('customers', $fields, 'id = :id', ['id' => $id]);
            return (int) $id;
        }
        return $db->insert('customers', ['email' => $data['email']] + $fields);
    }
}
