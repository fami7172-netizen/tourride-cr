// Páginas para Google y para compartir (se crean al publicar, después de "vite build"):
//   tour/<id>/  y  en/tour/<id>/                      → una página por tour, con foto, precio, datos prácticos e incluye
//   traslado/<origen>-a-<destino>/  y  en/transfer/<from>-to-<to>/   → una página por ruta (en ambos sentidos)
//   rutas/  y  en/routes/                             → índice con todos los tours y rutas
//   sitemap.xml y robots.txt                          → para que Google encuentre todas las páginas
// Cada página tiene contenido real (para que Google la entienda) y botones que llevan a reservar dentro de la app.
// Al compartir el enlace por WhatsApp o Facebook sale la tarjeta con la foto.
// Los datos se leen de la base de datos (lo que el dueño cargó en el panel); si no hay conexión, se usan los de ejemplo.
import fs from 'node:fs';
import path from 'node:path';
import { initialTours, initialSettings, initialRates, initialFleet, initialPartners, vehicleTypes, routeInfo } from '../src/data.js';
import { photos } from '../src/photos.js';
import { makeT } from '../src/i18n.js';

const DIST = 'dist';
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const SITE = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || 'https://fami7172-netizen.github.io/tourride-cr/';
const cloudSrc = fs.readFileSync('src/cloud.js', 'utf8');
const SB_URL = (cloudSrc.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
const SB_KEY = (cloudSrc.match(/SUPABASE_KEY\s*=\s*'([^']+)'/) || [])[1];
const TODAY = new Date().toISOString().slice(0, 10);

async function catalog() {
  if (!SB_URL || !SB_KEY) return {};
  try {
    const res = await fetch(`${SB_URL}/rest/v1/app_data?select=key,data&key=in.(tours,settings,rates,fleet,partners)`, { headers: { apikey: SB_KEY }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Object.fromEntries((await res.json()).map((r) => [r.key, r.data]));
  } catch (e) {
    console.warn('share-pages: sin conexión a la base de datos, uso los tours de ejemplo (' + e.message + ')');
    return {};
  }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const usd = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const list = (arr) => (arr || []).filter(Boolean);

// Nombres de lugares como los conoce el turista
const AIRPORTS = {
  'Aeropuerto SJO': { es: 'Aeropuerto Juan Santamaría (SJO)', en: 'Juan Santamaría Airport (SJO)', short: { es: 'Aeropuerto SJO', en: 'SJO Airport' } },
  'Aeropuerto LIR': { es: 'Aeropuerto de Liberia (LIR)', en: 'Liberia Airport (LIR)', short: { es: 'Aeropuerto LIR', en: 'LIR Airport' } },
};
const placeName = (z, lang) => AIRPORTS[z]?.[lang] || z;
const placeSlug = (z, lang) => slug(AIRPORTS[z]?.short[lang] || z);
const fmtHours = (h, lang) => {
  const m = Math.round((Number(h) || 0) * 60);
  if (!m) return '';
  const hh = Math.floor(m / 60), mm = m % 60;
  if (!hh) return `${mm} min`;
  return mm ? `${hh} h ${mm} min` : `${hh} ${lang === 'en' ? (hh === 1 ? 'hour' : 'hours') : (hh === 1 ? 'hora' : 'horas')}`;
};
const fmtTime = (s, lang) => {
  const [h, m] = String(s).split(':').map(Number);
  if (Number.isNaN(h)) return s;
  const ap = h < 12 ? (lang === 'en' ? 'AM' : 'a.m.') : (lang === 'en' ? 'PM' : 'p.m.');
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${ap}`;
};
const photo = (key) => (photos[key] ? SITE + photos[key] : '');

// Foto recortada a 1200×630 (public/img/share/<foto>.jpg); si no existe, la foto general de la página.
function shareImage(key) {
  const name = path.basename(photos[key] || '');
  return name && fs.existsSync(path.join('public/img/share', name)) ? `${SITE}img/share/${name}` : `${SITE}img/share.jpg`;
}

// Textos propios de estas páginas (el resto viene de src/i18n.js, igual que en la app)
const W = {
  es: {
    home: 'Inicio', allRoutes: 'Todos los tours y traslados', from: 'Desde', perAdult: 'por adulto', perChild: 'niños', perTrip: 'por viaje', perPerson: 'por persona',
    bookTour: 'Reservar este tour', bookTransfer: 'Ver precio y reservar', ask: 'Preguntar por WhatsApp', openApp: 'Ver fotos y opiniones en la app',
    tourKicker: 'Tour', transferKicker: 'Traslado privado', boatKicker: 'Traslado en lancha',
    transferTitle: 'Traslado de {a} a {b}', boatTitle: 'Lancha de {a} a {b}',
    transferIntro: 'Traslado puerta a puerta de {a} a {b} con chofer, en vehículo privado para tu grupo. Precio fijo por viaje, no por persona, y te confirmamos por WhatsApp.',
    boatIntro: 'Viaje en lancha de {a} a {b}. Precio por persona y te confirmamos el horario por WhatsApp.',
    km: '{km} km, unas {h}', hoursOnly: 'Unas {h}', varies: 'El tiempo puede variar por el tráfico o el clima.',
    vehicles: 'Vehículos y precios', upTo: 'Hasta {n} pasajeros · {b} maletas', howTitle: 'Cómo funciona',
    ret: 'Viaje de regreso', otherRoutes: 'Otras rutas desde {a}', moreTours: 'Otros tours', popularRoutes: 'Traslados populares',
    departures: 'Salidas', duration: 'Duración', meeting: 'Punto de encuentro', language: 'Idioma', group: 'Grupo', minAge: 'Edad mínima', difficulty: 'Dificultad', cancellation: 'Cancelación',
    years: '{n} años o más', anyAge: 'Todas las edades', groupText: 'Hasta {n} personas por salida', aboutH: 'unas {h}',
    diff: { easy: 'Fácil', medium: 'Moderada', hard: 'Difícil' },
    includes: 'Qué incluye', bring: 'Qué llevar', practical: 'Datos prácticos',
    indexTitle: 'Tours y traslados en Costa Rica', indexIntro: 'Todos nuestros tours y rutas de traslado privado, con precio desde el inicio. Toca uno para ver los detalles y reservar.',
    tours: 'Tours', transfers: 'Traslados', operated: 'Tour operado por {p}. Reservas y atención con {b}.',
    payments: 'Pago por SINPE Móvil o en efectivo. Tarjeta, muy pronto.', rights: 'Todos los derechos reservados.', policy: 'Cancelación', privacy: 'Privacidad',
  },
  en: {
    home: 'Home', allRoutes: 'All tours and transfers', from: 'From', perAdult: 'per adult', perChild: 'kids', perTrip: 'per trip', perPerson: 'per person',
    bookTour: 'Book this tour', bookTransfer: 'See price and book', ask: 'Ask on WhatsApp', openApp: 'See photos and reviews in the app',
    tourKicker: 'Tour', transferKicker: 'Private transfer', boatKicker: 'Boat transfer',
    transferTitle: '{a} to {b} transfer', boatTitle: 'Boat from {a} to {b}',
    transferIntro: 'Door-to-door private transfer from {a} to {b} with a driver, in a private vehicle just for your group. Fixed price per trip, not per person, confirmed on WhatsApp.',
    boatIntro: 'Boat trip from {a} to {b}. Price per person, and we confirm the schedule on WhatsApp.',
    km: '{km} km, about {h}', hoursOnly: 'About {h}', varies: 'Travel time may vary with traffic or weather.',
    vehicles: 'Vehicles and prices', upTo: 'Up to {n} passengers · {b} bags', howTitle: 'How it works',
    ret: 'Return trip', otherRoutes: 'Other routes from {a}', moreTours: 'More tours', popularRoutes: 'Popular transfers',
    departures: 'Departures', duration: 'Duration', meeting: 'Meeting point', language: 'Language', group: 'Group size', minAge: 'Minimum age', difficulty: 'Difficulty', cancellation: 'Cancellation',
    years: '{n} years and up', anyAge: 'All ages', groupText: 'Up to {n} people per departure', aboutH: 'about {h}',
    diff: { easy: 'Easy', medium: 'Moderate', hard: 'Hard' },
    includes: "What's included", bring: 'What to bring', practical: 'Good to know',
    indexTitle: 'Tours and transfers in Costa Rica', indexIntro: 'All our tours and private transfer routes, with the price up front. Tap one to see the details and book.',
    tours: 'Tours', transfers: 'Transfers', operated: 'Tour run by {p}. Booking and support by {b}.',
    payments: 'Pay with SINPE Móvil or cash. Cards coming soon.', rights: 'All rights reserved.', policy: 'Cancellation', privacy: 'Privacy',
  },
};
const fill = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));

// ---------- datos ----------
const data = await catalog();
const fromCloud = Array.isArray(data.tours) && data.tours.length > 0;
const tours = (fromCloud ? data.tours : initialTours).filter((x) => x?.id && x.active !== false && /^[\w-]+$/.test(x.id));
const settings = { ...initialSettings, ...(data.settings || {}) };
const rates = Array.isArray(data.rates) && data.rates.length ? data.rates : initialRates;
const fleet = Array.isArray(data.fleet) ? data.fleet : initialFleet;
const partners = Array.isArray(data.partners) ? data.partners : initialPartners;
const business = settings.businessName || 'TourRide CR';
const wa = String(settings.whatsapp || '').replace(/\D/g, '');
const waLink = (msg) => (wa ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` : '');
const app = (lang, hash) => `${SITE}${lang === 'en' ? '?lang=en' : ''}#/${hash}`;

// Vehículos que de verdad se ofrecen en una ruta: tarifa mayor que 0 y (si es privado) al menos una unidad activa.
const hasUnit = (typeId) => fleet.some((u) => u.typeId === typeId && u.status !== 'shop');
const offered = (rate) => vehicleTypes.filter((v) => Number(rate[v.id]) > 0 && (v.perPerson || hasUnit(v.id)));

// Cada tarifa sirve en ambos sentidos → una página por sentido
const routes = [];
for (const r of rates) {
  if (!r?.from || !r?.to || r.from === r.to) continue;
  const vs = offered(r);
  if (!vs.length) continue;
  for (const [a, b] of [[r.from, r.to], [r.to, r.from]]) {
    if (routes.some((x) => x.a === a && x.b === b)) continue;
    routes.push({ a, b, rate: r, vs, boat: vs.every((v) => v.id === 'boat'), path: { es: `traslado/${placeSlug(a, 'es')}-a-${placeSlug(b, 'es')}/`, en: `en/transfer/${placeSlug(a, 'en')}-to-${placeSlug(b, 'en')}/` } });
  }
}
const minPrice = (route) => {
  const priv = route.vs.filter((v) => !v.perPerson).map((v) => Number(route.rate[v.id]));
  if (priv.length) return { n: Math.min(...priv), per: 'perTrip' };
  return { n: Math.min(...route.vs.map((v) => Number(route.rate[v.id]))), per: 'perPerson' };
};
const routeTitle = (r, lang) => fill(W[lang][r.boat ? 'boatTitle' : 'transferTitle'], { a: placeName(r.a, lang), b: placeName(r.b, lang) });
const tourPath = (tour, lang) => `${lang === 'en' ? 'en/' : ''}tour/${tour.id}/`;
const INDEX = { es: 'rutas/', en: 'en/routes/' };

// ---------- plantilla ----------
const CSS = `
:root{--bg:#0b2a1f;--card:#133f2e;--line:rgba(244,239,226,.12);--text:#f4efe2;--muted:#a9c2b4;--gold:#f2c45a;--serif:'Fraunces',Georgia,serif}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 'Inter',system-ui,-apple-system,sans-serif}
a{color:var(--gold)}img{max-width:100%;display:block}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:10px 18px;background:rgba(6,23,15,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-weight:800}.brand img{border-radius:9px}
.top nav{margin-left:auto;display:flex;gap:14px;align-items:center;font-size:14px}.top nav a{color:var(--muted);text-decoration:none}.top nav a.lang{border:1px solid var(--line);border-radius:999px;padding:4px 12px;color:var(--text)}
main{max-width:1060px;margin:0 auto;padding:18px 18px 110px}
.crumbs{font-size:13px;color:var(--muted);margin:4px 0 14px}.crumbs a{color:var(--muted)}
.hero{position:relative;border-radius:22px;overflow:hidden;aspect-ratio:1200/630;background:var(--card)}.hero img{width:100%;height:100%;object-fit:cover}
.kicker{font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin:20px 0 6px}
h1{font-family:var(--serif);font-weight:700;font-size:34px;line-height:1.12;margin:0 0 10px;letter-spacing:-.01em}
h2{font-family:var(--serif);font-weight:700;font-size:24px;margin:0 0 12px}
.lead{color:var(--muted);font-size:17px;margin:0 0 16px}
.price{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:6px 0 16px}.price small{color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.price b{font-family:var(--serif);font-size:36px;color:var(--gold);line-height:1}.price span{color:var(--muted)}
.ctas{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 22px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:0 22px;border-radius:999px;font-weight:700;text-decoration:none;font-size:16px}
.btn.gold{background:linear-gradient(180deg,#f3c75e,#e6ad37);color:#14231b}.btn.line{border:1px solid rgba(244,239,226,.3);color:var(--text)}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;margin:0 0 16px}
.grid{display:grid;gap:16px}
dl{margin:0;display:grid;gap:12px}dt{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}dd{margin:2px 0 0}
ul.ticks{list-style:none;margin:0;padding:0;display:grid;gap:8px}ul.ticks li{padding-left:26px;position:relative}ul.ticks li:before{content:'✓';position:absolute;left:0;color:var(--gold);font-weight:700}
.veh{display:grid;grid-template-columns:96px 1fr auto;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}.veh:first-of-type{border-top:0}
.veh img{width:96px;height:64px;object-fit:cover;border-radius:12px}.veh .n{font-weight:700}.veh .s{color:var(--muted);font-size:14px}.veh .p{font-family:var(--serif);font-size:22px;font-weight:700;color:var(--gold);text-align:right}.veh .p small{display:block;font-family:Inter,sans-serif;font-size:12px;color:var(--muted);font-weight:500}
ol.steps{margin:0;padding:0;list-style:none;display:grid;gap:12px;counter-reset:s}ol.steps li{counter-increment:s;padding-left:44px;position:relative}ol.steps li:before{content:counter(s);position:absolute;left:0;top:0;width:32px;height:32px;border-radius:50%;background:rgba(242,196,90,.14);color:var(--gold);display:grid;place-items:center;font-weight:800}
ol.steps b{display:block}ol.steps span{color:var(--muted);font-size:15px}
.links{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}.links a{display:block;padding:12px 14px;border:1px solid var(--line);border-radius:14px;text-decoration:none;color:var(--text);background:rgba(255,255,255,.02)}.links a span{display:block;color:var(--gold);font-size:14px;font-weight:700}
.cards{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}.cards a{display:block;text-decoration:none;color:var(--text);background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden}.cards img{width:100%;aspect-ratio:3/2;object-fit:cover}.cards div{padding:12px 14px}.cards b{font-family:var(--serif);font-size:18px;display:block;line-height:1.25}.cards span{color:var(--gold);font-weight:700;font-size:14px}
.muted{color:var(--muted)}.small{font-size:14px}
.sticky{position:fixed;left:12px;right:12px;bottom:12px;z-index:6}.sticky .btn{width:100%;box-shadow:0 8px 30px rgba(0,0,0,.45)}
footer{border-top:1px solid var(--line);padding:24px 18px 120px;text-align:center;color:var(--muted);font-size:14px}footer a{color:var(--muted);margin:0 8px}
@media(max-width:859px){.ctas .btn.gold{display:none}.veh{grid-template-columns:72px 1fr auto;gap:12px}.veh img{width:72px;height:56px}}@media(max-width:600px){.top nav a:not(.lang){display:none}}.brand{white-space:nowrap}
@media(min-width:860px){h1{font-size:46px}main{padding-bottom:40px}.sticky{display:none}footer{padding-bottom:30px}.cols{display:grid;grid-template-columns:1.4fr 1fr;gap:16px;align-items:start}.cols>div{min-width:0}}
`;

function shell({ lang, title, desc, url, alt, img, body, jsonld, sticky }) {
  const w = W[lang];
  const other = lang === 'en' ? 'es' : 'en';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="theme-color" content="#0b2a1f" />
<link rel="canonical" href="${esc(SITE + url)}" />
${alt ? `<link rel="alternate" hreflang="${lang}" href="${esc(SITE + url)}" />
<link rel="alternate" hreflang="${other}" href="${esc(SITE + alt)}" />
<link rel="alternate" hreflang="x-default" href="${esc(SITE + (lang === 'es' ? url : alt))}" />` : ''}
<link rel="icon" href="${SITE}favicon.png" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(business)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(SITE + url)}" />
<meta property="og:image" content="${esc(img)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'es_CR'}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(img)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet" />
<style>${CSS.replace(/\n/g, '')}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<header class="top">
<a class="brand" href="${esc(app(lang, ''))}"><img src="${SITE}icon-192.png" alt="" width="34" height="34" />${esc(business)}</a>
<nav><a href="${SITE}${INDEX[lang]}">${esc(w.allRoutes)}</a>${alt ? `<a class="lang" href="${esc(SITE + alt)}" hreflang="${other}">${other.toUpperCase()}</a>` : ''}</nav>
</header>
<main>
${body}
</main>
${sticky ? `<div class="sticky">${sticky}</div>` : ''}
<footer>
<p><b>${esc(business)}</b> · ${esc(w.payments)}</p>
<p><a href="${esc(app(lang, ''))}">${esc(w.home)}</a><a href="${SITE}${INDEX[lang]}">${esc(w.allRoutes)}</a><a href="${esc(app(lang, 'info/cancelacion'))}">${esc(w.policy)}</a><a href="${esc(app(lang, 'info/privacidad'))}">${esc(w.privacy)}</a></p>
<p>© ${new Date().getFullYear()} ${esc(business)}. ${esc(w.rights)}${settings.ictLicense ? ` · ICT ${esc(settings.ictLicense)}` : ''}</p>
</footer>
</body>
</html>
`;
}

const linkCards = (items) => `<div class="links">${items.map((x) => `<a href="${esc(x.href)}">${esc(x.text)}${x.sub ? `<span>${esc(x.sub)}</span>` : ''}</a>`).join('')}</div>`;
const tourCards = (items, lang) => `<div class="cards">${items.map((tour) => `<a href="${SITE}${tourPath(tour, lang)}"><img src="${esc(photo('tour-' + tour.id) || photo(tour.scene) || photo('explore'))}" alt="" loading="lazy" width="360" height="240" /><div><b>${esc(tour.name?.[lang] || tour.name?.es)}</b><span>${esc(W[lang].from)} ${usd(tour.priceAdult)} ${esc(W[lang].perAdult)}</span></div></a>`).join('')}</div>`;
const routeLink = (r, lang) => ({ href: SITE + r.path[lang], text: routeTitle(r, lang), sub: `${W[lang].from} ${usd(minPrice(r).n)} ${W[lang][minPrice(r).per]}` });

// ---------- página de un tour ----------
function tourPage(tour, lang) {
  const w = W[lang]; const t = makeT(lang);
  const name = tour.name?.[lang] || tour.name?.es || '';
  const text = tour.desc?.[lang] || tour.desc?.es || '';
  const adult = Number(tour.priceAdult) || 0; const child = Number(tour.priceChild) || 0;
  const desc = cut(`${adult ? `${w.from} ${usd(adult)}. ` : ''}${text}`, 160);
  const partner = partners.find((p) => p.id === tour.partnerId);
  const bilingual = [...list(tour.includes?.es), ...list(tour.includes?.en)].some((x) => /biling/i.test(x));
  const language = tour.languages?.[lang] || tour.languages?.es || (bilingual ? t('langBoth') : '');
  const meeting = tour.meeting?.[lang] || tour.meeting?.es || (settings.hotelPickupPerPerson > 0
    ? t('meetPickup', { price: usd(settings.hotelPickupPerPerson), loc: tour.location })
    : t('meetPlace', { loc: tour.location }));
  const cancel = settings.cancelPolicy?.[lang] || settings.cancelPolicy?.es || t('cancelNone');
  const times = list(tour.schedules).map((x) => fmtTime(x, lang));
  const facts = [
    times.length && [w.departures, times.join(' · ')],
    tour.duration && [w.duration, fill(w.aboutH, { h: fmtHours(tour.duration, lang) })],
    [w.meeting, meeting],
    language && [w.language, language],
    tour.capacity > 0 && [w.group, fill(w.groupText, { n: tour.capacity })],
    [w.minAge, tour.minAge > 0 ? fill(w.years, { n: tour.minAge }) : w.anyAge],
    tour.difficulty && [w.difficulty, w.diff[tour.difficulty] || tour.difficulty],
    [w.cancellation, cancel],
  ].filter(Boolean);
  const ask = waLink(`Hola, tengo una consulta sobre el tour ${tour.name?.es || name}.`);
  const book = app(lang, `tour/${tour.id}/reservar`);
  const near = routes.filter((r) => r.b === tour.location).slice(0, 4);
  const others = tours.filter((x) => x.id !== tour.id).slice(0, 6);
  const img = photo('tour-' + tour.id) || photo(tour.scene) || photo('explore');
  const body = `
<p class="crumbs"><a href="${esc(app(lang, ''))}">${esc(w.home)}</a> › <a href="${SITE}${INDEX[lang]}">${esc(w.tours)}</a> › ${esc(name)}</p>
<div class="hero"><img src="${esc(img)}" alt="${esc(name)}" width="1200" height="630" fetchpriority="high" /></div>
<div class="cols"><div>
<p class="kicker">${esc(w.tourKicker)} · ${esc(tour.location)}${tour.duration ? ' · ' + esc(fmtHours(tour.duration, lang)) : ''}</p>
<h1>${esc(name)}</h1>
<div class="price"><small>${esc(w.from)}</small><b>${usd(adult)}</b><span>${esc(w.perAdult)}${child ? ` · ${esc(w.perChild)} ${usd(child)}` : ''}</span></div>
<div class="ctas"><a class="btn gold" href="${esc(book)}">${esc(w.bookTour)}</a>${ask ? `<a class="btn line" href="${esc(ask)}">${esc(w.ask)}</a>` : ''}</div>
<p class="lead">${esc(text)}</p>
${partner ? `<p class="muted small">${esc(fill(w.operated, { p: partner.name, b: business }))}</p>` : ''}
</div><div>
<section class="card"><h2>${esc(w.practical)}</h2><dl>${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>
</div></div>
<div class="grid cols">
${list(tour.includes?.[lang]).length ? `<section class="card"><h2>${esc(w.includes)}</h2><ul class="ticks">${list(tour.includes[lang]).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
${list(tour.bring?.[lang]).length ? `<section class="card"><h2>${esc(w.bring)}</h2><ul class="ticks">${list(tour.bring[lang]).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
</div>
<p><a href="${esc(app(lang, 'tour/' + tour.id))}">${esc(w.openApp)} →</a></p>
${near.length ? `<section><h2>${esc(fill(lang === 'en' ? 'Getting to {p}' : 'Cómo llegar a {p}', { p: tour.location }))}</h2>${linkCards(near.map((r) => routeLink(r, lang)))}</section>` : ''}
${others.length ? `<section><h2 style="margin-top:22px">${esc(w.moreTours)}</h2>${tourCards(others, lang)}</section>` : ''}
`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'TouristTrip', name, description: cut(text, 300), image: img,
    touristType: tour.category, itinerary: { '@type': 'Place', name: `${tour.location}, Costa Rica` },
    provider: { '@type': 'TravelAgency', name: business, url: SITE },
    offers: { '@type': 'Offer', price: adult, priceCurrency: 'USD', url: SITE + tourPath(tour, lang), availability: 'https://schema.org/InStock' },
  };
  return shell({ lang, title: `${name} · ${w.from} ${usd(adult)} | ${business}`, desc, url: tourPath(tour, lang), alt: tourPath(tour, lang === 'en' ? 'es' : 'en'), img: shareImage('tour-' + tour.id) !== `${SITE}img/share.jpg` ? shareImage('tour-' + tour.id) : shareImage(tour.scene), body, jsonld, sticky: `<a class="btn gold" href="${esc(book)}">${esc(w.bookTour)} · ${usd(adult)}</a>` });
}

// ---------- página de una ruta ----------
function routePage(r, lang) {
  const w = W[lang]; const t = makeT(lang);
  const A = placeName(r.a, lang); const B = placeName(r.b, lang);
  const title = routeTitle(r, lang);
  const ri = routeInfo(r.rate);
  const dist = ri ? (ri.km ? fill(w.km, { km: ri.km, h: fmtHours(ri.hours, lang) }) : fill(w.hoursOnly, { h: fmtHours(ri.hours, lang) })) : '';
  const mp = minPrice(r);
  const intro = fill(w[r.boat ? 'boatIntro' : 'transferIntro'], { a: A, b: B });
  const desc = cut(`${w.from} ${usd(mp.n)} ${w[mp.per]}. ${dist ? dist + '. ' : ''}${intro}`, 160);
  const book = app(lang, `ruta/${encodeURIComponent(r.a)}/${encodeURIComponent(r.b)}`);
  const ask = waLink(`Hola, quiero cotizar un traslado ${r.a} → ${r.b}.`);
  const back = routes.find((x) => x.a === r.b && x.b === r.a);
  const more = routes.filter((x) => x.a === r.a && x.b !== r.b).slice(0, 6);
  const toursThere = tours.filter((x) => x.location === r.b).slice(0, 3);
  const img = photo(r.boat ? 'boat' : r.vs.find((v) => !v.perPerson)?.id || 'van6') || photo('beach');
  const vehicles = r.vs.map((v) => `<div class="veh"><img src="${esc(photo(v.id) || img)}" alt="" loading="lazy" width="96" height="64" /><div><div class="n">${esc(v.name[lang])}</div><div class="s">${esc(fill(w.upTo, { n: v.capacity, b: v.luggage }))}</div><div class="s">${esc(v.bestFor?.[lang] || '')}</div></div><div class="p">${usd(r.rate[v.id])}<small>${esc(w[v.perPerson ? 'perPerson' : 'perTrip'])}</small></div></div>`).join('');
  const body = `
<p class="crumbs"><a href="${esc(app(lang, ''))}">${esc(w.home)}</a> › <a href="${SITE}${INDEX[lang]}">${esc(w.transfers)}</a> › ${esc(title)}</p>
<div class="cols"><div>
<p class="kicker">${esc(w[r.boat ? 'boatKicker' : 'transferKicker'])}${dist ? ' · ' + esc(dist) : ''}</p>
<h1>${esc(title)}</h1>
<div class="price"><small>${esc(w.from)}</small><b>${usd(mp.n)}</b><span>${esc(w[mp.per])}</span></div>
<p class="lead">${esc(intro)}${dist ? ` ${esc(w.varies)}` : ''}</p>
<div class="ctas"><a class="btn gold" href="${esc(book)}">${esc(w.bookTransfer)}</a>${ask ? `<a class="btn line" href="${esc(ask)}">${esc(w.ask)}</a>` : ''}</div>
<section class="card"><h2>${esc(w.vehicles)}</h2>${vehicles}</section>
</div><div>
<section class="card"><h2>${esc(w.howTitle)}</h2><ol class="steps">${[1, 2, 3, 4].map((n) => `<li><b>${esc(t('how' + n))}</b><span>${esc(t('how' + n + 'Sub'))}</span></li>`).join('')}</ol></section>
${back ? `<section class="card"><h2>${esc(w.ret)}</h2>${linkCards([routeLink(back, lang)])}</section>` : ''}
</div></div>
${more.length ? `<section><h2 style="margin-top:6px">${esc(fill(w.otherRoutes, { a: A }))}</h2>${linkCards(more.map((x) => routeLink(x, lang)))}</section>` : ''}
${toursThere.length ? `<section><h2 style="margin-top:22px">${esc(lang === 'en' ? `Tours in ${B}` : `Tours en ${B}`)}</h2>${tourCards(toursThere, lang)}</section>` : ''}
`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Service', serviceType: r.boat ? 'Boat transfer' : 'Private transfer', name: title, description: intro,
    provider: { '@type': 'TravelAgency', name: business, url: SITE }, areaServed: { '@type': 'Country', name: 'Costa Rica' },
    offers: { '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: Math.min(...r.vs.map((v) => Number(r.rate[v.id]))), highPrice: Math.max(...r.vs.map((v) => Number(r.rate[v.id]))), offerCount: r.vs.length },
  };
  return shell({ lang, title: `${title} · ${w.from} ${usd(mp.n)} | ${business}`, desc, url: r.path[lang], alt: r.path[lang === 'en' ? 'es' : 'en'], img: shareImage(r.boat ? 'boat' : 'beach'), body, jsonld, sticky: `<a class="btn gold" href="${esc(book)}">${esc(w.bookTransfer)}</a>` });
}

// ---------- índice ----------
function indexPage(lang) {
  const w = W[lang];
  const byOrigin = {};
  for (const r of routes) (byOrigin[r.a] = byOrigin[r.a] || []).push(r);
  const order = Object.keys(byOrigin).sort((x, y) => (AIRPORTS[y] ? 1 : 0) - (AIRPORTS[x] ? 1 : 0) || byOrigin[y].length - byOrigin[x].length);
  const body = `
<h1 style="margin-top:10px">${esc(w.indexTitle)}</h1>
<p class="lead">${esc(w.indexIntro)}</p>
<section><h2>${esc(w.tours)}</h2>${tourCards(tours, lang)}</section>
<section><h2 style="margin-top:26px">${esc(w.transfers)}</h2>
${order.map((a) => `<h3 class="kicker">${esc(placeName(a, lang))}</h3>${linkCards(byOrigin[a].map((r) => routeLink(r, lang)))}`).join('')}
</section>`;
  return shell({ lang, title: `${w.indexTitle} | ${business}`, desc: w.indexIntro, url: INDEX[lang], alt: INDEX[lang === 'en' ? 'es' : 'en'], img: `${SITE}img/share.jpg`, body });
}

// ---------- escribir ----------
const write = (rel, content) => { const dir = path.join(DIST, rel); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.html'), content); };
const urls = [{ loc: SITE, alt: null }];
for (const tour of tours) for (const lang of ['es', 'en']) { write(tourPath(tour, lang), tourPage(tour, lang)); urls.push({ loc: SITE + tourPath(tour, lang) }); }
for (const r of routes) for (const lang of ['es', 'en']) { write(r.path[lang], routePage(r, lang)); urls.push({ loc: SITE + r.path[lang] }); }
for (const lang of ['es', 'en']) { write(INDEX[lang], indexPage(lang)); urls.push({ loc: SITE + INDEX[lang] }); }

fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);

// Enlaces a tours o rutas creados después de publicar (o borrados): la página 404 los manda a la app.
const base = new URL(SITE).pathname;
fs.writeFileSync(path.join(DIST, '404.html'), `<!doctype html><html><head><meta charset="utf-8" /><meta name="robots" content="noindex" /><title>${esc(business)}</title>
<script>
(function () {
  var base = ${JSON.stringify(base)};
  var rest = location.pathname.slice(base.length);
  var m = rest.match(/^(?:en\\/)?tour\\/([\\w-]+)/);
  location.replace(base + (/^en\\//.test(rest) ? '?lang=en' : '') + (m ? '#/tour/' + m[1] : ''));
})();
</script></head><body></body></html>
`);
console.log(`share-pages: ${tours.length} tours (${fromCloud ? 'de la base de datos' : 'de ejemplo'}) → ${SITE}tour/<id>/`);
console.log(`share-pages: ${routes.length} rutas de traslado, ${urls.length} páginas en sitemap.xml`);
