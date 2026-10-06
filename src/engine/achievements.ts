// Conquistas do treinador: verificadas depois de cada jogo do usuário e no fim da temporada.
// Nada aqui usa o gerador aleatório — as conquistas não mudam o rumo do jogo.
import { clubStrength } from "./lineup";
import { age } from "./player";
import type { AchCounters, AchState, Fixture, MatchResult, World } from "./types";

export type AchCategory = "jogo" | "sequencia" | "temporada" | "carreira";

export interface AchDef {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  cat: AchCategory;
}

export const ACHIEVEMENTS: AchDef[] = [
  // jogos
  { id: "first_win", emoji: "✅", name: "Primeira vitória", desc: "Vença seu primeiro jogo como técnico.", cat: "jogo" },
  { id: "goleada", emoji: "🍫", name: "Chocolate", desc: "Vença por 5 ou mais gols de diferença.", cat: "jogo" },
  { id: "hattrick", emoji: "🎩", name: "Três na mesma partida", desc: "Um jogador seu marca 3 gols na mesma partida.", cat: "jogo" },
  { id: "comeback", emoji: "🔄", name: "Virada histórica", desc: "Vença um jogo em que esteve perdendo por 2 gols.", cat: "jogo" },
  { id: "classico", emoji: "⚔️", name: "Dono do clássico", desc: "Vença um clássico.", cat: "jogo" },
  { id: "classico_5", emoji: "🗡️", name: "Freguês", desc: "Vença 5 clássicos.", cat: "jogo" },
  { id: "giant_killer", emoji: "🪨", name: "Matador de gigantes", desc: "Vença um adversário muito mais forte.", cat: "jogo" },
  { id: "academy_debut", emoji: "🌱", name: "Cria da casa", desc: "Coloque um garoto da base (até 18 anos) em campo.", cat: "jogo" },
  { id: "legend_signed", emoji: "⭐", name: "Lenda renascida", desc: "Tenha uma lenda renascida no seu elenco.", cat: "jogo" },
  { id: "clean_sheet", emoji: "🧤", name: "Portão fechado", desc: "Termine um jogo sem sofrer gols.", cat: "jogo" },
  // sequências
  { id: "win_streak_5", emoji: "🔥", name: "Embalado", desc: "Vença 5 jogos seguidos.", cat: "sequencia" },
  { id: "win_streak_10", emoji: "🚀", name: "Máquina", desc: "Vença 10 jogos seguidos.", cat: "sequencia" },
  { id: "unbeaten_10", emoji: "🛡️", name: "Invicto", desc: "Fique 10 jogos sem perder.", cat: "sequencia" },
  { id: "unbeaten_20", emoji: "🏰", name: "Inabalável", desc: "Fique 20 jogos sem perder.", cat: "sequencia" },
  { id: "wall_5", emoji: "🧱", name: "Muralha", desc: "5 jogos seguidos sem sofrer gols.", cat: "sequencia" },
  // carreira
  { id: "games_100", emoji: "💯", name: "Centenário", desc: "Comande 100 jogos.", cat: "carreira" },
  { id: "wins_50", emoji: "🥉", name: "50 vitórias", desc: "Some 50 vitórias na carreira.", cat: "carreira" },
  { id: "wins_100", emoji: "🥇", name: "100 vitórias", desc: "Some 100 vitórias na carreira.", cat: "carreira" },
  { id: "seasons_5", emoji: "🕰️", name: "Identificação", desc: "Complete 5 temporadas no mesmo clube.", cat: "carreira" },
  { id: "seasons_10", emoji: "🗿", name: "Ídolo eterno", desc: "Complete 10 temporadas no mesmo clube.", cat: "carreira" },
  { id: "job_change", emoji: "🧳", name: "Novos ares", desc: "Assuma o comando de outro clube.", cat: "carreira" },
  { id: "rep_80", emoji: "🎖️", name: "Professor renomado", desc: "Chegue a 80 de reputação como técnico.", cat: "carreira" },
  { id: "scenario_win", emoji: "🎯", name: "Desafio vencido", desc: "Vença um cenário de desafio.", cat: "carreira" },
  // temporada
  { id: "title_any", emoji: "🏆", name: "Primeira taça", desc: "Conquiste um título.", cat: "temporada" },
  { id: "title_serieA", emoji: "🇧🇷", name: "Campeão brasileiro", desc: "Vença a Série A.", cat: "temporada" },
  { id: "title_copaBR", emoji: "🏅", name: "Rei de copas", desc: "Vença a Copa do Brasil.", cat: "temporada" },
  { id: "title_liberta", emoji: "🌎", name: "Glória eterna", desc: "Vença a Libertadores.", cat: "temporada" },
  { id: "title_sula", emoji: "🌊", name: "Sul-Americano", desc: "Vença a Sul-Americana.", cat: "temporada" },
  { id: "double", emoji: "✌️", name: "Dobradinha", desc: "Ganhe 2 títulos na mesma temporada.", cat: "temporada" },
  { id: "treble", emoji: "👑", name: "Tríplice coroa", desc: "Ganhe 3 títulos na mesma temporada.", cat: "temporada" },
  { id: "promotion", emoji: "📈", name: "Acesso!", desc: "Suba de divisão.", cat: "temporada" },
  { id: "invincible", emoji: "💎", name: "Campanha invicta", desc: "Termine o campeonato nacional sem derrotas.", cat: "temporada" },
  { id: "survival", emoji: "🩹", name: "Sobrevivente", desc: "Escape do rebaixamento da Série A por até 2 posições.", cat: "temporada" },
  { id: "top_scorer", emoji: "👟", name: "Artilheiro da casa", desc: "Tenha o artilheiro do seu campeonato.", cat: "temporada" },
];

