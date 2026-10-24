// Robot de noticias — Colombia Noticias Hoy (Carlos Anaya) · Vibras Positivas HM
// Lo ejecuta GitHub Actions cada 30 minutos. Escribe noticias.json solo si hay cambios.
import { readFile, writeFile } from 'node:fs/promises';

const ARCHIVO = 'noticias.json';
// Cada tema es una búsqueda en Google Noticias Colombia. "Última hora" son los titulares del país.
const TEMAS = [
  { tema: 'Última hora', url: 'https://news.google.com/rss?hl=es-419&gl=CO&ceid=CO:es-419' },
  { tema: 'Gobierno', q: '"Abelardo de la Espriella" OR "Casa de Nariño"' },
  { tema: 'Petro', q: 'Petro OR "Pacto Histórico"' },
  { tema: 'Congreso', q: 'Senado OR "Cámara de Representantes" Colombia' },
  { tema: 'Fuerza Pública', q: '"Policía Nacional" OR "Fuerzas Militares" OR Ejército Colombia' },
  { tema: 'Justicia', q: 'Fiscalía OR "Corte Suprema" OR Procuraduría Colombia' },
  { tema: 'Regiones', q: 'alcalde OR gobernador Colombia' },
];
const MAX_NOTICIAS = 160;
const DIAS_MAX = 10;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const decodificar = t => (t || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&amp;/g, '&').trim();
const etiqueta = (xml, tag) => decodificar((xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1]);
const clave = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);

export function parsearNoticias(xml, tema = '') {
  return xml.split('<item>').slice(1).map(bloque => {
    const fuente = etiqueta(bloque, 'source');
    let titulo = etiqueta(bloque, 'title');
    if (fuente && titulo.endsWith(' - ' + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
    const fecha = new Date(etiqueta(bloque, 'pubDate'));
    return { titulo, enlace: etiqueta(bloque, 'link'), fuente, fecha: isNaN(fecha) ? null : fecha.toISOString(), tema };
  }).filter(n => n.titulo && n.enlace && n.fecha);
}

async function traer(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9' } });
  if (!r.ok) throw new Error(`${r.status} en ${url}`);
  return r.text();
}

async function buscarNoticias() {
  const todas = [];
  for (const t of TEMAS) {
    const url = t.url || `https://news.google.com/rss/search?q=${encodeURIComponent(t.q + ' when:3d')}&hl=es-419&gl=CO&ceid=CO:es-419`;
    try { todas.push(...parsearNoticias(await traer(url), t.tema).slice(0, 40)); }
    catch (e) { console.warn(t.tema + ':', e.message); }
  }
  return todas;
}

async function main() {
  let previo = { noticias: [] };
  try { previo = JSON.parse(await readFile(ARCHIVO, 'utf8')); } catch {}

  const nuevas = await buscarNoticias();
  const limite = Date.now() - DIAS_MAX * 86400000;
  const mapa = new Map();
  for (const n of [...nuevas, ...(previo.noticias || [])]) {
    if (new Date(n.fecha).getTime() < limite) continue;
    const k = clave(n.titulo);
    if (!mapa.has(k)) mapa.set(k, n);
  }
  const noticias = [...mapa.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, MAX_NOTICIAS);

  const contenido = { noticias };
  const { actualizado, ...previoSinFecha } = previo;
  if (JSON.stringify(contenido) === JSON.stringify(previoSinFecha)) {
    console.log('Sin cambios.');
    return;
  }
  await writeFile(ARCHIVO, JSON.stringify({ actualizado: new Date().toISOString(), ...contenido }, null, 2) + '\n');
  console.log(`Guardado: ${noticias.length} noticias.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
