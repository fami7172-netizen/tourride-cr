import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as cloud from './cloud.js';
import { initialSettings, initialPartners, initialTours, initialRates, initialFleet, initialDrivers, zones, vehicleTypes } from './data.js';
import { makeT } from './i18n.js';

// El catálogo y las reservas viven en la base de datos (Supabase, ver cloud.js).
// En el celular se guarda una copia (localStorage) para que la app abra rápido y funcione sin señal.
// "bookings" = las reservas que el cliente hizo en este celular; "adminBookings" = todas (solo panel).
const KEY = 'tourride-cr-v1';

function fresh() {
  return {
    settings: initialSettings,
    partners: initialPartners,
    tours: initialTours,
    rates: initialRates,
    places: zones,
    fleet: initialFleet,
    drivers: initialDrivers,
    bookings: [],
    profile: { name: '', phone: '', email: '' },
    // primera vez: idioma del celular del cliente (turistas en inglés, ticos en español)
    lang: typeof navigator !== 'undefined' && !String(navigator.language || 'es').toLowerCase().startsWith('es') ? 'en' : 'es',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate({ ...fresh(), ...JSON.parse(raw) });
  } catch (e) { /* sin almacenamiento: seguimos en memoria */ }
  return fresh();
}

// Agrega tarifas, rutas y ajustes nuevos sin borrar lo que el dueño ya cambió.
function migrate(st) {
  const base = fresh();
  st.settings = { ...base.settings, ...st.settings };
  const byId = Object.fromEntries(st.rates.map((r) => [r.id, r]));
  const merged = st.rates.map((r) => {
    const def = base.rates.find((x) => x.id === r.id);
    return def ? { ...def, ...r } : r;
  });
  base.rates.forEach((r) => { if (!byId[r.id]) merged.push(r); });
  st.rates = merged;
  // lugares nuevos de la lista base que el dueño todavía no tiene
  st.places = [...(st.places || []), ...base.places.filter((z) => !(st.places || []).includes(z) && !(st.removedPlaces || []).includes(z))];
  return st;
}

const ADMIN_ROLES = ['superadmin', 'owner', 'staff'];
export const isAdminRole = (role) => ADMIN_ROLES.includes(role);
const ALL_SLICES = ['settings', 'tours', 'rates', 'places', 'partners', 'fleet', 'drivers'];

// Mezcla lo que viene de la base de datos con el estado de la app.
function applyCatalog(st, cat, withPrivate) {
  const out = { ...st };
  if (cat.settings) out.settings = { ...initialSettings, ...st.settings, ...cat.settings };
  if (cat.tours) out.tours = cat.tours;
  if (cat.rates) out.rates = cat.rates;
  if (cat.places) { out.places = cat.places.list || out.places; out.removedPlaces = cat.places.removed || []; }
  if (withPrivate && cat.partners) out.partners = cat.partners;
  else if (cat.partners_public) out.partners = cat.partners_public;
  if (withPrivate && cat.fleet) out.fleet = cat.fleet;
  else if (cat.fleet_public) out.fleet = cat.fleet_public;
  if (withPrivate && cat.drivers) out.drivers = cat.drivers;
  return out;
}

