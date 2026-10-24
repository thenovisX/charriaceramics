/* ==========================================================
   Charria Ceramics · Opción 3 · Catálogo y reservas
   Datos de ejemplo + cesta, filtros, calendario y lightbox.
   Lenis + GSAP/ScrollTrigger + SplitType para el movimiento.
   ========================================================== */

const img = (id, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const PRODUCTS = [
  { id: 1, name: "Jarrón Duna", desc: "Gres blanco, esmalte mate", price: 72, cat: "jarrones", img: "1578749556568-bc2c40e68b61", badge: "Nuevo", feature: true },
  { id: 2, name: "Taza Niebla", desc: "Gres, 250 ml", price: 26, cat: "tazas", img: "1612196808214-b8e1d6145a8c" },
  { id: 3, name: "Cuenco Arena", desc: "Ø 14 cm", price: 38, cat: "cuencos", img: "1610701596007-11502861dcfa" },
  { id: 4, name: "Plato Sal", desc: "Ø 26 cm", price: 32, cat: "platos", img: "1604335399105-a0c585fd81a1" },
  { id: 5, name: "Set Alba", desc: "4 piezas", price: 110, cat: "cuencos", img: "1594732832278-abd644401426", badge: "Pocas unidades" },
  { id: 6, name: "Florero Ocre", desc: "Terracota bruñida", price: 54, cat: "jarrones", img: "1590422749897-47036da0b0ff" },
  { id: 7, name: "Taza Ceniza", desc: "Esmalte de ceniza", price: 28, cat: "tazas", img: "1571950484368-7b15b0a5ad46" },
  { id: 8, name: "Fuente Tierra", desc: "Ø 32 cm", price: 64, cat: "platos", img: "1607344645866-009c320b63e0" },
  { id: 9, name: "Cuenco Musgo", desc: "Ø 18 cm", price: 42, cat: "cuencos", img: "1610701596061-2ecf227e85b2" },
];

const ART = [
  { title: "Serie Raíz, 2025", img: "1578500494198-246f612d3b3d" },
  { title: "Vasija nº 7", img: "1603204077779-bed963ea7d0e" },
  { title: "Mesa de taller", img: "1631125915902-d8abe9225ff2" },
  { title: "Torno", img: "1544967082-d9d25d867d66" },
  { title: "Silencio blanco", img: "1565193566173-7a0ee3dbe261" },
  { title: "Manos", img: "1493106641515-6b5631de4bb9" },
  { title: "Tierra cocida", img: "1606760227091-3dd870d97f1d" },
  { title: "Ceniza", img: "1525974160448-038dacadcc71" },
];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const euro = (n) => `${n} €`;

const fallback = (root) =>
  $$("img", root).forEach((i) => i.addEventListener("error", () => i.parentElement.classList.add("img-fallback")));

/* ---------- Tienda ---------- */
const grid = $("[data-products]");
grid.innerHTML = PRODUCTS.map((p) => `
  <article class="card ${p.feature ? "card--feature" : ""}" data-cat="${p.cat}">
    <div class="card__img">
      <img src="${img(p.img, p.feature ? 1400 : 800)}" alt="${p.name}" loading="lazy">
      ${p.badge ? `<span class="card__badge">${p.badge}</span>` : ""}
      <button class="card__quick" data-add="${p.id}">Añadir a la cesta</button>
    </div>
    <div class="card__info">
      <div><h3>${p.name}</h3><p>${p.desc}</p></div>
      <span class="card__price">${euro(p.price)}</span>
    </div>
  </article>`).join("");
fallback(grid);

$$("[data-filter]").forEach((btn) =>
  btn.addEventListener("click", () => {
    $$("[data-filter]").forEach((b) => b.classList.toggle("is-active", b === btn));
    const f = btn.dataset.filter;
    $$(".card").forEach((c) => c.classList.toggle("is-hidden", f !== "all" && c.dataset.cat !== f));
    if (window.gsap) gsap.from(".card:not(.is-hidden)", { opacity: 0, y: 30, stagger: 0.05, duration: 0.6, ease: "power2.out" });
    window.ScrollTrigger && ScrollTrigger.refresh();
  })
);

/* ---------- Cesta ---------- */
const cart = new Map();
const drawer = $("[data-drawer]");
const overlay = $("[data-overlay]");
const openCart = () => { drawer.classList.add("is-open"); overlay.classList.add("is-on"); drawer.setAttribute("aria-hidden", "false"); };
const closeCart = () => { drawer.classList.remove("is-open"); overlay.classList.remove("is-on"); drawer.setAttribute("aria-hidden", "true"); };
$("[data-cart-open]").addEventListener("click", openCart);
$("[data-cart-close]").addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);

