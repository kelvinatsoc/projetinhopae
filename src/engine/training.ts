// Treino: foco do time, intensidade, treino individual e evolução mensal (setas ▲▼).
// A evolução acontece todo dia 1º (fevereiro a dezembro) para TODOS os jogadores e substitui
// as antigas evoluções do meio e do fim da temporada (midSeasonTick e seasonEndDevelop viraram no-ops).
import { adminCheats } from "./admin";
import { monthOf } from "./calendar";
import { addNews } from "./news";
import { H, hidOf } from "./personality";
import { age, applyDelta, devParams, FOCUS_ATTRS } from "./player";
import { ATTR_NAMES, POS_NAME, recalcOvr } from "./positions";
import { chance, clamp, gauss, rand, randInt } from "./rng";
import { staffStars } from "./staff";
import { canLearn, hasTrait, TRAIT_UNLOCK_OVR, TRAITS } from "./traits";
import type { Attrs, Club, Player, TeamFocus, World } from "./types";

/** Multiplicadores do foco de treino lidos pelo motor de partida (neutros para a IA e para "Equilibrado"). */
export interface FocusMods { att: number; def: number; fatigue: number; setPiece: number; pen: number }
const NEUTRAL_FOCUS: FocusMods = { att: 1, def: 1, fatigue: 1, setPiece: 1, pen: 0 };

export const DEFAULT_TRAIN: NonNullable<Club["train"]> = { focus: "eq", int: 1 };
export const trainOf = (c: Club) => c.train ?? DEFAULT_TRAIN;

/** Textos do foco do time (tela de treino). */
export const FOCUS_INFO: Record<TeamFocus, { emoji: string; label: string; effect: string }> = {
  eq: { emoji: "⚖️", label: "Equilibrado", effect: "Treino completo, sem pontos fortes nem fracos." },
  fis: { emoji: "💪", label: "Físico", effect: "Cansam 8% menos nos jogos; velocidade e físico evoluem mais." },
  atk: { emoji: "⚔️", label: "Ataque", effect: "Ataque +2%, defesa −1%; finalização e drible evoluem mais." },
  def: { emoji: "🛡️", label: "Defesa", effect: "Defesa +2%, ataque −1%; marcação e físico evoluem mais." },
  tat: { emoji: "🧠", label: "Tático", effect: "Entrosamento sobe mais rápido e posições novas são aprendidas mais depressa." },
  bola: { emoji: "🎯", label: "Bola parada", effect: "Mais gols de falta e escanteio; pênaltis +3%." },
  rec: { emoji: "🛌", label: "Recuperação", effect: "Recuperam o físico e voltam de lesão mais rápido, mas evoluem 20% menos." },
};

export const INTENSITY_LABELS = ["Leve", "Normal", "Puxado"] as const;
const INT_DEV = [0.9, 1, 1.12];
const INT_COND = [1.5, 0, -1.5];

/** Fração da meia temporada que cada treino mensal representa (11 treinos = 2 metades). */
const FRAC = 2 / 11;
const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** O jogador conta como "seu" para setas e treino individual (no elenco ou emprestado por você). */
export const isUserOwned = (w: World, p: Player) => p.clubId === w.userClubId || p.loan?.from === w.userClubId;

/** Progresso mensal de um treino de posição nova. */
export function posProgress(w: World, p: Player, club: Club): number {
  return 10 + 2 * staffStars(w, club, "tre") + (age(p, w.season) <= 23 ? 4 : 0) + (hasTrait(p, "VER") ? 10 : 0) + (trainOf(club).focus === "tat" ? 4 : 0);
}

/** Progresso mensal de um treino de jogada nova (ou de temperamento). */
export function traitProgress(w: World, p: Player, club: Club): number {
  return Math.max(3, Math.round(8 + 2 * staffStars(w, club, "tre") + (hidOf(p)[H.pro] - 10) * 0.6));
}

/** Chance de sucesso ao completar o treino de uma jogada. */
export const learnChance = (w: World, club: Club) => Math.min(0.95, 0.6 + 0.08 * staffStars(w, club, "tre"));

/** Pode trabalhar o temperamento? (esquentados) */
export const canCalm = (p: Player) => hasTrait(p, "PAV") || hidOf(p)[H.temp] >= 14;

// ---------------------------------------------------------------- evolução mensal
/** Fator de minutos em campo no mês. */
function playFactorOf(p: Player, club: Club | null): number {
  if (p.youth) return 0.68 + 0.04 * (club?.youthCoach ?? club?.youthLevel ?? 3);
  const ma = p.ma ?? 0;
  return ma >= 3 ? 1.25 : ma >= 1 ? 1.05 : 0.85;
}