// Comisión de un tour según el % del socio (el cliente no ve ese %, se calcula aquí en el panel).
function withCommission(b, partners) {
  if (b.type !== 'tour' || b.commission) return b;
  const pct = partners.find((p) => p.id === b.partnerId)?.commission || 0;
  return { ...b, commission: Math.round(((b.tourAmount || 0) - (b.discount || 0)) * pct / 100) };
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);
  const [admin, setAdmin] = useState(null); // { user, profile } cuando alguien entra al panel
  const [adminBookings, setAdminBookings] = useState([]);
  const [dayLoads, setDayLoads] = useState({});
  const [cloudError, setCloudError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const adminRef = useRef(admin);
  adminRef.current = admin;
  const dirty = useRef(new Set());

  // copia local (sin datos del panel)
  useEffect(() => {
    const { adminOnly, ...keep } = state;
    try { localStorage.setItem(KEY, JSON.stringify(keep)); } catch (e) { /* ignorar */ }
  }, [state]);

  // al abrir la app: catálogo de la nube y, si había sesión, el panel
  const loadPublic = useCallback(async () => {
    try {
      const cat = await cloud.fetchCatalog();
      setState((s) => applyCatalog(s, cat, false));
    } catch (e) { /* sin señal: se usa la copia local */ }
  }, []);

  const loadAdmin = useCallback(async () => {
    const profile = await cloud.fetchMyProfile();
    if (!profile) { setAdmin(null); return null; }
    setAdmin({ user: cloud.currentUser(), profile });
    if (isAdminRole(profile.role)) {
      const cat = await cloud.fetchCatalog();
      if (!cat.tours) {
        // primera vez: se sube a la nube el catálogo que hay en este celular
        await cloud.saveCatalog(cloud.catalogRows(stateRef.current, new Set(ALL_SLICES)));
      } else {
        setState((s) => applyCatalog(s, cat, true));
      }
      const partners = cat.partners || stateRef.current.partners;
      const list = await cloud.fetchBookings();
      setAdminBookings(list.map((b) => withCommission(b, partners)));
    } else if (profile.role === 'partner' || profile.role === 'driver') {
      setAdminBookings(await cloud.fetchBookings());
    }
    return profile;
  }, []);

  useEffect(() => {
    loadPublic();
    if (cloud.currentUser()) loadAdmin().catch(() => setAdmin(null));
  }, [loadPublic, loadAdmin]);

  // cambios del panel → se guardan en la nube (agrupados, medio segundo después)
  useEffect(() => {
    if (!dirty.current.size || !adminRef.current || !isAdminRole(adminRef.current.profile.role)) { dirty.current.clear(); return undefined; }
    const timer = setTimeout(() => {
      const slices = new Set(dirty.current);
      dirty.current.clear();
      setSyncing(true);
      cloud.saveCatalog(cloud.catalogRows(stateRef.current, slices))
        .then(() => setCloudError(''))
        .catch((e) => setCloudError('No se pudo guardar en la nube: ' + e.message))
        .finally(() => setSyncing(false));
    }, 600);
    return () => clearTimeout(timer);
  }, [state]);

  const api = useMemo(() => {
    const set = (key, updater) =>
      setState((s) => ({ ...s, [key]: typeof updater === 'function' ? updater(s[key]) : updater }));
    const setCat = (key) => (updater) => { dirty.current.add(key); set(key, updater); };
    return {
      ...state,
      admin, adminBookings, dayLoads, cloudError, syncing,
      t: makeT(state.lang),
      setLang: (l) => set('lang', l),
      setProfile: (p) => set('profile', p),
      setSettings: setCat('settings'),
      setTours: setCat('tours'),
      setPartners: setCat('partners'),
      setRates: setCat('rates'),
      setPlaces: setCat('places'),
      setFleet: setCat('fleet'),
      setDrivers: setCat('drivers'),
      removePlace: (name) => { dirty.current.add('places'); setState((s) => ({ ...s, places: s.places.filter((z) => z !== name), removedPlaces: [...(s.removedPlaces || []), name] })); },
      renamePlace: (oldName, newName) => {
        dirty.current.add('places'); dirty.current.add('rates');
        setState((s) => ({
          ...s,
          places: s.places.map((z) => (z === oldName ? newName : z)),
          rates: s.rates.map((r) => ({ ...r, from: r.from === oldName ? newName : r.from, to: r.to === oldName ? newName : r.to })),
        }));
      },
      // precio en la moneda principal, y con la otra moneda al lado
      fm: (n) => (state.settings.currency === 'CRC' ? crc(n, state.settings.exchangeRate) : usd(n)),
      fm2: (n) => (state.settings.currency === 'CRC'
        ? `${crc(n, state.settings.exchangeRate)} · ${usd(n)}`
        : `${usd(n)} · ${crc(n, state.settings.exchangeRate)}`),

      // ----- cliente -----
      // Envía la reserva a la nube; la base de datos da el código definitivo.
      submitBooking: async (b) => {
        const code = await cloud.createBooking(b);
        const saved = { ...b, code, cloud: true };
        set('bookings', (list) => [saved, ...list]);
        setDayLoads((d) => { const n = { ...d }; delete n[b.date]; return n; });
        return saved;
      },
      updateBooking: (id, patch) => set('bookings', (list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b))),
      // Trae el estado actual (pagada, precio cotizado...) de las reservas de este celular.
      refreshMyBookings: async () => {
        const mine = stateRef.current.bookings.filter((b) => b.cloud && !['cancelled', 'completed'].includes(b.status));
        const found = await Promise.all(mine.map((b) => cloud.getMyBooking(b.code, b.customer.phone).catch(() => null)));
        const byCode = Object.fromEntries(found.filter(Boolean).map((r) => [r.code, r]));
        if (!Object.keys(byCode).length) return;
        set('bookings', (list) => list.map((b) => {
          const r = byCode[b.code];
          return r ? { ...b, status: r.status, total: Number(r.total), deposit: Number(r.deposit) } : b;
        }));
      },
      cancelMine: async (b) => {
        if (b.cloud) await cloud.cancelMyBooking(b.code, b.customer.phone);
        set('bookings', (list) => list.map((x) => (x.id === b.id ? { ...x, status: 'cancelled' } : x)));
      },
      loadDay: (date) => {
        cloud.fetchDayLoad(date)
          .then((rows) => setDayLoads((d) => ({ ...d, [date]: rows })))
          .catch(() => { /* sin señal: se usan las reservas de este celular */ });
      },

      // ----- panel -----
      login: async (email, password) => { await cloud.signIn(email, password); return loadAdmin(); },
      logout: () => { cloud.signOut(); setAdmin(null); setAdminBookings([]); loadPublic(); },
      reloadAdmin: () => loadAdmin().then(() => setCloudError('')).catch((e) => setCloudError('Sin conexión: ' + e.message)),
      updateAdminBooking: (id, patch) => {
        const cur = adminBookings.find((b) => b.id === id);
        if (!cur) return;
        const next = { ...cur, ...patch };
        setAdminBookings((list) => list.map((b) => (b.id === id ? next : b)));
        cloud.updateBookingRow(next)
          .then(() => setCloudError(''))
          .catch((e) => setCloudError('No se pudo guardar la reserva: ' + e.message));
      },
    };
  }, [state, admin, adminBookings, dayLoads, cloudError, syncing, loadAdmin, loadPublic]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

// ---------- utilidades ----------
export function newCode() {
  return 'TR-' + Math.floor(10000 + Math.random() * 90000);
}

export function usd(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function crc(n, rate) {
  return '₡' + Math.round(n * rate).toLocaleString('es-CR');
}

export function findRate(rates, from, to) {
  return rates.find((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from));
}

export function waLink(number, text) {
  const n = String(number || '').replace(/\D/g, '');
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export function fmtDate(iso, lang) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtTime(hhmm, lang) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? (lang === 'en' ? 'AM' : 'a.m.') : (lang === 'en' ? 'PM' : 'p.m.');
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// ---------- choques de horario (flota y choferes) ----------
function toMin(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
}

// Horas que ocupa una reserva: traslado = tripHours del ajuste; tour = duración del tour.
export function bookingSpan(b, tours, settings) {
  const hours = b.type === 'tour' ? (tours.find((x) => x.id === b.tourId)?.duration || settings.tripHours || 4) : (settings.tripHours || 4);
  const start = toMin(b.time);
  return [start, start + hours * 60];
}

export function overlaps(a, b, tours, settings) {
  if (a.id === b.id || a.date !== b.date || a.status === 'cancelled' || b.status === 'cancelled') return false;
  const [s1, e1] = bookingSpan(a, tours, settings);
  const [s2, e2] = bookingSpan(b, tours, settings);
  return s1 < e2 && s2 < e1;
}

export function peopleOf(b) {
  return b.type === 'tour' ? b.adults + b.kids : b.pax;
}

// ¿Cuántas unidades de un tipo quedan libres para un traslado nuevo en esa fecha y hora?
export function unitsFree(typeId, date, time, { fleet, bookings, tours, settings }) {
  const units = fleet.filter((u) => u.typeId === typeId && u.status === 'active').length;
  const probe = { id: '__new', type: 'transfer', date, time, status: 'pending' };
  const busy = bookings.filter((b) => b.type === 'transfer' && b.vehicleId === typeId && overlaps(probe, b, tours, settings)).length;
  return units - busy;
}

export const isPerPerson = (typeId) => !!vehicleTypes.find((v) => v.id === typeId)?.perPerson;

// Reservas de un día para calcular cupos y vehículos libres (de la nube si hay señal).
export function useDayBookings(date) {
  const { dayLoads, bookings, loadDay } = useStore();
  useEffect(() => { if (date && !dayLoads[date]) loadDay(date); }, [date, dayLoads[date]]); // eslint-disable-line react-hooks/exhaustive-deps
  return dayLoads[date] || bookings.filter((b) => b.date === date);
}
