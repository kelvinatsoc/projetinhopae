// Jogadas preferidas (traços) com efeito real no motor de partida.
// A geração usa um gerador próprio por jogador: o gerador global do mundo nunca é tocado.
import type { LegendDef } from "../data/legends";
import { hashString, makeRng } from "./rng";
import type { Attrs, Hidden, Player, Pos, TraitId } from "./types";

export interface TraitDef { label: string; emoji: string; desc: string; gk?: true; bad?: true }

export const TRAIT_IDS: TraitId[] = ["MAT", "CHF", "CAB", "DRI", "GAR", "PEN", "FAL", "VEL", "RAC", "DES", "LID", "DEC", "VER", "PEG", "MUR", "PAV"];

export const TRAITS: Record<TraitId, TraitDef> = {
  MAT: { label: "Matador", emoji: "🎯", desc: "Finaliza com frieza: chuta mais vezes e tem 8% mais chance de gol em cada chute." },
  CHF: { label: "Chute de longe", emoji: "💥", desc: "Arrisca de fora da área: chuta mais, mas de mais longe." },
  CAB: { label: "Cabeceador", emoji: "🗼", desc: "Forte no jogo aéreo: perigo nos escanteios." },
  DRI: { label: "Driblador", emoji: "🌀", desc: "Parte para cima e cava faltas e pênaltis." },
  GAR: { label: "Garçom", emoji: "🎁", desc: "Enxerga o passe: dá mais assistências." },
  PEN: { label: "Batedor de pênalti", emoji: "⚽", desc: "Bate os pênaltis do time e converte mais (+6%)." },
  FAL: { label: "Cobrador de falta", emoji: "🪄", desc: "Faltas perto da área viram chance de gol." },
  VEL: { label: "Velocista", emoji: "⚡", desc: "Puxa o contra-ataque: rende mais contra times que se abrem." },
  RAC: { label: "Raçudo", emoji: "🫀", desc: "Corre o jogo todo: cansa 20% menos." },
  DES: { label: "Desarmador", emoji: "🛡️", desc: "Rouba bolas sem precisar fazer falta." },
  LID: { label: "Líder", emoji: "🧭", desc: "Organiza o time; como capitão, segura o grupo nas derrotas." },
  DEC: { label: "Decisivo", emoji: "🏆", desc: "Cresce em mata-mata e clássicos (+4%)." },
  VER: { label: "Polivalente", emoji: "🔁", desc: "Joga bem em várias posições e aprende posições novas mais rápido." },
  PEG: { label: "Pegador de pênalti", emoji: "🧤", desc: "Goleiro especialista: o rival converte 7% menos pênaltis.", gk: true },
  MUR: { label: "Paredão", emoji: "🧱", desc: "Goleiro com reflexos de outro mundo (+3).", gk: true },
  PAV: { label: "Pavio curto", emoji: "🌋", desc: "Esquentado: leva mais cartões e às vezes um vermelho direto.", bad: true },
};

export const hasTrait = (p: Pick<Player, "traits">, t: TraitId) => !!p.traits?.includes(t);
export const traitsOf = (p: Pick<Player, "traits">): TraitId[] => p.traits ?? [];
/** Quantas jogadas positivas o jogador tem. */
export const positiveTraits = (p: Pick<Player, "traits">) => traitsOf(p).filter((t) => !TRAITS[t].bad).length;

/** O que a geração precisa saber do jogador. */
export type TraitSubject = Pick<Player, "pos" | "attrs" | "height" | "sec" | "fame" | "ovr">;

export interface RollOpts {
  real: boolean;
  legend: boolean;
  hid: Hidden;
  age: number; // idade na temporada atual (para Líder)
  mult?: number; // multiplica as chances (lendas sem lista: 2)
  cap?: number; // máximo de jogadas positivas (padrão 3)
}

const OUTFIELD = (p: TraitSubject) => p.pos !== "GOL";
const thr = (table: Partial<Record<Pos, number>>, pos: Pos, others = 999) => table[pos] ?? others;
const has = (pos: Pos, list: Pos[]) => list.includes(pos);

/** Regras na ordem fixa da tabela. Cada regra consome exatamente um sorteio. */
const RULES: { t: Exclude<TraitId, "PAV">; chance: number; ok: (p: TraitSubject, a: Attrs, age: number, got: Set<TraitId>) => boolean }[] = [
  { t: "MAT", chance: 0.8, ok: (p, a) => has(p.pos, ["ATA", "PD", "PE", "MEI"]) && a.fin >= thr({ ATA: 76, PD: 68, PE: 68, MEI: 69 }, p.pos) },
  { t: "CHF", chance: 0.55, ok: (p, a, _g, got) => has(p.pos, ["MC", "MEI", "VOL", "PD", "PE"]) && a.fin >= thr({ MC: 68, MEI: 69, VOL: 57, PD: 68, PE: 68 }, p.pos) && !got.has("MAT") },
  { t: "CAB", chance: 0.5, ok: (p) => has(p.pos, ["ZAG", "ATA", "VOL"]) && p.height >= 186 },
  { t: "DRI", chance: 0.75, ok: (p, a) => OUTFIELD(p) && a.dri >= thr({ PD: 73, PE: 74, MEI: 74, MC: 74, ATA: 71, LD: 70, LE: 70 }, p.pos, 80) },
  { t: "GAR", chance: 0.75, ok: (p, a) => OUTFIELD(p) && a.pas >= thr({ MC: 77, MEI: 73, VOL: 70, LD: 71, LE: 70, PD: 65, PE: 65 }, p.pos, 99) },
  { t: "PEN", chance: 0.2, ok: (p, a) => OUTFIELD(p) && a.fin >= 72 },
  { t: "FAL", chance: 0.25, ok: (p, a) => p.pos !== "GOL" && p.pos !== "ZAG" && a.pas >= 72 && a.fin >= 62 },
  { t: "VEL", chance: 0.7, ok: (p, a) => OUTFIELD(p) && a.vel >= thr({ PD: 73, PE: 73, LD: 74, LE: 74, ATA: 71 }, p.pos, 78) },
  { t: "RAC", chance: 0.65, ok: (p, a) => has(p.pos, ["VOL", "MC", "LD", "LE"]) && a.fis >= thr({ VOL: 72, MC: 69, LD: 70, LE: 69 }, p.pos) },
  { t: "DES", chance: 0.7, ok: (p, a) => has(p.pos, ["ZAG", "VOL", "LD", "LE"]) && a.def >= thr({ ZAG: 75, VOL: 74, LD: 72, LE: 72 }, p.pos) },
  { t: "LID", chance: 0.5, ok: (p, _a, age) => age >= 28 && p.fame >= 26 },
  { t: "DEC", chance: 0.4, ok: (p) => p.fame >= 34 || p.ovr >= 77 },
  { t: "VER", chance: 0.25, ok: (p) => OUTFIELD(p) && p.sec.length >= 1 },
  { t: "PEG", chance: 0.3, ok: (p) => p.pos === "GOL" },
  { t: "MUR", chance: 0.7, ok: (p, a) => p.pos === "GOL" && a.gol >= 72 },
];

