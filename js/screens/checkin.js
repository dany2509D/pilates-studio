(function () {
  const esc = Util.escapeHtml;
  const G = window.Graficos;
  const icono = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l4 4-4 4M14 12H3"/></svg>';
  const iconoQR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><rect x="8" y="8" width="3" height="3" rx=".4"/><rect x="13" y="8" width="3" height="3" rx=".4"/><rect x="8" y="13" width="3" height="3" rx=".4"/><path d="M13 13h3v3h-3z" fill="currentColor" stroke="none"/></svg>';
  const TEXTO_BOTON = 'Leer QR del socio';
  const ESPERA_CODIGO_MS = 300; // lector USB sin Enter: si el código quedó completo y no llega nada más, se registra
  const ESPERA_LISTA_MS = 120;  // la lista se repinta al dejar de teclear (un lector termina antes: no parpadea)
  const MISMO_MS = 4000;        // un lector de mostrador vuelve a "teclear" el código si se queda frente a él
  const LISTA_MAX = 8;          // entradas de hoy que se muestran (las más recientes)
  const VISITANTE = 'Visitante con pase diario';

  // Con mouse o trackpad (laptop) el campo se enfoca solo, listo para teclear o para un lector USB.
  // En celular y tablet no: el teclado en pantalla taparía la cámara (un lector Bluetooth funciona igual).
  const punteroFino = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);

  // Parece un código a medio escribir: "sag 0000…" (QR de «Mi plan») o "sagp 2611…" (pase diario). También con
  // O tecleada por 0 ("SAGOOOO"), pero solo si siguen al menos dos ceros u O: así un apellido como "Sagot" o
  // "Sagolla" no se confunde con un código.
  const pareceCodigo = (t) => {
    const s = String(t).trim();
    return /^sag[\s-]*\d[\d\s-]*[0-9a-z]{0,4}$/i.test(s)
      || /^sag[\s-]*[0o][\s-]*[0o][\doil\s-]*[0-9a-z]{0,4}$/i.test(s)
      || /^sagp[\s-]*\d[\d\s-]*[0-9a-z]{0,6}$/i.test(s);
  };
  const esPase = (t) => /^sagp/i.test(String(t).trim());

  function esCampo(t) { return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }

  // Hay una ventana abierta encima (confirmación, cambiar contraseña, comprobante): el lector no registra.
  function hayDialogo() {
    return Array.from(document.querySelectorAll('[aria-modal="true"]')).some((d) => d.getClientRects().length > 0);
  }

  // Quién es, para no contarlo dos veces: el socio y si su código vale ahora, o el pase. El QR de «Mi plan»
  // cambia cada 15 s, así que el mismo socio quieto frente a la cámara en el cambio da dos códigos distintos.
  // El estado va en la clave: si primero mostró una captura (código vencido) y enseguida el QR en vivo, cuenta.
  // Al revés no: si su código se acaba de leer vigente (`anterior`: la lectura de hace menos de 4 s, o el QR que
  // sigue a la vista de la cámara) y ahora sale vencido, es su celular con la hora desfasada justo en el cambio de
  // código: sigue siendo la misma lectura.
  function claveDe(r, texto, anterior) {
    if (r.tipo === 'pase') return 'pase:' + r.codigo;
    if (r.tipo === 'socio') {
      const persona = 'socio:' + Number(r.codigo.slice(3, 9));
      return r.estado === 'viejo' && anterior === persona + ':ok' ? anterior : persona + ':' + r.estado;
    }
    return 'otro:' + String(texto).trim();
  }

  // Cuándo se usó un pase: «hoy a las 12:37» o «el 07/11/2026 a las 12:37». (Un pase solo entra el día para el
  // que se pagó, así que su fecha es la del día en que se usó.)
  function cuandoSeUso(u) {
    const dia = !u.fecha || u.fecha === Store.hoy() ? 'hoy' : 'el ' + Util.fechaCorta(u.fecha);
    return u.hora ? `${dia} a las ${u.hora}` : dia;
  }

  // Estado del plan al registrar la entrada (la propuesta: «al día, vencido o sin pagar»). `corto`, para la cámara.
  function estadoPlan(socio, corto) {
    const est = Store.estadoSocio(socio);
    if (est === 'activo') return corto ? 'plan al día' : 'Plan al día · vence el ' + Util.fechaCorta(socio.vence);
    if (est === 'por-vencer') {
      const d = Util.diasEntre(Store.hoy(), socio.vence);
      const cuando = d <= 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`;
      return corto ? cuando : 'Plan al día · ' + cuando;
    }
    return '';
  }

  function render(el) {
    let q = '';
    let ultimo = null;   // resultado del último check-in, o del último código que no sirvió
    let escaner = null;  // cámara abierta (Escaner.abrir)
    let tCodigo = null;
    let tLista = null;
    let bufer = '';      // teclas de un lector USB cuando el foco no está en el campo
    let tBufer = null;
    let ultimaLectura = { clave: '', ms: 0, resultado: null }; // relecturas de la misma persona (cámara o lector)
    let registradoMs = 0; // cuándo el búfer registró un código que llegó sin Enter

    // El campo de búsqueda se dibuja una sola vez; al escribir solo se repinta la lista de resultados.
    // Los resultados van justo debajo del campo (también con la cámara abierta) y el mensaje, debajo de la cámara.
    el.innerHTML = `
      <section class="panel formulario">
        <h2>Registrar entrada</h2>
        <div class="checkin-cuenta"><strong id="k-num">0</strong><span>entradas hoy</span></div>
        <div class="k-fila-buscar">
          <input type="search" id="k-buscar" placeholder="Nombre, cédula o código" aria-label="Buscar socio por nombre, cédula o código del QR" autocomplete="off" autocapitalize="off" spellcheck="false">
          <button type="button" class="btn btn-amarillo k-camara" id="k-camara" aria-controls="k-escaner" aria-expanded="false">${iconoQR}<span>${TEXTO_BOTON}</span></button>
        </div>
        <p class="k-ayuda">El QR de «Mi plan» cambia cada 15 segundos: una captura de pantalla no sirve. También lee el pase diario. ¿Lector USB o Bluetooth? Lee el QR con esta pantalla abierta: la entrada se registra sola.</p>
        <div id="k-aviso-camara" class="mensaje" role="alert"></div>
        <div id="k-res"></div>
        <div id="k-escaner" class="escaner" hidden></div>
        <div id="k-msg" role="status" aria-live="polite"></div>
      </section>
      <section class="panel k-hoy" aria-labelledby="k-hoy-titulo">
        <h2 id="k-hoy-titulo">Entradas de hoy</h2>
        <div id="k-lista"></div>
      </section>`;
    const buscar = el.querySelector('#k-buscar');
    const btnCamara = el.querySelector('#k-camara');
    const zona = el.querySelector('#k-escaner');
    const avisoCamara = el.querySelector('#k-aviso-camara');
    if (!window.Escaner) btnCamara.hidden = true;

    function mensaje() {
      if (!ultimo) return '';
      const caja = (clase, ico, t) => `<div class="mensaje grande ${clase}"><div class="msg-ico">${ico}</div><div class="msg-txt">${t}</div></div>`;
      const error = (t) => caja('error', G.alerta, t);
      const nota = (t) => ` <small class="msg-nota">${t}</small>`;
      const cobrar = (id, texto) => (id ? ` <a href="#cobros?socio=${id}">${texto}</a>` : '');
      const u = ultimo;
      switch (u.error) {
        case 'no-es-carnet':
          return error('Ese QR no es un carnet de ' + Tema.nombre() + ': no es el QR de «Mi plan» ni un pase diario.');
        case 'incompleto':
          return caja('aviso', G.alerta, u.pase
            ? `El pase <strong>${esc(u.codigo)}</strong> está incompleto: son SAGP y 18 letras o números.`
            : `El código <strong>${esc(u.codigo)}</strong> está incompleto: son SAG, 6 números y 4 letras o números.`);
        case 'desconocido':
          return error(`El código <strong>${esc(u.codigo)}</strong> no corresponde a ningún socio de este panel. Búscalo por nombre o cédula.${nota('En la demo cada equipo guarda sus propios datos: un socio inscrito en otro equipo no aparece aquí.')}`);
        case 'viejo':
          return error(`<strong>Código vencido (de hace ${u.minutos} min).</strong> Pide a <strong>${esc(u.nombre)}</strong> que abra «Mi plan» y muestre el QR en vivo: una captura de pantalla no sirve. Si es el suyo, revisa la hora de su celular.`);
        case 'pase-usado':
          return error(`Este pase diario ya se usó <strong>${esc(cuandoSeUso(u))}</strong>.${nota('Cada pase vale para una sola entrada.')}`);
        case 'pase-otro-dia':
          return error(`Este pase era para el ${Util.fechaCorta(u.fecha)}.${cobrar(u.socioId, 'Cobrar el pase de hoy')}${nota('Cada pase vale solo el día para el que se pagó.')}`);
        case 'pase-futuro':
          return error(`Este pase es para el ${Util.fechaCorta(u.fecha)}.${nota('Todavía no vale: sirve solo ese día.')}`);
        case 'pase-invalido':
          return error(`Pase no válido: el código está alterado.${nota('Búscalo por nombre o cédula, o cobra un pase nuevo en Cobros.')}`);
        default:
      }
      const s = u.socioId != null ? Store.get('socios', u.socioId) : null;
      const nombre = s ? esc(s.nombre) : u.nombre ? esc(u.nombre) : 'El socio';
      if (u.repetido) {
        const pago = u.aviso ? ` Recuerda que su plan está <strong>${u.aviso === 'vencido' ? 'vencido' : 'sin pagar'}</strong>.${cobrar(u.socioId, 'Cobrar ahora')}` : '';
        return caja(u.aviso ? 'error' : 'aviso', G.alerta, `<strong>${nombre}</strong> ya registró su entrada hoy.${pago}${u.pase ? nota('Su pase diario no se gastó: sigue sin usar.') : ''}`);
      }
      if (u.pase) {
        return caja('ok', G.check, `¡Pase diario: entrada registrada! <br><strong>${nombre}</strong>${nota('El pase ya quedó usado: no sirve para otra entrada.')}`);
      }
      if (u.aviso === 'vencido') return error(`Entrada de <strong>${nombre}</strong> registrada, pero su plan está <strong>vencido</strong>.${cobrar(u.socioId, 'Cobrar ahora')}`);
      if (u.aviso === 'pendiente') return error(`Entrada de <strong>${nombre}</strong> registrada, pero <strong>aún no ha pagado</strong>.${cobrar(u.socioId, 'Activar plan')}`);
      return caja('ok', G.check, `¡Entrada de <strong>${nombre}</strong> registrada!${s && estadoPlan(s) ? nota(esc(estadoPlan(s))) : ''}`);
    }

    // Entradas de hoy, la última registrada arriba (por orden de registro: así la que se acaba de registrar
    // siempre queda primera). Los visitantes con pase diario traen su propio nombre.
    function pintarLista(entradas) {
      const socios = new Map(Store.list('socios').map((s) => [s.id, s]));
      const nombreDe = (a) => (a.socioId == null ? a.nombre || VISITANTE : (socios.get(a.socioId) || {}).nombre || 'Socio dado de baja');
      const ultimas = entradas.slice().sort((a, b) => b.id - a.id).slice(0, LISTA_MAX);
      el.querySelector('#k-lista').innerHTML = ultimas.length
        ? ultimas.map((a) => {
          const n = nombreDe(a);
          const detalle = [a.pase ? 'Pase diario' : '', a.por ? 'registró ' + a.por : ''].filter(Boolean).join(' · ').replace(/^r/, 'R');
          return `<div class="fila k-entrada">${G.avatar(n)}<div class="quien"><strong>${esc(n)}</strong>${detalle ? `<small>${esc(detalle)}</small>` : ''}</div><span class="hora-chip">${esc(a.hora)}</span></div>`;
        }).join('') + (entradas.length > LISTA_MAX ? `<p class="vacio k-mas">Se muestran las ${LISTA_MAX} más recientes de ${entradas.length}.</p>` : '')
        : G.vacio('pesas', 'Todavía no hay entradas registradas hoy.');
    }

    function pintar() {
      clearTimeout(tLista);
      const hoy = Store.hoy();
      const entradasHoy = Store.list('asistencias').filter((a) => a.fecha === hoy);
      const qq = Util.plano(q);
      const planes = Store.planes();
      const nombrePlan = (id) => (planes.find((p) => p.id === id) || {}).nombre || '';
      const coincidencias = qq
        ? Store.list('socios').filter((s) => Util.plano(s.nombre).includes(qq) || Util.plano(s.cedula).includes(qq)).slice(0, 6)
        : [];

      el.querySelector('#k-msg').innerHTML = mensaje();
      el.querySelector('#k-num').textContent = entradasHoy.length;
      pintarLista(entradasHoy);
      const res = el.querySelector('#k-res');
      let vacio = '';
      if (qq && !coincidencias.length) {
        vacio = pareceCodigo(q)
          ? '<p class="vacio k-codigo">QR de «Mi plan»: SAG, 6 números y 4 letras o números (cambian cada 15 segundos). Pase diario: SAGP y 18 letras o números. La entrada se registra sola al completarlo.</p>'
          : G.vacio('socios', 'No se encontró ningún socio.');
      }
      res.innerHTML = coincidencias.map((s) => {
        const estado = Store.estadoSocio(s);
        return `
          <div class="fila grande">
            ${G.avatar(s.nombre, 'grande')}
            <div class="quien"><strong>${esc(s.nombre)}</strong><small>${esc(s.cedula)} · ${esc(nombrePlan(s.planId))}${s.vence ? ' · vence ' + Util.fechaCorta(s.vence) : ''}</small></div>
            <div style="display:flex;gap:10px;align-items:center">
              <span class="insignia ${estado}">${Util.etiquetaEstado(estado)}</span>
              <button class="btn btn-rojo btn-chico" data-entrada="${s.id}">Entrada</button>
            </div>
          </div>`;
      }).join('') + vacio;

      res.querySelectorAll('[data-entrada]').forEach((b) => b.addEventListener('click', () => {
        const id = Number(b.dataset.entrada);
        const r = Store.checkIn(id);
        ultimo = { socioId: id, aviso: r.aviso, repetido: r.repetido };
        q = '';
        buscar.value = '';
        pintar();
        // Con la cámara abierta el mensaje queda debajo de ella: se trae a la vista. Sin cámara, de vuelta al campo.
        if (escaner) el.querySelector('#k-msg').scrollIntoView({ block: 'nearest' });
        else buscar.focus();
      }));
    }

    // Lo que muestra la cámara encima de la imagen tras leer un código.
    function resumen() {
      const u = ultimo;
      const error = (titulo, detalle) => ({ tipo: 'error', titulo, detalle });
      switch (u.error) {
        case 'no-es-carnet': return error('QR no reconocido', 'No es de ' + Tema.nombre() + '.');
        case 'desconocido': return error('Código no encontrado', 'No es de ningún socio de este panel.');
        case 'viejo': return error(u.nombre, `Código vencido (de hace ${u.minutos} min) · pide el QR en vivo`);
        case 'pase-usado': return error('Pase ya usado', 'Se usó ' + cuandoSeUso(u));
        case 'pase-otro-dia': return error('Pase de otro día', 'Era para el ' + Util.fechaCorta(u.fecha));
        case 'pase-futuro': return error('Pase de otro día', 'Es para el ' + Util.fechaCorta(u.fecha));
        case 'pase-invalido': return error('Pase no válido', 'El código está alterado');
        default:
      }
      const s = u.socioId != null ? Store.get('socios', u.socioId) : null;
      const nombre = s ? s.nombre : u.nombre || 'Socio';
      const plan = u.aviso === 'vencido' ? 'plan vencido' : u.aviso === 'pendiente' ? 'aún no ha pagado' : '';
      if (u.repetido) return { tipo: u.aviso ? 'error' : 'aviso', titulo: nombre, detalle: 'Ya entró hoy' + (plan ? ' · ' + plan : '') };
      if (u.pase) return { tipo: 'ok', titulo: nombre, detalle: 'Pase diario: entrada registrada' };
      if (u.aviso) return error(nombre, 'Entrada registrada · ' + plan);
      return { tipo: 'ok', titulo: nombre, detalle: '¡Entrada registrada!' + (s && estadoPlan(s, true) ? ' · ' + estadoPlan(s, true) : '') };
    }

    // Registra (si se puede) lo que dice un código ya revisado con Store.analizarCodigo y deja el resultado en `ultimo`.
    function registrar(r, texto) {
      if (r.estado === 'no-es-codigo') return { error: 'no-es-carnet' };
      if (r.tipo === 'socio') {
        if (r.estado === 'viejo') return { error: 'viejo', socioId: r.socio.id, nombre: r.socio.nombre, minutos: r.minutos };
        if (r.estado !== 'ok') return { error: 'desconocido', codigo: r.codigo };
        try {
          const c = Store.checkIn(r.socio.id);
          return { socioId: r.socio.id, aviso: c.aviso, repetido: c.repetido, registro: !c.repetido };
        } catch (e) {
          return { error: 'desconocido', codigo: r.codigo }; // dado de baja en otra pestaña
        }
      }
      const p = r.estado === 'ok' ? Store.usarPase(texto) : r;
      const socioId = p.socio ? p.socio.id : null;
      if (p.estado === 'ok') {
        const nombre = socioId == null ? (p.asistencia && p.asistencia.nombre) || VISITANTE : p.socio.nombre;
        return { pase: true, socioId, nombre, repetido: !!p.repetido, registro: !p.repetido };
      }
      if (p.estado === 'usado') return { error: 'pase-usado', hora: p.pase && p.pase.usadoEn, fecha: p.fecha };
      if (p.estado === 'otro-dia' || p.estado === 'futuro') return { error: 'pase-' + p.estado, fecha: p.fecha, socioId };
      return { error: 'pase-invalido' };
    }

    // Un código leído por la cámara ('camara') o tecleado por un lector USB/Bluetooth ('teclado').
    function procesar(texto, via) {
      clearTimeout(tCodigo);
      clearTimeout(tLista);
      const r = Store.analizarCodigo(texto);
      const ahora = Date.now();
      const reciente = ahora - ultimaLectura.ms < MISMO_MS;
      const clave = claveDe(r, texto, reciente ? ultimaLectura.clave : '');
      // Un lector de mostrador vuelve a mandar el código si el socio deja el celular frente a él, y la cámara ve
      // dos códigos del mismo socio si su QR cambia mientras lo muestra: esa relectura no cuenta y queda el
      // resultado anterior (sin pitido nuevo en la cámara).
      if (r.estado !== 'no-es-codigo' && reciente && clave === ultimaLectura.clave) {
        ultimaLectura.ms = ahora;
        ultimo = ultimaLectura.resultado;
        if (via === 'teclado') { q = ''; buscar.value = ''; }
        pintar();
        return null;
      }
      ultimo = registrar(r, texto);
      ultimaLectura = { clave, ms: ahora, resultado: ultimo };
      if (ultimo.registro || ultimo.repetido || via === 'teclado') { q = ''; buscar.value = ''; }
      pintar();
      return resumen();
    }

    /* ---------- Cámara ---------- */
    function aviso(texto, tipo) {
      avisoCamara.className = texto ? 'mensaje ' + (tipo || 'error') : 'mensaje';
      avisoCamara.textContent = texto || '';
    }

    function pintarBoton() {
      const activa = !!escaner;
      btnCamara.classList.toggle('activa', activa);
      btnCamara.setAttribute('aria-expanded', String(activa));
      btnCamara.querySelector('span').textContent = activa ? 'Cerrar cámara' : TEXTO_BOTON;
      document.body.classList.toggle('k-camara-abierta', activa); // esconde el botón flotante del tutorial
    }

    function abrirCamara() {
      const d = Escaner.disponibilidad();
      if (!d.ok) { aviso(Escaner.mensaje(d.motivo)); return; }
      aviso('');
      if (document.activeElement === buscar) buscar.blur(); // en celular baja el teclado en pantalla
      zona.hidden = false;
      escaner = Escaner.abrir({
        contenedor: zona,
        alLeer: (texto) => procesar(texto, 'camara'),
        // La cámara reconoce a la misma persona aunque su QR cambie mientras sigue a la vista.
        clave: (texto, anterior) => claveDe(Store.analizarCodigo(texto), texto, anterior),
        alError: (motivo) => {
          escaner = null;
          zona.hidden = true;
          pintarBoton();
          aviso(Escaner.mensaje(motivo), motivo === 'pausa' ? 'aviso' : 'error');
        },
      });
      pintarBoton();
      // La cámara sube al tope de la pantalla: así se ven la imagen, el resultado y el mensaje sin desplazarse
      // (en una laptop de 768 px de alto quedaban por debajo del borde).
      if (zona.scrollIntoView) {
        const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        zona.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
      }
    }

    function cerrarCamara() {
      if (escaner) { escaner.cerrar(); escaner = null; }
      zona.hidden = true;
      pintarBoton();
    }

    btnCamara.addEventListener('click', () => { if (escaner) cerrarCamara(); else abrirCamara(); });

    /* ---------- Lector USB / Bluetooth (se comporta como un teclado) ---------- */
    // En el campo: casi todos terminan con Enter; algunos con Tab o sin nada. Se usa el código con que
    // TERMINA el campo, por si había algo escrito antes (una búsqueda que quedó, una lectura que no servía).
    buscar.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== 'Tab') return;
      // Enter o Tab tardío de una lectura que ya se registró sola (el campo quedó vacío): que no saque el foco.
      if (!buscar.value && Date.now() - registradoMs < 1000) { e.preventDefault(); return; }
      const c = Util.codigoAlFinal(buscar.value);
      if (c) {
        e.preventDefault();
        procesar(c.codigo, 'teclado');
      } else if (e.key === 'Enter' && pareceCodigo(buscar.value)) {
        e.preventDefault();
        ultimo = { error: 'incompleto', codigo: buscar.value.replace(/\s+/g, '').toUpperCase(), pase: esPase(buscar.value) };
        pintar();
      }
    });
    buscar.addEventListener('input', () => {
      q = buscar.value;
      ultimo = null;
      clearTimeout(tCodigo);
      clearTimeout(tLista);
      if (!q) { pintar(); return; }
      if (Util.codigoAlFinal(q)) {
        // Código completo (lector sin Enter): no se repinta la lista; procesar() repinta al registrarlo.
        tCodigo = setTimeout(() => {
          const c = Util.codigoAlFinal(buscar.value);
          if (c) { registradoMs = Date.now(); procesar(c.codigo, 'teclado'); } else pintar();
        }, ESPERA_CODIGO_MS);
      } else {
        tLista = setTimeout(pintar, ESPERA_LISTA_MS);
      }
    });

    // Fuera del campo (p. ej. después de tocar un botón, o en tablet sin el campo enfocado): las teclas se juntan aquí.
    // Lo que termina una lectura (Enter, Tab, espacio) no debe "tocar" el botón o enlace que tenga el foco.
    function teclaGlobal(e) {
      if (e.target === buscar || esCampo(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (hayDialogo()) return;
      if (e.key === 'Enter' || e.key === 'Tab') {
        const b = bufer;
        bufer = '';
        clearTimeout(tBufer);
        if (b) {
          e.preventDefault();
          const c = Util.codigoAlFinal(b);
          if (c) procesar(c.codigo, 'teclado');
          else if (b.trim().length >= 4) procesar(b, 'teclado'); // QR ajeno: «no es un carnet»
        } else if (Date.now() - registradoMs < 1000) {
          e.preventDefault(); // Enter tardío de una lectura que ya se registró sola
        }
        return;
      }
      if (e.key && e.key.length === 1) {
        if (e.key === ' ') {
          if (!bufer) return; // un espacio suelto es del teclado (bajar la página), no de un lector
          e.preventDefault(); // dentro de una lectura: que no active el botón enfocado
        }
        bufer = (bufer + e.key).slice(-64);
        clearTimeout(tBufer);
        tBufer = setTimeout(() => {
          const b = bufer;
          bufer = '';
          const c = Util.codigoAlFinal(b);
          if (c) { registradoMs = Date.now(); procesar(c.codigo, 'teclado'); }
        }, ESPERA_CODIGO_MS);
      }
    }
    document.addEventListener('keydown', teclaGlobal, true);

    pintar();
    if (punteroFino) buscar.focus();

    // Al salir de la pantalla (o cerrar sesión): apaga la cámara y suelta el teclado.
    return () => {
      cerrarCamara();
      clearTimeout(tCodigo);
      clearTimeout(tLista);
      clearTimeout(tBufer);
      document.removeEventListener('keydown', teclaGlobal, true);
    };
  }

  Admin.registrar('checkin', { titulo: 'Check-in', etiqueta: 'Entrada', icono, render });
})();
