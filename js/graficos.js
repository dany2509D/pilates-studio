/* Ayudas visuales del panel: gráficos SVG propios, números animados, avatares y tooltips. Sin librerías. */
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sinMovimiento = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const PAL = (root.Tema && root.Tema.paleta()) || { marca: '#3b82f6', marcaOsc: '#1d4ed8', acento: '#22d3ee', acentoOsc: '#0891b2' };
  const COLORES = { rojo: PAL.marca, rojoOscuro: PAL.marcaOsc, amarillo: PAL.acento, verde: '#3ddc84', gris: '#8a8a8a' };
  let uid = 0;
  const nuevoId = (p) => p + (++uid);

  /* ---------- Números que cuentan hacia arriba ---------- */
  function formatear(n, tipo) {
    if (tipo === 'dinero') return '$' + n.toFixed(2);
    if (tipo === 'dinero0') return '$' + Math.round(n);
    return String(Math.round(n));
  }
  function contar(raiz) {
    raiz.querySelectorAll('[data-cuenta]').forEach((el) => {
      const fin = Number(el.dataset.cuenta) || 0;
      const tipo = el.dataset.formato || 'entero';
      if (sinMovimiento() || !fin) { el.textContent = formatear(fin, tipo); return; }
      const dur = 900 + Math.min(600, fin * 0.4);
      const t0 = performance.now();
      const paso = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = formatear(fin * e, tipo);
        if (p < 1 && el.isConnected) requestAnimationFrame(paso); else el.textContent = formatear(fin, tipo);
      };
      el.textContent = formatear(0, tipo);
      requestAnimationFrame(paso);
    });
  }

  /* ---------- Variación (▲ ▼ con texto, no solo color) ---------- */
  function delta(actual, anterior, vs) {
    if (!anterior && !actual) return `<span class="delta igual"><b aria-hidden="true">•</b> Sin cambio ${esc(vs)}</span>`;
    if (!anterior) return `<span class="delta igual"><b aria-hidden="true">•</b> Sin datos ${esc(vs)}</span>`;
    const pct = Math.round(((actual - anterior) / anterior) * 100);
    if (pct === 0) return `<span class="delta igual"><b aria-hidden="true">•</b> Igual ${esc(vs)}</span>`;
    return pct > 0
      ? `<span class="delta sube"><b aria-hidden="true">▲</b> +${pct}% ${esc(vs)}</span>`
      : `<span class="delta baja"><b aria-hidden="true">▼</b> ${pct}% ${esc(vs)}</span>`;
  }

  /* ---------- Sparkline ---------- */
  function sparkline(valores, opc) {
    const o = Object.assign({ color: COLORES.rojo, ancho: 120, alto: 38, etiqueta: 'Tendencia' }, opc);
    const n = valores.length;
    if (n < 2) return '';
    const max = Math.max(...valores, 1), min = Math.min(...valores, 0);
    const rango = max - min || 1;
    const pad = 4;
    const pts = valores.map((v, i) => [pad + (i / (n - 1)) * (o.ancho - pad * 2), pad + (1 - (v - min) / rango) * (o.alto - pad * 2)]);
    const linea = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = linea + ` L${pts[n - 1][0].toFixed(1)} ${o.alto} L${pts[0][0].toFixed(1)} ${o.alto} Z`;
    const id = nuevoId('sp');
    return `<svg class="spark" viewBox="0 0 ${o.ancho} ${o.alto}" preserveAspectRatio="none" role="img" aria-label="${esc(o.etiqueta)}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.color}" stop-opacity=".45"/><stop offset="1" stop-color="${o.color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${id})"/>
      <path class="spark-linea" d="${linea}" fill="none" stroke="${o.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" pathLength="100" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  /* ---------- Donut ---------- */
  // partes: [{nombre, valor, color, patron}]
  function donut(partes, opc) {
    const o = Object.assign({ tam: 168, grosor: 22, centro: '', sub: '', etiqueta: 'Distribución' }, opc);
    const total = partes.reduce((a, p) => a + p.valor, 0);
    const r = (o.tam - o.grosor) / 2, c = o.tam / 2, circ = 2 * Math.PI * r;
    let acum = 0;
    const id = nuevoId('dn');
    let defs = '';
    let arcos = '';
    partes.forEach((p, i) => {
      if (!p.valor) return;
      const len = (p.valor / total) * circ;
      const sep = partes.filter((x) => x.valor).length > 1 ? Math.min(3, len * 0.2) : 0;
      let relleno = p.color;
      if (p.patron) {
        defs += `<pattern id="${id}p${i}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${p.color}"/><rect width="2.4" height="6" fill="rgba(0,0,0,.35)"/></pattern>`;
        relleno = `url(#${id}p${i})`;
      }
      arcos += `<circle class="arco" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${relleno}" stroke-width="${o.grosor}"
        stroke-dasharray="${Math.max(0, len - sep).toFixed(2)} ${(circ - Math.max(0, len - sep)).toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}"
        transform="rotate(-90 ${c} ${c})" tabindex="0" data-tip="${esc(p.nombre)}: ${esc(p.texto != null ? p.texto : p.valor)} (${Math.round((p.valor / total) * 100)}%)" style="--len:${len.toFixed(2)};--circ:${circ.toFixed(2)}"/>`;
      acum += len;
    });
    if (!total) arcos = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#2c2c2c" stroke-width="${o.grosor}" stroke-dasharray="4 6"/>`;
    return `<div class="donut" style="width:${o.tam}px;height:${o.tam}px">
      <svg viewBox="0 0 ${o.tam} ${o.tam}" role="img" aria-label="${esc(o.etiqueta)}"><defs>${defs}</defs>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#242424" stroke-width="${o.grosor}"/>${arcos}</svg>
      <div class="donut-centro"><strong>${o.centro}</strong><small>${esc(o.sub)}</small></div></div>`;
  }

  /* ---------- Barras (apiladas, con degradado y patrón) ---------- */
  // dias: [{etiqueta, valores:[a,b]}]; series: [{nombre, color, patron}]
  function barras(dias, series, formato, titulo, W, opc) {
    const o = Object.assign({ H: 240 }, opc);
    const H = o.H, izq = 44, der = 6, arr = 14, aba = 28;
    const ancho = W - izq - der, alto = H - arr - aba;
    const maxReal = Math.max(1, ...dias.map((d) => d.valores.reduce((a, b) => a + b, 0)));
    const paso = maxReal <= 6 ? 2 : maxReal <= 10 ? 2 : maxReal <= 50 ? 10 : maxReal <= 200 ? 50 : Math.pow(10, Math.floor(Math.log10(maxReal)));
    const max = Math.ceil(maxReal / paso) * paso;
    const bw = ancho / dias.length;
    const cadaN = dias.length > 14 ? 5 : 1;
    const id = nuevoId('br');
    let defs = '';
    series.forEach((s, k) => {
      defs += `<linearGradient id="${id}g${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}"/><stop offset="1" stop-color="${s.color2 || s.color}" stop-opacity=".78"/></linearGradient>`;
      if (s.patron) defs += `<pattern id="${id}p${k}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="url(#${id}g${k})"/><rect width="2" height="6" fill="rgba(0,0,0,.32)"/></pattern>`;
    });
    let svg = `<svg class="grafico" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="${esc(titulo)}"><defs>${defs}</defs>`;
    for (let v = 0; v <= max; v += paso) {
      const y = arr + alto - (v / max) * alto;
      svg += `<line x1="${izq}" x2="${W - der}" y1="${y}" y2="${y}" stroke="${v === 0 ? '#444' : '#2a2a2a'}" ${v ? 'stroke-dasharray="3 5"' : ''}/>`;
      svg += `<text x="${izq - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#9a9a9a">${formato(v)}</text>`;
    }
    dias.forEach((d, i) => {
      const x = izq + i * bw + bw * 0.14;
      const w = bw * 0.72;
      const suma = d.valores.reduce((a, b) => a + b, 0);
      const tip = `${d.etiqueta}\n` + series.map((s, k) => `${s.nombre}: ${formato(d.valores[k])}`).join('\n') + (series.length > 1 ? `\nTotal: ${formato(suma)}` : '');
      let acumulado = 0;
      let cuerpo = '';
      d.valores.forEach((val, k) => {
        if (!val) return;
        const h = Math.max(2, (val / max) * alto);
        const y = arr + alto - ((acumulado + val) / max) * alto;
        const arriba = !d.valores.slice(k + 1).some(Boolean);
        const fill = series[k].patron ? `url(#${id}p${k})` : `url(#${id}g${k})`;
        cuerpo += `<rect class="barra-r" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${arriba ? Math.min(6, w / 2) : 1}" fill="${fill}" style="animation-delay:${i * 28}ms"/>`;
        acumulado += val;
      });
      svg += `<g class="barra" tabindex="0" data-tip="${esc(tip)}"><rect x="${(izq + i * bw).toFixed(1)}" y="${arr}" width="${bw.toFixed(1)}" height="${alto}" fill="transparent"/>${cuerpo}</g>`;
      if (i % cadaN === 0 || i === dias.length - 1) {
        svg += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#9a9a9a">${esc(d.etiqueta)}</text>`;
      }
    });
    return svg + '</svg>';
  }

  /* ---------- Línea con área ---------- */
  function linea(datos, formato, titulo, W, opc) {
    const o = Object.assign({ H: 220, color: COLORES.amarillo }, opc);
    const H = o.H, izq = 34, der = 12, arr = 16, aba = 28;
    const ancho = W - izq - der, alto = H - arr - aba;
    const maxReal = Math.max(1, ...datos.map((d) => d.valor));
    const paso = maxReal <= 6 ? 2 : maxReal <= 20 ? 5 : maxReal <= 60 ? 10 : 20;
    const max = Math.ceil(maxReal / paso) * paso;
    const n = datos.length;
    const X = (i) => izq + (n === 1 ? ancho / 2 : (i / (n - 1)) * ancho);
    const Y = (v) => arr + alto - (v / max) * alto;
    const id = nuevoId('ln');
    const pts = datos.map((d, i) => [X(i), Y(d.valor)]);
    // Curva suave (Catmull-Rom → Bézier)
    let tray = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      tray += ` C${c1[0].toFixed(1)} ${Math.min(arr + alto, c1[1]).toFixed(1)} ${c2[0].toFixed(1)} ${Math.min(arr + alto, c2[1]).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    const area = tray + ` L${pts[n - 1][0].toFixed(1)} ${arr + alto} L${pts[0][0].toFixed(1)} ${arr + alto} Z`;
    const cadaN = n > 14 ? 5 : 1;
    let svg = `<svg class="grafico" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="${esc(titulo)}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.color}" stop-opacity=".5"/><stop offset="1" stop-color="${o.color}" stop-opacity="0"/></linearGradient></defs>`;
    for (let v = 0; v <= max; v += paso) {
      const y = Y(v);
      svg += `<line x1="${izq}" x2="${W - der}" y1="${y}" y2="${y}" stroke="${v === 0 ? '#444' : '#2a2a2a'}" ${v ? 'stroke-dasharray="3 5"' : ''}/><text x="${izq - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#9a9a9a">${formato(v)}</text>`;
    }
    svg += `<path class="area" d="${area}" fill="url(#${id})"/><path class="linea-trazo" d="${tray}" fill="none" stroke="${o.color}" stroke-width="3" stroke-linecap="round" pathLength="100"/>`;
    datos.forEach((d, i) => {
      svg += `<g class="punto" tabindex="0" data-tip="${esc(d.etiqueta + '\n' + formato(d.valor))}"><circle cx="${X(i).toFixed(1)}" cy="${Y(d.valor).toFixed(1)}" r="14" fill="transparent"/><circle class="p" cx="${X(i).toFixed(1)}" cy="${Y(d.valor).toFixed(1)}" r="${n > 14 ? 3 : 4.5}" fill="#141414" stroke="${o.color}" stroke-width="2.5"/></g>`;
      if (i % cadaN === 0 || i === n - 1) svg += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#9a9a9a">${esc(d.etiqueta)}</text>`;
    });
    return svg + '</svg>';
  }

  /* ---------- Leyenda accesible: forma + texto + valor ---------- */
  function leyenda(items) {
    return `<ul class="leyenda">${items.map((s) => `<li><i class="${s.patron ? 'patron' : ''}" style="--c:${s.color}"></i><span>${esc(s.nombre)}</span>${s.texto != null ? `<b>${esc(s.texto)}</b>` : ''}</li>`).join('')}</ul>`;
  }

  /* ---------- Avatar con iniciales ---------- */
  const PALETA = [[354, 78], [32, 90], [48, 95], [160, 55], [200, 65], [265, 55], [320, 60], [14, 85]];
  function avatar(nombre, tam) {
    const partes = String(nombre || '?').trim().split(/\s+/);
    const ini = ((partes[0] || '?')[0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
    let h = 0;
    for (const ch of String(nombre)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const [tono, sat] = PALETA[h % PALETA.length];
    const oscuro = tono > 40 && tono < 70;
    return `<span class="avatar${tam ? ' ' + tam : ''}" aria-hidden="true" style="background:linear-gradient(145deg,hsl(${tono} ${sat}% 52%),hsl(${tono} ${sat}% 34%));color:${oscuro ? '#04222b' : '#fff'}">${esc(ini)}</span>`;
  }

  /* ---------- Barra de días restantes ---------- */
  function progreso(dias, total, estado) {
    let pct = 0;
    if (estado === 'pendiente') pct = 0; else if (dias > 0 && total > 0) pct = Math.max(6, Math.min(100, (dias / total) * 100));
    return `<span class="prog ${estado}" role="img" aria-label="${dias > 0 ? dias + ' días restantes' : 'sin días restantes'}"><i style="--p:${pct.toFixed(0)}%"></i></span>`;
  }

  /* ---------- Tooltip flotante (ratón, toque y teclado) ---------- */
  let tip = null;
  function activarTips() {
    if (activarTips.hecho) return;
    activarTips.hecho = true;
    tip = document.createElement('div');
    tip.className = 'tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    const mostrar = (el, x, y) => {
      tip.textContent = el.dataset.tip;
      tip.classList.add('visible');
      const r = tip.getBoundingClientRect();
      const px = Math.min(Math.max(8, x - r.width / 2), root.innerWidth - r.width - 8);
      tip.style.left = px + 'px';
      tip.style.top = Math.max(8, y - r.height - 14) + 'px';
    };
    const ocultar = () => tip.classList.remove('visible');
    document.addEventListener('pointerover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) mostrar(t, e.clientX, e.clientY); });
    document.addEventListener('pointermove', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) mostrar(t, e.clientX, e.clientY); });
    document.addEventListener('pointerout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) ocultar(); });
    document.addEventListener('focusin', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) { const r = t.getBoundingClientRect(); mostrar(t, r.left + r.width / 2, r.top + 8); } });
    document.addEventListener('focusout', ocultar);
    root.addEventListener('scroll', ocultar, { passive: true });
    root.addEventListener('hashchange', ocultar);
  }

  /* ---------- Iconos y piezas SVG ---------- */
  const check = '<svg class="check-anim" viewBox="0 0 52 52" aria-hidden="true"><circle class="check-c" cx="26" cy="26" r="23" fill="none" stroke="currentColor" stroke-width="3.5"/><path class="check-t" d="M15 27l8 8 15-17" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const alerta = '<svg class="check-anim" viewBox="0 0 52 52" aria-hidden="true"><circle class="check-c" cx="26" cy="26" r="23" fill="none" stroke="currentColor" stroke-width="3.5"/><path class="check-t" d="M26 14v14M26 36v.5" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/></svg>';

  // Ilustraciones para estados vacíos
  const vacioIlus = {
    socios: '<svg viewBox="0 0 120 90" aria-hidden="true"><circle cx="60" cy="38" r="16" fill="none" stroke="' + PAL.acento + '" stroke-width="3"/><path d="M28 80c2-18 15-26 32-26s30 8 32 26" fill="none" stroke="' + PAL.marca + '" stroke-width="3" stroke-linecap="round"/><path d="M92 20l6 6M98 20l-6 6" stroke="#8a8a8a" stroke-width="3" stroke-linecap="round"/></svg>',
    pesas: '<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M26 45h68" stroke="#8a8a8a" stroke-width="5" stroke-linecap="round"/><rect x="16" y="30" width="10" height="30" rx="3" fill="' + PAL.marca + '"/><rect x="28" y="24" width="10" height="42" rx="3" fill="' + PAL.acento + '"/><rect x="82" y="24" width="10" height="42" rx="3" fill="' + PAL.acento + '"/><rect x="94" y="30" width="10" height="30" rx="3" fill="' + PAL.marca + '"/></svg>',
    check: '<svg viewBox="0 0 120 90" aria-hidden="true"><circle cx="60" cy="45" r="30" fill="none" stroke="#3ddc84" stroke-width="4"/><path d="M46 46l10 10 20-22" fill="none" stroke="#3ddc84" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cafe: '<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M34 34h44v22a18 18 0 0 1-18 18h-8a18 18 0 0 1-18-18V34z" fill="none" stroke="' + PAL.acento + '" stroke-width="3.5"/><path d="M78 40h8a8 8 0 0 1 0 16h-8" fill="none" stroke="' + PAL.marca + '" stroke-width="3.5"/><path d="M48 14c-4 6 4 8 0 14M62 14c-4 6 4 8 0 14" fill="none" stroke="#8a8a8a" stroke-width="3" stroke-linecap="round"/></svg>',
  };
  function vacio(tipo, texto) {
    return `<div class="vacio-ilus">${vacioIlus[tipo] || vacioIlus.pesas}<p>${esc(texto)}</p></div>`;
  }

  root.Graficos = { contar, delta, sparkline, donut, barras, linea, leyenda, avatar, progreso, activarTips, check, alerta, vacio, COLORES };
})(window);
