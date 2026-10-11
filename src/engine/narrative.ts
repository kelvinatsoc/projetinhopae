// Estado narrativo (torcida, coletivas, interações) e efeitos dos clássicos.
import { derbyIntensity, derbyName } from "../data/rivalries";
import { moraleFloor } from "./dressing";
import { addNews } from "./news";
import { clamp } from "./rng";
import type { Fixture, MatchResult, NarrativeState, Player, World } from "./types";

/** Estado narrativo, criado sob demanda (saves antigos). */
export function narrativeOf(w: World): NarrativeState {
  w.narrative ??= { fan: 60, press: [], talks: {} };
  if (!Array.isArray(w.narrative.press)) w.narrative.press = [];
  if (!w.narrative.talks || typeof w.narrative.talks !== "object") w.narrative.talks = {};
  if (typeof w.narrative.fan !== "number" || !Number.isFinite(w.narrative.fan)) w.narrative.fan = 60;
  return w.narrative;
}

export const fanMood = (w: World) => w.narrative?.fan ?? 60;
export function addFan(w: World, d: number) {
  const n = narrativeOf(w);
  n.fan = clamp(Math.round(n.fan + d), 0, 100);
}
export function addBoard(w: World, d: number) {
  w.board.confidence = clamp(Math.round(w.board.confidence + d), 0, 100);
}
export function addPlayerMorale(p: Player, d: number) {
  p.morale = clamp(Math.round(p.morale + d), moraleFloor(p), 100);
}
export const squadPlayers = (w: World): Player[] =>
  (w.clubs[w.userClubId]?.players ?? []).map((id) => w.players[id]).filter((p): p is Player => !!p && !p.youth);
export function addSquadMorale(w: World, d: number) {
  if (d) for (const p of squadPlayers(w)) addPlayerMorale(p, d);
}

export function fanLabel(fan: number): string {
  return fan >= 80 ? "Em festa" : fan >= 60 ? "Confiante" : fan >= 40 ? "Desconfiada" : fan >= 20 ? "Irritada" : "Revoltada";
}
export const fanEmoji = (fan: number) => (fan >= 80 ? "🥳" : fan >= 60 ? "🙂" : fan >= 40 ? "😐" : fan >= 20 ? "😠" : "🤬");

/** Multiplicador de público para clássicos (e humor da torcida do usuário em casa). */
export function derbyCrowdMult(w: World, f: Fixture): number {
  let m = 1 + 0.15 * derbyIntensity(f.home, f.away);
  if (f.home === w.userClubId && w.narrative) m *= 0.9 + w.narrative.fan / 500;
  return m;
}
/** Multiplicador da renda de bilheteria (ingresso de clássico é mais caro). */
export const derbyTicketMult = (f: Fixture) => 1 + 0.1 * derbyIntensity(f.home, f.away);

/** Resultado do usuário: torcida reage; em clássico, moral e diretoria também (sem sorteio). */
export function applyDerbyOutcome(w: World, f: Fixture, r: MatchResult) {
  if (f.home !== w.userClubId && f.away !== w.userClubId) return;
  const int = derbyIntensity(f.home, f.away);
  const mine = f.home === w.userClubId ? r.hg : r.ag;
  const theirs = f.home === w.userClubId ? r.ag : r.hg;
  const res = Math.sign(mine - theirs);
  // todo jogo do usuário mexe com a torcida (antes só mexia se o save já tivesse a narrativa criada).
  // Vitória anima, derrota irrita, empate em casa decepciona; perto do teto/chão anda menos (nada cravado em 100).
  const fan = fanMood(w);
  const d = res > 0 ? 3 * Math.min(1, (100 - fan) / 25) : res < 0 ? -3 * Math.min(1, fan / 25) : f.home === w.userClubId ? -1 : 0;
  addFan(w, d + (60 - fan) * 0.03);
  if (!int) return;
  const opp = w.clubs[f.home === w.userClubId ? f.away : f.home];
  const name = derbyName(f.home, f.away) ?? "Clássico";
  if (res > 0) {
    addSquadMorale(w, 2 * int);
    addBoard(w, int);
    addFan(w, 4 * int);
    addNews(w, "match", `🔥 Vitória no ${name}!`, `A torcida faz festa depois de bater o ${opp?.name ?? "rival"}. Elenco e diretoria em alta.`, { clubId: opp?.id });
  } else if (res < 0) {
    addSquadMorale(w, -2 * int);
    addBoard(w, -int);
    addFan(w, -4 * int);
    addNews(w, "match", `😞 Derrota no ${name}`, `Perder para o ${opp?.name ?? "rival"} dói mais. A torcida cobra resposta.`, { clubId: opp?.id });
  }
}
