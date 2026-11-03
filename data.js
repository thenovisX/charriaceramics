/* ==========================================================
   Charria Ceramics · Copia de respaldo del catálogo y la galería
   Los productos y fotos reales se gestionan desde el panel (/admin) y
   llegan por la API. Este archivo solo se usa si la API no responde
   (por ejemplo, al abrir la web con Live Server, sin PHP ni MySQL).
   ========================================================== */

const UNSPLASH = (id, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
const FICHA = (dimensions, material, specs = [], care = "Lavar a mano o en programa suave. Evita los cambios bruscos de temperatura.") => ({ dimensions, material, specs, care });

window.PRODUCTS = [
  { id: "cuenco-arena",   name: "Cuenco Arena",   price: 38,  category: "Cuencos",  added: "2026-10-20", img: UNSPLASH("photo-1610701596007-11502861dcfa"), alt: "Cuencos de gres torneados a mano con esmalte arena", description: "Cuenco de gres torneado a mano con esmalte arena.", images: [UNSPLASH("photo-1610701596007-11502861dcfa"), UNSPLASH("photo-1571950484368-7b15b0a5ad46")], ...FICHA("", "Gres", [{ label: "Acabado", value: "Esmalte satinado arena" }], "Apto para lavavajillas y microondas."), measures: { height_mm: 70, diameter_mm: 140, capacity_ml: 450 } },
  { id: "jarron-duna",    name: "Jarrón Duna",    price: 72,  category: "Jarrones", added: "2026-10-18", img: UNSPLASH("photo-1578749556568-bc2c40e68b61"), alt: "Jarrón de gres torneado a mano con textura de duna", description: "Jarrón de gres con textura de duna.", images: [UNSPLASH("photo-1578749556568-bc2c40e68b61"), UNSPLASH("photo-1607344645866-009c320b63e0")], ...FICHA("", "Gres chamotado"), measures: { height_mm: 280, diameter_mm: 120 } },
  { id: "taza-niebla",    name: "Taza Niebla",    price: 26,  category: "Tazas",    added: "2026-10-15", img: UNSPLASH("photo-1612196808214-b8e1d6145a8c"), alt: "Taza de gres torneada a mano con esmalte gris niebla", description: "Taza esmaltada en gris niebla.", images: [UNSPLASH("photo-1612196808214-b8e1d6145a8c"), UNSPLASH("photo-1606760227091-3dd870d97f1d")], ...FICHA("", "Gres"), measures: { height_mm: 90, diameter_mm: 80, capacity_ml: 250 } },
  { id: "plato-sal",      name: "Plato Sal",      price: 32,  category: "Platos",   added: "2026-10-12", img: UNSPLASH("photo-1604335399105-a0c585fd81a1"), alt: "Plato de gres hecho a mano con esmalte blanco sal" },
  { id: "set-alba",       name: "Set Alba",       price: 110, category: "Sets",     added: "2026-10-08", img: UNSPLASH("photo-1594732832278-abd644401426"), alt: "Set de piezas de gres hechas a mano en tonos claros" },
  { id: "florero-ocre",   name: "Florero Ocre",   price: 54,  category: "Jarrones", added: "2026-10-02", img: UNSPLASH("photo-1590422749897-47036da0b0ff"), alt: "Florero de barro torneado a mano en tono ocre" },
  { id: "cuenco-lino",    name: "Cuenco Lino",    price: 34,  category: "Cuencos",  added: "2026-09-26", img: UNSPLASH("photo-1610701596061-2ecf227e85b2"), alt: "Cuencos blancos de gres con borde irregular apilados", description: "Cuenco blanco con borde irregular.", images: [UNSPLASH("photo-1610701596061-2ecf227e85b2"), UNSPLASH("photo-1565193566173-7a0ee3dbe261")], ...FICHA("", "Porcelana"), measures: { height_mm: 60, diameter_mm: 130 } },
  { id: "vasija-raiz",    name: "Vasija Raíz",    price: 95,  category: "Jarrones", added: "2026-09-19", img: UNSPLASH("photo-1578500494198-246f612d3b3d"), alt: "Vasija escultórica de gres con engobe y formas orgánicas" },
  { id: "vasija-tierra",  name: "Vasija Tierra",  price: 84,  category: "Jarrones", added: "2026-09-10", img: UNSPLASH("photo-1603204077779-bed963ea7d0e"), alt: "Vasija de barro torneada a mano con cocción a leña" },
  { id: "set-mesa-lenta", name: "Set Mesa Lenta", price: 140, category: "Sets",     added: "2026-09-01", img: UNSPLASH("photo-1631125915902-d8abe9225ff2"), alt: "Vajilla de gres hecha a mano sobre una mesa de madera", description: "Vajilla para dos: platos, cuencos y tazas.", images: [UNSPLASH("photo-1631125915902-d8abe9225ff2"), UNSPLASH("photo-1604335399105-a0c585fd81a1")], ...FICHA("Platos Ø 26 cm · cuencos Ø 14 cm", "Gres", [{ label: "Incluye", value: "2 platos, 2 cuencos y 2 tazas" }]) },
];

// Fotos reales del estudio (assets/galeria): webp a tamaño grande y miniatura de 800 px
const FOTO = (name) => ({ img: `assets/galeria/${name}.webp`, thumb: `assets/galeria/${name}-800.webp` });

window.GALLERY = [
  { title: "En Creafogar", year: "2026", technique: "Exposición · Santiago", availability: "none", ...FOTO("creafogar-vitrina"), alt: "Piezas de Charria en un armario de madera y sobre una mesa de Creafogar, rúa Nova 24, Santiago de Compostela" },
  { title: "Boca rosa", year: "2026", technique: "Cerámica esmaltada", availability: "unique", ...FOTO("azul-rosa"), alt: "Pieza de cerámica azul oscuro con la boca abierta y el interior rosa, sobre tela blanca" },
  { title: "Estrellas de Navidad", year: "2026", technique: "Cerámica pintada a mano", availability: "on_request", ...FOTO("estrellas"), alt: "Adornos de Navidad de cerámica en forma de estrella pintados a mano, sobre madera con eucalipto y piñas" },
  { title: "Casita blanca", year: "2026", technique: "Cerámica blanca", availability: "on_request", ...FOTO("casita"), alt: "Casita de cerámica blanca sobre una pila de revistas con ramas de abeto" },
  { title: "Collar en malla", year: "2026", technique: "Porcelana y malla", availability: "unique", ...FOTO("collar-malla"), alt: "Escultura alargada a modo de collar con piezas blancas y negras envueltas en malla" },
  { title: "Azul de dos bocas", year: "2026", technique: "Cerámica esmaltada", availability: "unique", ...FOTO("dos-bocas"), alt: "Pieza de cerámica esmaltada en azul oscuro con dos bocas e interior rosa, sobre tela blanca" },
  { title: "Forma envuelta", year: "2026", technique: "Cerámica y media", availability: "unique", ...FOTO("envuelta"), alt: "Escultura de tono beige envuelta en una media, sobre una peana blanca" },
  { title: "Mesa en Creafogar", year: "2026", technique: "Exposición · Santiago", availability: "none", ...FOTO("creafogar-mesa"), alt: "Mesa con piezas de Charria bajo una lámpara de mimbre en Creafogar, Santiago de Compostela" },
  { title: "Encaje y tul", year: "2026", technique: "Porcelana, encaje y tul", availability: "unique", ...FOTO("encaje"), alt: "Escultura de porcelana veteada envuelta en encaje y tul" },
  { title: "Azul alargada", year: "2026", technique: "Cerámica esmaltada", availability: "unique", ...FOTO("azul-alargada"), alt: "Pieza alargada de cerámica esmaltada en azul oscuro con la boca rosa, sobre tela blanca" },
];
