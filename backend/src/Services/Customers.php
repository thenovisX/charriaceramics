<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Validator;

/**
 * Perfiles de cliente. Solo se crea o actualiza un perfil si la persona lo pide
 * (casilla "guardar mis datos") o si acepta recibir comunicaciones comerciales.
 * Sin eso, el pedido o la reserva guardan únicamente sus propios datos de
 * contacto y entrega, que son los necesarios para cumplir con ellos.
 */
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

    /**
     * Aplica las casillas de una compra o reserva y devuelve el id del cliente
     * (o null si no hay perfil ni marketing).
     * - profile: crea o actualiza el perfil con nombre, teléfono y dirección.
     * - marketing: marca el alta en comunicaciones (si no hay perfil, solo nombre y email).
     * - Si ya tenía un perfil guardado de antes, el pedido se asocia a él sin cambiar sus datos.
     */
    public static function fromConsents(array $data, array $consents): ?int
    {
        $db = Database::get();
        $existing = $db->one('SELECT * FROM customers WHERE email = ?', [$data['email']]);
        $profile = !empty($consents['profile']);
        $marketing = !empty($consents['marketing']);
        if (!$profile && !$marketing) {
            return $existing && $existing['has_profile'] ? (int) $existing['id'] : null;
        }

        $fields = [];
        if ($profile) {
            $fields = array_filter([
                'name' => $data['name'] ?? '',
                'phone' => $data['phone'] ?? '',
                'street' => $data['street'] ?? '',
                'city' => $data['city'] ?? '',
                'postal_code' => $data['postal_code'] ?? '',
                'country' => $data['country'] ?? '',
            ], static fn ($v) => $v !== '' && $v !== null);
            $fields['has_profile'] = 1;
        } elseif (!$existing) {
            $fields['name'] = $data['name'] ?? '';
        }
        if ($marketing && (!$existing || !$existing['marketing_opt_in'])) {
            $fields['marketing_opt_in'] = 1;
            $fields['marketing_updated_at'] = date('Y-m-d H:i:s');
        }
        if ($existing) {
            $db->update('customers', $fields, 'id = :id', ['id' => $existing['id']]);
            return (int) $existing['id'];
        }
        return $db->insert('customers', ['email' => $data['email']] + $fields);
    }

    /** Alta o baja de comunicaciones comerciales. Una baja sin perfil borra la fila: ya no hay motivo para guardarla. */
    public static function setMarketing(array $customer, bool $optIn): void
    {
        $db = Database::get();
        if (!$optIn && !$customer['has_profile']) {
            $db->exec('DELETE FROM customers WHERE id = ?', [$customer['id']]);
            return;
        }
        $db->update('customers', ['marketing_opt_in' => (int) $optIn, 'marketing_updated_at' => date('Y-m-d H:i:s')], 'id = :id', ['id' => $customer['id']]);
    }
}
