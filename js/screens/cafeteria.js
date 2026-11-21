(function () {
  const esc = Util.escapeHtml;
  const G = window.Graficos;
  const tazaIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/></svg>';
  const icono = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/></svg>';

  function render(el) {
    const carrito = {}; // productoId -> cantidad
    let metodo = 'efectivo';

    function pintar() {
      const productos = Store.list('productos');
      const hoy = Store.hoy();
      const ventasHoy = Store.list('ventas').filter((v) => v.fecha === hoy);
      const totalHoy = ventasHoy.reduce((t, v) => t + v.total, 0);
      const lineas = productos.filter((p) => carrito[p.id]);
      const total = Math.round(lineas.reduce((t, p) => t + p.precio * carrito[p.id], 0) * 100) / 100;

      el.innerHTML = `
        <div class="rejilla dos">
          <section class="panel">
            <h2>Productos</h2>
            <div class="opciones productos">
              ${productos.map((p) => `<button type="button" class="opcion producto" data-add="${p.id}">${carrito[p.id] ? `<span class="cant" aria-label="${carrito[p.id]} en la venta">${carrito[p.id]}</span>` : ''}${tazaIco}<strong>${esc(p.nombre)}</strong><span class="precio">${Util.dinero(p.precio)}</span></button>`).join('')}
            </div>
            ${productos.length ? '' : `<p class="vacio">${Store.puede('ajustes') ? 'No hay productos. Agrégalos en Ajustes.' : 'No hay productos. Pídele al dueño que los agregue en Ajustes.'}</p>`}
          </section>

          <section class="panel formulario">
            <h2>Venta actual</h2>
            ${lineas.length ? lineas.map((p) => `
              <div class="fila">
                <div class="quien"><strong>${esc(p.nombre)}</strong><small>${Util.dinero(p.precio)} c/u</small></div>
                <div style="display:flex;align-items:center;gap:8px">
                  <button class="btn btn-borde btn-chico" data-menos="${p.id}" aria-label="Quitar uno de ${esc(p.nombre)}">−</button>
                  <strong>${carrito[p.id]}</strong>
                  <button class="btn btn-borde btn-chico" data-mas="${p.id}" aria-label="Agregar uno de ${esc(p.nombre)}">+</button>
                </div>
              </div>`).join('') : '' + G.vacio('cafe', 'Toca un producto para agregarlo.')}
            <div class="fila total"><strong>Total</strong><strong>${Util.dinero(total)}</strong></div>
            <div class="opciones">
              <button type="button" class="opcion${metodo === 'efectivo' ? ' elegida' : ''}" data-metodo="efectivo"><strong>Efectivo</strong></button>
              <button type="button" class="opcion${metodo === 'yappy' ? ' elegida' : ''}" data-metodo="yappy"><strong>Yappy</strong></button>
            </div>
            <button class="btn btn-rojo" id="v-cobrar" ${lineas.length ? '' : 'disabled'}>Cobrar ${Util.dinero(total)}</button>
          </section>
        </div>

        <section class="panel">
          <h2>Ventas de hoy · ${Util.dinero(totalHoy)}</h2>
          ${ventasHoy.length ? ventasHoy.slice().reverse().slice(0, 8).map((v) => `
            <div class="fila">
              <div class="quien"><strong>${esc(v.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', '))}</strong><small>${v.metodo === 'yappy' ? 'Yappy' : 'Efectivo'}${v.por ? ' · ' + esc(v.por) : ''}</small></div>
              <strong>${Util.dinero(v.total)}</strong>
            </div>`).join('') : '' + G.vacio('cafe', 'Aún no hay ventas hoy.')}
        </section>`;

      el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
        const id = Number(b.dataset.add);
        carrito[id] = (carrito[id] || 0) + 1;
        pintar();
      }));
      el.querySelectorAll('[data-mas]').forEach((b) => b.addEventListener('click', () => {
        carrito[Number(b.dataset.mas)] += 1; pintar();
      }));
      el.querySelectorAll('[data-menos]').forEach((b) => b.addEventListener('click', () => {
        const id = Number(b.dataset.menos);
        carrito[id] -= 1;
        if (carrito[id] <= 0) delete carrito[id];
        pintar();
      }));
      el.querySelectorAll('[data-metodo]').forEach((b) => b.addEventListener('click', () => { metodo = b.dataset.metodo; pintar(); }));
      el.querySelector('#v-cobrar').addEventListener('click', () => {
        const items = Object.keys(carrito).map((id) => ({ productoId: Number(id), cantidad: carrito[id] }));
        try {
          const v = Store.registrarVenta({ items, metodo });
          Object.keys(carrito).forEach((k) => delete carrito[k]);
          Admin.toast(`Venta registrada: ${Util.dinero(v.total)}`);
          pintar();
        } catch (e) {
          Admin.toast('No se pudo registrar la venta');
        }
      });
    }

    pintar();
  }

  Admin.registrar('cafeteria', { titulo: 'Cafetería', etiqueta: 'Café', icono, render });
})();
