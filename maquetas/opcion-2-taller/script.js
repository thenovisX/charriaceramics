/* ==========================================================
   Charria Ceramics · Opción 2 · Taller inmersivo
   Lenis + GSAP/ScrollTrigger + SplitType (el shader está en shader.js)
   ========================================================== */

document.querySelectorAll("img").forEach((img) => {
  img.addEventListener("error", () => img.parentElement.classList.add("img-fallback"));
});

const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
const isDesktop = window.matchMedia("(min-width: 901px)").matches;

/* ---------- Scroll suave ---------- */
let lenis = null;
if (typeof window.Lenis !== "undefined") {
  lenis = new Lenis({ duration: 1.5, smoothWheel: true, wheelMultiplier: 0.9 });
  if (hasGsap) {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}
const scrollToEl = (el) => (lenis ? lenis.scrollTo(el) : el.scrollIntoView({ behavior: "smooth" }));

/* ---------- Menú a pantalla completa ---------- */
const menu = document.querySelector("[data-menu]");
const openMenu = () => {
  menu.classList.add("is-open");
  menu.setAttribute("aria-hidden", "false");
  if (hasGsap) {
    gsap.to(menu, { clipPath: "circle(150% at calc(100% - 4rem) 2.5rem)", duration: 1.1, ease: "expo.inOut" });
    gsap.from(".menu__list li", { yPercent: 100, opacity: 0, stagger: 0.07, delay: 0.4, duration: 0.9, ease: "expo.out" });
  } else menu.style.clipPath = "none";
};
const closeMenu = () => {
  menu.classList.remove("is-open");
  menu.setAttribute("aria-hidden", "true");
  if (hasGsap) gsap.to(menu, { clipPath: "circle(0% at calc(100% - 4rem) 2.5rem)", duration: 0.9, ease: "expo.inOut" });
  else menu.style.clipPath = "";
};
document.querySelector("[data-menu-open]").addEventListener("click", openMenu);
document.querySelector("[data-menu-close]").addEventListener("click", closeMenu);
menu.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
    const target = document.querySelector(a.getAttribute("href"));
    setTimeout(() => scrollToEl(target), 500);
  })
);

/* ---------- Animaciones ---------- */
if (hasGsap) {
  gsap.registerPlugin(ScrollTrigger);
  const split = (el) => (typeof window.SplitType !== "undefined" ? new SplitType(el, { types: "words, chars" }) : null);

  // Título del hero: letras con rotación X/Y y rebote elástico
  document.querySelectorAll(".hero__title [data-split]").forEach((line, i) => {
    const s = split(line);
    if (!s) return;
    gsap.from(s.chars, {
      opacity: 0, yPercent: 80, rotateX: -100, rotateY: 40,
      duration: 1.8, ease: "elastic.out(1, 0.5)", stagger: 0.04, delay: 0.3 + i * 0.25,
    });
  });

  // Hero fijado: las fotos viajan desde el fondo hacia el espectador
  const tl = gsap.timeline({
    scrollTrigger: { trigger: ".hero", start: "top top", end: "+=180%", pin: ".hero__stage", scrub: 1 },
  });
  gsap.set(".depth", { scale: 0.45, opacity: 0, z: -400 });
  tl.to(".depth", { scale: 1, opacity: 1, z: 0, stagger: 0.25, duration: 1, ease: "power2.out" })
    .to(".hero__title", { scale: 0.85, opacity: 0.25, duration: 1 }, 0.4)
    .to(".depth--1", { x: "18vw", y: "-30vh", scale: 1.6, opacity: 0, duration: 1 }, 1.4)
    .to(".depth--2", { x: "-20vw", y: "30vh", scale: 1.8, opacity: 0, duration: 1 }, 1.5)
    .to(".depth--3", { y: "-50vh", scale: 1.5, opacity: 0, duration: 1 }, 1.6)
    .to(".depth--4", { x: "20vw", y: "20vh", scale: 1.7, opacity: 0, duration: 1 }, 1.7)
    .to(".hero__title", { opacity: 0, yPercent: -60, duration: 0.8 }, 1.8);

  // Títulos de capítulo y footer
  document.querySelectorAll(".chapter__title, .footer__line, .gallery__title").forEach((el) => {
    const s = split(el);
    if (!s) return;
    gsap.from(s.chars, {
      opacity: 0, yPercent: 60, rotateX: -80, transformOrigin: "50% 100%",
      duration: 1.4, ease: "elastic.out(1, 0.6)", stagger: 0.035,
      scrollTrigger: { trigger: el, start: "top 85%" },
    });
  });

  // Estantería: cada pieza flota a su velocidad
  if (isDesktop) {
    document.querySelectorAll(".piece").forEach((p) => {
      gsap.fromTo(p, { y: 300 * Number(p.dataset.depth) }, {
        y: -300 * Number(p.dataset.depth), ease: "none",
        scrollTrigger: { trigger: ".shelf", start: "top bottom", end: "bottom top", scrub: true },
      });
    });
  }
  gsap.utils.toArray(".piece").forEach((p) => {
    gsap.from(p.querySelector(".piece__img"), {
      scale: 0.6, opacity: 0, duration: 1.4, ease: "expo.out",
      scrollTrigger: { trigger: p, start: "top 90%" },
    });
  });

  // Galería: cada figura a una profundidad distinta
  if (isDesktop) {
    document.querySelectorAll(".g").forEach((g) => {
      const speed = Number(g.dataset.speed);
      gsap.fromTo(g, { y: 200 * speed }, {
        y: -200 * speed, ease: "none",
        scrollTrigger: { trigger: ".gallery", start: "top bottom", end: "bottom top", scrub: true },
      });
    });
  }

  window.addEventListener("load", () => ScrollTrigger.refresh());
}

