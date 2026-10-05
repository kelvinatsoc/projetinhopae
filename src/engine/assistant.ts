// Auxiliar técnico: análise do adversário, sugestões de tática e dicas ao vivo.
//
// Como as regras foram calibradas (Monte Carlo com o próprio MatchSim, mundo com semente fixa,
// 24 confrontos reais da Série A — diferença de força de −17 a +17 — em casa e fora; ~1,3 milhão de jogos):
//
//  • Mentalidade (base: Equilibrada, pontos por jogo). Cada passo dá +4% no ataque e −3% na defesa,
//    mas também abre o jogo (+6% de finalizações nossas, +3% deles). Na conta final, atacar quase sempre
//    rende mais: "Tudo ao ataque" foi a melhor opção em todos os jogos parelhos ou a favor
//    (+0,15 a +0,30 ponto/jogo, ex.: Bahia x Santos em casa 1,55 → 1,78; Palmeiras fora vs. Mirassol 2,02 → 2,32).
//    Só quando o rival é bem mais forte, já contando o mando (≈ −5 de força ou pior, tipicamente fora),
//    a "Retranca" passa a ser a melhor (Ceará fora vs. Flamengo 0,08 → 0,14; Vitória fora vs. Corinthians 0,32 → 0,40).
//    Entre um e outro (≈ −3 a −5) tanto faz. As opções ±1 quase nunca são as melhores.
//  • Marcação: pressão alta ganha +2,5% de meio-campo (posse) e cansa 15% mais. Dentro do jogo ela
//    empata ou ganha por pouco (+0,00 a +0,05); o custo real é chegar cansado no jogo seguinte, então
//    sugerimos marcação média quando há jogo em até 3 dias ou o elenco está abaixo de 80% de condição.
//  • Formação: a força do setor é média × (peso do setor / base)^0,3 — formações com mais gente num setor
//    reforçam aquele setor. Escolher a formação pelo modelo abaixo errou em média só 0,020 ponto/jogo
//    para a melhor de verdade (melhor overall médio: 0,033; formação padrão da IA: 0,044). Como o modelo
//    supervaloriza um pouco o 4-2-4/4-4-2 (+0,02 a +0,04), só sugerimos trocar de formação com ganho ≥ 0,05.
//  • Modelo analítico (expectedGoals + Poisson) reproduz o Monte Carlo com erro médio de 0,036 ponto/jogo;
//    escolher mentalidade/pressão por ele custou só 0,009 ponto/jogo em relação à melhor opção simulada.
//    Ele subestima ~15% dos gols (o time que perde se abre no fim), mas isso quase não muda V/E/D.
//  • Ao vivo: regras fixas ("perdendo aos 60' → ataque", "vencendo aos 80' → retranca") valem só ±0,05
//    e às vezes atrapalham. Decidir a mentalidade pelo modelo (placar + minutos restantes + cansaço)
//    rendeu +0,10 a +0,28 ponto/jogo conforme a mentalidade de partida. Por isso as dicas ao vivo
//    comparam as opções pelo modelo em vez de seguir uma tabela.
//  • Tudo junto (pré-jogo + seguir as dicas ao vivo) vs. Equilibrada com trocas normais: 1,34 → 1,58 ponto/jogo
//    (+0,24, ≈ 9 pontos num Brasileirão de 38 rodadas). Só o pré-jogo: +0,18; as dicas ao vivo somam +0,07.
//  RED_CARD_FINDING
import { isAvailable, squadOf, validLineup, autoLineup } from "./lineup";
import { MatchSim, TUNING } from "./match";
import { commonFactor, NEUTRAL_SIDE, playerMods, SET_PIECE_GOALS, sideMult } from "./matchmods";
import { FORMATIONS, MENTALITY_NAMES, ovrAt, POS_GROUP, POS_NAME, PRESSING_NAMES } from "./positions";
import { shortName } from "./player";
import { getRngState, hashString, setRngState } from "./rng";
import { aiTalk, suggest, talkCtx, talkEffect } from "./teamtalk";
import { hasTrait } from "./traits";
import type { Club, Fixture, Lineup, Player, Pos, Tactic, World } from "./types";

// ---------------------------------------------------------------- pesos do motor
// Espelham match.ts (lá eles não são exportados). Se o motor mudar, mude aqui também.
const DEF_W: Record<Pos, number> = { GOL: 0, ZAG: 1, LD: 0.8, LE: 0.8, VOL: 0.55, MC: 0.2, MEI: 0.05, PD: 0.05, PE: 0.05, ATA: 0 };
const MID_W: Record<Pos, number> = { GOL: 0, ZAG: 0.05, LD: 0.25, LE: 0.25, VOL: 0.8, MC: 1, MEI: 0.8, PD: 0.4, PE: 0.4, ATA: 0.1 };
const ATT_W: Record<Pos, number> = { GOL: 0, ZAG: 0, LD: 0.15, LE: 0.15, VOL: 0.05, MC: 0.15, MEI: 0.6, PD: 0.9, PE: 0.9, ATA: 1 };
const SHOOT_W: Record<Pos, number> = { GOL: 0, ZAG: 0.12, LD: 0.12, LE: 0.12, VOL: 0.14, MC: 0.28, MEI: 0.5, PD: 0.55, PE: 0.55, ATA: 0.85 };
const BASE = { def: 4.9, mid: 4.4, att: 3.6 };
const MATCH_MINUTES = 96; // 90 + acréscimos médios (2 no 1º tempo, 4 no 2º)

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const slotsOf = (formation: string): Pos[] => (FORMATIONS[formation] ?? FORMATIONS["4-3-3"]).map((s) => s.pos);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number, d = 2) => x.toFixed(d).replace(".", ",");

/** Rendimento do jogador numa posição, como o motor calcula (overall na posição × condição × moral × forma do dia). */
export function effAt(p: Player, pos: Pos, form = 1): number {
  return ovrAt(p, pos) * (0.7 + 0.3 * (p.cond / 100)) * (0.97 + 0.06 * (p.morale / 100)) * form;
}

/** Rendimento de um jogador dentro de uma partida ao vivo (com a forma do dia dele). */
const liveEff = (sim: MatchSim, side: 0 | 1, p: Player, pos: Pos) => effAt(p, pos, sim.pm(sim.sides[side], p.id).eff);

// ---------------------------------------------------------------- modelo analítico
// Reproduz em média as contas de match.ts (posse, chance de finalizar, xG, pênaltis, cansaço)
// para comparar dezenas de táticas na hora, sem simular. Validado contra o Monte Carlo.

export interface Sectors { att: number; mid: number; def: number; gk: number }

export interface SideState {
  s: Sectors; // setores já com cansaço/moral (sem mentalidade, pressão e mando)
  m: number; // mentalidade
  p: number; // pressão
  home: boolean;
  shotQ: number; // média de exp((fin-75)/30) dos finalizadores prováveis
  penFin: number; // finalização do cobrador de pênalti
  fis: number; // físico médio (cansaço)
  cond: number; // condição média dos que estão em campo
  horizon?: number; // se definido, os setores já são a média dos próximos `horizon` minutos (cansaço de cada um)
  // efeitos de gestão (matchmods.ts); neutros quando não há contexto de partida
  penAdj: number; // Batedor de pênalti + treino de bola parada
  penSave: number; // nosso goleiro é Pegador de pênalti
  penAward: number; // dribladores cavam mais pênaltis
  setPiece: number; // bola parada (cabeçadas e faltas)
  fatMul: number; // ritmo de cansaço (Raçudo, foco físico)
}

/** Partida, clube e adversário: liga os efeitos de gestão (forma, jogadas, entrosamento, preleção). */
export interface SideCtx {
  f: Fixture;
  club: Club;
  oppM: number; // mentalidade do adversário
  captain?: number;
  talk?: number; // efeito médio da conversa no período analisado
}

/** Ritmo de perda de condição por minuto (match.ts: a cada 5 minutos). */
const fatigueRate = (fis: number, pressing: number) => 0.26 * (1.25 - (fis / 100) * 0.6) * (1 + 0.15 * (pressing - 1));

/**
 * Estado de um time para o modelo: setores de uma escalação + finalização/pênalti/físico.
 * Com `horizon`, cada jogador entra com a condição média que terá nos próximos minutos
 * (pontas e atacantes, de físico menor, cansam antes — isso pesa em formações como o 4-2-4).
 */
