(function () {
  const esc = Util.escapeHtml;
  const G = window.Graficos;

  const icono = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>';
  const ico = {
    socios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.9.8 3 2.5 3 5.6"/></svg>',
    dinero: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2A2.7 2 0 0 1 9.5 15M12 6v1.5M12 16.5V18"/></svg>',
    mes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    entrada: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l4 4-4 4M14 12H3"/></svg>',
    cobrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
    mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    yappy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3M9.5 10.5l2 2 3.5-4"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };
  const TIPO_DERECHO = { acceso: 'Ver sus datos', correccion: 'Corregir sus datos', borrado: 'Borrar sus datos' };

  // `extra.confirmado`: pago Yappy recién confirmado (se muestra con su comprobante).
  function render(el, extra) {
    const hoy = Store.hoy();
    const usuario = Store.usuario();
    // Recepción no ve ingresos; las solicitudes de la Ley 81 las atiende el dueño.
    const verIngresos = Store.puede('ver:ingresos');
    const derechos = Store.puede('derechos') ? Store.derechos().filter((d) => d.estado === 'pendiente') : [];
    const socios = Store.list('socios');
    const planes = Store.planes();
    const nombrePlan = (id) => (planes.find((p) => p.id === id) || {}).nombre || '';
    const conEstado = socios.map((s) => Object.assign({}, s, { estado: Store.estadoSocio(s) }));

    const cuentaEstado = (e) => conEstado.filter((s) => s.estado === e).length;
    const activos = conEstado.filter((s) => s.estado === 'activo' || s.estado === 'por-vencer').length;
    const porVencer = conEstado
      .filter((s) => s.estado === 'por-vencer')
      .sort((a, b) => a.vence.localeCompare(b.vence));
    const vencidosLista = conEstado
      .filter((s) => s.estado === 'vencido')
      .sort((a, b) => b.vence.localeCompare(a.vence));
    const renovaciones = porVencer.concat(vencidosLista).slice(0, 10);
    const pendientes = conEstado.filter((s) => s.estado === 'pendiente');
    const solicitudes = Store.list('solicitudes').filter((x) => x.estado === 'por-confirmar');
    const enLinea = Store.list('pagos').filter((p) => p.canal === 'web')
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id).slice(0, 5);
    const ingHoy = Store.ingresos(hoy);
    const ingMes = Store.ingresos(hoy.slice(0, 7));
    const asist = Store.list('asistencias');
    const entradasHoy = asist.filter((a) => a.fecha === hoy);
    const nombreDe = (id) => (conEstado.find((s) => s.id === id) || {}).nombre || 'Socio dado de baja';
    const nombreEntrada = (a) => (a.socioId != null ? nombreDe(a.socioId) : a.nombre || 'Visitante con pase diario');
    const visitantesHoy = entradasHoy.filter((a) => a.socioId == null).length;

    // Tendencias con los datos que ya existen
    const ayer = Util.sumarDias(hoy, -1);
    const ingAyer = Store.ingresos(ayer);
    const entradasAyer = asist.filter((a) => a.fecha === ayer).length;
    const dias14 = [];
    for (let k = 13; k >= 0; k--) dias14.push(Util.sumarDias(hoy, -k));
    const serieIng = dias14.map((f) => Store.ingresos(f).total);
    const serieEnt = dias14.map((f) => asist.filter((a) => a.fecha === f).length);
    // Acumulado del mes vs. el mismo tramo del mes anterior
    const diaMes = Number(hoy.slice(8));
    const primeroMes = hoy.slice(0, 8) + '01';
    const prefMesAnt = Util.sumarDias(primeroMes, -1).slice(0, 7);
    let acum = 0;
    const serieMes = [];
    for (let d = 1; d <= diaMes; d++) { acum += Store.ingresos(hoy.slice(0, 8) + String(d).padStart(2, '0')).total; serieMes.push(acum); }
    let mesAntParcial = 0;
    for (let d = 1; d <= diaMes; d++) mesAntParcial += Store.ingresos(prefMesAnt + '-' + String(d).padStart(2, '0')).total;

    const cuando = (s) => {
      const d = Util.diasEntre(hoy, s.vence);
      if (d < 0) return `venció hace ${-d} día${d === -1 ? '' : 's'}`;
      return d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`;
    };

    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    // Al usuario de fábrica del dueño ("Dueño") se le sigue diciendo "jefe"; a los demás, por su nombre.
    const primerNombre = usuario ? String(usuario.nombre).trim().split(/\s+/)[0] : '';
    const trato = !primerNombre || (usuario.rol === 'dueno' && Util.plano(usuario.nombre) === 'dueno') ? 'jefe' : primerNombre;
    const urgentes = solicitudes.length + pendientes.length + porVencer.length + derechos.length;
    const entrenaron = entradasHoy.length === 1 ? 'Ya entrenó <strong>1</strong> persona' : `Ya entrenaron <strong>${entradasHoy.length}</strong> personas`;

    const segsCrm = Store.segmentos();
    const paraContactar = Store.SEGMENTOS.filter((x) => ['ausente', 'vence7', 'cumple'].includes(x.id));

    const segmento = [
      ['activo', cuentaEstado('activo')], ['por-vencer', cuentaEstado('por-vencer')],
      ['vencido', cuentaEstado('vencido')], ['pendiente', cuentaEstado('pendiente')],
    ];
    const totalSeg = segmento.reduce((a, s) => a + s[1], 0) || 1;

    const filaSocio = (s, sub, acciones) => `
      <div class="fila">
        ${G.avatar(s.nombre)}
        <div class="quien"><strong>${esc(s.nombre)}</strong><small>${sub}</small></div>
        <div class="acciones">${acciones}</div>
      </div>`;

    // KPI del medio: el dueño ve los ingresos (el tutorial ilumina "Ingresos hoy" como .kpi:nth-child(2));
    // recepción ve lo que tiene que atender en el mostrador.
    const kpisMedio = verIngresos ? `
        <div class="kpi" style="--acento:var(--amarillo)">
          <span class="kpi-ico">${ico.dinero}</span>
          <div class="rotulo">Ingresos hoy</div>
          <div class="valor" data-cuenta="${ingHoy.total}" data-formato="dinero">${Util.dinero(ingHoy.total)}</div>
          <div class="kpi-pie">${G.delta(ingHoy.total, ingAyer.total, 'vs ayer')}${G.sparkline(serieIng, { color: Tema.paleta().acento, etiqueta: 'Ingresos de los últimos 14 días' })}</div>
          <div class="detalle">Planes ${Util.dinero(ingHoy.planes)} · Cafetería ${Util.dinero(ingHoy.cafeteria)}</div>
        </div>
        <div class="kpi" style="--acento:#e8e8e8">
          <span class="kpi-ico">${ico.mes}</span>
          <div class="rotulo">Ingresos del mes</div>
          <div class="valor" data-cuenta="${ingMes.total}" data-formato="dinero">${Util.dinero(ingMes.total)}</div>
          <div class="kpi-pie">${G.delta(ingMes.total, mesAntParcial, 'vs mes pasado')}${G.sparkline(serieMes.length > 1 ? serieMes : [0, ...serieMes], { color: '#f2f2f2', etiqueta: 'Acumulado del mes' })}</div>
          <div class="detalle">Efectivo ${Util.dinero(ingMes.efectivo)} · Yappy ${Util.dinero(ingMes.yappy)}</div>
        </div>` : `
        <div class="kpi" style="--acento:var(--amarillo)">
          <span class="kpi-ico">${ico.yappy}</span>
          <div class="rotulo">Pagos Yappy por confirmar</div>
          <div class="valor" data-cuenta="${solicitudes.length}">${solicitudes.length}</div>
          <div class="detalle">${solicitudes.length ? 'Revisa el Yappy del estudio y confírmalos más abajo.' : 'No hay avisos de pago por revisar.'}</div>
        </div>
        <div class="kpi" style="--acento:#e8e8e8">
          <span class="kpi-ico">${ico.reloj}</span>
          <div class="rotulo">Pendientes de pago</div>
          <div class="valor" data-cuenta="${pendientes.length}">${pendientes.length}</div>
          <div class="detalle">${pendientes.length ? 'Inscritos que aún no pagan: se activan al cobrarles.' : 'Nadie inscrito está esperando pagar.'}${porVencer.length ? ` ${porVencer.length === 1 ? '1 socio vence' : `${porVencer.length} socios vencen`} en 3 días o menos.` : ''}</div>
        </div>`;

    const filaDerecho = (d) => {
      const socio = conEstado.find((s) => s.id === d.socioId);
      const dias = Util.diasEntre(d.fecha, hoy);
      const hace = dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
      return `
          <div class="fila derecho">
            ${G.avatar(d.nombre)}
            <div class="quien"><strong>${esc(d.nombre)}</strong>
              <small><b class="der-tipo">${esc(TIPO_DERECHO[d.tipo] || d.tipo)}</b> · pedida el ${Util.fechaCorta(d.fecha)} (${hace})</small>
              ${d.detalle ? `<p class="derecho-detalle">«${esc(d.detalle)}»</p>` : ''}</div>
            <div class="acciones">
              ${socio ? `<a class="btn btn-borde btn-chico" href="#socios?ficha=${socio.id}">Ver ficha</a>` : ''}
              <button type="button" class="btn btn-rojo btn-chico" data-atender="${d.id}" aria-expanded="false" aria-controls="i-der-${d.id}">Marcar atendida</button>
              ${d.tipo === 'borrado' && socio ? `<button type="button" class="btn btn-borde btn-chico btn-peligro" data-borrar-datos="${d.id}">Borrar sus datos</button>` : ''}
            </div>
            <form class="nota-form derecho-form" id="i-der-${d.id}" data-form-derecho="${d.id}" hidden novalidate>
              <label>Respuesta o nota (opcional)<textarea name="respuesta" rows="2" maxlength="500" placeholder="Ej.: Actualizamos tu teléfono."></textarea></label>
              <div class="acciones">
                <button type="submit" class="btn btn-rojo btn-chico">Guardar como atendida</button>
                <button type="button" class="btn btn-borde btn-chico" data-cancelar-derecho="${d.id}">Cancelar</button>
              </div>
            </form>
          </div>`;
    };

    const confirmado = extra && extra.confirmado;

    el.innerHTML = `
      <section class="hero">
        <div class="hero-txt">
          <span class="hero-sup">Resumen de hoy</span>
          <h2>${saludo}, ${esc(trato)}</h2>
          <p>${urgentes ? `Hoy tienes <strong>${urgentes}</strong> cosa${urgentes === 1 ? '' : 's'} por atender.` : 'Todo al día. Buen trabajo.'} ${entrenaron}${verIngresos ? ` y llevas <strong>${Util.dinero(ingHoy.total)}</strong> hoy` : ''}.</p>
        </div>
        <div class="hero-acciones">
          <a class="btn btn-amarillo" href="#cobros">${ico.cobrar}<span>Cobrar</span></a>
          <a class="btn btn-vidrio" href="#checkin">${ico.entrada}<span>Entrada</span></a>
          <a class="btn btn-vidrio" href="#socios">${ico.mas}<span>Socio</span></a>
        </div>
      </section>

      <div class="rejilla k4 kpis">
        <div class="kpi" style="--acento:var(--rojo-vivo)">
          <span class="kpi-ico">${ico.socios}</span>
          <div class="rotulo">Socios activos</div>
          <div class="valor" data-cuenta="${activos}">${activos}</div>
          <div class="segmentos" role="img" aria-label="${segmento.map((s) => Util.etiquetaEstado(s[0]) + ' ' + s[1]).join(', ')}">
            ${segmento.map((s) => s[1] ? `<i class="seg ${s[0]}" style="flex:${s[1] / totalSeg}"></i>` : '').join('')}
          </div>
          <div class="detalle">${vencidosLista.length} vencidos · ${pendientes.length} pendientes</div>
        </div>
        ${kpisMedio}
        <div class="kpi" style="--acento:#3ddc84">
          <span class="kpi-ico">${ico.entrada}</span>
          <div class="rotulo">Entradas hoy</div>
          <div class="valor" data-cuenta="${entradasHoy.length}">${entradasHoy.length}</div>
          <div class="kpi-pie">${G.delta(entradasHoy.length, entradasAyer, 'vs ayer')}${G.sparkline(serieEnt, { color: '#3ddc84', etiqueta: 'Entradas de los últimos 14 días' })}</div>
          <div class="detalle">${visitantesHoy ? `${entradasHoy.length - visitantesHoy} socio${entradasHoy.length - visitantesHoy === 1 ? '' : 's'} · ${visitantesHoy} con pase diario` : 'Socios que ya entrenaron'}</div>
        </div>
      </div>

      <div class="rejilla dos graficos-fila">
        <section class="panel">
          <h2>Socios por estado</h2>
          <div class="donut-caja">
            ${G.donut([
              { nombre: 'Activo', valor: cuentaEstado('activo'), color: '#3ddc84' },
              { nombre: 'Por vencer', valor: cuentaEstado('por-vencer'), color: '#ffc400' },
              { nombre: 'Vencido', valor: cuentaEstado('vencido'), color: '#ff3b30', patron: true },
              { nombre: 'Pendiente', valor: cuentaEstado('pendiente'), color: '#9a9a9a' },
            ], { centro: String(socios.length), sub: 'socios', etiqueta: 'Socios por estado' })}
            <ul class="leyenda vertical">
              ${[['activo', '#3ddc84', 'Activo'], ['por-vencer', '#ffc400', 'Por vencer'], ['vencido', '#ff3b30', 'Vencido'], ['pendiente', '#9a9a9a', 'Pendiente']].map(([e, c, n]) =>
                `<li><span class="insignia ${e}">${n}</span><b>${cuentaEstado(e)}</b></li>`).join('')}
            </ul>
          </div>
        </section>
        ${verIngresos ? `
        <section class="panel">
          <h2>Ingresos · últimos 7 días</h2>
          <div class="grafico-caja" id="i-barras"></div>
          ${G.leyenda([{ nombre: 'Planes', color: Tema.paleta().marca }, { nombre: 'Cafetería', color: Tema.paleta().acento, patron: true }])}
        </section>` : `
        <section class="panel">
          <h2>Entradas · últimos 7 días</h2>
          <div class="grafico-caja" id="i-entradas"></div>
        </section>`}
      </div>

      ${confirmado ? `
      <div class="mensaje ok aviso-confirmado" role="status">
        <span>Pago confirmado: <strong>${Util.dinero(confirmado.monto)}</strong> por Yappy de ${esc(nombreDe(confirmado.socioId))} · comprobante ${esc(Util.numeroComprobante(confirmado))}.</span>
        <button type="button" class="btn btn-amarillo btn-chico" data-comprobante="${confirmado.id}" id="i-ver-confirmado">Ver comprobante</button>
      </div>` : ''}

      ${solicitudes.length ? `
      <section class="panel panel-aviso">
        <h2 id="i-yappy-t" tabindex="-1">Pagos Yappy por confirmar (${solicitudes.length})</h2>
        <p class="vacio" style="margin-bottom:6px">Revisa tu Yappy y confirma: al confirmar se registra el cobro y se renueva el plan.</p>
        ${solicitudes.map((x) => `
          <div class="fila">
            ${G.avatar(nombreDe(x.socioId))}
            <div class="quien"><strong>${esc(nombreDe(x.socioId))}</strong><small>${esc(nombrePlan(x.planId))} · ${Util.dinero(x.monto)} · ${Util.fechaCorta(x.fecha)}</small></div>
            <div class="acciones">
              <button class="btn btn-rojo btn-chico" data-confirmar="${x.id}">Confirmar</button>
              <button class="btn btn-borde btn-chico" data-rechazar="${x.id}">Rechazar</button>
            </div>
          </div>`).join('')}
      </section>` : ''}

      ${derechos.length ? `
      <section class="panel panel-aviso panel-derechos" aria-labelledby="i-derechos-t">
        <h2 id="i-derechos-t" tabindex="-1">Solicitudes de datos (Ley 81) (${derechos.length})</h2>
        <p class="vacio" style="margin-bottom:6px">Los socios las piden desde «Mi plan». La Ley 81 de 2019 les da derecho a ver, corregir o borrar sus datos personales.</p>
        ${derechos.map(filaDerecho).join('')}
      </section>` : ''}

      <section class="panel">
        <h2 id="i-pagos-t" tabindex="-1">Últimos pagos en línea</h2>
        ${enLinea.length ? enLinea.map((p) => `
          <div class="fila">
            ${G.avatar(nombreDe(p.socioId))}
            <div class="quien"><strong>${esc(nombreDe(p.socioId))}</strong><small>Yappy en línea · ${esc(p.referencia)} · ${Util.fechaCorta(p.fecha)} · ${esc(Util.numeroComprobante(p))}</small></div>
            <div class="acciones"><span class="insignia activo">Registrado</span><strong class="monto">${Util.dinero(p.monto)}</strong>
              <button type="button" class="btn btn-borde btn-chico" data-comprobante="${p.id}" aria-label="Ver el comprobante ${esc(Util.numeroComprobante(p))} de ${esc(nombreDe(p.socioId))}">Comprobante</button></div>
          </div>`).join('') : G.vacio('pesas', 'Todavía no hay pagos hechos en línea.')}
      </section>

      <section class="panel">
        <h2>Para contactar hoy</h2>
        <div class="contactar-lista">
          ${paraContactar.map((x) => `<a href="#socios?seg=${x.id}"><span>${esc(x.nombre)}</span><b aria-label="${segsCrm[x.id].length} socios">${segsCrm[x.id].length}</b></a>`).join('')}
        </div>
      </section>

      <div class="rejilla dos">
        <section class="panel">
          <h2>Renovaciones</h2>
          ${renovaciones.length ? renovaciones.map((s) => {
            const wa = Admin.enlaceRecordatorio(s);
            const urg = s.estado === 'vencido' ? 'vencido' : 'por-vencer';
            return filaSocio(s, `${esc(nombrePlan(s.planId))} · <span class="cuando ${urg}">${cuando(s)}</span>`, `
                ${wa ? `<a class="btn btn-borde btn-chico" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Recordar a ${esc(s.nombre)} por WhatsApp">Recordar</a>` : ''}
                <a class="btn btn-rojo btn-chico" href="#cobros?socio=${s.id}">Cobrar</a>`);
          }).join('') : G.vacio('check', 'Nadie vence ni está vencido por ahora.')}
        </section>

        <section class="panel">
          <h2>Pendientes de pago</h2>
          ${pendientes.length ? pendientes.map((s) => filaSocio(s,
            `${s.origen === 'web' ? 'Desde la web' : 'En el estudio'} · ${esc(nombrePlan(s.planId))} · ${esc(s.telefono)}`,
            `<a class="btn btn-rojo btn-chico" href="#cobros?socio=${s.id}">Activar</a>`)).join('') : G.vacio('check', 'No hay inscripciones pendientes de pago.')}
        </section>
      </div>

      <section class="panel">
        <h2>Entradas de hoy</h2>
        ${entradasHoy.length ? entradasHoy
          .slice().sort((a, b) => b.hora.localeCompare(a.hora))
          .map((a) => `<div class="fila">${G.avatar(nombreEntrada(a))}<div class="quien"><strong>${esc(nombreEntrada(a))}</strong></div>${a.pase ? '<span class="insignia pase">Pase diario</span>' : ''}<span class="hora-chip">${esc(a.hora)}</span></div>`).join('')
          : G.vacio('pesas', 'Todavía no hay entradas registradas hoy.')}
      </section>`;

    // Gráfico de barras al ancho real del contenedor
    const dias7 = dias14.slice(7);
    const etiquetaDia = (f) => `${f.slice(8)}/${f.slice(5, 7)}`;
    const caja = el.querySelector('#i-barras');
    if (caja) {
      const W = Math.max(260, caja.clientWidth || 320);
      caja.innerHTML = G.barras(dias7.map((f) => {
        const i = Store.ingresos(f);
        return { etiqueta: etiquetaDia(f), valores: [i.planes, i.cafeteria] };
      }), [{ nombre: 'Planes', color: Tema.paleta().marca, color2: Tema.paleta().marcaOsc }, { nombre: 'Cafetería', color: Tema.paleta().acento, color2: Tema.paleta().acentoOsc, patron: true }],
      (v) => '$' + Math.round(v), 'Ingresos de los últimos 7 días, planes y cafetería', W, { H: 220 });
    }
    const cajaEnt = el.querySelector('#i-entradas');
    if (cajaEnt) {
      const W = Math.max(260, cajaEnt.clientWidth || 320);
      cajaEnt.innerHTML = G.barras(dias7.map((f) => ({ etiqueta: etiquetaDia(f), valores: [asist.filter((a) => a.fecha === f).length] })),
        [{ nombre: 'Entradas', color: '#3ddc84', color2: '#1fb866' }], (v) => String(Math.round(v)), 'Entradas de los últimos 7 días', W, { H: 220 });
    }
    G.contar(el);

    // "#inicio?ver=derechos" (desde la ficha del socio) lleva a las solicitudes. Se espera a que el panel
    // termine de subir la página al inicio.
    if (!extra && Admin.params && Admin.params.ver === 'derechos') {
      setTimeout(() => {
        const s = el.querySelector('.panel-derechos');
        const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (s) s.scrollIntoView({ block: 'start', behavior: quieto ? 'auto' : 'smooth' });
      }, 60);
    }

    // Al rehacer la pantalla, el botón que se tocó desaparece: el foco va al título de esa sección o, si la
    // sección ya no aparece, al de la que sigue. Así quien usa teclado o lector de pantalla no vuelve al principio.
    const enfocarSeccion = (...ids) => {
      const t = ids.map((id) => el.querySelector('#' + id)).find(Boolean);
      if (t) t.focus();
    };

    el.querySelectorAll('[data-comprobante]').forEach((b) => b.addEventListener('click', () => {
      if (!(window.Comprobante && Comprobante.abrir(Number(b.dataset.comprobante), { contexto: 'panel' }))) Admin.toast('No se encontró ese pago');
    }));

    el.querySelectorAll('[data-confirmar]').forEach((b) => b.addEventListener('click', () => {
      let pago = null;
      try {
        pago = Store.confirmarSolicitud(Number(b.dataset.confirmar));
        Admin.toast(`Pago confirmado: ${Util.dinero(pago.monto)} por Yappy`);
      } catch (e) {
        Admin.toast('Ese aviso ya fue atendido');
      }
      render(el, { confirmado: pago });
      const ver = el.querySelector('#i-ver-confirmado');
      if (ver) ver.focus(); else enfocarSeccion('i-yappy-t', 'i-derechos-t', 'i-pagos-t');
    }));
    el.querySelectorAll('[data-rechazar]').forEach((b) => b.addEventListener('click', async () => {
      if (await Admin.confirmar('¿Rechazar este aviso de pago? No se registrará ningún cobro.')) {
        try { Store.rechazarSolicitud(Number(b.dataset.rechazar)); } catch (e) { /* ya atendido */ }
        render(el, {});
        enfocarSeccion('i-yappy-t', 'i-derechos-t', 'i-pagos-t');
      }
    }));

    // ---- Solicitudes de la Ley 81 (solo el dueño) ----
    const errorDerecho = (err) => Admin.toast(err && err.message === 'sin-permiso'
      ? 'Solo el dueño puede atender estas solicitudes' : 'Esa solicitud ya fue atendida');
    const formDe = (id) => el.querySelector(`[data-form-derecho="${id}"]`);
    el.querySelectorAll('[data-atender]').forEach((b) => b.addEventListener('click', () => {
      const f = formDe(b.dataset.atender);
      const abrir = f.hidden;
      f.hidden = !abrir;
      b.setAttribute('aria-expanded', String(abrir));
      if (abrir) f.querySelector('textarea').focus();
    }));
    el.querySelectorAll('[data-cancelar-derecho]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.cancelarDerecho;
      formDe(id).hidden = true;
      const abrir = el.querySelector(`[data-atender="${id}"]`);
      abrir.setAttribute('aria-expanded', 'false');
      abrir.focus();
    }));
    el.querySelectorAll('[data-form-derecho]').forEach((f) => f.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        Store.atenderDerecho(Number(f.dataset.formDerecho), { respuesta: f.querySelector('textarea').value });
        Admin.toast('Solicitud marcada como atendida');
      } catch (err) { errorDerecho(err); }
      render(el, {});
      enfocarSeccion('i-derechos-t', 'i-pagos-t');
    }));
    el.querySelectorAll('[data-borrar-datos]').forEach((b) => b.addEventListener('click', async () => {
      const d = derechos.find((x) => x.id === Number(b.dataset.borrarDatos));
      if (!d) return;
      const si = await Admin.confirmar(`¿Borrar los datos de ${d.nombre}? Se elimina su ficha (datos, notas y etiquetas) y ya no podrá entrar a «Mi plan». Sus pagos y entradas quedan en los reportes, sin su nombre. Esto no se puede deshacer.`, { si: 'Borrar sus datos' });
      if (!si) return;
      const nota = formDe(d.id).querySelector('textarea').value.trim();
      try {
        Store.atenderDerecho(d.id, { borrar: true, respuesta: nota || 'Datos borrados a pedido del socio.' });
        Admin.toast(`Se borraron los datos de ${d.nombre}`);
      } catch (err) { errorDerecho(err); }
      render(el, {});
      enfocarSeccion('i-derechos-t', 'i-pagos-t');
    }));
  }

  Admin.registrar('inicio', { titulo: 'Inicio', etiqueta: 'Inicio', icono, render });
})();
