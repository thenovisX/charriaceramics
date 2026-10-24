-- ==========================================================
-- Datos de ejemplo: las piezas, la galería y las clases que ya
-- mostraba la web. Se pueden borrar después desde el panel.
-- Solo se insertan si las tablas están vacías (lo hace /api/setup).
-- ==========================================================

SET NAMES utf8mb4;

INSERT INTO images (id, kind, url, width, height, alt) VALUES
  (1,  'product', 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Cuencos de gres'),
  (2,  'product', 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Jarrón de cerámica'),
  (3,  'product', 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Taza de cerámica esmaltada'),
  (4,  'product', 'https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Plato de cerámica'),
  (5,  'product', 'https://images.unsplash.com/photo-1594732832278-abd644401426?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Set de cerámica'),
  (6,  'product', 'https://images.unsplash.com/photo-1590422749897-47036da0b0ff?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Florero de barro'),
  (7,  'product', 'https://images.unsplash.com/photo-1610701596061-2ecf227e85b2?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Cuencos blancos apilados'),
  (8,  'product', 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Vasija escultórica de cerámica'),
  (9,  'product', 'https://images.unsplash.com/photo-1603204077779-bed963ea7d0e?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Vasija de barro'),
  (10, 'product', 'https://images.unsplash.com/photo-1631125915902-d8abe9225ff2?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Vajilla de cerámica sobre mesa'),
  (11, 'gallery', 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=1600&q=80', 1600, 1000, 'Escultura de cerámica'),
  (12, 'gallery', 'https://images.unsplash.com/photo-1610701596061-2ecf227e85b2?auto=format&fit=crop&w=1600&q=80', 1600, 1000, 'Cuencos apilados'),
  (13, 'gallery', 'https://images.unsplash.com/photo-1603204077779-bed963ea7d0e?auto=format&fit=crop&w=1600&q=80', 1600, 1000, 'Vasija de barro'),
  (14, 'gallery', 'https://images.unsplash.com/photo-1631125915902-d8abe9225ff2?auto=format&fit=crop&w=1600&q=80', 1600, 1000, 'Cerámica sobre mesa'),
  (15, 'gallery', 'https://images.unsplash.com/photo-1607344645866-009c320b63e0?auto=format&fit=crop&w=1600&q=80', 1600, 1000, 'Piezas de cerámica'),
  (16, 'gallery', 'https://images.unsplash.com/photo-1571950484368-7b15b0a5ad46?auto=format&fit=crop&w=1600&q=80', 1600, 1000, 'Detalle de esmalte'),
  (17, 'gallery', 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1600&q=80', 1600, 1000, 'Jarrones de cerámica sobre fondo neutro'),
  (18, 'gallery', 'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?auto=format&fit=crop&w=1600&q=80', 1600, 1000, 'Manos modelando barro en el torno'),
  (19, 'class',   'https://images.unsplash.com/photo-1544967082-d9d25d867d66?auto=format&fit=crop&w=700&q=80', 700, 875, 'Torno de alfarero'),
  (20, 'class',   'https://images.unsplash.com/photo-1493106641515-6b5631de4bb9?auto=format&fit=crop&w=700&q=80', 700, 875, 'Modelado a mano'),
  (21, 'class',   'https://images.unsplash.com/photo-1556011284-54aa6466d402?auto=format&fit=crop&w=700&q=80', 700, 875, 'Esmaltes'),
  (22, 'class',   'https://images.unsplash.com/photo-1525974160448-038dacadcc71?auto=format&fit=crop&w=700&q=80', 700, 875, 'Curso de torno');

INSERT INTO products (id, slug, title, description, category, price_cents, stock, weight_grams, created_at) VALUES
  (1,  'cuenco-arena',   'Cuenco Arena',   'Cuenco de gres torneado a mano con esmalte arena.',   'Cuencos',  3800,  3, 600,  '2026-10-20 10:00:00'),
  (2,  'jarron-duna',    'Jarrón Duna',    'Jarrón de gres con textura de duna.',                 'Jarrones', 7200,  2, 1400, '2026-10-18 10:00:00'),
  (3,  'taza-niebla',    'Taza Niebla',    'Taza esmaltada en gris niebla, 250 ml.',              'Tazas',    2600,  6, 350,  '2026-10-15 10:00:00'),
  (4,  'plato-sal',      'Plato Sal',      'Plato llano de 26 cm en blanco sal.',                 'Platos',   3200,  5, 800,  '2026-10-12 10:00:00'),
  (5,  'set-alba',       'Set Alba',       'Set de dos tazas y dos platos de postre.',            'Sets',     11000, 2, 2200, '2026-10-08 10:00:00'),
  (6,  'florero-ocre',   'Florero Ocre',   'Florero de barro con engobe ocre.',                   'Jarrones', 5400,  1, 900,  '2026-10-02 10:00:00'),
  (7,  'cuenco-lino',    'Cuenco Lino',    'Cuenco blanco con borde irregular.',                  'Cuencos',  3400,  4, 550,  '2026-09-26 10:00:00'),
  (8,  'vasija-raiz',    'Vasija Raíz',    'Pieza escultórica de la serie Raíz.',                 'Jarrones', 9500,  1, 2000, '2026-09-19 10:00:00'),
  (9,  'vasija-tierra',  'Vasija Tierra',  'Vasija de barro rojo bruñido.',                       'Jarrones', 8400,  1, 1800, '2026-09-10 10:00:00'),
  (10, 'set-mesa-lenta', 'Set Mesa Lenta', 'Vajilla para dos: platos, cuencos y tazas.',          'Sets',     14000, 1, 4000, '2026-09-01 10:00:00');

INSERT INTO product_images (product_id, image_id, sort_order) VALUES
  (1, 1, 0), (2, 2, 0), (3, 3, 0), (4, 4, 0), (5, 5, 0), (6, 6, 0), (7, 7, 0), (8, 8, 0), (9, 9, 0), (10, 10, 0);

INSERT INTO gallery_items (image_id, title, technique, year, sort_order) VALUES
  (11, 'Serie Raíz',        'Gres y engobe',           '2025', 1),
  (12, 'Silencio blanco',   'Porcelana sin esmaltar',  '2025', 2),
  (13, 'Vasija nº 7',       'Torno, cocción a leña',   '2025', 3),
  (14, 'Mesa de taller',    'Vajilla de uso diario',   '2024', 4),
  (15, 'Tierra cocida',     'Barro rojo bruñido',      '2024', 5),
  (16, 'Ceniza',            'Esmalte de ceniza',       '2024', 6),
  (17, 'Tres formas',       'Gres blanco',             '2024', 7),
  (18, 'Manos en el torno', 'El estudio',              '2023', 8);

INSERT INTO classes (id, slug, kind, title, description, duration_minutes, price_cents, capacity, image_id, sort_order) VALUES
  (1, 'iniciacion-torno',   'group',   'Iniciación al torno',                'Primer contacto con el torno: centrado, apertura y subida de paredes.', 180, 6500,  6, 19, 1),
  (2, 'modelado-a-mano',    'group',   'Modelado a mano: pellizco y churro', 'Técnicas de modelado sin torno para crear tus propias piezas.',       150, 5500,  6, 20, 2),
  (3, 'esmaltes-y-color',   'group',   'Esmaltes y color',                   'Aprende a esmaltar y a combinar colores sobre piezas bizcochadas.',  180, 7000,  6, 21, 3),
  (4, 'curso-trimestral',   'group',   'Curso trimestral de torno',          'Doce sesiones semanales para dominar el torno.',                     120, 39000, 6, 22, 4),
  (5, 'privada-1-persona',  'private', '1 persona · 2 h',                    'Clase privada para una persona.',                                    120, 9000,  1, NULL, 10),
  (6, 'privada-2-personas', 'private', '2 personas · 2 h',                   'Clase privada para dos personas.',                                   120, 15000, 2, NULL, 11),
  (7, 'privada-pack-4',     'private', 'Pack 4 sesiones',                    'Cuatro sesiones privadas de 2 horas.',                               480, 32000, 1, NULL, 12);

INSERT INTO class_sessions (class_id, starts_at, label, capacity) VALUES
  (1, '2026-11-08 10:00:00', '', 4),
  (2, '2026-11-13 18:30:00', '', 2),
  (3, '2026-11-22 11:00:00', '', NULL),
  (4, '2026-11-03 19:00:00', 'Martes · 12 sesiones', NULL);