export function sideState(w: World, slots: Pos[], ids: (number | null)[], m: number, p: number, home: boolean, horizon?: number, ctx?: SideCtx): SideState {
  let d = 0, dw = 0, mm = 0, mw = 0, a = 0, aw = 0, gk = 30, count = 0, qs = 0, qw = 0, fis = 0, cond = 0, fat = 0;
  let pen = 50, penPen = false, penAdj = 0, penSave = 0;
  const isUser = !!ctx && ctx.club.id === w.userClubId;
  const sm = ctx ? sideMult(w, ctx.f, ctx.club, slots, ids, ctx.oppM, m, ctx.captain) : NEUTRAL_SIDE;
  ids.forEach((id, k) => {
    if (id == null) return;
    const pl = w.players[id];
    const pos = slots[k];
    if (!pl || !pos) return;
    count++;
    const md = ctx ? playerMods(w, ctx.f, pl, isUser) : null;
    const fm = (md?.fatigue ?? 1) * sm.fatigue;
    const c = horizon ? Math.max(5, pl.cond - fatigueRate(pl.attrs.fis, p) * fm * horizon * 0.5) : pl.cond;
    const eff = ovrAt(pl, pos) * (0.7 + 0.3 * (c / 100)) * (0.97 + 0.06 * (pl.morale / 100)) * (md?.eff ?? 1);
    if (pos === "GOL") { gk = eff; penSave = md?.penSave ?? 0; }
    else {
      // cobrador: o Batedor de pênalti, senão o melhor finalizador (como no motor)
      const isPen = !!md && hasTrait(pl, "PEN");
      if ((isPen && !penPen) || (isPen === penPen && pl.attrs.fin > pen)) { pen = pl.attrs.fin; penPen = isPen; penAdj = md?.pen ?? 0; }
    }
    d += eff * DEF_W[pos]; dw += DEF_W[pos];
    mm += eff * MID_W[pos]; mw += MID_W[pos];
    a += eff * ATT_W[pos]; aw += ATT_W[pos];
    const sw = SHOOT_W[pos] * Math.pow(pl.attrs.fin / 70, 1.5) * (md?.shoot ?? 1);
    qs += sw * Math.exp((pl.attrs.fin - 75) / 30) * (md?.xg ?? 1); qw += sw;
    fis += pl.attrs.fis;
    cond += pl.cond;
    fat += fm;
  });
  const line = (sum: number, wt: number, base: number) => (wt > 0 ? (sum / wt) * Math.pow(wt / base, 0.3) : 30);
  const short = count < 11 ? Math.pow(0.93, 11 - count) : 1;
  const k = commonFactor(sm, ctx?.talk ?? 0);
  return {
    s: {
      att: line(a, aw, BASE.att) * short * sm.att * k,
      mid: line(mm, mw, BASE.mid) * short * sm.mid * k,
      def: line(d, dw, BASE.def) * short * sm.def * k,
      gk: gk * sm.gk + sm.gkPlus,
    },
    m, p, home, shotQ: qw > 0 ? qs / qw : 1, penFin: pen, fis: count ? fis / count : 70, cond: count ? cond / count : 100, horizon,
    penAdj: penAdj + sm.penPlus, penSave, penAward: sm.penAward, setPiece: sm.setPiece, fatMul: count ? fat / count : 1,
  };
}

/** Fator médio de cansaço ao longo de `mins` minutos (o motor tira condição a cada 5 minutos). */
export function fatigueFactor(cond: number, fis: number, pressing: number, mins: number): number {
  const avgCond = Math.max(5, cond - fatigueRate(fis, pressing) * mins * 0.5);
  return (0.7 + 0.3 * (avgCond / 100)) / (0.7 + 0.3 * (cond / 100));
}

function withMods(x: SideState, fatigue: number): Sectors {
  const h = x.home ? 1 : 0;
  return {
    def: x.s.def * fatigue * (1 - 0.03 * x.m) * (1 + 0.03 * h),
    mid: x.s.mid * fatigue * (1 + 0.025 * (x.p - 1)) * (1 + 0.03 * h),
    att: x.s.att * fatigue * (1 + 0.04 * x.m) * (1 + 0.07 * h),
    gk: x.s.gk * fatigue,
  };
}

/** Gols esperados de cada lado em `mins` minutos. */
export function expectedGoals(a: SideState, b: SideState, mins: number): [number, number] {
  const A = withMods(a, a.horizon ? 1 : fatigueFactor(a.cond, a.fis, a.p, mins * a.fatMul));
  const B = withMods(b, b.horizon ? 1 : fatigueFactor(b.cond, b.fis, b.p, mins * b.fatMul));
  const pmA = Math.pow(A.mid, 3), pmB = Math.pow(B.mid, 3);
  const shareA = pmA / (pmA + pmB);
  const lam = (S: Sectors, O: Sectors, x: SideState, y: SideState, share: number) => {
    const ratio = S.att / Math.max(20, O.def);
    const pShot = TUNING.shotBase * Math.pow(ratio, TUNING.shotExp) * (1 + 0.06 * x.m + 0.03 * y.m);
    const xg = clampN(TUNING.xgBase * 1.163 * x.shotQ * Math.exp((S.att - O.def) / TUNING.xgAttDiv), 0.02, 0.6);
    const pGoal = clampN(xg * (1 + (70 - O.gk) / 50), 0.01, 0.75) * 0.97;
    const conv = clampN(0.74 + (x.penFin - 70) / 200 + x.penAdj - y.penSave - (O.gk - 70) / 250, 0.45, 0.95);
    // bola parada (cabeçadas de escanteio e faltas diretas): uns poucos gols a mais por jogo
    const setPiece = (SET_PIECE_GOALS * x.setPiece * (1 + (70 - O.gk) / 50) * mins) / MATCH_MINUTES;
    return mins * share * (Math.min(1, pShot) * pGoal + TUNING.penBase * ratio * x.penAward * conv) + setPiece;
  };
  return [lam(A, B, a, b, shareA), lam(B, A, b, a, 1 - shareA)];
}

const poissonCache = new Map<number, number[]>();
function poisson(l: number, max = 10): number[] {
  const key = Math.round(l * 1000);
  const hit = poissonCache.get(key);
  if (hit) return hit;
  const out: number[] = [];
  let p = Math.exp(-l);
  for (let k = 0; k <= max; k++) {
    out.push(p);
    p *= l / (k + 1);
  }
  if (poissonCache.size > 4000) poissonCache.clear();
  poissonCache.set(key, out);
  return out;
}

export interface Outlook { win: number; draw: number; loss: number; pts: number }

/** Probabilidades de V/E/D a partir dos gols esperados e do placar atual (diff = nós − eles). */
export function resultProbs(lUs: number, lThem: number, diff = 0): Outlook {
  const pu = poisson(lUs), pt = poisson(lThem);
  let win = 0, draw = 0, loss = 0;
  for (let a = 0; a < pu.length; a++) for (let b = 0; b < pt.length; b++) {
    const p = pu[a] * pt[b];
    const d = diff + a - b;
    if (d > 0) win += p;
    else if (d === 0) draw += p;
    else loss += p;
  }
  const tot = win + draw + loss || 1;
  win /= tot; draw /= tot; loss /= tot;
  return { win, draw, loss, pts: 3 * win + draw };
}

// ---------------------------------------------------------------- IA do adversário
/** Média de overall na posição de uma escalação numa formação (como lineupStrength, mas com formação explícita). */
export function strengthWith(w: World, formation: string, lineup: Lineup): number {
  const slots = slotsOf(formation);
  let s = 0;
  lineup.starters.forEach((id, i) => {
    if (id != null && w.players[id] && slots[i]) s += ovrAt(w.players[id], slots[i]);
  });
  return s / 11;
}

/** Reproduz aiTactics (match.ts) sem mexer no clube: mentalidade/pressão que a IA vai usar contra nós. */
export function predictAiTactic(w: World, ai: Club, user: Club, userFormation: string, aiHome: boolean): { mentality: number; pressing: number; diff: number } {
  const mine = strengthWith(w, ai.tactic.formation, autoLineup(w, ai, undefined, ai.tactic.formation, false));
  const theirs = strengthWith(w, userFormation, autoLineup(w, user, undefined, userFormation, false));
  const diff = mine - theirs + (aiHome ? 2 : -1);
  return { mentality: diff > 5 ? 1 : diff < -6 ? -1 : 0, pressing: diff > 3 ? 2 : 1, diff };
}

