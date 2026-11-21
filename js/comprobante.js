// Comprobante interno de un pago (no es factura fiscal). Lo usan el panel (Cobros, ficha del socio)
// y "Mi plan". Se ve en una ventana propia y se imprime o se guarda como PDF desde el navegador.
//   Comprobante.html(pagoId)               → HTML del comprobante (o '' si el pago no existe)
//   Comprobante.abrir(pagoId, { contexto }) → abre la ventana. contexto 'panel' (enviar por WhatsApp
//                                            al socio) o 'socio' (compartir desde el celular).
(function (root) {
  const esc = Util.escapeHtml;
  let caja = null;
  let abiertoPor = null;

  function datos(pagoId) {
    const pago = Store.get('pagos', pagoId);
    if (!pago) return null;
    const socio = Store.get('socios', pago.socioId);
    const plan = Store.planes().find((p) => p.id === pago.planId) || { nombre: '—', dias: 0 };
    return { pago, socio, plan, aj: Store.getAjustes() };
  }

  function metodo(pago) {
    if (pago.canal === 'web') return 'Yappy en línea';
    return pago.metodo === 'yappy' ? 'Yappy' : 'Efectivo';
  }

  function html(pagoId) {
    const d = datos(pagoId);
    if (!d) return '';
    const { pago, socio, plan, aj } = d;
    const periodo = pago.desde && pago.hasta
      ? (pago.desde === pago.hasta ? Util.fechaCorta(pago.desde) : `${Util.fechaCorta(pago.desde)} al ${Util.fechaCorta(pago.hasta)}`)
      : '—';
    const fila = (dt, dd) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`;
    return `
      <article class="comp" aria-labelledby="comp-titulo">
        <header class="comp-cab">
          <img src="assets/logo.png" alt="">
          <div>
            <strong>${esc(aj.nombre || Tema.nombre())}</strong>
            <small>${esc(aj.telefono || '')}${aj.direccion ? ' · ' + esc(aj.direccion) : ''}</small>
          </div>
        </header>
        <h2 id="comp-titulo">Comprobante de pago</h2>
        <p class="comp-numero">N.º <strong>${esc(Util.numeroComprobante(pago))}</strong> · ${Util.fechaCorta(pago.fecha)}</p>
        <dl class="comp-datos">
          ${fila('Socio', socio ? esc(socio.nombre) : 'Socio dado de baja')}
          ${socio ? fila('Cédula', esc(socio.cedula)) : ''}
          ${fila('Plan', esc(plan.nombre))}
          ${fila('Periodo', periodo)}
          ${fila('Método', esc(metodo(pago)))}
          ${pago.referencia ? fila('Referencia Yappy', esc(pago.referencia)) : ''}
          ${pago.yappyTerminado ? fila('Yappy que pagó', '••••' + esc(pago.yappyTerminado)) : ''}
          ${pago.pase ? fila('Pase diario', `Un solo uso, para el ${Util.fechaCorta(pago.desde)}`) : ''}
          ${pago.por ? fila('Atendió', esc(pago.por)) : ''}
        </dl>
        <p class="comp-total"><span>Total pagado</span><strong>${Util.dinero(pago.monto)}</strong></p>
        <p class="comp-nota">Comprobante interno del estudio. No es una factura fiscal.</p>
      </article>`;
  }

  function texto(d) {
    const { pago, socio, plan, aj } = d;
    return `${aj.nombre || Tema.nombre()} · Comprobante ${Util.numeroComprobante(pago)}\n`
      + `${socio ? socio.nombre + ' · ' : ''}Plan ${plan.nombre} · ${Util.dinero(pago.monto)} (${metodo(pago)})\n`
      + `Fecha: ${Util.fechaCorta(pago.fecha)}${pago.hasta ? ' · Vence: ' + Util.fechaCorta(pago.hasta) : ''}`;
  }

  function cerrar() {
    if (!caja || caja.hidden) return;
    caja.hidden = true;
    document.body.classList.remove('comp-abierto');
    if (abiertoPor && abiertoPor.focus) abiertoPor.focus();
  }

  function crear() {
    caja = document.createElement('div');
    caja.className = 'comp-modal';
    caja.hidden = true;
    caja.innerHTML = '<div class="comp-ventana" role="dialog" aria-modal="true" aria-label="Comprobante de pago" tabindex="-1"></div>';
    document.body.appendChild(caja);
    caja.addEventListener('click', (e) => { if (e.target === caja) cerrar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && caja && !caja.hidden) cerrar(); });
  }

  function abrir(pagoId, opciones) {
    const d = datos(pagoId);
    if (!d) return false;
    const contexto = (opciones && opciones.contexto) || 'panel';
    if (!caja) crear();
    abiertoPor = document.activeElement;
    const enlace = contexto === 'panel' && d.socio ? Util.enlaceWhatsApp(d.socio.telefono, texto(d)) : null;
    const compartir = contexto === 'socio' && root.navigator && typeof root.navigator.share === 'function';
    const ventana = caja.querySelector('.comp-ventana');
    ventana.innerHTML = html(pagoId) + `
      <div class="comp-acciones">
        <button type="button" class="btn btn-amarillo" data-comp="imprimir">Imprimir o guardar PDF</button>
        ${enlace ? `<a class="btn btn-borde" href="${esc(enlace)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ''}
        ${compartir ? '<button type="button" class="btn btn-borde" data-comp="compartir">Compartir</button>' : ''}
        <button type="button" class="btn btn-borde" data-comp="cerrar">Cerrar</button>
      </div>`;
    ventana.querySelector('[data-comp="imprimir"]').addEventListener('click', () => {
      document.body.classList.add('imprimiendo-comprobante');
      const fin = () => { document.body.classList.remove('imprimiendo-comprobante'); root.removeEventListener('afterprint', fin); };
      root.addEventListener('afterprint', fin);
      root.print();
      setTimeout(fin, 1000);
    });
    const btnCompartir = ventana.querySelector('[data-comp="compartir"]');
    if (btnCompartir) btnCompartir.addEventListener('click', () => { root.navigator.share({ title: 'Comprobante de pago', text: texto(d) }).catch(() => {}); });
    ventana.querySelector('[data-comp="cerrar"]').addEventListener('click', cerrar);
    caja.hidden = false;
    document.body.classList.add('comp-abierto');
    ventana.focus();
    return true;
  }

  root.Comprobante = { html, abrir, cerrar };
})(window);
