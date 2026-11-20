import { useEffect, useRef, useState } from 'react';
import { useStore, usd, waLink } from './store.jsx';
import { vehicleTypes } from './data.js';
import { Icon } from './ui.jsx';

// Preguntas frecuentes sin IA: botones con respuestas armadas con los datos del panel
// (tarifas, política de cancelación, recogida en hotel...). Si el dueño cambia un dato, la respuesta cambia sola.
const KEY = 'tourride-cr-faq';
const PRIVATE = ['sedan', 'suv', 'van6', 'van15', 'coaster', 'bus'];
const short = (z) => (z.startsWith('Aeropuerto ') ? z.slice(11) : z);

const TXT = {
  es: {
    title: 'Preguntas frecuentes', sub: 'Respuestas al instante',
    hello: '¡Hola! 👋 Toca una pregunta y te respondo al instante. Si no está aquí, escríbenos por WhatsApp.',
    more: 'Otras preguntas', restart: 'Empezar de nuevo', wa: 'Escríbenos por WhatsApp', waMsg: 'Hola, tengo una consulta sobre ',
    qPrice: '¿Cuánto cuesta un traslado desde el aeropuerto?', qIncl: '¿Qué incluye un tour?', qPay: '¿Cómo pago?', qCancel: '¿Puedo cancelar?',
    qPickup: '¿Me recogen en el hotel?', qBags: '¿Cuánto equipaje puedo llevar?', qFind: '¿Cómo veo mi reserva?',
    price: 'Precio por viaje completo (no por persona), en vehículo privado con chofer:', priceFrom: 'desde', priceEnd: 'El precio exacto depende del vehículo y lo ves al instante al cotizar, sin dar tus datos.',
    priceCta: 'Cotizar mi traslado',
    incl: 'Cada tour muestra antes de reservar qué incluye, qué llevar, el punto de encuentro, el idioma y la duración.', inclEx: 'Por ejemplo, «{tour}» incluye:', inclCta: 'Ver los tours',
    pay: 'Puedes pagar con:', payDeposit: 'Para confirmar se paga un depósito del {n}%.', payEnd: 'Al reservar recibes tu código y te confirmamos por WhatsApp.',
    cancelCta: 'Ver la política completa',
    pickupTour: 'En los tours puedes pedir que te recojamos en tu hotel por {p} por persona; lo eliges al reservar.', pickupTourNo: 'En cada tour verás si incluye recogida en hotel o el punto de encuentro.',
    pickupTransfer: 'Los traslados privados son puerta a puerta: te recogemos en el aeropuerto o tu hotel y te dejamos en tu destino.',
    bags: 'Equipaje según el vehículo (maletas grandes):', bagsLine: '{v}: hasta {b}', bagsEnd: 'Si llevas tabla de surf, silla de bebé o equipaje grande, anótalo en «Comentario» al reservar.',
    find: 'En «Mis reservas» escribe el código que recibiste (TR-12345) y tu teléfono. Verás tu reserva y su código QR desde cualquier celular o computadora.', findCta: 'Consultar mi reserva',
  },
  en: {
    title: 'Frequently asked questions', sub: 'Instant answers',
    hello: "Hi! 👋 Tap a question and I'll answer right away. If it's not here, message us on WhatsApp.",
    more: 'More questions', restart: 'Start over', wa: 'Message us on WhatsApp', waMsg: 'Hi, I have a question about ',
    qPrice: 'How much is an airport transfer?', qIncl: "What's included in a tour?", qPay: 'How do I pay?', qCancel: 'Can I cancel?',
    qPickup: 'Do you pick me up at my hotel?', qBags: 'How much luggage can I bring?', qFind: 'How do I check my booking?',
    price: 'Price per trip (not per person), in a private vehicle with driver:', priceFrom: 'from', priceEnd: 'The exact price depends on the vehicle, and you see it instantly when you get a quote, no personal details needed.',
    priceCta: 'Get my transfer price',
    incl: 'Every tour shows what is included, what to bring, the meeting point, the language and the duration before you book.', inclEx: 'For example, “{tour}” includes:', inclCta: 'See the tours',
    pay: 'You can pay with:', payDeposit: 'A {n}% deposit confirms your booking.', payEnd: 'When you book you get your code and we confirm on WhatsApp.',
    cancelCta: 'See the full policy',
    pickupTour: 'On tours we can pick you up at your hotel for {p} per person; you choose it when booking.', pickupTourNo: 'Each tour shows whether hotel pickup is included or where to meet.',
    pickupTransfer: 'Private transfers are door to door: we pick you up at the airport or your hotel and drop you at your destination.',
    bags: 'Luggage by vehicle (large suitcases):', bagsLine: '{v}: up to {b}', bagsEnd: 'If you bring a surfboard, a baby seat or oversized luggage, add it under “Comment” when booking.',
    find: 'In “My bookings”, enter the code you received (TR-12345) and your phone number. You will see your booking and its QR code from any phone or computer.', findCta: 'Check my booking',
  },
};
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export default function Faq({ nav, raised }) {
  const { t, lang, settings, rates, tours } = useStore();
  const L = TXT[lang] || TXT.es;
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  });
  const lastRef = useRef(null);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(asked)); } catch (e) { /* ignorar */ } }, [asked]);
  // al responder, se ve la pregunta y el comienzo de la respuesta (no el final)
  useEffect(() => { if (asked.length) lastRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [asked, open]);

  const go = (fn) => () => { setOpen(false); fn(); };
  const toForm = () => { nav.reset('transfers'); setTimeout(() => document.getElementById('reservar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350); };

  // Respuestas armadas con los datos actuales; si falta un dato, esa pregunta no aparece.
  const items = [];
  const airport = rates
    .filter((r) => /^Aeropuerto /.test(r.from) || /^Aeropuerto /.test(r.to))
    .map((r) => {
      const min = Math.min(...PRIVATE.map((v) => Number(r[v]) || 0).filter((n) => n > 0));
      const [a, b] = /^Aeropuerto /.test(r.from) ? [r.from, r.to] : [r.to, r.from];
      return Number.isFinite(min) ? `• ${short(a)} → ${b}: ${L.priceFrom} ${usd(min)}` : null;
    })
    .filter(Boolean).slice(0, 5);
  if (airport.length) items.push({ id: 'price', q: L.qPrice, a: [L.price, ...airport, '', L.priceEnd].join('\n'), cta: [L.priceCta, toForm] });

  const ex = tours.find((x) => x.active !== false && x.featured && x.includes?.[lang]?.length) || tours.find((x) => x.active !== false && x.includes?.[lang]?.length);
  if (tours.length) {
    items.push({
      id: 'incl', q: L.qIncl,
      a: [L.incl, ...(ex ? ['', fill(L.inclEx, { tour: ex.name[lang] }), ...ex.includes[lang].slice(0, 6).map((x) => '• ' + x)] : [])].join('\n'),
      cta: [L.inclCta, () => nav.reset('explore')],
    });
  }

  const pays = [...((settings.sinpe || settings.whatsapp) ? [t('paySinpe')] : []), t('payCash'), t('payCard')];
  items.push({ id: 'pay', q: L.qPay, a: [L.pay, ...pays.map((x) => '• ' + x), '', ...(Number(settings.depositPct) > 0 ? [fill(L.payDeposit, { n: settings.depositPct })] : []), L.payEnd].join('\n') });

  const policy = settings.cancelPolicy?.[lang]?.trim();
  items.push({ id: 'cancel', q: L.qCancel, a: [policy || t('cancelNone'), '', t('cancelHow')].join('\n'), cta: [L.cancelCta, () => nav.push({ name: 'info', id: 'cancelacion' })] });

  const pick = Number(settings.hotelPickupPerPerson) || 0;
  items.push({ id: 'pickup', q: L.qPickup, a: [L.pickupTransfer, '', pick > 0 ? fill(L.pickupTour, { p: usd(pick) }) : L.pickupTourNo].join('\n') });

  const bags = vehicleTypes.filter((v) => PRIVATE.includes(v.id)).map((v) => '• ' + fill(L.bagsLine, { v: v.name[lang], p: v.capacity, b: v.luggage }));
  items.push({ id: 'bags', q: L.qBags, a: [L.bags, ...bags, '', L.bagsEnd].join('\n') });

  items.push({ id: 'find', q: L.qFind, a: L.find, cta: [L.findCta, () => nav.reset('bookings')] });

  const byId = Object.fromEntries(items.map((x) => [x.id, x]));
  const shown = asked.filter((id) => byId[id]);
  const rest = items.filter((x) => !shown.includes(x.id));
  const wa = settings.whatsapp ? waLink(settings.whatsapp, L.waMsg + (settings.businessName || 'TourRide CR') + '.') : '';

  if (!open) {
    return (
      <button className={'chat-fab faq' + (raised ? ' raised' : '')} onClick={() => setOpen(true)} aria-label={L.title}>
        <Icon.chat width="22" height="22" /><span className="chat-fab-label">{lang === 'en' ? 'Questions?' : '¿Preguntas?'}</span>
      </button>
    );
  }

  return (
    <div className="chat-panel faq-panel" role="dialog" aria-label={L.title} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <div className="chat-head">
        <div className="faq-brand">
          <img src="icon-192.png" alt="" width="40" height="40" />
          <div>
            <strong>{L.title}</strong>
            <div className="muted small">{L.sub}</div>
          </div>
        </div>
        <div className="chat-head-btns">
          {shown.length > 0 && <button className="round" onClick={() => setAsked([])} aria-label={L.restart} title={L.restart}>↺</button>}
          <button className="round" onClick={() => setOpen(false)} aria-label={t('close')} autoFocus>×</button>
        </div>
      </div>
      <div className="chat-body" aria-live="polite">
        <div className="bubble bot">{L.hello}</div>
        {shown.map((id, i) => (
          <div key={id} className="faq-pair" ref={i === shown.length - 1 ? lastRef : undefined}>
            <div className="bubble me">{byId[id].q}</div>
            <div className="bubble bot">
              {byId[id].a}
              {byId[id].cta && <button className="btn-gold small-btn chat-cta" onClick={go(byId[id].cta[1])}>{byId[id].cta[0]}</button>}
            </div>
          </div>
        ))}
        {rest.length > 0 && (
          <div className="chat-suggest">
            {shown.length > 0 && <div className="faq-more">{L.more}</div>}
            {rest.map((x) => <button key={x.id} className="chip" onClick={() => setAsked([...shown, x.id])}>{x.q}</button>)}
          </div>
        )}
      </div>
      {wa && (
        <div className="faq-foot">
          <a className="faq-wa" href={wa} target="_blank" rel="noreferrer"><Icon.whatsapp /> {L.wa}</a>
        </div>
      )}
    </div>
  );
}
