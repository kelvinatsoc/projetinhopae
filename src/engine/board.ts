// Diretoria: confiança, objetivos e pedido de verba. Obras ficam só em Estrutura (facilities.ts).
// Só o usuário faz pedidos; a IA melhora a estrutura sozinha no fim da temporada (aiInfrastructure).
import { adminCheats } from "./admin";
import { careerSacked } from "./career";
import { absDay, divMult } from "./common";
import { buildOf, FAC_MAX, facLevel, facState } from "./facilities";
import { addExpense, addIncome, annualSponsor, annualTV, formatMoney } from "./finance";
import { addNews } from "./news";
import { roundMoney } from "./player";
import { chance } from "./rng";
import type { Club, FacilityKind, World } from "./types";

export type RequestKind = "grant";

export const REQUESTS: { kind: RequestKind; emoji: string; name: string; days: number; conf: number }[] = [
  { kind: "grant", emoji: "💰", name: "Pedir verba para reforços", days: 0, conf: 70 },
];
export const REQUEST_BY_KIND = Object.fromEntries(REQUESTS.map((r) => [r.kind, r])) as Record<RequestKind, (typeof REQUESTS)[number]>;

/** Custo do CT por nível alvo (2..5), Série A (usado pela IA no fim da temporada). */
const CT_COST = [0, 0, 4_000_000, 10_000_000, 22_000_000, 45_000_000];

/** Valor de um pedido (R$): verba recebida. */
export function requestCost(w: World, _kind: RequestKind = "grant", c: Club = w.clubs[w.userClubId]): number {
  return Math.round(0.04 * (annualTV(c) + annualSponsor(c)));
}

/** Custo de uma melhoria de estrutura feita pela IA (CT ou captação). */
function aiUpgradeCost(c: Club, kind: "ct" | "yrec"): number {
  const lv = kind === "ct" ? c.facilities : c.youthLevel;
  const base = CT_COST[Math.min(5, lv + 1)] * divMult(c);
  return roundMoney(kind === "ct" ? base : base * 0.6);
}

/** Título amigável do pedido. */
export function requestTitle(_w: World, kind: RequestKind): string {
  const r = REQUEST_BY_KIND[kind];
  return `${r.emoji} ${r.name}`;
}

/** Dias que faltam para poder pedir de novo (0 = pode). */
export function cooldownLeft(w: World, kind: RequestKind): number {
  const until = w.board.cool?.[kind];
  return until ? Math.max(0, until - absDay(w)) : 0;
}

/** O pedido pode ser feito agora? (não diz se será aprovado) */
export function canRequest(w: World, kind: RequestKind): { ok: boolean; reason?: string } {
  const cool = cooldownLeft(w, kind);
  if (w.board.grantSeason === w.season) return { ok: false, reason: "Já liberaram uma verba nesta temporada." };
  if (cool) return { ok: false, reason: `Peça de novo em ${cool} dias` };
  return { ok: true };
}

/** Faz o pedido à diretoria: aprova ou nega (com espera de 60 dias). Obras ficam em Estrutura (facilities.ts). */
export function makeRequest(w: World, kind: RequestKind): { ok: boolean; msg: string } {
  const can = canRequest(w, kind);
  if (!can.ok) return { ok: false, msg: can.reason ?? "Pedido indisponível." };
  const c = w.clubs[w.userClubId];
  const r = REQUEST_BY_KIND[kind];
  if (w.board.confidence < r.conf) {
    (w.board.cool ??= {})[kind] = absDay(w) + 60;
    return { ok: false, msg: `❌ Negado: a confiança está baixa (precisa de ${r.conf}%)` };
  }
  const v = requestCost(w, "grant");
  addIncome(c, "board", v);
  w.board.grantSeason = w.season;
  w.board.confidence = Math.max(0, w.board.confidence - 3);
  addNews(w, "board", "💰 Diretoria libera verba para reforços", `A diretoria aportou ${formatMoney(v)} no caixa do ${c.name}. Liberado! Mas agora queremos resultado.`);
  return { ok: true, msg: `Liberado! Mas agora queremos resultado. (+${formatMoney(v)})` };
}

