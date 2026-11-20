// Personalidade e Sprites 16-Bit HD-2D dos jogadores (estilo Sea of Stars / Pixel Cup Soccer / Pocket League Story):
// - Visão 3/4 lateral direcional: o jogador vira para a direção da corrida ou da bola
// - Ciclo de corrida real em 4 fases com coxas, joelhos dobrados, meiões, chuteiras e braços alternados
// - Cabeça Chibi 16-bit expressiva com olhos, esclera, sobrancelhas, orelha, barba e cortes de cabelo com volume
// - Poses acrobáticas (chute com preparação, carrinho com poeira, cabeçada com impulsão, voo horizontal do goleiro)
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

  const r = makeRng(p.face.s ^ 0x5bd1e995);
  const tones = SKIN[p.face.r] ?? SKIN.brown;
  const skin = tones[Math.floor(r() * tones.length)];
  let hair = HAIR[Math.floor(r() * HAIR.length)];
  if (p.face.r === "white" && r() < 0.18) hair = "#c9a24e";
  const styles: HairStyle[] = p.face.r === "black" ? ["afro", "buzz", "short", "bald", "mohawk"] : ["short", "short", "long", "buzz", "mohawk", "bald"];
  const hairStyle = styles[hash(p.face.s, 7) % styles.length];
  return {
    skin,
    hair,
    hairStyle,
    tall: heightBucket(p.height),
    broad: p.attrs.fis >= 78,
    style: playStyle(p),
    num: p.shirt ?? ((hash(p.id) % 30) + 1),
    beard: hash(p.face.s, 11) % 4 === 0,
  };
}

// ---------------------------------------------------------------- escolhas por lance
export type ShotStyle = "power" | "curl" | "chip" | "volley" | "bicycle" | "header" | "placed" | "freekick" | "penalty";

