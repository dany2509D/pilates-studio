(function (root) {
  const U = root.Util || require('./util.js');

  // Socios de ejemplo: [nombre, cédula, teléfono, planId, días hasta el vencimiento (negativo = vencido)]
  // `vence` es el último día válido: off <= días-1, para que el último pago no quede en el futuro.
  // null = se inscribió por la web y aún no paga.
  const SOCIOS = [
    ['Carlos Mendoza', '8-745-1201', '6612-1001', 4, 29], // pagó hoy
    ['María Fernanda Ortiz', '8-801-2210', '6612-1002', 4, 12],
    ['José Luis Batista', '4-220-909', '6612-1003', 3, 9],
    ['Andrea Castillo', '8-905-3342', '6612-1004', 4, 27],
    ['Rafael Quintero', '8-770-1180', '6612-1005', 2, 6], // pagó hoy
    ['Daniela Samaniego', '9-740-0611', '6612-1006', 4, 28], // pagó ayer
    ['Kevin Araúz', '8-960-4412', '6612-1007', 3, 14],
    ['Lucía Pinzón', '8-812-7734', '6612-1008', 3, 14], // pagó hoy
    ['Miguel Ángel Rivas', '3-715-2290', '6612-1009', 2, 4],
    ['Valeria Jaén', '8-990-1520', '6612-1010', 4, 24],
    ['Omar De León', '8-733-8801', '6612-1011', 3, 11],
    ['Natalia Bernal', '8-850-6025', '6612-1012', 4, 19],
    ['Esteban Cedeño', '2-710-1544', '6612-1013', 4, 8],
    ['Paola Villarreal', '8-921-3319', '6612-1014', 3, 7],
    ['Jorge Tejada', '8-690-4127', '6612-1015', 4, 27],
    ['Isabel Montenegro', '8-875-2078', '6612-1016', 2, 6],
    // por vencer
    ['Ricardo Salazar', '8-780-3391', '6612-1017', 4, 3],
    ['Gabriela Arosemena', '8-940-1156', '6612-1018', 3, 2],
    ['Alexis Moreno', '5-705-0932', '6612-1019', 1, 0],
    ['Sofía Delgado', '8-885-7714', '6612-1020', 4, 1],
    // vencidos
    ['Franklin Pérez', '8-760-2288', '6612-1021', 4, -3],
    ['Karen Guerra', '8-910-5503', '6612-1022', 2, -6],
    ['Luis Carlos Núñez', '6-722-1480', '6612-1023', 3, -12],
    ['Yaritza Barría', '8-930-9961', '6612-1024', 4, -20],
    // inscritos por la web, pendientes de pago
    ['Anthony Vergara', '8-1001-455', '6612-1025', 4, null],
    ['Camila Espinosa', '8-1003-712', '6612-1026', 2, null],
  ];

  // Ficha ampliada de algunos socios (mini-CRM). nac: [meses respecto al mes de hoy, día, edad];
  // notas: [días atrás, tipo, texto]. Todo se calcula relativo a hoy.
  const FICHAS = {
    'Carlos Mendoza': { correo: 'carlos.mendoza@correo.com', nac: [0, 22, 34], objetivo: 'masa', etiquetas: ['VIP'], emergencia: ['Rosa Mendoza', '6612-5501'],
      notas: [[20, 'nota', 'Quiere rutina de fuerza 4 días a la semana. Entrena temprano.'], [3, 'nota', 'Preguntó por el plan trimestral.']] },
    'María Fernanda Ortiz': { correo: 'mafe.ortiz@correo.com', nac: [0, 5, 29], objetivo: 'bajar-peso', etiquetas: ['Promoción'], emergencia: ['Luis Ortiz', '6612-5502'],
      notas: [[12, 'whatsapp', 'Se le envió la promoción de referidos.']] },
    'Andrea Castillo': { correo: 'andrea.castillo@correo.com', nac: [3, 14, 24], objetivo: 'salud', etiquetas: ['Estudiante'],
      notas: [[25, 'nota', 'Estudia en la tarde; prefiere la mañana temprano.']] },
    'Kevin Araúz': { correo: 'kevin.arauz@correo.com', nac: [-2, 9, 27], objetivo: 'rendimiento', etiquetas: ['Estudiante', 'Promoción'],
      notas: [[9, 'llamada', 'Llamada: se preparará para una carrera de 10K.'], [2, 'nota', 'Pidió información de batidos de proteína.']] },
    'Valeria Jaén': { correo: 'valeria.jaen@correo.com', nac: [0, 27, 31], objetivo: 'bajar-peso', etiquetas: ['VIP'], emergencia: ['Marta Jaén', '6612-5503'],
      notas: [[18, 'nota', 'Meta: bajar 6 kg antes de diciembre.']] },
    'Paola Villarreal': { correo: 'paola.villarreal@correo.com', nac: [5, 3, 26], objetivo: 'otro', etiquetas: [],
      notas: [[6, 'nota', 'Viene con su hermana los sábados.']] },
    'Ricardo Salazar': { correo: 'ricardo.salazar@correo.com', nac: [1, 18, 38], objetivo: 'salud', etiquetas: ['VIP'],
      notas: [[4, 'whatsapp', 'Se le recordó la renovación por WhatsApp; dijo que paga con Yappy.'], [15, 'nota', 'Socio muy constante. Ofrecer plan mensual.']] },
    'Sofía Delgado': { correo: 'sofia.delgado@correo.com', nac: [0, 11, 22], objetivo: 'masa', etiquetas: ['Estudiante'],
      notas: [[1, 'llamada', 'Llamada: renueva mañana.']] },
    'Franklin Pérez': { correo: 'franklin.perez@correo.com', nac: [-4, 25, 41], objetivo: 'rendimiento', etiquetas: [],
      notas: [[3, 'whatsapp', 'Recordatorio de renovación enviado; sin respuesta.'], [10, 'nota', 'Dijo que viajaba por trabajo.']] },
    'Yaritza Barría': { correo: 'yaritza.barria@correo.com', nac: [2, 7, 33], objetivo: 'bajar-peso', etiquetas: ['Promoción'],
      notas: [[8, 'llamada', 'No contestó. Intentar de nuevo con oferta de regreso.']] },
    'Camila Espinosa': { correo: 'camila.espinosa@correo.com', nac: [0, 16, 20], objetivo: 'masa', etiquetas: ['Estudiante'],
      notas: [[1, 'nota', 'Se inscribió por la web; falta que pague.']] },
  };

  const PRODUCTOS = [
    ['Agua 500 ml', 1.0],
    ['Gatorade', 2.0],
    ['Bebida energética', 2.5],
    ['Batido de proteína', 4.5],
    ['Barra proteica', 2.0],
    ['Café', 1.0],
    ['Banano', 0.5],
    ['Galletas integrales', 1.5],
  ];

  function azar(semilla) {
    let s = semilla;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  const pad = (n) => String(n).padStart(2, '0');
  const horaDe = (minutos) => `${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`;

  // Lo de hoy no puede tener una hora que todavía no llega: las horas de 5:00 a 20:00 se comprimen
  // proporcionalmente hasta la hora actual (así conservan su orden).
  function deHoy(minutos) {
    const d = new Date();
    const ahora = d.getHours() * 60 + d.getMinutes();
    return Math.min(minutos, Math.floor((minutos * ahora) / 1200));
  }

  // Socios que dejaron de venir hace N días aunque su plan siga vigente (para "Dejaron de venir" y "Para contactar hoy").
  const AUSENTES = { 'Omar De León': 17, 'Natalia Bernal': 22, 'Karen Guerra': 19 };

  // Datos del estudio: los de js/tema.js (en el navegador ya está cargado; en Node se lee del archivo).
  function TemaDatos() {
    const t = root.Tema || (typeof require !== 'undefined' ? require('./tema.js') : null);
    return t.datos();
  }

  function generar(hoy) {
    const rnd = azar(2026);
    const planes = ((TemaDatos().planes) || [
      { id: 1, nombre: 'Diario', dias: 1, precio: 3 },
      { id: 2, nombre: 'Semanal', dias: 7, precio: 12 },
      { id: 3, nombre: 'Quincenal', dias: 15, precio: 20 },
      { id: 4, nombre: 'Mensual', dias: 30, precio: 30 },
    ]).map((p) => ({ id: p.id, nombre: p.nombre, dias: p.dias, precio: p.precio }));
    const porId = (id) => planes.find((p) => p.id === id);

    const socios = [];
    const pagos = [];
    const asistencias = [];

    SOCIOS.forEach((fila, i) => {
      const [nombre, cedula, telefono, planId, off] = fila;
      const id = i + 1;
      const plan = porId(planId);
      const vence = off === null ? null : U.sumarDias(hoy, off);
      const f = FICHAS[nombre] || {};
      let nacimiento = '';
      if (f.nac) {
        const [anio, mes] = hoy.split('-').map(Number);
        const idx = (mes - 1 + f.nac[0] + 120) % 12;
        nacimiento = `${anio - f.nac[2] - (idx > mes - 1 ? 1 : 0)}-${pad(idx + 1)}-${pad(f.nac[1])}`;
      }
      socios.push({
        id, nombre, cedula, telefono, planId, vence,
        origen: off === null ? 'web' : 'panel',
        creadoEn: U.sumarDias(hoy, off === null ? -1 : -30 - (i % 7)),
        correo: f.correo || '', nacimiento, objetivo: f.objetivo || '',
        emergenciaNombre: f.emergencia ? f.emergencia[0] : '', emergenciaTelefono: f.emergencia ? f.emergencia[1] : '',
        etiquetas: (f.etiquetas || []).slice(),
        notas: (f.notas || []).map(([dias, tipo, texto], k) => ({ id: k + 1, fecha: U.sumarDias(hoy, -dias), tipo, texto })),
      });
      if (vence === null) return;

      // Pagos hacia atrás cada `dias` desde el último, hasta 30 días atrás.
      let fecha = U.sumarDias(vence, -plan.dias + 1);
      let primera = fecha;
      while (U.diasEntre(fecha, hoy) <= 30) {
        pagos.push({
          id: pagos.length + 1, socioId: id, planId, monto: plan.precio,
          metodo: rnd() < 0.55 ? 'efectivo' : 'yappy', fecha,
          desde: fecha, hasta: U.sumarDias(fecha, plan.dias - 1),
          por: (pagos.length % 3) ? 'Ana Torres' : 'Dueño',
        });
        primera = fecha;
        fecha = U.sumarDias(fecha, -plan.dias);
      }

      // Asistencias mientras el plan estuvo vigente (la entrada siempre ≤ hoy). Los de AUSENTES dejaron de venir.
      const hasta = vence < hoy ? vence : hoy;
      const desde = U.sumarDias(hoy, -30);
      // (Los ausentes ya eran socios antes de su último pago: vinieron desde hace 30 días hasta que dejaron de venir.)
      const inicio = AUSENTES[nombre] || primera < desde ? desde : primera;
      for (let d = inicio; d <= hasta; d = U.sumarDias(d, 1)) {
        const aHoy = d === hoy;
        if (rnd() < (aHoy ? (i % 3 === 0 ? 1 : 0) : 0.55)) {
          const minutos = (5 + Math.floor(rnd() * 15)) * 60 + Math.floor(rnd() * 60);
          if (AUSENTES[nombre] && U.diasEntre(d, hoy) < AUSENTES[nombre]) continue;
          asistencias.push({ id: asistencias.length + 1, socioId: id, fecha: d, hora: horaDe(d === hoy ? deHoy(minutos) : minutos) });
        }
      }
    });

    // Los 3 pagos por Yappy más recientes se muestran como pagos hechos en línea desde la web.
    pagos.filter((p) => p.metodo === 'yappy').sort((x, y) => y.fecha.localeCompare(x.fecha) || y.id - x.id).slice(0, 3).forEach((p) => {
      p.canal = 'web';
      p.referencia = 'YP-' + p.fecha.replace(/-/g, '').slice(2) + '-' + String(p.id).padStart(4, '0');
      p.yappyTerminado = String(1000 + ((p.id * 37) % 9000));
      p.por = 'Pago en línea';
    });

    const productos = PRODUCTOS.map(([nombre, precio], i) => ({ id: i + 1, nombre, precio }));

    const ventas = [];
    for (let k = 30; k >= 0; k--) {
      const fecha = U.sumarDias(hoy, -k);
      const n = 2 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) {
        const items = [];
        const cuantos = 1 + Math.floor(rnd() * 2);
        for (let q = 0; q < cuantos; q++) {
          const p = productos[Math.floor(rnd() * productos.length)];
          items.push({ productoId: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1 + Math.floor(rnd() * 2) });
        }
        const total = Math.round(items.reduce((t, it) => t + it.precio * it.cantidad, 0) * 100) / 100;
        ventas.push({
          id: ventas.length + 1, items, total,
          metodo: rnd() < 0.6 ? 'efectivo' : 'yappy', fecha,
        });
      }
    }

    const tema = TemaDatos();
    const ajustes = {
      nombre: tema.nombre,
      telefono: '000-0000',
      whatsapp: '',
      yappy: '6000-0000',
      recordatorio: 'Hola {nombre}, te escribimos de ' + tema.nombre + '. Tu plan {plan} {cuando}. ¿Te esperamos para renovar? Puedes pagar en efectivo o por Yappy. ¡Gracias!',
      instagram: tema.instagram,
      direccion: '',
      horarios: tema.horarios || [
        { dias: 'Lunes a viernes', horas: '5:00 a.m. – 10:00 p.m.' },
        { dias: 'Sábados', horas: '7:00 a.m. – 6:00 p.m.' },
        { dias: 'Domingos', horas: '8:00 a.m. – 2:00 p.m.' },
      ],
      ejemplo: { direccion: true, horarios: true, productos: true, yappy: true },
    };

    // Un aviso de pago por Yappy ya pendiente, para que el panel se vea vivo.
    const ana = socios.find((s) => s.nombre === 'Ricardo Salazar');
    const solicitudes = [{ id: 1, socioId: ana.id, planId: ana.planId, monto: planes.find((p) => p.id === ana.planId).precio, estado: 'por-confirmar', fecha: hoy }];

    // Registro de acciones de ejemplo: quién cobró cada pago de los últimos 10 días.
    const acciones = [];
    pagos.filter((p) => U.diasEntre(p.fecha, hoy) <= 10)
      .sort((x, y) => x.fecha.localeCompare(y.fecha) || x.id - y.id)
      .forEach((p) => {
        const s = socios.find((x) => x.id === p.socioId);
        const web = p.canal === 'web';
        acciones.push({
          id: acciones.length + 1, fecha: p.fecha,
          hora: horaDe(((m) => (p.fecha === hoy ? deHoy(m) : m))((6 + ((p.id * 7) % 14)) * 60 + ((p.id * 13) % 60))),
          usuarioId: web ? null : p.por === 'Dueño' ? 1 : 2, usuario: p.por,
          tipo: web ? 'pago-en-linea' : 'cobro',
          detalle: `${s.nombre} · ${porId(p.planId).nombre} · ${U.dinero(p.monto)} (${p.metodo === 'yappy' ? 'Yappy' : 'Efectivo'})`,
        });
      });

    // Una solicitud de corrección de datos (Ley 81) ya pendiente, para que el panel la muestre.
    const isa = socios.find((s) => s.nombre === 'Isabel Montenegro');
    const derechos = [{
      id: 1, socioId: isa.id, nombre: isa.nombre, cedula: isa.cedula, tipo: 'correccion',
      detalle: 'Cambié de número: ahora es 6612-2016.', estado: 'pendiente', fecha: U.sumarDias(hoy, -1),
    }];

    return {
      version: 1, planes, socios, pagos, asistencias, productos, ventas, solicitudes, ajustes,
      usuarios: usuariosDemo(), acciones, pases: [], derechos,
    };
  }

  // Usuarios del panel. Las contraseñas ya van resumidas (Util.hashClave), nunca en texto:
  // dueño → usuario 'dueno', clave 'demo'; recepción → usuario 'recepcion', clave 'recepcion'.
  function usuariosDemo() {
    return [
      { id: 1, usuario: 'dueno', nombre: 'Dueño', rol: 'dueno', activo: true, sal: 'sag-demo-sal-dueno',
        hash: 'f7a456b834745fa90b9ab8d37d57762ffdb27222e1b7c7ef51ba7e22f66ee987', fallos: 0, bloqueadoHasta: 0 },
      { id: 2, usuario: 'recepcion', nombre: 'Ana Torres', rol: 'recepcion', activo: true, sal: 'sag-demo-sal-recepcion',
        hash: '50d9775b7af75cf67be7f5a5b5a20d99f0c94bc883b3b1cc177247d41d72f129', fallos: 0, bloqueadoHasta: 0 },
    ];
  }

  const Seed = { generar, usuariosDemo };
  root.Seed = Seed;
  if (typeof module !== 'undefined') module.exports = Seed;
})(typeof window !== 'undefined' ? window : globalThis);
