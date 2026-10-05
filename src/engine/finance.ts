// Finanças simplificadas: TV, patrocínio, bilheteria, premiações, salários e custos.
import { clamp, gauss } from "./rng";
import { staffWageBill } from "./staff";
import type { Club, Fixture, World } from "./types";

export const INCOME_LABELS: Record<string, string> = {
  tv: "Direitos de TV",
  sponsor: "Patrocínios",
  gate: "Bilheteria",
  prize: "Premiações",
  sales: "Venda de jogadores",
  board: "Aporte da diretoria",
  admin: "Ajuste do administrador",
};

export const EXPENSE_LABELS: Record<string, string> = {
  wages: "Salários",
  staff: "Estrutura e funcionários",
  transfers: "Compra de jogadores",
  youth: "Categorias de base",
  release: "Rescisões",
  comissao: "Comissão técnica",
  bonus: "Bônus e luvas",
  infra: "Obras e melhorias",
  scout: "Olheiros e observação",
  admin: "Ajuste do administrador",
};

export function addIncome(c: Club, key: string, v: number) {
  c.balance += v;
  c.finance.income[key] = (c.finance.income[key] ?? 0) + v;
}

export function addExpense(c: Club, key: string, v: number) {
  c.balance -= v;
  c.finance.expense[key] = (c.finance.expense[key] ?? 0) + v;
}

/** Receita anual de TV (R$). */
export function annualTV(c: Club): number {
  switch (c.div) {
    case "A": return 50_000_000 + Math.max(0, c.rep - 50) * 3_000_000;
    case "B": return 10_000_000 + c.rep * 250_000;
    case "C": return 2_500_000;
    case "D": return 500_000;
    default: return 0;
  }
}

export function annualSponsor(c: Club): number {
  const r2 = c.rep * c.rep;
  switch (c.div) {
    case "A": return r2 * 10_000;
    case "B": return r2 * 3_000;
    case "C": return r2 * 700;
    case "D": return r2 * 400;
    default: return 0;
  }
}

export function monthlyStaff(c: Club): number {
  switch (c.div) {
    case "A": return 2_000_000 + c.rep * 60_000;
    case "B": return 300_000 + c.rep * 5_000;
    case "C": return 80_000 + c.rep * 1_000;
    case "D": return 50_000;
    default: return 0;
  }
}

export function wageBill(w: World, c: Club): number {
  let s = 0;
  for (const id of c.players) s += w.players[id]?.wage ?? 0;
  return s;
}

/** Processamento mensal (dia 1 de cada mês) para os clubes brasileiros. */
export function monthlyFinances(w: World) {
  for (const c of Object.values(w.clubs)) {
    if (c.div === "F") continue;
    addIncome(c, "tv", Math.round(annualTV(c) / 12));
    addIncome(c, "sponsor", Math.round(annualSponsor(c) / 12));
    addExpense(c, "wages", wageBill(w, c));
    const user = c.id === w.userClubId;
    // com comissão técnica contratada, a estrutura genérica fica 15% mais barata
    addExpense(c, "staff", user ? Math.round(monthlyStaff(c) * (w.staff ? 0.85 : 1)) : monthlyStaff(c));
    if (user) {
      const comissao = staffWageBill(w);
      if (comissao) addExpense(c, "comissao", comissao);
    }
    // base: média das três notas (captação, estrutura, formação); igual a youthLevel por padrão
    const youthAvg = (c.youthLevel + (c.youthFac ?? c.youthLevel) + (c.youthCoach ?? c.youthLevel)) / 3;
    addExpense(c, "youth", Math.round(20_000 * youthAvg * (c.div === "A" ? 6 : c.div === "B" ? 2 : 1)));
  }
}

/** Público estimado para uma partida. */
export function attendanceFor(w: World, f: Fixture): number {
  const home = w.clubs[f.home];
  const away = w.clubs[f.away];
  if (!home || !away) return 0;
  const big = f.stage !== "league" && f.stage !== "group" ? 1.25 : 1;
  const demand = home.rep * home.rep * 7 * (0.8 + away.rep / 250) * big;
  const att = clamp(demand * (0.85 + gauss(0, 0.08)), 800, home.capacity);
  return Math.round(f.neutral ? home.capacity * 0.9 : att);
}

export function gateRevenue(w: World, f: Fixture, attendance: number) {
  const home = w.clubs[f.home];
  if (!home || home.div === "F") return;
  const mult = f.stage === "final" ? 2 : f.stage === "sf" || f.stage === "qf" ? 1.4 : 1;
  addIncome(home, "gate", Math.round(attendance * home.ticket * mult));
}

// Premiações por fase alcançada (R$)
export const CUP_PRIZES: Record<string, Record<string, number>> = {
  copaBR: { r64: 1_000_000, r32: 1_500_000, r16: 3_500_000, qf: 4_500_000, sf: 10_000_000, runnerUp: 30_000_000, champion: 75_000_000 },
  liberta: { group: 16_000_000, groupWin: 1_800_000, r16: 7_000_000, qf: 9_500_000, sf: 13_000_000, runnerUp: 45_000_000, champion: 130_000_000 },
  sula: { group: 5_000_000, groupWin: 500_000, r16: 2_500_000, qf: 3_500_000, sf: 5_000_000, runnerUp: 15_000_000, champion: 33_000_000 },
};

export function leaguePrize(compId: string, pos: number): number {
  if (compId === "serieA") return Math.round((48_000_000 * (21 - pos)) / 20);
  if (compId === "serieB") return pos === 1 ? 5_000_000 : Math.round((3_000_000 * (21 - pos)) / 20);
  if (compId === "serieC") return pos <= 4 ? 1_500_000 : 300_000;
  return 0;
}

export function awardPrize(w: World, clubId: string, v: number) {
  const c = w.clubs[clubId];
  if (c && c.div !== "F" && v > 0) addIncome(c, "prize", v);
}

export function formatMoney(v: number, short = true): string {
  const neg = v < 0;
  const a = Math.abs(v);
  let s: string;
  if (short && a >= 1_000_000_000) s = `${(a / 1_000_000_000).toFixed(2).replace(".", ",")} bi`;
  else if (short && a >= 1_000_000) s = `${(a / 1_000_000).toFixed(a >= 100_000_000 ? 0 : 1).replace(".", ",")} mi`;
  else if (short && a >= 1_000) s = `${Math.round(a / 1_000)} mil`;
  else s = Math.round(a).toLocaleString("pt-BR");
  return `${neg ? "-" : ""}R$ ${s}`;
}
