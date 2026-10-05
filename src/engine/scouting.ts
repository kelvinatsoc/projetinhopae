// Olheiros e potencial escondido (névoa de guerra).
// FUNDAÇÃO: assinaturas finais; o conhecimento ainda é fixo (100 no seu clube, 60 nos outros).
import type { Club, Player, World } from "./types";

/** Quanto o seu clube conhece do jogador (0-100). */
export function knowledgeOf(w: World, p: Player): number {
  return p.clubId === w.userClubId ? 100 : 60;
}

/** Faixa de potencial que o usuário enxerga. */
export function potRange(_w: World, p: Player): [number, number] {
  return [Math.max(p.ovr, p.pot - 3), Math.min(99, p.pot + 2)];
}

export function potRangeLabel(w: World, p: Player): string {
  const [lo, hi] = potRange(w, p);
  return `${lo}-${hi}`;
}

/** Potencial em estrelas (1-5) em relação ao nível do clube. */
export function potStars(_w: World, p: Player, club: Club): number {
  const center = p.pot;
  const d = center - club.level;
  return d >= 8 ? 5 : d >= 3 ? 4 : d >= -2 ? 3 : d >= -7 ? 2 : 1;
}

/** Diário: avança a fila de observação e as missões. */
export function scoutTick(_w: World) {
  // implementado pela Trilha A
}

/** Fim de temporada: limpa conhecimento de jogadores que saíram do mundo. */
export function pruneScouting(_w: World) {
  // implementado pela Trilha A
}
