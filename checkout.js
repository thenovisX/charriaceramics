/* ==========================================================
   Charria Ceramics · Página de pago (checkout.html)
   - Lee la cesta del navegador (la misma que cart.js) y pide al servidor
     precios, envío y totales; solo se envían IDs y cantidades.
   - Datos, entrega y consentimientos a la izquierda; resumen y botón de
     pago a la derecha. El pago termina en la página segura de Stripe.
   ========================================================== */
(function () {
  const API = "api";
  const KEY = "charria-cart-v2";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (cents) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 });
  const button = (btn, text, icon) => (window.setButton ? window.setButton(btn, text, icon) : (btn.textContent = text));
  const grid = $("[data-checkout-grid]");
  if (!grid) return;

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

  const read = () => {
    try {
      const items = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(items) ? items.map((i) => ({ ...i, qty: Number(i?.qty) || 0 })).filter((i) => i.id && i.qty > 0) : [];
    } catch { return []; }
  };
  const write = (items) => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* */ } };
  const lines = () => read().map((i) => ({ product_id: i.id, quantity: i.qty }));

  let quote = null;
  let ship = { options: [], selected: "", loading: false, zip: "", country: "ES" };
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem("charria-checkout") || "{}"); } catch { /* */ }

  function empty(msg) {
    grid.innerHTML = `<div class="cart__empty"><p>${esc(msg)}</p><p class="cart__muted">Cada pieza es única: cuando te enamores de una, añádela a la cesta.</p><a class="btn-primary" href="productos.html">Ver la tienda</a></div>`;
    $$(".btn-primary", grid).forEach((b) => button(b, b.textContent.trim()));
  }

  async function refreshQuote() {
    quote = await post("cart/quote", { items: lines() });
    let changed = false;
    const next = read().map((i) => {
      const err = quote.errors.find((e) => e.product_id === i.id);
      const line = quote.lines.find((l) => l.product_id === i.id);
      if (line) Object.assign(i, { title: line.title, price: line.unit_final_cents, img: line.image?.thumb_url || i.img });
      if (err?.code === "insufficient_stock") { changed = true; return { ...i, qty: err.available }; }
      return i;
    });
    write(next.filter((i) => i.qty > 0));
    if (changed) {
      quote = await post("cart/quote", { items: lines() });
      quote.adjusted = true;
    }
  }

  // Tienda cerrada desde el panel: el aviso en lugar del formulario (el servidor tampoco deja pagar)
  function closed(msg) {
    grid.innerHTML = `<div class="cart__empty"><p class="shop-closed" role="status">${esc(msg)}</p><p class="cart__muted">Mientras tanto puedes apuntarte a una clase o escribirnos.</p><a class="btn-primary" href="index.html#clases">Ver las clases</a></div>`;
  }

  async function init() {
    try {
      const site = await fetch(`${API}/site`, { headers: { Accept: "application/json" } }).then((r) => r.json());
      if (site?.data?.shop_open === false) return closed(site.data.shop_message || "Tienda no disponible por ahora. Volvemos muy pronto.");
    } catch { /* sin respuesta: sigue y el servidor decide al pagar */ }
    if (!read().length) return empty("Tu cesta está vacía.");
    try { await refreshQuote(); } catch { return empty("La tienda online no está disponible ahora mismo. Inténtalo en unos minutos."); }
    if (!read().length) return empty("Tu cesta está vacía.");
    render();
  }

  const CONSENT_CHECKS = () => `
    <label class="check"><input type="checkbox" name="terms"><span>He leído y acepto las <a href="condiciones.html" target="_blank">condiciones de venta</a> y la <a href="privacidad.html" target="_blank">política de privacidad</a>.</span></label>
    <label class="check"><input type="checkbox" name="marketing"><span>Quiero recibir por email novedades, piezas nuevas, talleres y ofertas de Charria Ceramics.<small>Opcional. Puedes darte de baja cuando quieras.</small></span></label>
    <label class="check"><input type="checkbox" name="profile"><span>Guardar mis datos y crear mi perfil de cliente para próximas compras.<small>Opcional. Si no lo marcas, solo guardamos lo necesario para este pedido.</small></span></label>`;

  function summaryLines() {
    return read().map((i) => {
      const line = quote.lines.find((l) => l.product_id === i.id);
      const err = quote.errors.find((e) => e.product_id === i.id);
      const unit = line ? line.unit_final_cents : i.price;
      return `<li class="cart-line${err ? " is-unavailable" : ""}">
        <div class="cart-line__img">${i.img ? `<img src="${esc(i.img)}" alt="" loading="lazy">` : ""}</div>
        <div class="cart-line__info">
          <p class="cart-line__title">${esc(line?.title || i.title)}</p>
          <p class="cart-line__price">${line?.discount_percent ? `<s>${money(line.unit_price_cents)}</s> ` : ""}${money(unit)} · ${i.qty} ${i.qty === 1 ? "unidad" : "unidades"}</p>
          ${err ? `<p class="cart-line__error">${esc(err.message)}</p>` : ""}
        </div>
      </li>`;
    }).join("");
  }

  function render() {
    grid.innerHTML = `
      <form class="form cart__form checkout__form" data-checkout novalidate>
        <fieldset><legend class="eyebrow">1 · Tus datos</legend>
          <label class="form__field"><span>Nombre y apellidos</span><input name="name" autocomplete="name" required value="${esc(saved.name)}"></label>
          <label class="form__field"><span>Email</span><input type="email" name="email" autocomplete="email" required value="${esc(saved.email)}"></label>
          <label class="form__field"><span>Teléfono</span><input type="tel" name="phone" autocomplete="tel" value="${esc(saved.phone)}"><small>Para el transportista</small></label>
        </fieldset>
        <fieldset><legend class="eyebrow">2 · Entrega</legend>
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
        <fieldset class="checks"><legend class="eyebrow">3 · Antes de pagar</legend>
          ${CONSENT_CHECKS()}
          <p class="privacy-note">Responsable: Charria Ceramics. Usamos tus datos para gestionar el pedido y su factura; los reciben Stripe (pago) y, si eliges envío, Packlink y el transportista. Puedes consultarlos, borrarlos y ejercer tus demás derechos en <a href="mis-datos.html" target="_blank">Mis datos</a>. Más información en la <a href="privacidad.html" target="_blank">política de privacidad</a>.</p>
        </fieldset>
      </form>
      <aside class="checkout__summary">
        <h2 class="checkout__summary-title">Tu pedido</h2>
        ${quote.adjusted ? '<p class="cart__notice">Hemos ajustado las cantidades al stock disponible.</p>' : ""}
        <ul class="cart__lines">${summaryLines()}</ul>
        <a class="cart__back checkout__edit" href="productos.html">Cambiar mi cesta</a>
        <div class="checkout__totals" data-foot></div>
      </aside>`;
    const form = $("[data-checkout]", grid);
    if (!ship.selected) ship.selected = saved.option || "";
    form.addEventListener("input", (e) => {
      const box = e.target.closest(".form__field, .check");
      box?.classList.remove("is-invalid");
      box?.querySelector("[data-field-error]")?.remove();
      if (e.target.type === "checkbox") return; // las casillas no se recuerdan
      saved[e.target.name] = e.target.value;
      try { sessionStorage.setItem("charria-checkout", JSON.stringify(saved)); } catch { /* */ }
    });
    form.postal_code.addEventListener("change", () => loadShipping(form));
    form.country.addEventListener("change", () => loadShipping(form));
    $("[data-ship-options]", form).addEventListener("change", (e) => {
      if (e.target.name !== "ship") return;
      ship.selected = e.target.value;
      clearInvalid($("[data-checkout]", grid));
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
      const res = await post("shipping/quote", { items: lines(), address: { postal_code: zip, country } });
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
      ...pickup.map((o) => ({ id: o.id, name: o.name, price: o.price_cents, note: `${window.pickupPlace ? window.pickupPlace() : "En el estudio"} · te avisamos cuando esté lista` })),
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
    const foot = $("[data-foot]", grid);
    const hasErrors = quote.errors.length > 0;
    // El botón de pago no se vuelve a crear (un clic a medias no se pierde si cambian las tarifas)
    if (!$("[data-pay]", foot)) {
      foot.innerHTML = `
        <div data-rows></div>
        <p class="cart-line__error" data-checkout-error hidden></p>
        <button class="btn-primary cart__cta" type="button" data-pay>Pagar</button>
        <p class="cart__muted cart__secure">Pago seguro con tarjeta a través de Stripe. Tus datos de pago no pasan por esta web.</p>`;
      $("[data-pay]", foot).addEventListener("click", () => pay(form));
    }
    $("[data-rows]", foot).innerHTML = `
      <div class="cart__row"><span>Productos</span><span>${money(quote.items_total_cents)}</span></div>
      ${quote.discount_cents ? `<div class="cart__row cart__muted"><span>Ahorro aplicado</span><span>−${money(quote.discount_cents)}</span></div>` : ""}
      <div class="cart__row"><span>Envío</span><span>${chosen ? (chosen.price_cents ? money(chosen.price_cents) : "Gratis") : "—"}</span></div>
      <div class="cart__row cart__total"><span>Total <small class="cart__muted">IVA incluido</small></span><strong>${money(total)}</strong></div>
      ${hasErrors ? '<p class="cart-line__error">Hay piezas que ya no están disponibles: cambia tu cesta para continuar.</p>' : ""}`;
    const pay$ = $("[data-pay]", foot);
    pay$.disabled = hasErrors;
    const label = `Pagar ${chosen ? money(total) : ""}`.trim();
    if (pay$.dataset.label !== label) { pay$.dataset.label = label; button(pay$, label, "arrow"); }
  }

  function showError(form, msg) {
    const el = $("[data-checkout-error]");
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  // Cada campo erróneo se marca en rojo con su mensaje; el foco va al primero
  const digits = (v) => v.replace(/\D/g, "");
  function clearInvalid(form) {
    $$(".is-invalid", form).forEach((el) => el.classList.remove("is-invalid"));
    $$("[data-field-error]", form).forEach((el) => el.remove());
  }
  function markInvalid(el, msg) {
    const box = el.closest(".form__field, .check, .ship-options");
    if (!box) return;
    box.classList.add("is-invalid");
    box.querySelector("[data-field-error]")?.remove();
    box.insertAdjacentHTML("beforeend", `<small class="form__error" data-field-error role="alert">${esc(msg)}</small>`);
  }
  function validate(form) {
    const f = form.elements;
    const isPickup = ship.selected === "pickup";
    const errors = [];
    const need = (name, bad, msg) => { if (bad) errors.push([f[name], msg]); };
    need("name", f.name.value.trim().length < 2, "Escribe tu nombre y apellidos.");
    need("email", !f.email.value.trim() || !f.email.checkValidity(), f.email.value.trim() ? "Este email no es válido." : "Escribe tu email.");
    const phone = f.phone.value.trim();
    need("phone", isPickup ? phone && digits(phone).length < 9 : digits(phone).length < 9, phone ? "El teléfono no es válido." : "Escribe un teléfono para el transportista.");
    if (!ship.options.some((o) => o.id === ship.selected)) errors.push([$("[name=ship]", form) || f.name, "Escribe tu código postal y elige cómo recibir el pedido."]);
    if (!isPickup) {
      need("street", f.street.value.trim().length < 4, "Escribe tu dirección.");
      need("postal_code", f.country.value === "ES" ? !/^\d{5}$/.test(f.postal_code.value.trim()) : f.postal_code.value.trim().length < 3, "El código postal no es válido.");
      need("city", !f.city.value.trim(), "Escribe tu ciudad.");
    }
    need("terms", !f.terms.checked, "Para pagar tienes que aceptar las condiciones de venta y la política de privacidad.");
    return errors;
  }

  async function pay(form) {
    showError(form, "");
    clearInvalid(form);
    const f = form.elements;
    const isPickup = ship.selected === "pickup";
    const errors = validate(form);
    if (errors.length) {
      errors.forEach(([el, msg]) => markInvalid(el, msg));
      errors[0][0].focus();
      errors[0][0].closest(".form__field, .check, .ship-options")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return showError(form, errors.length === 1 ? "Revisa el campo marcado en rojo." : `Revisa los ${errors.length} campos marcados en rojo.`);
    }
    const btn = $("[data-pay]");
    btn.disabled = true;
    button(btn, "Preparando el pago…", "arrow");
    try {
      const res = await post("checkout", {
        items: lines(),
        customer: { name: f.name.value, email: f.email.value, phone: f.phone.value },
        shipping: { option_id: ship.selected },
        address: isPickup ? undefined : { street: f.street.value, postal_code: f.postal_code.value, city: f.city.value, country: f.country.value },
        consents: { terms: f.terms.checked, profile: f.profile.checked, marketing: f.marketing.checked },
      });
      window.location.href = res.checkout_url;
    } catch (e) {
      Object.keys(e.fields || {}).forEach((k) => f[k.split(".").pop()]?.closest(".form__field, .check")?.classList.add("is-invalid"));
      showError(form, e.message);
      if (e.status === 409) setTimeout(init, 1800);
      btn.disabled = false;
      button(btn, btn.dataset.label || "Pagar", "arrow");
    }
  }

  init();
})();
