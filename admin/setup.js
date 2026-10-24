// Instalación inicial: datos de MySQL + primer usuario del panel (POST /api/setup, una sola vez)
const $ = (sel) => document.querySelector(sel);
const form = $("[data-setup-form]");
const show = (sel) => { $("[data-checking]").hidden = true; $(sel).hidden = false; };

fetch("../api/setup")
  .then((res) => res.ok ? res.json() : Promise.reject(new Error(res.status)))
  .then((json) => {
    if (json.data?.installed) { show("[data-installed]"); return; }
    show("[data-setup-form]");
    form.elements["db.name"].focus();
  })
  .catch(() => {
    show("[data-setup-form]");
    showError("No se puede hablar con el servidor. Comprueba que la web está publicada en Hostinger (PHP 8.1 o superior).");
  });

function showError(msg) {
  const err = $("[data-error]");
  err.textContent = msg;
  err.hidden = false;
}

function markFields(fields) {
  form.querySelectorAll(".field").forEach((f) => { f.classList.remove("has-error"); f.querySelector(".field-error")?.remove(); });
  Object.entries(fields).forEach(([name, msg]) => {
    const field = form.elements[name]?.closest(".field");
    if (!field) return;
    field.closest("details")?.setAttribute("open", "");
    field.classList.add("has-error");
    const span = document.createElement("span");
    span.className = "field-error";
    span.textContent = msg;
    field.appendChild(span);
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = form.querySelector("button[type=submit]");
  const f = form.elements;
  $("[data-error]").hidden = true;
  markFields({});
  const missing = {};
  ["db.name", "db.user", "email"].forEach((n) => { if (!f[n].value.trim()) missing[n] = "Obligatorio"; });
  if (f.password.value.length < 10) missing.password = "Mínimo 10 caracteres";
  if (Object.keys(missing).length) { markFields(missing); return; }

  btn.disabled = true;
  btn.textContent = "Instalando…";
  try {
    const res = await fetch("../api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        db: { host: f["db.host"].value.trim(), port: Number(f["db.port"].value) || 3306, name: f["db.name"].value.trim(), user: f["db.user"].value.trim(), pass: f["db.pass"].value },
        name: f.name.value.trim(), email: f.email.value.trim(), password: f.password.value, seed: f.seed.checked,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (json.error?.code === "already_installed") { form.hidden = true; show("[data-installed]"); return; }
      markFields(json.error?.fields || {});
      throw new Error(json.error?.message || `Error ${res.status}`);
    }
    form.hidden = true;
    $("[data-warn-config]").hidden = json.data?.config_outside_public_html !== false;
    show("[data-done]");
  } catch (ex) {
    showError(ex.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Instalar la web";
  }
});
