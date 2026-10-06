import { progressHooks } from "./hooks";
// Outras competições de clubes do mundo: AFC Champions League Elite (zonas Oeste/Leste + mata-mata,
// formato simplificado), Mundial de Clubes FIFA (32 clubes, a cada 4 anos desde 2029) e Copa Intercontinental
// (anual, em dezembro: campeão da Libertadores x campeão da Champions).
import { intlWindows, isClubWorldCupYear, onOrAfter, thursday, yearLen } from "./calendar";
import { addFixture, allTiesDone, createTie, newComp, newRow, registerComp, sortTable, stageDone, stageTies, winners } from "./competitions";
import { awardPrize } from "./finance";
import { shuffle } from "./rng";
import type { Club, Competition, World } from "./types";
import { leaguePhaseDraw } from "./uefa";
import { awardWorldComp, seasonLabel, worldNews } from "./worldLeagues";

export const CONT_METAS: Record<string, { name: string; short: string; color: string; tier: number }> = {
  acle: { name: "AFC Champions League Elite", short: "ACL Elite", color: "#0e7c86", tier: 22 },
  cwc: { name: "Copa do Mundo de Clubes da FIFA", short: "Mundial de Clubes", color: "#c9a227", tier: 19 },
  intercontinental: { name: "Copa Intercontinental da FIFA", short: "Intercontinental", color: "#e5c158", tier: 18 },
};
export const registerContinentalMetas = () => { for (const [id, m] of Object.entries(CONT_METAS)) registerComp(id, m); };

const power = (c: Club) => c.level + c.rep / 10;
const WEST_ASIA = new Set(["KSA", "QAT", "UAE", "IRN", "IRQ", "UZB", "JOR", "KUW", "OMA", "BHR", "SYR", "LBN"]);
const SEED_ORDER: Record<number, number[]> = { 2: [0, 1], 4: [0, 3, 1, 2], 8: [0, 7, 3, 4, 1, 6, 2, 5] };

// ---------------------------------------------------------------- AFC Champions League Elite
/** Dias (segundas-feiras, relativos a 1º/jan do ano Y), fora das datas FIFA. */
function acleDays(y: number) {
  const blocked = new Set<number>();
  for (const win of intlWindows(y)) for (let d = win.start; d <= win.end; d++) blocked.add(d);
  for (const win of intlWindows(y + 1)) for (let d = win.start; d <= win.end; d++) blocked.add(d + yearLen(y));
  const at = (yy: number, m: number, d: number, dow = 1) => { let x = onOrAfter(y, yy, m, d, dow); while (blocked.has(x)) x += 7; return x; };
  const N = y + 1;
  return {
    league: [at(y, 8, 15), at(y, 8, 29), at(y, 9, 20), at(y, 10, 3), at(y, 10, 24), at(y, 11, 8), at(N, 1, 9), at(N, 1, 16)],
    r16: [at(N, 2, 2), at(N, 2, 9)],
    qf: [at(N, 3, 13)], sf: [at(N, 3, 20)], final: [at(N, 3, 27)],
  };
}

/** Cria a ACL Elite (dia 181), com as melhores colocadas das ligas asiáticas. */
export function createAcle(w: World, prev: Record<string, string[]>) {
  const leagues = Object.values(w.wl?.leagues ?? {}).filter((l) => l.confed === "AFC");
  if (!leagues.length) return;
  const zones: string[][] = [[], []];
  for (const l of leagues) {
    const order = prev[l.id] ?? Object.values(w.clubs).filter((c) => c.league === l.id).sort((a, b) => power(b) - power(a) || a.id.localeCompare(b.id)).map((c) => c.id);
    zones[WEST_ASIA.has(l.country) ? 0 : 1].push(...order.slice(0, 8));
  }
  const used = zones.map((z) => (z.length % 2 ? z.slice(0, -1) : z).slice(0, 12)).filter((z) => z.length >= 4);
  if (!used.length) return;
  const teams = used.flat();
  const comp = newComp(w, "acle", "groups", teams);
  Object.assign(comp, { carry: true, lite: true, label: seasonLabel(w.season), region: "AFC" });
  comp.groups = used.map((z, i) => ({ name: used.length === 2 ? (i === 0 ? "Oeste" : "Leste") : "Zona única", teams: z, table: z.map(newRow) }));
  w.comps.acle = comp;
  const d = acleDays(w.season).league;
  comp.groups.forEach((g, gi) => {
    leaguePhaseDraw(w, g.teams, Math.min(8, g.teams.length - 1)).forEach((pairs, ri) => {
      for (const [home, away] of pairs) addFixture(w, { comp: "acle", stage: "group", round: ri + 1, day: d[ri], home, away, group: gi });
    });
  });
}

