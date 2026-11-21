import { useEffect, useState } from 'react';
import { useStore as useBaseStore, isAdminRole, usd, crc, fmtDate, fmtTime, waLink, overlaps, peopleOf, todayISO } from './store.jsx';
import * as cloud from './cloud.js';
import { vehicleTypes, routeInfoDefaults } from './data.js';
import { Icon, Field, Modal } from './ui.jsx';

// Panel del dueño (solo en español). Entrar desde Perfil → Panel del dueño, con correo y contraseña.
// Dentro del panel "bookings" son TODAS las reservas (de la nube), no solo las de este celular.
function useStore() {
  const s = useBaseStore();
  return { ...s, bookings: s.adminBookings, updateBooking: s.updateAdminBooking };
}

const roleNames = { superadmin: 'Súper administrador', owner: 'Dueño del negocio', staff: 'Empleado', partner: 'Socio', driver: 'Chofer', pending: 'Sin permiso todavía' };

const sections = [
  ['summary', 'Resumen'],
  ['bookings', 'Reservas'],
  ['tours', 'Tours'],
  ['fleet', 'Flota y choferes'],
  ['partners', 'Socios'],
  ['places', 'Lugares'],
  ['rates', 'Tarifas'],
  ['settings', 'Ajustes'],
  ['reviews', 'Opiniones'],
  ['users', 'Usuarios'],
];

export default function Admin({ nav }) {
  const { admin, logout, reloadAdmin, cloudError, syncing } = useStore();
  const [sec, setSec] = useState('summary');
  // las reservas nuevas aparecen solas cada minuto
  useEffect(() => {
    if (!admin) return undefined;
    const id = setInterval(reloadAdmin, 60000);
    return () => clearInterval(id);
  }, [admin]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = admin?.profile.role;
  const head = (
    <div className="topbar">
      <button className="round" onClick={nav.back} aria-label="Atrás"><Icon.back /></button>
      <h2>Panel del dueño</h2>
    </div>
  );
  if (!admin) return <div className="pad stack narrow">{head}<Login /></div>;
  const who = (
    <div className="card note small admin-who">
      <span>👤 {admin.profile.email} · <strong>{roleNames[role] || role}</strong>{syncing ? ' · guardando…' : ''}</span>
      <span className="admin-who-actions">
        <button className="link" onClick={() => { reloadAdmin(); nav.toast('Actualizado'); }}>Actualizar</button>
        <button className="link" onClick={logout}>Salir</button>
      </span>
    </div>
  );
  if (!isAdminRole(role)) {
    return (
      <div className="pad stack admin narrow-wide">
        {head}
        {who}
        {role === 'partner' || role === 'driver' ? <MyTrips role={role} /> : (
          <div className="card"><p>Tu cuenta ya existe, pero todavía no tiene permiso. Pídele al dueño de la app que te asigne un rol en Panel → Usuarios.</p></div>
        )}
      </div>
    );
  }
  return (
    <div className="pad stack admin narrow-wide">
      {head}
      {who}
      {cloudError && <div className="card error small">{cloudError}</div>}
      <div className="chips scroll-x">
        {sections.filter(([id]) => id !== 'users' || role !== 'staff').map(([id, label]) => (
          <button key={id} className={'chip' + (sec === id ? ' on' : '')} onClick={() => setSec(id)}>{label}</button>
        ))}
      </div>
      {sec === 'summary' && <Summary />}
      {sec === 'bookings' && <Bookings />}
      {sec === 'tours' && <Tours nav={nav} />}
      {sec === 'partners' && <Partners nav={nav} />}
      {sec === 'fleet' && <Fleet nav={nav} />}
      {sec === 'places' && <Places nav={nav} />}
      {sec === 'rates' && <Rates nav={nav} />}
      {sec === 'settings' && <Settings nav={nav} />}
      {sec === 'reviews' && <Reviews nav={nav} />}
      {sec === 'users' && <Users nav={nav} />}
    </div>
  );
}

function Login() {
  const { login } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await login(email, password); }
    catch (ex) { setErr(ex.message === 'Failed to fetch' ? 'Sin conexión a internet' : ex.message); }
    setBusy(false);
  };
  return (
    <form className="card form" onSubmit={submit}>
      <h3 className="card-title">Entrar al panel</h3>
      <Field label="Correo"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Contraseña"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {err && <p className="error small">{err}</p>}
      <button className="btn-gold" type="submit" disabled={busy || !email || !password}>{busy ? 'Entrando…' : 'Entrar'}</button>
      <p className="muted small">Las cuentas las crea el dueño de la app. Socios y choferes ven aquí solo sus viajes.</p>
    </form>
  );
}

// Socios y choferes: solo sus reservas (la base de datos no les deja ver las demás).
function MyTrips({ role }) {
  const { bookings } = useStore();
  const list = bookings.filter((b) => b.status !== 'cancelled').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return (
    <>
      <h3 className="section">{role === 'driver' ? 'Mis viajes' : 'Reservas de mis tours'}</h3>
      {list.length === 0 && <p className="muted center">No tienes reservas asignadas.</p>}
      {list.map((b) => (
        <div key={b.id} className="card admin-booking">
          <div className="bi-top"><span className="gold bold">{b.code}</span><span className="muted small">{b.type === 'tour' ? 'Tour' : 'Traslado'}</span></div>
          <div className="bold">{b.type === 'tour' ? b.tourName?.es : `${b.from} → ${b.to}`}</div>
          <div className="small">{fmtDate(b.date, 'es')} · {fmtTime(b.time, 'es')}</div>
          <div className="small muted">{b.type === 'tour' ? `${b.adults} adultos, ${b.kids} niños${b.hotel ? ' · Hotel: ' + b.hotel : ''}` : `${b.pax} pax, ${b.bags} maletas${b.flight ? ' · Vuelo ' + b.flight : ''}`}</div>
          <div className="small">👤 {b.customer.name} · <a href={waLink(b.customer.phone, `Hola ${b.customer.name}, le escribimos de TourRide CR por su reserva ${b.code}.`)} target="_blank" rel="noreferrer">{b.customer.phone}</a></div>
        </div>
      ))}
    </>
  );
}

