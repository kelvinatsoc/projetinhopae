// Vestiário: papéis no elenco, minutos, conversas, promessas, pedidos de saída, entrosamento e líderes.
// FUNDAÇÃO: chemOf é final (a IA sempre tem 70, neutro); o resto é implementado pela Trilha B.
import type { Club, Fixture, MatchResult, Player, World } from "./types";

/** Depois de cada partida do usuário (minutos, entrosamento). */
export function afterUserMatch(_w: World, _f: Fixture, _r: MatchResult, _userIdx: 0 | 1) {
  // implementado pela Trilha B
}

/** Início do mês: humor do elenco, reclamações, líderes. */
export function monthlyMood(_w: World) {
  // implementado pela Trilha B
}

/** Um jogador chegou ao clube do usuário (contratação ou empréstimo). */
export function onJoinUserClub(_w: World, _p: Player) {
  // implementado pela Trilha B
}

/** Fim de temporada: zera minutos e ajusta o entrosamento. */
export function seasonReset(_w: World) {
  // implementado pela Trilha B
}

/** O usuário trocou de clube (demissão e novo emprego). */
export function managerChanged(_w: World) {
  // implementado pela Trilha B
}

/** Entrosamento (0-100). Clubes da IA são sempre 70 (neutro). */
export function chemOf(w: World, club: Club): number {
  return club.id === w.userClubId ? (club.chem ?? 70) : 70;
}
