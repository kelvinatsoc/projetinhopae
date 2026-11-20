// Sprites 16-Bit HD-2D Repaginados (estilo Pixel Cup Soccer / Sea of Stars / Super Arcade Football):
// - Silhueta atlética com pescoço definido, ombros proporcionais, braços separados do tronco e pernas bem distintas
// - Sombra suave e discreta no gramado (sem borrão escuro sob os pés)
// - Passada articulada em 4 fases com inclinação direcional 3/4, cabeçada, carrinho e ponte do goleiro
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

const OUTLINE = "#0b1320";
const CLEAT = "#1e293b";

export function setPose(d: SpriteDude, pose: Pose, now: number, dur: number) {
  d.pose = pose;
  d.poseT0 = now;
  d.poseUntil = now + dur;
}

function poseOf(d: SpriteDude, now: number): Pose | null {
  return d.pose && now < (d.poseUntil ?? 0) ? d.pose : null;
}

/**
 * Desenha o jogador em estilo Pixel-Art 16-Bit Atlético (Pixel Cup Soccer / Super Arcade Football / Sea of Stars).
 * Proporções limpas e elegantes: sombra discreta no gramado, pernas separadas com meiões e chuteiras nítidas,
 * calção com listra, camisa com mangas e braços soltos, pescoço visível e cabeça 16-bit esculpida.
 */
