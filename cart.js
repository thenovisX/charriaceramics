/* ==========================================================
   Charria Ceramics · Cesta lateral (off-canvas) y pago
   - La cesta se guarda en el navegador solo como [{id, qty}] más título,
     foto y precio para pintarla rápido.
   - Cada vez que se abre, los precios, descuentos y disponibilidad se piden
     al servidor (/api/cart/quote); los totales que se ven son los del servidor.
   - «Tramitar pedido» lleva a checkout.html (checkout.js): datos, envío y pago.
   ========================================================== */
(function () {
  const API = "api";
  const KEY = "charria-cart-v2";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (cents) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 });
  const button = (btn, text, icon) => (window.setButton ? window.setButton(btn, text, icon) : (btn.textContent = text));
  async function post(path, body) {
    const res = await fetch(`${API}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      const err = new Error(json?.error?.message || "No se pudo conectar con la tienda. Inténtalo de nuevo.");
      err.status = res.status;
      err.fields = json?.error?.fields || {};
      throw err;
    }
    return json.data;
  }

  /* ---------- Almacenamiento ---------- */
  const read = () => {
    try {
      const items = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(items) ? items.map((i) => ({ ...i, qty: Number(i?.qty) || 0 })).filter((i) => i.id && i.qty > 0) : [];
    } catch { return []; }
  };
  const write = (items) => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); localStorage.removeItem("charria-cart"); } catch { /* sin almacenamiento */ }
    updateCount();
  };
  const count = () => read().reduce((n, i) => n + i.qty, 0);
  // El número se vuelve a leer de localStorage cada vez que la página se enseña: al volver
  // atrás el navegador puede sacar la página de su caché (bfcache) con el número de antes,
  // y la cesta puede haber cambiado en otra pestaña. Nunca se deja el hueco vacío: «Cesta (0)».
  const updateCount = () => {
    const n = String(count() || 0);
    $$("[data-cart-count]").forEach((el) => { if (el.textContent !== n) el.textContent = n; });
  };
  window.addEventListener("pageshow", updateCount);
  window.addEventListener("storage", (e) => { if (e.key === null || e.key === KEY) updateCount(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateCount(); });

  /* ---------- Marcado del panel ---------- */
  document.body.insertAdjacentHTML("beforeend", `
    <div class="cart" data-cart aria-hidden="true">
      <div class="cart__backdrop" data-cart-close></div>
      <aside class="cart__panel" role="dialog" aria-modal="true" aria-labelledby="cart-title" tabindex="-1">
        <header class="cart__head">
          <div><p class="eyebrow" data-cart-step>Tu selección</p><h2 class="cart__title" id="cart-title">Cesta</h2></div>
          <button class="cart__close" type="button" data-cart-close aria-label="Cerrar la cesta">×</button>
        </header>
        <div class="cart__body" data-cart-body></div>
        <footer class="cart__foot" data-cart-foot></footer>
      </aside>
    </div>`);
  const root = $("[data-cart]");
  const panel = $(".cart__panel", root);
  const body = $("[data-cart-body]", root);
  const foot = $("[data-cart-foot]", root);
  const step = $("[data-cart-step]", root);
  let lastFocus = null;
  let quote = null;     // última respuesta del servidor
  let offline = false;  // sin API (p. ej. Live Server): se muestran precios orientativos

  const isOpen = () => root.classList.contains("is-open");
  function open() {
    if (!isOpen()) {
      lastFocus = document.activeElement;
      root.classList.add("is-open");
      root.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("cart-open");
      document.dispatchEvent(new CustomEvent("cart:open"));
      setTimeout(() => panel.focus(), 50);
    }
    renderItems();
  }
  function close() {
    if (!isOpen()) return;
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("cart-open");
    document.dispatchEvent(new CustomEvent("cart:close"));
    lastFocus?.focus?.();
  }
  $$("[data-cart-close]", root).forEach((el) => el.addEventListener("click", close));
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) close(); });
  $$(".cart-btn").forEach((b) => b.addEventListener("click", () => open()));

  /* ---------- Paso 1: productos ---------- */
  async function refreshQuote() {
    const items = read();
    if (!items.length) { quote = null; return; }
    try {
      quote = await post("cart/quote", { items: items.map((i) => ({ product_id: i.id, quantity: i.qty })) });
      offline = false;
      // Ajusta la cesta a lo que de verdad hay disponible
      let changed = false;
      const next = items.map((i) => {
        const err = quote.errors.find((e) => e.product_id === i.id);
        const line = quote.lines.find((l) => l.product_id === i.id);
        if (line) Object.assign(i, { title: line.title, price: line.unit_final_cents, img: line.image?.thumb_url || i.img });
        if (err?.code === "insufficient_stock") { changed = true; return { ...i, qty: err.available }; }
        return i;
      });
      if (changed) {
        write(next.filter((i) => i.qty > 0));
        quote = await post("cart/quote", { items: read().map((i) => ({ product_id: i.id, quantity: i.qty })) });
        quote.adjusted = true;
      } else {
        write(next);
      }
    } catch (e) {
      offline = true;
      quote = null;
    }
  }

  function lineHTML(i, line, error) {
    const unit = line ? line.unit_final_cents : i.price;
    return `<li class="cart-line${error ? " is-unavailable" : ""}" data-id="${i.id}">
      <div class="cart-line__img">${i.img ? `<img src="${esc(i.img)}" alt="" loading="lazy">` : ""}</div>
      <div class="cart-line__info">
        <p class="cart-line__title">${esc(line?.title || i.title)}</p>
        <p class="cart-line__price">${line?.discount_percent ? `<s>${money(line.unit_price_cents)}</s> ` : ""}${money(unit)}${line?.discount_percent ? ` <span class="cart-line__off">−${line.discount_percent} %</span>` : ""}</p>
        ${error ? `<p class="cart-line__error">${esc(error.message)}</p>` : `
        <div class="qty" role="group" aria-label="Cantidad">
          <button type="button" data-qty="-1" aria-label="Quitar una">−</button>
          <span aria-live="polite">${i.qty}</span>
          <button type="button" data-qty="1" aria-label="Añadir una" ${line && i.qty >= line.available ? "disabled" : ""}>+</button>
        </div>`}
      </div>
      <button class="cart-line__remove" type="button" data-remove aria-label="Quitar ${esc(i.title)} de la cesta">Quitar</button>
    </li>`;
  }

  async function renderItems() {
    step.textContent = "Tu selección";
    const items = read();
    if (!items.length) {
      body.innerHTML = `<div class="cart__empty"><p>Tu cesta está vacía.</p><p class="cart__muted">Cada pieza es única: cuando te enamores de una, añádela aquí.</p></div>`;
      foot.innerHTML = `<a class="btn-primary" href="productos.html">Ver la tienda</a>`;
      $$(".btn-primary", foot).forEach((b) => button(b, b.textContent.trim()));
      return;
    }
    if (!quote) body.innerHTML = `<p class="cart__muted">Actualizando precios…</p>`;
    await refreshQuote();
    const current = read();
    body.innerHTML = `
      ${quote?.adjusted ? '<p class="cart__notice">Hemos ajustado las cantidades al stock disponible.</p>' : ""}
      ${offline ? '<p class="cart__notice">Precios orientativos: la tienda online se activa cuando la web está publicada.</p>' : ""}
      <ul class="cart__lines">${current.map((i) => lineHTML(i,
        quote?.lines.find((l) => l.product_id === i.id),
        quote?.errors.find((e) => e.product_id === i.id))).join("")}</ul>`;
    const subtotal = quote ? quote.items_total_cents : current.reduce((n, i) => n + i.price * i.qty, 0);
    const hasErrors = quote?.errors.length > 0;
    foot.innerHTML = `
      <div class="cart__row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
      ${quote?.discount_cents ? `<div class="cart__row cart__muted"><span>Ahorro aplicado</span><span>−${money(quote.discount_cents)}</span></div>` : ""}
      <p class="cart__muted">IVA incluido. El envío se calcula en el siguiente paso.</p>
      ${hasErrors ? '<p class="cart-line__error">Quita las piezas que ya no están disponibles para continuar.</p>' : ""}
      <button class="btn-primary cart__cta" type="button" data-next ${offline || hasErrors ? "disabled" : ""}>Tramitar pedido</button>`;
    $$(".btn-primary", foot).forEach((b) => button(b, b.textContent.trim()));
    $("[data-next]", foot).addEventListener("click", () => { window.location.href = "checkout.html"; });
  }

  body.addEventListener("click", (e) => {
    const li = e.target.closest(".cart-line");
    if (!li) return;
    const id = Number(li.dataset.id) || li.dataset.id;
    let items = read();
    if (e.target.closest("[data-remove]")) {
      items = items.filter((i) => i.id !== id);
    } else if (e.target.closest("[data-qty]")) {
      const d = Number(e.target.closest("[data-qty]").dataset.qty);
      items = items.map((i) => (i.id === id ? { ...i, qty: Math.max(0, Math.min(20, i.qty + d)) } : i)).filter((i) => i.qty > 0);
    } else return;
    write(items);
    renderItems();
  });

  /* ---------- API pública para script.js ---------- */
  window.Cart = {
    add(product, qty = 1) {
      const items = read();
      const found = items.find((i) => i.id === product.id);
      if (found) found.qty = Math.min(20, found.qty + qty);
      else items.push({ id: product.id, qty, title: product.title, price: product.price_cents, img: product.img });
      write(items);
      quote = null;
      open();
    },
    open,
    close,
    clear() { write([]); quote = null; },
    count,
  };

  updateCount();
  // Al volver de Stripe sin pagar, se reabre la cesta para reintentar
  if (new URLSearchParams(location.search).get("pago") === "cancelado" && read().length && !location.hash) setTimeout(() => open(), 600);
})();
