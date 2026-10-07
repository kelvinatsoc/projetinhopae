// Sons da partida. Usa gravações reais com licença livre do Wikimedia Commons (ambiente de
// torcida, explosão no gol, "uhhh", apito do árbitro e cantos de algumas torcidas), empacotadas
// em public/media/audio/ (autores e licenças em media/audio/credits.json; ver scripts/fetch_audio.py).
// Se um arquivo faltar ou não decodificar, toca a versão sintetizada com Web Audio.
// Jogos com torcida brasileira (clubes do Brasil e a Seleção) usam o mixador em camadas
// (startAtmosphere): ambiente + canto + vaia em laço, olé/gol/"uhhh" por cima, tudo seguindo o
// humor da torcida (src/ui/torcida.ts). Sons em media/audio/br/ (scripts/fetch_torcida.py).
// Todo som passa por um volume geral (ajuste do usuário) que abaixa sozinho nos menus.
// O usuário pode carregar o próprio áudio (hino/canto) do seu clube, que toca nos gols — fica
// salvo só no aparelho dele.
import { mediaUrl } from "./mediaUrl";
import { BR_SOUNDS, type CrowdProfile, type Mood } from "./torcida";

let ctx: AudioContext | null = null;
let enabled = readEnabled();
let customGoal: HTMLAudioElement | null = null;

// ---------------------------------------------------------------- arquivos de som
/** Gravações empacotadas (caminhos relativos a media/). */
const SAMPLE = {
  crowd: "audio/crowd.m4a", // ambiente de arquibancada, em laço
  goal: "audio/goal.m4a", // explosão da torcida no gol
  goal2: "audio/goal2.m4a", // variação: torcida comemorando aos gritos
  ooh: "audio/ooh.m4a", // "uhhh" numa chance perdida
  whistle: "audio/whistle.m4a", // apito curto do árbitro
  whistleLong: "audio/whistle-long.m4a", // apito longo (fim de tempo/jogo)
} as const;

/** Cantos de torcida por clube (id do jogo -> arquivo em media/). */
// Hinos livres já escolhidos em scripts/fetch_audio.py (São Paulo, Nacional-URU); ainda não
// baixados por limite de taxa do Commons. Para ativar: rode o script e acrescente aqui, ex.:
// "sao-paulo": "audio/chant-sao-paulo.m4a".
const CLUB_CHANTS: Record<string, string> = {};

/** Volume base de cada som (as gravações saem normalizadas em loudness do script). */
const LEVEL = { crowd: 0.32, goal: 0.9, goalAway: 0.35, ooh: 0.55, whistle: 0.5, chant: 0.6 };

function readEnabled(): boolean {
  try {
    const v = localStorage.getItem("sound");
    if (v !== null) return v === "1";
  } catch { /* ignore */ }
  return true;
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (!v) {
    stopCrowd();
    stopAtmosphere();
    stopChant();
    customGoal?.pause();
  }
  try {
    localStorage.setItem("sound", v ? "1" : "0");
  } catch { /* ignore */ }
}

export function soundEnabled(): boolean {
  enabled = readEnabled();
  return enabled;
}

// ---------------------------------------------------------------- volume geral + "abafar" nos menus
let master: GainNode | null = null;
let volume = readVolume();
let menuDuck = false;

function readVolume(): number {
  try {
    const v = localStorage.getItem("crowdVol");
    if (v !== null && !Number.isNaN(Number(v))) return Math.max(0, Math.min(1, Number(v)));
  } catch { /* ignore */ }
  return 0.8;
}

/** Volume da torcida e dos efeitos (0..1), salvo no aparelho. */
export function crowdVolume(): number {
  return volume;
}

function masterLevel() {
  return volume * (menuDuck ? 0.22 : 1);
}

function applyMaster(ramp = 0.35) {
  if (!master || !ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(masterLevel(), t + ramp);
}

export function setCrowdVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  try {
    localStorage.setItem("crowdVol", String(Math.round(volume * 100) / 100));
  } catch { /* ignore */ }
  applyMaster(0.1);
}

/** Abaixa todo o som do estádio enquanto um menu (intervalo, substituições, pausa) está aberto. */
export function duckForMenu(on: boolean) {
  if (menuDuck === on) return;
  menuDuck = on;
  applyMaster(on ? 0.4 : 0.8);
}