// ---------------------------------------------------------------- escalação
/** Mesmo critério de capitão do autoLineup (Líder tem preferência). */
const capScore = (p: Player) => p.fame + p.ovr + (hasTrait(p, "LID") ? 20 : 0);

function pickBench(rest: Player[]): number[] {
  const bench: Player[] = [];
  const byOvr = rest.slice().sort((a, b) => b.ovr - a.ovr);
  const gk = byOvr.find((p) => p.pos === "GOL");
  if (gk) bench.push(gk);
  for (const g of ["DEF", "MID", "ATT"] as const) {
    const p = byOvr.find((x) => !bench.includes(x) && POS_GROUP[x.pos] === g);
    if (p) bench.push(p);
  }
  for (const p of byOvr) {
    if (bench.length >= 9) break;
    if (!bench.includes(p) && p.pos !== "GOL") bench.push(p);
  }
  return bench.map((p) => p.id);
}

/**
 * Melhor escalação para UM jogo, pelo rendimento que o motor usa (overall na posição × condição × moral).
 * Diferente do autoLineup, não descansa quem está bem: só evita quem está bem cansado.
 */
export function bestLineup(w: World, club: Club, compId: string | undefined, formation: string): Lineup {
  const slots = slotsOf(formation);
  let pool = squadOf(w, club).filter((p) => isAvailable(p, compId));
  if (pool.length < 14) pool = squadOf(w, club, true).filter((p) => isAvailable(p, compId));
  const pairs: { s: number; p: Player; v: number }[] = [];
  slots.forEach((pos, s) => {
    for (const p of pool) pairs.push({ s, p, v: effAt(p, pos) - (p.cond < 70 ? (70 - p.cond) * 0.08 : 0) });
  });
  pairs.sort((a, b) => b.v - a.v);
  const starters: (number | null)[] = slots.map(() => null);
  const used = new Set<number>();
  for (const { s, p } of pairs) {
    if (starters[s] !== null || used.has(p.id)) continue;
    starters[s] = p.id;
    used.add(p.id);
  }
  const bench = pickBench(pool.filter((p) => !used.has(p.id)));
  const keepCap = club.lineup?.captain;
  const captain = keepCap != null && used.has(keepCap)
    ? keepCap
    : [...used].map((id) => w.players[id]).sort((a, b) => capScore(b) - capScore(a))[0]?.id;
  return { starters, bench, captain };
}

export interface LineupFix {
  kind: "missing" | "tired" | "position" | "better";
  slot: number;
  outId: number | null;
  inId: number | null;
  text: string;
  gain: number; // ganho de rendimento na posição
}

/** Problemas na escalação atual (na formação atual) com a troca sugerida. */
export function lineupFixes(w: World, club: Club, compId?: string): LineupFix[] {
  const formation = club.tactic.formation;
  const slots = slotsOf(formation);
  const lineup = validLineup(w, club, compId);
  const fixes: LineupFix[] = [];
  const starters = new Set(lineup.starters.filter((x): x is number => x != null));
  const usedIn = new Set<number>();
  // desfalques: a escalação salva tinha alguém lesionado/suspenso (o jogo já troca sozinho)
  const saved = club.lineup?.starters ?? [];
  slots.forEach((pos, k) => {
    const was = saved[k];
    const now = lineup.starters[k];
    if (was == null || was === now) return;
    const p = w.players[was];
    if (!p || p.clubId !== club.id) return;
    const why = p.injury > 0 ? "está lesionado" : "está suspenso";
    const sub = now != null ? w.players[now] : null;
    fixes.push({ kind: "missing", slot: k, outId: was, inId: now ?? null, gain: 99, text: `${shortName(p.name)} ${why}${sub ? ` — ${shortName(sub.name)} entra como ${pos}` : ""}.` });
    if (now != null) usedIn.add(now);
  });
  const others = [...lineup.bench.map((id) => w.players[id]), ...squadOf(w, club)]
    .filter((p, i, arr) => p && !starters.has(p.id) && isAvailable(p, compId) && arr.indexOf(p) === i);
  const cands: LineupFix[] = [];
  lineup.starters.forEach((id, k) => {
    if (id == null) return;
    const s = w.players[id];
    const pos = slots[k];
    const eS = effAt(s, pos);
    let best: Player | null = null, bestE = -1;
    for (const c of others) {
      if ((pos === "GOL") !== (c.pos === "GOL")) continue;
      const e = effAt(c, pos);
      if (e > bestE) { bestE = e; best = c; }
    }
    if (!best) return;
    const gain = bestE - eS;
    const fit = ovrAt(s, pos);
    const bn = shortName(best.name), sn = shortName(s.name);
    if (s.cond < 75 && gain >= 1.5) {
      cands.push({ kind: "tired", slot: k, outId: id, inId: best.id, gain, text: `${sn} está cansado (${Math.round(s.cond)}%). ${bn} entra mais inteiro (${ovrAt(best, pos)} como ${pos}).` });
    } else if (fit <= s.ovr - 5 && gain >= 1) {
      cands.push({ kind: "position", slot: k, outId: id, inId: best.id, gain, text: `${sn} está improvisado de ${pos} (rende ${fit}, não ${s.ovr}). ${bn} é melhor ali (${ovrAt(best, pos)}).` });
    } else if (gain >= 4) {
      cands.push({ kind: "better", slot: k, outId: id, inId: best.id, gain, text: `${bn} (${ovrAt(best, pos)}) rende mais que ${sn} (${fit}) como ${pos}.` });
    }
  });
  cands.sort((a, b) => b.gain - a.gain);
  for (const c of cands) {
    if (c.inId == null || usedIn.has(c.inId)) continue;
    usedIn.add(c.inId);
    fixes.push(c);
  }
  return fixes.slice(0, 5);
}

/** Aplica uma correção da lista (troca na escalação salva do usuário). */
export function applyFix(w: World, club: Club, fix: LineupFix, compId?: string) {
  if (fix.inId == null || fix.kind === "missing") return;
  const l = validLineup(w, club, compId);
  const starters = l.starters.slice();
  const out = starters[fix.slot];
  starters[fix.slot] = fix.inId;
  let bench = l.bench.filter((b) => b !== fix.inId);
  if (out != null && !bench.includes(out) && bench.length < 9) bench = [...bench, out];
  club.lineup = { starters, bench, captain: l.captain && starters.includes(l.captain) ? l.captain : undefined };
}

// ---------------------------------------------------------------- análise pré-jogo
export interface Reasoned<T> { value: T; reason: string }

export interface TacticPlan extends Tactic { lineup?: Lineup }

export interface StarNote { id: number; name: string; pos: Pos; ovr: number }

export interface MatchAnalysis {
  fixtureId: number;
  home: boolean; // usuário manda o jogo
  neutral: boolean;
  user: { strength: number; sectors: Sectors; formation: string };
  opp: {
    id: string; strength: number; sectors: Sectors; formation: string; mentality: number; pressing: number;
    stars: StarNote[]; strong: string; weak: string;
  };
  gap: number; // força média nossa − deles (overall na posição)
  verdict: "favorito" | "equilibrado" | "azarão";
  rec: { formation: Reasoned<string>; mentality: Reasoned<number>; pressing: Reasoned<number> };
  plan: TacticPlan; // tática + escalação sugeridas (o botão "Aplicar sugestões")
  fixes: LineupFix[];
  now: Outlook; // estimativa do modelo com a tática atual
  suggested: Outlook; // com a sugestão
  changed: boolean; // a sugestão difere do que está salvo
  daysToNext: number | null; // dias até o jogo seguinte (cansaço)
}

const SECTOR_NAME: Record<"att" | "mid" | "def", string> = { att: "ataque", mid: "meio-campo", def: "defesa" };
const FORMATION_SWITCH_MARGIN = 0.05; // pontos por jogo para valer a pena mudar de formação

