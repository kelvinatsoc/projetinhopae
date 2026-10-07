// Funções puras para a tela de comparação de jogadores (resumo em 6 eixos e titular da posição).
import { validLineup } from "./lineup";
import { FORMATIONS, ovrAt, POS_GROUP } from "./positions";
import type { Player, Pos, World } from "./types";

export type SummaryKey = "rit" | "fin" | "pas" | "dri" | "def" | "fis";
export const SUMMARY_KEYS: SummaryKey[] = ["rit", "fin", "pas", "dri", "def", "fis"];
export const SUMMARY_NAMES: Record<SummaryKey, string> = {
  rit: "Ritmo", fin: "Finalização", pas: "Passe", dri: "Drible", def: "Defesa", fis: "Físico",
};

const cl = (v: number) => Math.max(1, Math.min(99, Math.round(v)));

/** Resumo em 6 eixos (1–99) derivado dos atributos, para o radar. */
export function summaryStats(p: Player): Record<SummaryKey, number> {
  const a = p.attrs;
  return {
    rit: cl(a.vel),
    fin: cl(a.fin * 0.85 + a.dri * 0.15),
    pas: cl(a.pas * 0.85 + a.dri * 0.15),
    dri: cl(a.dri * 0.8 + a.vel * 0.2),
    def: cl(a.def * 0.85 + a.fis * 0.15),
    fis: cl(a.fis * 0.85 + a.vel * 0.15),
  };
}

/** Índices dos melhores valores (empates contam todos); vazio quando todos são iguais ou há menos de dois conhecidos. */
export function bestIndexes(vals: (number | null)[]): number[] {
  const known = vals.filter((v): v is number => v != null);
  if (known.length < 2) return [];
  const max = Math.max(...known);
  if (known.every((v) => v === max)) return [];
  return vals.flatMap((v, i) => (v === max ? [i] : []));
}

/** Titular do seu time na posição (ou o mais parecido), excluindo um jogador. */
export function starterFor(w: World, pos: Pos, exclude?: number): Player | null {
  const club = w.clubs[w.userClubId];
  if (!club) return null;
  const lineup = club.lineup ?? validLineup(w, club);
  const slots = FORMATIONS[club.tactic.formation] ?? [];
  const xi = lineup.starters
    .map((id, i): { p: Player | undefined; slot: Pos | undefined } => ({ p: id != null ? w.players[id] : undefined, slot: slots[i]?.pos }))
    .filter((x): x is { p: Player; slot: Pos | undefined } => !!x.p && x.p.id !== exclude);
  const pick = xi.find((x) => x.slot === pos) ?? xi.find((x) => x.p.pos === pos)
    ?? xi.filter((x) => POS_GROUP[x.slot ?? x.p.pos] === POS_GROUP[pos]).sort((a, b) => ovrAt(b.p, pos) - ovrAt(a.p, pos))[0];
  return pick?.p ?? null;
}
