/* ==========================================================
   Charria Ceramics · Cesta lateral (off-canvas) y pago
   - La cesta se guarda en el navegador solo como [{id, qty}] más título,
     foto y precio para pintarla rápido.
   - Cada vez que se abre, los precios, descuentos y disponibilidad se piden
     al servidor (/api/cart/quote); los totales que se ven son los del servidor.
   - Al pagar solo se envían IDs y cantidades: el servidor calcula todo y
     redirige a la página segura de Stripe.
   ========================================================== */
(function () {
  const API = "api";
  const KEY = "charria-cart-v2";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (cents) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 });
  const button = (btn, text, icon) => (window.setButton ? window.setButton(btn, text, icon) : (btn.textContent = text));
  // Casillas de consentimiento (RGPD): separadas y sin marcar. Las reservas tienen las mismas en index.html.
  const CONSENT_CHECKS = () => `
    <label class="check"><input type="checkbox" name="terms"><span>He leído y acepto las <a href="condiciones.html" target="_blank">condiciones de venta</a> y la <a href="privacidad.html" target="_blank">política de privacidad</a>.</span></label>
    <label class="check"><input type="checkbox" name="marketing"><span>Quiero recibir por email novedades, piezas nuevas, talleres y ofertas de Charria Ceramics.<small>Opcional. Puedes darte de baja cuando quieras.</small></span></label>
    <label class="check"><input type="checkbox" name="profile"><span>Guardar mis datos y crear mi perfil de cliente para próximas compras.<small>Opcional. Si no lo marcas, solo guardamos lo necesario para este pedido.</small></span></label>`;

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
      return Array.isArray(items) ? items.filter((i) => i && i.id && i.qty > 0) : [];
    } catch { return []; }
  };
  const write = (items) => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); localStorage.removeItem("charria-cart"); } catch { /* sin almacenamiento */ }
    updateCount();
  };
  const count = () => read().reduce((n, i) => n + i.qty, 0);
  const updateCount = () => $$("[data-cart-count]").forEach((el) => { el.textContent = count(); });

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
  let ship = { options: [], selected: "", loading: false, zip: "", country: "ES" };

  const isOpen = () => root.classList.contains("is-open");
  function open(view = "items") {
    if (!isOpen()) {
      lastFocus = document.activeElement;
      root.classList.add("is-open");
      root.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("cart-open");
      document.dispatchEvent(new CustomEvent("cart:open"));
      setTimeout(() => panel.focus(), 50);
    }
    view === "checkout" ? renderCheckout() : renderItems();
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
    $("[data-next]", foot).addEventListener("click", () => renderCheckout());
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

  /* ---------- Paso 2: datos, entrega y pago ---------- */
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem("charria-checkout") || "{}"); } catch { /* */ }

  function renderCheckout() {
    if (!quote || quote.errors.length) return renderItems();
    step.textContent = "Entrega y pago";
    body.innerHTML = `
      <button class="cart__back" type="button" data-back>← Volver a la cesta</button>
      <form class="form cart__form" data-checkout novalidate>
        <fieldset><legend class="eyebrow">Tus datos</legend>
          <label class="form__field"><span>Nombre y apellidos</span><input name="name" autocomplete="name" required value="${esc(saved.name)}"></label>
          <label class="form__field"><span>Email</span><input type="email" name="email" autocomplete="email" required value="${esc(saved.email)}"></label>
          <label class="form__field"><span>Teléfono</span><input type="tel" name="phone" autocomplete="tel" value="${esc(saved.phone)}"><small>Para el transportista</small></label>
        </fieldset>
        <fieldset><legend class="eyebrow">Entrega</legend>
          <div class="ship-options" data-ship-options></div>
          <div class="cart__address" data-address hidden>
            <label class="form__field"><span>Dirección</span><input name="street" autocomplete="street-address" value="${esc(saved.street)}"></label>
            <div class="cart__two">
              <label class="form__field"><span>Código postal</span><input name="postal_code" autocomplete="postal-code" inputmode="numeric" value="${esc(saved.postal_code)}"></label>
              <label class="form__field"><span>Ciudad</span><input name="city" autocomplete="address-level2" value="${esc(saved.city)}"></label>
            </div>
            <label class="form__field"><span>País</span><select name="country" autocomplete="country">
              ${[["ES", "España"], ["PT", "Portugal"], ["FR", "Francia"], ["IT", "Italia"], ["DE", "Alemania"], ["BE", "Bélgica"], ["NL", "Países Bajos"], ["AD", "Andorra"]]
                .map(([v, t]) => `<option value="${v}" ${(saved.country || "ES") === v ? "selected" : ""}>${t}</option>`).join("")}
            </select></label>
          </div>
        </fieldset>
        <fieldset class="checks"><legend class="eyebrow">Antes de pagar</legend>
          ${CONSENT_CHECKS()}
          <p class="privacy-note">Responsable: Charria Ceramics. Usamos tus datos para gestionar el pedido y su factura; los reciben Stripe (pago) y, si eliges envío, Packlink y el transportista. Puedes consultarlos, borrarlos y ejercer tus demás derechos en <a href="mis-datos.html" target="_blank">Mis datos</a>. Más información en la <a href="privacidad.html" target="_blank">política de privacidad</a>.</p>
        </fieldset>
        <p class="cart-line__error" data-checkout-error hidden></p>
      </form>`;
    $("[data-back]", body).addEventListener("click", renderItems);
    const form = $("[data-checkout]", body);
    if (!ship.selected) ship.selected = saved.option || "";
    form.addEventListener("input", (e) => {
      if (e.target.type === "checkbox") { e.target.closest(".check")?.classList.remove("is-invalid"); return; } // las casillas no se recuerdan
      saved[e.target.name] = e.target.value;
      try { sessionStorage.setItem("charria-checkout", JSON.stringify(saved)); } catch { /* */ }
    });
    form.postal_code.addEventListener("change", () => loadShipping(form));
    form.country.addEventListener("change", () => loadShipping(form));
    $("[data-ship-options]", form).addEventListener("change", (e) => {
      if (e.target.name !== "ship") return;
      ship.selected = e.target.value;
      saved.option = ship.selected;
      renderShipping(form);
      if (ship.selected === "__delivery" && form.postal_code.value.trim()) loadShipping(form);
    });
    renderShipping(form);
    loadShipping(form);
  }

  async function loadShipping(form) {
    const zip = form.postal_code.value.trim();
    const country = form.country.value;
    if (ship.zip === zip && ship.country === country && ship.options.length) return renderShipping(form);
    ship = { ...ship, loading: true, zip, country };
    renderShipping(form);
    try {
      const res = await post("shipping/quote", {
        items: read().map((i) => ({ product_id: i.id, quantity: i.qty })),
        address: { postal_code: zip, country },
      });
      ship.options = res.options;
    } catch (e) {
      ship.options = [];
      showError(form, e.message);
    }
    ship.loading = false;
    // Si se había elegido "envío" sin código postal, se pasa a la opción más barata
    const delivery = ship.options.filter((o) => o.method === "delivery");
    if (ship.selected !== "pickup" && !ship.options.some((o) => o.id === ship.selected) && delivery.length) {
      ship.selected = delivery[0].id;
    }
    renderShipping(form);
  }

  function renderShipping(form) {
    const box = $("[data-ship-options]", form);
    const pickup = ship.options.filter((o) => o.method === "pickup");
    const delivery = ship.options.filter((o) => o.method === "delivery");
    const opts = [
      ...pickup.map((o) => ({ id: o.id, name: o.name, price: o.price_cents, note: "Calle del Barro 12, Madrid · te avisamos cuando esté lista" })),
      ...(delivery.length
        ? delivery.map((o) => ({ id: o.id, name: o.name, price: o.price_cents, note: o.transit_hours ? `Entrega estimada en ${Math.ceil(o.transit_hours / 24)} días laborables` : "" }))
        : [{ id: "__delivery", name: "Envío a domicilio", price: null, note: ship.loading ? "Calculando tarifas…" : "Escribe tu código postal para ver las tarifas" }]),
    ];
    if (!opts.some((o) => o.id === ship.selected)) ship.selected = opts[0]?.id || "";
    box.innerHTML = opts.map((o) => `
      <label class="ship-option">
        <input type="radio" name="ship" value="${esc(o.id)}" ${o.id === ship.selected ? "checked" : ""}>
        <span class="ship-option__text"><span>${esc(o.name)}</span>${o.note ? `<small>${esc(o.note)}</small>` : ""}</span>
        <span class="ship-option__price">${o.price === null ? "" : o.price === 0 ? "Gratis" : money(o.price)}</span>
      </label>`).join("");
    const isPickup = ship.selected === "pickup";
    $("[data-address]", form).hidden = isPickup;
    form.phone.required = !isPickup;

    const chosen = ship.options.find((o) => o.id === ship.selected);
    const total = quote.items_total_cents + (chosen ? chosen.price_cents : 0);
    foot.innerHTML = `
      <div class="cart__row"><span>Productos</span><span>${money(quote.items_total_cents)}</span></div>
      <div class="cart__row"><span>Envío</span><span>${chosen ? (chosen.price_cents ? money(chosen.price_cents) : "Gratis") : "—"}</span></div>
      <div class="cart__row cart__total"><span>Total</span><strong>${money(total)}</strong></div>
      <button class="btn-primary cart__cta" type="button" data-pay ${chosen ? "" : "disabled"}>Pagar ${chosen ? money(total) : ""}</button>
      <p class="cart__muted cart__secure">Pago seguro con tarjeta a través de Stripe. Tus datos de pago no pasan por esta web.</p>`;
    $$(".btn-primary", foot).forEach((b) => button(b, b.textContent.trim().replace(/\s+/g, " "), "arrow"));
    $("[data-pay]", foot).addEventListener("click", () => pay(form));
  }

  function showError(form, msg) {
    const el = $("[data-checkout-error]", form);
    el.textContent = msg;
    el.hidden = !msg;
  }

  async function pay(form) {
    showError(form, "");
    $$(".form__field", form).forEach((f) => f.classList.remove("is-invalid"));
    const isPickup = ship.selected === "pickup";
    const f = form.elements;
    const required = ["name", "email", ...(isPickup ? [] : ["phone", "street", "postal_code", "city"])];
    const missing = required.filter((n) => !f[n].value.trim() || (n === "email" && !f[n].checkValidity()));
    if (missing.length) {
      missing.forEach((n) => f[n].closest(".form__field").classList.add("is-invalid"));
      f[missing[0]].focus();
      return showError(form, "Revisa los campos marcados.");
    }
    if (!f.terms.checked) {
      f.terms.closest(".check").classList.add("is-invalid");
      f.terms.focus();
      return showError(form, "Para pagar tienes que aceptar las condiciones de venta y la política de privacidad.");
    }
    const btn = $("[data-pay]", foot);
    btn.disabled = true;
    button(btn, "Preparando el pago…", "arrow");
    try {
      const res = await post("checkout", {
        items: read().map((i) => ({ product_id: i.id, quantity: i.qty })),
        customer: { name: f.name.value, email: f.email.value, phone: f.phone.value },
        shipping: { option_id: ship.selected },
        address: isPickup ? undefined : { street: f.street.value, postal_code: f.postal_code.value, city: f.city.value, country: f.country.value },
        consents: { terms: f.terms.checked, profile: f.profile.checked, marketing: f.marketing.checked },
      });
      window.location.href = res.checkout_url;
    } catch (e) {
      Object.keys(e.fields || {}).forEach((k) => f[k.split(".").pop()]?.closest(".form__field, .check")?.classList.add("is-invalid"));
      showError(form, e.message);
      if (e.status === 409) { quote = null; setTimeout(renderItems, 1800); }
      btn.disabled = false;
      button(btn, "Pagar", "arrow");
    }
  }

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