function nextGapDays(w: World, f: Fixture): number | null {
  let best: number | null = null;
  for (const g of w.fixtures) {
    if (g.id === f.id || g.result || g.day <= f.day) continue;
    if (g.home !== w.userClubId && g.away !== w.userClubId) continue;
    if (best == null || g.day < best) best = g.day;
  }
  return best == null ? null : best - f.day;
}

/** Custo (em pontos) de cansar o elenco com pressão alta quando o próximo jogo está perto. */
function pressCost(p: number, daysToNext: number | null, avgCond: number): number {
  let c = 0;
  if (daysToNext != null && daysToNext <= 3) c += 0.03 * Math.max(0, p - 1);
  if (avgCond < 80) c += 0.02 * Math.max(0, p - 1);
  return c;
}

/** Análise do jogo: adversário, previsão da tática da IA, sugestões e correções de escalação. */
export function analyzeMatch(w: World, f: Fixture): MatchAnalysis {
  const user = w.clubs[w.userClubId];
  const userIsHome = f.home === user.id;
  const opp = w.clubs[userIsHome ? f.away : f.home];
  const home = userIsHome && !f.neutral;
  const oppHome = !userIsHome && !f.neutral;
  const curForm = FORMATIONS[user.tactic.formation] ? user.tactic.formation : "4-3-3";
  const curLineup = validLineup(w, user, f.comp);
  const oppForm = opp.tactic.formation;
  const oppLineup = autoLineup(w, opp, f.comp);
  const oppSlots = slotsOf(oppForm);
  const daysToNext = nextGapDays(w, f);

  const aiCache = new Map<string, ReturnType<typeof predictAiTactic>>();
  const aiFor = (form: string) => {
    let r = aiCache.get(form);
    if (!r) { r = predictAiTactic(w, opp, user, form, oppHome); aiCache.set(form, r); }
    return r;
  };
  // preleção: a nossa (a sugestão do auxiliar) e a da IA valem no 1º tempo (metade do jogo)
  const userIdx: 0 | 1 = userIsHome ? 0 : 1;
  const preCtx = talkCtx(w, f, user, curLineup, opp, oppLineup, "pre");
  const oppCtx = talkCtx(w, f, opp, oppLineup, user, curLineup, "pre");
  const userTalk = talkEffect(preCtx, suggest(w, f, preCtx, userIdx)) * 0.5;
  const oppTalk = talkEffect(oppCtx, aiTalk(w, f, oppCtx, (1 - userIdx) as 0 | 1)) * 0.5;
  const usCtx = (lineup: Lineup, oppM: number): SideCtx => ({ f, club: user, oppM, captain: lineup.captain, talk: userTalk });
  const themCtx = (m: number): SideCtx => ({ f, club: opp, oppM: m, captain: oppLineup.captain, talk: oppTalk });
  const evalPlan = (form: string, lineup: Lineup, m: number, p: number): Outlook => {
    const ai = aiFor(form);
    const us = sideState(w, slotsOf(form), lineup.starters, m, p, home, MATCH_MINUTES, usCtx(lineup, ai.mentality));
    const them = sideState(w, oppSlots, oppLineup.starters, ai.mentality, ai.pressing, oppHome, MATCH_MINUTES, themCtx(m));
    const [lu, lt] = expectedGoals(us, them, MATCH_MINUTES);
    return resultProbs(lu, lt);
  };

  const now = evalPlan(curForm, curLineup, user.tactic.mentality, user.tactic.pressing);

  // busca: formação × mentalidade × pressão
  type Cand = { form: string; lineup: Lineup; m: number; p: number; o: Outlook; score: number };
  const bestBy = new Map<string, Cand>();
  const tableBy = new Map<string, Outlook[][]>(); // [m+2][p]
  for (const form of Object.keys(FORMATIONS)) {
    const lineup = bestLineup(w, user, f.comp, form);
    const st = sideState(w, slotsOf(form), lineup.starters, 0, 1, home);
    const table: Outlook[][] = [];
    for (let m = -2; m <= 2; m++) {
      const row: Outlook[] = [];
      for (let p = 0; p <= 2; p++) {
        const o = evalPlan(form, lineup, m, p);
        row.push(o);
        const score = o.pts - pressCost(p, daysToNext, st.cond);
        const cur = bestBy.get(form);
        if (!cur || score > cur.score + 1e-9) bestBy.set(form, { form, lineup, m, p, o, score });
      }
      table.push(row);
    }
    tableBy.set(form, table);
  }
  const stay = bestBy.get(curForm)!;
  let pick = stay;
  for (const c of bestBy.values()) if (c.score > pick.score) pick = c;
  if (pick.form !== curForm && pick.score < stay.score + FORMATION_SWITCH_MARGIN) pick = stay;

  // setores e força
  const ai = aiFor(pick.form);
  const userState = sideState(w, slotsOf(curForm), curLineup.starters, user.tactic.mentality, user.tactic.pressing, home, undefined, usCtx(curLineup, ai.mentality));
  const oppState = sideState(w, oppSlots, oppLineup.starters, ai.mentality, ai.pressing, oppHome, undefined, themCtx(user.tactic.mentality));
  const strength = strengthWith(w, curForm, curLineup);
  const oppStrength = strengthWith(w, oppForm, oppLineup);
  const gap = strength - oppStrength;
  const verdict = pick.o.win >= 0.5 ? "favorito" : pick.o.win <= 0.28 ? "azarão" : "equilibrado";

  // destaques do adversário
  const stars = oppLineup.starters
    .filter((x): x is number => x != null)
    .map((id) => w.players[id])
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 3)
    .map((p) => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr }));
  const secs = (["att", "mid", "def"] as const).map((k) => ({ k, v: oppState.s[k], d: oppState.s[k] - userState.s[k] }));
  const strongS = secs.slice().sort((a, b) => b.d - a.d)[0];
  const weakS = secs.slice().sort((a, b) => a.d - b.d)[0];
  const strong = `${SECTOR_NAME[strongS.k]} (${Math.round(strongS.v)})`;
  const weak = `${SECTOR_NAME[weakS.k]} (${Math.round(weakS.v)})`;

  // motivos
  const table = tableBy.get(pick.form)!;
  const at = (m: number, p: number) => table[m + 2][p];
  const pickStrength = strengthWith(w, pick.form, pick.lineup);
  let formReason: string;
  if (pick.form === curForm) {
    formReason = `O ${pick.form} já é o que mais rende com o seu elenco (força ${Math.round(pickStrength)}).`;
  } else {
    const a = sideState(w, slotsOf(pick.form), pick.lineup.starters, 0, 1, home).s;
    const b = sideState(w, slotsOf(curForm), stay.lineup.starters, 0, 1, home).s;
    const deltas = (["att", "mid", "def"] as const).map((k) => ({ k, d: a[k] - b[k] })).sort((x, y) => y.d - x.d);
    const gainPts = pick.score - stay.score;
    formReason = `${pick.form} encaixa melhor: mais ${SECTOR_NAME[deltas[0].k]} (+${Math.max(1, Math.round(deltas[0].d))}) e +${num(gainPts)} ponto por jogo.`;
  }
  const mGain = at(pick.m, pick.p).pts - at(0, pick.p).pts;
  const mentReason = (() => {
    const g = mGain >= 0.02 ? ` (+${num(mGain)} ponto por jogo)` : "";
    switch (pick.m) {
      case 2: return pick.o.win >= 0.5
        ? `Vocês são favoritos: atacar o tempo todo cria muito mais chances do que cede${g}.`
        : `Jogo parelho: no ataque vocês criam mais chances do que dão ao rival${g}.`;
      case 1: return `Um pouco mais de ataque compensa contra este rival${g}.`;
      case -1: return `O ${opp.name} é mais forte: segurar um pouco aumenta a chance de pontuar${g}.`;
      case -2: return `O ${opp.name} é bem mais forte: fechar a defesa e sair no contra-ataque rende mais pontos${g}.`;
      default: return "Mudar a postura quase não muda nada neste jogo: fique na equilibrada.";
    }
  })();
  const pickCond = sideState(w, slotsOf(pick.form), pick.lineup.starters, 0, 1, home).cond;
  const pressReason = (() => {
    if (pick.p === 2) return "Pressão alta ganha o meio-campo (mais posse) e o elenco está descansado.";
    if (pick.p === 1 && daysToNext != null && daysToNext <= 3) return `Tem jogo daqui a ${daysToNext} dia${daysToNext === 1 ? "" : "s"}: marcação média poupa fôlego.`;
    if (pick.p === 1 && pickCond < 80) return `Elenco cansado (condição média ${Math.round(pickCond)}%): marcação média.`;
    if (pick.p === 1) return "Marcação média: a pressão alta não compensa o cansaço aqui.";
    return "Marcação baixa: poupa energia para os próximos jogos.";
  })();

  const plan: TacticPlan = { formation: pick.form, mentality: pick.m, pressing: pick.p, lineup: pick.lineup };
  const sameLineup = pick.form === curForm && pick.lineup.starters.every((id, i) => id === curLineup.starters[i]);
  const changed = pick.form !== curForm || pick.m !== user.tactic.mentality || pick.p !== user.tactic.pressing || !sameLineup;

  return {
    fixtureId: f.id, home, neutral: !!f.neutral,
    user: { strength, sectors: userState.s, formation: curForm },
    opp: { id: opp.id, strength: oppStrength, sectors: oppState.s, formation: oppForm, mentality: ai.mentality, pressing: ai.pressing, stars, strong, weak },
    gap, verdict,
    rec: {
      formation: { value: pick.form, reason: formReason },
      mentality: { value: pick.m, reason: mentReason },
      pressing: { value: pick.p, reason: pressReason },
    },
    plan,
    fixes: lineupFixes(w, user, f.comp),
    now,
    suggested: pick.o,
    changed,
    daysToNext,
  };
}

