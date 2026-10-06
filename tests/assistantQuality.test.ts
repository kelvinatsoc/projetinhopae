import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { clubStrength } from "../src/engine/lineup";
import { createWorld, type Database } from "../src/engine/world";
import { fmt, goalDiff, ppg, runArm, sum, winRate, type Arm, type ArmResult, type Scenario } from "./helpers/assistantHarness";

const base = createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 2024 });
const A = Object.values(base.clubs).filter((c) => c.div === "A").sort((a, b) => clubStrength(base, b) - clubStrength(base, a)).map((c) => c.id);
const N = Number(process.env.AUX_N ?? 300);

// forte x fraco, parelhos, fraco x forte — em casa e fora
const SCEN: Scenario[] = [
  [A[0], A[19]], [A[2], A[15]], [A[5], A[9]], [A[8], A[10]], [A[12], A[4]], [A[18], A[1]],
].flatMap(([u, o]) => [true, false].map((home) => ({ user: u, opp: o, home, tag: `${u}-${o}-${home ? "c" : "f"}` })));

function table(arms: Arm[], stars: number) {
  const out: Record<string, ArmResult[]> = {};
  for (const arm of arms) out[arm] = [];
  for (const sc of SCEN) {
    const line: string[] = [];
    for (const arm of arms) {
      const r = runArm(base, sc, arm, N, stars);
      out[arm].push(r);
      line.push(`${arm}: ${fmt(r)}`);
    }
    console.log(`${sc.tag.padEnd(36)} ${line.join("  ||  ")}`);
  }
  const tot = Object.fromEntries(arms.map((a) => [a, sum(out[a])])) as Record<Arm, ArmResult>;
  for (const a of arms) console.log(`TOTAL ${a.padEnd(13)} (aux ${stars}★): ${fmt(tot[a])}`);
  return { per: out, tot };
}

describe("auxiliar: seguir os conselhos não pode piorar", () => {
  it("auxiliar mediano (3★): seguir tudo ≥ tática padrão em vitórias e saldo", () => {
    const { per, tot } = table(["padrao", "padraoTrocas", "preJogo", "tudo"], 3);
    for (const arm of ["preJogo", "tudo"] as Arm[]) {
      expect(winRate(tot[arm])).toBeGreaterThanOrEqual(winRate(tot.padraoTrocas));
      expect(goalDiff(tot[arm])).toBeGreaterThanOrEqual(goalDiff(tot.padraoTrocas));
    }
    // nenhum cenário fica claramente pior (tolerância de ruído: 0,12 ponto/jogo)
    per.tudo.forEach((r, i) => expect(ppg(r)).toBeGreaterThanOrEqual(ppg(per.padraoTrocas[i]) - 0.12));
  }, 1_200_000);

  it("auxiliar bom (5★): margem clara sobre a tática padrão", () => {
    const { tot } = table(["padraoTrocas", "tudo"], 5);
    expect(ppg(tot.tudo)).toBeGreaterThanOrEqual(ppg(tot.padraoTrocas) + 0.08);
    expect(goalDiff(tot.tudo)).toBeGreaterThan(goalDiff(tot.padraoTrocas) + 0.1);
  }, 1_200_000);
});
