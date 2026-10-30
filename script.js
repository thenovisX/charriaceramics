/* ==========================================================
   Charria Ceramics · Editorial
   Lenis (scroll suave) + GSAP/ScrollTrigger + SplitType + Swiper
   Un solo script para index.html, productos.html y galeria.html:
   cada bloque solo se activa si su sección existe en la página.
   ========================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Si una imagen de Unsplash falla, se muestra un fondo de barro en su lugar
document.addEventListener("error", (e) => {
  if (e.target.tagName === "IMG") e.target.parentElement.classList.add("img-fallback");
}, true);

const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
if (hasGsap) document.documentElement.classList.add("has-gsap");
// Escritorio = pantalla ancha con ratón; en tablet y móvil se simplifican los efectos
const DESKTOP = "(min-width: 1025px)";
const NOT_PHONE = "(min-width: 768px)";
const PHONE = "(max-width: 767px)";
const hasMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ==========================================================
   Contenido: se pide a la API (/api) y, si no responde (p. ej. abriendo
   la web con Live Server, sin PHP), se usa la copia de data.js.
   ========================================================== */
const API = "api";
const apiFetch = async (path, options = {}) => {
  const res = await fetch(`${API}/${path}`, {
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    signal: options.signal || (AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined),
  });
  const json = await res.json().catch(() => null);
  // Web recién subida sin instalar: primero el instalador
  if (json?.error?.code === "not_installed") location.replace("admin/setup.html");
  if (!res.ok || !json) {
    const err = new Error(json?.error?.message || "No se pudo conectar. Inténtalo de nuevo en unos minutos.");
    err.status = res.status;
    err.fields = json?.error?.fields || {};
    throw err;
  }
  return json.data;
};
const apiPost = (path, body) => apiFetch(path, { method: "POST", body: JSON.stringify(body) });

const pad = (n) => String(n).padStart(2, "0");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euros = (cents) => (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }) + " €";

// Formato común para productos y obras, vengan de la API o de data.js
// Si en el panel se deja vacía la descripción de una foto, el alt se arma con lo que se sabe de la pieza
const productAlt = (p) => [p.title, p.material, p.category].filter(Boolean).join(" · ");
const galleryAlt = (g) => [g.title, g.technique, g.year].filter(Boolean).join(" · ");
const fromApiProduct = (p) => ({
  id: p.id, slug: p.slug, name: p.title, category: p.category, added: p.created_at,
  price: p.final_price_cents / 100, priceCents: p.final_price_cents, originalCents: p.price_cents,
  discount: p.discount_percent, soldOut: p.sold_out, lowStock: p.low_stock,
  img: p.images[0]?.url || "", alt: p.images[0]?.alt || productAlt(p),
  images: p.images.map((i) => ({ url: i.url, thumb: i.thumb_url, alt: i.alt || productAlt(p) })),
  description: p.description || "", dimensions: p.dimensions || "", material: p.material || "", care: p.care || "", specs: p.specs || [],
  weight: p.piece_weight_grams || 0, measures: p.measures || {},
});
const fromLocalProduct = (p) => ({
  description: "", dimensions: "", material: "", care: "", specs: [], weight: 0, measures: {}, ...p, slug: p.id,
  priceCents: Math.round(p.price * 100), originalCents: Math.round(p.price * 100), discount: 0, soldOut: false,
  images: (p.images || [p.img]).map((url) => ({ url, thumb: url, alt: p.alt })),
});
const productUrl = (p) => `producto.html?p=${encodeURIComponent(p.slug)}`;
const fromApiGallery = (g) => ({ title: g.title, year: g.year, technique: g.technique, availability: g.availability, img: g.image.url, thumb: g.image.thumb_url, alt: g.image.alt || galleryAlt(g) });
// Etiqueta bajo cada obra (Panel → Galería): pieza única o disponible bajo pedido
const AVAILABILITY = { unique: "Obra única (No disponible)", on_request: "Disponible bajo pedido (Consultar precios)" };
const askUrl = (g) => `contacto.html?obra=${encodeURIComponent(g.title)}#contacto`;

let PRODUCTS = [];
let GALLERY = [];
let CLASSES = null;  // null = sin API: no se inventan fechas, se invita a escribir
let SITE = null;     // datos de contacto de Panel → Ajustes (null = se queda el HTML)
let REVIEWS = [];    // reseñas publicadas en Panel → Reseñas (sin ninguna, la sección no se enseña)
let SLOTS = new Map(); // filas de clases: un horario suelto o todas las semanas de una clase semanal
// Para cart.js: dónde se recoge un pedido (Panel → Ajustes → Datos de la web)
window.pickupPlace = () => [SITE?.address, SITE?.city].filter(Boolean).join(", ") || "En el estudio de Tomiño (Pontevedra)";

async function loadContent() {
  const wants = (sel) => !!document.querySelector(sel);
  const [products, gallery, classes, site, reviews] = await Promise.all([
    wants("[data-latest-products], [data-catalog], [data-product-page]") ? apiFetch("products").catch(() => null) : null,
    wants("[data-gallery-track], [data-ed-gallery]") ? apiFetch("gallery").catch(() => null) : null,
    wants(".class-list, [data-private-form]") ? apiFetch("classes").catch(() => null) : null,
    apiFetch("site").catch(() => null),
    wants("[data-reviews]") ? apiFetch("reviews").catch(() => null) : null,
  ]);
  SITE = site;
  REVIEWS = reviews || [];
  PRODUCTS = (products ? products.map(fromApiProduct) : (window.PRODUCTS || []).map(fromLocalProduct))
    .sort((a, b) => b.added.localeCompare(a.added));
  GALLERY = gallery ? gallery.map(fromApiGallery) : (window.GALLERY || []);
  CLASSES = classes;
}

// Las 3 piezas más recientes llevan la etiqueta "Nuevo"; las agotadas, "Agotado".
// La foto y el nombre llevan a la ficha; si hay segunda foto, aparece al pasar el ratón.
const shopClosed = () => SITE?.shop_open === false;
const closedNote = () => `<p class="shop-closed" role="status">${esc(SITE?.shop_message || "Tienda no disponible por ahora. Volvemos muy pronto.")}</p>`;

const productHTML = (p, i, tall = false) => `
  <article class="product${tall ? " product--tall" : ""}${p.soldOut ? " is-sold-out" : ""}" style="order:${i}" data-category="${esc(p.category)}">
    <a class="product__img" href="${productUrl(p)}" tabindex="-1" aria-hidden="true"><img src="${esc(p.img)}" alt="${esc(p.alt)}" loading="lazy">${p.images[1] ? `<img class="product__img-alt" src="${esc(p.images[1].thumb)}" alt="" loading="lazy">` : ""}</a>
    ${p.soldOut ? '<span class="product__badge product__badge--out">Agotado</span>'
      : p.discount ? `<span class="product__badge">−${p.discount} %</span>`
      : PRODUCTS.indexOf(p) < 3 ? '<span class="product__badge">Nuevo</span>' : ""}
    ${p.soldOut || shopClosed() ? "" : `<button class="btn-primary product__add" type="button" data-add="${esc(p.id)}" data-icon="plus" aria-label="Añadir ${esc(p.name)} a la cesta">Añadir al carrito</button>`}
    <div class="product__info">
      <div><p class="product__cat">${esc(p.category)}</p><h3><a href="${productUrl(p)}">${esc(p.name)}</a></h3></div>
      <span class="product__price">${p.discount ? `<s>${euros(p.originalCents)}</s> ` : ""}${euros(p.priceCents)}</span>
    </div>
  </article>`;

