const assert = require('node:assert');
require('./datos-prueba.js');
const Util = require('../js/util.js');
const Store = require('../js/store.js');

function mem() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
}

function fresh() {
  Store.setHoy('2026-11-02');
  Store.init(mem());
}

function socioCon(vence, planId) {
  return Store.create('socios', {
    nombre: 'Prueba ' + Math.random(), cedula: 'T-' + Math.random(), telefono: '6000-0000',
    planId: planId || 2, vence, origen: 'panel', creadoEn: '2026-11-02',
  });
}

const tests = [];
const test = (nombre, fn) => tests.push([nombre, fn]);

test('calcularVencimiento desde null usa hoy', () => {
  fresh();
  assert.strictEqual(Store.calcularVencimiento(null, 7), '2026-11-08');
});

test('calcularVencimiento cruza de año', () => {
  fresh();
  assert.strictEqual(Store.calcularVencimiento('2026-12-30', 7), '2027-01-06');
});

test('cobrar a plan vigente suma desde el vencimiento', () => {
  fresh();
  const s = socioCon('2026-11-10');
  Store.cobrar({ socioId: s.id, planId: 2, metodo: 'efectivo' });
  assert.strictEqual(Store.get('socios', s.id).vence, '2026-11-17');
});

test('cobrar a plan vencido cuenta desde hoy (el día de hoy ya cuenta)', () => {
  fresh();
  const s = socioCon('2026-10-01');
  Store.cobrar({ socioId: s.id, planId: 2, metodo: 'yappy' });
  assert.strictEqual(Store.get('socios', s.id).vence, '2026-11-08');
});

test('estadoSocio cubre los cuatro estados', () => {
  fresh();
  assert.strictEqual(Store.estadoSocio({ vence: null }), 'pendiente');
  assert.strictEqual(Store.estadoSocio({ vence: '2026-11-05' }), 'por-vencer');
  assert.strictEqual(Store.estadoSocio({ vence: '2026-11-02' }), 'por-vencer');
  assert.strictEqual(Store.estadoSocio({ vence: '2026-11-01' }), 'vencido');
  assert.strictEqual(Store.estadoSocio({ vence: '2026-11-06' }), 'activo');
});

test('inscribir crea socio pendiente de origen web', () => {
  fresh();
  const s = Store.inscribir({ nombre: 'Ana Ruiz', cedula: '8-999-111', telefono: '6111-2222', planId: 4 });
  assert.strictEqual(s.origen, 'web');
  assert.strictEqual(Store.estadoSocio(s), 'pendiente');
});

test('inscribir rechaza cédula repetida', () => {
  fresh();
  Store.inscribir({ nombre: 'Ana Ruiz', cedula: '8-999-111', telefono: '1', planId: 4 });
  assert.throws(
    () => Store.inscribir({ nombre: 'Otra', cedula: ' 8-999-111 ', telefono: '2', planId: 1 }),
    /cedula-repetida/
  );
});

test('inscribir rechaza datos incompletos', () => {
  fresh();
  assert.throws(() => Store.inscribir({ nombre: '', cedula: '1', telefono: '1', planId: 1 }), /datos-incompletos/);
});

test('cobrar a pendiente lo deja activo y crea pago con el monto del plan', () => {
  fresh();
  const s = Store.inscribir({ nombre: 'Luis Mora', cedula: '1-1-1', telefono: '1', planId: 4 });
  const pago = Store.cobrar({ socioId: s.id, planId: 4, metodo: 'yappy' });
  assert.strictEqual(pago.monto, 30);
  assert.strictEqual(pago.metodo, 'yappy');
  assert.strictEqual(Store.estadoSocio(Store.get('socios', s.id)), 'activo');
});

test('checkIn avisa si está vencido y no duplica el mismo día', () => {
  fresh();
  const s = socioCon('2026-10-01');
  const antes = Store.list('asistencias').length;
  const r1 = Store.checkIn(s.id);
  assert.strictEqual(r1.aviso, 'vencido');
  assert.strictEqual(r1.repetido, false);
  const r2 = Store.checkIn(s.id);
  assert.strictEqual(r2.repetido, true);
  assert.strictEqual(Store.list('asistencias').length, antes + 1);
});

test('registrarVenta calcula el total', () => {
  fresh();
  const a = Store.create('productos', { nombre: 'A', precio: 1.5 });
  const b = Store.create('productos', { nombre: 'B', precio: 2 });
  const v = Store.registrarVenta({ items: [{ productoId: a.id, cantidad: 2 }, { productoId: b.id, cantidad: 1 }], metodo: 'efectivo' });
  assert.strictEqual(v.total, 5);
});

test('ingresos suma planes y cafetería por día y por mes', () => {
  fresh();
  const s = socioCon('2026-10-01');
  const p = Store.create('productos', { nombre: 'Z', precio: 2 });
  const antes = Store.ingresos('2026-11-02');
  Store.cobrar({ socioId: s.id, planId: 2, metodo: 'yappy' });
  Store.registrarVenta({ items: [{ productoId: p.id, cantidad: 3 }], metodo: 'efectivo' });
  const despues = Store.ingresos('2026-11-02');
  assert.strictEqual(despues.planes - antes.planes, 12);
  assert.strictEqual(despues.cafeteria - antes.cafeteria, 6);
  assert.strictEqual(despues.yappy - antes.yappy, 12);
  assert.strictEqual(despues.efectivo - antes.efectivo, 6);
  assert.strictEqual(despues.total - antes.total, 18);
  assert.ok(Store.ingresos('2026-11').total >= despues.total);
});

test('los datos de ejemplo tienen actividad hoy y ninguna fecha futura', () => {
  fresh();
  const hoy = Store.hoy();
  assert.ok(Store.list('pagos').some((p) => p.fecha === hoy), 'pagos hoy');
  assert.ok(Store.list('asistencias').some((a) => a.fecha === hoy), 'entradas hoy');
  assert.ok(Store.list('asistencias').length > 100, 'historial de asistencia');
  assert.ok(![...Store.list('pagos'), ...Store.list('asistencias'), ...Store.list('ventas')].some((x) => x.fecha > hoy), 'sin fechas futuras');
});

test('un plan de N días dura exactamente N días contando hoy', () => {
  fresh();
  const s = Store.inscribir({ nombre: 'Dia Uno', cedula: 'D-1', telefono: '1', planId: 1 });
  Store.cobrar({ socioId: s.id, planId: 1, metodo: 'efectivo' });
  const diario = Store.get('socios', s.id);
  assert.strictEqual(diario.vence, '2026-11-02');
  Store.setHoy('2026-11-03');
  assert.strictEqual(Store.estadoSocio(diario), 'vencido');
  Store.setHoy('2026-11-02');
  const m = Store.inscribir({ nombre: 'Mes Uno', cedula: 'M-1', telefono: '1', planId: 4 });
  Store.cobrar({ socioId: m.id, planId: 4, metodo: 'efectivo' });
  assert.strictEqual(Store.get('socios', m.id).vence, '2026-12-01');
});

test('un id de socio dado de baja no se reutiliza', () => {
  fresh();
  const a = socioCon('2026-11-20');
  Store.cobrar({ socioId: a.id, planId: 2, metodo: 'efectivo' });
  Store.remove('socios', a.id);
  const b = socioCon('2026-11-20');
  assert.notStrictEqual(b.id, a.id);
  assert.strictEqual(Store.list('pagos').filter((p) => p.socioId === b.id).length, 0);
});