/** Evolução de um jogador em um treino mensal. Consome o gerador global (dentro do avanço do dia). */
export function monthlyDevelop(w: World, p: Player) {
  const club = p.clubId ? w.clubs[p.clubId] : null;
  const user = !!club && club.id === w.userClubId;
  const a = age(p, w.season);
  const gap = p.pot - p.ovr;
  const pro = hidOf(p)[H.pro];
  let { mean, sd } = devParams(p, w.season, club?.facilities ?? 2, playFactorOf(p, club));
  mean *= FRAC;
  if (mean > 0) {
    mean *= 1.08; // compensa o efeito "juros compostos" de evoluir em parcelas
    mean *= 0.88 + 0.0114 * pro; // profissionalismo
    if (user && club) {
      const t = trainOf(club);
      mean *= 0.88 + 0.04 * staffStars(w, club, "tre");
      mean *= INT_DEV[t.int] ?? 1;
      if (t.focus === "rec") mean *= 0.8;
      if (p.youth && adminCheats(w).youthTurbo) mean *= 2;
    }
  } else if (mean < 0 && a >= 29) {
    mean *= 1.1 - 0.0095 * pro; // profissionais caem mais devagar
  }
  let delta = mean + gauss(0, sd * Math.sqrt(FRAC));
  if (p.legend && a <= 23) delta = Math.max(delta, Math.min(gap, 2.5) * FRAC);
  delta = clamp(delta, -1.5, 2.0);
  // acumulador fracionário: só mexe no overall quando completa um ponto inteiro
  p.dx = (p.dx ?? 0) + delta;
  let steps = Math.trunc(p.dx);
  if (steps > 0) {
    steps = Math.min(steps, p.pot - p.ovr);
    if (steps <= 0) {
      steps = 0;
      p.dx = Math.min(p.dx, 0.99);
    }
  }
  if (steps !== 0) {
    // treino individual de atributo: veteranos não perdem o atributo escolhido
    const keep = steps < 0 && a >= 29 && user && p.tf?.k === "attr" ? p.tf.a : null;
    const before = keep ? p.attrs[keep] : 0;
    const focus = user && club ? FOCUS_ATTRS[trainOf(club).focus] : undefined;
    applyDelta(p, steps, a, focus);
    if (keep && p.attrs[keep] < before) {
      p.attrs[keep] = before;
      recalcOvr(p);
    }
    p.dx -= steps;
  }
  p.dx = Math.round(p.dx * 1000) / 1000; // save enxuto
  if (p.pot < p.ovr) p.pot = p.ovr;
}

/** Jogada de lenda que desperta com o overall (uma por mês, no máximo). Devolve a jogada despertada. */
export function unlockLegendTrait(w: World, p: Player) {
  if (!p.lockedTraits?.length) return null;
  const traits = (p.traits ??= []);
  const need = TRAIT_UNLOCK_OVR[Math.min(2, Math.max(0, traits.length - 1))];
  if (p.ovr < need) return null;
  const t = p.lockedTraits.shift()!;
  if (!p.lockedTraits.length) delete p.lockedTraits;
  if (!traits.includes(t)) traits.push(t);
  const club = p.clubId ? w.clubs[p.clubId] : null;
  const where = club ? (club.id === w.userClubId ? " no seu time" : ` no ${club.name}`) : "";
  addNews(w, "legend", `⭐ ${p.name} despertou uma nova jogada: ${TRAITS[t].label}!`,
    `${TRAITS[t].emoji} ${TRAITS[t].desc} A lenda está cada vez mais parecida com o original${where}.`, { pid: p.id, clubId: club?.id });
  return t;
}

