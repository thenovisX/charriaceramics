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
