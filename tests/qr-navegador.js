// Prueba en un navegador de verdad (Chrome o Edge, sin ventana) del check-in con QR:
// - cámara simulada que "ve" un QR (Chrome acepta un video .y4m como cámara),
// - lector USB simulado (teclas, como las manda un lector real),
// - el QR de "Mi plan" que cambia cada 15 s, el pase diario de un solo uso, los reportes del dueño,
//   lo que ve recepción, y capturas en celular, tablet y laptop.
// El reloj del QR queda fijo en las páginas (window.__relojQR): el video muestra el código de ese instante.
// Uso:  node tests/qr-navegador.js       (Node 22 o más nuevo, y Chrome o Edge instalados)
// Variables opcionales: CHROME=ruta del navegador · CAPTURAS=carpeta donde guardar las capturas.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert');

process.env.CAPTURAS = process.env.CAPTURAS || path.join(os.tmpdir(), 'sag-qr-capturas');
const N = require('./cdp.js');
const Util = require('../js/util.js');
const QR = require('../js/qr.js');
const Seed = require('../js/seed.js');

const { dormir, evaluar, esperar, ir, tamano, captura, teclear, tecla } = N;
const TMP = fs.mkdtempSync(path.join(N.TMP, 'videos-'));

// ---------- Reloj del QR y códigos ----------
// A mitad de un paso de 15 s: así "avanzar 15 s" siempre da el código siguiente.
const T = Math.floor(Date.now() / 15000) * 15000 + 7000;
const pad = (n) => String(n).padStart(2, '0');
const ahora = new Date();
const HOY = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`; // como Store.hoy()

// Los socios de ejemplo son iguales en cualquier equipo (ids y cédulas no dependen de la fecha).
const socios = Seed.generar('2026-01-01').socios;
const socio = (id) => socios.find((s) => s.id === id);
const codigo = (id, ms = T) => Util.codigoSocio(socio(id), ms);
const pase = (socioId, cedula, fecha = HOY) => Util.codigoPase({ socioId, cedula, fecha });
// Socios que NO traen entrada de hoy en los datos de ejemplo (en seed.js solo entran hoy los de índice múltiplo de 3).
const ACTIVO = 2;    // María Fernanda Ortiz
const VENCIDO = 21;  // Franklin Pérez
const VIEJO = 5;     // Rafael Quintero: muestra una captura de pantalla de hace 5 minutos
const DIARIO = 1;    // id del plan diario ($3)
const PASE_VENCIDO = pase(VENCIDO, socio(VENCIDO).cedula); // el que recibe Franklin al pagar el plan diario hoy
const PASE_VISITANTE = pase(900, '8-000-900');            // pase hecho en otro equipo de la demo
const AYER = Util.sumarDias(HOY, -1);
const PASE_AYER = pase(901, '8-000-901', AYER);           // visitante que ya entró ayer con su pase

// ---------- Navegador ----------
// Video .y4m (formato que Chrome usa como cámara falsa) con el QR al centro sobre un fondo gris.
// `textos`: uno o varios QR que se turnan, `segundos` cada uno. `invertido`: claro sobre oscuro.
function videoConQR(textos, archivo, { invertido = false, segundos = 1 } = {}) {
  const ancho = 640, alto = 480, escala = 7;
  const UV = Buffer.alloc((ancho / 2) * (alto / 2) * 2, 128);
  const cuadros = [].concat(textos).map((texto) => {
    const m = QR.matriz(texto);
    const n = m.length;
    const lado = (n + 2 * QR.MARGEN) * escala;
    const Y = Buffer.alloc(ancho * alto, 70);
    const x0 = Math.floor((ancho - lado) / 2), y0 = Math.floor((alto - lado) / 2);
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const r = Math.floor(y / escala) - QR.MARGEN, c = Math.floor(x / escala) - QR.MARGEN;
        const negro = r >= 0 && c >= 0 && r < n && c < n && m[r][c];
        Y[(y0 + y) * ancho + x0 + x] = negro !== !!invertido ? 20 : 235;
      }
    }
    return Buffer.concat([Buffer.from('FRAME\n'), Y, UV]);
  });
  // 2 cuadros por segundo: el video se repite en bucle y cada QR dura `segundos`.
  const repetidos = cuadros.flatMap((cd) => Array(Math.max(1, Math.round(segundos * 2))).fill(cd));
  fs.writeFileSync(archivo, Buffer.concat([Buffer.from(`YUV4MPEG2 W${ancho} H${alto} F2:1 Ip A1:1 C420jpeg\n`), ...repetidos]));
  return archivo;
}

// Se inyecta en cada página: fija el reloj del QR, registra los streams de la cámara y el bloqueo de pantalla,
// puede hacer fallar una cámara (window.__fallarCamara = deviceId) y, si se pide con ?shim=…, simula el lector
// del navegador o un permiso denegado.
function ganchos() {
  // Reloj del QR: util.js hace window.Util = Util; aquí se le cambia ahoraMs apenas llega (admin.html y socio.html).
  let util;
  Object.defineProperty(window, 'Util', {
    configurable: true,
    enumerable: true,
    get: () => util,
    set: (u) => { util = u; if (u && window.__relojQR != null) u.ahoraMs = () => window.__relojQR; },
  });
  window.__streams = [];
  const shim = new URLSearchParams(location.search).get('shim');
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      const v = c && c.video;
      const pedida = v && v.deviceId && (v.deviceId.exact || v.deviceId);
      if (window.__fallarCamara && pedida === window.__fallarCamara) throw new DOMException('Could not start video source', 'NotReadableError');
      if (shim === 'permiso') throw new DOMException('Permission denied', 'NotAllowedError');
      if (shim === 'sistema') throw new DOMException('Permission denied by system', 'NotAllowedError');
      const s = await orig(c);
      window.__streams.push(s);
      return s;
    };
  }
  window.__camaraViva = () => window.__streams.some((s) => s.getTracks().some((t) => t.readyState === 'live'));
  window.__pantalla = { pedidos: 0, soltados: 0 };
  try {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      window.__pantalla.pedidos++;
      return { release: async () => { window.__pantalla.soltados++; } };
    } } });
  } catch (e) { /* nada */ }
  const conJsQR = (video) => {
    window.__cargaJsQR = window.__cargaJsQR || new Promise((ok) => { const s = document.createElement('script'); s.src = 'js/vendor/jsQR.js'; s.onload = ok; document.head.appendChild(s); });
    return window.__cargaJsQR.then(() => {
      const cv = document.createElement('canvas'); cv.width = video.videoWidth; cv.height = video.videoHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(video, 0, 0);
      const r = window.jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
      return r ? [{ rawValue: r.data, format: 'qr_code' }] : [];
    });
  };
  if (shim === 'vacio') { // lector del navegador que "funciona" pero nunca encuentra nada
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code']; } async detect() { window.__vacioLlamadas = (window.__vacioLlamadas || 0) + 1; return []; } };
  }
  if (shim === 'tarde') { // lector del navegador sano que no encuentra nada los primeros 4,5 s (el QR aún no estaba a la vista)
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['qr_code']; }
      constructor() { window.__nativoDesde = Date.now() + 4500; window.__tardeLlamadas = 0; }
      async detect(video) {
        window.__tardeLlamadas++;
        if (Date.now() < window.__nativoDesde) return [];
        return conJsQR(video);
      }
    };
  }
  if (shim === 'falla') {
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code']; } async detect() { window.__fallosNativo = (window.__fallosNativo || 0) + 1; throw new Error('roto'); } };
  }
  if (shim === 'nativo') {
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['qr_code']; }
      async detect(video) { window.__nativoUsado = true; return conJsQR(video); }
    };
  }
}

const alCargar = `window.__relojQR = ${T}; (${ganchos})();`;
const lanzar = (video, args = []) => N.lanzar({ video, args, alCargar });

const entradasHoy = (c, id) => evaluar(c, `Store.list('asistencias').filter((a) => a.socioId === ${id} && a.fecha === Store.hoy()).length`);
const todasHoy = (c) => evaluar(c, `Store.list('asistencias').filter((a) => a.fecha === Store.hoy()).length`);
const msg = (c) => evaluar(c, `document.querySelector('#k-msg').textContent.replace(/\\s+/g, ' ').trim()`);
const claseMsg = (c) => evaluar(c, `(document.querySelector('#k-msg .mensaje') || {}).className || ''`);
const sinDesborde = (c) => evaluar(c, `document.documentElement.scrollWidth <= window.innerWidth + 1`);
const vaciar = `(() => { const b = document.querySelector('#k-buscar'); b.value = ''; b.dispatchEvent(new Event('input')); return true; })()`;
const enMsg = (c, texto, ms = 3000) => esperar(c, `document.querySelector('#k-msg').textContent.includes(${JSON.stringify(texto)})`, ms);

// Datos de ejemplo limpios y sesión abierta del panel (1 = dueño, 2 = recepción), en el origen indicado.
async function entrarPanel(c, base, hash = 'checkin', query = '', usuarioId = 1) {
  await N.entrarPanel(c, base, { usuarioId, hash, query });
  if (hash === 'checkin') await esperar(c, `!!document.querySelector('#k-buscar')`);
}

// "Mi plan" con la sesión guardada en el celular (contrato 'sag:miplan'); si no la abre sola, con el formulario.
async function entrarMiPlan(c, base, s) {
  await ir(c, base + '/404.html');
  await evaluar(c, `localStorage.setItem('sag:miplan', ${JSON.stringify(JSON.stringify({ socioId: s.id, cedula: s.cedula }))}); sessionStorage.removeItem('sag:tour'); true`);
  await ir(c, base + '/socio.html');
  const abierta = await esperar(c, `!!document.querySelector('.carnet-qr canvas')`, 3000).then(() => true, () => false);
  if (!abierta) {
    await evaluar(c, `const f = document.querySelector('#socio-form'); f.cedula.value = ${JSON.stringify(s.cedula)}; f.ultimos4.value = ${JSON.stringify(s.telefono.slice(-4))}; f.requestSubmit(); true`);
    await esperar(c, `!!document.querySelector('.carnet-qr canvas')`);
  }
}

// Lee de vuelta el QR que de verdad ve el socio (los píxeles del canvas, reducidos al tamaño en pantalla).
const leerCanvasQR = (c) => evaluar(c, `(async () => {
  await new Promise((ok, mal) => { if (window.jsQR) return ok(); const s = document.createElement('script'); s.src = 'js/vendor/jsQR.js'; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
  const el = document.querySelector('.carnet-qr canvas');
  const lado = Math.round(el.getBoundingClientRect().width * devicePixelRatio);
  const cv = document.createElement('canvas'); cv.width = cv.height = lado;
  const ctx = cv.getContext('2d'); ctx.drawImage(el, 0, 0, lado, lado);
  const r = jsQR(ctx.getImageData(0, 0, lado, lado).data, lado, lado, { inversionAttempts: 'dontInvert' });
  return { texto: r && r.data, ancho: el.getBoundingClientRect().width, etiqueta: el.getAttribute('aria-label') };
})()`);

// El pase se usa con el día del panel en `AYER` (así queda usado ayer) y se vuelve al día de hoy.
const usarPaseAyer = (c, codigoPase) => evaluar(c, `(() => {
  Store.setHoy(${JSON.stringify(AYER)});
  try { return Store.usarPase(${JSON.stringify(codigoPase)}).estado; } finally { Store.setHoy(null); }
})()`).then((estado) => assert.strictEqual(estado, 'ok', 'el pase se usó ayer'));

async function abrirCamaraYLeer(c, nombre) {
  await evaluar(c, `document.querySelector('#k-camara').click()`);
  await esperar(c, `document.querySelector('#k-msg').textContent.includes(${JSON.stringify(nombre)})`);
}

// ---------- Pruebas ----------
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);
let puerto, base, nav;

prueba('cámara: «Leer QR del socio» lee el QR, registra la entrada y la muestra encima de la imagen', async () => {
  await tamano(nav, 'laptop');
  await entrarPanel(nav, base);
  assert.strictEqual(await evaluar(nav, `document.activeElement && document.activeElement.id`), 'k-buscar', 'en laptop el campo queda listo para el lector USB');
  assert.match(await evaluar(nav, `document.querySelector('#k-camara').textContent`), /Leer QR del socio/);
  assert.strictEqual(await entradasHoy(nav, ACTIVO), 0);
  const antes = await todasHoy(nav);
  const t0 = Date.now();
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  console.log(`     (leído en ${Date.now() - t0} ms)`);
  assert.match(await claseMsg(nav), /\bok\b/);
  assert.match(await msg(nav), /Plan al día/, 'muestra el estado del plan');
  assert.strictEqual(await entradasHoy(nav, ACTIVO), 1);
  assert.strictEqual(await evaluar(nav, `document.querySelector('#k-num').textContent`), String(antes + 1), 'el contador sube');
  assert.match(await evaluar(nav, `document.querySelector('#k-lista .fila').textContent`), new RegExp(socio(ACTIVO).nombre), 'primera en la lista de entradas de hoy');
  assert.ok(await evaluar(nav, `!document.querySelector('.escaner-res').hidden && document.querySelector('.escaner-res').classList.contains('ok')`), 'resultado sobre la imagen');
  assert.match(await evaluar(nav, `document.querySelector('.escaner-res').textContent`), /plan al día/);
  assert.strictEqual(await evaluar(nav, `document.querySelector('#k-camara').getAttribute('aria-expanded')`), 'true');
  assert.match(await evaluar(nav, `document.querySelector('#k-camara').textContent`), /Cerrar cámara/);
  assert.strictEqual(await evaluar(nav, `window.__pantalla.pedidos`), 1, 'pide mantener la pantalla encendida');
  assert.strictEqual(await evaluar(nav, `getComputedStyle(document.querySelector('#tour-fab')).display`), 'none', 'el botón del tutorial no tapa el mensaje');
  await captura(nav, 'laptop-checkin-camara');
});

prueba('cámara: el mismo QR quieto frente a la cámara no se cuenta dos veces', async () => {
  await dormir(4500);
  assert.strictEqual(await entradasHoy(nav, ACTIVO), 1);
  assert.match(await msg(nav), /registrada/);
  assert.doesNotMatch(await msg(nav), /ya registró/);
});

prueba('cámara: el botón la cierra y se apaga de verdad', async () => {
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
  await esperar(nav, `!window.__camaraViva()`);
  assert.ok(await evaluar(nav, `document.querySelector('#k-escaner').hidden && !document.querySelector('video')`));
  await esperar(nav, `window.__pantalla.soltados === 1`, 2000);
  assert.match(await evaluar(nav, `document.querySelector('#k-camara').textContent`), /Leer QR del socio/);
  assert.notStrictEqual(await evaluar(nav, `getComputedStyle(document.querySelector('#tour-fab')).display`), 'none', 'vuelve el botón del tutorial');
});

prueba('cámara: se apaga al cambiar de pantalla, al ocultar la página y al cerrar sesión', async () => {
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
  await esperar(nav, `window.__camaraViva()`);
  await evaluar(nav, `location.hash = '#inicio'`);
  await esperar(nav, `!window.__camaraViva()`, 3000);

  await evaluar(nav, `location.hash = '#checkin'`);
  await esperar(nav, `!!document.querySelector('#k-camara')`);
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
  await esperar(nav, `window.__camaraViva()`);
  await evaluar(nav, `Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); true`);
  await esperar(nav, `!window.__camaraViva()`, 3000);
  assert.match(await evaluar(nav, `document.querySelector('#k-aviso-camara').textContent`), /se apagó.*Leer QR del socio/);
  await evaluar(nav, `delete document.hidden; true`);

  await evaluar(nav, `document.querySelector('#k-camara').click()`);
  await esperar(nav, `window.__camaraViva()`);
  await evaluar(nav, `document.querySelector('#btn-salir').click()`);
  await esperar(nav, `!window.__camaraViva()`, 3000);
  assert.ok(await evaluar(nav, `!document.querySelector('#login').hidden`));
});

prueba('lector USB con el campo enfocado: Enter, relectura, sin Enter, minúsculas con Tab, sin parpadeo', async () => {
  await entrarPanel(nav, base);
  await evaluar(nav, `document.querySelector('#k-buscar').focus()`);
  // Mientras el lector teclea no deben aparecer socios sueltos ni "no se encontró" en la lista.
  await evaluar(nav, `window.__parpadeo = 0; new MutationObserver(() => { const r = document.querySelector('#k-res'); if (r && (r.querySelector('.fila') || r.textContent.includes('No se encontró'))) window.__parpadeo++; }).observe(document.querySelector('#k-res'), { childList: true, subtree: true }); true`);
  await teclear(nav, codigo(3));
  await enMsg(nav, socio(3).nombre);
  assert.match(await claseMsg(nav), /\bok\b/);
  assert.strictEqual(await evaluar(nav, `window.__parpadeo`), 0, 'sin parpadeo de la lista');
  assert.strictEqual(await evaluar(nav, `document.querySelector('#k-buscar').value`), '', 'el campo queda vacío para el siguiente');
  await dormir(700);
  await teclear(nav, codigo(3)); // el lector de mostrador lo relee porque el socio dejó el celular frente a él
  await dormir(400);
  assert.match(await claseMsg(nav), /\bok\b/, 'la relectura no cambia el verde por "ya registró"');
  await teclear(nav, codigo(3, T + 15000)); // …y su QR cambió mientras lo dejaba ahí: sigue siendo él
  await dormir(400);
  assert.match(await claseMsg(nav), /\bok\b/, 'el código siguiente del mismo socio tampoco cuenta de nuevo');
  assert.strictEqual(await entradasHoy(nav, 3), 1);
  await dormir(4200);
  await teclear(nav, codigo(3)); // otra lectura, ya pasado el rato
  await enMsg(nav, 'ya registró');
  assert.strictEqual(await entradasHoy(nav, 3), 1);

  await teclear(nav, codigo(6), null); // lector configurado sin Enter
  await enMsg(nav, socio(6).nombre);
  assert.strictEqual(await entradasHoy(nav, 6), 1);

  await teclear(nav, codigo(9).toLowerCase(), 'Tab'); // Bloq Mayús activado y sufijo Tab
  await enMsg(nav, socio(9).nombre);
  assert.strictEqual(await evaluar(nav, `document.activeElement.id`), 'k-buscar', 'el Tab del lector no saca el foco del campo');
});

prueba('lector USB: código desconocido avisa; buscar por nombre sigue igual; código a medias no dice "no se encontró"', async () => {
  const falso = 'SAG000099' + codigo(5).slice(-4);
  await teclear(nav, falso);
  await enMsg(nav, 'no corresponde');
  assert.match(await claseMsg(nav), /\berror\b/);
  await teclear(nav, 'maria', null);
  await esperar(nav, `document.querySelector('#k-res').textContent.includes('María Fernanda Ortiz')`, 3000);
  await evaluar(nav, vaciar);
  await teclear(nav, 'SAG0000', null);
  await dormir(250);
  assert.ok(await evaluar(nav, `!!document.querySelector('#k-res .k-codigo') && !document.querySelector('#k-res').textContent.includes('No se encontró')`));
  assert.match(await evaluar(nav, `document.querySelector('#k-res .k-codigo').textContent`), /SAG, 6 números y 4 letras o números/);
  await evaluar(nav, vaciar);
  await teclear(nav, 'SAG000005'); // incompleto + Enter: lo dice, no se queda callado
  await enMsg(nav, 'incompleto');
  assert.match(await msg(nav), /SAG, 6 números y 4 letras o números/);
  await evaluar(nav, vaciar);
  await teclear(nav, PASE_VISITANTE.slice(0, 15)); // pase diario a medias
  await enMsg(nav, 'SAGP y 18 letras o números');
  await evaluar(nav, vaciar);
});

prueba('lector USB: código vencido (captura de hace 5 min) avisa y no registra; el QR en vivo sí entra enseguida', async () => {
  await evaluar(nav, `document.querySelector('#k-buscar').focus()`);
  assert.strictEqual(await entradasHoy(nav, VIEJO), 0);
  await teclear(nav, codigo(VIEJO, T - 5 * 60 * 1000));
  await enMsg(nav, 'Código vencido (de hace 5 min)');
  const texto = await msg(nav);
  assert.match(texto, new RegExp(`Pide a ${socio(VIEJO).nombre} que abra «Mi plan» y muestre el QR en vivo: una captura de pantalla no sirve\\. Si es el suyo, revisa la hora de su celular\\.`));
  assert.match(await claseMsg(nav), /\berror\b/);
  assert.strictEqual(await entradasHoy(nav, VIEJO), 0, 'no registra');
  await teclear(nav, codigo(VIEJO)); // abre «Mi plan» y muestra el QR en vivo (antes de 4 s): no es una relectura
  await enMsg(nav, `Entrada de ${socio(VIEJO).nombre} registrada`);
  assert.strictEqual(await entradasHoy(nav, VIEJO), 1);
});

prueba('lector USB: pase diario de otro equipo entra como visitante una sola vez', async () => {
  const antes = await todasHoy(nav);
  await teclear(nav, PASE_VISITANTE);
  await enMsg(nav, 'Pase diario: entrada registrada');
  assert.match(await msg(nav), /Visitante con pase diario/);
  assert.match(await claseMsg(nav), /\bok\b/);
  assert.strictEqual(await todasHoy(nav), antes + 1);
  assert.strictEqual(await evaluar(nav, `document.querySelector('#k-num').textContent`), String(antes + 1), 'el contador cuenta al visitante');
  assert.match(await evaluar(nav, `document.querySelector('#k-lista .fila').textContent`), /Visitante con pase diario.*Pase diario/, 'y la lista lo muestra');
  await dormir(500);
  await teclear(nav, PASE_VISITANTE); // el lector lo relee enseguida: no cambia el verde
  await dormir(400);
  assert.match(await claseMsg(nav), /\bok\b/);
  await dormir(4200);
  await teclear(nav, PASE_VISITANTE); // vuelve a intentarlo más tarde
  await enMsg(nav, 'Este pase diario ya se usó hoy a las ');
  assert.match(await claseMsg(nav), /\berror\b/);
  assert.strictEqual(await todasHoy(nav), antes + 1, 'no entra dos veces');
});

prueba('lector USB: pase de otro día, de un día futuro o alterado: lo dice y no registra', async () => {
  const antes = await todasHoy(nav);
  const cedula = socio(ACTIVO).cedula;
  await teclear(nav, pase(ACTIVO, cedula, Util.sumarDias(HOY, -1)));
  await enMsg(nav, `Este pase era para el ${Util.fechaCorta(Util.sumarDias(HOY, -1))}.`);
  await teclear(nav, pase(ACTIVO, cedula, Util.sumarDias(HOY, 2)));
  await enMsg(nav, `Este pase es para el ${Util.fechaCorta(Util.sumarDias(HOY, 2))}.`);
  const bueno = pase(ACTIVO, cedula);
  const alterado = bueno.slice(0, -1) + (bueno.slice(-1) === 'Z' ? 'Y' : 'Z');
  await teclear(nav, alterado);
  await enMsg(nav, 'Pase no válido: el código está alterado.');
  assert.match(await claseMsg(nav), /\berror\b/);
  assert.strictEqual(await todasHoy(nav), antes);
  // Un pase de ayer que ya se usó ayer: dice qué día se usó, no «hoy».
  await usarPaseAyer(nav, PASE_AYER);
  await teclear(nav, PASE_AYER);
  await enMsg(nav, `Este pase diario ya se usó el ${Util.fechaCorta(AYER)} a las `);
  assert.doesNotMatch(await msg(nav), /usó hoy/);
  assert.strictEqual(await todasHoy(nav), antes);
});

prueba('lector USB: celular con la hora desfasada (su código pasa de vigente a vencido al releerlo): sigue registrada', async () => {
  await entrarPanel(nav, base); // datos nuevos: María Fernanda todavía no entró hoy
  await evaluar(nav, `document.querySelector('#k-buscar').focus()`);
  const nombre = socio(ACTIVO).nombre;
  await teclear(nav, codigo(ACTIVO, T - 6 * 15000)); // el más viejo que todavía vale (hora atrasada ~1,5 min)
  await enMsg(nav, `Entrada de ${nombre} registrada`);
  await dormir(500);
  await teclear(nav, codigo(ACTIVO, T - 7 * 15000)); // el lector lo relee justo cuando su QR cambia: ya sale vencido
  await dormir(400);
  assert.match(await msg(nav), new RegExp(`Entrada de ${nombre} registrada`), 'la relectura no cambia el mensaje');
  assert.doesNotMatch(await msg(nav), /vencido/);
  assert.match(await claseMsg(nav), /\bok\b/);
  assert.strictEqual(await entradasHoy(nav, ACTIVO), 1);
  await dormir(4200); // pasado el rato de las relecturas, ese código vencido sí se avisa
  await teclear(nav, codigo(ACTIVO, T - 7 * 15000));
  await enMsg(nav, 'Código vencido (de hace 2 min)');
  assert.strictEqual(await entradasHoy(nav, ACTIVO), 1);
});

prueba('lector USB: lo que quedó escrito antes en el campo no estorba (ni un QR que no era carnet)', async () => {
  await evaluar(nav, `document.querySelector('#k-buscar').focus()`);
  await teclear(nav, 'maria', null); // búsqueda que quedó a medias
  await dormir(200);
  await teclear(nav, codigo(14));
  await enMsg(nav, socio(14).nombre);
  assert.strictEqual(await entradasHoy(nav, 14), 1);
  assert.strictEqual(await evaluar(nav, `document.querySelector('#k-buscar').value`), '');
  await teclear(nav, 'HOLA123'); // un QR ajeno con Enter: queda escrito…
  await teclear(nav, codigo(17), null); // …y la lectura siguiente igual vale (esta, sin Enter)
  await enMsg(nav, socio(17).nombre);
  await evaluar(nav, vaciar);
  await teclear(nav, 'SAG' + codigo(18).slice(3).replace(/0/g, 'O'));
  await enMsg(nav, socio(18).nombre);
  assert.strictEqual(await entradasHoy(nav, 18), 1);
});

prueba('lector USB sin Enter en el campo: sin parpadeo de la lista y un Tab tardío no saca el foco; "SAGOOOO" es código, "Sagot" no', async () => {
  await evaluar(nav, `document.querySelector('#k-buscar').focus()`);
  await evaluar(nav, `window.__parpadeo2 = 0; new MutationObserver(() => { const r = document.querySelector('#k-res'); if (r && (r.querySelector('.fila, .k-codigo') || r.textContent.includes('No se encontró'))) window.__parpadeo2++; }).observe(document.querySelector('#k-res'), { childList: true, subtree: true }); true`);
  await teclear(nav, codigo(20), null);
  await dormir(450);
  await tecla(nav, 'Tab'); // sufijo Tab que llega tarde
  await enMsg(nav, socio(20).nombre);
  assert.strictEqual(await evaluar(nav, `window.__parpadeo2`), 0, 'ni socios sueltos, ni pista, ni "no se encontró" mientras se lee');
  assert.strictEqual(await evaluar(nav, `document.activeElement.id`), 'k-buscar', 'el Tab tardío no sacó el foco del campo');
  await teclear(nav, 'SAGOOOO', null);
  await esperar(nav, `!!document.querySelector('#k-res .k-codigo')`, 3000);
  await evaluar(nav, vaciar);
  await teclear(nav, 'Sagot', null);
  await esperar(nav, `document.querySelector('#k-res').textContent.includes('No se encontró')`, 3000);
  await tecla(nav, 'Enter');
  await dormir(200);
  assert.doesNotMatch(await msg(nav), /incompleto/, 'un apellido no es un "código incompleto"');
  await evaluar(nav, vaciar);
});

prueba('lector USB sin el campo enfocado: con un botón enfocado su Enter no lo activa; sin foco también lee', async () => {
  await evaluar(nav, `document.querySelector('#k-camara').focus()`);
  await teclear(nav, codigo(8));
  await enMsg(nav, socio(8).nombre);
  await dormir(300);
  assert.ok(await evaluar(nav, `document.querySelector('#k-escaner').hidden && document.querySelector('#k-camara').getAttribute('aria-expanded') === 'false'`), 'el Enter no abrió la cámara');
  await evaluar(nav, `document.activeElement.blur(); true`);
  await teclear(nav, codigo(10));
  await enMsg(nav, socio(10).nombre);
  await teclear(nav, codigo(11), null);
  await enMsg(nav, socio(11).nombre);
});

prueba('lector USB con un botón enfocado: un QR ajeno, uno con espacios o un Enter tardío no lo activan', async () => {
  const cerrada = `document.querySelector('#k-escaner').hidden && document.querySelector('#k-camara').getAttribute('aria-expanded') === 'false'`;
  await evaluar(nav, `document.querySelector('#k-camara').focus()`);
  await teclear(nav, 'HOLA123');
  await enMsg(nav, 'no es un carnet');
  await dormir(200);
  assert.ok(await evaluar(nav, cerrada), 'QR ajeno + Enter');
  await teclear(nav, 'HOLA MUNDO', null);
  await dormir(600);
  assert.ok(await evaluar(nav, cerrada), 'QR con espacio');
  await teclear(nav, codigo(15), null);
  await dormir(450); // el Enter llega tarde (lector Bluetooth lento): la entrada ya se registró sola
  await tecla(nav, 'Enter');
  await enMsg(nav, socio(15).nombre);
  await dormir(200);
  assert.ok(await evaluar(nav, cerrada), 'Enter tardío');
  assert.strictEqual(await entradasHoy(nav, 15), 1);
});

prueba('teclado normal en Check-in: un espacio suelto no "se traga" el Enter siguiente', async () => {
  await dormir(1100); // que pase la ventana del Enter tardío de la prueba anterior
  await evaluar(nav, `document.querySelector('#nav-lateral a[href="#socios"]').focus()`);
  await nav.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 });
  await nav.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await dormir(80);
  await tecla(nav, 'Enter'); // Enter en el enlace del menú: debe ir a Socios
  await esperar(nav, `location.hash === '#socios'`, 3000);
  await evaluar(nav, `location.hash = '#checkin'`);
  await esperar(nav, `!!document.querySelector('#k-buscar')`);
});

prueba('fuera del Check-in el lector no registra nada', async () => {
  await evaluar(nav, `location.hash = '#socios'`);
  await esperar(nav, `location.hash === '#socios' && !document.querySelector('#k-buscar')`);
  await evaluar(nav, `document.activeElement && document.activeElement.blur && document.activeElement.blur(); true`);
  await teclear(nav, codigo(12));
  await dormir(600);
  assert.strictEqual(await entradasHoy(nav, 12), 0);
});

prueba('recepción: no ve Reportes ni Ajustes, #reportes la manda a Inicio, y registra entradas con su nombre', async () => {
  await tamano(nav, 'laptop');
  await entrarPanel(nav, base, 'inicio', '', 2);
  const secciones = await evaluar(nav, `Array.from(document.querySelectorAll('#nav-lateral [data-nav]')).map((a) => a.dataset.nav)`);
  assert.ok(secciones.includes('checkin'), 've Check-in: ' + secciones);
  assert.ok(!secciones.includes('reportes') && !secciones.includes('ajustes'), 'menú lateral: ' + secciones);
  const inferior = await evaluar(nav, `Array.from(document.querySelectorAll('#nav-inferior [data-nav]')).map((a) => a.dataset.nav)`);
  assert.ok(!inferior.includes('reportes') && !inferior.includes('ajustes'), 'barra inferior: ' + inferior);
  await evaluar(nav, `location.hash = '#reportes'`);
  await esperar(nav, `Admin.pantallaActual() === 'inicio'`, 3000);
  assert.ok(await evaluar(nav, `!document.querySelector('#r-planes')`), 'no se pintan los reportes');
  await evaluar(nav, `location.hash = '#checkin'`);
  await esperar(nav, `!!document.querySelector('#k-buscar')`);
  await evaluar(nav, `document.querySelector('#k-buscar').focus()`);
  await teclear(nav, codigo(23));
  await enMsg(nav, socio(23).nombre);
  assert.strictEqual(await evaluar(nav, `Store.list('asistencias').filter((a) => a.socioId === 23 && a.fecha === Store.hoy()).map((a) => a.por).join()`), 'Ana Torres');
  assert.match(await evaluar(nav, `document.querySelector('#k-lista .fila').textContent`), /Registró Ana Torres/);
});

prueba('reportes del dueño: planes más vendidos, entradas por día de la semana y quién dejó de venir (7 y 30 días)', async () => {
  for (const t of ['laptop', 'celular', 'chico']) {
    await tamano(nav, t);
    await entrarPanel(nav, base, 'reportes');
    await esperar(nav, `!!document.querySelector('#r-planes')`);
    for (const rango of [7, 30]) {
      if (rango === 30) {
        await evaluar(nav, `document.querySelector('[data-rango="30"]').click()`);
        await esperar(nav, `document.querySelector('[data-rango="30"]').getAttribute('aria-pressed') === 'true'`);
      }
      const r = await evaluar(nav, `(() => {
        const hoy = Store.hoy(); const desde = Util.sumarDias(hoy, -(${rango} - 1));
        const pagos = Store.list('pagos').filter((p) => p.fecha >= desde && p.fecha <= hoy);
        const filas = Array.from(document.querySelectorAll('#r-planes .r-plan')).map((li) => ({
          nombre: li.querySelector('strong').textContent, cantidad: Number(li.querySelector('.r-plan-num b').textContent) }));
        return { pagos: pagos.length, planes: Store.planes().length, filas,
          barras: document.querySelectorAll('#r-semana svg .barra').length,
          dias: Array.from(document.querySelectorAll('#r-semana svg text')).map((x) => x.textContent).filter((x) => /^[A-Z][a-záé]{2}$/.test(x)),
          dato: document.querySelector('#r-dias .r-dato').textContent,
          sub: document.querySelector('#r-dias .r-sub').textContent,
          semana: Array.from(document.querySelectorAll('#r-semana svg .barra')).map((g) => Number(g.dataset.tip.split(': ').pop())),
          // Lo esperado: los ${rango} días completos antes de hoy (total en 7 días; promedio con un decimal en 30).
          esperado: (() => {
            const t = Array(7).fill(0), v = Array(7).fill(0);
            for (let k = 1; k <= ${rango}; k++) {
              const f = Util.sumarDias(hoy, -k); const [y, m, d] = f.split('-').map(Number);
              const i = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
              v[i]++; t[i] += Store.list('asistencias').filter((a) => a.fecha === f).length;
            }
            return t.map((x, i) => (${rango} === 7 ? x : Math.round((x / v[i]) * 10) / 10));
          })(),
          entradasHoy: Store.list('asistencias').filter((a) => a.fecha === hoy).length,
          ausentes: document.querySelectorAll('#r-ausentes .r-ausente').length, segAusente: Store.segmentos().ausente.length,
          wa: Array.from(document.querySelectorAll('#r-ausentes [data-recordar]')).map((a) => a.href),
          ficha: (document.querySelector('#r-ausentes .r-ficha') || {}).getAttribute ? document.querySelector('#r-ausentes .r-ficha').getAttribute('href') : '' };
      })()`);
      assert.strictEqual(r.filas.length, r.planes, 'un renglón por plan');
      assert.strictEqual(r.filas.reduce((a, f) => a + f.cantidad, 0), r.pagos, 'cuenta todos los planes vendidos del periodo');
      assert.ok(r.filas.every((f, i) => !i || r.filas[i - 1].cantidad >= f.cantidad), 'el más vendido primero');
      assert.strictEqual(r.barras, 7, 'lunes a domingo');
      assert.deepStrictEqual(r.dias, ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
      assert.match(r.dato, /Más gente: los \S+/);
      assert.ok(r.entradasHoy > 0, 'hay entradas de hoy (que no deben contar)');
      assert.deepStrictEqual(r.semana, r.esperado, `por día de la semana, sin contar hoy (${rango} días)`);
      assert.match(r.sub, /hoy no cuenta/);
      assert.strictEqual(r.ausentes, Math.min(8, r.segAusente), 'dejaron de venir');
      assert.ok(r.ausentes > 0 && r.wa.length && r.wa.every((h) => h.startsWith('https://wa.me/507')), 'botón de WhatsApp');
      assert.match(r.ficha, /^#socios\?.*ficha=\d+/, 'enlace a la ficha');
      assert.ok(await sinDesborde(nav), `sin scroll horizontal (${t}, ${rango} días)`);
    }
    await evaluar(nav, `document.querySelector('#r-planes').scrollIntoView({ block: 'start' }); true`);
    await dormir(1000);
    await captura(nav, t + '-reportes-planes');
    await evaluar(nav, `document.querySelector('#r-ausentes').scrollIntoView({ block: 'start' }); true`);
    await dormir(400);
    await captura(nav, t + '-reportes-ausentes');
  }
  // Recordar por WhatsApp ofrece anotarlo en el historial (como en la ficha).
  await evaluar(nav, `(() => { const a = document.querySelector('#r-ausentes [data-recordar]'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); return true; })()`);
  await esperar(nav, `!document.querySelector('#r-ausentes [data-aviso]').hidden`, 2000);
  const id = await evaluar(nav, `Number(document.querySelector('#r-ausentes [data-contactado]').dataset.contactado)`);
  await evaluar(nav, `document.querySelector('#r-ausentes [data-contactado]').click()`);
  assert.ok(await evaluar(nav, `Store.get('socios', ${id}).notas.some((n) => n.tipo === 'whatsapp' && n.fecha === Store.hoy())`), 'nota de contacto');
  // El nombre lleva a su ficha.
  const nombre = await evaluar(nav, `Store.get('socios', ${id}).nombre`);
  await evaluar(nav, `document.querySelector('#r-ausentes .r-ficha').click()`);
  await esperar(nav, `location.hash.startsWith('#socios') && !!document.querySelector('#f-volver') && document.querySelector('#pantalla h2').textContent.includes(${JSON.stringify(nombre)})`, 3000);
});

prueba('reportes: «Dejaron de venir» con el teclado: el foco se ve en el nombre (enlace a la ficha)', async () => {
  for (const t of ['laptop', 'chico']) {
    await tamano(nav, t);
    await entrarPanel(nav, base, 'reportes');
    await esperar(nav, `!!document.querySelector('#r-ausentes .r-ficha')`);
    // Tab hasta el primer nombre, como lo haría el dueño.
    await evaluar(nav, `document.querySelector('#r-ausentes .r-sub').setAttribute('tabindex', '-1'); document.querySelector('#r-ausentes .r-sub').focus(); true`);
    await tecla(nav, 'Tab');
    const r = await evaluar(nav, `(() => {
      const a = document.activeElement; const cs = getComputedStyle(a); const b = a.getBoundingClientRect(); const q = a.closest('.quien').getBoundingClientRect();
      return { ficha: a.classList.contains('r-ficha'), visible: a.matches(':focus-visible'), borde: cs.outlineStyle + ' ' + cs.outlineWidth,
        cajas: Array.from(a.getClientRects()).map((x) => Math.round(x.width) + 'x' + Math.round(x.height)), dentro: b.right <= q.right + 1 };
    })()`);
    assert.ok(r.ficha && r.visible, 'el foco llega al nombre: ' + JSON.stringify(r));
    // Un enlace en línea que envuelve un bloque queda en cajas vacías (0x0) y el borde del foco no se dibuja.
    assert.ok(/solid 3px/.test(r.borde) && r.cajas.length === 1 && !/^0x|x0$/.test(r.cajas[0]), 'una sola caja donde se dibuja el borde del foco: ' + JSON.stringify(r));
    assert.ok(r.dentro, 'el nombre no se sale de su fila: ' + JSON.stringify(r));
    await evaluar(nav, `document.activeElement.scrollIntoView({ block: 'center' }); true`);
    await dormir(700);
    await captura(nav, t + '-reportes-foco-ficha');
    await evaluar(nav, `document.querySelector('#r-ausentes .r-sub').removeAttribute('tabindex'); true`);
  }
});

prueba('reportes: «Entradas por día de la semana» no cuenta hoy, nombra los empates y dice «1 entrada»', async () => {
  await tamano(nav, 'laptop');
  await entrarPanel(nav, base, 'reportes');
  const guardado = await evaluar(nav, `localStorage.getItem('sag:db')`);
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
  const diaDe = (iso) => { const [y, m, d] = iso.split('-').map(Number); return DIAS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]; };
  const antes = [1, 2, 3, 4, 5, 6, 7].map((k) => Util.sumarDias(HOY, -k)); // los 7 días completos antes de hoy
  // Pone estas entradas (y nada más) en los datos guardados y abre Reportes en 7 días.
  const conEntradas = async (fechas) => {
    const db = JSON.parse(guardado);
    db.asistencias = fechas.map((f, i) => ({ id: i + 1, socioId: 1 + (i % 20), fecha: f, hora: '08:00' }));
    await ir(nav, base + '/404.html');
    await evaluar(nav, `localStorage.setItem('sag:db', ${JSON.stringify(JSON.stringify(db))}); true`);
    await ir(nav, base + '/admin.html#reportes');
    await esperar(nav, `!!document.querySelector('#r-dias .r-dato')`);
    return evaluar(nav, `document.querySelector('#r-dias .r-dato').textContent.replace(/\\s+/g, ' ').trim()`);
  };
  // Primera semana: 1 entrada por día, y hoy (que aún no termina) solo 3 hasta ahora.
  assert.strictEqual(await conEntradas([...antes, HOY, HOY, HOY]), 'Todos los días vino la misma cantidad de gente (1 entrada).');
  // Empate: dos días con 2 entradas y el resto con 1; hoy sin nadie todavía (no sale como el de menos gente).
  const menos = antes.slice(2).map(diaDe).map((d) => 'los ' + d);
  const lista = (n) => n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
  const masDias = lista([antes[0], antes[1]].map(diaDe).sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b)).map((d) => 'los ' + d));
  const menosDias = lista(menos.sort((a, b) => DIAS.indexOf(a.slice(4)) - DIAS.indexOf(b.slice(4))));
  assert.strictEqual(await conEntradas([...antes, antes[0], antes[1]]),
    `Más gente: ${masDias} (2 entradas). Menos gente: ${menosDias} (1 entrada).`);
  assert.ok(await sinDesborde(nav), 'sin scroll horizontal');
});

prueba('lector del navegador (BarcodeDetector): se usa cuando existe', async () => {
  await tamano(nav, 'laptop');
  await entrarPanel(nav, base, 'checkin', '?shim=nativo');
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  assert.ok(await evaluar(nav, `window.__nativoUsado === true`));
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
});

prueba('lector del navegador que falla: cambia solo a jsQR y sigue leyendo', async () => {
  await entrarPanel(nav, base, 'checkin', '?shim=falla');
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  assert.ok(await evaluar(nav, `window.__fallosNativo >= 8 && typeof window.jsQR === 'function'`));
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
});

prueba('lector del navegador que nunca encuentra nada (Android sin su módulo): a los pocos segundos lee con jsQR', async () => {
  await entrarPanel(nav, base, 'checkin', '?shim=vacio');
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  assert.ok(await evaluar(nav, `window.__vacioLlamadas > 0 && typeof window.jsQR === 'function'`));
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
});

prueba('lector del navegador sano que tarda en ver el QR: jsQR registra esa lectura pero no lo reemplaza', async () => {
  await entrarPanel(nav, base, 'checkin', '?shim=tarde');
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre); // a los ~3,5 s lo lee jsQR (el del navegador aún no ve nada)
  await esperar(nav, `Date.now() > window.__nativoDesde + 2500`, 10000); // ya ve bien y pasó la pausa tras la lectura
  const antes = await evaluar(nav, `window.__tardeLlamadas`);
  await dormir(1000);
  assert.ok(await evaluar(nav, `window.__tardeLlamadas`) > antes, 'el lector del navegador se sigue usando');
  assert.strictEqual(await entradasHoy(nav, ACTIVO), 1);
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
});

prueba('permiso de cámara negado (por el sitio o por el sistema): explica dónde activarlo', async () => {
  await entrarPanel(nav, base, 'checkin', '?shim=permiso');
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
  await esperar(nav, `document.querySelector('#k-aviso-camara').textContent.includes('Permitir')`, 5000);
  assert.match(await evaluar(nav, `document.querySelector('#k-aviso-camara').textContent`), /aA/);
  assert.match(await evaluar(nav, `document.querySelector('#k-aviso-camara').textContent`), /«Leer QR del socio»/);
  assert.ok(await evaluar(nav, `document.querySelector('#k-escaner').hidden && window.__pantalla.soltados === window.__pantalla.pedidos`), 'se cierra y suelta la pantalla');
  await entrarPanel(nav, base, 'checkin', '?shim=sistema');
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
  await esperar(nav, `document.querySelector('#k-aviso-camara').textContent.includes('Privacidad')`, 5000);
});

prueba('con la cámara abierta, buscar por nombre muestra los resultados a la vista', async () => {
  await tamano(nav, 'laptop');
  await entrarPanel(nav, base);
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  await evaluar(nav, `document.querySelector('#k-buscar').focus()`);
  await teclear(nav, 'mar', null);
  await esperar(nav, `!!document.querySelector('#k-res .fila')`, 3000);
  const r = await evaluar(nav, `(() => { const b = document.querySelector('#k-res .fila').getBoundingClientRect(); return { arriba: b.top, abajo: b.bottom, alto: innerHeight }; })()`);
  assert.ok(r.arriba >= 0 && r.abajo <= r.alto, 'el primer resultado se ve: ' + JSON.stringify(r));
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
});

prueba('celular con la cámara abierta: tras tocar «Entrada» en un resultado, el mensaje queda sobre la barra inferior', async () => {
  await tamano(nav, 'celular');
  await entrarPanel(nav, base);
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  await evaluar(nav, `(() => { const b = document.querySelector('#k-buscar'); b.focus(); b.value = 'batista'; b.dispatchEvent(new Event('input')); return true; })()`);
  await esperar(nav, `!!document.querySelector('#k-res [data-entrada]')`, 3000);
  await evaluar(nav, `document.activeElement.blur(); document.querySelector('#k-res [data-entrada]').click(); true`);
  await enMsg(nav, socio(3).nombre);
  await dormir(400);
  const r = await evaluar(nav, `(() => { const m = document.querySelector('#k-msg').getBoundingClientRect(); const n = document.querySelector('#nav-inferior').getBoundingClientRect(); return { arriba: m.top, abajo: m.bottom, barra: n.top }; })()`);
  assert.ok(r.arriba >= 0 && r.abajo <= r.barra + 1, 'mensaje a la vista: ' + JSON.stringify(r));
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
});

prueba('celular en horizontal: la cámara entra en la pantalla y el resultado se ve sobre la barra', async () => {
  await tamano(nav, 'horizontal');
  await entrarPanel(nav, base);
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  await dormir(500); // termina el desplazamiento suave hasta la cámara
  const r = await evaluar(nav, `(() => { const el = document.querySelector('.escaner-res'); const e = el.getBoundingClientRect(); const n = document.querySelector('#nav-inferior').getBoundingClientRect(); return { oculto: el.hidden, arriba: e.top, abajo: e.bottom, alto: e.height, barra: n.top }; })()`);
  assert.ok(!r.oculto && r.alto > 0 && r.arriba >= 0 && r.abajo <= r.barra, 'resultado a la vista: ' + JSON.stringify(r));
  await captura(nav, 'horizontal-checkin-camara');
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
});

prueba('celular: cámara en el Check-in, sin teclado en pantalla al entrar y sin desbordes', async () => {
  await tamano(nav, 'celular');
  await entrarPanel(nav, base);
  const fino = await evaluar(nav, `matchMedia('(pointer: fine)').matches`);
  assert.strictEqual(await evaluar(nav, `document.activeElement && document.activeElement.id === 'k-buscar'`), fino, 'el campo solo se enfoca con puntero fino');
  await captura(nav, 'celular-checkin');
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  assert.ok(await sinDesborde(nav), 'sin scroll horizontal');
  await evaluar(nav, `document.querySelector('#k-escaner').scrollIntoView({ block: 'center' }); true`);
  await dormir(300);
  await captura(nav, 'celular-checkin-camara');
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
});

prueba('celular chico (360 px): Check-in con la cámara abierta, mensajes largos y "Mi plan" sin scroll horizontal', async () => {
  await tamano(nav, 'chico');
  await entrarPanel(nav, base);
  await captura(nav, 'chico-checkin');
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  assert.ok(await sinDesborde(nav), 'Check-in');
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
  await evaluar(nav, `document.querySelector('#k-buscar').focus()`);
  await teclear(nav, codigo(VIEJO, T - 5 * 60 * 1000)); // el mensaje más largo
  await enMsg(nav, 'Código vencido');
  assert.ok(await sinDesborde(nav), 'mensaje de código vencido');
  await evaluar(nav, `document.querySelector('#k-msg').scrollIntoView({ block: 'center' }); true`);
  await dormir(500);
  await captura(nav, 'chico-checkin-vencido');
  await entrarMiPlan(nav, base, socio(ACTIVO));
  assert.ok(await sinDesborde(nav), 'carnet');
});

prueba('tablet: cámara en el Check-in sin desbordes', async () => {
  await tamano(nav, 'tablet');
  await entrarPanel(nav, base);
  await abrirCamaraYLeer(nav, socio(ACTIVO).nombre);
  assert.ok(await sinDesborde(nav));
  await captura(nav, 'tablet-checkin-camara');
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
});

prueba('Mi plan: el QR personal muestra el código, el QR dibujado se lee y cambia con el reloj cada 15 s', async () => {
  for (const t of ['celular', 'laptop']) {
    await tamano(nav, t);
    await entrarMiPlan(nav, base, socio(ACTIVO));
    const visible = await evaluar(nav, `document.querySelector('.carnet-codigo').textContent`);
    assert.match(visible, /^SAG \d{6} [0-9A-Z]{4}$/, 'el código se ve agrupado para leerlo o teclearlo: ' + visible);
    assert.strictEqual(Util.leerCodigo(visible).codigo, codigo(ACTIVO), 'y así escrito también vale');
    assert.strictEqual(await evaluar(nav, `(document.querySelector('meta[name="color-scheme"]') || {}).content`), 'dark', 'la página declara que ya es oscura');
    const leido = await leerCanvasQR(nav);
    assert.strictEqual(leido.texto, codigo(ACTIVO), 'el QR del carnet se lee');
    assert.match(leido.etiqueta, /Código QR de entrada de María/);
    assert.ok(leido.ancho >= 170, 'QR de buen tamaño (' + leido.ancho + ' px)');
    assert.ok(await sinDesborde(nav), 'sin scroll horizontal');
    await evaluar(nav, `document.querySelector('.carnet-pase').scrollIntoView({ block: 'center' }); true`);
    await dormir(700);
    await captura(nav, t + '-carnet');
  }
  // Pasan 15 s: el código escrito y el QR cambian solos (una captura de pantalla deja de servir).
  await evaluar(nav, `window.__relojQR += 15000; true`);
  await esperar(nav, `document.querySelector('.carnet-codigo').textContent.replace(/\\s/g, '') === ${JSON.stringify(codigo(ACTIVO, T + 15000))}`, 3000);
  assert.strictEqual((await leerCanvasQR(nav)).texto, codigo(ACTIVO, T + 15000), 'el QR dibujado también cambió');
  await evaluar(nav, `window.__relojQR = ${T}; true`);
});

prueba('red local por http (sin https): explica por qué no abre la cámara', async () => {
  const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  if (!ip) { console.log('     (sin red local: se omite)'); return; }
  await tamano(nav, 'laptop');
  await entrarPanel(nav, `http://${ip.address}:${puerto}`);
  assert.strictEqual(await evaluar(nav, `window.isSecureContext`), false);
  await evaluar(nav, `document.querySelector('#k-camara').click()`);
  assert.match(await evaluar(nav, `document.querySelector('#k-aviso-camara').textContent`), /https/);
  assert.ok(await evaluar(nav, `document.querySelector('#k-escaner').hidden`));
});

