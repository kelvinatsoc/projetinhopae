// Diretoria: pedidos e obras (estádio, CT, base, verba extra).
// Só o usuário faz pedidos; a IA melhora a estrutura sozinha no fim da temporada (aiInfrastructure).
import { adminCheats } from "./admin";
import { dateOf, formatDate } from "./calendar";
import { careerSacked } from "./career";
import { absDay, divMult, stars } from "./common";
import { addExpense, addIncome, annualSponsor, annualTV, formatMoney } from "./finance";
import { addNews } from "./news";
import { roundMoney } from "./player";
import { chance } from "./rng";
import type { BoardProject, Club, World } from "./types";

export type ProjKind = BoardProject["kind"];
export type RequestKind = ProjKind | "grant";

/** Campo do clube que cada obra melhora (estádio é tratado à parte). */
const LEVEL_FIELD: Record<Exclude<ProjKind, "stadium">, "facilities" | "youthFac" | "youthLevel" | "youthCoach"> = {
  ct: "facilities",
  yfac: "youthFac",
  yrec: "youthLevel",
  ycoach: "youthCoach",
};

export const REQUESTS: { kind: RequestKind; emoji: string; name: string; days: number; conf: number }[] = [
  { kind: "stadium", emoji: "🏟️", name: "Ampliar o estádio", days: 240, conf: 55 },
  { kind: "ct", emoji: "🏋️", name: "Melhorar o CT", days: 150, conf: 50 },
  { kind: "yfac", emoji: "🏫", name: "Instalações da base", days: 120, conf: 45 },
  { kind: "yrec", emoji: "🔍", name: "Captação da base", days: 120, conf: 45 },
  { kind: "ycoach", emoji: "🎓", name: "Treinadores da base", days: 120, conf: 45 },
  { kind: "grant", emoji: "💰", name: "Pedir verba para reforços", days: 0, conf: 70 },
];
export const REQUEST_BY_KIND = Object.fromEntries(REQUESTS.map((r) => [r.kind, r])) as Record<RequestKind, (typeof REQUESTS)[number]>;

/** Custo do CT por nível alvo (2..5), Série A. */
const CT_COST = [0, 0, 4_000_000, 10_000_000, 22_000_000, 45_000_000];
const MAX_PROJECTS = 2;
const MAX_EXPANSIONS = 3;

/** Nível atual (1-5) que a obra melhora. */
export function levelOf(c: Club, kind: Exclude<ProjKind, "stadium">): number {
  const f = LEVEL_FIELD[kind];
  return c[f] ?? c.youthLevel;
}

export const stadiumAdd = (c: Club) => Math.max(2000, Math.round((c.capacity * 0.15) / 500) * 500);

/** Custo total de um pedido (R$). Verba: valor recebido. */
export function requestCost(w: World, kind: RequestKind, c: Club = w.clubs[w.userClubId]): number {
  if (kind === "grant") return Math.round(0.04 * (annualTV(c) + annualSponsor(c)));
  if (kind === "stadium") return roundMoney(stadiumAdd(c) * 6000 * divMult(c));
  const target = Math.min(5, levelOf(c, kind) + 1);
  const base = CT_COST[target] * divMult(c);
  return roundMoney(kind === "ct" ? base : base * 0.6);
}

/** Parte paga pela diretoria (só no estádio, com confiança alta). */
export function boardShare(w: World, kind: RequestKind): number {
  return kind === "stadium" && w.board.confidence >= 80 ? 0.3 : 0;
}

/** Título amigável do pedido, com o que muda. */
export function requestTitle(w: World, kind: RequestKind): string {
  const c = w.clubs[w.userClubId];
  const r = REQUEST_BY_KIND[kind];
  if (kind === "grant") return `${r.emoji} ${r.name}`;
  if (kind === "stadium") return `${r.emoji} Ampliar o estádio (+${stadiumAdd(c).toLocaleString("pt-BR")} lugares)`;
  const lv = levelOf(c, kind);
  return lv >= 5 ? `${r.emoji} ${r.name} (★5, no máximo)` : `${r.emoji} ${r.name} (★${lv} → ★${lv + 1})`;
}

