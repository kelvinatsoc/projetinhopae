// Contratos estilo FM: satisfação do empresário, multa rescisória, bônus por gol, luvas, % de revenda.
import { divMult, seeded } from "./common";
import { addExpense, formatMoney } from "./finance";
import { squadOf } from "./lineup";
import { addNews } from "./news";
import { H, hidOf } from "./personality";
import { age, playerValue, roundMoney, wageFor } from "./player";
import { chance, pick } from "./rng";
import { completeTransfer, wageDemand } from "./transfers";
import type { Club, Fixture, MatchResult, Player, SquadRole, World } from "./types";

// ---------------------------------------------------------------- papéis no elenco (F11)
/** Fatia esperada de jogos para cada papel. */
export const ROLE_SHARE: Record<SquadRole, number> = { C: 0.75, T: 0.6, R: 0.35, S: 0.1, J: 0.15 };
export const ROLE_LABEL: Record<SquadRole, string> = { C: "⭐ Craque", T: "Titular", R: "Rodízio", S: "Reserva", J: "🌱 Jovem promessa" };
export const ROLE_SHORT: Record<SquadRole, string> = { C: "Craque", T: "Titular", R: "Rodízio", S: "Reserva", J: "Promessa" };
export const ROLE_LIST: SquadRole[] = ["C", "T", "R", "S", "J"];
/** Ordem de importância (para saber se um papel é "maior" ou "menor"). */
export const ROLE_RANK: Record<SquadRole, number> = { C: 4, T: 3, R: 2, J: 1.5, S: 1 };

/** Papel natural pelo ranking de overall entre os profissionais (conta o jogador mesmo que ainda não seja do clube). */
export function defaultRole(w: World, club: Club, p: Player): SquadRole {
  if (age(p, w.season) <= 20 && p.pot >= p.ovr + 8) return "J";
  const better = squadOf(w, club).filter((x) => x.id !== p.id && x.ovr > p.ovr).length;
  if (better < 3) return "C";
  if (better < 11) return "T";
  if (better < 17) return "R";
  return "S";
}

export const roleOf = (w: World, p: Player): SquadRole => p.role ?? (p.clubId ? defaultRole(w, w.clubs[p.clubId], p) : "R");

// ---------------------------------------------------------------- negociação
export type NegMode = "sign" | "renew";
export interface ContractTerms {
  wage: number;
  years: number;
  role: SquadRole;
  clause: 0 | 1 | 2 | 3; // nenhuma, baixa, média, alta
  bonus: 0 | 1 | 2 | 3; // bônus por gol
  luvas: 0 | 1 | 2 | 3;
}

export const CLAUSE_MULT = [0, 1.5, 3, 6] as const;
export const CLAUSE_LABEL = ["Nenhuma", "Baixa", "Média", "Alta"] as const;
export const BONUS_BASE = [0, 5_000, 20_000, 50_000] as const;
export const LUVAS_MULT = [0, 1, 3, 6] as const;

const CLAUSE_PTS = [12, 8, 0, -8];
const BONUS_PTS = [0, 3, 6, 10];
const LUVAS_PTS = [0, 4, 10, 18];
const ATTACKERS = new Set(["ATA", "PD", "PE", "MEI"]);

export const goalBonusValue = (club: Club, level: number) => Math.round(BONUS_BASE[level] * divMult(club));
export const clauseValue = (w: World, p: Player, level: number) => roundMoney(playerValue(p, w.season) * CLAUSE_MULT[level]);

/** Temporadas seguidas no clube atual. */
export const seasonsAtClub = (w: World, p: Player) => (p.loan ? 0 : Math.max(0, w.season - p.joined));

/** Salário que o jogador pede para renovar (lealdade pesa para quem está há 3+ anos). */
export function renewDemand(w: World, p: Player): number {
  const club = w.clubs[w.userClubId];
  let d = Math.max(p.wage * 1.05, wageFor(p.ovr, club.rep, age(p, w.season)) * (p.morale < 40 ? 1.2 : 1));
  if (seasonsAtClub(w, p) >= 3) d *= 1.05 - 0.01 * (hidOf(p)[H.loy] - 10);
  return roundMoney(d);
}

export function demandFor(w: World, p: Player, mode: NegMode): number {
  return mode === "renew" ? renewDemand(w, p) : wageDemand(w, p, w.clubs[w.userClubId]);
}

export function defaultTerms(w: World, p: Player, mode: NegMode): ContractTerms {
  const club = w.clubs[w.userClubId];
  return { wage: demandFor(w, p, mode), years: 3, role: defaultRole(w, club, p), clause: 1, bonus: 0, luvas: 0 };
}

export interface AgentView { score: number; hint: string }

