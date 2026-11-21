// Ajustes (solo el dueño): pestañas Estudio, Usuarios, Registro, Datos y respaldos, y QR de Mi plan.
// La pestaña va en la dirección: #ajustes?tab=usuarios.
(function () {
  const esc = Util.escapeHtml;
  const G = window.Graficos;
  const icono = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

  const PESTANAS = [
    { id: 'gimnasio', nombre: 'Estudio', permiso: 'ajustes' },
    { id: 'usuarios', nombre: 'Usuarios', permiso: 'usuarios' },
    { id: 'registro', nombre: 'Registro', permiso: 'registro' },
    { id: 'datos', nombre: 'Datos y respaldos', permiso: 'datos' },
    { id: 'qr', nombre: 'QR de Mi plan', permiso: 'ajustes' },
  ];

  // Mensajes para los errores de Store (vienen como códigos) y de Excel (ya vienen como frase).
  const MSG = {
    'sin-permiso': 'Tu usuario no tiene permiso para hacer esto.',
    'usuario-invalido': 'El usuario debe tener de 3 a 20 caracteres: letras sin tildes, números, punto, guion o guion bajo, sin espacios.',
    'usuario-repetido': 'Ya hay alguien con ese usuario. Elige otro (por ejemplo, agrega la inicial del apellido).',
    'nombre-vacio': 'Escribe el nombre de la persona.',
    'rol-invalido': 'Elige un rol: Dueño o Recepción.',
    'clave-corta': 'La contraseña debe tener al menos 6 caracteres.',
    'clave-actual-incorrecta': 'La contraseña actual no es correcta.',
    'ultimo-dueno': 'Siempre debe quedar al menos un usuario Dueño activo. Crea o activa otro dueño antes de hacer este cambio.',
    'no-a-si-mismo': 'No puedes desactivar tu propio usuario mientras lo usas.',
    'respaldo-invalido': 'Ese archivo no es un respaldo de este sistema (o está dañado). No se cambió nada.',
  };
  function textoError(e, otro, propios) {
    const codigo = e && e.message;
    if (propios && propios[codigo]) return propios[codigo];
    if (MSG[codigo]) return MSG[codigo];
    return codigo && /\s/.test(codigo) ? codigo : otro || 'No se pudo completar. Inténtalo de nuevo.';
  }

  // Se vacía antes de escribir para que el lector de pantalla lo anuncie aunque el texto se repita.
  function mensaje(m, clase, texto) {
    if (!m) return;
    m.className = clase ? 'mensaje ' + clase : 'mensaje';
    m.textContent = '';
    clearTimeout(m._t);
    if (texto) m._t = setTimeout(() => { m.textContent = texto; }, 30);
  }

  const pad = (n) => String(n).padStart(2, '0');
  const horaDe = (ms) => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const fechaHora = (txt) => { const [f, h] = String(txt || '').split(' '); return Util.fechaCorta(f) + (h ? ' ' + h : ''); };

  // ===================================================================
  // Pestaña Estudio: planes y precios, datos del estudio, productos y demostración
  // ===================================================================
  // Líneas "a | b | c" ↔ objetos, para editar los horarios como texto.
  const aLineas = (arr, campos) => (arr || []).map((o) => campos.map((c) => o[c]).join(' | ')).join('\n');
  const deLineas = (txt, campos) => txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const partes = l.split('|').map((p) => p.trim());
    return Object.fromEntries(campos.map((c, i) => [c, partes[i] || '']));
  });

  function quitarMarcaProductos() {
    Store.setAjustes({ ejemplo: Object.assign({}, Store.getAjustes().ejemplo, { productos: false }) });
  }

  function gimnasio(el) {
    function pintar() {
      const aj = Store.getAjustes();
      const planes = Store.planes();
      const productos = Store.list('productos');
      const ej = aj.ejemplo || {};
      const marca = (k) => (ej[k] ? ' <span class="insignia pendiente">Ejemplo</span>' : '');

      el.innerHTML = `
        <form class="panel formulario" id="a-planes">
          <h2>Planes y precios</h2>
          ${planes.map((p) => `
            <div class="campo-doble">
              <label>${esc(p.nombre)} · ${p.dias} día${p.dias > 1 ? 's' : ''}<input name="precio-${p.id}" type="number" min="0" step="0.01" value="${p.precio}"></label>
            </div>`).join('')}
          <button class="btn btn-rojo" type="submit">Guardar precios</button>
        </form>

        <form class="panel formulario" id="a-gym">
          <h2>Datos del estudio</h2>
          <div class="campo-doble">
            <label>Teléfono<input name="telefono" value="${esc(aj.telefono)}"></label>
            <label>WhatsApp (opcional, con código de país)<input name="whatsapp" value="${esc(aj.whatsapp)}" placeholder="50760000000"></label>
          </div>
          <label>Instagram<input name="instagram" value="${esc(aj.instagram)}"></label>
          <label><span>Número de Yappy del estudio${marca('yappy')}</span><input name="yappy" value="${esc(aj.yappy)}"></label>
          <label><span>Mensaje de recordatorio por WhatsApp (usa {nombre}, {plan} y {cuando})</span><textarea name="recordatorio" rows="3">${esc(aj.recordatorio)}</textarea></label>
          <label><span>Dirección${marca('direccion')}</span><input name="direccion" value="${esc(aj.direccion)}"></label>
          <label><span>Horarios (uno por línea: días | horas)${marca('horarios')}</span><textarea name="horarios" rows="4">${esc(aLineas(aj.horarios, ['dias', 'horas']))}</textarea></label>
          <button class="btn btn-rojo" type="submit">Guardar datos</button>
        </form>

        <section class="panel formulario">
          <h2>Productos de la cafetería${marca('productos')}</h2>
          ${productos.map((p) => `
            <div class="fila">
              <div class="quien"><strong>${esc(p.nombre)}</strong></div>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="number" min="0" step="0.01" value="${p.precio}" data-precio="${p.id}" style="width:96px" aria-label="Precio de ${esc(p.nombre)}">
                <button class="btn btn-borde btn-chico" data-borrar="${p.id}" aria-label="Eliminar ${esc(p.nombre)}">Quitar</button>
              </div>
            </div>`).join('') || '<p class="vacio">Sin productos.</p>'}
          <form id="a-nuevo-producto" class="campo-doble" style="margin-top:8px">
            <label>Nombre<input name="nombre" required></label>
            <label>Precio<input name="precio" type="number" min="0" step="0.01" required></label>
            <button class="btn btn-gris" type="submit" style="grid-column:1/-1">Agregar producto</button>
          </form>
        </section>

        <section class="panel">
          <h2>Demostración</h2>
          <p class="vacio" style="margin-bottom:12px">Vuelve a cargar los socios, pagos y ventas de ejemplo. Los planes, datos, productos y usuarios también se restablecen.</p>
          <button class="btn btn-borde" id="a-reset">Restablecer demo</button>
        </section>`;

      const intentar = (fn) => { try { fn(); return true; } catch (e) { Admin.toast(textoError(e)); return false; } };

      el.querySelector('#a-planes').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const crudos = planes.map((p) => String(f.get('precio-' + p.id)).trim());
        const nuevos = planes.map((p, i) => ({ id: p.id, precio: Number(crudos[i]) }));
        if (crudos.some((c) => c === '') || nuevos.some((n) => !(n.precio >= 0))) { Admin.toast('Revisa los precios: ninguno puede quedar vacío'); pintar(); return; }
        if (intentar(() => nuevos.forEach((n) => Store.updatePlan(n.id, { precio: n.precio })))) Admin.toast('Precios actualizados');
      });

      el.querySelector('#a-gym').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const horarios = String(f.get('horarios')).replace(/\r/g, '').trim();
        const ok = intentar(() => Store.setAjustes({
          telefono: String(f.get('telefono')).trim(),
          whatsapp: String(f.get('whatsapp')).replace(/\D/g, ''),
          instagram: String(f.get('instagram')).trim(),
          yappy: String(f.get('yappy')).trim(),
          recordatorio: String(f.get('recordatorio')).trim() || aj.recordatorio,
          direccion: String(f.get('direccion')).trim(),
          horarios: deLineas(horarios, ['dias', 'horas']),
          ejemplo: Object.assign({}, aj.ejemplo, {
            direccion: ej.direccion && String(f.get('direccion')).trim() === aj.direccion,
            yappy: ej.yappy && String(f.get('yappy')).trim() === aj.yappy,
            horarios: ej.horarios && horarios === aLineas(aj.horarios, ['dias', 'horas']),
          }),
        }));
        if (ok) { Admin.toast('Datos guardados'); pintar(); }
      });

      el.querySelectorAll('[data-precio]').forEach((i) => i.addEventListener('change', () => {
        const v = Number(i.value);
        if (i.value.trim() === '' || !(v >= 0)) { Admin.toast('Precio inválido'); pintar(); return; }
        if (intentar(() => { Store.update('productos', Number(i.dataset.precio), { precio: v }); quitarMarcaProductos(); })) Admin.toast('Precio actualizado');
      }));
      el.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
        if (await Admin.confirmar('¿Quitar este producto de la cafetería?', { si: 'Quitar' })) {
          intentar(() => { Store.remove('productos', Number(b.dataset.borrar)); quitarMarcaProductos(); });
          pintar();
        }
      }));
      el.querySelector('#a-nuevo-producto').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const nombre = String(f.get('nombre')).trim();
        const crudo = String(f.get('precio')).trim();
        const precio = Number(crudo);
        if (!nombre || crudo === '' || !(precio >= 0)) { Admin.toast('Completa nombre y precio'); return; }
        if (intentar(() => { Store.create('productos', { nombre, precio }); quitarMarcaProductos(); })) { Admin.toast('Producto agregado'); pintar(); }
      });

      el.querySelector('#a-reset').addEventListener('click', async () => {
        if (await Admin.confirmar('¿Restablecer la demo? Se perderán los cambios hechos hasta ahora.', { si: 'Restablecer' })) {
          if (intentar(() => Store.reset())) {
            Admin.toast('Demo restablecida');
            // Si el usuario con la sesión no existe en los datos de ejemplo, el panel vuelve al acceso.
            Admin.refrescar();
          }
        }
      });
    }

    pintar();
  }

  // ===================================================================
  // Pestaña Usuarios
  // ===================================================================
  const ROLES_TXT = () => Object.keys(Store.ROLES).map((k) => [k, Store.ROLES[k].nombre]);

  function usuarios(el) {
    let abierto = null; // usuario con sus opciones a la vista

    function filaUsuario(u, yo, ahora) {
      const esYo = !!yo && yo.id === u.id;
      const bloqueado = (u.bloqueadoHasta || 0) > ahora;
      const abiertoAqui = abierto === u.id;
      const sel = (v) => (u.rol === v ? ' selected' : '');
      return `
        <li class="aj-usuario${u.activo ? '' : ' inactivo'}">
          <div class="fila">
            ${G ? G.avatar(u.nombre) : ''}
            <div class="quien">
              <strong>${esc(u.nombre)}${esYo ? ' <span class="aj-yo">(tú)</span>' : ''}</strong>
              <small>Usuario «${esc(u.usuario)}» · ${esc(u.nombreRol)}</small>
              <small>${u.ultimoIngreso ? 'Último ingreso: ' + esc(fechaHora(u.ultimoIngreso)) : 'Todavía no ha entrado'}</small>
            </div>
            <div class="aj-estado">
              <span class="insignia ${u.activo ? 'activo' : 'vencido'}">${u.activo ? 'Activo' : 'Desactivado'}</span>
              ${bloqueado ? `<span class="insignia por-vencer">Bloqueado hasta ${horaDe(u.bloqueadoHasta)}</span>` : ''}
            </div>
            <button type="button" class="btn btn-borde btn-chico" data-abrir="${u.id}" aria-expanded="${abiertoAqui}" aria-controls="aj-u-${u.id}">${abiertoAqui ? 'Cerrar' : 'Gestionar'}<span class="aj-sr"> a ${esc(u.nombre)}</span></button>
          </div>
          <div class="aj-gestion" id="aj-u-${u.id}"${abiertoAqui ? '' : ' hidden'}>
            <form class="aj-linea" data-rol="${u.id}">
              <label>Rol<select name="rol">${ROLES_TXT().map(([k, n]) => `<option value="${k}"${sel(k)}>${esc(n)}</option>`).join('')}</select></label>
              <button class="btn btn-gris btn-chico" type="submit">Cambiar rol</button>
            </form>
            <form class="aj-linea" data-clave="${u.id}" novalidate>
              ${esYo ? '<label>Tu contraseña actual<input name="actual" type="password" autocomplete="current-password"></label>' : ''}
              <label>${esYo ? 'Contraseña nueva (mínimo 6)' : 'Contraseña nueva (mínimo 6; dásela en persona)'}<input name="nueva" type="password" autocomplete="new-password" minlength="6"></label>
              <button class="btn btn-gris btn-chico" type="submit">Guardar contraseña</button>
            </form>
            <div class="aj-linea">
              ${esYo ? '<p class="aj-nota">No puedes desactivar tu propio usuario mientras lo usas.</p>'
                : `<button type="button" class="btn btn-borde btn-chico" data-activo="${u.id}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}
              ${bloqueado ? `<button type="button" class="btn btn-amarillo btn-chico" data-desbloquear="${u.id}">Desbloquear</button>` : ''}
            </div>
            <div class="mensaje" id="aj-u-${u.id}-msg" role="alert"></div>
          </div>
        </li>`;
    }

    function pintar(enfocar) {
      const yo = Store.usuario();
      const lista = Store.usuarios();
      const ahora = Util.ahoraMs();
      el.innerHTML = `
        <section class="panel" aria-labelledby="aj-u-t">
          <h2 id="aj-u-t">Usuarios del panel</h2>
          <p class="aj-intro">Cada persona entra con su propio usuario y ve solo lo que le toca. Lo que hace queda en el registro con su nombre.</p>
          <ul class="aj-usuarios">${lista.map((u) => filaUsuario(u, yo, ahora)).join('')}</ul>
          <div class="mensaje" id="aj-u-msg" role="status" aria-live="polite"></div>
        </section>

        <form class="panel formulario" id="aj-u-nuevo" novalidate aria-labelledby="aj-un-t">
          <h2 id="aj-un-t">Nuevo usuario</h2>
          <div class="campo-doble">
            <label>Nombre de la persona<input name="nombre" maxlength="40" autocomplete="off" placeholder="Ana Torres"></label>
            <label>Usuario para entrar<input name="usuario" maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="ana.torres" aria-describedby="aj-un-ayuda"></label>
          </div>
          <small class="aj-ayuda" id="aj-un-ayuda">De 3 a 20 caracteres: letras sin tildes, números, punto o guion; sin espacios.</small>
          <div class="campo-doble">
            <label>Rol<select name="rol">${ROLES_TXT().slice().reverse().map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></label>
            <label>Contraseña temporal (mínimo 6)<input name="clave" type="password" minlength="6" autocomplete="new-password"></label>
          </div>
          <label class="aj-check"><input type="checkbox" id="aj-un-ver"> Mostrar la contraseña</label>
          <div class="mensaje" id="aj-un-msg" role="alert"></div>
          <button class="btn btn-rojo" type="submit">Crear usuario</button>
          <p class="aj-nota">Entrégale la contraseña en persona. Después la puede cambiar con «Cambiar contraseña», junto a su nombre.</p>
        </form>

        <section class="panel" aria-labelledby="aj-roles-t">
          <h2 id="aj-roles-t">Qué puede hacer cada rol</h2>
          <div class="aj-roles">
            <div class="aj-rol">
              <h3>Recepción</h3>
              <ul><li>Check-in</li><li>Cobros</li><li>Confirmar pagos Yappy</li><li>Registrar y editar socios</li><li>Cafetería</li></ul>
            </div>
            <div class="aj-rol dueno">
              <h3>Dueño</h3>
              <p>Todo lo de recepción, además:</p>
              <ul><li>Reportes de ingresos</li><li>Ajustes</li><li>Bajas de socios</li><li>Usuarios y registro de acciones</li><li>Datos y respaldos</li></ul>
            </div>
          </div>
          <p class="aj-nota">Los permisos de cada rol se ajustan con el estudio antes de la entrega.</p>
        </section>`;

      if (enfocar) { const x = el.querySelector(enfocar); if (x) x.focus(); }
    }

    const nombreDe = (id) => (Store.usuarios().find((u) => u.id === id) || {}).nombre || 'el usuario';
    const NO_EXISTE = { 'usuario-invalido': 'Ese usuario ya no existe. Vuelve a abrir la lista.' };

    // Después de cambiar usuarios: la barra del panel y el menú se actualizan (p. ej. si cambió el propio rol).
    // Primero la sesión y después el aviso: si la pantalla tuviera que cambiar, su aviso no tapa el de este cambio.
    function listo(texto, enfocar, corto) {
      pintar(enfocar);
      mensaje(el.querySelector('#aj-u-msg'), 'ok', texto);
      if (Admin.refrescarSesion) Admin.refrescarSesion();
      Admin.toast(corto || texto);
    }

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b || !el.contains(b)) return;
      if (b.dataset.abrir) {
        const id = Number(b.dataset.abrir);
        abierto = abierto === id ? null : id;
        pintar(`[data-abrir="${id}"]`);
        return;
      }
      if (b.dataset.activo) {
        const id = Number(b.dataset.activo);
        const u = Store.usuarios().find((x) => x.id === id);
        if (!u) return;
        const msg = el.querySelector(`#aj-u-${id}-msg`);
        if (u.activo && !(await Admin.confirmar(`¿Desactivar a ${u.nombre}? Ya no podrá entrar al panel. Su historial queda guardado y lo puedes activar de nuevo.`, { si: 'Desactivar' }))) return;
        try {
          Store.actualizarUsuario(id, { activo: !u.activo });
          listo(u.activo ? `${u.nombre} quedó desactivado.` : `${u.nombre} ya puede entrar de nuevo.`, `[data-activo="${id}"]`, u.activo ? 'Usuario desactivado' : 'Usuario activado');
        } catch (err) { mensaje(msg, 'error', textoError(err, null, NO_EXISTE)); }
        return;
      }
      if (b.dataset.desbloquear) {
        const id = Number(b.dataset.desbloquear);
        try {
          Store.desbloquearUsuario(id);
          listo(`${nombreDe(id)} ya puede volver a intentar entrar.`, `[data-abrir="${id}"]`, 'Usuario desbloqueado');
        } catch (err) { mensaje(el.querySelector(`#aj-u-${id}-msg`), 'error', textoError(err, null, NO_EXISTE)); }
      }
    });

    el.addEventListener('change', (e) => {
      if (e.target.id === 'aj-un-ver') el.querySelector('#aj-u-nuevo [name="clave"]').type = e.target.checked ? 'text' : 'password';
    });

    el.addEventListener('submit', async (e) => {
      const f = e.target;
      e.preventDefault();
      if (f.id === 'aj-u-nuevo') {
        const datos = { nombre: f.nombre.value, usuario: f.usuario.value, rol: f.rol.value, clave: f.clave.value };
        const CAMPO = { 'usuario-invalido': 'usuario', 'usuario-repetido': 'usuario', 'nombre-vacio': 'nombre', 'rol-invalido': 'rol', 'clave-corta': 'clave' };
        // El nombre se revisa primero: es lo primero que se llena.
        if (!datos.nombre.trim()) { mensaje(f.querySelector('#aj-un-msg'), 'error', MSG['nombre-vacio']); f.nombre.focus(); return; }
        try {
          const u = Store.crearUsuario(datos);
          abierto = null;
          listo(`Usuario «${u.usuario}» creado: ${u.nombre} ya puede entrar como ${u.nombreRol}.`, null, 'Usuario creado');
        } catch (err) {
          mensaje(f.querySelector('#aj-un-msg'), 'error', textoError(err));
          const campo = f.elements[CAMPO[err.message]];
          if (campo) campo.focus();
        }
        return;
      }
      if (f.dataset.rol) {
        const id = Number(f.dataset.rol);
        const yo = Store.usuario();
        const rol = f.rol.value;
        const msg = el.querySelector(`#aj-u-${id}-msg`);
        const u = Store.usuarios().find((x) => x.id === id);
        if (!u || u.rol === rol) { mensaje(msg, 'aviso', 'Ese ya es su rol.'); return; }
        if (yo && yo.id === id && !(await Admin.confirmar(`Si te cambias a ${Store.ROLES[rol].nombre}, dejarás de ver Ajustes y lo que es solo del dueño. ¿Seguir?`, { si: 'Cambiar mi rol' }))) return;
        try {
          const nuevo = Store.actualizarUsuario(id, { rol });
          if (yo && yo.id === id && !Store.puede('ver:ajustes')) {
            // Ya no ve Ajustes: el panel va a Inicio a propósito y el aviso dice qué cambió (no "solo para el dueño").
            Admin.ir('inicio');
            Admin.toast(`Ahora tienes el rol ${nuevo.nombreRol}`);
            return;
          }
          listo(`${nuevo.nombre} ahora tiene el rol ${nuevo.nombreRol}.`, `[data-abrir="${id}"]`, 'Rol cambiado');
        } catch (err) { mensaje(msg, 'error', textoError(err, null, NO_EXISTE)); }
        return;
      }
      if (f.dataset.clave) {
        const id = Number(f.dataset.clave);
        const msg = el.querySelector(`#aj-u-${id}-msg`);
        const nueva = f.nueva.value;
        if (f.actual && !f.actual.value) { mensaje(msg, 'error', 'Escribe tu contraseña actual.'); f.actual.focus(); return; }
        if (nueva.length < 6) { mensaje(msg, 'error', MSG['clave-corta']); f.nueva.focus(); return; }
        try {
          Store.cambiarClave(id, f.actual ? { actual: f.actual.value, nueva } : { nueva });
          listo(f.actual ? 'Tu contraseña quedó cambiada. Úsala la próxima vez que entres.' : `Contraseña nueva guardada para ${nombreDe(id)}. Dásela en persona.`, `[data-abrir="${id}"]`, 'Contraseña guardada');
        } catch (err) {
          mensaje(msg, 'error', textoError(err, null, NO_EXISTE));
          (err.message === 'clave-actual-incorrecta' && f.actual ? f.actual : f.nueva).focus();
        }
      }
    });

    pintar();
  }

  // ===================================================================
  // Pestaña Registro de acciones
  // ===================================================================
  const TIPOS_ACCION = {
    sesion: 'Sesión', 'sesion-fallida': 'Intento fallido', bloqueo: 'Bloqueo', cobro: 'Cobro',
    'yappy-confirmado': 'Yappy confirmado', 'yappy-rechazado': 'Yappy rechazado', 'pago-en-linea': 'Pago en línea',
    baja: 'Baja de socio', 'socio-nuevo': 'Socio nuevo', 'socio-editado': 'Socio editado', 'inscripcion-web': 'Inscripción web',
    venta: 'Venta cafetería', precios: 'Precios', ajustes: 'Ajustes', producto: 'Producto', usuario: 'Usuarios',
    importacion: 'Importación', exportacion: 'Exportación', restauracion: 'Restauración',
    'derecho-solicitado': 'Ley 81: solicitud', 'derecho-atendido': 'Ley 81: atendida', 'pase-usado': 'Pase diario usado',
  };
  const GRUPOS = [
    { id: 'cobros', nombre: 'Cobros y pagos', tipos: ['cobro', 'yappy-confirmado', 'yappy-rechazado', 'pago-en-linea', 'venta'] },
    { id: 'socios', nombre: 'Socios', tipos: ['socio-nuevo', 'socio-editado', 'inscripcion-web', 'baja', 'pase-usado'] },
    { id: 'sesiones', nombre: 'Sesiones y seguridad', tipos: ['sesion', 'sesion-fallida', 'bloqueo'] },
    { id: 'ajustes', nombre: 'Ajustes y usuarios', tipos: ['precios', 'ajustes', 'producto', 'usuario'] },
    { id: 'datos', nombre: 'Datos', tipos: ['importacion', 'exportacion', 'restauracion'] },
    { id: 'ley81', nombre: 'Ley 81', tipos: ['derecho-solicitado', 'derecho-atendido'] },
  ];
  // Lo que conviene ver de un vistazo (intentos fallidos, rechazos, bajas) va en rojo.
  const ALERTA = ['sesion-fallida', 'bloqueo', 'yappy-rechazado', 'baja'];
  const grupoDe = (tipo) => (GRUPOS.find((g) => g.tipos.includes(tipo)) || { id: 'otro' }).id;
  const etiquetaTipo = (tipo) => TIPOS_ACCION[tipo] || tipo;

  // Store ya anota "Cambió el teléfono, la dirección de Mi plan"; los registros guardados antes traen la clave
  // técnica ("Cambió telefono, urlMiPlan") y aquí se muestran con nombres que se entienden.
  const NOMBRES_AJUSTE = {
    nombre: 'nombre del estudio', telefono: 'teléfono', whatsapp: 'WhatsApp', instagram: 'Instagram', yappy: 'número de Yappy',
    recordatorio: 'mensaje de recordatorio', direccion: 'dirección', horarios: 'horarios', urlMiPlan: 'dirección de Mi plan',
  };
  function detalleLegible(a) {
    const d = String(a.detalle || '');
    if (a.tipo === 'ajustes' && /^Cambió /.test(d)) return 'Cambió ' + d.slice(7).split(', ').map((k) => NOMBRES_AJUSTE[k] || k).join(', ');
    return d;
  }
  const nombreRol = (rol) => (rol && Store.ROLES[rol] ? Store.ROLES[rol].nombre : '');

  function registro(el) {
    const POR_PAGINA = 50;
    let usuario = '';
    let grupo = '';
    let periodo = '7';
    let mostrados = POR_PAGINA;
    const PERIODOS = [['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['todo', 'Todo']];

    function filtradas() {
      const hoy = Store.hoy();
      const f = {};
      if (usuario === 'sin') f.usuarioId = null;
      else if (usuario) f.usuarioId = Number(usuario);
      if (periodo === 'hoy') f.desde = hoy;
      else if (periodo !== 'todo') f.desde = Util.sumarDias(hoy, 1 - Number(periodo));
      const tipos = grupo ? GRUPOS.find((g) => g.id === grupo).tipos : null;
      return Store.acciones(f).filter((a) => !tipos || tipos.includes(a.tipo));
    }

    function itemHtml(a, hoy, ayer, nuevo) {
      const cuando = a.fecha === hoy ? 'Hoy' : a.fecha === ayer ? 'Ayer' : Util.fechaCorta(a.fecha);
      const rol = nombreRol(a.rol);
      return `
        <li class="aj-reg"${nuevo ? ' tabindex="-1"' : ''}>
          <time class="aj-reg-cuando" datetime="${esc(a.fecha)}T${esc(a.hora)}"><b>${cuando}</b> ${esc(a.hora)}</time>
          <span class="aj-reg-tipo"><span class="insignia aj-g-${grupoDe(a.tipo)}${ALERTA.includes(a.tipo) ? ' aj-alerta' : ''}">${esc(etiquetaTipo(a.tipo))}</span></span>
          <span class="aj-reg-quien">${esc(a.usuario)}${rol && rol !== a.usuario ? `<small>${esc(rol)}</small>` : ''}</span>
          <span class="aj-reg-detalle">${esc(detalleLegible(a))}</span>
        </li>`;
    }

    function lista(enfocarDesde) {
      const caja = el.querySelector('#aj-r-lista');
      const cuenta = el.querySelector('#aj-r-cuenta');
      const mas = el.querySelector('#aj-r-mas');
      let todas;
      try { todas = filtradas(); } catch (e) {
        caja.innerHTML = `<li class="mensaje error" role="alert">${esc(textoError(e))}</li>`;
        return;
      }
      const hoy = Store.hoy();
      const ayer = Util.sumarDias(hoy, -1);
      const vis = todas.slice(0, mostrados);
      caja.innerHTML = vis.map((a, i) => itemHtml(a, hoy, ayer, enfocarDesde != null && i === enfocarDesde)).join('')
        || '<li class="aj-reg-vacio"><p class="vacio">No hay acciones con estos filtros.</p></li>';
      cuenta.textContent = todas.length ? (vis.length < todas.length ? `Mostrando ${vis.length} de ${plural(todas.length, 'acción', 'acciones')}` : plural(todas.length, 'acción', 'acciones')) : 'Sin acciones';
      mas.hidden = vis.length >= todas.length;
      el.querySelector('#aj-r-exportar').disabled = !todas.length;
      if (enfocarDesde != null) { const x = caja.querySelector('[tabindex="-1"]'); if (x) x.focus(); }
    }

    function pintar() {
      const usuariosLista = Store.usuarios();
      el.innerHTML = `
        <section class="panel aj-registro" aria-labelledby="aj-r-t">
          <h2 id="aj-r-t">Registro de acciones</h2>
          <p class="aj-intro">Queda guardado quién cobró, confirmó o borró algo, y cuándo.</p>
          <div class="aj-filtros">
            <label>Usuario<select id="aj-r-usuario">
              <option value="">Todos</option>
              ${usuariosLista.map((u) => `<option value="${u.id}"${usuario === String(u.id) ? ' selected' : ''}>${esc(u.nombre)} (${esc(u.nombreRol)})</option>`).join('')}
              <option value="sin"${usuario === 'sin' ? ' selected' : ''}>Web, Mi plan y sistema</option>
            </select></label>
            <label>Tipo<select id="aj-r-tipo">
              <option value="">Todos</option>
              ${GRUPOS.map((g) => `<option value="${g.id}"${grupo === g.id ? ' selected' : ''}>${esc(g.nombre)}</option>`).join('')}
            </select></label>
          </div>
          <div class="chips aj-periodos" role="group" aria-label="Periodo">
            ${PERIODOS.map(([v, n]) => `<button type="button" class="chip${periodo === v ? ' sel' : ''}" data-periodo="${v}" aria-pressed="${periodo === v}">${n}</button>`).join('')}
          </div>
          <div class="aj-r-barra">
            <p id="aj-r-cuenta" class="aj-cuenta" aria-live="polite"></p>
            <button type="button" class="btn btn-amarillo btn-chico" id="aj-r-exportar">Exportar registro a Excel</button>
          </div>
          <div class="aj-reg-cab" aria-hidden="true"><span>Fecha y hora</span><span>Acción</span><span>Usuario</span><span>Detalle</span></div>
          <ul class="aj-reg-lista" id="aj-r-lista"></ul>
          <button type="button" class="btn btn-borde aj-mas" id="aj-r-mas" hidden>Ver más</button>
        </section>`;

      el.querySelector('#aj-r-usuario').addEventListener('change', (e) => { usuario = e.target.value; mostrados = POR_PAGINA; lista(); });
      el.querySelector('#aj-r-tipo').addEventListener('change', (e) => { grupo = e.target.value; mostrados = POR_PAGINA; lista(); });
      el.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => {
        periodo = b.dataset.periodo;
        mostrados = POR_PAGINA;
        el.querySelectorAll('[data-periodo]').forEach((x) => {
          const s = x.dataset.periodo === periodo;
          x.classList.toggle('sel', s);
          x.setAttribute('aria-pressed', String(s));
        });
        lista();
      }));
      el.querySelector('#aj-r-mas').addEventListener('click', () => {
        const desde = mostrados;
        mostrados += POR_PAGINA;
        lista(desde);
      });
      el.querySelector('#aj-r-exportar').addEventListener('click', () => {
        try {
          const todas = filtradas();
          const filas = [['Fecha', 'Hora', 'Usuario', 'Rol', 'Acción', 'Detalle']]
            .concat(todas.map((a) => [Excel.fecha(a.fecha), a.hora, a.usuario, nombreRol(a.rol), etiquetaTipo(a.tipo), detalleLegible(a)]));
          Excel.descargar(`registro-de-acciones-${Store.hoy()}.xlsx`, Excel.xlsx([{ nombre: 'Registro de acciones', filas }]));
          Store.anotar('exportacion', `Registro de acciones a Excel (${plural(todas.length, 'fila', 'filas')})`);
          Admin.toast('Registro exportado a Excel');
          lista();
        } catch (e) { Admin.toast(textoError(e, 'No se pudo exportar el registro.')); }
      });
      lista();
    }

    pintar();
  }

  // ===================================================================
  // Pestaña Datos y respaldos
  // ===================================================================
  const ACCION_IMP = { crear: ['Nuevo', 'activo'], actualizar: ['Actualizar', 'por-vencer'], omitir: ['Omitir', 'vencido'] };
  const ORIGEN = { web: 'Web', panel: 'Panel', importacion: 'Importación' };
  const metodoPago = (p) => (p.canal === 'web' ? 'Yappy en línea' : p.metodo === 'yappy' ? 'Yappy' : 'Efectivo');
  const cronologico = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.hora || '').localeCompare(String(b.hora || '')) || a.id - b.id;

  // Tablas para exportar: encabezados en español, fechas como fecha y montos como número.
  function tablas() {
    const planes = Store.planes();
    const nPlan = (id) => (planes.find((p) => p.id === id) || {}).nombre || '';
    const socios = Store.list('socios');
    const socio = (id) => socios.find((s) => s.id === id);
    const objetivo = (v) => (Store.OBJETIVOS.find((o) => o[0] === v) || [])[1] || '';
    const hoy = Store.hoy();
    return {
      socios: {
        nombre: 'Socios', archivo: 'socios',
        filas: [['Nombre', 'Cédula', 'Teléfono', 'Plan', 'Vence', 'Estado', 'Correo', 'Nacimiento', 'Etiquetas', 'Contacto de emergencia', 'Teléfono de emergencia', 'Objetivo', 'Origen', 'Inscrito']]
          .concat(socios.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((s) => [
            s.nombre, s.cedula, s.telefono, nPlan(s.planId), Excel.fecha(s.vence), Util.etiquetaEstado(Store.estadoSocio(s)),
            s.correo || '', Excel.fecha(s.nacimiento), (s.etiquetas || []).join(', '), s.emergenciaNombre || '', s.emergenciaTelefono || '',
            objetivo(s.objetivo), ORIGEN[s.origen] || s.origen || '', Excel.fecha(s.creadoEn),
          ])),
      },
      pagos: {
        nombre: 'Pagos', archivo: 'pagos',
        filas: [['Comprobante', 'Fecha', 'Socio', 'Cédula', 'Plan', 'Monto', 'Método', 'Desde', 'Hasta', 'Atendió', 'Referencia Yappy']]
          .concat(Store.list('pagos').sort(cronologico).map((p) => {
            const s = socio(p.socioId);
            return [Util.numeroComprobante(p), Excel.fecha(p.fecha), s ? s.nombre : 'Socio dado de baja', s ? s.cedula : '', nPlan(p.planId),
              Excel.monto(p.monto), metodoPago(p), Excel.fecha(p.desde), Excel.fecha(p.hasta), p.por || '', p.referencia || ''];
          })),
      },
      entradas: {
        nombre: 'Entradas', archivo: 'entradas',
        filas: [['Fecha', 'Hora', 'Socio', 'Cédula', 'Tipo', 'Registró']]
          .concat(Store.list('asistencias').filter((a) => a.fecha <= hoy).sort(cronologico).map((a) => {
            const s = a.socioId != null ? socio(a.socioId) : null;
            const quien = a.visitante ? a.nombre || 'Visitante con pase diario' : s ? s.nombre : 'Socio dado de baja';
            return [Excel.fecha(a.fecha), a.hora || '', quien, s ? s.cedula : '', a.pase ? 'Pase diario' : 'Socio', a.por || ''];
          })),
      },
      ventas: {
        nombre: 'Ventas de cafetería', archivo: 'ventas-cafeteria',
        filas: [['Fecha', 'Productos', 'Total', 'Método', 'Atendió']]
          .concat(Store.list('ventas').sort(cronologico).map((v) => [
            Excel.fecha(v.fecha), (v.items || []).map((it) => `${it.cantidad}× ${it.nombre}`).join(', '), Excel.monto(v.total),
            v.metodo === 'yappy' ? 'Yappy' : 'Efectivo', v.por || '',
          ])),
      },
    };
  }

  const kb = (n) => `${(n / 1024).toLocaleString('es-PA', { maximumFractionDigits: n < 10240 ? 1 : 0 })} KB`;
  const fechaLarga = (iso) => {
    const t = new Date(iso + 'T00:00:00').toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const leerTexto = (archivo) => (typeof archivo.text === 'function' ? archivo.text() : new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => mal(new Error('No se pudo leer el archivo.'));
    r.readAsText(archivo);
  }));

  function datos(el) {
    let imp = null; // { nombre, mapeo, revision, mostrados, filtro }

    el.innerHTML = `
      <section class="panel" aria-labelledby="aj-imp-t">
        <h2 id="aj-imp-t">Importar socios desde Excel</h2>
        <p class="aj-intro">Sube la lista de socios que ya tienes, en Excel (.xlsx) o CSV. Antes de guardar verás qué pasará con cada fila; nada cambia hasta que confirmes.</p>
        <div class="aj-imp-elegir">
          <label class="aj-archivo">Archivo de socios (.xlsx o .csv)
            <input type="file" id="aj-imp-archivo" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv">
          </label>
          <button type="button" class="btn btn-borde btn-chico" id="aj-plantilla">Descargar plantilla de Excel</button>
        </div>
        <p class="aj-ayuda">Columnas: <b>Nombre</b>, <b>Cédula</b> y <b>Teléfono</b> (obligatorias); Plan, Vence, Correo, Nacimiento y Etiquetas (opcionales). Si un socio ya existe (misma cédula), se actualizan sus datos.</p>
        <div id="aj-imp-res"></div>
      </section>

      <section class="panel" aria-labelledby="aj-exp-t">
        <h2 id="aj-exp-t">Exportar datos</h2>
        <p class="aj-intro">Descarga tus datos con las fechas como fechas y los montos como números.</p>
        <p class="aj-nota aj-exp-nota">Para abrir en Excel, usa el botón Excel. El CSV es para Google Sheets u otros sistemas.</p>
        <ul class="aj-export" id="aj-exp-lista"></ul>
        <button type="button" class="btn btn-amarillo" id="aj-exp-todo">Todo en un Excel</button>
      </section>

      <section class="panel" aria-labelledby="aj-resp-t">
        <h2 id="aj-resp-t">Respaldos</h2>
        <p class="aj-nota aj-nota-demo">En la demo, los respaldos automáticos se guardan en este navegador (últimos 7 días). En la versión final, el respaldo diario es automático en la nube.</p>
        <ul class="aj-respaldos" id="aj-resp-lista"></ul>
        <div class="aj-resp-acciones">
          <button type="button" class="btn btn-gris btn-chico" id="aj-resp-bajar">Descargar respaldo completo (.json)</button>
          <label class="aj-archivo">Restaurar desde un archivo (.json)
            <input type="file" id="aj-resp-archivo" accept=".json,application/json">
          </label>
        </div>
        <div class="mensaje" id="aj-resp-msg" role="alert"></div>
      </section>`;

    const $ = (s) => el.querySelector(s);

    // ---- Importar ----
    const ORDEN_FECHAS = { dm: 'día/mes', md: 'mes/día', mixto: 'día/mes y mes/día' };
    // Texto escapado en el que "2026-12-01" y "AAAA-MM-DD" no se parten en el guion al final de la línea.
    const sinCortes = (t) => esc(t).replace(/\b(\d{4}-\d{2}-\d{2}|AAAA-MM-DD)\b/g, '<span class="aj-nw">$1</span>');

    function columnasHtml(m) {
      const rec = m.reconocidas.map((r) => `<li><b>${esc(r.etiqueta)}</b>${Util.plano(r.encabezado) !== Util.plano(r.etiqueta) ? ` ← «${esc(r.encabezado)}»` : ''}${r.orden ? ` <small>(${ORDEN_FECHAS[r.orden]})</small>` : ''}</li>`).join('');
      return `
        <div class="aj-imp-cols">
          <p><strong>Columnas reconocidas${m.filaEncabezado > 1 ? ` (encabezados en la fila ${m.filaEncabezado})` : ''}:</strong></p>
          ${rec ? `<ul class="aj-cols">${rec}</ul>` : '<p class="vacio">Ninguna.</p>'}
          <p><strong>Se ignoran:</strong> ${m.ignoradas.length ? m.ignoradas.map((x) => '«' + esc(x) + '»').join(', ') : 'ninguna columna.'}</p>
        </div>`;
    }

    function vistaPrevia() {
      const res = $('#aj-imp-res');
      const m = imp.mapeo;
      if (m.faltan.length) {
        res.innerHTML = `<div class="mensaje error" role="alert">No encontré ${m.faltan.length === 1 ? 'la columna obligatoria' : 'las columnas obligatorias'} ${m.faltan.map((x) => '«' + esc(x) + '»').join(', ')} en «${esc(imp.nombre)}». Revisa que la primera fila tenga los encabezados (o usa la plantilla).</div>${columnasHtml(m)}`;
        return;
      }
      if (!imp.revision.length) {
        res.innerHTML = `<div class="mensaje aviso" role="alert">«${esc(imp.nombre)}» no tiene socios debajo de los encabezados.</div>${columnasHtml(m)}`;
        return;
      }
      const cuenta = { crear: 0, actualizar: 0, omitir: 0 };
      imp.revision.forEach((r) => { cuenta[r.accion]++; });
      const aGuardar = cuenta.crear + cuenta.actualizar;
      const revisar = imp.revision.map((r, i) => i).filter((i) => imp.revision[i].accion === 'omitir' || imp.revision[i].avisos.length);
      const indices = imp.filtro === 'revisar' ? revisar : imp.revision.map((r, i) => i);
      const vis = indices.slice(0, imp.mostrados);
      // Las fechas que se leyeron (con el mes en letras) para revisarlas antes de importar.
      const fechasDe = (d) => [d.vence ? 'Vence ' + Excel.fechaEnPalabras(d.vence, true) : '', d.nacimiento ? 'Nació ' + Excel.fechaEnPalabras(d.nacimiento, true) : '']
        .filter(Boolean).map((t) => ' · ' + esc(t)).join('');
      res.innerHTML = `
        <div class="mensaje ok" role="status">Leí «${esc(imp.nombre)}»: ${plural(imp.revision.length, 'fila', 'filas')} con datos. ${m.avisos.length ? 'Revisa el aviso de las fechas y confirma.' : 'Revisa y confirma.'}</div>
        ${m.avisos.map((a) => `<div class="mensaje aviso aj-imp-aviso"><strong>${sinCortes(a.titulo)}</strong> ${sinCortes(a.detalle)}</div>`).join('')}
        ${columnasHtml(m)}
        <div class="datos-clave aj-totales">
          <div><small>Nuevos</small><strong>${cuenta.crear}</strong><span>se crean</span></div>
          <div><small>A actualizar</small><strong>${cuenta.actualizar}</strong><span>ya existen (misma cédula)</span></div>
          <div><small>Omitidos</small><strong>${cuenta.omitir}</strong><span>no se cargan</span></div>
        </div>
        <div class="chips" role="group" aria-label="Filas a mostrar">
          <button type="button" class="chip${imp.filtro ? '' : ' sel'}" data-imp-filtro="" aria-pressed="${!imp.filtro}">Todas<b>${imp.revision.length}</b></button>
          <button type="button" class="chip${imp.filtro ? ' sel' : ''}" data-imp-filtro="revisar" aria-pressed="${!!imp.filtro}">Para revisar<b>${revisar.length}</b></button>
        </div>
        <ul class="aj-imp-lista">${vis.map((i) => {
          const r = imp.revision[i];
          const [txt, clase] = ACCION_IMP[r.accion];
          return `<li class="aj-imp-fila">
            <span class="aj-imp-n">Fila ${m.numeros[i]}</span>
            <div class="quien"><strong>${esc(r.datos.nombre || 'Sin nombre')}</strong><small>${esc(r.datos.cedula || 'Sin cédula')}${r.accion === 'omitir' ? '' : fechasDe(r.datos)}</small></div>
            <span class="insignia ${clase}">${txt}</span>
            ${r.motivo ? `<p class="aj-imp-motivo">${esc(r.motivo)}</p>` : ''}
            ${r.avisos.length ? `<ul class="aj-avisos">${r.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
          </li>`;
        }).join('') || '<li><p class="vacio">Ninguna fila tiene avisos.</p></li>'}</ul>
        ${vis.length < indices.length ? `<button type="button" class="btn btn-borde aj-mas" id="aj-imp-mas">Ver más (${indices.length - vis.length})</button>` : ''}
        <div class="aj-imp-botones">
          <button type="button" class="btn btn-rojo" id="aj-imp-ok"${aGuardar ? '' : ' disabled'}>Importar ${plural(aGuardar, 'socio', 'socios')}</button>
          <button type="button" class="btn btn-borde" id="aj-imp-cancelar">Cancelar</button>
        </div>
        ${aGuardar ? '' : '<p class="aj-nota">No hay filas para cargar: revisa los motivos de arriba.</p>'}`;
    }

    async function leerImportacion(archivo) {
      const res = $('#aj-imp-res');
      res.innerHTML = `<p class="aj-cargando" role="status">Leyendo «${esc(archivo.name)}»…</p>`;
      try {
        const matriz = await Excel.leerArchivo(archivo);
        const mapeo = Excel.mapearSocios(matriz);
        const revision = Store.revisarImportacion(mapeo.filas);
        // Los avisos de cómo se leyó cada fecha van con los de la fila (y cuentan en «Para revisar»).
        revision.forEach((r, i) => { r.avisos = (mapeo.avisosFilas[i] || []).concat(r.avisos); });
        imp = { nombre: archivo.name, mapeo, revision, mostrados: 50, filtro: '' };
        vistaPrevia();
      } catch (e) {
        imp = null;
        res.innerHTML = `<div class="mensaje error" role="alert">${esc(textoError(e, 'No se pudo leer el archivo. Revisa que sea un Excel (.xlsx) o un CSV.'))}</div>`;
      }
    }

    $('#aj-imp-archivo').addEventListener('change', async (e) => {
      const input = e.target;
      const archivo = input.files && input.files[0];
      if (!archivo) return;
      await leerImportacion(archivo);
      // El campo se vacía siempre (el nombre queda en el mensaje): así, si el archivo tenía un error, se puede
      // corregir y elegir el mismo otra vez (el navegador no avisa un cambio si se elige el mismo archivo).
      input.value = '';
    });

    $('#aj-plantilla').addEventListener('click', () => {
      try {
        const ayuda = [
          ['Cómo llenar la plantilla'],
          ['Una fila por socio. Nombre, Cédula y Teléfono son obligatorios.'],
          ['Plan: Diario, Semanal, Quincenal o Mensual (o los días: 1, 7, 15, 30). Si se deja vacío, queda Mensual.'],
          ['Vence: último día que cubre su plan. Si se deja vacío, el socio queda sin pagar.'],
          ['Fechas (Vence y Nacimiento): escríbelas como AAAA-MM-DD, por ejemplo 2026-12-01 para el 1 de diciembre de 2026. Excel las reconoce en cualquier computadora y las guarda como fechas (puede mostrarlas con otro formato; está bien).'],
          ['Evita escribir 01/12/2026: según la configuración de la computadora, Excel puede guardarla como 12 de enero en vez de 1 de diciembre.'],
          ['Guarda el archivo como Libro de Excel (.xlsx). Al subirlo, el panel muestra las fechas con el mes en letras para que las revises antes de importar.'],
          ['Etiquetas: separadas por coma (por ejemplo: Mañana, VIP).'],
          ['Si la cédula ya existe en el panel, se actualizan los datos de ese socio.'],
        ];
        Excel.descargar('plantilla-socios.xlsx', Excel.xlsx([{ nombre: 'Socios', filas: Excel.plantillaSocios(Store.hoy()) }, { nombre: 'Cómo llenarla', filas: ayuda }]));
        Admin.toast('Plantilla descargada');
      } catch (e) { Admin.toast(textoError(e, 'No se pudo descargar la plantilla.')); }
    });

    $('#aj-imp-res').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !imp) return;
      if (b.dataset.impFiltro !== undefined) {
        imp.filtro = b.dataset.impFiltro;
        imp.mostrados = 50;
        vistaPrevia();
        const x = $(`[data-imp-filtro="${imp.filtro}"]`);
        if (x) x.focus();
      } else if (b.id === 'aj-imp-mas') {
        imp.mostrados += 50;
        vistaPrevia();
        const x = $('#aj-imp-mas') || $('#aj-imp-ok');
        if (x) x.focus();
      } else if (b.id === 'aj-imp-cancelar') {
        imp = null;
        $('#aj-imp-res').innerHTML = '';
        $('#aj-imp-archivo').value = '';
        $('#aj-imp-archivo').focus();
      } else if (b.id === 'aj-imp-ok') {
        try {
          const r = Store.importarSocios(imp.mapeo.filas);
          const nombre = imp.nombre;
          imp = null;
          $('#aj-imp-archivo').value = '';
          $('#aj-imp-res').innerHTML = `
            <div class="mensaje ok aj-imp-listo" role="status" tabindex="-1">
              Listo: de «${esc(nombre)}» se ${r.creados === 1 ? 'creó 1 socio' : `crearon ${r.creados} socios`}, se ${r.actualizados === 1 ? 'actualizó 1' : `actualizaron ${r.actualizados}`} y se ${r.omitidos === 1 ? 'omitió 1 fila' : `omitieron ${r.omitidos} filas`}.
            </div>
            <a class="btn btn-borde btn-chico" href="#socios">Ver socios</a>`;
          $('.aj-imp-listo').focus();
          Admin.toast(`Importación lista: ${plural(r.creados, 'nuevo', 'nuevos')}, ${plural(r.actualizados, 'actualizado', 'actualizados')}`);
          exportables();
        } catch (err) {
          $('#aj-imp-res').insertAdjacentHTML('afterbegin', `<div class="mensaje error" role="alert">${esc(textoError(err, 'No se pudo importar.'))}</div>`);
        }
      }
    });

    // ---- Exportar ----
    function exportables() {
      const t = tablas();
      $('#aj-exp-lista').innerHTML = Object.keys(t).map((k) => {
        const n = t[k].filas.length - 1;
        return `<li class="fila">
          <div class="quien"><strong>${esc(t[k].nombre)}</strong><small>${plural(n, 'registro', 'registros')}</small></div>
          <div class="aj-export-btns">
            <button type="button" class="btn btn-gris btn-chico" data-exp="${k}" data-fmt="xlsx" aria-label="Descargar ${esc(t[k].nombre)} en Excel">Excel</button>
            <button type="button" class="btn btn-borde btn-chico" data-exp="${k}" data-fmt="csv" aria-label="Descargar ${esc(t[k].nombre)} en CSV, para Google Sheets u otros sistemas">CSV</button>
          </div>
        </li>`;
      }).join('');
    }

    $('#aj-exp-lista').addEventListener('click', (e) => {
      const b = e.target.closest('[data-exp]');
      if (!b) return;
      try {
        const t = tablas()[b.dataset.exp];
        const n = t.filas.length - 1;
        const nombre = `${t.archivo}-${Store.hoy()}.${b.dataset.fmt}`;
        if (b.dataset.fmt === 'csv') Excel.descargar(nombre, Excel.aCsv(t.filas));
        else Excel.descargar(nombre, Excel.xlsx([{ nombre: t.nombre, filas: t.filas }]));
        Store.anotar('exportacion', `${t.nombre} a ${b.dataset.fmt === 'csv' ? 'CSV' : 'Excel'} (${plural(n, 'fila', 'filas')})`);
        Admin.toast(`${t.nombre}: archivo descargado`);
      } catch (err) { Admin.toast(textoError(err, 'No se pudo exportar.')); }
    });

    $('#aj-exp-todo').addEventListener('click', () => {
      try {
        const t = tablas();
        Excel.descargar(`pilates-studio-datos-${Store.hoy()}.xlsx`, Excel.xlsx(Object.keys(t).map((k) => ({ nombre: t[k].nombre, filas: t[k].filas }))));
        Store.anotar('exportacion', 'Todo en un Excel: ' + Object.keys(t).map((k) => `${t[k].nombre.toLowerCase()} (${t[k].filas.length - 1})`).join(', '));
        Admin.toast('Excel con todos los datos descargado');
      } catch (err) { Admin.toast(textoError(err, 'No se pudo exportar.')); }
    });

    // ---- Respaldos ----
    function respaldos() {
      const lista = Store.respaldos();
      $('#aj-resp-lista').innerHTML = lista.map((r) => `
        <li class="fila">
          <div class="quien"><strong>${esc(fechaLarga(r.fecha))}${r.fecha === Store.hoy() ? ' <span class="aj-yo">(hoy)</span>' : ''}</strong><small>${Util.fechaCorta(r.fecha)} · ${kb(r.bytes)}</small></div>
          <button type="button" class="btn btn-borde btn-chico" data-restaurar="${esc(r.fecha)}" aria-label="Restaurar el respaldo del ${Util.fechaCorta(r.fecha)}">Restaurar</button>
        </li>`).join('') || '<li><p class="vacio">Todavía no hay respaldos en este navegador. Se guarda uno cada día al abrir el panel.</p></li>';
    }

    const restaurado = (texto) => {
      Admin.toast(texto);
      // Si el usuario de la sesión no está en el respaldo, el panel vuelve al acceso.
      Admin.refrescar();
    };

    $('#aj-resp-lista').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-restaurar]');
      if (!b) return;
      const fecha = b.dataset.restaurar;
      if (!(await Admin.confirmar(`¿Restaurar el respaldo del ${Util.fechaCorta(fecha)}? Los datos de ahora se reemplazan por los de ese día y lo hecho después se pierde.`, { si: 'Restaurar' }))) return;
      try {
        Store.restaurarRespaldo(fecha);
        restaurado(`Respaldo del ${Util.fechaCorta(fecha)} restaurado`);
      } catch (err) { mensaje($('#aj-resp-msg'), 'error', textoError(err)); }
    });

    $('#aj-resp-bajar').addEventListener('click', () => {
      try {
        Excel.descargar(`respaldo-pilates-studio-${Store.hoy()}.json`, Store.exportarTodo());
        Store.anotar('exportacion', 'Respaldo completo (.json)');
        Admin.toast('Respaldo descargado. Guárdalo en un lugar seguro: trae los datos de todos los socios.');
      } catch (err) { mensaje($('#aj-resp-msg'), 'error', textoError(err)); }
    });

    $('#aj-resp-archivo').addEventListener('change', async (e) => {
      const input = e.target;
      const archivo = input.files && input.files[0];
      if (!archivo) return;
      const msg = $('#aj-resp-msg');
      mensaje(msg, '', '');
      try {
        const texto = await leerTexto(archivo);
        if (!(await Admin.confirmar(`¿Reemplazar todos los datos por los del archivo «${archivo.name}»? Lo que hay ahora se pierde.`, { si: 'Restaurar' }))) { input.value = ''; return; }
        Store.restaurar(texto, `el archivo «${archivo.name}»`);
        input.value = '';
        restaurado('Datos restaurados desde el archivo');
      } catch (err) {
        input.value = '';
        mensaje(msg, 'error', textoError(err, 'No se pudo leer el archivo.'));
      }
    });

    exportables();
    respaldos();
  }

  // ===================================================================
  // Pestaña QR de Mi plan: afiche para imprimir (sección 3.1 de la propuesta)
  // ===================================================================
  // Una dirección que solo existe en esta computadora o en la red local no sirve en el celular del socio.
  function esLocal(u) {
    if (u.protocol === 'file:') return true;
    const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return h === 'localhost' || h === '::1' || h === '0.0.0.0' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || /\.local$/.test(h);
  }

  // Acepta "stars.ejemplo.com/socio.html" (le agrega https://). Solo http, https o file.
  function leerUrl(txt) {
    let t = String(txt || '').trim();
    if (!t) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = 'https://' + t;
    try {
      const u = new URL(t);
      return ['http:', 'https:', 'file:'].includes(u.protocol) && (u.protocol === 'file:' || u.hostname) ? u : null;
    } catch (e) { return null; }
  }

  const corta = (u) => (u.protocol === 'file:' ? decodeURIComponent(u.pathname.split('/').pop() || 'socio.html') + ' (archivo de esta computadora)'
    : u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname));

  function afiche(u, nombreGym) {
    return `
      <div class="afiche-cinta" aria-hidden="true"></div>
      <div class="afiche-cab"><img src="assets/logo.png" alt=""><span>${esc(nombreGym)}</span></div>
      <h3 class="afiche-titulo">Mi plan</h3>
      <p class="afiche-texto">Escanea con la cámara de tu celular para ver tu plan, renovar por Yappy y mostrar tu QR de entrada</p>
      <canvas class="afiche-qr" role="img" aria-label="Código QR que abre Mi plan (${esc(u.href)})"></canvas>
      <p class="afiche-url">${esc(corta(u))}</p>
      <ol class="afiche-pasos">
        <li><span><b>Escanea</b> este código con la cámara de tu celular.</span></li>
        <li><span><b>Entra con tu cédula.</b></span></li>
        <li><span><b>Agrégalo a tu pantalla de inicio</b> y ábrelo como una app.</span></li>
      </ol>`;
  }

  function qr(el) {
    const porDefecto = new URL('socio.html?origen=qr', location.href).href;
    const guardada = () => Store.getAjustes().urlMiPlan || porDefecto;
    const nombreGym = Store.getAjustes().nombre || Tema.nombre();
    let actual = leerUrl(guardada()) || new URL(porDefecto);

    el.innerHTML = `
      <section class="panel" aria-labelledby="aj-qr-t">
        <h2 id="aj-qr-t">QR de Mi plan</h2>
        <p class="aj-intro">Imprime este afiche y ponlo en recepción y junto al afiche de planes. El socio lo escanea con la cámara de su celular y entra a «Mi plan»: ve su plan, renueva por Yappy y muestra su QR de entrada. Lo escanea una sola vez: después lo abre desde su pantalla de inicio.</p>
        <form class="formulario" id="aj-qr-form" novalidate>
          <label>Dirección de Mi plan<input id="aj-qr-url" type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(guardada())}" aria-describedby="aj-qr-ayuda"></label>
          <small class="aj-ayuda" id="aj-qr-ayuda">Es la dirección que abre el QR. Déjala como está salvo que el estudio use otro dominio.</small>
          <div class="mensaje" id="aj-qr-msg" role="alert"></div>
          <div class="aj-linea">
            <button class="btn btn-rojo btn-chico" type="submit">Guardar dirección</button>
            <button class="btn btn-borde btn-chico" type="button" id="aj-qr-defecto">Usar la de esta página</button>
          </div>
        </form>
      </section>
      <section class="panel" aria-labelledby="aj-qrv-t">
        <h2 id="aj-qrv-t">Vista previa del afiche</h2>
        <div class="mensaje aviso" id="aj-qr-local" role="status" hidden></div>
        <div class="aj-afiche-marco"><article class="afiche" id="aj-afiche" aria-label="Afiche para imprimir"></article></div>
        <div class="aj-linea aj-qr-botones">
          <button type="button" class="btn btn-amarillo" id="aj-qr-imprimir">Imprimir afiche</button>
          <button type="button" class="btn btn-borde btn-chico" id="aj-qr-png">Descargar el QR (imagen)</button>
          <a class="btn btn-borde btn-chico" id="aj-qr-probar" target="_blank" rel="noopener">Probar la dirección</a>
        </div>
      </section>`;

    const $ = (s) => el.querySelector(s);
    // Copia del afiche para imprimir: va directo en <body> para que la impresión muestre solo eso.
    const copia = document.createElement('div');
    copia.className = 'afiche-impresion';
    copia.setAttribute('aria-hidden', 'true');
    document.body.appendChild(copia);

    function dibujar(u) {
      actual = u;
      const local = esLocal(u);
      const aviso = $('#aj-qr-local');
      aviso.hidden = !local;
      aviso.textContent = local ? 'Este QR apunta a esta computadora: imprime el afiche desde la versión publicada.' : '';
      [$('#aj-afiche'), copia].forEach((caja, i) => {
        caja.innerHTML = i ? '<article class="afiche">' + afiche(u, nombreGym) + '</article>' : afiche(u, nombreGym);
        const lienzo = caja.querySelector('canvas');
        if (window.QR && window.QR.disponible()) window.QR.dibujar(lienzo, u.href, 12);
      });
      $('#aj-qr-probar').href = u.href;
    }

    $('#aj-qr-url').addEventListener('input', (e) => {
      const u = leerUrl(e.target.value);
      if (u) { mensaje($('#aj-qr-msg'), '', ''); dibujar(u); }
    });

    $('#aj-qr-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const campo = $('#aj-qr-url');
      const u = leerUrl(campo.value);
      if (!u) {
        mensaje($('#aj-qr-msg'), 'error', 'Escribe una dirección completa, por ejemplo https://tu-dominio.com/socio.html');
        campo.focus();
        return;
      }
      try {
        // Vacía = la de la página donde esté publicado el panel (así no queda pegada una dirección vieja).
        Store.setAjustes({ urlMiPlan: u.href === porDefecto ? '' : u.href });
        campo.value = u.href;
        dibujar(u);
        mensaje($('#aj-qr-msg'), 'ok', 'Dirección guardada.');
        Admin.toast('Dirección de Mi plan guardada');
      } catch (err) { mensaje($('#aj-qr-msg'), 'error', textoError(err)); }
    });

    $('#aj-qr-defecto').addEventListener('click', () => {
      try {
        Store.setAjustes({ urlMiPlan: '' });
        $('#aj-qr-url').value = porDefecto;
        dibujar(new URL(porDefecto));
        mensaje($('#aj-qr-msg'), 'ok', 'Se usa la dirección de esta página.');
      } catch (err) { mensaje($('#aj-qr-msg'), 'error', textoError(err)); }
    });

    let finImpresion = null;
    $('#aj-qr-imprimir').addEventListener('click', () => {
      document.body.classList.add('imprimiendo-afiche');
      finImpresion = () => { document.body.classList.remove('imprimiendo-afiche'); window.removeEventListener('afterprint', finImpresion); };
      window.addEventListener('afterprint', finImpresion);
      window.print();
    });

    $('#aj-qr-png').addEventListener('click', () => {
      const lienzo = $('#aj-afiche canvas');
      if (!lienzo || !lienzo.toBlob) return;
      lienzo.toBlob((b) => { if (b) Excel.descargar('qr-mi-plan.png', b, 'image/png'); }, 'image/png');
    });

    dibujar(actual);

    // Al salir de la pantalla: se quita la copia para imprimir.
    return () => {
      if (finImpresion) finImpresion();
      copia.remove();
    };
  }

  const PINTORES = { gimnasio, usuarios, registro, datos, qr };
  let enfocarPestana = false; // tras cambiar de pestaña, el foco vuelve a la pestaña (teclado)

  function render(el) {
    const visibles = PESTANAS.filter((p) => Store.puede(p.permiso));
    if (!visibles.length) {
      el.innerHTML = '<section class="panel"><p class="vacio">Tu usuario no tiene acceso a los ajustes.</p></section>';
      return null;
    }
    const pedida = Admin.params && Admin.params.tab;
    const activa = visibles.find((p) => p.id === pedida) || visibles[0];
    el.innerHTML = `
      <div class="aj-pestanas" role="tablist" aria-label="Secciones de ajustes">
        ${visibles.map((p) => {
          const s = p === activa;
          return `<button type="button" role="tab" class="aj-pestana" id="aj-tab-${p.id}" data-tab="${p.id}" aria-selected="${s}" aria-controls="aj-panel"${s ? '' : ' tabindex="-1"'}>${esc(p.nombre)}</button>`;
        }).join('')}
      </div>
      <div class="aj-panel" id="aj-panel" role="tabpanel" aria-labelledby="aj-tab-${activa.id}"></div>`;

    const tira = el.querySelector('.aj-pestanas');
    const tabs = Array.from(tira.querySelectorAll('[role="tab"]'));
    const elegir = (id) => { enfocarPestana = true; Admin.ir('ajustes', { tab: id }); };
    tabs.forEach((t) => t.addEventListener('click', () => { if (t.dataset.tab !== activa.id) elegir(t.dataset.tab); }));
    // Flechas, Inicio y Fin mueven entre pestañas (patrón de pestañas de WAI-ARIA).
    tira.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const j = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      elegir(tabs[j].dataset.tab);
    });
    // En el celular la tira se desplaza de lado: la pestaña elegida queda a la vista y el borde se difumina
    // mientras quede algo por ver.
    const tab = tabs.find((t) => t.dataset.tab === activa.id);
    const marcarBordes = () => {
      tira.classList.toggle('mas-izq', tira.scrollLeft > 2);
      tira.classList.toggle('mas-der', tira.scrollLeft + tira.clientWidth < tira.scrollWidth - 2);
    };
    const mostrarActiva = () => {
      const t = tab.getBoundingClientRect();
      const r = tira.getBoundingClientRect();
      if (t.left < r.left || t.right > r.right) tira.scrollLeft += t.left - r.left - 24;
      marcarBordes();
    };
    mostrarActiva();
    tira.addEventListener('scroll', marcarBordes, { passive: true });
    window.addEventListener('resize', mostrarActiva);
    if (enfocarPestana) { enfocarPestana = false; tab.focus({ preventScroll: true }); }

    let fin = null;
    try { fin = PINTORES[activa.id](el.querySelector('#aj-panel')); } catch (e) {
      el.querySelector('#aj-panel').innerHTML = `<div class="mensaje error" role="alert">${esc(textoError(e))}</div>`;
      if (window.console) console.error(e);
    }
    return () => {
      window.removeEventListener('resize', mostrarActiva);
      if (typeof fin === 'function') fin();
    };
  }

  Admin.registrar('ajustes', { titulo: 'Ajustes', etiqueta: 'Ajustes', icono, render });
})();