export const ACH_BY_ID: Record<string, AchDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Clássicos (pares de ids). Clubes da mesma cidade também contam (ver isClassico). */
const CLASSICOS: [string, string][] = [
  ["flamengo", "fluminense"], ["flamengo", "vasco"], ["flamengo", "botafogo"], ["fluminense", "vasco"], ["fluminense", "botafogo"], ["vasco", "botafogo"],
  ["palmeiras", "corinthians"], ["palmeiras", "sao-paulo"], ["palmeiras", "santos"], ["corinthians", "sao-paulo"], ["corinthians", "santos"], ["sao-paulo", "santos"],
  ["gremio", "internacional"], ["atletico-mg", "cruzeiro"], ["bahia", "vitoria"], ["athletico-pr", "coritiba"],
  ["sport", "nautico"], ["sport", "santa-cruz"], ["ceara", "fortaleza"], ["remo", "paysandu"], ["goias", "vila-nova"],
  ["boca-juniors", "river-plate"], ["flamengo", "corinthians"], ["flamengo", "palmeiras"],
];

export function isClassico(w: World, a: string, b: string): boolean {
  if (CLASSICOS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return true;
  const ca = w.clubs[a], cb = w.clubs[b];
  return !!ca && !!cb && ca.country === "BRA" && ca.city === cb.city && ca.rep >= 55 && cb.rep >= 55;
}

const emptyCounters = (): AchCounters => ({ games: 0, w: 0, d: 0, l: 0, ws: 0, unb: 0, cs: 0, cw: 0 });

export function ensureAch(w: World): AchState {
  w.ach ??= { got: {}, c: emptyCounters(), toasts: [] };
  w.ach.got ??= {};
  w.ach.c ??= emptyCounters();
  w.ach.toasts ??= [];
  return w.ach;
}

/** Desbloqueia uma conquista (uma vez só). Devolve true se for nova. */
export function unlock(w: World, id: string): boolean {
  const a = ensureAch(w);
  if (a.got[id] || !ACH_BY_ID[id]) return false;
  a.got[id] = { season: w.season, day: w.day, clubId: w.userClubId };
  const def = ACH_BY_ID[id];
  a.toasts.push(`${def.emoji} Conquista: ${def.name}`);
  if (a.toasts.length > 10) a.toasts.splice(0, a.toasts.length - 10);
  return true;
}

export function achCount(w: World): number {
  return Object.keys(w.ach?.got ?? {}).length;
}

/** Placar mais adverso (perdendo por quanto) ao longo do jogo, do ponto de vista do lado `side`. */
function worstDeficit(r: MatchResult, side: 0 | 1): number {
  let us = 0, them = 0, worst = 0;
  const goals = r.events.filter((e) => e.type === "goal" || e.type === "pen-goal" || e.type === "owngoal").sort((a, b) => a.min - b.min);
  for (const e of goals) {
    if (e.side === side) us++;
    else if (e.side != null) them++;
    worst = Math.max(worst, them - us);
  }
  return worst;
}

/** Chamado depois de cada jogo do usuário (game.ts → applyResult). */
export function achievementsAfterMatch(w: World, f: Fixture, r: MatchResult, side: 0 | 1, oppStrength?: number) {
  const a = ensureAch(w);
  const c = a.c;
  const us = side === 0 ? r.hg : r.ag;
  const them = side === 0 ? r.ag : r.hg;
  // pênaltis decidem quem avança, mas o jogo conta como empate
  const won = us > them, lost = us < them;
  c.games++;
  if (won) { c.w++; c.ws++; c.unb++; }
  else if (lost) { c.l++; c.ws = 0; c.unb = 0; }
  else { c.d++; c.ws = 0; c.unb++; }
  c.cs = them === 0 ? c.cs + 1 : 0;
  const oppId = side === 0 ? f.away : f.home;
  const opp = w.clubs[oppId];
  if (won && us - them > (c.bigWin?.gd ?? 0)) {
    c.bigWin = { gd: us - them, text: `${w.clubs[w.userClubId]?.name ?? ""} ${us} x ${them} ${opp?.name ?? ""}`, season: w.season };
  }

  if (won) unlock(w, "first_win");
  if (won && us - them >= 5) unlock(w, "goleada");
  if (them === 0) unlock(w, "clean_sheet");
  if (won && worstDeficit(r, side) >= 2) unlock(w, "comeback");
  if (won && isClassico(w, f.home, f.away)) {
    c.cw++;
    unlock(w, "classico");
    if (c.cw >= 5) unlock(w, "classico_5");
  }
  if (won && opp) {
    const mine = clubStrength(w, w.clubs[w.userClubId]);
    const theirs = oppStrength ?? clubStrength(w, opp);
    const divGap = "ABCD".indexOf(w.clubs[w.userClubId].div) - "ABCD".indexOf(opp.div);
    if (theirs >= mine + 6 || (divGap >= 2 && opp.div !== "F")) unlock(w, "giant_killer");
  }
  const goals: Record<number, number> = {};
  for (const e of r.events) {
    if ((e.type === "goal" || e.type === "pen-goal") && e.side === side && e.pid != null) goals[e.pid] = (goals[e.pid] ?? 0) + 1;
  }
  if (Object.values(goals).some((g) => g >= 3)) unlock(w, "hattrick");
  for (const id of r.lineups[side]) {
    const p = w.players[id];
    if (p && p.clubId === w.userClubId && age(p, w.season) <= 18) { unlock(w, "academy_debut"); break; }
  }
  if (w.clubs[w.userClubId]?.players.some((id) => w.players[id]?.legend)) unlock(w, "legend_signed");

  if (c.ws >= 5) unlock(w, "win_streak_5");
  if (c.ws >= 10) unlock(w, "win_streak_10");
  if (c.unb >= 10) unlock(w, "unbeaten_10");
  if (c.unb >= 20) unlock(w, "unbeaten_20");
  if (c.cs >= 5) unlock(w, "wall_5");
  if (c.games >= 100) unlock(w, "games_100");
  if (c.w >= 50) unlock(w, "wins_50");
  if (c.w >= 100) unlock(w, "wins_100");
}

export interface SeasonAchInput {
  titles: string[];
  promoted: boolean;
  div: string;
  pos: number | null;
  leagueLosses: number | null;
  topScorerOurs: boolean;
}

/** Chamado no fim da temporada (season.ts → endSeason). */
export function achievementsSeasonEnd(w: World, s: SeasonAchInput) {
  ensureAch(w);
  if (s.titles.length) unlock(w, "title_any");
  for (const t of s.titles) unlock(w, `title_${t}`);
  if (s.titles.length >= 2) unlock(w, "double");
  if (s.titles.length >= 3) unlock(w, "treble");
  if (s.promoted) unlock(w, "promotion");
  if (s.leagueLosses === 0) unlock(w, "invincible");
  if (s.div === "A" && s.pos != null && s.pos >= 15 && s.pos <= 16) unlock(w, "survival");
  if (s.topScorerOurs) unlock(w, "top_scorer");
  // temporadas seguidas no clube atual (inclui a que acabou)
  let streak = 0;
  for (let i = w.managerHistory.length - 1; i >= 0; i--) {
    if (w.managerHistory[i].clubId !== w.userClubId) break;
    streak++;
  }
  if (streak >= 5) unlock(w, "seasons_5");
  if (streak >= 10) unlock(w, "seasons_10");
}

/** Interface: tira o próximo aviso pendente. */
export function popToast(w: World): string | undefined {
  return w.ach?.toasts.shift();
}
