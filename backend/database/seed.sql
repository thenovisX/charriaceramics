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
  (22, 'class',   'https://images.unsplash.com/photo-1525974160448-038dacadcc71?auto=format&fit=crop&w=700&q=80', 700, 875, 'Curso de torno'),
  -- Segundas fotos de algunas piezas (se ven al pasar el ratón y en la ficha)
  (23, 'product', 'https://images.unsplash.com/photo-1571950484368-7b15b0a5ad46?auto=format&fit=crop&w=900&h=1125&q=80', 900, 1125, 'Detalle del esmalte'),
  (24, 'product', 'https://images.unsplash.com/photo-1607344645866-009c320b63e0?auto=format&fit=crop&w=900&h=1125&q=80', 900, 1125, 'Piezas de barro en el estudio'),
  (25, 'product', 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=900&h=1125&q=80', 900, 1125, 'Piezas de gres blanco'),
  (26, 'product', 'https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?auto=format&fit=crop&w=900&h=1125&q=80', 900, 1125, 'Plato de la vajilla'),
  (27, 'product', 'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?auto=format&fit=crop&w=900&h=1125&q=80', 900, 1125, 'Manos en el torno');

INSERT INTO products (id, slug, title, description, category, price_cents, stock, weight_grams, dimensions, material, care, specs, created_at) VALUES
  (1, 'cuenco-arena', 'Cuenco Arena', 'Cuenco de gres torneado a mano con esmalte arena.', 'Cuencos', 3800, 3, 600, 'Alto 7 cm × Ø 14 cm', 'Gres', 'Apto para lavavajillas y microondas.', '[{"label":"Capacidad","value":"450 ml"},{"label":"Acabado","value":"Esmalte satinado arena"}]', '2026-10-20 10:00:00'),
  (2, 'jarron-duna', 'Jarrón Duna', 'Jarrón de gres con textura de duna.', 'Jarrones', 7200, 2, 1400, 'Ø 12 × 28 cm', 'Gres chamotado', 'Lavar a mano o en programa suave. Evita los cambios bruscos de temperatura.', '[{"label":"Apto para agua","value":"Sí, interior esmaltado"}]', '2026-10-18 10:00:00'),
  (3, 'taza-niebla', 'Taza Niebla', 'Taza esmaltada en gris niebla, 250 ml.', 'Tazas', 2600, 6, 350, 'Ø 8 × 9 cm', 'Gres', 'Lavar a mano o en programa suave. Evita los cambios bruscos de temperatura.', '[{"label":"Capacidad","value":"250 ml"},{"label":"Microondas","value":"Sí"}]', '2026-10-15 10:00:00'),
  (4, 'plato-sal', 'Plato Sal', 'Plato llano de 26 cm en blanco sal.', 'Platos', 3200, 5, 800, 'Ø 26 cm', 'Gres blanco', 'Lavar a mano o en programa suave. Evita los cambios bruscos de temperatura.', '[]', '2026-10-12 10:00:00'),
  (5, 'set-alba', 'Set Alba', 'Set de dos tazas y dos platos de postre.', 'Sets', 11000, 2, 2200, 'Tazas Ø 8 × 9 cm · platos Ø 20 cm', 'Gres', 'Lavar a mano o en programa suave. Evita los cambios bruscos de temperatura.', '[{"label":"Incluye","value":"2 tazas y 2 platos"}]', '2026-10-08 10:00:00'),
  (6, 'florero-ocre', 'Florero Ocre', 'Florero de barro con engobe ocre.', 'Jarrones', 5400, 1, 900, 'Ø 10 × 18 cm', 'Barro rojo y engobe', 'Lavar a mano o en programa suave. Evita los cambios bruscos de temperatura.', '[]', '2026-10-02 10:00:00'),
  (7, 'cuenco-lino', 'Cuenco Lino', 'Cuenco blanco con borde irregular.', 'Cuencos', 3400, 4, 550, 'Ø 13 × 6 cm', 'Porcelana', 'Lavar a mano o en programa suave. Evita los cambios bruscos de temperatura.', '[]', '2026-09-26 10:00:00'),
  (8, 'vasija-raiz', 'Vasija Raíz', 'Pieza escultórica de la serie Raíz.', 'Jarrones', 9500, 1, 2000, 'Ø 18 × 32 cm', 'Gres y engobe', 'Limpiar con un paño seco. Pieza decorativa: no apta para alimentos.', '[{"label":"Uso","value":"Decorativo"}]', '2026-09-19 10:00:00'),
  (9, 'vasija-tierra', 'Vasija Tierra', 'Vasija de barro rojo bruñido.', 'Jarrones', 8400, 1, 1800, 'Ø 20 × 26 cm', 'Barro rojo bruñido', 'Limpiar con un paño seco. Pieza decorativa: no apta para alimentos.', '[{"label":"Uso","value":"Decorativo"}]', '2026-09-10 10:00:00'),
  (10, 'set-mesa-lenta', 'Set Mesa Lenta', 'Vajilla para dos: platos, cuencos y tazas.', 'Sets', 14000, 1, 4000, 'Platos Ø 26 cm · cuencos Ø 14 cm · tazas Ø 8 cm', 'Gres', 'Lavar a mano o en programa suave. Evita los cambios bruscos de temperatura.', '[{"label":"Incluye","value":"2 platos, 2 cuencos y 2 tazas"}]', '2026-09-01 10:00:00');

INSERT INTO product_images (product_id, image_id, sort_order) VALUES
  (1, 1, 0), (2, 2, 0), (3, 3, 0), (4, 4, 0), (5, 5, 0), (6, 6, 0), (7, 7, 0), (8, 8, 0), (9, 9, 0), (10, 10, 0),
  (1, 23, 1), (2, 24, 1), (7, 25, 1), (10, 26, 1), (3, 27, 1);

INSERT INTO gallery_items (image_id, title, technique, year, availability, sort_order) VALUES
  (11, 'Serie Raíz',        'Gres y engobe',           '2025', 'unique',     1),
  (12, 'Silencio blanco',   'Porcelana sin esmaltar',  '2025', 'on_request', 2),
  (13, 'Vasija nº 7',       'Torno, cocción a leña',   '2025', 'unique',     3),
  (14, 'Mesa de taller',    'Vajilla de uso diario',   '2024', 'on_request', 4),
  (15, 'Tierra cocida',     'Barro rojo bruñido',      '2024', 'unique',     5),
  (16, 'Ceniza',            'Esmalte de ceniza',       '2024', 'on_request', 6),
  (17, 'Tres formas',       'Gres blanco',             '2024', 'unique',     7),
  (18, 'Manos en el torno', 'El estudio',              '2023', 'none',       8);

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
