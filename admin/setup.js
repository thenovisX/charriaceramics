// Instalación inicial: llama a POST /api/setup una sola vez
const form = document.querySelector("[data-setup-form]");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = form.querySelector("[data-error]");
  const btn = form.querySelector("button");
  err.hidden = true;
  btn.disabled = true;
  const f = form.elements;
  try {
    const res = await fetch("../api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: f.token.value, name: f.name.value, email: f.email.value, password: f.password.value, seed: f.seed.checked }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const fields = Object.values(json.error?.fields || {}).join(" · ");
      throw new Error((json.error?.message || `Error ${res.status}`) + (fields ? ` (${fields})` : ""));
    }
    form.querySelector("[data-ok]").hidden = false;
    btn.hidden = true;
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
