import { useEffect, useMemo, useRef, useState } from 'react';
import { StoreProvider, useStore, useDayBookings, ratingOf, usd, crc, findRate, waLink, todayISO, fmtDate, fmtTime, newCode, unitsFree } from './store.jsx';
import { vehicleTypes, routeInfo } from './data.js';
import Scene from './Scene.jsx';
import { Icon, Counter, QR, Modal, Field, Toast } from './ui.jsx';
import Admin from './Admin.jsx';
import Assistant from './Assistant.jsx';
import { photos } from './photos.js';
import * as cloud from './cloud.js';

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

// ---------- navegación ----------
// Cada sección tiene su propio enlace (#/tours, #/tour/t3...) y el botón "atrás" del celular funciona.
const TAB_PATH = { transfers: '#/', explore: '#/tours', bookings: '#/mis-reservas', profile: '#/perfil' };

// Entrada secreta al panel: tocar 5 veces seguidas el logo (arriba, en Perfil) o el © del pie de página.
function useSecretTaps(onOpen) {
  const taps = useRef([]);
  return () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 2500), now];
    if (taps.current.length >= 5) { taps.current = []; onOpen(); return true; }
    return false;
  };
}
const INFO_PAGES = ['cancelacion', 'privacidad'];
function routeHash({ tab, stack }) {
  const s = stack[stack.length - 1];
  if (!s) return TAB_PATH[tab] || '#/';
  if (s.name === 'tour') return `#/tour/${s.id}`;
  if (s.name === 'bookTour') return `#/tour/${s.id}/reservar`;
  if (s.name === 'bookTransfer') return '#/traslado';
  if (s.name === 'booking') return `#/reserva/${s.id}`;
  if (s.name === 'admin') return '#/admin';
  if (s.name === 'review') return `#/opinar/${s.code}`;
  if (s.name === 'info') return `#/info/${s.id}`;
  return '#/';
}
function parseHash(hash) {
  const [a, b, c] = String(hash || '').replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (a === 'tours') return { tab: 'explore', stack: [] };
  if (a === 'mis-reservas') return { tab: 'bookings', stack: [] };
  if (a === 'perfil') return { tab: 'profile', stack: [] };
  if (a === 'tour' && b) return { tab: 'explore', stack: [{ name: 'tour', id: b }, ...(c === 'reservar' ? [{ name: 'bookTour', id: b }] : [])] };
  if (a === 'reserva' && b) return { tab: 'bookings', stack: [{ name: 'booking', id: b }] };
  if (a === 'admin') return { tab: 'profile', stack: [{ name: 'admin' }] };
  if (a === 'info' && INFO_PAGES.includes(b)) return { tab: 'profile', stack: [{ name: 'info', id: b }] };
  if (a === 'opinar' && /^TR-\d{5}$/i.test(b || '')) return { tab: 'bookings', stack: [{ name: 'review', code: b.toUpperCase() }] };
  return { tab: 'transfers', stack: [] };
}
function initialRoute() {
  const st = window.history.state;
  if (st && st.tab && Array.isArray(st.stack)) return { tab: st.tab, stack: st.stack, depth: st.depth || 0 };
  return { ...parseHash(window.location.hash), depth: 0 };
}

