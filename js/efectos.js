/* Efectos visuales de la web pública (solo presentación). Respeta "reducir movimiento". */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const quieto = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const puntero = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);

  // Números grandes de sección (a partir del kicker "01", "02"...)
  $$('main .kicker span').forEach((k) => {
    const sec = k.closest('section');
    if (!sec || $('.num-grande', sec)) return;
    const n = document.createElement('span');
    n.className = 'num-grande'; n.setAttribute('aria-hidden', 'true'); n.textContent = k.textContent;
    sec.appendChild(n);
  });

  // Planes: valor por día calculado con los precios reales + barra de ahorro frente al plan diario
  const planes = (window.Store && Store.planes) ? Store.planes() : [];
  const diario = planes.find((p) => p.dias === 1);
  const porDia = (p) => Number(p.precio) / p.dias;
  const pilates = window.Tema && Tema.actual() === 'pilates';
  if (pilates && planes.length) {
    // Estudio de pilates: valor por clase (si el plan trae clases) frente a la clase suelta, y una nota corta.
    const suelta = Tema.datos().precioClaseSuelta;
    $$('.plan').forEach((card, i) => {
      const p = planes[i];
      const m = p && Tema.planDe(p);
      if (!m) return;
      const caja = document.createElement('div');
      caja.className = 'plan-valor';
      let html = '';
      if (m.clases) {
        const porClase = Number(p.precio) / m.clases;
        const ahorro = Math.round((1 - porClase / suelta) * 100);
        html = '<span class="pv-dia"><b>$' + porClase.toFixed(2) + '</b> por clase</span>';
        if (ahorro > 0 && m.clases > 1) html += '<span class="pv-barra" role="img" aria-label="Ahorras ' + ahorro + '% frente a la clase suelta"><i style="--w:' + ahorro + '%"></i></span><span class="pv-ahorro">Ahorras ' + ahorro + '% vs. clase suelta</span>';
        else if (m.nota) html += '<span class="pv-ahorro">' + m.nota + '</span>';
      } else if (m.nota) {
        html = '<span class="pv-ahorro">' + m.nota + '</span>';
      }
      if (!html) return;
      caja.innerHTML = html;
      card.insertBefore(caja, $('.btn', card));
    });
  } else if (diario && planes.length) {
    $$('.plan').forEach((card, i) => {
      const p = planes[i];
      if (!p) return;
      const ahorro = Math.round((1 - porDia(p) / porDia(diario)) * 100);
      const caja = document.createElement('div');
      caja.className = 'plan-valor';
      caja.innerHTML = '<span class="pv-dia"><b>$' + porDia(p).toFixed(2) + '</b> por día</span>' +
        (ahorro > 0
          ? '<span class="pv-barra" role="img" aria-label="Ahorras ' + ahorro + '% frente al plan diario"><i style="--w:' + ahorro + '%"></i></span><span class="pv-ahorro">Ahorras ' + ahorro + '% vs. pagar diario</span>'
          : '<span class="pv-barra"><i style="--w:4%"></i></span><span class="pv-ahorro">Entra sin compromiso</span>');
      const btn = $('.btn', card);
      card.insertBefore(caja, btn);
    });
  }

  if (!quieto && puntero) {
    // Tilt 3D + brillo que sigue el cursor en tarjetas de plan
    $$('.plan').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--rx', ((0.5 - y) * 9).toFixed(2) + 'deg');
        card.style.setProperty('--ry', ((x - 0.5) * 11).toFixed(2) + 'deg');
        card.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
    // Brillo en beneficios / contacto / fotos
    $$('.beneficio, .dato, .horarios').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--gx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--gy', (e.clientY - r.top) + 'px');
      });
    });
    // Foco de luz en la portada
    const port = $('.portada');
    if (port) port.addEventListener('pointermove', (e) => {
      const r = port.getBoundingClientRect();
      port.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      port.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  }

  // Scroll: barra de progreso, barra compacta, parallax, CTA móvil
  const prog = $('#progreso-scroll'), barra = $('#barra'), foto = $('.portada-foto'), marca = $('.portada-marca'), cta = $('#cta-movil'), form = $('#inscripcion');
  let tick = false;
  function alScroll() {
    tick = false;
    const y = window.scrollY, h = document.documentElement.scrollHeight - innerHeight;
    if (prog) prog.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0) + ')';
    if (barra) barra.classList.toggle('compacta', y > 120);
    if (!quieto && y < innerHeight * 1.2) {
      if (foto) foto.style.setProperty('--py', (y * 0.22).toFixed(1) + 'px');
      if (marca) marca.style.setProperty('--py', (y * -0.12).toFixed(1) + 'px');
    }
    if (cta) {
      let sobreForm = false;
      if (form) { const r = form.getBoundingClientRect(); sobreForm = r.top < innerHeight * 0.85 && r.bottom > 0; }
      cta.classList.toggle('visible', y > innerHeight * 0.7 && !sobreForm);
    }
  }
  window.addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(alScroll); } }, { passive: true });
  window.addEventListener('resize', alScroll);
  alScroll();

  // Barras de ahorro: se llenan al aparecer
  if ('IntersectionObserver' in window) {
    const o = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('lleno'); o.unobserve(en.target); } }), { threshold: 0.4 });
    $$('.plan-valor').forEach((el) => o.observe(el));
  } else $$('.plan-valor').forEach((el) => el.classList.add('lleno'));

  // Lightbox de la galería
  const fotos = $$('.foto img');
  if (fotos.length) {
    const lb = document.createElement('div');
    lb.className = 'lightbox'; lb.hidden = true; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Foto ampliada');
    lb.innerHTML = '<button type="button" class="lb-x" aria-label="Cerrar">&times;</button><button type="button" class="lb-n lb-prev" aria-label="Anterior">&#8249;</button><figure><img alt=""><figcaption></figcaption></figure><button type="button" class="lb-n lb-next" aria-label="Siguiente">&#8250;</button>';
    document.body.appendChild(lb);
    let idx = 0;
    const img = $('img', lb), cap = $('figcaption', lb);
    const ver = (i) => { idx = (i + fotos.length) % fotos.length; const f = fotos[idx]; img.src = f.currentSrc || f.src; img.alt = f.alt; cap.textContent = (f.closest('.foto').querySelector('figcaption') || {}).textContent || ''; };
    const abrir = (i) => { ver(i); lb.hidden = false; requestAnimationFrame(() => lb.classList.add('abierto')); document.body.style.overflow = 'hidden'; $('.lb-x', lb).focus(); };
    const cerrar = () => { lb.classList.remove('abierto'); lb.hidden = true; document.body.style.overflow = ''; };
    fotos.forEach((f, i) => { const fig = f.closest('.foto'); fig.tabIndex = 0; fig.setAttribute('role', 'button'); fig.setAttribute('aria-label', 'Ampliar: ' + f.alt); fig.addEventListener('click', () => abrir(i)); fig.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(i); } }); });
    $('.lb-x', lb).addEventListener('click', cerrar);
    $('.lb-prev', lb).addEventListener('click', () => ver(idx - 1));
    $('.lb-next', lb).addEventListener('click', () => ver(idx + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) cerrar(); });
    document.addEventListener('keydown', (e) => { if (lb.hidden) return; if (e.key === 'Escape') cerrar(); if (e.key === 'ArrowLeft') ver(idx - 1); if (e.key === 'ArrowRight') ver(idx + 1); });
  }
})();
