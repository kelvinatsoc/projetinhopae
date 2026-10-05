// Carreira do treinador: reputação, propostas de outros clubes (fim de temporada ou após demissão)
// e troca de clube. Usa o gerador do motor (rng) para continuar determinístico.
import { unlock } from "./achievements";
import { addNews } from "./news";
import { clamp, getRngState, rand, setRngState } from "./rng";
import { fireAndRehire } from "./season";
import type { CareerState, Club, JobOffer, World } from "./types";

const DIV_WEIGHT: Record<string, number> = { A: 1, B: 0.7, C: 0.45, D: 0.3, F: 0.8 };

export function ensureCareer(w: World): CareerState {
  if (!w.career) {
    const club = w.clubs[w.userClubId];
    w.career = { rep: clamp(Math.round((club?.rep ?? 50) * 0.55), 15, 60), offers: [], moves: [], sackings: 0 };
  }
  w.career.offers ??= [];
  w.career.moves ??= [];
  return w.career;
}

export function repLabel(rep: number): string {
  if (rep >= 90) return "Lenda do banco";
  if (rep >= 75) return "Renome continental";
  if (rep >= 60) return "Renome nacional";
  if (rep >= 45) return "Respeitado";
  if (rep >= 30) return "Promissor";
  return "Desconhecido";
}

export interface SeasonCareerInput { titles: string[]; met: boolean; promoted: boolean; relegated: boolean; pos: number | null }

/** Variação de reputação de uma temporada (pura, testável). */
export function seasonRepDelta(club: Club, s: SeasonCareerInput): number {
  const wgt = DIV_WEIGHT[club.div] ?? 0.5;
  let d = s.met ? 4 : -5;
  for (const t of s.titles) d += t === "liberta" ? 14 : t === "serieA" ? 12 : t === "copaBR" || t === "sula" ? 8 : 5;
  if (s.promoted) d += 6;
  if (s.relegated) d -= 8;
  if (club.div === "A" && s.pos != null && s.pos <= 4) d += 3;
  return Math.round(d * (d > 0 ? wgt + 0.3 : 1));
}

/** Clubes que poderiam querer o treinador, com a reputação atual. */
function candidates(w: World, maxRepGap: number): Club[] {
  const rep = ensureCareer(w).rep;
  return Object.values(w.clubs)
    .filter((c) => c.country === "BRA" && c.div !== "D" && c.div !== "F" && c.id !== w.userClubId)
    .filter((c) => c.rep <= rep + maxRepGap && c.rep >= rep - 35);
}

/** Gera propostas. reason "fired" sempre traz opções (clubes menores, se preciso). */
export function generateOffers(w: World, reason: JobOffer["reason"]): JobOffer[] {
  const car = ensureCareer(w);
  car.offers = car.offers.filter((o) => o.season >= w.season && o.reason === reason);
  let pool = candidates(w, reason === "fired" ? 0 : 12);
  if (reason === "fired" && pool.length < 4) {
    pool = Object.values(w.clubs).filter((c) => c.country === "BRA" && c.div !== "D" && c.div !== "F" && c.id !== w.userClubId).sort((a, b) => a.rep - b.rep).slice(0, 20);
  }
  const want = reason === "fired" ? 4 : car.rep >= 70 ? 3 : car.rep >= 45 ? 2 : 1;
  const chanceAny = reason === "fired" ? 1 : clamp(0.25 + car.rep / 120, 0.25, 0.95);
  const made: JobOffer[] = [];
  if (rand() > chanceAny) return made;
  // sorteio ponderado pela reputação do clube (clubes maiores são mais disputados)
  const scored = pool.map((c) => ({ c, s: rand() + c.rep / 200 })).sort((a, b) => b.s - a.s);
  for (const { c } of scored) {
    if (made.length >= want) break;
    if (car.offers.some((o) => o.clubId === c.id)) continue;
    made.push({ id: w.nextId++, clubId: c.id, season: w.season, until: reason === "fired" ? 999 : 60, reason });
  }
  car.offers.push(...made);
  if (made.length && reason === "season") {
    addNews(w, "offer", "Propostas de emprego", `${made.map((o) => w.clubs[o.clubId].name).join(", ")} ${made.length > 1 ? "querem" : "quer"} contratar você. Veja em Clube › Carreira.`);
  }
  return made;
}

/** Fim de temporada: atualiza reputação e (se não foi demitido) traz propostas. */
export function careerSeasonEnd(w: World, s: SeasonCareerInput) {
  const car = ensureCareer(w);
  car.offers = [];
  car.rep = clamp(car.rep + seasonRepDelta(w.clubs[w.userClubId], s), 0, 100);
  if (car.rep >= 80) unlock(w, "rep_80");
}

/** Depois de virar o ano (novo calendário já montado). */
export function careerNewSeason(w: World) {
  const car = ensureCareer(w);
  if (w.fired) {
    car.sackings++;
    car.rep = clamp(car.rep - 6, 0, 100);
    generateOffers(w, "fired");
  } else if (!w.scenario || w.scenario.status !== "active") {
    generateOffers(w, "season");
  }
}

/** Demissão no meio da temporada (board.ts). */
export function careerSacked(w: World) {
  const car = ensureCareer(w);
  car.sackings++;
  car.rep = clamp(car.rep - 8, 0, 100);
  generateOffers(w, "fired");
}

/** Propostas ainda válidas. */
export function activeOffers(w: World): JobOffer[] {
  const car = ensureCareer(w);
  return car.offers.filter((o) => o.season === w.season && w.day <= o.until && w.clubs[o.clubId] && o.clubId !== w.userClubId);
}

export function acceptOffer(w: World, offerId: number): boolean {
  const car = ensureCareer(w);
  const o = activeOffers(w).find((x) => x.id === offerId);
  if (!o) return false;
  const from = w.userClubId;
  car.moves.push({ season: w.season, day: w.day, from, to: o.clubId, fired: !!w.fired });
  car.offers = [];
  const pending = w.pendingMatch;
  w.pendingMatch = undefined;
  if (pending != null) w.clubs[from].lineup = undefined;
  fireAndRehire(w, o.clubId);
  unlock(w, "job_change");
  return true;
}

export function declineOffer(w: World, offerId: number) {
  const car = ensureCareer(w);
  car.offers = car.offers.filter((o) => o.id !== offerId);
  // demitido e sem propostas: aparecem clubes menores
  if (w.fired && !activeOffers(w).length) {
    setRngState(w.rng);
    generateOffers(w, "fired");
    w.rng = getRngState();
  }
}
