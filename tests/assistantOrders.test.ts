// Ordens contextuais do auxiliar (instruções rápidas, marcação dobrada, um a menos, momentum, mata-mata):
// seguir as ordens não pode piorar o resultado. Mesmas sementes nos braços (comparação pareada).
// N pequeno no CI; para a conta completa: AUX_N=300 npx vitest run tests/assistantOrders.test.ts
import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { clubStrength } from "../src/engine/lineup";
import { createWorld, type Database } from "../src/engine/world";
import type { Stakes } from "../src/engine/assistant";
import { fmt, ppg, runArm, sum, type Arm, type ArmResult, type Scenario } from "./helpers/assistantHarness";

const base = createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 2024 });
const A = Object.values(base.clubs).filter((c) => c.div === "A").sort((a, b) => clubStrength(base, b) - clubStrength(base, a)).map((c) => c.id);
const N = Number(process.env.AUX_N ?? (process.env.CI ? 24 : 120));

const go = (r: ArmResult) => (r.go ?? 0) / r.n;
const scen = (pairs: [string, string][]): Scenario[] =>
  pairs.flatMap(([u, o]) => [true, false].map((home) => ({ user: u, opp: o, home, tag: `ord-${u}-${o}-${home ? "c" : "f"}` })));

function run(sc: Scenario[], arms: Arm[], stakes?: Stakes) {
  const out = Object.fromEntries(arms.map((a) => [a, [] as ArmResult[]])) as Record<Arm, ArmResult[]>;
  for (const s of sc) {
    const line = arms.map((a) => {
      const r = runArm(base, s, a, N, 3, { stakes });
      out[a].push(r);
      return `${a}: ${fmt(r)} | avança ${(100 * go(r)).toFixed(1)}%`;
    });
    console.log(`${s.tag.padEnd(34)} ${line.join("  ||  ")}`);
  }
  return Object.fromEntries(arms.map((a) => [a, sum(out[a])])) as Record<Arm, ArmResult>;
}

describe("auxiliar: ordens contextuais ao vivo", () => {
  it("liga: seguir as ordens novas não piora (nem sobre o padrão, nem sobre as dicas antigas)", () => {
    const tot = run(scen([[A[1], A[17]], [A[6], A[8]], [A[16], A[2]]]), ["padraoTrocas", "antigas", "tudo"]);
    for (const a of ["padraoTrocas", "antigas", "tudo"] as Arm[]) console.log(`TOTAL ${a}: ${fmt(tot[a])}`);
    expect(ppg(tot.tudo)).toBeGreaterThanOrEqual(ppg(tot.padraoTrocas));
    // tolerância de ruído para N pequeno (pareado): as ordens novas não tiram pontos das antigas
    expect(ppg(tot.tudo)).toBeGreaterThanOrEqual(ppg(tot.antigas) - 0.06);
  }, 1_200_000);

  const KO: [string, Stakes][] = [
    ["final em jogo único (empate = pênaltis)", { offset: 0, dv: 0.5, knockout: true, final: true, leg: 0 }],
    ["volta perdendo a ida por 1", { offset: -1, dv: 0.5, knockout: true, final: false, leg: 2 }],
    ["volta ganhando a ida por 1", { offset: 1, dv: 0.5, knockout: true, final: false, leg: 2 }],
  ];
  for (const [label, st] of KO) {
    it(`mata-mata — ${label}: seguir as ordens não diminui a chance de classificar`, () => {
      const tot = run(scen([[A[3], A[7]], [A[12], A[5]]]), ["padraoTrocas", "antigas", "tudo"], st);
      console.log(`TOTAL ${label}: padrão ${(100 * go(tot.padraoTrocas)).toFixed(1)}% · dicas antigas ${(100 * go(tot.antigas)).toFixed(1)}% → ordens ${(100 * go(tot.tudo)).toFixed(1)}%`);
      expect(go(tot.tudo)).toBeGreaterThanOrEqual(go(tot.padraoTrocas));
      expect(go(tot.tudo)).toBeGreaterThanOrEqual(go(tot.antigas) - 0.03);
    }, 1_200_000);
  }
});
