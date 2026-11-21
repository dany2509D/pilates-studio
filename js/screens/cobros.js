(function () {
  const esc = Util.escapeHtml;
  const G = window.Graficos;
  const icoEf = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/></svg>';
  const icoYa = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';
  const icono = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/></svg>';

  // Periodos del historial. Recepción ve hoy y ayer (para cuadrar la caja); el dueño, también los anteriores.
  const PERIODOS_DUENO = [['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['todo', 'Todo']];
  const PERIODOS_RECEPCION = [['hoy', 'Hoy'], ['ayer', 'Ayer']];
  const METODOS = [['todos', 'Todos'], ['efectivo', 'Efectivo'], ['yappy', 'Yappy']];
  const POR_PAGINA = 20;

  function render(el) {
    const planes = Store.planes();
    const sel = { socioId: null, planId: null, metodo: 'efectivo' };
    let q = '';
    // Historial de cobros (abajo): periodo, método, búsqueda, cuántos se muestran y el último cobro hecho aquí.
    const hist = { periodo: 'hoy', metodo: 'todos', q: '', mostrar: POR_PAGINA, nuevo: null };

    el.innerHTML = '<div id="c-principal"></div><section class="panel c-historial" id="c-historial" aria-labelledby="c-hist-t"></section>';
    const principal = el.querySelector('#c-principal');
    const historial = el.querySelector('#c-historial');

    if (Admin.params.socio) {
      const s = Store.get('socios', Number(Admin.params.socio));
      if (s) { sel.socioId = s.id; sel.planId = s.planId; }
    }

    function formulario() {
      const socio = sel.socioId ? Store.get('socios', sel.socioId) : null;
      const plan = planes.find((p) => p.id === sel.planId);
      principal.innerHTML = `
        <section class="panel formulario">
          <h2><span class="paso">1</span>Socio</h2>
          ${socio ? `
            <div class="fila socio-elegido" style="border:0">
              ${G.avatar(socio.nombre, 'grande')}
              <div class="quien"><strong>${esc(socio.nombre)}</strong>
                <small>${esc(socio.cedula)} · ${socio.vence ? 'vence ' + Util.fechaCorta(socio.vence) : 'aún no ha pagado'}</small></div>
              <span class="insignia ${Store.estadoSocio(socio)}">${Util.etiquetaEstado(Store.estadoSocio(socio))}</span>
            </div>
            <button class="btn btn-borde btn-chico" id="c-cambiar" style="justify-self:start">Cambiar socio</button>
          ` : `
            <input type="search" id="c-buscar" placeholder="Buscar por nombre o cédula" value="${esc(q)}" aria-label="Buscar socio">
            <div id="c-res"></div>
          `}
        </section>

        <section class="panel formulario" ${socio ? '' : 'style="opacity:.45;pointer-events:none"'}>
          <h2><span class="paso">2</span>Plan</h2>
          <div class="opciones">
            ${planes.map((p) => `<button type="button" class="opcion${p.id === sel.planId ? ' elegida' : ''}" data-plan="${p.id}"><strong>${esc(p.nombre)}</strong><span class="precio">${Util.dinero(p.precio)}</span><small>${p.dias} día${p.dias > 1 ? 's' : ''}</small></button>`).join('')}
          </div>
          <h2 style="margin-top:10px"><span class="paso">3</span>Método de pago</h2>
          <div class="opciones">
            <button type="button" class="opcion${sel.metodo === 'efectivo' ? ' elegida' : ''}" data-metodo="efectivo">${icoEf}<strong>Efectivo</strong></button>
            <button type="button" class="opcion${sel.metodo === 'yappy' ? ' elegida' : ''}" data-metodo="yappy">${icoYa}<strong>Yappy</strong></button>
          </div>
          ${socio && plan ? `<div class="mensaje aviso" style="display:block">Nuevo vencimiento: <strong>${Util.fechaCorta(Store.calcularVencimiento(socio.vence, plan.dias))}</strong></div>` : ''}
          <button class="btn btn-rojo" id="c-cobrar" ${socio && plan ? '' : 'disabled'}>Cobrar ${plan ? Util.dinero(plan.precio) : ''}</button>
        </section>`;

      const buscar = el.querySelector('#c-buscar');
      if (buscar) {
        buscar.addEventListener('input', () => { q = buscar.value; resultados(); });
        resultados();
        buscar.focus();
      }
      const cambiar = el.querySelector('#c-cambiar');
      if (cambiar) cambiar.addEventListener('click', () => { sel.socioId = null; sel.planId = null; formulario(); });
      // Solo los botones del formulario: el historial de abajo tiene sus propios filtros.
      principal.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => { sel.planId = Number(b.dataset.plan); formulario(); }));
      principal.querySelectorAll('[data-metodo]').forEach((b) => b.addEventListener('click', () => { sel.metodo = b.dataset.metodo; formulario(); }));
      el.querySelector('#c-cobrar').addEventListener('click', cobrar);
    }

    // Solo se repinta la lista de coincidencias: el campo de búsqueda no se toca mientras se escribe.
    function resultados() {
      const qq = Util.plano(q);
      const coincidencias = qq
        ? Store.list('socios').filter((s) => Util.plano(s.nombre).includes(qq) || Util.plano(s.cedula).includes(qq)).slice(0, 6)
        : [];
      const cont = el.querySelector('#c-res');
      cont.innerHTML = coincidencias.map((s) => `
        <div class="fila clicable" data-socio="${s.id}" tabindex="0" role="button">
          ${G.avatar(s.nombre)}
          <div class="quien"><strong>${esc(s.nombre)}</strong><small>${esc(s.cedula)}</small></div>
          <span class="insignia ${Store.estadoSocio(s)}">${Util.etiquetaEstado(Store.estadoSocio(s))}</span>
        </div>`).join('') + (qq && !coincidencias.length ? '<p class="vacio">No se encontró ningún socio.</p>' : '');
      cont.querySelectorAll('[data-socio]').forEach((f) => {
        const elegir = () => {
          const s = Store.get('socios', Number(f.dataset.socio));
          sel.socioId = s.id; sel.planId = s.planId; q = '';
          formulario();
        };
        f.addEventListener('click', elegir);
        f.addEventListener('keydown', (e) => { if (e.key === 'Enter') elegir(); });
      });
    }

    function cobrar() {
      let pago;
      try {
        pago = Store.cobrar({ socioId: sel.socioId, planId: sel.planId, metodo: sel.metodo });
      } catch (e) {
        Admin.toast('No se pudo registrar el cobro');
        return;
      }
      comprobante(pago);
      // El cobro recién hecho aparece arriba del historial, marcado como nuevo.
      Object.assign(hist, { periodo: 'hoy', metodo: 'todos', q: '', mostrar: POR_PAGINA, nuevo: pago.id });
      pintarHistorial();
    }

    // ---- Historial: cada cobro registrado, con su comprobante ----
    const nombrePlan = (id) => (planes.find((p) => p.id === id) || {}).nombre || '';
    const textoMetodo = (p) => (p.canal === 'web' ? 'Yappy en línea' : p.metodo === 'yappy' ? 'Yappy' : 'Efectivo');

    function etiquetaDia(f, hoy) {
      if (f === hoy) return 'Hoy';
      if (f === Util.sumarDias(hoy, -1)) return 'Ayer';
      const d = new Date(f + 'T00:00:00');
      const dia = d.toLocaleDateString('es-PA', { weekday: 'long' });
      return dia.charAt(0).toUpperCase() + dia.slice(1) + ' ' + Util.fechaCorta(f);
    }

    function datosHistorial() {
      const hoy = Store.hoy();
      const periodos = Admin.puede('ver:ingresos') ? PERIODOS_DUENO : PERIODOS_RECEPCION;
      if (!periodos.some((p) => p[0] === hist.periodo)) hist.periodo = 'hoy';
      const enPeriodo = (f) => {
        if (hist.periodo === 'hoy') return f === hoy;
        if (hist.periodo === 'ayer') return f === Util.sumarDias(hoy, -1);
        if (hist.periodo === 'todo') return f <= hoy;
        return f <= hoy && f > Util.sumarDias(hoy, -Number(hist.periodo));
      };
      const socios = new Map(Store.list('socios').map((s) => [s.id, s]));
      const delPeriodo = Store.list('pagos').filter((p) => enPeriodo(p.fecha))
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
        .map((p) => Object.assign(p, { socio: socios.get(p.socioId) || null }));
      return { hoy, periodos, delPeriodo };
    }

    function pintarHistorial() {
      const { periodos, delPeriodo } = datosHistorial();
      const suma = (lista) => Math.round(lista.reduce((t, p) => t + p.monto, 0) * 100) / 100;
      const ef = delPeriodo.filter((p) => p.metodo === 'efectivo');
      const ya = delPeriodo.filter((p) => p.metodo === 'yappy');
      const cuantos = (n) => `${n} cobro${n === 1 ? '' : 's'}`;
      const chips = (lista, clave, etiqueta) => `
        <div class="segmentado" role="group" aria-label="${etiqueta}">
          ${lista.map(([v, t]) => `<button type="button" class="chip${hist[clave] === v ? ' sel' : ''}" data-hist-${clave}="${v}" aria-pressed="${hist[clave] === v}">${t}</button>`).join('')}
        </div>`;
      historial.innerHTML = `
        <h2 id="c-hist-t">Cobros registrados</h2>
        <p class="c-hist-sub">Cada cobro queda aquí con su comprobante. Toca uno para verlo o imprimirlo.</p>
        ${chips(periodos, 'periodo', 'Periodo')}
        <div class="datos-clave c-resumen">
          <div><small>Total</small><strong>${Util.dinero(suma(delPeriodo))}</strong><span>${cuantos(delPeriodo.length)}</span></div>
          <div><small>Efectivo</small><strong>${Util.dinero(suma(ef))}</strong><span>${cuantos(ef.length)}</span></div>
          <div><small>Yappy</small><strong>${Util.dinero(suma(ya))}</strong><span>${cuantos(ya.length)}</span></div>
        </div>
        <div class="c-hist-filtros">
          <input type="search" id="c-hist-buscar" placeholder="Buscar por socio, cédula o comprobante" aria-label="Buscar en los cobros registrados" value="${esc(hist.q)}">
          ${chips(METODOS, 'metodo', 'Método de pago')}
        </div>
        <div id="c-hist-lista"></div>`;
      historial.querySelectorAll('[data-hist-periodo], [data-hist-metodo]').forEach((b) => b.addEventListener('click', () => {
        const clave = b.dataset.histPeriodo ? 'periodo' : 'metodo';
        hist[clave] = clave === 'periodo' ? b.dataset.histPeriodo : b.dataset.histMetodo;
        hist.mostrar = POR_PAGINA;
        pintarHistorial();
        const igual = historial.querySelector(`[data-hist-${clave}="${hist[clave]}"]`);
        if (igual) igual.focus();
      }));
      const buscar = historial.querySelector('#c-hist-buscar');
      buscar.addEventListener('input', () => { hist.q = buscar.value; hist.mostrar = POR_PAGINA; pintarLista(delPeriodo); });
      pintarLista(delPeriodo);
    }

    // Solo se repinta la lista (no el campo de búsqueda mientras se escribe).
    function pintarLista(delPeriodo) {
      const hoy = Store.hoy();
      const qq = Util.plano(hist.q.trim());
      const lista = delPeriodo.filter((p) => (hist.metodo === 'todos' || p.metodo === hist.metodo)
        && (!qq || [p.socio ? p.socio.nombre : '', p.socio ? p.socio.cedula : '', Util.numeroComprobante(p), p.referencia || '']
          .some((t) => Util.plano(t).includes(qq))));
      const visibles = lista.slice(0, hist.mostrar);
      let diaPrevio = null;
      const filas = visibles.map((p) => {
        const nombre = p.socio ? p.socio.nombre : 'Socio dado de baja';
        const numero = Util.numeroComprobante(p);
        const cabecera = p.fecha !== diaPrevio ? `<h3 class="c-dia">${esc(etiquetaDia(p.fecha, hoy))}</h3>` : '';
        diaPrevio = p.fecha;
        const nuevo = p.id === hist.nuevo;
        return `${cabecera}
          <div class="fila clicable c-cobro${nuevo ? ' c-nuevo' : ''}" data-pago="${p.id}" tabindex="0" role="button"
            aria-label="${esc(`Comprobante ${numero}: ${nombre}, ${nombrePlan(p.planId)}, ${Util.dinero(p.monto)} en ${textoMetodo(p)}`)}">
            ${G.avatar(nombre)}
            <div class="quien"><strong>${esc(nombre)}${nuevo ? ' <span class="c-etiqueta-nuevo">Nuevo</span>' : ''}</strong>
              <small>${esc(nombrePlan(p.planId))} · ${esc(numero)}${p.por && p.canal !== 'web' ? ' · atendió ' + esc(p.por) : ''}</small></div>
            <div class="c-monto"><strong>${Util.dinero(p.monto)}</strong><small>${esc(textoMetodo(p))}</small></div>
          </div>`;
      }).join('');
      const cont = historial.querySelector('#c-hist-lista');
      const vacio = qq || hist.metodo !== 'todos' ? 'Ningún cobro coincide con la búsqueda.' : 'Todavía no hay cobros en este periodo.';
      cont.innerHTML = (filas || G.vacio('pesas', vacio))
        + (lista.length > visibles.length
          ? `<button type="button" class="btn btn-borde c-mas" id="c-hist-mas">Ver más (${lista.length - visibles.length} más)</button>` : '');
      cont.querySelectorAll('[data-pago]').forEach((f) => {
        const abrir = () => { if (!(window.Comprobante && Comprobante.abrir(Number(f.dataset.pago), { contexto: 'panel' }))) Admin.toast('No se pudo abrir el comprobante'); };
        f.addEventListener('click', abrir);
        f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
      });
      const mas = cont.querySelector('#c-hist-mas');
      if (mas) {
        mas.addEventListener('click', () => {
          const antes = hist.mostrar;
          hist.mostrar += POR_PAGINA;
          pintarLista(delPeriodo);
          // El foco pasa al primer cobro que apareció.
          const filasNuevas = cont.querySelectorAll('[data-pago]');
          if (filasNuevas[antes]) filasNuevas[antes].focus();
        });
      }
    }

    // Mensaje de WhatsApp para el socio con los datos del cobro (y el código del pase, si es diario).
    function textoWhatsApp(pago, socio, plan) {
      const gym = Store.getAjustes().nombre || Tema.nombre();
      const nombre = String(socio.nombre).trim().split(/\s+/)[0];
      const metodo = pago.metodo === 'yappy' ? 'Yappy' : 'Efectivo';
      return `Hola ${nombre}, gracias por tu pago en ${gym}.\n`
        + `Comprobante ${Util.numeroComprobante(pago)} · Plan ${plan.nombre} · ${Util.dinero(pago.monto)} (${metodo}) · ${Util.fechaCorta(pago.fecha)}.\n`
        + (pago.pase
          ? `Tu pase diario para el ${Util.fechaCorta(pago.desde)}: ${pago.pase}. Vale una sola entrada.`
          : `Tu plan vence el ${Util.fechaCorta(pago.hasta || socio.vence)}.`);
    }

    function comprobante(pago) {
      const socio = Store.get('socios', pago.socioId);
      const plan = planes.find((p) => p.id === pago.planId);
      const numero = Util.numeroComprobante(pago);
      const wa = socio.telefono ? Util.enlaceWhatsApp(socio.telefono, textoWhatsApp(pago, socio, plan)) : null;
      const diaPase = pago.pase ? `${pago.desde.slice(8)}/${pago.desde.slice(5, 7)}` : '';
      // El código se muestra en grupos para leerlo o dictarlo; el lector acepta los espacios.
      const codigoPase = pago.pase ? pago.pase.replace(/^(SAGP)(\d{6})(\d{6})(\w{2})(\w{4})$/, '$1 $2 $3 $4 $5') : '';
      principal.innerHTML = `
        <div class="exito" role="status">
          <div class="exito-ico">${G.check}</div>
          <h2>¡Cobro registrado!</h2>
          <p class="exito-monto">${Util.dinero(pago.monto)}</p>
          <p class="exito-num">Comprobante <strong>${esc(numero)}</strong>${pago.por ? ` · Atendió: ${esc(pago.por)}` : ''}</p>
        </div>
        ${pago.pase ? `
        <section class="pase-diario" aria-labelledby="c-pase-t">
          <h3 id="c-pase-t">Pase diario</h3>
          <canvas class="pase-qr" id="c-pase-qr" role="img" aria-label="Código QR del pase diario ${esc(pago.pase)}"></canvas>
          <p class="pase-codigo">${esc(codigoPase)}</p>
          <p class="pase-texto">Pase diario de un solo uso para el ${diaPase}. El visitante puede tomarle foto: vale una sola entrada.</p>
        </section>` : ''}
        <div class="comprobante">
          <h3>Comprobante</h3>
          <dl>
            <dt>N.º</dt><dd>${esc(numero)}</dd>
            <dt>Socio</dt><dd>${esc(socio.nombre)}</dd>
            <dt>Plan</dt><dd>${esc(plan.nombre)}</dd>
            <dt>Monto</dt><dd>${Util.dinero(pago.monto)}</dd>
            <dt>Método</dt><dd>${pago.metodo === 'yappy' ? 'Yappy' : 'Efectivo'}</dd>
            <dt>Fecha</dt><dd>${Util.fechaCorta(pago.fecha)}</dd>
            <dt>Vence</dt><dd>${Util.fechaCorta(socio.vence)}</dd>
            ${pago.por ? `<dt>Atendió</dt><dd>${esc(pago.por)}</dd>` : ''}
          </dl>
        </div>
        <div class="cobro-acciones">
          <button type="button" class="btn btn-amarillo" id="c-ver-comp">Ver o imprimir comprobante</button>
          ${wa ? `<a class="btn btn-borde" href="${esc(wa)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ''}
          <button type="button" class="btn btn-rojo" id="c-otro">Nuevo cobro</button>
          <a class="btn btn-borde" href="#socios">Ver socios</a>
        </div>`;
      const lienzo = el.querySelector('#c-pase-qr');
      if (lienzo) {
        if (window.QR && QR.disponible()) QR.dibujar(lienzo, pago.pase, 12);
        else lienzo.hidden = true; // sin el dibujante de QR queda el código escrito
      }
      el.querySelector('#c-ver-comp').addEventListener('click', () => {
        if (!(window.Comprobante && Comprobante.abrir(pago.id, { contexto: 'panel' }))) Admin.toast('No se pudo abrir el comprobante');
      });
      el.querySelector('#c-otro').addEventListener('click', () => {
        sel.socioId = null; sel.planId = null; sel.metodo = 'efectivo'; q = '';
        formulario();
      });
    }

    formulario();
    pintarHistorial();
  }

  Admin.registrar('cobros', { titulo: 'Cobros', etiqueta: 'Cobros', icono, render });
})();