export interface SquadAnalysis {
  formations: { formation: string; strength: number }[]; // melhor primeiro
  best: string;
  reason: string;
  plan: TacticPlan;
  fixes: LineupFix[];
}

/** Sem jogo marcado: qual formação aproveita melhor o elenco. */
export function analyzeSquad(w: World): SquadAnalysis {
  const club = w.clubs[w.userClubId];
  const cur = FORMATIONS[club.tactic.formation] ? club.tactic.formation : "4-3-3";
  const rows = Object.keys(FORMATIONS).map((formation) => {
    const lineup = bestLineup(w, club, undefined, formation);
    return { formation, lineup, strength: strengthWith(w, formation, lineup) };
  }).sort((a, b) => b.strength - a.strength);
  const curRow = rows.find((r) => r.formation === cur)!;
  const top = rows[0].strength > curRow.strength + 0.4 ? rows[0] : curRow;
  const reason = top.formation === cur
    ? `O ${cur} já é o que mais aproveita o seu elenco (força ${Math.round(curRow.strength)}).`
    : `${top.formation} aproveita melhor o elenco: força ${Math.round(top.strength)} contra ${Math.round(curRow.strength)} no ${cur}.`;
  return {
    formations: rows.map((r) => ({ formation: r.formation, strength: r.strength })),
    best: top.formation,
    reason,
    plan: { formation: top.formation, mentality: club.tactic.mentality, pressing: club.tactic.pressing, lineup: top.lineup },
    fixes: lineupFixes(w, club),
  };
}

/** Aplica formação, mentalidade, pressão e a escalação recalculada ao clube do usuário. */
export function applyAdvice(w: World, club: Club, advice: TacticPlan, compId?: string) {
  const formation = FORMATIONS[advice.formation] ? advice.formation : club.tactic.formation;
  club.tactic = { formation, mentality: clampN(Math.round(advice.mentality), -2, 2), pressing: clampN(Math.round(advice.pressing), 0, 2) };
  const l = advice.lineup && advice.lineup.starters.length === FORMATIONS[formation].length ? advice.lineup : bestLineup(w, club, compId, formation);
  club.lineup = { starters: l.starters.slice(), bench: l.bench.slice(), captain: l.captain };
}

// ---------------------------------------------------------------- simulação isolada
export interface Odds { n: number; win: number; draw: number; loss: number; gf: number; ga: number; pts: number }

interface TestBench {
  mini: World;
  fx: Fixture;
  userSide: 0 | 1;
  reset: () => void;
}

/**
 * Mini-mundo com só os dois clubes e seus jogadores (cópias profundas).
 * O MatchSim mexe na condição/lesão dos jogadores e a IA mexe em club.tactic,
 * então nada aqui pode apontar para objetos do mundo real.
 */
export function cloneForMatch(w: World, f: Fixture): TestBench {
  const clubs: Record<string, Club> = {};
  const players: Record<number, Player> = {};
  for (const id of [f.home, f.away]) {
    const c = w.clubs[id];
    clubs[id] = {
      ...c,
      tactic: { ...c.tactic },
      lineup: c.lineup ? { starters: c.lineup.starters.slice(), bench: c.lineup.bench.slice(), captain: c.lineup.captain } : undefined,
      players: c.players.slice(),
      history: [], trophies: [], finance: { income: {}, expense: {} },
    };
    for (const pid of c.players) {
      const p = w.players[pid];
      if (p) players[pid] = structuredClone(p);
    }
  }
  const mini = { ...w, clubs, players, fixtures: [], comps: {}, news: [], offers: [], history: [], legends: {}, shortlist: [], managerHistory: [] } as World;
  // jogo isolado: sem confronto de mata-mata (não há pênaltis; contamos o resultado dos 90 minutos)
  const fx: Fixture = { id: f.id, comp: f.comp, stage: f.stage, round: f.round, day: f.day, home: f.home, away: f.away, neutral: f.neutral };
  const snap = Object.values(players).map((p) => [p, p.cond, p.injury, p.injuryName, p.morale] as const);
  const tactics = Object.values(clubs).map((c) => [c, { ...c.tactic }] as const);
  const reset = () => {
    for (const [p, cond, inj, injName, morale] of snap) { p.cond = cond; p.injury = inj; p.injuryName = injName; p.morale = morale; }
    for (const [c, t] of tactics) c.tactic = { ...t };
  };
  return { mini, fx, userSide: f.away === w.userClubId ? 1 : 0, reset };
}

/** Coloca a tática do usuário no mini-mundo. */
function applyPlan(b: TestBench, plan: TacticPlan) {
  const club = b.mini.clubs[b.mini.userClubId];
  club.tactic = { formation: plan.formation, mentality: plan.mentality, pressing: plan.pressing };
  club.lineup = plan.lineup
    ? { starters: plan.lineup.starters.slice(), bench: plan.lineup.bench.slice(), captain: plan.lineup.captain }
    : bestLineup(b.mini, club, b.fx.comp, plan.formation);
}

export type LivePolicy = (sim: MatchSim, side: 0 | 1) => void;

export interface Tally { n: number; w: number; d: number; l: number; gf: number; ga: number }

export const emptyTally = (): Tally => ({ n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });

/** Simula `n` jogos no mini-mundo (síncrono; usa o RNG global como está). */
export function runBatch(b: TestBench, plan: TacticPlan, n: number, t: Tally = emptyTally(), policy?: LivePolicy, userControlled = false): Tally {
  for (let i = 0; i < n; i++) {
    b.reset();
    applyPlan(b, plan);
    // sem controle do usuário a IA faz as trocas dos dois lados (aproxima um técnico que mexe bem no time)
    const sim = new MatchSim(b.mini, b.fx, { live: false, userSide: userControlled ? b.userSide : null });
    let guard = 0;
    while (!sim.finished && guard++ < 200) {
      sim.step();
      if (policy) policy(sim, b.userSide);
    }
    const us = sim.sides[b.userSide].goals, them = sim.sides[1 - b.userSide].goals;
    t.n++;
    t.gf += us;
    t.ga += them;
    if (us > them) t.w++;
    else if (us === them) t.d++;
    else t.l++;
  }
  b.reset();
  return t;
}

export function tallyToOdds(t: Tally): Odds {
  const n = t.n || 1;
  return { n: t.n, win: t.w / n, draw: t.d / n, loss: t.l / n, gf: t.gf / n, ga: t.ga / n, pts: (3 * t.w + t.d) / n };
}

/** Semente fixa por jogo: mesma partida, mesmos sorteios (comparação justa entre táticas). */
export function fixtureSeed(f: Fixture): number {
  return hashString(`odds:${f.id}:${f.home}:${f.away}`) || 1;
}

/** A tática salva do usuário, como plano. */
export function currentPlan(w: World, f?: Fixture): TacticPlan {
  const club = w.clubs[w.userClubId];
  return { ...club.tactic, lineup: validLineup(w, club, f?.comp) };
}