function progressAcle(w: World, comp: Competition) {
  const d = acleDays(comp.season);
  const shift = w.season > comp.season ? -yearLen(comp.season) : 0;
  const at = (xs: number[]) => xs.map((x) => x + shift);
  if (comp.stage === "group" && stageDone(w, comp, "group")) {
    const tables = comp.groups.map((g) => sortTable(g.table).map((r) => r.club));
    let q = 8;
    while (q > 2 && tables.some((t) => t.length < q)) q /= 2;
    const order = SEED_ORDER[q];
    for (const t of tables) for (let k = 0; k < q / 2; k++) createTie(w, comp, "r16", t[order[2 * k + 1]], t[order[2 * k]], 2, at(d.r16));
    comp.stage = "r16";
  } else if (["r16", "qf", "sf"].includes(comp.stage) && allTiesDone(comp, comp.stage)) {
    const ws = winners(comp, comp.stage);
    if (ws.length === 1) return finish(w, comp, stageTies(comp, comp.stage)[0]);
    const next = ws.length === 2 ? "final" : comp.stage === "r16" ? "qf" : "sf";
    for (let k = 0; k + 1 < ws.length; k += 2) createTie(w, comp, next, ws[k], ws[k + 1], 1, at(d[next]), { neutral: true });
    comp.stage = next;
  } else if (comp.stage === "final" && allTiesDone(comp, "final")) {
    finish(w, comp, stageTies(comp, "final")[0]);
  }
}

function finish(w: World, comp: Competition, t: { winner?: string; a: string; b: string }) {
  comp.champion = t.winner;
  comp.runnerUp = t.winner === t.a ? t.b : t.a;
  comp.stage = "done";
  comp.done = true;
  awardWorldComp(w, comp);
  const c = w.clubs[t.winner!];
  if (comp.id === "cwc") awardPrize(w, c.id, 250_000_000);
  worldNews(w, `🏆 ${c.name} conquista a ${comp.name} ${comp.label ?? comp.season}!`, `${c.full} vence ${w.clubs[comp.runnerUp!]?.name ?? ""} na final.`, { force: true, clubId: c.id });
}

// ---------------------------------------------------------------- Mundial de Clubes
export function cwcDays(y: number) {
  const june = intlWindows(y).find((x) => x.k === 21);
  const d0 = onOrAfter(y, y, 5, 15, 2);
  const start = june && june.end >= d0 ? onOrAfter(y, y, 0, 1 + june.end + 1, 2) : d0;
  return { md: [start, start + 3, start + 7], r16: start + 10, qf: start + 14, sf: start + 17, final: start + 21 };
}

/** Participantes: campeões recentes primeiro, depois os mais fortes, por confederação. */
export function cwcEntrants(w: World, y: number): string[] {
  const clubs = Object.values(w.clubs).filter((c) => !c.minor);
  const confedOf = (c: Club) => (c.league ? w.wl?.leagues[c.league]?.confed : c.country === "BRA" || c.div === "F" ? "CONMEBOL" : undefined);
  const won = (c: Club, comp: string) => c.trophies.some((t) => t.comp === comp && t.season >= y - 4);
  const out: string[] = [];
  const quota: [string, number, string][] = [["UEFA", 12, "ucl"], ["CONMEBOL", 6, "liberta"], ["AFC", 4, "acle"], ["CONCACAF", 4, ""]];
  for (const [confed, n, comp] of quota) {
    const pool = clubs.filter((c) => confedOf(c) === confed && (confed !== "CONMEBOL" || c.div === "A" || c.league || c.div === "F"));
    pool.sort((a, b) => Number(won(b, comp)) - Number(won(a, comp)) || power(b) - power(a) || a.id.localeCompare(b.id));
    // no máximo 2 por país (exceto campeões)
    const per: Record<string, number> = {};
    for (const c of pool) {
      if (out.length >= 32 || out.filter((id) => confedOf(w.clubs[id]) === confed).length >= n) break;
      if ((per[c.country] ?? 0) >= 2 && !won(c, comp)) continue;
      per[c.country] = (per[c.country] ?? 0) + 1;
      out.push(c.id);
    }
  }
  const rest = clubs.filter((c) => !out.includes(c.id) && (c.league || c.div === "A")).sort((a, b) => power(b) - power(a) || a.id.localeCompare(b.id));
  while (out.length < 32 && rest.length) out.push(rest.shift()!.id);
  return out.slice(0, 32);
}

