const COLORS = [
  '#e10600','#00b3a6','#ff7a1a','#7d8aff','#ffd23a',
  '#3a7bff','#9b6bff','#54e08a','#ff4d8b','#c0c5ce',
];

function accentFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

export default function Avatar({ displayName, size = 32, isMe = false }) {
  const initials = (displayName || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  const accent = accentFor(displayName || '');

  return (
    <div
      className={`avatar${isMe ? ' me' : ''}`}
      style={{
        width: size, height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, ${accent}33, ${accent}11)`,
        color: accent,
      }}
    >
      {initials}
    </div>
  );
}
