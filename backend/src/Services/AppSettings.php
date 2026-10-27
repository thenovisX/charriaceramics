<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;

/**
 * Ajustes que se editan desde el panel (Stripe, Packlink, envíos, emails).
 * Se guardan en la tabla "settings"; las claves secretas van cifradas con
 * libsodium usando APP_KEY (que vive en el .env, fuera de la base de datos),
 * así que una copia de la base de datos por sí sola no revela las claves.
 * En cada petición se cargan sobre Env, por lo que el resto del código sigue
 * usando Env::get() y lo del panel tiene prioridad sobre el .env.
 */
final class AppSettings
{
    /** clave => [tipo, secreto] */
    public const KEYS = [
        // Datos públicos de la web (pie, menú, contacto). Ver PUBLIC_KEYS.
        'SITE_ADDRESS' => ['text', false],
        'SITE_CITY' => ['text', false],
        'SITE_HOURS' => ['multiline', false],
        'SITE_EMAIL' => ['email', false],
        'SITE_PHONE' => ['phone', false],
        'SITE_WHATSAPP' => ['phone', false],
        'SITE_INSTAGRAM' => ['url', false],
        'SITE_FACEBOOK' => ['url', false],
        'SITE_TIKTOK' => ['url', false],
        'SITE_MAPS_URL' => ['url', false],
        // Portada · El estudio: texto sobre el proceso y foto (la foto se sube aparte, ver setStudioImage)
        'SITE_STUDIO_TEXT' => ['longtext', false],
        'SITE_STUDIO_IMAGE' => ['image_id', false],
        // Tienda abierta o cerrada (por defecto abierta) y aviso opcional mientras está cerrada
        'SHOP_OPEN' => ['bool', false],
        'SHOP_CLOSED_MESSAGE' => ['text', false],
        // Titular de la web (aviso legal, privacidad, condiciones: LSSI art. 10) y analítica
        'LEGAL_OWNER' => ['text', false],
        'LEGAL_TAX_ID' => ['tax_id', false],
        'LEGAL_ADDRESS' => ['text', false],
        'LEGAL_EMAIL' => ['email', false],
        'LEGAL_REGISTRY' => ['text', false],
        'GA_MEASUREMENT_ID' => ['ga_id', false],
        'STRIPE_SECRET_KEY' => ['stripe_key', true],
        'STRIPE_WEBHOOK_SECRET' => ['webhook_secret', true],
        'PACKLINK_API_KEY' => ['packlink_key', true],
        'PACKLINK_SENDER_NAME' => ['text', false],
        'PACKLINK_SENDER_SURNAME' => ['text', false],
        'PACKLINK_SENDER_COMPANY' => ['text', false],
        'PACKLINK_SENDER_STREET' => ['text', false],
        'PACKLINK_SENDER_ZIP' => ['zip', false],
        'PACKLINK_SENDER_CITY' => ['text', false],
        'PACKLINK_SENDER_COUNTRY' => ['country', false],
        'PACKLINK_SENDER_PHONE' => ['text', false],
        'PACKLINK_SENDER_EMAIL' => ['email', false],
        'SHIPPING_PICKUP' => ['bool', false],
        'SHIPPING_FLAT_NAME' => ['text', false],
        'SHIPPING_FLAT_CENTS' => ['cents', false],
        'SHIPPING_FREE_FROM_CENTS' => ['cents', false],
        'SHIPPING_MARKUP_CENTS' => ['cents', false],
        // Correo: cómo se envían los emails (Mailer) y a quién llegan los avisos
        'MAIL_PROVIDER' => ['mail_provider', false],
        'MAIL_FROM' => ['email', false],
        'MAIL_FROM_NAME' => ['text', false],
        'MAIL_ADMIN' => ['email', false],
        'SMTP_HOST' => ['host', false],
        'SMTP_PORT' => ['port', false],
        'SMTP_USER' => ['text', false],
        'SMTP_PASS' => ['smtp_pass', true],
    ];

