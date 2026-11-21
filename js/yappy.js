(function (root) {
  const esc = Util.escapeHtml;

  const ICONO_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICONO_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';

  let modal = null;
  let abiertoPor = null;
  let alCerrar = null; // lo que falta hacer al cerrar el comprobante de éxito (avisar a la página del pago)

  // Pase diario de un solo uso (plan diario): QR y código. El QR se dibuja en un <canvas> con dibujarPase()
  // después de insertar el HTML; si js/qr.js no está cargado, queda solo el código escrito.
  const conQR = () => !!(root.QR && root.QR.disponible && root.QR.disponible());
  const codigoLegible = (codigo) => String(codigo).replace(/^(SAGP)(\d{6})(\d{6})(\w{2})(\w{4})$/, '$1 $2 $3 $4 $5');

  // El pase vale para el día que cubre el pago (pago.desde): hoy, o el día siguiente al vencimiento si el plan seguía activo.
  function htmlPase(pago) {
    if (!pago || !pago.pase) return '';
    const deHoy = !pago.desde || pago.desde === Store.hoy();
    const titulo = deHoy ? 'Tu pase de hoy' : 'Tu pase del ' + Util.fechaCorta(pago.desde);
    return `
      <div class="ypase">
        <strong class="ypase-titulo">${esc(titulo)}</strong>
        ${conQR() ? `<div class="carnet-qr ypase-qr"><canvas role="img" aria-label="${esc('Código QR de ' + titulo.replace(/^Tu/, 'tu'))}"></canvas></div>` : ''}
        <span class="carnet-codigo">${esc(codigoLegible(pago.pase))}</span>
        <p>${deHoy ? 'Un solo uso.' : 'Un solo uso, ese día.'} Muéstralo en recepción. También lo ves en «Mi plan».</p>
      </div>`;
  }

  function dibujarPase(contenedor, pago) {
    const lienzo = contenedor.querySelector('.ypase canvas');
    if (!lienzo || !pago || !pago.pase) return;
    try {
      root.QR.dibujar(lienzo, pago.pase);
    } catch (e) {
      lienzo.parentNode.remove(); // sin QR, el código escrito sigue sirviendo en recepción
    }
  }

  function crearModal() {
    modal = document.createElement('div');
    modal.className = 'ymodal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="ymodal-caja" role="dialog" aria-modal="true" aria-labelledby="ymodal-titulo" tabindex="-1">
        <button type="button" class="ymodal-cerrar" aria-label="Cerrar">${ICONO_X}</button>
        <p class="ymodal-demo">Simulación de demostración: no se cobra dinero real.</p>
        <div id="ymodal-cuerpo"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal && !modal.dataset.espera) cerrar(); });
    modal.querySelector('.ymodal-cerrar').addEventListener('click', () => { if (!modal.dataset.espera) cerrar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden && !modal.dataset.espera) cerrar(); });
  }

  // Cierra la ventana. Si el pago ya quedó registrado, la página se entera igual con «Listo», la X, Escape o
  // tocando fuera (una sola vez). El foco vuelve a quien abrió la ventana, salvo que la página ya lo haya movido.
  function cerrar() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    const despues = alCerrar;
    alCerrar = null;
    if (despues) despues();
    const foco = document.activeElement;
    const sinFoco = !foco || foco === document.body || modal.contains(foco);
    if (sinFoco && abiertoPor && abiertoPor.isConnected && abiertoPor.focus) abiertoPor.focus();
  }

  // Abre la ventana de pago en línea. `alPagar(pago)` se llama cuando el pago quedó registrado y el usuario cierra
  // el comprobante, de cualquier forma.
  function pagarEnLinea(socio, plan, alPagar) {
    if (!modal) crearModal();
    abiertoPor = document.activeElement;
    alCerrar = null;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    delete modal.dataset.espera;
    const cuerpo = modal.querySelector('#ymodal-cuerpo');

    function formulario(error) {
      cuerpo.innerHTML = `
        <h3 id="ymodal-titulo">Pagar con Yappy</h3>
        <div class="ymodal-resumen">
          <div><small>Socio</small><strong>${esc(socio.nombre)}</strong></div>
          <div><small>Plan</small><strong>${esc(plan.nombre)}</strong></div>
          <div class="ymodal-monto"><small>Total a pagar</small><strong>${Util.dinero(plan.precio)}</strong></div>
        </div>
        <form id="ymodal-form" novalidate>
          <label class="campo"><span>Tu número de Yappy</span>
            <span class="campo-caja"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg><input name="yappy" type="tel" inputmode="tel" autocomplete="tel" placeholder="6000-0000" required></span>
          </label>
          <div class="mensaje ${error ? 'error' : ''}" role="alert">${error ? esc(error) : ''}</div>
          <button class="btn btn-amarillo btn-grande" type="submit">Pagar ${Util.dinero(plan.precio)}</button>
        </form>
        <p class="ymodal-nota">Recibirás la solicitud de pago en tu app de Yappy.</p>`;
      const input = cuerpo.querySelector('input');
      input.focus();
      cuerpo.querySelector('#ymodal-form').addEventListener('submit', (e) => {
        e.preventDefault();
        esperar(input.value);
      });
    }

    function esperar(numero) {
      modal.dataset.espera = '1';
      cuerpo.innerHTML = `
        <div class="yespera" role="status" aria-live="polite">
          <span class="yspinner" aria-hidden="true"></span>
          <h3 id="ymodal-titulo">Esperando confirmación</h3>
          <p>Aprueba el pago de <strong>${Util.dinero(plan.precio)}</strong> a ${esc(Tema.nombre())} en tu app de Yappy.</p>
        </div>`;
      setTimeout(() => {
        try {
          const pago = Store.pagarYappyEnLinea({ socioId: socio.id, planId: plan.id, telefonoYappy: numero });
          delete modal.dataset.espera;
          exito(pago);
        } catch (err) {
          delete modal.dataset.espera;
          formulario(err.message === 'telefono-yappy-invalido'
            ? 'Escribe un número de Yappy válido (7 u 8 dígitos).'
            : 'No pudimos registrar el pago. Inténtalo de nuevo.');
        }
      }, Yappy.demora);
    }

    function exito(pago) {
      alCerrar = () => { if (alPagar) alPagar(pago); };
      const actual = Store.get('socios', socio.id);
      cuerpo.innerHTML = `
        <div class="yexito">
          <span class="ycheck" aria-hidden="true">${ICONO_OK}</span>
          <h3 id="ymodal-titulo">¡Pago recibido!</h3>
          <dl class="ycomprobante">
            <div><dt>Referencia</dt><dd>${esc(pago.referencia)}</dd></div>
            <div><dt>Monto</dt><dd>${Util.dinero(pago.monto)}</dd></div>
            <div><dt>Plan</dt><dd>${esc(plan.nombre)}</dd></div>
            <div><dt>Tu plan vence</dt><dd>${Util.fechaCorta(actual.vence)}</dd></div>
          </dl>
          ${htmlPase(pago)}
          <p class="ymodal-nota">El estudio ya ve tu pago registrado. ¡A moverte!</p>
          <button type="button" class="btn btn-amarillo btn-grande" id="ymodal-listo">Listo</button>
        </div>`;
      dibujarPase(cuerpo, pago);
      const listo = cuerpo.querySelector('#ymodal-listo');
      if (pago.pase) {
        // Con el pase la ventana es más alta: se queda arriba (pago recibido y QR) y el foco espera en «Listo».
        listo.focus({ preventScroll: true });
        modal.scrollTop = 0;
      } else {
        listo.focus();
      }
      listo.addEventListener('click', cerrar);
    }

    formulario();
  }

  // Caja de pago dentro de la página: primero, pagar al número de Yappy del estudio y avisar por WhatsApp;
  // debajo, el pago en línea (simulado en la demo).
  function pintar(contenedor, socio, plan, alPagar) {
    const aj = Store.getAjustes();
    const destino = aj.whatsapp || aj.telefono;
    const mensaje = `Hola, soy ${socio.nombre} (cédula ${socio.cedula}). Pagué ${Util.dinero(plan.precio)} del plan ${plan.nombre} por Yappy. Aquí está mi comprobante.`;
    const enlace = Util.enlaceWhatsApp(destino, mensaje);

    contenedor.innerHTML = `
      <div class="yappy-caja">
        <h3>Paga por Yappy</h3>
        <p class="yappy-resumen">Plan <strong>${esc(plan.nombre)}</strong> · <strong>${Util.dinero(plan.precio)}</strong></p>

        <div class="yappy-numero">
          <div>
            <small>Envía <b>${Util.dinero(plan.precio)}</b> por Yappy al número</small>
            <strong id="yappy-numero-texto">${esc(aj.yappy)}</strong>
            ${aj.ejemplo && aj.ejemplo.yappy ? '<em>(número de ejemplo)</em>' : ''}
          </div>
          <button type="button" class="btn btn-borde btn-chico" id="yappy-copiar">Copiar número</button>
        </div>
        <ol class="yappy-pasos">
          <li>En el mensaje del pago escribe tu cédula: <strong>${esc(socio.cedula)}</strong>.</li>
          <li>Toca el botón y envía la captura del comprobante por WhatsApp.</li>
        </ol>
        ${enlace
          ? `<a class="btn btn-amarillo btn-grande" id="yappy-avisar" href="${esc(enlace)}" target="_blank" rel="noopener">Ya pagué, enviar comprobante</a>`
          : '<p class="vacio">El estudio aún no tiene un número de contacto configurado.</p>'}
        <p class="yappy-nota" id="yappy-estado" role="status">El estudio confirma tu pago en cuanto lo recibe.</p>
        ${plan.dias === 1 ? '<p class="yappy-nota">Tu pase de un solo uso aparece en «Mi plan» cuando el estudio confirme tu pago.</p>' : ''}

        <div class="yappy-o"><span>o paga en línea</span></div>
        <button type="button" class="btn btn-borde" id="yappy-pagar">Pagar en línea con Yappy</button>
        <p class="yappy-nota">Pago en línea con confirmación automática: mejora opcional (requiere Yappy Comercial). En la demo se simula.</p>
      </div>`;

    const copiar = contenedor.querySelector('#yappy-copiar');
    copiar.addEventListener('click', () => {
      const numero = aj.yappy;
      const listo = () => { copiar.textContent = '¡Copiado!'; setTimeout(() => { copiar.textContent = 'Copiar número'; }, 1800); };
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(numero).then(listo, () => { copiar.textContent = 'Cópialo a mano'; });
      } else {
        copiar.textContent = 'Cópialo a mano';
      }
    });

    contenedor.querySelector('#yappy-pagar').addEventListener('click', () => {
      pagarEnLinea(socio, plan, (pago) => {
        // El botón «Pagar en línea» desaparece: el foco pasa al título de la caja nueva, que el lector de pantalla
        // lee al llegar (más seguro que una región role=status creada ya con el texto). La página puede moverlo después.
        contenedor.innerHTML = `
          <div class="yappy-caja yappy-ok">
            <h3 tabindex="-1">¡Pago registrado!</h3>
            <p>Pagaste <strong>${Util.dinero(pago.monto)}</strong> con Yappy. Referencia <strong>${esc(pago.referencia)}</strong>.</p>
            ${htmlPase(pago)}
          </div>`;
        dibujarPase(contenedor, pago);
        contenedor.querySelector('.yappy-ok h3').focus();
        if (alPagar) alPagar(pago);
      });
    });

    const boton = contenedor.querySelector('#yappy-avisar');
    if (boton) {
      boton.addEventListener('click', () => {
        Store.solicitarPagoYappy({ socioId: socio.id, planId: plan.id });
        contenedor.querySelector('#yappy-estado').textContent = '¡Listo! Avisamos al estudio. Te confirmarán apenas vean tu pago.';
      });
    }
  }

  // `demora` (ms) simula la espera de la confirmación del banco; las pruebas la ponen en 0.
  root.Yappy = { pintar, pagarEnLinea, demora: 2200 };
})(window);
