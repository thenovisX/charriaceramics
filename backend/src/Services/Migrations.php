<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;

/**
 * Cambios de la base de datos para webs ya instaladas.
 * schema.sql siempre tiene el esquema completo (instalaciones nuevas);
 * aquí van los pasos para llevar una instalación antigua hasta él.
 * Se comprueba en cada petición con una sola consulta y cada paso es
 * idempotente (mira si la columna o tabla ya existe antes de crearla),
 * así que actualizar la web es subir el código y nada más.
 */
final class Migrations
{
    /** versión => método. Añadir siempre al final con un número mayor. */
    private const STEPS = [
        1 => 'privacy',
        2 => 'productDetails',
        3 => 'messages',
        4 => 'payInPerson',
        5 => 'classPayments',
        6 => 'bookingCalendar',
        7 => 'weekendHours',
        8 => 'webContent',
        9 => 'displayOptions',
        10 => 'weeklyClasses',
        11 => 'realGallery',
        12 => 'christmasWorkshops',
    ];

    /**
     * Fotos reales de la galería (assets/galeria): nombre, ancho, alto, título,
     * técnica, etiqueta y texto alternativo (seed.sql lleva las mismas).
     */
    private const REAL_GALLERY = [
        ['creafogar-vitrina', 1027, 1078, 'En Creafogar', 'Exposición · Santiago', 'none', 'Piezas de Charria en un armario de madera y sobre una mesa de Creafogar, rúa Nova 24, Santiago de Compostela'],
        ['azul-rosa', 750, 1000, 'Boca rosa', 'Cerámica esmaltada', 'unique', 'Pieza de cerámica azul oscuro con la boca abierta y el interior rosa, sobre tela blanca'],
        ['estrellas', 800, 1000, 'Estrellas de Navidad', 'Cerámica pintada a mano', 'on_request', 'Adornos de Navidad de cerámica en forma de estrella pintados a mano, sobre madera con eucalipto y piñas'],
        ['casita', 1024, 1024, 'Casita blanca', 'Cerámica blanca', 'on_request', 'Casita de cerámica blanca sobre una pila de revistas con ramas de abeto'],
        ['collar-malla', 1200, 514, 'Collar en malla', 'Porcelana y malla', 'unique', 'Escultura alargada a modo de collar con piezas blancas y negras envueltas en malla'],
        ['dos-bocas', 1000, 625, 'Azul de dos bocas', 'Cerámica esmaltada', 'unique', 'Pieza de cerámica esmaltada en azul oscuro con dos bocas e interior rosa, sobre tela blanca'],
        ['envuelta', 1000, 626, 'Forma envuelta', 'Cerámica y media', 'unique', 'Escultura de tono beige envuelta en una media, sobre una peana blanca'],
        ['creafogar-mesa', 896, 1200, 'Mesa en Creafogar', 'Exposición · Santiago', 'none', 'Mesa con piezas de Charria bajo una lámpara de mimbre en Creafogar, Santiago de Compostela'],
        ['encaje', 1232, 1232, 'Encaje y tul', 'Porcelana, encaje y tul', 'unique', 'Escultura de porcelana veteada envuelta en encaje y tul'],
        ['azul-alargada', 1000, 750, 'Azul alargada', 'Cerámica esmaltada', 'unique', 'Pieza alargada de cerámica esmaltada en azul oscuro con la boca rosa, sobre tela blanca'],
    ];

    /**
     * Talleres especiales de Navidad (assets/clases): slug, título, descripción,
     * minutos, precio en céntimos, foto, texto alternativo y fechas (hora de inicio).
     */
    private const CHRISTMAS_WORKSHOPS = [
        ['decora-tus-adornos-navidenos', 'Decora tus adornos navideños',
            'Taller especial de Navidad: decoras 5 piezas ya hechas por Charria Ceramics. El turno de las 11:00 es con brunch y el de las 17:00, con una pequeña merienda.',
            120, 5500, 'adornos-navidad', 'Adornos de Navidad de cerámica en forma de estrella pintados a mano, sobre madera con eucalipto y piñas',
            ['2026-11-28 11:00:00', '2026-11-28 17:00:00']],
        ['crea-tu-casita-de-navidad', 'Crea tu casita de Navidad',
            'Taller especial de Navidad: creas tu propia casita de cerámica, con un pequeño desayuno.',
            180, 6000, 'casita-navidad', 'Casita de cerámica blanca sobre una pila de revistas con ramas de abeto',
            ['2026-11-21 11:00:00']],
    ];