export function shotStyle(p: Player | undefined, kind: "header" | "freekick" | "long" | undefined, min: number, result?: string): ShotStyle {
  if (kind === "header") return "header";
  if (kind === "freekick") return "freekick";
  const h = hash(p?.id ?? 0, min, 31) % 100;
  if (kind === "long") return h < 55 ? "power" : "curl";
  const a = p?.attrs;
  const style = playStyle(p);
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

// ---------------------------------------------------------------- sprite do campinho (HD-2D 16-bit Arcade)
export type Pose = "kick" | "header" | "slide" | "fall" | "knee" | "flip" | "stepover" | "card" | "volley" | "bicycle" | "pass" | "save" | "special";

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

const OUTLINE = "#070d14";
const CLEAT = "#0f172a";

export function setPose(d: SpriteDude, pose: Pose, now: number, dur: number) {
  d.pose = pose;
  d.poseT0 = now;
  d.poseUntil = now + dur;
}

function poseOf(d: SpriteDude, now: number): Pose | null {
  return d.pose && now < (d.poseUntil ?? 0) ? d.pose : null;
}

/**
 * Desenha um jogador em estilo Chibi 16-Bit HD-2D com visão 3/4 direcional (Pixel Cup Soccer / Pocket League Story / Sea of Stars).
 * - Virado para a direção real do movimento (`dir = -1 | 1`)
 * - Pernas articuladas em passada real (coxa, joelho, meião com listra e chuteira com trava)
 * - Braços alternados (braço de trás e braço da frente cruzando o tronco)
 * - Cabeça Chibi 16-bit esculpida com olhos expressivos (esclera + pupila), sobrancelha, orelha e corte de cabelo em camadas
 */
export function drawPitchDude(g: CanvasRenderingContext2D, d: SpriteDude, now: number, holder: boolean, facing: 1 | -1) {
  const x = d.x;
  const y = d.y;
  const L = d.look;
  const tall = L?.tall ?? 0;
  const isKeeper = L?.style === "keeper";
  const pose = poseOf(d, now);
  const s = pose ? clamp01((now - (d.poseT0 ?? now)) / Math.max(1, (d.poseUntil ?? now) - (d.poseT0 ?? now))) : 0;

  // Direção real para onde o boneco olha: direção da velocidade horizontal quando correndo, ou direção do ataque
  const dir: 1 | -1 = Math.abs(d.vx) > 0.015 ? (d.vx >= 0 ? 1 : -1) : facing;

  const R = (px: number, py: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(px, py, w, h);
  };
  const RR = (px: number, py: number, w: number, h: number, c: string, k = 0.4) => {
    g.fillStyle = c;
    g.fillRect(px + k, py, Math.max(0.1, w - k * 2), h);
    g.fillRect(px, py + k, w, Math.max(0.1, h - k * 2));
  };

  // 1. Anel dourado RPG sob o dono da bola + Sombra elíptica projetada no gramado
  if (typeof g.beginPath === "function" && typeof g.ellipse === "function") {
    if (holder) {
      const pulse = 0.72 + 0.28 * Math.sin(now * 0.009);
      g.save();
      g.beginPath();
      g.ellipse(x, y + 0.45, 5.2, 2.3, 0, 0, Math.PI * 2);
      g.fillStyle = `rgba(250, 204, 21, ${(0.24 * pulse).toFixed(3)})`;
      g.fill();
      g.lineWidth = 0.52;
      g.strokeStyle = `rgba(250, 204, 21, ${(0.95 * pulse).toFixed(3)})`;
      g.stroke();
      // Seta direcional de progressão no anel RPG
      const ax = x + dir * 6.1;
      const ay = y + 0.45;
      g.beginPath();
      g.moveTo(ax + dir * 1.3, ay);
      g.lineTo(ax - dir * 0.4, ay - 0.9);
      g.lineTo(ax - dir * 0.4, ay + 0.9);
      g.closePath();
      g.fillStyle = "#facc15";
      g.fill();
      g.restore();
    }
    g.save();
    g.beginPath();
    g.ellipse(x, y + 0.5, 3.4, 1.35, 0, 0, Math.PI * 2);
    g.fillStyle = "rgba(3, 10, 6, 0.48)";
    g.fill();
    g.restore();
  } else {
    R(x - 2.8, y, 5.6, 1.2, "rgba(0,0,0,0.4)");
  }

  // 2. Poses horizontais: Ponte aérea do goleiro, carrinho com poeira, queda ou deslize de joelhos
  const lyingPose = pose === "fall" || pose === "slide" || pose === "knee";
  if (now < d.down || now < d.dive || lyingPose) {
    const pDir = now < d.dive ? (d.diveDir >= 0 ? 1 : -1) : dir;
    const lift =
      now < d.dive
        ? Math.sin(Math.PI * clamp01(1 - (d.dive - now) / 450)) * 3.8
        : pose === "fall"
          ? Math.max(0, Math.sin(Math.PI * s * 1.6)) * 2.4
          : 0;
    const lx = x - 3.6;
    const ly = y - 3.4 - lift;

    if (pose === "knee") {
      RR(x - 3.4, y - 8.2, 6.8, 8.2, OUTLINE, 0.5);
      RR(x - 1.5, y - 7.4, 3.0, 2.2, d.skin, 0.35);
      RR(x - 1.6, y - 8.0, 3.2, 1.0, d.hair, 0.35);
      RR(x - 2.3, y - 5.2, 4.6, 2.6, d.shirt, 0.35);
      RR(x - 4.4, y - 8.0, 1.3, 3.4, d.skin, 0.25);
      RR(x + 3.1, y - 8.0, 1.3, 3.4, d.skin, 0.25);
      RR(x - 2.2, y - 2.7, 4.4, 1.3, d.shorts, 0.25);
      RR(x - 2.4 - pDir * 0.8, y - 1.5, 5.2, 1.3, d.socks, 0.25);
      return;
    }

    // Goleiro voando / Carrinho lateral
    RR(lx - 1.0, ly - 0.9, 9.6, 4.2, OUTLINE, 0.55);
    if (now < d.dive) {
      // Braços esticados com luvas de goleiro buscando o ângulo
      RR(pDir > 0 ? lx + 7.2 : lx - 2.4, ly - 0.2, 2.5, 1.5, "#f8fafc", 0.3);
    }
    RR(pDir > 0 ? lx + 0.8 : lx + 4.2, ly + 0.1, 2.4, 2.4, d.shorts, 0.3);
    RR(lx + 2.1, ly, 3.6, 2.5, d.shirt, 0.35);
    // Cabeça virada na direção do voo/carrinho
    const headX = pDir > 0 ? lx + 5.6 : lx - 0.2;
    RR(headX, ly - 0.3, 2.4, 2.5, d.skin, 0.35);
    RR(headX, ly - 0.5, 2.4, 1.0, d.hair, 0.3);
    // Pernas e meiões esticados
    RR(pDir > 0 ? lx - 0.6 : lx + 6.2, ly + 0.3, 2.2, 2.0, d.socks, 0.25);
    if (pose === "slide") {
      // Poeira/grama levantando no carrinho
      R(pDir > 0 ? lx - 2.4 : lx + 8.4, ly + 1.4, 1.4, 0.9, "rgba(226, 232, 240, 0.7)");
      R(pDir > 0 ? lx - 3.6 : lx + 9.8, ly + 0.8, 1.0, 0.7, "rgba(187, 247, 208, 0.65)");
    }
    return;
  }

  // 3. Pulo: Cabeçada, Voleio, Bicicleta, Mortal
  let jump = 0;
  if (pose === "header") jump = Math.sin(Math.PI * s) * (L?.style === "target" || tall > 0 ? 5.8 : 4.0);
  if (pose === "bicycle" || pose === "flip") jump = Math.sin(Math.PI * s) * 5.8;
  if (pose === "volley") jump = Math.sin(Math.PI * s) * 1.8;
  const by = y - jump;

  if ((pose === "bicycle" || pose === "flip") && s > 0.22 && s < 0.78) {
    RR(x - 2.6, by - 9.0, 5.2, 9.0, OUTLINE, 0.5);
    RR(x - 1.4, by - 8.2, 2.8, 1.4, d.socks, 0.25);
    RR(x - 1.4, by - 6.8, 2.8, 1.3, d.skin, 0.25);
    RR(x - 2.1, by - 5.5, 4.2, 1.4, d.shorts, 0.3);
    RR(x - 2.1, by - 4.1, 4.2, 2.4, d.shirt, 0.35);
    RR(x - 1.5, by - 1.8, 3.0, 1.2, d.skin, 0.3);
    RR(x - 1.5, by - 0.8, 3.0, 0.9, d.hair, 0.3);
    if (pose === "bicycle") RR(x + dir * 2.1, by - 9.8, 1.3, 2.4, d.socks, 0.25);
    return;
  }

  // 4. Cinemática de Corrida Direcional 3/4 (4 fases com inclinação de sprint e poeira)
  const speed = Math.hypot(d.vx, d.vy);
  const moving = speed > 0.02;
  const sprint = moving && (d.speed >= 1.4 || (L?.style === "speedster" && speed > 0.2));
  const stridePhase = moving ? d.walk * (sprint ? 1.08 : 0.82) : 0;
  const stride = moving ? Math.sin(stridePhase) : 0;
  const bob = moving ? Math.abs(Math.cos(stridePhase)) * 0.65 : Math.sin(now * 0.004 + x) * 0.15;
  const up = d.vy < -0.06 && Math.abs(d.vy) > Math.abs(d.vx) * 1.3;
  const armsUp = now < d.arms;

  // Poeira sutil de grama quando o jogador arranca em sprint
  if (sprint && Math.abs(stride) > 0.75) {
    const puffX = x - dir * (2.6 + (now % 3) * 0.6);
    const puffY = y - 0.2 - (now % 2) * 0.4;
    R(puffX, puffY, 0.95, 0.65, "rgba(187, 247, 208, 0.45)");
  }

  const extraH = tall > 0 ? 0.85 : tall < 0 ? -0.4 : 0;
  const top = by - 10.6 - extraH - bob;
  const w = L?.broad ? 4.8 : 4.3;
  const lean = sprint ? dir * 0.95 : moving ? dir * 0.48 : dir * 0.15;
  const tx = x - w * 0.5 + lean * 0.55;
  const ty0 = top + 3.85;
  const th = 3.15 + extraH * 0.45;
  const sy = ty0 + th - 0.15;
  const ly = sy + 1.35;

  const sleeveColor = d.sleeve || d.shirt;
  const handColor = isKeeper ? "#f8fafc" : d.skin;
  const armSwing = moving ? stride * (sprint ? 1.15 : 0.85) : 0;

  // ---------------- BRAÇO DE TRÁS (atrás do tronco na visão 3/4) ----------------
  if (!armsUp && pose !== "card") {
    const backArmX = dir > 0 ? tx - 0.75 - armSwing * 0.55 : tx + w - 0.25 + armSwing * 0.55;
    const backArmY = ty0 + 0.25 + armSwing * 0.35;
    RR(backArmX - 0.22, backArmY - 0.22, 1.35, 2.35, OUTLINE, 0.25);
    RR(backArmX, backArmY, 0.92, 1.05, shade(sleeveColor, "#000000"), 0.2);
    RR(backArmX + dir * 0.1, backArmY + 1.0, 0.88, 0.92, shade(handColor, "#000000"), 0.2);
  }

  // ---------------- PERNAS ARTICULADAS EM 3/4 (Perna de trás + Perna da frente) ----------------
  const drawLeg = (hipX: number, swingVal: number, isFront: boolean) => {
    const stepX = swingVal * (sprint ? 2.15 : 1.55) * dir;
    const liftY = Math.max(0, isFront ? swingVal : -swingVal) * (sprint ? 1.15 : 0.75);
    const kneeX = hipX + stepX * 0.48 + dir * 0.22;
    const footX = hipX + stepX;
    const footY = by - liftY;
    const thighY = ly - 0.1;
    const kneeY = (thighY + footY) * 0.5;
    const legSkin = isFront ? d.skin : shade(d.skin, "#1e293b");
    const legSock = isFront ? d.socks : shade(d.socks, "#1e293b");

    // Contorno da coxa + canela
    RR(Math.min(hipX, kneeX) - 0.35, thighY - 0.2, Math.abs(kneeX - hipX) + 1.75, kneeY - thighY + 0.65, OUTLINE, 0.25);
    RR(Math.min(kneeX, footX) - 0.35, kneeY - 0.15, Math.abs(footX - kneeX) + 1.75, footY - kneeY + 0.45, OUTLINE, 0.25);

    // Coxa
    R(kneeX - 0.05, thighY, 1.12, Math.max(0.7, kneeY - thighY), legSkin);
    // Meião e faixa superior do meião
    const shinH = Math.max(0.8, footY - kneeY - 0.4);
    R(footX - 0.05, kneeY, 1.12, shinH, legSock);
    R(footX - 0.05, kneeY, 1.12, 0.32, shade(legSock, "#ffffff"));

    // Chuteira direcional (ponta virada para `dir`)
    const bootX = dir > 0 ? footX - 0.15 : footX - 0.45;
    RR(bootX - 0.2, footY - 0.68, 1.85, 0.85, OUTLINE, 0.2);
    RR(bootX, footY - 0.52, 1.5, 0.58, CLEAT, 0.15);
    // Detalhe branco na chuteira
    R(bootX + (dir > 0 ? 0.45 : 0.65), footY - 0.42, 0.42, 0.24, "#e2e8f0");
  };

  if (pose === "kick" || pose === "volley" || pose === "pass") {
    const backWindup = s < 0.36;
    // Perna de apoio firme no gramado
    drawLeg(x - dir * 0.45, -0.15, false);
    // Perna do chute: prepara atrás e chicoteia à frente na altura da cintura
    const kickSwing = backWindup ? -1.35 : 1.75;
    drawLeg(x + dir * 0.35, kickSwing, true);
  } else if (pose === "stepover" || (holder && L?.style === "dribbler" && moving && Math.floor(now / 420) % 3 === 0)) {
    const pedal = Math.sin(now * 0.025) * 1.45;
    drawLeg(x - dir * 0.4, -pedal, false);
    drawLeg(x + dir * 0.4, pedal, true);
  } else {
    // Passada natural: perna de trás primeiro, depois perna da frente
    drawLeg(x - dir * 0.42, -stride, false);
    drawLeg(x + dir * 0.38, stride, true);
  }

  // ---------------- CALÇÃO ----------------
  RR(tx - 0.38, sy - 0.22, w + 0.76, 1.85, OUTLINE, 0.32);
  RR(tx, sy, w, 1.42, d.shorts, 0.25);
  R(tx + 0.2, sy + 1.05, w - 0.4, 0.35, shade(d.shorts, "#000000"));
  // Listra lateral do calção no lado visível da câmera
  const stripeSideX = dir > 0 ? tx + 0.25 : tx + w - 0.65;
  R(stripeSideX, sy + 0.12, 0.42, 1.22, d.stripe);

  // ---------------- TRONCO / CAMISA ----------------
  RR(tx - 0.44, ty0 - 0.34, w + 0.88, th + 0.68, OUTLINE, 0.45);
  RR(tx, ty0, w, th, d.shirt, 0.35);

  if (d.pattern === "stripes") {
    const sw = w / 5;
    R(tx + sw, ty0 + 0.15, sw, th - 0.25, d.stripe);
    R(tx + sw * 3, ty0 + 0.15, sw, th - 0.25, d.stripe);
  } else if (d.pattern === "hoops") {
    R(tx + 0.12, ty0 + th * 0.28, w - 0.24, th * 0.36, d.stripe);
  } else if (d.pattern === "halves") {
    R(tx + w * 0.5, ty0 + 0.15, w * 0.5 - 0.15, th - 0.25, d.stripe);
  } else if (d.pattern === "sash") {
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      R(tx + (i / steps) * (w - 0.85), ty0 + (i / steps) * (th - 0.6), 0.9, 0.7, d.stripe);
    }
  }

  // Volume 2.5D na camisa (sombra inferior + brilho no ombro + gola V deslocada para `dir`)
  R(tx + 0.2, ty0 + th - 0.42, w - 0.4, 0.42, shade(d.shirt, "#000000"));
  R(tx + 0.3, ty0 + 0.12, w - 0.6, 0.28, shade(d.shirt, "#ffffff"));
  const collarX = x + lean * 0.5 + dir * 0.35;
  R(collarX - 0.65, ty0, 1.3, 0.48, shade(d.stripe, "#ffffff"));
  R(collarX - 0.35, ty0, 0.7, 0.32, d.skin);

  // ---------------- BRAÇO DA FRENTE (cruzando na frente na visão 3/4) ----------------
  if (armsUp) {
    const wave = Math.sin(now * 0.018) * 0.48;
    RR(tx - 1.25, ty0 - 2.0 + wave, 1.25, 2.6, OUTLINE, 0.28);
    RR(tx + w, ty0 - 2.0 - wave, 1.25, 2.6, OUTLINE, 0.28);
    R(tx - 0.98, ty0 - 0.8 + wave, 0.88, 1.3, sleeveColor);
    R(tx + w + 0.1, ty0 - 0.8 - wave, 0.88, 1.3, sleeveColor);
    R(tx - 0.98, ty0 - 1.75 + wave, 0.88, 0.98, handColor);
    R(tx + w + 0.1, ty0 - 1.75 - wave, 0.88, 0.98, handColor);
  } else if (pose === "card") {
    RR(tx + w, ty0 - 2.2, 1.3, 2.5, OUTLINE, 0.25);
    R(tx + w + 0.15, ty0 - 2.0, 0.9, 1.9, sleeveColor);
    R(tx + w + 0.05, ty0 - 4.0, 1.8, 2.2, d.poseCard === "R" ? "#ef3b36" : "#ffd83a");
  } else {
    const frontArmX = dir > 0 ? tx + 0.15 + armSwing * 0.7 : tx + w - 1.15 - armSwing * 0.7;
    const frontArmY = ty0 + 0.32 - armSwing * 0.28;
    RR(frontArmX - 0.24, frontArmY - 0.22, 1.42, 2.45, OUTLINE, 0.28);
    RR(frontArmX, frontArmY, 0.96, 1.1, sleeveColor, 0.2);
    RR(frontArmX + dir * 0.15, frontArmY + 1.05, 0.92, 0.98, handColor, 0.2);
  }

  // ---------------- CABEÇA CHIBI 16-BIT DIRECIONAL (3/4 Profile) ----------------
  const hs = L?.hairStyle ?? "short";
  const hw = 3.75;
  const hh = 3.55;
  const hx = x - hw * 0.5 + lean * 0.85 + dir * 0.18;
  const hy = top + 0.2;

  // Contorno externo arredondado da cabeça
  RR(hx - 0.42, hy - 0.42, hw + 0.84, hh + 0.84, OUTLINE, 0.62);
  // Pele do rosto
  RR(hx, hy + 0.25, hw, hh - 0.25, d.skin, 0.46);
  // Sombreamento do queixo e bochecha
  R(hx + 0.35, hy + hh - 0.45, hw - 0.7, 0.45, shade(d.skin, "#7c4c2b"));

  // Orelha no lado de trás da cabeça (visão 3/4)
  const earX = dir > 0 ? hx - 0.28 : hx + hw - 0.12;
  RR(earX - 0.15, hy + 1.35, 0.68, 0.95, OUTLINE, 0.18);
  R(earX, hy + 1.48, 0.4, 0.68, d.skin);

  // Olhos 16-bit expressivos com esclera branca + pupila direcional + sobrancelha (exceto de costas)
  if (!up) {
    const eye1X = dir > 0 ? hx + 1.35 : hx + 0.45;
    const eye2X = dir > 0 ? hx + 2.65 : hx + 1.75;
    const eyeY = hy + 1.48;

    // Esclera branca
    R(eye1X - 0.1, eyeY, 0.68, 0.72, "#ffffff");
    R(eye2X - 0.1, eyeY, 0.62, 0.72, "#ffffff");
    // Pupilas olhando para `dir`
    const pOff = dir > 0 ? 0.16 : -0.06;
    R(eye1X + pOff, eyeY + 0.1, 0.42, 0.56, "#0f172a");
    R(eye2X + pOff, eyeY + 0.1, 0.4, 0.56, "#0f172a");
    // Sobrancelhas
    R(eye1X - 0.12, eyeY - 0.26, 0.72, 0.22, d.hair);
    R(eye2X - 0.08, eyeY - 0.26, 0.64, 0.22, d.hair);
  }

  // Barba / cavanhaque em 3/4
  if (L?.beard && !up) {
    const beardColor = shade(d.hair, d.skin);
    const bx0 = dir > 0 ? hx + 0.85 : hx + 0.15;
    RR(bx0, hy + 2.48, hw - 1.0, 0.88, beardColor, 0.25);
  }

  // Cortes de cabelo esculpidos com volume 16-bit e franja direcional
  const hairHighlight = shade(d.hair, "#ffffff");
  const hairShadow = shade(d.hair, "#000000");
  if (hs === "afro") {
    RR(hx - 0.68, hy - 0.78, hw + 1.36, 2.35, OUTLINE, 0.65);
    RR(hx - 0.42, hy - 0.52, hw + 0.84, 1.88, d.hair, 0.5);
    R(hx + 0.4, hy - 0.35, hw - 0.8, 0.42, hairHighlight);
    R(dir > 0 ? hx - 0.38 : hx + hw - 0.35, hy + 0.85, 0.75, 1.15, d.hair);
  } else if (hs === "mohawk") {
    RR(hx + 0.95, hy - 0.95, 1.75, 2.1, OUTLINE, 0.35);
    RR(hx + 1.15, hy - 0.72, 1.35, 1.75, d.hair, 0.28);
    R(hx + 1.3, hy - 0.58, 0.9, 0.42, hairHighlight);
  } else if (hs === "bald") {
    RR(hx + 0.15, hy + 0.1, hw - 0.3, 0.85, d.skin, 0.35);
    R(hx + 0.75, hy + 0.2, 1.3, 0.35, shade(d.skin, "#ffffff"));
  } else {
    const hc = hs === "buzz" ? shade(d.hair, d.skin) : d.hair;
    const hTop = up ? hh - 0.2 : 1.42;
    RR(hx - 0.14, hy - 0.18, hw + 0.28, hTop, hc, 0.45);
    if (hs !== "buzz") {
      // Brilho no topo do cabelo
      R(hx + 0.55, hy + 0.02, hw - 1.1, 0.36, hairHighlight);
      // Nuca e costeleta no lado de trás da cabeça
      const backHairX = dir > 0 ? hx - 0.14 : hx + hw - 0.58;
      RR(backHairX, hy + 0.85, 0.72, 1.25, hairShadow, 0.2);
      // Topete / franja apontando para `dir`
      const bangX = dir > 0 ? hx + hw - 0.65 : hx - 0.25;
      RR(bangX, hy + 0.15, 0.9, 0.85, hc, 0.22);
    }
    if (hs === "long") {
      // Cabelo comprido esvoaçando para trás na corrida
      const flowX = dir > 0 ? hx - 0.58 : hx + hw - 0.45;
      RR(flowX - 0.2, hy + 0.75, 1.25, 2.35, OUTLINE, 0.3);
      RR(flowX, hy + 0.88, 0.92, 2.05, d.hair, 0.25);
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
      if (this.streak.length > 12) this.streak.shift();
    } else if (this.streak.length) this.streak.shift();
  }

  draw(g: CanvasRenderingContext2D) {
    const n = this.streak.length;
    for (let i = 0; i < n - 1; i++) {
      const p = this.streak[i];
      g.fillStyle = this.streakColor;
      g.globalAlpha = ((i + 1) / n) * 0.58;
      const sz = 1.0 + (i / n) * 1.4;
      g.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
    }
    g.globalAlpha = 1;
    for (const s of this.sparks) {
      g.fillStyle = s.c;
      const sz = s.life > 180 ? 1.5 : 0.95;
      g.fillRect(s.x - sz * 0.5, s.y - sz * 0.5, sz, sz);
    }
  }
}
