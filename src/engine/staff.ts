// Comissão técnica (auxiliar, treinador, preparador físico, olheiro-chefe, coordenador da base).
// FUNDAÇÃO: staffStars é final (a IA sempre tem 3★); o resto é implementado pela Trilha C.
import type { Club, StaffRole, World } from "./types";

/** Estrelas (1-5) de um cargo. Clubes da IA são sempre 3★ (neutro). */
export function staffStars(w: World, club: Club, role: StaffRole): number {
  return club.id === w.userClubId ? (w.staff?.[role]?.stars ?? 3) : 3;
}

/** Folha mensal da comissão do usuário (R$). 0 enquanto não houver comissão contratada. */
export function staffWageBill(_w: World): number {
  return 0;
}

/** Mensal: garante a comissão, avisa contratos e renova. */
export function staffMonthly(_w: World) {
  // implementado pela Trilha C
}

/** O usuário trocou de clube: a comissão é refeita para o novo clube. */
export function staffOnClubChange(_w: World) {
  // implementado pela Trilha C
}