/* Logotipos de las redes (Simple Icons, CC0). Se pintan en el pie y en Contacto ([data-socials]) */
const SOCIAL_ICONS = {
  instagram: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  whatsapp: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  tiktok: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
};
const DEFAULT_INSTAGRAM = "https://www.instagram.com/ch.ceramics/";
const phoneDigits = (phone) => String(phone).replace(/[^\d+]/g, "");
const instagramHandle = (url) => { const m = String(url).match(/instagram\.com\/([^/?#]+)/i); return m ? `@${m[1]}` : "Instagram"; };
// Redes de Panel → Ajustes → Datos de la web; sin API, el Instagram del estudio
function socialLinks() {
  const ig = SITE ? SITE.instagram : DEFAULT_INSTAGRAM;
  return [
    ig && { id: "instagram", href: ig, text: instagramHandle(ig), label: "Instagram" },
    SITE?.whatsapp && { id: "whatsapp", href: `https://wa.me/${phoneDigits(SITE.whatsapp).replace("+", "")}`, text: "WhatsApp", label: "WhatsApp" },
    SITE?.facebook && { id: "facebook", href: SITE.facebook, text: "Facebook", label: "Facebook" },
    SITE?.tiktok && { id: "tiktok", href: SITE.tiktok, text: "TikTok", label: "TikTok" },
  ].filter(Boolean);
}
function renderSocials() {
  const list = socialLinks();
  if (!list.length) return;
  $$("[data-socials]").forEach((box) => {
    box.innerHTML = list.map((s) => `<a class="social-link" href="${esc(s.href)}" target="_blank" rel="noopener" aria-label="${esc(s.label)}${s.text !== s.label ? ` (${esc(s.text)})` : ""}">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="${SOCIAL_ICONS[s.id]}"/></svg><span>${esc(s.text)}</span></a>`).join("");
  });
}
// Emails largos: solo se parten por la @ o por los puntos, nunca a mitad de palabra
const breakableEmail = (email) => esc(email).replace("@", "<wbr>@").replace(/\./g, ".<wbr>");

/* Dirección, horario, teléfono, email y redes: se editan en Panel → Ajustes → Datos de la web.
   Lo que no esté rellenado se queda como está escrito en el HTML. */
function renderSite() {
  if (!SITE) return;
  const link = (href, text, external = true) => `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`;
  const lines = (t) => String(t).split("\n").map((l) => l.trim()).filter(Boolean);
  const digits = phoneDigits;
  const social = socialLinks().map((s) => link(s.href, s.text));
  const place = (withZip) => {
    const city = SITE.city ? (withZip ? SITE.city : SITE.city.replace(/^\d{4,5}\s*/, "")) : "";
    const text = [SITE.address, city].filter(Boolean).map(esc).join("<br>");
    return SITE.maps_url ? `<a href="${esc(SITE.maps_url)}" target="_blank" rel="noopener">${text}</a>` : text;
  };
  const setCol = (root, label, html) => {
    const col = [...root.children].find((c) => c.querySelector(".eyebrow")?.textContent.trim().startsWith(label));
    if (col && html) col.querySelector("p").innerHTML = html;
  };
  // Pie de todas las páginas
  $$(".footer__cols").forEach((cols) => {
    if (SITE.address || SITE.city) setCol(cols, "Estudio", place(false));
    if (SITE.hours) setCol(cols, "Horario", esc(lines(SITE.hours)[0] || ""));
  });
  const legal = $(".footer__legal");
  if (legal && SITE.city) legal.textContent = `© ${new Date().getFullYear()} Charria Ceramics · ${SITE.city.replace(/^\d{4,5}\s*/, "")}`;
  // Menú del móvil
  const menuFoot = $(".mobile-menu__foot");
  if (menuFoot && social.length) menuFoot.innerHTML = social[0];
  // Página de contacto
  const placeName = $("[data-site-place]");
  if (placeName && SITE.city) placeName.textContent = SITE.city.replace(/^\d{4,5}\s*/, "");
  const details = $(".contact__details");
  if (details) {
    if (SITE.address || SITE.city) setCol(details, "Estudio", place(true));
    if (SITE.hours) setCol(details, "Horario", lines(SITE.hours).map(esc).join("<br>"));
    const write = [SITE.email && `<a class="email-link" href="mailto:${esc(SITE.email)}">${breakableEmail(SITE.email)}</a>`, SITE.phone && link(`tel:${digits(SITE.phone)}`, SITE.phone, false)].filter(Boolean);
    if (write.length) setCol(details, "Escríbenos", write.join("<br>"));
  }
  renderLegal();
}

/* Páginas legales: datos del titular de Panel → Ajustes → Datos legales.
   Lo que falte se queda marcado con el texto entre corchetes para que se vea. */
function renderLegal() {
  const values = {
    owner: SITE.legal_owner, tax_id: SITE.legal_tax_id, address: SITE.legal_address,
    email: SITE.legal_email || SITE.email, phone: SITE.phone, registry: SITE.legal_registry, site: location.origin,
  };
  $$("[data-legal]").forEach((el) => {
    const value = values[el.dataset.legal];
    if (!value) { el.classList.add("is-missing"); return; }
    el.textContent = value;
    el.classList.remove("is-missing");
    if (el.tagName === "A") el.href = el.dataset.legal === "email" ? `mailto:${value}` : value;
  });
  $$("[data-legal-optional]").forEach((el) => { el.hidden = !values[el.dataset.legalOptional]; });
}

/* Portada · El estudio: texto y foto de Panel → Ajustes → Datos de la web.
   Sin rellenar se queda lo escrito en el HTML. Un párrafo por cada línea en blanco. */
function renderStudio() {
  const studio = $("[data-studio]");
  if (!studio || !SITE) return;
  if (SITE.studio_text) {
    $("[data-studio-text]", studio).innerHTML = String(SITE.studio_text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  }
  const img = SITE.studio_image && $("[data-studio-img]", studio);
  if (img) {
    $$("source", img.parentElement).forEach((s) => s.remove());
    img.removeAttribute("srcset");
    img.src = SITE.studio_image.url;
    img.alt = SITE.studio_image.alt || "Trabajando en el torno del estudio";
    img.width = SITE.studio_image.width;
    img.height = SITE.studio_image.height;
  }
}

/* Portada · Reseñas de Panel → Reseñas. Sin ninguna publicada la sección sigue oculta. */
function renderReviews() {
  const box = $("[data-reviews]");
  if (!box || !REVIEWS.length) return;
  $("[data-reviews-list]", box).innerHTML = REVIEWS.map((r) => `
    <figure class="review">
      ${r.rating ? `<p class="review__stars" role="img" aria-label="${r.rating} de 5 estrellas">${"★".repeat(r.rating)}<span>${"★".repeat(5 - r.rating)}</span></p>` : ""}
      <blockquote class="review__text"><p>${esc(r.body).replace(/\n+/g, "<br>")}</p></blockquote>
      <figcaption><span class="review__author">${esc(r.author)}</span>${r.context ? `<span class="review__context">${esc(r.context)}</span>` : ""}</figcaption>
    </figure>`).join("");
  box.hidden = false;
}

function renderContent() {
  renderSite();
  renderSocials();
  renderStudio();
  renderReviews();
  if (shopClosed()) {
    // Tienda cerrada desde el panel: fuera la cesta y el botón de compra, y aviso en el catálogo
    document.documentElement.classList.add("shop-is-closed");
    const catalog = $("[data-catalog]");
    if (catalog) catalog.insertAdjacentHTML("beforebegin", closedNote());
  }
  // Portada: las 6 piezas más recientes, dos por columna (3 columnas con parallax) para que
  // la rejilla quede completa también en tablet (3 filas de 2)
  const latest = $("[data-latest-products]");
  if (latest) {
    const cols = [
      { speed: -40, items: [] },
      { speed: 40, items: [], offset: true },
      { speed: -20, items: [] },
    ];
    PRODUCTS.slice(0, 6).forEach((p, i) => cols[i % 3].items.push(productHTML(p, i, i === 1 || i === 5)));
    latest.innerHTML = cols.map((c) =>
      `<div class="shop__col${c.offset ? " shop__col--offset" : ""}" data-speed="${c.speed}">${c.items.join("")}</div>`
    ).join("");
  }

  // productos.html: catálogo completo; filtros y orden en un panel que se abre con «Filtrar»
  if ($("[data-catalog]")) initCatalog();

  // producto.html: ficha con galería y especificaciones
  if ($("[data-product-page]")) renderProductPage();

  // Portada: galería (cada foto lleva a galeria.html)
  const galleryTrack = $("[data-gallery-track]");
  if (galleryTrack) {
    const shapes = ["art--a", "art--b", "art--c"];
    galleryTrack.innerHTML = GALLERY.slice(0, 6).map((g, i) => `
      <a class="art ${shapes[i % 3]}" href="galeria.html#obra-${i + 1}" aria-label="${esc(g.title)}, ver en la galería">
        <div class="art__img"><img src="${esc(g.thumb || g.img.replace("w=1600", "w=1000"))}" alt="${esc(g.alt)}" loading="lazy"></div>
        <p class="art__cap">${esc(g.title)}, ${esc(g.year)}</p>
        ${AVAILABILITY[g.availability] ? `<p class="art__status">${AVAILABILITY[g.availability]}</p>` : ""}
      </a>`).join("");
  }

  // galeria.html: composición editorial a gran tamaño
  const edGallery = $("[data-ed-gallery]");
  if (edGallery) {
    edGallery.innerHTML = GALLERY.map((g, i) => `
      <figure class="ed-item" id="obra-${i + 1}" data-index="${i}" tabindex="0" role="button" aria-label="Ampliar ${esc(g.title)}">
        <div class="ed-item__img"><img src="${esc(g.img)}" alt="${esc(g.alt)}" loading="${i < 2 ? "eager" : "lazy"}"></div>
        <figcaption>
          <span class="ed-item__num">${pad(i + 1)}</span>
          <span class="ed-item__title">${esc(g.title)}</span>
          <span class="ed-item__meta">${esc(g.technique)} · ${esc(g.year)}</span>
          ${g.availability === "unique" ? `<span class="ed-item__status">Obra única <span>(No disponible)</span></span>`
            : g.availability === "on_request" ? `<span class="ed-item__status">Disponible bajo pedido <a href="${askUrl(g)}">(Consultar precios)</a></span>` : ""}
        </figcaption>
      </figure>`).join("");
    const total = $("[data-gallery-total]");
    if (total) total.textContent = `${pad(GALLERY.length)} obras`;
  }

  // Portada: clases en grupo (una fila por horario) y modalidades de clase privada
  const classList = $(".class-list");
  if (classList) classList.removeAttribute("aria-busy");
  if (classList && !CLASSES) classList.innerHTML = '<li class="class-row class-row--empty"><span class="class-row__name">Escríbenos y te contamos las próximas fechas.</span><a class="btn-primary" href="contacto.html">Contactar</a></li>';
  if (classList && CLASSES) {
    const day = (d) => d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" }).replace(/[.,]/g, "").replace(/^\w/, (m) => m.toUpperCase());
    const weekday = (d) => d.toLocaleDateString("es-ES", { weekday: "long" }).replace(/^\w/, (m) => m.toUpperCase());
    const hours = (min) => `${String(min / 60).replace(".", ",")} h`;
    const timeOf = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const plazasOf = (n) => `${n} ${n === 1 ? "plaza" : "plazas"}`;
    // Las clases semanales (misma clase, mismo día de la semana y hora, sin etiqueta) van en una sola fila;
    // las de Panel → Semanales (slot_id) se agrupan por su clase semanal y salen arriba, en «Semanales»
    const slots = new Map();
    CLASSES.group.forEach((c) => c.sessions.forEach((s) => {
      const d = new Date(s.starts_at.replace(" ", "T"));
      const key = s.slot_id ? `w${s.slot_id}` : s.label ? `s${s.id}` : `${c.id}|${d.getDay()}|${timeOf(d)}`;
      if (!slots.has(key)) slots.set(key, { key, c, sessions: [] });
      slots.get(key).sessions.push({ ...s, date: d });
    }));
    SLOTS = slots;
    const weeklyBox = $("[data-weekly]");
    const byId = new Map(CLASSES.group.map((c) => [c.id, c]));
    const weeklyRows = (CLASSES.weekly || []).flatMap((day) => day.slots.map((w, i) => {
      const c = byId.get(w.class_id);
      const slot = slots.get(`w${w.id}`);
      if (!c || !slot) return "";
      slot.weekly = w;
      const s = slot.sessions.find((x) => x.seats_left > 0) || slot.sessions[0];
      const free = slot.sessions.some((x) => x.seats_left > 0);
      const next = free ? `Próxima: ${s.date.getDate()} ${s.date.toLocaleDateString("es-ES", { month: "short" }).replace(".", "")} · ${plazasOf(s.seats_left)}` : "Completo";
      const monthly = w.price_period === "month";
      return `<li class="class-row${i ? " class-row--same-day" : ""}" data-img="${esc(c.image?.url || "")}">
        <span class="class-row__date">${i ? "" : esc(day.name)}</span>
        <span class="class-row__name">${esc(c.title)}</span>
        <span class="class-row__meta">${esc(w.time)} · ${hours(c.duration_minutes)} · ${next}</span>
        <span class="class-row__price class-row__price--month">${euros(w.price_cents)}<small class="class-row__period">${monthly ? "por mes" : "por clase"}</small></span>
        <button class="btn-primary" type="button" data-book="${s.id}" data-slot="w${w.id}" data-seats="${s.seats_left}" data-title="${esc(c.title)} · ${esc(day.name.toLowerCase())} ${esc(w.time)}" ${free ? "" : "disabled"}>${free ? "Reservar" : "Completo"}</button>
      </li>`;
    })).filter(Boolean);
    if (weeklyBox) {
      weeklyBox.hidden = !weeklyRows.length;
      $(".weekly__list", weeklyBox).innerHTML = weeklyRows.join("");
    }
    const rows = [...slots.values()]
      .filter((x) => !x.key.startsWith("w"))
      // Por fecha; los cursos largos (con etiqueta, p. ej. "Martes · 12 sesiones") al final
      .sort((a, b) => (!!a.sessions[0].label - !!b.sessions[0].label) || a.sessions[0].starts_at.localeCompare(b.sessions[0].starts_at));
    classList.innerHTML = rows.length ? rows.map(({ key, c, sessions }) => {
      const s = sessions.find((x) => x.seats_left > 0) || sessions[0];
      const weekly = sessions.length > 1;
      const free = sessions.some((x) => x.seats_left > 0);
      const seats = !free ? "Completo" : weekly ? `${weekday(s.date).toLowerCase()} ${s.date.getDate()} · ${s.seats_left} ${s.seats_left === 1 ? "plaza" : "plazas"}` : `${s.seats_left} ${s.seats_left === 1 ? "plaza" : "plazas"}`;
      // Panel → Clases → «Enseñar el día y la hora» desactivado: sin fecha ni hora en la fila
      const showDate = c.show_date !== false;
      const plazas = !free ? "Completo" : `${s.seats_left} ${s.seats_left === 1 ? "plaza" : "plazas"}`;
      const meta = !showDate ? [s.label && esc(s.label), hours(c.duration_minutes), plazas].filter(Boolean).join(" · ")
        : s.label ? `${esc(s.label)} · ${seats}` : `${timeOf(s.date)} · ${hours(c.duration_minutes)} · ${weekly ? `Próxima: ${seats}` : seats}`;
      // «El precio es mensual»: la cuota de la suscripción si la hay; si no, el precio de la clase
      const monthly = c.price_period === "month";
      const price = monthly && c.monthly_price_cents > 0 ? c.monthly_price_cents : s.price_cents;
      return `<li class="class-row${showDate ? "" : " class-row--nodate"}" data-img="${esc(c.image?.url || "")}">
        <span class="class-row__date">${!showDate ? "" : weekly ? `Cada ${weekday(s.date).toLowerCase()}` : day(s.date)}</span>
        <span class="class-row__name">${esc(c.title)}</span>
        <span class="class-row__meta">${meta}</span>
        <span class="class-row__price${monthly ? " class-row__price--month" : ""}">${euros(price)}${monthly ? '<small class="class-row__period">por mes</small>' : ""}</span>
        <button class="btn-primary" type="button" data-book="${s.id}" data-slot="${esc(key)}" data-seats="${s.seats_left}" data-title="${esc(c.title)}${weekly || !showDate ? "" : ` · ${day(s.date)}`}" ${free ? "" : "disabled"}>${free ? "Reservar" : "Completo"}</button>
      </li>`;
    }).join("") : '<li class="class-row class-row--empty"><span class="class-row__name">Pronto publicaremos nuevas fechas.</span><a class="btn-primary" href="contacto.html">Avísame</a></li>';
    // Con semanales, las fechas sueltas van debajo con su título, y si no hay ninguna no se dice nada
    const oneOffTitle = $("[data-oneoff-title]");
    if (oneOffTitle) oneOffTitle.hidden = !(weeklyRows.length && rows.length);
    classList.hidden = !!weeklyRows.length && !rows.length;
  }
  const privateSelect = $("[data-private-form] select[name=tipo]");
  if (privateSelect && CLASSES?.private.length) {
    privateSelect.innerHTML = CLASSES.private.map((c) => `<option value="${c.id}">${esc(c.title)} · ${euros(c.price_cents)}</option>`).join("");
  }
}

/* ==========================================================
   Tienda (productos.html): filtrar por categoría, precio y
   disponibilidad, y ordenar. El estado va en la URL (?cat=…&orden=…)
   para que al volver de una ficha se mantenga.
   ========================================================== */
const SORTS = {
  novedades: ["Novedades", (a, b) => b.added.localeCompare(a.added)],
  "precio-asc": ["Precio: de menor a mayor", (a, b) => a.priceCents - b.priceCents],
  "precio-desc": ["Precio: de mayor a menor", (a, b) => b.priceCents - a.priceCents],
  "nombre-asc": ["Nombre: de la A a la Z", (a, b) => a.name.localeCompare(b.name, "es")],
  "nombre-desc": ["Nombre: de la Z a la A", (a, b) => b.name.localeCompare(a.name, "es")],
  ofertas: ["Ofertas primero", (a, b) => (b.discount - a.discount) || b.added.localeCompare(a.added)],
};
const FILTER_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M2 6h16M2 14h16"/><circle cx="7" cy="6" r="2.2" fill="var(--ivory)"/><circle cx="13" cy="14" r="2.2" fill="var(--ivory)"/></svg>';

function initCatalog() {
  const catalog = $("[data-catalog]");
  const sheet = $("[data-filter-sheet]");
  const form = $("[data-filter-form]", sheet);
  const count = $("[data-filter-count]");
  const chips = $("[data-filter-chips]");
  const openBtn = $("[data-filter-open]");
  const applyBtn = $("[data-filter-apply]");

  const euroOf = (cents) => cents / 100;
  const priced = PRODUCTS.map((p) => euroOf(p.priceCents));
  const lo = Math.floor(Math.min(...priced, 0) / 5) * 5;
  const hi = Math.max(lo + 5, Math.ceil(Math.max(...priced, 0) / 5) * 5);
  const categories = [...new Set(PRODUCTS.map((p) => p.category).filter(Boolean))];

  // Estado inicial desde la URL
  const q = new URLSearchParams(location.search);
  const state = {
    sort: SORTS[q.get("orden")] ? q.get("orden") : "novedades",
    cats: new Set((q.get("cat") || "").split(",").filter((c) => categories.includes(c))),
    min: Math.max(lo, Math.min(hi, Number(q.get("min")) || lo)),
    max: Math.max(lo, Math.min(hi, Number(q.get("max")) || hi)),
    stock: q.get("disponibles") === "1",
    sale: q.get("ofertas") === "1",
  };

  openBtn.insertAdjacentHTML("afterbegin", FILTER_ICON);
  form.innerHTML = `
    <fieldset class="facet">
      <legend class="eyebrow">Ordenar por</legend>
      <div class="facet__list">${Object.entries(SORTS).map(([k, [label]]) =>
        `<label class="facet__radio"><input type="radio" name="sort" value="${k}"><span>${label}</span></label>`).join("")}</div>
    </fieldset>
    ${categories.length ? `<fieldset class="facet">
      <legend class="eyebrow">Categoría</legend>
      <div class="facet__chips">${categories.map((c) =>
        `<label class="facet__chip"><input type="checkbox" name="cat" value="${esc(c)}"><span>${esc(c)}</span></label>`).join("")}</div>
    </fieldset>` : ""}
    <fieldset class="facet">
      <legend class="eyebrow">Precio</legend>
      <p class="facet__price"><span data-price-min></span><span aria-hidden="true">—</span><span data-price-max></span></p>
      <div class="range" style="--lo:0;--hi:1">
        <input type="range" name="min" min="${lo}" max="${hi}" step="1" aria-label="Precio mínimo">
        <input type="range" name="max" min="${lo}" max="${hi}" step="1" aria-label="Precio máximo">
      </div>
    </fieldset>
    <fieldset class="facet">
      <legend class="eyebrow">Mostrar</legend>
      <label class="facet__check"><input type="checkbox" name="stock"><span>Solo piezas disponibles</span></label>
      <label class="facet__check"><input type="checkbox" name="sale"><span>Solo piezas con descuento</span></label>
    </fieldset>`;
  const f = form.elements;
  const range = $(".range", form);

  const syncForm = () => {
    $$("input[name=sort]", form).forEach((r) => { r.checked = r.value === state.sort; });
    $$("input[name=cat]", form).forEach((c) => { c.checked = state.cats.has(c.value); });
    f.min.value = state.min; f.max.value = state.max;
    f.stock.checked = state.stock; f.sale.checked = state.sale;
    paintRange();
  };
  const paintRange = () => {
    range.style.setProperty("--lo", (state.min - lo) / (hi - lo));
    range.style.setProperty("--hi", (state.max - lo) / (hi - lo));
    $("[data-price-min]", form).textContent = euros(state.min * 100);
    $("[data-price-max]", form).textContent = euros(state.max * 100) + (state.max === hi ? "+" : "");
  };
  const priceActive = () => state.min > lo || state.max < hi;
  const results = () => PRODUCTS
    .filter((p) => (!state.cats.size || state.cats.has(p.category))
      && euroOf(p.priceCents) >= state.min && (state.max === hi || euroOf(p.priceCents) <= state.max)
      && (!state.stock || !p.soldOut) && (!state.sale || p.discount > 0))
    .sort(SORTS[state.sort][1]);

  const writeUrl = () => {
    const u = new URLSearchParams();
    if (state.sort !== "novedades") u.set("orden", state.sort);
    if (state.cats.size) u.set("cat", [...state.cats].join(","));
    if (state.min > lo) u.set("min", state.min);
    if (state.max < hi) u.set("max", state.max);
    if (state.stock) u.set("disponibles", "1");
    if (state.sale) u.set("ofertas", "1");
    history.replaceState(null, "", location.pathname + (u.toString() ? `?${u}` : ""));
  };

  // Etiquetas de lo que está filtrado, junto al botón (cada una se quita con un clic)
  const renderChips = () => {
    const list = [
      ...[...state.cats].map((c) => [`cat:${c}`, c]),
      priceActive() && ["price", `${euros(state.min * 100)} – ${euros(state.max * 100)}${state.max === hi ? "+" : ""}`],
      state.stock && ["stock", "Disponibles"],
      state.sale && ["sale", "Con descuento"],
      state.sort !== "novedades" && ["sort", SORTS[state.sort][0]],
    ].filter(Boolean);
    chips.innerHTML = list.map(([k, t]) => `<button type="button" data-chip="${esc(k)}" aria-label="Quitar ${esc(t)}">${esc(t)}<span aria-hidden="true">×</span></button>`).join("");
    const active = list.filter(([k]) => k !== "sort").length;
    $("[data-filter-active]", openBtn).textContent = active ? `(${active})` : "";
  };

  let first = true;
  const render = () => {
    const items = results();
    catalog.innerHTML = items.length
      ? items.map((p, i) => productHTML(p, i)).join("")
      : `<div class="catalog__empty"><p>No hay piezas con estos filtros.</p><button type="button" class="link-btn" data-filter-clear>Borrar filtros</button></div>`;
    count.textContent = `${items.length} ${items.length === 1 ? "pieza" : "piezas"}`;
    if (applyBtn) setButton(applyBtn, items.length ? `Ver ${items.length} ${items.length === 1 ? "pieza" : "piezas"}` : "Sin resultados");
    renderChips();
    if (!first) {
      decorateProducts(catalog);
      writeUrl();
      if (hasGsap) {
        gsap.fromTo($$(".product", catalog), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .6, stagger: .04, ease: "power3.out", clearProps: "transform,opacity" });
        ScrollTrigger.refresh();
      }
    }
    first = false;
  };

  const clearAll = () => {
    Object.assign(state, { sort: "novedades", min: lo, max: hi, stock: false, sale: false });
    state.cats.clear();
    syncForm();
    render();
  };

  form.addEventListener("input", (e) => {
    const t = e.target;
    if (t.name === "sort") state.sort = t.value;
    if (t.name === "cat") t.checked ? state.cats.add(t.value) : state.cats.delete(t.value);
    if (t.name === "min") { state.min = Math.min(Number(t.value), state.max); t.value = state.min; }
    if (t.name === "max") { state.max = Math.max(Number(t.value), state.min); t.value = state.max; }
    if (t.name === "stock") state.stock = t.checked;
    if (t.name === "sale") state.sale = t.checked;
    if (t.type === "range") paintRange();
    render();
  });
  // El tirador que se toca queda encima (si los dos están en el mismo punto)
  range.addEventListener("pointerdown", (e) => {
    const r = range.getBoundingClientRect();
    const v = lo + (hi - lo) * ((e.clientX - r.left) / r.width);
    const useMax = Math.abs(v - state.max) < Math.abs(v - state.min) || (state.min === state.max && v > state.max);
    f.max.style.zIndex = useMax ? 3 : 1;
    f.min.style.zIndex = useMax ? 1 : 3;
  });
  chips.addEventListener("click", (e) => {
    const b = e.target.closest("[data-chip]");
    if (!b) return;
    const k = b.dataset.chip;
    if (k.startsWith("cat:")) state.cats.delete(k.slice(4));
    if (k === "price") { state.min = lo; state.max = hi; }
    if (k === "stock") state.stock = false;
    if (k === "sale") state.sale = false;
    if (k === "sort") state.sort = "novedades";
    syncForm();
    render();
  });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-filter-clear]")) clearAll(); });

  // Panel lateral
  let lastFocus = null;
  const setOpen = (open) => {
    sheet.classList.toggle("is-open", open);
    sheet.setAttribute("aria-hidden", String(!open));
    openBtn.setAttribute("aria-expanded", String(open));
    document.documentElement.classList.toggle("cart-open", open);
    document.dispatchEvent(new CustomEvent(open ? "cart:open" : "cart:close"));
    if (open) {
      lastFocus = document.activeElement;
      $(".sheet__panel", sheet).focus();
      if (hasGsap && !reduceMotion) gsap.fromTo($$(".facet", sheet), { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: .6, stagger: .06, delay: .15, ease: "power3.out", clearProps: "all" });
    } else {
      lastFocus?.focus();
    }
  };
  openBtn.addEventListener("click", () => setOpen(true));
  $$("[data-filter-close]", sheet).forEach((b) => b.addEventListener("click", () => setOpen(false)));
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet.classList.contains("is-open")) setOpen(false); });

  syncForm();
  render();
}