/**
 * Saves antigos: obras pedidas à diretoria (c.proj) viram obras de Estrutura em andamento
 * (estádio → estádio, CT → centro de treinamento, instalações da base → categorias de base),
 * mantendo início/prazo/custo. O que não tem equivalente (captação/treinadores da base) ou não cabe
 * (já no máximo, obra igual em andamento, duas obras) é reembolsado.
 */
export function migrateBoardProjects(w: World) {
  for (const c of Object.values(w.clubs)) {
    const list = (c as { proj?: LegacyProject[] }).proj;
    if (list === undefined) continue;
    delete (c as { proj?: unknown }).proj;
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (!p || typeof p !== "object") continue;
      const kind: FacilityKind | null = p.kind === "stadium" ? "stadium" : p.kind === "ct" ? "training" : p.kind === "yfac" ? "youth" : null;
      const cost = typeof p.cost === "number" && p.cost > 0 ? p.cost : 0;
      const to = kind ? facLevel(c, kind) + 1 : 0;
      if (!kind || to > FAC_MAX || buildOf(c, kind) || (c.fac?.builds.length ?? 0) >= 2 || typeof p.done !== "number") {
        if (cost) addIncome(c, "refund", cost);
        continue;
      }
      const now = absDay(w);
      facState(c).builds.push({ kind, to, start: typeof p.start === "number" ? p.start : now, done: p.done, cost });
    }
  }
}
interface LegacyProject { kind?: string; start?: number; done?: number; cost?: number }

/** Fim de temporada: clubes da IA com dinheiro melhoram a estrutura (no máximo +1 por temporada). */
export function aiInfrastructure(w: World) {
  for (const c of Object.values(w.clubs)) {
    if (c.id === w.userClubId || c.div === "F") continue;
    const kind: "ct" | "yrec" = c.facilities <= c.youthLevel ? "ct" : "yrec";
    const lv = kind === "ct" ? c.facilities : c.youthLevel;
    if (lv >= 5) continue;
    const cost = aiUpgradeCost(c, kind);
    if (c.balance < 3 * cost) continue;
    if (!chance(0.15)) continue;
    addExpense(c, "infra", cost);
    if (kind === "ct") c.facilities = lv + 1;
    else c.youthLevel = lv + 1;
  }
}

/** Ocupação média do estádio nos últimos 5 jogos em casa (0-1), ou null sem dados. */
export function stadiumOccupancy(w: World, c: Club = w.clubs[w.userClubId]): number | null {
  const home = w.fixtures
    .filter((f) => f.home === c.id && !f.neutral && f.result?.attendance && f.comp !== "liberta" && f.comp !== "sula")
    .sort((a, b) => b.day - a.day)
    .slice(0, 5);
  if (!home.length) return null;
  return home.reduce((s, f) => s + (f.result!.attendance ?? 0) / c.capacity, 0) / home.length;
}

// ---------------------------------------------------------------- demissão no meio da temporada
/**
 * Depois de cada jogo: fora do modo casual, se a confiança da diretoria zerar após o primeiro
 * trimestre, o treinador é demitido na hora e recebe propostas de outros clubes (carreira).
 */
export function checkSacking(w: World): boolean {
  if (w.settings.casual || w.fired || adminCheats(w).noFire) return false;
  if (w.scenario?.status === "active") return false; // nos desafios, quem decide é o cenário
  if (w.day < 90 || w.board.confidence > 2) return false;
  w.fired = true;
  addNews(w, "board", "Você foi demitido", `A diretoria do ${w.clubs[w.userClubId].name} perdeu a paciência com os resultados. Veja as propostas de outros clubes.`);
  careerSacked(w);
  return true;
}
