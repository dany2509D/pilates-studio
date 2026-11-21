// Pruebas de js/excel.js (Excel y CSV sin librerías): node tests/excel.test.js
const assert = require('node:assert');
require('./datos-prueba.js');
const zlib = require('node:zlib');
const Excel = require('../js/excel.js');
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

// Como DecompressionStream('deflate-raw') del navegador, pero con zlib.
const inflar = (b) => Promise.resolve(new Uint8Array(zlib.inflateRawSync(b)));
const crc = (b) => (zlib.crc32 ? zlib.crc32(b) : Excel.crc32(b));

// ZIP con las partes comprimidas (método 8), como los .xlsx que guarda Excel.
function zipComprimido(archivos) {
  const partes = [];
  const central = [];
  let off = 0;
  for (const a of archivos) {
    const datos = Buffer.from(a.texto, 'utf8');
    const comp = zlib.deflateRawSync(datos);
    const nom = Buffer.from(a.nombre, 'utf8');
    const suma = crc(datos);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8);
    loc.writeUInt32LE(suma, 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(datos.length, 22); loc.writeUInt16LE(nom.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(suma, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(datos.length, 24); cen.writeUInt16LE(nom.length, 28); cen.writeUInt32LE(off, 42);
    partes.push(loc, nom, comp);
    central.push(cen, nom);
    off += 30 + nom.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...partes, cd, fin]));
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NSP = 'http://schemas.openxmlformats.org/package/2006/relationships';

// Un libro como el que guarda Excel: cadenas compartidas (con texto enriquecido y guía fonética), la primera
// hoja de la lista no es sheet1.xml, columnas con huecos (A, C, AB) y filas salteadas.
function libroDeExcel() {
  return zipComprimido([
    { nombre: '[Content_Types].xml', texto: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { nombre: '_rels/.rels', texto: `<?xml version="1.0"?><Relationships xmlns="${NSP}"><Relationship Id="rId1" Type="${NSR}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', texto: `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${NSR}"><bookViews><workbookView/></bookViews><sheets><sheet name="Socios" sheetId="7" r:id="rId3"/><sheet name="Otra" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: `<?xml version="1.0"?><Relationships xmlns="${NSP}"><Relationship Id="rId1" Type="${NSR}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Type="${NSR}/worksheet" Target="/xl/worksheets/hoja-socios.xml"/><Relationship Id="rId9" Type="${NSR}/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    { nombre: 'xl/sharedStrings.xml', texto: `<?xml version="1.0"?><sst xmlns="${NS}" count="5" uniqueCount="5"><si><t>Nombre</t></si><si><t>Cédula</t></si><si><r><rPr><b/><sz val="11"/></rPr><t>Telé</t></r><r><t>fono</t></r></si><si><t>Notas</t></si><si><t>José</t><rPh sb="0" eb="1"><t>ホセ</t></rPh></si><si><t>Línea_x000D_</t></si></sst>` },
    { nombre: 'xl/worksheets/sheet1.xml', texto: `<?xml version="1.0"?><worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>No es esta</t></is></c></row></sheetData></worksheet>` },
    { nombre: 'xl/worksheets/hoja-socios.xml', texto: `<?xml version="1.0"?><worksheet xmlns="${NS}"><dimension ref="A1:AB4"/><cols><col min="1" max="1" width="20"/></cols><sheetData>`
      + '<row r="1" spans="1:28"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="AB1" t="s"><v>3</v></c></row>'
      + '<row r="2"/>'
      + '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" s="2"><v>8.5</v></c><c r="C3" t="b"><v>1</v></c><c r="AB3" t="str"><f>CONCAT("a","b")</f><v>ab</v></c></row>'
      + '<row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve"> Ñandú &amp; Cía </t></is></c><c r="C4" s="1"><v>45658</v></c><c r="D4" t="e"><v>#N/A</v></c><c r="E4" s="3"/><c r="F4" t="s"><v>5</v></c></row>'
      + '</sheetData></worksheet>' },
  ]);
}

const tests = [];
const test = (nombre, fn) => tests.push([nombre, fn]);

test('aCsv: comas, comillas, saltos de línea y ñ, con CRLF entre filas', () => {
  const t = Excel.aCsv([['Nombre', 'Nota'], ['Peña, José', 'dijo "hola"'], ['Ana', 'línea 1\nlínea 2'], ['  con espacios ', 'a;b']]);
  assert.strictEqual(t, 'Nombre,Nota\r\n"Peña, José","dijo ""hola"""\r\nAna,"línea 1\nlínea 2"\r\n"  con espacios ","a;b"\r\n');
});

test('aCsv: fechas AAAA-MM-DD (se leen bien con cualquier configuración), montos y números como números, vacíos', () => {
  const t = Excel.aCsv([['Fecha', 'Monto', 'N', 'Nada', 'Sí'], [Excel.fecha('2026-11-02'), Excel.monto(30), 12.5, null, true], [Excel.fecha(''), Excel.monto(0), NaN, undefined, false]]);
  assert.strictEqual(t, 'Fecha,Monto,N,Nada,Sí\r\n2026-11-02,30,12.5,,Sí\r\n,0,,,No\r\n');
});

test('protección contra fórmulas: texto que empieza con = + - @ tab o retorno lleva apóstrofo', () => {
  const t = Excel.aCsv([['A', 'B', 'C', 'D', 'E', 'F', 'G'], ['=SUMA(A1)', '+50760001234', '-5', '@cmd', '\tx', '\rx', -5]]);
  const fila = Excel.leerCsv(t)[1];
  assert.deepStrictEqual(fila, ["'=SUMA(A1)", "'+50760001234", "'-5", "'@cmd", "'\tx", "'\rx", '-5']);
  assert.ok(t.includes(',-5\r\n'), 'un número negativo de verdad no lleva apóstrofo');
  // Al volver a importar el CSV, el apóstrofo se quita.
  const m = Excel.mapearSocios([['Nombre', 'Cédula', 'Teléfono'], ["'=HYPERLINK(\"x\")", '8-1-1', "'+50760001234"]]);
  assert.strictEqual(m.filas[0].nombre, '=HYPERLINK("x")');
  assert.strictEqual(m.filas[0].telefono, '+50760001234');
});

test('leerCsv: comillas, comillas dobles, saltos dentro de comillas, CRLF, BOM y fila final sin salto', () => {
  const t = '﻿Nombre,Nota,Vacía\r\n"Peña, José","dijo ""hola""",\r\nAna,"línea 1\r\nlínea 2",""\nLuis,fin,x';
  assert.deepStrictEqual(Excel.leerCsv(t), [
    ['Nombre', 'Nota', 'Vacía'], ['Peña, José', 'dijo "hola"', ''], ['Ana', 'línea 1\r\nlínea 2', ''], ['Luis', 'fin', 'x'],
  ]);
  assert.deepStrictEqual(Excel.leerCsv(''), []);
  assert.deepStrictEqual(Excel.leerCsv('a\r\n\r\nb\r\n'), [['a'], [''], ['b']]);
});

test('leerCsv: detecta punto y coma (Excel en otros idiomas) en la primera línea', () => {
  assert.deepStrictEqual(Excel.leerCsv('Nombre;Cédula;Nota\r\nAna;8-1-1;"uno, dos"\r\n'), [['Nombre', 'Cédula', 'Nota'], ['Ana', '8-1-1', 'uno, dos']]);
  assert.deepStrictEqual(Excel.leerCsv('"a;b",c\r\n1,2'), [['a;b', 'c'], ['1', '2']], 'el ; entre comillas no cuenta');
});

test('aCsv y leerCsv: ida y vuelta', () => {
  const filas = [['Nombre', 'Nota'], ['Ñoño Pérez', 'a,b;"c"\nd'], ['', ' x ']];
  assert.deepStrictEqual(Excel.leerCsv(Excel.aCsv(filas)), filas);
});

test('fechaDeSerie: sistema 1900 de Excel (con su 29/02/1900 inexistente)', () => {
  assert.strictEqual(Excel.fechaDeSerie(1), '1900-01-01');
  assert.strictEqual(Excel.fechaDeSerie(59), '1900-02-28');
  assert.strictEqual(Excel.fechaDeSerie(60), null);
  assert.strictEqual(Excel.fechaDeSerie(61), '1900-03-01');
  assert.strictEqual(Excel.fechaDeSerie(44927), '2023-01-01');
  assert.strictEqual(Excel.fechaDeSerie(45658), '2025-01-01');
  assert.strictEqual(Excel.fechaDeSerie(45658.75), '2025-01-01', 'la hora no cambia el día');
  assert.strictEqual(Excel.fechaDeSerie(46340), '2026-11-14');
  assert.strictEqual(Excel.fechaDeSerie(0), null);
  assert.strictEqual(Excel.fechaDeSerie('abc'), null);
  ['1900-01-01', '1900-02-28', '1900-03-01', '2024-02-29', '2026-11-14'].forEach((f) => {
    assert.strictEqual(Excel.fechaDeSerie(Excel.serieDeFecha(f)), f);
  });
});

test('aFecha: número de serie, dd/mm/aaaa, aaaa-mm-dd y textos que no son fecha', () => {
  assert.strictEqual(Excel.aFecha(46340), '2026-11-14');
  assert.strictEqual(Excel.aFecha('14/11/2026'), '2026-11-14');
  assert.strictEqual(Excel.aFecha('4/3/2026'), '2026-03-04', 'día/mes como en Panamá');
  assert.strictEqual(Excel.aFecha('11/14/2026'), '2026-11-14', 'si el segundo número no puede ser mes, venía como mes/día');
  assert.strictEqual(Excel.aFecha('14-11-26'), '2026-11-14');
  assert.strictEqual(Excel.aFecha('14/05/90'), '1990-05-14');
  assert.strictEqual(Excel.aFecha('2026-1-5'), '2026-01-05');
  assert.strictEqual(Excel.aFecha('2026-11-14T00:00:00'), '2026-11-14');
  assert.strictEqual(Excel.aFecha('46340'), '2026-11-14', 'serie guardada como texto');
  assert.strictEqual(Excel.aFecha('31/02/2026'), '31/02/2026', 'una fecha imposible vuelve tal cual (la revisión avisa)');
  assert.strictEqual(Excel.aFecha('pronto'), 'pronto');
  assert.strictEqual(Excel.aFecha(''), '');
});

test('aFecha con orden: decide las fechas como 01/12/2026; un número mayor que 12 siempre es el día', () => {
  assert.strictEqual(Excel.aFecha('01/12/2026', 'dm'), '2026-12-01');
  assert.strictEqual(Excel.aFecha('01/12/2026', 'md'), '2026-01-12');
  assert.strictEqual(Excel.aFecha('01/12/2026'), '2026-12-01', 'sin orden: día/mes');
  assert.strictEqual(Excel.aFecha('25/10/2026', 'md'), '2026-10-25');
  assert.strictEqual(Excel.aFecha('10/25/2026', 'dm'), '2026-10-25');
  assert.strictEqual(Excel.aFecha('2026-01-12', 'md'), '2026-01-12', 'AAAA-MM-DD no cambia');
  assert.strictEqual(Excel.aFecha(Excel.serieDeFecha('2026-01-12'), 'md'), '2026-01-12', 'la fecha real de Excel no cambia');
  assert.strictEqual(Excel.fechaEnPalabras('2026-12-01'), '1 de diciembre de 2026');
  assert.strictEqual(Excel.fechaEnPalabras('2026-01-12', true), '12 ene 2026');
  assert.strictEqual(Excel.fechaEnPalabras('2026-02-31'), '2026-02-31');
});

// Socios con una columna Vence (y opcionalmente Nacimiento) con los valores dados.
const conFechas = (vence, nacimiento) => Excel.mapearSocios([['Nombre', 'Cédula', 'Teléfono', 'Vence'].concat(nacimiento ? ['Nacimiento'] : [])]
  .concat(vence.map((v, i) => [`Socio ${i + 1}`, `8-1-${i + 1}`, '6000-0000', v].concat(nacimiento ? [nacimiento[i] == null ? '' : nacimiento[i]] : []))));
const orden = (m, campo) => (m.reconocidas.find((r) => r.campo === campo) || {}).orden;

test('fechas por columna: un CSV guardado por Excel con mes/día (Panamá) se lee entero como mes/día', () => {
  // Así guarda Excel en Windows es-PA el 1 de diciembre y el 20 de noviembre.
  const m = Excel.mapearSocios(Excel.leerCsv('﻿Nombre;Cédula;Teléfono;Vence\r\nJosé Núñez;8-111-2222;6000-1234;12/01/2026\r\nAna Pérez;8-333-4444;6000-5678;11/20/2026\r\n'));
  assert.deepStrictEqual(m.filas.map((f) => f.vence), ['2026-12-01', '2026-11-20']);
  assert.strictEqual(orden(m, 'vence'), 'md');
  assert.deepStrictEqual(m.avisos, [], 'la columna lo decide: no hay duda');
  assert.deepStrictEqual(m.avisosFilas, [[], []]);
});

test('fechas por columna: día/mes cuando algún primer número pasa de 12', () => {
  const m = conFechas(['01/12/2026', '25/10/2026', '3/4/2026']);
  assert.deepStrictEqual(m.filas.map((f) => f.vence), ['2026-12-01', '2026-10-25', '2026-04-03']);
  assert.strictEqual(orden(m, 'vence'), 'dm');
  assert.deepStrictEqual(m.avisos, []);
});

test('fechas por columna: si ninguna lo decide, día/mes con un aviso visible', () => {
  const m = conFechas(['01/12/2026', '02/11/2026', '05/05/2026']);
  assert.deepStrictEqual(m.filas.map((f) => f.vence), ['2026-12-01', '2026-11-02', '2026-05-05']);
  assert.strictEqual(orden(m, 'vence'), 'dm');
  assert.strictEqual(m.avisos.length, 1);
  assert.strictEqual(m.avisos[0].titulo, 'Fechas como 01/12/2026: las leí como día/mes. Revísalas.');
  assert.match(m.avisos[0].detalle, /«Vence», 01\/12\/2026 quedó como 1 de diciembre de 2026/);
  assert.match(m.avisos[0].detalle, /AAAA-MM-DD/);
  assert.deepStrictEqual(m.avisosFilas, [[], [], []], 'el aviso es uno para todo el archivo');
  // 05/05/2026 se lee igual de las dos formas: sola no da aviso.
  assert.deepStrictEqual(conFechas(['05/05/2026', '2026-12-01', Excel.serieDeFecha('2026-01-12')]).avisos, []);
});

test('fechas por columna: una columna que no lo decide sigue a la otra columna de fechas del archivo', () => {
  const m = conFechas(['12/01/2026', '11/03/2026'], ['05/25/1990', '']);
  assert.strictEqual(orden(m, 'nacimiento'), 'md');
  assert.strictEqual(orden(m, 'vence'), 'md');
  assert.deepStrictEqual(m.filas.map((f) => [f.vence, f.nacimiento]), [['2026-12-01', '1990-05-25'], ['2026-11-03', '']]);
  assert.strictEqual(m.avisos.length, 1);
  assert.strictEqual(m.avisos[0].titulo, 'Fechas como 12/01/2026: las leí como mes/día, igual que las de «Nacimiento». Revísalas.');
});

test('fechas por columna: día/mes y mes/día mezclados avisan en esas filas', () => {
  const m = conFechas(['25/10/2026', '10/26/2026', '01/12/2026', '05/05/2026', '2026-12-01']);
  assert.deepStrictEqual(m.filas.map((f) => f.vence), ['2026-10-25', '2026-10-26', '2026-12-01', '2026-05-05', '2026-12-01']);
  assert.strictEqual(orden(m, 'vence'), 'mixto');
  assert.strictEqual(m.avisos.length, 1);
  assert.match(m.avisos[0].titulo, /«Vence» hay fechas día\/mes \(como 25\/10\/2026\) y mes\/día \(como 10\/26\/2026\)/);
  assert.deepStrictEqual(m.avisosFilas.map((a) => a.length), [1, 1, 1, 0, 0]);
  assert.strictEqual(m.avisosFilas[2][0], 'Vence «01/12/2026» quedó como 1 de diciembre de 2026: en esa columna hay fechas día/mes y mes/día. Revísala.');
});

test('fechas por columna: en un .xlsx, fechas que Excel no reconoció junto a fechas reales avisan de un posible volteo', async () => {
  // En un Excel con mes/día, escribir 01/12/2026 guarda el 12 de enero y 25/12/2026 queda como texto.
  const filas = [['Nombre', 'Cédula', 'Teléfono', 'Vence'], ['Ana', '8-1-1', '6000-0001', Excel.fecha('2026-01-12')], ['Luis', '8-1-2', '6000-0002', '25/12/2026'], ['Eva', '8-1-3', '6000-0003', Excel.fecha('2026-11-14')]];
  const m = Excel.mapearSocios(await Excel.leerXlsx(Excel.xlsx([{ nombre: 'Socios', filas }]), inflar));
  assert.deepStrictEqual(m.filas.map((f) => f.vence), ['2026-01-12', '2026-12-25', '2026-11-14']);
  assert.strictEqual(m.avisos.length, 1);
  assert.match(m.avisos[0].titulo, /Excel no reconoció \(como 25\/12\/2026\)/);
  assert.deepStrictEqual(m.avisosFilas.map((a) => a.length), [1, 0, 0], 'solo la que pudo voltearse (día 12 o menos)');
  assert.match(m.avisosFilas[0][0], /12 de enero de 2026/);
  // Solo fechas reales de Excel: no hay nada que dudar.
  const reales = Excel.mapearSocios(await Excel.leerXlsx(Excel.xlsx([{ nombre: 'Socios', filas: [filas[0], filas[1], filas[3]] }]), inflar));
  assert.deepStrictEqual(reales.avisos, []);
  assert.deepStrictEqual(reales.avisosFilas, [[], []]);
  // Texto día/mes junto a fechas reales que no se pueden voltear (día mayor que 12): tampoco hay aviso.
  const sinVolteo = Excel.mapearSocios(await Excel.leerXlsx(Excel.xlsx([{ nombre: 'Socios', filas: [filas[0], filas[2], filas[3]] }]), inflar));
  assert.deepStrictEqual(sinVolteo.avisos, []);
});

test('fechas por columna: una fecha imposible (31/02/2026) no decide el orden', () => {
  const m = conFechas(['31/02/2026', '01/12/2026']);
  assert.strictEqual(orden(m, 'vence'), 'dm', 'queda día/mes por no poder decidir');
  assert.strictEqual(m.avisos.length, 1);
  assert.strictEqual(m.avisos[0].titulo, 'Fechas como 01/12/2026: las leí como día/mes. Revísalas.');
  assert.deepStrictEqual(m.filas.map((f) => f.vence), ['31/02/2026', '2026-12-01'], 'la imposible vuelve tal cual y la revisión de Store avisa');
  // Con un real de Excel con día 12 o menos al lado, tampoco hay aviso de volteo (no hubo texto que Excel no entendiera).
  assert.deepStrictEqual(conFechas(['31/02/2026', Excel.serieDeFecha('2026-01-12')]).avisos, []);
});

test('fechas por columna: el CSV que exporta el panel vuelve a entrar con las mismas fechas y sin avisos', () => {
  const filas = [['Nombre', 'Cédula', 'Teléfono', 'Vence', 'Nacimiento'], ['Ana', '8-1-1', '6000-0001', Excel.fecha('2026-01-12'), Excel.fecha('1990-03-04')], ['Luis', '8-1-2', '6000-0002', Excel.fecha('2026-12-01'), Excel.fecha('')]];
  const m = Excel.mapearSocios(Excel.leerCsv(Excel.aCsv(filas)));
  assert.deepStrictEqual(m.filas.map((f) => [f.vence, f.nacimiento]), [['2026-01-12', '1990-03-04'], ['2026-12-01', '']]);
  assert.deepStrictEqual(m.avisos, []);
  assert.strictEqual(orden(m, 'vence'), undefined);
});

test('xlsx: ida y vuelta (texto con tildes y símbolos, números, montos, fechas, booleanos y huecos)', async () => {
  const filas = [
    ['Nombre', 'Cédula', 'Monto', 'Fecha', 'Nota'],
    ['José Peña', '8-1-1', Excel.monto(30), Excel.fecha('2026-11-02'), 'a < b & "c" \'d\' ]]>'],
    ['  espacios  ', 12345, 12.5, Excel.fecha(''), 'línea 1\nlínea 2'],
    ['', null, undefined, true, '=1+1'],
  ];
  const bytes = Excel.xlsx([{ nombre: 'Socios', filas }, { nombre: 'Pagos', filas: [['A'], [1]] }]);
  assert.ok(bytes instanceof Uint8Array);
  assert.deepStrictEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04], 'es un ZIP');
  const m = await Excel.leerXlsx(bytes, inflar);
  assert.deepStrictEqual(m, [
    ['Nombre', 'Cédula', 'Monto', 'Fecha', 'Nota'],
    ['José Peña', '8-1-1', 30, Excel.serieDeFecha('2026-11-02'), 'a < b & "c" \'d\' ]]>'],
    ['  espacios  ', 12345, 12.5, '', 'línea 1\nlínea 2'],
    ['', '', '', true, '=1+1'],
  ]);
  assert.strictEqual(Excel.fechaDeSerie(m[1][3]), '2026-11-02');
});

test('xlsx: partes de Office Open XML, sin compresión, CRC32 correcto, encabezado en negrita y estilos de fecha y monto', () => {
  const bytes = Excel.xlsx([{ nombre: 'Socios', filas: [['Nombre', 'Vence', 'Monto'], ['Ana', Excel.fecha('2026-11-02'), Excel.monto(3)]] }, { nombre: 'Pagos', filas: [] }]);
  const e = Excel.leerZip(bytes);
  ['[content_types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']
    .forEach((k) => { assert.ok(e[k], 'falta ' + k); assert.strictEqual(e[k].metodo, 0); });
  // CRC del directorio central contra el de zlib.
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = dv.getUint32(bytes.length - 22 + 16, true);
  for (let k = 0; k < Object.keys(e).length; k++) {
    const ln = dv.getUint16(p + 28, true);
    const nombre = Buffer.from(bytes.subarray(p + 46, p + 46 + ln)).toString('utf8').toLowerCase();
    assert.strictEqual(dv.getUint32(p + 16, true), crc(Buffer.from(e[nombre].datos)), 'CRC de ' + nombre);
    p += 46 + ln + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  const txt = (k) => Buffer.from(e[k].datos).toString('utf8');
  assert.ok(txt('xl/workbook.xml').includes('<sheet name="Socios" sheetId="1" r:id="rId1"/>'));
  assert.ok(txt('xl/worksheets/sheet1.xml').includes('<c r="A1" t="inlineStr" s="1"><is><t>Nombre</t></is></c>'));
  assert.ok(txt('xl/worksheets/sheet1.xml').includes(`<c r="B2" s="2"><v>${Excel.serieDeFecha('2026-11-02')}</v></c>`));
  assert.ok(txt('xl/worksheets/sheet1.xml').includes('<c r="C2" s="3"><v>3</v></c>'));
  assert.ok(txt('xl/styles.xml').includes('formatCode="dd/mm/yyyy"'));
  assert.strictEqual(Excel.crc32(Buffer.from('123456789')), 0xcbf43926, 'CRC32 de referencia');
});

test('xlsx: nombres de hoja de 31 caracteres como máximo, sin []:*?/\\ y sin repetirse', () => {
  const bytes = Excel.xlsx([{ nombre: 'Ventas: [cafetería] 2026/11 * ¿qué? \\ fin largo de verdad', filas: [] }, { nombre: 'Socios', filas: [] }, { nombre: 'socios', filas: [] }, { nombre: '', filas: [] }]);
  const libro = Buffer.from(Excel.leerZip(bytes)['xl/workbook.xml'].datos).toString('utf8');
  const nombres = [...libro.matchAll(/name="([^"]*)"/g)].map((x) => x[1]);
  assert.strictEqual(nombres.length, 4);
  nombres.forEach((n) => { assert.ok(n.length <= 31, n); assert.ok(!/[[\]:*?/\\]/.test(n), n); });
  assert.strictEqual(nombres[1], 'Socios');
  assert.strictEqual(nombres[2], 'socios (2)');
  assert.strictEqual(nombres[3], 'Hoja 4');
  assert.strictEqual(Excel.nombreHoja('Tom & Jerry <x>'), 'Tom & Jerry <x>');
  assert.ok(Excel.xlsx([{ nombre: 'Tom & Jerry', filas: [] }]).length > 0);
  assert.ok(Buffer.from(Excel.leerZip(Excel.xlsx([{ nombre: 'Tom & Jerry', filas: [] }]))['xl/workbook.xml'].datos).toString().includes('name="Tom &amp; Jerry"'), 'el nombre se escapa');
});

test('leerXlsx: .xlsx con partes comprimidas (método 8), cadenas compartidas, str, b, inlineStr, números y huecos', async () => {
  const m = await Excel.leerXlsx(libroDeExcel(), inflar);
  const fila1 = ['Nombre', 'Cédula', 'Teléfono'].concat(Array(24).fill(''), ['Notas']);
  assert.deepStrictEqual(m[0], fila1, 'columna AB = índice 27');
  assert.deepStrictEqual(m[1], [], 'fila 2 vacía');
  assert.deepStrictEqual(m[2], ['José', 8.5, true].concat(Array(24).fill(''), ['ab']), 'sin la guía fonética; resultado de la fórmula');
  assert.deepStrictEqual(m[3], [' Ñandú & Cía ', '', 45658, '', '', 'Línea\r'], 'error y celda vacía quedan en blanco; _x000D_ es un retorno');
  assert.strictEqual(m.length, 4);
});

test('leerXlsx: etiquetas con prefijo (x:row, x:c) y filas sin número', async () => {
  const bytes = zipComprimido([
    { nombre: 'xl/workbook.xml', texto: `<x:workbook xmlns:x="${NS}" xmlns:r="${NSR}"><x:sheets><x:sheet name="H" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: `<Relationships xmlns="${NSP}"><Relationship Id="rId1" Type="${NSR}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { nombre: 'xl/worksheets/sheet1.xml', texto: `<x:worksheet xmlns:x="${NS}"><x:sheetData><x:row><x:c t="inlineStr"><x:is><x:t>a</x:t></x:is></x:c><x:c><x:v>2</x:v></x:c></x:row><x:row><x:c r="B2" t="inlineStr"><x:is><x:t>b</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>` },
  ]);
  assert.deepStrictEqual(await Excel.leerXlsx(bytes, inflar), [['a', 2], ['', 'b']]);
});

test('leerXlsx: errores claros (no es un ZIP; comprimido sin descompresor)', async () => {
  await assert.rejects(Excel.leerXlsx(new Uint8Array([1, 2, 3, 4, 5]), inflar), /no es un Excel válido/);
  await assert.rejects(Excel.leerXlsx(libroDeExcel(), null), (e) => e.message === Excel.MSG_SIN_INFLAR);
});

test('leerArchivo: .xlsx comprimido con DecompressionStream y CSV en UTF-8 o Windows-1252', async () => {
  if (typeof File === 'undefined' || typeof DecompressionStream === 'undefined') return; // Node viejo
  const m = await Excel.leerArchivo(new File([libroDeExcel()], 'Socios.XLSX'));
  assert.strictEqual(m[0][1], 'Cédula');
  const ansi = Buffer.from('Nombre,Cédula\r\nPeña Núñez,8-1-1\r\n', 'latin1');
  assert.deepStrictEqual(await Excel.leerArchivo(new File([ansi], 'socios.csv')), [['Nombre', 'Cédula'], ['Peña Núñez', '8-1-1']]);
  const utf = Buffer.from('﻿Nombre;Cédula\r\nPeña;8-1-1', 'utf8');
  assert.deepStrictEqual(await Excel.leerArchivo(new File([utf], 'socios.csv')), [['Nombre', 'Cédula'], ['Peña', '8-1-1']]);
  await assert.rejects(Excel.leerArchivo(new File(['x'], 'viejo.xls')), /Excel antiguo/);
});

test('mapearSocios: sinónimos de encabezados, columnas ignoradas, título arriba y filas vacías', () => {
  const m = Excel.mapearSocios([
    ['Lista de socios · Stars'],
    [],
    ['Nombre completo', 'Documento', 'Celular', 'Membresía', 'Fecha de vencimiento', 'E-mail', 'Cumpleaños', 'Etiquetas', 'Observaciones', ''],
    ['Carla Ruiz', '8-900-1', 60001111, 'Quincenal', 46340, 'carla@correo.com', '14/05/1990', 'VIP; Mañana', 'paga puntual'],
    ['', '', '', '', '', '', '', '', 'nota suelta'],
    [],
    ['Luis', '8-900-2', '6000-2222', 30, '2026-12-01', '', '', ''],
  ]);
  assert.strictEqual(m.filaEncabezado, 3);
  assert.deepStrictEqual(m.reconocidas.map((r) => r.campo), ['nombre', 'cedula', 'telefono', 'plan', 'vence', 'correo', 'nacimiento', 'etiquetas']);
  assert.deepStrictEqual(m.reconocidas.map((r) => r.encabezado).slice(0, 3), ['Nombre completo', 'Documento', 'Celular']);
  assert.deepStrictEqual(m.ignoradas, ['Observaciones']);
  assert.deepStrictEqual(m.faltan, []);
  assert.deepStrictEqual(m.numeros, [4, 7], 'número de fila de Excel; las vacías no cuentan');
  assert.deepStrictEqual(m.filas[0], {
    nombre: 'Carla Ruiz', cedula: '8-900-1', telefono: '60001111', plan: 'Quincenal', vence: '2026-11-14',
    correo: 'carla@correo.com', nacimiento: '1990-05-14', etiquetas: 'VIP; Mañana',
  });
  assert.strictEqual(m.filas[1].plan, '30');
});

test('mapearSocios: otros sinónimos (Cédula/Cedula, Teléfono/Móvil/WhatsApp, Email, Vence, Nacimiento) y Nombre + Apellido', () => {
  const casos = [
    [['Nombre', 'Cédula', 'Teléfono', 'Plan', 'Vence', 'Correo', 'Nacimiento', 'Etiquetas'], 8],
    [['NOMBRE', 'Cedula', 'Telefono', 'PLAN', 'Vencimiento', 'Email', 'Fecha de nacimiento', 'etiquetas'], 8],
    [['Nombre', 'Cédula', 'Móvil', 'Plan', 'Vence (dd/mm/aaaa)', 'E-mail', 'Nacimiento'], 7],
    [['Nombre', 'Nº de cédula', 'WhatsApp'], 3],
    [['Nombre', 'Cédula', 'Teléfono (WhatsApp)'], 3],
  ];
  casos.forEach(([enc, n]) => {
    const m = Excel.mapearSocios([enc]);
    assert.strictEqual(m.reconocidas.length, n, enc.join(' | '));
    assert.deepStrictEqual(m.faltan, [], enc.join(' | '));
  });
  const m = Excel.mapearSocios([['Nombre', 'Apellido', 'Cédula', 'Teléfono', 'Teléfono'], ['Ana', 'Gómez', '8-1-1', '6000-0001', '6000-0002']]);
  assert.strictEqual(m.filas[0].nombre, 'Ana Gómez');
  assert.strictEqual(m.filas[0].telefono, '6000-0001', 'la primera columna repetida gana');
  assert.deepStrictEqual(m.ignoradas, ['Teléfono']);
  const sin = Excel.mapearSocios([['Socio nombre', 'Doc'], ['a', 'b']]);
  assert.deepStrictEqual(sin.faltan, ['Nombre', 'Cédula', 'Teléfono']);
  assert.deepStrictEqual(Excel.mapearSocios([]).faltan, ['Nombre', 'Cédula', 'Teléfono']);
});

test('plantilla de socios: sus columnas se reconocen todas y sus 2 filas se pueden crear', async () => {
  fresh();
  const p = Excel.plantillaSocios('2026-11-02');
  assert.strictEqual(p.length, 3);
  const m = Excel.mapearSocios(await Excel.leerXlsx(Excel.xlsx([{ nombre: 'Socios', filas: p }]), inflar));
  assert.strictEqual(m.reconocidas.length, 8);
  assert.deepStrictEqual(m.ignoradas, []);
  assert.strictEqual(m.filas[0].vence, '2026-11-22');
  assert.strictEqual(m.filas[0].nacimiento, '1992-05-14');
  const r = Store.revisarImportacion(m.filas);
  assert.deepStrictEqual(r.map((x) => x.accion), ['crear', 'crear']);
  assert.deepStrictEqual(r.map((x) => x.avisos), [[], []]);
});

test('integración con Store: revisarImportacion e importarSocios con lo que lee mapearSocios', async () => {
  fresh();
  const existente = Store.list('socios')[0];
  const filas = [
    ['Nombre completo', 'Documento', 'Celular', 'Membresía', 'Fecha de vencimiento', 'E-mail', 'Cumpleaños', 'Etiquetas', 'Observaciones'],
    ['Carla Ruiz', '8-900-1', 60001111, 'Quincenal', Excel.fecha('2026-11-14'), 'carla@correo.com', '14/05/1990', 'VIP; Mañana', 'paga puntual'],
    [existente.nombre, existente.cedula, existente.telefono, 'Mensual', '2026-12-01', '', '', '', ''],
    ['Sin Teléfono', '8-900-2', '', '', '', '', '', '', ''],
    ['Plan Raro', '8-900-3', '6000-3333', 'Anual', '31/02/2026', 'malo@', '', '', ''],
  ];
  // Pasa por un .xlsx de verdad (la fecha vuelve como número de serie) y por CSV.
  for (const matriz of [await Excel.leerXlsx(Excel.xlsx([{ nombre: 'Socios', filas }]), inflar), Excel.leerCsv(Excel.aCsv(filas))]) {
    const m = Excel.mapearSocios(matriz);
    const r = Store.revisarImportacion(m.filas);
    assert.deepStrictEqual(r.map((x) => x.accion), ['crear', 'actualizar', 'omitir', 'crear']);
    assert.strictEqual(r[0].datos.vence, '2026-11-14');
    assert.strictEqual(r[0].datos.nacimiento, '1990-05-14');
    assert.deepStrictEqual(r[0].datos.etiquetas, ['VIP', 'Mañana']);
    assert.strictEqual(r[1].socioId, existente.id);
    assert.match(r[2].motivo, /teléfono/);
    assert.strictEqual(r[3].avisos.length, 3, 'plan, vencimiento y correo');
    assert.deepStrictEqual(m.numeros, [2, 3, 4, 5]);
  }
  const m = Excel.mapearSocios(Excel.leerCsv(Excel.aCsv(filas)));
  const res = Store.importarSocios(m.filas);
  assert.deepStrictEqual([res.creados, res.actualizados, res.omitidos], [2, 1, 1]);
  const carla = Store.list('socios').find((s) => s.cedula === '8-900-1');
  assert.strictEqual(carla.vence, '2026-11-14');
  assert.strictEqual(carla.planId, Store.planes().find((p) => p.nombre === 'Quincenal').id);
  assert.strictEqual(carla.telefono, '60001111');
});

(async () => {
  let fallos = 0;
  for (const [nombre, fn] of tests) {
    try { await fn(); console.log('ok   ' + nombre); } catch (e) { fallos++; console.log('FAIL ' + nombre + '\n     ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} pasan`);
  process.exit(fallos ? 1 : 0);
})();
