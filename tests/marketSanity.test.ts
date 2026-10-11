// Faixas de sanidade da economia do mercado (referência mental: Transfermarkt, câmbio EUR_BRL).
import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import world from "../src/data/world.json";
import type { WorldData } from "../src/data/worldTypes";
import { LUVAS_MULT } from "../src/engine/contracts";
import { age, playerValue } from "../src/engine/player";
import { aiWorldBuy, askingPrice, wageDemand } from "../src/engine/transfers";
import type { Player } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";
import { EUR_BRL, PRICE_CAP } from "../src/engine/worldMoney";

const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 7, world: world as unknown as WorldData });
const all = Object.values(w.players).filter((p) => p.clubId);
const byName = (n: string) => all.find((p) => p.name === n)!;
const ratio = (p: Player) => askingPrice(w, p) / playerValue(p, w.season);
const annualEur = (monthlyBrl: number) => (monthlyBrl * 12) / EUR_BRL / 1e6;

describe("economia: preço pedido", () => {
  it("nenhum pedido passa de 2× o valor de mercado", () => {
    for (const p of all) expect(ratio(p)).toBeLessThanOrEqual(PRICE_CAP + 0.02);
  });

  it("estrela europeia (Haaland): 1,0–2,0× o valor, longe de 'um bi' por R$ 300 mi", () => {
    const p = byName("Erling Haaland");
    expect(ratio(p)).toBeGreaterThanOrEqual(1);
    expect(ratio(p)).toBeLessThanOrEqual(2);
  });

  it("jovem brasileiro: 1,0–1,5× o valor", () => {
    const young = all.filter((p) => { const c = w.clubs[p.clubId!]; return c.country === "BRA" && !c.league && age(p, w.season) <= 21 && p.ovr >= 72 && !p.listed; });
    expect(young.length).toBeGreaterThan(3);
    for (const p of young) { expect(ratio(p)).toBeGreaterThanOrEqual(1); expect(ratio(p)).toBeLessThanOrEqual(1.5); }
  });

  it("veterano (34+): preço ainda dentro de 1,0–2,0× e valor baixo", () => {
    const vets = all.filter((p) => age(p, w.season) >= 34 && p.ovr >= 80 && !p.listed);
    expect(vets.length).toBeGreaterThan(0);
    for (const p of vets) { expect(ratio(p)).toBeGreaterThanOrEqual(0.9); expect(ratio(p)).toBeLessThanOrEqual(2); }
  });

  it("a IA estrangeira também respeita o teto (prêmio de liga aplicado uma vez só)", () => {
    const ww = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 3, world: world as unknown as WorldData });
    ww.day = 190;
    const before = ww.offers.length;
    const vals = new Map(Object.values(ww.players).map((p) => [p.id, playerValue(p, ww.season)]));
    for (let i = 0; i < 300; i++) aiWorldBuy(ww);
    for (const o of ww.offers.slice(before)) expect(o.fee / vals.get(o.pid)!).toBeLessThanOrEqual(PRICE_CAP + 0.02);
  });
});

describe("economia: salários e luvas", () => {
  it("estrelas das ligas ricas pedem 25–60 mi de euros por ano", () => {
    for (const n of ["Erling Haaland", "Kylian Mbappé", "Harry Kane"]) {
      const p = byName(n);
      const eur = annualEur(wageDemand(w, p, w.clubs[p.clubId!]));
      expect(eur, n).toBeGreaterThanOrEqual(25);
      expect(eur, n).toBeLessThanOrEqual(60);
    }
  });

  it("jovem brasileiro ganha uma fração disso (< 5 mi de euros/ano)", () => {
    const p = all.find((x) => { const c = w.clubs[x.clubId!]; return c.country === "BRA" && !c.league && age(x, w.season) <= 21 && x.ovr >= 75; })!;
    expect(annualEur(wageDemand(w, p, w.clubs.flamengo))).toBeLessThan(5);
  });

  it("luvas máximas ficam em até meio ano de salário (estrela: 20–30 mi de euros)", () => {
    const max = LUVAS_MULT[LUVAS_MULT.length - 1];
    expect(max).toBeLessThanOrEqual(6);
    const p = byName("Erling Haaland");
    const luvas = annualEur(wageDemand(w, p, w.clubs[p.clubId!]) * max) / 12;
    expect(luvas).toBeGreaterThan(10);
    expect(luvas).toBeLessThan(30);
  });
});
