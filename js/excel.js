// Lectura y escritura de Excel (.xlsx) y CSV, sin librerías. Corre en el navegador y en Node (pruebas).
//   Excel.aCsv(filas)                 → texto CSV (la primera fila son los encabezados)
//   Excel.leerCsv(texto)              → [[...], ...]
//   Excel.xlsx([{ nombre, filas }])   → Uint8Array con un libro .xlsx (una hoja por tabla)
//   Excel.leerXlsx(bytes, inflar)     → Promise<[[...], ...]> con la primera hoja
//   Excel.leerArchivo(file)           → Promise<[[...], ...]> según la extensión (.xlsx o .csv)
//   Excel.mapearSocios(matriz)        → { filas, numeros, reconocidas, ignoradas, faltan, avisos, avisosFilas }
//                                        para Store.revisarImportacion
//   Excel.fecha('2026-11-02'), Excel.monto(30) → celdas con formato. En .xlsx, fecha dd/mm/aaaa y monto con 2 decimales;
//                                        en CSV, fecha AAAA-MM-DD (Excel y Google Sheets la leen bien en cualquier país)
//   Excel.descargar(nombre, contenido, tipo)
(function (root) {
  const TIPOS = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv;charset=utf-8',
    json: 'application/json;charset=utf-8',
    png: 'image/png',
  };
  const MAX_FILAS = 20000;
  const MAX_BYTES = 15 * 1024 * 1024;
  const MSG_SIN_INFLAR = 'Este navegador no puede abrir archivos .xlsx: guárdalo como CSV desde Excel';
  const MSG_NO_XLSX = 'El archivo no es un Excel válido (.xlsx). Ábrelo en Excel y guárdalo de nuevo como "Libro de Excel" o como CSV.';

  const falla = (mensaje) => new Error(mensaje);

  // ---- Texto ↔ bytes (UTF-8) ----
  function utf8(texto) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(texto);
    const s = unescape(encodeURIComponent(texto));
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function deUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  // Un CSV guardado con Excel en Windows suele venir en "ANSI" (Windows-1252), no en UTF-8: si los bytes
  // no son UTF-8 válido, se leen como Windows-1252 para no perder las tildes ni la ñ.
  function textoDeBytes(bytes) {
    if (typeof TextDecoder === 'undefined') return deUtf8(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* no es UTF-8 */ }
    try { return new TextDecoder('windows-1252').decode(bytes); } catch (e) { return deUtf8(bytes); }
  }

  // ---- Fechas (sistema 1900 de Excel) ----
  const pad = (n) => String(n).padStart(2, '0');
  const BASE_SERIE = Date.UTC(1899, 11, 30);

  function fechaReal(y, m, d) {
    const f = new Date(Date.UTC(y, m - 1, d));
    return y >= 1000 && f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
  }

  // Número de serie de Excel → 'AAAA-MM-DD' (o null). Excel cuenta un 29/02/1900 que no existió:
  // por eso las fechas antes del 1/03/1900 van corridas un día.
  function fechaDeSerie(n) {
    const x = Math.floor(Number(n));
    if (!Number.isFinite(x) || x < 1 || x === 60 || x > 2958465) return null;
    const dias = x < 60 ? x + 1 : x;
    return new Date(BASE_SERIE + dias * 86400000).toISOString().slice(0, 10);
  }

  function serieDeFecha(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m || !fechaReal(+m[1], +m[2], +m[3])) return null;
    const dias = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - BASE_SERIE) / 86400000);
    return dias < 61 ? dias - 1 : dias;
  }

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // 'AAAA-MM-DD' → '1 de diciembre de 2026' (corta: '1 dic 2026'). Con el mes en letras no se confunden el día y el mes.
  function fechaEnPalabras(iso, corta) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m || !fechaReal(+m[1], +m[2], +m[3])) return String(iso || '');
    const mes = MESES[+m[2] - 1];
    return corta ? `${+m[3]} ${mes.slice(0, 3)} ${m[1]}` : `${+m[3]} de ${mes} de ${m[1]}`;
  }

  // Celdas con formato. En CSV la fecha va como AAAA-MM-DD: escrita dd/mm/aaaa, un Excel configurado con mes/día
  // (como Windows en Panamá) lee el 08/11/2026 como 11 de agosto. El monto va como número.
  const fecha = (iso) => ({ fecha: iso || '' });
  const monto = (n) => ({ monto: Number(n) || 0 });
  const esFecha = (v) => !!v && typeof v === 'object' && 'fecha' in v;
  const esMonto = (v) => !!v && typeof v === 'object' && 'monto' in v;

  // ---- CSV ----
  // Una celda de texto que empieza con = + - @ (o tab/retorno) la tomaría Excel como fórmula: va con un apóstrofo delante.
  const PELIGRO = /^[=+\-@\t\r]/;

  function celdaCsv(v) {
    let s;
    if (v == null) s = '';
    else if (esFecha(v)) s = v.fecha || '';
    else if (esMonto(v)) s = String(v.monto);
    else if (typeof v === 'number') s = Number.isFinite(v) ? String(v) : '';
    else if (typeof v === 'boolean') s = v ? 'Sí' : 'No';
    else {
      s = String(v);
      if (PELIGRO.test(s)) s = "'" + s;
    }
    return /[",;\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function aCsv(filas) {
    return (filas || []).map((f) => (f || []).map(celdaCsv).join(',')).join('\r\n') + '\r\n';
  }

  // Separador de la primera línea (fuera de comillas): coma, punto y coma (Excel en otros idiomas) o tabulador.
  function separador(t) {
    const cuenta = { ',': 0, ';': 0, '\t': 0 };
    let comillas = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === '"') comillas = !comillas;
      else if (!comillas && (ch === '\n' || ch === '\r')) break;
      else if (!comillas && ch in cuenta) cuenta[ch]++;
    }
    return Object.keys(cuenta).reduce((a, b) => (cuenta[b] > cuenta[a] ? b : a), ',');
  }

  function leerCsv(texto) {
    let t = String(texto == null ? '' : texto);
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    const sep = separador(t);
    const filas = [];
    let fila = [];
    let celda = '';
    let comillas = false;
    let empezada = false; // la fila actual ya tiene algo (aunque sea una celda vacía entre comillas)
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (comillas) {
        if (ch !== '"') celda += ch;
        else if (t[i + 1] === '"') { celda += '"'; i++; } else comillas = false;
        continue;
      }
      if (ch === '"' && celda === '') { comillas = true; empezada = true; continue; }
      if (ch === sep) { fila.push(celda); celda = ''; empezada = true; continue; }
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        fila.push(celda);
        filas.push(fila);
        fila = []; celda = ''; empezada = false;
        continue;
      }
      celda += ch;
      empezada = true;
    }
    if (empezada || celda !== '') { fila.push(celda); filas.push(fila); }
    return filas;
  }

  // ---- ZIP ----
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function unir(partes) {
    const total = partes.reduce((t, p) => t + p.length, 0);
    const r = new Uint8Array(total);
    let o = 0;
    partes.forEach((p) => { r.set(p, o); o += p.length; });
    return r;
  }

  // ZIP sin compresión (método 0): Excel, Google Sheets y LibreOffice lo abren igual.
  function zip(archivos) {
    const d = new Date();
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const locales = [];
    const central = [];
    let offset = 0;
    archivos.forEach((a) => {
      const nombre = utf8(a.nombre);
      const datos = a.datos;
      const crc = crc32(datos);
      const loc = new Uint8Array(30 + nombre.length);
      const l = new DataView(loc.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(10, hora, true);
      l.setUint16(12, dia, true);
      l.setUint32(14, crc, true);
      l.setUint32(18, datos.length, true);
      l.setUint32(22, datos.length, true);
      l.setUint16(26, nombre.length, true);
      loc.set(nombre, 30);
      const cen = new Uint8Array(46 + nombre.length);
      const c = new DataView(cen.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(12, hora, true);
      c.setUint16(14, dia, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, datos.length, true);
      c.setUint32(24, datos.length, true);
      c.setUint16(28, nombre.length, true);
      c.setUint32(42, offset, true);
      cen.set(nombre, 46);
      locales.push(loc, datos);
      central.push(cen);
      offset += loc.length + datos.length;
    });
    const tamCentral = central.reduce((t, x) => t + x.length, 0);
    const fin = new Uint8Array(22);
    const f = new DataView(fin.buffer);
    f.setUint32(0, 0x06054b50, true);
    f.setUint16(8, archivos.length, true);
    f.setUint16(10, archivos.length, true);
    f.setUint32(12, tamCentral, true);
    f.setUint32(16, offset, true);
    return unir(locales.concat(central, [fin]));
  }

  // Lee el directorio central: { 'xl/workbook.xml': { metodo, datos } }. Los nombres van en minúsculas.
  function leerZip(bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let fin = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw falla(MSG_NO_XLSX);
    const total = dv.getUint16(fin + 10, true);
    let p = dv.getUint32(fin + 16, true);
    const entradas = {};
    for (let k = 0; k < total; k++) {
      if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw falla(MSG_NO_XLSX);
      const metodo = dv.getUint16(p + 10, true);
      const comprimido = dv.getUint32(p + 20, true);
      const ln = dv.getUint16(p + 28, true);
      const le = dv.getUint16(p + 30, true);
      const lc = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const nombre = deUtf8(bytes.subarray(p + 46, p + 46 + ln)).replace(/\\/g, '/').replace(/^\//, '').toLowerCase();
      if (local + 30 > bytes.length || dv.getUint32(local, true) !== 0x04034b50) throw falla(MSG_NO_XLSX);
      const inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      if (inicio + comprimido > bytes.length) throw falla(MSG_NO_XLSX);
      entradas[nombre] = { metodo, datos: bytes.subarray(inicio, inicio + comprimido) };
      p += 46 + ln + le + lc;
    }
    return entradas;
  }

  async function contenido(entradas, nombre, inflar) {
    const e = entradas[String(nombre || '').toLowerCase()];
    if (!e) return null;
    if (e.metodo === 0) return deUtf8(e.datos);
    if (e.metodo !== 8) throw falla(MSG_NO_XLSX);
    if (typeof inflar !== 'function') throw falla(MSG_SIN_INFLAR);
    return deUtf8(new Uint8Array(await inflar(e.datos)));
  }

  // ---- XML ----
  function escXml(s) {
    return String(s)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function desescapar(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (k[0] === '#') {
        const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
        try { return String.fromCodePoint(n); } catch (err) { return ''; }
      }
      return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[k];
    });
  }

  function atributos(txt) {
    const r = {};
    String(txt || '').replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (m, k, a, b) => { r[k] = desescapar(a != null ? a : b); return m; });
    return r;
  }

  // El id de relación viene con prefijo (r:id, a veces otro): se busca cualquier "prefijo:id".
  const idRelacion = (at) => { const k = Object.keys(at).find((x) => /:id$/i.test(x)); return k ? at[k] : ''; };

  // Texto de los <t> de una celda o de una cadena compartida, sin la guía fonética (<rPh>).
  // Excel escribe algunos caracteres como _xHHHH_ (p. ej. _x000D_ por un retorno).
  function textoT(xml) {
    let s = '';
    String(xml || '').replace(/<(\w+:)?rPh\b[\s\S]*?<\/(\w+:)?rPh>/g, '')
      .replace(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g, (m, t) => { s += t ? desescapar(t) : ''; return m; });
    return s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  }

  // ---- Escribir .xlsx ----
  function letra(i) {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  function indiceColumna(letras) {
    let n = 0;
    for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  // Excel no acepta nombres de hoja de más de 31 caracteres ni con []:*?/\ y no los repite.
  function nombreHoja(nombre, i, usados) {
    let s = String(nombre == null ? '' : nombre).replace(/[\x00-\x1F[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ')
      .trim().replace(/^'+|'+$/g, '').slice(0, 31).trim();
    if (!s) s = 'Hoja ' + (i + 1);
    const base = s;
    for (let k = 2; usados.has(s.toLowerCase()); k++) {
      const suf = ' (' + k + ')';
      s = base.slice(0, 31 - suf.length).trim() + suf;
    }
    usados.add(s.toLowerCase());
    return s;
  }

  function largoVisible(v) {
    if (v == null) return 0;
    if (esFecha(v)) return 10;
    if (esMonto(v)) return String(v.monto.toFixed(2)).length;
    return String(v).split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  }

  // Estilos: 0 normal · 1 encabezado en negrita · 2 fecha dd/mm/aaaa · 3 monto con 2 decimales.
  function celdaXml(v, ref, encabezado) {
    if (v == null || v === '') return '';
    const s = encabezado ? ' s="1"' : '';
    if (esFecha(v)) {
      const n = serieDeFecha(v.fecha);
      return n == null ? '' : `<c r="${ref}" s="2"><v>${n}</v></c>`;
    }
    if (esMonto(v)) return Number.isFinite(v.monto) ? `<c r="${ref}" s="3"><v>${v.monto}</v></c>` : '';
    if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : '';
    if (typeof v === 'boolean') return `<c r="${ref}" t="b"${s}><v>${v ? 1 : 0}</v></c>`;
    const t = String(v);
    const espacio = /^\s|\s$|\n/.test(t) ? ' xml:space="preserve"' : '';
    return `<c r="${ref}" t="inlineStr"${s}><is><t${espacio}>${escXml(t)}</t></is></c>`;
  }

  function hojaXml(filas) {
    const anchos = [];
    const cuerpo = filas.map((fila, r) => {
      const celdas = (fila || []).map((v, c) => {
        anchos[c] = Math.max(anchos[c] || 0, largoVisible(v));
        return celdaXml(v, letra(c) + (r + 1), r === 0);
      }).join('');
      return `<row r="${r + 1}">${celdas}</row>`;
    }).join('');
    const cols = anchos.length
      ? '<cols>' + anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(10, a + 3))}" customWidth="1"/>`).join('') + '</cols>'
      : '';
    // El encabezado queda fijo al bajar por la hoja.
    const vista = filas.length > 1
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : '';
    return XML_DECL + `<worksheet xmlns="${NS_MAIN}">${vista}${cols}<sheetData>${cuerpo}</sheetData></worksheet>`;
  }

  const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

  const ESTILOS = XML_DECL + `<styleSheet xmlns="${NS_MAIN}">`
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
    + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';

  function xlsx(hojas) {
    const lista = (hojas && hojas.length ? hojas : [{ nombre: 'Hoja 1', filas: [] }]);
    const usados = new Set();
    const nombres = lista.map((h, i) => nombreHoja(h.nombre, i, usados));
    const n = lista.length;
    const tipos = XML_DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + lista.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>';
    const rels = XML_DECL + `<Relationships xmlns="${NS_PKG}">`
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>';
    const libro = XML_DECL + `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>`
      + nombres.map((nom, i) => `<sheet name="${escXml(nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      + '</sheets></workbook>';
    const relsLibro = XML_DECL + `<Relationships xmlns="${NS_PKG}">`
      + lista.map((h, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${n + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>`
      + '</Relationships>';
    const archivos = [
      { nombre: '[Content_Types].xml', datos: utf8(tipos) },
      { nombre: '_rels/.rels', datos: utf8(rels) },
      { nombre: 'xl/workbook.xml', datos: utf8(libro) },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: utf8(relsLibro) },
      { nombre: 'xl/styles.xml', datos: utf8(ESTILOS) },
    ].concat(lista.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: utf8(hojaXml(h.filas || [])) })));
    return zip(archivos);
  }

  // ---- Leer .xlsx ----
  // Ruta de una relación: relativa a la carpeta del archivo que la declara, o absoluta desde la raíz.
  function resolver(base, destino) {
    const partes = (destino[0] === '/' ? destino.slice(1) : base + destino).split('/');
    const r = [];
    partes.forEach((p) => { if (p === '..') r.pop(); else if (p && p !== '.') r.push(p); });
    return r.join('/');
  }

  function relaciones(xml) {
    const r = [];
    String(xml || '').replace(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g, (m, at) => { r.push(atributos(at)); return m; });
    return r;
  }

  function valorCelda(tipo, cuerpo, cadenas) {
    const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(cuerpo);
    const crudo = v ? desescapar(v[1]) : '';
    if (tipo === 's') { const s = cadenas[Number(crudo)]; return s == null ? '' : s; }
    if (tipo === 'inlineStr') { const m = /<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(cuerpo); return m ? textoT(m[1]) : ''; }
    if (tipo === 'str' || tipo === 'd') return crudo;
    if (tipo === 'b') return crudo === '1' || crudo.toLowerCase() === 'true';
    if (tipo === 'e') return '';
    if (crudo.trim() === '') return '';
    const n = Number(crudo);
    return Number.isFinite(n) ? n : crudo;
  }

  // Matriz de la hoja: matriz[i] es la fila i + 1 de Excel; los huecos quedan como '' (o filas vacías).
  function leerHoja(xml, cadenas) {
    const matriz = [];
    const reFila = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
    let auto = 0;
    let m;
    while ((m = reFila.exec(xml))) {
      const at = atributos(m[1]);
      const r = Number(at.r) > 0 ? Number(at.r) - 1 : auto;
      auto = r + 1;
      const fila = [];
      const reCelda = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
      let col = 0;
      let c;
      while ((c = reCelda.exec(m[2] || ''))) {
        const ac = atributos(c[1]);
        const ref = /^([A-Za-z]{1,3})\d*$/.exec(ac.r || '');
        const k = ref ? indiceColumna(ref[1].toUpperCase()) : col;
        col = k + 1;
        const valor = valorCelda(ac.t, c[2] || '', cadenas);
        if (valor === '') continue;
        while (fila.length < k) fila.push('');
        fila[k] = valor;
      }
      // Las filas sin datos no se agregan: una hoja con formato hasta la fila 1.048.576 no llena la memoria.
      if (!fila.length) continue;
      if (r >= MAX_FILAS) throw falla(`El archivo tiene más de ${MAX_FILAS} filas. Divídelo en partes más pequeñas.`);
      while (matriz.length < r) matriz.push([]);
      matriz[r] = fila;
    }
    return matriz;
  }

  // `inflar(Uint8Array) → Promise<Uint8Array>` descomprime las partes con método 8 (deflate).
  async function leerXlsx(bytes, inflar) {
    const entradas = leerZip(bytes);
    const leer = (nombre) => contenido(entradas, nombre, inflar);
    // Libro principal: lo indica _rels/.rels (casi siempre xl/workbook.xml).
    const raiz = relaciones(await leer('_rels/.rels'));
    const principal = raiz.find((x) => /\/officeDocument$/.test(x.Type || ''));
    const rutaLibro = principal ? resolver('', principal.Target || '') : 'xl/workbook.xml';
    const carpeta = rutaLibro.slice(0, rutaLibro.lastIndexOf('/') + 1);
    const libro = await leer(rutaLibro);
    const rels = relaciones(await leer(carpeta + '_rels/' + rutaLibro.slice(carpeta.length) + '.rels'));
    let rutaHoja = null;
    if (libro) {
      const hoja = /<(?:\w+:)?sheet\b([^>]*?)\/?>/.exec(libro);
      const rel = hoja && rels.find((x) => x.Id === idRelacion(atributos(hoja[1])));
      if (rel) rutaHoja = resolver(carpeta, rel.Target || '');
    }
    if (!rutaHoja || !entradas[rutaHoja.toLowerCase()]) {
      rutaHoja = Object.keys(entradas).filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0];
    }
    if (!rutaHoja) throw falla(MSG_NO_XLSX);
    const relCadenas = rels.find((x) => /\/sharedStrings$/.test(x.Type || ''));
    const xmlCadenas = await leer(relCadenas ? resolver(carpeta, relCadenas.Target || '') : carpeta + 'sharedStrings.xml');
    const cadenas = [];
    String(xmlCadenas || '').replace(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g, (m, cuerpo) => { cadenas.push(cuerpo ? textoT(cuerpo) : ''); return m; });
    return leerHoja(await leer(rutaHoja) || '', cadenas);
  }

  // En el navegador: DecompressionStream('deflate-raw'). Sin él (navegadores viejos) se pide un CSV.
  async function inflarNavegador(datos) {
    let flujo;
    try { flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw')); } catch (e) { throw falla(MSG_SIN_INFLAR); }
    try { return new Uint8Array(await new Response(flujo).arrayBuffer()); } catch (e) { throw falla(MSG_NO_XLSX); }
  }

  function bytesDe(archivo) {
    if (typeof archivo.arrayBuffer === 'function') return archivo.arrayBuffer().then((b) => new Uint8Array(b));
    return new Promise((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(new Uint8Array(lector.result));
      lector.onerror = () => mal(falla('No se pudo leer el archivo.'));
      lector.readAsArrayBuffer(archivo);
    });
  }

  async function leerArchivo(archivo) {
    if (!archivo) throw falla('Elige un archivo.');
    const ext = ((/\.([a-z0-9]+)$/i.exec(archivo.name || '') || [])[1] || '').toLowerCase();
    if (ext === 'xls') throw falla('Ese archivo es de un Excel antiguo (.xls). Ábrelo en Excel y usa "Guardar como" → "Libro de Excel (.xlsx)" o "CSV".');
    if (ext === 'ods' || ext === 'numbers') throw falla('Guarda el archivo como "Libro de Excel (.xlsx)" o como CSV y vuelve a intentarlo.');
    if (archivo.size > MAX_BYTES) throw falla('El archivo es muy grande (más de 15 MB).');
    const bytes = await bytesDe(archivo);
    const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (ext === 'xlsx' || ext === 'xlsm' || (esZip && ext !== 'csv')) {
      const inflar = typeof DecompressionStream === 'function' ? inflarNavegador : null;
      return leerXlsx(bytes, inflar);
    }
    return leerCsv(textoDeBytes(bytes));
  }

  // ---- Socios: columnas por encabezado ----
  const CAMPOS = [
    { campo: 'nombre', etiqueta: 'Nombre', sinonimos: ['nombre', 'nombre completo', 'nombres', 'nombre y apellido', 'nombre y apellidos', 'nombres y apellidos', 'nombre del socio', 'socio', 'cliente'] },
    { campo: 'apellido', etiqueta: 'Apellido', sinonimos: ['apellido', 'apellidos'] },
    { campo: 'cedula', etiqueta: 'Cédula', sinonimos: ['cedula', 'documento', 'documento de identidad', 'cedula o pasaporte', 'pasaporte', 'no cedula', 'n cedula', 'no de cedula', 'n de cedula', 'numero de cedula', 'cip', 'identificacion'] },
    { campo: 'telefono', etiqueta: 'Teléfono', sinonimos: ['telefono', 'celular', 'movil', 'whatsapp', 'tel', 'cel', 'telefono celular', 'numero de telefono', 'numero de celular', 'telefono movil'] },
    { campo: 'plan', etiqueta: 'Plan', sinonimos: ['plan', 'tipo de plan', 'membresia', 'plan actual'] },
    { campo: 'vence', etiqueta: 'Vence', sinonimos: ['vence', 'vencimiento', 'fecha de vencimiento', 'fecha vencimiento', 'vence el', 'vigente hasta', 'valido hasta'] },
    { campo: 'correo', etiqueta: 'Correo', sinonimos: ['correo', 'email', 'e mail', 'correo electronico', 'mail'] },
    { campo: 'nacimiento', etiqueta: 'Nacimiento', sinonimos: ['nacimiento', 'fecha de nacimiento', 'fecha nacimiento', 'cumpleanos', 'fecha de cumpleanos'] },
    { campo: 'etiquetas', etiqueta: 'Etiquetas', sinonimos: ['etiquetas', 'etiqueta', 'tags', 'grupo', 'grupos'] },
  ];
  const OBLIGATORIOS = ['nombre', 'cedula', 'telefono'];

  // "Teléfono (WhatsApp)" → "telefono"; "E-mail" → "e mail"; "Nº de cédula" → "n de cedula".
  const normalizar = (s) => String(s == null ? '' : s).replace(/\([^)]*\)/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function campoDe(encabezado) {
    const n = normalizar(encabezado);
    const c = n && CAMPOS.find((x) => x.sinonimos.includes(n));
    return c || null;
  }

  // Texto limpio. Quita el apóstrofo que se pone al exportar a CSV para que Excel no lo tome como fórmula.
  function textoValor(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (esFecha(v)) return v.fecha;
    return String(v).replace(/^'(?=[=+\-@\t\r])/, '').trim();
  }

  // Año de 2 cifras: hasta 10 años en el futuro es 20xx; si no, 19xx (fechas de nacimiento).
  function anio(a) {
    if (a.length === 4) return Number(a);
    const n = Number(a);
    return n <= (new Date().getFullYear() % 100) + 10 ? 2000 + n : 1900 + n;
  }

  // Fecha escrita con dos números y el año: 01/12/2026, 1-12-26, 25.10.2026 (con la hora detrás o sin ella).
  const FECHA_NUMEROS = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})(?:\s.*)?$/;

  // Fecha de Excel (número de serie), dd/mm/aaaa, mm/dd/aaaa o aaaa-mm-dd → 'AAAA-MM-DD'. Si no se entiende,
  // devuelve el texto tal cual para que la revisión avise con lo que vino en el archivo.
  // `orden` ('dm' o 'md') dice cómo leer una fecha como 01/12/2026, en la que los dos números pueden ser el mes;
  // sin él va día/mes, como se escribe en Panamá. Si uno de los dos pasa de 12, ese es el día.
  function aFecha(v, orden) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return fechaDeSerie(v) || String(v);
    const s = textoValor(v);
    let y, mes, d;
    let m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
    if (m) { y = +m[1]; mes = +m[2]; d = +m[3]; }
    else if ((m = FECHA_NUMEROS.exec(s))) {
      const a = +m[1];
      const b = +m[2];
      y = anio(m[3]);
      const mesDia = b > 12 && a <= 12 ? true : a > 12 ? false : orden === 'md';
      if (mesDia) { mes = a; d = b; } else { d = a; mes = b; }
    } else if (/^\d{4,6}(\.\d+)?$/.test(s)) {
      return fechaDeSerie(Number(s)) || s;
    } else return s;
    return fechaReal(y, mes, d) ? `${y}-${pad(mes)}-${pad(d)}` : s;
  }

  // Busca la fila de encabezados en las primeras 10 con datos (a veces arriba hay un título).
  function filaEncabezados(matriz) {
    let primera = -1;
    let vistas = 0;
    for (let i = 0; i < matriz.length && vistas < 10; i++) {
      const fila = matriz[i] || [];
      if (!fila.some((v) => textoValor(v) !== '')) continue;
      vistas++;
      if (primera < 0) primera = i;
      const campos = new Set(fila.map(campoDe).filter(Boolean).map((c) => c.campo));
      if (campos.size >= 2) return i;
    }
    return primera;
  }

  // Cómo vienen las fechas de una columna. Las escritas como texto con dos números (a/b/aaaa) dicen el orden:
  // si a pasa de 12 es día/mes (25/10/2026); si b pasa de 12, mes/día (10/25/2026). Una fecha imposible
  // (31/02/2026) no cuenta, y una como 01/12/2026 no lo dice (`dudosa`). Las fechas reales de Excel y las
  // AAAA-MM-DD no tienen esa duda; `seriesDudosas` cuenta las de Excel que se leerían distinto con el día y el
  // mes al revés (las que Excel pudo voltear).
  function revisarFechas(valores) {
    const r = { dm: '', md: '', dudosa: '', seriesDudosas: 0 };
    valores.forEach((v) => {
      if (typeof v === 'number') {
        const iso = fechaDeSerie(v);
        const [, mes, dia] = (iso || '0-0-0').split('-').map(Number);
        if (iso && dia <= 12 && dia !== mes) r.seriesDudosas++;
        return;
      }
      const s = textoValor(v);
      const p = FECHA_NUMEROS.exec(s);
      if (!p) return;
      const a = +p[1];
      const b = +p[2];
      const y = anio(p[3]);
      if (a > 12 && fechaReal(y, b, a)) r.dm = r.dm || s;
      else if (b > 12 && fechaReal(y, a, b)) r.md = r.md || s;
      else if (a <= 12 && b <= 12 && a !== b && fechaReal(y, a, b) && fechaReal(y, b, a)) r.dudosa = r.dudosa || s;
    });
    return r;
  }

  const ORDEN_TXT = { dm: 'día/mes', md: 'mes/día' };

  // Orden de cada columna de fechas: lo deciden sus propias fechas. Si ninguna lo decide, el de la otra columna
  // de fechas del archivo (un mismo Excel las guarda todas igual) y, si tampoco, día/mes, con un aviso.
  function fechasPorColumna(m, h, columnas, reconocidas) {
    const fechas = {};
    ['vence', 'nacimiento'].forEach((k) => {
      if (columnas[k] === undefined) return;
      const x = revisarFechas(m.slice(h + 1).map((f) => (f || [])[columnas[k]]));
      x.rec = reconocidas.find((c) => c.campo === k);
      x.encabezado = x.rec.encabezado || x.rec.etiqueta;
      x.etiqueta = x.rec.etiqueta;
      x.orden = x.dm && x.md ? 'mixto' : x.dm ? 'dm' : x.md ? 'md' : null;
      fechas[k] = x;
    });
    const lista = Object.keys(fechas).map((k) => fechas[k]);
    const decididas = lista.filter((x) => x.orden === 'dm' || x.orden === 'md');
    const avisos = [];
    lista.forEach((x) => {
      if (!x.orden && x.dudosa) {
        const otra = decididas.find((y) => y !== x);
        x.orden = otra ? otra.orden : 'dm';
        const leida = fechaEnPalabras(aFecha(x.dudosa, x.orden));
        avisos.push(otra
          ? { titulo: `Fechas como ${x.dudosa}: las leí como ${ORDEN_TXT[x.orden]}, igual que las de «${otra.encabezado}». Revísalas.`,
            detalle: `En «${x.encabezado}», ${x.dudosa} quedó como ${leida}.` }
          : { titulo: `Fechas como ${x.dudosa}: las leí como día/mes. Revísalas.`,
            detalle: `En «${x.encabezado}», ${x.dudosa} quedó como ${leida}. Si eran mes/día, escríbelas como AAAA-MM-DD (por ejemplo, 2026-12-01) y vuelve a subir el archivo.` });
      }
      if (x.orden === 'mixto') {
        avisos.push({ titulo: `En «${x.encabezado}» hay fechas día/mes (como ${x.dm}) y mes/día (como ${x.md}).`,
          detalle: 'Cada una se leyó según sus números y, si no se podía saber, como día/mes. Revisa las filas marcadas.' });
      }
      // Excel guarda como fecha lo que entiende según la configuración de la computadora y deja como texto lo
      // que no: si en la columna hay de las dos, puede que haya volteado el día y el mes de las que guardó.
      x.volteables = x.seriesDudosas > 0 && !!(x.dm || x.md);
      if (x.volteables) {
        avisos.push({ titulo: `En «${x.encabezado}» hay fechas que Excel no reconoció (como ${x.dm || x.md}): puede que haya volteado el día y el mes de otras.`,
          detalle: 'Revisa las filas marcadas. Para evitarlo, escribe las fechas como AAAA-MM-DD.' });
      }
      if (x.orden) x.rec.orden = x.orden;
    });
    return { fechas, avisos };
  }

  // Avisos de una fila sobre cómo se leyó una fecha (solo cuando hay motivo para dudar).
  function avisosDeFecha(x, v, iso) {
    if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return [];
    const r = [];
    if (x.orden === 'mixto' && typeof v !== 'number') {
      const p = FECHA_NUMEROS.exec(textoValor(v));
      if (p && +p[1] !== +p[2]) r.push(`${x.etiqueta} «${textoValor(v)}» quedó como ${fechaEnPalabras(iso)}: en esa columna hay fechas día/mes y mes/día. Revísala.`);
    }
    if (x.volteables && typeof v === 'number') {
      const [, mes, dia] = iso.split('-').map(Number);
      if (dia <= 12 && dia !== mes) r.push(`${x.etiqueta} quedó como ${fechaEnPalabras(iso)}: revisa que Excel no haya volteado el día y el mes.`);
    }
    return r;
  }

  function mapearSocios(matriz) {
    const m = Array.isArray(matriz) ? matriz : [];
    const h = filaEncabezados(m);
    const r = { filas: [], numeros: [], avisosFilas: [], reconocidas: [], ignoradas: [], faltan: [], avisos: [], filaEncabezado: h + 1 };
    if (h < 0) { r.faltan = OBLIGATORIOS.map((k) => CAMPOS.find((c) => c.campo === k).etiqueta); return r; }
    const encabezados = m[h];
    const ancho = m.slice(h).reduce((a, f) => Math.max(a, (f || []).length), 0);
    const columnas = {};
    for (let i = 0; i < ancho; i++) {
      const titulo = textoValor(encabezados[i]);
      const c = campoDe(titulo);
      if (c && columnas[c.campo] === undefined) {
        columnas[c.campo] = i;
        r.reconocidas.push({ columna: i, encabezado: titulo, campo: c.campo, etiqueta: c.etiqueta });
      } else if (titulo || m.slice(h + 1).some((f) => f && textoValor(f[i]) !== '')) {
        r.ignoradas.push(titulo || 'Columna ' + letra(i));
      }
    }
    if (columnas.nombre === undefined && columnas.apellido !== undefined) columnas.nombre = columnas.apellido;
    r.faltan = OBLIGATORIOS.filter((k) => columnas[k] === undefined).map((k) => CAMPOS.find((c) => c.campo === k).etiqueta);
    const { fechas, avisos } = fechasPorColumna(m, h, columnas, r.reconocidas);
    r.avisos = avisos;
    for (let i = h + 1; i < m.length; i++) {
      const fila = m[i] || [];
      const celda = (k) => (columnas[k] === undefined ? '' : fila[columnas[k]]);
      const datos = {};
      ['cedula', 'telefono', 'plan', 'correo', 'etiquetas'].forEach((k) => { datos[k] = textoValor(celda(k)); });
      const nombre = textoValor(celda('nombre'));
      const apellido = columnas.apellido !== undefined && columnas.apellido !== columnas.nombre ? textoValor(celda('apellido')) : '';
      datos.nombre = [nombre, apellido].filter(Boolean).join(' ');
      let avisosFila = [];
      ['vence', 'nacimiento'].forEach((k) => {
        const x = fechas[k];
        datos[k] = aFecha(celda(k), x && x.orden === 'md' ? 'md' : 'dm');
        avisosFila = avisosFila.concat(avisosDeFecha(x, celda(k), datos[k]));
      });
      // Las filas sin nada en las columnas reconocidas (vacías o con un "Total" suelto) no se cuentan.
      if (!Object.keys(datos).some((k) => datos[k] !== '')) continue;
      r.filas.push(datos);
      r.numeros.push(i + 1);
      r.avisosFilas.push(avisosFila);
    }
    return r;
  }

  // Plantilla para cargar socios: encabezados y 2 filas de ejemplo (la fecha de vencimiento, cerca de `hoy`).
  function plantillaSocios(hoy) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(String(hoy || '')) ? hoy : new Date().toISOString().slice(0, 10);
    const [y, mm, dd] = base.split('-').map(Number);
    const enDias = (n) => new Date(Date.UTC(y, mm - 1, dd + n)).toISOString().slice(0, 10);
    return [
      ['Nombre', 'Cédula', 'Teléfono', 'Plan', 'Vence', 'Correo', 'Nacimiento', 'Etiquetas'],
      ['María Pérez', '8-123-4567', '6000-1234', 'Mensual', fecha(enDias(20)), 'maria@correo.com', fecha('1992-05-14'), 'Mañana, VIP'],
      ['Juan Rodríguez', '8-765-4321', '6111-2233', 'Semanal', fecha(enDias(3)), '', '', ''],
    ];
  }

  function descargar(nombre, contenido, tipo) {
    const ext = ((/\.([a-z0-9]+)$/i.exec(nombre || '') || [])[1] || '').toLowerCase();
    const t = tipo || TIPOS[ext] || 'application/octet-stream';
    let datos = contenido;
    // Con la marca BOM, Excel abre el CSV como UTF-8 y se ven bien las tildes y la ñ.
    if (typeof datos === 'string' && /csv/.test(t) && datos.charCodeAt(0) !== 0xfeff) datos = '﻿' + datos;
    const blob = typeof Blob !== 'undefined' && datos instanceof Blob ? datos : new Blob([datos], { type: t });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return blob;
  }

  const Excel = {
    TIPOS, CAMPOS, MSG_SIN_INFLAR,
    aCsv, leerCsv, xlsx, leerXlsx, leerArchivo, leerZip, crc32,
    fecha, monto, fechaDeSerie, serieDeFecha, aFecha, fechaEnPalabras, mapearSocios, plantillaSocios, descargar,
    nombreHoja: (n, i) => nombreHoja(n, i || 0, new Set()),
    textoDeBytes,
  };
  root.Excel = Excel;
  if (typeof module !== 'undefined') module.exports = Excel;
})(typeof window !== 'undefined' ? window : globalThis);