/** Saída comum de todos os sons (passa pelo volume geral). */
function out(c: AudioContext): AudioNode {
  if (!master) {
    master = c.createGain();
    master.gain.value = masterLevel();
    master.connect(c.destination);
  }
  return master;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C();
    } catch {
      return null;
    }
  }
  // o navegador só libera o som depois de um toque do usuário: tenta retomar a cada uso
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  return ctx;
}

// Cache dos arquivos decodificados: promessa (carregando) e valor já resolvido (null = falhou).
const loading = new Map<string, Promise<AudioBuffer | null>>();
const ready = new Map<string, AudioBuffer | null>();

function decode(c: AudioContext, data: ArrayBuffer): Promise<AudioBuffer | null> {
  return new Promise((resolve) => {
    try {
      // forma com callbacks: funciona também no Safari antigo; a promessa devolvida (se houver)
      // ganha um catch para não gerar "unhandled rejection"
      const p = c.decodeAudioData(data, (b) => resolve(b), () => resolve(null)) as Promise<AudioBuffer> | undefined;
      p?.catch?.(() => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/** Carrega e decodifica um som (uma vez só). Nunca rejeita: devolve null se faltar ou falhar. */
function sample(path: string): Promise<AudioBuffer | null> {
  const c = ac();
  if (!c) return Promise.resolve(null);
  let p = loading.get(path);
  if (!p) {
    p = fetch(mediaUrl(path))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((data) => (data && data.byteLength > 0 ? decode(c, data) : null))
      .catch(() => null)
      .then((b) => {
        ready.set(path, b);
        return b;
      });
    loading.set(path, p);
  }
  return p;
}

/** Começa a carregar os sons da partida (chamado ao iniciar a torcida). */
function preload() {
  for (const k of Object.values(SAMPLE)) void sample(k);
}

/** Toca um buffer agora; devolve a fonte e o ganho (para parar/abaixar depois). */
function playBuffer(c: AudioContext, buf: AudioBuffer, gain: number, opts: { when?: number; rate?: number; lowpass?: number; dur?: number } = {}) {
  const src = c.createBufferSource();
  src.buffer = buf;
  if (opts.rate) src.playbackRate.value = opts.rate;
  const g = c.createGain();
  g.gain.value = gain;
  let node: AudioNode = src;
  if (opts.lowpass) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = opts.lowpass;
    node = node.connect(f);
  }
  node.connect(g).connect(out(c));
  const t = opts.when ?? c.currentTime;
  src.start(t);
  if (opts.dur) {
    // corta com um fade curto para não estalar
    g.gain.setValueAtTime(gain, t + Math.max(0, opts.dur - 0.06));
    g.gain.linearRampToValueAtTime(0, t + opts.dur);
    src.stop(t + opts.dur + 0.02);
  }
  return { src, g };
}

/**
 * Toca a gravação se já estiver pronta. Se ainda estiver carregando, espera até `wait` ms;
 * se não chegar a tempo (ou falhar), toca a versão sintetizada.
 */
function playSample(path: string, wait: number, real: (c: AudioContext, b: AudioBuffer) => void, synth: (c: AudioContext) => void) {
  const c = ac();
  if (!c) return;
  if (ready.has(path)) {
    const b = ready.get(path);
    if (b) real(c, b);
    else synth(c);
    return;
  }
  let done = false;
  const timer = window.setTimeout(() => {
    if (done) return;
    done = true;
    synth(c);
  }, wait);
  void sample(path).then((b) => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    if (!enabled) return;
    if (b) real(c, b);
    else synth(c);
  });
}

// ---------------------------------------------------------------- sons sintetizados (reserva)
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

/** Ambiente de torcida sintetizado: ruído filtrado com oscilação lenta. */
function synthCrowd(c: AudioContext, out: GainNode): () => void {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 4);
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.6;
  const g = c.createGain();
  g.gain.value = 0.55;
  // oscilação lenta, como o "mar" de uma arquibancada
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.15;
  lfoGain.gain.value = 0.15;
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(bp).connect(g).connect(out);
  src.start();
  lfo.start();
  return () => {
    try { src.stop(); lfo.stop(); } catch { /* já parou */ }
  };
}

/** Vaia sintetizada (reserva): ruído grave com um "uuu" de vogal, oscilando devagar. */
function synthBoo(c: AudioContext, out: GainNode): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 3);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 320;
  f.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = 0.8;
  const lfo = c.createOscillator();
  const lg = c.createGain();
  lfo.frequency.value = 0.4;
  lg.gain.value = 0.3;
  lfo.connect(lg).connect(g.gain);
  src.connect(f).connect(g).connect(out);
  src.start();
  lfo.start();
  src.onended = () => { try { lfo.stop(); } catch { /* já parou */ } };
  return src;
}

