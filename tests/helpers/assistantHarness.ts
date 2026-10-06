// Banco de provas do auxiliar técnico: simula muitos jogos com (a) a tática padrão e (b) seguindo
// tudo o que o auxiliar manda (pré-jogo + dicas ao vivo), com as mesmas sementes nos dois braços.
import { analyzeMatch, applyAdvice, applyTip, cloneForMatch, liveTips, refineAnalysis } from "../../src/engine/assistant";
import { ensureLinks, growLinks } from "../../src/engine/chemistry";
import { autoLineup } from "../../src/engine/lineup";
import { MatchSim } from "../../src/engine/match";
import { FORMATIONS } from "../../src/engine/positions";
import { getRngState, hashString, setRngState } from "../../src/engine/rng";
import { suggest } from "../../src/engine/teamtalk";
import type { Fixture, Lineup, World } from "../../src/engine/types";

export interface Scenario { user: string; opp: string; home: boolean; tag: string }
export type Arm = "padrao" | "padraoTrocas" | "preJogo" | "tudo";
export interface ArmResult { n: number; w: number; d: number; l: number; gf: number; ga: number }

export const winRate = (r: ArmResult) => r.w / r.n;
export const goalDiff = (r: ArmResult) => (r.gf - r.ga) / r.n;
export const ppg = (r: ArmResult) => (3 * r.w + r.d) / r.n;
export const fmt = (r: ArmResult) =>
  `V ${(100 * r.w / r.n).toFixed(1)}% E ${(100 * r.d / r.n).toFixed(1)}% D ${(100 * r.l / r.n).toFixed(1)}% | saldo ${goalDiff(r) >= 0 ? "+" : ""}${goalDiff(r).toFixed(3)} | ${ppg(r).toFixed(3)} pts`;

/**
 * Prepara um mini-mundo "de save em andamento": o elenco já joga junto no sistema atual
 * (entrosamento dos pares crescido, familiaridade alta no sistema de sempre, baixa nos outros).
 */
function prepare(base: World, sc: Scenario, staffStars: number) {
  const w: World = { ...base, userClubId: sc.user, staff: { ...(base.staff ?? {}), aux: { ...(base.staff?.aux ?? {} as never), stars: staffStars } } as World["staff"] };
  const f: Fixture = { id: 980000 + (hashString(sc.tag) % 10000), comp: "serieA", stage: "league", round: 10, day: w.day, home: sc.home ? sc.user : sc.opp, away: sc.home ? sc.opp : sc.user };
  const b = cloneForMatch(w, f);
  const club = b.mini.clubs[sc.user];
  club.tactic = { ...club.tactic, mentality: 0, pressing: 1 };
  club.lineup = undefined;
  club.links = undefined;
  ensureLinks(b.mini, club);
  const xi = autoLineup(b.mini, club, f.comp, club.tactic.formation, false);
  const ids = xi.starters.filter((x): x is number => x != null);
  for (let i = 0; i < 12; i++) growLinks(b.mini, club, [...ids, ...xi.bench.slice(0, 3)], ids);
  club.tfam = Object.fromEntries(Object.keys(FORMATIONS).map((k) => [k, k === club.tactic.formation ? 88 : 35]));
  club.chem = 75;
  const defLineup: Lineup = autoLineup(b.mini, club, f.comp, club.tactic.formation, false);
  return { b, club, defLineup, defTactic: { ...club.tactic } };
}

/** Roda `n` jogos de um cenário num braço. Não mexe no RNG de fora. */
export function runArm(base: World, sc: Scenario, arm: Arm, n: number, staffStars = 3): ArmResult {
  const outer = getRngState();
  const { b, club, defLineup, defTactic } = prepare(base, sc, staffStars);
  const side = b.userSide;
  let plan = null as ReturnType<typeof analyzeMatch>["plan"] | null;
  if (arm === "preJogo" || arm === "tudo") {
    b.reset();
    plan = refineAnalysis(b.mini, b.fx, analyzeMatch(b.mini, b.fx), staffStars).plan;
  }
  const r: ArmResult = { n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  try {
    for (let i = 0; i < n; i++) {
      b.reset();
      club.tactic = { ...defTactic };
      club.lineup = { starters: defLineup.starters.slice(), bench: defLineup.bench.slice(), captain: defLineup.captain };
      if (plan) applyAdvice(b.mini, club, plan, b.fx.comp);
      setRngState(hashString(`${sc.tag}:${i}`) || 1);
      // padrão "parado": o usuário não mexe; padrão com trocas: a IA faz as trocas por ele
      const userSide = arm === "padraoTrocas" || arm === "preJogo" ? null : side;
      const sim = new MatchSim(b.mini, b.fx, { live: false, userSide });
      if (arm === "tudo") {
        // preleção e conversa do intervalo sugeridas pelo auxiliar (como no jogo)
        sim.applyTalk(side, suggest(b.mini, b.fx, sim.talkCtx(side, "pre"), side), "pre");
        sim.autoTalk = true;
      }
      let guard = 0;
      while (!sim.finished && guard++ < 200) {
        sim.step();
        if (arm === "tudo") for (const tip of liveTips(sim, side)) applyTip(sim, side, tip);
      }
      const us = sim.sides[side].goals, them = sim.sides[1 - side].goals;
      r.n++; r.gf += us; r.ga += them;
      if (us > them) r.w++; else if (us === them) r.d++; else r.l++;
    }
  } finally {
    b.reset();
    setRngState(outer);
  }
  return r;
}

export function sum(rs: ArmResult[]): ArmResult {
  return rs.reduce((a, x) => ({ n: a.n + x.n, w: a.w + x.w, d: a.d + x.d, l: a.l + x.l, gf: a.gf + x.gf, ga: a.ga + x.ga }), { n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
}
