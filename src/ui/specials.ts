// Golpes especiais estilo arcade (Captain Tsubasa / Mario Strikers) no jogo ao vivo.
// Cada jogador tem (ou não) golpes conforme atributos e jogadas preferidas. Quando o motor gera uma
// finalização perigosa ou um gol, às vezes o lance vira "golpe especial": câmera lenta, close no
// jogador, rastro na bola, o nome do golpe na tela e o impacto. É só apresentação: a escolha é
// determinística por jogador e minuto (hash), nunca sorteia no gerador do mundo nem muda o placar,
// então a calibração do motor continua a mesma.
import type { Player } from "../engine/types";
import { hash } from "./matchSprites";

export type ShotKindLite = "header" | "freekick" | "long" | undefined;

export type SpecialId =
  | "trovao" | "folha-seca" | "bicicleta" | "cavadinha" | "trivela" | "canhao" | "cabecada"
  | "voo-gato" | "muralha" | "espalmada";

export interface SpecialDef {
  id: SpecialId;
  /** nome na tela (PT-BR) */
  name: string;
  /** "shot" para quem chuta, "save" para o goleiro */
  role: "shot" | "save";
  /** cores do rastro / brilho (núcleo, borda) */
  colors: [string, string];
  /** como a bola voa: reta e forte, com curva, por cima (cobertura) ou de cabeça */
  flight: "power" | "curve" | "lob" | "header" | "save";
  desc: string;
  /** o jogador tem o golpe? */
  has: (p: Player) => boolean;
  /** serve para esse tipo de finalização? */
  fits: (k: ShotKindLite) => boolean;
}

const t = (p: Player, id: string) => !!p.traits?.includes(id as never);
const open = (k: ShotKindLite) => k === undefined;

export const SPECIALS: SpecialDef[] = [
  {
    id: "trovao", name: "Chute Trovão", role: "shot", colors: ["#fff6a8", "#ffb000"], flight: "power",
    desc: "Finalizador nato: o chute sai rasgando com um estrondo.",
    has: (p) => p.attrs.fin >= 82 || (t(p, "MAT") && p.attrs.fin >= 74), fits: (k) => k !== "header",
  },
  {
    id: "canhao", name: "Canhão", role: "shot", colors: ["#ffd2a0", "#ff4a1c"], flight: "power",
    desc: "Força bruta de longe: a bola vira um míssil.",
    has: (p) => t(p, "CHF") || (p.attrs.fis >= 78 && p.attrs.fin >= 70), fits: (k) => k === "long" || k === undefined,
  },
  {
    id: "folha-seca", name: "Folha Seca", role: "shot", colors: ["#d8ffb0", "#3ad06a"], flight: "curve",
    desc: "A bola sobe e cai de repente, como a de Didi.",
    has: (p) => t(p, "FAL") || (p.attrs.pas >= 80 && p.attrs.fin >= 72), fits: (k) => k === "freekick" || k === "long",
  },
  {
    id: "trivela", name: "Chute de Trivela", role: "shot", colors: ["#c8f2ff", "#2fa8ff"], flight: "curve",
    desc: "Com o lado de fora do pé: curva para dentro do ângulo.",
    has: (p) => p.attrs.dri >= 78 && p.attrs.pas >= 74, fits: (k) => k !== "header",
  },
  {
    id: "cavadinha", name: "Cavadinha", role: "shot", colors: ["#ffe2ff", "#d05cff"], flight: "lob",
    desc: "Frieza total: tira do goleiro por cima.",
    has: (p) => p.attrs.dri >= 80 || (p.attrs.fin >= 80 && p.attrs.dri >= 70), fits: open,
  },
  {
    id: "bicicleta", name: "Bicicleta", role: "shot", colors: ["#ffffff", "#ff5fa2"], flight: "power",
    desc: "Acrobacia de costas para o gol.",
    has: (p) => p.attrs.dri >= 75 && p.attrs.fis >= 66 && p.attrs.fin >= 70, fits: open,
  },
  {
    id: "cabecada", name: "Cabeçada Fulminante", role: "shot", colors: ["#fff3c4", "#ff8a1c"], flight: "header",
    desc: "Sobe mais que todo mundo e testa com violência.",
    has: (p) => t(p, "CAB") || ((p.height ?? 0) >= 188 && p.attrs.fis >= 72), fits: (k) => k === "header",
  },
  {
    id: "voo-gato", name: "Voo do Gato", role: "save", colors: ["#e6fbff", "#22c3d6"], flight: "save",
    desc: "Goleiro voa no ângulo e busca o impossível.",
    has: (p) => p.pos === "GOL" && (p.attrs.gol >= 78 || t(p, "MUR")), fits: () => true,
  },
  {
    id: "muralha", name: "Muralha", role: "save", colors: ["#fff4d6", "#ffc02e"], flight: "save",
    desc: "Fecha o gol inteiro: nada passa.",
    has: (p) => p.pos === "GOL" && (t(p, "MUR") || (p.attrs.gol >= 74 && p.attrs.fis >= 74)), fits: () => true,
  },
  {
    id: "espalmada", name: "Espalmada Relâmpago", role: "save", colors: ["#ffffff", "#7aa7ff"], flight: "save",
    desc: "Reflexo puro: tira com a ponta dos dedos.",
    has: (p) => p.pos === "GOL" && p.attrs.gol >= 70, fits: () => true,
  },
];

