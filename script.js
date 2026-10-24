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
   Contenido desde data.js
   ========================================================== */
const PRODUCTS = (window.PRODUCTS || []).slice().sort((a, b) => b.added.localeCompare(a.added));
const GALLERY = window.GALLERY || [];
const pad = (n) => String(n).padStart(2, "0");

// Las 3 piezas más recientes llevan la etiqueta "Nuevo"
const productHTML = (p, i, tall = false) => `
  <article class="product${tall ? " product--tall" : ""}" style="order:${i}" data-category="${p.category}">
    <div class="product__img"><img src="${p.img}" alt="${p.alt}" loading="lazy"></div>
    ${PRODUCTS.indexOf(p) < 3 ? '<span class="product__badge">Nuevo</span>' : ""}
    <button class="btn-primary product__add" type="button" data-add data-icon="plus" aria-label="Añadir ${p.name} a la cesta">Añadir</button>
    <div class="product__info">
      <div><p class="product__cat">${p.category}</p><h3>${p.name}</h3></div>
      <span class="product__price">${p.price} €</span>
    </div>
  </article>`;

// Portada: solo las 5 piezas más recientes, repartidas en 3 columnas con parallax
const latest = $("[data-latest-products]");
if (latest) {
  const cols = [
    { speed: -40, items: [] },
    { speed: 40, items: [], offset: true },
    { speed: -20, items: [] },
  ];
  PRODUCTS.slice(0, 5).forEach((p, i) => cols[i % 3].items.push(productHTML(p, i, i === 1 || i === 2)));
  latest.innerHTML = cols.map((c) =>
    `<div class="shop__col${c.offset ? " shop__col--offset" : ""}" data-speed="${c.speed}">${c.items.join("")}</div>`
  ).join("");
}

// productos.html: catálogo completo con filtros por categoría
const catalog = $("[data-catalog]");
if (catalog) {
  catalog.innerHTML = PRODUCTS.map((p, i) => productHTML(p, i)).join("");
  const filters = $("[data-filters]");
  const count = $("[data-filter-count]");
  const categories = ["Todo", ...new Set(PRODUCTS.map((p) => p.category))];
  filters.insertAdjacentHTML("afterbegin", categories.map((c, i) =>
    `<button type="button" data-filter="${c}" aria-pressed="${i === 0}">${c}</button>`).join(""));
  const applyFilter = (cat) => {
    let shown = 0;
    $$(".product", catalog).forEach((el) => {
      const hide = cat !== "Todo" && el.dataset.category !== cat;
      el.hidden = hide;
      if (!hide) shown++;
    });
    $$("[data-filter]", filters).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === cat)));
    count.textContent = `${shown} ${shown === 1 ? "pieza" : "piezas"}`;
    if (hasGsap) {
      gsap.fromTo($$(".product:not([hidden])", catalog), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .7, stagger: .05, ease: "power3.out", clearProps: "transform,opacity" });
      ScrollTrigger.refresh();
    }
  };
  filters.addEventListener("click", (e) => { const b = e.target.closest("[data-filter]"); if (b) applyFilter(b.dataset.filter); });
  applyFilter("Todo");
}

// Portada: galería (cada foto lleva a galeria.html)
const galleryTrack = $("[data-gallery-track]");
if (galleryTrack) {
  const shapes = ["art--a", "art--b", "art--c"];
  galleryTrack.innerHTML = GALLERY.slice(0, 6).map((g, i) => `
    <a class="art ${shapes[i % 3]}" href="galeria.html#obra-${i + 1}" aria-label="${g.title}, ver en la galería">
      <div class="art__img"><img src="${g.img.replace("w=1600", "w=1000")}" alt="${g.alt}" loading="lazy"></div>
      <p class="art__cap">${g.title}, ${g.year}</p>
    </a>`).join("");
}

// galeria.html: composición editorial a gran tamaño
const edGallery = $("[data-ed-gallery]");
if (edGallery) {
  edGallery.innerHTML = GALLERY.map((g, i) => `
    <figure class="ed-item" id="obra-${i + 1}" data-index="${i}" tabindex="0" role="button" aria-label="Ampliar ${g.title}">
      <div class="ed-item__img"><img src="${g.img}" alt="${g.alt}" loading="${i < 2 ? "eager" : "lazy"}"></div>
      <figcaption>
        <span class="ed-item__num">${pad(i + 1)}</span>
        <span class="ed-item__title">${g.title}</span>
        <span class="ed-item__meta">${g.technique} · ${g.year}</span>
      </figcaption>
    </figure>`).join("");
  const total = $("[data-gallery-total]");
  if (total) total.textContent = `${pad(GALLERY.length)} obras`;
}