function Shell() {
  const { settings, tours, bookings, t, lang } = useStore();
  const [route, setRoute] = useState(initialRoute);
  const routeRef = useRef(route);
  const [toast, setToast] = useState('');

  const apply = (r, mode) => {
    routeRef.current = r;
    setRoute(r);
    const url = routeHash(r);
    try {
      if (mode === 'push') window.history.pushState(r, '', url);
      else window.history.replaceState(r, '', url);
    } catch (e) { /* ignorar */ }
  };

  useEffect(() => {
    apply(routeRef.current, 'replace');
    const onPop = (e) => {
      const r = e.state && e.state.tab ? e.state : { ...parseHash(window.location.hash), depth: 0 };
      routeRef.current = r;
      setRoute(r);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nav = useMemo(() => ({
    push: (s) => { const r = routeRef.current; apply({ tab: r.tab, stack: [...r.stack, s], depth: (r.depth || 0) + 1 }, 'push'); window.scrollTo(0, 0); },
    back: () => {
      const r = routeRef.current;
      if (r.depth > 0) window.history.back(); // vuelve como el botón "atrás" del celular
      else apply({ tab: r.tab, stack: r.stack.slice(0, -1), depth: 0 }, 'replace');
    },
    reset: (tb) => { const r = routeRef.current; apply({ tab: tb || r.tab, stack: [], depth: (r.depth || 0) + 1 }, 'push'); window.scrollTo(0, 0); },
    toast: (txt) => { setToast(txt); setTimeout(() => setToast(''), 2200); },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (tb) => { const r = routeRef.current; if (tb === r.tab && !r.stack.length) return window.scrollTo(0, 0); apply({ tab: tb, stack: [], depth: (r.depth || 0) + 1 }, 'push'); window.scrollTo(0, 0); };

  // Si un enlace apunta a algo que no existe (tour borrado, reserva de otro celular), se muestra la sección.
  let { tab, stack } = route;
  let screen = stack[stack.length - 1];
  if ((screen?.name === 'tour' || screen?.name === 'bookTour') && tours.length && !tours.some((x) => x.id === screen.id)) screen = null;
  if (screen?.name === 'booking' && !bookings.some((x) => x.id === screen.id)) screen = null;
  if (screen?.name === 'bookTransfer' && !screen.draft) screen = null;
  if (!screen) stack = [];

  // Título de la pestaña del navegador según la sección
  useEffect(() => {
    const name = settings.businessName || 'TourRide CR';
    const tour = screen && (screen.name === 'tour' || screen.name === 'bookTour') ? tours.find((x) => x.id === screen.id) : null;
    const part = tour ? tour.name[lang] : screen ? (screen.name === 'admin' ? t('admin') : screen.name === 'review' ? t('leaveReview') : screen.name === 'info' ? t(screen.id === 'privacidad' ? 'privacyTitle' : 'policyTitle') : '') : { transfers: '', explore: t('navTours'), bookings: t('bookings'), profile: t('profile') }[tab];
    document.title = part ? `${part} · ${name}` : `${name} · ${t('heroTitle')}`;
  }, [tab, screen, lang, settings.businessName, tours]); // eslint-disable-line react-hooks/exhaustive-deps

  let content;
  if (screen?.name === 'tour') content = <TourDetail id={screen.id} nav={nav} />;
  else if (screen?.name === 'bookTour') content = <BookTour id={screen.id} init={screen.init} nav={nav} />;
  else if (screen?.name === 'bookTransfer') content = <BookTransfer draft={screen.draft} nav={nav} />;
  else if (screen?.name === 'booking') content = <BookingDone id={screen.id} nav={nav} />;
  else if (screen?.name === 'admin') content = <Admin nav={nav} />;
  else if (screen?.name === 'review') content = <ReviewPage code={screen.code} nav={nav} />;
  else if (screen?.name === 'info') content = <InfoPage id={screen.id} nav={nav} />;
  else if (tab === 'transfers') content = <TransfersTab nav={nav} />;
  else if (tab === 'explore') content = <ExploreTab nav={nav} />;
  else if (tab === 'bookings') content = <BookingsTab nav={nav} />;
  else content = <ProfileTab nav={nav} />;

  return (
    <div className="app">
      <TopNav tab={screen ? null : tab} go={go} openAdmin={() => nav.push({ name: 'admin' })} />
      <main className={screen ? 'screen' : 'screen with-nav'} key={(screen?.name || tab) + (screen?.id || '')}>
        {content}
      </main>
      {screen?.name !== 'admin' && <Footer go={go} nav={nav} withNav={!screen} openAdmin={() => nav.push({ name: 'admin' })} />}
      {!screen && <BottomNav tab={tab} setTab={go} />}
      {settings.assistantEnabled && !['bookTour', 'bookTransfer', 'admin', 'review'].includes(screen?.name) && <Assistant nav={nav} raised={!screen || screen.name === 'tour'} />}
      <Toast text={toast} />
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const { t } = useStore();
  const items = [
    ['transfers', Icon.car, t('transfers')],
    ['explore', Icon.compass, t('explore')],
    ['bookings', Icon.calendar, t('bookings')],
    ['profile', Icon.user, t('profile')],
  ];
  return (
    <nav className="bottom-nav">
      {items.map(([id, I, label]) => (
        <a key={id} href={TAB_PATH[id]} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setTab(id); }}>
          <I />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}

// Menú de arriba: solo se ve en computadora (en el celular está el menú de abajo)
function TopNav({ tab, go, openAdmin }) {
  const { t, settings } = useStore();
  const secret = useSecretTaps(openAdmin);
  const items = [['transfers', t('transfers')], ['explore', t('navTours')], ['bookings', t('bookings')], ['profile', t('profile')]];
  return (
    <header className="topnav desk-only">
      <div className="topnav-in">
        <button className="brand" onClick={() => { if (!secret()) go('transfers'); }}>
          <img src="icon-192.png" alt={settings.businessName} width="38" height="38" />
          <span>{settings.businessName}</span>
        </button>
        <nav className="topnav-links">
          {items.map(([id, label]) => (
            <a key={id} href={TAB_PATH[id]} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(id); }}>{label}</a>
          ))}
        </nav>
        <LangToggle inline />
        <a className="btn-gold topnav-cta" href={waLink(settings.whatsapp, 'Hola TourRide CR 👋')} target="_blank" rel="noreferrer"><Icon.whatsapp /> WhatsApp</a>
      </div>
    </header>
  );
}

// Pie de página (todas las páginas, en computadora y en celular)
function Footer({ go, nav, withNav, openAdmin }) {
  const { t, settings } = useStore();
  const secret = useSecretTaps(openAdmin);
  const wa = waLink(settings.whatsapp, 'Hola ' + settings.businessName + ' 👋');
  const toFleet = (e) => {
    e.preventDefault();
    go('transfers');
    setTimeout(() => document.getElementById('flota')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };
  const info = (id) => (e) => { e.preventDefault(); nav.push({ name: 'info', id }); };
  const tab = (id) => (e) => { e.preventDefault(); go(id); };
  return (
    <footer className={'site-footer' + (withNav ? ' with-nav' : '')}>
      <div className="sf-in">
        <div className="sf-about">
          <div className="sf-brand"><img src="icon-192.png" alt="" width="40" height="40" /><span>{settings.businessName}</span></div>
          <p>{t('footerAbout')}</p>
          <svg className="sf-route" viewBox="0 0 200 20" aria-hidden="true">
            <circle cx="3" cy="14" r="3" />
            <path d="M8 14 H60 C72 14 74 5 84 5 C94 5 96 14 108 14 H186" />
            <circle cx="194" cy="14" r="3" />
          </svg>
        </div>
        <nav className="sf-col" aria-label={t('footerExplore')}>
          <h4>{t('footerExplore')}</h4>
          <a href={TAB_PATH.transfers} onClick={tab('transfers')}>{t('footerTransfers')}</a>
          <a href="#/" onClick={toFleet}>{t('footerFleet')}</a>
          <a href={TAB_PATH.explore} onClick={tab('explore')}>{t('navTours')}</a>
        </nav>
        <nav className="sf-col" aria-label={t('footerHelp')}>
          <h4>{t('footerHelp')}</h4>
          <a href={TAB_PATH.bookings} onClick={tab('bookings')}>{t('footerMyBooking')}</a>
          <a href={wa} target="_blank" rel="noreferrer">{t('footerContact')}</a>
          <a href="#/info/cancelacion" onClick={info('cancelacion')}>{t('footerCancel')}</a>
          <a href="#/info/privacidad" onClick={info('privacidad')}>{t('footerPrivacy')}</a>
        </nav>
        <div className="sf-col sf-contact">
          <h4>{t('footerContact')}</h4>
          <p>{t('footerContactText')}</p>
          <p className="sf-lines">
            <a href={wa} target="_blank" rel="noreferrer">WhatsApp +{settings.whatsapp}</a>
            {settings.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
            {settings.ictLicense && <span>{t('ictLicense')}: {settings.ictLicense}</span>}
          </p>
          <a className="sf-cta" href={wa} target="_blank" rel="noreferrer">{t('footerWrite')}</a>
        </div>
      </div>
      <div className="sf-bottom">
        <span onClick={secret}>© {new Date().getFullYear()} {settings.businessName}. {t('footerMade')}</span>
        <div className="sf-bottom-links">
          <a href="#/info/privacidad" onClick={info('privacidad')}>{t('footerPrivacy')}</a>
          <a href="#/info/cancelacion" onClick={info('cancelacion')}>{t('footerCancel')}</a>
          <a href="#/admin" onClick={(e) => { e.preventDefault(); openAdmin(); }}>{t('footerBusiness')}</a>
          <LangToggle inline />
        </div>
      </div>
    </footer>
  );
}

// Páginas de información: política de cancelación y privacidad
function InfoPage({ id, nav }) {
  const { t, lang, settings } = useStore();
  const name = settings.businessName;
  const wa = waLink(settings.whatsapp, 'Hola ' + name + ' 👋');
  const cancel = settings.cancelPolicy?.[lang] || settings.cancelPolicy?.es;
  return (
    <div className="pad stack narrow info-page">
      <TopBar title={t(id === 'privacidad' ? 'privacyTitle' : 'policyTitle')} onBack={() => nav.back()} />
      {id === 'cancelacion' ? (
        <div className="card">
          {cancel ? <p>{cancel}</p> : <p>{t('cancelNone')}</p>}
          {settings.depositPct > 0 && <p>{t('depositNote', { n: settings.depositPct })}</p>}
          <p className="muted">{t('cancelHow')}</p>
        </div>
      ) : (
        <div className="card">
          {[1, 2, 3, 4].map((n) => <p key={n}>{t('privacy' + n, { name })}</p>)}
        </div>
      )}
      <a className="btn-outline" href={wa} target="_blank" rel="noreferrer"><Icon.whatsapp /> {t('contactUs')}</a>
    </div>
  );
}

// Botón visible para cambiar entre español e inglés
function LangToggle({ inline }) {
  const { lang, setLang } = useStore();
  return (
    <div className={'lang-toggle' + (inline ? ' inline' : '')} role="group" aria-label="Idioma / Language">
      <button className={lang === 'es' ? 'on' : ''} onClick={() => setLang('es')}>ES</button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}

// Nombre del lugar en el idioma elegido (solo cambia "Aeropuerto")
export function zoneLabel(z, lang) {
  return lang === 'en' && z.startsWith('Aeropuerto ') ? z.replace('Aeropuerto ', '') + ' Airport' : z;
}

function Hero({ scene, photo, title, sub, logo, height = 170 }) {
  return (
    <div className="hero"><Scene scene={scene} photo={photo} height={height} rounded={0}>
      <div className="hero-shade" />
      <LangToggle />
      <div className="hero-text">
        <h1>{logo && <img src="icon-192.png" alt="" className="hero-logo" />}{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </Scene></div>
  );
}

// ---------- precios ----------
export function tourPrices(tour, settings) {
  return settings.highSeason
    ? { adult: tour.highAdult || tour.priceAdult, child: tour.highChild || tour.priceChild }
    : { adult: tour.priceAdult, child: tour.priceChild };
}

// Opciones de transporte que sirven para la ruta y el grupo, de la más barata a la más cara.
// Los vehículos privados solo salen si hay una unidad libre (no en taller, no ocupada a esa hora).
function transferOptions(rate, pax, bags, free) {
  if (!rate) return [];
  return vehicleTypes
    .filter((v) => Number(rate[v.id]) > 0 && v.capacity >= pax && v.luggage >= bags)
    .filter((v) => v.perPerson || free(v.id) > 0)
    // de las busetas/buses privados, el que le queda justo al grupo y dos más grandes
    .filter((v, i, list) => v.perPerson || v.id === 'suv' || list.filter((x) => !x.perPerson && x.id !== 'suv').slice(0, 3).includes(v))
    .map((v) => ({ v, unit: Number(rate[v.id]), total: v.perPerson ? Number(rate[v.id]) * pax : Number(rate[v.id]) }))
    .sort((x, y) => x.total - y.total)
    // el shuttle compartido solo se ofrece si le sale más barato al grupo que un vehículo privado
    .filter((o, _, list) => !o.v.perPerson || !list.some((x) => !x.v.perPerson && x.total <= o.total));
}

// ---------- TRASLADOS ----------
const OTHER = '__other';
const fmtHours = (h, lang) => {
  const m = Math.round(h * 60);
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh ? `${hh} h${mm ? ` ${mm} min` : ''}` : `${mm} min`;
};
// Precio total grande, su equivalente en la otra moneda y la distancia/tiempo de la ruta
function PriceSummary({ total, ri, boat }) {
  const { t, lang, fm, settings } = useStore();
  const other = settings.currency === 'CRC' ? usd(total) : crc(total, settings.exchangeRate);
  const h = ri?.hours ? fmtHours(ri.hours, lang) : '';
  return (
    <div className="price-summary">
      <div className="ps-top">
        <span className="ps-total">{fm(total)}</span>
        <span className="ps-label">{t('totalLabel')}</span>
      </div>
      <div className="ps-fx">≈ {other} · {t('fxNote')}</div>
      {ri && (
        <div className="ps-route">
          {ri.km && !boat ? `${t('routeInfo', { km: ri.km, h })} ${t('routeVaries')}` : t('routeInfoTime', { h })}
        </div>
      )}
    </div>
  );
}
function TransfersTab({ nav }) {
  const store = useStore();
  const { t, lang, rates, settings, places: zones, fm, fm2 } = store;
  const [d, setD] = useState({ from: 'Aeropuerto SJO', to: 'La Fortuna', fromOther: '', toOther: '', date: todayISO(3), time: '10:30', flight: '', notes: '', pax: 4, bags: 4 });
  const set = (k) => (e) => setD({ ...d, [k]: e && e.target ? e.target.value : e });
  const [chosen, setChosen] = useState(null);
  // "Otro lugar": el cliente escribe su propio origen o destino y se cotiza aparte
  const from = d.from === OTHER ? d.fromOther.trim() : d.from;
  const to = d.to === OTHER ? d.toOther.trim() : d.to;
  const rate = findRate(rates, from, to);
  const same = !from || !to || from.toLowerCase() === to.toLowerCase();
  const dayBookings = useDayBookings(d.date);
  const options = transferOptions(rate, d.pax, d.bags, (typeId) => unitsFree(typeId, d.date, d.time, { ...store, bookings: dayBookings }));
  // sin tarifa: se sugiere el vehículo privado más pequeño que le sirve al grupo y el precio queda "por cotizar"
  const quoteVehicle = !rate || options.length === 0 ? vehicleTypes.find((v) => !v.perPerson && v.id !== 'suv' && v.capacity >= d.pax && v.luggage >= d.bags) : null;
  const opt = options.find((o) => o.v.id === chosen) || options[0];
  const vehicle = opt?.v;
  const price = opt?.total ?? null;
  const shuttleTimes = settings.shuttleTimes || [];
  const time = vehicle?.id === 'shuttle' && !shuttleTimes.includes(d.time) ? shuttleTimes[0] : d.time;
  const ri = routeInfo(rate);

  return (
    <>
      <HomeHero nav={nav} onRoute={(from, to) => { setD((x) => ({ ...x, from, to })); setChosen(null); document.getElementById('reservar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />
      <div className="pad transfer-layout">
        <div className="stack">
        <h2 className="form-title" id="reservar">{t('bookRideTitle')}</h2>
        <div className="card list">
          <Row icon={<Icon.plane />} label={t('origin')}>
            <select value={d.from} onChange={set('from')}>{zones.map((z) => <option key={z} value={z}>{zoneLabel(z, lang)}</option>)}<option value={OTHER}>{t('otherPlace')}</option></select>
          </Row>
          {d.from === OTHER && (
            <div className="row other"><input autoFocus placeholder={t('otherPlaceHint')} value={d.fromOther} onChange={set('fromOther')} /></div>
          )}
          <Row icon={<Icon.pin />} label={t('destination')}>
            <select value={d.to} onChange={set('to')}>{zones.map((z) => <option key={z} value={z}>{zoneLabel(z, lang)}</option>)}<option value={OTHER}>{t('otherPlace')}</option></select>
          </Row>
          {d.to === OTHER && (
            <div className="row other"><input autoFocus placeholder={t('otherPlaceHint')} value={d.toOther} onChange={set('toOther')} /></div>
          )}
          <Row icon={<Icon.calendar width="18" height="18" />} label={t('date')}>
            <input type="date" min={todayISO()} value={d.date} onChange={set('date')} />
          </Row>
          <Row icon={<Icon.clock />} label={t('time')}>
            {vehicle?.id === 'shuttle' ? (
              <select value={time} onChange={set('time')}>{shuttleTimes.map((x) => <option key={x} value={x}>{fmtTime(x, lang)}</option>)}</select>
            ) : (
              <input type="time" value={d.time} onChange={set('time')} />
            )}
          </Row>
          <Row icon={<Icon.plane />} label={t('flight')}>
            <input type="text" placeholder="AV 631" value={d.flight} onChange={set('flight')} />
          </Row>
          <Row icon={<span aria-hidden="true">✎</span>} label={t('notes')}>
            <input type="text" maxLength={300} placeholder={t('notesHint')} value={d.notes} onChange={set('notes')} />
          </Row>
        </div>

        <div className="grid2">
          <Counter label={t('passengers')} icon={<Icon.users />} value={d.pax} min={1} max={45} onChange={set('pax')} />
          <Counter label={t('luggage')} icon={<Icon.bag />} value={d.bags} min={0} max={45} onChange={set('bags')} />
        </div>
        <ul className="card perks desk-only">
          <li>💵 {t('perk1')}</li>
          <li>📲 {t('perk2')}</li>
          <li>✅ {t('perk3')}</li>
          {settings.cancelPolicy?.[lang] && <li>🛡️ {settings.cancelPolicy[lang]}</li>}
        </ul>
        </div>
        <div className="stack">

        {same ? null : !rate || options.length === 0 ? (
          quoteVehicle ? (
            <>
              <h3 className="section">{t('chooseRide')}</h3>
              <div className="card vehicle on">
                <div className="vehicle-img">{photos[quoteVehicle.id] ? <img src={photos[quoteVehicle.id]} alt={quoteVehicle.name[lang]} /> : <span>{quoteVehicle.icon}</span>}</div>
                <div className="vehicle-info">
                  <div className="vehicle-name">{quoteVehicle.name[lang]}</div>
                  <div className="gold big">{t('quote')}</div>
                  <div className="muted small">{t('quoteNote')}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="card note">{t('tooMany')}</div>
          )
        ) : options.length === 0 ? (
          <div className="card note">{t('tooMany')}</div>
        ) : (
          <>
            <h3 className="section">{t('chooseRide')}</h3>
            {options.map((o) => (
              <button key={o.v.id} type="button" className={'card vehicle' + (o.v.id === vehicle.id ? ' on' : '')} onClick={() => setChosen(o.v.id)}>
                <div className="vehicle-img">{photos[o.v.id] ? <img src={photos[o.v.id]} alt={o.v.name[lang]} /> : <span>{o.v.icon}</span>}</div>
                <div className="vehicle-info">
                  <div className="vehicle-name">{o.v.name[lang]}</div>
                  <div className="muted small">{o.v.note[lang]}</div>
                  <div className="gold big">{fm(o.total)}</div>
                  {o.v.perPerson && <div className="muted small">{fm(o.unit)} × {d.pax} {t('passengers').toLowerCase()}</div>}
                </div>
                <span className={'radio' + (o.v.id === vehicle.id ? ' on' : '')} />
              </button>
            ))}
          </>
        )}

        {!same && (!rate || options.length === 0) && quoteVehicle && (
          <button className="btn-gold" onClick={() => nav.push({ name: 'bookTransfer', draft: { ...d, from, to, time, vehicleId: quoteVehicle.id, price: 0, quote: true } })}>
            {t('requestQuote')}
          </button>
        )}
        {price != null && vehicle && !same && <PriceSummary total={price} ri={ri} boat={vehicle.id === 'boat'} />}
        {price != null && vehicle && !same ? (
          <button className="btn-gold" onClick={() => nav.push({ name: 'bookTransfer', draft: { ...d, time, vehicleId: vehicle.id, price, unit: opt.unit } })}>
            {t('bookTransfer')} · {fm(price)}
          </button>
        ) : (
          !same && (
            <a className="btn-outline" href={waLink(settings.whatsapp, `Hola, quiero cotizar un traslado ${from} → ${to}, ${d.date} ${d.time}, ${d.pax} pasajeros, ${d.bags} maletas.`)} target="_blank" rel="noreferrer">
              <Icon.whatsapp /> {t('quoteWhatsapp')}
            </a>
          )
        )}
        <div className="ride-when" style={{ height: 8 }} />
        <p className="muted small center ride-when">{fmtDate(d.date, lang)} · {fmtTime(time, lang)}</p>
      </div>
        </div>
      <FleetCatalog />
      <HomeExtras nav={nav} />
    </>
  );
}

// ---------- opiniones ----------
function Stars({ tourId }) {
  const { reviews } = useStore();
  const r = ratingOf(tourId, reviews);
  return r ? <> · ★ {r.avg} <span className="muted">({r.count})</span></> : null;
}

function ReviewItem({ r }) {
  const { t, lang, tours } = useStore();
  const tour = tours.find((x) => x.id === r.tour_id);
  return (
    <div className="review">
      <div className="review-top">
        <span className="gold">{'★'.repeat(r.rating)}<span className="muted">{'★'.repeat(5 - r.rating)}</span></span>
        <strong>{r.name}</strong>
        <span className="muted small">{tour ? tour.name[lang] : t('transfer')}</span>
      </div>
      {r.comment && <p className="review-text">“{r.comment}”</p>}
    </div>
  );
}

// El cliente califica su reserva ya realizada; el dueño la aprueba en el panel antes de publicarla.
function ReviewBox({ b }) {
  const { t, sendReview } = useStore();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    setBusy(true); setErr('');
    try { await sendReview(b, rating, comment.trim()); } catch (e) { setErr(t('sendError')); setBusy(false); }
  };
  return (
    <div className="card form">
      <h3 className="card-title">{t('leaveReview')}</h3>
      <p className="muted small">{t('reviewHint')}</p>
      <div className="star-pick" role="radiogroup" aria-label={t('leaveReview')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n}`}>★</button>
        ))}
      </div>
      <textarea rows="3" maxLength="600" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('reviewPlaceholder')} />
      {err && <p className="error small">{err}</p>}
      <button className="btn-gold" disabled={busy} onClick={send}>{busy ? t('sending') : t('sendReview')}</button>
    </div>
  );
}

// Página a la que llega el cliente desde el enlace de WhatsApp (#/opinar/TR-12345) para dejar su opinión.
function ReviewPage({ code, nav }) {
  const { t, lang, bookings, profile, sendReview, settings } = useStore();
  const local = bookings.find((x) => x.code === code);
  const [phone, setPhone] = useState(local?.customer.phone || profile?.phone || '');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(!!local?.reviewed);
  const send = async () => {
    if (phone.replace(/\D/g, '').length < 8) { setErr(t('reviewFail')); return; }
    setBusy(true); setErr('');
    try {
      if (local && local.customer.phone.replace(/\D/g, '').slice(-8) === phone.replace(/\D/g, '').slice(-8)) await sendReview(local, rating, comment.trim());
      else await cloud.submitReview(code, phone, rating, comment.trim(), lang);
      setDone(true);
    } catch (e) {
      setErr(/realizada|válida/i.test(e.message || '') ? t('reviewFail') : t('sendError'));
    }
    setBusy(false);
  };
  const wa = waLink(settings.whatsapp, (lang === 'en' ? 'Hi, about my booking ' : 'Hola, sobre mi reserva ') + code);
  return (
    <div className="pad stack narrow review-page">
      <button className="round" onClick={() => nav.reset('transfers')} aria-label={t('close')}>✕</button>
      <div className="center">
        <img src="icon-192.png" alt="" width="64" height="64" className="review-logo" />
        <h1>{t('reviewPageTitle')}</h1>
        <p className="muted">{t('reviewPageSub').replace('{code}', code)}</p>
      </div>
      {done ? (
        <div className="card center stack">
          <div className="big-check"><Icon.check width="34" height="34" /></div>
          <p className="ok">{t('reviewThanks')}</p>
          <button className="btn-gold" onClick={() => nav.reset('transfers')}>{t('goHome')}</button>
        </div>
      ) : (
        <div className="card form">
          <Field label={t('phone')}>
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+506 8888 8888" />
          </Field>
          <div className="star-pick" role="radiogroup" aria-label={t('leaveReview')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n}`}>★</button>
            ))}
          </div>
          <textarea rows="4" maxLength="600" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('reviewPlaceholder')} />
          {err && <p className="error small">{err} {err === t('reviewFail') && <a href={wa} target="_blank" rel="noreferrer">WhatsApp ↗</a>}</p>}
          <button className="btn-gold" disabled={busy} onClick={send}>{busy ? t('sending') : t('sendReview')}</button>
        </div>
      )}
    </div>
  );
}

function Testimonials() {
  const { t, reviews } = useStore();
  const list = reviews.filter((r) => r.rating >= 4 && r.comment).slice(0, 3);
  if (!list.length) return null;
  return (
    <>
      <div className="section-head"><h2>{t('whatTheySay')}</h2></div>
      <div className="testimonials">
        {list.map((r) => <div key={r.id} className="card"><ReviewItem r={r} /></div>)}
      </div>
    </>
  );
}

// Fotos de la portada: van cambiando solas cada 6 segundos (se pueden reemplazar en public/img)
// Cada foto muestra una ruta frecuente y el tiempo aproximado; al tocarla se llena el formulario con esa ruta.
const heroSlides = [
  { src: 'img/beach.jpg', from: 'Aeropuerto SJO', to: 'Manuel Antonio', hours: '3' },
  { src: 'img/volcano.jpg', from: 'Aeropuerto SJO', to: 'La Fortuna', hours: '3' },
  { src: 'img/waterfall.jpg', from: 'Aeropuerto LIR', to: 'Río Celeste', hours: '1.5' },
  { src: 'img/bridges.jpg', from: 'Aeropuerto SJO', to: 'Monteverde', hours: '3.5' },
];
const shortPlace = (z) => z.replace(/^Aeropuerto\s+/, '');

// Sobre la foto de cada tour: tipo de tour, lugar y duración aproximada (mismo estilo que las rutas de la portada).
// Tarjeta de tour: foto con etiqueta, nombre, resumen corto, precio "desde" y botón de detalle
function TourCard({ tour, nav, height = 170 }) {
  const { t, lang, settings, fm } = useStore();
  const p = tourPrices(tour, settings);
  const desc = String(tour.desc?.[lang] || tour.desc?.es || '').trim();
  return (
    <button className="tour-card" onClick={() => nav.push({ name: 'tour', id: tour.id })}>
      <Scene scene={tour.scene} photo={'tour-' + tour.id} alt={tour.name[lang]} height={height} rounded={0}><TourTag tour={tour} /></Scene>
      <div className="tour-card-body">
        <div className="tour-card-title">{tour.name[lang]}</div>
        {desc && <p className="tour-card-desc">{desc}</p>}
        <div className="tour-card-foot">
          <div>
            <div className="tc-from">{t('from')}</div>
            <div className="tc-price">{fm(p.adult)}</div>
            <div className="tc-per">{t('perAdult')}<Stars tourId={tour.id} /></div>
          </div>
          <span className="tc-more">{t('seeDetail')} <span aria-hidden="true">→</span></span>
        </div>
      </div>
    </button>
  );
}

function TourTag({ tour, big }) {
  const { t, lang } = useStore();
  const h = String(tour.duration ?? '');
  return (
    <div className={'photo-tag' + (big ? ' big' : '')}>
      <span className="photo-tag-text">
        <span className="route-kicker">{t(tour.category) || t('tour')}</span>
        <span className="route-name">{tour.location}</span>
      </span>
      {h && <span className="route-time">{t('approxHours', { n: lang === 'en' ? h : h.replace('.', ',') })}</span>}
    </div>
  );
}

// Enlace para compartir un tour: abre una página con la foto y el nombre del tour (la crea scripts/share-pages.mjs al publicar),
// así en WhatsApp o Facebook sale la tarjeta con foto. En el celular usa el menú de compartir del teléfono.
export function tourShareUrl(id, lang) {
  const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
  return `${base}${lang === 'en' ? 'en/' : ''}tour/${id}/`;
}
function ShareTour({ tour, className, label }) {
  const { t, lang } = useStore();
  const share = async () => {
    const url = tourShareUrl(tour.id, lang);
    const title = tour.name[lang];
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    window.open(waLink('', `${title}\n${url}`), '_blank', 'noopener');
  };
  return (
    <button type="button" className={className} onClick={share} aria-label={t('shareTour')}>
      <ShareIcon />{label && <span>{t('shareTour')}</span>}
    </button>
  );
}
const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);

// Portada de Tours: fotos de tours que van cambiando solas (como la portada principal)
const tourSlides = ['img/explore.jpg', 'img/zipline.jpg', 'img/sloth.jpg', 'img/kayak.jpg', 'img/river.jpg'];
function ExploreHero() {
  const { t } = useStore();
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlide((n) => (n + 1) % tourSlides.length), 6000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hero explore-hero"><div className="scene" style={{ height: 170, borderRadius: 0 }}>
      {tourSlides.map((src, i) => (
        <img key={src} src={src} alt="" className={'hero-slide' + (i === slide ? ' on' : '')} loading={i ? 'lazy' : 'eager'} />
      ))}
      <div className="hero-shade" />
      <div className="hero-dots">
        {tourSlides.map((src, i) => <button key={src} className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} aria-label={`${i + 1}`} />)}
      </div>
      <LangToggle />
      <div className="hero-text">
        <h1>{t('explore')}</h1>
        <p>{t('exploreSub')}</p>
      </div>
    </div></div>
  );
}

// Portada: qué ofrecemos en 5 segundos + dos botones principales
function HomeHero({ nav, onRoute }) {
  const { t, lang, settings, places } = useStore();
  const secret = useSecretTaps(() => nav.push({ name: 'admin' }));
  const toForm = () => document.getElementById('reservar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const [slide, setSlide] = useState(0);
  // Cambia aunque el aparato tenga "reducir animaciones" (en ese caso sin el acercamiento, ver styles.css)
  useEffect(() => {
    const id = setInterval(() => setSlide((n) => (n + 1) % heroSlides.length), 6000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hero home-hero"><div className="scene" style={{ height: 360, borderRadius: 0 }}>
      {heroSlides.map(({ src }, i) => (
        <img key={src} src={src} alt={i === 0 ? t('heroAlt') : ''} className={'hero-slide' + (i === slide ? ' on' : '')} loading={i ? 'lazy' : 'eager'} />
      ))}
      <div className="hero-shade" />
      <div className="hero-dots">
        {heroSlides.map(({ src }, i) => <button key={src} className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} aria-label={`${i + 1}`} />)}
      </div>
      {heroSlides.map((r, i) => {
        const bookable = (places || []).includes(r.from) && (places || []).includes(r.to);
        const label = (
          <>
            <span className="route-kicker">{t('popularRoute')}</span>
            <span className="route-name">{shortPlace(r.from)} → {r.to}</span>
            <span className="route-time">{t('approxHours', { n: lang === 'en' ? r.hours : r.hours.replace('.', ',') })}</span>
          </>
        );
        const cls = 'hero-route' + (i === slide ? ' on' : '');
        return bookable && onRoute
          ? <button key={r.src} type="button" className={cls} aria-hidden={i !== slide} tabIndex={i === slide ? 0 : -1} onClick={() => onRoute(r.from, r.to)}>{label}</button>
          : <div key={r.src} className={cls} aria-hidden={i !== slide}>{label}</div>;
      })}
      <div className="hero-brand mobile-only" onClick={secret}><img src="icon-192.png" alt={settings.businessName} width="34" height="34" /><span>{settings.businessName}</span></div>
      <LangToggle />
      <div className="hero-text">
        <div className="kicker">{t('heroKicker')}</div>
        <h1>{t('heroTitle')}</h1>
        <p>{t('heroSub')}</p>
        <div className="hero-actions">
          <button className="btn-gold" onClick={toForm}><Icon.car width="18" height="18" /> {t('bookRide')}</button>
          <button className="btn-ghost" onClick={() => nav.reset('explore')}><Icon.compass width="18" height="18" /> {t('exploreTours')}</button>
        </div>
      </div>
    </div></div>
  );
}

// Catálogo de vehículos: capacidad, maletas, aire acondicionado y precio desde
function FleetCatalog() {
  const { t, lang, rates } = useStore();
  // solo los tipos de vehículo que tienen al menos una ruta con tarifa
  const list = vehicleTypes.filter((v) => rates.some((r) => Number(r[v.id]) > 0)).map((v) => ({ v }));
  if (!list.length) return null;
  return (
    <div className="pad fleet-catalog" id="flota">
      <div className="section-head"><h2>{t('ourFleet')}</h2></div>
      <p className="muted small fleet-sub">{t('ourFleetSub')}</p>
      <div className="fleet-grid">
        {list.map(({ v }) => (
          <div key={v.id} className="card fleet-card">
            <div className="fleet-img">{photos[v.id] ? <img src={photos[v.id]} alt={v.name[lang]} loading="lazy" /> : <span>{v.icon}</span>}</div>
            <div className="fleet-body">
              <div className="fleet-name">{v.name[lang]}</div>
              <div className="fleet-specs">
                <div><span className="muted small">{t('passengers')}</span><strong>{v.capacity}</strong></div>
                <div><span className="muted small">{t('luggage')}</span><strong>{v.luggage}</strong></div>
              </div>
              <div className="fleet-feat">{v.note[lang]} · {v.id === 'boat' ? t('lifeJackets') : t('acFull')}</div>
              {v.bestFor && <div className="muted small fleet-best">{v.bestFor[lang]}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Portada en computadora: por qué elegirnos + tours destacados
function HomeExtras({ nav }) {
  const { t, lang, tours, partners, settings, fm } = useStore();
  const featured = tours.filter((x) => x.active && x.featured && partners.some((p) => p.id === x.partnerId && p.active !== false)).slice(0, 3);
  return (
    <div className="pad home-extras">
      <div className="why">
        {[['🚐', 'why1'], ['🗣️', 'why2'], ['📲', 'why3']].map(([ic, k]) => (
          <div key={k} className="why-item">
            <span className="why-icon">{ic}</span>
            <div><div className="bold">{t(k)}</div><div className="muted small">{t(k + 'Sub')}</div></div>
          </div>
        ))}
      </div>
      {featured.length > 0 && (
        <>
          <div className="section-head">
            <h2>{t('popularTours')}</h2>
            <button className="link-gold" onClick={() => nav.reset('explore')}>{t('seeAll')} →</button>
          </div>
          <div className="tour-grid">
            {featured.map((tour) => <TourCard key={tour.id} tour={tour} nav={nav} height={190} />)}
          </div>
        </>
      )}
      <Testimonials />
    </div>
  );
}

function Row({ icon, label, children }) {
  return (
    <label className="row">
      <span className="row-icon">{icon}</span>
      <span className="row-label">{label}</span>
      <span className="row-input">{children}</span>
    </label>
  );
}

// ---------- datos del cliente + pago (compartido) ----------
function CustomerAndPayment({ c, setC, pay, setPay }) {
  const { t, settings } = useStore();
  const up = (k) => (e) => setC({ ...c, [k]: e.target.value });
  return (
    <>
      <h3 className="section">{t('yourData')}</h3>
      <div className="card form">
        <Field label={t('name')}><input value={c.name} onChange={up('name')} autoComplete="name" /></Field>
        <Field label={t('phone')}><input value={c.phone} onChange={up('phone')} inputMode="tel" placeholder="+506 8888 8888" autoComplete="tel" /></Field>
        <Field label={t('email')}><input value={c.email} onChange={up('email')} inputMode="email" autoComplete="email" /></Field>
      </div>
      <h3 className="section">{t('payment')}</h3>
      <div className="chips">
        {[['sinpe', t('paySinpe')], ['cash', t('payCash')]].map(([id, label]) => (
          <button key={id} type="button" className={'chip' + (pay === id ? ' on' : '')} onClick={() => setPay(id)}>{label}</button>
        ))}
        <button type="button" className="chip" disabled>{t('payCard')}</button>
      </div>
      {pay === 'sinpe' && <p className="muted small">{t('sinpeInfo', { n: settings.whatsapp })}</p>}
    </>
  );
}

function missing(t, fields) {
  const m = fields.filter(([, v]) => !String(v || '').trim()).map(([k]) => t(k));
  return m.length ? t('required', { f: m.join(', ') }) : '';
}

// ---------- reservar traslado ----------
function BookTransfer({ draft, nav }) {
  const { t, lang, settings, profile, setProfile, submitBooking, fm, fm2 } = useStore();
  const [sending, setSending] = useState(false);
  const deposit = draft.quote ? 0 : Math.round((draft.price * (settings.depositPct || 0)) / 100);
  const [c, setC] = useState(profile);
  const [pay, setPay] = useState('sinpe');
  const [err, setErr] = useState('');
  const vehicle = vehicleTypes.find((v) => v.id === draft.vehicleId);

  const confirm = async () => {
    const m = missing(t, [['nameField', c.name], ['phoneField', c.phone]]);
    if (m) return setErr(m);
    setProfile(c);
    const b = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      code: newCode(), type: 'transfer', createdAt: new Date().toISOString(), status: draft.quote ? 'quote' : 'pending', payment: pay,
      customer: c, from: draft.from, to: draft.to, date: draft.date, time: draft.time, flight: draft.flight, notes: String(draft.notes || '').trim().slice(0, 300),
      pax: draft.pax, bags: draft.bags, vehicleId: draft.vehicleId, total: draft.price || 0, deposit, commission: 0,
    };
    await send(b, submitBooking, setSending, setErr, t, nav);
  };

  return (
    <div className="pad stack narrow">
      <TopBar title={t('bookTransfer')} onBack={nav.back} />
      <div className="card list">
        <Info icon={<Icon.plane />} text={`${zoneLabel(draft.from, lang)} → ${zoneLabel(draft.to, lang)}`} />
        <Info icon={<Icon.calendar width="18" height="18" />} text={`${fmtDate(draft.date, lang)} · ${fmtTime(draft.time, lang)}`} />
        {draft.flight && <Info icon={<Icon.plane />} text={`${t('flight').split(' (')[0]} ${draft.flight}`} />}
        {String(draft.notes || '').trim() && <Info icon={<span aria-hidden="true">✎</span>} text={draft.notes.trim()} />}
        <Info icon={<Icon.car width="18" height="18" />} text={`${vehicle.name[lang]} · ${draft.pax} ${t('passengers').toLowerCase()} · ${draft.bags} ${t('luggage').toLowerCase()}`} />
      </div>
      <CustomerAndPayment c={c} setC={setC} pay={pay} setPay={setPay} />
      <div className="card totals">
        {vehicle.perPerson && <div className="tot-row"><span>{fm(draft.unit)} × {draft.pax}</span><span>{fm(draft.price)}</span></div>}
        {draft.quote
          ? <div className="tot-row big"><span>{t('total')}</span><span className="gold">{t('quote')}</span></div>
          : <div className="tot-row big"><span>{t('total')}</span><span className="gold">{fm2(draft.price)}</span></div>}
        {deposit > 0 && <div className="tot-row"><span>{t('depositNow', { n: settings.depositPct })}</span><span className="gold">{fm(deposit)}</span></div>}
      </div>
      {draft.quote && <p className="muted small">{t('quoteNote')}</p>}
      <Policy />
      {err && <p className="error">{err}</p>}
      <button className="btn-gold" disabled={sending} onClick={confirm}>{sending ? t('sending') : draft.quote ? t('requestQuote') : t('confirm')}</button>
    </div>
  );
}

// Manda la reserva a la nube; si no hay señal, avisa y deja los datos para intentar de nuevo.
async function send(b, submitBooking, setSending, setErr, t, nav) {
  setSending(true);
  setErr('');
  try {
    const saved = await submitBooking(b);
    nav.reset();
    nav.push({ name: 'booking', id: saved.id });
  } catch (e) {
    const msg = String(e.message || '');
    setErr(/cupos/i.test(msg) ? t('noSeats') : /no válid|no disponible/i.test(msg) ? t('checkData') : t('sendError'));
    setSending(false);
  }
}

function TopBar({ title, onBack }) {
  const { t } = useStore();
  return (
    <div className="topbar">
      <button className="round" onClick={onBack} aria-label={t('back')}><Icon.back /></button>
      <h2>{title}</h2>
    </div>
  );
}

function Info({ icon, text, strong }) {
  return (
    <div className="info">
      <span className="row-icon">{icon}</span>
      <span>{text}</span>
      {strong && <strong className="gold" style={{ marginLeft: 'auto' }}>{strong}</strong>}
    </div>
  );
}

// ---------- EXPLORAR ----------
const categories = ['adventure', 'water', 'nature', 'culture'];
const catIcon = { adventure: '🧗', water: '🌊', nature: '🍃', culture: '🏛️' };

function ExploreTab({ nav }) {
  const { t, lang, tours, settings, partners, fm } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const list = tours.filter((x) => x.active && partners.some((p) => p.id === x.partnerId && p.active !== false))
    .filter((x) => !cat || x.category === cat)
    .filter((x) => {
      const s = q.trim().toLowerCase();
      if (!s) return true;
      return (x.name.es + ' ' + x.name.en + ' ' + x.location).toLowerCase().includes(s);
    })
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  return (
    <>
      <ExploreHero />
      <div className="pad stack">
        <div className="search">
          <Icon.search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} />
        </div>
        <div className="grid2 cats">
          {categories.map((c) => (
            <button key={c} className={'cat card' + (cat === c ? ' on' : '')} onClick={() => setCat(cat === c ? null : c)}>
              <span className="cat-icon">{catIcon[c]}</span>{t(c)}
            </button>
          ))}
        </div>
        {list.length === 0 && <p className="muted center">{t('noTours')}</p>}
        <div className="tour-grid">
        {list.map((tour) => <TourCard key={tour.id} tour={tour} nav={nav} />)}
        </div>
      </div>
    </>
  );
}

// ---------- DETALLE DEL TOUR ----------
function TourDetail({ id, nav }) {
  const { t, lang, tours, partners, settings, fm, reviews } = useStore();
  const tour = tours.find((x) => x.id === id);
  if (!tour) return <div className="pad"><TopBar title="" onBack={nav.back} /></div>;
  const partner = partners.find((p) => p.id === tour.partnerId);
  const p = tourPrices(tour, settings);
  const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(tour.location + ', Costa Rica');
  const rating = ratingOf(tour.id, reviews);

  return (
    <>
      <Scene scene={tour.scene} photo={'tour-' + tour.id} alt={tour.name[lang]} height={260} rounded={0} className="detail-hero">
        <div className="hero-shade" />
        <button className="round floating" onClick={nav.back} aria-label={t('back')}><Icon.back /></button>
        <ShareTour tour={tour} className="round floating share-float mobile-only" />
        <TourTag tour={tour} big />
      </Scene>
      <div className="pad detail-layout">
      <div className="stack detail">
        <h1 className="detail-title">{tour.name[lang]}</h1>
        <div className="chips">
          <span className="chip static"><Icon.clock /> {tour.duration} {t('hours')}</span>
          <span className="chip static"><Icon.leaf /> {t(tour.difficulty)}</span>
          <span className="chip static"><Icon.users /> {t('fromAge', { n: tour.minAge })}</span>
          {rating && <span className="chip static">★ {rating.avg} ({t(rating.count === 1 ? 'reviewsOne' : 'reviewsCount', { n: rating.count })})</span>}
        </div>
        {partner && <p className="small">{t('partner')}: <strong>{partner.name}</strong></p>}
        <p className="muted">{tour.desc[lang]}</p>

        <div className="card list">
          <h3 className="card-title">{t('includes')}</h3>
          {tour.includes[lang].map((x) => <Info key={x} icon={<Icon.check />} text={x} />)}
        </div>
        <div className="card list">
          <h3 className="card-title">{t('bring')}</h3>
          {tour.bring[lang].map((x) => <Info key={x} icon={<Icon.bag />} text={x} />)}
        </div>
        {rating && (
          <div className="card list">
            <h3 className="card-title">{t('reviewsTitle')} · ★ {rating.avg}</h3>
            {rating.list.slice(0, 6).map((r) => <ReviewItem key={r.id} r={r} />)}
          </div>
        )}
        <a className="card map" href={map} target="_blank" rel="noreferrer">
          <Scene scene="coffee" noPhoto height={110} rounded={12}>
            <div className="map-pin"><Icon.pin width="28" height="28" /><span>{tour.location}</span></div>
          </Scene>
          <span className="small gold">{t('openMap')} ↗</span>
        </a>
        <div className="mobile-only" style={{ height: 70 }} />
      </div>
      <aside className="detail-aside desk-only">
        <div className="card">
          <div className="muted small">{t('from')}</div>
          <div className="aside-price">{fm(p.adult)} <small className="muted">/ {t('adult')}</small></div>
          <div className="muted small">{fm(p.child)} / {t('child')}</div>
          <div className="aside-facts small muted">
            <div><Icon.clock /> {tour.duration} {t('hours')}</div>
            <div><Icon.pin /> {tour.location}</div>
          </div>
          <button className="btn-gold" onClick={() => nav.push({ name: 'bookTour', id: tour.id })}>{t('bookTour')}</button>
          <a className="btn-outline" href={waLink(settings.whatsapp, `Hola, tengo una consulta sobre el tour ${tour.name.es}.`)} target="_blank" rel="noreferrer"><Icon.whatsapp /> {t('contactUs')}</a>
          <ShareTour tour={tour} className="btn-outline share-link" label />
        </div>
      </aside>
      </div>
      <div className="sticky-cta mobile-only">
        <button className="btn-gold" onClick={() => nav.push({ name: 'bookTour', id: tour.id })}>
          {t('bookTour')} · {fm(p.adult)} {t('adult')} / {fm(p.child)} {t('child')}
        </button>
      </div>
    </>
  );
}

// ---------- RESERVAR TOUR ----------
function BookTour({ id, init = {}, nav }) {
  const { t, lang, tours, settings, profile, setProfile, submitBooking, fm, fm2 } = useStore();
  const tour = tours.find((x) => x.id === id);
  const [sending, setSending] = useState(false);
  const prices = tourPrices(tour, settings);
  const [date, setDate] = useState(init.date || todayISO(1));
  const [time, setTime] = useState(tour.schedules.includes(init.time) ? init.time : tour.schedules[0]);
  const [adults, setAdults] = useState(init.adults || 2);
  const [kids, setKids] = useState(init.kids || 0);
  const [pickup, setPickup] = useState(!!init.pickup);
  const [hotel, setHotel] = useState('');
  const [notes, setNotes] = useState(init.notes || '');
  const [c, setC] = useState(profile);
  const [pay, setPay] = useState('sinpe');
  const [coupon, setCoupon] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [couponMsg, setCouponMsg] = useState('');
  const [err, setErr] = useState('');

  const dayBookings = useDayBookings(date);
  const seatsLeft = (tm) => {
    const used = dayBookings
      .filter((b) => b.type === 'tour' && b.tourId === tour.id && b.date === date && b.time === tm && b.status !== 'cancelled')
      .reduce((s, b) => s + b.adults + b.kids, 0);
    return Math.max(0, tour.capacity - used);
  };
  const people = adults + kids;
  const left = seatsLeft(time);

  const tourAmount = adults * prices.adult + kids * prices.child;
  const discount = Math.round((tourAmount * discountPct) / 100);
  const pickupAmount = pickup ? people * settings.hotelPickupPerPerson : 0;
  const total = tourAmount - discount + pickupAmount;
  const deposit = Math.round((total * (settings.depositPct || 0)) / 100);

  const applyCoupon = () => {
    const pct = settings.coupons[coupon.trim().toUpperCase()];
    if (pct) { setDiscountPct(pct); setCouponMsg(t('couponOk', { n: pct })); }
    else { setDiscountPct(0); setCouponMsg(t('couponBad')); }
  };

  const confirm = async () => {
    const fields = [['dateField', date], ['nameField', c.name], ['phoneField', c.phone]];
    if (pickup) fields.push(['hotelField', hotel]);
    const m = missing(t, fields);
    if (m) return setErr(m);
    if (people > left) return setErr(t('seats', { n: left }));
    setProfile(c);
    const b = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      code: newCode(), type: 'tour', createdAt: new Date().toISOString(), status: 'pending', payment: pay,
      customer: c, tourId: tour.id, tourName: tour.name, partnerId: tour.partnerId, location: tour.location,
      date, time, adults, kids, pickup, hotel: pickup ? hotel : '', notes: notes.trim().slice(0, 300), coupon: discountPct ? coupon.toUpperCase() : '',
      tourAmount, discount, pickupAmount, total, deposit, commission: 0, // la comisión la calcula el panel
    };
    await send(b, submitBooking, setSending, setErr, t, nav);
  };

  return (
    <div className="pad stack narrow">
      <TopBar title={tour.name[lang]} onBack={nav.back} />
      <h3 className="section">{t('date')}</h3>
      <div className="card form">
        <input type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <h3 className="section">{t('schedule')}</h3>
      <div className="chips">
        {tour.schedules.map((s) => {
          const l = seatsLeft(s);
          return (
            <button key={s} type="button" disabled={l === 0} className={'chip' + (time === s ? ' on' : '')} onClick={() => setTime(s)}>
              {fmtTime(s, lang)} <small>· {l === 0 ? t('full') : l}</small>
            </button>
          );
        })}
      </div>
      <p className="muted small">{t('seats', { n: left })}</p>
      <div className="grid2">
        <Counter label={`${t('adults')} · ${fm(prices.adult)}`} value={adults} min={1} max={20} onChange={setAdults} />
        <Counter label={`${t('children')} · ${fm(prices.child)}`} value={kids} min={0} max={20} onChange={setKids} />
      </div>
      <label className="card toggle">
        <input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} />
        <span>{t('pickup')} <small className="muted">({t('pickupNote', { n: settings.hotelPickupPerPerson })})</small></span>
      </label>
      {pickup && (
        <div className="card form"><Field label={t('hotel')}><input value={hotel} onChange={(e) => setHotel(e.target.value)} /></Field></div>
      )}
      <div className="card form"><Field label={t('notes')}><input maxLength={300} placeholder={t('notesHint')} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      <CustomerAndPayment c={c} setC={setC} pay={pay} setPay={setPay} />
      <h3 className="section">{t('coupon')}</h3>
      <div className="coupon">
        <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="TOUR10" />
        <button type="button" className="btn-outline small-btn" onClick={applyCoupon}>{t('apply')}</button>
      </div>
      {couponMsg && <p className={discountPct ? 'ok small' : 'error small'}>{couponMsg}</p>}
      <div className="card totals">
        <div className="tot-row"><span>{t('subtotal')}</span><span>{fm(tourAmount)}</span></div>
        {discount > 0 && <div className="tot-row"><span>{t('discount')}</span><span>−{fm(discount)}</span></div>}
        {pickupAmount > 0 && <div className="tot-row"><span>{t('pickup')}</span><span>{fm(pickupAmount)}</span></div>}
        <div className="tot-row big"><span>{t('total')}</span><span className="gold">{fm2(total)}</span></div>
        {deposit > 0 && <div className="tot-row"><span>{t('depositNow', { n: settings.depositPct })}</span><span className="gold">{fm(deposit)}</span></div>}
      </div>
      <Policy />
      {err && <p className="error">{err}</p>}
      <button className="btn-gold" disabled={sending} onClick={confirm}>{sending ? t('sending') : t('confirm')}</button>
    </div>
  );
}

// ---------- RESERVA CONFIRMADA ----------
export function money(b, t, fm) {
  return b.status === 'quote' ? t('quote') : fm(b.total);
}

// Política de cancelación y depósito que ve el cliente antes de confirmar
function Policy() {
  const { t, lang, settings } = useStore();
  const text = settings.cancelPolicy?.[lang] || settings.cancelPolicy?.es;
  if (!text && !settings.depositPct) return null;
  return (
    <div className="card note small">
      <strong>{t('policyTitle')}</strong>
      {text && <p style={{ margin: '4px 0 0' }}>{text}</p>}
      {settings.depositPct > 0 && <p style={{ margin: '4px 0 0' }}>{t('depositNote', { n: settings.depositPct })}</p>}
    </div>
  );
}

export function bookingTitle(b, lang) {
  return b.type === 'tour' ? b.tourName[lang] : `${zoneLabel(b.from, lang)} → ${zoneLabel(b.to, lang)}`;
}

function bookingText(b, t, lang, fm2) {
  const lines = [
    `TourRide CR · ${b.code}`,
    b.type === 'tour' ? `${t('tour')}: ${b.tourName[lang]} (${b.location})` : `${t('transfer')}: ${zoneLabel(b.from, lang)} → ${zoneLabel(b.to, lang)}`,
    `${fmtDate(b.date, lang)} · ${fmtTime(b.time, lang)}`,
    b.type === 'tour' ? `${b.adults} ${t('adults').toLowerCase()}, ${b.kids} ${t('children').toLowerCase()}` : `${b.pax} ${t('passengers').toLowerCase()}`,
    b.hotel ? `${t('hotel')}: ${b.hotel}` : '',
    b.flight ? `${t('flight').split(' (')[0]}: ${b.flight}` : '',
    b.notes ? `${t('notesShort')}: ${b.notes}` : '',
    b.status === 'quote' ? `${t('total')}: ${t('quote')}` : `${t('total')}: ${fm2(b.total)}`,
    `${t('status')}: ${t(b.status)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

function BookingDone({ id, nav }) {
  const { t, lang, bookings, settings, cancelMine, refreshMyBookings, fm, fm2 } = useStore();
  const [ask, setAsk] = useState(false);
  const [cancelErr, setCancelErr] = useState('');
  useEffect(() => { refreshMyBookings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const b = bookings.find((x) => x.id === id);
  if (!b) return null;
  const doCancel = async () => {
    try { await cancelMine(b); setAsk(false); } catch (e) { setCancelErr(t('sendError')); }
  };
  const vehicle = vehicleTypes.find((v) => v.id === b.vehicleId);
  const qrValue = `TOURRIDE|${b.code}|${b.type}|${b.date}|${b.time}|${b.customer.name}`;
  const text = bookingText(b, t, lang, fm2);

  return (
    <div className="pad stack done narrow">
      <button className="round" onClick={() => nav.reset()} aria-label={t('close')}>✕</button>
      <div className="center">
        <div className="big-check"><Icon.check width="34" height="34" /></div>
        <h1>{t('ready')}</h1>
        <div className="gold code">{b.code}</div>
      </div>
      <div className="qr-box"><QR value={qrValue} size={190} /></div>
      <p className="muted small center">{t('showQr')}</p>
      <div className="card list">
        <Info icon={b.type === 'tour' ? <Icon.compass width="18" height="18" /> : <Icon.plane />} text={bookingTitle(b, lang)} />
        <Info icon={<Icon.calendar width="18" height="18" />} text={`${fmtDate(b.date, lang)} · ${fmtTime(b.time, lang)}`} />
        {b.type === 'tour'
          ? <Info icon={<Icon.users />} text={`${b.adults} ${t('adults').toLowerCase()} · ${b.kids} ${t('children').toLowerCase()}`} strong={money(b, t, fm)} />
          : <Info icon={<Icon.car width="18" height="18" />} text={`${vehicle?.name[lang]} · ${b.pax} ${t('passengers').toLowerCase()}`} strong={money(b, t, fm)} />}
        {b.notes && <Info icon={<span aria-hidden="true">✎</span>} text={b.notes} />}
        <div className="info"><span className="row-icon">●</span><span>{t('status')}: <strong className={'st-' + b.status}>{t(b.status)}</strong></span></div>
      </div>
      {b.status === 'quote' && <p className="muted small">{t('quoteNote')}</p>}
      {b.status !== 'cancelled' && b.status !== 'completed' && <ToursNear b={b} nav={nav} />}
      {b.cloud && !b.reviewed && (b.status === 'completed' || (b.status === 'paid' && b.date <= todayISO())) && <ReviewBox b={b} />}
      {b.reviewed && <p className="ok small center">{t('reviewThanks')}</p>}
      {b.status === 'pending' && b.deposit > 0 && <p className="muted small">{t('depositNote', { n: settings.depositPct })} {t('depositNow', { n: settings.depositPct })}: <strong className="gold">{fm(b.deposit)}</strong></p>}
      {b.status === 'pending' && b.payment === 'sinpe' && (b.cloud ? <ReceiptBox b={b} /> : <p className="muted small">{t('sinpeInfo', { n: settings.whatsapp })}</p>)}
      <a className="btn-gold" href={waLink(settings.whatsapp, text)} target="_blank" rel="noreferrer"><Icon.whatsapp /> {t('shareWhatsapp')}</a>
      <button className="btn-outline" onClick={() => nav.reset('bookings')}>{t('seeBookings')}</button>
      {(b.status === 'pending' || b.status === 'quote') && <button className="link danger" onClick={() => setAsk(true)}>{t('cancel')}</button>}
      {ask && (
        <Modal onClose={() => setAsk(false)}>
          <p>{t('cancelAsk')}</p>
          <div className="grid2">
            <button className="btn-outline" onClick={() => setAsk(false)}>{t('no')}</button>
            <button className="btn-gold danger-bg" onClick={doCancel}>{t('yes')}</button>
          </div>
          {cancelErr && <p className="error small">{cancelErr}</p>}
        </Modal>
      )}
    </div>
  );
}

// El cliente sube la foto del comprobante de SINPE; el dueño la aprueba en el panel.
function ReceiptBox({ b }) {
  const { t, settings, sendReceipt } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (b.receipt) return <div className="card note ok-note">🧾 {t('receiptDone')}</div>;
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setErr('');
    try { await sendReceipt(b, file); } catch (x) { setErr(t('receiptError')); }
    setBusy(false);
  };
  return (
    <div className="card receipt-box">
      <div className="bold">🧾 {t('receiptTitle')}</div>
      <p className="muted small">{t('sinpeInfo2', { n: settings.whatsapp })}</p>
      <label className={'btn-gold small-btn' + (busy ? ' disabled' : '')}>
        {busy ? t('sending') : t('receiptBtn')}
        <input type="file" accept="image/*,application/pdf" hidden disabled={busy} onChange={pick} />
      </label>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

// Tours en el destino del traslado (o en el origen), para ofrecerlos después de reservar.
const normPlace = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function toursNear(places, tours, partners) {
  const ps = places.map(normPlace).filter(Boolean);
  return tours.filter((tour) => {
    if (!tour.active || !partners.some((p) => p.id === tour.partnerId && p.active !== false)) return false;
    const loc = normPlace(tour.location);
    return loc && ps.some((p) => p.includes(loc) || loc.includes(p));
  });
}

function ToursNear({ b, nav }) {
  const { t, lang, tours, partners, settings, fm } = useStore();
  if (b.type !== 'transfer') return null;
  const near = toursNear([b.to], tours, partners).slice(0, 3);
  const list = near.length ? near : toursNear([b.from], tours, partners).slice(0, 3);
  if (!list.length) return null;
  const place = near.length ? b.to : b.from;
  return (
    <div className="upsell">
      <h3 className="section">{t('upsellTitle', { p: zoneLabel(place, lang) })}</h3>
      <p className="muted small">{t('upsellSub')}</p>
      <div className="upsell-list">
        {list.map((tour) => (
          <button key={tour.id} className="card upsell-item" onClick={() => nav.push({ name: 'tour', id: tour.id })}>
            <Scene scene={tour.scene} photo={'tour-' + tour.id} alt={tour.name[lang]} height={64} rounded={10} />
            <span className="upsell-text">
              <strong>{tour.name[lang]}</strong>
              <span className="gold small bold">{t('from')} {fm(tourPrices(tour, settings).adult)}</span>
            </span>
            <span className="gold">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- MIS RESERVAS ----------
function BookingsTab({ nav }) {
  const { t, lang, bookings, profile, fm, refreshMyBookings } = useStore();
  // Reservas hechas en este celular; su estado (pagada, precio cotizado...) se actualiza desde la nube.
  useEffect(() => { refreshMyBookings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = bookings;
  return (
    <div className="pad stack narrow">
      <h1 className="page-title">{t('bookings')}</h1>
      {mine.length === 0 && (
        <div className="card center empty">
          <p className="muted">{t('noBookings')}</p>
          <button className="btn-gold" onClick={() => nav.reset('explore')}>{t('exploreTours')}</button>
        </div>
      )}
      {mine.map((b) => (
        <button key={b.id} className="card booking-item" onClick={() => nav.push({ name: 'booking', id: b.id })}>
          <div className="bi-top">
            <span className="gold bold">{b.code}</span>
            <span className={'badge st-' + b.status}>{t(b.status)}</span>
          </div>
          <div className="bold">{bookingTitle(b, lang)}</div>
          <div className="muted small">{fmtDate(b.date, lang)} · {fmtTime(b.time, lang)} · {money(b, t, fm)}</div>
        </button>
      ))}
      {profile.name && <p className="muted small center">{profile.name}</p>}
    </div>
  );
}

// ---------- PERFIL ----------
function ProfileTab({ nav }) {
  const { t, lang, setLang, profile, setProfile, settings, admin } = useStore();
  const secret = useSecretTaps(() => nav.push({ name: 'admin' }));
  const [c, setC] = useState(profile);
  useEffect(() => setC(profile), [profile]);
  const up = (k) => (e) => setC({ ...c, [k]: e.target.value });

  return (
    <div className="pad stack narrow">
      <div className="center profile-brand">
        <img src="icon-192.png" alt={settings.businessName} width="84" height="84" onClick={secret} />
        <div className="bold">{settings.businessName}</div>
      </div>
      <h1 className="page-title">{t('profile')}</h1>
      <h3 className="section">{t('language')}</h3>
      <div className="chips">
        <button className={'chip' + (lang === 'es' ? ' on' : '')} onClick={() => setLang('es')}>Español</button>
        <button className={'chip' + (lang === 'en' ? ' on' : '')} onClick={() => setLang('en')}>English</button>
      </div>
      <h3 className="section">{t('myData')}</h3>
      <div className="card form">
        <Field label={t('name')}><input value={c.name} onChange={up('name')} /></Field>
        <Field label={t('phone')}><input value={c.phone} onChange={up('phone')} inputMode="tel" /></Field>
        <Field label={t('email')}><input value={c.email} onChange={up('email')} inputMode="email" /></Field>
        <button className="btn-outline" onClick={() => { setProfile(c); nav.toast(t('saved')); }}>{t('save')}</button>
      </div>
      <a className="btn-gold" href={waLink(settings.whatsapp, 'Hola TourRide CR 👋')} target="_blank" rel="noreferrer"><Icon.whatsapp /> {t('contactUs')}</a>
      {(settings.email || settings.ictLicense) && (
        <p className="muted small center">
          {settings.email && <a className="gold" href={`mailto:${settings.email}`}>{settings.email}</a>}
          {settings.email && settings.ictLicense && ' · '}
          {settings.ictLicense && `${t('ictLicense')}: ${settings.ictLicense}`}
        </p>
      )}
      <div className="card">
        <h3 className="card-title">📲 {t('install')}</h3>
        <p className="muted small">{t('installHelp')}</p>
      </div>
      {admin && <button className="link" onClick={() => nav.push({ name: 'admin' })}>🔒 {t('admin')}</button>}
    </div>
  );
}
