// Datos fijos para las pruebas: planes tipo diario / semanal / quincenal / mensual, para que las cuentas de
// vencimientos y montos no dependan de los planes de ejemplo del estudio (js/tema.js).
globalThis.Tema = {
  actual: () => 'pilates',
  nombre: () => 'Pilates Studio',
  paleta: () => ({ marca: '#89c1a5', marcaOsc: '#4b8a6e', acento: '#b5cde8', acentoOsc: '#8aa9cf' }),
  planDe: () => null,
  datos: () => ({
    nombre: 'Pilates Studio',
    instagram: '@pilatesstudio',
    horarios: [
      { dias: 'Lunes a viernes', horas: '7:00 a.m. – 8:00 p.m.' },
      { dias: 'Sábados', horas: '8:00 a.m. – 1:00 p.m.' },
      { dias: 'Domingos', horas: 'Cerrado' },
    ],
    planes: [
      { id: 1, nombre: 'Diario', dias: 1, precio: 3 },
      { id: 2, nombre: 'Semanal', dias: 7, precio: 12 },
      { id: 3, nombre: 'Quincenal', dias: 15, precio: 20 },
      { id: 4, nombre: 'Mensual', dias: 30, precio: 30 },
    ],
  }),
};
