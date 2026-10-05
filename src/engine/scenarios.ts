// Cenários de desafio: mundos modificados a partir de createWorld (world.ts), com condições
// de vitória e derrota checadas depois de cada jogo do usuário e no fim da temporada.
import { ensureAch, unlock } from "./achievements";
import { managerChanged } from "./dressing";
import { advance, finishUserMatch, loadRng, saveRng } from "./game";
import { simulateFixture } from "./match";
import { addNews } from "./news";
import { getRngState, setRngState } from "./rng";
import { initialEntrants, setBoardObjective, startSeason } from "./season";
import { staffOnClubChange } from "./staff";
import { tablePosition } from "./competitions";
import type { Club, Competition, ScenarioStatus, World } from "./types";
import { createWorld, type Database } from "./world";

export interface ScenarioDef {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  goal: string;
  difficulty: 1 | 2 | 3;
  /** Prepara o mundo e devolve o clube do usuário. */
  setup: (w: World) => string;
  /** Checado depois de cada jogo: null = segue o jogo. */
  check?: (w: World, club: string) => ScenarioStatus | null;
  /** Checado no fim da temporada (antes dos acessos serem aplicados). */
  end?: (w: World, club: string) => ScenarioStatus;
}

// ---------------------------------------------------------------- utilidades
const braOf = (w: World, div: Club["div"]) => Object.values(w.clubs).filter((c) => c.div === div && c.country === "BRA");
const byLevel = (cs: Club[]) => cs.slice().sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));

/** O clube ainda está vivo na copa? (campeão, ou sem eliminação até agora) */
export function aliveIn(comp: Competition | undefined, club: string): boolean {
  if (!comp || !comp.teams.includes(club)) return false;
  if (comp.done) return comp.champion === club;
  if (comp.ties.some((t) => (t.a === club || t.b === club) && t.winner && t.winner !== club)) return false;
  if (comp.format === "groups" && comp.stage !== "group") return comp.ties.some((t) => t.a === club || t.b === club);
  return true;
}

export function reachedStage(comp: Competition | undefined, club: string, stage: string): boolean {
  return !!comp?.ties.some((t) => t.stage === stage && (t.a === club || t.b === club));
}

function leagueRemaining(w: World, comp: string, club: string): number {
  return w.fixtures.filter((f) => f.comp === comp && f.stage === "league" && !f.result && (f.home === club || f.away === club)).length;
}

/** Joga automaticamente (como se o usuário só apertasse "simular") até a condição valer. */
export function autoPlay(w: World, stop: () => boolean, maxSteps = 600) {
  for (let i = 0; i < maxSteps && !stop(); i++) {
    const r = advance(w);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    } else break;
  }
}

/** Troca o clube do usuário sem notícias de demissão (usado na montagem dos cenários). */
function takeClub(w: World, id: string) {
  w.userClubId = id;
  w.pendingMatch = undefined;
  setBoardObjective(w);
  staffOnClubChange(w);
  managerChanged(w);
}

function restartSeason(w: World) {
  w.fixtures = [];
  w.comps = {};
  startSeason(w, initialEntrants(w));
}

