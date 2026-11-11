import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { initialSettings, initialPartners, initialTours, initialRates } from './data.js';
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
