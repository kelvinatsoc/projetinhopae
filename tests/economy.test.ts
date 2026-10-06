import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { absDay } from "../src/engine/common";
import { canUpgrade, clubInjuryMult, facilitiesDaily, facLevel, facState, startUpgrade, upgradeCost } from "../src/engine/facilities";
import { gateRevenue, monthlyFinances } from "../src/engine/finance";
import { MatchSim } from "../src/engine/match";
import { getRngState, setRngState } from "../src/engine/rng";
import { bestTaker, freeKickXgFor, ROUTINES, setRoutine, setTaker, takerFor } from "../src/engine/setpieces";
import { bonusMet, currentOffers, makeOffers, migrateSponsors, settleSponsorBonuses, signSponsor, sponsorAnnual } from "../src/engine/sponsors";
import type { Fixture, World } from "../src/engine/types";
import { createWorld, migrateWorld, type Database } from "../src/engine/world";

const fresh = () => createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 7 });
const fx = (home: string, away: string, id: number): Fixture => ({ id, comp: "serieA", stage: "league", round: 1, day: 20, home, away });

describe("patrocínios", () => {
  it("ofertas são determinísticas, com marcas fictícias e escaladas pela reputação", () => {
    const w = fresh();
    const big = w.clubs.flamengo;
    const a = makeOffers(w, big, "shirt"), b = makeOffers(w, big, "shirt");
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((o) => o.brand)).size).toBe(3);
    const small = Object.values(w.clubs).filter((c) => c.div === "A").sort((x, y) => x.rep - y.rep)[0];
    const avg = (xs: { annual: number }[]) => xs.reduce((s, o) => s + o.annual, 0) / xs.length;
    expect(avg(a)).toBeGreaterThan(avg(makeOffers(w, small, "shirt")));
    // o perfil arrojado tem bônus
    expect(a[2].bonus.length).toBeGreaterThan(0);
  });

  it("assinar muda a receita mensal e paga bônus de fim de temporada", () => {
    const w = fresh();
    const c = w.clubs.flamengo;
    // começa com os contratos reais; aqui os espaços ficam livres para testar a assinatura
    expect(c.sponsors!.deals.shirt!.brand).toBe("Betano");
    expect(c.sponsors!.deals.kit!.brand).toBe("adidas");
    c.sponsors!.deals = {};
    const offers = currentOffers(w, c);
    for (const slot of ["shirt", "stadium", "kit"]) {
      const o = offers.filter((x) => x.slot === slot)[2];
      expect(signSponsor(w, c, o.id)).toBeNull();
    }
    expect(currentOffers(w, c)).toHaveLength(0);
    const annual = sponsorAnnual(w, c);
    const before = c.finance.income.sponsor ?? 0;
    monthlyFinances(w);
    expect((c.finance.income.sponsor ?? 0) - before).toBe(Math.round(annual / 12));
    // temporada seguinte: campeão
    c.history.push({ season: w.season, div: "A", pos: 1, titles: [] });
    w.season++;
    const bal = c.balance;
    const paid = settleSponsorBonuses(w, c);
    expect(paid).toBeGreaterThan(0);
    expect(c.balance - bal).toBe(paid);
    expect(settleSponsorBonuses(w, c)).toBe(0); // uma vez só
  });

  it("contratos reais e saves antigos com marcas fictícias", () => {
    const w = fresh();
    expect(w.clubs.palmeiras.sponsors!.deals.stadium!.brand).toBe("Allianz Parque");
    expect(w.clubs["sao-paulo"].sponsors!.deals.shirt!.brand).toBe("Superbet");
    expect(w.clubs.corinthians.sponsors!.deals.kit!.brand).toBe("Nike");
    // renovação: o parceiro real aparece entre as ofertas
    expect(makeOffers(w, w.clubs.flamengo, "shirt")[0].brand).toBe("Betano");
    const c = w.clubs.flamengo;
    c.sponsors = { deals: { shirt: { id: "x", slot: "shirt", brand: "Banco Arapuã", annual: 1e6, years: 2, bonus: [], since: w.season, until: w.season + 1 } },
      offers: { season: w.season, list: [{ id: "y", slot: "kit", brand: "Bicuda", annual: 1, years: 1, bonus: [] }] } };
    migrateSponsors(c, w);
    expect(c.sponsors.deals.shirt!.brand).toBe("Betano");
    expect(c.sponsors.deals.shirt!.annual).toBe(1e6);
    expect(c.sponsors.offers).toBeUndefined();
  });

  it("cláusulas", () => {
    expect(bonusMet("title", "A", 1)).toBe(true);
    expect(bonusMet("top4", "A", 5)).toBe(false);
    expect(bonusMet("safe", "A", 16)).toBe(true);
    expect(bonusMet("safe", "A", 17)).toBe(false);
  });
});

