-- ==========================================================
-- Charria Ceramics · Esquema MySQL (MySQL 5.7+ / 8 o MariaDB 10.4+)
-- Se puede importar desde phpMyAdmin o lo ejecuta /api/setup.
-- Todos los importes se guardan en céntimos (enteros) para evitar
-- errores de redondeo. Las fechas van en la hora local del estudio
-- (APP_TIMEZONE, por defecto Europe/Madrid).
-- ==========================================================

SET NAMES utf8mb4;

-- ---------- Usuarios del panel ----------
CREATE TABLE IF NOT EXISTS admins (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190) NOT NULL,
  name          VARCHAR(120) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesiones del panel: solo se guarda el hash SHA-256 del token
CREATE TABLE IF NOT EXISTS admin_sessions (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id     INT UNSIGNED NOT NULL,
  token_hash   CHAR(64)     NOT NULL,
  ip           VARCHAR(45)  NOT NULL DEFAULT '',
  user_agent   VARCHAR(255) NOT NULL DEFAULT '',
  expires_at   DATETIME     NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_admin (admin_id),
  CONSTRAINT fk_sessions_admin FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Límite de peticiones (login, checkout, reservas...)
CREATE TABLE IF NOT EXISTS rate_limits (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bucket     VARCHAR(190)    NOT NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rate_bucket (bucket, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Clientes ----------
CREATE TABLE IF NOT EXISTS customers (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email       VARCHAR(190) NOT NULL,
  name        VARCHAR(160) NOT NULL DEFAULT '',
  phone       VARCHAR(40)  NOT NULL DEFAULT '',
  street      VARCHAR(255) NOT NULL DEFAULT '',
  city        VARCHAR(120) NOT NULL DEFAULT '',
  postal_code VARCHAR(20)  NOT NULL DEFAULT '',
  country     CHAR(2)      NOT NULL DEFAULT 'ES',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Imágenes (productos, galería y clases) ----------
-- url: ruta pública (/uploads/...) o URL externa en los datos de ejemplo
CREATE TABLE IF NOT EXISTS images (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind       ENUM('product','gallery','class') NOT NULL,
  url        VARCHAR(500) NOT NULL,
  thumb_url  VARCHAR(500) NOT NULL DEFAULT '',
  file_path  VARCHAR(500) NOT NULL DEFAULT '',
  mime       VARCHAR(40)  NOT NULL DEFAULT '',
  width      INT UNSIGNED NOT NULL DEFAULT 0,
  height     INT UNSIGNED NOT NULL DEFAULT 0,
  bytes      INT UNSIGNED NOT NULL DEFAULT 0,
  alt        VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_images_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Productos ----------
CREATE TABLE IF NOT EXISTS products (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug             VARCHAR(160) NOT NULL,
  title            VARCHAR(160) NOT NULL,
  description      TEXT         NULL,
  category         VARCHAR(80)  NOT NULL DEFAULT '',
  price_cents      INT UNSIGNED NOT NULL,
  discount_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
  stock            INT          NOT NULL DEFAULT 0,
  sold_out         TINYINT(1)   NOT NULL DEFAULT 0,  -- interruptor manual "Agotado"
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,  -- visible en la tienda
  weight_grams     INT UNSIGNED NOT NULL DEFAULT 1000,
  length_cm        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  width_cm         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  height_cm        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_active (is_active, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_images (
  product_id INT UNSIGNED NOT NULL,
  image_id   INT UNSIGNED NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, image_id),
  KEY idx_product_images_image (image_id),
  CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_image   FOREIGN KEY (image_id)   REFERENCES images (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Galería ----------
CREATE TABLE IF NOT EXISTS gallery_items (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  image_id     INT UNSIGNED NOT NULL,
  title        VARCHAR(160) NOT NULL,
  technique    VARCHAR(160) NOT NULL DEFAULT '',
  year         VARCHAR(10)  NOT NULL DEFAULT '',
  sort_order   INT          NOT NULL DEFAULT 0,
  is_published TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gallery_order (is_published, sort_order),
  CONSTRAINT fk_gallery_image FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Clases / servicios ----------
-- group: clases con fecha y plazas (se pagan al reservar)
-- private: modalidades de clase privada (se solicitan y el estudio confirma)
CREATE TABLE IF NOT EXISTS classes (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug             VARCHAR(160) NOT NULL,
  kind             ENUM('group','private') NOT NULL DEFAULT 'group',
  title            VARCHAR(160) NOT NULL,
  description      TEXT         NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120,
  price_cents      INT UNSIGNED NOT NULL,
  capacity         SMALLINT UNSIGNED NOT NULL DEFAULT 6,
  image_id         INT UNSIGNED NULL,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order       INT          NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_classes_slug (slug),
  CONSTRAINT fk_classes_image FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Horarios disponibles de cada clase en grupo.
-- price_cents / capacity NULL = se usan los de la clase.
CREATE TABLE IF NOT EXISTS class_sessions (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id     INT UNSIGNED NOT NULL,
  starts_at    DATETIME     NOT NULL,
  label        VARCHAR(120) NOT NULL DEFAULT '',  -- p. ej. "Martes · 12 sesiones"
  price_cents  INT UNSIGNED NULL,
  capacity     SMALLINT UNSIGNED NULL,
  is_cancelled TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sessions_class (class_id, starts_at),
  CONSTRAINT fk_sessions_class FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Reservas ----------
CREATE TABLE IF NOT EXISTS bookings (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference         VARCHAR(20)  NOT NULL,
  class_id          INT UNSIGNED NULL,
  session_id        INT UNSIGNED NULL,
  customer_id       INT UNSIGNED NULL,
  class_title       VARCHAR(160) NOT NULL DEFAULT '',  -- copia por si se borra la clase
  starts_at         DATETIME     NULL,
  seats             SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  unit_price_cents  INT UNSIGNED NOT NULL DEFAULT 0,
  total_cents       INT UNSIGNED NOT NULL DEFAULT 0,
  status            ENUM('requested','pending_payment','confirmed','cancelled') NOT NULL,
  preferred_date    DATE         NULL,  -- solo clases privadas
  preferred_slot    VARCHAR(40)  NOT NULL DEFAULT '',
  notes             TEXT         NULL,
  stripe_session_id VARCHAR(255) NULL,
  expires_at        DATETIME     NULL,  -- fin de la retención de plazas mientras se paga
  paid_at           DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_reference (reference),
  KEY idx_bookings_session (session_id, status),
  KEY idx_bookings_stripe (stripe_session_id),
  CONSTRAINT fk_bookings_class    FOREIGN KEY (class_id)    REFERENCES classes (id)        ON DELETE SET NULL,
  CONSTRAINT fk_bookings_session  FOREIGN KEY (session_id)  REFERENCES class_sessions (id) ON DELETE SET NULL,
  CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id) REFERENCES customers (id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Pedidos de la tienda ----------
CREATE TABLE IF NOT EXISTS orders (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference             VARCHAR(20)  NOT NULL,
  customer_id           INT UNSIGNED NULL,
  status                ENUM('pending','paid','shipped','cancelled','refunded') NOT NULL DEFAULT 'pending',
  currency              CHAR(3)      NOT NULL DEFAULT 'eur',
  subtotal_cents        INT UNSIGNED NOT NULL DEFAULT 0,  -- suma de precios sin descuento
  discount_cents        INT UNSIGNED NOT NULL DEFAULT 0,
  shipping_cents        INT UNSIGNED NOT NULL DEFAULT 0,
  total_cents           INT UNSIGNED NOT NULL DEFAULT 0,
  customer_name         VARCHAR(160) NOT NULL DEFAULT '',
  customer_email        VARCHAR(190) NOT NULL DEFAULT '',
  customer_phone        VARCHAR(40)  NOT NULL DEFAULT '',
  shipping_method       ENUM('delivery','pickup') NOT NULL DEFAULT 'delivery',
  shipping_service_id   VARCHAR(40)  NOT NULL DEFAULT '',
  shipping_service_name VARCHAR(160) NOT NULL DEFAULT '',
  ship_street           VARCHAR(255) NOT NULL DEFAULT '',
  ship_city             VARCHAR(120) NOT NULL DEFAULT '',
  ship_postal_code      VARCHAR(20)  NOT NULL DEFAULT '',
  ship_country          CHAR(2)      NOT NULL DEFAULT 'ES',
  parcel_weight_grams   INT UNSIGNED NOT NULL DEFAULT 0,
  packlink_reference    VARCHAR(80)  NOT NULL DEFAULT '',
  packlink_error        VARCHAR(500) NOT NULL DEFAULT '',
  stripe_session_id     VARCHAR(255) NULL,
  stripe_payment_intent VARCHAR(255) NULL,
  expires_at            DATETIME     NULL,  -- fin de la retención de stock mientras se paga
  paid_at               DATETIME     NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_reference (reference),
  KEY idx_orders_status (status, created_at),
  KEY idx_orders_stripe (stripe_session_id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Líneas del pedido: copian título y precios del momento de la compra
CREATE TABLE IF NOT EXISTS order_items (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id         INT UNSIGNED NOT NULL,
  product_id       INT UNSIGNED NULL,
  title            VARCHAR(160) NOT NULL,
  unit_price_cents INT UNSIGNED NOT NULL,  -- precio sin descuento
  discount_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
  unit_final_cents INT UNSIGNED NOT NULL,  -- precio con descuento
  quantity         SMALLINT UNSIGNED NOT NULL,
  line_total_cents INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_items_order (order_id),
  KEY idx_items_product (product_id),
  CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders (id)   ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Eventos de Stripe ya procesados (el webhook es idempotente)
CREATE TABLE IF NOT EXISTS stripe_events (
  id           VARCHAR(255) NOT NULL,
  type         VARCHAR(80)  NOT NULL,
  processed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