    public static function latest(): int
    {
        return max(array_keys(self::STEPS));
    }

    /** Aplica lo que falte. Si algo falla queda en el log y la web sigue funcionando con lo que haya. */
    public static function run(): void
    {
        $db = Database::get();
        try {
            $applied = array_map('intval', array_column($db->all('SELECT version FROM schema_migrations'), 'version'));
        } catch (\PDOException $e) {
            if (($e->errorInfo[0] ?? '') !== '42S02') {
                throw $e;
            }
            if (!$db->value("SHOW TABLES LIKE 'admins'")) {
                return; // aún sin instalar: lo hará el instalador con schema.sql
            }
            self::createTable();
            $applied = [];
        }
        // Se mira cada paso (no solo el mayor): así da igual en qué orden se fusionen las ramas que añaden pasos
        foreach (self::STEPS as $version => $method) {
            if (in_array($version, $applied, true)) {
                continue;
            }
            self::$method($db);
            $db->exec('INSERT IGNORE INTO schema_migrations (version) VALUES (?)', [$version]);
        }
    }

    /** El instalador crea todo con schema.sql: se marcan los pasos como hechos. */
    public static function markAllApplied(): void
    {
        self::createTable();
        foreach (array_keys(self::STEPS) as $version) {
            Database::get()->exec('INSERT IGNORE INTO schema_migrations (version) VALUES (?)', [$version]);
        }
    }

