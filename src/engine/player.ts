// Criação, evolução e valor de jogadores.
import { generateName, natForClub, raceForNat } from "../data/names";
import { PROFILE, POS_GROUP, rawOvr, recalcOvr, WEIGHTS } from "./positions";
import { clamp, gauss, pickWeighted, rand, randInt } from "./rng";
import type { Attrs, Club, Player, Pos, SeasonStats, World } from "./types";

export const emptyStats = (): SeasonStats => ({ apps: 0, goals: 0, assists: 0, ratingSum: 0, yel: 0, red: 0, motm: 0, cs: 0 });

export const age = (p: Player, season: number) => season - p.born;

const ATTR_KEYS: (keyof Attrs)[] = ["vel", "fin", "pas", "dri", "def", "fis", "gol"];

/** Gera atributos coerentes com uma posição e um overall alvo. */
export function makeAttrs(pos: Pos, target: number, opts: { height?: number; age?: number; base?: Partial<Attrs> } = {}): Attrs {
  const prof = PROFILE[pos];
  const a = {} as Attrs;
  for (const k of ATTR_KEYS) {
    const b = opts.base?.[k];
    a[k] = b !== undefined ? b : target + prof[k] + gauss(0, 4);
  }
  if (pos !== "GOL") a.gol = randInt(6, 22);
  // altura influencia físico; idade influencia velocidade
  if (opts.height) a.fis += (opts.height - 180) * 0.35;
  if (opts.age !== undefined) {
    if (opts.age >= 31) a.vel -= (opts.age - 30) * 1.5;
    if (opts.age <= 20) a.fis -= (21 - opts.age) * 1.5;
  }
  fitAttrs(a, pos, target);
  return a;
}

/** Ajusta os atributos relevantes para que o overall na posição seja exatamente "target". */
export function fitAttrs(a: Attrs, pos: Pos, target: number) {
  const w = WEIGHTS[pos];
  for (let i = 0; i < 6; i++) {
    for (const k of ATTR_KEYS) a[k] = clamp(Math.round(a[k]), 5, 99);
    const diff = target - rawOvr(a, pos);
    if (diff === 0) break;
    for (const k in w) {
      const key = k as keyof Attrs;
      a[key] = clamp(a[key] + diff * (1 + rand() * 0.2), 5, 99);
    }
  }
  for (const k of ATTR_KEYS) a[k] = clamp(Math.round(a[k]), 5, 99);
}

/** Salário mensal pedido por um jogador (R$). */
export function wageFor(ovr: number, clubRep: number, ageYears = 26): number {
  const base = 4000 * Math.exp((ovr - 50) * 0.175);
  const repMult = 0.55 + clubRep / 160;
  const ageMult = ageYears <= 19 ? 0.35 : ageYears <= 21 ? 0.6 : ageYears >= 34 ? 0.85 : 1;
  return roundMoney(base * repMult * ageMult);
}

/** Valor de mercado (R$). */
export function playerValue(p: Player, season: number): number {
  const a = age(p, season);
  const ovr = p.ovr;
  let v = 1_500_000 * Math.exp((ovr - 65) * 0.2);
  if (ovr < 55) v *= 0.6;
  const ageMult =
    a <= 18 ? 1.35 : a <= 21 ? 1.45 : a <= 24 ? 1.25 : a <= 27 ? 1.05 : a <= 29 ? 0.85 : a <= 31 ? 0.6 : a <= 33 ? 0.35 : 0.18;
  v *= ageMult;
  // potencial ainda não atingido vale dinheiro
  if (a <= 23) v *= 1 + Math.max(0, p.pot - ovr) * 0.045;
  if (p.legend) v *= 1.6;
  v *= 0.85 + p.fame / 250;
  return roundMoney(Math.max(25_000, v));
}

export function roundMoney(v: number): number {
  if (v >= 10_000_000) return Math.round(v / 500_000) * 500_000;
  if (v >= 1_000_000) return Math.round(v / 50_000) * 50_000;
  if (v >= 100_000) return Math.round(v / 5_000) * 5_000;
  return Math.round(v / 500) * 500;
}

export function newPlayerBase(w: World, fields: Partial<Player> & Pick<Player, "name" | "nat" | "born" | "pos" | "attrs" | "pot">): Player {
  const p: Player = {
    id: w.nextPid++,
    sec: [],
    foot: rand() < 0.25 ? "E" : "D",
    height: 178,
    ovr: 0,
    clubId: null,
    youth: false,
    wage: 0,
    contractEnd: w.season + 1,
    cond: 100,
    morale: 70,
    injury: 0,
    bans: {},
    yel: {},
    face: { s: randInt(1, 2 ** 31 - 1), r: raceForNat(fields.nat) },
    joined: w.season,
    stats: emptyStats(),
    compGoals: {},
    history: [],
    form: [],
    fame: 5,
    ...fields,
  };
  recalcOvr(p);
  w.players[p.id] = p;
  return p;
}

/** Posição aleatória respeitando a distribuição de um elenco real. */
export function randomPos(): Pos {
  return pickWeighted<Pos>(
    ["GOL", "ZAG", "LD", "LE", "VOL", "MC", "MEI", "PD", "PE", "ATA"],
    [9, 17, 9, 9, 11, 11, 9, 8, 8, 11],
  );
}

const SEC_OPTIONS: Partial<Record<Pos, Pos[]>> = {
  ZAG: ["VOL", "LD", "LE"], LD: ["PD", "ZAG", "LE"], LE: ["PE", "ZAG", "LD"], VOL: ["MC", "ZAG"],
  MC: ["VOL", "MEI"], MEI: ["MC", "PD", "PE", "ATA"], PD: ["PE", "MEI", "ATA"], PE: ["PD", "MEI", "ATA"], ATA: ["PD", "PE", "MEI"],
};

