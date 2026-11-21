// Herramientas para probar la demo en un navegador de verdad (Chrome o Edge sin ventana), por el protocolo
// de DevTools y sin dependencias (Node 22 o más nuevo: trae WebSocket y fetch).
//   const N = require('./cdp.js');
//   const puerto = await N.servidor();               // node servir.js en un puerto libre
//   const c = await N.lanzar();                       // navegador sin ventana, con perfil nuevo
//   await N.ir(c, `http://localhost:${puerto}/admin.html`);
//   await N.evaluar(c, `document.title`);
//   N.cerrarTodo();                                   // cierra navegadores y servidores
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const RAIZ = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sag-cdp-'));
const CAPTURAS = process.env.CAPTURAS || path.join(os.tmpdir(), 'sag-capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const hijos = [];
function cerrarTodo() {
  hijos.forEach((h) => { try { h.kill(); } catch (e) { /* nada */ } });
  hijos.length = 0;
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* Windows puede tardar en soltar el perfil */ }
}
process.on('exit', () => hijos.forEach((h) => { try { h.kill(); } catch (e) { /* nada */ } }));

function buscarNavegador() {
  const candidatos = [
    process.env.CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const r = candidatos.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
  if (!r) throw new Error('No se encontró Chrome ni Edge. Indica la ruta con la variable CHROME.');
  return r;
}

function puertoLibre() {
  return new Promise((ok) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
}

async function servidor() {
  const puerto = await puertoLibre();
  const h = spawn(process.execPath, [path.join(RAIZ, 'servir.js'), String(puerto)], { stdio: ['ignore', 'pipe', 'pipe'] });
  hijos.push(h);
  await new Promise((ok, mal) => {
    h.stdout.on('data', (d) => { if (String(d).includes('localhost')) ok(); });
    h.on('exit', () => mal(new Error('servir.js se cerró')));
  });
  return puerto;
}

function conectar(url) {
  return new Promise((ok, mal) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pendientes = new Map();
    const oyentes = [];
    ws.onerror = mal;
    ws.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id && pendientes.has(d.id)) {
        const p = pendientes.get(d.id); pendientes.delete(d.id);
        if (d.error) p.mal(new Error(d.error.message)); else p.ok(d.result);
      } else oyentes.forEach((f) => f(d));
    };
    ws.onopen = () => ok({
      send: (method, params = {}) => new Promise((ok2, mal2) => { const i = ++id; pendientes.set(i, { ok: ok2, mal: mal2 }); ws.send(JSON.stringify({ id: i, method, params })); }),
      on: (f) => oyentes.push(f),
      cerrar: () => ws.close(),
    });
  });
}

// Abre un navegador sin ventana. Opciones:
//   video: archivo .y4m que se usa como cámara · args: argumentos extra de Chrome
//   alCargar: función (o texto) que se ejecuta en cada página antes que sus scripts
// `c.errores` junta las excepciones y los console.error de la página.
async function lanzar(op = {}) {
  const perfil = fs.mkdtempSync(path.join(TMP, 'perfil-'));
  const args = ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--remote-debugging-port=0',
    '--user-data-dir=' + perfil, '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(op.video ? ['--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + op.video] : []),
    ...(op.args || []), 'about:blank'];
  const h = spawn(buscarNavegador(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
  hijos.push(h);
  const ws = await new Promise((ok, mal) => {
    let txt = '';
    const t = setTimeout(() => mal(new Error('El navegador no abrió DevTools')), 20000);
    h.stderr.on('data', (d) => { txt += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(txt); if (m) { clearTimeout(t); ok(m[1]); } });
  });
  const puerto = new URL(ws).port;
  const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
  const c = await conectar(lista.find((x) => x.type === 'page').webSocketDebuggerUrl);
  c.proceso = h;
  c.errores = [];
  c.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') c.errores.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') c.errores.push(m.params.args.map((a) => a.value || a.description).join(' '));
  });
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  if (op.alCargar) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: typeof op.alCargar === 'function' ? `(${op.alCargar})()` : String(op.alCargar) });
  await c.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  c.salir = () => { try { c.cerrar(); } catch (e) { /* nada */ } try { h.kill(); } catch (e) { /* nada */ } };
  return c;
}

async function evaluar(c, expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('En la página: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
  return r.result.value;
}

async function esperar(c, expr, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await evaluar(c, expr).catch(() => false)) return;
    await dormir(80);
  }
  throw new Error('Tiempo agotado esperando: ' + expr);
}

async function ir(c, url) {
  await c.send('Page.navigate', { url });
  await esperar(c, `document.readyState === 'complete'`);
}

// laptop 1366×768 · tablet 820×1180 · celular 390×844 · chico 360×740 · horizontal 844×340
async function tamano(c, nombre) {
  const t = { laptop: [1366, 768, 1, false], tablet: [820, 1180, 2, true], celular: [390, 844, 3, true], chico: [360, 740, 2, true], horizontal: [844, 340, 3, true] }[nombre];
  await c.send('Emulation.setDeviceMetricsOverride', { width: t[0], height: t[1], deviceScaleFactor: t[2], mobile: t[3] });
  await c.send('Emulation.setTouchEmulationEnabled', t[3] ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}

// Guarda una captura PNG en CAPTURAS y devuelve su ruta. `completa`: toda la página, no solo lo visible.
async function captura(c, nombre, completa) {
  const r = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!completa });
  const archivo = path.join(CAPTURAS, nombre + '.png');
  fs.writeFileSync(archivo, Buffer.from(r.data, 'base64'));
  return archivo;
}

// Teclas como las manda un teclado o un lector USB: mayúsculas con Shift; al final Enter, Tab o nada.
async function teclear(c, texto, fin = 'Enter') {
  for (const ch of texto) {
    if (ch === ' ') {
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', unmodifiedText: ' ', windowsVirtualKeyCode: 32 });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      continue;
    }
    if (!/[0-9A-Za-z]/.test(ch)) {
      await c.send('Input.insertText', { text: ch });
      continue;
    }
    const mayus = /[A-Z]/.test(ch);
    const vk = /[0-9]/.test(ch) ? 48 + Number(ch) : ch.toUpperCase().charCodeAt(0);
    const code = /[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch.toUpperCase();
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk, modifiers: mayus ? 8 : 0 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, modifiers: mayus ? 8 : 0 });
  }
  if (fin) await tecla(c, fin);
}

async function tecla(c, nombre) {
  const k = { Enter: { key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 }, Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } }[nombre];
  await c.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, k));
  await c.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, k, { text: undefined }));
}

// Entra al panel con la sesión de un usuario ya abierta (1 = dueño, 2 = recepción), con datos de ejemplo nuevos.
async function entrarPanel(c, base, { usuarioId = 1, hash = 'inicio', query = '' } = {}) {
  await ir(c, base + '/404.html');
  await evaluar(c, `localStorage.removeItem('sag:db'); sessionStorage.setItem('sag:sesion', '${usuarioId}'); sessionStorage.removeItem('sag:tour'); true`);
  await ir(c, `${base}/admin.html${query}#${hash}`);
  await esperar(c, `!document.getElementById('app').hidden`);
}

module.exports = { RAIZ, TMP, CAPTURAS, dormir, buscarNavegador, puertoLibre, servidor, conectar, lanzar, evaluar, esperar, ir, tamano, captura, teclear, tecla, entrarPanel, cerrarTodo };
