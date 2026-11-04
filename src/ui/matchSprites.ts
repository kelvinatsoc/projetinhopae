// Personalidade dos jogadores no campinho (modo Ultra / 2D HD): porte pela altura, cabelo e pele pelo rosto,
// estilo de jogo visível (driblador faz pedalada, centroavante sobe mais, velocista dispara,
// goleiro voa) e poses extras (chute, cabeçada, carrinho, queda, comemorações).
// Tudo determinístico a partir do jogador (nada de Math.random aqui, exceto onde o chamador passa a
// semente) e nunca mexe no gerador do mundo.
import type { Player, Race } from "../engine/types";
import { makeRng } from "../engine/rng";

// ---------------------------------------------------------------- aparência
export type PlayStyle = "dribbler" | "target" | "speedster" | "keeper" | "engine" | "normal";
export type HairStyle = "short" | "buzz" | "afro" | "long" | "bald" | "mohawk";
export type Celebration = "arms" | "knee" | "flip" | "pile" | "run";

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** -1 baixo, 0 médio, 1 alto */
  tall: -1 | 0 | 1;
  /** físico forte: tronco mais largo */
  broad: boolean;
  style: PlayStyle;
  num: number;
  beard: boolean;
}

const SKIN: Record<Race, string[]> = {
  white: ["#f4cfa6", "#e8b98d", "#f0c49a"],
  brown: ["#c98d5b", "#b57a4a", "#d29c6c"],
  black: ["#7c4c2b", "#61391f", "#8a5634"],
  asian: ["#efc99a", "#e3b585", "#f2d0a4"],
};
const HAIR = ["#1d140c", "#2e1f12", "#4a3020", "#101010", "#2a2a2a"];

