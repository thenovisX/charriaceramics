<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;

/** Lectura y formato JSON de productos, clases y galería (compartido por la API pública y el panel). */
final class Catalog
{
    /* ---------------- Productos ---------------- */

    public static function imagesForProducts(array $productIds): array
    {
        if (!$productIds) {
            return [];
        }
        $in = implode(',', array_fill(0, count($productIds), '?'));
        $rows = Database::get()->all(
            "SELECT pi.product_id, pi.sort_order, i.* FROM product_images pi
             JOIN images i ON i.id = pi.image_id
             WHERE pi.product_id IN ($in) ORDER BY pi.sort_order, i.id",
            array_values($productIds)
        );
        $byProduct = [];
        foreach ($rows as $row) {
            $byProduct[$row['product_id']][] = self::image($row);
        }
        return $byProduct;
    }

    /** Primera imagen de cada producto (para la cesta). */
    public static function firstImages(array $productIds): array
    {
        return array_map(static fn ($imgs) => $imgs[0] ?? null, self::imagesForProducts($productIds));
    }

    public static function image(?array $row): ?array
    {
        if (!$row || !isset($row['url'])) {
            return null;
        }
        return [
            'id' => (int) $row['id'],
            'url' => $row['url'],
            'thumb_url' => $row['thumb_url'] ?: $row['url'],
            'width' => (int) $row['width'],
            'height' => (int) $row['height'],
            'alt' => $row['alt'],
        ];
    }

    /** $admin = true añade los campos internos (stock real, peso, activo...). */
    public static function product(array $p, array $images, array $held = [], bool $admin = false): array
    {
        $available = max(0, (int) $p['stock'] - ($held[$p['id']] ?? 0));
        $final = Pricing::discounted((int) $p['price_cents'], (int) $p['discount_percent']);
        $out = [
            'id' => (int) $p['id'],
            'slug' => $p['slug'],
            'title' => $p['title'],
            'description' => (string) $p['description'],
            'category' => $p['category'],
            'price_cents' => (int) $p['price_cents'],
            'discount_percent' => (int) $p['discount_percent'],
            'final_price_cents' => $final,
            'sold_out' => (bool) $p['sold_out'] || $available === 0,
            'images' => $images,
            'dimensions' => (string) ($p['dimensions'] ?? ''),
            'material' => (string) ($p['material'] ?? ''),
            'piece_weight_grams' => (int) ($p['piece_weight_grams'] ?? 0),
            'care' => (string) ($p['care'] ?? ''),
            'specs' => self::specs($p['specs'] ?? null),
            'created_at' => $p['created_at'],
        ];
        if ($admin) {
            $out += [
                'stock' => (int) $p['stock'],
                'held' => (int) ($held[$p['id']] ?? 0),
                'sold_out_manual' => (bool) $p['sold_out'],
                'is_active' => (bool) $p['is_active'],
                'weight_grams' => (int) $p['weight_grams'],
                'length_cm' => (int) $p['length_cm'],
                'width_cm' => (int) $p['width_cm'],
                'height_cm' => (int) $p['height_cm'],
                'updated_at' => $p['updated_at'],
            ];
        } else {
            // Al público solo se le dice si quedan pocas, no el stock exacto
            $out['low_stock'] = !$out['sold_out'] && $available <= 2;
        }
        return $out;
    }

    /** Especificaciones libres guardadas como JSON: [{label, value}] */
    public static function specs(?string $json): array
    {
        $list = $json ? json_decode($json, true) : null;
        return is_array($list) ? array_values(array_filter($list, static fn ($s) => is_array($s) && isset($s['label'], $s['value']))) : [];
    }

    public static function products(array $rows, bool $admin = false): array
    {
        $ids = array_column($rows, 'id');
        $images = self::imagesForProducts($ids);
        $held = Pricing::heldStock($ids);
        return array_map(static fn ($p) => self::product($p, $images[$p['id']] ?? [], $held, $admin), $rows);
    }

    /* ---------------- Clases y horarios ---------------- */

    /** Plazas ocupadas por sesión: confirmadas + las que se están pagando ahora. */
    public static function seatsTaken(array $sessionIds): array
    {
        if (!$sessionIds) {
            return [];
        }
        $in = implode(',', array_fill(0, count($sessionIds), '?'));
        $rows = Database::get()->all(
            "SELECT session_id, SUM(seats) AS taken FROM bookings
             WHERE session_id IN ($in)
               AND (status = 'confirmed' OR (status = 'pending_payment' AND expires_at > NOW()))
             GROUP BY session_id",
            array_values($sessionIds)
        );
        return array_map('intval', array_column($rows, 'taken', 'session_id'));
    }

