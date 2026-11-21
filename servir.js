// Servidor local para mostrar la demo (solo archivos estáticos, sin dependencias).
// Uso:  node servir.js [puerto]      (por defecto 5173)
// Se detiene con Ctrl+C. Escucha en toda la red local para poder abrirla desde el celular.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = __dirname;
const puerto = Number(process.argv[2] || 5173);
const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
};

http.createServer((req, res) => {
  let ruta;
  try { ruta = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  const archivo = path.join(raiz, ruta === '/' ? 'index.html' : ruta);
  const relativa = path.relative(raiz, archivo);
  if (relativa.startsWith('..') || path.isAbsolute(relativa)) { res.writeHead(403); return res.end(); }
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(datos);
  });
}).on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `El puerto ${puerto} ya está en uso. Prueba otro: node servir.js 5174` : e.message);
  process.exit(1);
}).listen(puerto, '0.0.0.0', () => {
  console.log('Pilates Studio · demo en marcha (Ctrl+C para detener)\n');
  console.log(`  En esta computadora:  http://localhost:${puerto}/`);
  Object.values(os.networkInterfaces()).flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .forEach((i) => console.log(`  En tu red (celular):  http://${i.address}:${puerto}/`));
  console.log(`\n  Panel de gestión:     http://localhost:${puerto}/admin.html  (usuario dueno, clave demo)`);
});