async function conNavegador(video, args, fn) {
  const c = await lanzar(video, args);
  try { await fn(c); } finally { c.salir(); }
  assert.deepStrictEqual(c.errores, [], 'errores en la consola');
}
const conVideo = (textos, nombre, fn, op) => conNavegador(videoConQR(textos, path.join(TMP, nombre + '.y4m'), op), [], fn);

prueba('cámara: el QR del socio cambia mientras lo sigue mostrando (6 s cada código): cuenta una sola vez', async () => {
  await conVideo([codigo(ACTIVO), codigo(ACTIVO, T + 15000)], 'cambia', async (c) => {
    await tamano(c, 'laptop');
    await entrarPanel(c, base);
    // Se anota cada código distinto que llega a revisarse, para saber que la cámara vio los dos.
    await evaluar(c, `window.__vistos = new Set(); const o = Store.analizarCodigo; Store.analizarCodigo = (t) => { window.__vistos.add(String(t)); return o(t); }; true`);
    await evaluar(c, `window.__sobre = []; new MutationObserver(() => { const r = document.querySelector('.escaner-res'); if (r && !r.hidden) window.__sobre.push(r.textContent); }).observe(document.querySelector('#k-escaner'), { childList: true, subtree: true, attributes: true }); true`);
    await abrirCamaraYLeer(c, socio(ACTIVO).nombre);
    await esperar(c, `window.__vistos.size >= 2`, 12000); // cambió más de 4 s después de la primera lectura
    await dormir(1500);
    assert.strictEqual(await entradasHoy(c, ACTIVO), 1);
    assert.match(await msg(c), /registrada/);
    assert.doesNotMatch(await msg(c), /ya registró/);
    assert.ok((await evaluar(c, `window.__sobre`)).every((t) => !/Ya entró/.test(t)), 'sobre la imagen no dice "Ya entró hoy"');
  }, { segundos: 6 });
});

