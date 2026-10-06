// Técnico de seleção (acumulando com o clube): convite pela reputação, convocação manual, escalação e
// jogos da seleção que param o "Continuar". Os jogos usam a simulação rápida com o time escolhido.
import { ensureCareer } from "./career";
import { isMonthStart } from "./calendar";
import { elevenStrength, quickEleven, quickResult } from "./fastsim";
import { applyIntl, callUp, ntName, pickSquad, progressIntl } from "./international";
import { addNews } from "./news";
import { getRngState, pick, setRngState } from "./rng";
import type { Fixture, MatchResult, NationalTeam, Player, World } from "./types";

export const OFFER_DAYS = 20;

/** Início do mês: com reputação alta, chega o convite de uma seleção (a do Brasil exige 85). */
export function ntJobTick(w: World) {
  const intl = w.intl;
  if (!intl || w.ntJob || !isMonthStart(w.season, w.day)) return;
  if (intl.offer && (intl.offer.season < w.season || w.day > intl.offer.until)) intl.offer = undefined;
  if (intl.offer) return;
  const rep = ensureCareer(w).rep;
  if (rep < 75) return;
  const nts = Object.values(intl.nts);
  let nt: NationalTeam | undefined;
  if (rep >= 85 && intl.nts["nt-BRA"] && !intl.declined?.includes("nt-BRA")) nt = intl.nts["nt-BRA"];
  else {
    const maxTier = rep >= 90 ? 1 : rep >= 82 ? 2 : 3;
    const pool = nts.filter((n) => n.tier >= maxTier && n.tier <= maxTier + 1 && !intl.declined?.includes(n.id));
    if (pool.length) nt = pick(pool);
  }
  if (!nt) return;
  intl.offer = { nt: nt.id, season: w.season, until: w.day + OFFER_DAYS };
  addNews(w, "offer", `📨 Convite: técnico da seleção (${nt.name})`,
    `A federação quer você no comando da seleção (${nt.name}), acumulando com o clube. Responda em Carreira › Seleção em até ${OFFER_DAYS} dias.`);
}

export function acceptNtJob(w: World): boolean {
  const intl = w.intl;
  const o = intl?.offer;
  if (!intl || !o || !intl.nts[o.nt]) return false;
  w.ntJob = o.nt;
  intl.offer = undefined;
  intl.userSquad = pickSquad(w, intl.nts[o.nt], 26).map((p) => p.id);
  addNews(w, "board", `Você é o novo técnico da seleção (${ntName(w, o.nt)})`, "Monte a convocação em Seleções › sua seleção. Os jogos dela param o Continuar, como os do clube.");
  return true;
}

export function declineNtJob(w: World) {
  const intl = w.intl;
  if (!intl?.offer) return;
  (intl.declined ??= []).push(intl.offer.nt);
  intl.offer = undefined;
}

export function resignNtJob(w: World) {
  if (!w.ntJob || !w.intl) return;
  addNews(w, "board", `Você deixou a seleção (${ntName(w, w.ntJob)})`, "A federação agradece pelo trabalho.");
  w.ntJob = undefined;
  w.intl.userSquad = undefined;
  w.intl.userXI = undefined;
}

/** Jogadores elegíveis para a convocação (nacionalidade, com clube, fora da base). */
export function eligible(w: World, ntId: string): Player[] {
  const nt = w.intl?.nts[ntId];
  if (!nt) return [];
  return Object.values(w.players).filter((p) => p.nat === nt.fifa && p.clubId && !p.youth).sort((a, b) => b.ovr - a.ovr);
}

export function toggleSquad(w: World, pid: number) {
  const intl = w.intl;
  if (!intl || !w.ntJob) return;
  const s = (intl.userSquad ??= []);
  const i = s.indexOf(pid);
  if (i >= 0) s.splice(i, 1);
  else if (s.length < 26) s.push(pid);
}

export function toggleXI(w: World, pid: number) {
  const intl = w.intl;
  if (!intl || !w.ntJob) return;
  const x = (intl.userXI ??= []);
  const i = x.indexOf(pid);
  if (i >= 0) x.splice(i, 1);
  else if (x.length < 11) x.push(pid);
}

/** Jogo da seleção do usuário no dia (ainda não disputado). */
export function userNtFixtureOn(w: World, day: number): Fixture | undefined {
  if (!w.ntJob || !w.intl) return undefined;
  return w.intl.fixtures.find((f) => f.day === day && !f.result && (f.home === w.ntJob || f.away === w.ntJob));
}

/** Os 11 da seleção do usuário: os escolhidos (se disponíveis) completados pelos melhores convocados. */
export function userEleven(w: World): Player[] {
  const intl = w.intl!;
  const id = w.ntJob!;
  if (!intl.callups[id]) callUp(w, id, w.day);
  const squad = (intl.callups[id] ?? []).map((pid) => w.players[pid]).filter(Boolean);
  const chosen = (intl.userXI ?? []).map((pid) => w.players[pid]).filter((p) => p && squad.includes(p) && p.injury === 0);
  if (chosen.length >= 11) return chosen.slice(0, 11);
  const rest = quickEleven(squad.filter((p) => !chosen.includes(p)), undefined, id);
  const hasGk = chosen.some((p) => p.pos === "GOL");
  const fill = rest.filter((p) => !hasGk || p.pos !== "GOL");
  return [...chosen, ...fill].slice(0, 11);
}

/** Joga a partida da seleção do usuário. `mentality`: -1 defensivo, 0, +1 ofensivo. */
export function playNtMatch(w: World, f: Fixture, mentality: -1 | 0 | 1 = 0): MatchResult {
  const intl = w.intl!;
  setRngState(w.rng);
  const userHome = f.home === w.ntJob;
  const mine = userEleven(w);
  const oppId = userHome ? f.away : f.home;
  if (!intl.callups[oppId]) callUp(w, oppId, f.day);
  const opp = quickEleven((intl.callups[oppId] ?? []).map((id) => w.players[id]).filter(Boolean), undefined, oppId);
  const nM = intl.nts[w.ntJob!], nO = intl.nts[oppId];
  let sM = 0.7 * elevenStrength(mine, nM.level) + 0.3 * nM.level;
  const sO = 0.7 * elevenStrength(opp, nO.level) + 0.3 * nO.level;
  sM += mentality * 0.8; // ofensivo: um pouco mais de gols para os dois lados (via força), simplificado
  const [xiH, xiA, sH, sA] = userHome ? [mine, opp, sM, sO] : [opp, mine, sO, sM];
  f.result = quickResult(xiH, xiA, sH, sA, { neutral: f.neutral, penalties: !!f.tie });
  const r = { ...f.result, events: f.result.events.slice() };
  applyIntl(w, f, [xiH, xiA]);
  progressIntl(w);
  w.rng = getRngState();
  return r;
}