function synthWhistle(c: AudioContext, times: number) {
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
    o.connect(g).connect(out(c));
    o.start(t); vib.start(t);
    o.stop(t + 0.9); vib.stop(t + 0.9);
  }
}

function synthRoar(c: AudioContext, home: boolean) {
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
  src.connect(bp).connect(g).connect(out(c));
  src.start();
  src.stop(c.currentTime + 4);
}

function synthOoh(c: AudioContext) {
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
  o.connect(f).connect(g).connect(out(c));
  o.start();
  o.stop(c.currentTime + 1.4);
}

// ---------------------------------------------------------------- torcida (ambiente em laço)
interface Crowd { gain: GainNode; stop: (() => void) | null; level: number }
let crowd: Crowd | null = null;

/** Liga o ambiente de torcida (gravação real em laço; ruído sintetizado se não carregar). */
export function startCrowd() {
  const c = ac();
  if (!c || crowd) return;
  preload();
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(out(c));
  const me: Crowd = { gain, stop: null, level: 1 };
  crowd = me;
  const fadeIn = () => {
    const t = c.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(LEVEL.crowd * me.level, t + 1.5);
  };
  void sample(SAMPLE.crowd).then((buf) => {
    if (crowd !== me || !enabled) return; // a torcida foi desligada enquanto carregava
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      // pula as bordas do arquivo (atraso do codificador AAC) para o laço não estalar
      if (buf.duration > 2) {
        src.loopStart = 0.03;
        src.loopEnd = buf.duration - 0.03;
      }
      src.connect(gain);
      // começa num ponto aleatório para cada partida soar um pouco diferente
      src.start(c.currentTime, Math.random() * buf.duration);
      me.stop = () => {
        try { src.stop(); } catch { /* já parou */ }
      };
    } else {
      me.stop = synthCrowd(c, gain);
    }
    fadeIn();
  });
}

/** Desliga o ambiente de torcida com um fade de ~0,8 s. */
export function stopCrowd() {
  const me = crowd;
  crowd = null;
  if (!me || !ctx) return;
  const t = ctx.currentTime;
  me.gain.gain.cancelScheduledValues(t);
  me.gain.gain.setValueAtTime(me.gain.gain.value, t);
  me.gain.gain.linearRampToValueAtTime(0, t + 0.8);
  window.setTimeout(() => {
    me.stop?.();
    me.gain.disconnect();
  }, 900);
}

/**
 * Ajusta a intensidade da torcida (1 = normal; ex.: 1.4 num ataque perigoso, 0.6 com o time
 * perdendo feio). A mudança é suave.
 */
export function setCrowdLevel(level: number) {
  const me = crowd;
  if (!me || !ctx) return;
  me.level = Math.max(0, Math.min(2, level));
  const t = ctx.currentTime;
  me.gain.gain.cancelScheduledValues(t);
  me.gain.gain.setValueAtTime(me.gain.gain.value, t);
  me.gain.gain.linearRampToValueAtTime(LEVEL.crowd * me.level, t + 1.2);
}

/** Abaixa a torcida por alguns segundos (para um som em primeiro plano) e volta ao normal. */
function duckCrowd(seconds: number, to = 0.45) {
  const me = crowd;
  if (!me || !ctx) return;
  const t = ctx.currentTime;
  const base = LEVEL.crowd * me.level;
  me.gain.gain.cancelScheduledValues(t);
  me.gain.gain.setValueAtTime(me.gain.gain.value, t);
  me.gain.gain.linearRampToValueAtTime(base * to, t + 0.4);
  me.gain.gain.setValueAtTime(base * to, t + Math.max(0.4, seconds - 1));
  me.gain.gain.linearRampToValueAtTime(base, t + seconds + 0.5);
}

