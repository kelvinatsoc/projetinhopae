// Motor de partida: simulação minuto a minuto baseada na força de cada setor.
// O mesmo motor serve para o jogo ao vivo (passo a passo) e para a simulação rápida.
import { phrase } from "./commentary";
import { needsPenalties } from "./competitions";
import { lineupStrength, validLineup, autoLineup } from "./lineup";
import { FORMATIONS, ovrAt, POS_GROUP } from "./positions";
import { shortName } from "./player";
import { chance, clamp, gauss, pickWeighted, rand, randInt } from "./rng";
import type { Club, Fixture, Lineup, MatchEvent, MatchResult, MatchStats, Player, Pos, World } from "./types";

interface Side {
  club: Club;
  slots: Pos[];
  onPitch: (number | null)[]; // id por slot (null = expulso)
  bench: number[];
  subsLeft: number;
  windowsLeft: number;
  mentality: number;
  pressing: number;
  goals: number;
  played: number[];
  rating: Map<number, number>;
  yellows: Set<number>;
  att: number;
  mid: number;
  def: number;
  gk: number;
  auto: boolean; // IA faz substituições
  captain?: number;
}

const SHOOT_W: Record<Pos, number> = { GOL: 0, ZAG: 0.12, LD: 0.12, LE: 0.12, VOL: 0.14, MC: 0.28, MEI: 0.5, PD: 0.55, PE: 0.55, ATA: 0.85 };
const ASSIST_W: Record<Pos, number> = { GOL: 0.02, ZAG: 0.1, LD: 0.45, LE: 0.45, VOL: 0.25, MC: 0.6, MEI: 1, PD: 0.8, PE: 0.8, ATA: 0.45 };
const DEF_W: Record<Pos, number> = { GOL: 0, ZAG: 1, LD: 0.8, LE: 0.8, VOL: 0.55, MC: 0.2, MEI: 0.05, PD: 0.05, PE: 0.05, ATA: 0 };
const MID_W: Record<Pos, number> = { GOL: 0, ZAG: 0.05, LD: 0.25, LE: 0.25, VOL: 0.8, MC: 1, MEI: 0.8, PD: 0.4, PE: 0.4, ATA: 0.1 };
const ATT_W: Record<Pos, number> = { GOL: 0, ZAG: 0, LD: 0.15, LE: 0.15, VOL: 0.05, MC: 0.15, MEI: 0.6, PD: 0.9, PE: 0.9, ATA: 1 };
const BASE = { def: 4.9, mid: 4.4, att: 3.6 }; // somatório de pesos num 4-3-3 típico

// Constantes de calibração (médias do Brasileirão: ~2,4 gols e ~24 finalizações por jogo)
export const TUNING = { shotBase: 0.23, shotExp: 1.6, xgBase: 0.066, xgSpread: 0.55, xgAttDiv: 40, penBase: 0.0017 };

export interface MatchOptions {
  userSide?: 0 | 1 | null; // lado controlado pelo usuário (sem substituições automáticas)
  live?: boolean; // gera narração detalhada
}

export class MatchSim {
  w: World;
  f: Fixture;
  sides: [Side, Side];
  minute = 0;
  half: 1 | 2 = 1;
  stoppage = [randInt(1, 3), randInt(2, 6)];
  events: MatchEvent[] = [];
  stats: MatchStats = { poss: [0, 0], shots: [0, 0], onTarget: [0, 0], corners: [0, 0], fouls: [0, 0], yellows: [0, 0], reds: [0, 0], xg: [0, 0] };
  finished = false;
  halftimeDone = false;
  live: boolean;
  userSide: 0 | 1 | null;
  pens?: [number, number];