/** Treino individual de um jogador do usuário. Devolve uma linha de notícia quando algo se completa. */
function individualTick(w: World, p: Player, club: Club): string | null {
  const tf = p.tf;
  if (!tf) return null;
  if (p.injury > 0 || p.loan) return null; // pausa enquanto lesionado ou emprestado
  const a = age(p, w.season);
  if (tf.k === "attr") {
    if (a <= 28 && p.ovr < p.pot && chance(0.5)) {
      p.attrs[tf.a] = Math.min(99, p.attrs[tf.a] + 1);
      recalcOvr(p);
      if (p.ovr > p.pot) {
        p.attrs[tf.a]--;
        recalcOvr(p);
      }
    }
    return null;
  }
  if (tf.k === "pos") {
    if (p.pos === tf.pos || p.sec.includes(tf.pos)) { delete p.tf; return null; }
    tf.prog = Math.min(100, tf.prog + posProgress(w, p, club));
    if (tf.prog < 100) return null;
    if (p.sec.length >= 3) p.sec[2] = tf.pos;
    else p.sec.push(tf.pos);
    delete p.tf;
    const line = `🎓 ${p.name} aprendeu a jogar de ${POS_NAME[tf.pos]}`;
    addNews(w, "training", line, `Agora ${p.name} pode ser escalado como ${POS_NAME[tf.pos].toLowerCase()} quase sem perder rendimento.`, { pid: p.id });
    return line;
  }
  if (tf.k === "trait") {
    if (!canLearn(p, tf.t, w.season)) { delete p.tf; return null; }
    tf.prog = Math.min(100, tf.prog + traitProgress(w, p, club));
    if (tf.prog < 100) return null;
    const def = TRAITS[tf.t];
    if (rand() < learnChance(w, club)) {
      (p.traits ??= []).push(tf.t);
      delete p.tf;
      const line = `✅ ${p.name} aprendeu: ${def.label}!`;
      addNews(w, "training", line, `${def.emoji} ${def.desc}`, { pid: p.id });
      return line;
    }
    tf.prog = 0;
    const line = `❌ ${p.name} não conseguiu aprender ${def.label} desta vez — o treino continua.`;
    addNews(w, "training", line, "Com um treinador melhor a chance de sucesso aumenta.", { pid: p.id });
    return line;
  }
  // temperamento
  if (!canCalm(p)) { delete p.tf; return null; }
  tf.prog = Math.min(100, tf.prog + traitProgress(w, p, club));
  if (tf.prog < 100) return null;
  if (rand() < learnChance(w, club)) {
    const h = [...hidOf(p)] as NonNullable<Player["hid"]>;
    h[H.temp] = Math.max(1, h[H.temp] - 4);
    p.hid = h;
    if (h[H.temp] < 17 && p.traits) p.traits = p.traits.filter((t) => t !== "PAV");
    delete p.tf;
    const line = `🧘 ${p.name} está mais calmo: o temperamento melhorou!`;
    addNews(w, "training", line, "Menos cartões bobos daqui para a frente.", { pid: p.id });
    return line;
  }
  tf.prog = 0;
  const line = `❌ ${p.name} ainda perde a cabeça fácil — o trabalho continua.`;
  addNews(w, "training", line, "Com um treinador melhor a chance de sucesso aumenta.", { pid: p.id });
  return line;
}

/** Treino do mês (dia 1): evolução mensal, jogadas de lenda, treino individual e setas ▲▼. */
export function monthlyTraining(w: World) {
  const user = w.clubs[w.userClubId];
  // só o clube do usuário tem plano de treino (limpa sobras de um clube antigo)
  for (const c of Object.values(w.clubs)) if (c.train && c.id !== w.userClubId) delete c.train;
  const moves: { p: Player; d: number }[] = [];
  for (const p of Object.values(w.players)) {
    const mine = isUserOwned(w, p);
    const prev = p.ovr;
    monthlyDevelop(w, p);
    if (p.tf) {
      if (p.clubId === w.userClubId) individualTick(w, p, user);
      else if (!mine) delete p.tf; // vendido: o treino individual fica para trás
    }
    p.ma = 0;
    if (p.lockedTraits) unlockLegendTrait(w, p);
    if (mine) {
      p.ot = [p.ot?.[1] ?? prev, prev];
      p.trend = p.ovr - p.ot[0];
      if (!p.trend) delete p.trend;
      if (p.ovr !== prev) moves.push({ p, d: p.ovr - prev });
    } else if (p.ot || p.trend !== undefined) {
      delete p.ot;
      delete p.trend;
    }
  }
  if (moves.length) {
    moves.sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || b.d - a.d);
    const month = MONTHS_PT[monthOf(w.season, w.day) === 0 ? 0 : monthOf(w.season, w.day) - 1];
    const up = moves.filter((m) => m.d > 0).length;
    const down = moves.length - up;
    const list = moves.slice(0, 5).map((m) => `${m.p.name} ${m.d > 0 ? "▲" : "▼"}${Math.abs(m.d)}`).join(" · ");
    addNews(w, "training", `📈 Treino de ${month}: ${list}`,
      `${up} jogador${up === 1 ? "" : "es"} evoluí${up === 1 ? "u" : "ram"}${down ? ` e ${down} caí${down === 1 ? "u" : "ram"} de rendimento` : ""}. As setas ▲▼ aparecem ao lado dos nomes no elenco.`,
      { pid: moves[0].p.id });
  }
}