/**
 * Estima vitória/empate/derrota simulando `n` jogos num mini-mundo clonado.
 * Roda em blocos de 25 simulações e devolve o controle ao navegador entre eles.
 * O estado do RNG global é salvo e restaurado a cada bloco: o mundo real não muda nada.
 */
export async function estimateOdds(
  w: World, f: Fixture, tactic: TacticPlan, n = 300, onProgress?: (done: number, total: number) => void,
): Promise<Odds> {
  const b = cloneForMatch(w, f);
  const plan: TacticPlan = {
    formation: tactic.formation, mentality: tactic.mentality, pressing: tactic.pressing,
    lineup: tactic.lineup ? { starters: tactic.lineup.starters.slice(), bench: tactic.lineup.bench.slice(), captain: tactic.lineup.captain } : undefined,
  };
  let mine = fixtureSeed(f);
  const t = emptyTally();
  const CHUNK = 25;
  while (t.n < n) {
    const outer = getRngState();
    setRngState(mine);
    try {
      runBatch(b, plan, Math.min(CHUNK, n - t.n), t);
    } finally {
      mine = getRngState();
      setRngState(outer);
    }
    onProgress?.(t.n, n);
    if (t.n < n) await new Promise<void>((r) => setTimeout(r, 0));
  }
  return tallyToOdds(t);
}

// ---------------------------------------------------------------- modelo ao vivo
/** Minutos que faltam (o motor sabe os acréscimos; usamos a mesma conta). */
export function remainingMinutes(sim: MatchSim): number {
  if (sim.finished) return 0;
  if (sim.half === 1) return Math.max(0, 45 + sim.stoppage[0] - sim.minute) + 45 + sim.stoppage[1];
  return Math.max(0, 90 + sim.stoppage[1] - sim.minute);
}

/** Uma mudança hipotética no time: mentalidade, pressão e/ou quem está em cada posição. */
export interface LiveOverride { m?: number; p?: number; ids?: (number | null)[] }

export function liveSideState(sim: MatchSim, side: 0 | 1, o: LiveOverride = {}, oppM?: number): SideState {
  const S = sim.sides[side];
  const O = sim.sides[1 - side];
  const rem = remainingMinutes(sim);
  // a conversa vale até o fim do tempo em que foi dada
  const talkMins = sim.half === 1 ? Math.max(0, 45 + sim.stoppage[0] - sim.minute) : rem;
  const talk = rem > 0 ? (sim.talk[side] * talkMins) / rem : 0;
  const ctx: SideCtx = { f: sim.f, club: S.club, oppM: oppM ?? O.mentality, captain: S.captain, talk };
  return sideState(sim.w, S.slots, o.ids ?? S.onPitch, o.m ?? S.mentality, o.p ?? S.pressing, side === 0 && !sim.f.neutral, rem, ctx);
}

// o estado do adversário não muda enquanto comparamos as nossas opções no mesmo minuto
const themCache = new WeakMap<MatchSim, { key: string; st: SideState }>();
function themState(sim: MatchSim, side: 0 | 1, ourM: number): SideState {
  const O = sim.sides[1 - side];
  const key = `${side}|${sim.half}|${sim.minute}|${O.onPitch.join(",")}|${O.mentality}|${O.pressing}|${ourM}|${sim.talk[1 - side]}`;
  const hit = themCache.get(sim);
  if (hit && hit.key === key) return hit.st;
  const st = liveSideState(sim, (1 - side) as 0 | 1, {}, ourM); // Velocistas deles dependem da nossa mentalidade
  themCache.set(sim, { key, st });
  return st;
}

/** Chances de V/E/D no fim do jogo, a partir do placar e do momento atual. */
export function liveOutlook(sim: MatchSim, side: 0 | 1, o: LiveOverride = {}): Outlook {
  const mins = remainingMinutes(sim);
  const us = liveSideState(sim, side, o);
  const them = themState(sim, side, o.m ?? sim.sides[side].mentality);
  const [lu, lt] = expectedGoals(us, them, mins);
  return resultProbs(lu, lt, sim.sides[side].goals - sim.sides[1 - side].goals);
}

/** Mentalidade que maximiza os pontos esperados daqui até o fim. */
export function bestLiveMentality(sim: MatchSim, side: 0 | 1, o: LiveOverride = {}): { m: number; pts: number; cur: number } {
  const cur = liveOutlook(sim, side, { ...o, m: undefined }).pts;
  let best = { m: sim.sides[side].mentality, pts: cur };
  for (let m = -2; m <= 2; m++) {
    const r = liveOutlook(sim, side, { ...o, m });
    if (r.pts > best.pts + 1e-9) best = { m, pts: r.pts };
  }
  return { ...best, cur };
}

// ---------------------------------------------------------------- dicas ao vivo
export interface TipAction {
  label: string;
  kind: "mentality" | "pressing" | "sub";
  value?: number; // mentalidade (-2..2) ou pressão (0..2)
  outId?: number;
  inId?: number;
  toSlot?: number; // após expulsão: quem entra ocupa a posição vazia e a do que sai fica vazia
}

export interface LiveTip {
  id: string;
  title: string;
  text: string;
  tone: "info" | "good" | "warn" | "danger";
  actions: TipAction[];
  priority: number;
}

interface TipMemory {
  done: Set<string>; // dicas dispensadas ou aplicadas (não voltam neste jogo)
  applied: Map<string, Set<number>>; // ações já feitas de cada dica
  key: string;
  tips: LiveTip[];
  stable: Map<string, LiveTip>; // mantém o texto/ações de uma dica estáveis enquanto ela vale
  windowMinute: number; // minuto em que uma dica já gastou uma parada
}

const memory = new WeakMap<MatchSim, TipMemory>();
function mem(sim: MatchSim): TipMemory {
  let m = memory.get(sim);
  if (!m) {
    m = { done: new Set(), applied: new Map(), key: "", tips: [], stable: new Map(), windowMinute: -1 };
    memory.set(sim, m);
  }
  return m;
}

const isHalftime = (sim: MatchSim) => sim.half === 2 && sim.minute === 45;

/**
 * Pode substituir agora (mesma regra da tela de substituições): precisa de trocas e de uma parada
 * livre — no intervalo não gasta parada, e várias trocas no mesmo minuto contam como uma parada só.
 */
export function canSubNow(sim: MatchSim, side: 0 | 1): boolean {
  const S = sim.sides[side];
  const sameStop = memory.get(sim)?.windowMinute === sim.minute;
  return !sim.finished && S.subsLeft > 0 && S.bench.length > 0 && (S.windowsLeft > 0 || isHalftime(sim) || sameStop);
}

const mentLabel = (m: number) => `Mentalidade: ${MENTALITY_NAMES[m]}`;

function subLabel(sim: MatchSim, outId: number, inId: number) {
  return `🔄 ${shortName(sim.player(inId).name)} no lugar de ${shortName(sim.player(outId).name)}`;
}

/** Melhor reserva para a posição `k` (rendimento na posição, já com condição). */
function bestBenchFor(sim: MatchSim, side: 0 | 1, k: number, exclude: Set<number> = new Set()): { id: number; eff: number } | null {
  const S = sim.sides[side];
  const pos = S.slots[k];
  let best: { id: number; eff: number } | null = null;
  for (const b of S.bench) {
    if (exclude.has(b)) continue;
    const p = sim.player(b);
    if (!p || (pos === "GOL") !== (p.pos === "GOL") || p.injury > 0) continue;
    const e = liveEff(sim, side, p, pos);
    if (!best || e > best.eff) best = { id: b, eff: e };
  }
  return best;
}

function withSub(ids: (number | null)[], outId: number, inId: number): (number | null)[] {
  const out = ids.slice();
  const k = out.indexOf(outId);
  if (k >= 0) out[k] = inId;
  return out;
}

