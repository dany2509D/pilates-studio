(function (root) {
  // Alfabeto de los códigos: sin I, L, O ni U (base 32 de Crockford). Al teclearlo no se confunden con 1 y 0.
  const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const normCedula = (c) => String(c == null ? '' : c).trim().toLowerCase();

  // 2 caracteres sacados de la cédula. Atan el pase diario a la persona: si el número de socio coincide pero
  // la cédula no (pase hecho en otro equipo con otros datos), no se le asigna la entrada a otra persona.
  function controlCedula(cedula) {
    const s = normCedula(cedula);
    let h = 0x811c9dc5; // FNV-1a de 32 bits
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    const v = h % 1024;
    return ALFABETO[v >> 5] + ALFABETO[v & 31];
  }

  // ---- SHA-256 en JavaScript puro (también sin https, donde el navegador no presta crypto.subtle) ----
  // Las constantes salen de las raíces de los primeros números primos, como dice la norma (FIPS 180-4);
  // la prueba compara el resultado con el crypto de Node.
  const PRIMOS = [];
  for (let n = 2; PRIMOS.length < 64; n++) if (PRIMOS.every((p) => n % p)) PRIMOS.push(n);
  const fraccion = (x) => Math.floor((x - Math.floor(x)) * 4294967296) | 0;
  const K = PRIMOS.map((p) => fraccion(Math.cbrt(p)));
  const H0 = PRIMOS.slice(0, 8).map((p) => fraccion(Math.sqrt(p)));
  const rotar = (x, n) => (x >>> n) | (x << (32 - n));

  function utf8(texto) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(texto);
    const s = unescape(encodeURIComponent(texto));
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function sha256Palabras(texto) {
    const bytes = utf8(String(texto));
    const largo = bytes.length;
    const bloque = new Uint8Array(((largo + 9 + 63) >> 6) << 6);
    bloque.set(bytes);
    bloque[largo] = 0x80;
    const dv = new DataView(bloque.buffer);
    dv.setUint32(bloque.length - 8, Math.floor((largo * 8) / 4294967296));
    dv.setUint32(bloque.length - 4, (largo * 8) >>> 0);
    const H = H0.slice();
    const w = new Int32Array(64);
    for (let off = 0; off < bloque.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15], y = w[i - 2];
        const s0 = rotar(x, 7) ^ rotar(x, 18) ^ (x >>> 3);
        const s1 = rotar(y, 17) ^ rotar(y, 19) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotar(e, 6) ^ rotar(e, 11) ^ rotar(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rotar(a, 2) ^ rotar(a, 13) ^ rotar(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H;
  }

  const sha256 = (texto) => sha256Palabras(texto).map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');

  // 4 caracteres (20 bits) de un resumen: el token del QR que cambia y la firma del pase diario.
  function cuatro(texto) {
    const v = sha256Palabras(texto)[0] >>> 12;
    return ALFABETO[(v >> 15) & 31] + ALFABETO[(v >> 10) & 31] + ALFABETO[(v >> 5) & 31] + ALFABETO[v & 31];
  }

  // Corrige lo que se suele teclear mal en la parte de un código que va después del prefijo:
  // O por 0, I o L por 1 (un código válido no trae esas letras).
  const corregir = (s) => s.replace(/O/g, '0').replace(/[IL]/g, '1');

  // En la demo, la clave de las firmas va en el código. En la versión final, el QR y el pase los firma el servidor.
  const CLAVE_PASES = 'sag-demo-pases-2026';
  const PASO_QR_S = 15;

  const Util = {
    ALFABETO,
    PASO_QR_S,
    sha256,

    // Hora actual en milisegundos. Las pruebas la reemplazan para fijar el reloj del QR.
    ahoraMs() { return Date.now(); },

    // Contraseñas: nunca se guarda la contraseña, solo su resumen con sal (SHA-256 repetido).
    // En la demo se calcula en el navegador; en la versión final, en el servidor.
    hashClave(clave, sal) {
      let h = sha256(sal + '|' + clave);
      for (let i = 1; i < 1000; i++) h = sha256(h + sal);
      return h;
    },

    salNueva() {
      const c = root.crypto;
      if (c && typeof c.getRandomValues === 'function') {
        return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      }
      let s = '';
      for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
      return s;
    },

    // Número del comprobante interno de un pago (no es factura fiscal).
    numeroComprobante(pago) {
      return 'C-' + String(pago && pago.id != null ? pago.id : 0).padStart(6, '0');
    },

    escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    // Fechas ISO (YYYY-MM-DD) sin zonas horarias.
    sumarDias(iso, dias) {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
    },

    diasEntre(desde, hasta) {
      const a = desde.split('-').map(Number);
      const b = hasta.split('-').map(Number);
      return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
    },

    dinero(n) {
      return '$' + Number(n || 0).toFixed(2);
    },

    etiquetaEstado(estado) {
      return { activo: 'Activo', 'por-vencer': 'Por vencer', vencido: 'Vencido', pendiente: 'Pendiente' }[estado] || estado;
    },

    // Texto sin tildes y en minúsculas, para búsquedas.
    plano(s) {
      return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    },

    // Enlace de WhatsApp con el mensaje ya escrito. Números locales de Panamá (7 u 8 dígitos) llevan el 507.
    enlaceWhatsApp(telefono, mensaje) {
      let n = String(telefono || '').replace(/\D/g, '');
      if (!n) return null;
      if (n.length <= 8) n = '507' + n;
      return 'https://wa.me/' + n + '?text=' + encodeURIComponent(mensaje);
    },

    // "Hola {nombre}" con { nombre: 'Ana' }; las variables desconocidas quedan vacías.
    plantilla(texto, vars) {
      return String(texto || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : vars[k]));
    },

    // true si es una fecha real en formato YYYY-MM-DD (rechaza 2026-02-31).
    fechaValida(iso) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
      const [y, m, d] = iso.split('-').map(Number);
      const f = new Date(Date.UTC(y, m - 1, d));
      return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
    },

    // Validación simple: algo@dominio.ext, sin espacios.
    correoValido(c) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c || '').trim());
    },

    fechaCorta(iso) {
      if (!iso) return '—';
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    },

    controlCedula,

    // ---- QR personal que cambia cada 15 segundos ----
    // Código (va en el QR y es lo que "escribe" un lector USB): 'SAG' + número de socio con 6 dígitos +
    // 4 caracteres que cambian con la hora, p. ej. 'SAG000005K7QM'. Una captura de pantalla deja de servir
    // en un par de minutos. Solo letras y números: un lector USB teclea como un teclado y los símbolos
    // (':', '-') cambian según el idioma del teclado.
    // El secreto de cada socio, en la demo, sale de su número y su cédula (así los socios de ejemplo tienen el
    // mismo QR en cualquier equipo). En la versión final es una clave al azar que guarda el servidor.
    secretoSocio(socio) {
      return sha256('sag-demo-qr|' + socio.id + '|' + normCedula(socio.cedula));
    },

    pasoQR(ms) {
      return Math.floor((ms == null ? Util.ahoraMs() : ms) / 1000 / PASO_QR_S);
    },

    tokenQR(secreto, paso) {
      return cuatro(secreto + '|' + paso);
    },

    codigoSocio(socio, ms) {
      return 'SAG' + String(socio.id).padStart(6, '0') + Util.tokenQR(Util.secretoSocio(socio), Util.pasoQR(ms));
    },

    // Segundos que le quedan al código actual (para la cuenta regresiva de "Mi plan").
    segundosQR(ms) {
      const t = (ms == null ? Util.ahoraMs() : ms) / 1000;
      return Math.max(1, Math.ceil(PASO_QR_S - (t % PASO_QR_S)));
    },

    // ---- Pase diario de un solo uso (plan diario) ----
    // 'SAGP' + fecha (AAMMDD) + número de socio (6) + control de la cédula (2) + firma (4) = 22 caracteres.
    codigoPase({ socioId, cedula, fecha }) {
      const cuerpo = 'SAGP' + fecha.slice(2).replace(/-/g, '') + String(socioId).padStart(6, '0') + controlCedula(cedula);
      return cuerpo + cuatro(CLAVE_PASES + '|' + cuerpo);
    },

    // Lee un código completo, de socio o de pase. Acepta minúsculas, espacios y guiones, y corrige
    // O por 0, I o L por 1. Devuelve null si no es ninguno de los dos.
    //   { tipo: 'socio', id, token, codigo }
    //   { tipo: 'pase', socioId, fecha, control, firmaValida, codigo }
    leerCodigo(texto) {
      const t = String(texto == null ? '' : texto).replace(/[\s-]/g, '').toUpperCase();
      if (t.startsWith('SAGP')) {
        const c = 'SAGP' + corregir(t.slice(4));
        const m = /^SAGP(\d{2})(\d{2})(\d{2})(\d{6})([0-9A-Z]{2})([0-9A-Z]{4})$/.exec(c);
        if (!m) return null;
        const fecha = `20${m[1]}-${m[2]}-${m[3]}`;
        if (!Util.fechaValida(fecha)) return null;
        const cuerpo = c.slice(0, -4);
        return { tipo: 'pase', socioId: Number(m[4]), fecha, control: m[5], firmaValida: cuatro(CLAVE_PASES + '|' + cuerpo) === m[6], codigo: c };
      }
      if (t.startsWith('SAG')) {
        const c = 'SAG' + corregir(t.slice(3));
        const m = /^SAG(\d{6})([0-9A-Z]{4})$/.exec(c);
        return m ? { tipo: 'socio', id: Number(m[1]), token: m[2], codigo: c } : null;
      }
      return null;
    },

    // Solo códigos de socio (compatibilidad): { id, codigo } o null.
    leerCodigoSocio(texto) {
      const c = Util.leerCodigo(texto);
      return c && c.tipo === 'socio' ? { id: c.id, codigo: c.codigo } : null;
    },

    // El código con que TERMINA un texto: un lector USB lo teclea detrás de lo que ya hubiera en el campo
    // ('mariaSAG000002K7QM'). Como los 4 últimos caracteres pueden traer 'SAG' por casualidad, se prueba
    // desde el último 'SAG' hacia atrás hasta encontrar un código completo.
    codigoAlFinal(texto) {
      const t = String(texto == null ? '' : texto).replace(/[\s-]/g, '').toUpperCase();
      for (let i = t.lastIndexOf('SAG'); i >= 0; i = i ? t.lastIndexOf('SAG', i - 1) : -1) {
        const c = Util.leerCodigo(t.slice(i));
        if (c) return c;
      }
      return null;
    },
  };

  root.Util = Util;
  if (typeof module !== 'undefined') module.exports = Util;
})(typeof window !== 'undefined' ? window : globalThis);