test('dos instancias sobre el mismo almacenamiento no se pisan', () => {
  Store.setHoy('2026-11-02');
  const b = mem();
  Store.init(b);
  const ruta = require.resolve('../js/store.js');
  delete require.cache[ruta];
  const Otra = require('../js/store.js');
  Otra.setHoy('2026-11-02');
  Otra.init(b);
  const ana = Store.inscribir({ nombre: 'Ana', cedula: 'AN-1', telefono: '1', planId: 4 });
  const viejo = Otra.list('socios').find((s) => s.cedula !== 'AN-1');
  Otra.cobrar({ socioId: viejo.id, planId: 2, metodo: 'efectivo' });
  assert.ok(Otra.list('socios').some((s) => s.id === ana.id), 'la otra instancia ve a Ana');
  assert.ok(Store.list('socios').some((s) => s.id === ana.id), 'Ana no se borró');
  assert.ok(Store.list('pagos').some((p) => p.socioId === viejo.id && p.fecha === '2026-11-02' && p.planId === 2), 'el cobro llegó a la primera');
});

test('enlaceWhatsApp arma el número de Panamá y codifica el mensaje', () => {
  assert.strictEqual(Util.enlaceWhatsApp('6612-1001', 'Hola ñ'), 'https://wa.me/50766121001?text=Hola%20%C3%B1');
  assert.strictEqual(Util.enlaceWhatsApp('+507 6612-1001', 'x'), 'https://wa.me/50766121001?text=x');
  assert.strictEqual(Util.enlaceWhatsApp('203-5455', 'x'), 'https://wa.me/5072035455?text=x');
  assert.strictEqual(Util.enlaceWhatsApp('', 'x'), null);
});

test('plantilla reemplaza variables y deja vacías las desconocidas', () => {
  assert.strictEqual(Util.plantilla('Hola {nombre}, plan {plan}{x}.', { nombre: 'Ana', plan: 'Mensual' }), 'Hola Ana, plan Mensual.');
});

test('solicitarPagoYappy crea una solicitud y no duplica la pendiente', () => {
  fresh();
  const s = Store.inscribir({ nombre: 'Yap Uno', cedula: 'Y-1', telefono: '6000-1', planId: 3 });
  const a = Store.solicitarPagoYappy({ socioId: s.id, planId: 3 });
  assert.strictEqual(a.estado, 'por-confirmar');
  assert.strictEqual(a.monto, 20);
  const b = Store.solicitarPagoYappy({ socioId: s.id, planId: 3 });
  assert.strictEqual(b.id, a.id);
  assert.strictEqual(Store.list('solicitudes').filter((x) => x.socioId === s.id).length, 1);
});

test('confirmarSolicitud cobra por Yappy y activa al socio; no se confirma dos veces', () => {
  fresh();
  const s = Store.inscribir({ nombre: 'Yap Dos', cedula: 'Y-2', telefono: '6000-2', planId: 4 });
  const sol = Store.solicitarPagoYappy({ socioId: s.id, planId: 4 });
  const pago = Store.confirmarSolicitud(sol.id);
  assert.strictEqual(pago.metodo, 'yappy');
  assert.strictEqual(pago.monto, 30);
  assert.strictEqual(Store.estadoSocio(Store.get('socios', s.id)), 'activo');
  assert.strictEqual(Store.get('solicitudes', sol.id).estado, 'confirmada');
  assert.throws(() => Store.confirmarSolicitud(sol.id), /solicitud-no-pendiente/);
});

test('pagarYappyEnLinea registra el cobro solo, con referencia, y activa al socio', () => {
  fresh();
  const s = Store.inscribir({ nombre: 'En Linea', cedula: 'L-1', telefono: '6000-5', planId: 3 });
  const antes = Store.ingresos('2026-11-02');
  const pago = Store.pagarYappyEnLinea({ socioId: s.id, planId: 3, telefonoYappy: '6611-2233' });
  assert.strictEqual(pago.metodo, 'yappy');
  assert.strictEqual(pago.canal, 'web');
  assert.strictEqual(pago.monto, 20);
  assert.match(pago.referencia, /^YP-\d{6}-\d{4}$/);
  assert.strictEqual(pago.yappyTerminado, '2233');
  const socio = Store.get('socios', s.id);
  assert.strictEqual(Store.estadoSocio(socio), 'activo');
  assert.strictEqual(socio.vence, '2026-11-16');
  assert.strictEqual(Store.ingresos('2026-11-02').yappy - antes.yappy, 20);
  assert.strictEqual(Store.get('pagos', pago.id).referencia, pago.referencia);
});

test('pagarYappyEnLinea cierra la solicitud pendiente del socio y valida el número', () => {
  fresh();
  const s = Store.inscribir({ nombre: 'En Linea Dos', cedula: 'L-2', telefono: '6000-6', planId: 2 });
  const sol = Store.solicitarPagoYappy({ socioId: s.id, planId: 2 });
  assert.throws(() => Store.pagarYappyEnLinea({ socioId: s.id, planId: 2, telefonoYappy: '12' }), /telefono-yappy-invalido/);
  assert.strictEqual(Store.get('solicitudes', sol.id).estado, 'por-confirmar', 'un número inválido no cobra nada');
  Store.pagarYappyEnLinea({ socioId: s.id, planId: 2, telefonoYappy: '6000 6000' });
  assert.strictEqual(Store.get('solicitudes', sol.id).estado, 'confirmada');
  assert.strictEqual(Store.list('pagos').filter((p) => p.socioId === s.id).length, 1);
});

test('las referencias de pagos en línea no se repiten', () => {
  fresh();
  const s = socioCon('2026-11-20');
  const a = Store.pagarYappyEnLinea({ socioId: s.id, planId: 1, telefonoYappy: '6000-0001' });
  const b = Store.pagarYappyEnLinea({ socioId: s.id, planId: 1, telefonoYappy: '6000-0001' });
  assert.notStrictEqual(a.referencia, b.referencia);
});

test('los datos de ejemplo traen pagos en línea recientes', () => {
  fresh();
  const enLinea = Store.list('pagos').filter((p) => p.canal === 'web');
  assert.ok(enLinea.length >= 2, 'hay pagos en línea de ejemplo');
  assert.ok(enLinea.every((p) => p.metodo === 'yappy' && /^YP-\d{6}-\d{4}$/.test(p.referencia)));
});

test('rechazarSolicitud no genera pago', () => {
  fresh();
  const s = Store.inscribir({ nombre: 'Yap Tres', cedula: 'Y-3', telefono: '6000-3', planId: 2 });
  const sol = Store.solicitarPagoYappy({ socioId: s.id, planId: 2 });
  const pagos = Store.list('pagos').length;
  Store.rechazarSolicitud(sol.id);
  assert.strictEqual(Store.get('solicitudes', sol.id).estado, 'rechazada');
  assert.strictEqual(Store.list('pagos').length, pagos);
});

test('buscarSocioPorCredenciales pide cédula y últimos 4 del teléfono', () => {
  fresh();
  const s = Store.create('socios', { nombre: 'Mi Plan', cedula: '8-123-456', telefono: '6612-9876', planId: 4, vence: '2026-11-20', origen: 'panel', creadoEn: '2026-11-01' });
  assert.strictEqual(Store.buscarSocioPorCredenciales(' 8-123-456 ', '9876').id, s.id);
  assert.strictEqual(Store.buscarSocioPorCredenciales('8-123-456', '0000'), null);
  assert.strictEqual(Store.buscarSocioPorCredenciales('8-123-456', ''), null);
  assert.strictEqual(Store.buscarSocioPorCredenciales('', '9876'), null);
});

