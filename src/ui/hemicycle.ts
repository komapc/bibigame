// 120-seat hemicycle as SVG. Seats are laid out once; colours per render.
export interface SeatParty { id: string; color: string; seats: number; position: number; inCoalition: boolean }

const ROWS = 6;
let layout: { x: number; y: number; a: number }[] | null = null;

function computeLayout(total: number) {
  const radii = Array.from({ length: ROWS }, (_, i) => 0.42 + (i * 0.58) / (ROWS - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.floor((total * r) / sum));
  let left = total - counts.reduce((a, b) => a + b, 0);
  for (let i = ROWS - 1; left > 0; i = (i - 1 + ROWS) % ROWS, left--) counts[i]++;
  const pts: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, i) => {
    const n = counts[i];
    for (let k = 0; k < n; k++) {
      const a = Math.PI - (Math.PI * (k + 0.5)) / n;
      pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), a });
    }
  });
  pts.sort((p, q) => q.a - p.a);
  return pts;
}

export function hemicycleSvg(parties: SeatParty[], total = 120): string {
  layout ??= computeLayout(total);
  const ordered = parties.filter((p) => p.seats > 0).sort((a, b) => a.position - b.position);
  const colors: { color: string; on: boolean }[] = [];
  for (const p of ordered) for (let i = 0; i < p.seats; i++) colors.push({ color: p.color, on: p.inCoalition });
  const dots = layout.map((pt, i) => {
    const c = colors[i] ?? { color: '#888', on: false };
    return `<circle cx="${(pt.x * 100).toFixed(1)}" cy="${(-pt.y * 100).toFixed(1)}" r="4.2" fill="${c.color}" ${c.on ? '' : 'fill-opacity="0.22"'}/>`;
  });
  return `<svg class="hemi" viewBox="-106 -106 212 112" role="img" aria-label="Knesset seats">${dots.join('')}</svg>`;
}
