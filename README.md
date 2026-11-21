# Pilates Studio — demo de web y panel de gestión

Demo para estudios de pilates: web pública para inscribirse y pagar, «Mi plan» para cada cliente y un panel de gestión para el dueño y recepción. Todo funciona sin servidor: los datos de ejemplo se guardan en el navegador.

## Cómo verla

1. Con Node instalado: `node servir.js` (puerto 5173; otro puerto con `node servir.js 5174`).
2. Abrir `http://localhost:5173/` (web), `socio.html` («Mi plan») y `admin.html` (panel).
3. Panel de la demo: dueño → usuario `dueno`, contraseña `demo`; recepción → usuario `recepcion`, contraseña `recepcion`. En el acceso hay dos botones rápidos.

También se puede abrir `index.html` con doble clic, aunque la cámara y la instalación de «Mi plan» como app necesitan `https` o `localhost`.

## Qué incluye

- **Web** (`index.html`): portada con video, planes, formatos de clase, inscripción en línea, galería, preguntas frecuentes, horarios y contacto. Con animaciones al hacer scroll.
- **Planes de ejemplo** (en `js/tema.js`): Clase Intro $26.75, Paquete de 4 $90.95, Plan Beginner $129.00 y Semiprivadas ×8 $246.10, basados en precios públicos de un estudio real. Se cambian desde Ajustes → Estudio.
- **Pago**: efectivo y Yappy (el pago en línea es simulado en la demo).
- **Mi plan** (`socio.html`): plan, vencimiento, pase de entrada con QR, pagos y datos del cliente (Ley 81 de 2019).
- **Panel** (`admin.html`): inicio, socios, cobros, entrada con QR, cafetería, reportes y ajustes. Importa y exporta Excel y respaldos.
- **Mapa**: sin dirección en Ajustes muestra el mapa general; al escribir una dirección, se centra en ella.

## Diseño

- Paleta: rosa pálido `#f3ebe8`, azul `#b5cde8`, menta `#cee5ce`, verde salvia `#89c1a5` y gris cálido `#696966`.
- Tipografía: familia SF Pro si el dispositivo la tiene y, si no, Inter (SIL OFL, `assets/fonts/inter-latin.woff2`). Titulares en 600 con interletrado negativo, texto a 17 px.
- Botones en píldora de 44 px y tarjetas de 28 px.
- Los estilos de la web pública están en `css/base.css`, `css/site.css`, `css/efectos.css` y `css/pilates.css` (que va al final y define el diseño actual); el panel usa `css/admin.css`, `css/ajustes.css`, `css/checkin.css` y `css/pilates-panel.css`.
- Con «reducir movimiento» activado en el sistema, las animaciones y el video se desactivan.

## Cosas para cambiar antes de publicar

- Nombre, Instagram, teléfono, horarios y planes: `js/tema.js` y Ajustes del panel.
- Dominio: `tu-dominio.com` aparece en `index.html`, `privacidad.html`, `sitemap.xml` y `robots.txt`.
- Fotos y video: están en `assets/fotos/` y `assets/video/`. Las fotos son de Wikimedia Commons (CC0 o dominio público) y cuadros de clips de Mixkit (licencia gratuita para uso comercial, sin atribución); el video del hero también es de Mixkit. Conviene reemplazarlas por fotos propias del estudio.
- Contraseña del dueño de la demo (`demo`): se cambia desde el panel («Cambiar contraseña»).
- Aviso de privacidad: es un texto base que debe revisar el negocio.

## Pruebas

```
node tests/store.test.js
node tests/excel.test.js
```

Usan planes fijos de `tests/datos-prueba.js` para que las cuentas no dependan de los planes de ejemplo.

## Publicación

`vercel.json` publica solo la demo (copia `index.html`, `admin.html`, `socio.html`, `404.html`, `privacidad.html`, `css`, `js` y `assets` a `dist/`). Subir `VERSION` en `sw.js` en cada publicación.
