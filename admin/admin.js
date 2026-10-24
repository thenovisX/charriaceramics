/* ==========================================================
   Charria Ceramics · Panel de administración
   JavaScript sin dependencias. Habla con la API REST (/api) enviando el
   token de sesión en cada petición; el servidor lo comprueba siempre.
   ========================================================== */

const API = "../api";
const TOKEN_KEY = "charria-admin-token";
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Todo texto que venga de la base de datos se escapa antes de pintarlo
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (cents) => (Number(cents || 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
// Acepta "38", "38,50", "38.50" y "1.250,00"
const toCents = (v) => {
  let s = String(v).trim().replace(/\s|€/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return Math.round(parseFloat(s) * 100);
};
const eurosInput = (cents) => (cents === null || cents === undefined || cents === "") ? "" : (cents / 100).toFixed(2).replace(".", ",");
const fmtDate = (s, time = true) => s ? new Date(s.replace(" ", "T")).toLocaleString("es-ES", time
  ? { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
  : { day: "2-digit", month: "short", year: "numeric" }) : "";

/* ---------- Sesión y peticiones ---------- */
let token = null;
try { token = sessionStorage.getItem(TOKEN_KEY); } catch { /* sin almacenamiento */ }
const setToken = (t) => { token = t; try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* */ } };

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Error ${status}`);
    this.status = status;
    this.fields = body?.error?.fields || {};
  }
}

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(API + path, opts);
  if (res.status === 204) return null;
  let json = null;
  try { json = await res.json(); } catch { /* respuesta vacía */ }
  if (res.status === 401 && path !== "/auth/login") { setToken(null); showLogin(); }
  if (!res.ok) throw new ApiError(res.status, json);
  return json.data;
}

/* ---------- Avisos ---------- */
const toastEl = $("[data-toast]");
let toastTimer;
function toast(msg, bad = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("toast--bad", bad);
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, bad ? 6000 : 2600);
}
const fail = (e) => toast(e.message || "Algo ha fallado", true);

// Marca en rojo los campos que el servidor ha rechazado
function showFieldErrors(form, fields) {
  $$(".field", form).forEach((f) => { f.classList.remove("has-error"); $(".field-error", f)?.remove(); });
  Object.entries(fields).forEach(([name, msg]) => {
    const input = form.elements[name] || form.elements[name.split(".").pop()];
    const field = input?.closest?.(".field");
    if (!field) return;
    field.classList.add("has-error");
    field.insertAdjacentHTML("beforeend", `<span class="field-error">${esc(msg)}</span>`);
  });
}

async function submitting(form, fn) {
  const btn = $("button[type=submit]", form);
  btn && (btn.disabled = true);
  try { await fn(); } catch (e) { if (e.fields) showFieldErrors(form, e.fields); fail(e); } finally { btn && (btn.disabled = false); }
}

/* ---------- Panel lateral ---------- */
const drawer = $("[data-drawer]");
function openDrawer(title, html) {
  $("[data-drawer-title]").textContent = title;
  $("[data-drawer-body]").innerHTML = html;
  drawer.hidden = false;
  $("input, select, textarea, button", $("[data-drawer-body]"))?.focus();
  return $("[data-drawer-body]");
}
const closeDrawer = () => { drawer.hidden = true; };
$$("[data-drawer-close]").forEach((el) => el.addEventListener("click", closeDrawer));
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });

/* ---------- Componentes ---------- */
const field = (label, input, hint = "") => `<label class="field"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ""}</label>`;
const input = (name, value = "", attrs = "") => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
const toggle = (name, checked, label, extra = "") => `<label class="switch ${extra}"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span class="switch__track"></span>${label}</label>`;
const STATUS = {
  pending: ["Sin pagar", "warn"], paid: ["Pagado", "ok"], shipped: ["Enviado", "ink"], cancelled: ["Cancelado", "bad"], refunded: ["Reembolsado", "bad"],
  requested: ["Solicitada", "warn"], pending_payment: ["Pagando", "warn"], confirmed: ["Confirmada", "ok"],
};
const badge = (s) => { const [t, c] = STATUS[s] || [s, ""]; return `<span class="badge badge--${c}">${t}</span>`; };
const filters = (options, current) => `<div class="filters" data-filters>${options.map(([v, t]) =>
  `<button type="button" data-value="${v}" aria-pressed="${v === current}">${t}</button>`).join("")}</div>`;

/* ==========================================================
   Vistas
   ========================================================== */
const main = $("[data-main]");
const views = {};
let state = { orderStatus: "", bookingStatus: "" };

/* ---------- Resumen ---------- */
views.resumen = async () => {
  const s = await api("GET", "/admin/stats");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Hoy</p><h1>Resumen</h1></div></div>
    ${s.payments_configured ? "" : '<p class="notice">Stripe no está configurado: la tienda y las reservas en grupo no aceptan pagos todavía. Ponlo en <a href="#ajustes">Ajustes</a>.</p>'}
    ${s.packlink_configured ? "" : '<p class="notice">Packlink PRO no está configurado: se usa la tarifa plana de envío. Puedes configurarlo en <a href="#ajustes">Ajustes</a>.</p>'}
    <div class="cards">
      <a class="card" href="#pedidos"><span class="eyebrow">Pedidos por enviar</span><p class="card__num">${s.orders_to_ship}</p></a>
      <a class="card" href="#pedidos"><span class="eyebrow">Para recoger en estudio</span><p class="card__num">${s.orders_to_collect}</p></a>
      <a class="card" href="#reservas"><span class="eyebrow">Clases privadas por confirmar</span><p class="card__num">${s.private_requests}</p></a>
      <a class="card" href="#clases"><span class="eyebrow">Próximos horarios</span><p class="card__num">${s.upcoming_sessions}</p></a>
      <div class="card"><span class="eyebrow">Ventas tienda · 30 días</span><p class="card__num">${money(s.sales_30d_cents)}</p></div>
      <div class="card"><span class="eyebrow">Clases cobradas · 30 días</span><p class="card__num">${money(s.bookings_30d_cents)}</p></div>
    </div>
    <h2 style="font-size:1.5rem;margin-bottom:1rem">Stock bajo</h2>
    ${s.low_stock.length ? `<div class="table-wrap"><table><tbody>${s.low_stock.map((p) =>
      `<tr><td>${esc(p.title)}</td><td class="num">${p.stock} ${p.stock === 1 ? "unidad" : "unidades"}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="muted">Todo bien de stock.</p>'}`;
};

/* ---------- Pedidos ---------- */
views.pedidos = async () => {
  const q = state.orderStatus ? `?status=${state.orderStatus}` : "";
  const orders = await api("GET", "/admin/orders" + q);
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Tienda</p><h1>Pedidos</h1></div></div>
    ${filters([["", "Activos"], ["paid", "Pagados"], ["shipped", "Enviados"], ["pending", "Sin pagar"], ["cancelled", "Cancelados"], ["refunded", "Reembolsados"]], state.orderStatus)}
    <div class="table-wrap">${orders.length ? `<table>
      <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th class="num">Total</th></tr></thead>
      <tbody>${orders.map((o) => `<tr class="is-clickable" data-id="${o.id}">
        <td>${esc(o.reference)}</td><td>${fmtDate(o.created_at)}</td><td>${esc(o.customer.name)}<br><span class="muted">${esc(o.customer.email)}</span></td>
        <td>${o.shipping.method === "pickup" ? "Recogida" : esc(o.shipping.city)}</td><td>${badge(o.status)}</td><td class="num">${money(o.total_cents)}</td></tr>`).join("")}
      </tbody></table>` : '<p class="empty">No hay pedidos aquí.</p>'}</div>`;
  $("[data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.orderStatus = b.dataset.value; views.pedidos().catch(fail); } });
  $$("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openOrder(tr.dataset.id)));
};

async function openOrder(id) {
  const o = await api("GET", `/admin/orders/${id}`);
  const s = o.shipping;
  const body = openDrawer(`Pedido ${o.reference}`, `
    <div class="row">${badge(o.status)}<span class="muted">${fmtDate(o.created_at)}</span></div>
    <h3>Productos</h3>
    <div class="table-wrap"><table><tbody>${o.items.map((i) => `<tr><td>${i.quantity} × ${esc(i.title)}${i.discount_percent ? ` <span class="badge">-${i.discount_percent} %</span>` : ""}</td><td class="num">${money(i.line_total_cents)}</td></tr>`).join("")}
      <tr><td class="muted">Envío · ${esc(s.service_name)}</td><td class="num">${money(o.shipping_cents)}</td></tr>
      ${o.discount_cents ? `<tr><td class="muted">Descuentos aplicados</td><td class="num">-${money(o.discount_cents)}</td></tr>` : ""}
      <tr><td><strong>Total</strong></td><td class="num"><strong>${money(o.total_cents)}</strong></td></tr></tbody></table></div>
    <h3>Cliente</h3>
    <dl><dt>Nombre</dt><dd>${esc(o.customer.name)}</dd><dt>Email</dt><dd><a href="mailto:${esc(o.customer.email)}">${esc(o.customer.email)}</a></dd><dt>Teléfono</dt><dd>${esc(o.customer.phone) || "—"}</dd>
    ${s.method === "pickup" ? "<dt>Entrega</dt><dd>Recogida en el estudio</dd>" : `<dt>Dirección</dt><dd>${esc(s.street)}<br>${esc(s.postal_code)} ${esc(s.city)} (${esc(s.country)})</dd><dt>Peso</dt><dd>${(s.weight_grams / 1000).toFixed(2)} kg</dd>`}
    ${s.packlink_reference ? `<dt>Packlink</dt><dd>${esc(s.packlink_reference)}</dd>` : ""}
    ${s.packlink_error ? `<dt>Error Packlink</dt><dd class="form-error">${esc(s.packlink_error)}</dd>` : ""}
    ${o.stripe_payment_intent ? `<dt>Pago Stripe</dt><dd>${esc(o.stripe_payment_intent)}</dd>` : ""}</dl>
    <h3>Acciones</h3>
    <div class="row">
      ${o.status === "paid" ? '<button class="btn" data-status="shipped">Marcar como enviado</button>' : ""}
      ${o.status === "paid" && s.method === "delivery" && !s.packlink_reference ? '<button class="btn btn--ghost" data-packlink>Crear envío en Packlink</button>' : ""}
      ${["paid", "shipped"].includes(o.status) ? '<button class="btn btn--danger" data-status="refunded">Marcar reembolsado</button>' : ""}
      ${o.status === "pending" ? '<button class="btn btn--danger" data-status="cancelled">Cancelar</button>' : ""}
    </div>
    <p class="muted" style="margin-top:1rem;font-size:.82rem">El reembolso del dinero se hace desde el panel de Stripe; aquí solo se marca el pedido.</p>`);
  $$("[data-status]", body).forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.status !== "shipped" && !confirm("¿Seguro?")) return;
    try { await api("PATCH", `/admin/orders/${id}`, { status: b.dataset.status }); toast("Pedido actualizado"); closeDrawer(); views.pedidos(); } catch (e) { fail(e); }
  }));
  $("[data-packlink]", body)?.addEventListener("click", async () => {
    try { await api("POST", `/admin/orders/${id}/packlink`); toast("Borrador creado en Packlink PRO"); openOrder(id); } catch (e) { fail(e); }
  });
}

/* ---------- Productos ---------- */
views.productos = async () => {
  const products = await api("GET", "/admin/products");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Tienda</p><h1>Productos</h1><p>${products.length} piezas. El interruptor “Agotado” oculta el botón de compra aunque quede stock.</p></div>
      <button class="btn" data-new>Nuevo producto</button></div>
    <div class="table-wrap">${products.length ? `<table>
      <thead><tr><th></th><th>Pieza</th><th class="num">Precio</th><th class="num">Stock</th><th>Agotado</th><th>Visible</th></tr></thead>
      <tbody>${products.map((p) => `<tr class="is-clickable" data-id="${p.id}">
        <td>${p.images[0] ? `<img class="thumb" src="${esc(p.images[0].thumb_url)}" alt="">` : '<div class="thumb"></div>'}</td>
        <td>${esc(p.title)}<br><span class="muted">${esc(p.category)}</span></td>
        <td class="num">${p.discount_percent ? `<s class="muted">${money(p.price_cents)}</s><br>${money(p.final_price_cents)} <span class="badge">-${p.discount_percent} %</span>` : money(p.price_cents)}</td>
        <td class="num">${p.stock}${p.held ? `<br><span class="muted">${p.held} en pago</span>` : ""}</td>
        <td data-stop>${toggle("sold_out", p.sold_out_manual, "", "switch--bad")}</td>
        <td>${p.is_active ? '<span class="badge badge--ok">Sí</span>' : '<span class="badge">Oculto</span>'}</td></tr>`).join("")}
      </tbody></table>` : '<p class="empty">Aún no hay productos.</p>'}</div>`;
  $("[data-new]").addEventListener("click", () => productForm(null));
  $$("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", (e) => { if (!e.target.closest("[data-stop]")) productForm(products.find((p) => p.id === Number(tr.dataset.id))); });
    $("input[name=sold_out]", tr).addEventListener("change", async (e) => {
      try { await api("PATCH", `/admin/products/${tr.dataset.id}/sold-out`, { sold_out: e.target.checked }); toast(e.target.checked ? "Marcado como agotado" : "Disponible de nuevo"); }
      catch (err) { e.target.checked = !e.target.checked; fail(err); }
    });
  });
};

function productForm(p) {
  const body = openDrawer(p ? p.title : "Nuevo producto", `
    <form class="stack" data-form novalidate>
      ${field("Título", input("title", p?.title, "required maxlength=160"))}
      <div class="grid-2">
        ${field("Categoría", input("category", p?.category, 'maxlength=80 list="cats"'), "Cuencos, Jarrones, Tazas, Platos, Sets…")}
        ${field("Precio (€)", input("price", eurosInput(p?.price_cents), 'inputmode="decimal" required'))}
        ${field("Descuento (%)", input("discount_percent", p?.discount_percent ?? 0, 'type=number min=0 max=90'))}
        ${field("Stock (unidades)", input("stock", p?.stock ?? 1, "type=number min=0"))}
      </div>
      ${field("Descripción", `<textarea name="description" maxlength="5000">${esc(p?.description)}</textarea>`)}
      <div class="grid-2">
        ${field("Peso (g)", input("weight_grams", p?.weight_grams ?? 1000, "type=number min=1"), "Para calcular el envío")}
        ${field("Medidas L × An × Al (cm)", `<div class="row" style="flex-wrap:nowrap">${input("length_cm", p?.length_cm ?? 0, "type=number min=0 aria-label=Largo")}${input("width_cm", p?.width_cm ?? 0, "type=number min=0 aria-label=Ancho")}${input("height_cm", p?.height_cm ?? 0, "type=number min=0 aria-label=Alto")}</div>`)}
      </div>
      <div class="row" style="gap:2rem">${toggle("is_active", p ? p.is_active : true, "Visible en la tienda")}${toggle("sold_out", p?.sold_out_manual, "Agotado", "switch--bad")}</div>
      <div class="row row--end">${p ? '<button class="btn btn--danger" type="button" data-delete>Borrar</button>' : ""}<button class="btn" type="submit">${p ? "Guardar cambios" : "Crear producto"}</button></div>
    </form>
    ${p ? `<h3>Fotos</h3><div data-images></div>` : '<p class="muted" style="margin-top:1.5rem">Podrás subir fotos después de crear el producto.</p>'}`);
  const form = $("[data-form]", body);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const f = form.elements;
      const data = {
        title: f.title.value, category: f.category.value, description: f.description.value,
        price_cents: f.price.value ? toCents(f.price.value) : null,
        discount_percent: Number(f.discount_percent.value || 0), stock: Number(f.stock.value || 0),
        weight_grams: Number(f.weight_grams.value || 1000), length_cm: Number(f.length_cm.value || 0),
        width_cm: Number(f.width_cm.value || 0), height_cm: Number(f.height_cm.value || 0),
        is_active: f.is_active.checked, sold_out: f.sold_out.checked,
      };
      if (Number.isNaN(data.price_cents)) return showFieldErrors(form, { price: "Precio no válido" });
      const saved = p ? await api("PATCH", `/admin/products/${p.id}`, data) : await api("POST", "/admin/products", data);
      toast(p ? "Producto guardado" : "Producto creado");
      views.productos();
      productForm(saved);
    });
  });
  $("[data-delete]", body)?.addEventListener("click", async () => {
    if (!confirm(`¿Borrar “${p.title}”? Los pedidos antiguos se conservan.`)) return;
    try { await api("DELETE", `/admin/products/${p.id}`); toast("Producto borrado"); closeDrawer(); views.productos(); } catch (e) { fail(e); }
  });
  if (p) renderProductImages(p, $("[data-images]", body));
}

