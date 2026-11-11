import { photos } from './photos.js';

// Ilustraciones en SVG (no dependen de internet). Se pueden cambiar por fotos reales en la etapa 2.
const palettes = {
  volcano: ['#f6c177', '#e7865a', '#2d6a4f'],
  kayak: ['#9be3f5', '#3fb7c9', '#1d7f8c'],
  sloth: ['#cfe8c9', '#6fae7a', '#1f5a3a'],
  jungle: ['#b9e4b5', '#4c9a5d', '#174a2f'],
  river: ['#ffd89b', '#7fb77e', '#2f6f4f'],
  reef: ['#a8ecff', '#27a2c4', '#0d5f7a'],
  coffee: ['#f4d9a6', '#8fb36b', '#4a6b32'],
  waterfall: ['#c9f1f5', '#58c6d1', '#2c7a6b'],
  beach: ['#ffe0a3', '#5cc6d6', '#1b6f5c'],
};

export default function Scene({ scene = 'jungle', photo, noPhoto, className = '', height = 140, rounded = 16, children }) {
  const src = noPhoto ? null : photos[photo] || photos[scene];
  if (src) {
    return (
      <div className={"scene " + className} style={{ height, borderRadius: rounded }}>
        <img src={src} alt="" className="scene-photo" loading="lazy" />
        {children}
      </div>
    );
  }
  const [sky, mid, ground] = palettes[scene] || palettes.jungle;
  const id = 'g' + scene;
  return (
    <div className={"scene " + className} style={{ height, borderRadius: rounded }}>
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky} />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <rect width="400" height="200" fill={`url(#${id})`} />
        {scene === 'volcano' && (
          <>
            <circle cx="320" cy="50" r="22" fill="#fff4c2" />
            <path d="M120 200 L210 55 Q220 45 232 55 L330 200 Z" fill="#5b4a3f" />
            <path d="M200 70 Q220 50 240 70 L232 55 Q220 45 210 55 Z" fill="#3f332c" />
            <path d="M212 50 Q205 30 225 22 Q240 10 255 25" stroke="#ffffffaa" strokeWidth="8" fill="none" strokeLinecap="round" />
          </>
        )}
        {scene === 'reef' || scene === 'kayak' || scene === 'beach' ? (
          <>
            <circle cx="70" cy="50" r="20" fill="#fff4c2" />
            <path d="M0 120 Q100 105 200 120 T400 115 V200 H0 Z" fill={mid} />
            <path d="M0 145 Q100 130 200 145 T400 140 V200 H0 Z" fill={ground} opacity="0.85" />
            {scene === 'kayak' && (
              <g>
                <ellipse cx="220" cy="128" rx="55" ry="8" fill="#f2b632" />
                <circle cx="200" cy="112" r="7" fill="#e85d3f" />
                <circle cx="240" cy="112" r="7" fill="#e85d3f" />
                <line x1="175" y1="95" x2="265" y2="135" stroke="#333" strokeWidth="3" />
              </g>
            )}
            {scene === 'reef' && (
              <g fill="#ffffffcc">
                <path d="M150 165 q15 -10 30 0 q-15 10 -30 0 z" />
                <path d="M250 175 q12 -8 24 0 q-12 8 -24 0 z" />
                <circle cx="300" cy="160" r="3" /><circle cx="310" cy="150" r="2" />
              </g>
            )}
          </>
        ) : null}
        {['sloth', 'jungle', 'coffee', 'river', 'waterfall', 'volcano'].includes(scene) && (
          <>
            <path d="M0 150 Q80 120 160 145 T320 135 T400 140 V200 H0 Z" fill={mid} />
            <path d="M0 170 Q100 150 200 170 T400 165 V200 H0 Z" fill={ground} />
          </>
        )}
        {(scene === 'sloth' || scene === 'jungle') && (
          <g>
            <rect x="60" y="40" width="10" height="130" fill="#4a3426" />
            <circle cx="65" cy="40" r="40" fill={ground} />
            <rect x="320" y="30" width="10" height="140" fill="#4a3426" />
            <circle cx="325" cy="35" r="45" fill={ground} />
            {scene === 'jungle' && <line x1="70" y1="70" x2="325" y2="60" stroke="#333" strokeWidth="2" />}
            {scene === 'jungle' && <circle cx="200" cy="72" r="7" fill="#f2b632" />}
            {scene === 'sloth' && (
              <g>
                <line x1="70" y1="85" x2="320" y2="80" stroke="#4a3426" strokeWidth="6" />
                <ellipse cx="200" cy="100" rx="26" ry="18" fill="#a68a6d" />
                <circle cx="200" cy="96" r="12" fill="#e9d8bf" />
                <ellipse cx="195" cy="95" rx="4" ry="2.5" fill="#3a2a20" />
                <ellipse cx="205" cy="95" rx="4" ry="2.5" fill="#3a2a20" />
              </g>
            )}
          </g>
        )}
        {scene === 'coffee' && (
          <g fill="#2f5a22">
            {[40, 100, 160, 220, 280, 340].map((x) => (
              <circle key={x} cx={x} cy="150" r="20" />
            ))}
            {[40, 100, 160, 220, 280, 340].map((x) => (
              <circle key={'b' + x} cx={x + 6} cy="145" r="3.5" fill="#c0392b" />
            ))}
          </g>
        )}
        {scene === 'river' && <path d="M140 200 Q180 160 230 150 Q270 145 300 120 L320 125 Q290 160 250 170 Q210 180 200 200 Z" fill="#7fc8d6" />}
        {scene === 'waterfall' && (
          <>
            <rect x="170" y="30" width="60" height="140" fill="#5a6b55" />
            <rect x="185" y="30" width="30" height="140" fill="#d9f7fb" />
            <ellipse cx="200" cy="175" rx="90" ry="18" fill="#56c7d6" />
          </>
        )}
      </svg>
      {children}
    </div>
  );
}