const renderCart = () => {
  const list = $("[data-cart-items]");
  let total = 0, count = 0;
  list.innerHTML = cart.size
    ? [...cart.entries()].map(([id, qty]) => {
        const p = PRODUCTS.find((x) => x.id === id);
        total += p.price * qty; count += qty;
        return `<li class="line">
          <img src="${img(p.img, 200)}" alt="">
          <div><h4>${p.name}</h4><div class="line__qty"><button data-qty="${id}" data-d="-1">−</button>${qty}<button data-qty="${id}" data-d="1">+</button></div></div>
          <span>${euro(p.price * qty)}</span></li>`;
      }).join("")
    : `<li class="drawer__empty">Tu cesta está vacía.</li>`;
  $("[data-cart-total]").textContent = euro(total);
  $("[data-cart-count]").textContent = count;
};
document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) {
    const id = Number(add.dataset.add);
    cart.set(id, (cart.get(id) || 0) + 1);
    renderCart();
    openCart();
  }
  const q = e.target.closest("[data-qty]");
  if (q) {
    const id = Number(q.dataset.qty);
    const next = cart.get(id) + Number(q.dataset.d);
    next > 0 ? cart.set(id, next) : cart.delete(id);
    renderCart();
  }
});
renderCart();

/* ---------- Reservas ---------- */
const state = { mode: "grupal", year: 2026, month: 10, day: null, slot: null, people: 1 };
const SLOTS = {
  grupal: ["10:00", "17:00", "18:30"],
  privada: ["10:00", "12:00", "16:00", "18:00"],
};
const IMGS = { grupal: img("1556011284-54aa6466d402", 1000), privada: img("1606760227091-3dd870d97f1d", 1000) };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Días con plazas: grupal = jueves y sábados; privada = de martes a viernes
const isOpen = (date) => {
  const d = date.getDay();
  return state.mode === "grupal" ? d === 4 || d === 6 : d >= 2 && d <= 5;
};

const renderCal = () => {
  const cal = $("[data-cal]");
  $("[data-cal-title]").textContent = `${MONTHS[state.month]} ${state.year}`;
  const first = new Date(state.year, state.month, 1);
  const days = new Date(state.year, state.month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // semana empieza en lunes
  let html = ["L", "M", "X", "J", "V", "S", "D"].map((d) => `<span class="cal__dow">${d}</span>`).join("");
  html += "<span></span>".repeat(offset);
  for (let i = 1; i <= days; i++) {
    const open = isOpen(new Date(state.year, state.month, i));
    html += `<button class="cal__day ${open ? "is-open" : ""} ${state.day === i ? "is-selected" : ""}" ${open ? `data-day="${i}"` : "disabled"}>${i}</button>`;
  }
  cal.innerHTML = html;
};

const renderSlots = () => {
  const el = $("[data-slots]");
  // Algunas horas aparecen "completas" para que se vea el estado
  el.innerHTML = SLOTS[state.mode].map((s, i) => {
    const full = state.day && (state.day + i) % 4 === 0;
    return `<button class="slot ${state.slot === s ? "is-selected" : ""}" data-slot="${s}" ${!state.day || full ? "disabled" : ""}>${s}</button>`;
  }).join("");
};

const price = () =>
  state.mode === "grupal" ? Number($("[data-workshop]").value) * state.people : Number($("[data-private]").value);

const renderSummary = () => {
  $("[data-people]").textContent = state.people;
  $("[data-total]").textContent = euro(price());
  $("[data-summary]").textContent =
    state.day && state.slot ? `${state.day} de ${MONTHS[state.month].toLowerCase()} · ${state.slot}` : "Elige día y hora";
};

const renderBooking = () => { renderCal(); renderSlots(); renderSummary(); };

const setMode = (mode) => {
  state.mode = mode; state.day = null; state.slot = null; state.people = 1;
  $$("[data-tab]").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === mode));
  $$("[data-info]").forEach((i) => (i.hidden = i.dataset.info !== mode));
  $$("[data-only]").forEach((f) => (f.hidden = f.dataset.only !== mode));
  $("[data-booking-img]").src = IMGS[mode];
  $("[data-ok]").hidden = true;
  renderBooking();
};