function renderProductImages(p, box) {
  box.innerHTML = `
    <div class="img-list">${p.images.map((img, i) => `<figure>
      ${i === 0 ? '<span class="badge badge--ink cover">Portada</span>' : ""}<img src="${esc(img.thumb_url)}" alt="">
      <figcaption>${i ? `<button type="button" data-first="${img.id}">Portada</button>` : "<span></span>"}<button type="button" data-del="${img.id}">Quitar</button></figcaption></figure>`).join("")}</div>
    ${uploadForm("product")}`;
  wireUpload(box, `/admin/products/${p.id}/images`, (saved) => { renderProductImages(saved, box); views.productos(); });
  $$("[data-del]", box).forEach((b) => b.addEventListener("click", async () => {
    try { renderProductImages(await api("DELETE", `/admin/products/${p.id}/images/${b.dataset.del}`), box); views.productos(); } catch (e) { fail(e); }
  }));
  $$("[data-first]", box).forEach((b) => b.addEventListener("click", async () => {
    const ids = [Number(b.dataset.first), ...p.images.map((i) => i.id).filter((id) => id !== Number(b.dataset.first))];
    try { renderProductImages(await api("PUT", `/admin/products/${p.id}/images`, { ids }), box); views.productos(); } catch (e) { fail(e); }
  }));
}