export function drawPitchDude(g: CanvasRenderingContext2D, d: SpriteDude, now: number, holder: boolean, facing: 1 | -1) {
  const x = d.x;
  const y = d.y;
  const L = d.look;
  const tall = L?.tall ?? 0;
  const isKeeper = L?.style === "keeper";
  const pose = poseOf(d, now);
  const s = pose ? clamp01((now - (d.poseT0 ?? now)) / Math.max(1, (d.poseUntil ?? now) - (d.poseT0 ?? now))) : 0;

  const dir: 1 | -1 = Math.abs(d.vx) > 0.015 ? (d.vx >= 0 ? 1 : -1) : facing;

  const R = (px: number, py: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(px, py, w, h);
  };
  const RR = (px: number, py: number, w: number, h: number, c: string, k = 0.28) => {
    g.fillStyle = c;
    g.fillRect(px + k, py, Math.max(0.1, w - k * 2), h);
    g.fillRect(px, py + k, w, Math.max(0.1, h - k * 2));
  };

  // 1. Anel RPG sob o portador da bola + Sombra discreta e translúcida (sem mancha escura sob os pés)
  if (typeof g.beginPath === "function" && typeof g.ellipse === "function") {
    if (holder) {
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.009);
      g.save();
      g.beginPath();
      g.ellipse(x, y + 0.25, 4.4, 1.85, 0, 0, Math.PI * 2);
      g.fillStyle = `rgba(250, 204, 21, ${(0.18 * pulse).toFixed(3)})`;
      g.fill();
      g.lineWidth = 0.45;
      g.strokeStyle = `rgba(250, 204, 21, ${(0.92 * pulse).toFixed(3)})`;
      g.stroke();
      const ax = x + dir * 5.2;
      const ay = y + 0.25;
      g.beginPath();
      g.moveTo(ax + dir * 1.1, ay);
      g.lineTo(ax - dir * 0.35, ay - 0.75);
      g.lineTo(ax - dir * 0.35, ay + 0.75);
      g.closePath();
      g.fillStyle = "#facc15";
      g.fill();
      g.restore();
    }
    g.save();
    g.beginPath();
    g.ellipse(x, y + 0.28, 2.1, 0.72, 0, 0, Math.PI * 2);
    g.fillStyle = "rgba(4, 20, 10, 0.24)";
    g.fill();
    g.restore();
  } else {
    R(x - 1.8, y, 3.6, 0.7, "rgba(0,0,0,0.22)");
  }

  // 2. Poses horizontais (Goleiro voando, carrinho, queda, joelhos)
  const lyingPose = pose === "fall" || pose === "slide" || pose === "knee";
  if (now < d.down || now < d.dive || lyingPose) {
    const pDir = now < d.dive ? (d.diveDir >= 0 ? 1 : -1) : dir;
    const lift =
      now < d.dive
        ? Math.sin(Math.PI * clamp01(1 - (d.dive - now) / 450)) * 3.4
        : pose === "fall"
          ? Math.max(0, Math.sin(Math.PI * s * 1.6)) * 2.0
          : 0;
    const lx = x - 3.2;
    const ly = y - 3.0 - lift;

    if (pose === "knee") {
      RR(x - 2.6, y - 7.6, 5.2, 7.6, OUTLINE, 0.4);
      RR(x - 1.3, y - 7.0, 2.6, 2.0, d.skin, 0.3);
      RR(x - 1.4, y - 7.5, 2.8, 0.9, d.hair, 0.3);
      RR(x - 1.9, y - 4.9, 3.8, 2.4, d.shirt, 0.3);
      RR(x - 3.6, y - 7.2, 1.0, 2.8, d.skin, 0.2);
      RR(x + 2.6, y - 7.2, 1.0, 2.8, d.skin, 0.2);
      RR(x - 1.8, y - 2.5, 3.6, 1.2, d.shorts, 0.2);
      RR(x - 2.0 - pDir * 0.6, y - 1.3, 4.4, 1.1, d.socks, 0.2);
      return;
    }

    RR(lx - 0.6, ly - 0.5, 8.2, 3.4, OUTLINE, 0.4);
    if (now < d.dive) {
      RR(pDir > 0 ? lx + 6.4 : lx - 1.8, ly - 0.1, 2.0, 1.2, "#f8fafc", 0.25);
    }
    RR(pDir > 0 ? lx + 0.6 : lx + 3.6, ly + 0.1, 2.0, 2.0, d.shorts, 0.25);
    RR(lx + 1.8, ly, 3.0, 2.1, d.shirt, 0.3);
    const headX = pDir > 0 ? lx + 4.8 : lx - 0.1;
    RR(headX, ly - 0.2, 2.1, 2.1, d.skin, 0.3);
    RR(headX, ly - 0.4, 2.1, 0.85, d.hair, 0.25);
    RR(pDir > 0 ? lx - 0.4 : lx + 5.4, ly + 0.3, 1.8, 1.6, d.socks, 0.2);
    return;
  }

  // 3. Pulo: Cabeçada, Voleio, Bicicleta
  let jump = 0;
  if (pose === "header") jump = Math.sin(Math.PI * s) * (L?.style === "target" || tall > 0 ? 5.2 : 3.6);
  if (pose === "bicycle" || pose === "flip") jump = Math.sin(Math.PI * s) * 5.2;
  if (pose === "volley") jump = Math.sin(Math.PI * s) * 1.6;
  const by = y - jump;

  if ((pose === "bicycle" || pose === "flip") && s > 0.22 && s < 0.78) {
    RR(x - 2.2, by - 8.4, 4.4, 8.4, OUTLINE, 0.4);
    RR(x - 1.2, by - 7.8, 2.4, 1.2, d.socks, 0.2);
    RR(x - 1.2, by - 6.5, 2.4, 1.2, d.skin, 0.2);
    RR(x - 1.8, by - 5.2, 3.6, 1.2, d.shorts, 0.25);
    RR(x - 1.8, by - 3.9, 3.6, 2.2, d.shirt, 0.3);
    RR(x - 1.3, by - 1.7, 2.6, 1.1, d.skin, 0.25);
    RR(x - 1.3, by - 0.7, 2.6, 0.8, d.hair, 0.25);
    return;
  }

  // 4. Cinemática Atlética 16-Bit (Passada Limpa com Pernas Separadas)
  const speed = Math.hypot(d.vx, d.vy);
  const moving = speed > 0.02;
  const sprint = moving && (d.speed >= 1.4 || (L?.style === "speedster" && speed > 0.2));
  const stridePhase = moving ? d.walk * (sprint ? 1.05 : 0.8) : 0;
  const stride = moving ? Math.sin(stridePhase) : 0;
  const bob = moving ? Math.abs(Math.cos(stridePhase)) * 0.55 : 0;
  const up = d.vy < -0.06 && Math.abs(d.vy) > Math.abs(d.vx) * 1.3;
  const armsUp = now < d.arms;

  const extraH = tall > 0 ? 0.65 : tall < 0 ? -0.35 : 0;
  const top = by - 9.8 - extraH - bob;
  const w = L?.broad ? 3.8 : 3.45;
  const lean = sprint ? dir * 0.65 : moving ? dir * 0.32 : dir * 0.1;
  const tx = x - w * 0.5 + lean * 0.45;
  const ty0 = top + 3.45;
  const th = 2.75 + extraH * 0.4;
  const sy = ty0 + th - 0.1;
  const ly = sy + 1.25;

  const sleeveColor = d.sleeve || d.shirt;
  const handColor = isKeeper ? "#f8fafc" : d.skin;
  const armSwing = moving ? stride * (sprint ? 0.95 : 0.7) : 0;

  // ---------------- PERNAS SEPARADAS E NÍTIDAS (Sem bloco escuro entre os pés) ----------------
  const drawCleanLeg = (baseX: number, swingVal: number, isFront: boolean) => {
    const offX = swingVal * (sprint ? 1.45 : 1.05) * dir;
    const liftY = Math.max(0, isFront ? swingVal : -swingVal) * 0.75;
    const lx = baseX + offX * 0.55;
    const footY = by - liftY;
    const legH = Math.max(1.3, footY - ly);
    const thighH = legH * 0.44;
    const sockH = legH * 0.46;
    const legSkin = isFront ? d.skin : shade(d.skin, "#334155");
    const legSock = isFront ? d.socks : shade(d.socks, "#334155");

    // Contorno fino e elegante da perna (0.18px)
    R(lx - 0.16, ly - 0.1, 1.18, legH + 0.15, OUTLINE);
    // Coxa
    R(lx, ly, 0.86, thighH, legSkin);
    // Meião + listra superior
    R(lx, ly + thighH, 0.86, sockH, legSock);
    R(lx, ly + thighH, 0.86, 0.24, shade(legSock, "#ffffff"));
    // Chuteira compacta apontando para `dir`
    const bootX = dir > 0 ? lx - 0.08 : lx - 0.24;
    R(bootX - 0.12, footY - 0.48, 1.38, 0.54, OUTLINE);
    R(bootX, footY - 0.4, 1.14, 0.4, CLEAT);
    R(bootX + (dir > 0 ? 0.58 : 0.22), footY - 0.34, 0.32, 0.18, "#f8fafc");
  };

  if (pose === "kick" || pose === "volley" || pose === "pass") {
    const backWindup = s < 0.36;
    drawCleanLeg(x - 0.95, -0.1, false);
    drawCleanLeg(x + 0.15, backWindup ? -1.15 : 1.45, true);
  } else {
    // Perna esquerda e direita com separação horizontal clara (x - 1.05 e x + 0.2)
    drawCleanLeg(x - 1.05, -stride, false);
    drawCleanLeg(x + 0.2, stride, true);
  }

  // ---------------- CALÇÃO ----------------
  RR(tx - 0.24, sy - 0.16, w + 0.48, 1.55, OUTLINE, 0.24);
  RR(tx, sy, w, 1.24, d.shorts, 0.2);
  // Divisão central entre as pernas do calção
  R(x - 0.12 + lean * 0.3, sy + 0.58, 0.24, 0.68, OUTLINE);
  // Listra lateral do calção
  R(dir > 0 ? tx + w - 0.35 : tx + 0.05, sy + 0.1, 0.3, 1.04, d.stripe);

  // ---------------- TRONCO / CAMISA ATLÉTICA ----------------
  RR(tx - 0.26, ty0 - 0.22, w + 0.52, th + 0.44, OUTLINE, 0.32);
  RR(tx, ty0, w, th, d.shirt, 0.24);

  if (d.pattern === "stripes") {
    const sw = w / 5;
    R(tx + sw, ty0 + 0.1, sw, th - 0.2, d.stripe);
    R(tx + sw * 3, ty0 + 0.1, sw, th - 0.2, d.stripe);
  } else if (d.pattern === "hoops") {
    R(tx + 0.1, ty0 + th * 0.28, w - 0.2, th * 0.34, d.stripe);
  } else if (d.pattern === "halves") {
    R(tx + w * 0.5, ty0 + 0.1, w * 0.5 - 0.1, th - 0.2, d.stripe);
  } else if (d.pattern === "sash") {
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      R(tx + (i / steps) * (w - 0.7), ty0 + (i / steps) * (th - 0.5), 0.72, 0.55, d.stripe);
    }
  }

  // Sombreamento inferior da camisa + Gola V + Pescoço
  R(tx + 0.15, ty0 + th - 0.32, w - 0.3, 0.32, shade(d.shirt, "#000000"));
  const neckX = x + lean * 0.55 - 0.5;
  R(neckX - 0.15, ty0 - 0.38, 1.3, 0.52, OUTLINE);
  R(neckX, ty0 - 0.32, 1.0, 0.45, shade(d.skin, "#7c4c2b"));
  R(neckX - 0.1, ty0, 1.2, 0.32, shade(d.stripe, "#ffffff"));

  // ---------------- BRAÇOS ESQUERDO E DIREITO (Separados nas laterais do tronco) ----------------
  if (armsUp) {
    const wave = Math.sin(now * 0.018) * 0.4;
    RR(tx - 0.98, ty0 - 1.7 + wave, 0.95, 2.2, OUTLINE, 0.2);
    RR(tx + w + 0.03, ty0 - 1.7 - wave, 0.95, 2.2, OUTLINE, 0.2);
    R(tx - 0.8, ty0 - 0.6 + wave, 0.68, 1.05, sleeveColor);
    R(tx + w + 0.12, ty0 - 0.6 - wave, 0.68, 1.05, sleeveColor);
    R(tx - 0.8, ty0 - 1.48 + wave, 0.68, 0.88, handColor);
    R(tx + w + 0.12, ty0 - 1.48 - wave, 0.68, 0.88, handColor);
  } else if (pose === "card") {
    RR(tx + w, ty0 - 1.9, 1.05, 2.1, OUTLINE, 0.2);
    R(tx + w + 0.12, ty0 - 1.7, 0.75, 1.6, sleeveColor);
    R(tx + w + 0.05, ty0 - 3.5, 1.5, 1.9, d.poseCard === "R" ? "#ef3b36" : "#ffd83a");
  } else {
    const laY = ty0 + 0.12 - armSwing * 0.42;
    const raY = ty0 + 0.12 + armSwing * 0.42;
    // Braço esquerdo
    RR(tx - 0.92, laY - 0.14, 0.88, 2.0, OUTLINE, 0.2);
    R(tx - 0.74, laY, 0.66, 0.88, sleeveColor);
    R(tx - 0.72, laY + 0.88, 0.62, 0.84, handColor);
    // Braço direito
    RR(tx + w + 0.04, raY - 0.14, 0.88, 2.0, OUTLINE, 0.2);
    R(tx + w + 0.08, raY, 0.66, 0.88, sleeveColor);
    R(tx + w + 0.1, raY + 0.88, 0.62, 0.84, handColor);
  }

  // ---------------- CABEÇA 16-BIT ESCULPIDA (Proporção Atlética com Rosto Nítido) ----------------
  const hs = L?.hairStyle ?? "short";
  const hw = 3.15;
  const hh = 2.95;
  const hx = x - hw * 0.5 + lean * 0.75 + dir * 0.12;
  const hy = top + 0.22;

  // Contorno fino e arredondado da cabeça
  RR(hx - 0.26, hy - 0.26, hw + 0.52, hh + 0.52, OUTLINE, 0.48);
  // Pele do rosto
  RR(hx, hy + 0.2, hw, hh - 0.2, d.skin, 0.36);
  // Sombra suave do queixo
  R(hx + 0.35, hy + hh - 0.34, hw - 0.7, 0.34, shade(d.skin, "#7c4c2b"));

  // Orelhas laterais
  R(hx - 0.18, hy + 1.18, 0.22, 0.58, d.skin);
  R(hx + hw - 0.04, hy + 1.18, 0.22, 0.58, d.skin);

  // Olhos 16-bit nítidos olhando para `dir`
  if (!up) {
    const eyeShift = dir * 0.22;
    const e1x = hx + 0.68 + eyeShift;
    const e2x = hx + hw - 1.18 + eyeShift;
    const ey = hy + 1.28;
    R(e1x - 0.08, ey, 0.52, 0.56, "#ffffff");
    R(e2x - 0.08, ey, 0.52, 0.56, "#ffffff");
    const pOff = dir > 0 ? 0.12 : -0.04;
    R(e1x + pOff, ey + 0.08, 0.34, 0.44, "#0f172a");
    R(e2x + pOff, ey + 0.08, 0.34, 0.44, "#0f172a");
    // Sobrancelhas
    R(e1x - 0.08, ey - 0.2, 0.54, 0.18, d.hair);
    R(e2x - 0.08, ey - 0.2, 0.54, 0.18, d.hair);
  }

  // Barba
  if (L?.beard && !up) {
    const beardColor = shade(d.hair, d.skin);
    RR(hx + 0.32, hy + 2.15, hw - 0.64, 0.68, beardColor, 0.22);
  }

  // Cabelo esculpido com brilho no topo
  const hairHighlight = shade(d.hair, "#ffffff");
  if (hs === "afro") {
    RR(hx - 0.48, hy - 0.58, hw + 0.96, 1.9, OUTLINE, 0.5);
    RR(hx - 0.28, hy - 0.38, hw + 0.56, 1.55, d.hair, 0.4);
    R(hx + 0.35, hy - 0.22, hw - 0.7, 0.32, hairHighlight);
  } else if (hs === "mohawk") {
    RR(hx + 0.85, hy - 0.72, 1.45, 1.75, OUTLINE, 0.28);
    RR(hx + 1.0, hy - 0.54, 1.15, 1.45, d.hair, 0.22);
    R(hx + 1.12, hy - 0.42, 0.75, 0.32, hairHighlight);
  } else if (hs === "bald") {
    RR(hx + 0.15, hy + 0.1, hw - 0.3, 0.7, d.skin, 0.28);
    R(hx + 0.65, hy + 0.18, 1.1, 0.28, shade(d.skin, "#ffffff"));
  } else {
    const hc = hs === "buzz" ? shade(d.hair, d.skin) : d.hair;
    const hTop = up ? hh - 0.2 : 1.15;
    RR(hx - 0.08, hy - 0.12, hw + 0.16, hTop, hc, 0.36);
    if (hs !== "buzz") {
      R(hx + 0.45, hy + 0.04, hw - 0.9, 0.28, hairHighlight);
      R(hx - 0.06, hy + 0.78, 0.38, 0.65, hc);
      R(hx + hw - 0.32, hy + 0.78, 0.38, 0.65, hc);
    }
    if (hs === "long") {
      const flowX = dir > 0 ? hx - 0.42 : hx + hw - 0.38;
      RR(flowX, hy + 0.72, 0.78, 1.85, d.hair, 0.22);
    }
  }
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

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