const activeOf = (c: Club) => c.proj ?? [];

/** Dias que faltam para poder pedir de novo (0 = pode). */
export function cooldownLeft(w: World, kind: RequestKind): number {
  const until = w.board.cool?.[kind];
  return until ? Math.max(0, until - absDay(w)) : 0;
}

/** O pedido pode ser feito agora? (não diz se será aprovado) */
export function canRequest(w: World, kind: RequestKind): { ok: boolean; reason?: string } {
  const c = w.clubs[w.userClubId];
  const cool = cooldownLeft(w, kind);
  if (kind === "grant") {
    if (w.board.grantSeason === w.season) return { ok: false, reason: "Já liberaram uma verba nesta temporada." };
    if (cool) return { ok: false, reason: `Peça de novo em ${cool} dias` };
    return { ok: true };
  }
  if (activeOf(c).some((p) => p.kind === kind)) return { ok: false, reason: "Obra em andamento." };
  if (kind === "stadium" && (c.expansions ?? 0) >= MAX_EXPANSIONS) return { ok: false, reason: "O estádio já foi ampliado 3 vezes." };
  if (kind !== "stadium" && levelOf(c, kind) >= 5) return { ok: false, reason: "Já está no nível máximo ★5." };
  if (activeOf(c).length >= MAX_PROJECTS) return { ok: false, reason: "Já há 2 obras em andamento." };
  if (cool) return { ok: false, reason: `Peça de novo em ${cool} dias` };
  return { ok: true };
}

/** Converte "daqui a n dias" em dia absoluto, respeitando o calendário real. */
function absAfter(w: World, days: number): number {
  const d = dateOf(w.season, w.day + days);
  const y = d.getFullYear();
  const doy = Math.round((d.getTime() - new Date(y, 0, 1).getTime()) / 86_400_000);
  return y * 400 + doy;
}

/** Dias corridos até um dia absoluto. */
export function daysUntil(w: World, abs: number): number {
  const s = Math.floor(abs / 400);
  const d = abs - s * 400;
  return Math.max(0, Math.round((dateOf(s, d).getTime() - dateOf(w.season, w.day).getTime()) / 86_400_000));
}

/** Data (ex.: "12 jun") de um dia absoluto. */
export function absDate(abs: number): string {
  const s = Math.floor(abs / 400);
  return formatDate(s, abs - s * 400, false);
}

/** Faz o pedido à diretoria: aprova (e cobra) ou nega (com espera de 60 dias). */
export function makeRequest(w: World, kind: RequestKind): { ok: boolean; msg: string } {
  const can = canRequest(w, kind);
  if (!can.ok) return { ok: false, msg: can.reason ?? "Pedido indisponível." };
  const c = w.clubs[w.userClubId];
  const r = REQUEST_BY_KIND[kind];
  const deny = (motivo: string) => {
    (w.board.cool ??= {})[kind] = absDay(w) + 60;
    return { ok: false, msg: `❌ Negado: ${motivo}` };
  };
  if (w.board.confidence < r.conf) return deny(`a confiança está baixa (precisa de ${r.conf}%)`);

  if (kind === "grant") {
    const v = requestCost(w, "grant");
    addIncome(c, "board", v);
    w.board.grantSeason = w.season;
    w.board.confidence = Math.max(0, w.board.confidence - 3);
    addNews(w, "board", "💰 Diretoria libera verba para reforços", `A diretoria aportou ${formatMoney(v)} no caixa do ${c.name}. Liberado! Mas agora queremos resultado.`);
    return { ok: true, msg: `Liberado! Mas agora queremos resultado. (+${formatMoney(v)})` };
  }

  const cost = requestCost(w, kind);
  const clubPays = Math.round(cost * (1 - boardShare(w, kind)));
  if (c.balance < clubPays && !adminCheats(w).money) return deny(`não temos caixa (faltam ${formatMoney(clubPays - c.balance)})`);
  addExpense(c, "infra", clubPays);
  const proj: BoardProject = { kind, start: absDay(w), done: absAfter(w, r.days), cost };
  if (kind === "stadium") proj.add = stadiumAdd(c);
  (c.proj ??= []).push(proj);
  addNews(w, "board", `🏗️ Obra aprovada: ${r.name}`,
    `A diretoria liberou a obra (${formatMoney(clubPays)} do caixa do clube${clubPays < cost ? `; a diretoria pagou ${formatMoney(cost - clubPays)}` : ""}). Pronto em ${absDate(proj.done)}.`);
  return { ok: true, msg: "✅ Aprovado! A diretoria liberou a obra." };
}