/* ---------- Subida de imágenes (con las reglas del servidor) ---------- */
let imageRules = null;
const RULE_TEXT = { product: "fichas de producto", gallery: "galería", class: "clases" };
function uploadForm(kind, extra = "") {
  const r = imageRules?.[kind];
  return `<form class="upload stack" data-upload>
    ${extra}
    ${field("Imagen", '<input type="file" name="image" accept="image/jpeg,image/png,image/webp" required>')}
    <label class="check"><input type="checkbox" name="crop" value="1"> Recortar automáticamente al centro si la proporción no encaja</label>
    ${r ? `<p class="rules">Para ${RULE_TEXT[kind]}: JPG, PNG o WebP · máx. ${r.max_upload_mb} MB · proporción ${r.ratios.join(", ")} · mínimo ${r.min_width} px de ancho. Se optimiza y se guarda en WebP.</p>` : ""}
    <div class="row row--end"><button class="btn btn--small" type="submit">Subir</button></div>
  </form>`;
}
function wireUpload(box, path, onDone) {
  const form = $("[data-upload]", box);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const file = form.elements.image.files[0];
      if (!file) return showFieldErrors(form, { image: "Elige una imagen" });
      if (imageRules && file.size > imageRules.product.max_upload_mb * 1048576) return showFieldErrors(form, { image: `Pesa más de ${imageRules.product.max_upload_mb} MB` });
      const saved = await api("POST", path, new FormData(form));
      toast("Imagen subida");
      onDone(saved);
    });
  });
}

