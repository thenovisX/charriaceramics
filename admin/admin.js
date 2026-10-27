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
// Medidas de la pieza: se escriben en cm (con coma) y se guardan en milímetros
const cmInput = (mm) => (mm ? String(mm / 10).replace(".", ",") : "");
const toMm = (v) => Math.max(0, Math.round(Number(String(v || "").replace(",", ".")) * 10) || 0);
const eurosInput = (cents) => (cents === null || cents === undefined || cents === "") ? "" : (cents / 100).toFixed(2).replace(".", ",");
const fmtDate = (s, time = true) => s ? new Date(s.replace(" ", "T")).toLocaleString("es-ES", time
  ? { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
  : { day: "2-digit", month: "short", year: "numeric" }) : "";

/* ---------- Sesión y peticiones ---------- */
let token = null;
let me = null; // quien ha entrado (nombre para el saludo de Inicio)
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
  // En el móvil no se enfoca la primera casilla: sacaría el teclado nada más abrir
  if (!matchMedia("(pointer: coarse)").matches) $("input, select, textarea, button", $("[data-drawer-body]"))?.focus();
  $("[data-drawer-body]").scrollTop = 0;
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
const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
// Fecha corta para listas: la hora si es de hoy, «ayer», o el día y el mes
const shortDate = (s) => {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T")), now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (days === 0) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "2-digit" } : {}) });
};
const initial = (name) => esc((String(name || "?").trim()[0] || "?").toUpperCase());
// Fila de lista tipo bandeja: círculo (inicial, foto o icono), título, detalle, etiquetas y lo de la derecha
const listItem = ({ attrs = "", av = "", avClass = "", title = "", sub = "", meta = "", side = "", unread = false, tag = "button" }) =>
  `<${tag} ${tag === "button" ? 'type="button" ' : ""}class="li${unread ? " is-unread" : ""}" ${attrs}>
    <span class="li__av${avClass ? ` ${avClass}` : ""}" aria-hidden="true">${av}</span>
    <span class="li__main"><span class="li__title">${title}</span>${sub ? `<span class="li__sub">${sub}</span>` : ""}${meta ? `<span class="li__meta">${meta}</span>` : ""}</span>
    <span class="li__side">${side}</span></${tag}>`;
const listBox = (items, empty) => `<div class="list">${items.length ? items.join("") : `<p class="empty">${empty}</p>`}</div>`;

/* ==========================================================
   Vistas
   ========================================================== */
const main = $("[data-main]");
const views = {};
let state = { orderStatus: "", bookingStatus: "", customerTab: "profiles", messageType: "", messageStatus: "open" };

/* ---------- Resumen ---------- */
views.resumen = async () => {
  const s = await api("GET", "/admin/stats");
  const hour = new Date().getHours();
  const hello = hour < 6 || hour >= 21 ? "Buenas noches" : hour < 14 ? "Buenos días" : "Buenas tardes";
  const name = (me?.name || "").split(" ")[0];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // Lo que hay que hacer: solo sale lo que tiene algo pendiente
  const todo = [
    [s.unread_messages, "#mensajes", "chat", "", plural(s.unread_messages, "mensaje sin leer", "mensajes sin leer"), "Contesta y márcalos como atendidos"],
    [s.orders_to_ship, "#pedidos", "truck", "", plural(s.orders_to_ship, "pedido por enviar", "pedidos por enviar"), "Ya están pagados"],
    [s.orders_to_collect, "#pedidos", "bag", "", plural(s.orders_to_collect, "pedido para recoger", "pedidos para recoger"), "Los pasan a buscar por el estudio"],
    [s.private_requests, "#reservas", "class", "requested", plural(s.private_requests, "clase privada por confirmar", "clases privadas por confirmar"), "Escribe al cliente y confírmala"],
    [s.payments_overdue, "#calendario", "alert", "", plural(s.payments_overdue, "cobro atrasado", "cobros atrasados"), "Cuotas o clases sin pagar"],
    [s.bookings_unpaid, "#reservas", "euro", "unpaid", plural(s.bookings_unpaid, "reserva por cobrar", "reservas por cobrar"), "Pagan en el taller"],
  ].filter(([n]) => n > 0);
  const setup = [
    [!s.payments_configured, "#ajustes/pagos", "Conecta Stripe para cobrar", "Sin Stripe, la tienda y las reservas en grupo no aceptan pagos."],
    [s.mail_configured === false, "#ajustes/correo", "Configura el correo", "Sin correo no salen emails a los clientes ni te llegan avisos (puedes usar tu Gmail)."],
    [!s.packlink_configured, "#ajustes/tienda", "Conecta Packlink PRO (opcional)", "Mientras tanto se cobra la tarifa plana de envío."],
    [s.legal_missing.length > 0, "#ajustes/legal", "Rellena tus datos legales", "Nombre o razón social, NIF, domicilio y email: la ley obliga a mostrarlos en el aviso legal y la privacidad."],
    [s.legacy_customers > 0, "#clientes", "Revisa clientes antiguos", `Hay ${plural(s.legacy_customers, "cliente guardado", "clientes guardados")} de antes de pedir permiso para crear perfiles.`],
  ].filter(([on]) => on);
  main.innerHTML = `
    <div class="hello"><h1>${hello}${name ? `, ${esc(name)}` : ""}</h1><p>${new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</p></div>
    <div class="quick-row">
      <button type="button" data-quick="#productos|[data-new]">${icon("tag")}Subir producto</button>
      <button type="button" data-quick="#calendario|[data-add]">${icon("cal")}Añadir reserva</button>
      <a href="#pedidos">${icon("box")}Ver pedidos</a>
      <a href="#clases">${icon("class")}Clases y horarios</a>
    </div>
    <h2 class="block-title">Pendiente</h2>
    ${todo.length ? `<div class="todo">${listBox(todo.map(([n, href, ic, filter, title, sub]) => listItem({
      tag: "a", attrs: `href="${href}"${filter ? ` data-booking-filter="${filter}"` : ""}`, av: icon(ic), avClass: ic === "alert" ? "li__av--bad" : "li__av--warn",
      title, sub, side: icon("chev") })), "")}</div>`
      : `<p class="all-done">${icon("check")}Todo al día. No tienes nada pendiente.</p>`}
    ${setup.length ? `<h2 class="block-title">Te falta configurar</h2><div class="setup-list">${listBox(setup.map(([, href, title, sub]) => listItem({
      tag: "a", attrs: `href="${href}"`, av: icon("sliders"), title, sub, side: icon("chev") })), "")}</div>` : ""}
    <h2 class="block-title">Últimos 30 días</h2>
    <div class="cards">
      <a class="card" href="#pedidos"><span class="eyebrow">Ventas en la tienda</span><p class="card__num">${money(s.sales_30d_cents)}</p></a>
      <a class="card" href="#reservas"><span class="eyebrow">Clases cobradas</span><p class="card__num">${money(s.bookings_30d_cents)}</p></a>
      <a class="card" href="#clases"><span class="eyebrow">Próximos horarios</span><p class="card__num">${s.upcoming_sessions}</p></a>
      <a class="card" href="#mensajes"><span class="eyebrow">Mensajes sin leer</span><p class="card__num">${s.unread_messages}</p></a>
    </div>
    <h2 class="block-title">Stock bajo</h2>
    ${s.low_stock.length ? listBox(s.low_stock.map((p) => listItem({ tag: "a", attrs: 'href="#productos"', av: icon("tag"), avClass: "li__av--warn",
      title: esc(p.title), side: `<strong>${p.stock}</strong>${p.stock === 1 ? "unidad" : "unidades"}` })), "")
      : '<p class="muted">Todo bien de stock.</p>'}`;
  $$("[data-booking-filter]").forEach((a) => a.addEventListener("click", () => { state.bookingStatus = a.dataset.bookingFilter; }));
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
    ${listBox(list.map((m) => listItem({
      attrs: `data-id="${m.id}" title="${esc(m.email)}"`, unread: !m.read, av: initial(m.name),
      title: esc(m.name), sub: `${m.subject ? `<strong>${esc(m.subject)}</strong> · ` : ""}${esc(m.body)}`,
      meta: `${messageType(m.type)}${m.handled ? '<span class="badge badge--ok">Atendido</span>' : m.read ? "" : '<span class="badge badge--bad">Nuevo</span>'}`,
      side: `<time datetime="${esc(m.created_at)}" title="${fmtDate(m.created_at)}">${shortDate(m.created_at)}</time>${m.read ? "" : '<span class="dot" title="Sin leer"></span>'}`,
    })), "No hay mensajes aquí.")}`;
  $("[data-type] [data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.messageType = b.dataset.value; views.mensajes().catch(fail); } });
  $("[data-status] [data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.messageStatus = b.dataset.value; views.mensajes().catch(fail); } });
  $$(".li[data-id]").forEach((li) => li.addEventListener("click", () => openMessage(li.dataset.id).catch(fail)));
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
    ${listBox(orders.map((o) => listItem({
      attrs: `data-id="${o.id}"`, av: icon(o.shipping.method === "pickup" ? "bag" : "truck"),
      avClass: o.status === "paid" ? "li__av--warn" : o.status === "shipped" ? "li__av--ok" : "",
      title: esc(o.customer.name), sub: `${esc(o.reference)} · ${o.shipping.method === "pickup" ? "Recogida en el estudio" : `Envío a ${esc(o.shipping.city)}`}`,
      meta: badge(o.status), side: `<strong>${money(o.total_cents)}</strong><time title="${fmtDate(o.created_at)}">${shortDate(o.created_at)}</time>`,
    })), "No hay pedidos aquí.")}`;
  $("[data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.orderStatus = b.dataset.value; views.pedidos().catch(fail); } });
  $$(".li[data-id]").forEach((li) => li.addEventListener("click", () => openOrder(li.dataset.id).catch(fail)));
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
    <div class="page-head"><div><p class="eyebrow">Tienda</p><h1>Productos</h1><p>${products.length} piezas. Toca una para editarla. El interruptor «Agotado» oculta el botón de compra aunque quede stock.</p></div>
      <button class="btn" data-new>${icon("plus")}Subir producto</button></div>
    ${products.length > 6 ? `<label class="search">${icon("search")}<input type="search" placeholder="Buscar pieza o categoría" aria-label="Buscar producto" data-search></label>` : ""}
    ${products.length ? `<div class="pgrid">${products.map((p) => `<article class="pcard${p.is_active ? "" : " is-hidden"}" data-id="${p.id}" data-text="${esc(`${p.title} ${p.category}`.toLowerCase())}">
      <button type="button" class="pcard__open" data-open>
        <span class="pcard__img">${p.images[0] ? `<img src="${esc(p.images[0].thumb_url)}" alt="" loading="lazy">` : ""}
          <span class="pcard__flags">${p.is_active ? "" : '<span class="badge">Oculto</span>'}${p.discount_percent ? `<span class="badge badge--bad">-${p.discount_percent} %</span>` : ""}${p.stock <= 0 ? '<span class="badge badge--warn">Sin stock</span>' : ""}</span></span>
        <span class="pcard__body">
          <span class="pcard__price">${p.discount_percent ? `${money(p.final_price_cents)}<s>${money(p.price_cents)}</s>` : money(p.price_cents)}</span>
          <span class="pcard__title">${esc(p.title)}</span>
          <span class="pcard__meta">${esc(p.category)}${p.category ? " · " : ""}${p.stock} en stock${p.held ? ` · ${p.held} en pago` : ""}</span>
        </span>
      </button>
      <div class="pcard__foot">${toggle("sold_out", p.sold_out_manual, "Agotado", "switch--bad")}</div>
    </article>`).join("")}</div>` : '<div class="list"><p class="empty">Aún no hay productos. Sube el primero con «Subir producto».</p></div>'}`;
  $("[data-new]").addEventListener("click", () => productForm(null));
  $("[data-search]")?.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$(".pcard").forEach((el) => { el.hidden = !!q && !el.dataset.text.includes(q); });
  });
  $$(".pcard[data-id]").forEach((card) => {
    $("[data-open]", card).addEventListener("click", () => productForm(products.find((p) => p.id === Number(card.dataset.id))));
    $("input[name=sold_out]", card).addEventListener("change", async (e) => {
      try { await api("PATCH", `/admin/products/${card.dataset.id}/sold-out`, { sold_out: e.target.checked }); toast(e.target.checked ? "Marcado como agotado" : "Disponible de nuevo"); }
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
      <div class="field"><span>Medidas de la pieza</span>
        <div class="grid-3">
          ${field("Alto (cm)", input("piece_height", cmInput(p?.measures?.height_mm), 'inputmode="decimal" placeholder="—"'))}
          ${field("Diámetro (cm)", input("piece_diameter", cmInput(p?.measures?.diameter_mm), 'inputmode="decimal" placeholder="—"'))}
          ${field("Capacidad (ml)", input("piece_capacity_ml", p?.measures?.capacity_ml || "", 'type=number min=0 max=100000 placeholder="—"'))}
          ${field("Ancho (cm)", input("piece_width", cmInput(p?.measures?.width_mm), 'inputmode="decimal" placeholder="—"'))}
          ${field("Fondo (cm)", input("piece_depth", cmInput(p?.measures?.depth_mm), 'inputmode="decimal" placeholder="—"'))}
        </div>
        <small>Se enseñan en la ficha en un bloque propio «Medidas». Rellena solo las que tengan sentido (un cuenco: alto y diámetro; una bandeja: ancho y fondo). Vacío: no se enseña.</small>
      </div>
      <div class="grid-2">
        ${field("Nota sobre las medidas (opcional)", input("dimensions", p?.dimensions, 'maxlength=160 placeholder="Platos Ø 26 cm · cuencos Ø 14 cm"'), "Para sets o piezas con varias partes. Sale debajo de las medidas")}
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
        dimensions: f.dimensions.value,
        piece_height_mm: toMm(f.piece_height.value), piece_width_mm: toMm(f.piece_width.value), piece_depth_mm: toMm(f.piece_depth.value),
        piece_diameter_mm: toMm(f.piece_diameter.value), piece_capacity_ml: Number(f.piece_capacity_ml.value || 0),
        piece_weight_grams: Number(f.piece_weight_grams.value || 0), material: f.material.value, care: f.care.value,
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
  const [classes, weekly] = await Promise.all([api("GET", "/admin/classes"), api("GET", "/admin/weekly")]);
  const group = classes.filter((c) => c.kind === "group");
  const priv = classes.filter((c) => c.kind === "private");
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Taller</p><h1>Clases y horarios</h1><p>Arriba, las clases de cada semana: elige qué días salen en la web y qué clases hay ese día, a qué hora y a qué precio. Debajo, cada clase (nombre, foto, plazas, formas de pago) y sus fechas especiales de un solo día.</p></div>
      <button class="btn" data-new>Nueva clase</button></div>
    ${weeklyEditor(weekly)}
    <h2 style="font-size:1.5rem;margin:2.5rem 0 1rem">Clases en grupo · fechas especiales</h2>
    ${group.map(classCard).join("") || '<p class="muted">No hay clases en grupo.</p>'}
    <h2 style="font-size:1.5rem;margin:2.5rem 0 1rem">Clase privada · modalidades</h2>
    <div class="table-wrap"><table><thead><tr><th>Modalidad</th><th class="num">Precio</th><th>Visible</th><th></th></tr></thead><tbody>
      ${priv.map((c) => `<tr><td>${esc(c.title)}</td><td class="num">${money(c.price_cents)}</td><td>${c.is_active ? '<span class="badge badge--ok">Sí</span>' : '<span class="badge">Oculta</span>'}</td>
        <td class="num"><button class="link-btn" data-edit="${c.id}">Editar</button></td></tr>`).join("") || '<tr><td colspan="4" class="empty">Sin modalidades.</td></tr>'}
    </tbody></table></div>`;
  $("[data-new]").addEventListener("click", () => classForm(null));
  wireWeekly(weekly);
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

/* ---------- Semanales: lunes a domingo ---------- */
function weeklySlotRow(w, classes) {
  const c = classes.find((x) => x.id === w.class_id) || classes[0];
  return `<div class="weekly-slot" data-slot-row data-id="${w.id || ""}">
    ${field("Clase", `<select data-k="class_id" required>${classes.map((x) => `<option value="${x.id}" ${x.id === c?.id ? "selected" : ""}>${esc(x.title)}${x.is_active ? "" : " (oculta)"}</option>`).join("")}</select>`)}
    ${field("Hora", `<input type="time" data-k="time" value="${esc(w.time || "")}" required>`)}
    ${field("Precio (€)", `<input data-k="price" inputmode="decimal" value="${esc(eurosInput(w.price_override_cents ?? null))}" placeholder="${esc(eurosInput(c?.price_cents))}">`)}
    ${field("Se cobra", `<select data-k="price_period"><option value="session">Por clase</option><option value="month" ${w.price_period === "month" ? "selected" : ""}>Por mes</option></select>`)}
    ${field("Plazas", `<input type="number" data-k="capacity" min="1" max="100" value="${esc(w.capacity_override ?? "")}" placeholder="${esc(c?.capacity ?? "")}">`)}
    <button type="button" class="icon-btn" data-slot-del aria-label="Quitar esta clase">×</button>
  </div>`;
}

function weeklyEditor(weekly) {
  const head = `<h2 style="font-size:1.5rem;margin-bottom:.4rem">Semanales</h2>
    <p class="muted" style="margin-bottom:1rem">Se repiten cada semana. La web enseña los días encendidos con sus clases y deja reservar las próximas ${weekly.weeks_ahead} semanas; las fechas nuevas aparecen solas. El precio y las plazas vacíos usan los de la clase.</p>`;
  if (!weekly.classes.length) return `${head}<p class="muted">Primero crea una clase en grupo con «Nueva clase» (nombre, foto, plazas y formas de pago); luego aquí eliges qué días y a qué hora se da.</p>`;
  return `${head}<form class="weekly" data-weekly novalidate>
    ${weekly.days.map((d) => `<section class="weekly-day${d.is_open ? "" : " is-closed"}" data-day="${d.weekday}">
      <header class="weekly-day__head"><h3>${esc(d.name)}</h3>${toggle(`open_${d.weekday}`, d.is_open, "Sale en la web")}</header>
      <div class="weekly-day__slots" data-slots>${d.slots.map((w) => weeklySlotRow(w, weekly.classes)).join("")}</div>
      <button type="button" class="btn btn--ghost btn--small" data-slot-add>+ Añadir clase u hora</button>
    </section>`).join("")}
    <div class="row row--end weekly__save"><button class="btn" type="submit">Guardar semana</button></div>
  </form>`;
}

function wireWeekly(weekly) {
  const form = $("[data-weekly]");
  if (!form) return;
  form.addEventListener("click", (e) => {
    const add = e.target.closest("[data-slot-add]");
    if (add) {
      const box = $("[data-slots]", add.closest("[data-day]"));
      // Una hora más de lo mismo: copia la última fila del día
      const last = $$("[data-slot-row]", box).pop();
      const base = last ? { class_id: Number($("[data-k=class_id]", last).value), price_period: $("[data-k=price_period]", last).value } : {};
      box.insertAdjacentHTML("beforeend", weeklySlotRow(base, weekly.classes));
      $$("[data-k=time]", box).pop().focus();
    }
    e.target.closest("[data-slot-del]")?.closest("[data-slot-row]").remove();
  });
  form.addEventListener("change", (e) => {
    const day = e.target.closest("[data-day]");
    if (e.target.name?.startsWith("open_")) day.classList.toggle("is-closed", !e.target.checked);
    // Al cambiar de clase, los huecos vacíos enseñan el precio y las plazas de la nueva
    if (e.target.dataset.k === "class_id") {
      const c = weekly.classes.find((x) => x.id === Number(e.target.value));
      const row = e.target.closest("[data-slot-row]");
      $("[data-k=price]", row).placeholder = eurosInput(c?.price_cents);
      $("[data-k=capacity]", row).placeholder = c?.capacity ?? "";
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const days = $$("[data-day]", form).map((day, i) => ({
      weekday: Number(day.dataset.day),
      is_open: form.elements[`open_${day.dataset.day}`].checked,
      slots: $$("[data-slot-row]", day).map((row, j) => {
        // Nombres con la posición: así los errores del servidor se pintan en su casilla
        $$("[data-k]", row).forEach((el) => { el.name = `days.${i}.slots.${j}.${el.dataset.k}`; });
        const v = (k) => $(`[data-k=${k}]`, row).value.trim();
        return {
          id: row.dataset.id ? Number(row.dataset.id) : undefined,
          class_id: Number(v("class_id")), time: v("time"), price_period: v("price_period"),
          price_cents: v("price") === "" ? null : toCents(v("price")),
          capacity: v("capacity") === "" ? null : Number(v("capacity")),
        };
      }),
    }));
    submitting(form, async () => {
      const saved = await api("PUT", "/admin/weekly", { days });
      toast(saved.cancelled_with_bookings
        ? `Semana guardada. ${saved.cancelled_with_bookings} ${saved.cancelled_with_bookings === 1 ? "fecha quitada tenía" : "fechas quitadas tenían"} reservas: siguen en Reservas, avisa a esas personas.`
        : "Semana guardada");
      views.clases();
    });
  });
}

function classCard(c) {
  const future = (s) => new Date(s.starts_at.replace(" ", "T")) > new Date();
  const upcoming = c.sessions.filter((s) => !s.slot_id && (future(s) || s.label));
  // Las fechas que crea «Semanales» van plegadas: solo se abren para cancelar una semana (p. ej. un festivo)
  const weeklyDates = c.sessions.filter((s) => s.slot_id && future(s));
  const sessionRow = (s) => `<tr><td>${fmtDate(s.starts_at)}${s.label ? ` · <span class="muted">${esc(s.label)}</span>` : ""} ${s.is_cancelled ? '<span class="badge badge--bad">Cancelado</span>' : ""}</td>
        <td class="num">${s.seats_left} / ${s.capacity}</td><td class="num">${money(s.price_cents)}</td>
        <td class="num"><button class="link-btn" data-class="${c.id}" data-session="${s.id}">Editar</button></td></tr>`;
  return `<article class="class-card">
    <div class="class-card__head">
      ${c.image ? `<img src="${esc(c.image.thumb_url)}" alt="">` : '<div class="class-card__ph"></div>'}
      <div><h3>${esc(c.title)} ${c.is_active ? "" : '<span class="badge">Oculta</span>'}</h3>
        <p class="muted">${money(c.price_cents)} · ${c.capacity} plazas · ${Math.round(c.duration_minutes / 6) / 10} h</p></div>
      <button class="btn btn--ghost btn--small" data-edit="${c.id}">Editar clase</button>
    </div>
    ${upcoming.length ? `<table><thead><tr><th>Horario</th><th class="num">Plazas libres</th><th class="num">Precio</th><th></th></tr></thead><tbody>
      ${upcoming.map(sessionRow).join("")}
    </tbody></table>` : ""}
    ${weeklyDates.length ? `<details class="weekly-dates"><summary>Próximas fechas de Semanales (${weeklyDates.length})</summary>
      <table><thead><tr><th>Fecha</th><th class="num">Plazas libres</th><th class="num">Precio</th><th></th></tr></thead><tbody>${weeklyDates.map(sessionRow).join("")}</tbody></table></details>` : ""}
    <div class="add-session"><form data-session-form="${c.id}">
      ${field("Nueva fecha especial", '<input type="datetime-local" name="starts_at" required>', "Para lo de cada semana, usa Semanales")}
      ${field("Repetir cada semana", `<select name="repeat">
        <option value="1" selected>No, solo ese día</option>
        <option value="4">Durante 1 mes</option>
        <option value="8">Durante 2 meses</option>
        <option value="13">Durante 3 meses</option>
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
      ${c?.kind === "private" ? "" : `<fieldset class="stack" data-show-toggle><legend>Cómo se ve en la web</legend>
        ${toggle("price_monthly", c ? c.price_period === "month" : false, "El precio es mensual (la web pone «por mes»)")}
        ${toggle("show_date", c ? c.show_date : true, "Enseñar el día y la hora")}
        <p class="muted" style="font-size:.82rem">Con «por mes», si la clase tiene cuota de suscripción la web enseña la cuota; si no, el precio de arriba. Sin día y hora, la fila solo dice la duración y las plazas, y al reservar se coge la próxima sesión con sitio (el día va igualmente en el email de confirmación).</p></fieldset>`}
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
      if (f.show_date) {
        data.show_date = f.show_date.checked;
        data.price_period = f.price_monthly.checked ? "month" : "session";
      }
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
    ${listBox(list.map((b) => listItem({
      attrs: `data-id="${b.id}"`, av: initial(b.customer.name), avClass: b.status === "requested" || inPersonUnpaid(b) ? "li__av--warn" : "",
      title: `${esc(b.customer.name)} · ${esc(b.class_title)}`,
      sub: `${b.starts_at ? fmtDate(b.starts_at) : `Prefiere ${fmtDate(b.preferred_date, false)} · ${esc(b.preferred_slot)}`} · ${esc(b.reference)}`,
      meta: `${badge(b.status)}${payBadge(b)}`,
      side: `<strong>${money(b.total_cents)}</strong>${b.seats} ${b.seats === 1 ? "plaza" : "plazas"}`,
    })), "No hay reservas aquí.")}`;
  $("[data-filters]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.bookingStatus = b.dataset.value; views.reservas().catch(fail); } });
  $$(".li[data-id]").forEach((li) => li.addEventListener("click", () => bookingForm(list.find((b) => b.id === Number(li.dataset.id)))));
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
      <button class="btn" data-add>${icon("plus")}Añadir reserva</button></div>
    ${alerts.length ? `<div class="notice"><strong>${alerts.length} ${alerts.length === 1 ? "cobro pendiente" : "cobros pendientes"}</strong>
      <ul class="alert-list">${alerts.map((b) => `<li><button class="link-btn" data-alert="${b.id}">${esc(b.customer.name || "Sin nombre")}</button> · ${esc(b.class_title)} · ${BILLING[b.billing_type]} · ${money(b.total_cents)}
        <button class="link-btn" data-pay="${b.id}">Marcar cobrada</button></li>`).join("")}</ul></div>` : ""}
    <div class="cal-box"><div class="cal__head">
      <button class="btn btn--ghost" data-month="-1" aria-label="Mes anterior">←</button>
      <h2 class="cal__title">${first.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</h2>
      <button class="btn btn--ghost" data-month="1" aria-label="Mes siguiente">→</button>
      <button class="btn btn--ghost" data-today>Hoy</button>
    </div>
    <div class="cal">${["L", "M", "X", "J", "V", "S", "D"].map((w) => `<span class="cal__wd">${w}</span>`).join("")}${cells}</div></div>
    <h2 class="block-title" style="margin-top:1.6rem">${new Date(state.calDay + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase())}<small>${dayList.length ? `${dayList.length} ${dayList.length === 1 ? "reserva" : "reservas"}` : ""}</small></h2>
    ${listBox(dayList.map((e, i) => listItem({
      attrs: `data-entry="${i}"`, av: esc(e.time), avClass: "li__av--time",
      title: esc(e.booking.customer.name), sub: `${esc(e.booking.class_title)}${e.booking.seats > 1 ? ` · ${e.booking.seats} plazas` : ""}`,
      meta: `<span class="badge">${BILLING[e.booking.billing_type]}${e.recurring ? " · cada semana" : ""}</span>${entryPay(e)}`,
      side: `<strong>${money(e.booking.total_cents)}</strong>`,
    })), "No hay reservas este día.")}`;
  const again = () => views.calendario().catch(fail);
  $$("[data-month]").forEach((b) => b.addEventListener("click", () => { state.calMonth = new Date(first.getFullYear(), first.getMonth() + Number(b.dataset.month), 1); again(); }));
  $("[data-today]").addEventListener("click", () => { state.calMonth = new Date(today.getFullYear(), today.getMonth(), 1); state.calDay = ymd(today); again(); });
  $$(".cal [data-day]").forEach((b) => b.addEventListener("click", () => { state.calDay = b.dataset.day; again(); }));
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
      ${listBox(list.map((c) => listItem({
        attrs: `data-id="${c.id}"`, av: initial(c.name || c.email),
        title: `${esc(c.name || c.email)}${c.has_profile ? "" : ' <span class="muted">· sin perfil</span>'}`,
        sub: [c.email, c.phone, c.city].filter(Boolean).map(esc).join(" · "),
        meta: `${c.marketing_opt_in ? '<span class="badge badge--ok">Acepta comunicaciones</span>' : ""}<span class="badge">${c.orders} ${c.orders === 1 ? "pedido" : "pedidos"}</span><span class="badge">${c.bookings} ${c.bookings === 1 ? "reserva" : "reservas"}</span>`,
        side: `desde<br>${fmtDate(c.created_at, false)}`,
      })), isMk ? "Nadie ha aceptado todavía recibir comunicaciones." : "Todavía no hay perfiles guardados.")}`;
    $$(".li[data-id]").forEach((li) => li.addEventListener("click", () => openCustomer(li.dataset.id).catch(fail)));
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
/* ---------- Ajustes: la web, tienda y envíos, pagos, correo y legal (en pestañas) ---------- */
views.ajustes = async () => {
  const sub = location.hash.split("/")[1];
  if (sub) state.settingsTab = sub;
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
  const provider = v.MAIL_PROVIDER || s.mail_provider || "hosting";
  const choice = (value, title, text) => `<label class="choice"><input type="radio" name="MAIL_PROVIDER" value="${value}" ${provider === value ? "checked" : ""}><span><strong>${title}</strong><small>${text}</small></span></label>`;
  const stripeOk = s.secrets.STRIPE_SECRET_KEY.set && s.secrets.STRIPE_WEBHOOK_SECRET.set;
  const mailOk = !!v.MAIL_FROM && (provider === "hosting" || s.secrets.SMTP_PASS.set);
  const legalOk = ["LEGAL_OWNER", "LEGAL_TAX_ID", "LEGAL_ADDRESS", "LEGAL_EMAIL"].every((k) => v[k]);
  const mailBadge = mailOk ? '<span class="badge badge--ok">Configurado</span>' : '<span class="badge badge--bad">Sin configurar</span>';
  const tabs = [
    ["web", "La web", ""],
    ["tienda", "Tienda y envíos", ""],
    ["pagos", "Pagos", stripeOk ? "" : "falta"],
    ["correo", "Correo", mailOk ? "" : "falta"],
    ["legal", "Legal", legalOk ? "" : "falta"],
  ];
  const tab = tabs.some(([k]) => k === state.settingsTab) ? state.settingsTab : "web";
  main.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Configuración</p><h1>Ajustes</h1>
      <p>Elige una sección. «Guardar ajustes» guarda todas a la vez.</p></div></div>
    <div class="settings__tabs" role="tablist">${tabs.map(([k, t, warn]) =>
      `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${t}${warn ? ' <span class="dot" title="Falta configurar"></span>' : ""}</button>`).join("")}</div>
    <form class="stack settings" data-form style="max-width:640px">
      <div class="stack settings__panel" data-panel="web"${tab === "web" ? "" : " hidden"}>
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

      </div>

      <div class="stack settings__panel" data-panel="tienda"${tab === "tienda" ? "" : " hidden"}>
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

      </div>

      <div class="stack settings__panel" data-panel="pagos"${tab === "pagos" ? "" : " hidden"}>
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

      </div>

      <div class="stack settings__panel" data-panel="correo"${tab === "correo" ? "" : " hidden"}>
      <section class="stack">
        <h2 class="settings__title">Cómo salen los emails ${mailBadge}</h2>
        <p class="muted">La web manda emails a tus clientes (pedido recibido, reserva confirmada…) y a ti (avisos de pedidos, reservas y mensajes). Elige desde qué cuenta salen.</p>
        <div class="choices" role="radiogroup" aria-label="Cómo enviar los emails">
          ${choice("gmail", "Gmail o Google Workspace", "Tu cuenta de Google. Necesita una contraseña de aplicación (te explicamos cómo abajo).")}
          ${choice("smtp", "Buzón de tu dominio", "Un correo tipo hola@tudominio.com creado en Hostinger (hPanel → Emails) u otro proveedor.")}
          ${choice("hosting", "Envío básico del hosting", "Sin contraseña. Solo vale con un remitente de tu dominio y es más fácil que acabe en spam.")}
        </div>
        <div class="grid-2">
          ${field(`<span data-from-label>Email remitente</span>`, input("MAIL_FROM", v.MAIL_FROM, 'type="email" autocomplete="off" placeholder="hola@tudominio.com"'), '<span data-from-hint></span>')}
          ${field("Nombre que ve el cliente", input("MAIL_FROM_NAME", v.MAIL_FROM_NAME, 'placeholder="Charria Ceramics"'), "Sale como remitente en la bandeja de entrada")}
        </div>
        <div class="stack" data-mail-only="smtp">
          <div class="grid-2">
            ${field("Servidor de salida (SMTP)", input("SMTP_HOST", v.SMTP_HOST, 'placeholder="smtp.hostinger.com" spellcheck="false" autocapitalize="off"'), "En Hostinger: smtp.hostinger.com")}
            ${field("Puerto", `<select name="SMTP_PORT">${[["465", "465 · SSL (recomendado)"], ["587", "587 · STARTTLS"]].map(([p, t]) => `<option value="${p}" ${String(v.SMTP_PORT || "465") === p ? "selected" : ""}>${t}</option>`).join("")}</select>`)}
          </div>
          ${field("Usuario", input("SMTP_USER", v.SMTP_USER, 'autocomplete="off" spellcheck="false" autocapitalize="off"'), "Casi siempre es el mismo email remitente. Vacío = el remitente.")}
        </div>
        <div data-mail-only="gmail smtp">${secret("SMTP_PASS", '<span data-pass-label>Contraseña</span>', "Pega la contraseña")}</div>
        <details class="howto" data-mail-only="gmail" ${s.secrets.SMTP_PASS.set ? "" : "open"}>
          <summary>Cómo conseguir la contraseña de aplicación de Google (5 minutos)</summary>
          <ol>
            <li>Entra en <a href="https://myaccount.google.com/security" target="_blank" rel="noopener">tu cuenta de Google → Seguridad</a> con el Gmail que vas a usar como remitente.</li>
            <li>Activa la <strong>Verificación en dos pasos</strong> si aún no la tienes (Google te pide el móvil). Sin ella no aparece la opción del paso siguiente.</li>
            <li>Abre <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Contraseñas de aplicaciones</a>. Si no la encuentras, escribe «contraseñas de aplicaciones» en el buscador de arriba de tu cuenta de Google.</li>
            <li>Escribe un nombre que reconozcas, por ejemplo <em>Web Charria</em>, y pulsa <strong>Crear</strong>.</li>
            <li>Google te enseña una contraseña de <strong>16 letras</strong> en un recuadro. Cópiala y pégala arriba, en «Contraseña de aplicación» (da igual si lleva espacios). Solo se ve una vez: si la pierdes, bórrala allí y crea otra.</li>
            <li>Pulsa <strong>Guardar ajustes</strong> y después <strong>Enviar correo de prueba</strong>. Te llegará un email al buzón de avisos.</li>
          </ol>
          <p class="muted">No uses la contraseña normal de tu Gmail: Google la rechaza. Si un día cambias la contraseña de tu cuenta de Google, la de aplicación deja de valer y tendrás que crear otra. Con una cuenta de Google Workspace, si no ves la opción, el administrador tiene que permitir la verificación en dos pasos.</p>
        </details>
      </section>

      <section class="stack">
        <h2 class="settings__title">Dónde te llegan los avisos</h2>
        ${field("Email donde recibes los avisos", input("MAIL_ADMIN", v.MAIL_ADMIN, 'type="email" placeholder="tucorreo@gmail.com"'), "Pedidos pagados, reservas, mensajes del formulario de contacto y cobros pendientes. Puede ser el mismo Gmail. Cuando un cliente responda a un email de la web, su respuesta también llega aquí.")}
        <div class="row"><button type="button" class="btn btn--ghost" data-test="mail">Enviar correo de prueba</button><small class="muted">Guarda lo que hayas escrito y manda un email al buzón de avisos.</small></div>
      </section>
      </div>

      <div class="stack settings__panel" data-panel="legal"${tab === "legal" ? "" : " hidden"}>
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

      </div>

      <div class="row settings__save"><button class="btn" type="submit">Guardar ajustes</button></div>
    </form>`;

  const form = $("[data-form]");
  const showTab = (k) => {
    state.settingsTab = k;
    $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === k)));
    $$("[data-panel]", form).forEach((p) => { p.hidden = p.dataset.panel !== k; });
    history.replaceState(null, "", `#ajustes/${k}`);
  };
  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  // Si un campo con error está en otra pestaña, se abre esa pestaña
  const revealError = () => {
    const panel = $(".has-error", form)?.closest("[data-panel]");
    if (panel && panel.hidden) showTab(panel.dataset.panel);
  };
  const mailCopy = {
    gmail: ["Tu Gmail (remitente)", "tucuenta@gmail.com", "La misma cuenta de Google con la que creas la contraseña de aplicación.", "Contraseña de aplicación de Google"],
    smtp: ["Email remitente", "hola@tudominio.com", "El buzón desde el que salen los emails.", "Contraseña del buzón"],
    hosting: ["Email remitente", "hola@tudominio.com", "Tiene que ser un buzón de tu dominio creado en hPanel → Emails.", "Contraseña"],
  };
  const syncMail = () => {
    const p = form.elements.MAIL_PROVIDER.value || "hosting";
    $$("[data-mail-only]", form).forEach((el) => { el.hidden = !el.dataset.mailOnly.split(" ").includes(p); });
    const [label, ph, hint, pass] = mailCopy[p];
    $("[data-from-label]", form).textContent = label;
    form.elements.MAIL_FROM.placeholder = ph;
    $("[data-from-hint]", form).textContent = hint;
    $("[data-pass-label]", form).textContent = pass;
  };
  $$("input[name=MAIL_PROVIDER]", form).forEach((r) => r.addEventListener("change", syncMail));
  syncMail();
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
  const save = async (clear = []) => {
    await submitting(form, async () => {
      await api("PUT", "/admin/settings", { values: collect(), clear });
      toast("Ajustes guardados");
      await views.ajustes();
    });
    revealError();
  };
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
      await views.ajustes();
    } catch (e) { if (e.fields) { showFieldErrors(form, e.fields); revealError(); } fail(e); } finally { b.disabled = false; }
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
const currentView = () => { const name = location.hash.slice(1).split("/")[0]; return views[name] ? name : "resumen"; };
// Marca la sección actual en el menú lateral, la barra de abajo y la hoja «Más»
function markNav() {
  const name = currentView();
  $$("[data-nav] a").forEach((a) => {
    if (a.getAttribute("href") === `#${name}`) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  // En la barra de abajo, «Más» se ilumina cuando la sección no tiene botón propio
  const more = $("[data-more-tab]");
  if ($(`.tabbar a[href="#${name}"]`)) more.removeAttribute("aria-current"); else more.setAttribute("aria-current", "page");
}

// Acción pendiente del botón «+»: abre la sección y pulsa su botón de crear
let quickAction = null;
async function route() {
  const view = views[currentView()];
  markNav();
  closeSheet();
  closeDrawer();
  main.innerHTML = '<p class="muted">Cargando…</p>';
  window.scrollTo(0, 0);
  try { await view(); } catch (e) { if (e.status !== 401) { main.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; } }
  if (quickAction) { const sel = quickAction; quickAction = null; $(sel, main)?.click(); }
}

function showLogin() {
  $("[data-view-app]").hidden = true;
  $("[data-view-login]").hidden = false;
  closeDrawer();
  $("[data-login-form] input[name=email]").focus();
}

async function showApp() {
  try {
    me = await api("GET", "/auth/me");
    $$("[data-user]").forEach((el) => { el.textContent = me.name ? `${me.name} · ${me.email}` : me.email; });
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

/* ---------- Hoja de abajo: «Añadir» (botón +) y «Más» ---------- */
const sheet = $("[data-sheet]");
function openSheet(title, tpl) {
  $("[data-sheet-title]").textContent = title;
  const body = $("[data-sheet-body]");
  body.replaceChildren($(tpl).content.cloneNode(true));
  // Los contadores y el usuario se copian de la barra lateral
  $$("[data-unread]", body).forEach((el) => { const src = $(".side [data-unread]"); el.textContent = src.textContent; el.hidden = src.hidden; });
  $$("[data-overdue]", body).forEach((el) => { const src = $(".side [data-overdue]"); el.textContent = src.textContent; el.hidden = src.hidden; });
  $$("[data-user]", body).forEach((el) => { el.textContent = $(".side [data-user]").textContent; });
  sheet.hidden = false;
  markNav();
  $("button, a", body)?.focus({ preventScroll: true });
}
function closeSheet() { sheet.hidden = true; }
$$("[data-quick-open]").forEach((b) => b.addEventListener("click", () => openSheet("¿Qué quieres añadir?", "[data-quick-tpl]")));
$$("[data-more-open]").forEach((b) => b.addEventListener("click", () => openSheet("Todas las secciones", "[data-more-tpl]")));
sheet.addEventListener("click", (e) => {
  if (e.target.closest("[data-sheet-close]")) closeSheet();
  // Tocar la sección en la que ya estás no cambia el hash: cierra la hoja igualmente
  else if (e.target.closest("a[href^='#']")) closeSheet();
});
// Botones «Subir producto», «Añadir reserva»…: van a la sección y abren su formulario
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-quick]");
  if (!b) return;
  const [hash, sel] = b.dataset.quick.split("|");
  closeSheet();
  quickAction = sel;
  if (location.hash === hash) route(); else location.hash = hash;
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });

/* ---------- Ayuda plegada y tablas como tarjetas en el móvil ---------- */
// La explicación larga de cada sección va dentro de «Cómo funciona» para que la pantalla quede limpia
function foldHelp(root) {
  $$(".page-head > div > p:not(.eyebrow)", root).forEach((p) => {
    if (p.textContent.trim().length < 90) return;
    const d = document.createElement("details");
    d.className = "help";
    d.innerHTML = "<summary>Cómo funciona</summary>";
    p.replaceWith(d);
    d.append(p);
  });
}

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
[main, $("[data-drawer-body]")].forEach((el) => new MutationObserver(() => { labelTables(el); foldHelp(el); }).observe(el, { childList: true, subtree: true }));

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