// ---------------------------------------------------------------- cenários
export const SCENARIOS: ScenarioDef[] = [
  {
    id: "salvar",
    emoji: "🆘",
    title: "Salve o clube do rebaixamento em 10 jogos",
    desc: "Faltam 10 rodadas para o fim da Série A e o time está na zona de rebaixamento. A diretoria demitiu o técnico e chamou você.",
    goal: "Terminar a Série A fora do Z4 (até 16º).",
    difficulty: 2,
    setup: (w) => {
      autoPlay(w, () => leagueRemaining(w, "serieA", w.userClubId) <= 10);
      const table = w.comps.serieA.table.slice().sort((a, b) => b.pts - a.pts || b.w - a.w || (b.gf - b.ga) - (a.gf - a.ga));
      return table[17]?.club ?? table[table.length - 1].club;
    },
    check: (w, club) => {
      if (leagueRemaining(w, "serieA", club) > 0) return null;
      return (tablePosition(w.comps.serieA, club) ?? 99) <= 16 ? "won" : "lost";
    },
    end: (w, club) => ((tablePosition(w.comps.serieA, club) ?? 99) <= 16 ? "won" : "lost"),
  },
  {
    id: "acesso-c",
    emoji: "🪜",
    title: "Leve um time da Série C ao acesso",
    desc: "Um dos elencos mais modestos da terceira divisão sonha com a Série B. Faça o milagre em uma temporada.",
    goal: "Conquistar o acesso à Série B.",
    difficulty: 2,
    setup: (w) => byLevel(braOf(w, "C"))[3]?.id ?? byLevel(braOf(w, "C"))[0].id,
    check: (w, club) => ((w.comps.serieC?.promoted ?? []).includes(club) ? "won" : null),
    end: (w, club) => ((w.comps.serieC?.promoted ?? []).includes(club) ? "won" : "lost"),
  },
  {
    id: "liberta-zero",
    emoji: "🌎",
    title: "Ganhe a Libertadores com orçamento zero",
    desc: "O cofre está vazio: nenhum real para reforços. Só o elenco atual e a sua prancheta.",
    goal: "Ser campeão da Libertadores. Eliminação = derrota.",
    difficulty: 3,
    setup: (w) => {
      const br = (w.comps.liberta?.teams ?? []).map((id) => w.clubs[id]).filter((c) => c?.country === "BRA");
      const club = byLevel(br)[0] ?? byLevel(braOf(w, "A"))[10];
      club.balance = 0;
      return club.id;
    },
    check: (w, club) => {
      const lib = w.comps.liberta;
      if (lib?.champion === club) return "won";
      return aliveIn(lib, club) ? null : "lost";
    },
    end: (w, club) => (w.comps.liberta?.champion === club ? "won" : "lost"),
  },
  {
    id: "gigante",
    emoji: "🦁",
    title: "Devolva o gigante à elite",
    desc: "Um dos maiores clubes do país caiu para a Série B. A torcida exige o acesso imediato.",
    goal: "Subir para a Série A em uma temporada.",
    difficulty: 1,
    setup: (w) => {
      const giant = ["corinthians", "vasco", "gremio", "cruzeiro", "santos"].map((id) => w.clubs[id]).find((c) => c?.div === "A")
        ?? braOf(w, "A").sort((a, b) => b.rep - a.rep)[5];
      const swap = byLevel(braOf(w, "B")).pop()!;
      giant.div = "B";
      swap.div = "A";
      restartSeason(w);
      return giant.id;
    },
    check: (w, club) => ((w.comps.serieB?.promoted ?? []).includes(club) ? "won" : null),
    end: (w, club) => ((w.comps.serieB?.promoted ?? []).includes(club) ? "won" : "lost"),
  },
  {
    id: "invicto",
    emoji: "💎",
    title: "Turno invicto",
    desc: "Com o elenco mais forte do país, a cobrança é total: não pode perder no Brasileirão.",
    goal: "Fazer 19 jogos da Série A sem derrota. Uma derrota no campeonato = fim.",
    difficulty: 3,
    setup: (w) => byLevel(braOf(w, "A")).pop()!.id,
    check: (w, club) => {
      const row = w.comps.serieA?.table.find((r) => r.club === club);
      if (!row) return null;
      if (row.l > 0) return "lost";
      return row.p >= 19 ? "won" : null;
    },
    end: (w, club) => {
      const row = w.comps.serieA?.table.find((r) => r.club === club);
      return row && row.l === 0 && row.p >= 19 ? "won" : "lost";
    },
  },
  {
    id: "crise",
    emoji: "📉",
    title: "Clube quebrado",
    desc: "Dívida enorme, salários atrasando e torcida protestando. Equilibre as contas sem cair.",
    goal: "Terminar a temporada com saldo positivo e fora do rebaixamento da Série A.",
    difficulty: 2,
    setup: (w) => {
      const club = byLevel(braOf(w, "A"))[8];
      club.balance = -Math.round(club.balance * 0.6 + 15_000_000);
      return club.id;
    },
    end: (w, club) => (w.clubs[club].balance >= 0 && (tablePosition(w.comps.serieA, club) ?? 99) <= 16 ? "won" : "lost"),
  },
  {
    id: "zebra",
    emoji: "🦓",
    title: "A zebra da Copa do Brasil",
    desc: "Um nanico da Série C contra os gigantes do país, em jogos de mata-mata.",
    goal: "Chegar às quartas de final da Copa do Brasil.",
    difficulty: 2,
    setup: (w) => byLevel(braOf(w, "C"))[1]?.id ?? byLevel(braOf(w, "C"))[0].id,
    check: (w, club) => {
      const copa = w.comps.copaBR;
      if (reachedStage(copa, club, "qf") || copa?.champion === club) return "won";
      return aliveIn(copa, club) ? null : "lost";
    },
    end: (w, club) => (reachedStage(w.comps.copaBR, club, "qf") ? "won" : "lost"),
  },
];

