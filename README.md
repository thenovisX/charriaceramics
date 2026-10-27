# Charria Ceramics · Web, tienda y reservas

Web editorial de Charria Ceramics (HTML/CSS/JS) con un **backend API REST en PHP 8 + MySQL** pensado para Hostinger:

- Tienda con **cesta lateral** (off‑canvas), pago con **Stripe Checkout** y envíos con **Packlink PRO**.
- **Precios, descuentos, envío y total se calculan solo en el servidor**. El navegador envía únicamente IDs y cantidades.
- **Reservas de clases** en grupo (con plazas por horario y pago online o en el taller) y solicitudes de **clase privada**.
- **Galería** gestionada desde el panel, con validación de formato, peso y proporciones.
- **Panel de administración** (`/admin`) con login seguro: productos, stock, descuentos, interruptor “Agotado”, clases, horarios, precios, reservas, pedidos, galería y clientes.
- **RGPD, LOPDGDD y LSSI**: páginas legales, aviso de cookies con Google Analytics solo con permiso, casillas de consentimiento, perfiles de cliente opcionales, derecho de supresión y exportación (ver [Privacidad y RGPD](#privacidad-y-rgpd)).
- La API está separada del frontend: cualquier otra web puede reutilizarla (ver [Reutilizar la API](#reutilizar-la-api-en-otra-web)).

Sin Composer ni dependencias: se sube tal cual a `public_html`.

---

## Índice

1. [Arquitectura](#arquitectura)
2. [Estructura de carpetas](#estructura-de-carpetas)
3. [Puesta en marcha en Hostinger (paso a paso)](#puesta-en-marcha-en-hostinger-paso-a-paso)
4. [Variables de entorno](#variables-de-entorno)
5. [Cómo funciona](#cómo-funciona)
6. [Seguridad](#seguridad)
7. [Privacidad y RGPD](#privacidad-y-rgpd)
8. [Referencia de la API](#referencia-de-la-api)
9. [Funciones del backend](#funciones-del-backend)
10. [Panel de administración](#panel-de-administración)
11. [Desarrollo local y tests](#desarrollo-local-y-tests)
    - [Herramientas para IA (Repomix y Graphify)](#herramientas-para-ia-repomix-y-graphify)
12. [Reutilizar la API en otra web](#reutilizar-la-api-en-otra-web)
13. [Mantenimiento y preguntas frecuentes](#mantenimiento-y-preguntas-frecuentes)

---

## Arquitectura

```
 Navegador (index, productos, galeria, contacto, gracias)        Panel /admin
   script.js · cart.js · gracias.js                               admin.js
        │  fetch JSON                                                │ Authorization: Bearer <token>
        ▼                                                            ▼
 ┌──────────────────────────── /api/index.php (router) ─────────────────────────────┐
 │ Controladores: Public · Checkout · Booking · Webhook · Auth · Admin/*            │
 │ Servicios: Pricing · Shipping · Stripe · Packlink · Fulfillment · ImageProcessor │
 │            Auth · RateLimiter · Catalog · Customers · Mailer · Log               │
 └───────────────┬───────────────────────────┬──────────────────────┬───────────────┘
                 ▼                           ▼                      ▼
              MySQL                  api.stripe.com           api.packlink.com
```

- **Frontend**: las páginas piden los datos a la API. Si la API no responde (por ejemplo al abrir la web con Live Server, sin PHP), se usa `data.js` como copia de respaldo y la compra queda desactivada con un aviso.
- **Backend**: `api/index.php` es el único punto de entrada; todo el código está en `backend/` (no accesible desde la web).
- **Pagos**: el cliente paga en la página segura de Stripe. Este servidor nunca ve datos de tarjeta. El pedido se marca como pagado **solo** cuando llega el webhook firmado de Stripe (o cuando el servidor lo confirma consultando a Stripe).

## Estructura de carpetas

```
public_html/
├── index.html, productos.html, producto.html, galeria.html, contacto.html, checkout.html, gracias.html
├── style.css, script.js, cart.js, checkout.js, gracias.js, data.js (respaldo)
├── .htaccess              ← bloquea .env, .git, backend/, *.sql, *.md… y fuerza HTTPS
├── api/
│   ├── index.php          ← punto de entrada de la API
│   └── .htaccess          ← reescribe /api/* a index.php y pasa la cabecera Authorization
├── admin/                 ← panel (HTML/CSS/JS estático; los datos exigen token)
│   ├── index.html, admin.css, admin.js
│   ├── setup.html, setup.js  ← instalación inicial (una sola vez)
│   └── .htaccess          ← noindex, sin iframes, CSP estricta
├── uploads/               ← imágenes subidas (NO va en git) · .htaccess impide ejecutar código
└── backend/               ← .htaccess: "Require all denied"
    ├── bootstrap.php      ← autoload, .env, zona horaria, errores
    ├── routes.php         ← todas las rutas de la API
    ├── dev-router.php     ← servidor local: php -S localhost:8000 backend/dev-router.php
    ├── .env.example       ← plantilla de configuración
    ├── database/schema.sql, seed.sql
    ├── bin/create-admin.php, cleanup.php
    ├── storage/logs/      ← app.log y php-errors.log
    ├── tests/api-test.php, mock-stripe.php
    └── src/
        ├── Env.php, Database.php, Validator.php
        ├── Http/ Request, Response, Router, HttpError
        ├── Controllers/ Public, Checkout, Booking, Webhook, Auth
        ├── Controllers/Admin/ ProductAdmin, ClassAdmin, GalleryAdmin, OrderAdmin
        └── Services/ Auth, Catalog, Customers, Fulfillment, ImageProcessor, Log,
                      Mailer, Packlink, Pricing, RateLimiter, Settings, Shipping, Stripe
```

## Puesta en marcha en Hostinger (paso a paso)

Requisitos: cualquier plan de Hostinger con PHP 8.1 o superior (recomendado 8.2/8.3), MySQL y SSL activado. Extensiones PHP necesarias (vienen activadas por defecto en Hostinger): `pdo_mysql`, `curl`, `gd` (con WebP), `fileinfo`, `mbstring`, `openssl`, `exif`.

### 1. Base de datos MySQL
hPanel → **Bases de datos → Gestión** → crea una base de datos y un usuario (anota nombre, usuario y contraseña; Hostinger les añade un prefijo tipo `u123456789_`). No hay que importar nada.

### 2. Desplegar el código
hPanel → **Avanzado → GIT** → **Deploy** de la rama configurada en `public_html`. La configuración (`.env`) y la carpeta `uploads/` no están en git, así que los despliegues no las tocan.

### 3. Instalar desde el navegador (una sola vez)
1. Abre la web. Mientras no esté instalada, cualquier página te lleva sola a `https://tudominio.com/admin/setup.html`.
2. Escribe el **nombre, usuario y contraseña de la base de datos** del paso 1 (en “Opciones avanzadas” el servidor es `localhost`, que es lo normal en Hostinger), y tu **nombre, email y contraseña del panel** (mínimo 10 caracteres). Deja marcado “Cargar las piezas…” para empezar con el catálogo actual.
3. El instalador prueba la conexión (si algo está mal, marca el campo), guarda la configuración en un `.env` **por encima de `public_html`** (`/home/u123456789/domains/tudominio.com/.env`, o si el hosting no lo permite en `public_html/backend/.env`, bloqueado por `.htaccess`) con una clave `APP_KEY` aleatoria, crea las tablas y tu usuario.
4. Desde ese momento la web abre normal y el instalador queda cerrado para siempre (responde `409` en cuanto existe un administrador).

Alternativas: subir tú el `.env` (ver `backend/.env.example`) y después abrir el instalador con los mismos datos de MySQL, o por SSH `php backend/bin/create-admin.php tu@email.com "Tu nombre"`.

### 4. Panel → Ajustes: Stripe
Todo lo que sigue se escribe en `https://tudominio.com/admin/` → **Ajustes**. Las claves se guardan **cifradas** en la tabla `settings` (libsodium con la `APP_KEY` del `.env`, que no está en la base de datos) y nunca se vuelven a mostrar: el panel solo enseña los 4 últimos caracteres.
1. Crea la cuenta en [dashboard.stripe.com](https://dashboard.stripe.com) y empieza en **modo de prueba**.
2. **Desarrolladores → Claves de API** → copia la **clave secreta** (`sk_test_…`) en “Clave secreta”.
3. **Desarrolladores → Webhooks → Añadir destino**: pega la URL que muestra el panel (`https://tudominio.com/api/webhooks/stripe`) y marca los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` y, para las suscripciones de las clases, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`. Copia su **secreto de firma** (`whsec_…`) en “Secreto del webhook”.
4. **Guardar ajustes** y **Probar conexión con Stripe**. La etiqueta indica “Modo prueba” o “Modo real”.
5. Prueba una compra con la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC).
6. Para cobrar de verdad: activa la cuenta, pon la clave `sk_live_…` y crea el webhook también en modo live (tiene otro `whsec_`).

### 5. Panel → Ajustes: Packlink PRO (opcional, recomendado)
1. En [pro.packlink.es](https://pro.packlink.es) → **Configuración → API** → genera la **API key** y pégala en Ajustes.
2. Rellena el **remitente** (dirección del estudio, teléfono y email) y pulsa **Probar conexión con Packlink**.
3. Pon peso y medidas en cada producto desde el panel para que las tarifas sean exactas.
4. Funcionamiento: en la cesta se muestran las 4 tarifas más baratas a domicilio para el código postal del cliente. Al pagarse el pedido se crea automáticamente un **borrador de envío** en Packlink PRO con la referencia del pedido; desde Packlink eliges recogida, pagas y descargas la etiqueta. Si algo falla, el pedido sigue pagado y puedes reintentarlo desde el panel (“Crear envío en Packlink”).
5. Sin API key se usa la tarifa plana de “Opciones de envío”, así que se puede vender desde el primer día. Ahí también eliges recogida en estudio, envío gratis desde un importe y un suplemento sobre Packlink.

### 6. Panel → Ajustes: Emails
Crea un buzón del dominio (hPanel → **Emails**), p. ej. `hola@tudominio.com`, y ponlo como remitente y como buzón de avisos. Se envían avisos de pedido pagado, reserva confirmada, solicitud de clase privada y mensajes del formulario de contacto (con `mail()` de PHP).

### 7. Prioridad de la configuración
Ajustes del panel → variables reales del servidor → `.env`. Todo lo de Ajustes también se puede poner en el `.env` (útil para otra web que reutilice la API); si el panel tiene un valor, manda el panel. Con “Borrar” en una clave del panel se vuelve a usar la del `.env`.

### 8. Tarea programada (opcional)
hPanel → **Avanzado → Cron Jobs** → una vez al día:
```
php /home/u123456789/domains/tudominio.com/public_html/backend/bin/cleanup.php
```
Marca como cancelados los pedidos y reservas que nunca se pagaron y limpia sesiones caducadas. La web funciona igual sin ella.

## Variables de entorno

Las marcadas con ⚙️ se pueden poner también (y mejor) en **Panel → Ajustes**, que tiene prioridad.

| Variable | Obligatoria | Por defecto | Para qué sirve |
|---|---|---|---|
| `APP_URL` | Sí | `http://localhost:8000` | URL pública sin barra final. Se usa en las direcciones de vuelta de Stripe. |
| `APP_TIMEZONE` | No | `Europe/Madrid` | Zona horaria de PHP y MySQL (horarios de clases). |
| `APP_DEBUG` | No | `false` | `true` muestra el detalle de los errores. **Nunca en producción.** |
| `CORS_ALLOWED_ORIGINS` | No | vacío | Otras webs que pueden llamar a la API desde el navegador, separadas por comas. |
| `APP_KEY` | Recomendado | — | 32 bytes en base64 que cifran las claves guardadas desde el panel. La crea el instalador; **no la cambies** o habrá que volver a escribir las claves en Ajustes. |
| `SESSION_TTL_HOURS` | No | `12` | Duración de la sesión del panel. |
| `DB_HOST` / `DB_PORT` | No | `localhost` / `3306` | Servidor MySQL. |
| `DB_NAME` / `DB_USER` / `DB_PASS` | Sí | — | Base de datos creada en hPanel. |
| `STRIPE_SECRET_KEY` ⚙️ | Para cobrar | — | Clave secreta `sk_test_…` o `sk_live_…`. Sin ella la compra y las reservas en grupo muestran “pagos no activos”. |
| `STRIPE_WEBHOOK_SECRET` ⚙️ | Para cobrar | — | `whsec_…` del endpoint de webhook. |
| `CURRENCY` | No | `eur` | Moneda. |
| `CHECKOUT_HOLD_MINUTES` | No | `30` | Minutos que se retienen stock y plazas mientras se paga (mínimo 30, lo exige Stripe). |
| `SHIPPING_PICKUP` ⚙️ | No | `true` | Ofrecer recogida gratis en el estudio. |
| `SHIPPING_FLAT_CENTS` / `SHIPPING_FLAT_NAME` ⚙️ | No | `690` / `Envío estándar 48/72 h` | Tarifa plana si no hay Packlink o no responde. |
| `SHIPPING_FREE_FROM_CENTS` ⚙️ | No | `0` | Envío gratis (la opción más barata) desde este importe. `0` = nunca. |
| `SHIPPING_BOX_CM` / `SHIPPING_PACKAGING_GRAMS` | No | `30x30x30` / `600` | Caja mínima y peso del embalaje. |
| `PACKLINK_API_KEY` ⚙️ | No | — | Activa las tarifas reales y los borradores de envío. |
| `PACKLINK_API_URL` | No | `https://api.packlink.com/v1` | URL de la API de Packlink. |
| `SHIPPING_MARKUP_CENTS` ⚙️ | No | `0` | Suplemento sumado a cada tarifa de Packlink. |
| `SHIPPING_MAX_OPTIONS` | No | `4` | Cuántas tarifas de Packlink mostrar. |
| `PACKLINK_CONTENT` | No | `Cerámica artesanal` | Descripción del contenido del paquete. |
| `PACKLINK_SENDER_*` ⚙️ | Con Packlink | — | Remitente: `NAME`, `SURNAME`, `COMPANY`, `STREET`, `ZIP`, `CITY`, `COUNTRY`, `PHONE`, `EMAIL`. |
| `MAIL_FROM` / `MAIL_ADMIN` ⚙️ | Recomendado | — | Remitente de los emails y buzón que recibe los avisos. |
| `MAIL_DISABLED` | No | `false` | Desactiva el envío de emails (útil en pruebas). |
| `UPLOAD_MAX_MB` | No | `10` | Peso máximo de cada imagen subida. |
| `UPLOADS_URL` | No | `/uploads` | URL pública de la carpeta de imágenes. |

## Cómo funciona

### Precios calculados solo en el servidor
1. El navegador guarda en la cesta solo `{id, cantidad}` (más título y foto para pintarla rápido).
2. Al abrir la cesta llama a `POST /api/cart/quote` y muestra **los importes que devuelve el servidor**.
3. Al pagar envía `POST /api/checkout` con productos, cantidades, datos de contacto y la **opción** de envío elegida. El servidor:
   - lee precio y descuento de cada producto en MySQL **bloqueando las filas** (`SELECT … FOR UPDATE`) para que dos personas no compren la misma última pieza;
   - vuelve a calcular las tarifas de envío y busca la opción elegida (el precio del envío tampoco lo decide el navegador);
   - crea el pedido `pending`, que **retiene el stock** durante `CHECKOUT_HOLD_MINUTES`;
   - crea la sesión de Stripe Checkout con esos importes y devuelve la URL de pago.
4. Stripe avisa al webhook → el pedido pasa a `paid`, se descuenta el stock, se crea el borrador en Packlink y se envían los emails. Si el pago caduca, el pedido pasa a `cancelled` y el stock se libera.

Cualquier campo de precio que mande el navegador **se ignora** (hay un test que lo comprueba).

**Descuentos**: `precio final = precio × (100 − descuento) / 100`, redondeado al céntimo. Los precios incluyen IVA.

**Agotado**: una pieza aparece agotada si el interruptor manual está activado **o** si `stock − unidades retenidas = 0`. Al público no se le muestra el stock exacto.

### Reservas
- **Formas de pago de una clase en grupo**: cada clase activa por separado *pago único online* (`pay_online`), *suscripción mensual* (`pay_subscription` + cuota `monthly_price_cents`, Stripe Checkout en modo `subscription` con el precio creado al vuelo, sin productos que configurar en Stripe) y *pagar en el taller* (`pay_in_person`). Al reservar se elige entre las activas (si solo hay una no se pregunta) con `payment_method`: `online`, `subscription` o `in_person`. En suscripciones, `invoice.paid` (renovación) pone `paid_at`/`paid_until`, `invoice.payment_failed` deja la reserva sin pagar (`subscription_status = past_due`, aviso por email y filtro «Por cobrar» del panel) y `customer.subscription.deleted` la marca `canceled`. La baja de una suscripción se hace desde Stripe → Suscripciones. Migración 6 (automática).
- **Cómo se ve una clase en la web** (migración 9): `classes.price_period` (`session` o `month`, interruptor «El precio es mensual») pone una etiqueta «por mes» bajo el precio; si la clase tiene cuota de suscripción, la web enseña esa cuota. `classes.show_date = 0` («Enseñar el día y la hora» apagado) quita el día y la hora de la fila y del modal: se reserva la próxima sesión con plazas y la fecha va igualmente en el email. Las clases que ya tenían suscripción pasan solas a «por mes».
- **Clases semanales** (migración 10, `Services/WeeklySchedule.php`, `Controllers/Admin/WeeklyAdminController.php`): en Panel → Clases → «Semanales» se dice, de lunes a domingo, si el día sale en la web (`weekly_days`) y qué clases hay ese día, a qué hora, a qué precio (por clase o por mes) y con cuántas plazas (`weekly_slots`; vacío = lo de la clase). `GET/PUT /admin/weekly` 🔒 lee y guarda la semana entera. Las fechas reservables siguen siendo `class_sessions` con `slot_id`: `WeeklySchedule::sync()` crea las de las próximas 8 semanas en cada `GET /classes` (sin cron), cambiar la hora mueve las fechas y sus reservas, y apagar un día o quitar una clase borra las fechas sin reservas y cancela (sin borrar) las que tienen. `GET /classes` devuelve `weekly` (días abiertos con sus clases) y la web los enseña arriba del todo, en «Semanales»; debajo quedan las «Fechas especiales». En una clase semanal «por mes», todas las formas de pago cobran ese precio mensual. Al actualizar, los horarios que ya se repetían cada semana pasan solos a Semanales.
- **Clases en grupo**: cada clase tiene horarios (`class_sessions`) con plazas y precio propios opcionales. Al reservar se retienen las plazas mientras se paga y la reserva se confirma con el webhook de Stripe. No se puede reservar más de lo que queda (se bloquea el horario en la base de datos).
- **Pagar en el taller**: si la clase lo admite (`classes.pay_in_person`, interruptor «Se puede pagar en el taller» en Panel → Clases, activo por defecto), el cliente elige al reservar entre pagar online o en el taller. En el taller la reserva queda `confirmed` con `payment_method = in_person` y `paid_at` vacío: ocupa plaza, no caduca (ni `CHECKOUT_HOLD_MINUTES` ni `cleanup.php` la tocan) y se envía el email de confirmación con «Pago: en el taller». En Panel → Reservas → «Por cobrar en el taller» se marca como cobrada (`paid_at`), y así cuenta en «Clases cobradas». Funciona aunque Stripe no esté configurado. Límite extra: 5 reservas sin pago por hora e IP. Borrar los datos de un cliente (RGPD) cancela sus reservas sin cobrar y libera la plaza.
- **Clases privadas**: cada modalidad (1 persona, 2 personas, pack…) es una clase de tipo `private`. El cliente envía fecha y franja preferidas; queda como `requested` (`payment_method = in_person`) y el estudio la confirma desde el panel y la marca como cobrada cuando le paguen.
- **Calendario de reservas** (`Controllers/Admin/CalendarAdminController.php`, `Services/PaymentAlerts.php`, migración 6): `GET /admin/calendar?from&to` devuelve las reservas por día; `POST /admin/bookings` añade una a mano (`source = manual`, siempre `in_person`, sin comprobar plazas). Cada reserva tiene `billing_type`: `single` (pago único) o `subscription` (cuota mensual; sale cada semana, el mismo día y hora, hasta cancelarla) y se marca cobrada con `PATCH /admin/bookings/{id} {paid}` (`paid_at`; en una suscripción es el último cobro y «al día» significa cobrada este mes). **Avisos**: una suscripción sin cobrar a partir del día 8 del mes (`PaymentAlerts::GRACE_DAY`) y un pago único cuya clase ya pasó sin cobrar salen en Panel → Calendario, en el contador del menú y en Resumen (`payments_overdue`), y se envían por email a `MAIL_ADMIN` (repite cada 7 días hasta cobrarlo). El email se comprueba en cada petición a la API (sin cron).
- **Mensajes**: el formulario de contacto (`POST /contact`) y cada solicitud de clase privada se guardan en la tabla `messages` y salen en **Panel → Mensajes** (además del email al estudio si hay `MAIL_ADMIN`). El motivo «Encargo personalizado» se guarda como tipo `request` (encargo); el resto, como `contact`; las clases privadas, como `private_class` enlazadas a su reserva. Confirmar o cancelar la reserva deja el mensaje atendido; borrar el mensaje no toca la reserva. Los motivos que cuentan como encargo están en `Messages::REQUEST_REASONS`.
- **Repositorio de referencia**: el encargo mencionaba un sistema de reservas anterior, pero no llegó el enlace. Este sistema se ha construido sobre la interfaz de reservas que ya tenía la web; si quieres incorporar algo de ese repositorio, se puede adaptar.

### Imágenes (galería, productos y clases)
`ImageProcessor` valida cada subida en el servidor antes de guardarla:

| Tipo | Proporciones permitidas | Ancho mínimo | Lado máximo guardado | Peso objetivo |
|---|---|---|---|---|
| Producto | 4:5 | 800 px | 1600 px | ~350 KB |
| Galería | 16:10, 3:4, 4:5, 1:1, 21:9, 4:3, 3:2, 2:3 | 1200 px | 2200 px | ~650 KB |
| Clase | 4:5, 1:1, 4:3, 3:4 | 600 px | 1200 px | ~250 KB |
| Web (foto del estudio) | 4:5, 3:4, 1:1, 4:3, 3:2 | 1000 px | 2000 px | ~450 KB |

- Formato comprobado por el contenido real del archivo (JPG, PNG o WebP); un `.php` renombrado a `.jpg` se rechaza.
- Peso máximo de subida `UPLOAD_MAX_MB`; tamaño máximo 36 megapíxeles.
- Proporción con un 2 % de margen. Si no encaja se rechaza con un mensaje claro, o se recorta al centro si se marca “Recortar automáticamente”.
- Se corrige la orientación de las fotos del móvil (EXIF), se eliminan los metadatos (incluida la ubicación GPS) y se guarda en **WebP** (o JPEG si el servidor no tiene WebP) más una miniatura.

## Seguridad

- **Autenticación del panel**: tokens aleatorios de 256 bits; en la base de datos solo se guarda su hash SHA‑256. Cada petición a `/api/admin/*` comprueba el token, su caducidad y que el administrador siga activo. Cerrar sesión o cambiar la contraseña invalida los tokens al momento.
- Contraseñas con `password_hash()` (bcrypt) y rehash automático; mínimo 10 caracteres.
- **Límite de intentos**: login 5 fallos / 15 min por IP y por email; checkout, reservas, contacto y cálculo de envío también limitados.
- **SQL**: siempre consultas preparadas con PDO (`ATTR_EMULATE_PREPARES = false`).
- **XSS**: todo texto de la base de datos se escapa antes de pintarlo (web y panel). El panel tiene una CSP que solo permite scripts propios.
- **Stripe**: firma del webhook verificada (HMAC‑SHA256, tolerancia 5 min) y eventos idempotentes (tabla `stripe_events`). El importe cobrado se compara con el del pedido y se registra cualquier diferencia.
- **Ficheros**: `.htaccess` bloquea `.env`, `.git`, `backend/`, `*.sql`, `*.log`, `*.md`; en `uploads/` no se ejecuta PHP ni se sirven HTML/SVG/JS. HTTPS forzado.
- **Secretos**: ninguno en el repositorio. `.env` está en `.gitignore`. El instalador lo crea con permisos 600 fuera de `public_html` si puede. Las claves puestas en Ajustes se guardan cifradas (XSalsa20‑Poly1305) con la `APP_KEY` del `.env`, así que una copia de la base de datos sola no las revela, y la API nunca las devuelve.
- **Instalador**: hace falta conocer usuario y contraseña de MySQL, y se cierra en cuanto existe un administrador.
- **Errores**: en producción la API responde con mensajes genéricos y el detalle va a `backend/storage/logs/`.

## Privacidad y RGPD

> Los textos legales son una base redactada para este negocio (tienda de cerámica artesanal y clases en España). **No son asesoramiento jurídico**: conviene que los revise un profesional antes de abrir la tienda.

**Páginas** (enlazadas en el pie de todas las páginas): `aviso-legal.html` (LSSI art. 10), `privacidad.html` (RGPD/LOPDGDD), `cookies.html`, `condiciones.html` (venta, desistimiento de 14 días con formulario, garantía de 3 años y condiciones de las clases) y `mis-datos.html` (copia, borrado y baja). Los datos del titular (nombre o razón social, NIF, domicilio, email, datos registrales) se rellenan en **Panel → Ajustes → Datos legales y analítica**; mientras falten, las páginas muestran el hueco marcado y el resumen del panel avisa.

**Cookies** (`consent.js`): ventana al entrar con «Rechazar», «Configurar» y «Aceptar todo» (aceptar y rechazar con el mismo aspecto) sobre un velo que bloquea la web (resto de la página `inert`, sin scroll) hasta que se elige cualquiera de las opciones; rechazar deja entrar igual que aceptar, porque el consentimiento tiene que ser libre. En `cookies.html`, `privacidad.html` y `aviso-legal.html` el aviso va abajo sin bloquear, para poder leerlas antes de decidir. Categorías: necesarias (siempre), analíticas y marketing. Hasta que se elige solo funciona lo necesario. Google Analytics 4 (ID `G-…` en el panel) se carga solo con permiso de «Analíticas», con Consent Mode; al retirarlo se borran sus cookies. La elección se guarda 12 meses en `localStorage` (`charria-consent`) y se cambia con cualquier elemento `[data-cookie-settings]` (enlace «Configurar cookies» del pie). Si añades otro servicio, súbelo a la tabla de `cookies.html`, sube `VERSION` en `consent.js` y cárgalo solo si `Consent.has("marketing")` (o escucha el evento `consent:change`).

**Consentimientos** (bloque `consents` en `POST /checkout`, `/bookings` y `/bookings/private`): `terms` (condiciones + privacidad, obligatoria), `marketing` y `profile` (opcionales, sin marcar). `POST /contact` pide `consents.privacy`. Cada casilla marcada se guarda en la tabla `consents` con fecha, origen, IP, navegador y `Consents::VERSION` (súbela cuando cambies los textos legales o de las casillas).

**Perfiles**: solo se crea una fila en `customers` si la persona marca «guardar mis datos» (`has_profile`) o acepta comunicaciones (`marketing_opt_in`). Si no, el pedido o la reserva guardan solo sus propios datos de contacto y entrega. Panel → Clientes: perfiles, lista de comunicaciones (exportable a CSV con enlace de baja por persona) y registro de solicitudes.

**Supresión** (`Services/Privacy.php`): desde `mis-datos.html` (enlace de un solo uso enviado al email, 24 h; la acción se ejecuta al pulsar el botón, no al abrir el enlace) o desde el panel (ficha del cliente o «Borrar los datos de un email»). Borra el perfil y el alta en comunicaciones, anonimiza lo no pagado y **bloquea** (LOPDGDD art. 32) los pedidos y reservas pagados: quita teléfono y notas y los conserva 6 años por obligación fiscal y contable (`privacy_blocked_at`). `Privacy::anonymizeExpired()` (lo llaman el resumen del panel y `bin/cleanup.php`) anonimiza los pagados a los 6 años y los no pagados a los 90 días, y borra los mensajes de más de 1 año. La supresión borra también los mensajes de ese email y la copia de datos los incluye. Para enviar los enlaces hace falta el remitente de emails (Ajustes → Emails); si no está, la página pide escribir al email del titular.

**Base de datos**: los cambios para instalaciones ya hechas los aplica `Services/Migrations.php` solo (tabla `schema_migrations`); no hay que hacer nada al actualizar. Si al actualizar ya había clientes, quedan sin perfil y el panel ofrece borrarlos (se crearon sin pedir permiso).

| Ruta | Para qué |
|---|---|
| `POST /privacy/request` `{email, type: export\|delete\|unsubscribe}` | Envía el enlace de confirmación (misma respuesta haya o no datos) |
| `POST /privacy/confirm` `{token}` | Ejecuta la solicitud: devuelve los datos, el resumen del borrado o la baja |
| `POST /privacy/unsubscribe` `{email, signature}` | Baja directa desde el enlace firmado del CSV |
| `GET /admin/customers?filter=profiles\|marketing` · `GET/PATCH/DELETE /admin/customers/{id}` · `GET /admin/customers/{id}/export` | Panel: clientes, alta/baja de comunicaciones, exportar y borrar |
| `POST /admin/customers/erase {email}` · `POST /admin/customers/purge-legacy` · `GET /admin/marketing` · `GET /admin/privacy-requests` | Panel: borrar por email, limpiar clientes antiguos, lista de comunicaciones, registro |

## Referencia de la API

Base: `https://tudominio.com/api`

**Formato**: JSON en UTF‑8. Las respuestas correctas van en `{"data": …}`; los errores en
```json
{ "error": { "code": "validation_error", "message": "Revisa los datos enviados", "fields": { "customer.email": "Email no válido" } } }
```
Importes siempre en **céntimos** (`3800` = 38,00 €). Fechas `YYYY-MM-DD HH:MM:SS` en la hora local del estudio.

**Códigos**: `200` OK · `201` creado · `204` sin contenido · `400` JSON o firma no válidos · `401` sin sesión · `403` prohibido · `404` no existe · `405` método no permitido · `409` conflicto (stock, plazas, envío cambiado) · `422` validación · `429` demasiados intentos · `502` fallo de Stripe/Packlink · `503` pagos no configurados.

**Autenticación** de las rutas `/admin/*`, `/auth/me`, `/auth/logout`: cabecera `Authorization: Bearer <token>`.

### Público

#### `GET /health`
Estado del servicio.
```json
{ "data": { "ok": true, "database": true, "payments": true, "packlink": false, "time": "2026-10-24T20:12:45+02:00" } }
```

#### `GET /site`
Datos de contacto que se editan en **Panel → Ajustes → Datos de la web**. Lo que no se ha rellenado viene a `null` y la web deja el texto del HTML. También trae `studio_text` y `studio_image` (`{url, thumb_url, width, height, alt}` o `null`) de la sección «El estudio».

#### `GET /reviews`
Reseñas publicadas, en el orden del panel: `[{ "id", "author", "context", "body", "rating", "review_date" }]`. Vacío = la portada no enseña la sección.

**Cerrar la tienda**: Panel → Ajustes → **Tienda** tiene el interruptor «Tienda abierta» (`SHOP_OPEN`) y un aviso opcional (`SHOP_CLOSED_MESSAGE`, por defecto «No disponible en estos momentos»). Cerrada, `/site` devuelve `shop_open: false`, la web oculta la cesta y los botones de compra y enseña el aviso en la tienda y las fichas, y `POST /checkout` responde 503 `shop_closed`. Los pedidos ya pagados no se tocan; el resto del sitio (clases, galería, contacto) sigue igual.
```json
{ "data": { "address": "Calle del Barro 12", "city": "36740 Tomiño (Pontevedra)", "hours": "Lunes - Viernes: 10:00–20:00\nSábados - Domingos: Cerrado (Abierto exclusivamente para clases programadas con reserva)",
  "email": "hola@charriaceramics.com", "phone": "+34 600 000 000", "whatsapp": null,
  "instagram": "https://www.instagram.com/ch.ceramics/", "facebook": null, "tiktok": null, "maps_url": null } }
```

#### `GET /products` · `GET /products?category=Jarrones`
Productos visibles, del más nuevo al más antiguo.
```json
{ "data": [ {
  "id": 2, "slug": "jarron-duna", "title": "Jarrón Duna", "description": "…", "category": "Jarrones",
  "price_cents": 7200, "discount_percent": 20, "final_price_cents": 5760,
  "sold_out": false, "low_stock": true,
  "images": [ { "id": 2, "url": "/uploads/product/2026/10/ab12.webp", "thumb_url": "/uploads/product/2026/10/ab12-thumb.webp", "width": 1280, "height": 1600, "alt": "Jarrón de cerámica" } ],
  "created_at": "2026-10-18 10:00:00"
} ] }
```

#### `GET /products/{id|slug}`
Un producto (mismo formato). `404` si no existe o está oculto.

#### `GET /gallery`
Obras publicadas en orden.
```json
{ "data": [ { "id": 1, "title": "Serie Raíz", "technique": "Gres y engobe", "year": "2025", "sort_order": 1, "is_published": true,
  "image": { "id": 11, "url": "…", "thumb_url": "…", "width": 2200, "height": 1375, "alt": "Escultura de cerámica" } } ] }
```

#### `GET /classes`
Clases en grupo con sus próximos horarios y modalidades privadas. Cada clase lleva `pay_in_person` y la respuesta, `online_payment` (Stripe listo).
```json
{ "data": {
  "group": [ { "id": 1, "slug": "iniciacion-torno", "kind": "group", "title": "Iniciación al torno", "description": "…",
    "duration_minutes": 180, "price_cents": 6500, "capacity": 6, "image": { "url": "…" },
    "sessions": [ { "id": 1, "class_id": 1, "starts_at": "2026-11-08 10:00:00", "label": "", "price_cents": 6500,
      "capacity": 4, "seats_left": 4, "is_cancelled": false, "price_override_cents": null, "capacity_override": 4 } ] } ],
  "private": [ { "id": 5, "kind": "private", "title": "1 persona · 2 h", "price_cents": 9000, "sessions": [] } ]
} }
```

#### `POST /cart/quote`
Calcula la cesta. Solo se leen `product_id` y `quantity` (1–20, máx. 30 productos distintos).
```json
// Petición
{ "items": [ { "product_id": 2, "quantity": 1 }, { "product_id": 3, "quantity": 2 } ] }
// Respuesta
{ "data": {
  "lines": [ { "product_id": 2, "slug": "jarron-duna", "title": "Jarrón Duna", "image": { … }, "quantity": 1,
    "unit_price_cents": 7200, "discount_percent": 20, "unit_final_cents": 5760, "line_total_cents": 5760, "available": 2 } ],
  "errors": [ { "product_id": 3, "code": "insufficient_stock", "available": 1, "message": "Solo quedan 1 unidades de Taza Niebla" } ],
  "subtotal_cents": 7200, "discount_cents": 1440, "items_total_cents": 5760, "currency": "eur"
} }
```
Códigos de error por línea: `unavailable`, `sold_out`, `insufficient_stock`.

#### `POST /shipping/quote`
Opciones de envío. Sin `postal_code` solo devuelve la recogida.
```json
// Petición
{ "items": [ { "product_id": 2, "quantity": 1 } ], "address": { "postal_code": "08001", "country": "ES" } }
// Respuesta
{ "data": { "items_total_cents": 5760, "options": [
  { "id": "pickup", "method": "pickup", "name": "Recogida en el estudio", "carrier": "Charria Ceramics", "price_cents": 0, "transit_hours": null },
  { "id": "pl:20154", "method": "delivery", "name": "SEUR · 24h", "carrier": "SEUR", "price_cents": 745, "transit_hours": 24 }
] } }
```
Ids posibles: `pickup`, `flat` (tarifa plana) o `pl:<id de servicio de Packlink>`. Países: ES, PT, FR, IT, DE, BE, NL, AD.

#### `POST /checkout`
Crea el pedido y la sesión de pago. `phone` y `address` son obligatorios salvo recogida.
```json
// Petición
{ "items": [ { "product_id": 2, "quantity": 1 } ],
  "customer": { "name": "Ana Pérez", "email": "ana@example.com", "phone": "600000000" },
  "shipping": { "option_id": "pl:20154" },
  "address": { "street": "Calle Mayor 1", "city": "Barcelona", "postal_code": "08001", "country": "ES" } }
// Respuesta 201
{ "data": { "reference": "CH-7K2P9QXA", "total_cents": 6505, "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_…" } }
```
Errores: `409 cart_unavailable` (con `fields.items` = errores por línea), `409 shipping_changed`, `422`, `429`, `503 payments_unavailable`.

#### `GET /checkout/status?session_id=cs_…`
Lo usa `gracias.html`. Si el webhook aún no ha llegado, el servidor consulta a Stripe.
```json
{ "data": { "type": "order", "reference": "CH-7K2P9QXA", "status": "paid", "paid": true, "total_cents": 6505 } }
```

#### `POST /bookings`
Reserva plazas de un horario y devuelve el pago.
```json
// Petición
{ "session_id": 1, "seats": 2, "payment_method": "online", "customer": { "name": "Luis", "email": "luis@example.com", "phone": "" } }
// Respuesta 201
{ "data": { "reference": "CL-Q8R2M4TZ", "total_cents": 13000, "payment_method": "online", "checkout_url": "https://checkout.stripe.com/…" } }
// Con "payment_method": "in_person" (si la clase tiene pay_in_person) no hay checkout_url:
{ "data": { "reference": "CL-7B2K9QXA", "total_cents": 13000, "payment_method": "in_person", "status": "confirmed" } }
```
Errores: `404` horario no disponible, `409 not_enough_seats`, `422` (también si la clase no admite pagar en el taller), `503` (pago online sin Stripe).

#### `POST /bookings/private`
Solicitud de clase privada (`preferred_slot`: `Mañana` o `Tarde`).
```json
// Petición
{ "class_id": 5, "preferred_date": "2026-11-20", "preferred_slot": "Tarde", "notes": "",
  "customer": { "name": "Eva", "email": "eva@example.com", "phone": "" } }
// Respuesta 201
{ "data": { "reference": "CP-3HJK8L2W", "status": "requested" } }
```

#### `POST /contact`
Guarda el mensaje en Panel → Mensajes (tipo `request` si el motivo es «Encargo personalizado», si no `contact`) y avisa por email al estudio. Pide `consents.privacy`.
```json
{ "name": "Eva", "email": "eva@example.com", "reason": "Encargo personalizado", "message": "Hola…", "consents": { "privacy": true } }
```
Respuesta `201 { "data": { "sent": true } }`.

#### `POST /webhooks/stripe`
Solo para Stripe. Exige la cabecera `Stripe-Signature`. Responde `{"data":{"received":true}}`.

### Instalación y sesión

#### `GET /setup`
`{ "data": { "installed": false, "configured": false } }` — lo usa `admin/setup.html` para saber si mostrar el formulario.

#### `POST /setup`
Prueba la conexión con MySQL, guarda el `.env`, crea las tablas y el primer administrador. Solo funciona mientras no exista ningún admin; si ya hay un `.env`, los datos de MySQL tienen que coincidir con él.
```json
{ "db": { "host": "localhost", "port": 3306, "name": "u123456789_charria", "user": "u123456789_charria", "pass": "…" },
  "name": "Juc", "email": "tu@email.com", "password": "una-clave-larga", "seed": true }
```
Respuesta `201 { "data": { "installed": true, "seeded": true, "config_outside_public_html": true } }` · `422` con `fields` (`db.user`, `db.name`, `db.host`…) si MySQL rechaza los datos · `403` si no coinciden con el `.env` existente · `409 already_installed`.

Mientras no hay base de datos configurada (o faltan las tablas), el resto de rutas responde `503 { "error": { "code": "not_installed" } }` y la web redirige al instalador.

#### `POST /auth/login`
```json
// Petición
{ "email": "tu@email.com", "password": "…" }
// Respuesta
{ "data": { "token": "9f2c…(64 hex)", "expires_at": "2026-10-25 08:00:00", "admin": { "id": 1, "email": "tu@email.com", "name": "Juc" } } }
```
`401 invalid_credentials` · `429` tras 5 fallos.

#### `POST /auth/logout` 🔒 → `204` · `GET /auth/me` 🔒 → `{ "data": { "id", "email", "name" } }`

#### `PUT /admin/password` 🔒
`{ "current_password": "…", "new_password": "…" }` → `204`. Cierra las demás sesiones.

### Panel (todas 🔒)

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /admin/settings` | — | Ajustes del panel: `values` (remitente, envíos, emails), `secrets` (solo `set`, `hint` “…1234” y `source` panel/env, **nunca la clave**), `stripe_mode`, `webhook_url`, `webhook_events` |
| `PUT /admin/settings` | `{ "values": { "STRIPE_SECRET_KEY": "sk_live_…", "SHIPPING_FLAT_CENTS": "690" }, "clear": ["PACKLINK_API_KEY"] }` | Igual que GET. Un secreto vacío no se cambia; un campo normal vacío vuelve al valor por defecto. `422` con `fields` si una clave no tiene el formato correcto |
| `POST /admin/settings/studio-image` | multipart: `image`, `alt`, `crop=1` | Igual que GET, con `studio_image`. Borra la foto anterior. `DELETE` la quita (vuelve la de ejemplo) |
| `GET /admin/reviews` · `POST` · `PATCH /admin/reviews/{id}` · `DELETE` · `PUT /admin/reviews/order` | `{ "author", "context", "body", "rating": 1–5 o "", "review_date", "is_published" }` | Reseñas para la portada |
| `POST /admin/settings/test` | `{ "service": "stripe" }` o `"packlink"` | `{ "ok": true, "message": "Conectado con Stripe · …" }` · `502` si la clave no funciona |
| `GET /admin/stats` | — | Pedidos por enviar/recoger, ventas 30 días, solicitudes privadas, stock bajo, si Stripe/Packlink están configurados |
| `GET /admin/messages?type=contact\|request\|private_class&status=unread\|open\|handled` | — | Bandeja de mensajes (los 300 más recientes) |
| `GET /admin/messages/unread` | — | `{ "unread": 3 }` (contador del menú) |
| `GET /admin/messages/{id}` | — | Mensaje; abrirlo lo marca como leído |
| `PATCH /admin/messages/{id}` | `{ "handled": true }` y/o `{ "read": false }` | Mensaje |
| `DELETE /admin/messages/{id}` | — | `204` (la reserva de una clase privada se conserva) |
| `GET /admin/products` | — | Lista con campos internos: `stock`, `held` (en pago), `sold_out_manual`, `is_active`, peso y medidas |
| `POST /admin/products` | `title`*, `price_cents`*, `description`, `category`, `discount_percent` (0–90), `stock`, `sold_out`, `is_active`, `weight_grams`, `length_cm`, `width_cm`, `height_cm`, `slug` | `201` producto |
| `GET /admin/products/{id}` | — | Producto |
| `PUT`/`PATCH /admin/products/{id}` | Cualquier campo anterior (solo cambia lo enviado) | Producto |
| `PATCH /admin/products/{id}/sold-out` | `{ "sold_out": true }` | Producto (interruptor “Agotado”) |
| `DELETE /admin/products/{id}` | — | `204` (los pedidos antiguos conservan título y precio) |
| `POST /admin/products/{id}/images` | multipart: `image`*, `alt`, `crop=1` | `201` producto con imágenes |
| `PUT /admin/products/{id}/images` | `{ "ids": [3, 1] }` (la primera es la portada) | Producto |
| `DELETE /admin/products/{id}/images/{imageId}` | — | Producto |
| `GET /admin/classes` | — | Todas las clases con todos sus horarios (también pasados y cancelados) |
| `POST /admin/classes` | `title`*, `kind`* (`group`/`private`), `price_cents`*, `description`, `duration_minutes`, `capacity`, `pay_in_person`, `is_active`, `sort_order` | `201` clase |
| `PUT`/`PATCH /admin/classes/{id}` | Campos anteriores | Clase |
| `DELETE /admin/classes/{id}` | — | `204` (las reservas hechas se conservan) |
| `POST /admin/classes/{id}/image` | multipart: `image`*, `crop=1` | Clase |
| `POST /admin/sessions` | `class_id`*, `starts_at`* (`2026-11-08T10:00`), `label`, `price_cents` (null = el de la clase), `capacity` (null = el de la clase), `repeat_weeks` (1–52: crea el mismo horario cada semana, cada uno con sus plazas) | `201` primer horario con `seats_left` y `created` (cuántos se han creado) |
| `PUT`/`PATCH /admin/sessions/{id}` | Campos anteriores + `is_cancelled` | Horario |
| `DELETE /admin/sessions/{id}` | — | `204` · `409` si tiene reservas (cancélalo en su lugar) |
| `GET /admin/bookings?status=&session_id=&upcoming=1` | — | Reservas con datos del cliente y `payment_method`. `status=unpaid`: confirmadas para pagar en el taller y sin cobrar |
| `PATCH /admin/bookings/{id}` | `status` (`requested`/`confirmed`/`cancelled`), `notes`, `starts_at`, `paid` (solo en el taller: `true` cobrada, `false` deshacer) | Reserva |
| `GET /admin/gallery` | — | Todas las obras (también ocultas) |
| `POST /admin/gallery` | multipart: `image`*, `title`*, `technique`, `year`, `alt`, `is_published`, `crop=1` | `201` obra |
| `PUT`/`PATCH /admin/gallery/{id}` | `title`, `technique`, `year`, `alt`, `is_published` | Obra |
| `PUT /admin/gallery/order` | `{ "ids": [5, 2, 9] }` | Galería ordenada |
| `DELETE /admin/gallery/{id}` | — | `204` (borra también los archivos) |
| `GET /admin/image-rules` | — | Reglas de imagen por tipo |
| `GET /admin/orders?status=` | — | Pedidos (por defecto oculta cancelados y pendientes caducados) |
| `GET /admin/orders/{id}` | — | Pedido con líneas, dirección y datos de Packlink |
| `PATCH /admin/orders/{id}` | `{ "status": "shipped" }` (`paid`, `shipped`, `cancelled`, `refunded`) | Pedido |
| `POST /admin/orders/{id}/packlink` | — | Reintenta crear el borrador en Packlink |
| `GET /admin/customers` | — | Clientes con nº de pedidos y reservas |

Ejemplo:
```bash
curl -X PATCH https://tudominio.com/api/admin/products/2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"discount_percent": 15, "stock": 4}'
```
```bash
curl -X POST https://tudominio.com/api/admin/gallery \
  -H "Authorization: Bearer $TOKEN" \
  -F image=@obra.jpg -F title="Serie Raíz" -F technique="Gres" -F year=2026 -F crop=1
```

### Base de datos

| Tabla | Contenido |
|---|---|
| `admins`, `admin_sessions` | Usuarios del panel y sus sesiones (hash del token) |
| `rate_limits` | Intentos recientes por IP/email |
| `customers` | Clientes (por email) con su última dirección |
| `images` | Todas las imágenes (producto, galería, clase) con medidas y peso |
| `products`, `product_images` | Productos y sus fotos ordenadas |
| `gallery_items` | Obras de la galería |
| `classes`, `class_sessions` | Clases (grupo/privada) y horarios |
| `bookings` | Reservas y solicitudes (copian título, fecha y precio) |
| `messages` | Bandeja de Mensajes: contacto, encargos y solicitudes de clase privada (se borran al año) |
| `orders`, `order_items` | Pedidos y líneas (copian título y precios del momento) |
| `stripe_events` | Eventos de Stripe ya procesados |

## Funciones del backend

### Núcleo (`backend/src`)
- **`Env`** · `load(rutas)` lee el primer `.env` que exista · `get`, `int`, `bool`, `required` (lanza error 500 claro si falta) · `override` (ajustes del panel, con prioridad) · `file`.
- **`Database`** · `get()` conexión PDO única (UTF‑8, zona horaria sincronizada) · `all`, `one`, `value`, `exec` · `insert(tabla, datos)` · `update(tabla, datos, where, params)` · `transaction(fn)` (rollback si falla) · `runSqlFile(ruta)`.
- **`Validator`** · `string`, `email`, `int`, `bool`, `enum`, `date`, `datetime`, `array`, `nested` (objetos como `customer`), `check()` lanza 422 con todos los errores · `slugify(texto)`.
- **`Http\Request`** · `fromGlobals()`, `header`, `body()` (JSON o formulario), `input`, `param`, `intParam`.
- **`Http\Response`** · `json`, `created`, `noContent`, `send`, `error`.
- **`Http\Router`** · `get/post/put/patch/delete(ruta, controlador, middlewares)` · `dispatch(request)` (404/405).
- **`Http\HttpError`** · excepción con estado HTTP, código y errores por campo.

### Servicios (`backend/src/Services`)
- **`Auth`** · `login` (límite de intentos, token nuevo, rehash) · `requireAdmin` (middleware de todas las rutas del panel) · `logout` · `createAdmin` · `publicAdmin`.
- **`RateLimiter`** · `hit(bucket, máximo, segundos)` lanza 429 · `clear(bucket)`.
- **`Pricing`** · `discounted(precio, %)` · `normalizeItems(items)` valida y agrupa la cesta · `quote(items, lock)` calcula líneas, errores y totales (con bloqueo de filas en el checkout) · `heldStock(ids)` unidades retenidas por pagos en curso.
- **`Catalog`** · `products`, `product`, `imagesForProducts`, `firstImages`, `image` · `classes`, `session`, `seatsTaken` · `galleryItem`.
- **`Shipping`** · `options(cesta, país, cp)` recogida + Packlink o tarifa plana + envío gratis · `find(…, id)` recalcula la opción elegida · `package(cesta)` peso y caja.
- **`Packlink`** · `isConfigured` · `services(país, cp, paquete)` tarifas · `createDraft(pedido, paquete)` borrador de envío · `sender()` remitente.
- **`Stripe`** · `request` · `createCheckoutSession` · `retrieveCheckoutSession` · `expireCheckoutSession` · `verifyWebhook(payload, firma)`.
- **`Fulfillment`** · `paid(sesión)` marca pedido/reserva como pagado, descuenta stock, crea el envío y avisa por email · `failed(sesión)` libera stock o plazas · `createPacklinkDraft(pedido)`.
- **`ImageProcessor`** · `store(archivo, tipo, alt, recortar)` valida, normaliza y guarda · `delete(id)` · `rules()`.
- **`Customers`** · `validate` (bloque `customer`) · `upsert` (crea o actualiza por email).
- **`Messages`** · `record(tipo, asunto, remitente, texto, reserva)` · `typeForReason(motivo)` · `unread()` · `handleBooking(id)` · `present`.
- **`Mailer`** · `send`, `admin`, `money` · **`Log`** · `error`, `info` · **`Settings`** · `currency`, `appUrl`, `holdMinutes`, `uploadsUrl`, `reference(prefijo)`.
- **`AppSettings`** · `boot` (carga los ajustes del panel en cada petición) · `forPanel` · `save(valores, borrar)` con validación por tipo · cifrado `sodium_crypto_secretbox` con `APP_KEY`.
- **`Installer`** · `isInstalled` · `install(db, admin, seed)`: prueba MySQL, escribe el `.env` (permisos 600), crea tablas y el primer admin.

### Controladores
- **`PublicController`**: `health`, `products`, `product`, `gallery`, `classes`, `cartQuote`, `contact`.
- **`CheckoutController`**: `shippingQuote`, `checkout`, `status`.
- **`BookingController`**: `createGroup`, `createPrivate`.
- **`WebhookController`**: `stripe`.
- **`AuthController`**: `login`, `logout`, `me`, `changePassword`, `setup`, `setupStatus`.
- **`Admin\SettingsController`**: `show`, `update`, `test`.
- **`Admin\ProductAdminController`**: `index`, `show`, `store`, `update`, `soldOut`, `destroy`, `uploadImage`, `reorderImages`, `deleteImage`.
- **`Admin\ClassAdminController`**: `index`, `store`, `update`, `destroy`, `uploadImage`, `storeSession`, `updateSession`, `destroySession`, `bookings`, `updateBooking`.
- **`Admin\MessageAdminController`**: `index`, `unread`, `show`, `update`, `destroy`.
- **`Admin\GalleryAdminController`**: `index`, `rules`, `store`, `update`, `reorder`, `destroy`.
- **`Admin\OrderAdminController`**: `index`, `show`, `update`, `packlink`, `customers`, `stats`.

### Scripts de consola (`backend/bin`)
- `create-admin.php email "Nombre"`: crea un admin o cambia su contraseña (la pide por teclado).
- `cleanup.php`: cancela pedidos/reservas sin pagar y limpia sesiones y límites caducados.

### Frontend
- **`script.js`** · `loadContent()` pide productos, galería y clases a la API (o usa `data.js`) · `renderContent()` pinta tienda, galería y clases · `initPage()` animaciones, menú, galería, visor, modal de reserva, formulario de clase privada y contacto.
- **`cart.js`** · `window.Cart.add(producto)`, `open()`, `close()`, `clear()`, `count()`; panel lateral con dos pasos (productos → entrega y pago).
- **`gracias.js`** · comprueba el pago con `/checkout/status` y vacía la cesta.

## Panel de administración

`https://tudominio.com/admin/`

- **Mensajes**: bandeja con todo lo que llega desde la web (contacto, encargos y solicitudes de clase privada). Filtros por tipo y por estado (por atender, sin leer, atendidos), contador de no leídos en el menú (también en el botón del menú del móvil; se actualiza cada minuto), ficha con nombre, email y teléfono, «Responder por email», marcar como atendido o no leído y borrar.
- **Resumen**: mensajes sin leer, pedidos por enviar y por recoger, solicitudes de clase privada, próximos horarios, ventas de 30 días, stock bajo y avisos si falta configurar Stripe o Packlink.
- **Pedidos**: filtros por estado; detalle con productos, dirección y pago; marcar como enviado o reembolsado; crear el envío en Packlink.
- **Productos**: alta, edición y borrado; precio, descuento, stock, peso y medidas del paquete; interruptor **Agotado** directamente en la lista. **Ficha del producto**: medidas de la pieza en campos separados (alto, diámetro, ancho y fondo en cm, capacidad en ml; se guardan en `piece_*_mm` / `piece_capacity_ml`, migración 9) que salen en un bloque «Medidas» propio, una nota libre de medidas para sets, peso de la pieza, material, cuidados (al crear viene «Apto para lavavajillas y microondas.») y especificaciones libres (Capacidad, Acabado…), que salen en `producto.html?p=slug` junto con «Envío: 2–5 días laborables» si está disponible. El peso del envío es otro campo (con embalaje) y no se enseña. **Fotos**: varias a la vez (también al crear), orden con flechas, portada y texto alternativo; la 1.ª es la portada y la 2.ª aparece al pasar el ratón en la tienda.
- **Tienda (web)**: los filtros están ocultos tras el botón «Filtrar» (panel lateral): orden (novedades, precio ↑↓, nombre A–Z/Z–A, ofertas), categorías, rango de precio, solo disponibles y solo con descuento. El estado va en la URL (`?cat=Cuencos&orden=precio-asc&min=20&max=80`).
- **Clases y horarios**: editar clases y precios; añadir horarios con plazas y precio propios, sueltos o **semanales** (“Repetir cada semana durante 1 mes … 1 año”: se crea un horario por semana, el mismo día y hora, y en la web salen en una sola fila “Cada martes” con un desplegable para elegir el día); cancelar horarios; modalidades de clase privada.
- **Reservas**: próximas reservas, solicitudes privadas (confirmar con fecha acordada o cancelar), reservas por cobrar en el taller («Marcar como cobrada») y notas internas.
- **Galería**: subir obras con validación, editar textos, ocultar/publicar, ordenar y borrar. Cada obra lleva una etiqueta: «Obra única (No disponible)» (por defecto), «Disponible bajo pedido (Consultar precios)», que enlaza a Contacto con el formulario ya rellenado (`contacto.html?obra=…`), o ninguna (para fotos del taller).
- **Reseñas**: opiniones reales de compradores y alumnos (nombre, quién es, texto, estrellas opcionales), publicar/ocultar, ordenar y borrar. La sección «Opiniones» de la portada solo aparece si hay alguna publicada.
- **Clientes**.
- **Ajustes**: **datos de la web** (dirección, ciudad, horario, email, teléfono, WhatsApp, Instagram, Facebook, TikTok y enlace de Google Maps, que salen en el pie, el menú del móvil y Contacto); **El estudio** (texto y foto de la sección «Del barro a tu mesa» de la portada; sin rellenar se ven los de ejemplo); claves de Stripe (con la URL y los eventos del webhook para copiar, modo prueba/real y botón de prueba), API key y remitente de Packlink, opciones de envío y emails.
- **Cuenta**: cambiar contraseña, cerrar sesión.

## Desarrollo local y tests

```bash
# 1. MySQL local con una base de datos vacía. CHARRIA_ENV_FILE dice dónde leer/escribir el .env
export CHARRIA_ENV_FILE=/ruta/a/mi.env
# 2. Servidor de desarrollo (imita los .htaccess)
php -S localhost:8000 backend/dev-router.php
# 3. Instalar: abre http://localhost:8000 (te lleva al instalador)
```

**Tests de extremo a extremo** (crean y borran datos: usa una base de datos de pruebas):
```bash
# .env de pruebas con STRIPE_SECRET_KEY=sk_test_mock, STRIPE_WEBHOOK_SECRET=whsec_test,
# STRIPE_API_BASE=http://127.0.0.1:8099 y MAIL_DISABLED=true
php -S 127.0.0.1:8099 -t backend/tests backend/tests/mock-stripe.php &
php -S 127.0.0.1:8000 backend/dev-router.php &
php backend/tests/api-test.php http://127.0.0.1:8000 whsec_test http://127.0.0.1:8099 admin@email contraseña
```
Cubren: login y tokens, CRUD de productos, interruptor Agotado, validación de imágenes (proporción, tamaño, archivos disfrazados), galería, precios ignorados del cliente, stock retenido, checkout con Stripe, firma del webhook, idempotencia, descuento de stock, reservas con plazas, pago en el taller (plazas, cobro, interruptor por clase y RGPD), suscripción mensual de clases (cuota, webhooks de renovación y fallo, formas de pago por clase), solicitudes privadas, instalador cerrado, ajustes sin filtrar secretos, ficha y varias fotos por producto (orden y texto alternativo), bandeja de Mensajes (tipos, leído/atendido, borrado y RGPD), cierre de la tienda desde Ajustes y cierre de sesión. El mock de Stripe acepta `sk_test_mock` (del .env) y `sk_test_mockpanel123456` (para probar las claves guardadas desde Ajustes).

Con Live Server (sin PHP) la web sigue funcionando con `data.js`; la cesta muestra “precios orientativos” y no deja pagar.

### Herramientas para IA (Repomix y Graphify)

Sirven para dar contexto del proyecto a un asistente de IA (Claude, ChatGPT, Cursor…). Sus salidas **no se suben a GitHub** (están en `.gitignore`) ni se publican en la web (el `.htaccess` las bloquea por si acaso): se regeneran cuando hagan falta.

**Repomix** junta todo el código en un solo fichero para pegarlo o adjuntarlo a una IA.
```bash
npm install -g repomix      # una vez
repomix                     # crea repomix-output.xml (~180k tokens)
repomix --compress          # versión resumida (solo estructura del código)
```
Usa `repomix.config.json` y `.repomixignore`: deja fuera `.env`, `uploads/`, `backend/storage/`, imágenes y binarios, y además pasa su comprobación de secretos (Secretlint). Las claves que verás en el paquete (`sk_test_mock…`, `pk_live_123456789012`) son falsas, de los tests.

**Graphify** dibuja un grafo de conocimiento del código (qué fichero usa qué clase, qué partes están más conectadas).
```bash
pip install "graphifyy[sql]"   # una vez (el paquete se llama graphifyy, con dos y)
graphify update .               # analiza el código en local, sin IA ni coste
graphify install                # opcional: añade el comando /graphify a Claude Code
```
Crea `graphify-out/` con `graph.html` (ábrelo en el navegador para ver el grafo), `GRAPH_REPORT.md` (resumen: piezas clave y grupos) y `graph.json` (para consultas: `graphify explain "Database"`, `graphify path "CheckoutController" "Database"`). Respeta `.graphifyignore`.

#### Cómo empezar una tarea con poco contexto (para asistentes de IA)

1. `graphify update .` (segundos, sin coste) y lee **`graphify-out/GRAPH_REPORT.md`** (~2.000 tokens). Mira en "Built from commit" que coincide con `git rev-parse HEAD`.
2. Localiza la pieza con `graphify explain "Nombre"` o `graphify query "pregunta"`: dan el fichero y la línea de cada método.
3. Abre **solo** esos ficheros, y en los grandes (`admin/admin.js`, `style.css`, `script.js`) solo el tramo con `grep -n` y un rango de líneas.
4. No leas este README entero (~13.500 tokens) ni el paquete de Repomix completo; usa `repomix --include "ruta/**"` si de verdad necesitas una zona entera.

Mapa rápido por zona:

| Zona | Ficheros |
|---|---|
| Panel | `admin/admin.js`, `admin/index.html`, `admin/admin.css`, `backend/src/Controllers/Admin/` |
| Tienda y pago | `productos.html`, `producto.html`, `cart.js`, `checkout.*`, `gracias.*`, `backend/src/Controllers/{Checkout,Webhook,Public}Controller.php`, `backend/src/Services/{Catalog,Pricing,Shipping,Packlink,Stripe,Fulfillment}.php` |
| Páginas públicas | `*.html`, `style.css`, `script.js`, `data.js`, `consent.js`, `mis-datos.js` |
| API y base de datos | `backend/routes.php`, `backend/src/Http/`, `backend/database/schema.sql` |

Medido el 2026-10-25 con el tokenizador de Repomix (o200k), commit `e09ef19`:

| Qué se carga | Tokens |
|---|---|
| Repo completo (Repomix) | 181.949 |
| Repo completo comprimido (`repomix --compress`) | 109.934 |
| Zona panel / tienda / páginas / backend (Repomix) | 38.568 / 22.806 / 64.227 / 69.661 |
| GRAPH_REPORT.md | 2.047 |
| Tarea "campo nuevo en productos del panel" (informe + explain + `admin.js` + `ProductAdminController.php`) | 22.569 |
| Tarea "cambiar el envío en la cesta" (informe + explain + `cart.js` + `Shipping.php` + `CheckoutController.php`) | 11.203 |
| Tarea "retocar la galería" (informe + `galeria.html` + `script.js` + `style.css`) | 32.171 |

## Reutilizar la API en otra web

1. Despliega `api/` + `backend/` en el dominio que quieras (o usa esta misma instalación).
2. Añade el dominio de la otra web a `CORS_ALLOWED_ORIGINS`.
3. Desde esa web:
```js
const API = "https://charriaceramics.com/api";
const { data: products } = await (await fetch(`${API}/products`)).json();
const { data: quote } = await (await fetch(`${API}/cart/quote`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ items: [{ product_id: products[0].id, quantity: 1 }] }),
})).json();
```
Para un panel en otra web basta con llamar a `POST /auth/login` y enviar `Authorization: Bearer <token>`.

## Mantenimiento y preguntas frecuentes

- **Copias de seguridad**: hPanel → Copias de seguridad incluye la base de datos y `public_html/uploads`. Las fotos subidas no están en GitHub.
- **Despliegue de Hostinger**: el `.env` (fuera de `public_html`) y `uploads/` no los toca git. Tras la primera subida de fotos, comprueba con un Deploy que siguen ahí.
- **Reembolsos**: se hacen en el panel de Stripe (Pagos → Reembolsar); luego marca el pedido como “Reembolsado” en el panel. Si el pedido devuelve piezas, ajusta el stock a mano.
- **Cambiar un precio**: no afecta a pedidos ya hechos (guardan el precio del momento) ni a pagos en curso.
- **Envíos a punto de recogida de Packlink**: de momento no se ofrecen (necesitan elegir un punto en un mapa); solo entrega a domicilio y recogida en el estudio.
- **Logs**: `backend/storage/logs/app.log` (Stripe, Packlink, errores) y `php-errors.log`.
- **Olvidé la contraseña**: `php backend/bin/create-admin.php tu@email.com` por SSH, o borra tu fila de `admins` en phpMyAdmin y vuelve a `admin/setup.html` con los mismos datos de MySQL.
- **Open Graph (vista previa al compartir)**: cada página tiene su `<title>` y sus etiquetas `og:*` / `twitter:card` en el `<head>`; la imagen es `assets/og-charria.jpg` (1200×630). WhatsApp, LinkedIn y Facebook piden que `og:image` sea una URL absoluta: cuando la web tenga su dominio definitivo, cambia `content="/assets/og-charria.jpg"` por `content="https://tudominio/assets/og-charria.jpg"` en todas las páginas y añade `<meta property="og:url" content="https://tudominio/pagina.html">`.
- **Fechas, plazas y horario**: las clases (fechas, plazas libres y precios) salen siempre de Panel → Clases; el HTML no lleva fechas escritas a mano. Dirección, ciudad y horario salen de Panel → Ajustes → Datos de la web; el texto del HTML solo se ve si eso está vacío o la API no responde.
- **Cambiar la contraseña de MySQL**: edita `DB_PASS` en el `.env` (Administrador de archivos, carpeta por encima de `public_html`).
