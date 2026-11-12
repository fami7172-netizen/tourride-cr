import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { initialSettings, initialPartners, initialTours, initialRates, initialFleet, initialDrivers, zones, vehicleTypes } from './data.js';
import { makeT } from './i18n.js';

// Por ahora los datos se guardan en este celular (localStorage).
// En la etapa 2 esto se cambia por Supabase para que el dueño vea las reservas de todos.
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

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorar */ }
  }, [state]);

  const api = useMemo(() => {
    const set = (key, updater) =>
      setState((s) => ({ ...s, [key]: typeof updater === 'function' ? updater(s[key]) : updater }));
    return {
      ...state,
      t: makeT(state.lang),
      setLang: (l) => set('lang', l),
      setProfile: (p) => set('profile', p),
      setSettings: (u) => set('settings', u),
      setTours: (u) => set('tours', u),
      setPartners: (u) => set('partners', u),
      setRates: (u) => set('rates', u),
      setPlaces: (u) => set('places', u),
      setFleet: (u) => set('fleet', u),
      setDrivers: (u) => set('drivers', u),
      removePlace: (name) => setState((s) => ({ ...s, places: s.places.filter((z) => z !== name), removedPlaces: [...(s.removedPlaces || []), name] })),
      renamePlace: (oldName, newName) => setState((s) => ({
        ...s,
        places: s.places.map((z) => (z === oldName ? newName : z)),
        rates: s.rates.map((r) => ({ ...r, from: r.from === oldName ? newName : r.from, to: r.to === oldName ? newName : r.to })),
      })),
      // precio en la moneda principal, y con la otra moneda al lado
      fm: (n) => (state.settings.currency === 'CRC' ? crc(n, state.settings.exchangeRate) : usd(n)),
      fm2: (n) => (state.settings.currency === 'CRC'
        ? `${crc(n, state.settings.exchangeRate)} · ${usd(n)}`
        : `${usd(n)} · ${crc(n, state.settings.exchangeRate)}`),
      addBooking: (b) => set('bookings', (list) => [b, ...list]),
      updateBooking: (id, patch) => set('bookings', (list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b))),
      resetDemo: () => setState((s) => ({ ...fresh(), lang: s.lang, profile: s.profile })),
    };
  }, [state]);

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
