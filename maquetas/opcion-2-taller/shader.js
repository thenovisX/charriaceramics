/* ==========================================================
   Fondo de "barro líquido" con Three.js
   Plano a pantalla completa con un fragment shader que se
   deforma suavemente y reacciona a la posición del ratón.
   ========================================================== */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const canvas = document.querySelector(".webgl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uTime: { value: 0 },
  uMouse: { value: new THREE.Vector2(0.5, 0.5) },
  uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uScroll: { value: 0 },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform vec2 uRes;
    uniform float uScroll;

    // Ruido simple por valor
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = vUv;
      vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 2.2;
      float t = uTime * 0.05;

      // El ratón empuja el "barro"
      vec2 m = uMouse * vec2(uRes.x / uRes.y, 1.0) * 2.2;
      float d = distance(p, m);
      p += (p - m) * 0.25 * exp(-d * 2.0);

      // Warp de dominio para aspecto líquido
      vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
      vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 1.5), fbm(p + 3.0 * q + vec2(8.3, 2.8)));
      float f = fbm(p + 3.0 * r + uScroll * 0.6);

      vec3 coal  = vec3(0.105, 0.090, 0.078);
      vec3 umber = vec3(0.26, 0.17, 0.12);
      vec3 clay  = vec3(0.55, 0.30, 0.20);
      vec3 col = mix(coal, umber, smoothstep(0.2, 0.75, f));
      col = mix(col, clay, smoothstep(0.62, 0.95, f) * 0.55);
      col += 0.05 * exp(-d * 3.0) * clay;

      // Viñeta
      col *= 1.0 - 0.55 * length(uv - 0.5);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
};
resize();
window.addEventListener("resize", resize);

const target = new THREE.Vector2(0.5, 0.5);
window.addEventListener("mousemove", (e) => target.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight));

const clock = new THREE.Clock();
(function tick() {
  uniforms.uTime.value = clock.getElapsedTime();
  uniforms.uMouse.value.lerp(target, 0.05);
  uniforms.uScroll.value += (window.scrollY / innerHeight - uniforms.uScroll.value) * 0.05;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
})();