/* ==========================================================
   Ficha de producto (producto.html?p=slug): galería de fotos,
   precio, cesta, descripción, especificaciones y piezas parecidas
   ========================================================== */
let PRODUCT = null;
function renderProductPage() {
  const page = $("[data-product-page]");
  const key = new URLSearchParams(location.search).get("p") || "";
  const p = PRODUCT = PRODUCTS.find((x) => String(x.slug) === key || String(x.id) === key);
  if (!p) {
    page.innerHTML = `<section class="pdp-missing"><p class="eyebrow">Tienda</p><h1 class="pdp__title">Esta pieza ya no está</h1>
      <p>Puede que se haya vendido o que el enlace no sea correcto.</p><a class="btn-primary" href="productos.html">Ver todas las piezas</a></section>`;
    return;
  }
  document.title = `${p.name} | Charria Ceramics`;
  const desc = $('meta[name="description"]');
  if (desc) desc.content = (p.description || `${p.name}, cerámica hecha a mano en Charria Ceramics.`).slice(0, 160);

  const images = p.images.length ? p.images : [{ url: p.img, thumb: p.img, alt: p.alt }];
  // Medidas en su propio bloque (Panel → Productos → Medidas de la pieza): alto, diámetro, ancho,
  // fondo y capacidad; la nota libre va debajo (sets, piezas con varias partes)
  const m = p.measures || {};
  const cm = (mm) => `${(mm / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 })} cm`;
  const measures = [
    m.height_mm && ["Alto", cm(m.height_mm)],
    m.diameter_mm && ["Diámetro", `Ø ${cm(m.diameter_mm)}`],
    m.width_mm && ["Ancho", cm(m.width_mm)],
    m.depth_mm && ["Fondo", cm(m.depth_mm)],
    m.capacity_ml && ["Capacidad", m.capacity_ml >= 1000 ? `${(m.capacity_ml / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} l` : `${m.capacity_ml.toLocaleString("es-ES")} ml`],
  ].filter(Boolean);
  const measuresHTML = measures.length || p.dimensions ? `
    <section class="pdp__measures" aria-labelledby="pdp-measures-title">
      <p class="eyebrow" id="pdp-measures-title">Medidas</p>
      ${measures.length ? `<dl>${measures.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      ${p.dimensions ? `<p class="pdp__measures-note">${esc(p.dimensions)}</p>` : ""}
      <p class="pdp__measures-hint">Medidas aproximadas: al ser hecha a mano puede variar unos milímetros.</p>
    </section>` : "";
  // Ficha: peso, material, lo que se añada en el panel y el plazo de envío
  const specs = [
    p.weight && ["Peso", `${p.weight.toLocaleString("es-ES")} g`],
    p.material && ["Material", p.material],
    ...p.specs.map((s) => [s.label, s.value]),
    !p.soldOut && !shopClosed() && ["Envío", "2–5 días laborables"],
  ].filter(Boolean);
  const paragraphs = (t) => String(t).split(/\n{2,}|\n/).map((l) => l.trim()).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join("");
  const stockNote = shopClosed() ? "" : p.soldOut ? "Agotada · escríbenos si quieres una parecida" : p.lowStock ? "Últimas unidades" : "Disponible · envío en 2–5 días laborables";

  $("[data-pdp-crumb]").innerHTML = `<a href="productos.html">Tienda</a><span aria-hidden="true">/</span>${p.category ? `<a href="productos.html?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a><span aria-hidden="true">/</span>` : ""}<span aria-current="page">${esc(p.name)}</span>`;
  $("[data-pdp-gallery]").innerHTML = `
    ${images.length > 1 ? `<div class="pdp__thumbs" role="tablist" aria-label="Fotos">${images.map((img, i) =>
      `<button type="button" role="tab" data-thumb="${i}" aria-selected="${i === 0}" aria-label="Foto ${i + 1} de ${images.length}"><img src="${esc(img.thumb)}" alt=""></button>`).join("")}</div>` : ""}
    <div class="pdp__stage" data-pdp-stage>${images.map((img, i) =>
      `<button type="button" class="pdp__photo" data-photo="${i}" aria-label="Ampliar foto ${i + 1}"><img src="${esc(img.url)}" alt="${esc(img.alt)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></button>`).join("")}</div>
    ${images.length > 1 ? `<p class="pdp__count" aria-hidden="true"><span data-pdp-index>01</span> / ${pad(images.length)}</p>` : ""}`;
  $("[data-pdp-info]").innerHTML = `
    <p class="eyebrow">${esc(p.category || "Pieza única")}</p>
    <h1 class="pdp__title" data-split>${esc(p.name)}</h1>
    <p class="pdp__price">${p.discount ? `<s>${euros(p.originalCents)}</s> ` : ""}${euros(p.priceCents)}${p.discount ? ` <span class="pdp__off">−${p.discount} %</span>` : ""}</p>
    ${stockNote ? `<p class="pdp__stock${p.soldOut ? " is-out" : p.lowStock ? " is-low" : ""}">${stockNote}</p>` : ""}
    <div class="pdp__buy">
      ${shopClosed() ? closedNote()
        : p.soldOut ? `<a class="btn-primary btn-primary--ghost" href="contacto.html">Preguntar por una parecida</a>`
        : `<div class="qty" data-qty><button type="button" data-step="-1" aria-label="Quitar una">−</button><span data-qty-value>1</span><button type="button" data-step="1" aria-label="Añadir una">+</button></div>
           <button class="btn-primary pdp__add" type="button" data-add="${esc(p.id)}" data-icon="plus">Añadir al carrito</button>`}
    </div>
    ${measuresHTML}
    ${p.description ? `<div class="pdp__desc">${paragraphs(p.description)}</div>` : ""}
    ${specs.length ? `<dl class="pdp__specs">${specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
    <div class="pdp__more">
      ${p.care ? `<details><summary>Cuidados</summary><div>${paragraphs(p.care)}</div></details>` : ""}
      <details><summary>Envío y devoluciones</summary><div><p>Cada pieza se embala a mano y sale del estudio en 2–5 días laborables. Tienes 14 días para devolverla desde que la recibes.</p><p><a href="condiciones.html">Condiciones de venta</a></p></div></details>
      <details><summary>Hecho a mano</summary><div><p>Torneada y esmaltada una a una en el estudio: el tamaño, el color y el esmalte pueden variar ligeramente respecto a las fotos. Eso la hace única.</p></div></details>
    </div>`;

  // Piezas parecidas: misma categoría primero, luego las más recientes
  const related = PRODUCTS.filter((x) => x !== p)
    .sort((a, b) => ((b.category === p.category) - (a.category === p.category)) || b.added.localeCompare(a.added))
    .slice(0, 4);
  const rel = $("[data-pdp-related]");
  if (rel) {
    rel.hidden = !related.length;
    $(".catalog", rel).innerHTML = related.map((x, i) => productHTML(x, i)).join("");
  }
}

// Botones de las fichas pintadas después de cargar (filtros, piezas parecidas)
const roundAdd = window.matchMedia("(max-width: 1024px), (hover: none)");
function decorateProducts(root = document) {
  $$(".btn-primary", root).forEach((btn) => { if (!btn.querySelector(".btn-primary__label")) setButton(btn, btn.textContent.trim()); });
  $$(".product__add", root).forEach((b) => b.classList.toggle("btn-primary--round", roundAdd.matches));
}

/* ==========================================================
   Botones: texto que rueda + círculo con icono (ver .btn-primary en style.css)
   ========================================================== */
const ICONS = {
  arrow: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 8h12M9 3l5 5-5 5"/></svg>',
  plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2v12M2 8h12"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 8.5l3.5 3.5 7.5-8"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>',
};
const setButton = (btn, text, icon = btn.dataset.icon || "arrow") => {
  btn.innerHTML = `<span class="btn-primary__label"><span data-text="${text}">${text}</span></span><span class="btn-primary__icon" aria-hidden="true">${ICONS[icon]}</span>`;
};
window.setButton = setButton;

// Se pinta el contenido (API o data.js) y después se activan efectos y animaciones
loadContent().then(() => { renderContent(); initPage(); });

function initPage() {
  const galleryTrack = $("[data-gallery-track]");
  const edGallery = $("[data-ed-gallery]");

  // Cabecera: transparente sobre la foto de portada y con fondo en cuanto pisaría el contenido
  const header = $(".header");
  if (header) {
    const hero = $(".hero");
    const solidFrom = () => (hero ? Math.max(10, hero.offsetHeight - header.offsetHeight) : 10);
    const onScroll = () => header.classList.toggle("is-solid", window.scrollY > solidFrom());
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    // Sin actividad durante unos segundos la cabecera se desvanece; vuelve con el primer
    // movimiento de ratón, scroll, toque o tecla. Nunca se esconde con el menú o la cesta
    // abiertos, con el ratón encima ni con el foco dentro (navegación con teclado).
    const IDLE_MS = 3500;
    let idleTimer = 0;
    const busy = () => header.matches(":hover, :focus-within")
      || document.body.classList.contains("menu-open")
      || document.documentElement.classList.contains("cart-open");
    const sleep = () => { if (busy()) wake(); else header.classList.add("is-idle"); };
    const wake = () => {
      header.classList.remove("is-idle");
      clearTimeout(idleTimer);
      idleTimer = setTimeout(sleep, IDLE_MS);
    };
    ["mousemove", "pointerdown", "wheel", "touchstart", "keydown", "scroll"].forEach((ev) =>
      window.addEventListener(ev, wake, { passive: true }));
    header.addEventListener("focusin", wake);
    wake();
  }

  $$(".btn-primary").forEach((btn) => setButton(btn, btn.textContent.trim()));
  // En móvil y tablet el botón "Añadir" de las fichas es solo el círculo sobre la foto
  roundAdd.addEventListener("change", () => decorateProducts());
  decorateProducts();

  // Estantería de la tienda en móvil: contador y barra según el desplazamiento
  const shelf = $("[data-latest-products]");
  const shelfCount = $("[data-shelf-count]");
  if (shelf && shelfCount) {
    const total = $$(".product", shelf).length;
    const bar = $("[data-shelf-bar]");
    const update = () => {
      const max = shelf.scrollWidth - shelf.clientWidth;
      const p = max > 0 ? shelf.scrollLeft / max : 0;
      shelfCount.textContent = `${pad(Math.round(p * (total - 1)) + 1)} / ${pad(total)}`;
      bar.style.transform = `scaleX(${(1 + p * (total - 1)) / total})`;
    };
    shelf.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ==========================================================
     Scroll suave
     ========================================================== */
  let lenis = null;
  if (typeof window.Lenis !== "undefined" && !reduceMotion) {
    // Los paneles y modales (cesta, filtros, reserva, menú, cookies, visor) hacen su propio scroll:
    // Lenis no debe bloquear el dedo dentro de ellos mientras está parado.
    const OVERLAYS = ".cart, .sheet, .modal, .mobile-menu, .consent-wall, .consent-prefs, .lightbox";
    lenis = new Lenis({ duration: 1.3, smoothWheel: true, prevent: (node) => node.matches?.(OVERLAYS) });
    if (hasGsap) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  const scrollToTarget = (target, immediate = false) => {
    if (lenis) lenis.scrollTo(target, { offset: 0, immediate, force: true });
    else target.scrollIntoView({ behavior: immediate ? "auto" : "smooth" });
  };
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id.length > 1 ? $(id) : null;
      if (!target) return;
      e.preventDefault();
      setMenu(false);
      scrollToTarget(target);
    });
  });

  /* ==========================================================
     Menú móvil / tablet: cortina circular desde el botón + líneas que suben
     ========================================================== */
  const menuToggle = $("[data-menu-toggle]");
  const mobileMenu = $("[data-mobile-menu]");
  let menuTl = null;

  function animateMenu(open) {
    if (!hasGsap || reduceMotion) return;
    menuTl && menuTl.kill();
    const r = menuToggle.getBoundingClientRect();
    const at = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
    const words = $$(":scope > a span", mobileMenu);
    const extras = [$(".mobile-menu__foot", mobileMenu)];
    if (open) {
      menuTl = gsap.timeline()
        .fromTo(mobileMenu, { clipPath: `circle(0% at ${at})` }, { clipPath: `circle(150% at ${at})`, duration: 1.1, ease: "power3.inOut" })
        .fromTo(words, { yPercent: 115, rotate: 5 }, { yPercent: 0, rotate: 0, duration: 1, stagger: 0.07, ease: "expo.out" }, 0.38)
        .fromTo(extras, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, ease: "power2.out" }, 0.6);
    } else {
      menuTl = gsap.timeline()
        .to(words, { yPercent: -115, duration: 0.45, stagger: 0.03, ease: "power3.in" })
        .to(extras, { opacity: 0, duration: 0.3 }, 0)
        .to(mobileMenu, { clipPath: `circle(0% at ${at})`, duration: 0.75, ease: "power3.inOut" }, 0.2);
    }
  }

  function setMenu(open) {
    if (!menuToggle || document.body.classList.contains("menu-open") === open) return;
    document.body.classList.toggle("menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    mobileMenu.setAttribute("aria-hidden", String(!open));
    if (lenis) open ? lenis.stop() : lenis.start();
    animateMenu(open);
  }
  if (menuToggle) {
    menuToggle.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
    window.matchMedia(DESKTOP).addEventListener("change", (e) => e.matches && setMenu(false));
  }

  /* ==========================================================
     Galería de portada en móvil: carrusel Swiper (en escritorio, scroll horizontal)
     ========================================================== */
  const galleryEl = $("[data-gallery]");
  if (galleryEl && typeof window.Swiper !== "undefined") {
    const slides = $$(".art", galleryEl);
    const countEl = $("[data-gallery-count]");
    const barEl = $("[data-gallery-bar]");
    const phone = window.matchMedia(PHONE);
    let swiper = null;
    const updateUi = (s) => {
      countEl.textContent = `${pad(s.realIndex + 1)} / ${pad(slides.length)}`;
      barEl.style.transform = `scaleX(${(s.realIndex + 1) / slides.length})`;
    };
    const enable = () => {
      galleryEl.classList.add("swiper");
      galleryTrack.classList.add("swiper-wrapper");
      slides.forEach((s) => s.classList.add("swiper-slide"));
      swiper = new Swiper(galleryEl, {
        slidesPerView: "auto", centeredSlides: true, spaceBetween: 14,
        speed: 750, grabCursor: true, threshold: 6,
        on: { init: updateUi, slideChange: updateUi },
      });
    };
    const disable = () => {
      swiper.destroy(true, true);
      swiper = null;
      galleryEl.classList.remove("swiper");
      galleryTrack.classList.remove("swiper-wrapper");
      slides.forEach((s) => s.classList.remove("swiper-slide", "swiper-slide-active", "swiper-slide-next", "swiper-slide-prev"));
    };
    const sync = () => {
      if (phone.matches && !swiper) enable();
      else if (!phone.matches && swiper) disable();
      hasGsap && ScrollTrigger.refresh();
    };
    phone.addEventListener("change", sync);
    sync();
  }

  /* ==========================================================
     Animaciones
     ========================================================== */
  if (hasGsap && !reduceMotion) {
    gsap.registerPlugin(ScrollTrigger);

    const split = (el, types) => (el && typeof window.SplitType !== "undefined" ? new SplitType(el, { types: types === "chars" ? "words, chars" : types }) : null);

    // Título del hero: cada letra sube girando en X con física elástica
    const heroSplit = split($(".hero__name"), "chars");
    if (heroSplit) {
      gsap.from(heroSplit.chars, {
        yPercent: 110, rotateX: -90, opacity: 0,
        duration: 1.6, ease: "elastic.out(1, 0.6)", stagger: 0.06, delay: 0.2,
      });
      gsap.from(".hero__sub", { opacity: 0, y: 20, duration: 1, delay: 1 });
    }

    // Títulos de sección y de página: letra a letra
    $$(".section-head__title, .footer__big, .page-head__title, .pdp__title").forEach((el) => {
      const s = split(el, "chars");
      if (!s) return;
      gsap.from(s.chars, {
        yPercent: 100, opacity: 0, duration: 1.1, ease: "power4.out", stagger: 0.03,
        scrollTrigger: { trigger: el, start: "top 88%" },
      });
    });

    // Fotos: fundido corto en cuanto asoman por abajo, para que nunca parezca que tardan en cargar
    $$(".product__img, .ed-item__img, .art__img, .private__media").forEach((el) => {
      gsap.from(el, {
        opacity: 0.25, y: 14, duration: 0.5, ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top bottom", once: true },
      });
    });

    const intro = split($("[data-reveal-words]"), "words");
    const mm = gsap.matchMedia();

    // Tablet y escritorio
    mm.add(NOT_PHONE, () => {
      if ($(".hero")) {
        gsap.to(".hero__media img", {
          scale: 1, yPercent: 12, ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
        });
        gsap.to(".hero__title", {
          yPercent: -40, ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
        });
      }
      // Manifiesto: palabras que se encienden con el scroll
      if (intro) {
        // Recorrido corto: la frase entera («…Objetos para vivir despacio.») queda encendida
        // cuando el bloque llega a media pantalla, sin tener que seguir bajando
        gsap.fromTo(intro.words, { opacity: 0.12 }, {
          opacity: 1, stagger: 0.05, ease: "none",
          scrollTrigger: { trigger: ".intro", start: "top 85%", end: "top 45%", scrub: 0.4 },
        });
      }
      if ($(".class-list")) {
        gsap.from(".class-row", {
          opacity: 0, y: 40, stagger: 0.1, duration: 1, ease: "power3.out",
          // .classes y no .class-list: arriba puede estar «Semanales» o solo las fechas especiales
          scrollTrigger: { trigger: ".classes", start: "top 55%" },
        });
      }
      if ($(".private")) {
        gsap.to(".private__media img", {
          scale: 1, ease: "none",
          scrollTrigger: { trigger: ".private", start: "top bottom", end: "bottom top", scrub: true },
        });
      }
    });

    // Solo escritorio
    mm.add(DESKTOP, () => {
      // Columnas de la tienda con distinta velocidad (parallax)
      $$(".shop__col").forEach((col) => {
        gsap.to(col, {
          y: Number(col.dataset.speed) * 2, ease: "none",
          scrollTrigger: { trigger: ".shop", start: "top bottom", end: "bottom top", scrub: true },
        });
      });

      // Galería: pantalla fijada y recorrido horizontal
      if (galleryTrack) {
        const distance = () => galleryTrack.scrollWidth - window.innerWidth;
        gsap.to(galleryTrack, {
          x: () => -distance(), ease: "none",
          scrollTrigger: {
            trigger: ".gallery", start: "top top", end: () => "+=" + distance(),
            pin: ".gallery__pin", scrub: 1, invalidateOnRefresh: true,
          },
        });
      }

      // galeria.html: las fotos se desplazan suavemente dentro de su marco
      $$(".ed-item__img img").forEach((img) => {
        gsap.fromTo(img, { scale: 1.12, yPercent: -4 }, {
          scale: 1.12, yPercent: 4, ease: "none",
          scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true },
        });
      });
    });

    // Solo móvil: cada bloque aparece con fundido y subida al entrar en pantalla
    mm.add(PHONE, () => {
      const items = $$([
        "main .eyebrow", "main .section-head__desc", ".intro__text",
        ".shop__ui", ".shop__more", ".class-row", ".private__lead",
        "main .form__field", "main .form .btn-primary", ".gallery .btn-primary", ".gallery__ui",
        ".contact__lead", ".contact__details > div", ".footer__cols > div", ".footer__legal", ".footer__credit",
        ".page-head__desc", ".filters", ".ed-item figcaption",
      ].join(", "));
      gsap.set(items, { autoAlpha: 0, y: 18 });
      ScrollTrigger.batch(items, {
        start: "clamp(top 98%)",
        once: true,
        onEnter: (batch) => gsap.to(batch, {
          autoAlpha: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.04, overwrite: true,
        }),
      });
    });

    window.addEventListener("load", () => ScrollTrigger.refresh());
  }

  // Si se llega con un ancla (p. ej. index.html#clases desde otra página), ajusta la posición cuando todo ha cargado
  window.addEventListener("load", () => {
    const target = location.hash.length > 1 ? $(location.hash) : null;
    if (!target) return;
    setTimeout(() => scrollToTarget(target, true), 60);
  });

  /* ==========================================================
     Visor a pantalla completa (galeria.html)
     ========================================================== */
  const lightbox = $("[data-lightbox]");
  const pdpStage = $("[data-pdp-stage]");
  // La galería muestra las obras; la ficha de producto, sus fotos
  const LB_ITEMS = edGallery
    ? GALLERY.map((g) => ({ src: g.img.replace("w=1600", "w=2200"), alt: g.alt, title: g.title, meta: [g.technique, g.year, AVAILABILITY[g.availability]].filter(Boolean).join(" · ") }))
    : PRODUCT ? PRODUCT.images.map((img, i) => ({ src: img.url, alt: img.alt, title: PRODUCT.name, meta: `Foto ${i + 1}` })) : [];
  if (lightbox && LB_ITEMS.length && (edGallery || pdpStage)) {
    const img = $("[data-lb-img]", lightbox);
    const title = $("[data-lb-title]", lightbox);
    const meta = $("[data-lb-meta]", lightbox);
    const counter = $("[data-lb-count]", lightbox);
    let index = 0;
    let lastFocus = null;

    const show = (i, dir = 0) => {
      index = (i + LB_ITEMS.length) % LB_ITEMS.length;
      const g = LB_ITEMS[index];
      const swap = () => {
        img.src = g.src;
        img.alt = g.alt;
        title.textContent = g.title;
        meta.textContent = g.meta;
        counter.textContent = `${pad(index + 1)} / ${pad(LB_ITEMS.length)}`;
      };
      if (!hasGsap || !dir) { swap(); return; }
      gsap.timeline()
        .to(img, { opacity: 0, x: -40 * dir, duration: 0.3, ease: "power2.in", onComplete: swap })
        .fromTo(img, { opacity: 0, x: 40 * dir }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" });
    };
    const open = (i) => {
      lastFocus = document.activeElement;
      show(i);
      lightbox.hidden = false;
      lenis && lenis.stop();
      if (hasGsap) gsap.fromTo(lightbox, { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: 0.8, ease: "expo.inOut" });
      $("[data-lb-close]", lightbox).focus();
    };
    const close = () => {
      const done = () => { lightbox.hidden = true; lenis && lenis.start(); lastFocus && lastFocus.focus(); };
      if (hasGsap) gsap.to(lightbox, { clipPath: "inset(0 0 100% 0)", duration: 0.6, ease: "expo.inOut", onComplete: done });
      else done();
    };

    if (edGallery) {
      edGallery.addEventListener("click", (e) => { const f = e.target.closest(".ed-item"); if (f && !e.target.closest("a")) open(Number(f.dataset.index)); });
      edGallery.addEventListener("keydown", (e) => {
        const f = !e.target.closest("a") && e.target.closest(".ed-item");
        if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(Number(f.dataset.index)); }
      });
    }
    if (pdpStage) pdpStage.addEventListener("click", (e) => { const b = e.target.closest("[data-photo]"); if (b) open(Number(b.dataset.photo)); });
    $("[data-lb-close]", lightbox).addEventListener("click", close);
    $("[data-lb-prev]", lightbox).addEventListener("click", () => show(index - 1, -1));
    $("[data-lb-next]", lightbox).addEventListener("click", () => show(index + 1, 1));
    window.addEventListener("keydown", (e) => {
      if (lightbox.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(index - 1, -1);
      if (e.key === "ArrowRight") show(index + 1, 1);
    });
    // Deslizar con el dedo para pasar de foto
    let startX = null;
    const stage = $(".lightbox__stage", lightbox);
    stage.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) dx < 0 ? show(index + 1, 1) : show(index - 1, -1);
      startX = null;
    });
  }

  /* ==========================================================
     Ficha de producto: miniaturas, foto activa y cantidad
     ========================================================== */
  if (pdpStage) {
    const photos = $$("[data-photo]", pdpStage);
    const thumbs = $$("[data-thumb]");
    const indexEl = $("[data-pdp-index]");
    const horizontal = () => pdpStage.scrollWidth > pdpStage.clientWidth + 4; // móvil: carrusel
    const setActive = (i) => {
      thumbs.forEach((t, j) => t.setAttribute("aria-selected", String(j === i)));
      if (indexEl) indexEl.textContent = pad(i + 1);
    };
    thumbs.forEach((t) => t.addEventListener("click", () => {
      const photo = photos[Number(t.dataset.thumb)];
      if (horizontal()) pdpStage.scrollTo({ left: photo.offsetLeft, behavior: reduceMotion ? "auto" : "smooth" });
      else if (lenis) lenis.scrollTo(photo, { offset: -90 });
      else photo.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    }));
    if ("IntersectionObserver" in window && photos.length > 1) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) setActive(photos.indexOf(en.target)); });
      }, { root: null, threshold: 0.55 });
      photos.forEach((ph) => io.observe(ph));
    }
    const qty = $("[data-qty]");
    if (qty) {
      const value = $("[data-qty-value]", qty);
      const update = (n) => {
        value.textContent = n;
        $('[data-step="-1"]', qty).disabled = n <= 1;
        $('[data-step="1"]', qty).disabled = n >= 10;
      };
      qty.addEventListener("click", (e) => {
        const b = e.target.closest("[data-step]");
        if (b) update(Math.min(10, Math.max(1, Number(value.textContent) + Number(b.dataset.step))));
      });
      update(1);
    }
    if (hasGsap && !reduceMotion) {
      gsap.from(".pdp__info > *:not(.pdp__title)", { opacity: 0, y: 20, duration: .7, stagger: .06, delay: .2, ease: "power3.out", clearProps: "all" });
      gsap.from(photos[0], { clipPath: "inset(8% 8% 8% 8%)", duration: 1, ease: "expo.out", clearProps: "clipPath" });
    }
  }

  /* ==========================================================
     Imagen flotante y cursor (solo con ratón)
     ========================================================== */
  if (hasMouse) {
    const floatBox = $(".class-float");
    const floatImg = floatBox && $("img", floatBox);
    let fx = 0, fy = 0, tx = 0, ty = 0;
    if (floatBox) {
      $$(".class-row").forEach((row) => {
        row.addEventListener("mouseenter", () => {
          floatImg.src = row.dataset.img;
          floatBox.style.transition = "opacity .4s, transform .4s";
          floatBox.style.opacity = 1;
        });
        row.addEventListener("mouseleave", () => { floatBox.style.opacity = 0; });
      });
    }

    const cursor = $(".cursor");
    let cx = innerWidth / 2, cy = innerHeight / 2, mx = cx, my = cy;
    window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; tx = e.clientX + 160; ty = e.clientY; });
    (function loop() {
      cx += (mx - cx) * 0.18; cy += (my - cy) * 0.18;
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      if (floatBox) {
        fx += (tx - fx) * 0.1; fy += (ty - fy) * 0.1;
        floatBox.style.left = fx + "px"; floatBox.style.top = fy + "px";
        floatBox.style.transform = `translate(-50%, -50%) rotate(${(tx - fx) * 0.03}deg)`;
      }
      requestAnimationFrame(loop);
    })();
    // Botones magnéticos: se acercan un poco al cursor y vuelven con un rebote
    if (hasGsap) {
      $$(".btn-primary:not(.product__add)").forEach((btn) => {
        btn.addEventListener("mousemove", (e) => {
          const r = btn.getBoundingClientRect();
          gsap.to(btn, { x: (e.clientX - r.left - r.width / 2) * 0.18, y: (e.clientY - r.top - r.height / 2) * 0.3, duration: 0.4, ease: "power3.out" });
        });
        btn.addEventListener("mouseleave", () => gsap.to(btn, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.4)" }));
      });
    }
    document.addEventListener("mouseover", (e) => cursor.classList.toggle("is-big", !!e.target.closest("a, button, .class-row__name, .ed-item")));
  }

  /* ==========================================================
     Cesta: la lógica vive en cart.js (panel lateral y pago)
     ========================================================== */
  if (lenis) {
    document.addEventListener("cart:open", () => lenis.stop());
    document.addEventListener("cart:close", () => lenis.start());
    document.addEventListener("consent:open", () => lenis.stop());
    document.addEventListener("consent:close", () => lenis.start());
    // El aviso de cookies puede haberse abierto antes de que arrancara el scroll suave
    if (document.documentElement.classList.contains("consent-open")) lenis.stop();
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn || !window.Cart) return;
    const p = PRODUCTS.find((x) => String(x.id) === btn.dataset.add);
    if (!p) return;
    const qty = btn.closest(".pdp__buy") ? Number($("[data-qty-value]").textContent) || 1 : 1;
    window.Cart.add({ id: p.id, title: p.name, price_cents: p.priceCents, img: p.img }, qty);
    setButton(btn, "Añadido", "check");
    btn.classList.add("is-added");
    const count = $("[data-cart-count]");
    if (hasGsap && count) gsap.fromTo(count.parentElement, { scale: 1.25 }, { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.5)" });
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { setButton(btn, "Añadir al carrito"); btn.classList.remove("is-added"); }, 1600);
  });

  /* ==========================================================
     Formularios conectados a la API
     ========================================================== */
  // Muestra el resultado (o el error) debajo del formulario
  const formMessage = (form, text, isError = false) => {
    const ok = $(".form__ok", form);
    ok.textContent = text;
    ok.classList.toggle("form__ok--error", isError);
    ok.hidden = false;
  };
  // Casillas de consentimiento (RGPD): la obligatoria se comprueba antes de enviar
  const consentsOf = (f) => ({ terms: !!f.terms?.checked, marketing: !!f.marketing?.checked, profile: !!f.profile?.checked });
  const requireCheck = (input, message) => {
    if (input.checked) return;
    input.closest(".check").classList.add("is-invalid");
    input.addEventListener("change", () => input.closest(".check").classList.remove("is-invalid"), { once: true });
    input.focus();
    throw Object.assign(new Error(message), { status: 422 });
  };
  const sendForm = (form, fn) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    const label = btn.textContent.trim();
    btn.disabled = true;
    $(".form__ok", form).hidden = true;
    try {
      await fn(form.elements);
    } catch (err) {
      const fields = Object.values(err.fields || {});
      formMessage(form, err.status === 404 || !err.status
        ? "Ahora mismo no podemos recibir reservas online. Escríbenos a hola@charriaceramics.com."
        : err.message + (fields.length ? ` (${fields.join(" · ")})` : ""), true);
    } finally {
      btn.disabled = false;
      setButton(btn, label);
    }
  });

  // La página «Reserva confirmada» se abre en otra pestaña. Tiene que abrirse en el mismo
  // clic (si no, el navegador la bloquea): sale con «Un momento» hasta que la reserva existe.
  // null si el navegador no deja abrirla: entonces se sigue en esta pestaña.
  const openBookingTab = () => {
    try { return window.open("reserva.html?preparando=1", "_blank"); } catch { return null; }
  };

  // Reserva de clase en grupo: se paga en Stripe (las plazas se retienen mientras tanto)
  // o, si la clase lo admite, en el taller (la plaza queda reservada sin pagar)
  const modal = $("[data-modal]");
  if (modal) {
    const form = $("[data-form]", modal);
    const payField = $("[data-pay-field]", modal);
    const showPay = () => {
      const method = form.elements.pay.value;
      setButton($("[data-pay-submit]", form), method === "in_person" ? "Reservar" : method === "subscription" ? "Suscribirme y pagar" : "Reservar y pagar");
      $("[data-pay-note]", form).textContent = {
        in_person: "Tu plaza queda reservada al momento y pagas en el taller el día de la clase (efectivo, tarjeta o Bizum). Si no puedes venir, avísanos con al menos 72 horas de antelación para cambiar la fecha o liberar tu plaza.",
        subscription: "Tu plaza se confirmará tras el primer pago, en la página segura de Stripe; la cuota se cobra cada mes en tu tarjeta. Para cambiar de fecha avísanos con 72 horas de antelación, y para darte de baja, antes de la siguiente renovación.",
        online: "Tu plaza se confirmará tras el pago, en la página segura de Stripe (queda guardada 30 minutos mientras pagas). Las cancelaciones deben notificarse con 72 horas de antelación para cambios o reembolsos.",
      }[method];
    };
    $$("input[name=pay]", form).forEach((r) => r.addEventListener("change", showPay));
    $$("[data-book]").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("[data-modal-title]", modal).textContent = btn.dataset.title || btn.dataset.book;
        const slot = SLOTS.get(btn.dataset.slot);
        const dateField = $("[data-date-field]", modal);
        const setSession = (id, seatsLeft) => {
          form.dataset.session = id;
          const max = Math.max(1, Math.min(6, Number(seatsLeft) || 3));
          form.elements.seats.innerHTML = Array.from({ length: max }, (_, i) => `<option>${i + 1}</option>`).join("");
        };
        if (slot && slot.sessions.length > 1 && (slot.weekly || slot.c.show_date !== false)) {
          // Clase semanal: se elige la semana
          const label = (x) => x.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) + (x.seats_left ? "" : " · completo");
          form.elements.date.innerHTML = slot.sessions.map((x) => `<option value="${x.id}" ${x.seats_left ? "" : "disabled"} ${String(x.id) === btn.dataset.book ? "selected" : ""}>${esc(label(x))}</option>`).join("");
          form.elements.date.onchange = () => setSession(form.elements.date.value, slot.sessions.find((x) => String(x.id) === form.elements.date.value)?.seats_left);
          dateField.hidden = false;
        } else if (dateField) {
          dateField.hidden = true;
        }
        setSession(btn.dataset.book, btn.dataset.seats);
        // Formas de pago que la clase tiene activadas; se elige solo si hay más de una
        const stripeOn = CLASSES?.online_payment !== false;
        const c = slot?.c;
        // Semanal «por mes»: la cuota es el precio de esa clase semanal
        const monthlyCents = slot?.weekly?.price_period === "month" ? slot.weekly.price_cents : c?.monthly_price_cents;
        const methods = c ? [
          stripeOn && c.pay_online !== false && "online",
          stripeOn && c.pay_subscription && monthlyCents > 0 && "subscription",
          c.pay_in_person && "in_person",
        ].filter(Boolean) : ["online"];
        $$("[data-pay-option]", payField).forEach((o) => { o.hidden = !methods.includes(o.dataset.payOption); });
        $("[data-sub-price]", payField).textContent = `${monthlyCents > 0 ? `${euros(monthlyCents)} al mes por plaza. ` : ""}Pagas online cada mes con tarjeta en Stripe. Para darte de baja, escríbenos.`;
        payField.hidden = methods.length < 2;
        form.elements.pay.value = methods[0] || "online";
        showPay();
        $$(".check input[type=checkbox]", form).forEach((c) => { c.checked = false; c.closest(".check").classList.remove("is-invalid"); });
        $(".form__ok", modal).hidden = true;
        modal.hidden = false;
        lenis && lenis.stop();
        form.elements.name.focus();
      });
    });
    const closeModal = () => { modal.hidden = true; lenis && lenis.start(); };
    $("[data-close]", modal).addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });
    sendForm(form, async (f) => {
      if (!CLASSES) throw new Error();
      requireCheck(f.terms, "Para reservar tienes que aceptar las condiciones de las clases y la política de privacidad.");
      const tab = openBookingTab();
      try {
        const res = await apiPost("bookings", {
          session_id: Number(form.dataset.session), seats: Number(f.seats.value), payment_method: f.pay.value,
          customer: { name: f.name.value, email: f.email.value, phone: f.phone.value },
          consents: consentsOf(f),
        });
        // Online: Stripe en la pestaña nueva, que vuelve a reserva.html; en el taller: reserva.html directamente
        const next = res.checkout_url || res.confirmation_url;
        if (!tab) {
          formMessage(form, res.checkout_url ? "Te llevamos al pago seguro…" : `Reserva ${res.reference} confirmada. Abriendo los datos de tu reserva…`);
          window.location.href = next;
          return;
        }
        tab.location.href = next;
        formMessage(form, res.checkout_url
          ? "Completa el pago en la pestaña que se ha abierto. Al pagar verás allí tu reserva confirmada con todos los datos."
          : `Reserva ${res.reference} confirmada. Pagas ${euros(res.total_cents)} en el taller el día de la clase (efectivo, tarjeta o Bizum). Tienes todos los datos en la pestaña nueva y en tu email.`);
        $$("input[type=checkbox]", form).forEach((c) => { c.checked = false; });
      } catch (err) {
        tab?.close();
        throw err;
      }
    });
  }

  // Clase privada: solicitud que el estudio confirma por email
  const privateForm = $("[data-private-form]");
  if (privateForm) {
    privateForm.elements.fecha.min = new Date().toISOString().slice(0, 10);
    sendForm(privateForm, async (f) => {
      if (!CLASSES?.private.length) throw new Error();
      requireCheck(f.terms, "Para enviar la solicitud tienes que aceptar las condiciones de las clases y la política de privacidad.");
      const tab = openBookingTab();
      let res;
      try {
        res = await apiPost("bookings/private", {
          class_id: Number(f.tipo.value), preferred_date: f.fecha.value, preferred_slot: f.franja.value,
          customer: { name: f.nombre.value, email: f.email.value },
          consents: consentsOf(f),
        });
      } catch (err) {
        tab?.close();
        throw err;
      }
      if (tab && res.confirmation_url) tab.location.href = res.confirmation_url;
      else tab?.close();
      formMessage(privateForm, "Gracias. Te escribiremos en menos de 24 h para confirmar." + (tab && res.confirmation_url ? " Tienes los datos de tu solicitud en la pestaña nueva." : ""));
      privateForm.reset();
    });
  }

  // Contacto
  const contactForm = $("[data-contact-form]");
  if (contactForm) {
    const obra = new URLSearchParams(location.search).get("obra");
    if (obra) {
      contactForm.elements.motivo.value = "Encargo personalizado";
      contactForm.elements.mensaje.value = `Hola, me interesa la obra «${obra.slice(0, 160)}» de la galería. ¿Me podéis decir el precio y el plazo para un encargo?`;
    }
    sendForm(contactForm, async (f) => {
      requireCheck(f.privacy, "Para enviar el mensaje tienes que aceptar la política de privacidad.");
      await apiPost("contact", { name: f.nombre.value, email: f.email.value, reason: f.motivo.value, message: f.mensaje.value, consents: { privacy: true } });
      formMessage(contactForm, "Gracias. Te responderemos en menos de 24 h.");
      contactForm.reset();
    });
  }
}
