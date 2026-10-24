/* ==========================================================
   Charria Ceramics · Consentimiento de cookies (RGPD + LSSI art. 22.2)
   - Al entrar: aviso con «Rechazar», «Configurar» y «Aceptar todo»
     (aceptar y rechazar con el mismo peso visual).
   - Hasta que la persona elige, solo funciona lo necesario (cesta y esta
     misma elección, guardadas en el navegador). Google Analytics se carga
     únicamente con permiso para «Analíticas»; su ID se pone en
     Panel → Ajustes → Datos legales.
   - La elección se guarda 12 meses y se puede cambiar en cualquier momento
     con cualquier elemento [data-cookie-settings] (enlace del pie).
   - Otros scripts pueden preguntar con Consent.has("marketing") y
     escuchar el evento "consent:change".
   ========================================================== */
(function () {
  const KEY = "charria-consent";
  // Súbelo si cambian las categorías o los servicios: se volverá a preguntar a todo el mundo
  const VERSION = 1;
  const MAX_AGE = 365 * 24 * 3600 * 1000;
  const CATEGORIES = [
    { id: "necessary", title: "Necesarias", locked: true,
      text: "Hacen que la web funcione: recuerdan tu cesta, los datos del pedido mientras pagas y esta elección. No se pueden desactivar y no sirven para seguirte." },
    { id: "analytics", title: "Analíticas",
      text: "Google Analytics nos dice, de forma agregada, qué páginas se visitan y cómo se llega a ellas, para mejorar la web. Solo se activan si las aceptas." },
    { id: "marketing", title: "Marketing",
      text: "Servirían para mostrarte anuncios de Charria en otras webs y redes. Ahora mismo no usamos ninguna; si las añadimos, solo funcionarán con tu permiso." },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const button = (btn, icon) => { btn.dataset.icon = icon; window.setButton?.(btn, btn.textContent.trim(), icon); };

  /* ---------- Elección guardada ---------- */
  function read() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || "null");
      if (c && c.v === VERSION && Date.now() - new Date(c.at).getTime() < MAX_AGE) return c;
    } catch { /* sin almacenamiento: se pregunta en cada visita */ }
    return null;
  }
  let choice = read();

  function save(analytics, marketing) {
    const before = choice;
    choice = { v: VERSION, analytics: !!analytics, marketing: !!marketing, at: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch { /* */ }
    if (before?.analytics && !choice.analytics) removeAnalytics();
    apply();
    document.dispatchEvent(new CustomEvent("consent:change", { detail: { ...choice } }));
    hideBanner();
    closePrefs();
  }

  /* ---------- Google Analytics (solo con permiso) ---------- */
  let gaId = null;
  async function analyticsId() {
    if (gaId !== null) return gaId;
    try { gaId = sessionStorage.getItem("charria-ga") ?? null; } catch { /* */ }
    if (gaId === null) {
      try {
        const res = await fetch("api/site", { headers: { Accept: "application/json" } });
        gaId = (await res.json())?.data?.ga_id || "";
      } catch { gaId = ""; }
      try { sessionStorage.setItem("charria-ga", gaId); } catch { /* */ }
    }
    return gaId;
  }

  function gtagConsent() {
    return {
      analytics_storage: choice?.analytics ? "granted" : "denied",
      ad_storage: choice?.marketing ? "granted" : "denied",
      ad_user_data: choice?.marketing ? "granted" : "denied",
      ad_personalization: choice?.marketing ? "granted" : "denied",
    };
  }

  let gaLoaded = false;
  async function apply() {
    if (gaLoaded && window.gtag) window.gtag("consent", "update", gtagConsent());
    if (!choice?.analytics || gaLoaded) return;
    const id = await analyticsId();
    if (!/^G-[A-Z0-9]+$/.test(id) || !choice?.analytics) return;
    gaLoaded = true;
    window[`ga-disable-${id}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", gtagConsent());
    window.gtag("js", new Date());
    window.gtag("config", id);
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  }

  // Al retirar el permiso: GA deja de medir y se borran sus cookies (_ga, _ga_XXXX, _gid)
  function removeAnalytics() {
    if (gaId) window[`ga-disable-${gaId}`] = true;
    const host = location.hostname;
    const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
    document.cookie.split(";").map((c) => c.split("=")[0].trim())
      .filter((name) => /^(_ga|_gid|_gat)/.test(name))
      .forEach((name) => domains.forEach((d) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ""}`;
      }));
  }

  /* ---------- Aviso (primera capa) ---------- */
  document.body.insertAdjacentHTML("beforeend", `
    <section class="consent" data-consent role="region" aria-label="Aviso de cookies" hidden>
      <div class="consent__text">
        <p class="eyebrow">Cookies</p>
        <p>Usamos cookies propias necesarias para que la web funcione y, solo si nos dejas, cookies de Google Analytics para saber qué páginas se visitan y mejorarla. Puedes aceptarlas, rechazarlas o elegir cuáles. Más información en la <a href="cookies.html">política de cookies</a>.</p>
      </div>
      <div class="consent__actions">
        <button class="btn-primary consent__btn" type="button" data-consent-reject>Rechazar</button>
        <button class="btn-primary consent__btn" type="button" data-consent-accept>Aceptar todo</button>
        <button class="consent__link" type="button" data-consent-config>Configurar</button>
      </div>
    </section>
    <div class="consent-prefs" data-consent-prefs hidden>
      <div class="consent-prefs__box" data-lenis-prevent role="dialog" aria-modal="true" aria-labelledby="consent-prefs-title" tabindex="-1">
        <button class="consent-prefs__close" type="button" data-consent-close aria-label="Cerrar">×</button>
        <p class="eyebrow">Preferencias</p>
        <h2 class="consent-prefs__title" id="consent-prefs-title">Cookies</h2>
        <p class="consent-prefs__lead">Elige qué cookies aceptas. Puedes cambiarlo cuando quieras desde «Configurar cookies», al pie de cada página.</p>
        <form data-consent-form>
          ${CATEGORIES.map((c) => `
          <div class="consent-cat">
            <label class="consent-cat__head">
              <span class="consent-cat__title">${c.title}</span>
              <span class="switch"><input type="checkbox" name="${c.id}" ${c.locked ? "checked disabled" : ""}><span class="switch__track" aria-hidden="true"></span><span class="switch__state">${c.locked ? "Siempre activas" : ""}</span></span>
            </label>
            <p class="consent-cat__text">${c.text}</p>
          </div>`).join("")}
          <div class="consent-prefs__actions">
            <button class="btn-primary consent__btn" type="button" data-consent-reject>Rechazar todo</button>
            <button class="btn-primary consent__btn" type="button" data-consent-accept>Aceptar todo</button>
            <button class="consent__link" type="submit">Guardar mi selección</button>
          </div>
        </form>
      </div>
    </div>`);

  const banner = $("[data-consent]");
  const prefs = $("[data-consent-prefs]");
  const form = $("[data-consent-form]", prefs);
  document.querySelectorAll(".consent [data-consent-reject], .consent-prefs [data-consent-reject]").forEach((b) => {
    button(b, "close");
    b.addEventListener("click", () => save(false, false));
  });
  document.querySelectorAll(".consent [data-consent-accept], .consent-prefs [data-consent-accept]").forEach((b) => {
    button(b, "check");
    b.addEventListener("click", () => save(true, true));
  });
  $("[data-consent-config]", banner).addEventListener("click", () => openPrefs());
  $("[data-consent-close]", prefs).addEventListener("click", () => closePrefs());
  prefs.addEventListener("click", (e) => { if (e.target === prefs) closePrefs(); });
  form.addEventListener("submit", (e) => { e.preventDefault(); save(form.elements.analytics.checked, form.elements.marketing.checked); });
  form.addEventListener("change", (e) => {
    const state = e.target.closest(".switch")?.querySelector(".switch__state");
    if (state && !e.target.disabled) state.textContent = e.target.checked ? "Activadas" : "Desactivadas";
  });

  let lastFocus = null;
  function openPrefs() {
    lastFocus = document.activeElement;
    form.elements.analytics.checked = !!choice?.analytics;
    form.elements.marketing.checked = !!choice?.marketing;
    form.querySelectorAll(".switch input:not(:disabled)").forEach((i) => { i.closest(".switch").querySelector(".switch__state").textContent = i.checked ? "Activadas" : "Desactivadas"; });
    prefs.hidden = false;
    document.documentElement.classList.add("consent-open");
    document.dispatchEvent(new CustomEvent("consent:open"));
    setTimeout(() => $(".consent-prefs__box", prefs).focus(), 30);
  }
  function closePrefs() {
    if (prefs.hidden) return;
    prefs.hidden = true;
    document.documentElement.classList.remove("consent-open");
    document.dispatchEvent(new CustomEvent("consent:close"));
    lastFocus?.focus?.();
  }
  const showBanner = () => { banner.hidden = false; };
  function hideBanner() { banner.hidden = true; }
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePrefs(); });

  // «Configurar cookies» del pie (y cualquier otro enlace con data-cookie-settings)
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-cookie-settings]");
    if (!link) return;
    e.preventDefault();
    openPrefs();
  });

  window.Consent = {
    has: (category) => category === "necessary" || !!choice?.[category],
    choice: () => (choice ? { ...choice } : null),
    open: openPrefs,
  };

  if (choice) apply();
  else showBanner();
})();