prueba('cámara: celular con la hora desfasada (su QR pasa de vigente a vencido a la vista): cuenta una vez y no dice «vencido»', async () => {
  await conVideo([codigo(ACTIVO, T - 6 * 15000), codigo(ACTIVO, T - 7 * 15000)], 'desfasado', async (c) => {
    await tamano(c, 'laptop');
    await entrarPanel(c, base);
    await evaluar(c, `window.__estados = []; const o = Store.analizarCodigo; Store.analizarCodigo = (t) => { const r = o(t); window.__estados.push(r.estado); return r; }; true`);
    await evaluar(c, `window.__sobre = []; new MutationObserver(() => { const r = document.querySelector('.escaner-res'); if (r && !r.hidden) window.__sobre.push(r.textContent); }).observe(document.querySelector('#k-escaner'), { childList: true, subtree: true, attributes: true }); true`);
    await abrirCamaraYLeer(c, socio(ACTIVO).nombre);
    // Ya leído vigente, la cámara ve su código vencido sin que el celular salga de la vista.
    await esperar(c, `window.__estados.indexOf('viejo', window.__estados.indexOf('ok')) > 0`, 15000);
    await dormir(1500);
    assert.strictEqual(await entradasHoy(c, ACTIVO), 1);
    assert.match(await msg(c), new RegExp(`Entrada de ${socio(ACTIVO).nombre} registrada`));
    assert.doesNotMatch(await msg(c), /vencido/);
    const sobre = await evaluar(c, `window.__sobre`);
    const i = sobre.findIndex((t) => /registrada/.test(t));
    assert.ok(i >= 0 && sobre.slice(i).every((t) => !/vencido/.test(t)), 'sobre la imagen no pasa a "Código vencido": ' + JSON.stringify(sobre.slice(i, i + 3)));
  }, { segundos: 6 });
});