const BY_ID = new Map(SPECIALS.map((s) => [s.id, s]));
export const specialDef = (id: SpecialId): SpecialDef => BY_ID.get(id)!;

/** Golpes que o jogador domina (na ordem de preferência). */
export function specialsOf(p: Player | undefined): SpecialDef[] {
  if (!p) return [];
  return SPECIALS.filter((s) => s.has(p));
}

export interface SpecialAsk {
  shooter: Player | undefined;
  keeper: Player | undefined;
  kind: ShotKindLite;
  result: "goal" | "owngoal" | "save" | "miss" | "post" | "var";
  xg: number;
  min: number;
  /** minuto do último golpe especial (para não repetir em sequência) */
  lastMin: number | null;
  /** quantos golpes já saíram no jogo */
  count: number;
}

export interface SpecialPick {
  def: SpecialDef;
  /** quem executa: o finalizador ou o goleiro */
  who: "shooter" | "keeper";
}

/**
 * Decide se o lance vira golpe especial (determinístico). Gols de quem tem golpe viram especial
 * com frequência; defesas difíceis podem virar defesa especial do goleiro. Com intervalo mínimo e
 * teto por jogo, para continuar sendo um momento raro.
 */
export function pickSpecial(a: SpecialAsk): SpecialPick | null {
  if (a.result === "owngoal" || a.result === "var" || a.result === "miss") return null;
  if (a.count >= 4) return null;
  if (a.lastMin != null && Math.abs(a.min - a.lastMin) < 12) return null;
  const h = hash(a.shooter?.id ?? 0, a.keeper?.id ?? 0, a.min, 97) % 100;
  if (a.result === "save") {
    const gk = specialsOf(a.keeper).filter((s) => s.role === "save");
    if (!gk.length || a.xg < 0.18) return null;
    if (h >= 25 + Math.round(a.xg * 60)) return null;
    return { def: gk[h % gk.length], who: "keeper" };
  }
  const mine = specialsOf(a.shooter).filter((s) => s.role === "shot" && s.fits(a.kind));
  if (!mine.length) return null;
  const chance = a.result === "goal" ? 45 : 18; // trave: o golpe que quase entrou
  if (h >= chance + Math.round(a.xg * 30)) return null;
  return { def: mine[hash(a.shooter?.id ?? 0, a.min, 3) % mine.length], who: "shooter" };
}

// ---------------------------------------------------------------- preferência do aparelho
const KEY = "ldb.specials";

/** Golpes especiais ligados? (padrão: sim) */
export function specialsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setSpecialsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* vale só nesta sessão */
  }
}
