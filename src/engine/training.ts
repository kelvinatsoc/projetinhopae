// Treino: foco do time, intensidade, treino individual e evolução.
// FUNDAÇÃO: assinaturas finais com corpos neutros (o comportamento atual do jogo).
// A Trilha A implementa a evolução mensal; quando ela entrar, midSeasonTick e seasonEndDevelop viram no-ops.
import { addNews } from "./news";
import { developPlayer } from "./player";
import type { Club, Player, World } from "./types";

/** Multiplicadores do foco de treino lidos pelo motor de partida (neutros para a IA e para "Equilibrado"). */
export interface FocusMods { att: number; def: number; fatigue: number; setPiece: number; pen: number }
const NEUTRAL_FOCUS: FocusMods = { att: 1, def: 1, fatigue: 1, setPiece: 1, pen: 0 };

/** Treino do mês (dia 1): evolução mensal, jogadas de lenda, treino individual. */
export function monthlyTraining(_w: World) {
  // implementado pela Trilha A
}

/** Evolução de meio de temporada (dia 181). Hoje: o desenvolvimento semestral de sempre. */
export function midSeasonTick(w: World) {
  for (const p of Object.values(w.players)) {
    const club = p.clubId ? w.clubs[p.clubId] : null;
    developPlayer(p, w.season, club?.facilities ?? 2);
  }
  addNews(w, "info", "Meio de temporada", "Os jogadores evoluíram (ou caíram de rendimento) conforme idade, potencial e minutos em campo. Confira o elenco!");
}

/** Evolução de fim de temporada de um jogador (chamada por endSeason). */
export function seasonEndDevelop(w: World, p: Player, y: number) {
  const club = p.clubId ? w.clubs[p.clubId] : null;
  developPlayer(p, y, club?.facilities ?? 2);
}

/** Bônus aditivo na recuperação diária de condição física. */
export function recoveryBonus(_w: World, _p: Player, _club: Club | null): number {
  return 0;
}

/** Processamento diário do treino (lesões no treino puxado, recuperação extra). */
export function trainingDaily(_w: World) {
  // implementado pela Trilha A
}

export function focusMods(_club: Club): FocusMods {
  return { ...NEUTRAL_FOCUS };
}

/** Entrosamento extra por mês dado pelo foco "Tático". */
export function tacticalChemBonus(_club: Club): number {
  return 0;
}
