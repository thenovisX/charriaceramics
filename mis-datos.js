/* ==========================================================
   Charria Ceramics · Mis datos (mis-datos.html)
   1. Sin parámetros: formulario para pedir copia, borrado o baja.
      El servidor envía un enlace de un solo uso al email.
   2. ?token=…: al pulsar «Confirmar» se ejecuta la solicitud (nunca al
      abrir el enlace, que los antivirus del correo abren solos).
   3. ?baja=email&firma=…: enlace de baja de las comunicaciones.
   ========================================================== */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const params = new URLSearchParams(location.search);
  const form = $("[data-privacy-form]");
  const confirmBox = $("[data-privacy-confirm]");
  const text = $("[data-confirm-text]");
  const eyebrow = $("[data-confirm-eyebrow]");
  const btn = $("[data-confirm-btn]");

  async function post(path, body) {
    const res = await fetch(`api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      const err = new Error(json?.error?.message || "No se pudo conectar. Inténtalo de nuevo en unos minutos.");
      err.fields = json?.error?.fields || {};
      throw err;
    }
    return json.data;
  }

  const show = (msg, isError = false) => {
    text.textContent = msg;
    text.classList.toggle("form__ok--error", isError);
  };
  const done = () => { btn.hidden = true; $("[data-confirm-back]").hidden = false; };

  function download(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mis-datos-charria-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function summary(s) {
    const kept = s.orders_kept + s.bookings_kept;
    return "Listo: hemos borrado tus datos." + (kept
      ? ` Conservamos bloqueados ${kept === 1 ? "1 pedido o reserva pagado" : `${kept} pedidos o reservas pagados`} solo porque la ley nos obliga a guardar las facturas durante 6 años; después se anonimizarán.`
      : "");
  }

  function confirmMode(label, action) {
    form.hidden = true;
    confirmBox.hidden = false;
    eyebrow.textContent = label;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await action();
        done();
      } catch (e) {
        show(e.message, true);
        done();
      } finally {
        btn.disabled = false;
      }
    });
  }

  const token = params.get("token");
  const baja = params.get("baja");
  if (token) {
    show("Pulsa el botón para confirmar tu solicitud.");
    confirmMode("Confirmar solicitud", async () => {
      const res = await post("privacy/confirm", { token });
      if (res.type === "export") {
        download(res.data);
        show("Tu archivo se ha descargado. Contiene tu perfil, tus pedidos y reservas y los permisos que nos diste.");
      } else if (res.type === "delete") {
        show(summary(res.summary));
      } else {
        show(res.unsubscribed ? "Te has dado de baja: no volverás a recibir comunicaciones comerciales." : "Este email no estaba dado de alta en las comunicaciones comerciales.");
      }
    });
    history.replaceState(null, "", "mis-datos.html"); // que el enlace no quede en el historial
  } else if (baja) {
    show(`¿Quieres dejar de recibir comunicaciones comerciales en ${baja}?`);
    confirmMode("Darse de baja", async () => {
      const res = await post("privacy/unsubscribe", { email: baja, signature: params.get("firma") || "" });
      show(res.unsubscribed ? "Te has dado de baja: no volverás a recibir comunicaciones comerciales." : "Este email ya no estaba dado de alta en las comunicaciones comerciales.");
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = $(".form__ok", form);
    const submit = $("button[type=submit]", form);
    const field = form.elements.email.closest(".form__field");
    field.classList.remove("is-invalid");
    if (!form.elements.email.value.trim() || !form.elements.email.checkValidity()) {
      field.classList.add("is-invalid");
      form.elements.email.focus();
      return;
    }
    submit.disabled = true;
    ok.hidden = true;
    try {
      await post("privacy/request", { email: form.elements.email.value.trim(), type: form.elements.type.value });
      ok.textContent = "Te hemos enviado un email con un enlace para confirmar. Caduca en 24 horas; si no lo ves, mira en la carpeta de spam.";
      ok.classList.remove("form__ok--error");
      form.elements.email.value = "";
    } catch (err) {
      ok.textContent = err.message;
      ok.classList.add("form__ok--error");
    } finally {
      ok.hidden = false;
      submit.disabled = false;
    }
  });
})();