test('los ajustes de ejemplo traen número de Yappy y mensaje de recordatorio', () => {
  fresh();
  const aj = Store.getAjustes();
  assert.ok(aj.yappy && aj.recordatorio.includes('{nombre}'));
  assert.ok(Array.isArray(Store.list('solicitudes')));
});

test('datos guardados por una versión anterior se completan sin perder nada', () => {
  Store.setHoy('2026-11-02');
  const b = mem();
  Store.init(b);
  const viejo = JSON.parse(b.getItem('sag:db'));
  const nSocios = viejo.socios.length;
  delete viejo.solicitudes;
  delete viejo.ajustes.yappy;
  delete viejo.ajustes.recordatorio;
  b.setItem('sag:db', JSON.stringify(viejo));
  const r = Store.init(b);
  assert.strictEqual(r.reiniciado, false);
  assert.strictEqual(Store.list('socios').length, nSocios);
  assert.deepStrictEqual(Store.list('solicitudes'), []);
  assert.ok(Store.getAjustes().yappy && Store.getAjustes().recordatorio);
});

test('la dirección viene vacía (genérica) y una guardada por el dueño se respeta', () => {
  Store.setHoy('2026-11-02');
  assert.strictEqual(Store.init(mem()) && Store.getAjustes().direccion, '', 'sin dirección de fábrica');
  assert.strictEqual(Store.getAjustes().ejemplo.direccion, true);

  // Datos viejos con la dirección de ejemplo sin editar: vuelven a la de fábrica (vacía).
  const b = mem();
  Store.init(b);
  const viejo = JSON.parse(b.getItem('sag:db'));
  viejo.ajustes.direccion = 'Dirección por confirmar con el gimnasio';
  viejo.ajustes.ejemplo.direccion = true;
  b.setItem('sag:db', JSON.stringify(viejo));
  Store.init(b);
  assert.strictEqual(Store.getAjustes().direccion, '');

  // Dirección que el dueño ya editó (sin marca de ejemplo): se respeta.
  const c = mem();
  Store.init(c);
  const editado = JSON.parse(c.getItem('sag:db'));
  editado.ajustes.direccion = 'Otra dirección del dueño';
  editado.ajustes.ejemplo.direccion = false;
  c.setItem('sag:db', JSON.stringify(editado));
  Store.init(c);
  assert.strictEqual(Store.getAjustes().direccion, 'Otra dirección del dueño');
});

test('escapeHtml neutraliza HTML y comillas', () => {
  const s = Util.escapeHtml('<b>"x"</b>');
  assert.ok(!s.includes('<') && !s.includes('"'));
});

test('init no lanza con backend roto y cae a memoria', () => {
  Store.setHoy('2026-11-02');
  const roto = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() {} };
  const r = Store.init(roto);
  assert.strictEqual(r.modo, 'memoria');
  assert.ok(Store.list('socios').length > 0);
});

test('init con JSON corrupto carga los datos de ejemplo', () => {
  Store.setHoy('2026-11-02');
  const b = mem();
  b.setItem('sag:db', '{corrupto');
  const r = Store.init(b);
  assert.ok(Store.list('socios').length > 0);
  assert.strictEqual(r.reiniciado, true, 'avisa que los datos estaban dañados');
  assert.strictEqual(Store.init(b).reiniciado, false, 'la siguiente carga ya es normal');
  assert.strictEqual(Store.init(mem()).reiniciado, false, 'primera vez sin datos no es un reinicio');
});

test('reset restaura el conteo inicial de socios', () => {
  fresh();
  const n0 = Store.list('socios').length;
  socioCon('2026-11-20');
  assert.strictEqual(Store.list('socios').length, n0 + 1);
  Store.reset();
  assert.strictEqual(Store.list('socios').length, n0);
});

test('los datos de ejemplo tienen los 4 estados y los precios reales', () => {
  fresh();
  const estados = new Set(Store.list('socios').map(Store.estadoSocio));
  ['pendiente', 'activo', 'por-vencer', 'vencido'].forEach((e) => assert.ok(estados.has(e), e));
  assert.deepStrictEqual(Store.planes().map((p) => p.precio), [3, 12, 20, 30]);
  assert.deepStrictEqual(Store.planes().map((p) => p.dias), [1, 7, 15, 30]);
});

test('migración: un socio guardado con la versión anterior recibe los campos nuevos vacíos', () => {
  Store.setHoy('2026-11-02');
  const b = mem();
  b.setItem('sag:db', JSON.stringify({
    version: 1, planes: [{ id: 1, nombre: 'Diario', dias: 1, precio: 3 }],
    socios: [{ id: 1, nombre: 'Viejo', cedula: '1-1-1', telefono: '6000-0001', planId: 1, vence: '2026-11-10', origen: 'panel', creadoEn: '2026-10-01' }],
  }));
  Store.init(b);
  const s = Store.get('socios', 1);
  assert.strictEqual(s.nombre, 'Viejo');
  assert.strictEqual(s.vence, '2026-11-10');
  assert.strictEqual(s.correo, '');
  assert.strictEqual(s.nacimiento, '');
  assert.strictEqual(s.objetivo, '');
  assert.deepStrictEqual(s.etiquetas, []);
  assert.deepStrictEqual(s.notas, []);
  assert.doesNotThrow(() => Store.agregarNota(1, { texto: 'hola' }));
});

test('socios creados sin ficha ampliada (web, pruebas) tienen valores por defecto', () => {
  fresh();
  const s = socioCon('2026-11-20');
  assert.deepStrictEqual(s.etiquetas, []);
  assert.deepStrictEqual(s.notas, []);
  assert.strictEqual(s.correo, '');
  const w = Store.inscribir({ nombre: 'Web', cedula: 'W-1', telefono: '6000-1', planId: 1 });
  assert.deepStrictEqual(w.notas, []);
});

test('datos de ejemplo: ~10 socios con ficha, cumpleaños este mes y fechas válidas', () => {
  fresh();
  const ss = Store.list('socios');
  assert.ok(ss.filter((s) => s.correo).length >= 10);
  assert.ok(ss.every((s) => !s.nacimiento || (Util.fechaValida(s.nacimiento) && s.nacimiento < '2026-11-02')));
  assert.ok(Store.segmentos().cumple.length >= 3, 'hay cumpleaños este mes');
  assert.ok(ss.every((s) => s.notas.every((n) => Util.fechaValida(n.fecha) && n.fecha <= '2026-11-02')));
  Store.setHoy('2027-02-10'); Store.reset();
  assert.ok(Store.list('socios').every((s) => !s.nacimiento || (Util.fechaValida(s.nacimiento) && s.nacimiento < '2027-02-10')));
  assert.ok(Store.segmentos().cumple.length >= 3, 'también en otro mes');
});

test('segmentos automáticos', () => {
  const asis = [
    { socioId: 1, fecha: '2026-10-18' }, // hace 15 días: ausente
    { socioId: 2, fecha: '2026-10-19' }, // hace 14: no
    { socioId: 2, fecha: '2026-09-01' },
    { socioId: 3, fecha: '2026-11-01' },
  ];
  const socios = [
    { id: 1, vence: '2026-11-09', nacimiento: '1990-11-30' },
    { id: 2, vence: '2026-11-10', nacimiento: '1990-12-01' },
    { id: 3, vence: '2026-11-01', nacimiento: '' },
    { id: 4, vence: null },
  ];
  const r = Store.calcularSegmentos(socios, asis, '2026-11-02');
  assert.deepStrictEqual(r.ausente, [1]);
  assert.deepStrictEqual(r.nunca, [4]);
  assert.deepStrictEqual(r.cumple, [1]);
  assert.deepStrictEqual(r.vence7, [1], 'vence en 7 días entra; en 8 no; ya vencido no');
});