/** Prioridade para o limite de jogadas positivas. */
const PRIORITY: TraitId[] = ["MAT", "PEN", "FAL", "DRI", "GAR", "CAB", "DES", "VEL", "MUR", "PEG", "RAC", "CHF", "LID", "DEC", "VER"];

/** Sorteia as jogadas de um jogador. rng deve ser makeRng(hashString(`${w.seed}:${p.id}:t`)). */
export function rollTraits(p: TraitSubject, rng: () => number, o: RollOpts): TraitId[] {
  const got = new Set<TraitId>();
  const mult = o.mult ?? 1;
  for (const rule of RULES) {
    const r = rng(); // sempre consome, mesmo se não elegível
    if (rule.ok(p, p.attrs, o.age, got) && r < Math.min(0.95, rule.chance * mult)) got.add(rule.t);
  }
  const out = PRIORITY.filter((t) => got.has(t)).slice(0, o.cap ?? 3);
  if (!o.real && !o.legend && o.hid[3] >= 17) out.push("PAV");
  return out;
}

/** DNA de lenda: a lista do LegendDef ou, se não houver, um sorteio fixo com chances dobradas. */
export function legendTraitsFor(def: LegendDef): TraitId[] {
  if (def.traits?.length) return def.traits.slice();
  const [vel, fin, pas, dri, de, fis, gol] = def.a;
  const subject: TraitSubject = { pos: def.pos, attrs: { vel, fin, pas, dri, def: de, fis, gol }, height: def.height, sec: def.sec ?? [], fame: 80, ovr: def.ovr };
  const rng = makeRng(hashString(`legend:${def.id}`));
  return rollTraits(subject, rng, { real: false, legend: true, hid: [15, 10, 10, 10, 10, 14, 8], age: 27, mult: 2, cap: 4 });
}

/** Overall mínimo para despertar a 2ª, 3ª e 4ª jogada de uma lenda. */
export const TRAIT_UNLOCK_OVR = [70, 78, 85];

/** Requisitos para aprender uma jogada no treino individual (DEC e PAV não se aprendem). */
export const LEARN_REQ: Partial<Record<TraitId, { text: string; ok: (p: Player, ageY: number) => boolean }>> = {
  MAT: { text: "Finalização 65+", ok: (p) => p.pos !== "GOL" && p.attrs.fin >= 65 },
  CHF: { text: "Finalização 60+", ok: (p) => p.pos !== "GOL" && p.attrs.fin >= 60 },
  CAB: { text: "Altura 180 cm+", ok: (p) => p.pos !== "GOL" && p.height >= 180 },
  DRI: { text: "Drible 68+", ok: (p) => p.pos !== "GOL" && p.attrs.dri >= 68 },
  GAR: { text: "Passe 66+", ok: (p) => p.pos !== "GOL" && p.attrs.pas >= 66 },
  PEN: { text: "Finalização 62+", ok: (p) => p.pos !== "GOL" && p.attrs.fin >= 62 },
  FAL: { text: "Passe 68+ e finalização 58+", ok: (p) => p.pos !== "GOL" && p.attrs.pas >= 68 && p.attrs.fin >= 58 },
  VEL: { text: "Velocidade 72+", ok: (p) => p.pos !== "GOL" && p.attrs.vel >= 72 },
  RAC: { text: "Físico 65+", ok: (p) => p.pos !== "GOL" && p.attrs.fis >= 65 },
  DES: { text: "Marcação 66+", ok: (p) => p.pos !== "GOL" && p.attrs.def >= 66 },
  LID: { text: "24 anos ou mais", ok: (_p, ageY) => ageY >= 24 },
  VER: { text: "Jogador de linha", ok: (p) => p.pos !== "GOL" },
  PEG: { text: "Só goleiros", ok: (p) => p.pos === "GOL" },
  MUR: { text: "Só goleiros", ok: (p) => p.pos === "GOL" },
};

/** O jogador pode treinar esta jogada agora? (requisito atendido, ainda não tem e tem menos de 4 positivas) */
export function canLearn(p: Player, t: TraitId, season: number): boolean {
  const req = LEARN_REQ[t];
  if (!req || hasTrait(p, t) || p.lockedTraits?.includes(t)) return false;
  if (positiveTraits(p) >= 4) return false;
  return req.ok(p, season - p.born);
}