/** Antiga evolução de meio de temporada: substituída pela evolução mensal. */
export function midSeasonTick(_w: World) {
  // no-op: a evolução agora é mensal (monthlyTraining)
}

/** Antiga evolução de fim de temporada: substituída pela evolução mensal. */
export function seasonEndDevelop(_w: World, _p: Player, _y: number) {
  // no-op: a evolução agora é mensal (monthlyTraining)
}

// ---------------------------------------------------------------- diário
/** Bônus aditivo na recuperação diária de condição física (só o clube do usuário). */
export function recoveryBonus(w: World, _p: Player, club: Club | null): number {
  if (!club || club.id !== w.userClubId) return 0;
  const t = trainOf(club);
  return (t.focus === "rec" ? 3 : 0) + (INT_COND[t.int] ?? 0) + 0.3 * (staffStars(w, club, "fis") - 3);
}

/** Processamento diário do treino (lesões no treino puxado, recuperação extra). */
export function trainingDaily(w: World) {
  const club = w.clubs[w.userClubId];
  if (!club?.train) return;
  const t = club.train;
  if (t.int !== 2 && t.focus !== "rec") return;
  const noInj = !!adminCheats(w).noInj;
  const fis = staffStars(w, club, "fis");
  for (const id of club.players) {
    const p = w.players[id];
    if (!p) continue;
    if (t.focus === "rec" && p.injury > 1 && rand() < 0.3) p.injury--; // recuperação: volta mais cedo
    if (t.int === 2 && !noInj && !p.youth && p.injury === 0) {
      const risk = 0.0006 * (0.4 + hidOf(p)[H.inj] / 12.5) * (1.3 - 0.1 * fis);
      if (rand() < risk) {
        const days = randInt(3, 10);
        p.injury = days;
        p.injuryName = "Lesão no treino";
        addNews(w, "injury", `${p.name} se machucou no treino (${days} dias)`, "O treino puxado tem seu preço. Na tela de Treino dá para trocar a intensidade.", { pid: p.id });
      }
    }
  }
}

export function focusMods(club: Club): FocusMods {
  const f = club.train?.focus; // só o clube do usuário tem plano de treino
  switch (f) {
    case "fis": return { ...NEUTRAL_FOCUS, fatigue: 0.92 };
    case "atk": return { ...NEUTRAL_FOCUS, att: 1.02, def: 0.99 };
    case "def": return { ...NEUTRAL_FOCUS, att: 0.99, def: 1.02 };
    case "bola": return { ...NEUTRAL_FOCUS, setPiece: 1.4, pen: 0.03 };
    default: return { ...NEUTRAL_FOCUS };
  }
}

/** Entrosamento extra por mês dado pelo foco "Tático". */
export function tacticalChemBonus(club: Club): number {
  return club.train?.focus === "tat" ? 1 : 0;
}

// ---------------------------------------------------------------- ações da interface
/** Atributos que fazem sentido treinar para a posição do jogador. */
export function trainableAttrs(p: Player): (keyof Attrs)[] {
  return p.pos === "GOL" ? ["gol", "fis", "vel", "pas"] : ["vel", "fin", "pas", "dri", "def", "fis"];
}

/** Define o treino individual (valida o pedido). Devolve uma mensagem de erro ou null. */
export function setTrainFocus(w: World, p: Player, tf: Player["tf"] | null): string | null {
  if (p.clubId !== w.userClubId) return "Só jogadores do seu elenco têm treino individual.";
  if (!tf) { delete p.tf; return null; }
  if (tf.k === "trait" && !canLearn(p, tf.t, w.season)) return `${p.name} ainda não pode aprender ${TRAITS[tf.t].label}.`;
  if (tf.k === "calm" && !canCalm(p)) return `${p.name} já é tranquilo.`;
  if (tf.k === "pos" && (tf.pos === p.pos || p.sec.includes(tf.pos) || (tf.pos === "GOL") !== (p.pos === "GOL"))) return "Posição inválida.";
  if (tf.k === "attr" && !trainableAttrs(p).includes(tf.a)) return "Atributo inválido.";
  p.tf = tf;
  return null;
}

/** Texto curto do treino individual atual. */
export function trainFocusLabel(p: Player): string {
  const tf = p.tf;
  if (!tf) return "Sem treino individual";
  switch (tf.k) {
    case "attr": return `Atributo: ${ATTR_NAMES[tf.a]}`;
    case "pos": return `Nova posição: ${POS_NAME[tf.pos]}`;
    case "trait": return `Nova jogada: ${TRAITS[tf.t].emoji} ${TRAITS[tf.t].label}`;
    default: return "🧘 Trabalhar o temperamento";
  }
}