// ---------------------------------------------------------------- torcida brasileira (mixador em camadas)
// Camadas em laço (ambiente, canto, vaia) com ganhos que seguem o humor da torcida (torcida.ts),
// mais os disparos (gol, "uhhh", olé). Tudo passa por um filtro que deixa torcida pequena mais
// "magra" e a do estádio lotado mais cheia. Clubes estrangeiros não usam isto (ver startCrowd).
interface Layer { src: AudioBufferSourceNode | null; g: GainNode; target: number }
interface Atmos {
  p: CrowdProfile;
  bus: GainNode;
  tone: BiquadFilterNode;
  bed: Layer;
  chant: Layer;
  boo: Layer;
  mood: Mood;
  lastOle: number;
  festaUntil: number;
}
let atmos: Atmos | null = null;

/** Volume base das camadas da torcida brasileira. */
const BR_LEVEL = { bed: 0.36, chant: 0.42, boo: 0.5, goal: 0.95, goalAway: 0.3, ooh: 0.6, ole: 0.55 };

function brPaths(p: CrowdProfile): string[] {
  return [p.bed, p.chant, BR_SOUNDS.boo, BR_SOUNDS.ooh, BR_SOUNDS.ole, ...p.goal];
}

function loopLayer(c: AudioContext, bus: AudioNode, path: string, fallback: string | null, me: () => boolean, synth?: (c: AudioContext, out: GainNode) => AudioBufferSourceNode): Layer {
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(bus);
  const layer: Layer = { src: null, g, target: 0 };
  const startWith = (b: AudioBuffer | null, alt: boolean) => {
    if (!me() || !enabled) return;
    if (!b) {
      if (!alt && fallback) void sample(fallback).then((fb) => startWith(fb, true));
      else if (synth) {
        layer.src = synth(c, g);
        rampLayer(c, layer, 1.5);
      }
      return;
    }
    const src = c.createBufferSource();
    src.buffer = b;
    src.loop = true;
    if (b.duration > 2) {
      src.loopStart = 0.03;
      src.loopEnd = b.duration - 0.03;
    }
    src.connect(g);
    src.start(c.currentTime, Math.random() * b.duration);
    layer.src = src;
    rampLayer(c, layer, 1.5);
  };
  void sample(path).then((b) => startWith(b, false));
  return layer;
}

function rampLayer(c: AudioContext, l: Layer, secs: number) {
  const t = c.currentTime;
  l.g.gain.cancelScheduledValues(t);
  l.g.gain.setValueAtTime(l.g.gain.value, t);
  l.g.gain.linearRampToValueAtTime(l.target, t + secs);
}

/**
 * Liga a torcida brasileira da partida (ambiente + canto + vaia em camadas). Para clubes
 * estrangeiros, quem chama usa startCrowd() (som genérico de antes).
 */
export function startAtmosphere(p: CrowdProfile) {
  const c = ac();
  if (!c || atmos) return;
  preload();
  for (const path of brPaths(p)) void sample(path);
  const bus = c.createGain();
  bus.gain.value = 1;
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  // torcida pequena: som mais distante e abafado
  tone.frequency.value = 2200 + p.size * 12000;
  tone.Q.value = 0.4;
  tone.connect(bus);
  bus.connect(out(c));
  const holder: { a: Atmos | null } = { a: null };
  const me = () => atmos === holder.a && atmos !== null;
  const a: Atmos = {
    p, bus, tone,
    bed: { src: null, g: c.createGain(), target: 0 },
    chant: { src: null, g: c.createGain(), target: 0 },
    boo: { src: null, g: c.createGain(), target: 0 },
    mood: { intensity: 1, chant: 0.6, boo: false, ole: false },
    lastOle: -1e9,
    festaUntil: 0,
  };
  holder.a = a;
  atmos = a;
  a.bed = loopLayer(c, tone, p.bed, SAMPLE.crowd, me);
  a.chant = loopLayer(c, tone, p.chant, null, me);
  a.boo = loopLayer(c, tone, BR_SOUNDS.boo, null, me, synthBoo);
  setLayerTargets(c, a, 2);
}

