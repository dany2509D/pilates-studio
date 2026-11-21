/* Lector de QR con la cámara del equipo (celular, tablet o laptop), para el Check-in del panel.
   - Usa el lector propio del navegador (BarcodeDetector: Chrome de Android y de Mac) y, si no hay
     (iPhone, iPad, Chrome y Edge de Windows), jsQR (js/vendor/jsQR.js), que se carga solo al abrir la cámara.
   - Los navegadores solo prestan la cámara en https o en localhost: por la red local (http://192.168…) no.
   - Lee un QR tras otro hasta que se cierra. El mismo QR quieto frente a la cámara no se cuenta dos veces, ni
     la misma persona si su QR cambia mientras sigue a la vista (op.clave: el QR de «Mi plan» cambia cada 15 s).
   - Se apaga solo si la página pasa a segundo plano (otra app, pantalla bloqueada). */
(function (root) {
  const RUTA_JSQR = 'js/vendor/jsQR.js';
  const LADO_MAX = 720;   // el cuadro se analiza reducido a este tamaño: más rápido y de sobra para un QR en un celular
  const CADA_MS = 120;    // pausa entre un análisis y el siguiente
  const PAUSA_MS = 1800;  // tras leer un QR, el resultado se muestra este tiempo antes de seguir
  const MISMO_MS = 4000;  // el mismo QR no vuelve a contar mientras siga a la vista (ni hasta 4 s después)
  const FALLOS_NATIVO = 8; // si el lector del navegador falla seguido, se cambia a jsQR

  const TEXTO_LISTO = 'Acerca a la cámara el QR de «Mi plan» o el pase diario.';
  const ICONO_CAMBIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><path d="M9.2 12.2a3 3 0 0 1 5.3-.9M14.8 14.8a3 3 0 0 1-5.3.9"/><path d="M14.8 9.8v1.7h-1.7M9.2 17.2v-1.7h1.7"/></svg>';

  const MENSAJES = {
    inseguro: 'La cámara solo funciona si el panel se abre desde una dirección segura (https) o desde localhost en esta computadora. Abre la versión publicada o usa un lector USB.',
    'sin-api': 'Este navegador no permite usar la cámara. Prueba con Chrome, Edge o Safari actualizados, o usa un lector USB.',
    permiso: 'No hay permiso para usar la cámara. Vuelve a tocar «Leer QR del socio» y elige «Permitir». Si no lo pregunta, actívala en la configuración del sitio: en Chrome o Edge, el ícono a la izquierda de la dirección > Cámara; en iPhone o iPad, «aA» > Configuración del sitio web > Cámara.',
    sistema: 'El equipo no deja que el navegador use la cámara. Actívala en la configuración del equipo (Windows: Configuración > Privacidad y seguridad > Cámara; Mac: Ajustes del Sistema > Privacidad y seguridad > Cámara; Android: Ajustes > Aplicaciones > el navegador > Permisos), vuelve a abrir el navegador y toca «Leer QR del socio».',
    'sin-camara': 'No se encontró ninguna cámara en este equipo. Puedes usar un lector USB o buscar al socio por nombre.',
    ocupada: 'La cámara está ocupada por otra aplicación (por ejemplo, una videollamada). Ciérrala y vuelve a intentar.',
    terminada: 'La cámara se desconectó. Vuelve a tocar «Leer QR del socio».',
    pausa: 'La cámara se apagó al salir de la página. Toca «Leer QR del socio» para seguir.',
    lector: 'No se pudo cargar el lector de QR. Recarga la página e inténtalo de nuevo.',
    otro: 'No se pudo abrir la cámara. Vuelve a intentar.',
  };

  // Cámara elegida la última vez; se recuerda mientras la página siga abierta.
  let preferida = null;
  let cargaJsQR = null;

  function mensaje(motivo) { return MENSAJES[motivo] || MENSAJES.otro; }

  function disponibilidad() {
    if (root.isSecureContext === false) return { ok: false, motivo: 'inseguro' };
    const md = root.navigator && root.navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') return { ok: false, motivo: 'sin-api' };
    return { ok: true };
  }

  function motivoDeError(e) {
    const n = e && e.name;
    // Chrome avisa así cuando el bloqueo viene del sistema (privacidad de Windows, Mac o Android), no del sitio.
    if (n === 'NotAllowedError' && /system/i.test((e && e.message) || '')) return 'sistema';
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') return 'permiso';
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return 'sin-camara';
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'ocupada';
    return 'otro';
  }

  function cargarJsQR() {
    if (typeof root.jsQR === 'function') return Promise.resolve();
    if (!cargaJsQR) {
      cargaJsQR = new Promise((resolver, rechazar) => {
        const s = document.createElement('script');
        s.src = RUTA_JSQR;
        s.onload = () => (typeof root.jsQR === 'function' ? resolver() : rechazar(new Error('jsqr')));
        s.onerror = () => { s.remove(); rechazar(new Error('jsqr')); };
        document.head.appendChild(s);
      }).catch((e) => { cargaJsQR = null; throw e; }); // permite reintentar
    }
    return cargaJsQR;
  }

  // { leer(video) → texto o null, nativo }. `soloJsQR` salta el lector del navegador.
  async function crearLector(soloJsQR) {
    if (!soloJsQR && typeof root.BarcodeDetector === 'function') {
      try {
        const formatos = await root.BarcodeDetector.getSupportedFormats();
        if (formatos && formatos.indexOf('qr_code') >= 0) {
          const detector = new root.BarcodeDetector({ formats: ['qr_code'] });
          return {
            nativo: true,
            async leer(video) {
              const r = await detector.detect(video);
              return r && r.length ? r[0].rawValue : null;
            },
          };
        }
      } catch (e) { /* sigue con jsQR */ }
    }
    await cargarJsQR();
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    let cuadro = 0;
    return {
      nativo: false,
      async leer(video) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return null;
        const k = Math.min(1, LADO_MAX / Math.max(w, h));
        const cw = Math.round(w * k);
        const ch = Math.round(h * k);
        if (lienzo.width !== cw || lienzo.height !== ch) { lienzo.width = cw; lienzo.height = ch; }
        ctx.drawImage(video, 0, 0, cw, ch);
        const img = ctx.getImageData(0, 0, cw, ch);
        // El QR normal se busca en todos los cuadros; el invertido (claro sobre oscuro: celular con modo oscuro o
        // colores invertidos), uno de cada 3. Buscar los dos siempre casi duplica el trabajo en los cuadros sin QR,
        // que en un mostrador son casi todos. Un carnet invertido igual se lee en menos de medio segundo.
        const modo = ++cuadro % 3 ? 'dontInvert' : 'attemptBoth';
        const r = root.jsQR(img.data, cw, ch, { inversionAttempts: modo });
        return r ? r.data : null;
      },
    };
  }

  // Pitidos cortos con Web Audio (sin archivos). Se crea dentro del toque en «Leer QR del socio»:
  // así el navegador (sobre todo Safari) deja sonar después.
  function crearSonido() {
    const AC = root.AudioContext || root.webkitAudioContext;
    let ctx = null;
    try { if (AC) ctx = new AC(); } catch (e) { ctx = null; }
    function tono(frecuencia, inicio, duracion, volumen) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime + inicio;
      o.type = 'sine';
      o.frequency.value = frecuencia;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volumen, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + duracion + 0.03);
    }
    return {
      sonar(tipo) {
        if (!ctx) return;
        try {
          if (ctx.state === 'suspended') ctx.resume();
          if (tipo === 'ok') tono(1046, 0, 0.14, 0.2);
          else if (tipo === 'aviso') { tono(784, 0, 0.12, 0.18); tono(784, 0.17, 0.12, 0.18); }
          else tono(220, 0, 0.34, 0.24);
        } catch (e) { /* sin sonido */ }
      },
      cerrar() {
        if (ctx && typeof ctx.close === 'function') {
          try { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* nada */ }
        }
        ctx = null;
      },
    };
  }

  /* Abre la cámara dentro de `contenedor`.
     op.alLeer(texto) → { tipo: 'ok' | 'aviso' | 'error', titulo, detalle } para mostrarlo sobre la imagen
       (o null: no hay nada nuevo que mostrar).
     op.clave(texto, anterior) → opcional: a quién corresponde el texto. Dos textos con la misma clave son la
       misma lectura. `anterior`: la clave del QR que sigue a la vista ('' si no hay ninguno).
     op.alError(motivo) → la cámara ya se cerró; `mensaje(motivo)` da el texto para el usuario.
     Devuelve { cerrar }. */
  function abrir(op) {
    const cont = op.contenedor;
    const sonido = crearSonido();
    const G = root.Graficos || {};
    cont.innerHTML = `
      <div class="escaner-vista">
        <video muted playsinline autoplay aria-label="Imagen de la cámara"></video>
        <div class="escaner-marco" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></div>
        <div class="escaner-res" hidden></div>
      </div>
      <div class="escaner-pie">
        <p class="escaner-estado" role="status" aria-live="polite">Abriendo la cámara…</p>
        <button type="button" class="btn btn-borde btn-chico" data-escaner="cambiar" hidden>${ICONO_CAMBIAR}Cambiar cámara</button>
      </div>`;
    const video = cont.querySelector('video');
    const estado = cont.querySelector('.escaner-estado');
    const res = cont.querySelector('.escaner-res');
    const btnCambiar = cont.querySelector('[data-escaner="cambiar"]');
    video.muted = true;
    video.playsInline = true; // iPhone: sin esto el video se abre a pantalla completa

    let cerrado = false;
    let stream = null;
    let lector = null;
    let lado = null;        // 'environment' | 'user' | null (webcam de laptop: el navegador no lo dice)
    let camaras = [];
    let cambiando = false;
    let temporizador = null;
    let tRes = null;
    let pausaHasta = 0;
    let ultimoTexto = '';
    let ultimaClave = '';
    let ultimoMs = 0;
    let fallos = 0;
    let objetivo = -1;      // índice (en `camaras`) de la última cámara pedida con «Cambiar cámara»
    let listoMs = 0;        // cuándo quedó listo el lector
    let nativoLeyo = false; // el lector del navegador ya leyó algún QR: funciona bien
    let vueltas = 0;
    let respaldo = null;    // jsQR, para comprobar al lector del navegador mientras no lea nada
    let preparandoRespaldo = null;
    let aciertosJsQR = 0;
    let sinRespaldo = false;
    let bloqueo = null;     // pantalla siempre encendida (Screen Wake Lock)

    // Pantalla encendida mientras la cámara está abierta: sin esto un iPhone o iPad se bloquea solo a los pocos
    // minutos y la cámara se cierra. Se pide aquí, todavía dentro del toque en «Leer QR del socio», como exige Safari.
    try {
      const wl = root.navigator.wakeLock;
      if (wl && typeof wl.request === 'function') {
        wl.request('screen').then((b) => {
          if (cerrado) Promise.resolve(b.release()).catch(() => {});
          else bloqueo = b;
        }, () => { /* sin permiso: el equipo puede apagar la pantalla */ });
      }
    } catch (e) { /* navegador sin Wake Lock */ }

    function detenerStream() {
      if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* nada */ } });
      stream = null;
    }

    // pedido: { deviceId } (una cámara concreta) o { lado, exacto }
    async function encender(pedido) {
      const v = { width: { ideal: 1280 }, height: { ideal: 720 } };
      if (pedido.deviceId) v.deviceId = { exact: pedido.deviceId };
      else v.facingMode = pedido.exacto ? { exact: pedido.lado } : { ideal: pedido.lado || 'environment' };
      let s;
      try {
        s = await root.navigator.mediaDevices.getUserMedia({ video: v, audio: false });
      } catch (e) {
        // La cámara recordada ya no está (p. ej. se desconectó una webcam USB): se usa cualquiera.
        if (pedido.deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
          return encender({ lado: 'environment' });
        }
        throw e;
      }
      if (cerrado) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const pista = s.getVideoTracks()[0];
      const ajustes = pista && pista.getSettings ? pista.getSettings() : {};
      lado = ajustes.facingMode === 'environment' || ajustes.facingMode === 'user' ? ajustes.facingMode : null;
      preferida = ajustes.deviceId ? { deviceId: ajustes.deviceId } : null;
      // Cámara frontal o webcam: se ve como en un espejo, más natural para quien acerca el carnet.
      // (Solo cambia lo que se ve: el análisis usa la imagen original.)
      video.classList.toggle('espejo', lado !== 'environment');
      if (pista) pista.addEventListener('ended', () => { if (!cerrado && stream === s) fallar('terminada'); });
      video.srcObject = s;
      try { await video.play(); } catch (e) { /* con muted y playsinline arranca solo */ }
    }

    async function listarCamaras() {
      try {
        const lista = await root.navigator.mediaDevices.enumerateDevices();
        camaras = lista.filter((d) => d.kind === 'videoinput');
      } catch (e) { camaras = []; }
      if (!cerrado) btnCambiar.hidden = camaras.length < 2;
    }

    // Celular o tablet: alterna entre la cámara trasera y la frontal. Laptop con dos webcams: pasa a la siguiente.
    // Si la otra no abre (ocupada por otra aplicación, o el equipo tarda en soltar la actual), vuelve a la que funcionaba.
    async function cambiar() {
      if (cambiando || cerrado) return;
      cambiando = true;
      btnCambiar.disabled = true;
      estado.textContent = 'Cambiando de cámara…';
      const anterior = preferida || { lado: lado || 'environment' }; // encender() solo los cambia si abre
      const pedido = lado ? { lado: lado === 'environment' ? 'user' : 'environment', exacto: true } : siguienteCamara();
      // Algunos celulares no abren una cámara mientras otra sigue encendida: primero se apaga la actual.
      detenerStream();
      try {
        await abrirOtra(pedido);
        if (!cerrado) estado.textContent = TEXTO_LISTO;
      } catch (e) {
        if (cerrado) return;
        try {
          await encender(anterior);
          if (!cerrado) estado.textContent = 'No se pudo abrir esa cámara' + (motivoDeError(e) === 'ocupada' ? ' (está ocupada)' : '') + '. Sigues con la anterior.';
        } catch (e2) {
          fallar(motivoDeError(e2));
        }
      } finally {
        cambiando = false;
        btnCambiar.disabled = false;
      }
    }

    async function abrirOtra(pedido) {
      try {
        await encender(pedido);
      } catch (e) {
        if (cerrado) return;
        if (pedido.exacto && e.name === 'OverconstrainedError') { await encender(siguienteCamara()); return; }
        if (e.name === 'NotReadableError' || e.name === 'AbortError') {
          await new Promise((r) => setTimeout(r, 400)); // un intento más: el equipo puede tardar en soltar la anterior
          if (cerrado) return;
          await encender(pedido);
          return;
        }
        throw e;
      }
    }

    // La siguiente de la lista, contando desde la última que se intentó aunque haya fallado:
    // con [A, B, C], si B no abre, el próximo toque prueba C.
    function siguienteCamara() {
      const n = camaras.length;
      const actual = preferida && preferida.deviceId;
      if (objetivo < 0) objetivo = Math.max(0, camaras.findIndex((c) => c.deviceId === actual));
      for (let k = 0; k < n; k++) {
        objetivo = (objetivo + 1) % n;
        const id = camaras[objetivo].deviceId;
        if (id && id !== actual) return { deviceId: id };
      }
      return { lado: 'environment' };
    }

    function mostrarResultado(r) {
      clearTimeout(tRes);
      res.className = 'escaner-res ' + (r.tipo === 'ok' || r.tipo === 'aviso' ? r.tipo : 'error');
      res.innerHTML = `<span class="escaner-res-ico">${r.tipo === 'ok' ? (G.check || '') : (G.alerta || '')}</span><strong></strong><small></small>`;
      res.querySelector('strong').textContent = r.titulo || '';
      res.querySelector('small').textContent = r.detalle || '';
      res.hidden = false;
      sonido.sonar(r.tipo);
      if (root.navigator.vibrate) { try { root.navigator.vibrate(r.tipo === 'ok' ? 70 : [90, 60, 90]); } catch (e) { /* nada */ } }
      tRes = setTimeout(() => { res.hidden = true; }, PAUSA_MS);
    }

    function claveDe(texto, ahora) {
      const aLaVista = ahora - ultimoMs < MISMO_MS;
      if (texto === ultimoTexto && aLaVista) return ultimaClave; // el mismo texto: no hace falta volver a calcularla
      if (typeof op.clave !== 'function') return texto;
      try { return String(op.clave(texto, aLaVista ? ultimaClave : '')); } catch (e) { return texto; }
    }

    function recibido(texto) {
      const ahora = Date.now();
      const clave = claveDe(texto, ahora);
      const mismo = clave === ultimaClave && ahora - ultimoMs < MISMO_MS;
      ultimoMs = ahora;
      ultimoTexto = texto;
      ultimaClave = clave;
      if (mismo) return;
      pausaHasta = ahora + PAUSA_MS;
      let r = null;
      try { r = op.alLeer(texto); } catch (e) { if (root.console) console.error(e); }
      if (r && !cerrado) mostrarResultado(r);
    }

    async function ciclo() {
      temporizador = null;
      if (cerrado) return;
      let espera = CADA_MS;
      if (lector && stream && !cambiando && video.readyState >= 2 && Date.now() >= pausaHasta) {
        const inicio = Date.now();
        const conJsQR = !lector.nativo; // jsQR trabaja en el hilo de la página; el lector del navegador, aparte
        let texto = null;
        try {
          texto = await lector.leer(video);
          fallos = 0;
        } catch (e) {
          if (lector.nativo && ++fallos >= FALLOS_NATIVO) {
            try { lector = respaldo || await crearLector(true); } catch (e2) { fallar('lector'); return; }
          }
        }
        if (cerrado) return;
        if (lector.nativo) {
          if (texto) nativoLeyo = true;
          else if (!nativoLeyo) texto = await comprobarConJsQR();
          if (cerrado) return;
        }
        if (texto) recibido(String(texto));
        // Con jsQR, en un equipo lento (laptop económica, iPad viejo) se analiza menos seguido: la página sigue fluida.
        if (conJsQR) espera = Math.max(CADA_MS, Math.round((Date.now() - inicio) * 1.5));
      }
      temporizador = setTimeout(ciclo, espera);
    }

    // El lector del navegador a veces "funciona" pero nunca encuentra nada (en Android, si le falta su módulo de
    // Google Play). Mientras no haya leído ningún QR, pasados 3 s, cada 4 análisis también prueba con jsQR (que se
    // carga aparte, sin frenar al otro). La lectura de jsQR cuenta, pero solo se cambia de lector a la segunda:
    // los dos no ven el mismo cuadro, y una sola vez puede ser solo que jsQR vio un cuadro más nuevo.
    async function comprobarConJsQR() {
      if (sinRespaldo || Date.now() - listoMs < 3000) return null;
      if (!respaldo) {
        if (!preparandoRespaldo) {
          preparandoRespaldo = crearLector(true).then((l) => { respaldo = l; }, () => { sinRespaldo = true; });
        }
        return null;
      }
      if (++vueltas % 4) return null;
      try {
        const t = await respaldo.leer(video);
        if (t && ++aciertosJsQR >= 2) lector = respaldo;
        return t;
      } catch (e) {
        sinRespaldo = true;
        return null;
      }
    }

    function alCambiarVisibilidad() { if (document.hidden) fallar('pausa'); }

    function cerrar() {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(temporizador);
      clearTimeout(tRes);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      if (bloqueo) {
        try { Promise.resolve(bloqueo.release()).catch(() => {}); } catch (e) { /* nada */ }
        bloqueo = null;
      }
      detenerStream();
      try { video.pause(); } catch (e) { /* nada */ }
      video.srcObject = null;
      sonido.cerrar();
      cont.innerHTML = '';
    }

    function fallar(motivo) {
      if (cerrado) return;
      cerrar();
      if (op.alError) op.alError(motivo);
    }

    btnCambiar.addEventListener('click', cambiar);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    (async () => {
      // El lector (y jsQR, si hace falta) se prepara mientras la cámara arranca.
      const preparando = crearLector(false).then((l) => ({ l }), () => ({ error: true }));
      try {
        await encender(preferida || { lado: 'environment' });
      } catch (e) {
        fallar(motivoDeError(e));
        return;
      }
      if (cerrado) return;
      const p = await preparando;
      if (cerrado) return;
      if (p.error) { fallar('lector'); return; }
      lector = p.l;
      listoMs = Date.now();
      estado.textContent = TEXTO_LISTO;
      listarCamaras();
      ciclo();
    })();

    return { cerrar };
  }

  root.Escaner = { disponibilidad, mensaje, abrir };
})(window);
