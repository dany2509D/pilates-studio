// Service worker de "Mi plan" (lo registra socio.html). Permite agregar "Mi plan" a la pantalla de inicio
// como una app y abrirlo sin conexión.
// Estrategia "primero la red": con conexión siempre sirve lo último del servidor (nunca archivos viejos) y
// guarda una copia; sin conexión abre con esa copia. Como está en la raíz, también ve las peticiones de
// index.html y admin.html: con conexión no les cambia nada.
// Subir VERSION en cada publicación: así se vuelve a descargar toda la precarga y se borra la copia anterior.
const VERSION = 'sag-miplan-v4';

// Lo que usa socio.html, para que abra sin conexión aunque el socio no haya pasado por todo.
const PRECARGA = [
  'socio.html',
  'manifest.webmanifest',
  'css/fonts.css', 'css/base.css', 'css/site.css', 'css/efectos.css', 'css/comprobante.css', 'css/tour.css', 'css/miplan.css',
  'js/util.js', 'js/seed.js', 'js/store.js', 'js/yappy.js', 'js/comprobante.js', 'js/vendor/qrcode.js', 'js/qr.js',
  'js/socio.js', 'js/tour.js', 'js/tema.js', 'css/pilates.css',
  'assets/logo.png',
  'assets/iconos/icono-192.png', 'assets/iconos/icono-512.png', 'assets/iconos/icono-maskable-512.png',
  'assets/iconos/apple-touch-icon-180.png',
  'assets/fonts/inter-latin.woff2',
  'privacidad.html',
];

// Una sola copia por página: socio.html, socio.html?app=1 (la app instalada) y socio.html?origen=qr se guardan
// y se buscan como socio.html, así sin conexión siempre abre la última que se vio.
function clave(req) {
  if (req.mode !== 'navigate') return req;
  const u = new URL(req.url);
  u.search = '';
  return u.href;
}

self.addEventListener('install', (e) => {
  // Cada archivo por separado: si falta uno, los demás igual quedan guardados.
  e.waitUntil(caches.open(VERSION)
    .then((cache) => Promise.all(PRECARGA.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((nombres) => Promise.all(nombres.filter((n) => n.startsWith('sag-miplan-') && n !== VERSION).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Solo GET del mismo sitio. Lo demás (mapa, WhatsApp, envíos) pasa directo.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const k = clave(req);
  e.respondWith(fetch(req)
    .then((res) => {
      if (res.ok && res.type === 'basic') {
        const copia = res.clone();
        e.waitUntil(caches.open(VERSION).then((cache) => cache.put(k, copia)).catch(() => null));
      }
      return res;
    })
    // Sin conexión: la última copia (si no hay una exacta, la misma dirección sin "?…").
    .catch(() => caches.open(VERSION)
      .then((cache) => cache.match(k).then((r) => r || cache.match(req, { ignoreSearch: true })))
      .then((r) => r || Response.error())));
});