function setLayerTargets(c: AudioContext, a: Atmos, secs: number) {
  const m = a.mood;
  const loud = 0.55 + 0.45 * a.p.size;
  const festa = c.currentTime < a.festaUntil ? 1.25 : 1;
  a.bed.target = BR_LEVEL.bed * loud * m.intensity;
  a.chant.target = BR_LEVEL.chant * loud * m.chant * Math.min(1.3, m.intensity) * festa;
  a.boo.target = m.boo ? BR_LEVEL.boo * loud : 0;
  rampLayer(c, a.bed, secs);
  rampLayer(c, a.chant, secs);
  rampLayer(c, a.boo, m.boo ? secs * 2 : secs);
}

/** Desliga a torcida brasileira com fade. */
export function stopAtmosphere() {
  const a = atmos;
  atmos = null;
  if (!a || !ctx) return;
  const t = ctx.currentTime;
  a.bus.gain.cancelScheduledValues(t);
  a.bus.gain.setValueAtTime(a.bus.gain.value, t);
  a.bus.gain.linearRampToValueAtTime(0, t + 0.8);
  window.setTimeout(() => {
    for (const l of [a.bed, a.chant, a.boo]) {
      try { l.src?.stop(); } catch { /* já parou */ }
    }
    a.bus.disconnect();
  }, 900);
}

/** A torcida brasileira está tocando? */
export function atmosphereOn(): boolean {
  return atmos !== null;
}

/** Atualiza as camadas com o humor da torcida (chamado a cada minuto simulado). */
export function updateAtmosphere(m: Mood) {
  const a = atmos;
  const c = ctx;
  if (!a || !c || !enabled) return;
  a.mood = m;
  setLayerTargets(c, a, 1.6);
  // olé: no máximo a cada 25 s
  if (m.ole && c.currentTime - a.lastOle > 25) {
    a.lastOle = c.currentTime;
    playBr(BR_SOUNDS.ole, BR_LEVEL.ole);
  }
}

function playBr(path: string, gain: number, opts: { rate?: number; lowpass?: number } = {}, fallback?: () => void) {
  const a = atmos;
  const c = ctx;
  if (!a || !c) return;
  const b = ready.get(path);
  if (b === undefined) {
    void sample(path).then((buf) => {
      if (buf && atmos === a) playBufferTo(c, a.tone, buf, gain, opts);
      else if (!buf) fallback?.();
    });
    return;
  }
  if (b) playBufferTo(c, a.tone, b, gain, opts);
  else fallback?.();
}

function playBufferTo(c: AudioContext, dest: AudioNode, buf: AudioBuffer, gain: number, opts: { rate?: number; lowpass?: number }) {
  const src = c.createBufferSource();
  src.buffer = buf;
  if (opts.rate) src.playbackRate.value = opts.rate;
  const g = c.createGain();
  g.gain.value = gain;
  let node: AudioNode = src;
  if (opts.lowpass) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = opts.lowpass;
    node = node.connect(f);
  }
  node.connect(g).connect(dest);
  src.start();
}

/** Gol com a torcida brasileira: explosão, depois festa (canto mais alto por um tempo). */
function atmosphereGoal(forCrowd: boolean): boolean {
  const a = atmos;
  const c = ctx;
  if (!a || !c) return false;
  if (forCrowd) {
    const path = a.p.goal[Math.floor(Math.random() * a.p.goal.length)];
    playBr(path, BR_LEVEL.goal * (0.75 + 0.25 * a.p.size), {}, () => goalRoarGeneric(true));
    a.festaUntil = c.currentTime + 14;
    // a explosão cobre o ambiente; o canto volta mais forte logo depois
    const t = c.currentTime;
    for (const l of [a.bed, a.chant]) {
      l.g.gain.cancelScheduledValues(t);
      l.g.gain.setValueAtTime(l.g.gain.value, t);
      l.g.gain.linearRampToValueAtTime(l.target * 0.4, t + 0.3);
    }
    window.setTimeout(() => { if (atmos === a && ctx) setLayerTargets(ctx, a, 2.5); }, 4500);
  } else {
    // gol do visitante: o estádio silencia e só o setor visitante comemora, lá longe
    playSample(SAMPLE.goal, 300, (cc, b) => playBuffer(cc, b, BR_LEVEL.goalAway, { lowpass: 1500 }), (cc) => synthRoar(cc, false));
    const t = c.currentTime;
    for (const l of [a.bed, a.chant]) {
      l.g.gain.cancelScheduledValues(t);
      l.g.gain.setValueAtTime(l.g.gain.value, t);
      l.g.gain.linearRampToValueAtTime(l.target * 0.3, t + 0.6);
    }
    window.setTimeout(() => { if (atmos === a && ctx) setLayerTargets(ctx, a, 4); }, 5000);
  }
  return true;
}

