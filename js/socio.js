// "Mi plan": el panel del socio en su celular. Entra con cédula + últimos 4 dígitos del teléfono (en la versión
// final, con su cuenta y contraseña) y la sesión queda guardada en el celular. Muestra el estado del plan, el QR
// personal que cambia cada 15 s, el pase diario de un solo uso, la renovación por Yappy, sus pagos con
// comprobante y sus datos (Ley 81 de 2019). Se agrega a la pantalla de inicio como una app (manifest + sw.js).
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  // Contrato con la web (que la guarda tras inscribirse y pagar): localStorage 'sag:miplan' = { socioId, cedula }.
  const SESION = 'sag:miplan';
  const PAGOS_VISIBLES = 6;

  const estado = Store.init();
  if (estado.modo === 'memoria') $('aviso-memoria').style.display = 'block';

  const form = $('socio-form');
  const error = $('socio-error');
  const aviso = $('miplan-aviso');
  const resultado = $('socio-resultado');
  const barraSesion = $('miplan-sesion');
  const bienvenida = $('miplan-bienvenida');
  const params = new URLSearchParams(location.search);

  let actual = null; // socio con la sesión abierta
  let huella = '';   // datos con que se pintó la página: si cambian (otra pestaña, el estudio confirmó un pago), se repinta

  /* ---------- Sesión guardada en el celular ---------- */
  const mismaCedula = (a, b) => String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase();

  function leerSesion() {
    try {
      const s = JSON.parse(localStorage.getItem(SESION));
      return s && s.socioId != null ? s : null;
    } catch (e) { return null; }
  }
  function guardarSesion(socio) {
    try { localStorage.setItem(SESION, JSON.stringify({ socioId: socio.id, cedula: socio.cedula })); return true; } catch (e) { return false; }
  }
  function borrarSesion() {
    try { localStorage.removeItem(SESION); } catch (e) { /* sin almacenamiento */ }
  }
  // Por qué se cerró una sesión guardada: la ficha ya no está (la borraron) o el estudio le cambió la cédula
  // (por ejemplo, al atender una corrección): en ese caso la ficha sigue y basta con volver a entrar.
  const SIN_FICHA = 'Tu sesión se cerró porque ya no encontramos tu ficha en el estudio.';
  const CEDULA_NUEVA = 'El estudio actualizó tus datos. Vuelve a entrar con tu cédula y los últimos 4 dígitos de tu teléfono.';
  const motivoCierre = (socio) => (socio ? CEDULA_NUEVA : SIN_FICHA);

  // La sesión vale si el socio existe y la cédula coincide; si no, se borra y se dice por qué.
  function socioDeSesion() {
    const s = leerSesion();
    if (!s) return { socio: null, motivo: '' };
    const socio = Store.get('socios', Number(s.socioId));
    if (socio && mismaCedula(socio.cedula, s.cedula)) return { socio, motivo: '' };
    borrarSesion();
    return { socio: null, motivo: motivoCierre(socio) };
  }
  // El tutorial necesita el formulario: mientras esté activo, la sesión no se abre sola.
  function tutorialActivo() {
    try { if (sessionStorage.getItem('sag:tour')) return true; } catch (e) { /* sin sessionStorage */ }
    try { return String(window.name || '').indexOf('sag:tour=') === 0; } catch (e) { return false; }
  }

  function entrar(socio) {
    actual = socio;
    const guardada = guardarSesion(socio);
    form.hidden = true;
    bienvenida.hidden = true;
    error.className = 'mensaje';
    error.textContent = '';
    aviso.className = 'mensaje';
    aviso.textContent = '';
    $('miplan-sesion-texto').textContent = guardada
      ? 'Tu sesión queda guardada en este celular. Si el celular no es tuyo, cierra sesión.'
      : 'Este navegador no deja guardar la sesión: la próxima vez tendrás que entrar de nuevo.';
    barraSesion.hidden = false;
    document.body.classList.add('miplan-dentro');
    mostrar(socio);
    pintarInstalar();
  }

  function salir(mensaje) {
    pararReloj();
    borrarSesion();
    actual = null;
    huella = '';
    vista = null;
    resultado.hidden = true;
    resultado.innerHTML = '';
    barraSesion.hidden = true;
    form.reset();
    form.hidden = false;
    document.body.classList.remove('miplan-dentro');
    pintarInstalar();
    // Sin mensaje, la cerró el socio; con mensaje, se cerró sola (ficha borrada o datos cambiados).
    aviso.className = mensaje ? 'mensaje nota' : 'mensaje ok';
    aviso.textContent = mensaje || 'Cerraste sesión en este celular. Para volver a entrar, escribe tu cédula y los últimos 4 dígitos de tu teléfono.';
    aviso.focus();
  }

  /* ---------- Plan ---------- */
  function textoDias(socio, est) {
    if (est === 'pendiente') return 'Aún no has pagado tu plan.';
    const d = Util.diasEntre(Store.hoy(), socio.vence);
    if (d < 0) return `Venció hace ${-d} día${d === -1 ? '' : 's'}.`;
    if (d === 0) return 'Tu plan vence hoy.';
    return `Te quedan ${d} día${d === 1 ? '' : 's'}.`;
  }

  const conQR = () => !!(window.QR && QR.disponible());
  const agrupar = (codigo) => codigo.replace(/^(SAG)(\d{6})(\w{4})$/, '$1 $2 $3');
  const agruparPase = (codigo) => codigo.replace(/^(SAGP)(\d{6})(\d{6})(\w{6})$/, '$1 $2 $3 $4');
  const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const etiquetaQR = (socio, codigo) => `Código QR de entrada de ${socio.nombre}: ${agrupar(codigo)}. Cambia cada ${Util.PASO_QR_S} segundos.`;

  // QR personal que cambia cada 15 s (el código se calcula en el celular: funciona sin conexión).
  // Se dibuja en un <canvas>, que el modo oscuro forzado de algunos navegadores no recolorea.
  function pasePersonal(socio) {
    const codigo = Util.codigoSocio(socio);
    return `
        <div class="carnet-pase">
          ${conQR() ? `<div class="carnet-qr"><canvas role="img" aria-label="${esc(etiquetaQR(socio, codigo))}"></canvas></div>` : ''}
          <div class="carnet-pase-txt">
            <strong>Tu pase de entrada</strong>
            <p>Muéstralo en recepción. Cambia cada ${Util.PASO_QR_S} segundos, así una captura de pantalla no sirve.</p>
            <span class="carnet-codigo">${esc(agrupar(codigo))}</span>
            <div class="qr-cuenta"><span class="qr-cuenta-barra" aria-hidden="true"><i></i></span><span class="qr-cuenta-txt">Cambia en ${Util.segundosQR()} s</span></div>
            ${conQR() ? '<small>Si no lo lee a la primera, sube el brillo o quita el modo oscuro del navegador.</small>' : ''}
          </div>
        </div>`;
  }

  // Pase diario (plan diario de $3): QR fijo de un solo uso para el día que pagó.
  function paseDiario(p) {
    const tit = `<p class="pase-diario-tit">Pase diario · un solo uso · hoy ${diaMes(p.fecha)}</p>`;
    if (p.usado) {
      return `<div class="pase-diario usado">${tit}<p class="pase-usado-txt">Usado hoy${p.usadoEn ? ' a las ' + esc(p.usadoEn) : ''}</p></div>`;
    }
    return `
          <div class="pase-diario">
            ${conQR() ? `<div class="pase-qr"><canvas role="img" data-codigo="${esc(p.codigo)}" aria-label="${esc('Código QR del pase diario de hoy, un solo uso: ' + agruparPase(p.codigo))}"></canvas></div>` : ''}
            <div class="pase-diario-txt">
              ${tit}
              <p>Muéstralo en recepción. Sirve para una sola entrada, solo hoy.</p>
              <span class="pase-codigo">${esc(agruparPase(p.codigo))}</span>
            </div>
          </div>`;
  }

  function zonaPases(socio) {
    const hoy = Store.hoy();
    const pases = Store.pasesDe(socio.id);
    const deHoy = pases.find((p) => p.fecha === hoy) || null;
    const proximo = pases.filter((p) => p.fecha > hoy && !p.usado).sort((a, b) => a.fecha.localeCompare(b.fecha))[0] || null;
    const nota = proximo ? `<p class="pase-nota">Tu pase diario es para el ${diaMes(proximo.fecha)}. Ese día aparece aquí, listo para mostrar en recepción.</p>` : '';
    if (!deHoy) return nota + pasePersonal(socio);
    if (deHoy.usado) return paseDiario(deHoy) + nota + pasePersonal(socio);
    // Con pase de hoy sin usar, el QR personal sigue a mano en la otra pestaña.
    return `
        <div class="pase-zona">
          <div class="pase-pestanas" role="tablist" aria-label="Tus pases de entrada">
            <button type="button" role="tab" id="tab-pase-hoy" aria-controls="panel-pase-hoy" aria-selected="true">Pase de hoy</button>
            <button type="button" role="tab" id="tab-pase-personal" aria-controls="panel-pase-personal" aria-selected="false" tabindex="-1">Mi QR personal</button>
          </div>
          <div role="tabpanel" id="panel-pase-hoy" aria-labelledby="tab-pase-hoy">${paseDiario(deHoy)}</div>
          <div role="tabpanel" id="panel-pase-personal" aria-labelledby="tab-pase-personal" hidden>${pasePersonal(socio)}</div>
        </div>${nota}`;
  }

  // Devuelve `elegir(tab)`, para volver a la pestaña que el socio tenía elegida.
  function activarPestanas() {
    const tabs = Array.from(resultado.querySelectorAll('[role="tab"]'));
    const elegir = (tab, enfocar) => {
      tabs.forEach((t) => {
        const si = t === tab;
        t.setAttribute('aria-selected', String(si));
        t.tabIndex = si ? 0 : -1;
        $(t.getAttribute('aria-controls')).hidden = !si;
      });
      if (enfocar) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => elegir(t));
      t.addEventListener('keydown', (e) => {
        const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (n === undefined) return;
        e.preventDefault();
        elegir(tabs[(n + tabs.length) % tabs.length], true);
      });
    });
    return elegir;
  }

  /* ---------- Reloj del QR personal ---------- */
  // Redibuja el QR cuando cambia el código y mueve la cuenta regresiva cada segundo. Se detiene al repintar,
  // al cerrar sesión y con la página oculta; al volver, redibuja al instante.
  let reloj = null;
  let vista = null; // { socio, caja, lienzo, codigo, txt, barra, paso, planInicial }

  function pararReloj() {
    clearTimeout(reloj);
    reloj = null;
  }

  function tic() {
    pararReloj();
    const v = vista;
    if (!v || !v.caja.isConnected) return;
    const ms = Util.ahoraMs();
    const paso = Util.pasoQR(ms);
    const s = Util.segundosQR(ms);
    if (paso !== v.paso) {
      const codigo = Util.codigoSocio(v.socio, ms);
      v.paso = paso;
      if (v.lienzo) {
        QR.dibujar(v.lienzo, codigo);
        v.lienzo.setAttribute('aria-label', etiquetaQR(v.socio, codigo));
      }
      v.codigo.textContent = agrupar(codigo);
      // La barra vuelve a llenarse de golpe, sin animación hacia atrás.
      v.barra.style.transition = 'none';
      v.barra.style.width = (s / Util.PASO_QR_S) * 100 + '%';
      void v.barra.offsetWidth;
      v.barra.style.transition = '';
    }
    v.txt.textContent = `Cambia en ${s} s`;
    v.barra.style.width = (s / Util.PASO_QR_S) * 100 + '%';
    if (!document.hidden) reloj = setTimeout(tic, 1000 - (ms % 1000) + 20);
  }

  /* ---------- Pagos ---------- */
  const metodoPago = (p) => (p.canal === 'web' ? 'Yappy en línea' : p.metodo === 'yappy' ? 'Yappy' : 'Efectivo');

  function filaPago(p, planes, i) {
    const plan = planes.find((x) => x.id === p.planId);
    const num = Util.numeroComprobante(p);
    return `
          <li class="pago-fila"${i >= PAGOS_VISIBLES ? ' data-extra hidden' : ''}>
            <strong class="pago-tit">${Util.fechaCorta(p.fecha)} · ${esc(plan ? plan.nombre : 'Plan')}</strong>
            <strong class="pago-monto">${Util.dinero(p.monto)}</strong>
            <small class="pago-sub">${esc(num)} · ${esc(metodoPago(p))}</small>
            <button type="button" class="btn btn-borde btn-chico" data-comprobante="${p.id}" aria-label="${esc('Ver comprobante ' + num)}">Ver comprobante</button>
          </li>`;
  }

  /* ---------- Mis datos (Ley 81 de 2019) ---------- */
  const DERECHOS = {
    acceso: { nombre: 'Copia de mis datos', listo: 'Listo: pediste una copia de tus datos. El estudio te la entrega y su respuesta aparece aquí abajo.' },
    correccion: { nombre: 'Corrección de mis datos', listo: 'Listo: el estudio revisará tu corrección. Su respuesta aparece aquí abajo.' },
    borrado: { nombre: 'Borrado de mis datos', listo: 'Listo: pediste que borren tus datos. El estudio te responde aquí abajo.' },
  };

  function htmlSolicitudes(socioId) {
    const lista = Store.derechosDe(socioId);
    if (!lista.length) return '<p class="vacio">Todavía no has hecho solicitudes.</p>';
    return `<ul class="derechos-lista">${lista.map((d) => {
      const atendida = d.estado === 'atendida';
      return `
            <li>
              <div class="derecho-info">
                <strong>${esc((DERECHOS[d.tipo] || {}).nombre || d.tipo)}</strong>
                <small>Pedida el ${Util.fechaCorta(d.fecha)}</small>
                ${d.detalle ? `<small class="derecho-detalle">«${esc(d.detalle)}»</small>` : ''}
                ${atendida ? `<p class="derecho-respuesta">Respuesta del estudio${d.atendidaEn ? ' (' + Util.fechaCorta(d.atendidaEn) + ')' : ''}: ${esc(d.respuesta || 'Solicitud atendida.')}</p>` : ''}
              </div>
              <span class="insignia ${atendida ? 'activo' : 'pendiente'}">${atendida ? 'Atendida' : 'Pendiente'}</span>
            </li>`;
    }).join('')}</ul>`;
  }

  // Lo que el estudio guarda del socio. Las notas internas y las etiquetas del personal no se muestran.
  function misDatos(socio, plan) {
    const objetivo = (Store.OBJETIVOS.find((o) => o[0] === socio.objetivo) || [])[1];
    const emergencia = [socio.emergenciaNombre, socio.emergenciaTelefono].filter(Boolean).join(' · ');
    const c = socio.consentimiento;
    const filas = [
      ['Nombre', socio.nombre],
      ['Cédula', socio.cedula],
      ['Teléfono', socio.telefono],
      ['Correo', socio.correo],
      ['Fecha de nacimiento', socio.nacimiento ? Util.fechaCorta(socio.nacimiento) : ''],
      ['Contacto de emergencia', emergencia],
      ['Objetivo', objetivo],
      ['Plan', plan.nombre],
      ['Inscrito desde', socio.creadoEn ? Util.fechaCorta(socio.creadoEn) : ''],
      ['Aviso de privacidad', c && c.fecha ? `Lo aceptaste el ${Util.fechaCorta(c.fecha)}${c.aviso ? ' (versión ' + c.aviso + ')' : ''}` : 'Sin registro en el sistema'],
    ];
    return `
      <details class="miplan-datos" id="mis-datos">
        <summary>
          <span class="miplan-datos-tit">Mis datos</span>
          <span class="miplan-datos-sub">Lo que el estudio guarda de ti y cómo pedir verlos, corregirlos o borrarlos.</span>
        </summary>
        <div class="miplan-datos-cuerpo">
          <dl class="datos-lista">${filas.map(([k, v]) => `
            <div><dt>${k}</dt><dd>${v ? esc(v) : '<span class="vacio">No registrado</span>'}</dd></div>`).join('')}
          </dl>
          <p class="datos-nota">Por la Ley 81 de 2019 puedes pedir una copia de tus datos, corregirlos o que los borren. El estudio atiende tu solicitud y su respuesta aparece aquí.</p>
          <div class="datos-acciones">
            <button type="button" class="btn btn-borde btn-chico" data-derecho="acceso">Pedir una copia de mis datos</button>
            <button type="button" class="btn btn-borde btn-chico" data-derecho="correccion" aria-expanded="false" aria-controls="derecho-correccion">Pedir una corrección</button>
            <button type="button" class="btn btn-borde btn-chico" data-derecho="borrado" aria-expanded="false" aria-controls="derecho-borrado">Pedir que borren mis datos</button>
          </div>
          <form class="datos-caja" id="derecho-correccion" novalidate hidden>
            <label>¿Qué dato hay que corregir y cómo debe quedar?
              <textarea name="detalle" rows="3" maxlength="500" placeholder="Ej.: mi teléfono ahora es 6612-0000."></textarea>
            </label>
            <div class="mensaje" id="derecho-correccion-error" role="alert"></div>
            <div class="datos-botones">
              <button type="submit" class="btn btn-amarillo btn-chico">Enviar corrección</button>
              <button type="button" class="btn btn-borde btn-chico" data-cancelar>Cancelar</button>
            </div>
          </form>
          <div class="datos-caja datos-confirmar" id="derecho-borrado" role="group" aria-labelledby="derecho-borrado-txt" hidden>
            <p id="derecho-borrado-txt"><strong>¿Pedir que borren tus datos?</strong> Cuando el estudio lo atienda, se borra tu ficha y ya no podrás entrar a «Mi plan». Tus pagos quedan en sus cuentas, sin tu nombre.</p>
            <div class="datos-botones">
              <button type="button" class="btn btn-rojo btn-chico" data-confirmar>Sí, pedir que los borren</button>
              <button type="button" class="btn btn-borde btn-chico" data-cancelar>Cancelar</button>
            </div>
          </div>
          <p class="mensaje" id="derecho-msg" role="status" tabindex="-1"></p>
          <h4>Mis solicitudes</h4>
          <div id="derechos-lista">${htmlSolicitudes(socio.id)}</div>
          <p class="datos-pie"><a href="privacidad.html">Aviso de privacidad</a></p>
        </div>
      </details>`;
  }

  // `previo`: la caja de corrección (con su texto) o la de borrado que estaba abierta antes de repintar.
  function prepararDatos(socio, previo) {
    const caja = $('mis-datos');
    const msg = $('derecho-msg');
    const formCorr = $('derecho-correccion');
    const errCorr = $('derecho-correccion-error');
    const confirmar = $('derecho-borrado');
    const btn = (tipo) => caja.querySelector(`[data-derecho="${tipo}"]`);
    const decir = (texto, clase) => { msg.className = 'mensaje ' + clase; msg.textContent = texto; };
    const mostrarCaja = (cual) => {
      formCorr.hidden = cual !== 'correccion';
      confirmar.hidden = cual !== 'borrado';
      btn('correccion').setAttribute('aria-expanded', String(cual === 'correccion'));
      btn('borrado').setAttribute('aria-expanded', String(cual === 'borrado'));
    };
    const pedir = (tipo, detalle) => {
      if (Store.derechosDe(socio.id).some((d) => d.tipo === tipo && d.estado === 'pendiente')) {
        decir('Ya tienes esa solicitud pendiente. Cuando el estudio la atienda, verás aquí su respuesta.', 'nota');
        return false;
      }
      try {
        Store.solicitarDerecho(socio.id, { tipo, detalle });
      } catch (e) {
        decir('No pudimos enviar tu solicitud. Inténtalo de nuevo.', 'error');
        return false;
      }
      decir(DERECHOS[tipo].listo, 'ok');
      $('derechos-lista').innerHTML = htmlSolicitudes(socio.id);
      huella = calcularHuella(Store.get('socios', socio.id) || socio);
      return true;
    };

    btn('acceso').addEventListener('click', () => { mostrarCaja(null); pedir('acceso', ''); });
    btn('correccion').addEventListener('click', () => {
      mostrarCaja('correccion');
      errCorr.className = 'mensaje';
      formCorr.detalle.focus();
    });
    btn('borrado').addEventListener('click', () => {
      mostrarCaja('borrado');
      confirmar.querySelector('[data-confirmar]').focus();
    });
    formCorr.addEventListener('submit', (e) => {
      e.preventDefault();
      const texto = formCorr.detalle.value.trim();
      if (!texto) {
        errCorr.className = 'mensaje error';
        errCorr.textContent = 'Escribe qué dato hay que corregir.';
        formCorr.detalle.focus();
        return;
      }
      if (pedir('correccion', texto)) formCorr.reset();
      mostrarCaja(null);
      msg.focus();
    });
    formCorr.querySelector('[data-cancelar]').addEventListener('click', () => { mostrarCaja(null); btn('correccion').focus(); });
    confirmar.querySelector('[data-confirmar]').addEventListener('click', () => { pedir('borrado', ''); mostrarCaja(null); msg.focus(); });
    confirmar.querySelector('[data-cancelar]').addEventListener('click', () => { mostrarCaja(null); btn('borrado').focus(); });

    if (previo.correccion != null) {
      mostrarCaja('correccion');
      formCorr.detalle.value = previo.correccion;
    } else if (previo.borrado) {
      mostrarCaja('borrado');
    }
  }

  /* ---------- Pintar ---------- */
  // Huella de lo que se ve en "Mi plan". Solo los campos de la ficha que el socio ve: las notas y etiquetas
  // del personal no cuentan, así un cambio que el socio no ve no le repinta la pantalla.
  const CAMPOS_VISIBLES = ['nombre', 'cedula', 'telefono', 'correo', 'nacimiento', 'emergenciaNombre', 'emergenciaTelefono',
    'objetivo', 'planId', 'vence', 'creadoEn', 'consentimiento'];
  function calcularHuella(socio) {
    const aj = Store.getAjustes();
    return JSON.stringify([CAMPOS_VISIBLES.map((k) => socio[k]), Store.pasesDe(socio.id),
      Store.list('pagos').filter((p) => p.socioId === socio.id).map((p) => [p.id, p.fecha, p.planId, p.monto, p.metodo, p.canal]),
      Store.derechosDe(socio.id), Store.planes(), Store.hoy(), [aj.yappy, aj.whatsapp, aj.telefono, !!(aj.ejemplo && aj.ejemplo.yappy)]]);
  }

  // Lo que el socio tenía elegido, abierto o a medio escribir, para que un repintado (el estudio confirmó un
  // pago, atendió una solicitud…) no se lo quite. Solo si sigue siendo el mismo socio.
  const ENFOCABLES = 'a[href], button, select, textarea, summary, [tabindex]';
  function leerVista(socio) {
    const q = (s) => resultado.querySelector(s);
    if (!vista || vista.socio.id !== socio.id) return { datos: !!(q('#mis-datos') || {}).open };
    const tab = q('[role="tab"][aria-selected="true"]');
    const corr = q('#derecho-correccion');
    const borr = q('#derecho-borrado');
    const todos = q('#socio-pagos-todos');
    const sel = q('#socio-plan');
    return {
      mismo: true,
      datos: !!(q('#mis-datos') || {}).open,
      tab: tab ? tab.id : '',
      plan: sel && sel.value !== String(vista.planInicial) ? sel.value : '', // solo si el socio eligió otro
      correccion: corr && !corr.hidden ? corr.detalle.value : null,
      borrado: !!borr && !borr.hidden,
      todos: !!todos && todos.getAttribute('aria-expanded') === 'true',
      foco: claveFoco(),
    };
  }
  // El foco se recuerda por id, por el comprobante o por su lugar dentro de la caja con id más cercana.
  function claveFoco() {
    const f = document.activeElement;
    if (!f || f === resultado || !resultado.contains(f)) return null;
    if (f.id) return { id: f.id };
    if (f.dataset.comprobante) return { sel: `[data-comprobante="${f.dataset.comprobante}"]` };
    const caja = f.parentElement.closest('[id]');
    return { caja: caja.id, i: Array.from(caja.querySelectorAll(ENFOCABLES)).indexOf(f) };
  }
  function devolverFoco(k) {
    if (!k) return;
    let el = null;
    if (k.id) el = $(k.id);
    else if (k.sel) el = resultado.querySelector(k.sel);
    else if ($(k.caja)) el = $(k.caja).querySelectorAll(ENFOCABLES)[k.i];
    if (el && resultado.contains(el)) el.focus({ preventScroll: true });
  }

  // `op.pagado`: el pago en línea que se acaba de hacer (para confirmarlo y llevar al pase diario).
  function mostrar(socio, op) {
    op = op || {};
    // Tras pagar en línea se muestra lo nuevo (el pase de hoy); "Mis datos" abierto se conserva siempre.
    const previo = op.pagado ? { datos: !!(resultado.querySelector('#mis-datos') || {}).open } : leerVista(socio);
    pararReloj();
    const planes = Store.planes();
    const plan = planes.find((p) => p.id === socio.planId) || planes[planes.length - 1];
    const est = Store.estadoSocio(socio);
    const pagos = Store.list('pagos')
      .filter((p) => p.socioId === socio.id)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);

    const dRest = socio.vence && est !== 'pendiente' ? Util.diasEntre(Store.hoy(), socio.vence) : 0;
    const prog = Math.max(0, Math.min(1, dRest / (plan.dias || 30)));
    resultado.hidden = false;
    resultado.innerHTML = `
      <div class="socio-tarjeta est-${est}${previo.mismo ? ' lleno repintada' : ''}" style="--prog:${prog.toFixed(3)}">
        <div class="carnet-cab"><img src="assets/logo.png" alt=""><span>Carnet de socio</span></div>
        <div class="socio-cabecera">
          <h2 tabindex="-1">${esc(socio.nombre)}</h2>
          <span class="insignia ${est}">${Util.etiquetaEstado(est)}</span>
        </div>
        ${zonaPases(socio)}
        <dl class="socio-datos">
          <div><dt>Plan</dt><dd>${esc(plan.nombre)}</dd></div>
          <div><dt>Vence</dt><dd>${socio.vence ? Util.fechaCorta(socio.vence) : '—'}</dd></div>
        </dl>
        <div class="carnet-medidor">
          <div class="anillo" aria-hidden="true">
            <svg viewBox="0 0 100 100"><circle class="a-fondo" cx="50" cy="50" r="46"/><circle class="a-valor" cx="50" cy="50" r="46"/></svg>
            <div class="anillo-centro"><strong>${Math.max(0, dRest)}</strong><small>días</small></div>
          </div>
          <div><p class="socio-dias">${textoDias(socio, est)}</p><span class="barra-dias" aria-hidden="true"><i></i></span></div>
        </div>

        <h3>Renovar por Yappy</h3>
        <label>Plan a pagar
          <select id="socio-plan">${planes.map((p) => `<option value="${p.id}"${p.id === plan.id ? ' selected' : ''}>${esc(p.nombre)} — ${Util.dinero(p.precio)}</option>`).join('')}</select>
        </label>
        <p class="yappy-nota miplan-nota-diario" id="socio-nota-diario" hidden>Plan diario: trae un pase de un solo uso. Si pagas en línea, aparece aquí al instante; si pagas al número de Yappy, aparece cuando el estudio confirme tu pago.</p>
        <p class="mensaje" id="socio-pagado" role="status" tabindex="-1"></p>
        <div id="socio-yappy"></div>

        <h3>Mis pagos</h3>
        ${pagos.length ? `
        <ul class="pagos-lista" id="socio-pagos">${pagos.map((p, i) => filaPago(p, planes, i)).join('')}
        </ul>
        ${pagos.length > PAGOS_VISIBLES ? `<button type="button" class="btn btn-borde btn-chico pagos-todos" id="socio-pagos-todos" aria-expanded="false" aria-controls="socio-pagos">Ver todos (${pagos.length})</button>` : ''}`
        : '<p class="vacio">Todavía no tienes pagos registrados.</p>'}
      </div>
      ${misDatos(socio, plan)}`;

    // QR personal: el reloj lo dibuja y lo mantiene al día.
    const caja = resultado.querySelector('.carnet-pase');
    vista = {
      socio, caja, paso: null, planInicial: plan.id,
      lienzo: caja.querySelector('canvas'),
      codigo: caja.querySelector('.carnet-codigo'),
      txt: caja.querySelector('.qr-cuenta-txt'),
      barra: caja.querySelector('.qr-cuenta-barra i'),
    };
    tic();
    resultado.querySelectorAll('canvas[data-codigo]').forEach((c) => QR.dibujar(c, c.dataset.codigo));
    const elegirPestana = activarPestanas();
    if (previo.tab && $(previo.tab)) elegirPestana($(previo.tab));

    const notaDiario = $('socio-nota-diario');
    const pintarYappy = () => {
      const elegido = planes.find((p) => p.id === Number($('socio-plan').value));
      const caja = $('socio-yappy');
      Yappy.pintar(caja, socio, elegido, (pago) => mostrar(Store.get('socios', socio.id) || socio, { pagado: pago }));
      // Si la caja de Yappy ya avisa cuándo aparece el pase del plan diario, no se repite.
      notaDiario.hidden = elegido.dias !== 1 || /cuando el estudio confirme/.test(caja.textContent);
    };
    if (previo.plan && planes.some((p) => String(p.id) === previo.plan)) $('socio-plan').value = previo.plan;
    $('socio-plan').addEventListener('change', pintarYappy);
    pintarYappy();

    const todos = $('socio-pagos-todos');
    if (todos) {
      const verTodos = (abrir) => {
        resultado.querySelectorAll('#socio-pagos [data-extra]').forEach((li) => { li.hidden = !abrir; });
        todos.setAttribute('aria-expanded', String(abrir));
        todos.textContent = abrir ? 'Ver menos' : `Ver todos (${pagos.length})`;
      };
      todos.addEventListener('click', () => verTodos(todos.getAttribute('aria-expanded') !== 'true'));
      if (previo.todos) verTodos(true);
    }
    resultado.querySelectorAll('[data-comprobante]').forEach((b) => {
      b.addEventListener('click', () => Comprobante.abrir(Number(b.dataset.comprobante), { contexto: 'socio' }));
    });

    prepararDatos(socio, previo);
    if (previo.datos) $('mis-datos').open = true;
    huella = calcularHuella(socio);

    if (op.pagado) confirmarPago(op.pagado);
    else devolverFoco(previo.foco);
    const tarjeta = resultado.querySelector('.socio-tarjeta');
    requestAnimationFrame(() => requestAnimationFrame(() => tarjeta.classList.add('lleno')));
  }

  // Tras pagar en línea: confirma el pago y, si trae pase diario para hoy, lo muestra.
  function confirmarPago(pago) {
    const msg = $('socio-pagado');
    let texto = `¡Pago registrado! ${Util.dinero(pago.monto)} · comprobante ${Util.numeroComprobante(pago)}.`;
    if (pago.pase) {
      texto += pago.desde === Store.hoy()
        ? ' Tu pase diario de hoy ya está arriba, listo para mostrar en recepción.'
        : ` Tu pase diario es para el ${diaMes(pago.desde)}.`;
    } else if (pago.hasta) {
      texto += ` Tu plan vence el ${Util.fechaCorta(pago.hasta)}.`;
    }
    msg.className = 'mensaje ok';
    msg.textContent = texto;
    const tab = $('tab-pase-hoy');
    if (pago.pase && tab) {
      tab.focus({ preventScroll: true });
      const zona = resultado.querySelector('.pase-zona');
      if (zona.scrollIntoView) zona.scrollIntoView({ block: 'center' });
    } else {
      msg.focus({ preventScroll: true });
      if (msg.scrollIntoView) msg.scrollIntoView({ block: 'center' });
    }
  }

  // Al volver a la página o si otra pestaña cambió los datos: repinta solo si algo cambió.
  function refrescar() {
    if (!actual) return;
    const socio = Store.get('socios', actual.id);
    if (!socio || !mismaCedula(socio.cedula, actual.cedula)) {
      salir(motivoCierre(socio));
      return;
    }
    if (calcularHuella(socio) !== huella) mostrar(socio);
    else tic();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pararReloj();
    else refrescar();
  });
  window.addEventListener('storage', (e) => {
    if (!actual || document.hidden) return;
    if (e.key === SESION && !leerSesion()) salir();
    else if (e.key !== SESION) refrescar();
  });

  /* ---------- Instalar como app ---------- */
  let pedidoInstalar = null; // evento beforeinstallprompt (Chrome y Android)
  let instalada = false;
  const enApp = () => !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true);
  const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function pintarInstalar() {
    const caja = $('miplan-instalar');
    const puede = !!actual && !instalada && !enApp() && !!(pedidoInstalar || esIOS());
    caja.hidden = !puede;
    if (!puede) return;
    $('miplan-instalar-btn').hidden = !pedidoInstalar;
    $('miplan-instalar-texto').textContent = pedidoInstalar
      ? 'Agrégalo a tu pantalla de inicio y ábrelo con un toque, sin volver a escribir tus datos.'
      // En iPhone la app instalada guarda sus datos aparte de Safari: la sesión no pasa al ícono.
      : 'En tu iPhone o iPad: toca Compartir y luego «Agregar a inicio». La primera vez que abras el ícono, entra otra vez con tu cédula.';
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // en su lugar se muestra el botón "Instalar Mi plan"
    pedidoInstalar = e;
    pintarInstalar();
  });
  window.addEventListener('appinstalled', () => {
    instalada = true;
    pedidoInstalar = null;
    pintarInstalar();
  });
  $('miplan-instalar-btn').addEventListener('click', () => {
    const ev = pedidoInstalar;
    if (!ev) return;
    pedidoInstalar = null; // el aviso del navegador se puede usar una sola vez
    try { ev.prompt(); } catch (e) { /* nada */ }
    Promise.resolve(ev.userChoice)
      .then((r) => { if (r && r.outcome === 'accepted') instalada = true; })
      .catch(() => null)
      .then(pintarInstalar);
  });

  // El service worker deja abrir "Mi plan" sin conexión y permite instalarlo. Solo en http(s), no con doble clic.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const registrar = () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => null);
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar);
  }

  /* ---------- Entrar ---------- */
  $('miplan-salir').addEventListener('click', () => salir());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const socio = Store.buscarSocioPorCredenciales(f.get('cedula'), f.get('ultimos4'));
    if (!socio) {
      // Mismo mensaje para cédula inexistente o dígitos incorrectos: no se revela cuál falló.
      error.className = 'mensaje error';
      error.textContent = 'No encontramos un socio con esos datos. Revisa tu cédula y los últimos 4 dígitos de tu teléfono.';
      resultado.hidden = true;
      return;
    }
    entrar(socio);
    window.scrollTo(0, 0);
    const titulo = resultado.querySelector('h2');
    if (titulo) titulo.focus({ preventScroll: true });
  });

  // Llegó por el QR impreso del estudio (socio.html?origen=qr): bienvenida breve sobre el formulario.
  if (params.get('origen') === 'qr') bienvenida.hidden = false;

  // Abre la sesión guardada, salvo que el tutorial esté en un paso de esta página (necesita el formulario).
  function restaurar() {
    if (window.Tour && Tour.estado()) return;
    const { socio, motivo } = socioDeSesion();
    if (socio) entrar(socio);
    else if (motivo) {
      aviso.className = 'mensaje nota';
      aviso.textContent = motivo;
    }
  }
  // Si quedó estado del tutorial, se decide cuando ya cargó tour.js (va después de este archivo): Tour.alCargar()
  // descarta el estado de un paso de otra página, y entonces la sesión sí se abre.
  if (!tutorialActivo()) restaurar();
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restaurar);
  else restaurar();
})();
