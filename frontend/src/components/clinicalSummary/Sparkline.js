/** A tiny line of the last few readings. It carries no scale: it only shows which way a value has been going. */
export default function Sparkline({ points, width = 84, height = 24, label }) {
  const values = (points || []).map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const coords = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`);
  const last = coords[coords.length - 1].split(",");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label || "Trend"} data-testid="sparkline">
      <polyline points={coords.join(" ")} fill="none" stroke="#546e7a" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill="#37474f" />
    </svg>
  );
}