test('notas: agregar, orden de ids, validaciones y quitar', () => {
  fresh();
  const s = socioCon('2026-11-20');
  const n1 = Store.agregarNota(s.id, { tipo: 'nota', texto: '  Hola <b>x</b> "q"  ' });
  const n2 = Store.agregarNota(s.id, { tipo: 'whatsapp', texto: '' });
  assert.strictEqual(n1.texto, 'Hola <b>x</b> "q"');
  assert.strictEqual(n1.fecha, '2026-11-02');
  assert.ok(n2.id > n1.id);
  assert.throws(() => Store.agregarNota(s.id, { tipo: 'nota', texto: '   ' }), /nota-vacia/);
  assert.throws(() => Store.agregarNota(s.id, { tipo: 'otra', texto: 'x' }), /tipo-invalido/);
  assert.throws(() => Store.agregarNota(s.id, { texto: 'x', fecha: '2026-02-31' }), /fecha-invalida/);
  assert.throws(() => Store.agregarNota(s.id, { texto: 'x'.repeat(501) }), /nota-larga/);
  assert.throws(() => Store.agregarNota(9999, { texto: 'x' }), /socio-invalido/);
  Store.quitarNota(s.id, n1.id);
  assert.strictEqual(Store.get('socios', s.id).notas.length, 1);
});

test('editar un socio no borra sus notas ni etiquetas', () => {
  fresh();
  const s = socioCon('2026-11-20');
  Store.agregarNota(s.id, { texto: 'a' });
  Store.agregarEtiqueta(s.id, 'VIP');
  Store.update('socios', s.id, { nombre: 'Nuevo', correo: 'a@b.co', nacimiento: '1990-05-05', objetivo: 'masa' });
  const x = Store.get('socios', s.id);
  assert.strictEqual(x.notas.length, 1);
  assert.deepStrictEqual(x.etiquetas, ['VIP']);
});

test('validación de correo, nacimiento y objetivo', () => {
  fresh();
  const s = socioCon('2026-11-20');
  assert.throws(() => Store.update('socios', s.id, { correo: 'sin-arroba' }), /correo-invalido/);
  assert.throws(() => Store.update('socios', s.id, { nacimiento: '2026-13-01' }), /nacimiento-invalido/);
  assert.throws(() => Store.update('socios', s.id, { nacimiento: '2030-01-01' }), /nacimiento-invalido/);
  assert.throws(() => Store.update('socios', s.id, { objetivo: 'volar' }), /objetivo-invalido/);
  assert.doesNotThrow(() => Store.update('socios', s.id, { correo: '', nacimiento: '', objetivo: '' }));
  assert.ok(Util.correoValido('a@b.com') && !Util.correoValido('a@b') && !Util.correoValido('a b@c.com'));
});

test('etiquetas: sin repetir (ignora mayúsculas), límite y conteo', () => {
  fresh();
  const a = socioCon('2026-11-20'); const b = socioCon('2026-11-20');
  const antes = Store.etiquetasUsadas().find((e) => e.nombre === 'VIP').cuenta;
  Store.agregarEtiqueta(a.id, ' VIP ');
  assert.deepStrictEqual(Store.agregarEtiqueta(a.id, 'vip'), ['VIP']);
  Store.agregarEtiqueta(b.id, 'Vip');
  assert.deepStrictEqual(Store.etiquetasUsadas().filter((e) => e.nombre === 'VIP').map((e) => e.cuenta), [antes + 2]);
  assert.throws(() => Store.agregarEtiqueta(a.id, '  '), /etiqueta-vacia/);
  for (let i = 0; i < 7; i++) Store.agregarEtiqueta(a.id, 'e' + i);
  assert.throws(() => Store.agregarEtiqueta(a.id, 'extra'), /demasiadas-etiquetas/);
  assert.deepStrictEqual(Store.quitarEtiqueta(b.id, 'VIP'), []);
});

test('lo nuevo persiste entre cargas', () => {
  Store.setHoy('2026-11-02');
  const b = mem(); Store.init(b);
  const s = socioCon('2026-11-20');
  Store.agregarNota(s.id, { texto: 'persistente' });
  Store.init(b);
  assert.strictEqual(Store.get('socios', s.id).notas[0].texto, 'persistente');
});

// ---- Carnet con QR (check-in con cámara o lector USB) ----

// Reloj fijo para el QR que cambia: las pruebas no dependen de la hora en que corren.
const T0 = Date.UTC(2026, 10, 2, 15, 0, 0);
const PASO = Util.PASO_QR_S * 1000;
function conReloj(ms, fn) {
  const original = Util.ahoraMs;
  Util.ahoraMs = () => ms;
  try { return fn(); } finally { Util.ahoraMs = original; }
}

test('sha256 en JavaScript da lo mismo que el crypto de Node', () => {
  const crypto = require('node:crypto');
  ['', 'abc', 'hola ñandú 💪', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(1000)].forEach((s) => {
    assert.strictEqual(Util.sha256(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 12)));
  });
});

test('codigoSocio: SAG + número de socio (6 dígitos) + 4 caracteres que cambian cada 15 s; solo letras y números', () => {
  fresh();
  const socios = Store.list('socios');
  const codigos = socios.map((s) => Util.codigoSocio(s, T0));
  codigos.forEach((c) => assert.match(c, /^SAG\d{6}[0-9A-HJKMNP-TV-Z]{4}$/, 'sin I, L, O ni U (no se confunden con 1 y 0)'));
  assert.strictEqual(new Set(codigos).size, socios.length, 'no se repiten');
  const s = socios[1];
  assert.strictEqual(Util.codigoSocio(s, T0), Util.codigoSocio(s, T0 + PASO - 1), 'dentro del mismo paso no cambia');
  assert.notStrictEqual(Util.codigoSocio(s, T0), Util.codigoSocio(s, T0 + PASO), 'cambia en el paso siguiente');
  assert.notStrictEqual(Util.codigoSocio({ id: 5, cedula: '8-1-1' }, T0), Util.codigoSocio({ id: 5, cedula: '8-1-2' }, T0), 'depende de la cédula');
  assert.strictEqual(Util.codigoSocio({ id: 5, cedula: ' PE-12-345 ' }, T0), Util.codigoSocio({ id: 5, cedula: 'pe-12-345' }, T0), 'la cédula se compara sin espacios ni mayúsculas');
  assert.ok(Util.segundosQR(T0) >= 1 && Util.segundosQR(T0) <= Util.PASO_QR_S);
});