/* ---------- Paneles de clases (traer al frente) ---------- */
const panels = [...document.querySelectorAll("[data-panel]")];
const switches = [...document.querySelectorAll("[data-show]")];
const bringFront = (i) => {
  panels.forEach((p, j) => p.classList.toggle("is-front", i === j));
  switches.forEach((s, j) => s.classList.toggle("is-active", i === j));
};
switches.forEach((s) => s.addEventListener("click", () => bringFront(Number(s.dataset.show))));
panels.forEach((p, i) => p.addEventListener("click", () => { if (!p.classList.contains("is-front")) bringFront(i); }));

// Elegir fecha de clase grupal
document.querySelectorAll("[data-chip]").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("[data-chip]").forEach((c) => c.classList.remove("is-selected"));
    chip.classList.add("is-selected");
  });
});
document.querySelector("[data-confirm]").addEventListener("click", (e) => {
  const panel = e.target.closest(".panel");
  const ok = panel.querySelector(".ok");
  ok.hidden = false;
  ok.textContent = panel.querySelector(".chip.is-selected")
    ? "Plaza apartada. Te enviamos el detalle por email."
    : "Elige primero una fecha.";
});
document.querySelectorAll("[data-form]").forEach((f) =>
  f.addEventListener("submit", (e) => { e.preventDefault(); f.querySelector(".ok").hidden = false; f.reset(); })
);

/* ---------- Cesta simulada ---------- */
const count = document.querySelector("[data-cart-count]");
document.querySelectorAll("[data-add]").forEach((b) =>
  b.addEventListener("click", () => {
    count.textContent = Number(count.textContent) + 1;
    b.textContent = "Añadido";
    if (hasGsap) gsap.fromTo(".bag", { scale: 1.25 }, { scale: 1, duration: 0.8, ease: "elastic.out(1, 0.4)" });
  })
);

/* ---------- Lightbox de la galería ---------- */
const lb = document.querySelector("[data-lightbox]");
document.querySelectorAll(".g").forEach((g) =>
  g.addEventListener("click", () => {
    lb.querySelector("img").src = g.querySelector("img").src.replace("w=900", "w=1800");
    lb.hidden = false;
    lenis && lenis.stop();
  })
);
const closeLb = () => { lb.hidden = true; lenis && lenis.start(); };
lb.addEventListener("click", closeLb);

/* ---------- Cursor magnético (lerp) ---------- */
const cursor = document.querySelector(".cursor");
let cx = innerWidth / 2, cy = innerHeight / 2, mx = cx, my = cy;
window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });
(function loop() {
  cx += (mx - cx) * 0.14;
  cy += (my - cy) * 0.14;
  cursor.style.transform = `translate(${cx}px, ${cy}px)`;
  requestAnimationFrame(loop);
})();
document.querySelectorAll("a, button, .g, .panel, h1, h2").forEach((el) => {
  el.addEventListener("mouseenter", () => cursor.classList.add("is-big"));
  el.addEventListener("mouseleave", () => cursor.classList.remove("is-big"));
});
