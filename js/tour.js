/* Tutorial guiado ("primer nivel"): te muestra qué tocar, paso a paso, desde que entras hasta que pagas
   y ves el pago en el panel. Dos modos: "jugar" (tocas tú) y "demo" (un cursor lo hace solo, ideal para grabar).
   El progreso se guarda para seguir entre index.html, socio.html y admin.html. */
(function (root) {
  'use strict';

  const PRUEBAS = !!root.__TOUR_PRUEBAS;                 // en pruebas no se exige geometría de pantalla
  const VEL = root.__TOUR_VEL != null ? root.__TOUR_VEL : 1; // multiplicador de tiempos (las pruebas lo bajan)
  const CLAVE = 'sag:tour';

  const doc = root.document;
  const q = (s) => doc.querySelector(s);
  const visible = (el) => !!el && el.isConnected && !el.closest('[hidden]') && (PRUEBAS || el.getClientRects().length > 0);
  const primeroVisible = (...sels) => { for (const s of sels) { const e = q(s); if (visible(e)) return e; } return null; };
  const poner = (el, valor) => { el.value = valor; el.dispatchEvent(new root.Event('input', { bubbles: true })); };
  const enviar = (form) => form.dispatchEvent(new root.Event('submit', { bubbles: true, cancelable: true }));

  const sinMov = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const esTactil = () => !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  const altoVisible = () => (root.visualViewport && root.visualViewport.height) || root.innerHeight;
  // Si lo iluminado está dentro de una ventana con scroll propio (p. ej. el pago de Yappy), se desplaza esa ventana, no la página.
  function contenedorScroll(el) {
    for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
      const o = root.getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 2) return p;
    }
    return null;
  }
  function enFijo(el) {
    for (let p = el; p && p !== doc.body; p = p.parentElement) if (root.getComputedStyle(p).position === 'fixed') return true;
    return false;
  }
  function solapa(r, b) {
    const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
    const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
    return w > 0 && h > 0 && w * h > 0.25 * Math.max(1, r.width * r.height);
  }

  const ESTRELLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
  const CURSOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 2 4 7-3 1.5-4-7-5 4z"/></svg>';

  /* ---------- Estado (sobrevive a los cambios de página) ---------- */
  let memoria = null;
  function leer() {
    let crudo = null;
    try { crudo = root.sessionStorage.getItem(CLAVE); } catch (e) { crudo = null; }
    if (!crudo) { try { if (root.name && root.name.indexOf(CLAVE + '=') === 0) crudo = root.name.slice(CLAVE.length + 1); } catch (e) { crudo = null; } }
    if (!crudo) crudo = memoria;
    try { return crudo ? JSON.parse(crudo) : null; } catch (e) { return null; }
  }
  function guardar(e) {
    const s = e ? JSON.stringify(e) : null;
    memoria = s;
    try { if (s) root.sessionStorage.setItem(CLAVE, s); else root.sessionStorage.removeItem(CLAVE); } catch (err) { /* sin sessionStorage */ }
    try { if (s) root.name = CLAVE + '=' + s; else if (root.name && root.name.indexOf(CLAVE + '=') === 0) root.name = ''; } catch (err) { /* nada */ }
  }

  function pagina() {
    const p = (root.location && root.location.pathname) || '';
    return p.indexOf('socio.html') >= 0 ? 'socio' : p.indexOf('admin.html') >= 0 ? 'admin' : 'index';
  }

  /* ---------- Los pasos del nivel ---------- */
  const panelPagos = () => Array.from(doc.querySelectorAll('#pantalla .panel')).find((p) => p.textContent.indexOf('Últimos pagos en línea') >= 0) || null;

  // El tutorial muestra el panel del DUEÑO (ingresos incluidos): otra sesión abierta en la pestaña no sirve.
  const appVisible = () => { const a = q('#app'); return !!a && !a.hidden; };
  const sesionDueno = () => appVisible() && !!root.Admin && Admin.puede('ver:ingresos');
  let cerroOtraSesion = false;
  function soloDueno() {
    if (appVisible() && !sesionDueno() && root.Admin && Admin.salir) { Admin.salir(); cerroOtraSesion = true; }
  }
  // Si la clave de demo ya no sirve, el tutorial no insiste (cada intento fallido acerca el bloqueo): lo dice y deja entrar a mano.
  function falloAcceso(r) {
    const motivo = r && r.motivo;
    if (motivo === 'bloqueado') {
      const min = r.minutos === 1 ? '1 minuto' : (r.minutos || 5) + ' minutos';
      return { titulo: 'Acceso bloqueado', texto: `El usuario «dueno» quedó bloqueado ${min} por intentos fallidos. Cuando pase, entra tú con su contraseña (o con otro usuario de dueño): el tutorial sigue solo.` };
    }
    if (motivo === 'inactivo') return { titulo: 'Usuario desactivado', texto: 'El usuario «dueno» está desactivado en esta demo. Entra tú con otro usuario de dueño: el tutorial sigue solo.' };
    return { titulo: 'No se pudo entrar', texto: 'La contraseña del dueño ya no es «demo»: se cambió en esta demo. Escribe la nueva y toca «Entrar»: el tutorial sigue solo. Con «Restablecer demo», en Ajustes, vuelve a ser «demo».' };
  }

  const PASOS = [
    { pagina: 'index', tipo: 'inicio', titulo: 'Misión: tu primer día', texto: 'Eres nuevo en ' + Tema.nombre() + '. Tu misión: elegir un plan, inscribirte y pagarlo por Yappy. Te iremos mostrando qué tocar. ¿Cómo quieres hacerlo?' },
    { pagina: 'index', tipo: 'tocar', objetivo: () => q('.portada a[href="#planes"]'), titulo: 'Mira los planes', texto: 'Toca «Ver planes» para ver cuánto cuesta entrenar.' },
    { pagina: 'index', tipo: 'tocar', objetivo: () => q('.plan.destacado [data-plan]'), titulo: 'Elige tu plan', texto: 'El plan Mensual es el más popular. Toca «Elegir plan».' },
    { pagina: 'index', tipo: 'boton', objetivo: () => q('#inscripcion fieldset.campos'), etiquetaBoton: 'Llenar mis datos de ejemplo', titulo: 'Tus datos', texto: 'Aquí van tu nombre, cédula y teléfono. Para no escribir, toca el botón de abajo.',
      accion: (est) => {
        const f = q('#inscripcion');
        poner(f.querySelector('[name="nombre"]'), 'Alex Demo'); poner(f.querySelector('[name="cedula"]'), est.cedula); poner(f.querySelector('[name="telefono"]'), '6600-1234');
        // Sin aceptar el aviso de privacidad (Ley 81) la web no inscribe.
        const acepta = q('#acepta-privacidad');
        if (acepta && !acepta.checked) { acepta.checked = true; acepta.dispatchEvent(new root.Event('change', { bubbles: true })); }
      } },
    { pagina: 'index', tipo: 'tocar', objetivo: () => q('#inscripcion button[type="submit"]'), titulo: 'Inscríbete', texto: 'Toca «Quiero inscribirme» para reservar tu lugar.' },
    { pagina: 'index', tipo: 'tocar', objetivo: () => q('#yappy-pagar'), titulo: '¡Estás registrado!', texto: 'Ahora paga tu plan. Puedes enviar el Yappy al número del gym; aquí probamos el pago en línea: toca «Pagar en línea con Yappy».' },
    { pagina: 'index', tipo: 'boton', objetivo: () => q('#ymodal-form .campo'), etiquetaBoton: 'Escribir mi número de Yappy', titulo: 'Tu número de Yappy', texto: 'Escribe el número con el que pagas. Toca el botón para usar uno de ejemplo.',
      accion: () => poner(q('#ymodal-form input'), '6611-2233') },
    { pagina: 'index', tipo: 'tocar', objetivo: () => q('#ymodal-form button[type="submit"]'), titulo: 'Paga', texto: 'Toca «Pagar». Es una simulación: no se cobra dinero real.' },
    { pagina: 'index', tipo: 'esperar', objetivo: () => q('.yespera'), hasta: () => !!q('#ymodal-listo'), titulo: 'Esperando confirmación', texto: 'Yappy está confirmando tu pago. Un momento…' },
    { pagina: 'index', tipo: 'tocar', objetivo: () => q('#ymodal-listo'), titulo: '¡Pago recibido!', texto: 'Mira tu comprobante, con la referencia y la nueva fecha de vencimiento. Toca «Listo».' },
    { pagina: 'index', tipo: 'tocar', navega: true, objetivo: () => primeroVisible('.menu a[href="socio.html"]', '#menu-movil.abierto a[href="socio.html"]', '#hamb'),
      alTocar: (el) => el.id !== 'hamb', titulo: 'Revisa tu plan',
      texto: () => (objetivo && objetivo.id === 'hamb' ? 'Abre el menú: toca las tres rayitas de arriba.' : 'Toca «Mi plan» para ver tu plan.') },
    { pagina: 'socio', tipo: 'boton', objetivo: () => q('#socio-form'), etiquetaBoton: 'Llenar con mi cédula', titulo: 'Entra a tu cuenta', texto: 'Con tu cédula y los últimos 4 dígitos de tu teléfono ves tu plan.',
      accion: (est) => { poner(q('#socio-form [name="cedula"]'), est.cedula); poner(q('#socio-form [name="ultimos4"]'), '1234'); } },
    { pagina: 'socio', tipo: 'tocar', objetivo: () => q('#socio-form button[type="submit"]'), titulo: 'Ver mi plan', texto: 'Toca «Ver mi plan».' },
    { pagina: 'socio', tipo: 'info', objetivo: () => q('.socio-tarjeta'), titulo: '¡Plan activo!', texto: 'Tu plan ya aparece activo, con su vencimiento y tu pago. Desde aquí también puedes renovar.' },
    { pagina: 'socio', tipo: 'navegar', url: 'admin.html', etiquetaBoton: 'Ver el panel del dueño', titulo: '¿Y el dueño lo ve?', texto: 'Vamos al panel de gestión para ver cómo le aparece tu pago.' },
    { pagina: 'admin', tipo: 'boton', omitir: sesionDueno, vigilar: soloDueno, logrado: sesionDueno, fallo: falloAcceso,
      objetivo: () => q('#login-form'), etiquetaBoton: 'Entrar como dueño (demo)', titulo: 'Panel del dueño',
      texto: () => (cerroOtraSesion
        ? 'Cerramos la sesión de recepción: este nivel muestra el panel del dueño, que ve todo (recepción solo ve lo del mostrador). Toca el botón para entrar como el dueño.'
        : 'Cada persona del estudio entra con su usuario y contraseña: el dueño ve todo y recepción solo lo del mostrador. Toca el botón para entrar como el dueño.'),
      accion: () => {
        poner(q('#login-usuario'), 'dueno'); poner(q('#login-clave'), 'demo');
        // En el celular no se abre el teclado si falla: taparía la explicación.
        if (root.Admin && Admin.entrar) return Admin.entrar('dueno', 'demo', { enfocar: !esTactil() });
        enviar(q('#login-form'));
        return null;
      } },
    { pagina: 'admin', tipo: 'info', preparar: () => { if (root.location.hash !== '#inicio') root.location.hash = '#inicio'; }, objetivo: panelPagos, titulo: 'Tu pago, ya registrado', texto: 'Aquí aparece tu pago de Yappy con su referencia. El dueño no tuvo que hacer nada.' },
    { pagina: 'admin', tipo: 'info', objetivo: () => q('#pantalla .kpi:nth-child(2)'), titulo: 'Y suma a los ingresos', texto: 'Los ingresos del día ya cuentan tu pago. Todo queda ordenado solo.' },
    { pagina: 'admin', tipo: 'fin', titulo: '¡Nivel completo!', texto: 'Así de fácil entra un socio nuevo: se inscribe, paga y el estudio lo ve al instante.' },
  ];

  /* ---------- Motor ---------- */
  let est = null;       // { modo, paso, estrellas, cedula }
  let activo = false;
  let paso = null;
  let objetivo = null;
  let ui = null;
  let raf = 0;
  let desplazado = false;
  let ficha = 0;        // invalida temporizadores de pasos anteriores
  let temporizadores = [];
  let lugar = 'abajo';  // dónde va la burbuja: abajo por defecto; arriba solo si tapa lo iluminado
  let volteado = false;
  let tDesplazo = 0;
  let pendiente = false; // una acción del paso está en curso: no se avanza dos veces
  let fallo = null;      // { titulo, texto } si la acción no logró lo que el paso necesita
  const textoPaso = () => (fallo ? fallo.texto : typeof paso.texto === 'function' ? paso.texto() : paso.texto);

  const ahora = (fn) => (root.requestAnimationFrame ? root.requestAnimationFrame(fn) : root.setTimeout(fn, 16));
  const cancelarAhora = (id) => (root.cancelAnimationFrame ? root.cancelAnimationFrame(id) : root.clearTimeout(id));

  function limpiarTemporizadores() {
    temporizadores.forEach((t) => { root.clearTimeout(t); root.clearInterval(t); });
    temporizadores = [];
  }

  function montar() {
    if (ui) return;
    const raiz = doc.createElement('div');
    raiz.className = 'tour-ui tour-raiz';
    raiz.innerHTML = `
      <div class="tour-velo"></div>
      <div class="tour-foco" hidden></div>
      <div class="tour-cursor" hidden>${CURSOR}<span class="tour-onda"></span></div>
      <div class="tour-burbuja" role="dialog" aria-live="polite" aria-label="Tutorial">
        <div class="tour-cab"><span class="tour-nivel"></span><span class="tour-estrellas"></span></div>
        <div class="tour-barra"><i></i></div>
        <h4 class="tour-titulo"></h4>
        <p class="tour-texto"></p>
        <div class="tour-extra"></div>
        <div class="tour-acciones"></div>
        <button type="button" class="tour-salir">Saltar<span class="tour-pc"> tutorial</span></button>
      </div>`;
    doc.body.appendChild(raiz);
    ui = {
      raiz, velo: raiz.querySelector('.tour-velo'), foco: raiz.querySelector('.tour-foco'), cursor: raiz.querySelector('.tour-cursor'),
      onda: raiz.querySelector('.tour-onda'), burbuja: raiz.querySelector('.tour-burbuja'), nivel: raiz.querySelector('.tour-nivel'),
      estrellas: raiz.querySelector('.tour-estrellas'), barra: raiz.querySelector('.tour-barra i'), titulo: raiz.querySelector('.tour-titulo'),
      texto: raiz.querySelector('.tour-texto'), extra: raiz.querySelector('.tour-extra'), acciones: raiz.querySelector('.tour-acciones'),
    };
    raiz.querySelector('.tour-salir').addEventListener('click', () => terminar());
    doc.addEventListener('click', alClic, true);
    doc.addEventListener('keydown', alTecla, true);
    const fab = q('#tour-fab');
    if (fab) fab.hidden = true;
  }

  function desmontar() {
    if (!ui) return;
    doc.removeEventListener('click', alClic, true);
    doc.removeEventListener('keydown', alTecla, true);
    ui.raiz.remove();
    ui = null;
    const fab = q('#tour-fab');
    if (fab) fab.hidden = false;
  }

  function alClic(e) {
    if (!activo || !paso) return;
    const t = e.target;
    if (t.closest && t.closest('.tour-ui')) return;
    if (fallo && objetivo && objetivo.contains(t)) return; // tras un fallo se completa a mano (p. ej. la contraseña nueva)
    if (paso.tipo === 'tocar' && objetivo && objetivo.contains(t)) {
      if (paso.alTocar && !paso.alTocar(objetivo)) return; // p. ej. abrir el menú del celular
      if (paso.navega) avanzar(true); else root.setTimeout(() => avanzar(true), 70 * VEL);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    sacudir();
  }

  function alTecla(e) {
    if (!activo) return;
    if (e.key === 'Escape') { e.stopPropagation(); terminar(); return; }
    const t = e.target;
    const aMano = fallo && objetivo && objetivo.contains(t);
    if (e.key === 'Enter' && !aMano && !(t.closest && t.closest('.tour-ui'))) e.preventDefault();
  }

  function sacudir() {
    if (!ui) return;
    ui.burbuja.classList.remove('tour-sacude');
    void ui.burbuja.offsetWidth;
    ui.burbuja.classList.add('tour-sacude');
  }

  function boton(texto, clase, fn) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + clase;
    b.textContent = texto;
    b.addEventListener('click', fn);
    ui.acciones.appendChild(b);
    return b;
  }

  function pintarBurbuja() {
    const total = PASOS.length - 1;
    const medio = paso.tipo !== 'inicio' && paso.tipo !== 'fin';
    ui.nivel.textContent = medio ? 'Nivel 1 · Paso ' + est.paso + ' de ' + (total - 1) : 'Nivel 1 · Primer día';
    ui.estrellas.innerHTML = ESTRELLA + '<b>' + est.estrellas + '</b>';
    ui.barra.style.width = Math.round((est.paso / total) * 100) + '%';
    ui.titulo.textContent = fallo ? fallo.titulo : paso.titulo;
    ui.texto.textContent = textoPaso();
    ui.extra.innerHTML = '';
    ui.acciones.innerHTML = '';
    ui.raiz.dataset.tipo = paso.tipo;
    ui.raiz.dataset.modo = est.modo || '';
    ui.raiz.dataset.tactil = esTactil() ? '1' : '';
    ui.raiz.querySelector('.tour-salir').hidden = paso.tipo === 'fin';

    let principal = null;
    if (fallo) {
      // Sin botón: lo que sigue se hace en la pantalla iluminada (o con «Saltar tutorial»).
    } else if (paso.tipo === 'inicio') {
      principal = boton('Jugar yo', 'btn-amarillo', () => elegirModo('jugar'));
      boton('Ver demostración', 'btn-borde', () => elegirModo('demo'));
    } else if (paso.tipo === 'boton' && est.modo === 'jugar') {
      principal = boton(paso.etiquetaBoton, 'btn-amarillo', ejecutarAccion);
    } else if (paso.tipo === 'info' && est.modo === 'jugar') {
      principal = boton('Siguiente', 'btn-amarillo', () => avanzar(false));
    } else if (paso.tipo === 'navegar' && est.modo === 'jugar') {
      principal = boton(paso.etiquetaBoton, 'btn-amarillo', () => navegar(paso.url));
    } else if (paso.tipo === 'fin') {
      ui.extra.innerHTML = '<div class="tour-grandes">' + ESTRELLA + ESTRELLA + ESTRELLA + '</div>';
      principal = boton('Repetir', 'btn-amarillo', () => iniciar());
      boton('Terminar', 'btn-borde', () => terminar());
    }
    ui.raiz.querySelector('.tour-salir').innerHTML = est.modo === 'demo' && paso.tipo !== 'fin' && paso.tipo !== 'inicio'
      ? 'Detener<span class="tour-pc"> demostración</span>'
      : 'Saltar<span class="tour-pc"> tutorial</span>';
    if (principal && principal.focus) principal.focus({ preventScroll: true });
  }

  /* ---------- Posicionamiento (se recalcula cada cuadro: sigue al elemento aunque se mueva) ---------- */
  function actualizar() {
    if (!paso || !ui) return;
    if (paso.vigilar) paso.vigilar();
    if (!pendiente && paso.omitir && paso.omitir()) { est.paso++; guardar(est); mostrar(); return; }
    const el = paso.objetivo ? paso.objetivo() : null;
    objetivo = visible(el) ? el : null;

    if (paso.tipo === 'esperar' && paso.hasta && paso.hasta()) { avanzar(false); return; }

    const tx = textoPaso();
    if (ui.texto.textContent !== tx) ui.texto.textContent = tx;

    let r = null;
    if (!objetivo) {
      ui.velo.hidden = false;
      ui.foco.hidden = true;
      ui.cursor.hidden = true;
    } else {
      ui.velo.hidden = true;
      r = objetivo.getBoundingClientRect();
      if (!desplazado) {
        desplazado = true;
        tDesplazo = Date.now();
        desplazar(r, lugar);
      } else if (!volteado && lugar === 'abajo' && paso.tipo !== 'inicio' && paso.tipo !== 'fin'
        && Date.now() - tDesplazo > 900 * VEL && solapa(r, ui.burbuja.getBoundingClientRect())) {
        // Ya asentado el desplazamiento, la burbuja sigue tapando lo iluminado: pasa al lado de arriba (una sola vez).
        volteado = true;
        lugar = 'arriba';
        tDesplazo = Date.now();
        desplazar(r, lugar);
      }
      const m = 8;
      ui.foco.hidden = false;
      ui.foco.style.left = (r.left - m) + 'px';
      ui.foco.style.top = (r.top - m) + 'px';
      ui.foco.style.width = (r.width + m * 2) + 'px';
      ui.foco.style.height = (r.height + m * 2) + 'px';
      const apunta = !fallo && (paso.tipo === 'tocar' || (est.modo === 'demo' && paso.tipo === 'boton'));
      ui.cursor.hidden = !apunta;
      // En pantalla táctil, jugando, no hay flecha: un círculo que late en el centro dice "toca aquí".
      const alCentro = est.modo === 'jugar' && esTactil();
      ui.cursor.style.left = (alCentro ? r.left + r.width / 2 : r.left + Math.min(r.width * 0.7, r.width - 10)) + 'px';
      ui.cursor.style.top = (alCentro ? r.top + r.height / 2 : r.top + Math.min(r.height * 0.75, r.height - 6)) + 'px';
    }
    const centro = paso.tipo === 'inicio' || paso.tipo === 'fin';
    ui.burbuja.dataset.lugar = centro ? 'centro' : lugar;
  }

  // Lleva lo iluminado al área libre de la pantalla (la que NO tapa la burbuja), no solo al centro.
  function desplazar(r, donde) {
    if (PRUEBAS || !objetivo || !ui || enFijo(objetivo)) return;
    const alto = altoVisible();
    const hb = ui.burbuja.offsetHeight + 28;
    const base = pagina() === 'index' ? 84 : 12; // la barra fija de la web ocupa la parte de arriba
    const a = donde === 'abajo' ? base : Math.max(base, hb);
    const b = donde === 'abajo' ? alto - hb : alto - 12;
    const libre = Math.max(100, b - a);
    // Si cabe, se centra en el área libre; si es más alto que ella, se alinea su borde superior.
    const delta = r.height > libre - 16 ? r.top - (a + 8) : (r.top + r.height / 2) - (a + libre / 2);
    if (Math.abs(delta) < 4) return;
    try { (contenedorScroll(objetivo) || root).scrollBy({ top: delta, behavior: sinMov() ? 'auto' : 'smooth' }); } catch (e) { /* sin desplazamiento */ }
  }

  // Se agenda el siguiente cuadro ANTES de actualizar: si actualizar() avanza de paso, mostrar() cancela este agendado y arranca el suyo.
  function bucle() {
    if (!activo) return;
    raf = ahora(bucle);
    actualizar();
  }

  /* ---------- Avance ---------- */
  function mostrar() {
    limpiarTemporizadores();
    ficha++;
    paso = PASOS[est.paso];
    if (!paso) { terminar(); return; }
    if (paso.pagina !== pagina()) { limpiarTemporizadores(); return; } // la navegación está en curso
    if (paso.omitir && paso.omitir()) { est.paso++; guardar(est); mostrar(); return; }
    pendiente = false;
    fallo = null;
    if (paso.vigilar) paso.vigilar();
    if (paso.preparar) paso.preparar();
    objetivo = null;
    desplazado = false;
    lugar = 'abajo';
    volteado = false;
    activo = true;
    montar();
    pintarBurbuja();
    cancelarAhora(raf);
    bucle();
    if (est.modo === 'demo') programarDemo();
  }

  function avanzar(estrella) {
    if (!activo || !est) return;
    if (estrella) est.estrellas++;
    est.paso++;
    guardar(est);
    mostrar();
  }

  function navegar(url) {
    est.paso++;
    guardar(est);
    limpiarTemporizadores();
    Tour.irA(url);
  }

  // Con `logrado`, el paso solo avanza si la acción funcionó (p. ej. entrar al panel); si no, se queda y explica qué pasó.
  function ejecutarAccion() {
    if (!paso || !paso.accion || pendiente || fallo) return;
    const p = paso;
    pendiente = true;
    const r = p.accion(est);
    root.setTimeout(() => {
      if (!activo || paso !== p) return;
      pendiente = false;
      if (p.logrado && !p.logrado()) {
        fallo = p.fallo ? p.fallo(r) : { titulo: 'No se pudo', texto: 'Algo no salió como se esperaba. Hazlo tú en la pantalla iluminada o toca «Saltar tutorial».' };
        if (ui) pintarBurbuja();
        return;
      }
      avanzar(true);
    }, 120 * VEL);
  }

  function elegirModo(modo) {
    est.modo = modo;
    est.paso = 1;
    guardar(est);
    mostrar();
  }

  /* ---------- Modo demostración: un cursor hace los pasos ---------- */
  function programarDemo() {
    const mia = ++ficha;
    const vigente = () => activo && mia === ficha;
    const despues = (ms, fn) => { temporizadores.push(root.setTimeout(() => { if (vigente()) fn(); }, ms * VEL)); };
    const cuando = (cond, fn) => {
      const t = root.setInterval(() => { if (!vigente()) { root.clearInterval(t); return; } if (cond()) { root.clearInterval(t); fn(); } }, Math.max(100 * VEL, 5));
      temporizadores.push(t);
    };
    const actual = paso;

    if (paso.tipo === 'tocar') {
      cuando(() => !!objetivo, () => despues(1900, () => {
        if (ui) { ui.onda.classList.remove('tour-onda-on'); void ui.onda.offsetWidth; ui.onda.classList.add('tour-onda-on'); }
        despues(450, () => {
          if (objetivo) objetivo.click();
          // Si el clic solo abrió el menú del celular, el paso sigue: se vuelve a programar.
          despues(1000, () => { if (PASOS[est.paso] === actual && paso === actual) programarDemo(); });
        });
      }));
    } else if (paso.tipo === 'boton') {
      cuando(() => !!objetivo, () => despues(2600, ejecutarAccion));
    } else if (paso.tipo === 'info') {
      despues(3800, () => avanzar(false));
    } else if (paso.tipo === 'navegar') {
      despues(3200, () => navegar(paso.url));
    }
    // 'esperar' avanza solo cuando aparece lo esperado; 'fin' se queda para que se vea el resultado.
  }

  /* ---------- Entrada y salida ---------- */
  function iniciar() {
    est = { modo: null, paso: 0, estrellas: 0, cedula: 'TOUR-' + String(10000 + Math.floor(Math.random() * 89999)) };
    guardar(est);
    if (pagina() !== 'index') { Tour.irA('index.html'); return; }
    mostrar();
  }

  function terminar() {
    activo = false;
    ficha++;
    limpiarTemporizadores();
    cancelarAhora(raf);
    guardar(null);
    est = null;
    paso = null;
    objetivo = null;
    desmontar();
  }

  function continuar() {
    const guardado = leer();
    if (!guardado) return false;
    est = guardado;
    const p = PASOS[est.paso];
    if (!p || p.pagina !== pagina()) { guardar(null); est = null; return false; }
    mostrar();
    return true;
  }

  function botonFlotante() {
    if (q('#tour-fab')) return;
    const b = doc.createElement('button');
    b.type = 'button';
    b.id = 'tour-fab';
    b.className = 'tour-ui tour-fab';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg><span>Tutorial</span>';
    b.addEventListener('click', () => iniciar());
    doc.body.appendChild(b);
  }

  function alCargar() {
    botonFlotante();
    doc.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-tour]');
      if (b && !activo) { e.preventDefault(); iniciar(); }
    });
    continuar();
  }

  const Tour = {
    iniciar, continuar, terminar, alCargar,
    irA(url) { root.location.href = url; },   // las pruebas lo sustituyen
    estado() { return est ? Object.assign({}, est) : null; },
    pasos: PASOS.length,
  };
  root.Tour = Tour;
})(window);