prueba('cámara: primero una captura (código vencido) y enseguida el QR en vivo: el segundo sí entra', async () => {
  await conVideo([codigo(VIEJO, T - 5 * 60 * 1000), codigo(VIEJO)], 'captura', async (c) => {
    await tamano(c, 'laptop');
    await entrarPanel(c, base);
    await evaluar(c, `document.querySelector('#k-camara').click()`);
    await enMsg(c, 'Código vencido (de hace 5 min)', 15000);
    assert.strictEqual(await entradasHoy(c, VIEJO), 0, 'la captura no registra');
    await enMsg(c, `Entrada de ${socio(VIEJO).nombre} registrada`, 15000);
    assert.strictEqual(await entradasHoy(c, VIEJO), 1);
  }, { segundos: 5 });
});

prueba('cámara: un pase que se usó ayer dice qué día se usó, no «hoy»', async () => {
  await conVideo(PASE_AYER, 'pase-ayer', async (c) => {
    await tamano(c, 'laptop');
    await entrarPanel(c, base);
    await usarPaseAyer(c, PASE_AYER);
    await evaluar(c, `document.querySelector('#k-camara').click()`);
    await esperar(c, `!document.querySelector('.escaner-res').hidden && document.querySelector('.escaner-res').textContent.includes('Pase ya usado')`, 15000);
    const sobre = await evaluar(c, `document.querySelector('.escaner-res').textContent`);
    assert.match(sobre, new RegExp(`Se usó el ${Util.fechaCorta(AYER)} a las \\d\\d:\\d\\d`));
    assert.doesNotMatch(sobre, /hoy/);
    await enMsg(c, `Este pase diario ya se usó el ${Util.fechaCorta(AYER)} a las `);
    await dormir(700); // termina la animación del mensaje
    await captura(c, 'laptop-checkin-pase-ayer');
  });
});

