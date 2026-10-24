/* gracias.html: Stripe vuelve aquí con ?session_id=... y se pregunta al servidor
   si el pago está confirmado (el servidor lo comprueba con Stripe). */
(function () {
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("session_id");
  const text = document.querySelector("[data-thanks-text]");
  const eyebrow = document.querySelector("[data-thanks-eyebrow]");
  const ref = document.querySelector("[data-thanks-ref]");
  const cta = document.querySelector("[data-thanks-cta]");
  const money = (c) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  if (!sessionId) {
    text.textContent = "No encontramos ningún pago en curso.";
    return;
  }
  let tries = 0;
  async function check() {
    tries++;
    try {
      const res = await fetch(`api/checkout/status?session_id=${encodeURIComponent(sessionId)}`, { headers: { Accept: "application/json" } });
      const data = (await res.json()).data;
      if (data?.paid) {
        const order = data.type === "order";
        if (order) window.Cart?.clear();
        try { sessionStorage.removeItem("charria-checkout"); } catch { /* */ }
        eyebrow.textContent = order ? "Pedido confirmado" : "Reserva confirmada";
        text.textContent = order
          ? "Hemos recibido tu pedido. Te hemos enviado un email con el resumen y te avisaremos cuando salga del estudio."
          : "Tu plaza está reservada. Te hemos enviado un email con los detalles. ¡Nos vemos en el taller!";
        ref.textContent = `Referencia ${data.reference} · ${money(data.total_cents)}`;
        ref.hidden = false;
        if (!order && window.setButton) { cta.href = "index.html#clases"; window.setButton(cta, "Ver más clases"); }
        return;
      }
      if (data && ["cancelled", "refunded"].includes(data.status)) {
        eyebrow.textContent = "Pago no completado";
        text.textContent = "El pago no se ha completado o ha caducado. No se ha cobrado nada; puedes intentarlo de nuevo.";
        return;
      }
    } catch { /* reintenta */ }
    if (tries < 10) setTimeout(check, 2000);
    else text.textContent = "El pago se está procesando. Recibirás un email en cuanto se confirme.";
  }
  check();
})();
