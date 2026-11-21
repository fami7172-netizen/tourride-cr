// Conexión con la base de datos (Supabase) usando su API web.
// La llave "publishable" es pública a propósito: la seguridad la dan las reglas (RLS) de la base de datos.
export const SUPABASE_URL = 'https://zaetkxctjcjetjrwhtti.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_5mk76a-c59sxAXp2Su8mqw_4QUplR6G';

const SESSION_KEY = 'tourride-cr-session';

// ---------- sesión del panel (correo + contraseña) ----------
let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }

function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* ignorar */ }
}

export const currentUser = () => session?.user || null;

async function authRequest(grant, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_description || data.msg || data.message || '';
    throw new Error(/invalid login credentials/i.test(msg) ? 'Correo o contraseña incorrectos' : msg || 'No se pudo entrar');
  }
  saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000, user: data.user });
  return data.user;
}

export const signIn = (email, password) => authRequest('password', { email: email.trim(), password });

export function signOut() {
  const s = session;
  saveSession(null);
  if (s) fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
}

async function token() {
  if (!session) return null;
  if (Date.now() > session.expires_at - 60000) {
    try { await authRequest('refresh_token', { refresh_token: session.refresh_token }); }
    catch (e) { saveSession(null); return null; }
  }
  return session.access_token;
}

// ---------- llamadas a la base de datos ----------
async function api(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  const tk = await token();
  if (tk) headers.Authorization = `Bearer ${tk}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
}

const rpc = (fn, args) => api(`rpc/${fn}`, { method: 'POST', body: args });

// ---------- catálogo (tours, tarifas, ajustes...) ----------
// Públicas: las ve cualquier cliente. Privadas: solo la administración.
export const PUBLIC_KEYS = ['settings', 'tours', 'rates', 'places', 'partners_public', 'fleet_public'];
export const PRIVATE_KEYS = ['partners', 'fleet', 'drivers', 'coupons'];

export async function fetchCatalog() {
  const rows = await api('app_data?select=key,data');
  return Object.fromEntries(rows.map((r) => [r.key, r.data]));
}

// Convierte el estado de la app en las filas que se guardan (sin datos privados en las públicas).
export function catalogRows(state, slices) {
  const rows = [];
  const add = (key, data, isPublic) => rows.push({ key, data, is_public: isPublic, updated_at: new Date().toISOString() });
  if (slices.has('settings')) {
    const { adminPin, coupons, ...pub } = state.settings;
    add('settings', pub, true);
    add('coupons', coupons || {}, false); // privados: el cliente los valida con check_coupon
  }
  if (slices.has('tours')) add('tours', state.tours, true);
  if (slices.has('rates')) add('rates', state.rates, true);
  if (slices.has('places')) { add('places', { list: state.places, removed: state.removedPlaces || [] }, true); }
  if (slices.has('partners')) {
    add('partners', state.partners, false);
    add('partners_public', state.partners.map(({ id, name, active }) => ({ id, name, active })), true);
  }
  if (slices.has('fleet')) {
    add('fleet', state.fleet, false);
    add('fleet_public', state.fleet.map(({ id, typeId, status }) => ({ id, typeId, status })), true);
  }
  if (slices.has('drivers')) add('drivers', state.drivers, false);
  return rows;
}

export const saveCatalog = (rows) => rows.length && api('app_data?on_conflict=key', { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal' });

// ---------- reservas del cliente (sin cuenta) ----------
export const createBooking = (b) => rpc('create_booking', { b });
export const checkCoupon = (code) => rpc('check_coupon', { p_code: code });
export const getMyBooking = (code, phone) => rpc('get_my_booking', { p_code: code, p_phone: phone });
export const cancelMyBooking = (code, phone) => rpc('cancel_my_booking', { p_code: code, p_phone: phone });

// Ocupación de un día (sin datos personales), para cupos de tours y vehículos libres.
export async function fetchDayLoad(date) {
  const rows = await rpc('day_load', { p_date: date });
  return (rows || []).map((r, i) => ({
    id: `load-${date}-${i}`, date, type: r.kind, tourId: r.tour_id, vehicleId: r.vehicle_type, time: r.slot,
    adults: r.people, kids: 0, pax: r.people, status: r.state,
  }));
}

// ---------- opiniones ----------
export const fetchReviews = () => api('reviews?select=*&order=created_at.desc&limit=300');
export const submitReview = (code, phone, rating, comment, lang) =>
  rpc('submit_review', { p_code: code, p_phone: phone, p_rating: rating, p_comment: comment, p_lang: lang });
export const updateReview = (id, patch) => api(`reviews?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
export const deleteReview = (id) => api(`reviews?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });

// ---------- panel ----------
export async function fetchMyProfile() {
  const u = currentUser();
  if (!u) return null;
  const rows = await api(`profiles?id=eq.${u.id}&select=*`);
  return rows[0] || { id: u.id, email: u.email, role: 'pending' };
}

export const fetchProfiles = () => api('profiles?select=*&order=created_at.asc');
export const updateProfile = (id, patch) => api(`profiles?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });

// Fila de la tabla → reserva como la usa la app.
export function rowToBooking(row) {
  return {
    ...(row.details || {}),
    id: row.id, code: row.code, type: row.type, status: row.status, date: row.date, time: row.time,
    partnerId: row.partner_id || row.details?.partnerId, vehicleId: row.vehicle_type || row.details?.vehicleId,
    unitId: row.unit_id || undefined, driverId: row.driver_id || undefined,
    total: Number(row.total), deposit: Number(row.deposit), commission: Number(row.commission),
    customer: { name: row.customer_name, phone: row.customer_phone, email: row.customer_email || '' },
    createdAt: row.created_at,
  };
}

export async function fetchBookings() {
  const rows = await api('bookings?select=*&order=date.desc,time.desc&limit=1000');
  return rows.map(rowToBooking);
}

export function updateBookingRow(b) {
  const { id, code, createdAt, ...details } = b;
  return api(`bookings?id=eq.${id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: {
      status: b.status, unit_id: b.unitId || null, driver_id: b.driverId || null,
      total: b.total || 0, deposit: b.deposit || 0, commission: b.commission || 0, details,
    },
  });
}

// ---------- asistente de IA ----------
// Respuestas: { reply, action } o un error ('disabled', 'limit', 'not_configured'...).
export async function askAssistant(messages, lang) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/assistant`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, lang }),
    });
  } catch (e) { return { error: 'network' }; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || `http${res.status}` };
  return data;
}

// ---------- comprobantes de SINPE ----------
// Achica las fotos del celular (pueden pesar varios MB) antes de subirlas.
async function shrinkImage(file, max = 1600) {
  if (!/^image\//.test(file.type) || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return blob || file;
  } catch (e) { return file; }
}

export async function uploadReceipt(code, phone, file) {
  const body = await shrinkImage(file);
  const ext = body.type === 'application/pdf' ? 'pdf' : body.type === 'image/png' ? 'png' : body.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${code}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/receipts/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': body.type || 'application/octet-stream', 'x-upsert': 'false' },
    body,
  });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  const ok = await rpc('attach_receipt', { p_code: code, p_phone: phone, p_path: path });
  if (!ok) throw new Error('not attached');
  return path;
}

// Enlace temporal (10 minutos) para que la administración vea un comprobante.
export async function receiptUrl(path) {
  const tk = await token();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/receipts/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.signedURL) throw new Error(data.message || `sign ${res.status}`);
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}
