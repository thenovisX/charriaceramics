/* reserva.html: página «Reserva confirmada» con todos los datos de la reserva.
   Llega de tres formas:
   - ?session_id=cs_…  Stripe vuelve aquí tras pagar (online o suscripción). Si el pago
                       aún se está confirmando se vuelve a preguntar unos segundos.
   - ?ref=CL-…&t=…     pago en el taller, clase privada y enlace del email (firmado).
   - ?preparando=1     pestaña que abre el formulario mientras se crea la reserva. */
(function () {
  const params = new URLSearchParams(location.search);
  const $ = (s) => document.querySelector(s);
  const eyebrow = $("[data-booking-eyebrow]");
  const title = $("[data-booking-title]");
  const text = $("[data-booking-text]");
  const card = $("[data-booking-card]");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (c) => (c / 100).toLocaleString("es-ES", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
  const date = (iso) => new Date(iso); // «2026-11-03T18:00:00» sin zona = hora de España, como la guarda el estudio
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const time = (iso) => date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const show = (eye, head, body) => { eyebrow.textContent = eye; title.textContent = head; text.textContent = body; };

  if (params.has("preparando")) {
    show("Tu reserva", "Un momento", "Estamos guardando tu plaza…");
    return;
  }
  const sessionId = params.get("session_id");
  const ref = params.get("ref");
  if (!sessionId && !ref) {
    show("Tu reserva", "No encontrada", "Este enlace no lleva a ninguna reserva. Revisa el email de confirmación o escríbenos.");
    return;
  }
  const query = sessionId ? `session_id=${encodeURIComponent(sessionId)}` : `ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(params.get("t") || "")}`;

  let tries = 0;
  async function load() {
    tries++;
    let b = null;
    try {
      const res = await fetch(`api/bookings/confirmation?${query}`, { headers: { Accept: "application/json" } });
      if (res.status === 404) {
        show("Tu reserva", "No encontrada", "No encontramos esta reserva. Revisa el enlace del email de confirmación o escríbenos.");
        return;
      }
      b = (await res.json()).data;
    } catch { /* reintenta */ }
    if (!b) {
      if (tries < 5) setTimeout(load, 2000);
      else show("Tu reserva", "Sin conexión", "Ahora mismo no podemos cargar tu reserva. Prueba de nuevo en un momento; también la tienes en tu email.");
      return;
    }
    if (b.status === "pending_payment") {
      // Stripe aún no ha confirmado el cobro: se espera un poco antes de enseñar nada
      show("Confirmando el pago", "Un momento", "Estamos comprobando el pago con Stripe. Solo tarda unos segundos…");
      if (tries < 10) setTimeout(load, 2000);
      else show("Pago en proceso", "Casi listo", "El pago se está procesando. Recibirás un email con tu reserva en cuanto se confirme.");
      return;
    }
    render(b);
  }

  function render(b) {
    const privateClass = b.kind === "private";
    const inPerson = b.payment_method === "in_person";
    const sub = b.payment_method === "subscription";
    try { sessionStorage.removeItem("charria-checkout"); } catch { /* */ }

    if (b.status === "cancelled") {
      show("Reserva anulada", "No completada", sessionId
        ? "El pago no se ha completado o ha caducado. No se ha cobrado nada y la plaza ha quedado libre; puedes reservar de nuevo."
        : "Esta reserva está anulada. Si crees que es un error, escríbenos.");
    } else if (privateClass) {
      show(b.status === "confirmed" ? "Clase privada confirmada" : "Solicitud recibida", b.status === "confirmed" ? "Confirmada" : "Solicitud enviada",
        b.status === "confirmed" ? "Tu clase privada está confirmada. ¡Nos vemos en el taller!" : "Te escribiremos en menos de 24 h para confirmar el día. Te hemos enviado un email con estos datos.");
    } else {
      show("Reserva confirmada", "Reserva confirmada", inPerson && !b.paid
        ? "Tu plaza está guardada. Te hemos enviado un email con estos datos. ¡Nos vemos en el taller!"
        : "Tu plaza está reservada y pagada. Te hemos enviado un email con estos datos. ¡Nos vemos en el taller!");
    }
    document.title = `${eyebrow.textContent} · ${b.reference} | Charria Ceramics`;
    // El enlace firmado sirve para volver a esta página (se guarda en la barra de direcciones)
    if (sessionId && b.link) try { history.replaceState(null, "", new URL(b.link).pathname + new URL(b.link).search); } catch { /* */ }

    $("[data-booking-code]").textContent = b.reference;
    const pending = b.status !== "cancelled" && !b.paid;
    const badge = $("[data-booking-badge]");
    badge.textContent = b.status === "cancelled" ? "Anulada" : privateClass && b.status !== "confirmed" ? "Por confirmar" : b.paid ? "Pagada" : "Pendiente de pago";
    badge.className = `booking-card__badge${b.status === "cancelled" ? " is-off" : pending ? " is-pending" : " is-paid"}`;

    const notice = $("[data-booking-notice]");
    if (b.status !== "cancelled" && inPerson && !b.paid) {
      notice.innerHTML = `<strong>Pendiente de pago.</strong> Pagas ${esc(money(b.total_cents))} en el taller ${privateClass ? "el día de la clase" : "el día de la clase, antes de empezar"}: efectivo, tarjeta o Bizum.`;
      notice.hidden = false;
    }

    const rows = [];
    const row = (label, html) => rows.push(`<div><dt>${esc(label)}</dt><dd>${html}</dd></div>`);
    row(privateClass ? "Clase privada" : "Clase", esc(b.class_title));
    if (b.starts_at) {
      const d = date(b.starts_at);
      row("Día", esc(cap(d.toLocaleDateString("es-ES", { weekday: "long" }))));
      row("Fecha", esc(d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })));
      row("Hora", esc(time(b.starts_at) + (b.ends_at ? ` – ${time(b.ends_at)}` : "")) + (b.duration_minutes ? ` <small>(${esc(duration(b.duration_minutes))})</small>` : ""));
    } else if (b.preferred_date) {
      const d = date(`${b.preferred_date}T12:00:00`);
      row("Día preferido", esc(cap(d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))));
      if (b.preferred_slot) row("Franja", esc(b.preferred_slot));
    }
    if (!privateClass) row("Personas", `${b.seats} ${b.seats === 1 ? "plaza" : "plazas"}`);
    const unit = `${money(b.unit_price_cents)}${sub ? " al mes" : ""}${b.seats > 1 ? " por plaza" : ""}`;
    row("Precio", esc(b.seats > 1 ? `${unit} · total ${money(b.total_cents)}${sub ? " al mes" : ""}` : unit));
    row("Pago", esc(payment(b)));
    row("A nombre de", esc(b.customer.name));
    row("Email", esc(b.customer.email));
    if (b.customer.phone) row("Teléfono", esc(b.customer.phone));
    const s = b.studio || {};
    const place = [s.address, s.city].filter(Boolean).map(esc).join("<br>") || "Charria Ceramics · Tomiño, Pontevedra";
    row("Dónde", s.maps_url ? `<a href="${esc(s.maps_url)}" target="_blank" rel="noopener">${place}</a>` : place);
    row("Reservada el", esc(date(b.created_at).toLocaleString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })));
    $("[data-booking-list]").innerHTML = rows.join("");

    const contact = [s.email && `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`, s.phone && `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ""))}">${esc(s.phone)}</a>`].filter(Boolean).join(" · ");
    $("[data-booking-foot]").innerHTML = b.status === "cancelled" ? "" : `Si no puedes venir, avísanos con al menos 72 horas de antelación para cambiar la fecha o liberar tu plaza${contact ? `: ${contact}` : ""}.`;

    const ics = $("[data-booking-ics]");
    ics.hidden = !b.starts_at || b.status === "cancelled";
    ics.onclick = () => downloadIcs(b, place.replace(/<br>/g, ", "));
    $("[data-booking-print]").onclick = () => window.print();
    card.hidden = false;
  }

  function payment(b) {
    if (b.status === "cancelled") return "Sin cobrar";
    if (b.payment_method === "subscription") return b.paid ? "Suscripción mensual con tarjeta · primera cuota pagada" : "Suscripción mensual con tarjeta · pendiente";
    if (b.payment_method === "online") return b.paid ? "Pagada online con tarjeta" : "Pendiente de pago online";
    return b.paid ? "Pagada en el taller" : "Por pagar en el taller (efectivo, tarjeta o Bizum)";
  }

  function duration(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
  }

  // Archivo .ics para el calendario del móvil u ordenador (hora local, sin zona)
  function downloadIcs(b, where) {
    const stamp = (iso) => iso.replace(/[-:]/g, "").slice(0, 15);
    const line = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Charria Ceramics//Reservas//ES", "BEGIN:VEVENT",
      `UID:${b.reference}@charriaceramics`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART:${stamp(b.starts_at)}`, b.ends_at ? `DTEND:${stamp(b.ends_at)}` : "DURATION:PT2H",
      `SUMMARY:${line(`${b.class_title} · Charria Ceramics`)}`,
      `LOCATION:${line(where)}`,
      `DESCRIPTION:${line(`Reserva ${b.reference} · ${b.seats} ${b.seats === 1 ? "plaza" : "plazas"} · ${payment(b)}`)}`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = `reserva-${b.reference}.ics`;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  load();
})();