test('leerCodigo acepta minúsculas, espacios y guiones, corrige O/I/L y rechaza lo demás', () => {
  assert.deepStrictEqual(Util.leerCodigo('sag000005k7qm'), { tipo: 'socio', id: 5, token: 'K7QM', codigo: 'SAG000005K7QM' });
  assert.deepStrictEqual(Util.leerCodigoSocio('  SAG 000005 K7QM\n'), { id: 5, codigo: 'SAG000005K7QM' });
  assert.strictEqual(Util.leerCodigo('SAG-000005-K7QM').codigo, 'SAG000005K7QM');
  assert.strictEqual(Util.leerCodigo('SAGOOOOO2K7QM').codigo, 'SAG000002K7QM', 'O por 0');
  assert.strictEqual(Util.leerCodigo('SAG0000l2K7QM').codigo, 'SAG000012K7QM', 'l por 1');
  ['', null, undefined, 'SAG00005K7QM', 'SAG000005K7Q', 'XSAG000005K7QM', 'SAG000005K7QMX', 'SAGABCDEFK7QM', 'SAG000005K7',
    'https://tu-dominio.com', '8-745-1201', 'SAG000005Ñ7QM', 'SAGP2611080000020000'].forEach((t) => assert.strictEqual(Util.leerCodigo(t), null, String(t)));
  const pase = Util.codigoPase({ socioId: 2, cedula: '8-801-2210', fecha: '2026-11-08' });
  assert.match(pase, /^SAGP261108000002[0-9A-HJKMNP-TV-Z]{6}$/);
  const leido = Util.leerCodigo(pase.toLowerCase().replace(/(.{4})/g, '$1 '));
  assert.deepStrictEqual([leido.tipo, leido.socioId, leido.fecha, leido.firmaValida], ['pase', 2, '2026-11-08', true]);
  const otraFirma = pase.slice(0, -1) + (pase.slice(-1) === 'A' ? 'B' : 'A');
  assert.strictEqual(Util.leerCodigo(otraFirma).firmaValida, false, 'firma alterada');
  assert.strictEqual(Util.leerCodigo(pase.replace('261108', '261109')).firmaValida, false, 'fecha alterada');
  assert.strictEqual(Util.leerCodigo('SAGP261332000002AAAAAA'), null, 'fecha imposible');
});

test('codigoAlFinal toma el código que un lector tecleó detrás de lo que ya había en el campo', () => {
  fresh();
  const a = Util.codigoSocio(Store.get('socios', 2), T0);
  const b = Util.codigoSocio(Store.get('socios', 3), T0);
  const p = Util.codigoPase({ socioId: 2, cedula: '8-801-2210', fecha: '2026-11-02' });
  assert.strictEqual(Util.codigoAlFinal('maria' + a).codigo, a);
  assert.strictEqual(Util.codigoAlFinal('HOLA123' + a).codigo, a);
  assert.strictEqual(Util.codigoAlFinal(a + b).codigo, b, 'dos lecturas pegadas: la última');
  assert.strictEqual(Util.codigoAlFinal('SAG00000' + a).codigo, a);
  assert.strictEqual(Util.codigoAlFinal('juan' + p).codigo, p, 'también el pase diario');
  assert.strictEqual(Util.codigoAlFinal(' sag 000002 ' + a.slice(-4).toLowerCase()).codigo, a);
  assert.strictEqual(Util.codigoAlFinal('SAG000002XSAG').codigo, 'SAG000002XSAG', 'un token que trae SAG por casualidad');
  assert.strictEqual(Util.codigoAlFinal('mariaSAG000002XSAG').codigo, 'SAG000002XSAG');
  ['maria', 'Sagastume', '8-123-4567', 'PE-12-345', 'SAG000005', a + 'x', ''].forEach((t) => assert.strictEqual(Util.codigoAlFinal(t), null, t));
});

test('QR que cambia: vale 90 s hacia atrás y 30 s hacia adelante; después avisa que es viejo', () => {
  fresh();
  const s = Store.get('socios', 5);
  conReloj(T0, () => {
    const ahora = Util.codigoSocio(s);
    assert.strictEqual(Store.buscarSocioPorCodigo(ahora).id, 5);
    assert.strictEqual(Store.buscarSocioPorCodigo(ahora.toLowerCase()).id, 5);
    assert.strictEqual(Store.analizarCodigo(Util.codigoSocio(s, T0 - 6 * PASO)).estado, 'ok', 'hace 90 s');
    assert.strictEqual(Store.analizarCodigo(Util.codigoSocio(s, T0 + 2 * PASO)).estado, 'ok', 'reloj del celular 30 s adelantado');
    const viejo = Store.analizarCodigo(Util.codigoSocio(s, T0 - 20 * PASO));
    assert.strictEqual(viejo.estado, 'viejo', 'captura de hace 5 minutos');
    assert.strictEqual(viejo.socio.id, 5);
    assert.strictEqual(viejo.minutos, 5);
    assert.strictEqual(Store.buscarSocioPorCodigo(Util.codigoSocio(s, T0 - 20 * PASO)), null, 'el viejo no registra');
    assert.strictEqual(Store.analizarCodigo(Util.codigoSocio(s, T0 + 10 * PASO)).estado, 'viejo', 'reloj muy adelantado');
    assert.strictEqual(Store.analizarCodigo(Util.codigoSocio(s, T0 - 3 * 3600000)).estado, 'desconocido', 'de hace 3 horas');
  });
});

test('buscarSocioPorCodigo: el código debe ser del socio (número y cédula)', () => {
  fresh();
  conReloj(T0, () => {
    const s = Store.get('socios', 5);
    const codigo = Util.codigoSocio(s);
    assert.strictEqual(Store.buscarSocioPorCodigo(Util.codigoSocio({ id: 5, cedula: 'otra' })), null, 'hecho en otro equipo con otros datos');
    assert.strictEqual(Store.analizarCodigo(Util.codigoSocio({ id: 5, cedula: 'otra' })).estado, 'desconocido');
    assert.strictEqual(Store.analizarCodigo('SAG999999' + codigo.slice(-4)).estado, 'desconocido', 'socio inexistente');
    assert.strictEqual(Store.analizarCodigo('hola').estado, 'no-es-codigo');
    Store.update('socios', 5, { cedula: '8-000-0005' });
    assert.strictEqual(Store.buscarSocioPorCodigo(codigo), null, 'si cambia la cédula, el código viejo deja de valer');
    assert.strictEqual(Store.buscarSocioPorCodigo(Util.codigoSocio(Store.get('socios', 5))).id, 5, 'y vale el nuevo');
    Store.remove('socios', 5);
    assert.strictEqual(Store.buscarSocioPorCodigo(Util.codigoSocio({ id: 5, cedula: '8-000-0005' })), null, 'dado de baja');
  });
});

test('check-in con QR: una entrada por día y avisa si el plan está vencido', () => {
  fresh();
  conReloj(T0, () => {
    const vencido = Store.list('socios').find((s) => Store.estadoSocio(s) === 'vencido');
    const socio = Store.buscarSocioPorCodigo(Util.codigoSocio(vencido));
    const antes = Store.list('asistencias').length;
    const r1 = Store.checkIn(socio.id);
    const r2 = Store.checkIn(Store.buscarSocioPorCodigo(Util.codigoSocio(vencido)).id);
    assert.strictEqual(r1.aviso, 'vencido');
    assert.strictEqual(r1.repetido, false);
    assert.strictEqual(r2.repetido, true);
    assert.strictEqual(Store.list('asistencias').length, antes + 1);
  });
});

test('los datos de ejemplo dan el mismo QR en cualquier equipo a la misma hora', () => {
  fresh();
  const a = Store.list('socios').map((s) => Util.codigoSocio(s, T0));
  Store.setHoy('2027-03-15');
  Store.init(mem());
  assert.deepStrictEqual(Store.list('socios').map((s) => Util.codigoSocio(s, T0)), a);
  Store.setHoy('2026-11-02');
});

// ---- Pase diario de un solo uso ----