/* ==========================================================
   Botones: texto que rueda + círculo con icono (ver .btn-primary en style.css)
   ========================================================== */
const ICONS = {
  arrow: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 8h12M9 3l5 5-5 5"/></svg>',
  plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2v12M2 8h12"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 8.5l3.5 3.5 7.5-8"/></svg>',
};
const setButton = (btn, text, icon = btn.dataset.icon || "arrow") => {
  btn.innerHTML = `<span class="btn-primary__label"><span data-text="${text}">${text}</span></span><span class="btn-primary__icon" aria-hidden="true">${ICONS[icon]}</span>`;
};
$$(".btn-primary").forEach((btn) => setButton(btn, btn.textContent.trim()));
// En móvil y tablet el botón "Añadir" de las fichas es solo el círculo sobre la foto
const roundAdd = window.matchMedia("(max-width: 1024px), (hover: none)");
const syncAddButtons = () => $$(".product__add").forEach((b) => b.classList.toggle("btn-primary--round", roundAdd.matches));
roundAdd.addEventListener("change", syncAddButtons);
syncAddButtons();

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
  lenis = new Lenis({ duration: 1.3, smoothWheel: true });
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
  const extras = [...$$(":scope > a small", mobileMenu), $(".mobile-menu__foot", mobileMenu)];
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
    gsap.from(".hero__sub, .hero__scroll", { opacity: 0, y: 20, duration: 1, delay: 1, stagger: 0.15 });
  }

  // Títulos de sección y de página: letra a letra
  $$(".section-head__title, .footer__big, .page-head__title").forEach((el) => {
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
      gsap.fromTo(intro.words, { opacity: 0.12 }, {
        opacity: 1, stagger: 0.1, ease: "none",
        scrollTrigger: { trigger: ".intro", start: "top 75%", end: "bottom 45%", scrub: true },
      });
    }
    if ($(".class-list")) {
      gsap.from(".class-row", {
        opacity: 0, y: 40, stagger: 0.1, duration: 1, ease: "power3.out",
        scrollTrigger: { trigger: ".class-list", start: "top 80%" },
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
      ".contact__lead", ".contact__details > div", ".footer__cols > div", ".footer__legal",
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
if (lightbox && edGallery) {
  const img = $("[data-lb-img]", lightbox);
  const title = $("[data-lb-title]", lightbox);
  const meta = $("[data-lb-meta]", lightbox);
  const counter = $("[data-lb-count]", lightbox);
  let index = 0;
  let lastFocus = null;

  const show = (i, dir = 0) => {
    index = (i + GALLERY.length) % GALLERY.length;
    const g = GALLERY[index];
    const swap = () => {
      img.src = g.img.replace("w=1600", "w=2200");
      img.alt = g.alt;
      title.textContent = g.title;
      meta.textContent = `${g.technique} · ${g.year}`;
      counter.textContent = `${pad(index + 1)} / ${pad(GALLERY.length)}`;
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

  edGallery.addEventListener("click", (e) => { const f = e.target.closest(".ed-item"); if (f) open(Number(f.dataset.index)); });
  edGallery.addEventListener("keydown", (e) => {
    const f = e.target.closest(".ed-item");
    if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(Number(f.dataset.index)); }
  });
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
   Cesta (simulada; se recuerda entre páginas)
   ========================================================== */
const cartCount = $("[data-cart-count]");
const readCart = () => { try { return Number(localStorage.getItem("charria-cart")) || 0; } catch { return 0; } };
const saveCart = (n) => { try { localStorage.setItem("charria-cart", String(n)); } catch { /* sin almacenamiento */ } };
cartCount.textContent = readCart();
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const n = readCart() + 1;
  saveCart(n);
  cartCount.textContent = n;
  setButton(btn, "Añadido", "check");
  btn.classList.add("is-added");
  if (hasGsap) gsap.fromTo(cartCount.parentElement, { scale: 1.25 }, { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.5)" });
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { setButton(btn, "Añadir"); btn.classList.remove("is-added"); }, 1600);
});

/* ==========================================================
   Modal de reserva grupal
   ========================================================== */
const modal = $("[data-modal]");
if (modal) {
  $$("[data-book]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("[data-modal-title]", modal).textContent = btn.dataset.book;
      $(".form__ok", modal).hidden = true;
      modal.hidden = false;
      lenis && lenis.stop();
    });
  });
  const closeModal = () => { modal.hidden = true; lenis && lenis.start(); };
  $("[data-close]", modal).addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
}

/* ==========================================================
   Formularios (sin backend: solo confirmación visual)
   ========================================================== */
$$("[data-form]").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    $(".form__ok", form).hidden = false;
    form.reset();
  });
});