/* ---------- Clases y horarios ---------- */
views.clases = async () => {
  const classes = await api("GET", "/admin/classes");
  const group = classes.filter((c) => c.kind === "group");
  const priv = classes.filter((c) => c.kind === "private");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Taller</p><h1>Clases y horarios</h1><p>Cada clase en grupo tiene sus horarios con plazas. Un horario puede tener precio o plazas propios; si los dejas vacíos se usan los de la clase.</p></div>
      <button class="btn" data-new>Nueva clase</button></div>
    <h2 style="font-size:1.5rem;margin-bottom:1rem">Clases en grupo</h2>
    ${group.map(classCard).join("") || '<p class="muted">No hay clases en grupo.</p>'}
    <h2 style="font-size:1.5rem;margin:2.5rem 0 1rem">Clase privada · modalidades</h2>
    <div class="table-wrap"><table><thead><tr><th>Modalidad</th><th class="num">Precio</th><th>Visible</th><th></th></tr></thead><tbody>
      ${priv.map((c) => `<tr><td>${esc(c.title)}</td><td class="num">${money(c.price_cents)}</td><td>${c.is_active ? '<span class="badge badge--ok">Sí</span>' : '<span class="badge">Oculta</span>'}</td>
        <td class="num"><button class="link-btn" data-edit="${c.id}">Editar</button></td></tr>`).join("") || '<tr><td colspan="4" class="empty">Sin modalidades.</td></tr>'}
    </tbody></table></div>`;
  $("[data-new]").addEventListener("click", () => classForm(null));
  $$("[data-edit]").forEach((b) => b.addEventListener("click", () => classForm(classes.find((c) => c.id === Number(b.dataset.edit)))));
  $$("[data-session-form]").forEach((form) => form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const f = form.elements;
      await api("POST", "/admin/sessions", {
        class_id: Number(form.dataset.sessionForm), starts_at: f.starts_at.value, label: f.label.value,
        capacity: f.capacity.value === "" ? null : Number(f.capacity.value),
        price_cents: f.price.value === "" ? null : toCents(f.price.value),
        repeat_weeks: Number(f.repeat.value),
      });
      toast(Number(f.repeat.value) > 1 ? `${f.repeat.value} horarios añadidos, uno cada semana` : "Horario añadido");
      views.clases();
    });
  }));
  $$("[data-session]").forEach((b) => b.addEventListener("click", () => {
    const c = classes.find((x) => x.id === Number(b.dataset.class));
    sessionForm(c, c.sessions.find((s) => s.id === Number(b.dataset.session)));
  }));
};

function classCard(c) {
  const upcoming = c.sessions.filter((s) => new Date(s.starts_at.replace(" ", "T")) > new Date() || s.label);
  return `<article class="class-card">
    <div class="class-card__head">
      ${c.image ? `<img src="${esc(c.image.thumb_url)}" alt="">` : '<div class="class-card__ph"></div>'}
      <div><h3>${esc(c.title)} ${c.is_active ? "" : '<span class="badge">Oculta</span>'}</h3>
        <p class="muted">${money(c.price_cents)} · ${c.capacity} plazas · ${Math.round(c.duration_minutes / 6) / 10} h</p></div>
      <button class="btn btn--ghost btn--small" data-edit="${c.id}">Editar clase</button>
    </div>
    ${upcoming.length ? `<table><thead><tr><th>Horario</th><th class="num">Plazas libres</th><th class="num">Precio</th><th></th></tr></thead><tbody>
      ${upcoming.map((s) => `<tr><td>${fmtDate(s.starts_at)}${s.label ? ` · <span class="muted">${esc(s.label)}</span>` : ""} ${s.is_cancelled ? '<span class="badge badge--bad">Cancelado</span>' : ""}</td>
        <td class="num">${s.seats_left} / ${s.capacity}</td><td class="num">${money(s.price_cents)}</td>
        <td class="num"><button class="link-btn" data-class="${c.id}" data-session="${s.id}">Editar</button></td></tr>`).join("")}
    </tbody></table>` : ""}
    <div class="add-session"><form data-session-form="${c.id}">
      ${field("Nuevo horario", '<input type="datetime-local" name="starts_at" required>', "Primer día")}
      ${field("Repetir cada semana", `<select name="repeat">
        <option value="1">No, solo ese día</option>
        <option value="4">Durante 1 mes</option>
        <option value="8">Durante 2 meses</option>
        <option value="13" selected>Durante 3 meses</option>
        <option value="26">Durante 6 meses</option>
        <option value="52">Durante 1 año</option>
      </select>`, "Mismo día y hora")}
      ${field("Plazas", `<input type="number" name="capacity" min="1" max="100" placeholder="${c.capacity}">`)}
      ${field("Precio (€)", `<input name="price" inputmode="decimal" placeholder="${eurosInput(c.price_cents)}">`)}
      ${field("Etiqueta (opcional)", '<input name="label" maxlength="120" placeholder="Martes · 12 sesiones">')}
      <button class="btn btn--small" type="submit">Añadir</button>
    </form></div>
  </article>`;
}

function classForm(c) {
  const body = openDrawer(c ? c.title : "Nueva clase", `
    <form class="stack" data-form novalidate>
      ${c ? "" : field("Tipo", '<select name="kind"><option value="group">Clase en grupo (con horarios y pago online)</option><option value="private">Modalidad de clase privada (se solicita)</option></select>')}
      ${field("Título", input("title", c?.title, "required maxlength=160"))}
      <div class="grid-3">
        ${field("Precio (€)", input("price", eurosInput(c?.price_cents), 'inputmode="decimal" required'))}
        ${field("Plazas", input("capacity", c?.capacity ?? 6, "type=number min=1 max=100"))}
        ${field("Duración (min)", input("duration_minutes", c?.duration_minutes ?? 120, "type=number min=15"))}
      </div>
      ${field("Descripción", `<textarea name="description">${esc(c?.description)}</textarea>`)}
      ${field("Orden", input("sort_order", c?.sort_order ?? 0, "type=number"), "Las clases se muestran de menor a mayor")}
      ${toggle("is_active", c ? c.is_active : true, "Visible en la web")}
      <div class="row row--end">${c ? '<button class="btn btn--danger" type="button" data-delete>Borrar</button>' : ""}<button class="btn" type="submit">Guardar</button></div>
    </form>
    ${c?.kind === "group" ? `<h3>Foto (se ve al pasar el ratón)</h3>${c.image ? `<img src="${esc(c.image.thumb_url)}" alt="" style="width:120px;border-radius:4px;margin-bottom:1rem">` : ""}<div data-img>${uploadForm("class")}</div>` : ""}`);
  const form = $("[data-form]", body);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const f = form.elements;
      const data = {
        title: f.title.value, description: f.description.value, price_cents: toCents(f.price.value || "0"),
        capacity: Number(f.capacity.value), duration_minutes: Number(f.duration_minutes.value),
        sort_order: Number(f.sort_order.value || 0), is_active: f.is_active.checked,
      };
      if (!c) data.kind = f.kind.value;
      c ? await api("PATCH", `/admin/classes/${c.id}`, data) : await api("POST", "/admin/classes", data);
      toast("Clase guardada");
      closeDrawer();
      views.clases();
    });
  });
  $("[data-delete]", body)?.addEventListener("click", async () => {
    if (!confirm(`¿Borrar “${c.title}” y todos sus horarios? Las reservas hechas se conservan.`)) return;
    try { await api("DELETE", `/admin/classes/${c.id}`); toast("Clase borrada"); closeDrawer(); views.clases(); } catch (e) { fail(e); }
  });
  const img = $("[data-img]", body);
  if (img) wireUpload(img, `/admin/classes/${c.id}/image`, (saved) => { closeDrawer(); views.clases(); classForm(saved); });
}

function sessionForm(c, s) {
  const body = openDrawer(`Horario · ${c.title}`, `
    <form class="stack" data-form novalidate>
      ${field("Fecha y hora", input("starts_at", s.starts_at.slice(0, 16).replace(" ", "T"), 'type="datetime-local" required'))}
      <div class="grid-2">
        ${field("Plazas", input("capacity", s.capacity_override ?? "", `type=number min=1 placeholder="${c.capacity}"`), "Vacío = las de la clase")}
        ${field("Precio (€)", input("price", eurosInput(s.price_override_cents), `inputmode=decimal placeholder="${eurosInput(c.price_cents)}"`), "Vacío = el de la clase")}
      </div>
      ${field("Etiqueta", input("label", s.label, "maxlength=120"))}
      ${toggle("is_cancelled", s.is_cancelled, "Cancelado (deja de mostrarse y no admite reservas)", "switch--bad")}
      <p class="muted">${s.capacity - s.seats_left} plazas ocupadas · <a href="#reservas" data-see>ver reservas</a></p>
      <div class="row row--end"><button class="btn btn--danger" type="button" data-delete>Borrar</button><button class="btn" type="submit">Guardar</button></div>
    </form>`);
  const form = $("[data-form]", body);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const f = form.elements;
      await api("PATCH", `/admin/sessions/${s.id}`, {
        starts_at: f.starts_at.value, label: f.label.value, is_cancelled: f.is_cancelled.checked,
        capacity: f.capacity.value === "" ? null : Number(f.capacity.value),
        price_cents: f.price.value === "" ? null : toCents(f.price.value),
      });
      toast("Horario guardado"); closeDrawer(); views.clases();
    });
  });
  $("[data-delete]", body).addEventListener("click", async () => {
    if (!confirm("¿Borrar este horario?")) return;
    try { await api("DELETE", `/admin/sessions/${s.id}`); toast("Horario borrado"); closeDrawer(); views.clases(); } catch (e) { fail(e); }
  });
  $("[data-see]", body).addEventListener("click", closeDrawer);
}

/* ---------- Reservas ---------- */
views.reservas = async () => {
  const q = state.bookingStatus ? `?status=${state.bookingStatus}` : "?upcoming=1";
  const list = (await api("GET", "/admin/bookings" + q)).filter((b) => state.bookingStatus || b.status !== "cancelled");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Taller</p><h1>Reservas</h1><p>Las clases en grupo se confirman solas al pagar. Las privadas llegan como solicitud: escribe al cliente y confírmalas aquí.</p></div></div>
    ${filters([["", "Próximas"], ["requested", "Solicitudes privadas"], ["confirmed", "Confirmadas"], ["pending_payment", "Pagando"], ["cancelled", "Canceladas"]], state.bookingStatus)}
    <div class="table-wrap">${list.length ? `<table>
      <thead><tr><th>Clase</th><th>Fecha</th><th>Cliente</th><th class="num">Plazas</th><th>Estado</th><th class="num">Importe</th></tr></thead>
      <tbody>${list.map((b) => `<tr class="is-clickable" data-id="${b.id}">
        <td>${esc(b.class_title)}<br><span class="muted">${esc(b.reference)}</span></td>
        <td>${b.starts_at ? fmtDate(b.starts_at) : `${fmtDate(b.preferred_date, false)} · ${esc(b.preferred_slot)}<br><span class="muted">preferida</span>`}</td>
        <td>${esc(b.customer.name)}<br><span class="muted">${esc(b.customer.email)}</span></td>
        <td class="num">${b.seats}</td><td>${badge(b.status)}</td><td class="num">${money(b.total_cents)}</td></tr>`).join("")}
      </tbody></table>` : '<p class="empty">No hay reservas aquí.</p>'}</div>`;
  $("[data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.bookingStatus = b.dataset.value; views.reservas().catch(fail); } });
  $$("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => bookingForm(list.find((b) => b.id === Number(tr.dataset.id)))));
};

function bookingForm(b) {
  const isPrivate = !b.session_id;
  const body = openDrawer(`Reserva ${b.reference}`, `
    <div class="row">${badge(b.status)}<span class="muted">creada ${fmtDate(b.created_at)}</span></div>
    <h3>${esc(b.class_title)}</h3>
    <dl><dt>Cliente</dt><dd>${esc(b.customer.name)}</dd><dt>Email</dt><dd><a href="mailto:${esc(b.customer.email)}">${esc(b.customer.email)}</a></dd><dt>Teléfono</dt><dd>${esc(b.customer.phone) || "—"}</dd>
      <dt>Plazas</dt><dd>${b.seats}</dd><dt>Importe</dt><dd>${money(b.total_cents)} ${b.paid_at ? "· pagado" : isPrivate ? "· se cobra en el estudio o por enlace" : ""}</dd>
      ${isPrivate ? `<dt>Preferencia</dt><dd>${fmtDate(b.preferred_date, false)} · ${esc(b.preferred_slot)}</dd>` : `<dt>Horario</dt><dd>${fmtDate(b.starts_at)}</dd>`}</dl>
    <form class="stack" data-form style="margin-top:1.5rem">
      ${isPrivate ? field("Fecha y hora acordadas", input("starts_at", b.starts_at ? b.starts_at.slice(0, 16).replace(" ", "T") : "", 'type="datetime-local"')) : ""}
      ${field("Notas internas", `<textarea name="notes">${esc(b.notes)}</textarea>`)}
      <div class="row row--end">
        ${b.status !== "cancelled" ? '<button class="btn btn--danger" type="button" data-status="cancelled">Cancelar reserva</button>' : ""}
        ${isPrivate && b.status === "requested" ? '<button class="btn btn--ghost" type="button" data-status="confirmed">Confirmar</button>' : ""}
        <button class="btn" type="submit">Guardar</button>
      </div>
    </form>
    ${b.paid_at && b.status !== "cancelled" ? '<p class="muted" style="font-size:.82rem;margin-top:1rem">Si cancelas una reserva pagada, haz el reembolso desde Stripe.</p>' : ""}`);
  const form = $("[data-form]", body);
  const save = (extra = {}) => submitting(form, async () => {
    const data = { notes: form.elements.notes.value, ...extra };
    if (form.elements.starts_at?.value) data.starts_at = form.elements.starts_at.value;
    await api("PATCH", `/admin/bookings/${b.id}`, data);
    toast("Reserva guardada"); closeDrawer(); views.reservas();
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });
  $$("[data-status]", body).forEach((btn) => btn.addEventListener("click", () => {
    if (btn.dataset.status === "cancelled" && !confirm("¿Cancelar la reserva? Las plazas quedarán libres.")) return;
    save({ status: btn.dataset.status });
  }));
}

/* ---------- Galería ---------- */
views.galeria = async () => {
  const items = await api("GET", "/admin/gallery");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Web</p><h1>Galería</h1><p>Las fotos se validan en el servidor (formato, peso y proporción) para que la galería mantenga su estilo. El orden es el de la web.</p></div>
      <button class="btn" data-new>Subir obra</button></div>
    <div class="gallery-grid">${items.map((g, i) => `<article class="g-item${g.is_published ? "" : " is-hidden"}" data-id="${g.id}">
      <img src="${esc(g.image.thumb_url)}" alt="${esc(g.image.alt)}" loading="lazy">
      <div class="g-item__body">
        <p class="g-item__title">${esc(g.title)}</p><p class="muted" style="font-size:.82rem">${esc(g.technique)} · ${esc(g.year)}</p>
        ${toggle("is_published", g.is_published, "Publicada")}
        <div class="g-item__actions">
          <button type="button" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Mover antes">←</button>
          <button type="button" data-move="1" ${i === items.length - 1 ? "disabled" : ""} aria-label="Mover después">→</button>
          <button type="button" data-edit>Editar</button><button type="button" data-del>Borrar</button>
        </div>
      </div></article>`).join("") || '<p class="empty">La galería está vacía.</p>'}</div>`;
  $("[data-new]").addEventListener("click", () => {
    const body = openDrawer("Subir obra", uploadForm("gallery", `
      ${field("Título", '<input name="title" required maxlength="160">')}
      <div class="grid-2">${field("Técnica", '<input name="technique" maxlength="160" placeholder="Gres y engobe">')}${field("Año", `<input name="year" maxlength="10" value="${new Date().getFullYear()}">`)}</div>
      ${field("Texto alternativo", '<input name="alt" maxlength="255">', "Describe la foto para personas que no la ven")}`));
    wireUpload(body, "/admin/gallery", () => { closeDrawer(); views.galeria(); });
  });
  const ids = items.map((g) => g.id);
  $$(".g-item").forEach((el) => {
    const id = Number(el.dataset.id);
    const g = items.find((x) => x.id === id);
    $("input[name=is_published]", el).addEventListener("change", async (e) => {
      try { await api("PATCH", `/admin/gallery/${id}`, { is_published: e.target.checked }); el.classList.toggle("is-hidden", !e.target.checked); } catch (err) { fail(err); }
    });
    $$("[data-move]", el).forEach((b) => b.addEventListener("click", async () => {
      const i = ids.indexOf(id);
      const j = i + Number(b.dataset.move);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      try { await api("PUT", "/admin/gallery/order", { ids }); views.galeria(); } catch (e) { fail(e); }
    }));
    $("[data-del]", el).addEventListener("click", async () => {
      if (!confirm(`¿Borrar “${g.title}”?`)) return;
      try { await api("DELETE", `/admin/gallery/${id}`); toast("Obra borrada"); views.galeria(); } catch (e) { fail(e); }
    });
    $("[data-edit]", el).addEventListener("click", () => {
      const body = openDrawer(g.title, `<form class="stack" data-form>
        <img src="${esc(g.image.thumb_url)}" alt="" style="border-radius:6px">
        ${field("Título", input("title", g.title, "required maxlength=160"))}
        <div class="grid-2">${field("Técnica", input("technique", g.technique, "maxlength=160"))}${field("Año", input("year", g.year, "maxlength=10"))}</div>
        ${field("Texto alternativo", input("alt", g.image.alt, "maxlength=255"))}
        <div class="row row--end"><button class="btn" type="submit">Guardar</button></div></form>`);
      const form = $("[data-form]", body);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        submitting(form, async () => {
          const f = form.elements;
          await api("PATCH", `/admin/gallery/${id}`, { title: f.title.value, technique: f.technique.value, year: f.year.value, alt: f.alt.value });
          toast("Obra guardada"); closeDrawer(); views.galeria();
        });
      });
    });
  });
};

/* ---------- Clientes ---------- */
views.clientes = async () => {
  const list = await api("GET", "/admin/customers");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Contactos</p><h1>Clientes</h1><p>${list.length} personas han comprado o reservado.</p></div></div>
    <div class="table-wrap">${list.length ? `<table><thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Ciudad</th><th class="num">Pedidos</th><th class="num">Reservas</th><th>Desde</th></tr></thead>
      <tbody>${list.map((c) => `<tr><td>${esc(c.name)}</td><td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td><td>${esc(c.phone)}</td><td>${esc(c.city)}</td>
        <td class="num">${c.orders}</td><td class="num">${c.bookings}</td><td>${fmtDate(c.created_at, false)}</td></tr>`).join("")}</tbody></table>`
      : '<p class="empty">Todavía no hay clientes.</p>'}</div>`;
};

/* ---------- Cuenta ---------- */
/* ---------- Ajustes: Stripe, Packlink, envíos y emails ---------- */
views.ajustes = async () => {
  const s = await api("GET", "/admin/settings");
  const v = s.values;
  const secret = (key, label, placeholder, hint) => {
    const info = s.secrets[key];
    const now = info.set
      ? `Guardada (${esc(info.hint)})${info.source === "env" ? " · viene del archivo .env" : ""}. Déjalo vacío para no cambiarla.`
      : "Sin configurar.";
    return field(label, `<input type="password" name="${key}" placeholder="${placeholder}" autocomplete="off" spellcheck="false">`,
      `${now}${hint ? " " + hint : ""}${info.source === "panel" ? ` <button type="button" class="link-btn" data-clear="${key}">Borrar</button>` : ""}`);
  };
  const mode = s.stripe_mode === "live" ? '<span class="badge badge--ok">Modo real</span>'
    : s.stripe_mode === "test" ? '<span class="badge badge--warn">Modo prueba</span>' : '<span class="badge badge--bad">Sin configurar</span>';
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Configuración</p><h1>Ajustes</h1></div></div>
    <form class="stack settings" data-form style="max-width:640px">
      <section class="stack">
        <h2 class="settings__title">Datos de la web</h2>
        <p class="muted">Salen en el pie de todas las páginas, en el menú del móvil y en Contacto. Lo que dejes vacío se queda como está ahora en la web.</p>
        ${field("Dirección del estudio", input("SITE_ADDRESS", v.SITE_ADDRESS, 'placeholder="Calle del Barro 12"'))}
        <div class="grid-2">
          ${field("Código postal y ciudad", input("SITE_CITY", v.SITE_CITY, 'placeholder="28012 Madrid"'))}
          ${field("Enlace de Google Maps", input("SITE_MAPS_URL", v.SITE_MAPS_URL, 'type="url" placeholder="https://maps.app.goo.gl/…"'), "Opcional: la dirección se podrá pulsar")}
        </div>
        ${field("Horario", `<textarea name="SITE_HOURS" rows="3" maxlength="500" placeholder="Mar–Sáb · 10:00–20:00&#10;Dom y Lun · cerrado">${esc(v.SITE_HOURS || "")}</textarea>`, "Una línea por cada franja. En el pie sale solo la primera.")}
        <div class="grid-2">
          ${field("Email de contacto", input("SITE_EMAIL", v.SITE_EMAIL, 'type="email" placeholder="hola@charriaceramics.com"'))}
          ${field("Teléfono", input("SITE_PHONE", v.SITE_PHONE, 'type="tel" placeholder="+34 600 000 000"'))}
        </div>
        <div class="grid-2">
          ${field("WhatsApp", input("SITE_WHATSAPP", v.SITE_WHATSAPP, 'type="tel" placeholder="+34 600 000 000"'), "Opcional")}
          ${field("Instagram", input("SITE_INSTAGRAM", v.SITE_INSTAGRAM, 'type="url" placeholder="https://www.instagram.com/ch.ceramics/"'))}
        </div>
        <div class="grid-2">
          ${field("Facebook", input("SITE_FACEBOOK", v.SITE_FACEBOOK, 'type="url" placeholder="https://www.facebook.com/…"'), "Opcional")}
          ${field("TikTok", input("SITE_TIKTOK", v.SITE_TIKTOK, 'type="url" placeholder="https://www.tiktok.com/@…"'), "Opcional")}
        </div>
      </section>

      <section class="stack">
        <h2 class="settings__title">Stripe · pagos ${mode}</h2>
        <p class="muted">En <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener">Stripe → Desarrolladores → Claves de API</a> copia la <strong>clave secreta</strong> (sk_test_… para probar, sk_live_… para cobrar de verdad).</p>
        ${secret("STRIPE_SECRET_KEY", "Clave secreta", "sk_live_…")}
        <div class="notice notice--soft">
          <p>En <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener">Stripe → Webhooks</a> pulsa «Añadir destino», pega esta URL y marca estos eventos:</p>
          <p class="copy"><code data-copy>${esc(s.webhook_url)}</code> <button type="button" class="link-btn" data-copy-btn>Copiar</button></p>
          <p class="muted">${s.webhook_events.map(esc).join(" · ")}</p>
          <p>Después copia su «Secreto de firma» (whsec_…) aquí abajo.</p>
        </div>
        ${secret("STRIPE_WEBHOOK_SECRET", "Secreto del webhook", "whsec_…")}
        <div class="row"><button type="button" class="btn btn--ghost" data-test="stripe">Probar conexión con Stripe</button></div>
      </section>

      <section class="stack">
        <h2 class="settings__title">Packlink PRO · envíos</h2>
        <p class="muted">En <a href="https://pro.packlink.es/private/settings/integrations/api" target="_blank" rel="noopener">Packlink PRO → Configuración → API</a> genera la API key. Sin ella se cobra la tarifa plana de abajo.</p>
        ${secret("PACKLINK_API_KEY", "API key", "Pega la API key")}
        <p class="eyebrow" style="margin-top:.5rem">Remitente (desde dónde se envían los paquetes)</p>
        <div class="grid-2">
          ${field("Nombre", input("PACKLINK_SENDER_NAME", v.PACKLINK_SENDER_NAME))}
          ${field("Apellidos", input("PACKLINK_SENDER_SURNAME", v.PACKLINK_SENDER_SURNAME))}
        </div>
        ${field("Empresa", input("PACKLINK_SENDER_COMPANY", v.PACKLINK_SENDER_COMPANY))}
        ${field("Dirección", input("PACKLINK_SENDER_STREET", v.PACKLINK_SENDER_STREET))}
        <div class="grid-2">
          ${field("Código postal", input("PACKLINK_SENDER_ZIP", v.PACKLINK_SENDER_ZIP))}
          ${field("Ciudad", input("PACKLINK_SENDER_CITY", v.PACKLINK_SENDER_CITY))}
        </div>
        <div class="grid-2">
          ${field("País", input("PACKLINK_SENDER_COUNTRY", v.PACKLINK_SENDER_COUNTRY, 'maxlength="2" placeholder="ES"'), "Código de 2 letras")}
          ${field("Teléfono", input("PACKLINK_SENDER_PHONE", v.PACKLINK_SENDER_PHONE, 'type="tel"'))}
        </div>
        ${field("Email", input("PACKLINK_SENDER_EMAIL", v.PACKLINK_SENDER_EMAIL, 'type="email"'))}
        <div class="row"><button type="button" class="btn btn--ghost" data-test="packlink">Probar conexión con Packlink</button></div>
      </section>

      <section class="stack">
        <h2 class="settings__title">Opciones de envío</h2>
        ${toggle("SHIPPING_PICKUP", v.SHIPPING_PICKUP !== "false", "Ofrecer recogida gratis en el estudio")}
        <div class="grid-2">
          ${field("Nombre de la tarifa plana", input("SHIPPING_FLAT_NAME", v.SHIPPING_FLAT_NAME, 'placeholder="Envío estándar"'))}
          ${field("Precio tarifa plana (€)", input("SHIPPING_FLAT_CENTS", eurosInput(v.SHIPPING_FLAT_CENTS), 'inputmode="decimal" placeholder="6,90"'), "Se usa si Packlink no está configurado o falla")}
        </div>
        <div class="grid-2">
          ${field("Envío gratis desde (€)", input("SHIPPING_FREE_FROM_CENTS", eurosInput(v.SHIPPING_FREE_FROM_CENTS), 'inputmode="decimal"'), "Vacío = nunca gratis")}
          ${field("Suplemento sobre Packlink (€)", input("SHIPPING_MARKUP_CENTS", eurosInput(v.SHIPPING_MARKUP_CENTS), 'inputmode="decimal" placeholder="0,00"'), "Para cubrir el embalaje")}
        </div>
      </section>

      <section class="stack">
        <h2 class="settings__title">Emails</h2>
        <div class="grid-2">
          ${field("Remitente de los emails", input("MAIL_FROM", v.MAIL_FROM, 'type="email" placeholder="hola@tudominio.com"'), "Crea este buzón en hPanel → Emails")}
          ${field("Avisos de pedidos y reservas a", input("MAIL_ADMIN", v.MAIL_ADMIN, 'type="email"'))}
        </div>
      </section>

      <div class="row settings__save"><button class="btn" type="submit">Guardar ajustes</button></div>
    </form>`;

  const form = $("[data-form]");
  const cents = new Set(["SHIPPING_FLAT_CENTS", "SHIPPING_FREE_FROM_CENTS", "SHIPPING_MARKUP_CENTS"]);
  const collect = () => {
    const values = {};
    Object.keys(s.secrets).forEach((k) => { values[k] = form.elements[k].value.trim(); });
    Object.keys(v).forEach((k) => {
      const el = form.elements[k];
      if (!el) return;
      if (el.type === "checkbox") values[k] = el.checked;
      else if (cents.has(k)) { const t = el.value.trim(); values[k] = t === "" ? "" : String(toCents(t)); }
      else values[k] = el.value.trim();
    });
    return values;
  };
  const save = (clear = []) => submitting(form, async () => {
    await api("PUT", "/admin/settings", { values: collect(), clear });
    toast("Ajustes guardados");
    await views.ajustes();
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });
  $$("[data-clear]", form).forEach((b) => b.addEventListener("click", () => {
    if (confirm("¿Borrar esta clave del panel?")) save([b.dataset.clear]);
  }));
  $("[data-copy-btn]", form).addEventListener("click", () => {
    navigator.clipboard?.writeText(s.webhook_url).then(() => toast("URL copiada"), () => {});
  });
  $$("[data-test]", form).forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      // Guarda primero lo escrito para probar con las claves nuevas
      await api("PUT", "/admin/settings", { values: collect() });
      const r = await api("POST", "/admin/settings/test", { service: b.dataset.test });
      toast(r.message);
    } catch (e) { if (e.fields) showFieldErrors(form, e.fields); fail(e); } finally { b.disabled = false; }
  }));
};

views.cuenta = async () => {
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Seguridad</p><h1>Cuenta</h1></div></div>
    <form class="stack" data-form style="max-width:420px">
      <h2 style="font-size:1.4rem">Cambiar contraseña</h2>
      ${field("Contraseña actual", '<input type="password" name="current_password" autocomplete="current-password" required>')}
      ${field("Nueva contraseña", '<input type="password" name="new_password" autocomplete="new-password" minlength="10" required>', "Mínimo 10 caracteres. Se cerrarán las demás sesiones.")}
      <div class="row"><button class="btn" type="submit">Cambiar</button></div>
    </form>
    <div style="margin-top:3rem"><button class="btn btn--ghost" data-logout>Cerrar sesión</button></div>`;
  const form = $("[data-form]");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      await api("PUT", "/admin/password", { current_password: form.elements.current_password.value, new_password: form.elements.new_password.value });
      form.reset(); toast("Contraseña cambiada");
    });
  });
  $("[data-logout]").addEventListener("click", async () => {
    try { await api("POST", "/auth/logout"); } catch { /* da igual */ }
    setToken(null); showLogin();
  });
};

