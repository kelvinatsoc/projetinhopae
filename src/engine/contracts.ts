// Contratos estilo FM: satisfação do empresário, multa rescisória, bônus por gol, luvas, % de revenda.
// FUNDAÇÃO: ganchos com corpos neutros; implementado pela Trilha B.
import type { Fixture, MatchResult, Player, World } from "./types";

/** Depois de cada partida: paga bônus por gol do clube do usuário. */
export function goalBonuses(_w: World, _f: Fixture, _r: MatchResult) {
  // implementado pela Trilha B
}

/** Dia de janela: clubes da IA podem pagar a multa de jogadores do usuário (chamado pela Trilha B em transfers.ts). */
export function clauseDay(_w: World) {
  // implementado pela Trilha B
}

/** Multa rescisória do jogador (0 = sem multa). */
export function ensureClause(_w: World, p: Player): number {
  return p.clause ?? 0;
}