/** Melhor troca segundo o modelo (com uma mentalidade fixa), dentre quem está em campo e no banco. */
function bestSubByModel(sim: MatchSim, side: 0 | 1, m: number, filterOut?: (k: number, id: number) => boolean): { outId: number; inId: number; pts: number } | null {
  const S = sim.sides[side];
  let best: { outId: number; inId: number; pts: number } | null = null;
  S.onPitch.forEach((id, k) => {
    if (id == null || S.slots[k] === "GOL") return;
    if (filterOut && !filterOut(k, id)) return;
    for (const b of S.bench) {
      const p = sim.player(b);
      if (!p || p.pos === "GOL" || p.injury > 0) continue;
      const pts = liveOutlook(sim, side, { m, ids: withSub(S.onPitch, id, b) }).pts;
      if (!best || pts > best.pts) best = { outId: id, inId: b, pts };
    }
  });
  return best;
}

function lastEventMinute(sim: MatchSim, type: string, side: 0 | 1): number | null {
  for (let i = sim.events.length - 1; i >= 0; i--) {
    const e = sim.events[i];
    if (e.type === type && e.side === side) return e.min;
  }
  return null;
}

/** Gera as dicas candidatas (sem filtrar as já vistas). */
function buildTips(sim: MatchSim, side: 0 | 1): LiveTip[] {
  const S = sim.sides[side];
  const O = sim.sides[1 - side];
  const t = sim.minute;
  const ht = isHalftime(sim);
  const diff = S.goals - O.goals;
  const rem = remainingMinutes(sim);
  const subOk = canSubNow(sim, side);
  const score = `${S.goals}-${O.goals}`;
  const base = liveOutlook(sim, side);
  const tips: LiveTip[] = [];
  const onIds = S.onPitch.filter((x): x is number => x != null);
  const avgCond = onIds.reduce((s, id) => s + sim.player(id).cond, 0) / Math.max(1, onIds.length);
  if (rem <= 1) return tips;

  // 1) expulsão: reorganizar (sai um atacante, entra um defensor na posição vazia) + postura
  const reds = S.onPitch.filter((x) => x == null).length;
  const redMin = reds > 0 ? lastEventMinute(sim, "red", side) : null;
  if (reds > 0 && redMin != null && t - redMin <= 10) {
    const actions: TipAction[] = [];
    const k0 = S.onPitch.findIndex((x) => x == null);
    let ids = S.onPitch.slice();
    let rebalance: TipAction | null = null;
    if (subOk && k0 >= 0 && S.slots[k0] !== "GOL" && DEF_W[S.slots[k0]] >= 0.55) {
      const inn = bestBenchFor(sim, side, k0);
      let bestOut: { id: number; k: number; pts: number } | null = null;
      if (inn) {
        S.onPitch.forEach((id, k) => {
          if (id == null || (POS_GROUP[S.slots[k]] !== "ATT" && S.slots[k] !== "MEI")) return;
          const trial = S.onPitch.slice();
          trial[k0] = inn.id;
          trial[k] = null;
          const pts = liveOutlook(sim, side, { ids: trial }).pts;
          if (!bestOut || pts > bestOut.pts) bestOut = { id, k, pts };
        });
      }
      const bo = bestOut as { id: number; k: number; pts: number } | null;
      if (inn && bo && bo.pts > base.pts + 0.005) {
        rebalance = { label: subLabel(sim, bo.id, inn.id), kind: "sub", outId: bo.id, inId: inn.id, toSlot: k0 };
        ids = S.onPitch.slice();
        ids[k0] = inn.id;
        ids[bo.k] = null;
      }
    }
    const bm = bestLiveMentality(sim, side, { ids });
    if (bm.m !== S.mentality && bm.pts > bm.cur + 0.01) actions.push({ label: mentLabel(bm.m), kind: "mentality", value: bm.m });
    if (rebalance) actions.unshift(rebalance);
    if (actions.length) {
      const pos = S.slots[k0] ? POS_NAME[S.slots[k0]].toLowerCase() : "defesa";
      tips.push({
        id: `red:${reds}`, tone: "danger", priority: 100, title: "Um a menos: reorganize o time",
        text: rebalance
          ? `Sem o ${pos}, a defesa fica aberta. Sacrifique um atacante para fechar o buraco${actions.length > 1 ? " e ajuste a postura" : ""}.`
          : `Com um a menos, ajuste a postura para não levar mais gols.`,
        actions,
      });
    }
  }

  // 2) intervalo: resumo + melhor ajuste (trocas no intervalo não gastam parada)
  if (ht || (sim.half === 2 && t <= 48 && !mem(sim).done.has("ht"))) {
    const st = sim.stats;
    const tot = st.poss[0] + st.poss[1] || 1;
    const poss = Math.round((st.poss[side] / tot) * 100);
    const bm = bestLiveMentality(sim, side);
    const actions: TipAction[] = [];
    let m = S.mentality;
    if (bm.m !== S.mentality && bm.pts > bm.cur + 0.02) { actions.push({ label: mentLabel(bm.m), kind: "mentality", value: bm.m }); m = bm.m; }
    if (subOk) {
      const bs = bestSubByModel(sim, side, m);
      const ref = liveOutlook(sim, side, { m }).pts;
      if (bs && bs.pts > ref + 0.01) actions.push({ label: subLabel(sim, bs.outId, bs.inId), kind: "sub", outId: bs.outId, inId: bs.inId });
    }
    const after = actions.length ? liveOutlook(sim, side, { m, ids: actions.reduce((ids, a) => (a.kind === "sub" ? withSub(ids, a.outId!, a.inId!) : ids), S.onPitch.slice()) }) : base;
    tips.push({
      id: "ht", tone: "info", priority: 90, title: `Intervalo: ${S.goals} x ${O.goals}`,
      text: `Posse ${poss}%, finalizações ${st.shots[side]} x ${st.shots[1 - side]}. Chance de vitória: ${pct(base.win)}${actions.length ? ` → ${pct(after.win)} com os ajustes` : ""}.`,
      actions,
    });
  }

  // 3) placar: correr atrás / segurar / buscar a vitória (pelo modelo)
  const lateEnough = (diff < 0 && t >= 60) || (diff > 0 && t >= 70) || (diff === 0 && t >= 70);
  if (lateEnough && !ht) {
    const bm = bestLiveMentality(sim, side);
    const actions: TipAction[] = [];
    let m = S.mentality;
    if (bm.m !== S.mentality && bm.pts > bm.cur + (diff === 0 ? 0.03 : 0.015)) { actions.push({ label: mentLabel(bm.m), kind: "mentality", value: bm.m }); m = bm.m; }
    let sub: { outId: number; inId: number; pts: number } | null = null;
    if (subOk) {
      const ref = liveOutlook(sim, side, { m }).pts;
      sub = bestSubByModel(sim, side, m);
      if (sub && sub.pts > ref + 0.01) actions.push({ label: subLabel(sim, sub.outId, sub.inId), kind: "sub", outId: sub.outId, inId: sub.inId });
      else sub = null;
    }
    if (actions.length) {
      const after = liveOutlook(sim, side, { m, ids: sub ? withSub(S.onPitch, sub.outId, sub.inId) : undefined });
      if (diff < 0) {
        tips.push({
          id: `chase:${score}`, tone: "warn", priority: 80, title: `Perdendo por ${-diff}: hora de arriscar`,
          text: `Faltam ~${rem} min. Chance de pontuar: ${pct(base.win + base.draw)} → ${pct(after.win + after.draw)}.`,
          actions,
        });
      } else if (diff > 0) {
        tips.push({
          id: `protect:${score}`, tone: "good", priority: 78, title: "Vencendo: segure o resultado",
          text: `Faltam ~${rem} min. Chance de vitória: ${pct(base.win)} → ${pct(after.win)}.`,
          actions,
        });
      } else {
        const up = m > S.mentality;
        tips.push({
          id: `draw:${score}`, tone: "info", priority: 70, title: up ? "Empate: dá para buscar a vitória" : "Empate: segure o ponto",
          text: `Faltam ~${rem} min. Vitória ${pct(base.win)} → ${pct(after.win)}, derrota ${pct(base.loss)} → ${pct(after.loss)}.`,
          actions,
        });
      }
    }
  }

  // 4) jogador esgotado (condição < 55%)
  if (subOk && !ht) {
    let worst: { id: number; k: number } | null = null;
    S.onPitch.forEach((id, k) => {
      if (id == null) return;
      const p = sim.player(id);
      if (p.cond < 55 && (!worst || p.cond < sim.player(worst.id).cond)) worst = { id, k };
    });
    const wk = worst as { id: number; k: number } | null;
    if (wk) {
      const inn = bestBenchFor(sim, side, wk.k);
      const p = sim.player(wk.id);
      if (inn && inn.eff > liveEff(sim, side, p, S.slots[wk.k]) + 1) {
        const ip = sim.player(inn.id);
        tips.push({
          id: `tired:${wk.id}`, tone: "warn", priority: 72, title: `${shortName(p.name)} está esgotado`,
          text: `Condição ${Math.round(p.cond)}%: ele rende ${Math.round(liveEff(sim, side, p, S.slots[wk.k]))}. ${shortName(ip.name)} entra descansado (${Math.round(inn.eff)} como ${S.slots[wk.k]}).`,
          actions: [{ label: subLabel(sim, wk.id, inn.id), kind: "sub", outId: wk.id, inId: inn.id }],
        });
      }
    }
  }

  // 5) defensor pendurado no fim (2º amarelo = expulsão)
  if (subOk && !ht && t >= 55 && rem >= 12) {
    for (let k = 0; k < S.onPitch.length; k++) {
      const id = S.onPitch[k];
      if (id == null || !S.yellows.has(id) || DEF_W[S.slots[k]] < 0.55) continue;
      const inn = bestBenchFor(sim, side, k);
      const p = sim.player(id);
      if (inn && inn.eff >= liveEff(sim, side, p, S.slots[k]) * 0.95) {
        tips.push({
          id: `booked:${id}`, tone: "warn", priority: 60, title: `${shortName(p.name)} está pendurado`,
          text: `Tem amarelo e é dos que mais fazem falta. Um 2º cartão deixa vocês com 10. ${shortName(sim.player(inn.id).name)} cobre a posição.`,
          actions: [{ label: subLabel(sim, id, inn.id), kind: "sub", outId: id, inId: inn.id }],
        });
        break;
      }
    }
  }

  // 6) pressão: o rival domina a posse e ainda há fôlego / time esgotado com pressão alta
  if (!ht && t >= 25 && rem >= 15) {
    const st = sim.stats;
    const tot = st.poss[0] + st.poss[1] || 1;
    const oppPoss = st.poss[1 - side] / tot;
    if (S.pressing < 2 && oppPoss >= 0.57 && avgCond >= 70) {
      const up = liveOutlook(sim, side, { p: S.pressing + 1 });
      if (up.pts > base.pts + 0.005) {
        tips.push({
          id: `press-up:${sim.half}`, tone: "info", priority: 45, title: `O ${O.club.name} domina a bola`,
          text: `${Math.round(oppPoss * 100)}% de posse para eles. Aperte a marcação para ganhar o meio-campo: o time ainda tem fôlego (${Math.round(avgCond)}%).`,
          actions: [{ label: `Marcação: ${PRESSING_NAMES[S.pressing + 1]}`, kind: "pressing", value: S.pressing + 1 }],
        });
      }
    } else if (S.pressing === 2 && avgCond < 62) {
      const down = liveOutlook(sim, side, { p: 1 });
      if (down.pts >= base.pts - 0.005) {
        tips.push({
          id: "press-down", tone: "info", priority: 40, title: "O time está sem fôlego",
          text: `Condição média ${Math.round(avgCond)}%. Pressão alta agora só cansa mais: baixe para marcação média.`,
          actions: [{ label: `Marcação: ${PRESSING_NAMES[1]}`, kind: "pressing", value: 1 }],
        });
      }
    }
  }
  return tips;
}