export function createClubWorldCup(w: World) {
  const y = w.season;
  if (!w.wl || !isClubWorldCupYear(y) || y < w.wl.startYear) return;
  const teams = cwcEntrants(w, y);
  if (teams.length < 16) return;
  const n = Math.floor(teams.length / 4);
  const comp = newComp(w, "cwc", "groups", teams.slice(0, n * 4));
  Object.assign(comp, { lite: true, label: String(y), region: "FIFA" });
  const sorted = comp.teams.slice().sort((a, b) => power(w.clubs[b]) - power(w.clubs[a]));
  const pots = [0, 1, 2, 3].map((i) => shuffle(sorted.slice(i * n, (i + 1) * n)));
  const groups: string[][] = Array.from({ length: n }, () => []);
  for (const pot of pots) pot.forEach((t, i) => groups[i].push(t));
  comp.groups = groups.map((g, i) => ({ name: `Grupo ${"ABCDEFGH"[i]}`, teams: g, table: g.map(newRow) }));
  w.comps.cwc = comp;
  const d = cwcDays(y);
  comp.groups.forEach((g, gi) => {
    const rr: [string, string][][] = [[[g.teams[0], g.teams[3]], [g.teams[1], g.teams[2]]], [[g.teams[0], g.teams[2]], [g.teams[3], g.teams[1]]], [[g.teams[0], g.teams[1]], [g.teams[2], g.teams[3]]]];
    rr.forEach((pairs, ri) => { for (const [home, away] of pairs) addFixture(w, { comp: "cwc", stage: "group", round: ri + 1, day: d.md[ri], home, away, group: gi, neutral: true }); });
  });
  worldNews(w, `Mundial de Clubes ${y}: grupos sorteados`, `${comp.teams.length} clubes disputam o título em junho e julho.`, { force: comp.teams.includes(w.userClubId) });
}

function progressCwc(w: World, comp: Competition) {
  const d = cwcDays(comp.season);
  if (comp.stage === "group" && stageDone(w, comp, "group")) {
    const t = comp.groups.map((g) => sortTable(g.table).map((r) => r.club));
    // 1º de um grupo x 2º do grupo vizinho
    for (let i = 0; i < t.length; i += 2) {
      createTie(w, comp, "r16", t[i][0], t[i + 1][1], 1, [d.r16], { neutral: true });
      createTie(w, comp, "r16", t[i + 1][0], t[i][1], 1, [d.r16], { neutral: true });
    }
    comp.stage = "r16";
  } else if (["r16", "qf", "sf"].includes(comp.stage) && allTiesDone(comp, comp.stage)) {
    const ws = winners(comp, comp.stage);
    const next = comp.stage === "r16" ? "qf" : comp.stage === "qf" ? "sf" : "final";
    for (let k = 0; k + 1 < ws.length; k += 2) createTie(w, comp, next, ws[k], ws[k + 1], 1, [d[next]], { neutral: true });
    comp.stage = next;
  } else if (comp.stage === "final" && allTiesDone(comp, "final")) {
    finish(w, comp, stageTies(comp, "final")[0]);
  }
}

// ---------------------------------------------------------------- Intercontinental
export const intercontinentalDay = (y: number) => thursday(y, 45);

/** Três semanas antes do jogo: cria a Intercontinental com os campeões da Libertadores e da Champions. */
export function maybeCreateIntercontinental(w: World) {
  const day = intercontinentalDay(w.season);
  if (!w.wl || w.day !== day - 21 || w.comps.intercontinental) return;
  const sa = w.comps.liberta?.champion;
  const eu = w.wl.lastUcl;
  if (!sa || !eu || !w.clubs[sa] || !w.clubs[eu] || sa === eu) return;
  const comp = newComp(w, "intercontinental", "cup", [sa, eu]);
  Object.assign(comp, { lite: true, label: String(w.season), region: "FIFA", stage: "final" });
  w.comps.intercontinental = comp;
  createTie(w, comp, "final", eu, sa, 1, [day], { neutral: true });
  worldNews(w, `Copa Intercontinental: ${w.clubs[sa].name} x ${w.clubs[eu].name}`, `O campeão da Libertadores enfrenta o campeão europeu em ${dayLabel(w, day)}.`, { force: true });
}
const dayLabel = (w: World, d: number) => new Date(Date.UTC(w.season, 0, 1 + d)).toLocaleDateString("pt-BR", { timeZone: "UTC" });

function progressIntercontinental(w: World, comp: Competition) {
  if (comp.stage === "final" && allTiesDone(comp, "final")) finish(w, comp, stageTies(comp, "final")[0]);
}

progressHooks.push((w, comp) => {
  if (comp.id === "acle") progressAcle(w, comp);
  else if (comp.id === "cwc") progressCwc(w, comp);
  else if (comp.id === "intercontinental") progressIntercontinental(w, comp);
  else return false;
  return true;
});

