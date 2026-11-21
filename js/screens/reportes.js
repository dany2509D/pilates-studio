(function () {
  const G = window.Graficos;
  const esc = Util.escapeHtml;
  const icono = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
  const ROJO = Tema.paleta().marca, AMARILLO = Tema.paleta().acento, VERDE = '#3ddc84';
  const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const DIAS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
  const AUSENTES_MAX = 8;

  // 0 = lunes … 6 = domingo (la semana del estudio empieza el lunes).
  const diaSemana = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  };
  const unDecimal = (v) => String(Math.round(v * 10) / 10);

  // Planes vendidos en el periodo: cantidad y monto de cada plan, el que más se vende primero.
  function planesVendidos(pagos, planes) {
    const filas = planes.map((p) => ({ id: p.id, nombre: p.nombre, cantidad: 0, monto: 0 }));
    pagos.forEach((pg) => {
      let f = filas.find((x) => x.id === pg.planId);
      if (!f) { f = { id: pg.planId, nombre: 'Plan que ya no existe', cantidad: 0, monto: 0 }; filas.push(f); }
      f.cantidad += 1;
      f.monto = Math.round((f.monto + pg.monto) * 100) / 100;
    });
    return filas.sort((a, b) => b.cantidad - a.cantidad || b.monto - a.monto);
  }

  // Entradas por día de la semana: total y promedio (cuántos lunes, martes… tiene el periodo).
  function entradasPorDia(fechas, asist) {
    const dias = DIAS_CORTOS.map(() => ({ total: 0, veces: 0 }));
    const enPeriodo = new Set(fechas);
    fechas.forEach((f) => { dias[diaSemana(f)].veces += 1; });
    asist.forEach((a) => { if (enPeriodo.has(a.fecha)) dias[diaSemana(a.fecha)].total += 1; });
    return dias.map((d) => Object.assign(d, { promedio: d.veces ? d.total / d.veces : 0 }));
  }

  // Socios que dejaron de venir (segmento «Sin venir hace 15+ días»), los que llevan más días primero.
  function dejaronDeVenir(hoy, asist) {
    const ultima = {};
    asist.forEach((a) => { if (a.socioId != null && (!ultima[a.socioId] || a.fecha > ultima[a.socioId])) ultima[a.socioId] = a.fecha; });
    return Store.segmentos().ausente
      .map((id) => Store.get('socios', id))
      .filter((s) => s && ultima[s.id])
      .map((s) => ({ s, ultima: ultima[s.id], dias: Util.diasEntre(ultima[s.id], hoy) }))
      .sort((a, b) => b.dias - a.dias || a.s.nombre.localeCompare(b.s.nombre, 'es'));
  }

  function render(el) {
    let rango = 7;
    let anchoPrevio = 0;

    function pintar() {
      const hoy = Store.hoy();
      const fechas = [];
      for (let k = rango - 1; k >= 0; k--) fechas.push(Util.sumarDias(hoy, -k));
      const etiqueta = (f) => `${f.slice(8)}/${f.slice(5, 7)}`;

      const porDia = fechas.map((f) => ({ f, ing: Store.ingresos(f) }));
      const total = porDia.reduce((a, d) => ({
        total: a.total + d.ing.total, planes: a.planes + d.ing.planes, cafeteria: a.cafeteria + d.ing.cafeteria,
        efectivo: a.efectivo + d.ing.efectivo, yappy: a.yappy + d.ing.yappy,
      }), { total: 0, planes: 0, cafeteria: 0, efectivo: 0, yappy: 0 });

      // Periodo anterior de la misma duración, para la variación
      const previas = [];
      for (let k = 2 * rango - 1; k >= rango; k--) previas.push(Util.sumarDias(hoy, -k));
      const totalPrev = previas.reduce((a, f) => a + Store.ingresos(f).total, 0);

      const asist = Store.list('asistencias');
      const entradas = fechas.map((f) => asist.filter((a) => a.fecha === f).length);
      const totalEntradas = entradas.reduce((a, b) => a + b, 0);
      const entradasPrev = previas.reduce((a, f) => a + asist.filter((x) => x.fecha === f).length, 0);

      const mejor = porDia.reduce((m, d) => (d.ing.total > m.ing.total ? d : m), porDia[0]);
      const promedio = total.total / rango;
      const diaPico = entradas.indexOf(Math.max(...entradas));

      const serIng = [
        { nombre: 'Planes', color: ROJO, color2: Tema.paleta().marcaOsc },
        { nombre: 'Cafetería', color: AMARILLO, color2: Tema.paleta().acentoOsc, patron: true },
      ];
      const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
      const pctEf = pct(total.efectivo, total.total);
      const pctPl = pct(total.planes, total.total);

      // Qué plan se vende más, qué días hay más gente y quién dejó de venir (propuesta: «Decidir con datos»).
      const vendidos = planesVendidos(Store.list('pagos').filter((p) => p.fecha >= fechas[0] && p.fecha <= hoy), Store.planes());
      const maxVendidos = Math.max(1, ...vendidos.map((v) => v.cantidad));
      const totalVendidos = vendidos.reduce((a, v) => a + v.cantidad, 0);
      const montoVendidos = Math.round(vendidos.reduce((a, v) => a + v.monto, 0) * 100) / 100;
      const masDinero = vendidos.reduce((m, v) => (v.monto > m.monto ? v : m), vendidos[0] || { monto: 0 });
      // Por día de la semana solo cuentan días completos: hoy todavía no termina y saldría siempre como el de
      // menos gente. Son los 7 (o 30) días anteriores a hoy.
      const diasCompletos = fechas.map((f) => Util.sumarDias(f, -1));
      const semana = entradasPorDia(diasCompletos, asist);
      const conEntradas = semana.some((d) => d.total);
      // En 7 días cada día de la semana sale una vez: se muestra el total. En 30, el promedio (salen 4 o 5 veces).
      // Se compara lo que se muestra (un decimal); con empate se nombran todos los días empatados.
      const valorDia = (d) => (rango === 7 ? d.total : d.promedio);
      const valores = semana.map((d) => Math.round(valorDia(d) * 10) / 10);
      const maximo = Math.max(...valores);
      const minimo = Math.min(...valores);
      const losDias = (v) => {
        const n = DIAS_PLURAL.filter((x, i) => valores[i] === v).map((x) => 'los ' + x);
        return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n[0];
      };
      const ausentes = dejaronDeVenir(hoy, asist);
      const plural = (n, uno, varios) => (n === 1 ? uno : varios);
      const nEntradas = (n) => `${unDecimal(n)} ${plural(n, 'entrada', 'entradas')}${rango === 7 ? '' : ' en promedio'}`;
      const datoSemana = !conEntradas ? 'Todavía no hay entradas en este periodo.'
        : maximo === minimo ? `Todos los días vino la misma cantidad de gente (${nEntradas(maximo)}).`
          : `Más gente: <strong>${losDias(maximo)}</strong> (${nEntradas(maximo)}). Menos gente: <strong>${losDias(minimo)}</strong> (${nEntradas(minimo)}).`;

      el.innerHTML = `
        <div class="herramientas segmentado" role="group" aria-label="Periodo">
          <button class="chip ${rango === 7 ? 'sel' : ''}" data-rango="7" aria-pressed="${rango === 7}">Últimos 7 días</button>
          <button class="chip ${rango === 30 ? 'sel' : ''}" data-rango="30" aria-pressed="${rango === 30}">Últimos 30 días</button>
        </div>

        <div class="rejilla k4 kpis" style="margin-bottom:14px">
          <div class="kpi" style="--acento:var(--rojo-vivo)"><div class="rotulo">Ingresos</div><div class="valor" data-cuenta="${total.total}" data-formato="dinero">${Util.dinero(total.total)}</div>
            <div class="kpi-pie">${G.delta(total.total, totalPrev, 'vs previo')}${G.sparkline(porDia.map((d) => d.ing.total), { color: ROJO, etiqueta: 'Ingresos por día' })}</div></div>
          <div class="kpi" style="--acento:var(--amarillo)"><div class="rotulo">Planes</div><div class="valor" data-cuenta="${total.planes}" data-formato="dinero">${Util.dinero(total.planes)}</div>
            <div class="kpi-pie"><span class="delta igual">${pctPl}% del total</span>${G.sparkline(porDia.map((d) => d.ing.planes), { color: AMARILLO, etiqueta: 'Planes por día' })}</div></div>
          <div class="kpi" style="--acento:#e8e8e8"><div class="rotulo">Cafetería</div><div class="valor" data-cuenta="${total.cafeteria}" data-formato="dinero">${Util.dinero(total.cafeteria)}</div>
            <div class="kpi-pie"><span class="delta igual">${100 - pctPl}% del total</span>${G.sparkline(porDia.map((d) => d.ing.cafeteria), { color: '#f2f2f2', etiqueta: 'Cafetería por día' })}</div></div>
          <div class="kpi" style="--acento:${VERDE}"><div class="rotulo">Entradas</div><div class="valor" data-cuenta="${totalEntradas}">${totalEntradas}</div>
            <div class="kpi-pie">${G.delta(totalEntradas, entradasPrev, 'vs previo')}${G.sparkline(entradas, { color: VERDE, etiqueta: 'Entradas por día' })}</div></div>
        </div>

        <div class="datos-clave">
          <div><small>Mejor día</small><strong>${etiqueta(mejor.f)}</strong><span>${Util.dinero(mejor.ing.total)}</span></div>
          <div><small>Promedio diario</small><strong>${Util.dinero(promedio)}</strong><span>en ${rango} días</span></div>
          <div><small>Día más concurrido</small><strong>${etiqueta(fechas[diaPico])}</strong><span>${entradas[diaPico]} ${plural(entradas[diaPico], 'entrada', 'entradas')}</span></div>
        </div>

        <section class="panel">
          <h2>Ingresos por día</h2>
          <div class="grafico-caja" id="r-barras"></div>
          ${G.leyenda([
            { nombre: 'Planes', color: ROJO, texto: Util.dinero(total.planes) },
            { nombre: 'Cafetería', color: AMARILLO, patron: true, texto: Util.dinero(total.cafeteria) },
          ])}
        </section>

        <div class="rejilla dos">
          <section class="panel">
            <h2>Por método de pago</h2>
            <div class="donut-caja">
              ${G.donut([
                { nombre: 'Efectivo', valor: total.efectivo, color: ROJO, texto: Util.dinero(total.efectivo) },
                { nombre: 'Yappy', valor: total.yappy, color: AMARILLO, patron: true, texto: Util.dinero(total.yappy) },
              ], { centro: pctEf + '%', sub: 'efectivo', etiqueta: `Efectivo ${pctEf}%, Yappy ${total.total ? 100 - pctEf : 0}%` })}
              ${G.leyenda([
                { nombre: 'Efectivo', color: ROJO, texto: `${Util.dinero(total.efectivo)} · ${pctEf}%` },
                { nombre: 'Yappy', color: AMARILLO, patron: true, texto: `${Util.dinero(total.yappy)} · ${total.total ? 100 - pctEf : 0}%` },
              ]).replace('class="leyenda"', 'class="leyenda vertical"')}
            </div>
          </section>
          <section class="panel">
            <h2>Asistencia por día</h2>
            <div class="grafico-caja" id="r-linea"></div>
          </section>
        </div>

        <div class="rejilla dos">
          <section class="panel" id="r-planes">
            <h2>Planes más vendidos</h2>
            <p class="vacio r-sub">${totalVendidos
              ? `${totalVendidos} ${plural(totalVendidos, 'plan vendido', 'planes vendidos')} por ${Util.dinero(montoVendidos)} en los últimos ${rango} días.`
              : `No se vendieron planes en los últimos ${rango} días.`}</p>
            <ul class="r-planes">
              ${vendidos.map((v, i) => `
                <li class="r-plan">
                  <div class="r-plan-cab">
                    <strong>${esc(v.nombre)}</strong>
                    ${i === 0 && v.cantidad ? '<span class="r-marca">Más vendido</span>' : ''}
                    ${v === masDinero && v.monto && i !== 0 ? '<span class="r-marca dinero">Deja más dinero</span>' : ''}
                    <span class="r-plan-num"><b>${v.cantidad}</b> ${plural(v.cantidad, 'vendido', 'vendidos')} · ${Util.dinero(v.monto)}${montoVendidos ? ` · ${pct(v.monto, montoVendidos)}%` : ''}</span>
                  </div>
                  <span class="r-barra" aria-hidden="true"><i style="width:${((v.cantidad / maxVendidos) * 100).toFixed(1)}%"></i></span>
                </li>`).join('')}
            </ul>
          </section>
          <section class="panel" id="r-dias">
            <h2>Entradas por día de la semana</h2>
            <p class="vacio r-sub">${rango === 7
              ? 'Entradas de cada día en los 7 días completos antes de hoy (hoy no cuenta: todavía no termina).'
              : 'Promedio de entradas de cada día de la semana en los 30 días completos antes de hoy (hoy no cuenta: todavía no termina).'}</p>
            <div class="grafico-caja" id="r-semana"></div>
            <p class="r-dato">${datoSemana}</p>
          </section>
        </div>

        <section class="panel" id="r-ausentes">
          <h2>Dejaron de venir</h2>
          <p class="vacio r-sub">${ausentes.length
            ? `${ausentes.length} ${plural(ausentes.length, 'socio no viene', 'socios no vienen')} hace 15 días o más${ausentes.length > AUSENTES_MAX ? `; aquí, los ${AUSENTES_MAX} que llevan más días` : ''}. Un mensaje a tiempo ayuda a que vuelvan.`
            : 'Ningún socio lleva 15 días o más sin venir.'}</p>
          ${ausentes.length ? ausentes.slice(0, AUSENTES_MAX).map(({ s, ultima, dias }) => {
            const estado = Store.estadoSocio(s);
            const wa = Admin.enlaceRecordatorio(s);
            return `
              <div class="fila r-ausente">
                ${G.avatar(s.nombre)}
                <div class="quien">
                  <a class="r-ficha" href="#socios?seg=ausente&amp;ficha=${s.id}" title="Ver su ficha"><strong>${esc(s.nombre)}</strong></a>
                  <small>Última vez: ${Util.fechaCorta(ultima)} <span class="insignia ${estado}">${Util.etiquetaEstado(estado)}</span></small>
                </div>
                <span class="r-dias-sin"><b>${dias}</b> días sin venir</span>
                <div class="acciones">
                  ${wa ? `<a class="btn btn-borde btn-chico" href="${esc(wa)}" target="_blank" rel="noopener" data-recordar="${s.id}" aria-label="Recordar por WhatsApp a ${esc(s.nombre)}">Recordar por WhatsApp</a>` : '<span class="vacio">Sin teléfono</span>'}
                </div>
                <div class="aviso-contacto" data-aviso="${s.id}" hidden>
                  <span>¿Ya le escribiste? Déjalo anotado en su historial.</span>
                  <button type="button" class="btn btn-amarillo btn-chico" data-contactado="${s.id}">Marcar como contactado</button>
                </div>
              </div>`;
          }).join('') : G.vacio('check', 'Todos tus socios han venido en las últimas dos semanas.')}
          ${ausentes.length ? '<a class="btn btn-borde btn-chico r-ver-todos" href="#socios?seg=ausente">Ver todos en Socios</a>' : ''}
        </section>`;

      const cb = el.querySelector('#r-barras');
      const Wb = Math.max(280, cb.clientWidth || 320);
      cb.innerHTML = G.barras(porDia.map((d) => ({ etiqueta: etiqueta(d.f), valores: [d.ing.planes, d.ing.cafeteria] })), serIng,
        (v) => '$' + Math.round(v), 'Ingresos por día, planes y cafetería', Wb);
      const cl = el.querySelector('#r-linea');
      const Wl = Math.max(260, cl.clientWidth || 320);
      cl.innerHTML = G.linea(fechas.map((f, i) => ({ etiqueta: etiqueta(f), valor: entradas[i] })), (v) => String(Math.round(v)), 'Entradas por día', Wl, { color: VERDE });
      const cs = el.querySelector('#r-semana');
      const Ws = Math.max(260, cs.clientWidth || 320);
      cs.innerHTML = G.barras(semana.map((d, i) => ({ etiqueta: DIAS_CORTOS[i], valores: [valorDia(d)] })),
        [{ nombre: rango === 7 ? 'Entradas' : 'Promedio de entradas', color: VERDE, color2: '#1f9d55' }], unDecimal,
        rango === 7 ? 'Entradas de cada día de la semana, en los 7 días completos antes de hoy' : 'Promedio de entradas por día de la semana, en los 30 días completos antes de hoy', Ws, { H: 220 });
      anchoPrevio = el.clientWidth;

      // WhatsApp solo abre el chat: no sabemos si se envió. Tras usarlo se ofrece anotarlo (como en la ficha).
      el.querySelectorAll('[data-recordar]').forEach((a) => a.addEventListener('click', () => {
        const aviso = el.querySelector(`[data-aviso="${a.dataset.recordar}"]`);
        if (aviso) aviso.hidden = false;
      }));
      el.querySelectorAll('[data-contactado]').forEach((b) => b.addEventListener('click', () => {
        Store.agregarNota(Number(b.dataset.contactado), { tipo: 'whatsapp', texto: 'Se le escribió por WhatsApp porque dejó de venir.' });
        Admin.toast('Contacto registrado');
        b.closest('.aviso-contacto').innerHTML = '<span>Contacto anotado en su historial.</span>';
      }));

      G.contar(el);
      el.querySelectorAll('[data-rango]').forEach((b) => b.addEventListener('click', () => { rango = Number(b.dataset.rango); pintar(); }));
    }

    // Si gira el teléfono o cambia el ancho, se redibujan los gráficos al nuevo tamaño.
    let t = null;
    const alCambiar = () => {
      if (!el.isConnected || Admin.pantallaActual() !== 'reportes') { window.removeEventListener('resize', alCambiar); return; }
      clearTimeout(t);
      t = setTimeout(() => { if (Math.abs(el.clientWidth - anchoPrevio) > 24) pintar(); }, 200);
    };
    window.addEventListener('resize', alCambiar);
    pintar();
  }

  Admin.registrar('reportes', { titulo: 'Reportes', etiqueta: 'Reportes', icono, render });
})();