export const SCENARIO_BY_ID: Record<string, ScenarioDef> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

/** Monta o mundo de um cenário. Determinístico para a mesma semente. */
export function createScenarioWorld(db: Database, id: string, opts: { managerName: string; seed?: number }): World {
  const def = SCENARIO_BY_ID[id];
  if (!def) throw new Error(`cenário desconhecido: ${id}`);
  const start = db.clubs.find((c) => c.div === "A")!.id;
  const w = createWorld(db, { managerName: opts.managerName, clubId: start, seed: opts.seed, settings: { casual: true } });
  setRngState(w.rng);
  const clubId = def.setup(w);
  setRngState(w.rng);
  takeClub(w, clubId);
  w.rng = getRngState();
  // a montagem (jogos automáticos) não conta para a carreira
  w.ach = undefined;
  w.career = undefined;
  w.clubLog = undefined;
  w.news = [];
  w.scenario = { id, clubId, season: w.season, status: "active" };
  const club = w.clubs[clubId];
  addNews(w, "info", `${def.emoji} Desafio: ${def.title}`, `${def.desc}\n\nObjetivo: ${def.goal}\n\nVocê assume o ${club.full}. Boa sorte, ${w.managerName}!`, );
  return w;
}

function finish(w: World, status: ScenarioStatus): string {
  const sc = w.scenario!;
  const def = SCENARIO_BY_ID[sc.id];
  sc.status = status;
  const msg = status === "won" ? `🎯 Desafio vencido: ${def.title}!` : `❌ Desafio perdido: ${def.title}.`;
  sc.note = msg;
  addNews(w, "season", msg, status === "won" ? "Missão cumprida. Você pode continuar jogando esta carreira normalmente." : "Não deu desta vez. Você pode continuar jogando ou tentar de novo no menu inicial.");
  ensureAch(w).toasts.push(msg);
  if (status === "won") unlock(w, "scenario_win");
  return msg;
}

/** Depois de cada jogo do usuário (game.ts). */
export function checkScenario(w: World): string | null {
  const sc = w.scenario;
  if (!sc || sc.status !== "active") return null;
  const def = SCENARIO_BY_ID[sc.id];
  const st = def?.check?.(w, sc.clubId) ?? null;
  return st ? finish(w, st) : null;
}

/** Fim de temporada (season.ts): decide os cenários que ainda estão em aberto. */
export function scenarioSeasonEnd(w: World): string[] {
  const sc = w.scenario;
  if (!sc || sc.status !== "active") return [];
  const def = SCENARIO_BY_ID[sc.id];
  if (!def) return [];
  const st = def.end ? def.end(w, sc.clubId) : def.check?.(w, sc.clubId) ?? "lost";
  return [finish(w, st)];
}
