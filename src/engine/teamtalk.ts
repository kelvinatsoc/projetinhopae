// Preleção (antes do jogo) e conversa no intervalo: um toque, reações com emoji e um efeito pequeno e real.
// Tudo determinístico por partida (gerador próprio): não mexe no gerador global do mundo.
import { isBigMatch } from "./common";
import { autoLineup, lineupStrength, validLineup } from "./lineup";
import { H, hidOf } from "./personality";
import { clamp, hashString, makeRng } from "./rng";
import { staffStars } from "./staff";
import { hasTrait } from "./traits";
import type { Club, Fixture, Lineup, Player, World } from "./types";

export type Tone = "motivar" | "calma" | "exigir" | "confiar" | "elogiar";
export type TalkPhase = "pre" | "half";

export interface TalkCtx {
  diff: number; // força nossa − deles (+2 em casa)
  phase: TalkPhase;
  score: number; // gols nossos − deles
  morale?: number; // moral média dos titulares
  lid?: boolean; // o capitão é Líder
}

export const TONES: Record<Tone, { emoji: string; label: string; bubble: string }> = {
  motivar: { emoji: "🔥", label: "Vamos pra cima!", bubble: "Levanta o grupo!" },
  calma: { emoji: "😌", label: "Joguem sem pressão", bubble: "Somos zebra hoje, tira a pressão deles." },
  exigir: { emoji: "😤", label: "Quero vitória!", bubble: "Somos favoritos: cobra o time!" },
  confiar: { emoji: "🤝", label: "Confio em vocês", bubble: "Jogo equilibrado, mostra confiança." },
  elogiar: { emoji: "👏", label: "Muito bem, continuem", bubble: "Estão jogando bem, só elogia." },
};

export const PRE_TONES: Tone[] = ["motivar", "calma", "exigir", "confiar"];

/** Os 4 botões do intervalo, conforme o placar. */
export function halfTones(score: number): Tone[] {
  if (score < 0) return ["exigir", "motivar", "calma", "elogiar"];
  if (score === 0) return ["motivar", "confiar", "elogiar", "exigir"];
  return ["elogiar", "calma", "exigir", "motivar"];
}

export const tonesFor = (ctx: TalkCtx) => (ctx.phase === "pre" ? PRE_TONES : halfTones(ctx.score));

/** Efeito da conversa (fração somada à força do time: +0,02 = +2%). */
export function talkEffect(ctx: TalkCtx, tone: Tone): number {
  const { diff } = ctx;
  let e = 0;
  if (ctx.phase === "pre") {
    if (tone === "motivar") e = 0.02 + ((ctx.morale ?? 0) >= 85 ? 0.005 : 0);
    else if (tone === "calma") e = diff <= -3 ? 0.03 : diff >= 3 ? -0.01 : 0.01;
    else if (tone === "exigir") e = diff >= 3 ? 0.03 : diff <= -3 ? -0.02 : 0.01;
    else if (tone === "confiar") e = Math.abs(diff) < 3 ? 0.025 : 0.01;
  } else if (ctx.score < 0) {
    e = { exigir: 0.04, motivar: 0.025, calma: 0.01, elogiar: -0.02, confiar: 0 }[tone];
  } else if (ctx.score === 0) {
    e = { motivar: 0.03, confiar: 0.015, elogiar: 0.015, exigir: 0.01, calma: 0 }[tone];
  } else {
    e = { elogiar: 0.025, calma: 0.01, exigir: diff <= 0 ? 0.02 : -0.01, motivar: 0.01, confiar: 0 }[tone];
  }
  if (ctx.lid) e *= 1.25;
  return clamp(e, -0.03, 0.05);
}