    /** Claves que se pueden enseñar en la web pública (GET /site) → nombre en la respuesta. */
    public const PUBLIC_KEYS = [
        'SITE_ADDRESS' => 'address', 'SITE_CITY' => 'city', 'SITE_HOURS' => 'hours',
        'SITE_EMAIL' => 'email', 'SITE_PHONE' => 'phone', 'SITE_WHATSAPP' => 'whatsapp',
        'SITE_INSTAGRAM' => 'instagram', 'SITE_FACEBOOK' => 'facebook', 'SITE_TIKTOK' => 'tiktok',
        'SITE_MAPS_URL' => 'maps_url', 'SITE_STUDIO_TEXT' => 'studio_text',
        'LEGAL_OWNER' => 'legal_owner', 'LEGAL_TAX_ID' => 'legal_tax_id', 'LEGAL_ADDRESS' => 'legal_address',
        'LEGAL_EMAIL' => 'legal_email', 'LEGAL_REGISTRY' => 'legal_registry', 'GA_MEASUREMENT_ID' => 'ga_id',
    ];

    public static function shopOpen(): bool
    {
        return Env::get('SHOP_OPEN') !== 'false';
    }

    /** Datos del titular que tienen que estar rellenos para que las páginas legales estén completas. */
    public const LEGAL_REQUIRED = ['LEGAL_OWNER', 'LEGAL_TAX_ID', 'LEGAL_ADDRESS', 'LEGAL_EMAIL'];

    public static function legalMissing(): array
    {
        return array_values(array_filter(self::LEGAL_REQUIRED, static fn ($k) => !Env::get($k)));
    }

    /** Datos de contacto para la web: solo lo que se ha rellenado en el panel (o en el .env). */
    public static function publicSite(): array
    {
        $out = [];
        foreach (self::PUBLIC_KEYS as $key => $name) {
            $out[$name] = Env::get($key);
        }
        $out['studio_image'] = self::studioImage();
        $out['shop_open'] = self::shopOpen();
        $out['shop_message'] = Env::get('SHOP_CLOSED_MESSAGE') ?: 'No disponible en estos momentos';
        return $out;
    }

    /** Foto de la sección «El estudio» de la portada (null = la de ejemplo del HTML). */
    public static function studioImage(): ?array
    {
        $id = (string) Env::get('SITE_STUDIO_IMAGE');
        if (!ctype_digit($id)) {
            return null;
        }
        return Catalog::image(Database::get()->one('SELECT * FROM images WHERE id = ?', [(int) $id]));
    }

    /** Cambia (o quita, con null) la foto del estudio y borra la anterior. */
    public static function setStudioImage(?int $imageId): void
    {
        $old = self::studioImage();
        $db = Database::get();
        self::ensureTable();
        if ($imageId === null) {
            $db->exec("DELETE FROM settings WHERE name = 'SITE_STUDIO_IMAGE'");
        } else {
            $db->exec(
                "INSERT INTO settings (name, value, is_secret) VALUES ('SITE_STUDIO_IMAGE', ?, 0)
                 ON DUPLICATE KEY UPDATE value = VALUES(value)",
                [(string) $imageId]
            );
        }
        if ($old && $old['id'] !== $imageId) {
            ImageProcessor::delete($old['id']);
        }
        Env::override(['SITE_STUDIO_IMAGE' => $imageId === null ? null : (string) $imageId]);
    }

    /** Carga los ajustes del panel sobre Env. Si aún no hay tabla o base de datos, no hace nada. */
    public static function boot(): void
    {
        if (!Env::get('DB_NAME')) {
            return;
        }
        try {
            $rows = Database::get()->all('SELECT name, value, is_secret FROM settings');
        } catch (\Throwable) {
            return;
        }
        $values = [];
        foreach ($rows as $row) {
            if (!isset(self::KEYS[$row['name']])) {
                continue;
            }
            $value = $row['is_secret'] ? self::decrypt((string) $row['value']) : (string) $row['value'];
            if ($value !== null) {
                $values[$row['name']] = $value;
            }
        }
        Env::override($values);
    }

