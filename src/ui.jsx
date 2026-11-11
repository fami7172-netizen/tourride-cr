import { useEffect, useState } from 'react';
import QRCodeLib from 'qrcode';

export const Icon = {
  car: (p) => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 16V11l2-5h10l2 5v5" /><path d="M3 16h18v3h-3v-1H6v1H3z" /><circle cx="7.5" cy="13.5" r="1" /><circle cx="16.5" cy="13.5" r="1" />
    </svg>
  ),
  compass: (p) => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  ),
  calendar: (p) => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  ),
  user: (p) => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </svg>
  ),
  plane: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2 13l8-1 5-8h2l-2 8 5 1v2l-5 1 2 6h-2l-5-6-8-1z" />
    </svg>
  ),
  pin: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" />
    </svg>
  ),
  clock: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12l5 5 9-10" />
    </svg>
  ),
  back: (p) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  search: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
    </svg>
  ),
  users: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.7-3.5 3.2-5 6.5-5s5.8 1.5 6.5 5" /><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2 .6 3.2 2.2 3.5 5" />
    </svg>
  ),
  bag: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="5" y="7" width="14" height="13" rx="2" /><path d="M9 7V4h6v3M9 11v5M15 11v5" />
    </svg>
  ),
  leaf: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15z" /><path d="M5 19l8-8" />
    </svg>
  ),
  whatsapp: (p) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...p}>
      <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.7-1.2 2.2 2.2 0 00.2-1.2c-.1-.1-.3-.2-.5-.3z" />
    </svg>
  ),
};

export function Counter({ label, icon, value, onChange, min = 0, max = 45 }) {
  return (
    <div className="counter card">
      <div className="counter-label">{icon}{label}</div>
      <div className="counter-row">
        <span className="counter-value">{value}</span>
        <div className="counter-btns">
          <button type="button" className="round" aria-label="-" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
          <button type="button" className="round" aria-label="+" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
        </div>
      </div>
    </div>
  );
}

export function QR({ value, size = 200 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCodeLib.toDataURL(value, { width: size * 2, margin: 1, color: { dark: '#0b2a1f', light: '#f4ebdd' }, errorCorrectionLevel: 'M' })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt={value} className="qr" /> : <div style={{ width: size, height: size }} />;
}

export function Modal({ children, onClose }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Toast({ text }) {
  if (!text) return null;
  return <div className="toast">{text}</div>;
}