$$("[data-tab]").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.tab)));
$$("[data-goto-tab]").forEach((a) => a.addEventListener("click", () => setMode(a.dataset.gotoTab)));
$("[data-cal]").addEventListener("click", (e) => {
  const d = e.target.closest("[data-day]");
  if (!d) return;
  state.day = Number(d.dataset.day); state.slot = null;
  renderBooking();
});
$("[data-slots]").addEventListener("click", (e) => {
  const s = e.target.closest("[data-slot]");
  if (!s || s.disabled) return;
  state.slot = s.dataset.slot;
  renderSlots(); renderSummary();
});
$("[data-cal-prev]").addEventListener("click", () => {
  if (state.month === 10 && state.year === 2026) return; // no ir antes del mes actual
  state.month = (state.month + 11) % 12; if (state.month === 11) state.year--;
  state.day = null; state.slot = null; renderBooking();
});
$("[data-cal-next]").addEventListener("click", () => {
  state.month = (state.month + 1) % 12; if (state.month === 0) state.year++;
  state.day = null; state.slot = null; renderBooking();
});
$$("[data-step]").forEach((b) => b.addEventListener("click", () => {
  state.people = Math.min(6, Math.max(1, state.people + Number(b.dataset.step)));
  renderSummary();
}));
$("[data-workshop]").addEventListener("change", renderSummary);
$("[data-private]").addEventListener("change", renderSummary);
$("[data-book]").addEventListener("click", () => {
  const ok = $("[data-ok]");
  ok.hidden = false;
  ok.textContent = state.day && state.slot
    ? `Reserva confirmada para el ${$("[data-summary]").textContent}. Total ${euro(price())}.`
    : "Elige un día y una hora disponibles.";
});
renderBooking();

/* ---------- Galería ---------- */
const masonry = $("[data-masonry]");
const heights = [1100, 800, 1200, 900, 1000, 750, 1150, 850];
masonry.innerHTML = ART.map((a, i) => `
  <figure data-lb="${i}">
    <img src="https://images.unsplash.com/photo-${a.img}?auto=format&fit=crop&w=800&h=${heights[i]}&q=80" alt="${a.title}" loading="lazy">
    <figcaption>${a.title}</figcaption>
  </figure>`).join("");
fallback(masonry);

const lb = $("[data-lightbox]");
let lbIndex = 0;
const showLb = (i) => {
  lbIndex = (i + ART.length) % ART.length;
  $("img", lb).src = img(ART[lbIndex].img, 1800);
  $("figcaption", lb).textContent = ART[lbIndex].title;
  lb.hidden = false;
};
masonry.addEventListener("click", (e) => { const f = e.target.closest("[data-lb]"); if (f) showLb(Number(f.dataset.lb)); });
$("[data-lb-close]").addEventListener("click", () => (lb.hidden = true));
$("[data-lb-prev]").addEventListener("click", () => showLb(lbIndex - 1));
$("[data-lb-next]").addEventListener("click", () => showLb(lbIndex + 1));
document.addEventListener("keydown", (e) => {
  if (lb.hidden) return;
  if (e.key === "Escape") lb.hidden = true;
  if (e.key === "ArrowLeft") showLb(lbIndex - 1);
  if (e.key === "ArrowRight") showLb(lbIndex + 1);
});

$("[data-news]").addEventListener("submit", (e) => { e.preventDefault(); e.target.innerHTML = "<p>Gracias por suscribirte.</p>"; });
fallback(document);

/* ---------- Cabecera ---------- */
window.addEventListener("scroll", () => $(".header").classList.toggle("is-scrolled", window.scrollY > 40));

/* ---------- Movimiento ---------- */
const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
let lenis = null;
if (typeof window.Lenis !== "undefined") {
  lenis = new Lenis({ duration: 1.1 });
  if (hasGsap) {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const t = $(a.getAttribute("href"));
    if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: -80 }); }
  }));
}

if (hasGsap) {
  gsap.registerPlugin(ScrollTrigger);
  const split = (el) => (typeof window.SplitType !== "undefined" ? new SplitType(el, { types: "words" }) : null);

  const hero = split($(".hero__title"));
  if (hero) gsap.from(hero.words, { yPercent: 100, opacity: 0, duration: 1.2, ease: "power4.out", stagger: 0.06, delay: 0.15 });
  gsap.from(".hero__lead, .hero__actions, .hero .eyebrow", { opacity: 0, y: 20, duration: 1, delay: 0.7, stagger: 0.1 });
  gsap.from(".hero__main", { clipPath: "inset(0 0 100% 0)", duration: 1.6, ease: "power4.inOut" });
  gsap.from(".hero__small", { y: 80, opacity: 0, duration: 1.4, delay: 0.6, ease: "power3.out" });
  gsap.to(".hero__small", { y: -60, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

  $$(".title").forEach((el) => {
    const s = split(el);
    if (s) gsap.from(s.words, { yPercent: 100, opacity: 0, duration: 1, ease: "power4.out", stagger: 0.06, scrollTrigger: { trigger: el, start: "top 85%" } });
  });

  gsap.set(".card, .masonry figure", { opacity: 0, y: 50 });
  ScrollTrigger.batch(".card, .masonry figure", {
    start: "top 92%",
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, stagger: 0.08, duration: 1, ease: "power3.out", overwrite: true }),
  });

  gsap.fromTo(".band img", { yPercent: -10 }, { yPercent: 10, ease: "none", scrollTrigger: { trigger: ".band", start: "top bottom", end: "bottom top", scrub: true } });

  window.addEventListener("load", () => ScrollTrigger.refresh());
}
