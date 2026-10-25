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
// Reserva para pagar en el taller: confirmada pero sin cobrar hasta que se marca como pagada
const inPersonUnpaid = (b) => b.payment_method === "in_person" && !b.paid_at && b.status !== "cancelled";
const payBadge = (b) => b.status === "cancelled" ? ""
  : b.payment_method === "subscription" ? (b.subscription_status === "canceled" ? '<span class="badge badge--bad">Suscripción cancelada</span>'
    : b.paid_at ? '<span class="badge badge--ok">Suscripción al día</span>' : '<span class="badge badge--warn">Cuota sin pagar</span>')
  : b.payment_method !== "in_person" ? ""
  : b.paid_at ? '<span class="badge badge--ok">Cobrada en el taller</span>' : '<span class="badge badge--warn">Pagar en el taller</span>';
const filters = (options, current) => `<div class="filters" data-filters>${options.map(([v, t]) =>
  `<button type="button" data-value="${v}" aria-pressed="${v === current}">${t}</button>`).join("")}</div>`;

/* ==========================================================
   Vistas
   ========================================================== */
const main = $("[data-main]");
const views = {};
let state = { orderStatus: "", bookingStatus: "", customerTab: "profiles", messageType: "", messageStatus: "open" };

/* ---------- Resumen ---------- */
views.resumen = async () => {
  const s = await api("GET", "/admin/stats");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Hoy</p><h1>Resumen</h1></div></div>
    ${s.payments_configured ? "" : '<p class="notice">Stripe no está configurado: la tienda y las reservas en grupo no aceptan pagos todavía. Ponlo en <a href="#ajustes">Ajustes</a>.</p>'}
    ${s.packlink_configured ? "" : '<p class="notice">Packlink PRO no está configurado: se usa la tarifa plana de envío. Puedes configurarlo en <a href="#ajustes">Ajustes</a>.</p>'}
    ${s.legal_missing.length ? '<p class="notice">Faltan los datos del titular (nombre o razón social, NIF, domicilio y email) que salen en el aviso legal, la privacidad y las condiciones de venta. La ley obliga a mostrarlos: rellénalos en <a href="#ajustes">Ajustes → Datos legales</a>.</p>' : ""}
    ${s.legacy_customers ? `<p class="notice">Hay ${s.legacy_customers} ${s.legacy_customers === 1 ? "cliente guardado" : "clientes guardados"} de antes de pedir permiso para crear perfiles. Revísalo en <a href="#clientes">Clientes</a>.</p>` : ""}
    <div class="cards">
      <a class="card" href="#mensajes"><span class="eyebrow">Mensajes sin leer</span><p class="card__num">${s.unread_messages}</p></a>
      <a class="card" href="#pedidos"><span class="eyebrow">Pedidos por enviar</span><p class="card__num">${s.orders_to_ship}</p></a>
      <a class="card" href="#pedidos"><span class="eyebrow">Para recoger en estudio</span><p class="card__num">${s.orders_to_collect}</p></a>
      <a class="card" href="#reservas"><span class="eyebrow">Clases privadas por confirmar</span><p class="card__num">${s.private_requests}</p></a>
      <a class="card" href="#calendario"><span class="eyebrow">Cobros atrasados</span><p class="card__num">${s.payments_overdue}</p></a>
      <a class="card" href="#reservas" data-unpaid><span class="eyebrow">Reservas por cobrar</span><p class="card__num">${s.bookings_unpaid}</p></a>
      <a class="card" href="#clases"><span class="eyebrow">Próximos horarios</span><p class="card__num">${s.upcoming_sessions}</p></a>
      <div class="card"><span class="eyebrow">Ventas tienda · 30 días</span><p class="card__num">${money(s.sales_30d_cents)}</p></div>
      <div class="card"><span class="eyebrow">Clases cobradas · 30 días</span><p class="card__num">${money(s.bookings_30d_cents)}</p></div>
    </div>
    <h2 style="font-size:1.5rem;margin-bottom:1rem">Stock bajo</h2>
    ${s.low_stock.length ? `<div class="table-wrap"><table><tbody>${s.low_stock.map((p) =>
      `<tr><td>${esc(p.title)}</td><td class="num">${p.stock} ${p.stock === 1 ? "unidad" : "unidades"}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="muted">Todo bien de stock.</p>'}`;
  $("[data-unpaid]")?.addEventListener("click", () => { state.bookingStatus = "unpaid"; });
};

/* ---------- Mensajes: contacto, encargos y clases privadas ---------- */
const MESSAGE_TYPE = { contact: ["Contacto", ""], request: ["Encargo", "ink"], private_class: ["Clase privada", "warn"] };
const messageType = (t) => { const [txt, c] = MESSAGE_TYPE[t] || [t, ""]; return `<span class="badge badge--${c}">${txt}</span>`; };

// Contador de no leídos en el menú (y en el botón del menú en móvil)
function setUnread(n) {
  $$("[data-unread]").forEach((el) => { el.textContent = n > 99 ? "99+" : String(n); el.hidden = !n; });
}
const refreshUnread = () => api("GET", "/admin/messages/unread").then((r) => setUnread(r.unread)).catch(() => {});

views.mensajes = async () => {
  const q = new URLSearchParams();
  if (state.messageType) q.set("type", state.messageType);
  if (state.messageStatus) q.set("status", state.messageStatus);
  const list = await api("GET", "/admin/messages" + (q.toString() ? `?${q}` : ""));
  refreshUnread();
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Bandeja</p><h1>Mensajes</h1><p>Lo que te escriben desde la web: el formulario de contacto, los encargos y las solicitudes de clase privada. Contesta por email o teléfono y márcalo como atendido.</p></div></div>
    <div data-type>${filters([["", "Todos"], ["contact", "Contacto"], ["request", "Encargos"], ["private_class", "Clases privadas"]], state.messageType)}</div>
    <div data-status>${filters([["open", "Por atender"], ["unread", "Sin leer"], ["handled", "Atendidos"], ["", "Todos"]], state.messageStatus)}</div>
    <div class="table-wrap">${list.length ? `<table>
      <thead><tr><th>De</th><th>Tipo</th><th>Mensaje</th><th>Recibido</th><th>Estado</th></tr></thead>
      <tbody>${list.map((m) => `<tr class="is-clickable${m.read ? "" : " is-unread"}" data-id="${m.id}">
        <td>${m.read ? "" : '<span class="dot" title="Sin leer"></span>'}${esc(m.name)}<br><span class="muted">${esc(m.email)}</span></td>
        <td>${messageType(m.type)}</td>
        <td><span class="message-preview">${m.subject ? `<strong>${esc(m.subject)}</strong> · ` : ""}${esc(m.body)}</span></td>
        <td>${fmtDate(m.created_at)}</td>
        <td>${m.handled ? '<span class="badge badge--ok">Atendido</span>' : m.read ? '<span class="badge">Leído</span>' : '<span class="badge badge--bad">Nuevo</span>'}</td></tr>`).join("")}
      </tbody></table>` : '<p class="empty">No hay mensajes aquí.</p>'}</div>`;
  $("[data-type] [data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.messageType = b.dataset.value; views.mensajes().catch(fail); } });
  $("[data-status] [data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.messageStatus = b.dataset.value; views.mensajes().catch(fail); } });
  $$("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openMessage(tr.dataset.id).catch(fail)));
};

async function openMessage(id) {
  const m = await api("GET", `/admin/messages/${id}`);
  refreshUnread();
  const subject = encodeURIComponent(`Re: ${m.subject || "Tu mensaje"}`);
  const body = openDrawer(m.type === "private_class" ? "Solicitud de clase privada" : m.type === "request" ? "Encargo" : "Mensaje", `
    <div class="row" style="margin-bottom:1rem">${messageType(m.type)}<span class="muted">${fmtDate(m.created_at)}</span>${m.handled ? `<span class="badge badge--ok">Atendido ${fmtDate(m.handled_at, false)}</span>` : ""}</div>
    <dl><dt>Nombre</dt><dd>${esc(m.name)}</dd><dt>Email</dt><dd><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></dd>
      <dt>Teléfono</dt><dd>${m.phone ? `<a href="tel:${esc(m.phone.replace(/\s+/g, ""))}">${esc(m.phone)}</a>` : "—"}</dd>
      ${m.subject ? `<dt>${m.type === "private_class" ? "Modalidad" : "Motivo"}</dt><dd>${esc(m.subject)}</dd>` : ""}</dl>
    <h3>Mensaje</h3>
    <div class="message-body">${esc(m.body)}</div>
    ${m.booking_id ? '<p class="muted" style="font-size:.85rem;margin-top:1rem">La reserva está en <a href="#reservas" data-go-bookings>Reservas → Solicitudes privadas</a>: al confirmarla o cancelarla allí, este mensaje queda atendido.</p>' : ""}
    <div class="row row--end" style="margin-top:1.5rem">
      <button class="btn btn--danger" type="button" data-delete>Borrar</button>
      <button class="btn btn--ghost" type="button" data-unread-btn>Marcar como no leído</button>
      <a class="btn btn--ghost" href="mailto:${esc(m.email)}?subject=${subject}">Responder por email</a>
      <button class="btn" type="button" data-handled>${m.handled ? "Volver a «por atender»" : "Marcar como atendido"}</button>
    </div>`);
  const done = (msg) => { toast(msg); closeDrawer(); views.mensajes().catch(fail); };
  $("[data-handled]", body).addEventListener("click", () => api("PATCH", `/admin/messages/${m.id}`, { handled: !m.handled })
    .then(() => done(m.handled ? "Mensaje pendiente otra vez" : "Mensaje atendido")).catch(fail));
  $("[data-unread-btn]", body).addEventListener("click", () => api("PATCH", `/admin/messages/${m.id}`, { read: false })
    .then(() => done("Marcado como no leído")).catch(fail));
  $("[data-delete]", body).addEventListener("click", () => {
    if (!confirm(m.booking_id ? "¿Borrar el mensaje? La reserva seguirá en Reservas." : "¿Borrar el mensaje? No se puede deshacer.")) return;
    api("DELETE", `/admin/messages/${m.id}`).then(() => done("Mensaje borrado")).catch(fail);
  });
  $("[data-go-bookings]", body)?.addEventListener("click", () => { state.bookingStatus = "requested"; closeDrawer(); });
}

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
    <div class="row">${badge(o.status)}<span class="muted">${fmtDate(o.created_at)}</span>${o.privacy_blocked ? '<span class="badge" title="El cliente pidió borrar sus datos: solo se conservan los necesarios para la factura">Datos bloqueados · RGPD</span>' : ""}</div>
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

// Fila de especificación libre (Capacidad, Acabado, Apto lavavajillas…)
const specRow = (sp = {}) => `<div class="spec-row" data-spec>
  <input name="spec_label" value="${esc(sp.label)}" placeholder="Nombre (p. ej. Capacidad)" maxlength="60" aria-label="Nombre">
  <input name="spec_value" value="${esc(sp.value)}" placeholder="Valor (p. ej. 350 ml)" maxlength="200" aria-label="Valor">
  <button type="button" class="icon-btn" data-spec-del aria-label="Quitar">×</button></div>`;

function productForm(p) {
  const body = openDrawer(p ? p.title : "Nuevo producto", `
    <form class="stack" data-form novalidate>
      ${field("Título", input("title", p?.title, "required maxlength=160"))}
      <div class="grid-2">
        ${field("Categoría", input("category", p?.category, 'maxlength=80 list="cats"'), "Cuencos, Jarrones, Tazas, Platos, Sets… (sale como filtro en la tienda)")}
        ${field("Precio (€)", input("price", eurosInput(p?.price_cents), 'inputmode="decimal" required'))}
        ${field("Descuento (%)", input("discount_percent", p?.discount_percent ?? 0, 'type=number min=0 max=90'))}
        ${field("Stock (unidades)", input("stock", p?.stock ?? 1, "type=number min=0"))}
      </div>
      ${field("Descripción", `<textarea name="description" maxlength="5000" placeholder="Cuenco de gres torneado a mano con esmalte arena.">${esc(p?.description)}</textarea>`, "Se ve en la ficha del producto. Una frase con la técnica, el material y el esmalte. Deja una línea en blanco para separar párrafos.")}

      <h3 class="form-section">Ficha del producto</h3>
      <div class="grid-2">
        ${field("Medidas de la pieza", input("dimensions", p?.dimensions, 'maxlength=160 placeholder="Alto 7 cm × Ø 14 cm"'), "Alto × diámetro, tal y como quieres que se lea en la ficha")}
        ${field("Peso de la pieza (g)", input("piece_weight_grams", p?.piece_weight_grams || "", 'type=number min=0 max=100000 placeholder="Sin indicar"'), "Lo que pesa la pieza, sin caja. Vacío: no se enseña")}
      </div>
      ${field("Material", input("material", p?.material, 'maxlength=160 placeholder="Gres, porcelana, barro rojo…"'))}
      ${field("Cuidados", `<textarea name="care" maxlength="3000" rows="3" placeholder="Apto para lavavajillas y microondas.">${esc(p ? p.care : "Apto para lavavajillas y microondas.")}</textarea>`, p ? "" : "Viene puesto el texto más habitual: cámbialo si la pieza es decorativa o no admite lavavajillas.")}
      <p class="muted" style="font-size:.85rem">En la ficha también sale «Envío: 2–5 días laborables» mientras la pieza esté disponible.</p>
      <div class="field"><span>Más especificaciones</span>
        <div class="specs" data-specs>${(p?.specs || []).map(specRow).join("")}</div>
        <input type="hidden" name="specs">
        <button type="button" class="btn btn--small btn--ghost" data-spec-add>+ Añadir especificación</button>
        <small>Capacidad, acabado, técnica, apto para microondas… Se muestran en una tabla en la ficha.</small>
      </div>

      <h3 class="form-section">Envío</h3>
      <div class="grid-2">
        ${field("Peso con embalaje (g)", input("weight_grams", p?.weight_grams ?? 1000, "type=number min=1"), "Para calcular el envío, no se enseña en la web")}
        ${field("Paquete L × An × Al (cm)", `<div class="row" style="flex-wrap:nowrap">${input("length_cm", p?.length_cm ?? 0, "type=number min=0 aria-label=Largo")}${input("width_cm", p?.width_cm ?? 0, "type=number min=0 aria-label=Ancho")}${input("height_cm", p?.height_cm ?? 0, "type=number min=0 aria-label=Alto")}</div>`, "Medidas de la caja, no se enseñan en la web")}
      </div>
      ${p ? "" : `<h3 class="form-section">Fotos</h3>
        ${field("Fotos (puedes elegir varias)", '<input type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple>', "La primera será la portada. Luego podrás cambiar el orden.")}
        <label class="check"><input type="checkbox" name="crop" value="1" checked> Recortar automáticamente a 4:5 si no encajan</label>`}
      <div class="row" style="gap:2rem">${toggle("is_active", p ? p.is_active : true, "Visible en la tienda")}${toggle("sold_out", p?.sold_out_manual, "Agotado", "switch--bad")}</div>
      <div class="row row--end">${p ? '<button class="btn btn--danger" type="button" data-delete>Borrar</button>' : ""}<button class="btn" type="submit">${p ? "Guardar cambios" : "Crear producto"}</button></div>
    </form>
    ${p ? `<h3>Fotos</h3><p class="muted" style="margin:-.4rem 0 1rem">La primera es la portada (y la de la cesta); la segunda aparece al pasar el ratón en la tienda. Ordénalas con las flechas.</p><div data-images></div>` : ""}`);
  const form = $("[data-form]", body);
  const specs = $("[data-specs]", form);
  $("[data-spec-add]", form).addEventListener("click", () => {
    specs.insertAdjacentHTML("beforeend", specRow());
    $$("[data-spec]", specs).at(-1).querySelector("input").focus();
  });
  specs.addEventListener("click", (e) => { if (e.target.closest("[data-spec-del]")) e.target.closest("[data-spec]").remove(); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const f = form.elements;
      const data = {
        title: f.title.value, category: f.category.value, description: f.description.value,
        price_cents: f.price.value ? toCents(f.price.value) : null,
        discount_percent: Number(f.discount_percent.value || 0), stock: Number(f.stock.value || 0),
        dimensions: f.dimensions.value, piece_weight_grams: Number(f.piece_weight_grams.value || 0), material: f.material.value, care: f.care.value,
        specs: $$("[data-spec]", specs).map((row) => ({ label: $("[name=spec_label]", row).value, value: $("[name=spec_value]", row).value })),
        weight_grams: Number(f.weight_grams.value || 1000), length_cm: Number(f.length_cm.value || 0),
        width_cm: Number(f.width_cm.value || 0), height_cm: Number(f.height_cm.value || 0),
        is_active: f.is_active.checked, sold_out: f.sold_out.checked,
      };
      if (Number.isNaN(data.price_cents)) return showFieldErrors(form, { price: "Precio no válido" });
      let saved;
      try {
        saved = p ? await api("PATCH", `/admin/products/${p.id}`, data) : await api("POST", "/admin/products", data);
      } catch (err) {
        // Los errores de cada fila (specs.0, specs.1…) se muestran juntos bajo la lista
        if (err.fields) Object.keys(err.fields).filter((k) => k.startsWith("specs.")).forEach((k) => { err.fields.specs ??= err.fields[k]; delete err.fields[k]; });
        throw err;
      }
      const files = p ? [] : [...(f.images?.files || [])];
      for (const [i, file] of files.entries()) {
        toast(`Subiendo foto ${i + 1} de ${files.length}…`);
        const fd = new FormData();
        fd.append("image", file);
        fd.append("alt", saved.title);
        if (f.crop.checked) fd.append("crop", "1");
        try { saved = await api("POST", `/admin/products/${saved.id}/images`, fd); }
        catch (err) { toast(`“${file.name}”: ${err.fields?.image || err.message}`, true); }
      }
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
  const n = p.images.length;
  box.innerHTML = `
    ${n ? `<ol class="img-list img-list--sortable">${p.images.map((img, i) => `<li data-img="${img.id}">
      ${i === 0 ? '<span class="badge badge--ink cover">Portada</span>' : `<span class="badge cover">${i + 1}</span>`}<img src="${esc(img.thumb_url)}" alt="">
      <div class="img-list__tools">
        <button type="button" data-move="-1" ${i ? "" : "disabled"} aria-label="Mover a la izquierda">←</button>
        <button type="button" data-move="1" ${i < n - 1 ? "" : "disabled"} aria-label="Mover a la derecha">→</button>
        ${i ? '<button type="button" data-first>Portada</button>' : ""}
        <button type="button" data-del>Quitar</button>
      </div>
      <input class="img-list__alt" value="${esc(img.alt)}" maxlength="255" placeholder="Descripción de la foto" aria-label="Texto alternativo de la foto ${i + 1}">
    </li>`).join("")}</ol>` : '<p class="muted">Aún no tiene fotos.</p>'}
    ${uploadForm("product")}`;
  const fileInput = $("[data-upload] input[type=file]", box);
  fileInput.multiple = true;
  $("[data-upload] .field > span", box).textContent = "Añadir fotos (puedes elegir varias)";
  const ids = p.images.map((i) => i.id);
  const refresh = (saved) => { renderProductImages(saved, box); views.productos(); };
  const reorder = async (order) => { try { refresh(await api("PUT", `/admin/products/${p.id}/images`, { ids: order })); } catch (e) { fail(e); } };
  $$("[data-img]", box).forEach((li) => {
    const id = Number(li.dataset.img);
    const pos = ids.indexOf(id);
    $$("[data-move]", li).forEach((b) => b.addEventListener("click", () => {
      const order = [...ids];
      const to = pos + Number(b.dataset.move);
      [order[pos], order[to]] = [order[to], order[pos]];
      reorder(order);
    }));
    $("[data-first]", li)?.addEventListener("click", () => reorder([id, ...ids.filter((x) => x !== id)]));
    $("[data-del]", li).addEventListener("click", async () => {
      if (!confirm("¿Quitar esta foto?")) return;
      try { refresh(await api("DELETE", `/admin/products/${p.id}/images/${id}`)); } catch (e) { fail(e); }
    });
    const alt = $(".img-list__alt", li);
    alt.addEventListener("change", async () => {
      try { await api("PATCH", `/admin/products/${p.id}/images/${id}`, { alt: alt.value }); toast("Descripción guardada"); } catch (e) { fail(e); }
    });
  });
  // Varias fotos de una vez: se suben una a una con las mismas reglas
  const form = $("[data-upload]", box);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const files = [...fileInput.files];
      if (!files.length) return showFieldErrors(form, { image: "Elige una o varias fotos" });
      const max = imageRules?.product.max_upload_mb;
      let saved = p;
      for (const [i, file] of files.entries()) {
        if (max && file.size > max * 1048576) { toast(`“${file.name}” pesa más de ${max} MB`, true); continue; }
        if (files.length > 1) toast(`Subiendo foto ${i + 1} de ${files.length}…`);
        const fd = new FormData();
        fd.append("image", file);
        fd.append("alt", p.title);
        if (form.elements.crop.checked) fd.append("crop", "1");
        try { saved = await api("POST", `/admin/products/${p.id}/images`, fd); }
        catch (err) { toast(`“${file.name}”: ${err.fields?.image || err.message}`, true); }
      }
      if (saved !== p) { toast(files.length > 1 ? "Fotos subidas" : "Foto subida"); refresh(saved); }
    });
  });
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
      ${c ? "" : field("Tipo", '<select name="kind"><option value="group">Clase en grupo (con horarios y pago online)</option><option value="private">Modalidad de clase privada (se solicita y se paga en el taller)</option></select>')}
      ${field("Título", input("title", c?.title, "required maxlength=160"))}
      <div class="grid-3">
        ${field("Precio (€)", input("price", eurosInput(c?.price_cents), 'inputmode="decimal" required'))}
        ${field("Plazas", input("capacity", c?.capacity ?? 6, "type=number min=1 max=100"))}
        ${field("Duración (min)", input("duration_minutes", c?.duration_minutes ?? 120, "type=number min=15"))}
      </div>
      ${field("Descripción", `<textarea name="description">${esc(c?.description)}</textarea>`)}
      ${field("Orden", input("sort_order", c?.sort_order ?? 0, "type=number"), "Las clases se muestran de menor a mayor")}
      ${toggle("is_active", c ? c.is_active : true, "Visible en la web")}
      ${c?.kind === "private" ? "" : `<fieldset class="stack" data-pay-toggle><legend>Formas de pago de la clase</legend>
        ${toggle("pay_online", c ? c.pay_online : true, "Pagar ya online (un solo pago)")}
        ${toggle("pay_subscription", c ? c.pay_subscription : false, "Suscripción mensual online")}
        <div data-sub-price ${c?.pay_subscription ? "" : "hidden"}>${field("Cuota mensual por plaza (€)", input("monthly_price", eurosInput(c?.monthly_price_cents), 'inputmode="decimal"'), "Stripe cobra esta cuota cada mes en la tarjeta del cliente")}</div>
        ${toggle("pay_in_person", c ? c.pay_in_person : true, "Pagar en el taller")}
        <p class="muted" style="font-size:.82rem">El cliente elige entre las que dejes activas; si solo hay una, no se le pregunta. Con «en el taller» la plaza queda reservada y la marcas como cobrada en Reservas. Las suscripciones se reflejan solas: si no se cobra la cuota del mes, la reserva sale en «Por cobrar».</p></fieldset>`}
      <div class="row row--end">${c ? '<button class="btn btn--danger" type="button" data-delete>Borrar</button>' : ""}<button class="btn" type="submit">Guardar</button></div>
    </form>
    ${c?.kind === "group" ? `<h3>Foto (se ve al pasar el ratón)</h3>${c.image ? `<img src="${esc(c.image.thumb_url)}" alt="" style="width:120px;border-radius:4px;margin-bottom:1rem">` : ""}<div data-img>${uploadForm("class")}</div>` : ""}`);
  const form = $("[data-form]", body);
  form.elements.pay_subscription?.addEventListener("change", (e) => { $("[data-sub-price]", form).hidden = !e.target.checked; });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const f = form.elements;
      const data = {
        title: f.title.value, description: f.description.value, price_cents: toCents(f.price.value || "0"),
        capacity: Number(f.capacity.value), duration_minutes: Number(f.duration_minutes.value),
        sort_order: Number(f.sort_order.value || 0), is_active: f.is_active.checked,
      };
      if (f.pay_in_person) {
        data.pay_in_person = f.pay_in_person.checked;
        data.pay_online = f.pay_online.checked;
        data.pay_subscription = f.pay_subscription.checked;
        data.monthly_price_cents = f.pay_subscription.checked ? toCents(f.monthly_price.value || "0") : null;
      }
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
    <div class="page-head"><div><p class="eyebrow">Taller</p><h1>Reservas</h1><p>Las clases en grupo se confirman solas al pagar online, o al reservar si el cliente paga en el taller: márcalas como cobradas cuando te paguen. Las privadas llegan como solicitud: escribe al cliente y confírmalas aquí.</p></div></div>
    ${filters([["", "Próximas"], ["requested", "Solicitudes privadas"], ["unpaid", "Por cobrar"], ["confirmed", "Confirmadas"], ["pending_payment", "Pagando"], ["cancelled", "Canceladas"]], state.bookingStatus)}
    <div class="table-wrap">${list.length ? `<table>
      <thead><tr><th>Clase</th><th>Fecha</th><th>Cliente</th><th class="num">Plazas</th><th>Estado</th><th class="num">Importe</th></tr></thead>
      <tbody>${list.map((b) => `<tr class="is-clickable" data-id="${b.id}">
        <td>${esc(b.class_title)}<br><span class="muted">${esc(b.reference)}</span></td>
        <td>${b.starts_at ? fmtDate(b.starts_at) : `${fmtDate(b.preferred_date, false)} · ${esc(b.preferred_slot)}<br><span class="muted">preferida</span>`}</td>
        <td>${esc(b.customer.name)}<br><span class="muted">${esc(b.customer.email)}</span></td>
        <td class="num">${b.seats}</td><td>${badge(b.status)} ${payBadge(b)}</td><td class="num">${money(b.total_cents)}</td></tr>`).join("")}
      </tbody></table>` : '<p class="empty">No hay reservas aquí.</p>'}</div>`;
  $("[data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.bookingStatus = b.dataset.value; views.reservas().catch(fail); } });
  $$("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => bookingForm(list.find((b) => b.id === Number(tr.dataset.id)))));
};

function bookingForm(b) {
  const isPrivate = !b.session_id;
  const body = openDrawer(`Reserva ${b.reference}`, `
    <div class="row">${badge(b.status)}${payBadge(b)}<span class="muted">creada ${fmtDate(b.created_at)}</span>${b.privacy_blocked ? '<span class="badge">Datos bloqueados · RGPD</span>' : ""}</div>
    <h3>${esc(b.class_title)}</h3>
    <dl><dt>Cliente</dt><dd>${esc(b.customer.name)}</dd><dt>Email</dt><dd><a href="mailto:${esc(b.customer.email)}">${esc(b.customer.email)}</a></dd><dt>Teléfono</dt><dd>${esc(b.customer.phone) || "—"}</dd>
      <dt>Plazas</dt><dd>${b.seats}</dd><dt>Importe</dt><dd>${money(b.total_cents)} ${b.payment_method === "subscription" ? `al mes · suscripción ${{ active: "activa", past_due: "con la cuota sin pagar", canceled: "cancelada" }[b.subscription_status] || ""}${b.paid_until ? ` · pagada hasta el ${fmtDate(b.paid_until, false)}` : ""}` : b.paid_at ? `· pagado ${b.payment_method === "in_person" ? "en el taller" : "online"} el ${fmtDate(b.paid_at, false)}` : b.payment_method === "in_person" ? "· se paga en el taller" : ""}</dd>
      ${isPrivate ? `<dt>Preferencia</dt><dd>${fmtDate(b.preferred_date, false)} · ${esc(b.preferred_slot)}</dd>` : `<dt>Horario</dt><dd>${fmtDate(b.starts_at)}</dd>`}</dl>
    <form class="stack" data-form style="margin-top:1.5rem">
      ${isPrivate ? field("Fecha y hora acordadas", input("starts_at", b.starts_at ? b.starts_at.slice(0, 16).replace(" ", "T") : "", 'type="datetime-local"')) : ""}
      ${field("Notas internas", `<textarea name="notes">${esc(b.notes)}</textarea>`)}
      <div class="row row--end">
        ${b.status !== "cancelled" ? '<button class="btn btn--danger" type="button" data-status="cancelled">Cancelar reserva</button>' : ""}
        ${isPrivate && b.status === "requested" ? '<button class="btn btn--ghost" type="button" data-status="confirmed">Confirmar</button>' : ""}
        ${inPersonUnpaid(b) ? '<button class="btn btn--ghost" type="button" data-paid="1">Marcar como cobrada</button>' : ""}
        ${b.payment_method === "in_person" && b.paid_at && b.status !== "cancelled" ? '<button class="btn btn--ghost" type="button" data-paid="0">Deshacer cobro</button>' : ""}
        <button class="btn" type="submit">Guardar</button>
      </div>
    </form>
    ${b.paid_at && b.status !== "cancelled" ? `<p class="muted" style="font-size:.82rem;margin-top:1rem">${b.payment_method === "in_person" ? "Si cancelas una reserva ya cobrada, devuelve el dinero en el taller." : b.payment_method === "subscription" ? "Cancelar la reserva no da de baja la suscripción: cancélala también en Stripe → Suscripciones." : "Si cancelas una reserva pagada, haz el reembolso desde Stripe."}</p>` : ""}`);
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
  $$("[data-paid]", body).forEach((btn) => btn.addEventListener("click", () => save({ paid: btn.dataset.paid === "1" })));
}

/* ---------- Calendario de reservas ---------- */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const BILLING = { single: "Pago único", subscription: "Suscripción" };
const setOverdue = (n) => $$("[data-overdue]").forEach((el) => { el.textContent = n > 99 ? "99+" : String(n); el.hidden = !n; });
const refreshOverdue = () => api("GET", "/admin/stats").then((s) => setOverdue(s.payments_overdue)).catch(() => {});
// Estado de cobro de una entrada del calendario (null = no se puede saber, mes pasado de una suscripción)
const entryPay = (e) => e.paid === null ? "" : e.paid ? '<span class="badge badge--ok">Pagada</span>' : '<span class="badge badge--warn">Sin pagar</span>';

views.calendario = async () => {
  const today = new Date();
  state.calMonth ||= new Date(today.getFullYear(), today.getMonth(), 1);
  state.calDay ||= ymd(today);
  const first = state.calMonth;
  const offset = (first.getDay() + 6) % 7; // semana desde el lunes
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41);
  const [entries, alerts] = await Promise.all([
    api("GET", `/admin/calendar?from=${ymd(start)}&to=${ymd(end)}`),
    api("GET", "/admin/payment-alerts"),
  ]);
  setOverdue(alerts.length);
  const byDay = {};
  entries.forEach((e) => (byDay[e.date] ||= []).push(e));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = ymd(d), list = byDay[key] || [];
    const unpaid = list.some((e) => e.paid === false);
    return `<button type="button" class="cal__day${d.getMonth() !== first.getMonth() ? " is-out" : ""}${key === ymd(today) ? " is-today" : ""}" data-day="${key}" aria-pressed="${key === state.calDay}">
      <span>${d.getDate()}</span>${list.length ? `<small class="cal__n${unpaid ? " is-unpaid" : ""}">${list.length} ${list.length === 1 ? "reserva" : "reservas"}</small>` : ""}</button>`;
  }).join("");
  const dayList = byDay[state.calDay] || [];
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Taller</p><h1>Calendario</h1><p>Las reservas de cada día. Añade las que te lleguen por fuera de la web e indica si es pago único o suscripción mensual y si ya está pagada. Las cuotas se cobran a principios de mes: si pasa la primera semana sin cobrar, aparece aquí un aviso (y te llega un email si el correo está configurado).</p></div>
      <button class="btn" data-add>Añadir reserva</button></div>
    ${alerts.length ? `<div class="notice"><strong>${alerts.length} ${alerts.length === 1 ? "cobro pendiente" : "cobros pendientes"}</strong>
      <ul class="alert-list">${alerts.map((b) => `<li><button class="link-btn" data-alert="${b.id}">${esc(b.customer.name || "Sin nombre")}</button> · ${esc(b.class_title)} · ${BILLING[b.billing_type]} · ${money(b.total_cents)}
        <button class="link-btn" data-pay="${b.id}">Marcar cobrada</button></li>`).join("")}</ul></div>` : ""}
    <div class="cal__head">
      <button class="btn btn--ghost" data-month="-1" aria-label="Mes anterior">←</button>
      <h2 class="cal__title">${first.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</h2>
      <button class="btn btn--ghost" data-month="1" aria-label="Mes siguiente">→</button>
      <button class="btn btn--ghost" data-today>Hoy</button>
    </div>
    <div class="cal">${["L", "M", "X", "J", "V", "S", "D"].map((w) => `<span class="cal__wd">${w}</span>`).join("")}${cells}</div>
    <h2 style="font-size:1.5rem;margin:2rem 0 1rem">${fmtDate(state.calDay + " 00:00:00", false)}</h2>
    ${dayList.length ? `<div class="table-wrap"><table><tbody>${dayList.map((e, i) => `<tr class="is-clickable" data-entry="${i}">
      <td>${e.time}</td><td>${esc(e.booking.class_title)}<br><span class="muted">${esc(e.booking.customer.name)}${e.booking.seats > 1 ? ` · ${e.booking.seats} plazas` : ""}</span></td>
      <td>${BILLING[e.booking.billing_type]}${e.recurring ? ' <span class="muted">· cada semana</span>' : ""}</td><td>${entryPay(e)}</td><td class="num">${money(e.booking.total_cents)}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="empty">No hay reservas este día.</p>'}`;
  const again = () => views.calendario().catch(fail);
  $$("[data-month]").forEach((b) => b.addEventListener("click", () => { state.calMonth = new Date(first.getFullYear(), first.getMonth() + Number(b.dataset.month), 1); again(); }));
  $("[data-today]").addEventListener("click", () => { state.calMonth = new Date(today.getFullYear(), today.getMonth(), 1); state.calDay = ymd(today); again(); });
  $$("[data-day]").forEach((b) => b.addEventListener("click", () => { state.calDay = b.dataset.day; again(); }));
  $("[data-add]").addEventListener("click", () => calendarBookingForm(state.calDay, again));
  $$("[data-entry]").forEach((tr) => tr.addEventListener("click", () => calendarEntryForm(dayList[Number(tr.dataset.entry)], again)));
  $$("[data-alert]").forEach((b) => b.addEventListener("click", () => calendarEntryForm({ booking: alerts.find((x) => x.id === Number(b.dataset.alert)), recurring: false, paid: false }, again)));
  $$("[data-pay]").forEach((b) => b.addEventListener("click", async () => {
    try { await api("PATCH", `/admin/bookings/${b.dataset.pay}`, { paid: true }); toast("Cobro anotado"); again(); } catch (e) { fail(e); }
  }));
};

function calendarEntryForm(e, done) {
  const b = e.booking, sub = b.billing_type === "subscription";
  const body = openDrawer(`Reserva ${b.reference}`, `
    <div class="row">${badge(b.status)} <span class="badge badge--ink">${BILLING[b.billing_type]}</span> ${entryPay(e)}</div>
    <h3>${esc(b.class_title)}</h3>
    <dl><dt>Cliente</dt><dd>${esc(b.customer.name)}</dd><dt>Contacto</dt><dd>${esc([b.customer.phone, b.customer.email].filter(Boolean).join(" · ")) || "—"}</dd>
      <dt>${sub ? "Empieza" : "Fecha"}</dt><dd>${fmtDate(b.starts_at)}</dd><dt>${sub ? "Cuota mensual" : "Importe"}</dt><dd>${money(b.total_cents)}${b.seats > 1 ? ` · ${b.seats} plazas` : ""}</dd>
      ${sub ? `<dt>Último cobro</dt><dd>${b.paid_at ? fmtDate(b.paid_at, false) : "—"}</dd>` : ""}
      ${b.notes ? `<dt>Notas</dt><dd>${esc(b.notes)}</dd>` : ""}</dl>
    <div class="row row--end" style="margin-top:1.5rem">
      ${b.status !== "cancelled" ? `<button class="btn btn--danger" type="button" data-cancel>${sub ? "Dar de baja" : "Cancelar reserva"}</button>` : ""}
      ${b.payment_method === "in_person" && b.status !== "cancelled" ? (e.paid ? `<button class="btn btn--ghost" type="button" data-paid="0">Deshacer cobro</button>` : `<button class="btn" type="button" data-paid="1">${sub ? "Marcar cuota cobrada" : "Marcar como cobrada"}</button>`) : ""}
    </div>
    ${sub ? '<p class="muted" style="font-size:.82rem;margin-top:1rem">La suscripción sale cada semana, el mismo día y hora, hasta que la des de baja. «Cobrada» vale para el mes en curso.</p>' : ""}`);
  const patch = async (data, msg) => { try { await api("PATCH", `/admin/bookings/${b.id}`, data); toast(msg); closeDrawer(); done(); } catch (err) { fail(err); } };
  $$("[data-paid]", body).forEach((btn) => btn.addEventListener("click", () => patch({ paid: btn.dataset.paid === "1" }, "Reserva actualizada")));
  $("[data-cancel]", body)?.addEventListener("click", () => { if (confirm(sub ? "¿Dar de baja la suscripción?" : "¿Cancelar la reserva?")) patch({ status: "cancelled" }, "Reserva cancelada"); });
}

async function calendarBookingForm(day, done) {
  const classes = (await api("GET", "/admin/classes")).filter((c) => c.kind === "group");
  const body = openDrawer("Añadir reserva", `
    <form class="stack" data-form>
      ${field("Nombre", input("customer_name", "", "required"))}
      <div class="grid-2">${field("Teléfono", input("customer_phone", "", 'type="tel"'))}${field("Email (opcional)", input("customer_email", "", 'type="email"'))}</div>
      ${field("Clase", `<select name="class_id"><option value="">Otra (escribe el nombre)</option>${classes.map((c) => `<option value="${c.id}" data-price="${c.price_cents}">${esc(c.title)}</option>`).join("")}</select>`)}
      <div data-title-field>${field("Nombre de la clase", input("class_title"))}</div>
      <div class="grid-2">${field("Fecha y hora", input("starts_at", `${day}T18:00`, 'type="datetime-local" required'))}${field("Plazas", input("seats", "1", 'type="number" min="1" max="100"'))}</div>
      ${field("Tipo de pago", `<select name="billing_type"><option value="single">Pago único</option><option value="subscription">Suscripción mensual</option></select>`, "La suscripción se repite cada semana en el calendario y se cobra una vez al mes.")}
      ${field("Importe (€)", input("price", "", 'inputmode="decimal" placeholder="Pago único o cuota mensual"'))}
      ${toggle("paid", false, "Ya está pagada")}
      ${field("Notas internas", '<textarea name="notes"></textarea>')}
      <div class="row row--end"><button class="btn" type="submit">Guardar reserva</button></div>
    </form>`);
  const form = $("[data-form]", body), f = form.elements;
  f.class_id.addEventListener("change", () => {
    const opt = f.class_id.selectedOptions[0];
    $("[data-title-field]", body).hidden = !!f.class_id.value;
    if (f.class_id.value && !f.price.value) f.price.value = eurosInput(Number(opt.dataset.price));
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      await api("POST", "/admin/bookings", {
        customer_name: f.customer_name.value, customer_phone: f.customer_phone.value, customer_email: f.customer_email.value,
        class_id: f.class_id.value ? Number(f.class_id.value) : null, class_title: f.class_title.value,
        starts_at: f.starts_at.value, seats: Number(f.seats.value) || 1, billing_type: f.billing_type.value,
        total_cents: f.price.value ? toCents(f.price.value) : 0, paid: f.paid.checked, notes: f.notes.value,
      });
      toast("Reserva añadida"); closeDrawer(); done();
    });
  });
}