prueba('cámara: pase diario de un solo uso (plan diario cobrado hoy): entra una vez y la segunda dice que ya se usó', async () => {
  await conVideo(PASE_VENCIDO, 'pase', async (c) => {
    await tamano(c, 'laptop');
    await entrarPanel(c, base);
    const pago = await evaluar(c, `Store.cobrar({ socioId: ${VENCIDO}, planId: ${DIARIO}, metodo: 'efectivo' })`);
    assert.strictEqual(pago.pase, PASE_VENCIDO, 'el cobro del plan diario trae el pase de hoy');
    assert.strictEqual(await entradasHoy(c, VENCIDO), 0);
    await abrirCamaraYLeer(c, 'Pase diario: entrada registrada');
    assert.match(await msg(c), new RegExp(socio(VENCIDO).nombre));
    assert.match(await claseMsg(c), /\bok\b/);
    assert.ok(await evaluar(c, `document.querySelector('.escaner-res').classList.contains('ok') && document.querySelector('.escaner-res').textContent.includes('Pase diario')`), 'resultado sobre la imagen');
    assert.strictEqual(await entradasHoy(c, VENCIDO), 1);
    assert.ok(await evaluar(c, `Store.pasesDe(${VENCIDO})[0].usado === true`), 'el pase queda usado');
    await captura(c, 'laptop-checkin-pase');
    await dormir(4500); // el pase sigue frente a la cámara: no cuenta de nuevo
    assert.strictEqual(await entradasHoy(c, VENCIDO), 1);
    assert.match(await msg(c), /Pase diario: entrada registrada/);
    await evaluar(c, `document.querySelector('#k-camara').click()`);
    await evaluar(c, `document.querySelector('#k-buscar').focus()`);
    await teclear(c, PASE_VENCIDO); // más tarde lo intenta otra vez, ahora con el lector USB
    await enMsg(c, 'Este pase diario ya se usó hoy a las ');
    assert.strictEqual(await entradasHoy(c, VENCIDO), 1);
    await dormir(4200); // pasado el rato de las relecturas…
    await evaluar(c, `document.querySelector('#k-camara').click()`); // …con la cámara también lo rechaza, en rojo
    await esperar(c, `!document.querySelector('.escaner-res').hidden && document.querySelector('.escaner-res').textContent.includes('Pase ya usado')`, 8000);
    assert.ok(await evaluar(c, `document.querySelector('.escaner-res').classList.contains('error')`));
    assert.match(await evaluar(c, `document.querySelector('.escaner-res').textContent`), /Se usó hoy a las \d\d:\d\d/);
    await captura(c, 'laptop-checkin-pase-usado');
    await evaluar(c, `document.querySelector('#k-camara').click()`);
  });
});

