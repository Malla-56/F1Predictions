// A small two-or-more way switch, e.g. "Tips | Fantasy". options: [{ value, label }].
export default function SegToggle({ options, value, onChange, label }) {
  return (
    <div className="seg-toggle" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'on' : ''}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