    /** Valores para el panel: los secretos nunca se devuelven, solo si están puestos y sus 4 últimos caracteres. */
    public static function forPanel(): array
    {
        self::ensureTable(); // instalaciones anteriores a esta tabla
        $stored = array_column(Database::get()->all('SELECT name FROM settings'), 'name', 'name');
        $values = [];
        $secrets = [];
        foreach (self::KEYS as $key => [$type, $secret]) {
            $value = Env::get($key);
            if ($secret) {
                $secrets[$key] = [
                    'set' => $value !== null,
                    'hint' => $value ? '…' . substr($value, -4) : '',
                    'source' => isset($stored[$key]) ? 'panel' : ($value ? 'env' : ''),
                ];
            } else {
                $values[$key] = $value;
            }
        }
        $stripeKey = Env::get('STRIPE_SECRET_KEY') ?? '';
        return [
            'values' => $values,
            'secrets' => $secrets,
            'studio_image' => self::studioImage(),
            'mail_provider' => Mailer::provider(),
            'stripe_mode' => str_contains($stripeKey, '_live_') ? 'live' : ($stripeKey ? 'test' : ''),
            'webhook_url' => Settings::appUrl() . '/api/webhooks/stripe',
            'webhook_events' => ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted'],
        ];
    }

    /**
     * Guarda los ajustes enviados. Un secreto vacío se deja como estaba;
     * para borrarlo se incluye su nombre en $clear.
     */
    public static function save(array $input, array $clear = []): void
    {
        $errors = [];
        $toSave = [];
        foreach ($input as $key => $raw) {
            if (!isset(self::KEYS[$key])) {
                continue;
            }
            [$type, $secret] = self::KEYS[$key];
            if ($type === 'image_id') {
                continue; // la foto se cambia con su propia subida
            }
            $value = is_bool($raw) ? ($raw ? 'true' : 'false') : trim(str_replace("\r\n", "\n", (string) $raw));
            if ($type !== 'multiline' && $type !== 'longtext') {
                $value = preg_replace('/\s*\n\s*/', ' ', $value);
            }
            if ($type === 'ga_id' || $type === 'tax_id') {
                $value = strtoupper($value);
            }
            if ($type === 'smtp_pass' && preg_match('/^([a-z]{4} ?){4}$/i', $value)) {
                $value = str_replace(' ', '', $value); // contraseña de aplicación de Google copiada con espacios
            }
            if ($type === 'host') {
                $value = strtolower($value);
            }
            if ($secret && $value === '') {
                continue; // vacío = no cambiar
            }
            $error = self::check($type, $value);
            if ($error) {
                $errors[$key] = $error;
                continue;
            }
            $toSave[$key] = [$value, $secret];
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }

        $db = Database::get();
        self::ensureTable();
        foreach ($toSave as $key => [$value, $secret]) {
            if ($value === '') {
                $db->exec('DELETE FROM settings WHERE name = ?', [$key]);
                continue;
            }
            $db->exec(
                'INSERT INTO settings (name, value, is_secret) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value), is_secret = VALUES(is_secret)',
                [$key, $secret ? self::encrypt($value) : $value, (int) $secret]
            );
        }
        foreach ($clear as $key) {
            if (is_string($key) && isset(self::KEYS[$key])) {
                $db->exec('DELETE FROM settings WHERE name = ?', [$key]);
            }
        }
        self::boot();
    }