prueba('cámara con el QR invertido (claro sobre oscuro, modo oscuro forzado): también lo lee', async () => {
  await conVideo(codigo(ACTIVO), 'invertido', async (c) => {
    await tamano(c, 'laptop');
    await entrarPanel(c, base);
    await abrirCamaraYLeer(c, socio(ACTIVO).nombre);
    assert.match(await claseMsg(c), /\bok\b/);
  }, { invertido: true });
});

prueba('cámara con el QR de un plan vencido: registra y avisa en rojo', async () => {
  await conVideo(codigo(VENCIDO), 'vencido', async (c) => {
    await tamano(c, 'laptop');
    await entrarPanel(c, base);
    await abrirCamaraYLeer(c, socio(VENCIDO).nombre);
    assert.match(await msg(c), /vencido/);
    assert.match(await claseMsg(c), /\berror\b/);
    assert.ok(await evaluar(c, `document.querySelector('.escaner-res').classList.contains('error')`));
    assert.ok(await evaluar(c, `!!document.querySelector('#k-msg a[href^="#cobros?socio=${VENCIDO}"]')`), 'enlace a cobrar');
    await captura(c, 'laptop-checkin-vencido');
  });
});

prueba('cámara con un QR que no es de Pilates Studio: lo dice y no registra nada', async () => {
  await conVideo('https://tu-dominio.com', 'otro-qr', async (c) => {
    await tamano(c, 'laptop');
    await entrarPanel(c, base);
    const antes = await todasHoy(c);
    await evaluar(c, `document.querySelector('#k-camara').click()`);
    await enMsg(c, 'no es un carnet', 15000);
    assert.ok(await evaluar(c, `document.querySelector('.escaner-res').classList.contains('error')`));
    assert.strictEqual(await todasHoy(c), antes);
  });
});

