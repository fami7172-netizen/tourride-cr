// Crea una página pequeña por cada tour (dist/tour/<id>/ y dist/en/tour/<id>/) con la foto, el nombre y la
// descripción del tour. Así, al compartir el enlace por WhatsApp o Facebook, sale la tarjeta con la foto del tour.
// La página manda enseguida al visitante al tour dentro de la app (#/tour/<id>).
// Los tours se leen de la base de datos (lo que el dueño cargó en el panel); si no hay conexión, se usan los de ejemplo.
import fs from 'node:fs';
import path from 'node:path';
import { initialTours, initialSettings } from '../src/data.js';
import { photos } from '../src/photos.js';

const DIST = 'dist';
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const SITE = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || 'https://fami7172-netizen.github.io/tourride-cr/';
const cloudSrc = fs.readFileSync('src/cloud.js', 'utf8');
const SB_URL = (cloudSrc.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
const SB_KEY = (cloudSrc.match(/SUPABASE_KEY\s*=\s*'([^']+)'/) || [])[1];

async function catalog() {
  if (!SB_URL || !SB_KEY) return {};
  try {
    const res = await fetch(`${SB_URL}/rest/v1/app_data?select=key,data&key=in.(tours,settings)`, { headers: { apikey: SB_KEY }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Object.fromEntries((await res.json()).map((r) => [r.key, r.data]));
  } catch (e) {
    console.warn('share-pages: sin conexión a la base de datos, uso los tours de ejemplo (' + e.message + ')');
    return {};
  }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

// Foto recortada a 1200×630 (public/img/share/<foto>.jpg); si no existe, la foto general de la página.
function shareImage(tour) {
  const src = photos['tour-' + tour.id] || photos[tour.scene] || photos.explore;
  const name = path.basename(src || '');
  return name && fs.existsSync(path.join('public/img/share', name)) ? `${SITE}img/share/${name}` : `${SITE}img/share.jpg`;
}

function page(tour, lang, business) {
  const name = tour.name?.[lang] || tour.name?.es || '';
  const price = Number(tour.priceAdult) || 0;
  const desc = cut(`${price ? (lang === 'en' ? `From $${price}. ` : `Desde $${price}. `) : ''}${tour.desc?.[lang] || tour.desc?.es || ''}`, 200);
  const url = `${SITE}${lang === 'en' ? 'en/' : ''}tour/${tour.id}/`;
  const target = `${SITE}#/tour/${tour.id}`;
  const img = shareImage(tour);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(name)} · ${esc(business)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(business)}" />
<meta property="og:title" content="${esc(name)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:image" content="${esc(img)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'es_CR'}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(name)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(img)}" />
<meta http-equiv="refresh" content="0; url=${esc(target)}" />
<script>location.replace(${JSON.stringify(target)});</script>
<style>body{font-family:system-ui,sans-serif;background:#0f3527;color:#f4efe2;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}a{color:#f2c45a}img{max-width:100%;height:auto;border-radius:16px}</style>
</head>
<body>
<main>
<img src="${esc(img)}" alt="${esc(name)}" width="600" height="315" />
<h1>${esc(name)}</h1>
<p>${esc(desc)}</p>
<p><a href="${esc(target)}">${lang === 'en' ? 'See the tour' : 'Ver el tour'}</a></p>
</main>
</body>
</html>
`;
}

const data = await catalog();
const fromCloud = Array.isArray(data.tours) && data.tours.length > 0;
const tours = fromCloud ? data.tours : initialTours;
const business = data.settings?.businessName || initialSettings.businessName || 'TourRide CR';
let n = 0;
for (const tour of tours) {
  if (!tour?.id || tour.active === false || !/^[\w-]+$/.test(tour.id)) continue;
  for (const lang of ['es', 'en']) {
    const dir = path.join(DIST, lang === 'en' ? 'en' : '', 'tour', tour.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page(tour, lang, business));
  }
  n++;
}

// Enlaces a tours creados después de publicar (o borrados): la página 404 los manda al tour dentro de la app.
const base = new URL(SITE).pathname;
fs.writeFileSync(path.join(DIST, '404.html'), `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(business)}</title>
<script>
(function () {
  var base = ${JSON.stringify(base)};
  var m = location.pathname.slice(base.length).match(/^(?:en\\/)?tour\\/([\\w-]+)/);
  location.replace(base + (m ? '#/tour/' + m[1] : ''));
})();
</script></head><body></body></html>
`);
console.log(`share-pages: ${n} tours (${fromCloud ? 'de la base de datos' : 'de ejemplo'}) → ${SITE}tour/<id>/`);