    public static function ensureTable(): void
    {
        Database::get()->exec(
            'CREATE TABLE IF NOT EXISTS settings (
               name       VARCHAR(80) NOT NULL,
               value      TEXT        NOT NULL,
               is_secret  TINYINT(1)  NOT NULL DEFAULT 0,
               updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
               PRIMARY KEY (name)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    private static function check(string $type, string $value): ?string
    {
        if ($value === '') {
            return null; // campo normal vacío = volver al valor por defecto
        }
        return match ($type) {
            'stripe_key' => preg_match('/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/', $value) ? null : 'Debe empezar por sk_test_ o sk_live_ (la clave SECRETA, no la publicable pk_)',
            'webhook_secret' => preg_match('/^whsec_[A-Za-z0-9+\/=]{10,}$/', $value) ? null : 'Debe empezar por whsec_',
            'packlink_key' => preg_match('/^[A-Za-z0-9_\-]{10,200}$/', $value) ? null : 'Clave de Packlink no válida',
            'email' => filter_var($value, FILTER_VALIDATE_EMAIL) ? null : 'Email no válido',
            'country' => preg_match('/^[A-Z]{2}$/', $value) ? null : 'Código de país de 2 letras (ES)',
            'zip' => preg_match('/^[A-Za-z0-9 -]{3,12}$/', $value) ? null : 'Código postal no válido',
            'cents' => ctype_digit($value) && (int) $value <= 100_000_00 ? null : 'Importe no válido',
            'bool' => in_array($value, ['true', 'false'], true) ? null : 'Debe ser sí o no',
            'multiline' => mb_strlen($value) <= 500 ? null : 'Máximo 500 caracteres',
            'longtext' => mb_strlen($value) <= 1500 ? null : 'Máximo 1.500 caracteres',
            'tax_id' => preg_match('/^[A-Za-z0-9]{1,3}[- ]?[0-9]{5,8}[- ]?[A-Za-z0-9]?$/', $value) ? null : 'NIF o CIF no válido (p. ej. 12345678Z o B12345678)',
            'ga_id' => preg_match('/^G-[A-Z0-9]{4,15}$/', $value) ? null : 'El ID de Google Analytics 4 empieza por G- (p. ej. G-AB12CD34EF)',
            'phone' => preg_match('/^\+?[0-9 ().-]{6,20}$/', $value) ? null : 'Teléfono no válido (p. ej. +34 600 000 000)',
            'mail_provider' => in_array($value, Mailer::PROVIDERS, true) ? null : 'Elige cómo enviar los emails',
            'host' => preg_match('/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/', $value) ? null : 'Servidor no válido (p. ej. smtp.hostinger.com)',
            'port' => in_array($value, ['465', '587', '25', '2525'], true) ? null : 'Puerto 465 (SSL) o 587 (STARTTLS)',
            'smtp_pass' => mb_strlen($value) <= 200 ? null : 'Contraseña demasiado larga',
            'url' => preg_match('#^https://[^\s<>"]{4,300}$#', $value) ? null : 'Pega el enlace completo, empezando por https://',
            default => mb_strlen($value) <= 255 ? null : 'Máximo 255 caracteres',
        };
    }

    /* ---------- Cifrado ---------- */

    private static function key(): string
    {
        $appKey = Env::get('APP_KEY');
        if ($appKey && ($raw = base64_decode($appKey, true)) !== false && strlen($raw) === SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
            return $raw;
        }
        // Instalaciones con .env escrito a mano sin APP_KEY: clave derivada de datos que no están en la BD
        return hash('sha256', 'charria|' . Env::get('DB_PASS', '') . '|' . Env::get('DB_NAME', ''), true);
    }

    /** Firma HMAC con APP_KEY (enlaces de baja, huellas de emails borrados). */
    public static function sign(string $data): string
    {
        return hash_hmac('sha256', $data, self::key());
    }

    private static function encrypt(string $plain): string
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return 'v1:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, self::key()));
    }

    private static function decrypt(string $stored): ?string
    {
        if (!str_starts_with($stored, 'v1:')) {
            return null;
        }
        $raw = base64_decode(substr($stored, 3), true);
        if ($raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return null;
        }
        $plain = sodium_crypto_secretbox_open(
            substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            self::key()
        );
        if ($plain === false) {
            Log::error('No se pudo descifrar un ajuste (¿ha cambiado APP_KEY?)');
            return null;
        }
        return $plain;
    }
}