prueba('dos cámaras (laptop con webcam extra): «Cambiar cámara» cambia de cámara con una sola encendida', async () => {
  await conNavegador(null, ['--use-fake-device-for-media-stream=device-count=2'], async (c) => {
    await tamano(c, 'laptop');
    await entrarPanel(c, base);
    await evaluar(c, `document.querySelector('#k-camara').click()`);
    await esperar(c, `document.querySelector('.escaner-estado') && document.querySelector('.escaner-estado').textContent.includes('Acerca')`);
    await esperar(c, `!document.querySelector('[data-escaner="cambiar"]').hidden`);
    const id = (c2) => evaluar(c2, `(() => { const s = window.__streams.filter((x) => x.getTracks().some((t) => t.readyState === 'live')); return s.length === 1 ? s[0].getVideoTracks()[0].getSettings().deviceId : 'streams vivos: ' + s.length; })()`);
    const antes = await id(c);
    await evaluar(c, `document.querySelector('[data-escaner="cambiar"]').click()`);
    await esperar(c, `document.querySelector('.escaner-estado') && document.querySelector('.escaner-estado').textContent.includes('Acerca')`);
    const despues = await id(c);
    assert.notStrictEqual(despues, antes, 'otra cámara');
    assert.ok(!String(despues).startsWith('streams'), 'una sola cámara encendida: ' + despues);
    assert.strictEqual(await evaluar(c, `document.querySelector('#k-aviso-camara').textContent`), '');

    // La otra cámara está ocupada (p. ej. por una videollamada): se queda con la que funciona, sin cerrarse.
    await evaluar(c, `window.__fallarCamara = ${JSON.stringify(antes)}; true`);
    await evaluar(c, `document.querySelector('[data-escaner="cambiar"]').click()`);
    await esperar(c, `document.querySelector('.escaner-estado') && document.querySelector('.escaner-estado').textContent.includes('No se pudo abrir esa cámara')`, 8000);
    assert.strictEqual(await id(c), despues, 'sigue con la que funcionaba');
    assert.ok(await evaluar(c, `!document.querySelector('#k-escaner').hidden && document.querySelector('#k-aviso-camara').textContent === ''`), 'el escáner sigue abierto');
    await evaluar(c, `window.__fallarCamara = null; document.querySelector('[data-escaner="cambiar"]').click(); true`);
    await esperar(c, `document.querySelector('.escaner-estado').textContent.includes('Acerca')`, 8000);
    assert.strictEqual(await id(c), antes, 'liberada la otra, sí cambia');
  });
});

(async () => {
  let fallos = 0;
  try {
    puerto = await N.servidor();
    base = `http://localhost:${puerto}`;
    nav = await lanzar(videoConQR(codigo(ACTIVO), path.join(TMP, 'activo.y4m')));
    // Solo correr algunas: SOLO="texto" o SOLO="uno|otro" (las que contengan alguno de esos textos en el nombre).
    const solo = process.env.SOLO;
    const elegidas = solo ? pruebas.filter(([nombre]) => solo.split('|').some((x) => nombre.includes(x))) : pruebas;
    for (const [nombre, fn] of elegidas) {
      try { await fn(); console.log('ok   ' + nombre); } catch (e) { fallos++; console.log('FAIL ' + nombre + '\n     ' + (e && e.message)); }
    }
    if (nav.errores.length) { fallos++; console.log('FAIL errores en la consola del navegador:\n     ' + nav.errores.join('\n     ')); }
    console.log(`\n${elegidas.length - fallos}/${elegidas.length} pasan · capturas en ${N.CAPTURAS}`);
  } catch (e) {
    fallos++;
    console.error(e);
  } finally {
    N.cerrarTodo();
  }
  process.exit(fallos ? 1 : 0);
})();