/* ==========================================================
   Arranque y navegación
   ========================================================== */
async function route() {
  const name = location.hash.slice(1) || "resumen";
  const view = views[name] || views.resumen;
  $$("[data-nav] a").forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === `#${name}`));
  $$("[data-nav] a[aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));
  closeDrawer();
  main.innerHTML = '<p class="muted">Cargando…</p>';
  try { await view(); } catch (e) { if (e.status !== 401) { main.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; } }
}

function showLogin() {
  $("[data-view-app]").hidden = true;
  $("[data-view-login]").hidden = false;
  closeDrawer();
  $("[data-login-form] input[name=email]").focus();
}

async function showApp() {
  try {
    const me = await api("GET", "/auth/me");
    $("[data-user]").textContent = me.name ? `${me.name} · ${me.email}` : me.email;
  } catch { showLogin(); return; }
  $("[data-view-login]").hidden = true;
  $("[data-view-app]").hidden = false;
  if (!imageRules) api("GET", "/admin/image-rules").then((r) => { imageRules = r; }).catch(() => {});
  route();
}

$("[data-login-form]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const err = $("[data-login-error]");
  err.hidden = true;
  const btn = $("button", form);
  btn.disabled = true;
  try {
    const res = await api("POST", "/auth/login", { email: form.elements.email.value, password: form.elements.password.value });
    setToken(res.token);
    form.reset();
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

window.addEventListener("hashchange", () => { if (token) route(); });
// Primera visita sin instalar: al instalador
fetch(`${API}/health`).then((r) => r.json()).then((j) => {
  if (j.data?.installed === false) location.replace("setup.html");
}).catch(() => {});
token ? showApp() : showLogin();