function validAction(sim: MatchSim, side: 0 | 1, a: TipAction): boolean {
  const S = sim.sides[side];
  if (a.kind === "mentality") return a.value != null && a.value >= -2 && a.value <= 2 && a.value !== S.mentality;
  if (a.kind === "pressing") return a.value != null && a.value >= 0 && a.value <= 2 && a.value !== S.pressing;
  if (a.outId == null || a.inId == null || !canSubNow(sim, side)) return false;
  if (!S.onPitch.includes(a.outId) || !S.bench.includes(a.inId)) return false;
  if (a.toSlot != null && S.onPitch[a.toSlot] !== null) return false;
  return true;
}

/**
 * Até 2 dicas para o momento do jogo, com ações de um toque.
 * Dicas dispensadas/aplicadas não voltam (mesmo id) nesta partida.
 */
export function liveTips(sim: MatchSim, side: 0 | 1): LiveTip[] {
  if (sim.finished || (sim.minute === 0 && sim.half === 1)) return [];
  const M = mem(sim);
  const S = sim.sides[side];
  const key = [sim.half, sim.minute, sim.sides[0].goals, sim.sides[1].goals, S.subsLeft, S.windowsLeft, S.mentality, S.pressing, S.onPitch.join(","), S.bench.length, S.yellows.size, M.done.size].join("|");
  if (key === M.key) return M.tips;
  const fresh = buildTips(sim, side).filter((t) => !M.done.has(t.id));
  const out: LiveTip[] = [];
  for (const tip of fresh) {
    // mantém a versão já mostrada enquanto as ações dela ainda valem (evita a dica "pular" a cada minuto)
    const prev = M.stable.get(tip.id);
    const chosen = prev && prev.actions.every((a, i) => M.applied.get(tip.id)?.has(i) || validAction(sim, side, a)) ? { ...prev, text: tip.text } : tip;
    const doneIdx = M.applied.get(tip.id);
    const actions = chosen.actions.filter((a, i) => !doneIdx?.has(i) && validAction(sim, side, a));
    // não sugerir mais trocas do que restam
    let subs = 0;
    const capped = actions.filter((a) => a.kind !== "sub" || ++subs <= S.subsLeft);
    if (!capped.length && chosen.id !== "ht") continue;
    M.stable.set(tip.id, chosen);
    out.push({ ...chosen, actions: capped });
  }
  out.sort((a, b) => b.priority - a.priority);
  M.key = key;
  M.tips = out.slice(0, 2);
  return M.tips;
}

/** Dispensa uma dica: ela não volta nesta partida. */
export function dismissTip(sim: MatchSim, id: string) {
  const M = mem(sim);
  M.done.add(id);
  M.key = "";
}

/** Executa uma ação de dica no jogo ao vivo. Devolve se deu certo. */
export function applyTipAction(sim: MatchSim, side: 0 | 1, a: TipAction): boolean {
  if (!validAction(sim, side, a)) return false;
  const S = sim.sides[side];
  if (a.kind === "mentality") {
    sim.setMentality(side, a.value!);
    return true;
  }
  if (a.kind === "pressing") {
    S.pressing = clampN(a.value!, 0, 2);
    sim.recompute();
    return true;
  }
  const M = mem(sim);
  let swapped: [number, number] | null = null;
  if (a.toSlot != null) {
    const kOut = S.onPitch.indexOf(a.outId!);
    sim.swapSlots(side, a.toSlot, kOut); // quem sai vai para a posição vazia; a dele fica vazia
    swapped = [a.toSlot, kOut];
  }
  const ok = sim.substitute(side, a.outId!, a.inId!, true);
  if (!ok) {
    if (swapped) sim.swapSlots(side, swapped[0], swapped[1]);
    return false;
  }
  // como na tela de substituições: trocas fora do intervalo gastam uma parada (uma por minuto)
  if (!isHalftime(sim) && M.windowMinute !== sim.minute) {
    sim.useWindow(side);
    M.windowMinute = sim.minute;
  }
  return true;
}

/** Aplica uma dica inteira (ou só a ação `index`). Devolve quantas ações foram feitas. */
export function applyTip(sim: MatchSim, side: 0 | 1, tip: LiveTip, index?: number): number {
  const M = mem(sim);
  const original = M.stable.get(tip.id) ?? tip;
  let done = M.applied.get(tip.id);
  if (!done) { done = new Set(); M.applied.set(tip.id, done); }
  let n = 0;
  const targets = index != null ? [tip.actions[index]] : tip.actions;
  for (const a of targets) {
    if (!a) continue;
    if (applyTipAction(sim, side, a)) n++;
    const i = original.actions.findIndex((x) => x.kind === a.kind && x.value === a.value && x.outId === a.outId && x.inId === a.inId);
    if (i >= 0) done.add(i);
  }
  if (original.actions.every((_, i) => done!.has(i)) || index == null) M.done.add(tip.id);
  M.key = "";
  return n;
}