/* ---------- Galería ---------- */
// Etiqueta bajo cada obra en la web
const AVAILABILITY = { unique: ["Obra única (No disponible)", ""], on_request: ["Disponible bajo pedido (Consultar precios)", "ok"], none: ["Sin etiqueta", ""] };
const availabilityBadge = (a) => { const [t, c] = AVAILABILITY[a] || AVAILABILITY.unique; return `<span class="badge${c ? ` badge--${c}` : ""}">${t}</span>`; };
const availabilityField = (current) => field("Etiqueta bajo la obra",
  `<select name="availability">${Object.entries(AVAILABILITY).map(([v, [t]]) => `<option value="${v}" ${v === current ? "selected" : ""}>${t}</option>`).join("")}</select>`,
  "«Bajo pedido» enlaza al formulario de contacto con el nombre de la obra. Usa «Sin etiqueta» para fotos del taller.");

views.galeria = async () => {
  const items = await api("GET", "/admin/gallery");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Web</p><h1>Galería</h1><p>Las fotos se validan en el servidor (formato, peso y proporción) para que la galería mantenga su estilo. El orden es el de la web.</p></div>
      <button class="btn" data-new>Subir obra</button></div>
    <div class="gallery-grid">${items.map((g, i) => `<article class="g-item${g.is_published ? "" : " is-hidden"}" data-id="${g.id}">
      <img src="${esc(g.image.thumb_url)}" alt="${esc(g.image.alt)}" loading="lazy">
      <div class="g-item__body">
        <p class="g-item__title">${esc(g.title)}</p><p class="muted" style="font-size:.82rem">${esc(g.technique)} · ${esc(g.year)}</p>
        <p style="font-size:.82rem">${availabilityBadge(g.availability)}</p>
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
      ${availabilityField("unique")}
      ${field("Descripción de la foto (texto alternativo)", '<input name="alt" maxlength="255" placeholder="Jarrón de gres torneado a mano en esmalte arena">', "Lo leen Google y las personas que no ven la foto. Si lo dejas vacío se usa el título y la técnica")}`));
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
        ${availabilityField(g.availability)}
        ${field("Descripción de la foto (texto alternativo)", input("alt", g.image.alt, 'maxlength=255 placeholder="Jarrón de gres torneado a mano en esmalte arena"'), "Lo leen Google y las personas que no ven la foto")}
        <div class="row row--end"><button class="btn" type="submit">Guardar</button></div></form>`);
      const form = $("[data-form]", body);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        submitting(form, async () => {
          const f = form.elements;
          await api("PATCH", `/admin/gallery/${id}`, { title: f.title.value, technique: f.technique.value, year: f.year.value, availability: f.availability.value, alt: f.alt.value });
          toast("Obra guardada"); closeDrawer(); views.galeria();
        });
      });
    });
  });
};

/* ---------- Reseñas (portada) ---------- */
const stars = (n) => n ? `<span aria-label="${n} de 5">${"★".repeat(n)}<span class="muted">${"★".repeat(5 - n)}</span></span>` : '<span class="muted">—</span>';

views.resenas = async () => {
  const items = await api("GET", "/admin/reviews");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Web</p><h1>Reseñas</h1>
      <p>Opiniones de compradores y alumnos para la portada. Publica solo opiniones reales y con permiso de quien la escribe (basta el nombre y la inicial del apellido). Mientras no haya ninguna publicada, la sección no sale en la web.</p></div>
      <button class="btn" data-new>Añadir reseña</button></div>
    <div class="table-wrap">${items.length ? `<table><thead><tr><th>Autor</th><th>Reseña</th><th>Valoración</th><th>Publicada</th><th></th></tr></thead><tbody>
      ${items.map((r, i) => `<tr data-id="${r.id}"><td>${esc(r.author)}${r.context ? `<br><span class="muted" style="font-size:.82rem">${esc(r.context)}</span>` : ""}</td>
        <td>${esc(r.body.length > 140 ? r.body.slice(0, 140) + "…" : r.body)}</td><td>${stars(r.rating)}</td>
        <td>${toggle("is_published", r.is_published, "Publicada")}</td>
        <td class="num" style="white-space:nowrap"><button class="link-btn" data-move="-1" ${i ? "" : "disabled"} aria-label="Subir">↑</button> <button class="link-btn" data-move="1" ${i < items.length - 1 ? "" : "disabled"} aria-label="Bajar">↓</button> <button class="link-btn" data-edit>Editar</button></td></tr>`).join("")}
    </tbody></table>` : '<p class="empty">Todavía no hay reseñas. Añade las que te hayan dejado por email, Instagram, Google o en persona.</p>'}</div>`;
  $("[data-new]").addEventListener("click", () => reviewForm(null));
  const ids = items.map((r) => r.id);
  $$("tr[data-id]").forEach((tr) => {
    const id = Number(tr.dataset.id);
    $("input[name=is_published]", tr).addEventListener("change", async (e) => {
      try { await api("PATCH", `/admin/reviews/${id}`, { is_published: e.target.checked }); toast(e.target.checked ? "Publicada" : "Oculta"); } catch (err) { e.target.checked = !e.target.checked; fail(err); }
    });
    $$("[data-move]", tr).forEach((b) => b.addEventListener("click", async () => {
      const i = ids.indexOf(id);
      const j = i + Number(b.dataset.move);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      try { await api("PUT", "/admin/reviews/order", { ids }); views.resenas(); } catch (e) { fail(e); }
    }));
    $("[data-edit]", tr).addEventListener("click", () => reviewForm(items.find((r) => r.id === id)));
  });
};