describe("estrutura", () => {
  it("obra cobra na hora, fica pronta depois das semanas e sobe o nível", () => {
    const w = fresh();
    const c = w.clubs.flamengo;
    c.balance = 1e10;
    const lv = facLevel(c, "medical");
    const { cost, weeks } = upgradeCost(c, "medical", lv + 1);
    const bal = c.balance;
    expect(startUpgrade(w, c, "medical")).toBeNull();
    expect(bal - c.balance).toBe(cost);
    expect(canUpgrade(c, "medical")).toMatch(/andamento/);
    w.day += weeks * 7 - 1;
    expect(facilitiesDaily(w)).toHaveLength(0);
    w.day += 1;
    expect(facilitiesDaily(w)).toHaveLength(1);
    expect(facLevel(c, "medical")).toBe(lv + 1);
    expect(clubInjuryMult(c)).toBeLessThan(1);
    expect(absDay(w)).toBeGreaterThan(0);
  });

  it("estádio maior aumenta capacidade e bilheteria; CT e base usam os campos existentes", () => {
    const w = fresh();
    const c = w.clubs.flamengo;
    const f = fx("flamengo", "palmeiras", 900001);
    const g0 = c.finance.income.gate ?? 0;
    gateRevenue(w, f, 30000);
    const plain = (c.finance.income.gate ?? 0) - g0;
    const st = facState(c);
    st.stadium = 5;
    const g1 = c.finance.income.gate ?? 0;
    gateRevenue(w, f, 30000);
    expect((c.finance.income.gate ?? 0) - g1).toBeGreaterThan(plain);
    c.balance = 1e10;
    const cap = c.capacity, ct = c.facilities;
    st.stadium = 3;
    startUpgrade(w, c, "stadium");
    if (ct < 5) startUpgrade(w, c, "training");
    w.day += 400;
    facilitiesDaily(w);
    expect(c.capacity).toBeGreaterThan(cap);
    if (ct < 5) expect(c.facilities).toBe(ct + 1);
  });

  it("migração repara dados inválidos", () => {
    const w = fresh();
    const c = w.clubs.flamengo;
    (c as unknown as Record<string, unknown>).fac = { stadium: 99, medical: "x", builds: "nada" };
    (c as unknown as Record<string, unknown>).sponsors = { deals: { shirt: { annual: -1 } } };
    c.setPieces = { routine: "xx" as "pp", pen: -5 };
    migrateWorld(w, db as Database);
    expect(c.fac!.stadium).toBeLessThanOrEqual(5);
    expect(c.fac!.medical).toBe(2);
    expect(c.fac!.builds).toEqual([]);
    expect(c.sponsors!.deals.shirt).toBeUndefined();
    expect(c.setPieces!.routine).toBe("pp");
    expect(c.setPieces!.pen).toBeUndefined();
  });
});

describe("bola parada", () => {
  it("batedor escolhido é usado se estiver em campo; senão o melhor", () => {
    const w = fresh();
    const c = w.clubs.flamengo;
    const sim = new MatchSim(w, fx("flamengo", "palmeiras", 900010));
    const on = sim.sides[0].onPitch;
    const auto = bestTaker(w, on, "pen");
    expect(takerFor(w, c, on, "pen")).toBe(auto);
    const other = on.find((id) => id != null && id !== auto && w.players[id].pos !== "GOL")!;
    setTaker(c, "pen", other);
    expect(takerFor(w, c, on, "pen")).toBe(other);
    setTaker(c, "pen", -1);
    expect(takerFor(w, c, on, "pen")).toBe(auto);
    const p = w.players[other];
    expect(freeKickXgFor(p)).toBeGreaterThan(0);
    expect(Object.keys(ROUTINES)).toEqual(["pp", "sp", "curto"]);
  });

  it("partida continua determinística e marca lances importantes", () => {
    const w = fresh();
    setRoutine(w.clubs.flamengo, "curto");
    const run = () => {
      const s0 = getRngState();
      setRngState(123);
      const sim = new MatchSim(w, fx("flamengo", "palmeiras", 900020), { live: true });
      const snap = Object.values(w.players).map((p) => [p, p.cond, p.injury, p.morale] as const);
      sim.runToEnd();
      for (const [p, a, b, m] of snap) { p.cond = a; p.injury = b; p.morale = m; }
      setRngState(s0);
      return sim.result();
    };
    const a = run(), b = run();
    expect(a.hg).toBe(b.hg);
    expect(a.events.length).toBe(b.events.length);
    expect(a.events.some((e) => e.key && e.type === "end")).toBe(true);
    for (const e of a.events) if (e.type === "goal" || e.type === "pen-goal" || e.type === "red") expect(e.key).toBe(true);
  });

  it("média de gols com jogadas ensaiadas fica realista", () => {
    const w: World = fresh();
    const A = Object.values(w.clubs).filter((c) => c.div === "A").map((c) => c.id);
    const routines = ["pp", "sp", "curto"] as const;
    const s0 = getRngState();
    setRngState(99);
    const snap = Object.values(w.players).map((p) => [p, p.cond, p.injury, p.morale] as const);
    let goals = 0, n = 0, id = 910000;
    for (const a of A) for (const b of A) {
      if (a >= b) continue; // metade dos confrontos (teste rápido)
      setRoutine(w.clubs[a], routines[n % 3]);
      const sim = new MatchSim(w, fx(a, b, id++));
      sim.runToEnd();
      goals += sim.sides[0].goals + sim.sides[1].goals;
      n++;
      for (const [p, c, i, m] of snap) { p.cond = c; p.injury = i; p.morale = m; }
    }
    setRngState(s0);
    const avg = goals / n;
    expect(avg).toBeGreaterThan(2.0);
    expect(avg).toBeLessThan(2.8);
  });
});
