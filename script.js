/* ==========================================================
   Charria Ceramics · Editorial
   Lenis (scroll suave) + GSAP/ScrollTrigger + SplitType
   ========================================================== */

// Si una imagen de Unsplash falla, se muestra un fondo de barro en su lugar
document.querySelectorAll("img").forEach((img) => {
  img.addEventListener("error", () => img.parentElement.classList.add("img-fallback"));
});

const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
const isDesktop = window.matchMedia("(min-width: 901px)").matches;

/* ---------- Scroll suave ---------- */
let lenis = null;
if (typeof window.Lenis !== "undefined") {
  lenis = new Lenis({ duration: 1.3, smoothWheel: true });
  if (hasGsap) {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: 0 }); }
    });
  });
}

/* ---------- Animaciones ---------- */
if (hasGsap) {
  gsap.registerPlugin(ScrollTrigger);

  const split = (el, types) => (typeof window.SplitType !== "undefined" ? new SplitType(el, { types: types === "chars" ? "words, chars" : types }) : null);

  // Título del hero: cada letra sube girando en X con física elástica
  const heroTitle = document.querySelector(".hero__title");
  const heroSplit = split(heroTitle, "chars");
  if (heroSplit) {
    gsap.from(heroSplit.chars, {
      yPercent: 110, rotateX: -90, opacity: 0,
      duration: 1.6, ease: "elastic.out(1, 0.6)", stagger: 0.06, delay: 0.2,
    });
  }
  gsap.from(".hero__sub, .hero__scroll", { opacity: 0, y: 20, duration: 1, delay: 1, stagger: 0.15 });

  // Zoom lento de la imagen del hero al hacer scroll
  gsap.to(".hero__media img", {
    scale: 1, yPercent: 12, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });
  gsap.to(".hero__title", {
    yPercent: -40, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });

  // Manifiesto: palabras que se encienden con el scroll
  const intro = split(document.querySelector("[data-reveal-words]"), "words");
  if (intro) {
    gsap.fromTo(intro.words, { opacity: 0.12 }, {
      opacity: 1, stagger: 0.1, ease: "none",
      scrollTrigger: { trigger: ".intro", start: "top 75%", end: "bottom 45%", scrub: true },
    });
  }

  // Títulos de sección
  document.querySelectorAll(".section-head__title, .footer__big").forEach((el) => {
    const s = split(el, "chars");
    if (!s) return;
    gsap.from(s.chars, {
      yPercent: 100, opacity: 0, duration: 1.1, ease: "power4.out", stagger: 0.03,
      scrollTrigger: { trigger: el, start: "top 85%" },
    });
  });

  // Columnas de la tienda con distinta velocidad (parallax)
  if (isDesktop) {
    document.querySelectorAll(".shop__col").forEach((col) => {
      gsap.to(col, {
        y: Number(col.dataset.speed) * 2, ease: "none",
        scrollTrigger: { trigger: ".shop", start: "top bottom", end: "bottom top", scrub: true },
      });
    });
  }

  // Productos: revelado tipo cortina
  document.querySelectorAll(".product__img").forEach((el) => {
    gsap.from(el, {
      clipPath: "inset(100% 0 0 0)", duration: 1.4, ease: "power4.inOut",
      scrollTrigger: { trigger: el, start: "top 90%" },
    });
  });

  // Filas de clases
  gsap.from(".class-row", {
    opacity: 0, y: 40, stagger: 0.1, duration: 1, ease: "power3.out",
    scrollTrigger: { trigger: ".class-list", start: "top 80%" },
  });

  // Imagen de la clase privada
  gsap.to(".private__media img", {
    scale: 1, ease: "none",
    scrollTrigger: { trigger: ".private", start: "top bottom", end: "bottom top", scrub: true },
  });

  // Galería: pantalla fijada y recorrido horizontal
  if (isDesktop) {
    const track = document.querySelector(".gallery__track");
    const distance = () => track.scrollWidth - window.innerWidth;
    gsap.to(track, {
      x: () => -distance(), ease: "none",
      scrollTrigger: {
        trigger: ".gallery", start: "top top", end: () => "+=" + distance(),
        pin: ".gallery__pin", scrub: 1, invalidateOnRefresh: true,
      },
    });
  }

  window.addEventListener("load", () => ScrollTrigger.refresh());
}

/* ---------- Imagen flotante en la lista de clases ---------- */
const floatBox = document.querySelector(".class-float");
const floatImg = floatBox.querySelector("img");
let fx = 0, fy = 0, tx = 0, ty = 0;
document.querySelectorAll(".class-row").forEach((row) => {
  row.addEventListener("mouseenter", () => {
    floatImg.src = row.dataset.img;
    floatBox.style.transition = "opacity .4s, transform .4s";
    floatBox.style.opacity = 1;
  });
  row.addEventListener("mouseleave", () => { floatBox.style.opacity = 0; });
});

/* ---------- Cursor con retraso (lerp) ---------- */
const cursor = document.querySelector(".cursor");
let cx = innerWidth / 2, cy = innerHeight / 2, mx = cx, my = cy;
window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; tx = e.clientX + 160; ty = e.clientY; });
(function loop() {
  cx += (mx - cx) * 0.18; cy += (my - cy) * 0.18;
  cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  fx += (tx - fx) * 0.1; fy += (ty - fy) * 0.1;
  floatBox.style.left = fx + "px"; floatBox.style.top = fy + "px";
  floatBox.style.transform = `translate(-50%, -50%) rotate(${(tx - fx) * 0.03}deg)`;
  requestAnimationFrame(loop);
})();
document.querySelectorAll("a, button, .class-row__name").forEach((el) => {
  el.addEventListener("mouseenter", () => cursor.classList.add("is-big"));
  el.addEventListener("mouseleave", () => cursor.classList.remove("is-big"));
});

/* ---------- Cesta (simulada) ---------- */
const cartCount = document.querySelector("[data-cart-count]");
document.querySelectorAll("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => {
    cartCount.textContent = Number(cartCount.textContent) + 1;
    btn.textContent = "Añadido ✓";
    btn.classList.add("is-added");
    setTimeout(() => { btn.textContent = "Añadir"; btn.classList.remove("is-added"); }, 1600);
  });
});

/* ---------- Modal de reserva grupal ---------- */
const modal = document.querySelector("[data-modal]");
document.querySelectorAll("[data-book]").forEach((btn) => {
  btn.addEventListener("click", () => {
    modal.querySelector("[data-modal-title]").textContent = btn.dataset.book;
    modal.querySelector(".form__ok").hidden = true;
    modal.hidden = false;
    lenis && lenis.stop();
  });
});
const closeModal = () => { modal.hidden = true; lenis && lenis.start(); };
modal.querySelector("[data-close]").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

/* ---------- Formularios (sin backend: solo confirmación visual) ---------- */
document.querySelectorAll("[data-form]").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.querySelector(".form__ok").hidden = false;
    form.reset();
  });
});