    public static function session(array $s, array $class, array $taken): array
    {
        $capacity = (int) ($s['capacity'] ?? $class['capacity']);
        $price = (int) ($s['price_cents'] ?? $class['price_cents']);
        $left = max(0, $capacity - ($taken[$s['id']] ?? 0));
        return [
            'id' => (int) $s['id'],
            'class_id' => (int) $s['class_id'],
            'starts_at' => $s['starts_at'],
            'label' => $s['label'],
            'price_cents' => $price,
            'capacity' => $capacity,
            'seats_left' => $left,
            'is_cancelled' => (bool) $s['is_cancelled'],
            'price_override_cents' => $s['price_cents'] === null ? null : (int) $s['price_cents'],
            'capacity_override' => $s['capacity'] === null ? null : (int) $s['capacity'],
        ];
    }

    public static function classes(array $rows, bool $admin = false): array
    {
        if (!$rows) {
            return [];
        }
        $db = Database::get();
        $ids = array_column($rows, 'id');
        $in = implode(',', array_fill(0, count($ids), '?'));
        $sessions = $db->all(
            "SELECT * FROM class_sessions WHERE class_id IN ($in)"
            . ($admin ? '' : ' AND is_cancelled = 0 AND starts_at > NOW()')
            . ' ORDER BY starts_at',
            $ids
        );
        $taken = self::seatsTaken(array_column($sessions, 'id'));
        $imageIds = array_filter(array_column($rows, 'image_id'));
        $images = [];
        if ($imageIds) {
            $inImg = implode(',', array_fill(0, count($imageIds), '?'));
            foreach ($db->all("SELECT * FROM images WHERE id IN ($inImg)", array_values($imageIds)) as $img) {
                $images[$img['id']] = self::image($img);
            }
        }
        $byClass = [];
        $classMap = array_column($rows, null, 'id');
        foreach ($sessions as $s) {
            $byClass[$s['class_id']][] = self::session($s, $classMap[$s['class_id']], $taken);
        }
        return array_map(static function ($c) use ($byClass, $images, $admin) {
            $out = [
                'id' => (int) $c['id'],
                'slug' => $c['slug'],
                'kind' => $c['kind'],
                'title' => $c['title'],
                'description' => (string) $c['description'],
                'duration_minutes' => (int) $c['duration_minutes'],
                'price_cents' => (int) $c['price_cents'],
                'capacity' => (int) $c['capacity'],
                'pay_in_person' => (bool) ($c['pay_in_person'] ?? true),
                'pay_online' => (bool) ($c['pay_online'] ?? true),
                'pay_subscription' => (bool) ($c['pay_subscription'] ?? false),
                'monthly_price_cents' => isset($c['monthly_price_cents']) ? (int) $c['monthly_price_cents'] : null,
                'image' => $images[$c['image_id']] ?? null,
                'sessions' => $byClass[$c['id']] ?? [],
            ];
            if ($admin) {
                $out += ['is_active' => (bool) $c['is_active'], 'sort_order' => (int) $c['sort_order'], 'image_id' => $c['image_id'] ? (int) $c['image_id'] : null];
            }
            return $out;
        }, $rows);
    }

    /* ---------------- Galería ---------------- */

    public static function galleryItem(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'technique' => $row['technique'],
            'year' => $row['year'],
            'availability' => $row['availability'] ?? 'unique',
            'sort_order' => (int) $row['sort_order'],
            'is_published' => (bool) $row['is_published'],
            'image' => self::image([
                'id' => $row['image_id'], 'url' => $row['url'], 'thumb_url' => $row['thumb_url'],
                'width' => $row['width'], 'height' => $row['height'], 'alt' => $row['alt'],
            ]),
        ];
    }

    public static function review(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'author' => $row['author'],
            'context' => $row['context'],
            'body' => $row['body'],
            'rating' => $row['rating'] === null ? null : (int) $row['rating'],
            'review_date' => $row['review_date'],
            'sort_order' => (int) $row['sort_order'],
            'is_published' => (bool) $row['is_published'],
        ];
    }
}