  constructor(w: World, f: Fixture, opts: MatchOptions = {}) {
    this.w = w;
    this.f = f;
    this.live = !!opts.live;
    this.userSide = opts.userSide ?? null;
    const mk = (clubId: string, idx: 0 | 1): Side => {
      const club = w.clubs[clubId];
      const isUser = clubId === w.userClubId;
      if (!isUser) aiTactics(w, club, w.clubs[idx === 0 ? f.away : f.home], idx === 0 && !f.neutral);
      const lineup: Lineup = isUser ? validLineup(w, club, f.comp) : autoLineup(w, club, f.comp);
      const slots = (FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"]).map((s) => s.pos);
      const side: Side = {
        club, slots, onPitch: lineup.starters.slice(), bench: lineup.bench.slice(), subsLeft: 5, windowsLeft: 3,
        mentality: club.tactic.mentality, pressing: club.tactic.pressing, goals: 0,
        played: lineup.starters.filter((x): x is number => x !== null), rating: new Map(), yellows: new Set(),
        att: 0, mid: 0, def: 0, gk: 0, auto: this.userSide !== idx, captain: lineup.captain,
      };
      for (const id of side.played) side.rating.set(id, 6.0);
      return side;
    };
    this.sides = [mk(f.home, 0), mk(f.away, 1)];
    this.recompute();
  }

  player(id: number): Player {
    return this.w.players[id];
  }

  name(id: number | undefined | null) {
    return id != null ? shortName(this.player(id).name) : "";
  }

  /** Recalcula a força dos setores (cansaço, expulsões, substituições, mentalidade). */
  recompute() {
    for (let i = 0; i < 2; i++) {
      const s = this.sides[i];
      let d = 0, dw = 0, m = 0, mw = 0, a = 0, aw = 0, gk = 30, count = 0;
      s.onPitch.forEach((id, k) => {
        if (id == null) return;
        count++;
        const p = this.player(id);
        const pos = s.slots[k];
        const eff = ovrAt(p, pos) * (0.7 + 0.3 * (p.cond / 100)) * (0.97 + 0.06 * (p.morale / 100));
        if (pos === "GOL") gk = eff;
        d += eff * DEF_W[pos]; dw += DEF_W[pos];
        m += eff * MID_W[pos]; mw += MID_W[pos];
        a += eff * ATT_W[pos]; aw += ATT_W[pos];
      });
      const line = (sum: number, w: number, base: number) => (w > 0 ? (sum / w) * Math.pow(w / base, 0.3) : 30);
      const shortHanded = count < 11 ? Math.pow(0.93, 11 - count) : 1;
      const home = i === 0 && !this.f.neutral ? 1 : 0;
      s.def = line(d, dw, BASE.def) * shortHanded * (1 - 0.03 * s.mentality) * (1 + 0.03 * home);
      s.mid = line(m, mw, BASE.mid) * shortHanded * (1 + 0.025 * (s.pressing - 1)) * (1 + 0.03 * home);
      s.att = line(a, aw, BASE.att) * shortHanded * (1 + 0.04 * s.mentality) * (1 + 0.07 * home);
      s.gk = gk;
    }
  }

  private ev(e: MatchEvent) {
    this.events.push(e);
    return e;
  }

  private rate(side: Side, id: number | null | undefined, delta: number) {
    if (id == null) return;
    side.rating.set(id, (side.rating.get(id) ?? 6) + delta);
  }

  private pickOnPitch(side: Side, weights: Record<Pos, number>, attr: keyof Player["attrs"], exclude?: number, power = 2): number | null {
    const ids: number[] = [];
    const ws: number[] = [];
    side.onPitch.forEach((id, k) => {
      if (id == null || id === exclude) return;
      const p = this.player(id);
      ids.push(id);
      ws.push(weights[side.slots[k]] * Math.pow(p.attrs[attr] / 70, power));
    });
    if (!ids.length) return null;
    return pickWeighted(ids, ws);
  }

  private gkId(side: Side): number | null {
    const k = side.slots.indexOf("GOL");
    return k >= 0 ? side.onPitch[k] : null;
  }

  displayMinute(): string {
    if (this.half === 1 && this.minute > 45) return `45+${this.minute - 45}'`;
    if (this.half === 2 && this.minute > 90) return `90+${this.minute - 90}'`;
    return `${this.minute}'`;
  }

  /** Avança um minuto. Retorna os eventos gerados. */
  step(): MatchEvent[] {
    if (this.finished) return [];
    const start = this.events.length;
    if (this.half === 1 && this.minute >= 45 + this.stoppage[0]) {
      this.half = 2;
      this.minute = 45;
      this.ev({ min: 45, type: "half", text: `Fim do primeiro tempo: ${this.sides[0].club.name} ${this.sides[0].goals} x ${this.sides[1].goals} ${this.sides[1].club.name}` });
      for (const s of this.sides) this.autoSubs(s, true);
      this.recompute();
      return this.events.slice(start);
    }
    if (this.half === 2 && this.minute >= 90 + this.stoppage[1]) {
      this.end();
      return this.events.slice(start);
    }
    this.minute++;
    const min = this.minute;
    const [H, A] = this.sides;

    // cansaço
    if (min % 5 === 0) {
      for (const s of this.sides) {
        for (const id of s.onPitch) {
          if (id == null) continue;
          const p = this.player(id);
          const rate = 0.26 * (1.25 - (p.attrs.fis / 100) * 0.6) * (1 + 0.15 * (s.pressing - 1));
          p.cond = clamp(p.cond - rate * 5, 5, 100);
        }
      }
      this.recompute();
    }

    // posse de bola
    const pm = Math.pow(H.mid, 3);
    const share = pm / (pm + Math.pow(A.mid, 3));
    const atk = rand() < share ? 0 : 1;
    const S = this.sides[atk];
    const O = this.sides[1 - atk];
    this.stats.poss[atk]++;

    // chance de finalização neste minuto
    const ratio = S.att / Math.max(20, O.def);
    const openness = 1 + 0.06 * S.mentality + 0.03 * O.mentality;
    const pShot = TUNING.shotBase * Math.pow(ratio, TUNING.shotExp) * openness;
    if (chance(pShot)) this.shot(atk);
    else if (chance(0.045)) {
      this.stats.corners[atk]++;
      if (this.live && chance(0.3)) this.ev({ min, type: "info", side: atk as 0 | 1, text: phrase("corner", { t: S.club.name, p: this.name(this.pickOnPitch(S, ASSIST_W, "pas")) }) });
    } else {
      // desarmes contam pontos para defensores
      const d = this.pickOnPitch(O, DEF_W, "def");
      this.rate(O, d, 0.025);
    }

    // pênalti
    if (chance(TUNING.penBase * ratio)) this.penalty(atk);

    // faltas e cartões (o time sem a bola comete mais)
    if (chance(0.27)) {
      const foulSide = chance(0.62) ? 1 - atk : atk;
      const F = this.sides[foulSide];
      this.stats.fouls[foulSide]++;
      if (chance(0.17)) this.card(foulSide, F);
      else if (this.live && chance(0.04)) this.ev({ min, type: "info", text: phrase("info", { t: S.club.name, p: this.name(this.pickOnPitch(S, ATT_W, "dri")) }) });
    }

    // lesões
    for (let i = 0; i < 2; i++) if (chance(0.0018)) this.injury(i as 0 | 1);

    // narração ambiente
    if (this.live && this.events.length === start && chance(0.12)) {
      this.ev({ min, type: "info", side: atk as 0 | 1, text: phrase("info", { t: S.club.name, p: this.name(this.pickOnPitch(S, MID_W, "pas")) }) });
    }

    // substituições da IA
    if (min >= 55) for (const s of this.sides) this.autoSubs(s, false);
    return this.events.slice(start);
  }

  private shot(atk: number) {
    const S = this.sides[atk];
    const O = this.sides[1 - atk];
    const min = this.minute;
    const shooter = this.pickOnPitch(S, SHOOT_W, "fin", undefined, 1.5);
    if (shooter == null) return;
    const sp = this.player(shooter);
    const z = gauss(0, 1);
    const xg = clamp(TUNING.xgBase * Math.exp(TUNING.xgSpread * z + (sp.attrs.fin - 75) / 30 + (S.att - O.def) / TUNING.xgAttDiv), 0.02, 0.6);
    this.stats.shots[atk]++;
    this.stats.xg[atk] += xg;
    const gk = this.gkId(O);
    const gkEff = O.gk;
    const pGoal = clamp(xg * (1 + (70 - gkEff) / 50), 0.01, 0.75);
    const assister = chance(0.75) ? this.pickOnPitch(S, ASSIST_W, "pas", shooter) : null;
    if (this.live && xg > 0.3 && chance(0.6)) {
      this.ev({ min, type: "chance", side: atk as 0 | 1, pid: shooter, text: phrase("bigChance", { p: this.name(shooter), a: this.name(assister) }) });
    }
    if (rand() < pGoal) {
      if (chance(0.03)) {
        this.stats.onTarget[atk]++;
        this.ev({ min, type: "var", side: atk as 0 | 1, pid: shooter, text: phrase("var", { p: this.name(shooter) }) });
        return;
      }
      this.stats.onTarget[atk]++;
      if (chance(0.025)) {
        const og = this.pickOnPitch(O, DEF_W, "def");
        this.goal(atk, og ?? shooter, undefined, "owngoal");
        this.rate(O, og, -1);
        return;
      }
      this.goal(atk, shooter, assister ?? undefined, "goal");
      return;
    }
    const onTarget = rand() < 0.3 + xg * 0.6;
    if (onTarget) {
      this.stats.onTarget[atk]++;
      this.rate(S, shooter, 0.1);
      this.rate(O, gk, 0.28);
      if (this.live || xg > 0.25) this.ev({ min, type: "save", side: atk as 0 | 1, pid: shooter, text: phrase("save", { p: this.name(shooter), g: this.name(gk) }) });
    } else if (chance(0.06)) {
      this.rate(S, shooter, 0.05);
      this.ev({ min, type: "post", side: atk as 0 | 1, pid: shooter, text: phrase("post", { p: this.name(shooter) }) });
    } else {
      this.rate(S, shooter, -0.06);
      if (this.live) this.ev({ min, type: "miss", side: atk as 0 | 1, pid: shooter, text: phrase("miss", { p: this.name(shooter) }) });
    }
  }

  private goal(atk: number, scorer: number, assist: number | undefined, kind: "goal" | "owngoal" | "pen-goal") {
    const S = this.sides[atk];
    const O = this.sides[1 - atk];
    S.goals++;
    const gk = this.gkId(O);
    if (kind !== "owngoal") {
      const p = this.player(scorer);
      this.rate(S, scorer, POS_GROUP[p.pos] === "DEF" ? 1.15 : 1.0);
      if (assist != null) this.rate(S, assist, 0.6);
    }
    this.rate(O, gk, -0.35);
    O.onPitch.forEach((id, k) => {
      if (id == null) return;
      const g = POS_GROUP[O.slots[k]];
      if (g === "DEF") this.rate(O, id, -0.18);
      else if (g === "MID") this.rate(O, id, -0.05);
    });
    const text =
      kind === "owngoal"
        ? phrase("ownGoal", { p: this.name(scorer) })
        : kind === "pen-goal"
          ? phrase("penGoal", { p: this.name(scorer), g: this.name(gk) })
          : phrase("goal", { p: this.name(scorer), a: assist != null ? this.name(assist) : undefined, t: S.club.name, g: this.name(gk) });
    this.ev({ min: this.minute, type: kind, side: atk as 0 | 1, pid: scorer, pid2: assist, text: `${text} (${this.sides[0].goals} x ${this.sides[1].goals})` });
  }

  private penalty(atk: number) {
    const S = this.sides[atk];
    const O = this.sides[1 - atk];
    const fouled = this.pickOnPitch(S, ATT_W, "dri");
    this.ev({ min: this.minute, type: "info", side: atk as 0 | 1, text: phrase("penAward", { t: S.club.name, p: this.name(fouled) }) });
    // cobrador: melhor finalizador em campo
    let taker: number | null = null;
    let best = -1;
    for (const id of S.onPitch) {
      if (id == null) continue;
      const p = this.player(id);
      if (p.pos !== "GOL" && p.attrs.fin > best) { best = p.attrs.fin; taker = id; }
    }
    if (taker == null) return;
    this.stats.shots[atk]++;
    this.stats.xg[atk] += 0.76;
    const gk = this.gkId(O);
    const p = clamp(0.74 + (best - 70) / 200 - (O.gk - 70) / 250, 0.5, 0.92);
    if (rand() < p) {
      this.stats.onTarget[atk]++;
      this.goal(atk, taker, undefined, "pen-goal");
    } else {
      this.rate(S, taker, -0.6);
      this.rate(O, gk, 0.6);
      this.ev({ min: this.minute, type: "pen-miss", side: atk as 0 | 1, pid: taker, text: phrase("penMiss", { p: this.name(taker), g: this.name(gk) }) });
    }
    // falta no pênalti pode gerar cartão
    if (chance(0.35)) this.card(1 - atk, O);
  }

  private card(sideIdx: number, F: Side) {
    const id = this.pickOnPitch(F, DEF_W, "def") ?? this.pickOnPitch(F, MID_W, "def");
    if (id == null) return;
    const straightRed = chance(0.025);
    if (straightRed || F.yellows.has(id)) {
      this.stats.reds[sideIdx]++;
      if (!straightRed) this.stats.yellows[sideIdx]++;
      this.rate(F, id, -1.5);
      this.ev({ min: this.minute, type: "red", side: sideIdx as 0 | 1, pid: id, text: phrase(straightRed ? "red" : "secondYellow", { p: this.name(id), t: F.club.name }) });
      const k = F.onPitch.indexOf(id);
      F.onPitch[k] = null;
      // se o goleiro foi expulso, um jogador de linha vai para o gol
      if (F.slots[k] === "GOL") this.emergencyGK(F, k);
      this.recompute();
    } else {
      F.yellows.add(id);
      this.stats.yellows[sideIdx]++;
      this.rate(F, id, -0.3);
      this.ev({ min: this.minute, type: "yellow", side: sideIdx as 0 | 1, pid: id, text: phrase("yellow", { p: this.name(id) }) });
    }
  }

  private emergencyGK(F: Side, gkSlot: number) {
    const benchGk = F.bench.find((b) => this.player(b).pos === "GOL");
    if (benchGk && F.subsLeft > 0) {
      // tira um jogador de linha para colocar o goleiro reserva
      let worst = -1, worstVal = 999;
      F.onPitch.forEach((id, k) => {
        if (id == null || k === gkSlot) return;
        const v = ovrAt(this.player(id), F.slots[k]);
        if (v < worstVal) { worstVal = v; worst = k; }
      });
      if (worst >= 0) {
        const out = F.onPitch[worst]!;
        F.onPitch[worst] = null;
        F.onPitch[gkSlot] = benchGk;
        F.slots[gkSlot] = "GOL";
        this.doSubBookkeeping(F, out, benchGk);
      }
    }
  }

  private doSubBookkeeping(F: Side, out: number, inn: number) {
    F.bench = F.bench.filter((b) => b !== inn);
    F.subsLeft--;
    if (!F.played.includes(inn)) F.played.push(inn);
    F.rating.set(inn, F.rating.get(inn) ?? 6.0);
    const sideIdx = this.sides.indexOf(F) as 0 | 1;
    this.ev({ min: this.minute, type: "sub", side: sideIdx, pid: inn, pid2: out, text: phrase("sub", { t: F.club.name, p: this.name(inn), a: this.name(out) }) });
  }

  private injury(sideIdx: 0 | 1) {
    const F = this.sides[sideIdx];
    const cand = F.onPitch.filter((x): x is number => x != null);
    if (!cand.length) return;
    const id = cand[Math.floor(rand() * cand.length)];
    const p = this.player(id);
    const days = pickWeighted([randInt(3, 7), randInt(8, 21), randInt(22, 60), randInt(61, 160)], [50, 30, 15, 5]);
    p.injury = Math.max(p.injury, days);
    p.injuryName = injuryName(days);
    this.ev({ min: this.minute, type: "injury", side: sideIdx, pid: id, text: phrase("injury", { p: this.name(id), t: F.club.name }) });
    // substituição forçada (inclusive para o usuário, para não travar o jogo)
    if (F.subsLeft > 0 && F.bench.length) {
      const k = F.onPitch.indexOf(id);
      const pos = F.slots[k];
      const best = F.bench.map((b) => this.player(b)).filter((b) => (pos === "GOL") === (b.pos === "GOL")).sort((a, b) => ovrAt(b, pos) - ovrAt(a, pos))[0];
      if (best) this.substitute(sideIdx, id, best.id, true);
    }
  }

  /** Substituição (usada pela IA e pelo usuário). */
  substitute(sideIdx: 0 | 1, outId: number, inId: number, forced = false): boolean {
    const F = this.sides[sideIdx];
    const k = F.onPitch.indexOf(outId);
    if (k < 0 || F.subsLeft <= 0 || !F.bench.includes(inId)) return false;
    if (!forced) {
      if (F.windowsLeft <= 0 && this.minute < 90) return false;
    }
    F.onPitch[k] = inId;
    this.doSubBookkeeping(F, outId, inId);
    this.recompute();
    return true;
  }

  /** Troca de posição entre dois jogadores em campo (usuário). */
  swapSlots(sideIdx: 0 | 1, a: number, b: number) {
    const F = this.sides[sideIdx];
    [F.onPitch[a], F.onPitch[b]] = [F.onPitch[b], F.onPitch[a]];
    this.recompute();
  }

  setMentality(sideIdx: 0 | 1, m: number) {
    this.sides[sideIdx].mentality = clamp(m, -2, 2);
    this.recompute();
  }

  private lastWindowMin = [-10, -10];

  private autoSubs(F: Side, halftime: boolean) {
    if (!F.auto || F.subsLeft <= 0 || F.windowsLeft <= 0) return;
    const sideIdx = this.sides.indexOf(F);
    const min = this.minute;
    if (!halftime && min - this.lastWindowMin[sideIdx] < 8) return;
    if (!halftime && !(min === 60 || min === 70 || min === 78 || min === 85)) return;
    const O = this.sides[1 - sideIdx];
    const diff = F.goals - O.goals;
    const changes: [number, number][] = [];
    const want = halftime ? (chance(0.25) ? 1 : 0) : min <= 60 ? randInt(1, 2) : min <= 78 ? randInt(1, 2) : 1;
    const used = new Set<number>();
    for (let n = 0; n < want && F.subsLeft - changes.length > 0; n++) {
      // pior jogador em campo (cansaço + nota)
      let worstK = -1, worstScore = 999;
      F.onPitch.forEach((id, k) => {
        if (id == null || used.has(id) || F.slots[k] === "GOL") return;
        const p = this.player(id);
        let score = p.cond * 0.6 + (F.rating.get(id) ?? 6) * 8;
        if (diff < 0 && min >= 65 && POS_GROUP[F.slots[k]] === "DEF") score -= 6;
        if (diff > 0 && min >= 78 && POS_GROUP[F.slots[k]] === "ATT") score -= 6;
        if (score < worstScore) { worstScore = score; worstK = k; }
      });
      if (worstK < 0) break;
      const out = F.onPitch[worstK]!;
      if (this.player(out).cond > 75 && (F.rating.get(out) ?? 6) >= 6.3) break;
      const pos = F.slots[worstK];
      const pool = F.bench.filter((b) => !changes.some(([, i]) => i === b) && this.player(b).pos !== "GOL");
      if (!pool.length) break;
      const best = pool.map((b) => this.player(b)).sort((a, b) => ovrAt(b, pos) - ovrAt(a, pos))[0];
      if (diff < 0 && min >= 65 && POS_GROUP[pos] === "DEF") {
        const atkSub = pool.map((b) => this.player(b)).filter((b) => POS_GROUP[b.pos] === "ATT").sort((a, b) => b.ovr - a.ovr)[0];
        if (atkSub) { changes.push([out, atkSub.id]); used.add(out); continue; }
      }
      changes.push([out, best.id]);
      used.add(out);
    }
    if (!changes.length) return;
    F.windowsLeft--;
    this.lastWindowMin[sideIdx] = min;
    for (const [o, i] of changes) {
      const k = F.onPitch.indexOf(o);
      if (k < 0 || F.subsLeft <= 0) continue;
      F.onPitch[k] = i;
      // atacante entrando no lugar de defensor vira atacante
      if (POS_GROUP[F.slots[k]] === "DEF" && POS_GROUP[this.player(i).pos] === "ATT") F.slots[k] = this.player(i).pos;
      this.doSubBookkeeping(F, o, i);
    }
    this.recompute();
  }

  /** Janela de substituição do usuário (conta como uma das 3 paradas). */
  useWindow(sideIdx: 0 | 1) {
    if (this.minute !== 45 || this.half !== 2) this.sides[sideIdx].windowsLeft = Math.max(0, this.sides[sideIdx].windowsLeft - 1);
  }

  private end() {
    const [H, A] = this.sides;
    this.ev({ min: this.minute, type: "end", text: `Fim de jogo! ${H.club.name} ${H.goals} x ${A.goals} ${A.club.name}` });
    if (needsPenalties(this.w, this.f, H.goals, A.goals)) this.shootout();
    this.finished = true;
  }

  private shootout() {
    const order = (s: Side) =>
      s.onPitch.filter((x): x is number => x != null).sort((a, b) => this.player(b).attrs.fin - this.player(a).attrs.fin);
    const ta = order(this.sides[0]);
    const tb = order(this.sides[1]);
    let a = 0, b = 0;
    const kick = (taker: number, gkSide: Side) => rand() < clamp(0.74 + (this.player(taker).attrs.fin - 70) / 200 - (gkSide.gk - 70) / 250, 0.5, 0.92);
    for (let r = 0; r < 30; r++) {
      const sa = kick(ta[r % ta.length], this.sides[1]);
      const sb = kick(tb[r % tb.length], this.sides[0]);
      if (sa) a++;
      if (sb) b++;
      if (r < 5) {
        if (a > b + (4 - r) || b > a + (4 - r)) break;
      } else if (a !== b) break;
    }
    if (a === b) a++;
    this.pens = [a, b];
    const winner = a > b ? this.sides[0] : this.sides[1];
    this.ev({ min: this.minute, type: "info", text: `Pênaltis: ${this.sides[0].club.name} ${a} x ${b} ${this.sides[1].club.name}. ${winner.club.name} avança!` });
  }

  runToEnd() {
    let guard = 0;
    while (!this.finished && guard++ < 200) this.step();
  }

  result(): MatchResult {
    const [H, A] = this.sides;
    const ratings: Record<number, number> = {};
    const finalize = (s: Side, scored: number, conceded: number) => {
      const res = scored > conceded ? 0.25 : scored < conceded ? -0.25 : 0;
      for (const id of s.played) {
        const p = this.player(id);
        let r = (s.rating.get(id) ?? 6) + res + gauss(0, 0.3) + (p.ovr - 70) / 45;
        if (conceded === 0) {
          if (p.pos === "GOL") r += 0.6;
          else if (POS_GROUP[p.pos] === "DEF") r += 0.35;
        }
        ratings[id] = Math.round(clamp(r, 3, 10) * 10) / 10;
      }
    };
    finalize(H, H.goals, A.goals);
    finalize(A, A.goals, H.goals);
    let motm: number | undefined;
    let best = -1;
    const winner: Side | null = H.goals > A.goals ? H : A.goals > H.goals ? A : null;
    for (const [idStr, r] of Object.entries(ratings)) {
      const id = Number(idStr);
      const sideBonus = winner && winner.played.includes(id) ? 0.3 : 0;
      if (r + sideBonus > best) { best = r + sideBonus; motm = id; }
    }
    const total = this.stats.poss[0] + this.stats.poss[1] || 1;
    const p0 = Math.round((this.stats.poss[0] / total) * 100);
    return {
      hg: H.goals,
      ag: A.goals,
      pens: this.pens,
      events: this.events.filter((e) => e.type !== "info" || e.text.startsWith("Pênaltis") || e.text.includes("Pênalti para") || e.text.includes("pênalti")),
      stats: { ...this.stats, poss: [p0, 100 - p0], xg: [round2(this.stats.xg[0]), round2(this.stats.xg[1])] },
      ratings,
      lineups: [H.played.slice(), A.played.slice()],
      motm,
    };
  }

  strengthLabel(sideIdx: 0 | 1) {
    const s = this.sides[sideIdx];
    return { att: Math.round(s.att), mid: Math.round(s.mid), def: Math.round(s.def), gk: Math.round(s.gk) };
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function injuryName(days: number): string {
  if (days <= 7) return "Pancada / desconforto muscular";
  if (days <= 21) return "Estiramento muscular";
  if (days <= 60) return "Lesão muscular grave";
  return "Lesão no joelho";
}

/** A IA ajusta mentalidade conforme a força do adversário e o mando. */
function aiTactics(w: World, club: Club, opp: Club, home: boolean) {
  const mine = lineupStrength(w, club, autoLineup(w, club, undefined, club.tactic.formation, false));
  const theirs = lineupStrength(w, opp, autoLineup(w, opp, undefined, opp.tactic.formation, false));
  const diff = mine - theirs + (home ? 2 : -1);
  club.tactic.mentality = diff > 5 ? 1 : diff < -6 ? -1 : 0;
  club.tactic.pressing = diff > 3 ? 2 : 1;
}

/** Simulação completa e instantânea. */
export function simulateFixture(w: World, f: Fixture): MatchResult {
  const sim = new MatchSim(w, f, { live: false, userSide: null });
  sim.runToEnd();
  return sim.result();
}