// Opiniones: los clientes opinan desde su reserva; aquí se aprueban antes de que se vean en la app.
function Reviews({ nav }) {
  const { tours } = useStore();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const load = () => cloud.fetchReviews().then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn, msg) => {
    try { await fn(); nav.toast(msg); load(); } catch (e) { setErr('No se pudo guardar: ' + e.message); }
  };
  const pending = (list || []).filter((r) => !r.approved);
  const shown = (list || []).filter((r) => r.approved);
  const item = (r) => (
    <div key={r.id} className="card">
      <div className="bi-top">
        <span className="gold">{'★'.repeat(r.rating)}<span className="muted">{'★'.repeat(5 - r.rating)}</span></span>
        <span className="muted small">{fmtDate(String(r.created_at).slice(0, 10), 'es')} · {r.booking_code}</span>
      </div>
      <div className="bold">{r.name} · <span className="muted small">{tours.find((x) => x.id === r.tour_id)?.name.es || 'Traslado'}</span></div>
      {r.comment && <p className="small">“{r.comment}”</p>}
      <div className="grid2">
        {r.approved
          ? <button className="btn-outline small-btn" onClick={() => act(() => cloud.updateReview(r.id, { approved: false }), 'Ocultada')}>Ocultar</button>
          : <button className="btn-gold small-btn" onClick={() => act(() => cloud.updateReview(r.id, { approved: true }), 'Publicada')}>Publicar</button>}
        <button className="btn-outline small-btn danger-outline" onClick={() => act(() => cloud.deleteReview(r.id), 'Borrada')}>Borrar</button>
      </div>
    </div>
  );
  return (
    <>
      <div className="card note small">
        Los clientes pueden opinar desde su reserva cuando está "Completada" (o "Pagada" y ya pasó la fecha).
        Nada se publica hasta que tocas "Publicar". Las estrellas de cada tour salen solo de opiniones publicadas.
      </div>
      {err && <p className="error small">{err}</p>}
      {!list && !err && <p className="muted center">Cargando…</p>}
      {list && <h3 className="section">Por revisar ({pending.length})</h3>}
      {list && pending.length === 0 && <p className="muted small">No hay opiniones nuevas.</p>}
      {pending.map(item)}
      {shown.length > 0 && <h3 className="section">Publicadas ({shown.length})</h3>}
      {shown.map(item)}
    </>
  );
}

