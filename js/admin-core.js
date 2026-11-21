(function (root) {
  const $ = (id) => document.getElementById(id);
  const ORDEN = ['inicio', 'socios', 'cobros', 'checkin', 'cafeteria', 'reportes', 'ajustes'];
  // Sesión del panel: id del usuario en la pestaña (la leen también las pruebas, tests/cdp.js).
  const SESION = 'sag:sesion';
  // Accesos rápidos de la demo (los mismos datos que muestra la ayuda bajo el formulario).
  const DEMO = { dueno: ['dueno', 'demo'], recepcion: ['recepcion', 'recepcion'] };

  const pantallas = {};
  let actual = null;
  // Si render() devuelve una función, se llama al dejar la pantalla (p. ej. Check-in apaga la cámara).
  let limpiar = null;
  // Rol con que se armó la navegación: si cambia (en otra pestaña), se vuelve a armar.
  let rolMostrado = null;

  function registrar(id, pantalla) { pantallas[id] = pantalla; }

  function desmontar() {
    const f = limpiar;
    limpiar = null;
    if (typeof f === 'function') {
      try { f(); } catch (e) { if (root.console) console.error(e); }
    }
  }

  const permitidas = () => ORDEN.filter((id) => pantallas[id] && Store.puede('ver:' + id));

  // "#cobros?socio=3" → {id: 'cobros', params: {socio: '3'}}
  function leerHash() {
    const [id, query] = location.hash.replace(/^#/, '').split('?');
    return { id: pantallas[id] ? id : 'inicio', params: Object.fromEntries(new URLSearchParams(query || '')) };
  }

  function ir(id, params) {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    const nuevo = '#' + id + q;
    if (location.hash === nuevo) pintar(); else location.hash = nuevo;
  }

  function pintar() {
    if (!Store.modo) return;
    if (!revisarSesion()) return;
    desmontar();
    let { id, params } = leerHash();
    if (!Store.puede('ver:' + id)) {
      // Una dirección guardada o escrita a mano no abre una sección sin permiso.
      const destino = permitidas()[0] || 'inicio';
      toast('Esa sección es solo para el dueño');
      try { history.replaceState(null, '', '#' + destino); } catch (e) { /* sin historial: igual se pinta el destino */ }
      id = destino;
      params = {};
    }
    const p = pantallas[id];
    actual = id;
    Admin.params = params;
    $('titulo-pantalla').textContent = p.titulo;
    const cont = $('pantalla');
    cont.innerHTML = '';
    cont.classList.add('entrando');
    clearTimeout(Admin._tEntrada);
    Admin._tEntrada = setTimeout(() => cont.classList.remove('entrando'), 1100);
    const fin = p.render(cont);
    limpiar = typeof fin === 'function' ? fin : null;
    marcarNav(id);
    window.scrollTo(0, 0);
  }

  function marcarNav(id) {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const activo = a.dataset.nav === id;
      a.classList.toggle('activo', activo);
      if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    posicionarIndicadores();
  }

  // Barra deslizante que marca la sección activa (menú lateral y barra inferior).
  function posicionarIndicadores() {
    ['nav-lateral', 'nav-inferior'].forEach((nid) => {
      const nav = $(nid);
      const ind = nav && nav.querySelector('.nav-ind');
      const act = nav && nav.querySelector('.nav-item.activo');
      if (!ind || !act || !act.offsetWidth) return;
      ind.style.width = act.offsetWidth + 'px';
      ind.style.height = act.offsetHeight + 'px';
      ind.style.transform = 'translate(' + act.offsetLeft + 'px,' + act.offsetTop + 'px)';
      ind.classList.add('listo');
    });
  }

  // Solo las secciones que el rol puede ver (recepción: 5; dueño: 7).
  function construirNavegacion() {
    const ids = permitidas();
    const item = (id, clase) => {
      const p = pantallas[id];
      return `<a href="#${id}" data-nav="${id}" class="${clase}">${p.icono}<span>${p.etiqueta || p.titulo}</span></a>`;
    };
    const ind = '<i class="nav-ind" aria-hidden="true"></i>';
    $('nav-lateral').innerHTML = ind + ids.map((id) => item(id, 'nav-item')).join('');
    $('nav-inferior').innerHTML = ind + ids.map((id) => item(id, 'nav-item')).join('');
    $('nav-inferior').dataset.items = String(ids.length);
  }

  let temporizadorToast = null;
  function toast(mensaje) {
    const t = $('toast');
    t.innerHTML = '<span class="toast-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span></span>';
    t.lastChild.textContent = mensaje;
    t.classList.add('visible');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => t.classList.remove('visible'), 2800);
  }

  // Tab y Shift+Tab no salen de la ventana abierta.
  function atraparFoco(caja, e) {
    if (e.key !== 'Tab') return;
    const f = Array.from(caja.querySelectorAll('button, [href], input:not([hidden]), select, textarea'))
      .filter((x) => !x.disabled && x.getClientRects().length);
    if (!f.length) return;
    const primero = f[0];
    const ultimo = f[f.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }

  let cerrarConfirmacion = null;
  // `opciones.si`: texto del botón que confirma (p. ej. "Borrar sus datos"). Esc o Cancelar → false.
  function confirmar(mensaje, opciones) {
    if (cerrarConfirmacion) cerrarConfirmacion(false);
    return new Promise((resolver) => {
      const modal = $('modal');
      const antes = document.activeElement;
      $('modal-texto').textContent = mensaje;
      $('modal-si').textContent = (opciones && opciones.si) || 'Confirmar';
      modal.hidden = false;
      const tecla = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(false); } else atraparFoco(modal, e);
      };
      const cerrar = (valor) => {
        modal.hidden = true;
        $('modal-si').onclick = null;
        $('modal-no').onclick = null;
        modal.removeEventListener('keydown', tecla);
        cerrarConfirmacion = null;
        if (antes && antes.isConnected && antes.focus) antes.focus();
        resolver(valor);
      };
      cerrarConfirmacion = cerrar;
      $('modal-si').onclick = () => cerrar(true);
      $('modal-no').onclick = () => cerrar(false);
      modal.addEventListener('keydown', tecla);
      $('modal-no').focus();
    });
  }

  /* ---------- Sesión: usuario y contraseña ---------- */
  function leerSesion() {
    try { return sessionStorage.getItem(SESION); } catch (e) { return Admin._sesionMemoria || null; }
  }
  function guardarSesion(id) {
    const v = id == null ? null : String(id);
    try {
      if (v) sessionStorage.setItem(SESION, v); else sessionStorage.removeItem(SESION);
      sessionStorage.removeItem('sag:auth'); // clave única de la versión anterior de la demo
    } catch (e) { Admin._sesionMemoria = v; }
  }

  const inicial = (nombre) => (String(nombre || '?').trim()[0] || '?').toUpperCase();

  function pintarUsuario(u) {
    // El usuario de fábrica del dueño se llama "Dueño": no se repite "Dueño · Dueño".
    const rol = u.nombre === u.nombreRol ? '' : u.nombreRol;
    $('usuario-nombre').textContent = u.nombre;
    $('usuario-rol').textContent = (rol ? rol + ' · ' : '') + 'Sesión abierta';
    $('usuario-avatar').textContent = inicial(u.nombre);
    document.querySelector('.sesion-usuario').dataset.rol = u.rol;
    $('sesion-movil').textContent = u.nombre + (rol ? ' · ' + rol : '');
  }

  // Revisa que el usuario siga activo (pudo desactivarse en otra pestaña o no existir en un respaldo restaurado).
  function revisarSesion() {
    const u = Store.usuario();
    if (!u) {
      sesionPerdida();
      return null;
    }
    if (u.rol !== rolMostrado) {
      rolMostrado = u.rol;
      construirNavegacion();
      if (actual) marcarNav(actual);
    }
    pintarUsuario(u);
    return u;
  }

  // Para otras pantallas (p. ej. Ajustes tras cambiar usuarios) y para los cambios hechos en otra pestaña:
  // actualiza el usuario de la barra y la navegación sin volver a pintar la pantalla, salvo que esta ya no
  // esté permitida o que el rol haya cambiado (Inicio, por ejemplo, muestra cosas distintas a cada rol).
  function refrescarSesion() {
    if ($('app').hidden) return;
    const rolAntes = rolMostrado;
    const u = revisarSesion();
    if (u && actual && (u.rol !== rolAntes || !Store.puede('ver:' + actual))) pintar();
  }

  // Al cerrarse la sesión, la dirección vuelve a Inicio: quien entre después no hereda la sección del anterior
  // (ni el aviso de «solo para el dueño» si es recepción).
  function direccionInicio() {
    if (!location.hash || location.hash === '#inicio') return;
    try { history.replaceState(null, '', location.pathname + location.search + '#inicio'); } catch (e) { /* sin historial */ }
  }

  function sesionPerdida() {
    Store.cerrarSesion();
    guardarSesion(null);
    direccionInicio();
    mostrarLogin('Se cerró tu sesión porque tu usuario ya no está activo en este panel. Vuelve a entrar o habla con el dueño.');
  }

  function cerrarVentanas() {
    if (cerrarConfirmacion) cerrarConfirmacion(false);
    cerrarClave(false);
    if (root.Comprobante && root.Comprobante.cerrar) root.Comprobante.cerrar();
  }

  function mensaje(id, clase, texto) {
    const m = $(id);
    m.className = clase ? 'mensaje ' + clase : 'mensaje';
    // Se vacía antes para que el lector de pantalla lo anuncie aunque el texto se repita.
    m.textContent = '';
    clearTimeout(m._t);
    if (texto) m._t = setTimeout(() => { m.textContent = texto; }, 30);
  }

  function enfocarLogin() {
    // En el celular no se abre el teclado solo: tapaba la ayuda y los accesos de la demo.
    const tactil = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;
    if (!tactil) $(($('login-usuario').value ? 'login-clave' : 'login-usuario')).focus();
  }

  function mostrarLogin(aviso) {
    desmontar();
    cerrarVentanas();
    actual = null;
    rolMostrado = null;
    $('pantalla').innerHTML = '';
    $('app').hidden = true;
    $('login').hidden = false;
    $('login-clave').value = '';
    mensaje('login-error', '', '');
    mensaje('login-aviso', aviso ? 'aviso' : '', aviso || '');
    enfocarLogin();
  }

  function mostrarApp() {
    $('login').hidden = true;
    $('app').hidden = false;
    // Respaldo automático del día (se guarda una sola vez por día en este navegador).
    try { Store.respaldoDiario(); } catch (e) { /* sin espacio: la demo sigue */ }
    const f = new Date(Store.hoy() + 'T00:00:00');
    $('fecha-hoy').textContent = f.toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long' });
    rolMostrado = null;
    pintar();
  }

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // Devuelve lo que respondió Store.iniciarSesion ({ ok, motivo, … }); el tutorial lo usa para explicar un fallo.
  // `opciones.enfocar === false`: si falla, no mueve el foco (en el celular abriría el teclado).
  function entrar(usuario, clave, opciones) {
    const enfocar = !(opciones && opciones.enfocar === false);
    const u = String(usuario || '').trim();
    if (!u || !clave) {
      mensaje('login-error', 'error', 'Escribe tu usuario y tu contraseña.');
      if (enfocar) $(u ? 'login-clave' : 'login-usuario').focus();
      return { ok: false, motivo: 'vacio' };
    }
    const r = Store.iniciarSesion(u, clave);
    if (r.ok) {
      guardarSesion(r.usuario.id);
      $('login-clave').value = '';
      mensaje('login-error', '', '');
      mensaje('login-aviso', '', '');
      mostrarApp();
      return r;
    }
    // Nunca se dice si el usuario existe: el mismo mensaje para usuario o contraseña equivocados.
    let texto;
    if (r.motivo === 'bloqueado') {
      texto = `Demasiados intentos fallidos. Por seguridad, el acceso queda bloqueado ${plural(r.minutos, 'minuto', 'minutos')}.`;
    } else if (r.motivo === 'inactivo') {
      texto = 'Este usuario está desactivado. Habla con el dueño.';
    } else {
      texto = 'Usuario o contraseña incorrectos.';
      if (r.restantes <= 2) {
        texto += ` Te ${r.restantes === 1 ? 'queda 1 intento' : `quedan ${r.restantes} intentos`} antes de bloquear el acceso por ${plural(Store.BLOQUEO_MIN, 'minuto', 'minutos')}.`;
      }
    }
    mensaje('login-error', 'error', texto);
    $('login-clave').value = '';
    if (enfocar) $('login-clave').focus();
    return r;
  }

  function salir() {
    Store.cerrarSesion();
    guardarSesion(null);
    direccionInicio();
    mostrarLogin();
  }

  /* ---------- Cambiar la propia contraseña ---------- */
  let abrioClave = null;
  function abrirClave() {
    const u = Store.usuario();
    if (!u) { sesionPerdida(); return; }
    abrioClave = document.activeElement;
    $('clave-form').reset();
    mensaje('clave-msg', '', '');
    $('clave-usuario').value = u.usuario;
    $('clave-quien').textContent = `${u.nombre}${u.nombre === u.nombreRol ? '' : ' · ' + u.nombreRol} (usuario «${u.usuario}»)`;
    $('dlg-clave').hidden = false;
    $('clave-actual').focus();
  }

  function cerrarClave(devolverFoco) {
    const dlg = $('dlg-clave');
    if (dlg.hidden) return;
    dlg.hidden = true;
    $('clave-form').reset();
    if (devolverFoco !== false && abrioClave && abrioClave.isConnected && abrioClave.focus) abrioClave.focus();
    abrioClave = null;
  }

  const MSG_CLAVE = {
    'clave-actual-incorrecta': ['clave-actual', 'La contraseña actual no es correcta.'],
    'clave-corta': ['clave-nueva', 'La contraseña nueva debe tener al menos 6 caracteres.'],
  };

  function guardarClave(e) {
    e.preventDefault();
    const actualTxt = $('clave-actual').value;
    const nueva = $('clave-nueva').value;
    const repetir = $('clave-repetir').value;
    const fallo = (campo, texto) => { mensaje('clave-msg', 'error', texto); $(campo).focus(); };
    if (!actualTxt) return fallo('clave-actual', 'Escribe tu contraseña actual.');
    if (nueva.length < 6) return fallo('clave-nueva', MSG_CLAVE['clave-corta'][1]);
    if (nueva !== repetir) return fallo('clave-repetir', 'Las dos contraseñas nuevas no coinciden. Escríbelas de nuevo.');
    if (nueva === actualTxt) return fallo('clave-nueva', 'La contraseña nueva es igual a la actual.');
    const u = Store.usuario();
    if (!u) { cerrarClave(false); sesionPerdida(); return; }
    try {
      Store.cambiarClave(u.id, { actual: actualTxt, nueva });
      cerrarClave();
      toast('Contraseña cambiada. Úsala la próxima vez que entres.');
    } catch (err) {
      const m = MSG_CLAVE[err.message];
      if (m) fallo(m[0], m[1]); else fallo('clave-actual', 'No se pudo cambiar la contraseña. Inténtalo de nuevo.');
    }
  }

  function arrancar() {
    const estado = Store.init();
    if (estado.modo === 'memoria' || estado.reiniciado) {
      if (estado.reiniciado) $('aviso-memoria').textContent = 'Los datos guardados en este navegador estaban dañados y se cargaron los datos de ejemplo.';
      $('aviso-memoria').style.display = 'block';
    }

    window.addEventListener('hashchange', () => { if (!$('app').hidden) pintar(); });
    window.addEventListener('resize', () => { if (!$('app').hidden) posicionarIndicadores(); });
    // Otra pestaña cambió los datos (p. ej. desactivó este usuario o le cambió el rol).
    window.addEventListener('storage', (e) => { if ((e.key === null || e.key === 'sag:db') && !$('app').hidden) refrescarSesion(); });
    if (root.Graficos) root.Graficos.activarTips();

    $('btn-salir').addEventListener('click', salir);
    $('btn-salir-movil').addEventListener('click', salir);
    $('btn-clave').addEventListener('click', abrirClave);
    $('btn-clave-movil').addEventListener('click', abrirClave);
    $('clave-form').addEventListener('submit', guardarClave);
    $('clave-cancelar').addEventListener('click', () => cerrarClave());
    $('dlg-clave').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarClave(); } else atraparFoco($('dlg-clave'), e);
    });

    $('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      entrar($('login-usuario').value, $('login-clave').value);
    });
    document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
      const [usuario, clave] = DEMO[b.dataset.demo];
      $('login-usuario').value = usuario;
      $('login-clave').value = clave;
      entrar(usuario, clave);
    }));

    const guardada = leerSesion();
    if (guardada && Store.actuarComo(guardada)) mostrarApp();
    else {
      guardarSesion(null);
      mostrarLogin(guardada ? 'Tu sesión anterior se cerró porque ese usuario ya no está activo. Vuelve a entrar.' : '');
    }
  }

  // Enlace de WhatsApp con el recordatorio ya escrito para un socio (se envía con un clic desde el teléfono).
  function enlaceRecordatorio(socio) {
    const plan = Store.planes().find((p) => p.id === socio.planId);
    let cuando;
    if (!socio.vence) cuando = 'todavía no está activado';
    else {
      const d = Util.diasEntre(Store.hoy(), socio.vence);
      cuando = d < 0 ? `venció hace ${-d} día${d === -1 ? '' : 's'}`
        : d === 0 ? 'vence hoy'
        : d === 1 ? 'vence mañana'
        : `vence en ${d} días`;
    }
    const texto = Util.plantilla(Store.getAjustes().recordatorio, {
      nombre: String(socio.nombre).split(/\s+/)[0], plan: plan ? plan.nombre : '', cuando,
    });
    return Util.enlaceWhatsApp(socio.telefono, texto);
  }

  const Admin = {
    params: {}, registrar, ir, toast, confirmar, arrancar, enlaceRecordatorio,
    refrescar: pintar,
    refrescarSesion,
    // Para el tutorial: entra con usuario y contraseña (devuelve el resultado) o cierra la sesión abierta.
    entrar,
    salir: () => { if (!$('app').hidden) salir(); },
    pantallaActual() { return actual; },
    // Permisos del usuario con la sesión abierta, para que cada pantalla muestre solo lo que corresponde.
    puede(permiso) { return Store.puede(permiso); },
    usuario() { return Store.usuario(); },
  };
  root.Admin = Admin;
})(window);