/** Monta o contexto a partir das escalações (antes do jogo ou no intervalo). */
export function talkCtx(w: World, f: Fixture, club: Club, mine: Lineup, opp: Club, theirs: Lineup, phase: TalkPhase, score = 0): TalkCtx {
  const home = f.home === club.id && !f.neutral;
  const ids = mine.starters.filter((x): x is number => x != null);
  const ps = ids.map((id) => w.players[id]).filter(Boolean);
  const cap = mine.captain != null ? w.players[mine.captain] : undefined;
  return {
    diff: lineupStrength(w, club, mine) - lineupStrength(w, opp, theirs) + (home ? 2 : 0),
    phase,
    score,
    morale: ps.length ? ps.reduce((s, p) => s + p.morale, 0) / ps.length : 70,
    lid: !!cap && ids.includes(cap.id) && hasTrait(cap, "LID"),
  };
}

/** Tons do contexto do melhor para o pior. */
export function rankTones(ctx: TalkCtx): Tone[] {
  return tonesFor(ctx).slice().sort((a, b) => talkEffect(ctx, b) - talkEffect(ctx, a));
}

/** Sugestão do auxiliar: acerta o melhor tom com 50% + 10% por estrela (IA: 80%). */
export function suggest(w: World, f: Fixture, ctx: TalkCtx, side: 0 | 1): Tone {
  const club = w.clubs[side === 0 ? f.home : f.away];
  const stars = club ? staffStars(w, club, "aux") : 3;
  const rng = makeRng(hashString(`sug:${w.seed}:${f.id}:${side}:${ctx.phase}`));
  const ranked = rankTones(ctx);
  return rng() < 0.5 + 0.1 * stars ? ranked[0] : ranked[1];
}

/** Conversa da IA: o melhor tom 60% das vezes, senão "confio em vocês". */
export function aiTalk(w: World, f: Fixture, ctx: TalkCtx, side: 0 | 1): Tone {
  const rng = makeRng(hashString(`ai:${w.seed}:${f.id}:${side}:${ctx.phase}`));
  return rng() < 0.6 ? rankTones(ctx)[0] : "confiar";
}

export type ReactionEmoji = "🔥" | "🙂" | "😐" | "😟";
export interface Reaction { pid: number; emoji: ReactionEmoji; v: number; morale: number }

const MORALE: Record<ReactionEmoji, number> = { "🔥": 3, "🙂": 1, "😐": 0, "😟": -3 };

/** Reação de cada titular (não aplica nada: quem aplica a moral é MatchSim.applyTalk). */
export function reactions(w: World, f: Fixture, ids: number[], tone: Tone, ctx: TalkCtx): Reaction[] {
  const eff = talkEffect(ctx, tone);
  const big = isBigMatch(w, f);
  return ids.map((pid) => {
    const p: Player | undefined = w.players[pid];
    const rng = makeRng(hashString(`talk:${w.seed}:${f.id}:${pid}:${ctx.phase}`));
    let u = rng();
    if (u <= 0) u = 1e-9;
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    let v = eff * 100 + z * 1.5;
    if (p) {
      const h = hidOf(p);
      if (big && h[H.big] <= 6) v -= 1;
      if (tone === "exigir" && h[H.pro] <= 6) v -= 1;
      if (tone === "exigir" && h[H.temp] >= 16) v -= 1;
    }
    const emoji: ReactionEmoji = v > 2.5 ? "🔥" : v > 0.5 ? "🙂" : v > -1 ? "😐" : "😟";
    return { pid, emoji, v, morale: MORALE[emoji] };
  });
}

/** Preleção do usuário antes do jogo: contexto, titulares e a sugestão do auxiliar. */
export function userPreTalk(w: World, f: Fixture): { ctx: TalkCtx; tone: Tone; side: 0 | 1; ids: number[] } {
  const user = w.clubs[w.userClubId];
  const side: 0 | 1 = f.away === user.id ? 1 : 0;
  const opp = w.clubs[side === 0 ? f.away : f.home];
  const mine = validLineup(w, user, f.comp);
  const ctx = talkCtx(w, f, user, mine, opp, autoLineup(w, opp, f.comp), "pre");
  return { ctx, tone: suggest(w, f, ctx, side), side, ids: mine.starters.filter((x): x is number => x != null) };
}
