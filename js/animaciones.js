/* Animaciones al hacer scroll de la web pública (solo presentación). Va después de site.js y efectos.js.
   - Asigna a cada tipo de elemento una entrada distinta (desde la izquierda, la derecha, con zoom, con recorte…)
     y un escalonado según su posición entre hermanos. La entrada la dispara su propio IntersectionObserver.
   - Contadores en los precios, desvanecimiento de la portada al bajar, parallax suave en fotos y números grandes,
     y barra superior que se esconde al bajar y vuelve al subir.
   Respeta «reducir movimiento»: sin esa preferencia no hace nada y todo se ve de una vez. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const quieto = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (quieto || !('IntersectionObserver' in window)) return;

  // ---- 1) Entradas por tipo de elemento ----
  const VARIANTES = [
    ['.seccion-titulo, .reserva-cta h2', 'titulo'],
    ['.kicker, .eyebrow', 'izq'],
    ['.plan, .beneficio, .formato, .tarifa-col, .primera-vez, .referidos, .para-quien', 'pop'],
    ['.foto', 'clip'],
    ['.pasos li, .garantias li, .antes-clase li, .para-quien li, .faq-lista details, .dato, .horarios dl > div, .inscribirse-texto > p', 'izq'],
    ['.mapa-caja, .horarios, .inscripcion-pro', 'der'],
    ['.confianza li, .modalidades > div, .cifras li', 'subir'],
  ];
  const nuevos = [];
  VARIANTES.forEach(([sel, variante]) => {
    $$(sel).forEach((el) => {
      if (el.dataset.anim) return;
      el.dataset.anim = variante;
      if (!el.classList.contains('revelar')) { el.classList.add('revelar'); nuevos.push(el); }
      if (el.style.getPropertyValue('--i') === '') {
        const hermanos = el.parentElement ? Array.from(el.parentElement.children).filter((x) => x.tagName === el.tagName) : [];
        el.style.setProperty('--i', String(Math.max(0, hermanos.indexOf(el))));
      }
    });
  });
  // Fotos: alternan el lado desde el que entran
  $$('.foto').forEach((el, i) => { el.dataset.lado = i % 2 ? 'der' : 'izq'; });

  const entrada = new IntersectionObserver((es) => es.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('visible'); entrada.unobserve(en.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });
  nuevos.forEach((el) => entrada.observe(el));

  // ---- 2) Contadores en los precios ----
  function contarPrecio(el) {
    const nodo = Array.from(el.childNodes).find((n) => n.nodeType === 3 && /\d/.test(n.nodeValue));
    if (!nodo) return;
    const final = parseFloat(nodo.nodeValue);
    if (!isFinite(final)) return;
    const decimales = /\./.test(nodo.nodeValue) ? (nodo.nodeValue.split('.')[1] || '').trim().length : 0;
    const t0 = performance.now(), dur = 1100;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = final * (1 - Math.pow(1 - k, 3));
      nodo.nodeValue = v.toFixed(decimales);
      if (k < 1) requestAnimationFrame(paso); else nodo.nodeValue = final.toFixed(decimales);
    };
    requestAnimationFrame(paso);
  }
  const precios = new IntersectionObserver((es) => es.forEach((en) => {
    if (en.isIntersecting) { contarPrecio(en.target); precios.unobserve(en.target); }
  }), { threshold: 0.6 });
  $$('.plan .precio').forEach((el) => precios.observe(el));

  // ---- 3) Efectos ligados al scroll ----
  const portada = $('.portada'), barra = $('#barra');
  const fotos = $$('.foto img'), numeros = $$('.num-grande');
  const enPantalla = new Set();
  const vigilar = new IntersectionObserver((es) => es.forEach((en) => {
    if (en.isIntersecting) enPantalla.add(en.target); else enPantalla.delete(en.target);
  }), { rootMargin: '10% 0px' });
  fotos.forEach((el) => vigilar.observe(el.closest('.foto')));
  numeros.forEach((el) => vigilar.observe(el));

  const acotar = (v, a, b) => Math.max(a, Math.min(b, v));
  let ultimoY = window.scrollY, pendiente = false;

  function fotograma() {
    pendiente = false;
    const y = window.scrollY, alto = window.innerHeight;
    // La portada se desvanece y sube un poco al bajar
    if (portada && y < alto * 1.3) portada.style.setProperty('--hp', acotar(y / (alto * 0.85), 0, 1).toFixed(3));
    // Parallax en las fotos de la galería y en los números grandes de sección
    enPantalla.forEach((el) => {
      const r = el.getBoundingClientRect();
      const p = acotar((r.top + r.height / 2 - alto / 2) / (alto / 2 + r.height / 2), -1, 1);
      const destino = el.classList.contains('foto') ? $('img', el) : el;
      if (destino) destino.style.setProperty('--fp', p.toFixed(3));
    });
    // Barra superior: se esconde al bajar y vuelve al subir
    if (barra) {
      const baja = y > ultimoY + 4, sube = y < ultimoY - 4;
      const menuAbierto = barra.classList.contains('menu-abierto');
      if (y < 220 || sube || menuAbierto) barra.classList.remove('oculta');
      else if (baja) barra.classList.add('oculta');
    }
    ultimoY = y;
  }
  window.addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(fotograma); } }, { passive: true });
  window.addEventListener('resize', fotograma);
  fotograma();
})();
