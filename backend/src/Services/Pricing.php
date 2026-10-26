<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Http\HttpError;

/**
 * Cálculo de precios de la cesta. Es la ÚNICA fuente de verdad de los importes:
 * el navegador solo envía [{product_id, quantity}] y todo lo demás (precio,
 * descuento, disponibilidad, totales) se lee de la base de datos aquí.
 */
final class Pricing
{
    public const MAX_LINES = 30;
    public const MAX_QTY = 20;

    /** Precio con descuento, redondeado al céntimo (mitad hacia arriba). */
    public static function discounted(int $priceCents, int $discountPercent): int
    {
        $discountPercent = max(0, min(100, $discountPercent));
        return intdiv($priceCents * (100 - $discountPercent) + 50, 100);
    }

    /** Valida y agrupa las líneas enviadas por el cliente. Ignora cualquier otro campo (p. ej. precios). */
    public static function normalizeItems(mixed $items): array
    {
        if (!is_array($items) || !array_is_list($items) || !$items) {
            throw HttpError::validation(['items' => 'La cesta está vacía']);
        }
        $merged = [];
        foreach ($items as $i => $item) {
            $id = filter_var($item['product_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            $qty = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => self::MAX_QTY]]);
            if ($id === false || $qty === false) {
                throw HttpError::validation(["items.$i" => 'Producto o cantidad no válidos (cantidad de 1 a ' . self::MAX_QTY . ')']);
            }
            $merged[$id] = min(self::MAX_QTY, ($merged[$id] ?? 0) + $qty);
        }
        if (count($merged) > self::MAX_LINES) {
            throw HttpError::validation(['items' => 'Demasiados productos distintos en la cesta']);
        }
        return $merged;
    }

    /**
     * Calcula la cesta. Con $lock = true bloquea las filas de producto (SELECT ... FOR UPDATE)
     * para que dos compras simultáneas no se lleven la misma última pieza; debe llamarse
     * dentro de una transacción.
     */
    public static function quote(array $merged, bool $lock = false, ?string $exceptEmail = null): array
    {
        $db = Database::get();
        $ids = array_keys($merged);
        $in = implode(',', array_fill(0, count($ids), '?'));
        $rows = $db->all("SELECT * FROM products WHERE id IN ($in)" . ($lock ? ' FOR UPDATE' : ''), $ids);
        $products = array_column($rows, null, 'id');
        $held = self::heldStock($ids, $exceptEmail);
        $images = Catalog::firstImages($ids);

        $lines = [];
        $errors = [];
        $subtotal = $discount = $weight = 0;
        $dims = [0, 0, 0];
        foreach ($merged as $id => $qty) {
            $p = $products[$id] ?? null;
            if (!$p || !$p['is_active']) {
                $errors[] = ['product_id' => $id, 'code' => 'unavailable', 'message' => 'Este producto ya no está disponible'];
                continue;
            }
            $available = max(0, (int) $p['stock'] - ($held[$id] ?? 0));
            if ($p['sold_out'] || $available === 0) {
                $errors[] = ['product_id' => $id, 'code' => 'sold_out', 'message' => "{$p['title']} está agotado"];
                continue;
            }
            if ($qty > $available) {
                $errors[] = ['product_id' => $id, 'code' => 'insufficient_stock', 'available' => $available,
                    'message' => "Solo quedan $available unidades de {$p['title']}"];
                continue;
            }
            $unit = (int) $p['price_cents'];
            $final = self::discounted($unit, (int) $p['discount_percent']);
            $lines[] = [
                'product_id' => (int) $id,
                'slug' => $p['slug'],
                'title' => $p['title'],
                'image' => $images[$id] ?? null,
                'quantity' => $qty,
                'unit_price_cents' => $unit,
                'discount_percent' => (int) $p['discount_percent'],
                'unit_final_cents' => $final,
                'line_total_cents' => $final * $qty,
                'available' => $available,
            ];
            $subtotal += $unit * $qty;
            $discount += ($unit - $final) * $qty;
            $weight += (int) $p['weight_grams'] * $qty;
            $dims = [max($dims[0], (int) $p['length_cm']), max($dims[1], (int) $p['width_cm']), max($dims[2], (int) $p['height_cm'])];
        }

        return [
            'lines' => $lines,
            'errors' => $errors,
            'subtotal_cents' => $subtotal,
            'discount_cents' => $discount,
            'items_total_cents' => $subtotal - $discount,
            'weight_grams' => $weight,
            'max_dimensions_cm' => $dims,
            'currency' => Settings::currency(),
        ];
    }

    /** Unidades retenidas por pedidos que se están pagando ahora mismo (aún no caducados), sin contar los de $exceptEmail. */
    public static function heldStock(array $productIds, ?string $exceptEmail = null): array
    {
        if (!$productIds) {
            return [];
        }
        $in = implode(',', array_fill(0, count($productIds), '?'));
        $rows = Database::get()->all(
            "SELECT oi.product_id, SUM(oi.quantity) AS qty FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             WHERE o.status = 'pending' AND o.expires_at > NOW() AND oi.product_id IN ($in)" . ($exceptEmail !== null ? ' AND o.customer_email <> ?' : '') . "
             GROUP BY oi.product_id",
            $exceptEmail !== null ? [...array_values($productIds), $exceptEmail] : array_values($productIds)
        );
        return array_map('intval', array_column($rows, 'qty', 'product_id'));
    }
}
