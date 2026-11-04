-- ==========================================================
-- Datos de ejemplo: las piezas, la galería y las clases que ya
-- mostraba la web. Se pueden borrar después desde el panel.
-- Solo se insertan si las tablas están vacías (lo hace /api/setup).
-- ==========================================================

SET NAMES utf8mb4;

INSERT INTO images (id, kind, url, width, height, alt) VALUES
  (1,  'product', 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Cuencos de gres torneados a mano con esmalte arena'),
  (2,  'product', 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Jarrón de gres torneado a mano con textura de duna'),
  (3,  'product', 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Taza de gres torneada a mano con esmalte gris niebla'),
  (4,  'product', 'https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Plato de gres hecho a mano con esmalte blanco sal'),
  (5,  'product', 'https://images.unsplash.com/photo-1594732832278-abd644401426?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Set de piezas de gres hechas a mano en tonos claros'),
  (6,  'product', 'https://images.unsplash.com/photo-1590422749897-47036da0b0ff?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Florero de barro torneado a mano en tono ocre'),
  (7,  'product', 'https://images.unsplash.com/photo-1610701596061-2ecf227e85b2?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Cuencos blancos de gres con borde irregular apilados'),
  (8,  'product', 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Vasija escultórica de gres con engobe y formas orgánicas'),
  (9,  'product', 'https://images.unsplash.com/photo-1603204077779-bed963ea7d0e?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Vasija de barro torneada a mano con cocción a leña'),
  (10, 'product', 'https://images.unsplash.com/photo-1631125915902-d8abe9225ff2?auto=format&fit=crop&w=900&q=80', 900, 1125, 'Vajilla de gres hecha a mano sobre una mesa de madera'),
  (19, 'class',   'https://images.unsplash.com/photo-1544967082-d9d25d867d66?auto=format&fit=crop&w=700&q=80', 700, 875, 'Torno de alfarero con una pieza de barro en proceso'),
  (20, 'class',   'https://images.unsplash.com/photo-1493106641515-6b5631de4bb9?auto=format&fit=crop&w=700&q=80', 700, 875, 'Manos modelando barro con la técnica de pellizco'),
  (21, 'class',   'https://images.unsplash.com/photo-1556011284-54aa6466d402?auto=format&fit=crop&w=700&q=80', 700, 875, 'Botes de esmalte y pinceles para esmaltar cerámica'),
  (22, 'class',   'https://images.unsplash.com/photo-1525974160448-038dacadcc71?auto=format&fit=crop&w=700&q=80', 700, 875, 'Alumna centrando barro en el torno durante el curso'),
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

-- Galería: fotos reales del estudio (assets/galeria, en webp con miniatura de 800 px)
INSERT INTO images (id, kind, url, thumb_url, width, height, alt) VALUES
  (11, 'gallery', '/assets/galeria/creafogar-vitrina.webp', '/assets/galeria/creafogar-vitrina-800.webp', 1027, 1078, 'Piezas de Charria en un armario de madera y sobre una mesa de Creafogar, rúa Nova 24, Santiago de Compostela'),
  (12, 'gallery', '/assets/galeria/azul-rosa.webp', '/assets/galeria/azul-rosa-800.webp', 750, 1000, 'Pieza de cerámica azul oscuro con la boca abierta y el interior rosa, sobre tela blanca'),
  (13, 'gallery', '/assets/galeria/estrellas.webp', '/assets/galeria/estrellas-800.webp', 800, 1000, 'Adornos de Navidad de cerámica en forma de estrella pintados a mano, sobre madera con eucalipto y piñas'),
  (14, 'gallery', '/assets/galeria/casita.webp', '/assets/galeria/casita-800.webp', 1024, 1024, 'Casita de cerámica blanca sobre una pila de revistas con ramas de abeto'),
  (15, 'gallery', '/assets/galeria/collar-malla.webp', '/assets/galeria/collar-malla-800.webp', 1200, 514, 'Escultura alargada a modo de collar con piezas blancas y negras envueltas en malla'),
  (16, 'gallery', '/assets/galeria/dos-bocas.webp', '/assets/galeria/dos-bocas-800.webp', 1000, 625, 'Pieza de cerámica esmaltada en azul oscuro con dos bocas e interior rosa, sobre tela blanca'),
  (17, 'gallery', '/assets/galeria/envuelta.webp', '/assets/galeria/envuelta-800.webp', 1000, 626, 'Escultura de tono beige envuelta en una media, sobre una peana blanca'),
  (18, 'gallery', '/assets/galeria/creafogar-mesa.webp', '/assets/galeria/creafogar-mesa-800.webp', 896, 1200, 'Mesa con piezas de Charria bajo una lámpara de mimbre en Creafogar, Santiago de Compostela'),
  (28, 'gallery', '/assets/galeria/encaje.webp', '/assets/galeria/encaje-800.webp', 1232, 1232, 'Escultura de porcelana veteada envuelta en encaje y tul'),
  (29, 'gallery', '/assets/galeria/azul-alargada.webp', '/assets/galeria/azul-alargada-800.webp', 1000, 750, 'Pieza alargada de cerámica esmaltada en azul oscuro con la boca rosa, sobre tela blanca');

INSERT INTO gallery_items (image_id, title, technique, year, availability, sort_order) VALUES
  (11, 'En Creafogar', 'Exposición · Santiago', '2026', 'none', 1),
  (12, 'Boca rosa', 'Cerámica esmaltada', '2026', 'unique', 2),
  (13, 'Estrellas de Navidad', 'Cerámica pintada a mano', '2026', 'on_request', 3),
  (14, 'Casita blanca', 'Cerámica blanca', '2026', 'on_request', 4),
  (15, 'Collar en malla', 'Porcelana y malla', '2026', 'unique', 5),
  (16, 'Azul de dos bocas', 'Cerámica esmaltada', '2026', 'unique', 6),
  (17, 'Forma envuelta', 'Cerámica y media', '2026', 'unique', 7),
  (18, 'Mesa en Creafogar', 'Exposición · Santiago', '2026', 'none', 8),
  (28, 'Encaje y tul', 'Porcelana, encaje y tul', '2026', 'unique', 9),
  (29, 'Azul alargada', 'Cerámica esmaltada', '2026', 'unique', 10);

-- Clases y horario semanal reales (el horario «Weekly» de Charria): todas de 2 h.
-- Las fechas reservables las crea solas Services/WeeklySchedule.php a partir de weekly_slots.
-- Migrations::realSchedule (paso 13) lleva lo mismo para las webs ya instaladas.
INSERT INTO classes (id, slug, kind, title, description, duration_minutes, price_cents, capacity, pay_subscription, monthly_price_cents, image_id, sort_order) VALUES
  (1, 'ceramica-grupo',          'group',   'Cerámica en grupo',                    'Clase de cerámica de 2 h en grupo reducido. Sesión puntual 30 € o cada semana con la cuota mensual de 60 € (2 h/semana).', 120, 3000,  4, 1, 6000,  20, 1),
  (2, 'torno-grupo',             'group',   'Torno en grupo',                       'Clase de torno de 2 h en grupo reducido. Sesión puntual 35 € o cada semana con la cuota mensual de 65 € (2 h/semana).',   120, 3500,  4, 1, 6500,  19, 2),
  (3, 'clase-individualizada',   'group',   'Clase individualizada',                'Clase de 2 h solo para ti. Sesión puntual 45 € o cada semana con la cuota mensual de 100 € (2 h/semana).',               120, 4500,  1, 1, 10000, 22, 3),
  (4, 'individualizada-puntual', 'private', 'Individualizada puntual · 2 h',        'Una sesión individualizada de 2 horas en otro día u hora.',                                                               120, 4500,  1, 0, NULL,  NULL, 10),
  (5, 'individualizada-mensual', 'private', 'Individualizada mensual · 2 h/semana', 'Clases individualizadas de 2 horas cada semana.',                                                                         120, 10000, 1, 0, NULL,  NULL, 11);

INSERT INTO weekly_days (weekday, is_open) VALUES (1, 1), (2, 1), (3, 1), (4, 1), (5, 1);

-- Lunes 10, 12 y 16 · miércoles 11 · jueves y viernes 10 y 12: individualizada (los huecos «Libre»)
-- Martes y miércoles 18:00 · viernes 17:30: cerámica en grupo
INSERT INTO weekly_slots (weekday, class_id, start_time) VALUES
  (1, 3, '10:00:00'), (1, 3, '12:00:00'), (1, 3, '16:00:00'),
  (2, 1, '18:00:00'),
  (3, 3, '11:00:00'), (3, 1, '18:00:00'),
  (4, 3, '10:00:00'), (4, 3, '12:00:00'),
  (5, 3, '10:00:00'), (5, 3, '12:00:00'), (5, 1, '17:30:00');
