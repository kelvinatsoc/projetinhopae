// Sons da partida sintetizados com Web Audio (sem arquivos com direitos autorais):
// ambiente de torcida, apito, explosão no gol e vaia. O usuário pode carregar o próprio
// áudio (hino/canto) do seu clube, que toca nos gols — fica salvo só no aparelho dele.

let ctx: AudioContext | null = null;
let crowdGain: GainNode | null = null;
let crowdSrc: AudioBufferSourceNode | null = null;
let enabled = true;
let customGoal: HTMLAudioElement | null = null;

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (!v) stopCrowd();
  try {
    localStorage.setItem("sound", v ? "1" : "0");
  } catch { /* ignore */ }
}

export function soundEnabled(): boolean {
  try {
    const v = localStorage.getItem("sound");
    if (v !== null) enabled = v === "1";
  } catch { /* ignore */ }
  return enabled;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // ruído "rosa" aproximado: soa mais como multidão do que o ruído branco
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

export function startCrowd() {
  const c = ac();
  if (!c || crowdSrc) return;
  crowdSrc = c.createBufferSource();
  crowdSrc.buffer = noiseBuffer(c, 4);
  crowdSrc.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.6;
  crowdGain = c.createGain();
  crowdGain.gain.value = 0.0;
  crowdGain.gain.linearRampToValueAtTime(0.18, c.currentTime + 1.5);
  // oscilação lenta, como o "mar" de uma arquibancada
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.15;
  lfoGain.gain.value = 0.05;
  lfo.connect(lfoGain).connect(crowdGain.gain);
  lfo.start();
  crowdSrc.connect(bp).connect(crowdGain).connect(c.destination);
  crowdSrc.start();
}

export function stopCrowd() {
  if (crowdGain && ctx) crowdGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
  const src = crowdSrc;
  crowdSrc = null;
  setTimeout(() => src?.stop(), 900);
}

export function whistle(times = 1) {
  const c = ac();
  if (!c) return;
  for (let i = 0; i < times; i++) {
    const t = c.currentTime + i * 0.45;
    const o = c.createOscillator();
    const g = c.createGain();
    const vib = c.createOscillator();
    const vibG = c.createGain();
    o.frequency.value = 3100;
    vib.frequency.value = 28;
    vibG.gain.value = 140;
    vib.connect(vibG).connect(o.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.02);
    g.gain.setValueAtTime(0.12, t + (i === times - 1 ? 0.7 : 0.25));
    g.gain.linearRampToValueAtTime(0, t + (i === times - 1 ? 0.8 : 0.32));
    o.connect(g).connect(c.destination);
    o.start(t); vib.start(t);
    o.stop(t + 0.9); vib.stop(t + 0.9);
  }
}

/** Explosão da torcida no gol. */
export function goalRoar(home: boolean) {
  const c = ac();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 4);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(500, c.currentTime);
  bp.frequency.linearRampToValueAtTime(1300, c.currentTime + 0.6);
  bp.Q.value = 0.5;
  const g = c.createGain();
  const peak = home ? 0.75 : 0.35;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(peak, c.currentTime + 0.35);
  g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 3.8);
  src.connect(bp).connect(g).connect(c.destination);
  src.start();
  src.stop(c.currentTime + 4);
}

/** "Uhhh" da torcida numa chance perdida. */
export function ooh() {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(220, c.currentTime);
  o.frequency.linearRampToValueAtTime(150, c.currentTime + 1.2);
  f.type = "lowpass";
  f.frequency.value = 700;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(0.06, c.currentTime + 0.2);
  g.gain.linearRampToValueAtTime(0, c.currentTime + 1.3);
  o.connect(f).connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 1.4);
}

export function setCustomGoalAudio(dataUrl: string | null) {
  customGoal = dataUrl ? new Audio(dataUrl) : null;
}

export function playCustomGoal(): boolean {
  if (!enabled || !customGoal) return false;
  customGoal.currentTime = 0;
  void customGoal.play().catch(() => undefined);
  return true;
}

// ---------------------------------------------------------------- mídia do usuário (IndexedDB)
const MEDIA_DB = "lendas-da-base-media";

function mediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(MEDIA_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("media");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function saveMedia(key: string, dataUrl: string | null) {
  const db = await mediaDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("media", "readwrite");
    if (dataUrl) t.objectStore("media").put(dataUrl, key);
    else t.objectStore("media").delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function loadMedia(key: string): Promise<string | null> {
  const db = await mediaDb();
  return new Promise((resolve) => {
    const t = db.transaction("media", "readonly");
    const r = t.objectStore("media").get(key);
    r.onsuccess = () => resolve((r.result as string) ?? null);
    r.onerror = () => resolve(null);
  });
}
