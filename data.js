/* ==========================================================
   Charria Ceramics · Copia de respaldo del catálogo y la galería
   Los productos y fotos reales se gestionan desde el panel (/admin) y
   llegan por la API. Este archivo solo se usa si la API no responde
   (por ejemplo, al abrir la web con Live Server, sin PHP ni MySQL).
   ========================================================== */

const UNSPLASH = (id, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

window.PRODUCTS = [
  { id: "cuenco-arena",   name: "Cuenco Arena",   price: 38,  category: "Cuencos",  added: "2026-10-20", img: UNSPLASH("photo-1610701596007-11502861dcfa"), alt: "Cuencos de gres" },
  { id: "jarron-duna",    name: "Jarrón Duna",    price: 72,  category: "Jarrones", added: "2026-10-18", img: UNSPLASH("photo-1578749556568-bc2c40e68b61"), alt: "Jarrón de cerámica" },
  { id: "taza-niebla",    name: "Taza Niebla",    price: 26,  category: "Tazas",    added: "2026-10-15", img: UNSPLASH("photo-1612196808214-b8e1d6145a8c"), alt: "Taza de cerámica esmaltada" },
  { id: "plato-sal",      name: "Plato Sal",      price: 32,  category: "Platos",   added: "2026-10-12", img: UNSPLASH("photo-1604335399105-a0c585fd81a1"), alt: "Plato de cerámica" },
  { id: "set-alba",       name: "Set Alba",       price: 110, category: "Sets",     added: "2026-10-08", img: UNSPLASH("photo-1594732832278-abd644401426"), alt: "Set de cerámica" },
  { id: "florero-ocre",   name: "Florero Ocre",   price: 54,  category: "Jarrones", added: "2026-10-02", img: UNSPLASH("photo-1590422749897-47036da0b0ff"), alt: "Florero de barro" },
  { id: "cuenco-lino",    name: "Cuenco Lino",    price: 34,  category: "Cuencos",  added: "2026-09-26", img: UNSPLASH("photo-1610701596061-2ecf227e85b2"), alt: "Cuencos blancos apilados" },
  { id: "vasija-raiz",    name: "Vasija Raíz",    price: 95,  category: "Jarrones", added: "2026-09-19", img: UNSPLASH("photo-1578500494198-246f612d3b3d"), alt: "Vasija escultórica de cerámica" },
  { id: "vasija-tierra",  name: "Vasija Tierra",  price: 84,  category: "Jarrones", added: "2026-09-10", img: UNSPLASH("photo-1603204077779-bed963ea7d0e"), alt: "Vasija de barro" },
  { id: "set-mesa-lenta", name: "Set Mesa Lenta", price: 140, category: "Sets",     added: "2026-09-01", img: UNSPLASH("photo-1631125915902-d8abe9225ff2"), alt: "Vajilla de cerámica sobre mesa" },
];

window.GALLERY = [
  { title: "Serie Raíz",     year: "2025", technique: "Gres y engobe",           img: UNSPLASH("photo-1578500494198-246f612d3b3d", 1600), alt: "Escultura de cerámica" },
  { title: "Silencio blanco", year: "2025", technique: "Porcelana sin esmaltar", img: UNSPLASH("photo-1610701596061-2ecf227e85b2", 1600), alt: "Cuencos apilados" },
  { title: "Vasija nº 7",    year: "2025", technique: "Torno, cocción a leña",   img: UNSPLASH("photo-1603204077779-bed963ea7d0e", 1600), alt: "Vasija de barro" },
  { title: "Mesa de taller", year: "2024", technique: "Vajilla de uso diario",   img: UNSPLASH("photo-1631125915902-d8abe9225ff2", 1600), alt: "Cerámica sobre mesa" },
  { title: "Tierra cocida",  year: "2024", technique: "Barro rojo bruñido",      img: UNSPLASH("photo-1607344645866-009c320b63e0", 1600), alt: "Piezas de cerámica" },
  { title: "Ceniza",         year: "2024", technique: "Esmalte de ceniza",       img: UNSPLASH("photo-1571950484368-7b15b0a5ad46", 1600), alt: "Detalle de esmalte" },
  { title: "Tres formas",    year: "2024", technique: "Gres blanco",             img: UNSPLASH("photo-1565193566173-7a0ee3dbe261", 1600), alt: "Jarrones de cerámica sobre fondo neutro" },
  { title: "Manos en el torno", year: "2023", technique: "El estudio",          img: UNSPLASH("photo-1606760227091-3dd870d97f1d", 1600), alt: "Manos modelando barro en el torno" },
];
