// Swipe gesture for the crisis card: drag → preview the side, release past the
// threshold → fly off and choose, otherwise snap back. Pointer events cover
// touch + mouse; arrow keys / edge buttons call flyThenChoose directly.
export type Dir = 'left' | 'right' | 'up' | 'down';

interface Opts {
  root: HTMLElement;
  reduceMotion: boolean;
  canChoose: (dir: Dir) => boolean;
  onPreview: (dir: Dir | null, strength: number) => void;
  onChoose: (dir: Dir) => void;
}

const TH_X = 110;
const TH_Y = 90;

function dirOf(dx: number, dy: number): { dir: Dir; strength: number } {
  if (Math.abs(dx) >= Math.abs(dy)) return { dir: dx < 0 ? 'left' : 'right', strength: Math.abs(dx) / TH_X };
  return { dir: dy < 0 ? 'up' : 'down', strength: Math.abs(dy) / TH_Y };
}

export function initSwipe(o: Opts) {
  let start: { x: number; y: number; id: number } | null = null;
  let moved = false;
  let suppressClick = false;
  let busy = false;
  const card = () => o.root.querySelector<HTMLElement>('#card');

  const setT = (el: HTMLElement, dx: number, dy: number, animate: boolean) => {
    el.style.transition = animate && !o.reduceMotion ? 'transform .2s ease, opacity .2s ease' : 'none';
    el.style.transform = o.reduceMotion ? '' : `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
  };

  function flyThenChoose(dir: string) {
    const d = dir as Dir;
    if (busy || !o.canChoose(d)) return;
    const el = card();
    if (!el || o.reduceMotion) { o.onChoose(d); return; }
    busy = true;
    o.onPreview(d, 1);
    const far = { left: [-600, 40], right: [600, 40], up: [0, -700], down: [0, 700] }[d];
    setT(el, far[0], far[1], true);
    el.style.opacity = '0';
    window.setTimeout(() => { busy = false; o.onChoose(d); }, 180);
  }

  o.root.addEventListener('pointerdown', (e) => {
    const el = card();
    if (!el || !el.contains(e.target as Node) || busy) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    moved = false;
  });

  o.root.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const el = card();
    if (!el) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 10) return;
    if (!moved) { moved = true; el.setPointerCapture(e.pointerId); el.classList.add('dragging'); }
    e.preventDefault();
    setT(el, dx, dy, false);
    const { dir, strength } = dirOf(dx, dy);
    o.onPreview(dir, strength);
  });

  const end = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const el = card();
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (!moved || !el) return;
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 0);
    el.classList.remove('dragging');
    const { dir, strength } = dirOf(dx, dy);
    if (e.type === 'pointerup' && strength >= 1 && o.canChoose(dir)) flyThenChoose(dir);
    else { setT(el, 0, 0, true); o.onPreview(null, 0); }
    moved = false;
  };
  o.root.addEventListener('pointerup', end);
  o.root.addEventListener('pointercancel', end);

  return {
    dragging: () => moved || busy,
    /** true if the click that just fired was the tail of a drag */
    consumedClick: () => suppressClick,
    flyThenChoose,
  };
}
