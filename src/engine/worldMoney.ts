// Dinheiro das ligas do mundo (sem dependências: usado por finanças, mercado e ligas).
import type { Club } from "./types";

/** Peso do dinheiro de cada liga (orçamento, receitas, salários, preços). */
export const LEAGUE_MONEY: Record<string, number> = {
  eng1: 4, esp1: 2.6, ita1: 2.4, ger1: 2.4, fra1: 2, ksa1: 3, tur1: 1.2, por1: 1, ned1: 1, usa1: 1, sco1: 0.7, jpn1: 0.8, arg1: 0.4,
};
export const leagueMoney = (c: Club | null | undefined) => (c?.league ? LEAGUE_MONEY[c.league] ?? 1 : 1);

/** Saldo de referência (R$) de um clube de liga estrangeira; renovado a cada virada de ano. */
export const worldBalance = (c: Club) => Math.round((10_000_000 + c.rep * c.rep * 12_000) * leagueMoney(c));
/** Multiplicador de salário dos jogadores de um clube de liga estrangeira. */
export const leagueWageMult = (c: Club) => Math.max(0.5, leagueMoney(c) * 0.8);
/** Multiplicador do preço pedido por um clube de liga estrangeira (Premier League ~2x). */
export const leaguePriceMult = (c: Club | null | undefined) => (c?.league ? Math.max(0.7, Math.sqrt(leagueMoney(c))) : 1);