/** Hash inteiro simples (para escolhas determinísticas por jogador/lance). */
export function hash(...ns: number[]): number {
  let h = 2166136261;
  for (const n of ns) {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

export function heightBucket(cm: number | undefined): -1 | 0 | 1 {
  if (!cm) return 0;
  return cm < 175 ? -1 : cm >= 188 ? 1 : 0;
}

/** Estilo de jogo que aparece na animação (derivado dos atributos e jogadas preferidas). */
export function playStyle(p: Player | undefined): PlayStyle {
  if (!p) return "normal";
  if (p.pos === "GOL") return "keeper";
  const a = p.attrs;
  const t = p.traits ?? [];
  const att = p.pos === "ATA" || p.pos === "PD" || p.pos === "PE" || p.pos === "MEI";
  if (t.includes("DRI") || (a.dri >= 78 && a.dri >= a.vel - 2 && att)) return "dribbler";
  if (t.includes("CAB") || (p.pos === "ATA" && (p.height ?? 0) >= 187 && a.fis >= 70)) return "target";
  if (t.includes("VEL") || (a.vel >= 82 && att)) return "speedster";
  if (a.fis >= 80 && (p.pos === "VOL" || p.pos === "MC")) return "engine";
  return "normal";
}

const STAR_LOOKS: Record<string, Partial<Look>> = {
  "Jonathan Calleri": { skin: "#f0c49a", hair: "#2a1f18", hairStyle: "short", beard: true, tall: 0, broad: true },
  "Calleri": { skin: "#f0c49a", hair: "#2a1f18", hairStyle: "short", beard: true, tall: 0, broad: true },
  "Lucas Moura": { skin: "#b57a4a", hair: "#101010", hairStyle: "buzz", beard: true, tall: 0, broad: false },
  "Robert Arboleda": { skin: "#61391f", hair: "#101010", hairStyle: "buzz", beard: true, tall: 1, broad: true },
  "Arboleda": { skin: "#61391f", hair: "#101010", hairStyle: "buzz", beard: true, tall: 1, broad: true },
  "Rafael": { skin: "#f4cfa6", hair: "#1d140c", hairStyle: "short", beard: false, tall: 1, broad: true },
  "Luciano": { skin: "#e8b98d", hair: "#101010", hairStyle: "short", beard: true, tall: 0, broad: false },
  "Ferreira": { skin: "#c98d5b", hair: "#101010", hairStyle: "short", beard: false, tall: 0, broad: false },
  "Damián Bobadilla": { skin: "#f0c49a", hair: "#2a1f18", hairStyle: "short", beard: false, tall: 0, broad: false },
  "Marcos Antônio": { skin: "#7c4c2b", hair: "#101010", hairStyle: "buzz", beard: false, tall: -1, broad: false },
  "Wendell": { skin: "#61391f", hair: "#101010", hairStyle: "short", beard: true, tall: 0, broad: false },
  "Alan Franco": { skin: "#f0c49a", hair: "#2a1f18", hairStyle: "short", beard: false, tall: 0, broad: true },
  "Sabino": { skin: "#61391f", hair: "#101010", hairStyle: "buzz", beard: true, tall: 1, broad: true },
  "Pablo Maia": { skin: "#e8b98d", hair: "#2a1f18", hairStyle: "short", beard: false, tall: 0, broad: false },
  "André Silva": { skin: "#7c4c2b", hair: "#101010", hairStyle: "short", beard: true, tall: 0, broad: true },
  "Luiz Gustavo": { skin: "#61391f", hair: "#101010", hairStyle: "short", beard: true, tall: 1, broad: true },
  "Alisson": { skin: "#e8b98d", hair: "#1d140c", hairStyle: "short", beard: false, tall: 0, broad: false },
  "Wellington Rato": { skin: "#c98d5b", hair: "#101010", hairStyle: "buzz", beard: true, tall: 0, broad: false },
  "Rodrigo Nestor": { skin: "#f0c49a", hair: "#2a1f18", hairStyle: "short", beard: false, tall: 0, broad: false },
  "Igor Vinícius": { skin: "#f0c49a", hair: "#1d140c", hairStyle: "short", beard: false, tall: 0, broad: false },
  "Jandrei": { skin: "#f4cfa6", hair: "#2a1f18", hairStyle: "short", beard: true, tall: 1, broad: false },
};

/** Visual do jogador no campinho e nas cenas de lance decisivo. */
export function lookOf(p: Player | undefined): Look {
  if (!p) return { skin: "#d9a777", hair: "#222", hairStyle: "short", tall: 0, broad: false, style: "normal", num: 0, beard: false };

  const star = STAR_LOOKS[p.name] ?? (p.real ? Object.entries(STAR_LOOKS).find(([k]) => p.name.includes(k))?.[1] : undefined);
  if (star) {
    return {
      skin: star.skin ?? "#c98d5b",
      hair: star.hair ?? "#1d140c",
      hairStyle: star.hairStyle ?? "short",
      tall: star.tall ?? heightBucket(p.height),
      broad: star.broad ?? (p.attrs.fis >= 78),
      style: playStyle(p),
      num: p.shirt ?? ((hash(p.id) % 30) + 1),
      beard: star.beard ?? false,
    };
  }

  // as duas primeiras sorteadas na mesma ordem do visual antigo (mesma pele/cabelo de antes)
  const r = makeRng(p.face.s ^ 0x5bd1e995);
  const tones = SKIN[p.face.r] ?? SKIN.brown;
  const skin = tones[Math.floor(r() * tones.length)];
  let hair = HAIR[Math.floor(r() * HAIR.length)];
  if (p.face.r === "white" && r() < 0.18) hair = "#c9a24e";
  const styles: HairStyle[] = p.face.r === "black" ? ["afro", "buzz", "short", "bald", "mohawk"] : ["short", "short", "long", "buzz", "mohawk", "bald"];
  const hairStyle = styles[hash(p.face.s, 7) % styles.length];
  return {
    skin, hair, hairStyle,
    tall: heightBucket(p.height),
    broad: p.attrs.fis >= 78,
    style: playStyle(p),
    num: p.shirt ?? ((hash(p.id) % 30) + 1),
    beard: hash(p.face.s, 11) % 4 === 0,
  };
}

// ---------------------------------------------------------------- escolhas por lance
export type ShotStyle = "power" | "curl" | "chip" | "volley" | "bicycle" | "header" | "placed" | "freekick" | "penalty";

/**
 * Como o chute vai parecer (puramente visual, não muda o resultado). Determinístico por jogador e
 * minuto: o mesmo lance sempre é desenhado do mesmo jeito (inclusive no replay).
 */
export function shotStyle(p: Player | undefined, kind: "header" | "freekick" | "long" | undefined, min: number, result?: string): ShotStyle {
  if (kind === "header") return "header";
  if (kind === "freekick") return "freekick";
  const h = hash(p?.id ?? 0, min, 31) % 100;
  if (kind === "long") return h < 55 ? "power" : "curl";
  const a = p?.attrs;
  const style = playStyle(p);
  // golaços acrobáticos: raros, mais comuns em gols de quem tem técnica
  if (result === "goal" && a && a.dri >= 70 && h < 7) return "bicycle";
  if (h < 16) return "volley";
  if (style === "dribbler" && h < 40) return h < 30 ? "curl" : "chip";
  if (a && a.fin >= 80 && h < 45) return "placed";
  return h < 70 ? "power" : h < 88 ? "placed" : "curl";
}

export function celebrationFor(p: Player | undefined, seed: number): Celebration {
  const h = hash(p?.id ?? 0, seed | 0, 5) % 100;
  if (p && playStyle(p) === "dribbler" && h < 35) return "flip";
  if (h < 30) return "knee";
  if (h < 55) return "pile";
  if (h < 70) return "run";
  if (h < 82 && p && p.attrs.dri >= 65) return "flip";
  return "arms";
}

// ---------------------------------------------------------------- sprite do campinho (HD-2D 16-bit)
export type Pose = "kick" | "header" | "slide" | "fall" | "knee" | "flip" | "stepover" | "card" | "volley" | "bicycle" | "pass" | "save" | "special";

/** O que o desenho precisa de um jogador (o Dude do MatchView tem tudo isso). */
export interface SpriteDude {
  side: 0 | 1 | 2;
  x: number;
  y: number;
  vx: number;
  vy: number;
  walk: number;
  speed: number;
  down: number;
  dive: number;
  diveDir: number;
  arms: number;
  shirt: string;
  sleeve: string;
  shorts: string;
  socks: string;
  pattern: "solid" | "stripes" | "hoops" | "sash" | "halves";
  stripe: string;
  skin: string;
  hair: string;
  look?: Look;
  pose?: Pose;
  poseT0?: number;
  poseUntil?: number;
  poseCard?: "Y" | "R";
}

const OUTLINE = "#08120c";
const CLEAT = "#111827";

export function setPose(d: SpriteDude, pose: Pose, now: number, dur: number) {
  d.pose = pose;
  d.poseT0 = now;
  d.poseUntil = now + dur;
}

function poseOf(d: SpriteDude, now: number): Pose | null {
  return d.pose && now < (d.poseUntil ?? 0) ? d.pose : null;
}

/**
 * Desenha o jogador no campinho em estilo HD-2D 16-bit (Sea of Stars / Pixel Cup Soccer).
 * Usa coordenadas sub-pixel suaves (sem saltos de Math.round) para movimento fluido em 60 FPS.
 */
export function drawPitchDude(g: CanvasRenderingContext2D, d: SpriteDude, now: number, holder: boolean, facing: 1 | -1) {
  const x = d.x;
  const y = d.y;
  const L = d.look;
  const tall = L?.tall ?? 0;
  const pose = poseOf(d, now);
  const s = pose ? clamp01((now - (d.poseT0 ?? now)) / Math.max(1, (d.poseUntil ?? now) - (d.poseT0 ?? now))) : 0;
  const R = (px: number, py: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(px, py, w, h);
  };
  // Retângulo com cantos chanfrados em pixel-art 16-bit (evita aspecto quadrado de bloco)
  const RR = (px: number, py: number, w: number, h: number, c: string, k = 0.38) => {
    g.fillStyle = c;
    g.fillRect(px + k, py, Math.max(0.1, w - k * 2), h);
    g.fillRect(px, py + k, w, Math.max(0.1, h - k * 2));
  };

  // Anel luminoso RPG sob o portador da bola + sombra elíptica suave no gramado
  if (typeof g.beginPath === "function" && typeof g.ellipse === "function") {
    if (holder) {
      const pulse = 0.65 + 0.25 * Math.sin(now * 0.008);
      g.save();
      g.beginPath();
      g.ellipse(x, y + 0.4, 4.4, 2.0, 0, 0, Math.PI * 2);
      g.fillStyle = `rgba(250, 204, 21, ${(0.22 * pulse).toFixed(3)})`;
      g.fill();
      g.lineWidth = 0.45;
      g.strokeStyle = `rgba(250, 204, 21, ${(0.88 * pulse).toFixed(3)})`;
      g.stroke();
      g.restore();
    }
    g.save();
    g.beginPath();
    g.ellipse(x, y + 0.45, 2.9, 1.15, 0, 0, Math.PI * 2);
    g.fillStyle = "rgba(4, 12, 8, 0.44)";
    g.fill();
    g.restore();
  } else {
    R(x - 2.4, y, 4.8, 1.1, "rgba(0,0,0,0.38)");
  }

  // Deitado: lesão, queda após falta, voo do goleiro, carrinho ou deslize de joelhos
  const lyingPose = pose === "fall" || pose === "slide" || pose === "knee";
  if (now < d.down || now < d.dive || lyingPose) {
    const dir = now < d.dive ? d.diveDir : pose === "slide" || pose === "knee" ? facing : 1;
    const lift =
      now < d.dive
        ? Math.sin(Math.PI * clamp01(1 - (d.dive - now) / 450)) * 3.2
        : pose === "fall"
          ? Math.max(0, Math.sin(Math.PI * s * 1.6)) * 2.2
          : 0;
    const lx = x - 3.2;
    const ly = y - 3.2 - lift;
    if (pose === "knee") {
      // Deslizando de joelhos, braços abertos comemorando
      R(x - 3.2, y - 7.4, 6.4, 7.4, OUTLINE);
      R(x - 1.2, y - 6.6, 2.4, 1.4, d.skin);
      R(x - 1.2, y - 7.2, 2.4, 0.8, d.hair);
      R(x - 2.2, y - 5.2, 4.4, 2.4, d.shirt);
      R(x - 4.2, y - 7.8, 1.2, 3.2, d.skin);
      R(x + 3.0, y - 7.8, 1.2, 3.2, d.skin);
      R(x - 2.2, y - 2.8, 4.4, 1.2, d.shorts);
      R(x - 2.2 - dir * 0.8, y - 1.6, 5.0, 1.2, d.socks);
      return;
    }
    R(lx - 0.8, ly - 0.8, 8.8, 3.8, OUTLINE);
    if (now < d.dive) {
      R(dir > 0 ? lx + 6.8 : lx - 2.0, ly, 2.2, 1.2, d.skin);
    }
    R(dir > 0 ? lx + 0.8 : lx + 3.8, ly, 2.2, 2.2, d.shorts);
    R(lx + 2.0, ly, 3.2, 2.2, d.shirt);
    R(dir > 0 ? lx + 5.6 : lx, ly, 1.4, 2.2, d.skin);
    R(dir > 0 ? lx : lx + 5.8, ly, 1.4, 2.2, d.socks);
    if (pose === "slide") R(dir > 0 ? lx - 2.0 : lx + 6.8, ly + 0.8, 2.2, 1.2, d.socks);
    return;
  }

  // Pulo: cabeçada, voleio, bicicleta, mortal
  let jump = 0;
  if (pose === "header") jump = Math.sin(Math.PI * s) * (L?.style === "target" || tall > 0 ? 5.2 : 3.4);
  if (pose === "bicycle" || pose === "flip") jump = Math.sin(Math.PI * s) * 5.2;
  if (pose === "volley") jump = Math.sin(Math.PI * s) * 1.4;
  const by = y - jump;

  // Bicicleta / mortal: de cabeça para baixo no meio do pulo
  if ((pose === "bicycle" || pose === "flip") && s > 0.25 && s < 0.75) {
    R(x - 2.4, by - 8.4, 4.8, 8.4, OUTLINE);
    R(x - 1.2, by - 7.4, 2.4, 1.2, d.socks);
    R(x - 1.2, by - 6.2, 2.4, 1.2, d.skin);
    R(x - 2.0, by - 5.0, 4.0, 1.2, d.shorts);
    R(x - 2.0, by - 3.8, 4.0, 2.2, d.shirt);
    R(x - 1.2, by - 1.8, 2.4, 1.0, d.skin);
    R(x - 1.2, by - 0.9, 2.4, 0.9, d.hair);
    if (pose === "bicycle") R(x + facing * 2.0, by - 9.2, 1.2, 2.2, d.socks);
    return;
  }

  const speed = Math.hypot(d.vx, d.vy);
  const moving = speed > 0.03;
  const sprint = moving && (d.speed >= 1.5 || (L?.style === "speedster" && speed > 0.24));
  const stridePhase = moving ? d.walk * (sprint ? 0.95 : 0.7) : 0;
  const stride = moving ? Math.sin(stridePhase) : 0;
  const bob = moving ? Math.abs(Math.cos(stridePhase)) * 0.45 : 0;
  const up = d.vy < -0.05 && Math.abs(d.vy) > Math.abs(d.vx);
  const arms = now < d.arms;

  const extraH = tall > 0 ? 0.8 : tall < 0 ? -0.4 : 0;
  const top = by - 9.2 - extraH - bob;
  const w = L?.broad ? 4.6 : 4.0;
  const lean = sprint ? facing * 0.65 : moving ? facing * 0.25 : 0;
  const tx = x - w * 0.5 + lean * 0.5;

  // ---------------- PERNAS, MEIÕES E CHUTEIRAS ----------------
  const sy = top + 5.8 + extraH * 0.5;
  const ly = sy + 1.35;
  const legH = Math.max(1.6, by - ly);

  if (pose === "kick" || pose === "volley") {
    const back = s < 0.4;
    // Perna de apoio
    R(x - 1.3, ly - 0.2, 1.5, legH + 0.4, OUTLINE);
    R(x - 1.05, ly, 1.0, legH * 0.48, d.skin);
    R(x - 1.05, ly + legH * 0.45, 1.0, legH * 0.45, d.socks);
    R(x - 1.15, by - 0.55, 1.3, 0.55, CLEAT);
    // Perna do chute
    const kx = back ? x - facing * 2.2 : x + facing * 2.4;
    const ky = back ? ly + 0.5 : ly - 0.2;
    R(kx - 1.1, ky - 0.25, 2.2, 1.5, OUTLINE);
    R(kx - 0.85, ky, 1.7, 0.95, d.socks);
    R(kx + (facing > 0 ? 0.55 : -1.05), ky - 0.05, 0.65, 1.05, CLEAT);
  } else if (pose === "stepover" || (holder && L?.style === "dribbler" && moving && Math.floor(now / 520) % 3 === 0)) {
    const off = Math.sin(now * 0.022) * 1.9;
    R(x - 1.3, ly - 0.2, 1.5, legH + 0.4, OUTLINE);
    R(x - 1.05, ly, 1.0, legH * 0.5, d.skin);
    R(x - 1.05, ly + legH * 0.48, 1.0, legH * 0.45, d.socks);
    R(x - 1.1, by - 0.55, 1.25, 0.55, CLEAT);
    R(x + off - 0.7, ly - 0.1, 1.4, 1.4, OUTLINE);
    R(x + off - 0.45, ly + 0.1, 0.95, 0.95, d.socks);
  } else {
    const swing = stride * (sprint ? 1.35 : 0.95);
    const l1x = x - 1.25 + swing * 0.45;
    const l2x = x + 0.35 - swing * 0.45;
    const l1y = ly - Math.max(0, swing) * 0.35;
    const l2y = ly - Math.max(0, -swing) * 0.35;
    for (const [lx, lTop] of [
      [l1x, l1y],
      [l2x, l2y],
    ] as [number, number][]) {
      const hLeg = Math.max(1.2, by - lTop);
      R(lx - 0.28, lTop - 0.2, 1.5, hLeg + 0.35, OUTLINE);
      R(lx, lTop, 0.96, hLeg * 0.46, d.skin);
      R(lx, lTop + hLeg * 0.44, 0.96, hLeg * 0.44, d.socks);
      // Faixa superior do meião
      R(lx, lTop + hLeg * 0.44, 0.96, 0.25, shade(d.socks, "#ffffff"));
      // Chuteira
      R(lx - 0.1, lTop + hLeg - 0.5, 1.2, 0.52, CLEAT);
    }
  }

  // ---------------- CALÇÃO ----------------
  RR(tx - 0.35, sy - 0.2, w + 0.7, 1.75, OUTLINE, 0.3);
  RR(tx, sy, w, 1.35, d.shorts, 0.25);
  // Divisão sutil entre as pernas do calção e listra lateral
  R(x - 0.15, sy + 0.65, 0.3, 0.7, OUTLINE);
  R(tx, sy + 0.15, 0.32, 1.05, shade(d.shorts, d.stripe));
  R(tx + w - 0.32, sy + 0.15, 0.32, 1.05, shade(d.shorts, d.stripe));

  // ---------------- TRONCO / CAMISA ----------------
  const ty0 = top + 3.05;
  const th = 2.85 + extraH * 0.5;
  RR(tx - 0.4, ty0 - 0.3, w + 0.8, th + 0.6, OUTLINE, 0.42);
  RR(tx, ty0, w, th, d.shirt, 0.32);

  // Padrões de uniforme com nitidez HD-2D
  if (d.pattern === "stripes") {
    const sw = w / 5;
    R(tx + sw, ty0 + 0.15, sw, th - 0.2, d.stripe);
    R(tx + sw * 3, ty0 + 0.15, sw, th - 0.2, d.stripe);
  } else if (d.pattern === "hoops") {
    R(tx + 0.1, ty0 + th * 0.32, w - 0.2, th * 0.34, d.stripe);
  } else if (d.pattern === "halves") {
    R(tx + w * 0.5, ty0 + 0.15, w * 0.5 - 0.15, th - 0.3, d.stripe);
  } else if (d.pattern === "sash") {
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      R(tx + (i / steps) * (w - 0.8), ty0 + (i / steps) * (th - 0.55), 0.85, 0.65, d.stripe);
    }
  }

  // Sombreamento lateral e gola V para volume 2.5D
  R(tx + 0.2, ty0 + th - 0.38, w - 0.4, 0.38, shade(d.shirt, "#000000"));
  R(x - 0.65 + lean * 0.5, ty0, 1.3, 0.42, shade(d.stripe, "#ffffff"));
  R(x - 0.35 + lean * 0.5, ty0, 0.7, 0.28, d.skin);

  // Mangas e braços
  const armSwing = moving ? stride * 0.65 : 0;
  const sleeveColor = d.sleeve || d.shirt;
  if (arms) {
    const wave = Math.sin(now * 0.018) * 0.45;
    RR(tx - 1.15, ty0 - 1.8 + wave, 1.15, 2.4, OUTLINE, 0.25);
    RR(tx + w, ty0 - 1.8 - wave, 1.15, 2.4, OUTLINE, 0.25);
    R(tx - 0.9, ty0 - 0.7 + wave, 0.8, 1.2, sleeveColor);
    R(tx + w + 0.1, ty0 - 0.7 - wave, 0.8, 1.2, sleeveColor);
    R(tx - 0.9, ty0 - 1.55 + wave, 0.8, 0.9, d.skin);
    R(tx + w + 0.1, ty0 - 1.55 - wave, 0.8, 0.9, d.skin);
  } else if (pose === "card") {
    RR(tx + w, ty0 - 2.1, 1.2, 2.4, OUTLINE, 0.25);
    R(tx + w + 0.15, ty0 - 1.9, 0.85, 1.8, sleeveColor);
    R(tx + w + 0.05, ty0 - 3.8, 1.7, 2.1, d.poseCard === "R" ? "#ef3b36" : "#ffd83a");
  } else {
    // Braço esquerdo e direito com balanço natural
    const laY = ty0 + 0.2 - armSwing * 0.45;
    const raY = ty0 + 0.2 + armSwing * 0.45;
    RR(tx - 0.92, laY - 0.15, 0.98, 2.05, OUTLINE, 0.25);
    RR(tx + w - 0.06, raY - 0.15, 0.98, 2.05, OUTLINE, 0.25);
    R(tx - 0.72, laY, 0.72, 0.9, sleeveColor);
    R(tx + w, raY, 0.72, 0.9, sleeveColor);
    R(tx - 0.7, laY + 0.9, 0.68, 0.8, d.skin);
    R(tx + w, raY + 0.9, 0.68, 0.8, d.skin);
  }

  // ---------------- CABEÇA, ROSTO E CABELO (Chibi 16-bit HD-2D) ----------------
  const hs = L?.hairStyle ?? "short";
  const hx = x - 1.5 + lean;
  const hw = 3.0;
  const hh = 2.85;

  // Contorno arredondado da cabeça em pixel art 16-bit
  RR(hx - 0.36, top - 0.36, hw + 0.72, hh + 0.72, OUTLINE, 0.52);
  // Base de pele arredondada
  RR(hx, top + 0.25, hw, hh - 0.25, d.skin, 0.38);
  // Orelhas laterais
  R(hx - 0.22, top + 1.25, 0.25, 0.55, d.skin);
  R(hx + hw - 0.03, top + 1.25, 0.25, 0.55, d.skin);
  // Sombreamento inferior do queixo/rosto
  R(hx + 0.35, top + hh - 0.38, hw - 0.7, 0.38, shade(d.skin, "#7c4c2b"));

  // Olhos expressivos 16-bit (exceto quando correndo de costas)
  if (!up) {
    const shift = facing > 0 ? 0.22 : -0.22;
    R(hx + 0.65 + shift, top + 1.32, 0.38, 0.46, "#111827");
    R(hx + hw - 1.03 + shift, top + 1.32, 0.38, 0.46, "#111827");
  }

  // Barba
  if (L?.beard && !up) {
    const beardColor = shade(d.hair, d.skin);
    RR(hx + 0.25, top + 2.02, hw - 0.5, 0.68, beardColor, 0.22);
  }

  // Cabelo esculpido com volume e brilho no topo
  const hairHighlight = shade(d.hair, "#ffffff");
  if (hs === "afro") {
    RR(hx - 0.55, top - 0.6, hw + 1.1, 1.95, OUTLINE, 0.55);
    RR(hx - 0.3, top - 0.35, hw + 0.6, 1.5, d.hair, 0.42);
    R(hx + 0.35, top - 0.2, hw - 0.7, 0.35, hairHighlight);
  } else if (hs === "mohawk") {
    RR(hx + 0.85, top - 0.75, 1.3, 1.8, OUTLINE, 0.3);
    RR(hx + 1.0, top - 0.55, 1.0, 1.5, d.hair, 0.25);
    R(hx + 1.15, top - 0.45, 0.65, 0.35, hairHighlight);
  } else if (hs === "bald") {
    RR(hx + 0.1, top + 0.15, hw - 0.2, 0.7, d.skin, 0.3);
    R(hx + 0.55, top + 0.22, 1.1, 0.28, shade(d.skin, "#ffffff"));
  } else {
    const hc = hs === "buzz" ? shade(d.hair, d.skin) : d.hair;
    const hTop = up ? hh - 0.2 : 1.18;
    RR(hx - 0.08, top - 0.08, hw + 0.16, hTop, hc, 0.38);
    if (hs !== "buzz") {
      R(hx + 0.45, top + 0.08, hw - 0.9, 0.3, hairHighlight);
      // Costeletas laterais
      R(hx - 0.05, top + 0.85, 0.42, 0.7, hc);
      R(hx + hw - 0.37, top + 0.85, 0.42, 0.7, hc);
    }
    if (hs === "long") {
      RR(facing > 0 ? hx - 0.32 : hx + hw - 0.48, top + 0.75, 0.8, 1.85, d.hair, 0.25);
    }
  }
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Mistura duas cores hex (meio a meio). */
export function shade(a: string, b: string): string {
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) return a;
  const m = pa.map((v, i) => Math.round((v + pb[i]) / 2));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function parse(h: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------- efeitos em pixel (faíscas, rastro)
interface Spark { x: number; y: number; vx: number; vy: number; life: number; c: string }

/** Faíscas na trave, poeira do carrinho, rastro do chute forte: desenhado na escala do campinho. */
export class PixelFX {
  sparks: Spark[] = [];
  streak: { x: number; y: number }[] = [];
  streakColor = "#ffffff";
  streakOn = false;

  burst(x: number, y: number, colors: string[], n = 12, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random() * 0.9) * power;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.3, life: 260 + Math.random() * 260, c: colors[i % colors.length] });
    }
  }

  update(dt: number, ball: { x: number; y: number; h: number }) {
    const k = dt / 16.7;
    for (const s of this.sparks) {
      s.x += s.vx * k;
      s.y += s.vy * k;
      s.vy += 0.05 * k;
      s.life -= dt;
    }
    if (this.sparks.length) this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.streakOn) {
      this.streak.push({ x: ball.x, y: ball.y - ball.h });
      if (this.streak.length > 9) this.streak.shift();
    } else if (this.streak.length) this.streak.shift();
  }

  draw(g: CanvasRenderingContext2D) {
    const n = this.streak.length;
    for (let i = 0; i < n - 1; i++) {
      const p = this.streak[i];
      g.globalAlpha = ((i + 1) / n) * 0.72;
      g.fillStyle = i > n - 4 ? "#ffffff" : this.streakColor;
      g.fillRect(p.x - 0.9, p.y - 0.6, 1.8, 1.1);
    }
    g.globalAlpha = 1;
    for (const s of this.sparks) {
      g.fillStyle = s.c;
      g.fillRect(s.x - 0.45, s.y - 0.45, 0.9, 0.9);
    }
  }
}
