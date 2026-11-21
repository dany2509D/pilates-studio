(function () {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;

  // Fotos de la galería: se copian a assets/fotos/ y se agregan aquí. Las que falten se ven como recuadros.
  const FOTOS = [
    { src: 'assets/fotos/pilates-estudio.jpg', alt: 'Clase en el estudio con reformers y luz natural', lbl: 'El estudio' },
    { src: 'assets/fotos/pilates-reformer.jpg', alt: 'Clienta en el reformer con la instructora al lado', lbl: 'Reformer' },
    { src: 'assets/fotos/pilates-mat.jpg', alt: 'Ejercicio de pilates en mat', lbl: 'Pilates en mat' },
    { src: 'assets/fotos/pilates-grupo.jpg', alt: 'Dos personas estirando los brazos en una clase', lbl: 'Clases en grupo', pos: 'center 30%' },
    { src: 'assets/fotos/pilates-instructora.jpg', alt: 'Instructora guiando una clase en reformers', lbl: 'Instructoras' },
    { src: 'assets/fotos/pilates-silla.jpg', alt: 'Ejercicio en silla Wunda', lbl: 'Silla Wunda', pos: 'center 78%' },
  ];
  const MIN_RECUADROS = 6;

  const sinMovimiento = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const estado = Store.init();
  if (estado.modo === 'memoria' || estado.reiniciado) {
    if (estado.reiniciado) $('aviso-memoria').textContent = 'Los datos guardados en este navegador estaban dañados y se cargaron los datos de ejemplo.';
    $('aviso-memoria').style.display = 'block';
  }

  const aj = Store.getAjustes();
  const planes = Store.planes();

  const DURACION = { 1: 'Entrada de 1 día', 7: '7 días', 15: '15 días', 30: '30 días' };
  // Texto de duración: el del tema si el plan sigue siendo el de fábrica; si no, por los días.
  const duracionDe = (p) => { const m = Tema.planDe(p); return (m && m.duracion) || DURACION[p.dias] || p.dias + ' días'; };
  const esPopular = (p) => (Tema.planDe(p) ? p.id === Tema.datos().planPopular : p.dias === 30);

  // Planes
  $('planes-grid').innerHTML = planes.map((p, i) => {
    const destacado = esPopular(p);
    return `
      <article class="plan revelar${destacado ? ' destacado' : ''}" style="--i:${i}">
        ${destacado ? '<span class="cinta">El más popular</span>' : ''}
        <h3>${esc(p.nombre)}</h3>
        <div class="precio"><small>$</small>${Number(p.precio).toFixed(2)}</div>
        <div class="duracion">${esc(duracionDe(p))}</div>
        <a class="btn btn-gris" href="#inscripcion" data-plan="${p.id}">Elegir plan</a>
      </article>`;
  }).join('');

  // Bandeja de la portada (Pilates): precio de entrada y valor por clase del paquete, con los planes reales.
  if ($('plato-a') && planes[0]) {
    $('plato-a').innerHTML = esc(planes[0].nombre) + ' · <b>$' + Number(planes[0].precio).toFixed(2) + '</b>';
    const p2 = planes[1]; const m2 = p2 && Tema.planDe(p2);
    $('plato-b').innerHTML = p2 ? esc(p2.nombre) + ' · <b>$' + (Number(p2.precio) / ((m2 && m2.clases) || 1)).toFixed(2) + '</b>' + ((m2 && m2.clases) ? ' por clase' : '') : '';
  }

  // Tarjetas de plan del formulario (por defecto, el mensual).
  const porDefecto = (planes.find(esPopular) || planes.find((p) => p.dias === 30) || planes[planes.length - 1]).id;
  $('plan-opciones').innerHTML = planes.map((p) => `
    <label class="plan-opcion">
      <input type="radio" name="planId" value="${p.id}"${p.id === porDefecto ? ' checked' : ''}>
      <span class="plan-opcion-caja">
        <strong>${esc(p.nombre)}</strong>
        <em>${Util.dinero(p.precio)}</em>
        <small>${esc(duracionDe(p))}</small>
      </span>
    </label>`).join('');

  document.querySelectorAll('[data-plan]').forEach((a) => {
    a.addEventListener('click', () => {
      const r = document.querySelector('input[name="planId"][value="' + a.dataset.plan + '"]');
      if (r) r.checked = true;
    });
  });

  // Galería
  const recuadros = Math.max(MIN_RECUADROS, FOTOS.length);
  $('galeria-grid').innerHTML = Array.from({ length: recuadros }, (_, i) => {
    const f = FOTOS[i];
    return f
      ? `<figure class="foto revelar" style="--i:${i % 3};--pos:${esc(f.pos || 'center')}"><img src="${esc(f.src)}" alt="${esc(f.alt)}" loading="lazy"><figcaption>${esc(f.lbl || '')}</figcaption></figure>`
      : `<figure class="foto vacia revelar" style="--i:${i % 3}"><span>Foto del estudio</span></figure>`;
  }).join('');
  // Si una imagen no carga, se muestra como recuadro vacío en lugar de un ícono roto.
  document.querySelectorAll('.foto img').forEach((img) => {
    img.addEventListener('error', () => {
      const fig = img.closest('.foto');
      fig.classList.add('vacia');
      fig.innerHTML = '<span>Foto del ' + 'estudio' + '</span>';
    });
  });

  // Horarios
  $('lista-horarios').innerHTML = (aj.horarios || [])
    .map((h) => `<div><dt>${esc(h.dias)}</dt><dd>${esc(h.horas)}</dd></div>`).join('');
  if (aj.ejemplo && aj.ejemplo.horarios) {
    $('nota-horarios').textContent = 'Horarios de ejemplo: se confirman con ' + 'el estudio.';
  }

  // Contacto
  const tel = String(aj.telefono || '');
  const telLimpio = tel.replace(/[^\d+]/g, '');
  $('dato-direccion').textContent = aj.direccion || '';
  $('dato-telefono').textContent = tel;
  $('dato-telefono').href = 'tel:' + telLimpio;
  $('btn-llamar').href = 'tel:' + telLimpio;
  const user = String(aj.instagram || '').replace(/^@/, '');
  [$('dato-instagram'), $('pie-instagram')].forEach((a) => {
    a.textContent = '@' + user;
    a.href = 'https://www.instagram.com/' + encodeURIComponent(user) + '/';
  });
  if (aj.whatsapp) {
    const w = $('btn-whatsapp');
    w.href = 'https://wa.me/' + String(aj.whatsapp).replace(/\D/g, '');
    w.hidden = false;
  }

  // Mapa (Google Maps, necesita internet). Sin dirección en Ajustes se muestra el mapa general, sin ubicación concreta
  // ni botón «Cómo llegar»; con dirección, el mapa se centra en ella.
  const direccionReal = String(aj.direccion || '').trim();
  $('dato-direccion').closest('.dato').style.display = direccionReal ? '' : 'none';
  $('mapa-caja').innerHTML = direccionReal
    ? `<iframe title="Mapa con la ubicación de ${esc(aj.nombre)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
      src="https://www.google.com/maps?q=${encodeURIComponent(direccionReal)}&output=embed"></iframe>
    <div class="mapa-pie">
      <a class="btn btn-borde btn-chico" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionReal)}" target="_blank" rel="noopener">Cómo llegar</a>
    </div>`
    : `<iframe title="Mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
      src="https://www.google.com/maps?output=embed&z=3"></iframe>`;

  // Barra superior: transparente sobre la portada, sólida al bajar
  const barra = $('barra');
  const marcarBarra = () => barra.classList.toggle('solida', window.scrollY > 40);
  window.addEventListener('scroll', marcarBarra, { passive: true });
  marcarBarra();

  // Menú móvil
  const hamb = $('hamb');
  const menu = $('menu-movil');
  hamb.addEventListener('click', () => {
    const abierto = menu.classList.toggle('abierto');
    hamb.setAttribute('aria-expanded', String(abierto));
    barra.classList.toggle('menu-abierto', abierto);
  });
  menu.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      menu.classList.remove('abierto');
      hamb.setAttribute('aria-expanded', 'false');
      barra.classList.remove('menu-abierto');
    }
  });

  // Inscripción
  const form = $('inscripcion');
  const msg = $('mensaje-form');
  const acepta = $('acepta-privacidad');
  function mostrar(tipo, texto, html) {
    msg.className = 'mensaje ' + tipo;
    if (html) msg.innerHTML = html;
    else msg.textContent = texto;
  }
  acepta.addEventListener('change', () => { if (acepta.checked) acepta.removeAttribute('aria-invalid'); });

  // Deja abierta la sesión de "Mi plan" en este celular (contrato con js/socio.js: 'sag:miplan' = {socioId, cedula}).
  function guardarSesionMiPlan(socio) {
    try {
      localStorage.setItem('sag:miplan', JSON.stringify({ socioId: socio.id, cedula: socio.cedula }));
    } catch (e) { /* sin almacenamiento: "Mi plan" pedirá la cédula */ }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    $('yappy-caja-web').innerHTML = '';
    // Sin aceptar el aviso de privacidad no se inscribe (Ley 81 de 2019). Primero se revisan los datos.
    const faltanDatos = ['nombre', 'cedula', 'telefono'].some((k) => !String(f.get(k) || '').trim());
    if (!acepta.checked) {
      acepta.setAttribute('aria-invalid', 'true');
      mostrar('error', faltanDatos
        ? 'Completa tu nombre, cédula y teléfono, y acepta el aviso de privacidad.'
        : 'Para inscribirte, acepta el aviso de privacidad.');
      if (!faltanDatos) acepta.focus();
      return;
    }
    let registrado = false;
    try {
      const socio = Store.inscribir({
        nombre: f.get('nombre'), cedula: f.get('cedula'), telefono: f.get('telefono'),
        planId: Number(f.get('planId')), acepta: true,
      });
      guardarSesionMiPlan(socio);
      const nombre = String(f.get('nombre')).trim().split(/\s+/)[0];
      mostrar('ok', '', `¡Listo, ${esc(nombre)}! Ya estás registrado. Paga en el estudio o por Yappy aquí abajo para activar tu plan. <a href="socio.html">Ver mi plan</a>`);
      // Tras pagar en línea, la caja de Yappy ofrece ir directo a "Mi plan" (la sesión ya quedó guardada).
      Yappy.pintar($('yappy-caja-web'), socio, planes.find((p) => p.id === socio.planId), () => {
        const ok = $('yappy-caja-web').querySelector('.yappy-ok');
        if (ok) ok.insertAdjacentHTML('beforeend', '<a class="btn btn-amarillo" href="socio.html">Ver mi plan</a>');
      });
      form.reset();
      registrado = true;
    } catch (err) {
      if (err.message === 'cedula-repetida') mostrar('error', 'Esa cédula ya está registrada. Entra a "Mi plan" para renovar o llámanos.');
      else if (err.message === 'datos-incompletos') mostrar('error', 'Completa tu nombre, cédula y teléfono.');
      else mostrar('error', 'No pudimos registrarte. Inténtalo de nuevo.');
    }
    const caja = $('yappy-caja-web');
    if (registrado && caja.scrollIntoView) caja.scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth', block: 'nearest' });
  });

  // Animaciones: aparecer al hacer scroll y cifras de la portada. Sin movimiento si el usuario lo pidió.
  const precios = planes.map((p) => p.precio);
  const cifras = { planes: planes.length, desde: Math.min(...precios), pagos: 2 };

  function contar(el) {
    const meta = cifras[el.dataset.contar];
    const prefijo = el.dataset.prefijo || '';
    if (sinMovimiento || !window.requestAnimationFrame) { el.textContent = prefijo + meta; return; }
    const inicio = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - inicio) / 900);
      el.textContent = prefijo + (k >= 1 ? meta : Math.round(meta * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  document.querySelectorAll('[data-contar]').forEach(contar);

  const revelables = document.querySelectorAll('.revelar');
  if (sinMovimiento || !('IntersectionObserver' in window)) {
    revelables.forEach((el) => el.classList.add('visible'));
  } else {
    document.documentElement.classList.add('anim');
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('visible'); obs.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    revelables.forEach((el) => obs.observe(el));
  }
})();
