import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { withWorldRng } from "../src/engine/common";
import { wageBill } from "../src/engine/finance";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { validateWorld } from "../src/engine/integrity";
import { squadOf } from "../src/engine/lineup";
import { exerciseOption, loanOut, loanOutOffers, moveToLoan, requestLoanIn } from "../src/engine/loans";
import { simulateFixture } from "../src/engine/match";
import { releasePlayer } from "../src/engine/transfers";
import type { Club, Player, World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const make = (seed: number, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });

/** Avança (jogando as partidas do usuário) até o dia indicado ou o fim da temporada. */
function playUntil(w: World, day: number, onStep?: () => void) {
  for (let i = 0; i < 500; i++) {
    if (w.day >= day) return;
    const r = advance(w, Math.max(1, day - w.day));
    onStep?.();
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    } else if (r.reason === "seasonEnd") return;
  }
}

const playSeason = (w: World, onStep?: () => void) => playUntil(w, 9999, onStep);

/** Reserva do usuário (não é titular, não é lenda). */
function bench(w: World, n = 1): Player[] {
  const user = w.clubs[w.userClubId];
  return squadOf(w, user).filter((p) => !p.legend).sort((a, b) => a.ovr - b.ovr).slice(0, n);
}

const borrowerFor = (w: World, p: Player): Club =>
  Object.values(w.clubs).find((c) => (c.div === "B" || c.div === "C") && c.id !== w.userClubId && squadOf(w, c).length < 34 && c.level <= p.ovr + 4)
  ?? Object.values(w.clubs).find((c) => c.div === "C" && c.id !== w.userClubId)!;

describe("empréstimos", () => {
  it("empresta: mundo válido, jogador no novo clube e salário dividido", () => {
    const w = make(42);
    w.day = 20;
    const [p] = bench(w);
    const user = w.clubs[w.userClubId];
    const offers = loanOutOffers(w, p);
    expect(offers.length).toBeGreaterThan(0);
    expect(loanOutOffers(w, p)).toEqual(offers); // determinístico
    const off = offers[0];
    const borrower = w.clubs[off.clubId];
    const ub = wageBill(w, user), bb = wageBill(w, borrower);
    expect(loanOut(w, p, off, false, true)).toBeNull();
    expect(validateWorld(w)).toEqual([]);
    expect(p.clubId).toBe(borrower.id);
    expect(user.loanedOut).toContain(p.id);
    expect(p.loan?.opt).toBeUndefined();
    const share = Math.round(p.wage * off.wagePct);
    expect(wageBill(w, user)).toBe(ub - share);
    expect(wageBill(w, borrower)).toBe(bb + share);
    // dispensar um emprestado devolve ao clube de origem
    releasePlayer(w, p, false);
    expect(p.clubId).toBe(user.id);
    expect(p.loan).toBeUndefined();
    expect(validateWorld(w)).toEqual([]);
  });

  it("empréstimo de meia temporada volta no dia 181", () => {
    const w = make(7, "bahia");
    w.day = 30;
    const [p] = bench(w);
    const b = borrowerFor(w, p);
    moveToLoan(w, p, b, { half: true, wagePct: 1 });
    playUntil(w, 150);
    expect(p.clubId).toBe(b.id);
    playUntil(w, 182);
    expect(p.clubId).toBe(w.userClubId);
    expect(p.loan).toBeUndefined();
    expect(w.news.some((n) => n.title.includes("volta do empréstimo"))).toBe(true);
    expect(validateWorld(w)).toEqual([]);
  });

  it("empréstimo da temporada volta antes dos contratos e a IA nunca compra o emprestado", () => {
    const w = make(11, "gremio");
    w.day = 10;
    const [a, b] = bench(w, 2);
    a.contractEnd = w.season + 2;
    b.contractEnd = w.season; // contrato acaba: volta e é liberado pelo usuário
    const ca = borrowerFor(w, a);
    moveToLoan(w, a, ca, { wagePct: 0.8 });
    moveToLoan(w, b, borrowerFor(w, b), { wagePct: 0.8 });
    let stolen = 0;
    playSeason(w, () => {
      if (a.clubId !== ca.id) stolen++;
      if (w.offers.some((o) => o.pid === a.id && o.status === "pending")) stolen++;
    });
    expect(stolen).toBe(0);
    runEndOfSeason(w);
    expect(validateWorld(w)).toEqual([]);
    if (w.players[a.id]) {
      expect(a.loan).toBeUndefined();
      expect(a.clubId).toBe(w.userClubId);
    }
    if (w.players[b.id]) {
      expect(b.loan).toBeUndefined();
      // liberado pelo usuário; no fim da temporada um clube da IA pode contratá-lo como jogador livre
      expect(b.clubId).not.toBe(w.userClubId);
    }
  }, 60000);

  it("3 temporadas com 2 empréstimos por temporada mantêm o mundo íntegro", () => {
    const w = make(99, "remo");
    let aiLoans = 0;
    for (let s = 0; s < 3; s++) {
      w.day = Math.max(w.day, 5);
      for (const p of bench(w, 2)) {
        const offers = loanOutOffers(w, p);
        if (offers.length) loanOut(w, p, offers[0], s === 1, false);
      }
      expect(validateWorld(w)).toEqual([]);
      playSeason(w, () => {
        aiLoans = Math.max(aiLoans, Object.values(w.players).filter((p) => p.loan && p.loan.from !== w.userClubId).length);
      });
      runEndOfSeason(w);
      expect(validateWorld(w)).toEqual([]);
      for (const c of Object.values(w.clubs)) if (c.div !== "D") expect(squadOf(w, c).length).toBeGreaterThanOrEqual(18);
      expect(Object.values(w.players).some((p) => p.loan)).toBe(false);
    }
    console.log("empréstimos da IA ao mesmo tempo (máx.)", aiLoans);
    expect(aiLoans).toBeGreaterThan(0);
  }, 120000);

  it("pedir emprestado e exercer a opção transfere o jogador", () => {
    const w = make(42);
    w.day = 20;
    const user = w.clubs[w.userClubId];
    const parent = w.clubs.palmeiras;
    const p = squadOf(w, parent).sort((x, y) => x.ovr - y.ovr)[0];
    // pagando 100% do salário de um reserva: quase sempre aceitam
    const r = withWorldRng(w, () => requestLoanIn(w, p, 1));
    if (!r.ok) moveToLoan(w, p, user, { wagePct: 1 });
    expect(p.clubId).toBe(user.id);
    expect(validateWorld(w)).toEqual([]);
    p.loan!.opt = 2_000_000;
    const bal = parent.balance;
    expect(exerciseOption(w, p)).toBeNull();
    expect(p.loan).toBeUndefined();
    expect(p.clubId).toBe(user.id);
    expect(parent.balance).toBe(bal + 2_000_000);
    expect(parent.loanedOut ?? []).not.toContain(p.id);
    expect(validateWorld(w)).toEqual([]);
  });
});
