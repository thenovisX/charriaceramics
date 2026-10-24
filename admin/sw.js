/* ==========================================================
   Charria Ceramics · service worker del panel
   Hace el panel instalable como app. Guarda solo la "carcasa" (HTML, CSS,
   JS e iconos) para que abra rápido y muestre un aviso si no hay conexión.
   La API (/api) NUNCA pasa por aquí: pedidos, clientes y sesiones siempre
   se piden al servidor y no se guardan en el móvil.
   ========================================================== */
const CACHE = "charria-panel-v1";
const SHELL = ["./", "index.html", "admin.css?v=4", "admin.js?v=4", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Solo GET del propio panel; todo lo demás (API, Stripe, fuentes) va directo a la red
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith(new URL("./", location).pathname)) return;
  // Red primero: siempre la última versión; la copia solo se usa sin conexión
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("index.html"))));
});