// ---------------------------------------------------------------- efeitos
/** Apito do árbitro: 1 = início, 2 = intervalo, 3 = fim de jogo (o último é longo). */
export function whistle(times = 1) {
  const n = Math.max(1, Math.floor(times));
  playSample(SAMPLE.whistle, 600, (c, short) => {
    const long = ready.get(SAMPLE.whistleLong) ?? null;
    let t = c.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const buf = last && n > 1 && long ? long : short;
      playBuffer(c, buf, LEVEL.whistle, { when: t });
      t += buf.duration + 0.12;
    }
  }, (c) => synthWhistle(c, n));
}

/**
 * Explosão da torcida no gol (mais forte para a torcida da casa/do usuário). Com a torcida
 * brasileira ligada, `side` (lado que marcou) decide se a arquibancada explode ou silencia.
 */
export function goalRoar(home: boolean, side?: 0 | 1) {
  if (atmos && side !== undefined && atmosphereGoal(side === atmos.p.side)) return;
  goalRoarGeneric(home);
}

function goalRoarGeneric(home: boolean) {
  // sorteia entre as gravações de gol já carregadas
  const alt = ready.get(SAMPLE.goal2);
  const path = home && alt && Math.random() < 0.4 ? SAMPLE.goal2 : SAMPLE.goal;
  playSample(path, 400, (c, b) => {
    // gol do visitante: a explosão vem do setor visitante, mais longe e abafada
    playBuffer(c, b, home ? LEVEL.goal : LEVEL.goalAway, home ? {} : { lowpass: 1800 });
    if (home) duckCrowd(Math.min(b.duration, 6), 0.6);
  }, (c) => synthRoar(c, home));
}

/** "Uhhh" da torcida numa chance perdida. */
export function ooh() {
  if (atmos) {
    playBr(BR_SOUNDS.ooh, BR_LEVEL.ooh, { rate: 0.96 + Math.random() * 0.08 }, () => playSample(SAMPLE.ooh, 300, (c, b) => playBuffer(c, b, LEVEL.ooh), (c) => synthOoh(c)));
    return;
  }
  playSample(SAMPLE.ooh, 300, (c, b) => {
    playBuffer(c, b, LEVEL.ooh, { rate: 0.96 + Math.random() * 0.08 });
  }, (c) => synthOoh(c));
}

// ---------------------------------------------------------------- cantos de torcida
let chant: { src: AudioBufferSourceNode; g: GainNode } | null = null;

function stopChant() {
  const cur = chant;
  chant = null;
  if (!cur || !ctx) return;
  const t = ctx.currentTime;
  cur.g.gain.cancelScheduledValues(t);
  cur.g.gain.setValueAtTime(cur.g.gain.value, t);
  cur.g.gain.linearRampToValueAtTime(0, t + 0.6);
  try { cur.src.stop(t + 0.65); } catch { /* já parou */ }
}

/** Diz se o clube tem um canto de torcida gravado (ver playClubChant). */
export function hasClubChant(clubId: string): boolean {
  return clubId in CLUB_CHANTS;
}

/**
 * Toca o canto da torcida do clube (gravação real do Commons), por cima do ambiente.
 * Devolve false se o clube não tiver canto gravado ou o som estiver desligado (aí quem chama
 * pode usar outro som). Se o arquivo não carregar, não toca nada.
 */
export function playClubChant(clubId: string): boolean {
  const path = CLUB_CHANTS[clubId];
  if (!path || !enabled) return false;
  const c = ac();
  if (!c) return false;
  void sample(path).then((b) => {
    if (!b || !enabled) return;
    stopChant();
    const p = playBuffer(c, b, LEVEL.chant);
    chant = p;
    p.src.onended = () => {
      if (chant === p) chant = null;
    };
    duckCrowd(Math.min(b.duration, 12), 0.55);
  });
  return true;
}

// ---------------------------------------------------------------- áudio do usuário
export function setCustomGoalAudio(dataUrl: string | null) {
  customGoal?.pause();
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
