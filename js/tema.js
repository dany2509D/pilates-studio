// Datos del estudio y del diseño (nombre, logo, planes de ejemplo, paleta de los gráficos) en un solo lugar.
// Va en el <head> de cada página: deja puesto data-tema="pilates" en <html> y prepara el video de la portada.
//
//   Tema.nombre()     → nombre del estudio
//   Tema.datos()      → { nombre, instagram, horarios, planes, … }
//   Tema.paleta()     → colores para los gráficos del panel
//   Tema.planDe(plan) → datos extra del plan (duración, clases, nota) si sigue siendo el de fábrica
(function (root) {
  'use strict';

  const TEMA = {
    nombre: 'Pilates Studio',
    instagram: '@pilatesstudio',
    logo: 'assets/logo.png',
    colorBarra: '#f3ebe8',
    video: 'assets/video/hero-pilates.mp4',
    poster: 'assets/video/hero-pilates.jpg',
    horarios: [
      { dias: 'Lunes a viernes', horas: '7:00 a.m. – 8:00 p.m.' },
      { dias: 'Sábados', horas: '8:00 a.m. – 1:00 p.m.' },
      { dias: 'Domingos', horas: 'Cerrado' },
    ],
    // Planes de ejemplo para un estudio de pilates con reformer. La primera vez se empieza con la Clase Intro;
    // los paquetes duran 30 días desde la primera clase.
    planPopular: 3,
    precioClaseSuelta: 28.75,
    planes: [
      { id: 1, nombre: 'Clase Intro', dias: 1, precio: 26.75, duracion: '1 clase · para empezar', clases: 1, nota: 'Obligatoria la primera vez' },
      { id: 2, nombre: 'Paquete de 4', dias: 30, precio: 90.95, duracion: '4 clases grupales · 30 días', clases: 4 },
      { id: 3, nombre: 'Plan Beginner', dias: 30, precio: 129, duracion: 'Para empezar · 30 días', nota: 'Acompañamiento en tus primeras clases' },
      { id: 4, nombre: 'Semiprivadas ×8', dias: 30, precio: 246.1, duracion: '8 clases semiprivadas · 30 días', clases: 8, nota: 'Atención casi personalizada' },
    ],
    paleta: { marca: '#89c1a5', marcaOsc: '#4b8a6e', acento: '#b5cde8', acentoOsc: '#8aa9cf' },
  };

  if (root.document) root.document.documentElement.setAttribute('data-tema', 'pilates');

  const datos = () => TEMA;
  const nombre = () => TEMA.nombre;
  const paleta = () => TEMA.paleta;
  const actual = () => 'pilates';

  // Datos del plan (duración, clases, nota). Solo si el plan sigue siendo el de fábrica.
  function planDe(plan) {
    const m = TEMA.planes.find((p) => p.id === plan.id);
    return m && m.nombre === plan.nombre ? m : null;
  }

  // Video de la portada. Sin movimiento (preferencia del sistema o ahorro de datos) solo se muestra la imagen.
  function ponerVideo() {
    const v = root.document.querySelector('[data-hero-video]');
    if (!v) return;
    v.setAttribute('poster', TEMA.poster);
    const conexion = root.navigator && root.navigator.connection;
    const sinMovimiento = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sinMovimiento || (conexion && conexion.saveData)) return;
    v.muted = true;
    v.src = TEMA.video;
    const p = v.play();
    if (p && p.catch) p.catch(() => { /* el navegador no deja reproducir solo: queda la imagen */ });
  }

  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', ponerVideo);
    else ponerVideo();
  }

  root.Tema = { actual, nombre, datos, paleta, planDe };
  if (typeof module !== 'undefined') module.exports = root.Tema;
})(typeof window !== 'undefined' ? window : globalThis);