/** Rótulo curto de uma obra (ex.: "CT ★★★★" ou "Estádio +6.000"). */
export function projectLabel(c: Club, p: BoardProject): string {
  if (p.kind === "stadium") return `Estádio +${(p.add ?? 0).toLocaleString("pt-BR")} lugares`;
  const short = { ct: "CT", yfac: "Instalações da base", yrec: "Captação da base", ycoach: "Treinadores da base" }[p.kind];
  return `${short} ${stars(Math.min(5, levelOf(c, p.kind) + 1))}`;
}

/** Progresso 0-100 de uma obra. */
export function projectPct(w: World, p: BoardProject): number {
  const total = Math.max(1, p.done - p.start);
  return Math.max(0, Math.min(100, Math.round(((absDay(w) - p.start) / total) * 100)));
}

const DONE_TEXT: Record<ProjKind, string> = {
  stadium: "mais torcida e mais bilheteria a cada jogo em casa.",
  ct: "jogadores evoluem mais rápido e recuperam a forma mais cedo.",
  yfac: "os garotos da base evoluem melhor.",
  yrec: "as próximas safras da base vêm mais fortes.",
  ycoach: "os garotos chegam mais preparados ao profissional.",
};

function completeProject(w: World, c: Club, p: BoardProject) {
  let what: string;
  if (p.kind === "stadium") {
    c.capacity += p.add ?? 0;
    c.expansions = (c.expansions ?? 0) + 1;
    what = `${c.stadium} agora tem ${c.capacity.toLocaleString("pt-BR")} lugares`;
  } else {
    const f = LEVEL_FIELD[p.kind];
    c[f] = Math.min(5, (c[f] ?? c.youthLevel) + 1);
    const name = { ct: "CT", yfac: "Instalações da base", yrec: "Captação da base", ycoach: "Treinadores da base" }[p.kind];
    what = `${name} agora ${stars(c[f] ?? 1)}`;
  }
  if (c.id === w.userClubId) addNews(w, "board", `🏗️ Obra concluída: ${what}`, `🏗️ Obra concluída: ${what} — ${DONE_TEXT[p.kind]}`, { clubId: c.id });
}

/** Diário: conclui obras cujo prazo chegou. */
export function projectTick(w: World) {
  const now = absDay(w);
  for (const c of Object.values(w.clubs)) {
    if (!c.proj?.length) continue;
    const due = c.proj.filter((p) => p.done <= now);
    if (!due.length) continue;
    c.proj = c.proj.filter((p) => p.done > now);
    for (const p of due) completeProject(w, c, p);
    if (!c.proj.length) delete c.proj;
  }
}

/** Admin: conclui na hora todas as obras de um clube. */
export function finishAllProjects(w: World, clubId = w.userClubId): number {
  const c = w.clubs[clubId];
  if (!c?.proj?.length) return 0;
  const list = c.proj;
  delete c.proj;
  for (const p of list) completeProject(w, c, p);
  return list.length;
}

/** Fim de temporada: clubes da IA com dinheiro melhoram a estrutura (no máximo +1 por temporada). */
export function aiInfrastructure(w: World) {
  for (const c of Object.values(w.clubs)) {
    if (c.id === w.userClubId || c.div === "F") continue;
    const kind: "ct" | "yrec" = c.facilities <= c.youthLevel ? "ct" : "yrec";
    const lv = kind === "ct" ? c.facilities : c.youthLevel;
    if (lv >= 5) continue;
    const cost = requestCost(w, kind, c);
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
