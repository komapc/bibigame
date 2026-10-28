// Haptics + tiny synthesized sounds (WebAudio, no assets, no external hosts).
// Sound is OFF by default; the choice is remembered. Audio starts only after a user gesture.
const KEY = 'bibigame.sound';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let on = (() => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } })();
let ctx: AudioContext | null = null;

export const soundOn = () => on;
export function setSound(v: boolean) {
  on = v;
  try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* private mode */ }
  if (v && !ctx) { try { ctx = new AudioContext(); } catch { ctx = null; } }
  if (v) void ctx?.resume();
}

/** short vibration (Android Chrome etc.); off with reduced motion */
export function buzz(pattern: number | number[]) {
  if (reduceMotion || !('vibrate' in navigator)) return;
  try { navigator.vibrate(pattern); } catch { /* not allowed */ }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, to?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (to) o.frequency.linearRampToValueAtTime(to, ctx.currentTime + start + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

function noise(start: number, dur: number, gain = 0.15) {
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start(ctx.currentTime + start);
}

export type Sound = 'siren' | 'drum' | 'applause' | 'cash';
export function play(s: Sound) {
  if (!on || !ctx) return;
  switch (s) {
    case 'siren': tone(600, 0, 0.6, 'sawtooth', 0.05, 900); tone(900, 0.6, 0.6, 'sawtooth', 0.05, 600); break;
    case 'drum': for (let i = 0; i < 3; i++) tone(110, i * 0.22, 0.18, 'triangle', 0.3, 50); break;
    case 'applause': for (let i = 0; i < 10; i++) noise(i * 0.08, 0.06, 0.08); break;
    case 'cash': tone(1320, 0, 0.08, 'square', 0.05); tone(1760, 0.09, 0.25, 'square', 0.05); noise(0.05, 0.1, 0.05); break;
  }
}
