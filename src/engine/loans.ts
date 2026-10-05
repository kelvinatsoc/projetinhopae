// Empréstimos (para fora e para dentro, com opção de compra).
// FUNDAÇÃO: ganchos com corpos neutros; implementado pela Trilha B.
import type { Player, World } from "./types";

/** Devolve os emprestados no meio ('half') ou no fim ('season') da temporada. */
export function processLoanReturns(_w: World, _when: "half" | "season") {
  // implementado pela Trilha B
}

/** Dia de janela: clubes da IA emprestam jovens. */
export function aiLoanDay(_w: World) {
  // implementado pela Trilha B
}

/** Início do mês: resumo dos emprestados do usuário (uma notícia). */
export function loanDigest(_w: World) {
  // implementado pela Trilha B
}

/** Se o jogador estiver emprestado, volta para o clube de origem. */
export function returnIfLoaned(_w: World, _p: Player) {
  // implementado pela Trilha B
}

export const isOnLoan = (p: Player) => !!p.loan;