    private static function createTable(): void
    {
        Database::get()->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (
               version    INT UNSIGNED NOT NULL,
               applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
               PRIMARY KEY (version)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    private static function hasColumn(Database $db, string $table, string $column): bool
    {
        return (bool) $db->value(
            'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$table, $column]
        );
    }

    private static function addColumn(Database $db, string $table, string $column, string $definition): void
    {
        if (!self::hasColumn($db, $table, $column)) {
            $db->pdo()->exec("ALTER TABLE $table ADD COLUMN $column $definition");
        }
    }

    /**
     * 1 · RGPD: perfil y marketing solo con consentimiento, registro de
     * consentimientos, solicitudes de acceso/supresión y datos de contacto
     * propios en cada reserva (para no depender de un perfil de cliente).
     */
    private static function privacy(Database $db): void
    {
        self::addColumn($db, 'customers', 'has_profile', "TINYINT(1) NOT NULL DEFAULT 0 AFTER country");
        self::addColumn($db, 'customers', 'marketing_opt_in', "TINYINT(1) NOT NULL DEFAULT 0 AFTER has_profile");
        self::addColumn($db, 'customers', 'marketing_updated_at', "DATETIME NULL AFTER marketing_opt_in");

        $newBookingColumns = !self::hasColumn($db, 'bookings', 'customer_email');
        self::addColumn($db, 'bookings', 'customer_name', "VARCHAR(160) NOT NULL DEFAULT '' AFTER customer_id");
        self::addColumn($db, 'bookings', 'customer_email', "VARCHAR(190) NOT NULL DEFAULT '' AFTER customer_name");
        self::addColumn($db, 'bookings', 'customer_phone', "VARCHAR(40) NOT NULL DEFAULT '' AFTER customer_email");
        self::addColumn($db, 'bookings', 'privacy_blocked_at', 'DATETIME NULL AFTER paid_at');
        self::addColumn($db, 'orders', 'privacy_blocked_at', 'DATETIME NULL AFTER paid_at');
        if ($newBookingColumns) {
            // Las reservas antiguas tenían el contacto solo en la tabla de clientes
            $db->exec(
                'UPDATE bookings b JOIN customers c ON c.id = b.customer_id
                 SET b.customer_name = c.name, b.customer_email = c.email, b.customer_phone = c.phone'
            );
        }
        if (!$db->value("SHOW INDEX FROM bookings WHERE Key_name = 'idx_bookings_email'")) {
            $db->pdo()->exec('ALTER TABLE bookings ADD KEY idx_bookings_email (customer_email)');
        }
        if (!$db->value("SHOW INDEX FROM orders WHERE Key_name = 'idx_orders_email'")) {
            $db->pdo()->exec('ALTER TABLE orders ADD KEY idx_orders_email (customer_email)');
        }

        self::createTables($db, ['consents', 'privacy_requests']);
        // Los clientes que ya existían se crearon sin pedir permiso: quedan sin perfil
        // (has_profile = 0) y el panel avisa para que se puedan borrar.
    }

    /** 2 · Ficha de producto: medidas, material, cuidados y especificaciones libres. */
    private static function productDetails(Database $db): void
    {
        self::addColumn($db, 'products', 'dimensions', "VARCHAR(160) NOT NULL DEFAULT '' AFTER height_cm");
        self::addColumn($db, 'products', 'material', "VARCHAR(160) NOT NULL DEFAULT '' AFTER dimensions");
        self::addColumn($db, 'products', 'care', 'TEXT NULL AFTER material');
        self::addColumn($db, 'products', 'specs', 'TEXT NULL AFTER care');
    }

    /**
     * 3 · Bandeja de Mensajes: contacto, encargos y clases privadas. Las solicitudes
     * de clase privada que ya había se copian (leídas si ya no están pendientes).
     */
    private static function messages(Database $db): void
    {
        self::createTables($db, ['messages']);
        $db->exec(
            "INSERT INTO messages (type, subject, name, email, phone, body, booking_id, read_at, handled_at, created_at)
             SELECT 'private_class', b.class_title, b.customer_name, b.customer_email, b.customer_phone,
                    CONCAT('Fecha preferida: ', COALESCE(b.preferred_date, '—'), ' (', COALESCE(b.preferred_slot, '—'), ')',
                           IF(COALESCE(b.notes, '') = '', '', CONCAT('\n\n', b.notes))),
                    b.id, IF(b.status = 'requested', NULL, b.created_at), IF(b.status = 'requested', NULL, b.created_at), b.created_at
             FROM bookings b
             WHERE b.session_id IS NULL AND b.preferred_date IS NOT NULL AND b.customer_email <> ''
               AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.booking_id = b.id)"
        );
    }

    /**
     * 4 · Pagar en el taller: cada clase dice si lo admite y cada reserva guarda
     * cómo se paga. Las clases privadas siempre se han cobrado en el estudio.
     */
    private static function payInPerson(Database $db): void
    {
        self::addColumn($db, 'classes', 'pay_in_person', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER capacity');
        if (!self::hasColumn($db, 'bookings', 'payment_method')) {
            self::addColumn($db, 'bookings', 'payment_method', "ENUM('online','in_person') NOT NULL DEFAULT 'online' AFTER total_cents");
            $db->exec("UPDATE bookings SET payment_method = 'in_person' WHERE preferred_date IS NOT NULL AND stripe_session_id IS NULL");
        }
    }

    /**
     * 5 · Formas de pago de las clases: pago único online, suscripción mensual y pagar
     * en el taller se activan por separado en cada clase. Las reservas guardan los datos
     * de la suscripción de Stripe para reflejar si la cuota del mes está pagada.
     */
    private static function classPayments(Database $db): void
    {
        self::addColumn($db, 'classes', 'pay_online', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER pay_in_person');
        self::addColumn($db, 'classes', 'pay_subscription', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER pay_online');
        self::addColumn($db, 'classes', 'monthly_price_cents', 'INT UNSIGNED NULL AFTER pay_subscription');
        $type = (string) $db->value(
            "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'payment_method'"
        );
        if (!str_contains($type, 'subscription')) {
            $db->pdo()->exec("ALTER TABLE bookings MODIFY COLUMN payment_method ENUM('online','in_person','subscription') NOT NULL DEFAULT 'online'");
        }
        self::addColumn($db, 'bookings', 'stripe_subscription_id', 'VARCHAR(255) NULL AFTER stripe_session_id');
        self::addColumn($db, 'bookings', 'subscription_status', "VARCHAR(20) NOT NULL DEFAULT '' AFTER stripe_subscription_id");
        self::addColumn($db, 'bookings', 'paid_until', 'DATETIME NULL AFTER subscription_status');
        if (!$db->value("SHOW INDEX FROM bookings WHERE Key_name = 'idx_bookings_subscription'")) {
            $db->pdo()->exec('ALTER TABLE bookings ADD KEY idx_bookings_subscription (stripe_subscription_id)');
        }
    }

    /**
     * 6 · Calendario de reservas: tipo de cobro (pago único o suscripción mensual),
     * origen (web o añadida a mano) y fecha del último aviso de impago.
     */
    private static function bookingCalendar(Database $db): void
    {
        self::addColumn($db, 'bookings', 'billing_type', "ENUM('single','subscription') NOT NULL DEFAULT 'single' AFTER payment_method");
        self::addColumn($db, 'bookings', 'source', "ENUM('web','manual') NOT NULL DEFAULT 'web' AFTER billing_type");
        self::addColumn($db, 'bookings', 'payment_alert_at', 'DATETIME NULL AFTER paid_at');
    }

    /**
     * 7 · Horario: «Sábados - Domingos: Cerrado» pasa a explicar que el fin de semana
     * se abre solo para clases con reserva. Solo cambia esa línea si está tal cual en
     * Panel → Ajustes → Datos de la web; el resto del horario se queda como esté.
     */
    private static function weekendHours(Database $db): void
    {
        $hours = $db->value("SELECT value FROM settings WHERE name = 'SITE_HOURS'");
        if (!is_string($hours) || $hours === '') {
            return;
        }
        $new = preg_replace(
            '/^(\h*S[áa]bados?\h*[-–—y]\h*Domingos?\h*:?\h*Cerrado)\.?\h*(?=\r?$)/imu',
            '$1 (Abierto exclusivamente para clases programadas con reserva)',
            $hours
        );
        if (is_string($new) && $new !== $hours) {
            $db->exec("UPDATE settings SET value = ? WHERE name = 'SITE_HOURS'", [$new]);
        }
    }

    /**
     * 8 · Contenido de la web: peso de la pieza en la ficha, etiqueta de
     * disponibilidad de cada obra de la galería, fotos sueltas de la web
     * (la del estudio) y reseñas de clientes.
     */
    private static function webContent(Database $db): void
    {
        self::addColumn($db, 'products', 'piece_weight_grams', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER material');
        self::addColumn($db, 'gallery_items', 'availability', "ENUM('unique','on_request','none') NOT NULL DEFAULT 'unique' AFTER year");
        $type = (string) $db->value(
            "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'images' AND COLUMN_NAME = 'kind'"
        );
        if (!str_contains($type, "'site'")) {
            $db->pdo()->exec("ALTER TABLE images MODIFY COLUMN kind ENUM('product','gallery','class','site') NOT NULL");
        }
        self::createTables($db, ['reviews']);
    }

    /**
     * 9 · Medidas de la pieza en campos separados (alto, ancho, fondo, diámetro y
     * capacidad) y, en cada clase, si se enseña la fecha y si el precio es por mes.
     * Las clases que ya se cobran con suscripción pasan a enseñar «por mes».
     */
    private static function displayOptions(Database $db): void
    {
        self::addColumn($db, 'products', 'piece_height_mm', 'SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER dimensions');
        self::addColumn($db, 'products', 'piece_width_mm', 'SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER piece_height_mm');
        self::addColumn($db, 'products', 'piece_depth_mm', 'SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER piece_width_mm');
        self::addColumn($db, 'products', 'piece_diameter_mm', 'SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER piece_depth_mm');
        self::addColumn($db, 'products', 'piece_capacity_ml', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER piece_diameter_mm');
        if (!self::hasColumn($db, 'classes', 'price_period')) {
            self::addColumn($db, 'classes', 'price_period', "ENUM('session','month') NOT NULL DEFAULT 'session' AFTER monthly_price_cents");
            $db->exec("UPDATE classes SET price_period = 'month' WHERE kind = 'group' AND pay_subscription = 1");
        }
        self::addColumn($db, 'classes', 'show_date', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER price_period');
    }

    /**
     * 10 · Clases semanales por día de la semana (weekly_days, weekly_slots y
     * class_sessions.slot_id). Los horarios que ya se repetían cada semana (misma
     * clase, día y hora, sin etiqueta y con 2 o más fechas por venir) pasan solos a
     * «Semanales» y conservan sus fechas y reservas.
     */
    private static function weeklyClasses(Database $db): void
    {
        self::createTables($db, ['weekly_days', 'weekly_slots']);
        self::addColumn($db, 'class_sessions', 'slot_id', 'INT UNSIGNED NULL AFTER is_cancelled');
        if (!$db->value("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'class_sessions' AND INDEX_NAME = 'uq_sessions_slot'")) {
            $db->pdo()->exec('ALTER TABLE class_sessions ADD UNIQUE KEY uq_sessions_slot (slot_id, starts_at)');
        }
        if ($db->value('SELECT COUNT(*) FROM weekly_slots')) {
            return;
        }
        $groups = $db->all(
            "SELECT cs.class_id, WEEKDAY(cs.starts_at) + 1 AS weekday, TIME(cs.starts_at) AS start_time,
                    MIN(cs.price_cents) AS min_price, MAX(cs.price_cents) AS max_price, COUNT(cs.price_cents) AS priced,
                    MIN(cs.capacity) AS min_cap, MAX(cs.capacity) AS max_cap, COUNT(cs.capacity) AS capped,
                    COUNT(*) AS n, c.price_period, c.monthly_price_cents
             FROM class_sessions cs JOIN classes c ON c.id = cs.class_id AND c.kind = 'group'
             WHERE cs.label = '' AND cs.is_cancelled = 0 AND cs.starts_at > NOW() AND cs.slot_id IS NULL
             GROUP BY cs.class_id, WEEKDAY(cs.starts_at), TIME(cs.starts_at), c.price_period, c.monthly_price_cents
             HAVING n >= 2"
        );
        foreach ($groups as $g) {
            // Precio y plazas propios solo si todas las fechas tenían el mismo
            $price = (int) $g['priced'] === (int) $g['n'] && $g['min_price'] === $g['max_price'] ? $g['min_price'] : null;
            $capacity = (int) $g['capped'] === (int) $g['n'] && $g['min_cap'] === $g['max_cap'] ? $g['min_cap'] : null;
            // Una clase «por mes» enseñaba la cuota de la suscripción: ese pasa a ser su precio mensual
            $monthly = $g['price_period'] === 'month';
            if ($monthly && (int) $g['monthly_price_cents'] > 0) {
                $price = (int) $g['monthly_price_cents'];
            }
            $slot = $db->insert('weekly_slots', [
                'weekday' => (int) $g['weekday'], 'class_id' => (int) $g['class_id'], 'start_time' => $g['start_time'],
                'price_cents' => $price, 'capacity' => $capacity, 'price_period' => $monthly ? 'month' : 'session',
            ]);
            $db->exec(
                "UPDATE class_sessions SET slot_id = ?
                 WHERE class_id = ? AND WEEKDAY(starts_at) + 1 = ? AND TIME(starts_at) = ? AND label = '' AND is_cancelled = 0 AND starts_at > NOW() AND slot_id IS NULL",
                [$slot, $g['class_id'], $g['weekday'], $g['start_time']]
            );
        }
    }

    /**
     * 11 · Galería con las fotos reales del estudio en lugar de las fotos de
     * ejemplo (Unsplash) del principio. Solo toca las obras que siguen con una
     * foto de ejemplo; las que ya se subieron desde el panel no cambian.
     */
    private static function realGallery(Database $db): void
    {
        $stock = $db->all(
            "SELECT g.id, g.image_id FROM gallery_items g JOIN images i ON i.id = g.image_id
             WHERE i.url LIKE 'https://images.unsplash.com/%' ORDER BY g.sort_order, g.id"
        );
        // Sin las fotos en el servidor (otra tienda con este mismo backend) no se toca nada
        if (!$stock || !is_file(PUBLIC_DIR . '/assets/galeria/' . self::REAL_GALLERY[0][0] . '.webp')) {
            return;
        }
        $order = (int) $db->value('SELECT COALESCE(MAX(sort_order), 0) FROM gallery_items');
        foreach (self::REAL_GALLERY as $i => [$name, $width, $height, $title, $technique, $availability, $alt]) {
            $image = [
                'url' => "/assets/galeria/$name.webp", 'thumb_url' => "/assets/galeria/$name-800.webp",
                'mime' => 'image/webp', 'width' => $width, 'height' => $height, 'alt' => $alt,
            ];
            $item = ['title' => $title, 'technique' => $technique, 'year' => '2026', 'availability' => $availability];
            if (isset($stock[$i])) {
                $db->update('images', $image, 'id = :id', ['id' => $stock[$i]['image_id']]);
                $db->update('gallery_items', $item, 'id = :id', ['id' => $stock[$i]['id']]);
            } else {
                $imageId = $db->insert('images', ['kind' => 'gallery'] + $image);
                $db->insert('gallery_items', $item + ['image_id' => $imageId, 'sort_order' => ++$order, 'is_published' => 1]);
            }
        }
    }

    /**
     * 12 · Talleres especiales de Navidad de 2026 (clases en grupo con sus fechas
     * en «Fechas especiales»). Se pueden cambiar o borrar desde Panel → Clases.
     * No hace nada en una instalación nueva (sin clases todavía), si las fotos no
     * están en el servidor (otra tienda con este backend) o si el taller ya existe.
     */
    private static function christmasWorkshops(Database $db): void
    {
        if (!$db->value('SELECT COUNT(*) FROM classes') || !is_file(PUBLIC_DIR . '/assets/clases/adornos-navidad.webp')) {
            return;
        }
        // Plazas: las que tienen las demás clases en grupo (6 si no hay ninguna)
        $capacity = (int) ($db->value("SELECT capacity FROM classes WHERE kind = 'group' GROUP BY capacity ORDER BY COUNT(*) DESC, capacity DESC LIMIT 1") ?: 6);
        foreach (self::CHRISTMAS_WORKSHOPS as [$slug, $title, $description, $minutes, $price, $photo, $alt, $dates]) {
            if ($db->value('SELECT 1 FROM classes WHERE slug = ?', [$slug])) {
                continue;
            }
            $imageId = $db->insert('images', [
                'kind' => 'class', 'url' => "/assets/clases/$photo.webp", 'thumb_url' => "/assets/clases/$photo.webp",
                'mime' => 'image/webp', 'width' => 680, 'height' => 889, 'alt' => $alt,
            ]);
            $classId = $db->insert('classes', [
                'slug' => $slug, 'kind' => 'group', 'title' => $title, 'description' => $description,
                'duration_minutes' => $minutes, 'price_cents' => $price, 'capacity' => $capacity,
                'image_id' => $imageId, 'sort_order' => 0,
            ]);
            foreach ($dates as $startsAt) {
                if (strtotime($startsAt) > time()) {
                    $db->insert('class_sessions', ['class_id' => $classId, 'starts_at' => $startsAt]);
                }
            }
        }
    }

    /** Crea tablas nuevas con la misma definición que tienen en schema.sql. */
    private static function createTables(Database $db, array $tables): void
    {
        $sql = file_get_contents(BACKEND_DIR . '/database/schema.sql');
        foreach ($tables as $table) {
            if (preg_match('/CREATE TABLE IF NOT EXISTS ' . $table . ' \(.*?\) ENGINE=[^;]+;/s', $sql, $m)) {
                $db->pdo()->exec(rtrim($m[0], ';'));
            }
        }
    }
}