/** Satisfação do empresário (0-100) e a principal queixa. ≥ 65 fecha o contrato. */
export function agentScore(w: World, p: Player, mode: NegMode, t: ContractTerms): AgentView {
  const club = w.clubs[w.userClubId];
  const demand = demandFor(w, p, mode);
  const a = age(p, w.season);
  const hid = hidOf(p);
  const def = defaultRole(w, club, p);
  const parts: { v: number; hint: string }[] = [];
  parts.push({ v: (t.wage / Math.max(1, demand) - 1) * 120, hint: "Ele quer salário maior" });
  parts.push(ROLE_RANK[t.role] >= ROLE_RANK[def] ? { v: 12, hint: "" } : { v: -20, hint: `O empresário quer papel de ${ROLE_SHORT[def].toLowerCase()}` });
  parts.push({ v: CLAUSE_PTS[t.clause], hint: "Multa alta assusta o jogador" });
  parts.push({ v: BONUS_PTS[t.bonus] * (ATTACKERS.has(p.pos) ? 2 : 1), hint: "" });
  parts.push({ v: LUVAS_PTS[t.luvas], hint: "" });
  if ((a <= 23 && t.years >= 4) || (a >= 31 && t.years >= 2)) parts.push({ v: a <= 23 ? 5 : 10, hint: "" });
  parts.push({ v: (p.morale - 60) / 4, hint: "Ele anda desanimado — luvas ou salário melhor ajudam" });
  if (mode === "renew" && seasonsAtClub(w, p) >= 3) parts.push({ v: hid[H.loy] - 10, hint: "Ele não tem muito apego ao clube" });
  if (p.wantsOut) parts.push({ v: -40, hint: "Ele quer sair do clube" });
  const score = Math.round(Math.max(0, Math.min(100, 50 + parts.reduce((s, x) => s + x.v, 0))));
  const worst = parts.filter((x) => x.v < -0.5 && x.hint).sort((x, y) => x.v - y.v)[0];
  const hint = worst ? worst.hint : score >= 65 ? "Tudo certo para assinar! 🤝" : "Melhore um pouco a proposta";
  return { score, hint };
}

export const AGENT_OK = 65;

/** Aplica os extras do contrato (multa, bônus, papel, luvas). */
function applyExtras(w: World, p: Player, t: ContractTerms) {
  const club = w.clubs[w.userClubId];
  p.clause = t.clause ? clauseValue(w, p, t.clause) : 0;
  p.goalBonus = t.bonus ? goalBonusValue(club, t.bonus) : undefined;
  p.role = t.role;
  const luvas = Math.round(t.wage * LUVAS_MULT[t.luvas]);
  if (luvas > 0) addExpense(club, "bonus", luvas);
}

/** Fecha a contratação do jogador com os termos negociados. */
export function signWithTerms(w: World, p: Player, fee: number, t: ContractTerms) {
  const club = w.clubs[w.userClubId];
  completeTransfer(w, p, club, fee, t.wage, t.years);
  applyExtras(w, p, t);
}

/** Renova o contrato com os termos negociados. */
export function renewWithTerms(w: World, p: Player, t: ContractTerms) {
  p.wage = t.wage;
  p.contractEnd = w.season + t.years;
  p.morale = Math.min(100, p.morale + 8);
  applyExtras(w, p, t);
}

// ---------------------------------------------------------------- multa rescisória
/** Multa sorteada (sem guardar): 0 = sem multa. Determinística por jogador. */
export function peekClause(w: World, p: Player): number {
  if (p.clause !== undefined) return p.clause;
  if (!p.clubId || p.clubId === w.userClubId) return 0;
  const rng = seeded(w, `cl:${p.id}`);
  const r = rng();
  const r2 = rng();
  const br = w.clubs[p.clubId]?.country === "BRA";
  return r < (br ? 0.35 : 0.6) ? roundMoney(playerValue(p, w.season) * (2 + r2 * 3)) : 0;
}

/** Multa rescisória do jogador (0 = sem multa). Sorteia e guarda na primeira consulta. */
export function ensureClause(w: World, p: Player): number {
  if (p.clause === undefined && p.clubId && p.clubId !== w.userClubId) p.clause = peekClause(w, p);
  return p.clause ?? 0;
}

/** Dia de janela: clubes da IA podem pagar a multa de jogadores do usuário. */
export function clauseDay(w: World) {
  const user = w.clubs[w.userClubId];
  if (!user) return;
  for (const id of user.players.slice()) {
    const p = w.players[id];
    if (!p || p.loan || !(p.clause && p.clause > 0)) continue;
    if (!chance(0.003)) continue;
    const clause = p.clause;
    const buyers = Object.values(w.clubs).filter((c) => c.id !== user.id && c.div !== "D" && c.balance >= clause && c.rep >= user.rep - 15 && c.level + 8 >= p.ovr);
    if (!buyers.length) continue;
    const buyer = pick(buyers);
    completeTransfer(w, p, buyer, clause, wageDemand(w, p, buyer), 3);
    p.clause = undefined;
    addNews(w, "offer", `😱 O ${buyer.name} pagou a multa de ${formatMoney(clause)} e levou ${p.name}`, `A multa rescisória estava no contrato: o jogador saiu na hora e o dinheiro já está no seu caixa.`, { pid: p.id, clubId: buyer.id });
  }
}

/** Depois de cada partida: paga bônus por gol do clube do usuário. */
export function goalBonuses(w: World, f: Fixture, r: MatchResult) {
  if (f.home !== w.userClubId && f.away !== w.userClubId) return;
  const user = w.clubs[w.userClubId];
  for (const e of r.events) {
    if ((e.type !== "goal" && e.type !== "pen-goal") || e.pid == null) continue;
    const p = w.players[e.pid];
    if (p && p.clubId === user.id && p.goalBonus && p.goalBonus > 0) addExpense(user, "bonus", p.goalBonus);
  }
}