// Cuentas: el dueño de la app da los permisos (rol) a cada persona.
function Users({ nav }) {
  const { admin, partners, drivers } = useStore();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const myRole = admin.profile.role;
  const load = () => cloud.fetchProfiles().then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = async (u, patch) => {
    setList((l) => l.map((x) => (x.id === u.id ? { ...x, ...patch } : x)));
    try { await cloud.updateProfile(u.id, patch); nav.toast('Guardado'); }
    catch (e) { setErr('No se pudo guardar: ' + e.message); load(); }
  };
  const roles = Object.keys(roleNames).filter((r) => r !== 'superadmin' || myRole === 'superadmin');
  return (
    <>
      <div className="card note small">
        Para agregar a alguien: créale el usuario en Supabase (Authentication → Users → Add user, con "Auto Confirm User").
        Aparece aquí como "Sin permiso todavía"; elige su rol. A un socio o chofer dile cuál es el suyo.
      </div>
      {err && <p className="error small">{err}</p>}
      {!list && !err && <p className="muted center">Cargando…</p>}
      {(list || []).map((u) => {
        const locked = u.role === 'superadmin' && myRole !== 'superadmin';
        return (
          <div key={u.id} className="card form">
            <div className="bold">{u.email}</div>
            <div className="grid2">
              <Field label="Rol">
                <select value={u.role} disabled={locked || u.id === admin.profile.id} onChange={(e) => change(u, { role: e.target.value })}>
                  {(locked ? [u.role] : roles).map((r) => <option key={r} value={r}>{roleNames[r]}</option>)}
                </select>
              </Field>
              {u.role === 'partner' && (
                <Field label="¿Qué socio es?">
                  <select value={u.partner_id || ''} onChange={(e) => change(u, { partner_id: e.target.value || null })}>
                    <option value="">Elegir…</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
              )}
              {u.role === 'driver' && (
                <Field label="¿Qué chofer es?">
                  <select value={u.driver_id || ''} onChange={(e) => change(u, { driver_id: e.target.value || null })}>
                    <option value="">Elegir…</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Summary() {
  const { bookings, partners, settings } = useStore();
  const active = bookings.filter((b) => b.status !== 'cancelled');
  const sales = active.reduce((s, b) => s + b.total, 0);
  const paid = active.filter((b) => b.status === 'paid' || b.status === 'completed').reduce((s, b) => s + b.total, 0);
  const comm = active.reduce((s, b) => s + (b.commission || 0), 0);
  const byPartner = partners.map((p) => ({
    p,
    n: active.filter((b) => b.partnerId === p.id).length,
    c: active.filter((b) => b.partnerId === p.id).reduce((s, b) => s + (b.commission || 0), 0),
  }));
  const receipts = bookings.filter((b) => b.receipt && (b.status === 'pending' || b.status === 'quote')).length;
  return (
    <>
      {receipts > 0 && <p className="card notice">🧾 {receipts === 1 ? 'Hay 1 comprobante de SINPE por revisar' : `Hay ${receipts} comprobantes de SINPE por revisar`} en Reservas.</p>}
      <div className="grid2">
        <Stat label="Reservas activas" value={active.length} />
        <Stat label="Ventas totales" value={usd(sales)} sub={crc(sales, settings.exchangeRate)} />
        <Stat label="Cobrado" value={usd(paid)} />
        <Stat label="Comisiones a cobrar" value={usd(comm)} />
      </div>
      <h3 className="section">Comisiones por socio</h3>
      <div className="card list">
        {byPartner.map(({ p, n, c }) => (
          <div key={p.id} className="info">
            <span>{p.name} <small className="muted">· {n} reservas · {p.commission}%</small></span>
            <strong className="gold" style={{ marginLeft: 'auto' }}>{usd(c)}</strong>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

const statuses = [['quote', 'Por cotizar'], ['pending', 'Pendiente de pago'], ['paid', 'Pagada'], ['completed', 'Completada'], ['cancelled', 'Cancelada']];
const payNames = { sinpe: 'SINPE', cash: 'Efectivo', card: 'Tarjeta' };

// ¿Esta reserva usa un vehículo propio con chofer? (los traslados compartidos y los tours sin recogida no)
const needsUnit = (b) => (b.type === 'transfer' ? !vehicleTypes.find((v) => v.id === b.vehicleId)?.perPerson : !!b.pickup);
const capOf = (u) => vehicleTypes.find((v) => v.id === u.typeId)?.capacity || 0;

// Asigna vehículo y chofer libres a las reservas próximas que no los tienen.
// Prefiere el mismo tipo de vehículo que pidió el cliente y reparte los viajes entre los choferes.
export function planAssignments(bookings, fleet, drivers, tours, settings) {
  const today = todayISO();
  const work = bookings.map((b) => ({ ...b }));
  const todo = work
    .filter((b) => b.status !== 'cancelled' && b.status !== 'completed' && b.status !== 'quote' && b.date >= today && needsUnit(b) && (!b.unitId || !b.driverId))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const changes = [];
  for (const b of todo) {
    const clashes = work.filter((x) => overlaps(b, x, tours, settings));
    const patch = {};
    if (!b.unitId) {
      const people = peopleOf(b);
      const free = fleet
        .filter((u) => u.status === 'active' && capOf(u) >= people && !clashes.some((x) => x.unitId === u.id))
        .sort((x, y) => (x.typeId === b.vehicleId ? 0 : 1) - (y.typeId === b.vehicleId ? 0 : 1) || capOf(x) - capOf(y));
      if (free[0]) patch.unitId = free[0].id;
    }
    if (!b.driverId) {
      const load = (d) => work.filter((x) => x.date === b.date && x.driverId === d.id && x.status !== 'cancelled').length;
      const free = drivers
        .filter((d) => d.active !== false && !clashes.some((x) => x.driverId === d.id))
        .sort((x, y) => load(x) - load(y));
      if (free[0]) patch.driverId = free[0].id;
    }
    if (Object.keys(patch).length) { Object.assign(b, patch); changes.push({ id: b.id, code: b.code, patch }); }
  }
  const missing = todo.filter((b) => !b.unitId || !b.driverId).map((b) => b.code);
  return { changes, missing, total: todo.length };
}

function AutoAssign() {
  const { bookings, updateBooking, fleet, drivers, tours, settings } = useStore();
  const [msg, setMsg] = useState('');
  const pending = bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'completed' && b.status !== 'quote' && b.date >= todayISO() && needsUnit(b) && (!b.unitId || !b.driverId)).length;
  if (!pending && !msg) return null;
  const run = () => {
    const { changes, missing } = planAssignments(bookings, fleet, drivers, tours, settings);
    changes.forEach((c) => updateBooking(c.id, c.patch));
    setMsg((changes.length ? `Listo: se asignaron ${changes.length} ${changes.length === 1 ? 'reserva' : 'reservas'}.` : 'No se pudo asignar ninguna.')
      + (missing.length ? ` Sin vehículo o chofer libre: ${missing.join(', ')}.` : ''));
  };
  return (
    <div className="card auto-assign">
      <div>
        <strong>{pending ? `${pending} ${pending === 1 ? 'reserva próxima' : 'reservas próximas'} sin vehículo o chofer` : 'Asignación automática'}</strong>
        <div className="muted small">La app elige vehículos y choferes libres a esa hora. Puedes cambiarlos después.</div>
        {msg && <p className="ok small">{msg}</p>}
      </div>
      {pending > 0 && <button className="btn-gold small-btn" onClick={run}>Asignar automáticamente</button>}
    </div>
  );
}

function ReceiptActions({ b, onApprove }) {
  const [err, setErr] = useState('');
  const open = async () => {
    setErr('');
    const w = window.open('', '_blank');
    try {
      const url = await cloud.receiptUrl(b.receipt);
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) {
      if (w) w.close();
      setErr('No se pudo abrir el comprobante.');
    }
  };
  return (
    <div className="receipt-admin">
      <span className="badge-receipt">🧾 Comprobante recibido{b.receiptAt ? ' · ' + new Date(b.receiptAt).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span>
      <div className="row-btns">
        <button className="btn-outline small-btn" onClick={open}>Ver comprobante</button>
        {(b.status === 'pending' || b.status === 'quote') && <button className="btn-gold small-btn" onClick={onApprove}>Aprobar pago</button>}
      </div>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

// Enlace para que el cliente deje su opinión desde WhatsApp (abre la app en la página de opinar).
function reviewLink(b, businessName) {
  const url = `${window.location.origin}${window.location.pathname}#/opinar/${b.code}`;
  const first = String(b.customer.name || '').trim().split(' ')[0];
  const name = businessName || 'TourRide CR';
  return waLink(b.customer.phone,
    `Hola ${first}, gracias por viajar con ${name}. ¿Nos regalas tu opinión? Toma un minuto: ${url}\n\nHi ${first}, thanks for traveling with ${name}! Could you leave us a quick review? ${url}`);
}

function Bookings() {
  const { bookings, updateBooking, partners, fleet, drivers, tours, settings } = useStore();
  const [q, setQ] = useState('');
  const list = bookings.filter((b) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [b.code, b.customer.name, b.customer.phone, b.tourName?.es, b.from, b.to].join(' ').toLowerCase().includes(s);
  });
  return (
    <>
      <div className="search">
        <Icon.search />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código (TR-...), nombre o teléfono" />
      </div>
      <AutoAssign />
      {list.length === 0 && <p className="muted center">No hay reservas todavía.</p>}
      {list.map((b) => {
        const partner = partners.find((p) => p.id === b.partnerId);
        const vehicle = vehicleTypes.find((v) => v.id === b.vehicleId);
        return (
          <div key={b.id} className="card admin-booking">
            <div className="bi-top">
              <span className="gold bold">{b.code}</span>
              <span className="muted small">{b.type === 'tour' ? 'Tour' : 'Traslado'}</span>
            </div>
            <div className="bold">{b.type === 'tour' ? b.tourName.es : `${b.from} → ${b.to}`}</div>
            <div className="small">{fmtDate(b.date, 'es')} · {fmtTime(b.time, 'es')}</div>
            <div className="small muted">
              {b.type === 'tour'
                ? `${b.adults} adultos, ${b.kids} niños${b.hotel ? ' · Hotel: ' + b.hotel : ''}${partner ? ' · ' + partner.name : ''}`
                : `${b.pax} pax, ${b.bags} maletas · ${vehicle?.name.es || ''}${b.flight ? ' · Vuelo ' + b.flight : ''}`}
            </div>
            <div className="small">👤 {b.customer.name} · {b.customer.phone} · {payNames[b.payment] || 'Efectivo'}</div>
            {b.notes && <div className="small admin-notes">✎ {b.notes}</div>}
            {b.receipt && <ReceiptActions b={b} onApprove={() => updateBooking(b.id, { status: 'paid' })} />}
            <div className="bi-top">
              <strong>{b.status === 'quote' ? 'Por cotizar' : usd(b.total)}{b.commission ? <small className="muted"> · comisión {usd(b.commission)}</small> : null}</strong>
              <select value={b.status} onChange={(e) => updateBooking(b.id, { status: e.target.value })}>
                {statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {b.status === 'quote' && <QuoteBox b={b} />}
            {needsUnit(b) && b.status !== 'cancelled' && (
              <Assign b={b} bookings={bookings} fleet={fleet} drivers={drivers} tours={tours} settings={settings} onChange={(patch) => updateBooking(b.id, patch)} />
            )}
            <a className="small gold" href={waLink(b.customer.phone, `Hola ${b.customer.name}, te escribimos de TourRide CR sobre tu reserva ${b.code}.`)} target="_blank" rel="noreferrer">Escribir al cliente por WhatsApp ↗</a>
            {(b.status === 'completed' || (b.status === 'paid' && b.date < todayISO())) && (
              <a className="small gold" href={reviewLink(b, settings.businessName)} target="_blank" rel="noreferrer">⭐ Pedir opinión al cliente por WhatsApp ↗</a>
            )}
          </div>
        );
      })}
    </>
  );
}

const emptyTour = {
  scene: 'jungle', category: 'nature', featured: false, active: true,
  name: { es: '', en: '' }, desc: { es: '', en: '' }, location: '', partnerId: 'p1', duration: 3,
  schedules: ['08:00'], capacity: 10, includes: { es: [], en: [] }, bring: { es: [], en: [] },
  minAge: 0, difficulty: 'easy', priceAdult: 50, priceChild: 30, highAdult: 60, highChild: 35, rating: 5, reviews: 0,
};

function Tours({ nav }) {
  const { tours, setTours, partners } = useStore();
  const partnerOk = (x) => partners.some((p) => p.id === x.partnerId && p.active !== false);
  const [edit, setEdit] = useState(null);
  if (edit) {
    return (
      <TourForm
        tour={edit}
        onCancel={() => setEdit(null)}
        onDelete={edit.id ? () => { setTours((l) => l.filter((x) => x.id !== edit.id)); setEdit(null); nav.toast('Tour eliminado'); } : null}
        onSave={(tour) => {
          setTours((l) => (tour.id ? l.map((x) => (x.id === tour.id ? tour : x)) : [...l, { ...tour, id: 't' + Date.now() }]));
          setEdit(null);
          nav.toast('Guardado');
        }}
      />
    );
  }
  return (
    <>
      <button className="btn-gold" onClick={() => setEdit(emptyTour)}>+ Agregar tour</button>
      {tours.map((x) => (
        <div key={x.id} className="card admin-row">
          <div>
            <div className="bold">{x.name.es || '(sin nombre)'}</div>
            <div className="muted small">{x.location} · {usd(x.priceAdult)} / {usd(x.priceChild)} · {!partnerOk(x) ? <span className="danger-text">Oculto: socio pausado o quitado</span> : x.active ? 'Visible' : 'Oculto'}</div>
          </div>
          <div className="row-actions">
            <button className="chip" onClick={() => setTours((l) => l.map((y) => (y.id === x.id ? { ...y, active: !y.active } : y)))}>{x.active ? 'Ocultar' : 'Mostrar'}</button>
            <button className="chip on" onClick={() => setEdit(x)}>Editar</button>
          </div>
        </div>
      ))}
    </>
  );
}

const lines = (arr) => (arr || []).join('\n');
const unlines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function TourForm({ tour, onSave, onCancel, onDelete }) {
  const { partners } = useStore();
  const [f, setF] = useState(tour);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  const setL = (k, lang) => (e) => setF({ ...f, [k]: { ...f[k], [lang]: e.target.value } });
  const setList = (k, lang) => (e) => setF({ ...f, [k]: { ...f[k], [lang]: e.target.value.split('\n') } });
  const save = () => onSave({
    ...f,
    includes: { es: unlines(lines(f.includes.es)), en: unlines(lines(f.includes.en)) },
    bring: { es: unlines(lines(f.bring.es)), en: unlines(lines(f.bring.en)) },
    schedules: f.schedules.filter(Boolean),
  });
  return (
    <div className="card form">
      <h3>{tour.id ? 'Editar tour' : 'Nuevo tour'}</h3>
      <Field label="Nombre (español)"><input value={f.name.es} onChange={setL('name', 'es')} /></Field>
      <Field label="Nombre (inglés)"><input value={f.name.en} onChange={setL('name', 'en')} /></Field>
      <Field label="Descripción (español)"><textarea rows="3" value={f.desc.es} onChange={setL('desc', 'es')} /></Field>
      <Field label="Descripción (inglés)"><textarea rows="3" value={f.desc.en} onChange={setL('desc', 'en')} /></Field>
      <Field label="Ubicación"><input value={f.location} onChange={set('location')} /></Field>
      <div className="grid2">
        <Field label="Categoría">
          <select value={f.category} onChange={set('category')}>
            <option value="adventure">Aventura</option><option value="water">Agua</option><option value="nature">Naturaleza</option><option value="culture">Cultura</option>
          </select>
        </Field>
        <Field label="Dificultad">
          <select value={f.difficulty} onChange={set('difficulty')}>
            <option value="easy">Fácil</option><option value="medium">Moderado</option><option value="hard">Difícil</option>
          </select>
        </Field>
        <Field label="Socio">
          <select value={f.partnerId} onChange={set('partnerId')}>
            {!partners.some((p) => p.id === f.partnerId) && <option value={f.partnerId}>— Escoge un socio —</option>}
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active === false ? ' (pausado)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Ilustración">
          <select value={f.scene} onChange={set('scene')}>
            {['volcano', 'kayak', 'sloth', 'jungle', 'river', 'reef', 'coffee', 'waterfall', 'beach'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Precio adulto (USD)"><input type="number" value={f.priceAdult} onChange={set('priceAdult', true)} /></Field>
        <Field label="Precio niño (USD)"><input type="number" value={f.priceChild} onChange={set('priceChild', true)} /></Field>
        <Field label="Adulto temporada alta"><input type="number" value={f.highAdult} onChange={set('highAdult', true)} /></Field>
        <Field label="Niño temporada alta"><input type="number" value={f.highChild} onChange={set('highChild', true)} /></Field>
        <Field label="Duración (horas)"><input type="number" value={f.duration} onChange={set('duration', true)} /></Field>
        <Field label="Edad mínima"><input type="number" value={f.minAge} onChange={set('minAge', true)} /></Field>
        <Field label="Cupos por horario"><input type="number" value={f.capacity} onChange={set('capacity', true)} /></Field>
        <Field label="Horarios (ej: 08:00, 13:00)">
          <input value={f.schedules.join(', ')} onChange={(e) => setF({ ...f, schedules: e.target.value.split(',').map((x) => x.trim()) })} />
        </Field>
      </div>
      <Field label="Qué incluye (uno por línea, español)"><textarea rows="3" value={lines(f.includes.es)} onChange={setList('includes', 'es')} /></Field>
      <Field label="Qué incluye (inglés)"><textarea rows="3" value={lines(f.includes.en)} onChange={setList('includes', 'en')} /></Field>
      <Field label="Qué llevar (uno por línea, español)"><textarea rows="3" value={lines(f.bring.es)} onChange={setList('bring', 'es')} /></Field>
      <Field label="Qué llevar (inglés)"><textarea rows="3" value={lines(f.bring.en)} onChange={setList('bring', 'en')} /></Field>
      <h4 className="form-sub">Datos prácticos (opcional: si se deja vacío, la página muestra la recogida en hotel y la ubicación)</h4>
      <Field label="Punto de encuentro o recogida (español)"><textarea rows="2" value={f.meeting?.es || ''} onChange={setL('meeting', 'es')} placeholder="Ej.: Recogemos en hoteles de La Fortuna 30 min antes. También puedes llegar a la oficina del socio." /></Field>
      <Field label="Punto de encuentro o recogida (inglés)"><textarea rows="2" value={f.meeting?.en || ''} onChange={setL('meeting', 'en')} /></Field>
      <div className="grid2">
        <Field label="Idioma del guía (español)"><input value={f.languages?.es || ''} onChange={setL('languages', 'es')} placeholder="Ej.: Español e inglés" /></Field>
        <Field label="Idioma del guía (inglés)"><input value={f.languages?.en || ''} onChange={setL('languages', 'en')} placeholder="E.g.: Spanish and English" /></Field>
      </div>
      <label className="toggle"><input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> Destacado (sale primero)</label>
      <label className="toggle"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Visible para clientes</label>
      <div className="grid2">
        <button className="btn-outline" onClick={onCancel}>Cancelar</button>
        <button className="btn-gold" onClick={save} disabled={!f.name.es.trim()}>Guardar</button>
      </div>
      {onDelete && <button className="link danger" onClick={() => setConfirmDel(true)}>Eliminar tour</button>}
      {confirmDel && (
        <Modal onClose={() => setConfirmDel(false)}>
          <p>¿Eliminar "{f.name.es}"? Las reservas ya hechas no se borran.</p>
          <div className="grid2">
            <button className="btn-outline" onClick={() => setConfirmDel(false)}>No</button>
            <button className="btn-gold danger-bg" onClick={onDelete}>Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Partners({ nav }) {
  const { partners, setPartners, tours } = useStore();
  const [del, setDel] = useState(null);
  const update = (id, k, v) => setPartners((l) => l.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  return (
    <>
      <button className="btn-gold" onClick={() => setPartners((l) => [...l, { id: 'p' + Date.now(), name: 'Nuevo socio', contact: '', whatsapp: '', commission: 20, active: true }])}>+ Agregar socio</button>
      {partners.map((p) => (
        <div key={p.id} className={'card form' + (p.active === false ? ' paused' : '')}>
          <div className="bi-top">
            <span className={p.active === false ? 'badge st-cancelled' : 'badge st-paid'}>{p.active === false ? 'Pausado' : 'Activo'}</span>
            <span className="muted small">{tours.filter((x) => x.partnerId === p.id).length} tours</span>
          </div>
          <Field label="Empresa"><input value={p.name} onChange={(e) => update(p.id, 'name', e.target.value)} /></Field>
          <div className="grid2">
            <Field label="Contacto"><input value={p.contact} onChange={(e) => update(p.id, 'contact', e.target.value)} /></Field>
            <Field label="WhatsApp"><input value={p.whatsapp} inputMode="tel" onChange={(e) => update(p.id, 'whatsapp', e.target.value)} /></Field>
            <Field label="Comisión (%)"><input type="number" value={p.commission} onChange={(e) => update(p.id, 'commission', Number(e.target.value))} /></Field>
          </div>
          {p.whatsapp && <a className="small gold" href={waLink(p.whatsapp, `Hola ${p.contact}, te escribo de TourRide CR.`)} target="_blank" rel="noreferrer">Escribir por WhatsApp ↗</a>}
          <div className="grid2">
            <button className="btn-outline" onClick={() => update(p.id, 'active', p.active === false)}>{p.active === false ? 'Activar' : 'Pausar'}</button>
            <button className="btn-outline danger-outline" onClick={() => setDel(p)}>Quitar socio</button>
          </div>
        </div>
      ))}
      <p className="muted small">Los cambios se guardan solos. Si pausas o quitas un socio, sus tours dejan de verse para los clientes.</p>
      {del && (
        <Modal onClose={() => setDel(null)}>
          <p>¿Quitar a "{del.name}"? Sus tours se ocultan y las reservas ya hechas no se borran. Si solo es por un tiempo, mejor usa "Pausar".</p>
          <div className="grid2">
            <button className="btn-outline" onClick={() => setDel(null)}>No</button>
            <button className="btn-gold danger-bg" onClick={() => { setPartners((l) => l.filter((x) => x.id !== del.id)); setDel(null); nav.toast('Socio quitado'); }}>Sí, quitar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Rates({ nav }) {
  const { rates, setRates, places: zones } = useStore();
  const update = (id, k, v) => setRates((l) => l.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  return (
    <>
      <p className="muted small">Precio en USD. Vehículos privados: precio por viaje. Shuttle compartido y lancha: precio por persona. Pon 0 si ese transporte no va por esa ruta. La distancia y el tiempo se muestran al cliente junto al precio (si los dejas vacíos se usa el valor gris de ejemplo). La ruta sirve en ambos sentidos y los cambios se guardan solos.</p>
      <button className="btn-gold" onClick={() => setRates((l) => [...l, { id: 'r' + Date.now(), from: zones[0], to: zones[1], ...Object.fromEntries(vehicleTypes.map((v) => [v.id, 0])) }])}>+ Agregar ruta</button>
      {rates.map((r) => (
        <div key={r.id} className="card form">
          <div className="grid2">
            <Field label="Desde"><select value={r.from} onChange={(e) => update(r.id, 'from', e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select></Field>
            <Field label="Hasta"><select value={r.to} onChange={(e) => update(r.id, 'to', e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select></Field>
            {vehicleTypes.map((v) => (
              <Field key={v.id} label={v.name.es + (v.perPerson ? ' (por persona)' : '')}><input type="number" value={r[v.id]} onChange={(e) => update(r.id, v.id, Number(e.target.value))} /></Field>
            ))}
            <Field label="Distancia (km, aprox.)"><input type="number" min="0" value={r.km || ''} placeholder={String(routeInfoDefaults[[r.from, r.to].sort().join('|')]?.km || '')} onChange={(e) => update(r.id, 'km', Number(e.target.value))} /></Field>
            <Field label="Tiempo de viaje (horas, ej. 2.5)"><input type="number" min="0" step="0.25" value={r.hours || ''} placeholder={String(routeInfoDefaults[[r.from, r.to].sort().join('|')]?.hours || '')} onChange={(e) => update(r.id, 'hours', Number(e.target.value))} /></Field>
          </div>
          <button className="link danger" onClick={() => setRates((l) => l.filter((x) => x.id !== r.id))}>Quitar ruta</button>
        </div>
      ))}
    </>
  );
}

function Settings({ nav }) {
  const { settings, setSettings } = useStore();
  const [f, setF] = useState({ ...settings, cancelPolicy: settings.cancelPolicy || { es: '', en: '' }, couponsText: Object.entries(settings.coupons || {}).map(([k, v]) => `${k}=${v}`).join('\n') });
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  const save = () => {
    const coupons = {};
    f.couponsText.split('\n').forEach((line) => {
      const [k, v] = line.split('=');
      if (k && Number(v)) coupons[k.trim().toUpperCase()] = Number(v);
    });
    const { couponsText, ...rest } = f;
    setSettings({ ...rest, coupons, whatsapp: String(rest.whatsapp).replace(/\D/g, '') });
    nav.toast('Guardado');
  };
  return (
    <div className="card form">
      <Field label="Nombre del negocio"><input value={f.businessName} onChange={set('businessName')} /></Field>
      <Field label="WhatsApp del negocio (con 506)"><input value={f.whatsapp} inputMode="tel" onChange={set('whatsapp')} /></Field>
      <div className="grid2">
        <Field label="Correo del negocio (opcional)"><input type="email" value={f.email || ''} onChange={set('email')} placeholder="reservas@minegocio.com" /></Field>
        <Field label="Número de licencia ICT (opcional)"><input value={f.ictLicense || ''} onChange={set('ictLicense')} /></Field>
      </div>
      <p className="muted small">El correo y la licencia del ICT se muestran al pie de la página y en Perfil, para dar más confianza.</p>
      <div className="grid2">
        <Field label="Tipo de cambio (₡ por $)"><input type="number" value={f.exchangeRate} onChange={set('exchangeRate', true)} /></Field>
        <Field label="Transporte hotel ($/persona)"><input type="number" value={f.hotelPickupPerPerson} onChange={set('hotelPickupPerPerson', true)} /></Field>
        <Field label="Salidas del shuttle (ej: 07:30, 14:00)"><input value={(f.shuttleTimes || []).join(', ')} onChange={(e) => setF({ ...f, shuttleTimes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
      </div>
      <div className="grid2">
        <Field label="Moneda principal para el cliente">
          <select value={f.currency || 'USD'} onChange={set('currency')}>
            <option value="USD">Dólares ($)</option>
            <option value="CRC">Colones (₡)</option>
          </select>
        </Field>
        <Field label="Depósito para confirmar (%)"><input type="number" min="0" max="100" value={f.depositPct || 0} onChange={set('depositPct', true)} /></Field>
        <Field label="Horas que dura un traslado"><input type="number" min="1" value={f.tripHours || 4} onChange={set('tripHours', true)} /></Field>
      </div>
      <p className="muted small">Los precios se escriben siempre en dólares; la app los convierte con el tipo de cambio. Depósito 0 = no se pide depósito. Las horas del traslado sirven para que no se asigne el mismo vehículo o chofer a dos viajes que se cruzan.</p>
      <Field label="Política de cancelación (español)"><textarea rows="2" value={f.cancelPolicy.es} onChange={(e) => setF({ ...f, cancelPolicy: { ...f.cancelPolicy, es: e.target.value } })} /></Field>
      <Field label="Política de cancelación (inglés)"><textarea rows="2" value={f.cancelPolicy.en} onChange={(e) => setF({ ...f, cancelPolicy: { ...f.cancelPolicy, en: e.target.value } })} /></Field>
      <label className="toggle"><input type="checkbox" checked={f.highSeason} onChange={(e) => setF({ ...f, highSeason: e.target.checked })} /> Temporada alta (usa precios altos)</label>
      <Field label="Cupones (CÓDIGO=porcentaje, uno por línea)"><textarea rows="3" value={f.couponsText} onChange={set('couponsText')} /></Field>
      <h3 className="section">Preguntas frecuentes</h3>
      <label className="toggle"><input type="checkbox" checked={f.faqEnabled !== false} onChange={(e) => setF({ ...f, faqEnabled: e.target.checked })} /> Mostrar el botón de preguntas frecuentes a los clientes</label>
      <p className="muted small">Gratis y sin IA: responde precios desde el aeropuerto, qué incluyen los tours, formas de pago, cancelación, recogida en hotel, equipaje y cómo ver una reserva, con los datos que tienes en este panel. Si enciendes el asistente de IA, este botón se reemplaza por el chat.</p>
      <h3 className="section">Asistente de IA (beta)</h3>
      <label className="toggle"><input type="checkbox" checked={!!f.assistantEnabled} onChange={(e) => setF({ ...f, assistantEnabled: e.target.checked })} /> Mostrar el chat del asistente a los clientes</label>
      <Field label="Máximo de preguntas por día (todos los clientes juntos)"><input type="number" min="0" value={f.assistantDailyLimit ?? 300} onChange={set('assistantDailyLimit', true)} /></Field>
      <p className="muted small">El asistente responde con tus tours y tarifas, cotiza y deja la reserva lista para que el cliente la confirme; nunca confirma ni cobra solo. Necesita la cuenta de IA configurada en Supabase. Cada cliente puede hacer hasta 30 preguntas por día.</p>
      <button className="btn-gold" onClick={save}>Guardar ajustes</button>
    </div>
  );
}

// El dueño pone el precio de un traslado "Otro lugar" y se lo manda al cliente por WhatsApp.
function QuoteBox({ b }) {
  const { updateBooking, settings } = useStore();
  const [price, setPrice] = useState('');
  const n = Number(price);
  const msg = `Hola ${b.customer.name}, tu traslado ${b.from} → ${b.to} (${fmtDate(b.date, 'es')}, ${b.pax} pasajeros) tiene un precio de ${usd(n)} (${crc(n, settings.exchangeRate)}). Código ${b.code}. ¿Lo confirmamos?`;
  return (
    <div className="quote-box">
      <input type="number" inputMode="decimal" placeholder="Precio en USD" value={price} onChange={(e) => setPrice(e.target.value)} />
      <a
        className={'btn-gold small-btn' + (n > 0 ? '' : ' disabled')}
        href={n > 0 ? waLink(b.customer.phone, msg) : undefined}
        target="_blank"
        rel="noreferrer"
        onClick={() => { if (n > 0) updateBooking(b.id, { total: n, status: 'pending' }); }}
      >
        Guardar y enviar precio
      </a>
    </div>
  );
}

// ---------- Asignar unidad y chofer a una reserva ----------
function Assign({ b, bookings, fleet, drivers, tours, settings, onChange }) {
  const clashes = bookings.filter((x) => overlaps(b, x, tours, settings));
  const unitBusy = (id) => clashes.find((x) => x.unitId === id);
  const driverBusy = (id) => clashes.find((x) => x.driverId === id);
  const people = peopleOf(b);
  const units = fleet.filter((u) => u.status === 'active' && (vehicleTypes.find((v) => v.id === u.typeId)?.capacity || 0) >= people);
  const unit = fleet.find((u) => u.id === b.unitId);
  const driver = drivers.find((d) => d.id === b.driverId);
  const typeName = (u) => vehicleTypes.find((v) => v.id === u.typeId)?.name.es || '';
  return (
    <div className="assign">
      <Field label="Vehículo">
        <select value={b.unitId || ''} onChange={(e) => onChange({ unitId: e.target.value || null })}>
          <option value="">— Sin asignar —</option>
          {unit && !units.includes(unit) && <option value={unit.id}>{unit.plate} · {typeName(unit)} (no disponible)</option>}
          {units.map((u) => {
            const busy = unitBusy(u.id);
            return <option key={u.id} value={u.id} disabled={!!busy}>{u.plate} · {typeName(u)}{busy ? ` (ocupado ${busy.code})` : ''}</option>;
          })}
        </select>
      </Field>
      <Field label="Chofer">
        <select value={b.driverId || ''} onChange={(e) => onChange({ driverId: e.target.value || null })}>
          <option value="">— Sin asignar —</option>
          {drivers.filter((d) => d.active !== false || d.id === b.driverId).map((d) => {
            const busy = driverBusy(d.id);
            return <option key={d.id} value={d.id} disabled={!!busy}>{d.name}{busy ? ` (ocupado ${busy.code})` : ''}</option>;
          })}
        </select>
      </Field>
      {driver && unit && (
        <a className="small gold" href={waLink(driver.phone, `Hola ${driver.name}, viaje ${b.code}: ${fmtDate(b.date, 'es')} ${fmtTime(b.time, 'es')}. ${b.type === 'tour' ? 'Recoger en ' + (b.hotel || '') + ' para ' + b.tourName.es : b.from + ' → ' + b.to}${b.flight ? ', vuelo ' + b.flight : ''}${b.notes ? '. Nota: ' + b.notes : ''}. Cliente: ${b.customer.name} (${b.customer.phone}), ${people} personas. Unidad ${unit.plate}.`)} target="_blank" rel="noreferrer">
          Enviar el viaje al chofer por WhatsApp ↗
        </a>
      )}
    </div>
  );
}

// ---------- Flota y choferes ----------
function Fleet({ nav }) {
  const { fleet, setFleet, drivers, setDrivers } = useStore();
  const upU = (id, k, v) => setFleet((l) => l.map((u) => (u.id === id ? { ...u, [k]: v } : u)));
  const upD = (id, k, v) => setDrivers((l) => l.map((d) => (d.id === id ? { ...d, [k]: v } : d)));
  const privateTypes = vehicleTypes.filter((v) => !v.perPerson);
  return (
    <>
      <p className="muted small">Cada vehículo con su placa. Si lo marcas <strong>En taller</strong>, los clientes no lo pueden reservar. Si no tienes ninguna unidad de un tipo, ese tipo no se ofrece. Los cambios se guardan solos.</p>
      <h3 className="section">Vehículos</h3>
      {fleet.map((u) => (
        <div key={u.id} className={'card form' + (u.status === 'shop' ? ' paused' : '')}>
          <div className="grid2">
            <Field label="Tipo">
              <select value={u.typeId} onChange={(e) => upU(u.id, 'typeId', e.target.value)}>{privateTypes.map((v) => <option key={v.id} value={v.id}>{v.name.es}</option>)}</select>
            </Field>
            <Field label="Placa"><input value={u.plate} onChange={(e) => upU(u.id, 'plate', e.target.value.toUpperCase())} /></Field>
          </div>
          <div className="grid2">
            <button className={u.status === 'shop' ? 'btn-gold' : 'btn-outline'} onClick={() => upU(u.id, 'status', u.status === 'shop' ? 'active' : 'shop')}>
              {u.status === 'shop' ? '🔧 En taller (tocar para activar)' : '✅ Disponible'}
            </button>
            <button className="btn-outline danger-outline" onClick={() => setFleet((l) => l.filter((x) => x.id !== u.id))}>Quitar</button>
          </div>
        </div>
      ))}
      <button className="btn-gold" onClick={() => setFleet((l) => [...l, { id: 'u' + Date.now(), typeId: 'van6', plate: '', status: 'active' }])}>+ Agregar vehículo</button>

      <h3 className="section">Choferes</h3>
      {drivers.map((d) => (
        <div key={d.id} className={'card form' + (d.active === false ? ' paused' : '')}>
          <Field label="Nombre"><input value={d.name} onChange={(e) => upD(d.id, 'name', e.target.value)} /></Field>
          <div className="grid2">
            <Field label="WhatsApp"><input value={d.phone} inputMode="tel" onChange={(e) => upD(d.id, 'phone', e.target.value)} /></Field>
            <Field label="Idiomas"><input value={d.languages} onChange={(e) => upD(d.id, 'languages', e.target.value)} /></Field>
          </div>
          <div className="grid2">
            <button className="btn-outline" onClick={() => upD(d.id, 'active', d.active === false)}>{d.active === false ? 'Activar' : 'Pausar (vacaciones)'}</button>
            <button className="btn-outline danger-outline" onClick={() => setDrivers((l) => l.filter((x) => x.id !== d.id))}>Quitar</button>
          </div>
        </div>
      ))}
      <button className="btn-gold" onClick={() => setDrivers((l) => [...l, { id: 'd' + Date.now(), name: '', phone: '', languages: 'ES', active: true }])}>+ Agregar chofer</button>
    </>
  );
}

// ---------- Lugares (aeropuertos, hoteles, zonas) ----------
function Places({ nav }) {
  const { places, setPlaces, removePlace, renamePlace, rates } = useStore();
  const [name, setName] = useState('');
  const [edit, setEdit] = useState({});
  const add = () => {
    const n = name.trim();
    if (!n || places.includes(n)) return;
    setPlaces((l) => [...l, n]);
    setName('');
    nav.toast('Lugar agregado');
  };
  return (
    <>
      <p className="muted small">Son los lugares que el cliente ve en Origen y Destino. Para que un lugar nuevo tenga precio, agrégale una ruta en <strong>Tarifas</strong>; si no tiene ruta, el cliente puede pedir cotización. Escribe "Aeropuerto …" al inicio para que en inglés salga como "… Airport".</p>
      <div className="coupon">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Hotel Tabacón, Puerto Viejo" />
        <button className="btn-gold small-btn" onClick={add}>Agregar</button>
      </div>
      <div className="card list">
        {places.map((z) => {
          const used = rates.filter((r) => r.from === z || r.to === z).length;
          return (
            <div key={z} className="info place-row">
              <input value={edit[z] ?? z} onChange={(e) => setEdit({ ...edit, [z]: e.target.value })}
                onBlur={() => { const n = (edit[z] ?? z).trim(); if (n && n !== z && !places.includes(n)) { renamePlace(z, n); nav.toast('Nombre cambiado'); } setEdit({ ...edit, [z]: undefined }); }} />
              <small className="muted">{used} rutas</small>
              <button className="chip" disabled={used > 0} title={used ? 'Primero quita sus rutas en Tarifas' : ''} onClick={() => removePlace(z)}>Quitar</button>
            </div>
          );
        })}
      </div>
      <p className="muted small">Un lugar con rutas no se puede quitar: primero quita sus rutas en Tarifas.</p>
    </>
  );
}
