import { useEffect, useRef, useState } from 'react';
import { useStore, findRate, waLink } from './store.jsx';
import { vehicleTypes } from './data.js';
import { askAssistant } from './cloud.js';
import { Icon } from './ui.jsx';

const KEY = 'tourride-cr-chat';

// Burbuja de chat con el asistente de IA. Solo aparece si el dueño lo enciende en Panel → Ajustes.
export default function Assistant({ nav, raised }) {
  const { t, lang, settings, rates } = useStore();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch (e) { /* ignorar */ } }, [msgs]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy, open]);

  const wa = waLink(settings.whatsapp, lang === 'en' ? 'Hi, I have a question about TourRide CR.' : 'Hola, tengo una consulta sobre TourRide CR.');

  const send = async (q) => {
    const content = (q ?? text).trim();
    if (!content || busy) return;
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next);
    setText('');
    setBusy(true);
    const res = await askAssistant(next.filter((m) => !m.error).map(({ role, content: c }) => ({ role, content: c })), lang);
    setBusy(false);
    if (res.error || !res.reply) {
      const key = res.error === 'limit' || res.error === 'busy' ? 'aiLimit' : 'aiDown';
      setMsgs([...next, { role: 'assistant', content: t(key), error: true }]);
    } else {
      setMsgs([...next, { role: 'assistant', content: res.reply, action: res.action || undefined }]);
    }
  };

  // Abre el formulario de reserva ya lleno con lo que se habló; el cliente revisa y confirma.
  const review = (a) => {
    setOpen(false);
    if (a.type === 'tour') {
      nav.push({ name: 'bookTour', id: a.tourId, init: { date: a.date, time: a.time, adults: a.adults, kids: a.kids, pickup: a.pickup } });
    } else {
      const v = vehicleTypes.find((x) => x.id === a.vehicleId);
      const unit = Number(findRate(rates, a.from, a.to)?.[a.vehicleId] || 0);
      const price = unit ? (v?.perPerson ? unit * a.pax : unit) : 0;
      nav.push({ name: 'bookTransfer', draft: { from: a.from, to: a.to, date: a.date, time: a.time, flight: a.flight || '', pax: a.pax, bags: a.bags, vehicleId: a.vehicleId, price, unit, quote: !unit } });
    }
  };

  if (!open) {
    return (
      <button className={'chat-fab' + (raised ? ' raised' : '')} onClick={() => setOpen(true)} aria-label={t('aiTitle')}>
        <span aria-hidden="true">💬</span><span className="chat-fab-label">{t('aiFab')}</span>
      </button>
    );
  }

  return (
    <div className="chat-panel" role="dialog" aria-label={t('aiTitle')}>
      <div className="chat-head">
        <div>
          <strong>{t('aiTitle')}</strong>
          <div className="muted small">{t('aiSub')}</div>
        </div>
        <div className="chat-head-btns">
          {msgs.length > 0 && <button className="link small" onClick={() => setMsgs([])}>{t('aiNew')}</button>}
          <button className="round" onClick={() => setOpen(false)} aria-label={t('close')}>×</button>
        </div>
      </div>
      <div className="chat-body">
        <div className="bubble bot">{t('aiHello')}</div>
        {msgs.length === 0 && (
          <div className="chat-suggest">
            {['aiQ1', 'aiQ2', 'aiQ3'].map((k) => <button key={k} className="chip" onClick={() => send(t(k))}>{t(k)}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={'bubble ' + (m.role === 'user' ? 'me' : 'bot')}>
            {m.content}
            {m.error && <a className="btn-outline small-btn chat-wa" href={wa} target="_blank" rel="noreferrer"><Icon.whatsapp /> WhatsApp</a>}
            {m.action && i === msgs.length - 1 && <button className="btn-gold small-btn chat-cta" onClick={() => review(m.action)}>{t('aiReview')}</button>}
          </div>
        ))}
        {busy && <div className="bubble bot typing"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} maxLength={1000} placeholder={t('aiPlaceholder')} onChange={(e) => setText(e.target.value)} />
        <button className="btn-gold small-btn" disabled={busy || !text.trim()}>{t('aiSend')}</button>
      </form>
      <p className="chat-foot muted">{t('aiNote')} · <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a></p>
    </div>
  );
}