test('pagar el plan diario crea un pase de un solo uso para ese día', () => {
  fresh();
  const s = socioCon(null, 2);
  const pago = Store.cobrar({ socioId: s.id, planId: 1, metodo: 'yappy' });
  assert.strictEqual(pago.desde, '2026-11-02');
  assert.strictEqual(pago.hasta, '2026-11-02');
  assert.ok(pago.pase, 'el pago trae el código del pase');
  const pases = Store.pasesDe(s.id);
  assert.strictEqual(pases.length, 1);
  assert.deepStrictEqual([pases[0].fecha, pases[0].usado, pases[0].codigo], ['2026-11-02', false, pago.pase]);
  const otro = Store.cobrar({ socioId: s.id, planId: 2, metodo: 'efectivo' });
  assert.strictEqual(otro.pase, undefined, 'otros planes no traen pase');
  const r1 = Store.usarPase(pago.pase);
  assert.deepStrictEqual([r1.estado, r1.repetido, r1.asistencia.socioId], ['ok', false, s.id]);
  assert.strictEqual(Store.analizarCodigo(pago.pase).estado, 'usado');
  assert.strictEqual(Store.usarPase(pago.pase).estado, 'usado', 'no se usa dos veces');
  assert.strictEqual(Store.list('asistencias').filter((a) => a.socioId === s.id).length, 1);
});

test('pase diario: otro día no vale, firma alterada no vale y uno de otro equipo vale una vez como visitante', () => {
  fresh();
  const s = socioCon('2026-11-10', 4);
  const pago = Store.cobrar({ socioId: s.id, planId: 1, metodo: 'efectivo' });
  assert.strictEqual(pago.desde, '2026-11-11', 'con plan vigente, el día pagado es el siguiente al vencimiento');
  assert.strictEqual(Store.analizarCodigo(pago.pase).estado, 'futuro');
  assert.strictEqual(Store.analizarCodigo(Util.codigoPase({ socioId: s.id, cedula: s.cedula, fecha: '2026-11-01' })).estado, 'otro-dia');
  const alterado = pago.pase.slice(0, -1) + (pago.pase.slice(-1) === 'A' ? 'B' : 'A');
  assert.strictEqual(Store.analizarCodigo(alterado).estado, 'invalido');
  const ajeno = Util.codigoPase({ socioId: 777, cedula: '9-999-999', fecha: '2026-11-02' });
  const antes = Store.list('asistencias').length;
  const r = Store.usarPase(ajeno);
  assert.deepStrictEqual([r.estado, r.socio, r.asistencia.visitante, r.asistencia.socioId], ['ok', null, true, null]);
  assert.strictEqual(Store.list('asistencias').length, antes + 1);
  assert.strictEqual(Store.usarPase(ajeno).estado, 'usado', 'el de otro equipo también se usa una sola vez');
});

test('pase diario de un socio que ya entró hoy no gasta el pase', () => {
  fresh();
  const s = socioCon(null, 1);
  const pago = Store.cobrar({ socioId: s.id, planId: 1, metodo: 'yappy' });
  Store.checkIn(s.id);
  const r = Store.usarPase(pago.pase);
  assert.strictEqual(r.repetido, true);
  assert.strictEqual(Store.analizarCodigo(pago.pase).estado, 'ok');
});

// ---- Usuarios, roles y registro de acciones ----

test('usuarios de la demo: dueño y recepción, sin sal ni contraseña a la vista', () => {
  fresh();
  const us = Store.usuarios();
  assert.deepStrictEqual(us.map((u) => [u.usuario, u.rol]), [['dueno', 'dueno'], ['recepcion', 'recepcion']]);
  us.concat(Store.list('usuarios'), [Store.get('usuarios', 1)]).forEach((u) => {
    assert.strictEqual(u.hash, undefined);
    assert.strictEqual(u.sal, undefined);
  });
  assert.throws(() => Store.create('usuarios', { usuario: 'x' }), /coleccion-protegida/);
  assert.throws(() => Store.update('acciones', 1, {}), /coleccion-protegida/);
});

test('iniciar sesión: contraseña correcta, incorrecta y bloqueo tras 5 intentos', () => {
  fresh();
  let ms = T0;
  const original = Util.ahoraMs;
  Util.ahoraMs = () => ms;
  try {
    assert.strictEqual(Store.iniciarSesion('dueno', 'demo').ok, true);
    assert.strictEqual(Store.usuario().nombre, 'Dueño');
    Store.cerrarSesion();
    assert.strictEqual(Store.usuario(), null);
    assert.strictEqual(Store.iniciarSesion(' DUENO ', 'demo').ok, true, 'el usuario no distingue mayúsculas');
    Store.cerrarSesion();
    for (let i = 1; i <= 4; i++) {
      const r = Store.iniciarSesion('recepcion', 'mala');
      assert.deepStrictEqual([r.ok, r.motivo, r.restantes], [false, 'credenciales', 5 - i]);
    }
    const quinto = Store.iniciarSesion('recepcion', 'mala');
    assert.deepStrictEqual([quinto.motivo, quinto.minutos], ['bloqueado', 5]);
    assert.strictEqual(Store.iniciarSesion('recepcion', 'recepcion').motivo, 'bloqueado', 'bloqueado aunque ahora la clave sea correcta');
    ms += 5 * 60000 + 1;
    assert.strictEqual(Store.iniciarSesion('recepcion', 'recepcion').ok, true, 'pasados 5 minutos vuelve a entrar');
    Store.cerrarSesion();
    for (let i = 0; i < 5; i++) Store.iniciarSesion('noexiste', 'x');
    assert.strictEqual(Store.iniciarSesion('noexiste', 'x').motivo, 'bloqueado', 'un usuario inexistente se bloquea igual (no revela cuáles existen)');
    Store.actuarComo(null);
    const tipos = Store.acciones().map((a) => a.tipo);
    ['sesion', 'sesion-fallida', 'bloqueo'].forEach((t) => assert.ok(tipos.includes(t), t));
  } finally {
    Util.ahoraMs = original;
  }
});

test('permisos: recepción cobra, edita socios y vende; no da de baja, no cambia ajustes ni usuarios', () => {
  fresh();
  assert.strictEqual(Store.iniciarSesion('recepcion', 'recepcion').ok, true);
  assert.strictEqual(Store.puede('ver:checkin'), true);
  assert.strictEqual(Store.puede('ver:reportes'), false);
  assert.strictEqual(Store.puede('ver:ingresos'), false);
  const pago = Store.cobrar({ socioId: 25, planId: 4, metodo: 'efectivo' });
  assert.strictEqual(pago.por, 'Ana Torres', 'el pago guarda quién cobró');
  Store.update('socios', 25, { telefono: '6612-9999' });
  Store.registrarVenta({ items: [{ productoId: 1, cantidad: 1 }], metodo: 'efectivo' });
  assert.throws(() => Store.remove('socios', 25), /sin-permiso/);
  assert.throws(() => Store.updatePlan(1, { precio: 1 }), /sin-permiso/);
  assert.throws(() => Store.setAjustes({ telefono: 'x' }), /sin-permiso/);
  assert.throws(() => Store.crearUsuario({ usuario: 'nuevo', nombre: 'N', rol: 'recepcion', clave: '123456' }), /sin-permiso/);
  assert.throws(() => Store.acciones(), /sin-permiso/);
  assert.throws(() => Store.exportarTodo(), /sin-permiso/);
  assert.throws(() => Store.reset(), /sin-permiso/);
  assert.throws(() => Store.create('productos', { nombre: 'x', precio: 1 }), /sin-permiso/);
  Store.cerrarSesion();
  Store.iniciarSesion('dueno', 'demo');
  assert.strictEqual(Store.puede('ver:reportes'), true);
  const registro = Store.acciones();
  const cobro = registro.find((a) => a.tipo === 'cobro' && a.detalle.includes(Util.numeroComprobante(pago)));
  assert.strictEqual(cobro.usuario, 'Ana Torres');
  assert.ok(registro.some((a) => a.tipo === 'socio-editado' && a.usuario === 'Ana Torres'));
  assert.ok(registro.some((a) => a.tipo === 'venta' && a.usuario === 'Ana Torres'));
  Store.remove('socios', 25);
  assert.ok(Store.acciones({ tipo: 'baja' })[0].usuario === 'Dueño', 'la baja queda con el nombre de quien la hizo');
  Store.cerrarSesion();
});

