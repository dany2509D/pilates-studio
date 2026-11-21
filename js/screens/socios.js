(function () {
  const esc = Util.escapeHtml;
  const G = window.Graficos;
  const icono = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.9.8 3 2.5 3 5.6"/></svg>';

  const MSG_ERROR = {
    'cedula-repetida': 'Esa cédula ya pertenece a otro socio.',
    'correo-invalido': 'El correo no parece válido. Revisa que tenga el formato nombre@dominio.com.',
    'nacimiento-invalido': 'La fecha de nacimiento no es válida (usa una fecha real que ya haya pasado).',
    'objetivo-invalido': 'Elige un objetivo de la lista.',
    'nota-vacia': 'Escribe el texto de la nota.',
    'nota-larga': 'La nota es muy larga (máximo 500 caracteres).',
    'etiqueta-vacia': 'Escribe el nombre de la etiqueta.',
    'demasiadas-etiquetas': 'Máximo 8 etiquetas por socio.',
  };
  const TIPO_NOTA = { nota: 'Nota', whatsapp: 'WhatsApp', llamada: 'Llamada' };
  const TIPO_DERECHO = { acceso: 'ver sus datos', correccion: 'corregir sus datos', borrado: 'borrar sus datos' };

  function render(el) {
    let q = '';
    let filtro = '';
    // Segmento ('seg:ausente') o etiqueta ('tag:VIP'). Puede venir de un enlace de Inicio (#socios?seg=ausente).
    let segFiltro = Admin.params && Admin.params.seg ? 'seg:' + Admin.params.seg : '';
    if (!Store.SEGMENTOS.some((x) => 'seg:' + x.id === segFiltro)) segFiltro = '';
    const planes = Store.planes();
    const nombrePlan = (id) => (planes.find((p) => p.id === id) || {}).nombre || '—';
    const nombreObjetivo = (v) => (Store.OBJETIVOS.find((o) => o[0] === v) || [])[1] || '';
    const edad = (nac) => {
      const h = Store.hoy();
      return Number(h.slice(0, 4)) - Number(nac.slice(0, 4)) - (h.slice(5) < nac.slice(5) ? 1 : 0);
    };

    function progresoSocio(s) {
      const plan = planes.find((p) => p.id === s.planId);
      if (!s.vence) return G.progreso(0, 1, 'pendiente');
      return G.progreso(Util.diasEntre(Store.hoy(), s.vence), plan ? plan.dias : 30, s.estado);
    }
    function textoDias(s) {
      if (!s.vence) return 'Aún no ha pagado';
      const d = Util.diasEntre(Store.hoy(), s.vence);
      return d < 0 ? `Venció hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'Vence hoy' : `Quedan ${d} día${d === 1 ? '' : 's'}`;
    }

    // El buscador se dibuja una sola vez; al escribir solo se repinta la lista (así no se pierde el teclado en el celular).
    function lista() {
      el.innerHTML = `
        <div class="herramientas">
          <input type="search" id="s-buscar" placeholder="Buscar por nombre o cédula" value="${esc(q)}" aria-label="Buscar socio">
          <button class="btn btn-rojo" id="s-nuevo">+ Nuevo socio</button>
        </div>
        <div class="chips" id="s-chips" role="group" aria-label="Filtrar por estado"></div>
        <div class="chips chips-seg" id="s-segs" role="group" aria-label="Filtrar por segmento o etiqueta"></div>
        <section class="panel" id="s-res"></section>`;

      el.querySelector('#s-buscar').addEventListener('input', (e) => { q = e.target.value; resultados(); });
      el.querySelector('#s-nuevo').addEventListener('click', () => formulario(null));
      resultados();
    }

    function resultados() {
      const segs = Store.segmentos();
      const etiquetas = Store.etiquetasUsadas();
      const todos = Store.list('socios').map((s) => Object.assign({}, s, { estado: Store.estadoSocio(s) }));
      const qq = Util.plano(q);
      const sep = segFiltro.indexOf(':');
      const tipoSeg = segFiltro.slice(0, sep);
      const valSeg = segFiltro.slice(sep + 1);
      const enSegmento = (s) => !segFiltro
        || (tipoSeg === 'seg' ? (segs[valSeg] || []).includes(s.id) : s.etiquetas.some((e) => Util.plano(e) === Util.plano(valSeg)));
      const visibles = todos
        .filter((s) => !filtro || s.estado === filtro)
        .filter(enSegmento)
        .filter((s) => !qq || Util.plano(s.nombre).includes(qq) || Util.plano(s.cedula).includes(qq))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

      const cuentas = { '': todos.length };
      ['activo', 'por-vencer', 'vencido', 'pendiente'].forEach((e) => { cuentas[e] = todos.filter((s) => s.estado === e).length; });
      const chips = el.querySelector('#s-chips');
      chips.innerHTML = [['', 'Todos'], ['activo', 'Activos'], ['por-vencer', 'Por vencer'], ['vencido', 'Vencidos'], ['pendiente', 'Pendientes']].map(([v, n]) =>
        `<button type="button" class="chip ${v ? 'e-' + v : ''} ${filtro === v ? 'sel' : ''}" data-chip="${v}" aria-pressed="${filtro === v}">${n}<b>${cuentas[v]}</b></button>`).join('');
      chips.querySelectorAll('[data-chip]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.chip; resultados(); }));

      const chipsSeg = el.querySelector('#s-segs');
      chipsSeg.innerHTML = Store.SEGMENTOS.map((x) => ({ v: 'seg:' + x.id, n: x.nombre, c: segs[x.id].length, cls: 'chip-seg' }))
        .concat(etiquetas.map((e) => ({ v: 'tag:' + e.nombre, n: e.nombre, c: e.cuenta, cls: 'chip-etq' })))
        .map((c) => `<button type="button" class="chip ${c.cls} ${segFiltro === c.v ? 'sel' : ''}" data-seg="${esc(c.v)}" aria-pressed="${segFiltro === c.v}"><span class="chip-ico" aria-hidden="true"></span>${esc(c.n)}<b>${c.c}</b></button>`).join('');
      chipsSeg.querySelectorAll('[data-seg]').forEach((b) => b.addEventListener('click', () => {
        segFiltro = segFiltro === b.dataset.seg ? '' : b.dataset.seg;
        resultados();
      }));

      const cont = el.querySelector('#s-res');
      cont.innerHTML = `
        <p class="vacio" style="margin-bottom:8px" aria-live="polite">${visibles.length} de ${todos.length} socios</p>
        ${visibles.length ? visibles.map((s) => `
          <div class="fila clicable socio-fila" data-ficha="${s.id}" tabindex="0" role="button">
            ${G.avatar(s.nombre)}
            <div class="quien"><strong>${esc(s.nombre)}</strong><small>${esc(s.cedula)} · ${esc(nombrePlan(s.planId))}${s.vence ? ' · vence ' + Util.fechaCorta(s.vence) : ''}</small>
              ${progresoSocio(s)}
              ${s.etiquetas.length ? `<span class="etq-linea">${s.etiquetas.map((e) => `<span class="etq">${esc(e)}</span>`).join('')}</span>` : ''}</div>
            <span class="insignia ${s.estado}">${Util.etiquetaEstado(s.estado)}</span>
          </div>`).join('') : G.vacio('socios', 'No hay socios que coincidan con los filtros o la búsqueda.')}`;
      cont.querySelectorAll('[data-ficha]').forEach((f) => {
        const abrir = () => ficha(Number(f.dataset.ficha));
        f.addEventListener('click', abrir);
        f.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
      });
    }

    function ficha(id) {
      const s = Store.get('socios', id);
      if (!s) return lista();
      const estado = Store.estadoSocio(s);
      const enlaceWa = Admin.enlaceRecordatorio(s);
      const segs = Store.segmentos();
      const susSegmentos = Store.SEGMENTOS.filter((x) => segs[x.id].includes(id));
      const notas = s.notas.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
      const sugeridas = Store.etiquetasUsadas().map((e) => e.nombre).filter((n) => !s.etiquetas.some((x) => Util.plano(x) === Util.plano(n)));
      const pagos = Store.list('pagos').filter((p) => p.socioId === id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
      const entradas = Store.list('asistencias').filter((a) => a.socioId === id).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
      const emergencia = [s.emergenciaNombre, s.emergenciaTelefono].filter(Boolean).join(' · ');
      const puedeBaja = Store.puede('socios:baja');
      // Solicitudes de la Ley 81 sin atender: aquí solo se avisan; el dueño las atiende en Inicio.
      const derPendientes = Store.derechosDe(id).filter((d) => d.estado === 'pendiente');
      const aceptoAviso = s.consentimiento && s.consentimiento.fecha;

      el.innerHTML = `
        <button class="btn btn-borde btn-chico" id="f-volver" style="margin-bottom:14px">← Volver a la lista</button>
        <section class="panel">
          <div class="ficha-cab">
            ${G.avatar(s.nombre, 'grande')}
            <div class="quien"><h2 style="margin:0;border:0;padding:0">${esc(s.nombre)}</h2>
              <span class="insignia ${estado}">${Util.etiquetaEstado(estado)}</span></div>
          </div>
          <div class="ficha-prog">${progresoSocio(s)}<span class="cuando ${estado}">${textoDias(s)}</span></div>
          ${derPendientes.length ? `
          <div class="mensaje aviso aviso-derechos" role="note">
            <strong>Solicitud de datos pendiente (Ley 81).</strong>
            ${derPendientes.map((d) => `Pidió ${esc(TIPO_DERECHO[d.tipo] || d.tipo)} el ${Util.fechaCorta(d.fecha)}${d.detalle ? `: «${esc(d.detalle)}»` : ''}.`).join(' ')}
            ${Store.puede('derechos') ? '<a href="#inicio?ver=derechos">Atiéndela en Inicio</a>' : 'La atiende el dueño desde Inicio.'}
          </div>` : ''}
          <div class="campo-doble" style="margin:8px 0 16px">
            <div><small class="vacio">Cédula</small><div>${esc(s.cedula)}</div></div>
            <div><small class="vacio">Teléfono</small><div>${esc(s.telefono)}</div></div>
            <div><small class="vacio">Plan</small><div>${esc(nombrePlan(s.planId))}</div></div>
            <div><small class="vacio">Vence</small><div>${s.vence ? Util.fechaCorta(s.vence) : 'Aún no ha pagado'}</div></div>
            <div><small class="vacio">Origen</small><div>${s.origen === 'web' ? 'Inscrito desde la web' : 'Registrado en el estudio'}</div></div>
            <div><small class="vacio">Socio desde</small><div>${Util.fechaCorta(s.creadoEn)}</div></div>
            <div><small class="vacio">Correo</small><div class="dato-largo">${s.correo ? esc(s.correo) : '—'}</div></div>
            <div><small class="vacio">Nacimiento</small><div>${s.nacimiento ? `${Util.fechaCorta(s.nacimiento)} · ${edad(s.nacimiento)} años` : '—'}</div></div>
            <div><small class="vacio">Objetivo</small><div>${esc(nombreObjetivo(s.objetivo)) || '—'}</div></div>
            <div><small class="vacio">Contacto de emergencia</small><div>${emergencia ? esc(emergencia) : '—'}</div></div>
            ${aceptoAviso ? `<div><small class="vacio">Privacidad</small><div>Aceptó el aviso de privacidad el ${Util.fechaCorta(s.consentimiento.fecha)}</div></div>` : ''}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-rojo" id="f-cobrar">${estado === 'pendiente' ? 'Activar plan' : 'Cobrar'}</button>
            ${enlaceWa ? `<a class="btn btn-borde" id="f-wa" href="${esc(enlaceWa)}" target="_blank" rel="noopener">Recordar por WhatsApp</a>` : ''}
            <button class="btn btn-borde" id="f-editar">Editar</button>
            ${puedeBaja ? '<button class="btn btn-borde" id="f-baja">Dar de baja</button>' : ''}
          </div>
          <div class="aviso-contacto" id="f-aviso" hidden>
            <span>¿Ya le escribiste por WhatsApp? Déjalo anotado en el historial.</span>
            <button type="button" class="btn btn-amarillo btn-chico" id="f-contactado">Marcar como contactado</button>
          </div>
        </section>

        <section class="panel" id="f-etiquetas">
          <h2>Etiquetas y segmentos</h2>
          <p class="vacio sub-t">Etiquetas (las pones tú)</p>
          <div class="etq-linea grande">
            ${s.etiquetas.length ? s.etiquetas.map((e) => `<span class="etq">${esc(e)}<button type="button" data-quitar-etq="${esc(e)}" aria-label="Quitar etiqueta ${esc(e)}">×</button></span>`).join('') : '<span class="vacio">Sin etiquetas todavía.</span>'}
          </div>
          <form class="etq-form" id="f-etq-form" novalidate>
            <input name="etq" list="f-etq-sug" maxlength="24" placeholder="Nueva etiqueta (VIP, estudiante…)" aria-label="Nueva etiqueta" autocomplete="off">
            <datalist id="f-etq-sug">${sugeridas.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
            <button class="btn btn-borde" type="submit">Agregar</button>
          </form>
          <div class="mensaje" id="f-etq-msg" role="alert"></div>
          <p class="vacio sub-t">Segmentos automáticos (se calculan solos)</p>
          <div class="etq-linea grande">
            ${susSegmentos.length ? susSegmentos.map((x) => `<span class="insignia seg-${x.id}">${esc(x.nombre)}</span>`).join('') : '<span class="vacio">No está en ningún segmento ahora mismo.</span>'}
          </div>
        </section>

        <section class="panel" id="f-notas">
          <h2>Notas e historial</h2>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
            <button type="button" class="btn btn-rojo btn-chico" id="n-abrir-nota">Agregar nota</button>
            <button type="button" class="btn btn-borde btn-chico" id="n-abrir-contacto">Registrar contacto</button>
          </div>
          <form class="formulario nota-form" id="n-form" hidden novalidate>
            <label>Tipo<select name="tipo" id="n-tipo">${Store.TIPOS_NOTA.map((k) => `<option value="${k}">${k === 'nota' ? 'Nota' : k === 'whatsapp' ? 'Contacto por WhatsApp' : 'Llamada'}</option>`).join('')}</select></label>
            <label>Texto<textarea name="texto" id="n-texto" rows="3" maxlength="500"></textarea></label>
            <div class="mensaje" id="n-msg" role="alert"></div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn btn-rojo btn-chico" type="submit">Guardar</button>
              <button class="btn btn-borde btn-chico" type="button" id="n-cancelar">Cancelar</button>
            </div>
          </form>
          ${notas.length ? `<ol class="linea-tiempo">${notas.map((n) => `
            <li>
              <div class="lt-cab"><span class="insignia nota-${esc(n.tipo)}">${esc(TIPO_NOTA[n.tipo] || n.tipo)}</span><time datetime="${esc(n.fecha)}">${Util.fechaCorta(n.fecha)}</time>
                <button type="button" class="lt-quitar" data-quitar-nota="${n.id}" aria-label="Quitar la nota del ${Util.fechaCorta(n.fecha)}">Quitar</button></div>
              ${n.texto ? `<p>${esc(n.texto)}</p>` : ''}
            </li>`).join('')}</ol>` : '<p class="vacio">Todavía no hay notas ni contactos registrados.</p>'}
        </section>

        <div class="rejilla dos">
          <section class="panel"><h2>Pagos</h2>
            ${pagos.length ? '<p class="vacio sub-pagos">Toca un pago para ver o imprimir su comprobante.</p>' + pagos.slice(0, 8).map((p) => {
              const num = Util.numeroComprobante(p);
              return `<div class="fila clicable pago-fila" data-pago="${p.id}" tabindex="0" role="button" aria-label="Ver el comprobante ${esc(num)}: ${Util.dinero(p.monto)} del ${Util.fechaCorta(p.fecha)}">
                <div class="quien"><strong>${Util.dinero(p.monto)} <span class="num-comp">${esc(num)}</span></strong><small>${Util.fechaCorta(p.fecha)} · ${esc(nombrePlan(p.planId))}${p.referencia ? ' · ' + esc(p.referencia) : ''}${p.por && p.canal !== 'web' ? ' · Atendió: ' + esc(p.por) : ''}</small></div>
                <span class="insignia ${p.canal === 'web' ? 'activo' : 'pendiente'}">${p.canal === 'web' ? 'Yappy en línea' : p.metodo === 'yappy' ? 'Yappy' : 'Efectivo'}</span></div>`;
            }).join('') : '<p class="vacio">Sin pagos registrados.</p>'}
          </section>
          <section class="panel"><h2>Asistencia</h2>
            ${entradas.length ? entradas.slice(0, 8).map((a) => `<div class="fila"><div class="quien"><strong>${Util.fechaCorta(a.fecha)}</strong></div><small>${esc(a.hora)}</small></div>`).join('') : '<p class="vacio">Sin entradas registradas.</p>'}
          </section>
        </div>`;

      el.querySelector('#f-volver').addEventListener('click', lista);
      el.querySelector('#f-cobrar').addEventListener('click', () => Admin.ir('cobros', { socio: id }));
      el.querySelector('#f-editar').addEventListener('click', () => formulario(id));
      const baja = el.querySelector('#f-baja');
      if (baja) baja.addEventListener('click', async () => {
        if (await Admin.confirmar(`¿Dar de baja a ${s.nombre}? Sus pagos quedan en los reportes.`, { si: 'Dar de baja' })) {
          try {
            Store.remove('socios', id);
            Admin.toast('Socio dado de baja');
          } catch (err) {
            Admin.toast(err.message === 'sin-permiso' ? 'Solo el dueño puede dar de baja a un socio' : 'No se pudo dar de baja');
          }
          lista();
        }
      });

      // Cada pago abre su comprobante (imprimir, guardar PDF o enviarlo por WhatsApp).
      el.querySelectorAll('[data-pago]').forEach((f) => {
        const abrir = () => { if (!(window.Comprobante && Comprobante.abrir(Number(f.dataset.pago), { contexto: 'panel' }))) Admin.toast('No se encontró ese pago'); };
        f.addEventListener('click', abrir);
        f.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
        });
      });

      // El enlace de WhatsApp solo abre el chat: no sabemos si se envió. Tras usarlo se ofrece anotarlo.
      const wa = el.querySelector('#f-wa');
      if (wa) wa.addEventListener('click', () => { el.querySelector('#f-aviso').hidden = false; });
      el.querySelector('#f-contactado').addEventListener('click', () => {
        Store.agregarNota(id, { tipo: 'whatsapp', texto: 'Recordatorio de renovación enviado por WhatsApp.' });
        Admin.toast('Contacto registrado');
        ficha(id);
      });

      const nForm = el.querySelector('#n-form');
      const nMsg = el.querySelector('#n-msg');
      const abrirNota = (tipo) => {
        nForm.hidden = false;
        nForm.querySelector('#n-tipo').value = tipo;
        nForm.querySelector('#n-texto').placeholder = tipo === 'nota' ? 'Escribe la nota…' : 'Detalle (opcional). Ej.: Se le recordó la renovación.';
        nMsg.className = 'mensaje'; nMsg.textContent = '';
        nForm.querySelector('#n-texto').focus();
      };
      el.querySelector('#n-abrir-nota').addEventListener('click', () => abrirNota('nota'));
      el.querySelector('#n-abrir-contacto').addEventListener('click', () => abrirNota('whatsapp'));
      el.querySelector('#n-cancelar').addEventListener('click', () => { nForm.hidden = true; nForm.reset(); });
      nForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(nForm);
        const tipo = String(f.get('tipo'));
        const texto = String(f.get('texto')).trim();
        try {
          Store.agregarNota(id, { tipo, texto: tipo === 'nota' ? texto : (texto || 'Recordatorio de renovación.') });
          Admin.toast(tipo === 'nota' ? 'Nota agregada' : 'Contacto registrado');
          ficha(id);
        } catch (err) {
          nMsg.className = 'mensaje error'; nMsg.textContent = MSG_ERROR[err.message] || 'No se pudo guardar la nota.';
        }
      });
      el.querySelectorAll('[data-quitar-nota]').forEach((b) => b.addEventListener('click', async () => {
        if (await Admin.confirmar('¿Quitar esta nota del historial?')) { Store.quitarNota(id, Number(b.dataset.quitarNota)); ficha(id); }
      }));

      el.querySelector('#f-etq-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = el.querySelector('#f-etq-msg');
        try {
          Store.agregarEtiqueta(id, new FormData(e.target).get('etq'));
          ficha(id);
          const campo = el.querySelector('#f-etq-form input');
          if (campo) campo.focus();
        } catch (err) {
          msg.className = 'mensaje error'; msg.textContent = MSG_ERROR[err.message] || 'No se pudo agregar la etiqueta.';
        }
      });
      el.querySelectorAll('[data-quitar-etq]').forEach((b) => b.addEventListener('click', () => {
        Store.quitarEtiqueta(id, b.dataset.quitarEtq);
        ficha(id);
      }));
    }

    function formulario(id) {
      const s = id ? Store.get('socios', id) : {
        nombre: '', cedula: '', telefono: '', planId: planes[planes.length - 1].id,
        correo: '', nacimiento: '', objetivo: '', emergenciaNombre: '', emergenciaTelefono: '',
      };
      el.innerHTML = `
        <button class="btn btn-borde btn-chico" id="e-volver" style="margin-bottom:14px">← Cancelar</button>
        <form class="panel formulario" id="e-form" novalidate>
          <h2>${id ? 'Editar socio' : 'Nuevo socio'}</h2>
          <label>Nombre completo<input name="nombre" value="${esc(s.nombre)}" required></label>
          <div class="campo-doble">
            <label>Cédula<input name="cedula" value="${esc(s.cedula)}" required></label>
            <label>Teléfono<input name="telefono" type="tel" value="${esc(s.telefono)}" required></label>
          </div>
          <label>Plan<select name="planId">${planes.map((p) => `<option value="${p.id}"${p.id === s.planId ? ' selected' : ''}>${esc(p.nombre)} — ${Util.dinero(p.precio)}</option>`).join('')}</select></label>
          <fieldset class="opcionales">
            <legend>Datos opcionales</legend>
            <div class="campo-doble">
              <label>Correo<input name="correo" type="email" value="${esc(s.correo)}" autocomplete="off"></label>
              <label>Fecha de nacimiento<input name="nacimiento" type="date" min="1900-01-01" max="${esc(Store.hoy())}" value="${esc(s.nacimiento)}"></label>
            </div>
            <label>Objetivo de entrenamiento<select name="objetivo"><option value="">Sin definir</option>${Store.OBJETIVOS.map(([v, n]) => `<option value="${v}"${v === s.objetivo ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            <div class="campo-doble">
              <label>Emergencia: nombre<input name="emergenciaNombre" value="${esc(s.emergenciaNombre)}"></label>
              <label>Emergencia: teléfono<input name="emergenciaTelefono" type="tel" value="${esc(s.emergenciaTelefono)}"></label>
            </div>
          </fieldset>
          <div class="mensaje" id="e-msg" role="alert"></div>
          <button class="btn btn-rojo" type="submit">Guardar</button>
        </form>`;
      el.querySelector('#e-volver').addEventListener('click', () => (id ? ficha(id) : lista()));
      el.querySelector('#e-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const val = (k) => String(f.get(k)).trim();
        const datos = {
          nombre: val('nombre'), cedula: val('cedula'), telefono: val('telefono'), planId: Number(f.get('planId')),
          correo: val('correo'), nacimiento: val('nacimiento'), objetivo: String(f.get('objetivo')),
          emergenciaNombre: val('emergenciaNombre'), emergenciaTelefono: val('emergenciaTelefono'),
        };
        const msg = el.querySelector('#e-msg');
        if (!datos.nombre || !datos.cedula || !datos.telefono) {
          msg.className = 'mensaje error'; msg.textContent = 'Completa nombre, cédula y teléfono.'; return;
        }
        try {
          if (id) {
            Store.update('socios', id, datos);
            Admin.toast('Cambios guardados');
            ficha(id);
          } else {
            const nuevo = Store.create('socios', Object.assign(datos, { vence: null, origen: 'panel', creadoEn: Store.hoy() }));
            Admin.toast('Socio creado');
            ficha(nuevo.id);
          }
        } catch (err) {
          msg.className = 'mensaje error';
          msg.textContent = MSG_ERROR[err.message] || 'No se pudo guardar.';
        }
      });
    }

    // "#socios?ficha=3" abre directo la ficha (p. ej. desde las solicitudes de datos en Inicio).
    const fichaPedida = Number(Admin.params && Admin.params.ficha);
    if (fichaPedida && Store.get('socios', fichaPedida)) ficha(fichaPedida); else lista();
  }

  Admin.registrar('socios', { titulo: 'Socios', etiqueta: 'Socios', icono, render });
})();