export function randomSecondary(pos: Pos): Pos[] {
  const opts = SEC_OPTIONS[pos];
  if (!opts || rand() < 0.35) return [];
  const out: Pos[] = [opts[Math.floor(rand() * opts.length)]];
  if (rand() < 0.25) {
    const o2 = opts[Math.floor(rand() * opts.length)];
    if (!out.includes(o2)) out.push(o2);
  }
  return out;
}

/**
 * Gera um jogador fictício.
 * @param level overall alvo aproximado
 * @param ageYears idade
 */
export function generatePlayer(w: World, club: Club | null, level: number, ageYears: number, pos?: Pos, youth = false): Player {
  const nat = natForClub(club?.country ?? "BRA");
  const position = pos ?? randomPos();
  const height = Math.round(
    (position === "GOL" ? 188 : position === "ZAG" ? 185 : position === "ATA" ? 181 : 176) + gauss(0, 5),
  );
  const ovr = clamp(Math.round(level + gauss(0, 2.5)), 30, 92);
  let growth = 0;
  if (ageYears <= 17) growth = 8 + rand() * 22;
  else if (ageYears <= 19) growth = 5 + rand() * 16;
  else if (ageYears <= 21) growth = 3 + rand() * 11;
  else if (ageYears <= 23) growth = 1 + rand() * 7;
  else if (ageYears <= 26) growth = rand() * 4;
  const pot = clamp(Math.round(ovr + growth), ovr, 94);
  const p = newPlayerBase(w, {
    name: generateName(nat),
    nat,
    born: w.season - ageYears,
    pos: position,
    sec: randomSecondary(position),
    height,
    attrs: makeAttrs(position, ovr, { height, age: ageYears }),
    pot,
    youth,
    fame: clamp(Math.round((ovr - 50) * 0.6 + gauss(0, 3)), 0, 40),
  });
  if (club) {
    p.clubId = club.id;
    club.players.push(p.id);
    p.wage = wageFor(p.ovr, club.rep, ageYears);
    p.contractEnd = w.season + (youth ? randInt(1, 3) : randInt(0, 3));
  }
  return p;
}

// ------------------------------------------------------------ evolução
/**
 * Evolução de meia temporada. Jovens crescem rumo ao potencial (mais rápido se jogam),
 * veteranos caem. Lendas renascidas crescem de forma mais confiável.
 */
export function developPlayer(p: Player, season: number, facilities: number) {
  const a = age(p, season);
  const gap = p.pot - p.ovr;
  const played = p.stats.apps;
  const playFactor = p.youth ? 0.8 : played >= 12 ? 1.25 : played >= 5 ? 1.05 : 0.85;
  const facFactor = 0.85 + facilities * 0.06;
  let delta = 0;
  if (a <= 23) {
    const rate = a <= 18 ? 0.22 : a <= 20 ? 0.2 : a <= 22 ? 0.17 : 0.13;
    delta = gap * rate * playFactor * facFactor + gauss(0, p.legend ? 0.6 : 1.1);
    if (p.legend) delta = Math.max(delta, Math.min(gap, 2.5));
  } else if (a <= 28) {
    delta = gap * 0.12 * playFactor + gauss(0, 0.7);
  } else if (a <= 31) {
    delta = gauss(-0.35, 0.8);
  } else if (a <= 33) {
    delta = gauss(-1.3, 0.9);
  } else {
    delta = gauss(-2.2, 1.1);
  }
  delta = clamp(delta, -6, 8);
  if (delta > 0 && p.ovr + delta > p.pot) delta = Math.max(0, p.pot - p.ovr);
  applyDelta(p, delta, a);
}

function applyDelta(p: Player, delta: number, ageYears: number) {
  if (Math.abs(delta) < 0.3) return;
  const target = clamp(Math.round(p.ovr + delta), 20, 99);
  // veteranos perdem velocidade e físico primeiro; jovens ganham físico
  if (delta < 0 && ageYears >= 30) {
    p.attrs.vel = clamp(p.attrs.vel + delta * 1.4, 10, 99);
    p.attrs.fis = clamp(p.attrs.fis + delta * 0.9, 10, 99);
  } else if (delta > 0 && ageYears <= 21) {
    p.attrs.fis = clamp(p.attrs.fis + delta * 0.8, 10, 99);
  }
  fitAttrs(p.attrs, p.pos, target);
  recalcOvr(p);
  if (p.pot < p.ovr) p.pot = p.ovr;
}

/** Probabilidade de aposentadoria ao fim da temporada. */
export function retireChance(p: Player, season: number): number {
  const a = age(p, season) - (p.pos === "GOL" ? 2 : 0);
  let base = a < 32 ? 0 : a === 32 ? 0.05 : a === 33 ? 0.1 : a === 34 ? 0.2 : a === 35 ? 0.35 : a === 36 ? 0.55 : a === 37 ? 0.75 : 0.92;
  if (!p.clubId && a >= 30) base += 0.35;
  if (p.ovr >= 80) base *= 0.7;
  return clamp(base, 0, 0.98);
}

export function isGK(p: Player) {
  return p.pos === "GOL";
}

export function groupOf(p: Player) {
  return POS_GROUP[p.pos];
}

export function shortName(name: string): string {
  const parts = name.split(" ");
  if (parts.length <= 1 || name.length <= 12) return name;
  const particles = new Set(["de", "da", "do", "dos", "das", "del", "van", "von", "di", "la"]);
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (particles.has(prev.toLowerCase())) return `${prev} ${last}`;
  return `${parts[0][0]}. ${last}`;
}
