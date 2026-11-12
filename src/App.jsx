import { useEffect, useMemo, useState } from 'react';
import { StoreProvider, useStore, useDayBookings, usd, crc, findRate, waLink, todayISO, fmtDate, fmtTime, newCode, unitsFree } from './store.jsx';
import { vehicleTypes } from './data.js';
import Scene from './Scene.jsx';
import { Icon, Counter, QR, Modal, Field, Toast } from './ui.jsx';
import Admin from './Admin.jsx';
import { photos } from './photos.js';

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

// ---------- navegación ----------
function Shell() {
  const [tab, setTab] = useState('transfers');
  const [stack, setStack] = useState([]); // pantallas encima de las pestañas
  const [toast, setToast] = useState('');
  const screen = stack[stack.length - 1];

  const nav = useMemo(() => ({
    push: (s) => { setStack((st) => [...st, s]); window.scrollTo(0, 0); },
    back: () => setStack((st) => st.slice(0, -1)),
    reset: (t) => { setStack([]); if (t) setTab(t); window.scrollTo(0, 0); },
    toast: (txt) => { setToast(txt); setTimeout(() => setToast(''), 2200); },
  }), []);

  let content;
  if (screen?.name === 'tour') content = <TourDetail id={screen.id} nav={nav} />;
  else if (screen?.name === 'bookTour') content = <BookTour id={screen.id} nav={nav} />;
  else if (screen?.name === 'bookTransfer') content = <BookTransfer draft={screen.draft} nav={nav} />;
  else if (screen?.name === 'booking') content = <BookingDone id={screen.id} nav={nav} />;
  else if (screen?.name === 'admin') content = <Admin nav={nav} />;
  else if (tab === 'transfers') content = <TransfersTab nav={nav} />;
  else if (tab === 'explore') content = <ExploreTab nav={nav} />;
  else if (tab === 'bookings') content = <BookingsTab nav={nav} />;
  else content = <ProfileTab nav={nav} />;

  return (
    <div className="app">
      <main className={screen ? 'screen' : 'screen with-nav'} key={(screen?.name || tab) + (screen?.id || '')}>
        {content}
      </main>
      {!screen && <BottomNav tab={tab} setTab={(t) => { setTab(t); window.scrollTo(0, 0); }} />}
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
        <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
          <I />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

// Botón visible para cambiar entre español e inglés
function LangToggle() {
  const { lang, setLang } = useStore();
  return (
    <div className="lang-toggle" role="group" aria-label="Idioma / Language">
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
    // de las busetas/buses privados, solo el que le queda justo al grupo y uno más grande
    .filter((v, i, list) => v.perPerson || v.id === 'suv' || list.filter((x) => !x.perPerson && x.id !== 'suv').slice(0, 2).includes(v))
    .map((v) => ({ v, unit: Number(rate[v.id]), total: v.perPerson ? Number(rate[v.id]) * pax : Number(rate[v.id]) }))
    .sort((x, y) => x.total - y.total);
}

// ---------- TRASLADOS ----------
const OTHER = '__other';
function TransfersTab({ nav }) {
  const store = useStore();
  const { t, lang, rates, settings, places: zones, fm, fm2 } = store;
  const [d, setD] = useState({ from: 'Aeropuerto SJO', to: 'La Fortuna', fromOther: '', toOther: '', date: todayISO(3), time: '10:30', flight: '', pax: 4, bags: 4 });
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

  return (
    <>
      <Hero scene="beach" logo title={settings.businessName} sub={t('tagline')} />
      <div className="pad transfer-layout">
        <div className="stack">
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
        </div>

        <div className="grid2">
          <Counter label={t('passengers')} icon={<Icon.users />} value={d.pax} min={1} max={45} onChange={set('pax')} />
          <Counter label={t('luggage')} icon={<Icon.bag />} value={d.bags} min={0} max={45} onChange={set('bags')} />
        </div>
        </div>
        <div className="stack">

        {same ? null : !rate || options.length === 0 ? (
          quoteVehicle ? (
            <>
              <h3 className="section">{t('chooseRide')}</h3>
              <div className="card vehicle on">
                <div className="vehicle-img">{photos[quoteVehicle.id] ? <img src={photos[quoteVehicle.id]} alt="" /> : <span>{quoteVehicle.icon}</span>}</div>
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
                <div className="vehicle-img">{photos[o.v.id] ? <img src={photos[o.v.id]} alt="" /> : <span>{o.v.icon}</span>}</div>
                <div className="vehicle-info">
                  <div className="vehicle-name">{o.v.name[lang]}</div>
                  <div className="muted small">{o.v.note[lang]}</div>
                  <div className="gold big">{fm2(o.total)}</div>
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
        <div style={{ height: 8 }} />
        <p className="muted small center">{fmtDate(d.date, lang)} · {fmtTime(time, lang)}</p>
      </div>
        </div>
    </>
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
      customer: c, from: draft.from, to: draft.to, date: draft.date, time: draft.time, flight: draft.flight,
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
    setErr(t('sendError'));
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
      <Hero scene="jungle" photo="explore" title={t('explore')} sub={t('exploreSub')} height={170} />
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
        {list.map((tour) => {
          const p = tourPrices(tour, settings);
          return (
            <button key={tour.id} className="tour-card" onClick={() => nav.push({ name: 'tour', id: tour.id })}>
              <Scene scene={tour.scene} photo={'tour-' + tour.id} height={170} rounded={0} />
              <div className="tour-card-body">
                <div className="tour-card-title">{tour.name[lang]} · {tour.location}</div>
                <div className="gold small bold">{t('from')} {fm(p.adult)} · ★ {tour.rating}</div>
              </div>
            </button>
          );
        })}
        </div>
      </div>
    </>
  );
}

// ---------- DETALLE DEL TOUR ----------
function TourDetail({ id, nav }) {
  const { t, lang, tours, partners, settings, fm } = useStore();
  const tour = tours.find((x) => x.id === id);
  if (!tour) return <div className="pad"><TopBar title="" onBack={nav.back} /></div>;
  const partner = partners.find((p) => p.id === tour.partnerId);
  const p = tourPrices(tour, settings);
  const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(tour.location + ', Costa Rica');

  return (
    <>
      <Scene scene={tour.scene} photo={'tour-' + tour.id} height={260} rounded={0} className="detail-hero">
        <div className="hero-shade" />
        <button className="round floating" onClick={nav.back} aria-label={t('back')}><Icon.back /></button>
      </Scene>
      <div className="pad stack detail narrow">
        <h1 className="detail-title">{tour.name[lang]}</h1>
        <div className="chips">
          <span className="chip static"><Icon.clock /> {tour.duration} {t('hours')}</span>
          <span className="chip static"><Icon.leaf /> {t(tour.difficulty)}</span>
          <span className="chip static"><Icon.users /> {t('fromAge', { n: tour.minAge })}</span>
          <span className="chip static">★ {tour.rating} ({tour.reviews})</span>
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
        <a className="card map" href={map} target="_blank" rel="noreferrer">
          <Scene scene="coffee" noPhoto height={110} rounded={12}>
            <div className="map-pin"><Icon.pin width="28" height="28" /><span>{tour.location}</span></div>
          </Scene>
          <span className="small gold">{t('openMap')} ↗</span>
        </a>
        <div style={{ height: 70 }} />
      </div>
      <div className="sticky-cta">
        <button className="btn-gold" onClick={() => nav.push({ name: 'bookTour', id: tour.id })}>
          {t('bookTour')} · {fm(p.adult)} {t('adult')} / {fm(p.child)} {t('child')}
        </button>
      </div>
    </>
  );
}

// ---------- RESERVAR TOUR ----------
function BookTour({ id, nav }) {
  const { t, lang, tours, settings, profile, setProfile, submitBooking, fm, fm2 } = useStore();
  const tour = tours.find((x) => x.id === id);
  const [sending, setSending] = useState(false);
  const prices = tourPrices(tour, settings);
  const [date, setDate] = useState(todayISO(1));
  const [time, setTime] = useState(tour.schedules[0]);
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(0);
  const [pickup, setPickup] = useState(false);
  const [hotel, setHotel] = useState('');
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
      date, time, adults, kids, pickup, hotel: pickup ? hotel : '', coupon: discountPct ? coupon.toUpperCase() : '',
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
        <div className="info"><span className="row-icon">●</span><span>{t('status')}: <strong className={'st-' + b.status}>{t(b.status)}</strong></span></div>
      </div>
      {b.status === 'quote' && <p className="muted small">{t('quoteNote')}</p>}
      {b.status === 'pending' && b.deposit > 0 && <p className="muted small">{t('depositNote', { n: settings.depositPct })} {t('depositNow', { n: settings.depositPct })}: <strong className="gold">{fm(b.deposit)}</strong></p>}
      {b.status === 'pending' && b.payment === 'sinpe' && <p className="muted small">{t('sinpeInfo', { n: settings.whatsapp })}</p>}
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
  const { t, lang, setLang, profile, setProfile, settings } = useStore();
  const [c, setC] = useState(profile);
  useEffect(() => setC(profile), [profile]);
  const up = (k) => (e) => setC({ ...c, [k]: e.target.value });

  return (
    <div className="pad stack narrow">
      <div className="center profile-brand">
        <img src="icon-192.png" alt="TourRide CR" width="84" height="84" />
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
      <div className="card">
        <h3 className="card-title">📲 {t('install')}</h3>
        <p className="muted small">{t('installHelp')}</p>
      </div>
      <button className="link" onClick={() => nav.push({ name: 'admin' })}>🔒 {t('admin')}</button>
    </div>
  );
}