test('el dueño crea usuarios; siempre queda un dueño activo y nadie se desactiva a sí mismo', () => {
  fresh();
  Store.iniciarSesion('dueno', 'demo');
  assert.throws(() => Store.crearUsuario({ usuario: 'a', nombre: 'A', rol: 'recepcion', clave: '123456' }), /usuario-invalido/);
  assert.throws(() => Store.crearUsuario({ usuario: 'recepcion', nombre: 'A', rol: 'recepcion', clave: '123456' }), /usuario-repetido/);
  assert.throws(() => Store.crearUsuario({ usuario: 'luis', nombre: 'Luis', rol: 'recepcion', clave: '123' }), /clave-corta/);
  assert.throws(() => Store.crearUsuario({ usuario: 'luis', nombre: 'Luis', rol: 'jefe', clave: '123456' }), /rol-invalido/);
  const luis = Store.crearUsuario({ usuario: 'Luis', nombre: 'Luis Gómez', rol: 'recepcion', clave: 'clave123' });
  assert.strictEqual(luis.usuario, 'luis');
  assert.throws(() => Store.actualizarUsuario(1, { activo: false }), /ultimo-dueno|no-a-si-mismo/);
  assert.throws(() => Store.actualizarUsuario(1, { rol: 'recepcion' }), /ultimo-dueno/);
  Store.actualizarUsuario(luis.id, { activo: false });
  Store.cerrarSesion();
  assert.strictEqual(Store.iniciarSesion('luis', 'clave123').motivo, 'inactivo');
  Store.iniciarSesion('dueno', 'demo');
  Store.actualizarUsuario(luis.id, { activo: true });
  Store.cambiarClave(luis.id, { nueva: 'otra456' });
  Store.cerrarSesion();
  assert.strictEqual(Store.iniciarSesion('luis', 'clave123').ok, false);
  assert.strictEqual(Store.iniciarSesion('luis', 'otra456').ok, true);
  assert.throws(() => Store.cambiarClave(luis.id, { actual: 'mal', nueva: 'nueva789' }), /clave-actual-incorrecta/);
  Store.cambiarClave(luis.id, { actual: 'otra456', nueva: 'nueva789' });
  assert.throws(() => Store.cambiarClave(1, { nueva: 'robada1' }), /sin-permiso/, 'recepción no cambia la clave de otro');
  Store.cerrarSesion();
  assert.strictEqual(Store.iniciarSesion('luis', 'nueva789').ok, true);
  Store.cerrarSesion();
});

test('la sesión guardada se retoma solo si el usuario sigue activo', () => {
  fresh();
  assert.strictEqual(Store.actuarComo(1).usuario, 'dueno');
  assert.strictEqual(Store.actuarComo(99), null);
  assert.strictEqual(Store.puede('ajustes'), false, 'sin usuario no hay permisos');
  Store.actuarComo(null);
});

test('cobro: guarda periodo, comprobante y quién cobró; datos guardados sin usuarios reciben los de la demo', () => {
  fresh();
  const s = socioCon('2026-11-05', 2);
  Store.actuarComo(1);
  const pago = Store.cobrar({ socioId: s.id, planId: 2, metodo: 'efectivo' });
  assert.deepStrictEqual([pago.desde, pago.hasta, pago.por], ['2026-11-06', '2026-11-12', 'Dueño']);
  assert.match(Util.numeroComprobante(pago), /^C-\d{6}$/);
  Store.actuarComo(null);
  const m = mem();
  Store.init(m);
  const datos = JSON.parse(m.getItem('sag:db'));
  delete datos.usuarios; delete datos.acciones; delete datos.pases; delete datos.derechos;
  m.setItem('sag:db', JSON.stringify(datos));
  Store.init(m);
  assert.strictEqual(Store.usuarios().length, 2);
  assert.deepStrictEqual([Store.list('acciones').length, Store.list('pases').length, Store.list('derechos').length], [0, 0, 0]);
});

// ---- Ley 81: aviso de privacidad y derechos sobre los datos ----

test('inscribir guarda el consentimiento al aviso de privacidad', () => {
  fresh();
  const s = Store.inscribir({ nombre: 'Ana', cedula: '8-1-1', telefono: '6000-0001', planId: 2, acepta: true });
  assert.deepStrictEqual(s.consentimiento, { fecha: '2026-11-02', aviso: Store.AVISO_PRIVACIDAD });
});

test('derechos: el socio pide ver, corregir o borrar; el dueño atiende y puede borrar sus datos', () => {
  fresh();
  const s = socioCon('2026-11-20', 4);
  assert.throws(() => Store.solicitarDerecho(s.id, { tipo: 'correccion', detalle: '' }), /detalle-vacio/);
  assert.throws(() => Store.solicitarDerecho(s.id, { tipo: 'otro' }), /tipo-invalido/);
  const c = Store.solicitarDerecho(s.id, { tipo: 'correccion', detalle: 'Mi correo es otro' });
  assert.strictEqual(Store.solicitarDerecho(s.id, { tipo: 'correccion', detalle: 'repetida' }).id, c.id, 'no duplica la pendiente');
  const b = Store.solicitarDerecho(s.id, { tipo: 'borrado' });
  assert.strictEqual(Store.derechosDe(s.id).length, 2);
  Store.iniciarSesion('recepcion', 'recepcion');
  assert.throws(() => Store.atenderDerecho(c.id, {}), /sin-permiso/);
  Store.cerrarSesion();
  Store.iniciarSesion('dueno', 'demo');
  assert.throws(() => Store.atenderDerecho(c.id, { borrar: true }), /tipo-invalido/, 'solo se borra con una solicitud de borrado');
  Store.atenderDerecho(c.id, { respuesta: 'Listo' });
  assert.throws(() => Store.atenderDerecho(c.id, {}), /solicitud-no-pendiente/);
  const pagosAntes = Store.list('pagos').filter((p) => p.socioId === s.id).length;
  Store.atenderDerecho(b.id, { borrar: true });
  assert.strictEqual(Store.get('socios', s.id), null, 'socio borrado');
  assert.strictEqual(Store.list('pagos').filter((p) => p.socioId === s.id).length, pagosAntes, 'los pagos quedan en los reportes');
  assert.ok(Store.derechos().filter((x) => x.socioId === s.id).every((x) => x.nombre === 'Datos borrados' && !x.cedula));
  Store.cerrarSesion();
});

// ---- Carga desde Excel y respaldos ----

