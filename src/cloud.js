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
export const PRIVATE_KEYS = ['partners', 'fleet', 'drivers'];

export async function fetchCatalog() {
  const rows = await api('app_data?select=key,data');
  return Object.fromEntries(rows.map((r) => [r.key, r.data]));
}

// Convierte el estado de la app en las filas que se guardan (sin datos privados en las públicas).
export function catalogRows(state, slices) {
  const rows = [];
  const add = (key, data, isPublic) => rows.push({ key, data, is_public: isPublic, updated_at: new Date().toISOString() });
  if (slices.has('settings')) {
    const { adminPin, ...pub } = state.settings;
    add('settings', pub, true);
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
