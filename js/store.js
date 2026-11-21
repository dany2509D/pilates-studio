(function (root) {
  const U = root.Util || require('./util.js');
  const Seed = root.Seed || require('./seed.js');

  const CLAVE = 'sag:db';
  const COLECCIONES = ['socios', 'pagos', 'asistencias', 'productos', 'ventas', 'solicitudes', 'usuarios', 'acciones', 'pases', 'derechos'];
  // Estas solo se cambian con sus funciones propias (con permisos y registro), nunca con create/update/remove.
  const PROTEGIDAS = ['usuarios', 'acciones', 'pases', 'derechos'];

  // ---- Usuarios y roles ----
  // Recepción: Check-in, cobros, confirmación de pagos Yappy, registro y edición de socios, y cafetería.
  // Dueño: todo, además reportes de ingresos, ajustes, bajas de socios, usuarios, registro y datos.
  const ROLES = {
    dueno: { nombre: 'Dueño', permisos: ['*'] },
    recepcion: { nombre: 'Recepción', permisos: ['ver:inicio', 'ver:socios', 'ver:cobros', 'ver:checkin', 'ver:cafeteria'] },
  };
  const INTENTOS_MAX = 5;
  const BLOQUEO_MIN = 5;
  const MAX_ACCIONES = 3000;
  const TIPOS_DERECHO = ['acceso', 'correccion', 'borrado'];
  const PREFIJO_RESPALDO = 'sag:respaldo:';
  const INDICE_RESPALDOS = 'sag:respaldos';
  const MAX_RESPALDOS = 7;
  // Ventana de validez del QR que cambia (en pasos de 15 s): 90 s hacia atrás y 30 s hacia adelante,
  // por si el reloj del celular y el de recepción no coinciden del todo.
  const VENTANA_ATRAS = 6;
  const VENTANA_ADELANTE = 2;
  const VENTANA_VIEJA = 240; // 1 hora: para avisar "código viejo" en vez de "desconocido"

  const OBJETIVOS = [
    ['bajar-peso', 'Bajar de peso'], ['masa', 'Ganar masa'], ['salud', 'Salud'],
    ['rendimiento', 'Rendimiento'], ['otro', 'Otro'],
  ];
  const TIPOS_NOTA = ['nota', 'whatsapp', 'llamada'];
  const SEGMENTOS = [
    { id: 'ausente', nombre: 'Sin venir hace 15+ días' },
    { id: 'cumple', nombre: 'Cumple años este mes' },
    { id: 'vence7', nombre: 'Vence en 7 días' },
    { id: 'nunca', nombre: 'Nunca ha asistido' },
  ];
  const MAX_ETIQUETAS = 8;

  let backend = null;
  let modo = 'memoria';
  let hoyFijo = null;
  let db = null;
  let actorId = null; // usuario del panel con la sesión abierta (null en la web y en "Mi plan")
  let silencio = false; // durante una importación no se anota cada socio por separado

  function pad(n) { return String(n).padStart(2, '0'); }

  function hoy() {
    if (hoyFijo) return hoyFijo;
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function hora() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let ultimoGuardado = null;

  function guardar() {
    if (!backend) return;
    try {
      ultimoGuardado = JSON.stringify(db);
      backend.setItem(CLAVE, ultimoGuardado);
    } catch (e) {
      modo = 'memoria';
    }
  }

  // Otra pestaña (la web o el panel) puede haber cambiado los datos: se relee antes de cada operación.
  function sincronizar() {
    if (!backend || modo !== 'local') return;
    try {
      const crudo = backend.getItem(CLAVE);
      if (crudo && crudo !== ultimoGuardado) {
        const parsed = JSON.parse(crudo);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.socios)) {
          db = migrar(parsed);
          ultimoGuardado = crudo;
        }
      }
    } catch (e) { /* se queda con los datos que ya tiene */ }
  }

  function backendLocal() {
    try {
      const ls = root.localStorage;
      const k = 'sag:test';
      ls.setItem(k, '1');
      ls.removeItem(k);
      return ls;
    } catch (e) {
      return null;
    }
  }

  // Campos de la ficha ampliada: los socios guardados antes de existir reciben valores vacíos.
  function completarSocio(s) {
    ['correo', 'nacimiento', 'emergenciaNombre', 'emergenciaTelefono', 'objetivo'].forEach((k) => {
      if (typeof s[k] !== 'string') s[k] = '';
    });
    if (!Array.isArray(s.etiquetas)) s.etiquetas = [];
    if (!Array.isArray(s.notas)) s.notas = [];
    return s;
  }

  // Completa lo que le falte a datos guardados por una versión anterior, sin tocar lo que ya existe.
  function migrar(datos) {
    for (const col of COLECCIONES) if (!Array.isArray(datos[col])) datos[col] = [];
    datos.socios.forEach(completarSocio);
    // Datos de antes de los usuarios por rol: se crean los de la demo.
    if (!datos.usuarios.length) datos.usuarios = Seed.usuariosDemo();
    const porDefecto = Seed.generar(hoy()).ajustes;
    datos.ajustes = datos.ajustes || {};
    for (const k of Object.keys(porDefecto)) {
      if (datos.ajustes[k] === undefined) datos.ajustes[k] = porDefecto[k];
    }
    datos.ajustes.ejemplo = Object.assign({}, porDefecto.ejemplo, datos.ajustes.ejemplo);
    // Lo que sigue marcado como "ejemplo" nunca fue editado por el dueño: se actualiza con los datos de fábrica.
    for (const k of ['direccion', 'horarios', 'yappy']) {
      if (datos.ajustes.ejemplo[k] === true) {
        datos.ajustes[k] = porDefecto[k];
        datos.ajustes.ejemplo[k] = porDefecto.ejemplo[k];
      }
    }
    return datos;
  }

  function init(b) {
    backend = b === undefined ? backendLocal() : b;
    modo = backend ? 'local' : 'memoria';
    db = null;
    actorId = null;
    silencio = false;
    let hubo = false; // había algo guardado
    if (backend) {
      try {
        const crudo = backend.getItem(CLAVE);
        hubo = !!crudo;
        if (crudo) {
          const parsed = JSON.parse(crudo);
          if (parsed && parsed.version === 1 && Array.isArray(parsed.socios)) { db = migrar(parsed); ultimoGuardado = crudo; }
        }
      } catch (e) {
        db = null;
        // Un fallo de lectura: sigue sin persistencia confiable si ni siquiera se puede leer.
        if (!(e instanceof SyntaxError)) modo = 'memoria';
      }
    }
    // Había datos guardados pero ilegibles: se reemplazan por los de ejemplo y se avisa.
    const reiniciado = !db && hubo;
    if (!db) {
      db = Seed.generar(hoy());
      guardar();
    }
    return { modo, reiniciado };
  }

  function requerir(col) {
    if (!db) throw new Error('Store no iniciado');
    if (!COLECCIONES.includes(col)) throw new Error('Colección desconocida: ' + col);
  }

  // ---- Sesión, permisos y registro de acciones ----
  // Copia de un usuario sin la sal ni el resumen de la contraseña.
  function limpio(u) {
    if (!u) return null;
    const c = copia(u);
    delete c.sal; delete c.hash;
    c.nombreRol = (ROLES[c.rol] || {}).nombre || c.rol;
    return c;
  }

  function actorReal() {
    if (actorId == null || !db) return null;
    const u = db.usuarios.find((x) => x.id === actorId);
    return u && u.activo ? u : null;
  }

  function tienePermiso(u, permiso) {
    const r = u && ROLES[u.rol];
    return !!r && (r.permisos.includes('*') || r.permisos.includes(permiso));
  }

  // Con un usuario del panel activo, la operación exige su permiso. Sin sesión (web, "Mi plan", pruebas)
  // no hay usuario que revisar. Si la sesión era de un usuario que ya no existe o se desactivó, no se permite.
  function exigir(permiso) {
    if (actorId == null) return;
    if (!tienePermiso(actorReal(), permiso)) throw new Error('sin-permiso');
  }

  function nombreActor(otro) {
    const a = actorReal();
    return a ? a.nombre : otro || 'Sistema';
  }

  // Anota una acción en el registro: quién hizo qué y cuándo. `quien` sirve cuando no hay sesión del panel
  // (p. ej. 'Web' o 'Mi plan').
  function anotarInterno(tipo, detalle, quien) {
    const a = actorReal();
    db.acciones.push({
      id: siguienteId('acciones'), fecha: hoy(), hora: hora(),
      usuarioId: a ? a.id : null, usuario: a ? a.nombre : quien || 'Sistema', rol: a ? a.rol : null,
      tipo, detalle: String(detalle || '').slice(0, 300),
    });
    if (db.acciones.length > MAX_ACCIONES) db.acciones.splice(0, db.acciones.length - MAX_ACCIONES);
  }

  function anotar(tipo, detalle, quien) {
    anotarInterno(tipo, detalle, quien);
    guardar();
  }

  const nombrePlan = (id) => ((db.planes.find((p) => p.id === id) || {}).nombre || '');
  const nombreMetodo = (m) => (m === 'yappy' ? 'Yappy' : 'Efectivo');

  function normCedula(c) { return String(c || '').trim().toLowerCase(); }

  function revisarFicha(obj) {
    const correo = String(obj.correo || '').trim();
    if (correo && !U.correoValido(correo)) throw new Error('correo-invalido');
    const nac = String(obj.nacimiento || '');
    if (nac && (!U.fechaValida(nac) || nac > hoy() || nac < '1900-01-01')) throw new Error('nacimiento-invalido');
    if (obj.objetivo && !OBJETIVOS.some((o) => o[0] === obj.objetivo)) throw new Error('objetivo-invalido');
  }

  function revisarCedula(obj, idActual) {
    const c = normCedula(obj.cedula);
    if (c && db.socios.some((s) => s.id !== idActual && normCedula(s.cedula) === c)) {
      throw new Error('cedula-repetida');
    }
  }

  // El contador se guarda aparte para que el id de un registro borrado no se reutilice.
  function siguienteId(col) {
    db.seq = db.seq || {};
    const id = Math.max(db.seq[col] || 0, db[col].reduce((m, x) => Math.max(m, x.id), 0)) + 1;
    db.seq[col] = id;
    return id;
  }

  const copia = (x) => JSON.parse(JSON.stringify(x));

  // Los usuarios nunca salen con su sal ni el resumen de la contraseña.
  function list(col) { requerir(col); return col === 'usuarios' ? db.usuarios.map(limpio) : copia(db[col]); }
  function get(col, id) {
    requerir(col);
    const x = db[col].find((o) => o.id === id);
    if (!x) return null;
    return col === 'usuarios' ? limpio(x) : copia(x);
  }
  function protegida(col) {
    if (PROTEGIDAS.includes(col)) throw new Error('coleccion-protegida');
  }
  function create(col, obj) {
    requerir(col);
    protegida(col);
    if (col === 'productos') exigir('ajustes');
    if (col === 'socios') { revisarCedula(obj, null); revisarFicha(obj); }
    const nuevo = Object.assign({}, copia(obj), { id: siguienteId(col) });
    if (col === 'socios') completarSocio(nuevo);
    db[col].push(nuevo);
    if (col === 'socios' && actorId != null && !silencio) anotarInterno('socio-nuevo', `${nuevo.nombre} (${nuevo.cedula})`);
    if (col === 'productos') anotarInterno('producto', `Agregó ${nuevo.nombre} a ${U.dinero(nuevo.precio)}`);
    guardar();
    return copia(nuevo);
  }
  function update(col, id, patch) {
    requerir(col);
    protegida(col);
    if (col === 'productos') exigir('ajustes');
    const x = db[col].find((o) => o.id === id);
    if (!x) throw new Error('No existe ' + col + ' #' + id);
    if (col === 'socios' && patch.cedula !== undefined) revisarCedula(patch, id);
    if (col === 'socios') revisarFicha(patch);
    const antes = col === 'productos' ? x.precio : null;
    Object.assign(x, copia(patch), { id });
    if (col === 'socios') completarSocio(x);
    if (col === 'socios' && actorId != null && !silencio) anotarInterno('socio-editado', `${x.nombre} (${x.cedula})`);
    if (col === 'productos' && patch.precio !== undefined && patch.precio !== antes) anotarInterno('producto', `${x.nombre}: ${U.dinero(antes)} → ${U.dinero(x.precio)}`);
    guardar();
    return copia(x);
  }
  function remove(col, id) {
    requerir(col);
    protegida(col);
    if (col === 'socios') exigir('socios:baja');
    if (col === 'productos') exigir('ajustes');
    const x = db[col].find((o) => o.id === id);
    db[col] = db[col].filter((o) => o.id !== id);
    if (x && col === 'socios') anotarInterno('baja', `Dio de baja a ${x.nombre} (${x.cedula})`);
    if (x && col === 'productos') anotarInterno('producto', `Quitó ${x.nombre}`);
    guardar();
  }

  // `vence` es el último día en que el plan sirve. Hoy ya cuenta: un plan diario pagado hoy vence hoy.
  function calcularVencimiento(venceActual, dias) {
    const h = hoy();
    const base = venceActual && venceActual >= h ? venceActual : U.sumarDias(h, -1);
    return U.sumarDias(base, dias);
  }

  function estadoSocio(socio) {
    if (!socio.vence) return 'pendiente';
    const h = hoy();
    if (socio.vence < h) return 'vencido';
    return U.diasEntre(h, socio.vence) <= 3 ? 'por-vencer' : 'activo';
  }

  // Versión del aviso de privacidad que acepta quien se inscribe por la web (Ley 81 de 2019).
  const AVISO_PRIVACIDAD = '2026-11';

  function inscribir({ nombre, cedula, telefono, planId, acepta }) {
    if (!String(nombre || '').trim() || !String(cedula || '').trim() || !String(telefono || '').trim()) {
      throw new Error('datos-incompletos');
    }
    if (!db.planes.some((p) => p.id === planId)) throw new Error('plan-invalido');
    const datos = {
      nombre: String(nombre).trim(), cedula: String(cedula).trim(), telefono: String(telefono).trim(),
      planId, vence: null, origen: 'web', creadoEn: hoy(),
    };
    if (acepta) datos.consentimiento = { fecha: hoy(), aviso: AVISO_PRIVACIDAD };
    const socio = create('socios', datos);
    anotar('inscripcion-web', `${socio.nombre} (${socio.cedula}) · plan ${nombrePlan(planId)}`, 'Web');
    return socio;
  }

  // Cobro sin anotar en el registro: lo usan el cobro en caja, la confirmación de Yappy y el pago en línea,
  // y cada uno anota lo suyo. Guarda quién cobró y el periodo pagado (para el comprobante).
  // Un plan diario trae además su pase de un solo uso para el día que cubre.
  function cobrarInterno({ socioId, planId, metodo }, por) {
    const socio = db.socios.find((s) => s.id === socioId);
    const plan = db.planes.find((p) => p.id === planId);
    if (!socio || !plan) throw new Error('socio-o-plan-invalido');
    if (metodo !== 'efectivo' && metodo !== 'yappy') throw new Error('metodo-invalido');
    const hasta = calcularVencimiento(socio.vence, plan.dias);
    const desde = U.sumarDias(hasta, 1 - plan.dias);
    socio.vence = hasta;
    socio.planId = plan.id;
    const pago = { id: siguienteId('pagos'), socioId, planId, monto: plan.precio, metodo, fecha: hoy(), desde, hasta, por };
    if (plan.dias === 1) {
      const codigo = U.codigoPase({ socioId, cedula: socio.cedula, fecha: desde });
      if (!db.pases.some((x) => x.codigo === codigo)) {
        db.pases.push({ id: siguienteId('pases'), codigo, socioId, fecha: desde, pagoId: pago.id, usado: false });
      }
      pago.pase = codigo;
    }
    db.pagos.push(pago);
    return pago;
  }

  function cobrar({ socioId, planId, metodo }) {
    const pago = cobrarInterno({ socioId, planId, metodo }, nombreActor());
    const socio = db.socios.find((s) => s.id === socioId);
    anotarInterno('cobro', `${socio.nombre} · ${nombrePlan(planId)} · ${U.dinero(pago.monto)} (${nombreMetodo(metodo)}) · ${U.numeroComprobante(pago)}`);
    guardar();
    return copia(pago);
  }

  function checkIn(socioId) {
    const socio = db.socios.find((s) => s.id === socioId);
    if (!socio) throw new Error('socio-invalido');
    const estado = estadoSocio(socio);
    const aviso = estado === 'vencido' ? 'vencido' : estado === 'pendiente' ? 'pendiente' : null;
    const existente = db.asistencias.find((a) => a.socioId === socioId && a.fecha === hoy());
    if (existente) return { asistencia: copia(existente), aviso, repetido: true };
    const datos = { socioId, fecha: hoy(), hora: hora() };
    if (actorReal()) datos.por = nombreActor();
    const asistencia = create('asistencias', datos);
    return { asistencia, aviso, repetido: false };
  }

  function registrarVenta({ items, metodo }) {
    if (!items || !items.length) throw new Error('venta-vacia');
    const detalle = items.map((it) => {
      const p = db.productos.find((x) => x.id === it.productoId);
      if (!p) throw new Error('producto-invalido');
      return { productoId: p.id, nombre: p.nombre, precio: p.precio, cantidad: it.cantidad };
    });
    const total = Math.round(detalle.reduce((t, it) => t + it.precio * it.cantidad, 0) * 100) / 100;
    const venta = create('ventas', { items: detalle, total, metodo, fecha: hoy(), por: nombreActor() });
    anotar('venta', `Cafetería · ${detalle.map((it) => it.cantidad + '× ' + it.nombre).join(', ')} · ${U.dinero(total)} (${nombreMetodo(metodo)})`);
    return venta;
  }

  // Pago por Yappy avisado por el socio; el dueño lo confirma (o rechaza) desde el panel.
  function solicitarPagoYappy({ socioId, planId }) {
    const plan = db.planes.find((p) => p.id === planId);
    if (!db.socios.some((s) => s.id === socioId) || !plan) throw new Error('socio-o-plan-invalido');
    db.solicitudes = db.solicitudes || [];
    const abierta = db.solicitudes.find((x) => x.socioId === socioId && x.estado === 'por-confirmar');
    if (abierta) return copia(abierta);
    return create('solicitudes', { socioId, planId, monto: plan.precio, estado: 'por-confirmar', fecha: hoy() });
  }

  function solicitudPendiente(id) {
    const sol = (db.solicitudes || []).find((x) => x.id === id);
    if (!sol || sol.estado !== 'por-confirmar') throw new Error('solicitud-no-pendiente');
    return sol;
  }

  function confirmarSolicitud(id) {
    const sol = solicitudPendiente(id);
    const pago = cobrarInterno({ socioId: sol.socioId, planId: sol.planId, metodo: 'yappy' }, nombreActor());
    sol.estado = 'confirmada';
    sol.atendidaPor = nombreActor();
    const socio = db.socios.find((s) => s.id === sol.socioId);
    anotarInterno('yappy-confirmado', `${socio.nombre} · ${nombrePlan(sol.planId)} · ${U.dinero(pago.monto)} · ${U.numeroComprobante(pago)}`);
    guardar();
    return copia(pago);
  }

  function rechazarSolicitud(id) {
    const sol = solicitudPendiente(id);
    sol.estado = 'rechazada';
    sol.atendidaPor = nombreActor();
    const socio = db.socios.find((s) => s.id === sol.socioId);
    anotarInterno('yappy-rechazado', `${socio ? socio.nombre : 'Socio #' + sol.socioId} · ${U.dinero(sol.monto)}`);
    guardar();
  }

  function referenciaYappy(fecha, id) {
    return 'YP-' + fecha.replace(/-/g, '').slice(2) + '-' + String(id).padStart(4, '0');
  }

  // Pago en línea por Yappy (simulado en la demo): registra el cobro solo, con referencia, y renueva el plan.
  // En la versión real este registro lo dispararía la confirmación del banco.
  function pagarYappyEnLinea({ socioId, planId, telefonoYappy }) {
    const numero = String(telefonoYappy || '').replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(numero)) throw new Error('telefono-yappy-invalido');
    const registro = cobrarInterno({ socioId, planId, metodo: 'yappy' }, 'Pago en línea');
    registro.canal = 'web';
    registro.referencia = referenciaYappy(registro.fecha, registro.id);
    registro.yappyTerminado = numero.slice(-4);
    (db.solicitudes || []).forEach((x) => {
      if (x.socioId === socioId && x.estado === 'por-confirmar') x.estado = 'confirmada';
    });
    const socio = db.socios.find((s) => s.id === socioId);
    anotarInterno('pago-en-linea', `${socio.nombre} · ${nombrePlan(planId)} · ${U.dinero(registro.monto)} (Yappy) · ${registro.referencia}`, 'Pago en línea');
    guardar();
    return copia(registro);
  }

  // Acceso de "Mi plan": cédula + últimos 4 dígitos del teléfono. (En la versión real, con login.)
  function buscarSocioPorCredenciales(cedula, ultimos4) {
    const c = normCedula(cedula);
    const u = String(ultimos4 || '').replace(/\D/g, '');
    if (!c || u.length < 4) return null;
    const s = db.socios.find((x) => normCedula(x.cedula) === c && String(x.telefono).replace(/\D/g, '').endsWith(u));
    return s ? copia(s) : null;
  }

  // ---- Check-in con código (QR que cambia, pase diario o lector USB) ----
  // Revisa un código sin registrar nada. Respuestas:
  //   { estado: 'no-es-codigo' }
  //   socio: { tipo: 'socio', estado: 'ok' | 'viejo' | 'desconocido', socio?, minutos? }
  //     'viejo': el código fue de este socio hace un rato (captura de pantalla o reloj del celular atrasado).
  //     'desconocido': no es de ningún socio de este panel (p. ej. hecho en otro equipo de la demo).
  //   pase: { tipo: 'pase', estado: 'ok' | 'usado' | 'otro-dia' | 'futuro' | 'invalido', fecha, socio?, pase? }
  //     `socio` solo si el número y la cédula coinciden con un socio de este panel.
  function analizarCodigo(texto) {
    const c = U.leerCodigo(texto);
    if (!c) return { estado: 'no-es-codigo' };
    if (c.tipo === 'socio') {
      const s = db.socios.find((x) => x.id === c.id);
      const base = { tipo: 'socio', codigo: c.codigo };
      if (!s) return Object.assign(base, { estado: 'desconocido' });
      const secreto = U.secretoSocio(s);
      const paso = U.pasoQR();
      for (let d = -VENTANA_ATRAS; d <= VENTANA_ADELANTE; d++) {
        if (U.tokenQR(secreto, paso + d) === c.token) return Object.assign(base, { estado: 'ok', socio: copia(s) });
      }
      for (let d = 1; d <= VENTANA_VIEJA; d++) {
        if (U.tokenQR(secreto, paso - d) === c.token || U.tokenQR(secreto, paso + d) === c.token) {
          return Object.assign(base, { estado: 'viejo', socio: copia(s), minutos: Math.max(1, Math.round((d * U.PASO_QR_S) / 60)) });
        }
      }
      return Object.assign(base, { estado: 'desconocido' });
    }
    const base = { tipo: 'pase', codigo: c.codigo, fecha: c.fecha };
    if (!c.firmaValida) return Object.assign(base, { estado: 'invalido' });
    const s = db.socios.find((x) => x.id === c.socioId && U.controlCedula(x.cedula) === c.control);
    const p = db.pases.find((x) => x.codigo === c.codigo);
    Object.assign(base, { socio: s ? copia(s) : null, pase: p ? copia(p) : null });
    if (p && p.usado) return Object.assign(base, { estado: 'usado' });
    if (c.fecha !== hoy()) return Object.assign(base, { estado: c.fecha < hoy() ? 'otro-dia' : 'futuro' });
    return Object.assign(base, { estado: 'ok' });
  }

  // Socio de un código de QR vigente, o null. (El código viejo o de otro socio no sirve.)
  function buscarSocioPorCodigo(texto) {
    const r = analizarCodigo(texto);
    return r.tipo === 'socio' && r.estado === 'ok' ? r.socio : null;
  }

  // Registra la entrada con un pase diario y lo marca usado. Si el pase se hizo en otro equipo de la demo
  // (no está en este panel), igual vale una vez: queda anotado aquí como usado y la entrada va como visitante.
  // Devuelve lo mismo que analizarCodigo, más { asistencia, repetido } si se pudo usar.
  function usarPase(texto) {
    const r = analizarCodigo(texto);
    if (r.tipo !== 'pase' || r.estado !== 'ok') return r;
    const s = r.socio ? db.socios.find((x) => x.id === r.socio.id) : null;
    if (s) {
      const ya = db.asistencias.find((a) => a.socioId === s.id && a.fecha === hoy());
      if (ya) return Object.assign(r, { repetido: true, asistencia: copia(ya) });
    }
    let p = db.pases.find((x) => x.codigo === r.codigo);
    if (!p) {
      p = { id: siguienteId('pases'), codigo: r.codigo, socioId: s ? s.id : null, fecha: r.fecha, pagoId: null, usado: false, externo: true };
      db.pases.push(p);
    }
    p.usado = true;
    p.usadoEn = hora();
    p.usadoPor = nombreActor();
    const asistencia = { id: siguienteId('asistencias'), socioId: s ? s.id : null, fecha: hoy(), hora: hora(), pase: r.codigo };
    if (actorReal()) asistencia.por = nombreActor();
    if (!s) { asistencia.visitante = true; asistencia.nombre = 'Visitante con pase diario'; }
    db.asistencias.push(asistencia);
    anotarInterno('pase-usado', `${s ? s.nombre : 'Visitante'} · pase diario ${r.codigo}`);
    guardar();
    return Object.assign(r, { repetido: false, asistencia: copia(asistencia), pase: copia(p) });
  }

  function pasesDe(socioId) {
    return copia(db.pases.filter((p) => p.socioId === socioId).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
  }

  // ---- Usuarios del panel ----
  function iniciarSesion(usuario, clave) {
    const nombre = String(usuario || '').trim().toLowerCase();
    const ahora = U.ahoraMs();
    db.intentos = db.intentos && typeof db.intentos === 'object' ? db.intentos : {};
    const u = db.usuarios.find((x) => x.usuario === nombre);
    // Los intentos con un usuario que no existe también se cuentan, para no revelar cuáles existen.
    let reg = u;
    if (!reg) {
      const claves = Object.keys(db.intentos);
      if (!db.intentos[nombre] && claves.length >= 50) delete db.intentos[claves[0]];
      reg = db.intentos[nombre] = db.intentos[nombre] || { fallos: 0, bloqueadoHasta: 0 };
    }
    if ((reg.bloqueadoHasta || 0) > ahora) {
      return { ok: false, motivo: 'bloqueado', minutos: Math.ceil((reg.bloqueadoHasta - ahora) / 60000) };
    }
    const correcta = !!u && U.hashClave(String(clave || ''), u.sal) === u.hash;
    if (correcta && !u.activo) return { ok: false, motivo: 'inactivo' };
    if (!correcta) {
      reg.fallos = (reg.fallos || 0) + 1;
      if (reg.fallos >= INTENTOS_MAX) {
        reg.fallos = 0;
        reg.bloqueadoHasta = ahora + BLOQUEO_MIN * 60000;
        anotarInterno('bloqueo', `Usuario «${nombre}» bloqueado ${BLOQUEO_MIN} minutos tras ${INTENTOS_MAX} intentos fallidos`, 'Sistema');
        guardar();
        return { ok: false, motivo: 'bloqueado', minutos: BLOQUEO_MIN };
      }
      anotarInterno('sesion-fallida', `Contraseña incorrecta para «${nombre}» (intento ${reg.fallos} de ${INTENTOS_MAX})`, 'Sistema');
      guardar();
      return { ok: false, motivo: 'credenciales', restantes: INTENTOS_MAX - reg.fallos };
    }
    u.fallos = 0;
    u.bloqueadoHasta = 0;
    u.ultimoIngreso = hoy() + ' ' + hora();
    actorId = u.id;
    anotarInterno('sesion', 'Inició sesión');
    guardar();
    return { ok: true, usuario: limpio(u) };
  }

  // Retoma la sesión guardada en la pestaña. Devuelve el usuario, o null si ya no existe o está desactivado.
  function actuarComo(id) {
    actorId = id == null ? null : Number(id);
    const a = actorReal();
    if (!a) actorId = null;
    return limpio(a);
  }

  function cerrarSesion() {
    if (actorReal()) anotar('sesion', 'Cerró sesión');
    actorId = null;
  }

  function puede(permiso) {
    return tienePermiso(actorReal(), permiso);
  }

  function validarClave(clave) {
    if (String(clave || '').length < 6) throw new Error('clave-corta');
  }

  function usuarioReal(id) {
    const u = db.usuarios.find((x) => x.id === id);
    if (!u) throw new Error('usuario-invalido');
    return u;
  }

  const duenosActivos = () => db.usuarios.filter((x) => x.rol === 'dueno' && x.activo);

  function crearUsuario({ usuario, nombre, rol, clave }) {
    exigir('usuarios');
    const u = String(usuario || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,20}$/.test(u)) throw new Error('usuario-invalido');
    if (db.usuarios.some((x) => x.usuario === u)) throw new Error('usuario-repetido');
    if (!String(nombre || '').trim()) throw new Error('nombre-vacio');
    if (!ROLES[rol]) throw new Error('rol-invalido');
    validarClave(clave);
    const sal = U.salNueva();
    const nuevo = {
      id: siguienteId('usuarios'), usuario: u, nombre: String(nombre).trim().slice(0, 40), rol, activo: true,
      sal, hash: U.hashClave(String(clave), sal), fallos: 0, bloqueadoHasta: 0, creadoEn: hoy(),
    };
    db.usuarios.push(nuevo);
    anotarInterno('usuario', `Creó el usuario «${u}» (${nuevo.nombre}, ${ROLES[rol].nombre})`);
    guardar();
    return limpio(nuevo);
  }

  // Cambia nombre, rol o activo. Siempre queda al menos un dueño activo, y nadie se desactiva a sí mismo.
  function actualizarUsuario(id, { nombre, rol, activo }) {
    exigir('usuarios');
    const u = usuarioReal(id);
    if (rol !== undefined && !ROLES[rol]) throw new Error('rol-invalido');
    const quedaDueno = (rol === undefined ? u.rol : rol) === 'dueno' && (activo === undefined ? u.activo : activo);
    if (u.rol === 'dueno' && u.activo && !quedaDueno && duenosActivos().length <= 1) throw new Error('ultimo-dueno');
    if (activo === false && u.id === actorId) throw new Error('no-a-si-mismo');
    const cambios = [];
    if (nombre !== undefined && String(nombre).trim() && String(nombre).trim() !== u.nombre) { u.nombre = String(nombre).trim().slice(0, 40); cambios.push('nombre'); }
    if (rol !== undefined && rol !== u.rol) { u.rol = rol; cambios.push('rol ' + ROLES[rol].nombre); }
    if (activo !== undefined && !!activo !== u.activo) { u.activo = !!activo; cambios.push(activo ? 'activado' : 'desactivado'); }
    if (cambios.length) anotarInterno('usuario', `Usuario «${u.usuario}»: ${cambios.join(', ')}`);
    guardar();
    return limpio(u);
  }

  // Cada uno cambia su contraseña con la actual; el dueño puede ponerle una nueva a otro usuario.
  function cambiarClave(id, { actual, nueva }) {
    const u = usuarioReal(id);
    const propio = actorId != null && u.id === actorId;
    if (propio) {
      if (U.hashClave(String(actual || ''), u.sal) !== u.hash) throw new Error('clave-actual-incorrecta');
    } else {
      exigir('usuarios');
    }
    validarClave(nueva);
    u.sal = U.salNueva();
    u.hash = U.hashClave(String(nueva), u.sal);
    u.fallos = 0;
    u.bloqueadoHasta = 0;
    anotarInterno('usuario', propio ? 'Cambió su contraseña' : `Puso una contraseña nueva a «${u.usuario}»`);
    guardar();
    return limpio(u);
  }

  function desbloquearUsuario(id) {
    exigir('usuarios');
    const u = usuarioReal(id);
    u.fallos = 0;
    u.bloqueadoHasta = 0;
    anotarInterno('usuario', `Desbloqueó a «${u.usuario}»`);
    guardar();
    return limpio(u);
  }

  // Registro de acciones, la más reciente primero. Filtros opcionales: { tipo, usuarioId, desde, hasta }.
  function acciones(filtro) {
    exigir('registro');
    const f = filtro || {};
    return copia(db.acciones.filter((a) => (!f.tipo || a.tipo === f.tipo)
      && (f.usuarioId === undefined || a.usuarioId === f.usuarioId)
      && (!f.desde || a.fecha >= f.desde) && (!f.hasta || a.fecha <= f.hasta))
      .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora) || b.id - a.id));
  }

  // ---- Derechos sobre los datos personales (Ley 81 de 2019): ver, corregir o borrar ----
  function solicitarDerecho(socioId, { tipo, detalle }) {
    const s = socioReal(socioId);
    if (!TIPOS_DERECHO.includes(tipo)) throw new Error('tipo-invalido');
    const texto = String(detalle || '').trim().slice(0, 500);
    if (tipo === 'correccion' && !texto) throw new Error('detalle-vacio');
    const abierta = db.derechos.find((x) => x.socioId === socioId && x.tipo === tipo && x.estado === 'pendiente');
    if (abierta) return copia(abierta);
    const d = { id: siguienteId('derechos'), socioId, nombre: s.nombre, cedula: s.cedula, tipo, detalle: texto, estado: 'pendiente', fecha: hoy() };
    db.derechos.push(d);
    const que = { acceso: 'ver sus datos', correccion: 'corregir sus datos', borrado: 'borrar sus datos' }[tipo];
    anotarInterno('derecho-solicitado', `${s.nombre} pidió ${que}`, 'Mi plan');
    guardar();
    return copia(d);
  }

  // `borrar: true` (solo en una solicitud de borrado) quita al socio y su ficha. Sus pagos y entradas quedan
  // en los reportes, sin nombre.
  function atenderDerecho(id, { respuesta, borrar } = {}) {
    exigir('derechos');
    const d = db.derechos.find((x) => x.id === id);
    if (!d || d.estado !== 'pendiente') throw new Error('solicitud-no-pendiente');
    if (borrar) {
      if (d.tipo !== 'borrado') throw new Error('tipo-invalido');
      const s = db.socios.find((x) => x.id === d.socioId);
      if (s) {
        db.socios = db.socios.filter((x) => x.id !== s.id);
        db.pases = db.pases.filter((p) => p.socioId !== s.id || p.usado);
        db.solicitudes = db.solicitudes.filter((x) => x.socioId !== s.id || x.estado !== 'por-confirmar');
        // El registro de acciones tampoco conserva su nombre ni su cédula (los movimientos quedan, sin datos personales).
        const quitar = (txt) => [s.nombre, s.cedula].filter(Boolean).reduce((t, x) => t.split(x).join('socio borrado'), String(txt || ''));
        db.acciones.forEach((a) => { a.detalle = quitar(a.detalle); });
        anotarInterno('baja', 'Borró los datos de un socio a su pedido (Ley 81)');
      }
      db.derechos.filter((x) => x.socioId === d.socioId).forEach((x) => { x.nombre = 'Datos borrados'; x.cedula = ''; });
    }
    d.estado = 'atendida';
    d.atendidaPor = nombreActor();
    d.atendidaEn = hoy();
    d.respuesta = String(respuesta || '').trim().slice(0, 500);
    anotarInterno('derecho-atendido', `Atendió la solicitud de ${d.nombre} (${{ acceso: 'ver', correccion: 'corregir', borrado: 'borrar' }[d.tipo]} datos)`);
    guardar();
    return copia(d);
  }

  function derechosDe(socioId) {
    return copia(db.derechos.filter((x) => x.socioId === socioId).sort((a, b) => b.id - a.id));
  }

  // ---- Carga de socios desde Excel o CSV ----
  // `filas`: objetos ya leídos del archivo, con los nombres de columna normalizados:
  //   { nombre, cedula, telefono, plan, vence, correo, nacimiento, etiquetas }
  // `plan` puede ser el nombre ('Mensual') o los días ('30'); `vence` y `nacimiento` en AAAA-MM-DD.
  // No guarda nada: dice qué haría con cada fila (crear, actualizar u omitir) y por qué.
  function revisarImportacion(filas) {
    const vistas = new Set();
    const planes = db.planes;
    const porDefecto = planes[planes.length - 1];
    return (filas || []).map((f, i) => {
      const t = (k) => String(f && f[k] != null ? f[k] : '').trim();
      const avisos = [];
      const datos = { nombre: t('nombre'), cedula: t('cedula'), telefono: t('telefono') };
      const r = { fila: i + 2, datos, avisos, accion: 'crear', motivo: '' };
      if (!datos.nombre || !datos.cedula || !datos.telefono) {
        return Object.assign(r, { accion: 'omitir', motivo: 'Falta ' + ['nombre', 'cédula', 'teléfono'].filter((_, k) => !datos[['nombre', 'cedula', 'telefono'][k]]).join(', ') });
      }
      const ced = normCedula(datos.cedula);
      if (vistas.has(ced)) return Object.assign(r, { accion: 'omitir', motivo: 'Cédula repetida en el archivo' });
      vistas.add(ced);
      const planTxt = U.plano(t('plan'));
      let plan = null;
      if (planTxt) {
        plan = planes.find((p) => U.plano(p.nombre) === planTxt || String(p.dias) === planTxt || String(p.id) === planTxt);
        if (!plan) avisos.push(`Plan «${t('plan')}» no existe: queda ${porDefecto.nombre}`);
      }
      datos.planId = (plan || porDefecto).id;
      const vence = t('vence');
      if (vence) {
        if (U.fechaValida(vence)) datos.vence = vence;
        else avisos.push(`Vencimiento «${vence}» no es una fecha: queda sin pagar`);
      }
      const correo = t('correo');
      if (correo) { if (U.correoValido(correo)) datos.correo = correo; else avisos.push(`Correo «${correo}» no es válido: se omite`); }
      const nac = t('nacimiento');
      if (nac) {
        if (U.fechaValida(nac) && nac <= hoy() && nac >= '1900-01-01') datos.nacimiento = nac;
        else avisos.push(`Nacimiento «${nac}» no es una fecha válida: se omite`);
      }
      const etiquetas = t('etiquetas').split(/[,;]/).map(limpiarEtiqueta).filter(Boolean).slice(0, MAX_ETIQUETAS);
      if (etiquetas.length) datos.etiquetas = etiquetas;
      const existente = db.socios.find((s) => normCedula(s.cedula) === ced);
      if (existente) Object.assign(r, { accion: 'actualizar', socioId: existente.id, motivo: 'Ya existe: se actualizan sus datos' });
      return r;
    });
  }

  function importarSocios(filas) {
    exigir('datos');
    const revision = revisarImportacion(filas);
    const r = { creados: 0, actualizados: 0, omitidos: 0, revision };
    silencio = true;
    try {
      revision.forEach((x) => {
        if (x.accion === 'crear') {
          const d = Object.assign({ vence: null, origen: 'importacion', creadoEn: hoy() }, x.datos);
          if (!d.vence) d.vence = null;
          create('socios', d);
          r.creados++;
        } else if (x.accion === 'actualizar') {
          update('socios', x.socioId, x.datos);
          r.actualizados++;
        } else {
          r.omitidos++;
        }
      });
    } finally {
      silencio = false;
    }
    anotar('importacion', `Importó socios: ${r.creados} nuevos, ${r.actualizados} actualizados, ${r.omitidos} omitidos`);
    return r;
  }

  // ---- Respaldos ----
  // Todo el contenido (para descargar). Solo el dueño.
  function exportarTodo() {
    exigir('datos');
    return JSON.stringify(db);
  }

  function restaurar(texto, origen) {
    exigir('datos');
    let d = null;
    try { d = JSON.parse(texto); } catch (e) { d = null; }
    if (!d || d.version !== 1 || !Array.isArray(d.socios) || !Array.isArray(d.planes)) throw new Error('respaldo-invalido');
    const quien = actorReal() ? copia(actorReal()) : null;
    db = migrar(d);
    // La sesión sigue si el usuario existe en el respaldo; si no, queda sin usuario (el panel vuelve al acceso).
    actorId = quien && db.usuarios.some((u) => u.id === quien.id && u.activo) ? quien.id : null;
    anotarInterno('restauracion', 'Restauró ' + (origen || 'un respaldo'), quien ? quien.nombre : 'Sistema');
    guardar();
  }

  function leerIndiceRespaldos() {
    try {
      const v = JSON.parse(backend.getItem(INDICE_RESPALDOS) || '[]');
      return Array.isArray(v) ? v.filter((f) => U.fechaValida(f)) : [];
    } catch (e) { return []; }
  }

  // Respaldo automático: la primera vez que se abre el panel cada día, se guarda una copia en este navegador
  // (se conservan los últimos 7 días). En la versión final, el respaldo diario se hace en la nube.
  function respaldoDiario() {
    if (!backend || modo !== 'local') return false;
    const fecha = hoy();
    try {
      const indice = leerIndiceRespaldos();
      if (indice.includes(fecha) && backend.getItem(PREFIJO_RESPALDO + fecha)) return false;
      backend.setItem(PREFIJO_RESPALDO + fecha, JSON.stringify(db));
      const nuevo = indice.filter((f) => f !== fecha).concat(fecha).sort();
      while (nuevo.length > MAX_RESPALDOS) backend.removeItem(PREFIJO_RESPALDO + nuevo.shift());
      backend.setItem(INDICE_RESPALDOS, JSON.stringify(nuevo));
      return true;
    } catch (e) {
      return false; // sin espacio: la demo sigue sin respaldo
    }
  }

  function respaldos() {
    if (!backend || modo !== 'local') return [];
    return leerIndiceRespaldos().map((fecha) => {
      const crudo = backend.getItem(PREFIJO_RESPALDO + fecha);
      return crudo ? { fecha, bytes: crudo.length } : null;
    }).filter(Boolean).reverse();
  }

  function restaurarRespaldo(fecha) {
    exigir('datos');
    const crudo = backend && backend.getItem(PREFIJO_RESPALDO + fecha);
    if (!crudo) throw new Error('respaldo-invalido');
    restaurar(crudo, 'el respaldo del ' + U.fechaCorta(fecha));
  }

  // `prefijo` es una fecha completa ('2026-11-02') o un mes ('2026-11').
  function ingresos(prefijo) {
    const r = { planes: 0, cafeteria: 0, efectivo: 0, yappy: 0, total: 0 };
    const sumar = (x, tipo, monto) => {
      if (!x.fecha.startsWith(prefijo)) return;
      r[tipo] += monto;
      r[x.metodo] += monto;
      r.total += monto;
    };
    db.pagos.forEach((p) => sumar(p, 'planes', p.monto));
    db.ventas.forEach((v) => sumar(v, 'cafeteria', v.total));
    Object.keys(r).forEach((k) => { r[k] = Math.round(r[k] * 100) / 100; });
    return r;
  }

  // ---- Notas, etiquetas y segmentos (mini-CRM) ----
  function socioReal(id) {
    const s = db.socios.find((x) => x.id === id);
    if (!s) throw new Error('socio-invalido');
    return completarSocio(s);
  }

  function agregarNota(socioId, { tipo, texto, fecha }) {
    const s = socioReal(socioId);
    tipo = tipo || 'nota';
    if (!TIPOS_NOTA.includes(tipo)) throw new Error('tipo-invalido');
    texto = String(texto || '').trim();
    if (tipo === 'nota' && !texto) throw new Error('nota-vacia');
    if (texto.length > 500) throw new Error('nota-larga');
    fecha = fecha || hoy();
    if (!U.fechaValida(fecha)) throw new Error('fecha-invalida');
    const nota = { id: s.notas.reduce((m, n) => Math.max(m, n.id), 0) + 1, fecha, tipo, texto };
    s.notas.push(nota);
    guardar();
    return copia(nota);
  }

  function quitarNota(socioId, notaId) {
    const s = socioReal(socioId);
    s.notas = s.notas.filter((n) => n.id !== notaId);
    guardar();
  }

  function limpiarEtiqueta(e) { return String(e || '').trim().replace(/\s+/g, ' ').slice(0, 24); }

  function agregarEtiqueta(socioId, etiqueta) {
    const s = socioReal(socioId);
    const e = limpiarEtiqueta(etiqueta);
    if (!e) throw new Error('etiqueta-vacia');
    if (s.etiquetas.some((x) => U.plano(x) === U.plano(e))) return copia(s.etiquetas);
    if (s.etiquetas.length >= MAX_ETIQUETAS) throw new Error('demasiadas-etiquetas');
    s.etiquetas.push(e);
    guardar();
    return copia(s.etiquetas);
  }

  function quitarEtiqueta(socioId, etiqueta) {
    const s = socioReal(socioId);
    s.etiquetas = s.etiquetas.filter((x) => U.plano(x) !== U.plano(etiqueta));
    guardar();
    return copia(s.etiquetas);
  }

  // Etiquetas usadas por algún socio, con cuántos la tienen (para chips y sugerencias).
  function etiquetasUsadas() {
    const mapa = new Map();
    db.socios.forEach((s) => (s.etiquetas || []).forEach((e) => {
      const k = U.plano(e);
      mapa.set(k, { nombre: mapa.has(k) ? mapa.get(k).nombre : e, cuenta: (mapa.has(k) ? mapa.get(k).cuenta : 0) + 1 });
    }));
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  // Pura: { ausente: [ids], cumple: [ids], vence7: [ids], nunca: [ids] }. No se guarda nada, se calcula con lo que ya existe.
  function calcularSegmentos(socios, asistencias, hoyIso) {
    const ultima = {};
    asistencias.forEach((a) => { if (!ultima[a.socioId] || a.fecha > ultima[a.socioId]) ultima[a.socioId] = a.fecha; });
    const r = { ausente: [], cumple: [], vence7: [], nunca: [] };
    socios.forEach((s) => {
      const u = ultima[s.id];
      if (!u) r.nunca.push(s.id);
      else if (U.diasEntre(u, hoyIso) >= 15) r.ausente.push(s.id);
      if (s.nacimiento && s.nacimiento.slice(5, 7) === hoyIso.slice(5, 7)) r.cumple.push(s.id);
      if (s.vence && s.vence >= hoyIso && U.diasEntre(hoyIso, s.vence) <= 7) r.vence7.push(s.id);
    });
    return r;
  }

  function segmentos() { return calcularSegmentos(db.socios, db.asistencias, hoy()); }

  // Nombres legibles de los ajustes, para el registro de acciones.
  const NOMBRES_AJUSTES = {
    nombre: 'el nombre', telefono: 'el teléfono', whatsapp: 'el WhatsApp', instagram: 'el Instagram', yappy: 'el número de Yappy',
    recordatorio: 'el mensaje de recordatorio', direccion: 'la dirección', horarios: 'los horarios', urlMiPlan: 'la dirección de Mi plan',
  };

  // Vuelve a los datos de ejemplo. La sesión del panel sigue si el usuario existe en los datos de ejemplo.
  function reset() {
    exigir('ajustes');
    const quien = actorReal() ? actorReal().nombre : null;
    db = Seed.generar(hoy());
    if (actorId != null && !db.usuarios.some((u) => u.id === actorId && u.activo)) actorId = null;
    anotarInterno('ajustes', 'Restableció la demo', quien || 'Sistema');
    guardar();
  }

  const Store = {
    init, hoy, setHoy(iso) { hoyFijo = iso; },
    modo() { return modo; },
    list, get, create, update, remove,
    planes() { return copia(db.planes); },
    updatePlan(id, patch) {
      exigir('ajustes');
      const p = db.planes.find((x) => x.id === id);
      if (!p) throw new Error('plan-invalido');
      const antes = p.precio;
      Object.assign(p, copia(patch), { id });
      if (patch.precio !== undefined && patch.precio !== antes) anotarInterno('precios', `Plan ${p.nombre}: ${U.dinero(antes)} → ${U.dinero(p.precio)}`);
      guardar();
      return copia(p);
    },
    getAjustes() { return copia(db.ajustes); },
    setAjustes(patch) {
      exigir('ajustes');
      const cambiados = Object.keys(patch).filter((k) => k !== 'ejemplo' && JSON.stringify(patch[k]) !== JSON.stringify(db.ajustes[k]));
      Object.assign(db.ajustes, copia(patch));
      if (cambiados.length) anotarInterno('ajustes', 'Cambió ' + cambiados.map((k) => NOMBRES_AJUSTES[k] || k).join(', '));
      guardar();
      return copia(db.ajustes);
    },
    OBJETIVOS, TIPOS_NOTA, SEGMENTOS, ROLES, INTENTOS_MAX, BLOQUEO_MIN, TIPOS_DERECHO, AVISO_PRIVACIDAD,
    calcularSegmentos, segmentos,
    agregarNota, quitarNota, agregarEtiqueta, quitarEtiqueta, etiquetasUsadas,
    calcularVencimiento, estadoSocio, inscribir, cobrar, checkIn, registrarVenta, ingresos, reset,
    solicitarPagoYappy, confirmarSolicitud, rechazarSolicitud, buscarSocioPorCredenciales, pagarYappyEnLinea,
    analizarCodigo, buscarSocioPorCodigo, usarPase, pasesDe,
    iniciarSesion, actuarComo, cerrarSesion, puede,
    usuario() { return limpio(actorReal()); },
    usuarios() { return db.usuarios.map(limpio); },
    crearUsuario, actualizarUsuario, cambiarClave, desbloquearUsuario,
    anotar(tipo, detalle) { anotar(tipo, detalle); },
    acciones,
    solicitarDerecho, atenderDerecho, derechosDe,
    derechos() { exigir('derechos'); return copia(db.derechos.slice().sort((a, b) => b.id - a.id)); },
    revisarImportacion, importarSocios,
    exportarTodo, restaurar, respaldoDiario, respaldos, restaurarRespaldo,
  };

  // Toda operación que lee o escribe datos sincroniza primero.
  ['list', 'get', 'create', 'update', 'remove', 'planes', 'updatePlan', 'getAjustes', 'setAjustes',
    'inscribir', 'cobrar', 'checkIn', 'registrarVenta', 'ingresos', 'reset',
    'solicitarPagoYappy', 'confirmarSolicitud', 'rechazarSolicitud', 'buscarSocioPorCredenciales', 'pagarYappyEnLinea',
    'analizarCodigo', 'buscarSocioPorCodigo', 'usarPase', 'pasesDe',
    'iniciarSesion', 'actuarComo', 'cerrarSesion', 'puede', 'usuario', 'usuarios',
    'crearUsuario', 'actualizarUsuario', 'cambiarClave', 'desbloquearUsuario', 'anotar', 'acciones',
    'solicitarDerecho', 'atenderDerecho', 'derechosDe', 'derechos', 'revisarImportacion', 'importarSocios',
    'exportarTodo', 'restaurar', 'respaldoDiario', 'respaldos', 'restaurarRespaldo',
    'agregarNota', 'quitarNota', 'agregarEtiqueta', 'quitarEtiqueta', 'etiquetasUsadas', 'segmentos'].forEach((nombre) => {
    const original = Store[nombre];
    Store[nombre] = function () { sincronizar(); return original.apply(this, arguments); };
  });

  root.Store = Store;
  if (typeof module !== 'undefined') module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
