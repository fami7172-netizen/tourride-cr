import { useState } from 'react';
import { useStore, usd, crc, fmtDate, fmtTime, waLink } from './store.jsx';
import { vehicleTypes, zones } from './data.js';
import { Icon, Field, Modal } from './ui.jsx';

// Panel del dueño (solo en español). Entrar desde Perfil → Panel del dueño (PIN inicial 1234).
const sections = [
  ['summary', 'Resumen'],
  ['bookings', 'Reservas'],
  ['tours', 'Tours'],
  ['partners', 'Socios'],
  ['rates', 'Tarifas'],
  ['settings', 'Ajustes'],
];

export default function Admin({ nav }) {
  const [sec, setSec] = useState('summary');
  return (
    <div className="pad stack admin narrow-wide">
      <div className="topbar">
        <button className="round" onClick={nav.back} aria-label="Atrás"><Icon.back /></button>
        <h2>Panel del dueño</h2>
      </div>
      <div className="chips scroll-x">
        {sections.map(([id, label]) => (
          <button key={id} className={'chip' + (sec === id ? ' on' : '')} onClick={() => setSec(id)}>{label}</button>
        ))}
      </div>
      {sec === 'summary' && <Summary />}
      {sec === 'bookings' && <Bookings />}
      {sec === 'tours' && <Tours nav={nav} />}
      {sec === 'partners' && <Partners nav={nav} />}
      {sec === 'rates' && <Rates nav={nav} />}
      {sec === 'settings' && <Settings nav={nav} />}
    </div>
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
  return (
    <>
      <div className="card note small">
        Etapa 1: las reservas se guardan solo en este celular. En la etapa 2 las conectamos a la nube para que veas las de todos tus clientes.
      </div>
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

function Bookings() {
  const { bookings, updateBooking, partners } = useStore();
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
            <div className="small">👤 {b.customer.name} · {b.customer.phone} · {b.payment === 'sinpe' ? 'SINPE' : 'Efectivo'}</div>
            <div className="bi-top">
              <strong>{b.status === 'quote' ? 'Por cotizar' : usd(b.total)}{b.commission ? <small className="muted"> · comisión {usd(b.commission)}</small> : null}</strong>
              <select value={b.status} onChange={(e) => updateBooking(b.id, { status: e.target.value })}>
                {statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {b.status === 'quote' && <QuoteBox b={b} />}
            <a className="small gold" href={waLink(b.customer.phone, `Hola ${b.customer.name}, te escribimos de TourRide CR sobre tu reserva ${b.code}.`)} target="_blank" rel="noreferrer">Escribir al cliente por WhatsApp ↗</a>
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
  const { tours, setTours } = useStore();
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
            <div className="muted small">{x.location} · {usd(x.priceAdult)} / {usd(x.priceChild)} · {x.active ? 'Visible' : 'Oculto'}</div>
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
          <select value={f.partnerId} onChange={set('partnerId')}>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
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
  const { partners, setPartners } = useStore();
  const update = (id, k, v) => setPartners((l) => l.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  return (
    <>
      <button className="btn-gold" onClick={() => setPartners((l) => [...l, { id: 'p' + Date.now(), name: 'Nuevo socio', contact: '', whatsapp: '', commission: 20, active: true }])}>+ Agregar socio</button>
      {partners.map((p) => (
        <div key={p.id} className="card form">
          <Field label="Empresa"><input value={p.name} onChange={(e) => update(p.id, 'name', e.target.value)} /></Field>
          <div className="grid2">
            <Field label="Contacto"><input value={p.contact} onChange={(e) => update(p.id, 'contact', e.target.value)} /></Field>
            <Field label="WhatsApp"><input value={p.whatsapp} inputMode="tel" onChange={(e) => update(p.id, 'whatsapp', e.target.value)} /></Field>
            <Field label="Comisión (%)"><input type="number" value={p.commission} onChange={(e) => update(p.id, 'commission', Number(e.target.value))} /></Field>
          </div>
          {p.whatsapp && <a className="small gold" href={waLink(p.whatsapp, `Hola ${p.contact}, te escribo de TourRide CR.`)} target="_blank" rel="noreferrer">Escribir por WhatsApp ↗</a>}
        </div>
      ))}
      <p className="muted small">Los cambios se guardan solos.</p>
    </>
  );
}

function Rates({ nav }) {
  const { rates, setRates } = useStore();
  const update = (id, k, v) => setRates((l) => l.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  return (
    <>
      <p className="muted small">Precio en USD. Vehículos privados: precio por viaje. Shuttle compartido y lancha: precio por persona. Pon 0 si ese transporte no va por esa ruta. La ruta sirve en ambos sentidos y los cambios se guardan solos.</p>
      <button className="btn-gold" onClick={() => setRates((l) => [...l, { id: 'r' + Date.now(), from: zones[0], to: zones[3], sedan: 0, van6: 0, van15: 0, coaster: 0, bus: 0 }])}>+ Agregar ruta</button>
      {rates.map((r) => (
        <div key={r.id} className="card form">
          <div className="grid2">
            <Field label="Desde"><select value={r.from} onChange={(e) => update(r.id, 'from', e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select></Field>
            <Field label="Hasta"><select value={r.to} onChange={(e) => update(r.id, 'to', e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select></Field>
            {vehicleTypes.map((v) => (
              <Field key={v.id} label={v.name.es + (v.perPerson ? ' (por persona)' : '')}><input type="number" value={r[v.id]} onChange={(e) => update(r.id, v.id, Number(e.target.value))} /></Field>
            ))}
          </div>
          <button className="link danger" onClick={() => setRates((l) => l.filter((x) => x.id !== r.id))}>Quitar ruta</button>
        </div>
      ))}
    </>
  );
}

function Settings({ nav }) {
  const { settings, setSettings, resetDemo } = useStore();
  const [f, setF] = useState({ ...settings, couponsText: Object.entries(settings.coupons).map(([k, v]) => `${k}=${v}`).join('\n') });
  const [ask, setAsk] = useState(false);
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
        <Field label="Tipo de cambio (₡ por $)"><input type="number" value={f.exchangeRate} onChange={set('exchangeRate', true)} /></Field>
        <Field label="Transporte hotel ($/persona)"><input type="number" value={f.hotelPickupPerPerson} onChange={set('hotelPickupPerPerson', true)} /></Field>
        <Field label="Salidas del shuttle (ej: 07:30, 14:00)"><input value={(f.shuttleTimes || []).join(', ')} onChange={(e) => setF({ ...f, shuttleTimes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
        <Field label="PIN del panel"><input value={f.adminPin} inputMode="numeric" onChange={set('adminPin')} /></Field>
      </div>
      <label className="toggle"><input type="checkbox" checked={f.highSeason} onChange={(e) => setF({ ...f, highSeason: e.target.checked })} /> Temporada alta (usa precios altos)</label>
      <Field label="Cupones (CÓDIGO=porcentaje, uno por línea)"><textarea rows="3" value={f.couponsText} onChange={set('couponsText')} /></Field>
      <button className="btn-gold" onClick={save}>Guardar ajustes</button>
      <button className="link danger" onClick={() => setAsk(true)}>Borrar todo y volver a los datos de ejemplo</button>
      {ask && (
        <Modal onClose={() => setAsk(false)}>
          <p>Esto borra todas las reservas y cambios guardados en este celular. ¿Seguro?</p>
          <div className="grid2">
            <button className="btn-outline" onClick={() => setAsk(false)}>No</button>
            <button className="btn-gold danger-bg" onClick={() => { resetDemo(); setAsk(false); nav.back(); }}>Sí, borrar</button>
          </div>
        </Modal>
      )}
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
