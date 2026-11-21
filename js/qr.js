/* QR del carnet como SVG, con js/vendor/qrcode.js (qrcode-generator, licencia MIT).
   Se usa en "Mi plan"; también corre en Node para las pruebas (tests/store.test.js). */
(function (root) {
  const MARGEN = 4; // zona blanca alrededor, en módulos: la pide el estándar para que el QR se lea

  function generador() {
    if (typeof root.qrcode === 'function') return root.qrcode;
    if (typeof require === 'function') return require('./vendor/qrcode.js');
    return null;
  }

  // Matriz de módulos (true = negro). Nivel de corrección Q: aguanta brillos y rayas en la pantalla y,
  // con un código de 11 caracteres, el QR queda de 21×21 módulos (cuadros grandes, fáciles de leer).
  function matriz(texto) {
    const t = String(texto);
    const qr = generador()(0, 'Q');
    qr.addData(t, /^[0-9A-Z $%*+\-./:]+$/.test(t) ? 'Alphanumeric' : 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const filas = [];
    for (let r = 0; r < n; r++) {
      const fila = [];
      for (let c = 0; c < n; c++) fila.push(qr.isDark(r, c));
      filas.push(fila);
    }
    return filas;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // Un solo <path> hecho de tramos horizontales: liviano y sin rayitas entre cuadros al escalar.
  function svg(texto, etiqueta) {
    const m = matriz(texto);
    const n = m.length;
    const lado = n + MARGEN * 2;
    let d = '';
    m.forEach((fila, r) => {
      for (let c = 0; c < n; c++) {
        if (!fila[c]) continue;
        let fin = c;
        while (fin + 1 < n && fila[fin + 1]) fin++;
        const largo = fin - c + 1;
        d += `M${c + MARGEN} ${r + MARGEN}h${largo}v1h-${largo}z`;
        c = fin;
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" role="img" aria-label="${esc(etiqueta || 'Código QR')}" shape-rendering="crispEdges">`
      + `<rect width="${lado}" height="${lado}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  // Dibuja el QR en un <canvas> (lo que ve el socio en "Mi plan"). El modo oscuro forzado de algunos navegadores
  // (Samsung Internet) recolorea un SVG y el QR deja de leerse; los píxeles de un canvas no los toca.
  // El blanco del margen va pintado en el canvas mismo, no depende del fondo de la página.
  function dibujar(lienzo, texto, escala) {
    const m = matriz(texto);
    const k = escala || 24;
    const lado = (m.length + MARGEN * 2) * k;
    lienzo.width = lado;
    lienzo.height = lado;
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lado, lado);
    ctx.fillStyle = '#000';
    m.forEach((fila, r) => fila.forEach((negro, c) => {
      if (negro) ctx.fillRect((c + MARGEN) * k, (r + MARGEN) * k, k, k);
    }));
    return lienzo;
  }

  const QR = { MARGEN, matriz, svg, dibujar, disponible: () => typeof generador() === 'function' };
  root.QR = QR;
  if (typeof module !== 'undefined') module.exports = QR;
})(typeof window !== 'undefined' ? window : globalThis);