function reviewForm(r) {
  const body = openDrawer(r ? `Reseña de ${r.author}` : "Nueva reseña", `
    <form class="stack" data-form novalidate>
      <div class="grid-2">
        ${field("Nombre", input("author", r?.author, 'required maxlength=120 placeholder="Lucía M."'), "Nombre e inicial del apellido")}
        ${field("Quién es", input("context", r?.context, 'maxlength=160 placeholder="Alumna del curso de torno"'), "Opcional: qué compró o a qué clase vino")}
      </div>
      ${field("Reseña", `<textarea name="body" rows="5" maxlength="2000" required>${esc(r?.body)}</textarea>`, "Copia sus palabras tal cual; puedes acortarla si no cambia el sentido.")}
      <div class="grid-2">
        ${field("Valoración", `<select name="rating"><option value="">Sin estrellas</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${r?.rating === n ? "selected" : ""}>${"★".repeat(n)} (${n})</option>`).join("")}</select>`)}
        ${field("Fecha", input("review_date", r?.review_date || "", "type=date"), "Opcional, no se enseña en la web")}
      </div>
      ${toggle("is_published", r ? r.is_published : true, "Publicada en la web")}
      <div class="row row--end">${r ? '<button class="btn btn--danger" type="button" data-delete>Borrar</button>' : ""}<button class="btn" type="submit">${r ? "Guardar cambios" : "Añadir reseña"}</button></div>
    </form>`);
  const form = $("[data-form]", body);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const f = form.elements;
      const data = { author: f.author.value, context: f.context.value, body: f.body.value, rating: f.rating.value, review_date: f.review_date.value, is_published: f.is_published.checked };
      r ? await api("PATCH", `/admin/reviews/${r.id}`, data) : await api("POST", "/admin/reviews", data);
      toast(r ? "Reseña guardada" : "Reseña añadida");
      closeDrawer();
      views.resenas();
    });
  });
  $("[data-delete]", body)?.addEventListener("click", async () => {
    if (!confirm(`¿Borrar la reseña de ${r.author}?`)) return;
    try { await api("DELETE", `/admin/reviews/${r.id}`); toast("Reseña borrada"); closeDrawer(); views.resenas(); } catch (e) { fail(e); }
  });
}

/* ---------- Clientes y privacidad (RGPD) ---------- */
const CONSENT_LABEL = { terms: "Condiciones y privacidad", marketing: "Comunicaciones comerciales", profile: "Guardar perfil" };
const SOURCE_LABEL = { checkout: "compra", booking: "reserva", private_booking: "solicitud de clase privada", panel: "panel", privacy_request: "Mis datos", unsubscribe_link: "enlace de baja", web: "web" };
const REQUEST_LABEL = { export: "Copia de datos", delete: "Borrado", unsubscribe: "Baja de comunicaciones" };

// Descarga un archivo generado en el navegador (CSV de marketing, JSON de un cliente)
function downloadFile(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const csv = (rows) => "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
const eraseSummary = (r) => {
  const kept = r.orders_kept + r.bookings_kept;
  return "Datos borrados." + (kept ? ` Se conservan bloqueados ${kept} pedidos/reservas pagados (facturas, 6 años).` : "");
};

views.clientes = async () => {
  const tab = state.customerTab || "profiles";
  const stats = await api("GET", "/admin/stats");
  const tabs = filters([["profiles", "Perfiles"], ["marketing", "Comunicaciones comerciales"], ["requests", "Solicitudes de privacidad"]], tab);
  const head = `
    <div class="page-head"><div><p class="eyebrow">Contactos</p><h1>Clientes</h1>
      <p>Solo aparecen las personas que han pedido guardar su perfil o que aceptaron recibir comunicaciones comerciales. Quien no marca ninguna casilla queda solo en sus pedidos y reservas.</p></div></div>
    ${stats.legacy_customers ? `<div class="notice"><p>Hay ${stats.legacy_customers} ${stats.legacy_customers === 1 ? "cliente creado" : "clientes creados"} antes de pedir permiso para guardar perfiles. Sus pedidos y reservas conservan los datos necesarios, así que puedes borrarlos sin perder nada.</p>
      <p style="margin-top:.6rem"><button class="btn btn--ghost" type="button" data-purge>Borrar esos ${stats.legacy_customers} registros</button></p></div>` : ""}
    ${tabs}`;

  if (tab === "requests") {
    const list = await api("GET", "/admin/privacy-requests");
    main.innerHTML = `${head}
      <p class="muted" style="margin-bottom:1rem">Desde la página <a href="../mis-datos.html" target="_blank" rel="noopener">Mis datos</a> de la web cualquier persona puede pedir una copia de sus datos, borrarlos o darse de baja. Se atienden solas al confirmar el enlace del email; aquí queda constancia.</p>
      <form class="row" data-erase-form style="margin-bottom:1.5rem;align-items:flex-end">
        ${field("Borrar los datos de un email", '<input type="email" name="email" placeholder="persona@email.com" required>', "Para solicitudes que te lleguen por teléfono, email o en el taller.")}
        <button class="btn btn--danger" type="submit">Borrar datos</button>
      </form>
      <div class="table-wrap">${list.length ? `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Email</th><th>Estado</th><th>Resultado</th></tr></thead>
        <tbody>${list.map((q) => `<tr><td>${fmtDate(q.created_at)}</td><td>${REQUEST_LABEL[q.type] || esc(q.type)}${q.source === "panel" ? ' <span class="muted">· panel</span>' : ""}</td><td>${esc(q.email)}</td>
          <td>${q.status === "done" ? '<span class="badge badge--ok">Atendida</span>' : q.status === "expired" ? '<span class="badge">Sin confirmar</span>' : '<span class="badge badge--warn">Esperando confirmación</span>'}</td><td>${esc(q.result)}</td></tr>`).join("")}</tbody></table>`
        : '<p class="empty">Todavía no hay solicitudes.</p>'}</div>`;
    const form = $("[data-erase-form]");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = form.elements.email.value.trim();
      if (!confirm(`¿Borrar los datos de ${email}? No se puede deshacer. Los pedidos pagados se conservan bloqueados por obligación legal.`)) return;
      submitting(form, async () => { toast(eraseSummary(await api("POST", "/admin/customers/erase", { email }))); views.clientes(); });
    });
  } else {
    const list = await api("GET", `/admin/customers?filter=${tab}`);
    const isMk = tab === "marketing";
    main.innerHTML = `${head}
      ${isMk ? `<div class="row" style="margin-bottom:1rem;justify-content:space-between"><p class="muted">${list.length} ${list.length === 1 ? "persona ha aceptado" : "personas han aceptado"} recibir comunicaciones comerciales. Envía solo a esta lista e incluye siempre el enlace de baja.</p>
        <button class="btn btn--ghost" type="button" data-export-mk ${list.length ? "" : "disabled"}>Exportar CSV</button></div>` : `<p class="muted" style="margin-bottom:1rem">${list.length} ${list.length === 1 ? "perfil guardado" : "perfiles guardados"}.</p>`}
      <div class="table-wrap">${list.length ? `<table><thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Ciudad</th><th>Comunicaciones</th><th class="num">Pedidos</th><th class="num">Reservas</th><th>Desde</th></tr></thead>
        <tbody>${list.map((c) => `<tr class="is-clickable" data-id="${c.id}"><td>${esc(c.name)}${c.has_profile ? "" : ' <span class="muted">· sin perfil</span>'}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td>${esc(c.city)}</td>
          <td>${c.marketing_opt_in ? '<span class="badge badge--ok">Sí</span>' : '<span class="badge">No</span>'}</td><td class="num">${c.orders}</td><td class="num">${c.bookings}</td><td>${fmtDate(c.created_at, false)}</td></tr>`).join("")}</tbody></table>`
        : `<p class="empty">${isMk ? "Nadie ha aceptado todavía recibir comunicaciones." : "Todavía no hay perfiles guardados."}</p>`}</div>`;
    $$("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openCustomer(tr.dataset.id)));
    $("[data-export-mk]")?.addEventListener("click", async () => {
      try {
        const rows = await api("GET", "/admin/marketing");
        downloadFile(`comunicaciones-${new Date().toISOString().slice(0, 10)}.csv`,
          csv([["Nombre", "Email", "Alta", "Enlace de baja"], ...rows.map((r) => [r.name, r.email, r.since, r.unsubscribe_url])]), "text/csv;charset=utf-8");
      } catch (e) { fail(e); }
    });
  }
  $("[data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.customerTab = b.dataset.value; views.clientes().catch(fail); } });
  $("[data-purge]")?.addEventListener("click", async () => {
    if (!confirm("¿Borrar los clientes creados antes de pedir permiso? Sus pedidos y reservas no se tocan.")) return;
    try { const r = await api("POST", "/admin/customers/purge-legacy"); toast(`${r.deleted} registros borrados`); views.clientes(); } catch (e) { fail(e); }
  });
};

async function openCustomer(id) {
  const c = await api("GET", `/admin/customers/${id}`);
  const body = openDrawer(c.name || c.email, `
    <dl><dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd><dt>Teléfono</dt><dd>${esc(c.phone) || "—"}</dd>
      <dt>Dirección</dt><dd>${c.street ? `${esc(c.street)}<br>${esc(c.postal_code)} ${esc(c.city)} (${esc(c.country)})` : "—"}</dd>
      <dt>Perfil</dt><dd>${c.has_profile ? `Guardado con su permiso · ${fmtDate(c.created_at, false)}` : "No pidió guardar perfil (solo comunicaciones)"}</dd></dl>
    <h3>Comunicaciones comerciales</h3>
    <form data-mk-form>${toggle("marketing_opt_in", c.marketing_opt_in, "Acepta recibir comunicaciones")}</form>
    <p class="muted" style="font-size:.82rem;margin-top:.4rem">Actívalo solo si esta persona te lo ha pedido (y mejor por escrito).${c.has_profile ? "" : " Como no tiene perfil, al desactivarlo se borra de la lista."}</p>
    <h3>Pedidos</h3>
    ${c.order_list.length ? `<div class="table-wrap"><table><tbody>${c.order_list.map((o) => `<tr><td>${esc(o.reference)}<br><span class="muted">${fmtDate(o.created_at, false)}</span></td><td>${badge(o.status)}</td><td class="num">${money(o.total_cents)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Sin pedidos.</p>'}
    <h3>Reservas</h3>
    ${c.booking_list.length ? `<div class="table-wrap"><table><tbody>${c.booking_list.map((b) => `<tr><td>${esc(b.class_title)}<br><span class="muted">${esc(b.reference)}</span></td><td>${badge(b.status)}</td><td class="num">${money(b.total_cents)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Sin reservas.</p>'}
    <h3>Consentimientos</h3>
    ${c.consents.length ? `<div class="table-wrap"><table><tbody>${c.consents.map((k) => `<tr><td>${CONSENT_LABEL[k.purpose] || esc(k.purpose)}<br><span class="muted">${SOURCE_LABEL[k.source] || esc(k.source)} · textos ${esc(k.text_version)}</span></td>
      <td>${k.granted ? '<span class="badge badge--ok">Acepta</span>' : '<span class="badge badge--bad">Retira</span>'}</td><td>${fmtDate(k.created_at)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Sin registros.</p>'}
    <h3>Derechos de esta persona</h3>
    <div class="row">
      <button class="btn btn--ghost" type="button" data-export>Exportar sus datos (JSON)</button>
      <button class="btn btn--danger" type="button" data-erase>Borrar sus datos</button>
    </div>
    <p class="muted" style="font-size:.82rem;margin-top:1rem">Borrar elimina el perfil y la suscripción y anonimiza lo no pagado. Los pedidos y reservas pagados se conservan bloqueados (sin teléfono ni notas) durante 6 años por obligación legal y luego se anonimizan solos.</p>`);
  $("[data-mk-form] input", body).addEventListener("change", async (e) => {
    const on = e.target.checked;
    if (on && !confirm("¿Esta persona te ha pedido recibir comunicaciones comerciales? Queda registrado como alta desde el panel.")) { e.target.checked = false; return; }
    try {
      const r = await api("PATCH", `/admin/customers/${id}`, { marketing_opt_in: on });
      toast(on ? "Alta en comunicaciones guardada" : "Baja guardada");
      if (r.deleted) closeDrawer(); else openCustomer(id);
      views.clientes();
    } catch (err) { e.target.checked = !on; fail(err); }
  });
  $("[data-export]", body).addEventListener("click", async () => {
    try { downloadFile(`datos-${c.email}.json`, JSON.stringify(await api("GET", `/admin/customers/${id}/export`), null, 2), "application/json"); } catch (e) { fail(e); }
  });
  $("[data-erase]", body).addEventListener("click", async () => {
    if (!confirm(`¿Borrar los datos de ${c.email}? No se puede deshacer.`)) return;
    try { toast(eraseSummary(await api("DELETE", `/admin/customers/${id}`))); closeDrawer(); views.clientes(); } catch (e) { fail(e); }
  });
}

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
          ${field("Código postal y ciudad", input("SITE_CITY", v.SITE_CITY, 'placeholder="36740 Tomiño (Pontevedra)"'))}
          ${field("Enlace de Google Maps", input("SITE_MAPS_URL", v.SITE_MAPS_URL, 'type="url" placeholder="https://maps.app.goo.gl/…"'), "Opcional: la dirección se podrá pulsar")}
        </div>
        ${field("Horario", `<textarea name="SITE_HOURS" rows="3" maxlength="500" placeholder="Mar–Sáb · 10:00–20:00&#10;Dom y Lun · cerrado">${esc(v.SITE_HOURS || "")}</textarea>`, "Una línea por cada franja. En el pie sale solo la primera.")}
        <div class="grid-2">
          ${field("Email de contacto", input("SITE_EMAIL", v.SITE_EMAIL, 'type="email" placeholder="hola@tudominio.com"'), "Mejor uno con tu dominio que uno de Gmail: da más confianza. Créalo en hPanel → Emails.")}
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
        <h2 class="settings__title">El estudio (portada)</h2>
        <p class="muted">La sección «Del barro a tu mesa» de la portada: una foto trabajando en el taller y un texto corto sobre cómo hacéis las piezas. Los cuatro pasos del proceso se quedan debajo.</p>
        ${field("Texto", `<textarea name="SITE_STUDIO_TEXT" rows="5" maxlength="1500" placeholder="Cada pieza empieza como un puñado de barro en el torno…">${esc(v.SITE_STUDIO_TEXT || "")}</textarea>`, "Deja una línea en blanco para separar párrafos. Vacío: se queda el texto de ejemplo.")}
        <div class="field" data-studio-photo><span>Foto</span>
          ${s.studio_image ? `<img src="${esc(s.studio_image.thumb_url)}" alt="" style="max-width:220px;border-radius:6px">` : '<p class="muted">Ahora sale una foto de ejemplo. Sube una vuestra en el torno o en el taller.</p>'}
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto del estudio">
          <input type="text" maxlength="255" placeholder="Descripción de la foto (p. ej. Manos centrando el barro en el torno)" aria-label="Descripción de la foto" value="${esc(s.studio_image?.alt || "")}">
          <label class="check"><input type="checkbox" data-crop checked> Recortar automáticamente si la proporción no encaja</label>
          <small>Vertical 4:5 o 3:4 queda mejor (también vale 1:1, 4:3 o 3:2) · mínimo 1000 px de ancho.</small>
          <div class="row"><button type="button" class="btn btn--small" data-studio-upload>Subir foto</button>${s.studio_image ? '<button type="button" class="btn btn--small btn--ghost" data-studio-remove>Quitar y volver a la de ejemplo</button>' : ""}</div>
        </div>
      </section>

      <section class="stack">
        <h2 class="settings__title">Datos legales y analítica</h2>
        <p class="muted">Los datos del titular salen en el <a href="../aviso-legal.html" target="_blank" rel="noopener">aviso legal</a>, la <a href="../privacidad.html" target="_blank" rel="noopener">política de privacidad</a> y las <a href="../condiciones.html" target="_blank" rel="noopener">condiciones de venta</a>. La ley (LSSI) obliga a mostrarlos: mientras falten, esas páginas enseñan el hueco marcado.</p>
        <div class="grid-2">
          ${field("Nombre o razón social", input("LEGAL_OWNER", v.LEGAL_OWNER, 'placeholder="Nombre Apellidos o Empresa S.L."'), "Autónomo: tu nombre completo")}
          ${field("NIF / CIF", input("LEGAL_TAX_ID", v.LEGAL_TAX_ID, 'placeholder="12345678Z"'))}
        </div>
        ${field("Domicilio fiscal o del taller", input("LEGAL_ADDRESS", v.LEGAL_ADDRESS, 'placeholder="Calle y número, 36740 Tomiño (Pontevedra)"'))}
        <div class="grid-2">
          ${field("Email para privacidad y reclamaciones", input("LEGAL_EMAIL", v.LEGAL_EMAIL, 'type="email" placeholder="hola@charriaceramics.com"'), "Si lo dejas vacío se usa el email de contacto")}
          ${field("Datos registrales", input("LEGAL_REGISTRY", v.LEGAL_REGISTRY, 'placeholder="Registro Mercantil de Pontevedra, tomo…"'), "Solo si eres sociedad. Opcional")}
        </div>
        ${field("ID de Google Analytics 4", input("GA_MEASUREMENT_ID", v.GA_MEASUREMENT_ID, 'placeholder="G-XXXXXXXXXX" spellcheck="false"'), 'En Google Analytics → Administrar → Flujos de datos. Solo se carga a los visitantes que acepten las cookies analíticas. Pon la retención de datos en 14 meses.')}
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
        <h2 class="settings__title">Tienda</h2>
        ${toggle("SHOP_OPEN", v.SHOP_OPEN !== "false", "Tienda abierta (compra y cesta activas)")}
        ${field("Aviso cuando está cerrada", input("SHOP_CLOSED_MESSAGE", v.SHOP_CLOSED_MESSAGE, 'placeholder="No disponible en estos momentos"'), "Se ve en la tienda y en las fichas. Los pedidos ya pagados no cambian.")}
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
  const photo = $("[data-studio-photo]", form);
  $("[data-studio-upload]", photo).addEventListener("click", async (e) => {
    const file = $("input[type=file]", photo).files[0];
    if (!file) return toast("Elige una foto", true);
    const fd = new FormData();
    fd.append("image", file);
    fd.append("alt", $("input[type=text]", photo).value.trim());
    if ($("[data-crop]", photo).checked) fd.append("crop", "1");
    e.target.disabled = true;
    try { await api("POST", "/admin/settings/studio-image", fd); toast("Foto del estudio guardada"); await views.ajustes(); }
    catch (err) { fail(err.fields?.image ? { message: err.fields.image } : err); } finally { e.target.disabled = false; }
  });
  $("[data-studio-remove]", photo)?.addEventListener("click", async () => {
    if (!confirm("¿Quitar la foto del estudio? Volverá a salir la de ejemplo.")) return;
    try { await api("DELETE", "/admin/settings/studio-image"); toast("Foto quitada"); await views.ajustes(); } catch (e) { fail(e); }
  });
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
  $("[data-menu-current]").textContent = $("[data-nav] a[aria-current]")?.firstChild.textContent.trim() || "Menú";
  toggleMenu(false);
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
  refreshUnread();
  refreshOverdue();
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

/* ---------- Móvil: menú desplegable y tablas como tarjetas ---------- */
const side = $(".side");
function toggleMenu(open = !side.classList.contains("is-open")) {
  side.classList.toggle("is-open", open);
  $("[data-menu-toggle]").setAttribute("aria-expanded", String(open));
}
$("[data-menu-toggle]").addEventListener("click", () => toggleMenu());
// Tocar la sección en la que ya estás no cambia el hash: cierra el menú igualmente
$("[data-nav]").addEventListener("click", (e) => { if (e.target.closest("a")) toggleMenu(false); });

// Copia el título de cada columna en sus celdas para que en móvil cada fila se lea como una tarjeta
function labelTables(root) {
  $$("table:not(.has-labels)", root).forEach((table) => {
    const heads = $$("thead th", table).map((th) => th.textContent.trim());
    if (!heads.length) return;
    $$("tbody tr", table).forEach((tr) => [...tr.children].forEach((td, i) => {
      td.dataset.label = td.colSpan > 1 ? "" : heads[i] ?? "";
      // El contenido va en un bloque para que nombre + email sigan uno debajo del otro (se mueven los nodos, no se pierden sus eventos)
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.append(...td.childNodes);
      td.append(cell);
    }));
    table.classList.add("has-labels");
  });
}
[main, $("[data-drawer-body]")].forEach((el) => new MutationObserver(() => labelTables(el)).observe(el, { childList: true, subtree: true }));

// Panel instalable como app (Chrome pide un service worker; ver sw.js)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* sin app instalable, el panel funciona igual */ });
}

window.addEventListener("hashchange", () => { if (token) route(); });
// Mensajes nuevos: se mira cada minuto mientras el panel está a la vista
setInterval(() => { if (token && !document.hidden && !$("[data-view-app]").hidden) refreshUnread(); }, 60000);
document.addEventListener("visibilitychange", () => { if (token && !document.hidden && !$("[data-view-app]").hidden) refreshUnread(); });
// Primera visita sin instalar: al instalador
fetch(`${API}/health`).then((r) => r.json()).then((j) => {
  if (j.data?.installed === false) location.replace("setup.html");
}).catch(() => {});
token ? showApp() : showLogin();