test('revisarImportacion: crea, actualiza u omite cada fila y explica por qué', () => {
  fresh();
  const filas = [
    { nombre: 'Nuevo Uno', cedula: '8-500-1', telefono: '6000-1111', plan: 'semanal', vence: '2026-11-07', correo: 'uno@correo.com' },
    { nombre: 'María F. Ortiz', cedula: ' 8-801-2210 ', telefono: '6612-1002', plan: '30' },
    { nombre: '', cedula: '8-500-2', telefono: '6000' },
    { nombre: 'Repetido', cedula: '8-500-1', telefono: '6000-2222' },
    { nombre: 'Con avisos', cedula: '8-500-3', telefono: '6000-3333', plan: 'Anual', vence: '31/02/2026', correo: 'malo', nacimiento: '2030-01-01', etiquetas: 'VIP, Estudiante' },
  ];
  const r = Store.revisarImportacion(filas);
  assert.deepStrictEqual(r.map((x) => x.accion), ['crear', 'actualizar', 'omitir', 'omitir', 'crear']);
  assert.deepStrictEqual(r.map((x) => x.fila), [2, 3, 4, 5, 6], 'número de fila como en Excel (la 1 es el encabezado)');
  assert.strictEqual(r[0].datos.planId, 2);
  assert.strictEqual(r[1].socioId, 2);
  assert.match(r[2].motivo, /nombre/);
  assert.match(r[3].motivo, /repetida/);
  assert.strictEqual(r[4].datos.planId, 4, 'plan desconocido: mensual');
  assert.strictEqual(r[4].avisos.length, 4);
  assert.deepStrictEqual(r[4].datos.etiquetas, ['VIP', 'Estudiante']);
  assert.strictEqual(Store.list('socios').length, 26, 'revisar no guarda nada');
});

test('importarSocios guarda lo revisado, exige permiso y queda en el registro', () => {
  fresh();
  Store.iniciarSesion('recepcion', 'recepcion');
  assert.throws(() => Store.importarSocios([]), /sin-permiso/);
  Store.cerrarSesion();
  Store.iniciarSesion('dueno', 'demo');
  const r = Store.importarSocios([
    { nombre: 'Nuevo Uno', cedula: '8-500-1', telefono: '6000-1111', plan: 'Semanal', vence: '2026-11-07' },
    { nombre: 'Nuevo Dos', cedula: '8-500-2', telefono: '6000-2222' },
    { nombre: 'Carlos Mendoza', cedula: '8-745-1201', telefono: '6612-0000' },
    { nombre: 'Sin cédula', cedula: '', telefono: '1' },
  ]);
  assert.deepStrictEqual([r.creados, r.actualizados, r.omitidos], [2, 1, 1]);
  const uno = Store.list('socios').find((s) => s.cedula === '8-500-1');
  assert.deepStrictEqual([uno.planId, uno.vence, uno.origen, Store.estadoSocio(uno)], [2, '2026-11-07', 'importacion', 'activo']);
  const dos = Store.list('socios').find((s) => s.cedula === '8-500-2');
  assert.strictEqual(Store.estadoSocio(dos), 'pendiente');
  assert.strictEqual(Store.get('socios', 1).telefono, '6612-0000', 'actualizado');
  const reg = Store.acciones();
  assert.strictEqual(reg.filter((a) => a.tipo === 'importacion').length, 1);
  assert.strictEqual(reg.filter((a) => a.tipo === 'socio-nuevo').length, 0, 'no anota cada socio por separado');
  Store.cerrarSesion();
});

test('respaldos: uno por día (máximo 7), exportar y restaurar', () => {
  fresh();
  const m = mem();
  m.removeItem = (k) => { delete m._d[k]; };
  const datos = {};
  m._d = datos;
  m.getItem = (k) => (k in datos ? datos[k] : null);
  m.setItem = (k, v) => { datos[k] = String(v); };
  Store.init(m);
  assert.strictEqual(Store.respaldoDiario(), true);
  assert.strictEqual(Store.respaldoDiario(), false, 'una vez por día');
  for (let d = 3; d <= 12; d++) { Store.setHoy('2026-11-' + String(d).padStart(2, '0')); Store.respaldoDiario(); }
  const lista = Store.respaldos();
  assert.strictEqual(lista.length, 7);
  assert.strictEqual(lista[0].fecha, '2026-11-12', 'el más reciente primero');
  assert.ok(!('sag:respaldo:2026-11-02' in datos), 'el más viejo se borra');
  Store.setHoy('2026-11-12');
  Store.iniciarSesion('dueno', 'demo');
  const copiaTotal = Store.exportarTodo();
  Store.remove('socios', 1);
  assert.strictEqual(Store.get('socios', 1), null);
  Store.restaurar(copiaTotal, 'una copia');
  assert.ok(Store.get('socios', 1), 'vuelve el socio');
  assert.strictEqual(Store.usuario().nombre, 'Dueño', 'la sesión sigue');
  assert.throws(() => Store.restaurar('{"nada":1}'), /respaldo-invalido/);
  Store.restaurarRespaldo('2026-11-06');
  assert.ok(Store.acciones({ tipo: 'restauracion' }).length >= 1);
  Store.cerrarSesion();
  Store.setHoy('2026-11-02');
});

test('el QR del carnet (js/qr.js) se lee de vuelta con jsQR', () => {
  const QR = require('../js/qr.js');
  const jsQR = require('../js/vendor/jsQR.js');
  fresh();
  Store.list('socios').slice(0, 8).forEach((s) => {
    const codigo = Util.codigoSocio(s);
    const svg = QR.svg(codigo, 'QR de ' + s.nombre);
    const lado = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)[1]);
    assert.strictEqual(lado, 21 + 2 * QR.MARGEN, 'QR de 21×21 módulos más el margen blanco');
    // Se "imprime" el SVG en píxeles (4 por módulo) y se lee como lo haría la cámara.
    const esc = 4;
    const px = lado * esc;
    const datos = new Uint8ClampedArray(px * px * 4).fill(255);
    const d = /<path d="([^"]+)"/.exec(svg)[1];
    let tramos = 0;
    for (const [, x, y, largo] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      tramos++;
      for (let yy = Number(y) * esc; yy < (Number(y) + 1) * esc; yy++) {
        for (let xx = Number(x) * esc; xx < (Number(x) + Number(largo)) * esc; xx++) {
          const i = (yy * px + xx) * 4;
          datos[i] = datos[i + 1] = datos[i + 2] = 0;
        }
      }
    }
    assert.strictEqual(tramos, d.split('M').length - 1, 'se dibujaron todos los tramos');
    const r = jsQR(datos, px, px, { inversionAttempts: 'dontInvert' });
    assert.ok(r, 'se encontró el QR de ' + codigo);
    assert.strictEqual(r.data, codigo);
  });
  assert.ok(!QR.svg('SAG000001AA', '<img src=x onerror=alert(1)>').includes('<img'), 'la etiqueta se escapa');
});

test('QR.dibujar pinta en el canvas el margen blanco y los mismos módulos que la matriz', () => {
  const QR = require('../js/qr.js');
  const llamadas = [];
  const ctx = { fillRect: (...a) => llamadas.push([ctx.fillStyle, ...a]), fillStyle: '' };
  const lienzo = { getContext: () => ctx };
  const codigo = Util.codigoSocio({ id: 2, cedula: '8-801-2210' });
  QR.dibujar(lienzo, codigo, 10);
  const m = QR.matriz(codigo);
  const lado = (m.length + 2 * QR.MARGEN) * 10;
  assert.strictEqual(lienzo.width, lado);
  assert.deepStrictEqual(llamadas[0], ['#fff', 0, 0, lado, lado], 'primero todo blanco (el margen va en los píxeles)');
  const negros = m.flat().filter(Boolean).length;
  assert.strictEqual(llamadas.length - 1, negros);
  assert.ok(llamadas.slice(1).every(([color, x, y]) => color === '#000' && m[y / 10 - QR.MARGEN][x / 10 - QR.MARGEN]));
});

let fallos = 0;
for (const [nombre, fn] of tests) {
  try { fn(); console.log('ok   ' + nombre); } catch (e) { fallos++; console.log('FAIL ' + nombre + '\n     ' + e.message); }
}
console.log(`\n${tests.length - fallos}/${tests.length} pasan`);
process.exit(fallos ? 1 : 0);
