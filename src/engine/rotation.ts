// Estaduais: como os clubes grandes de verdade escalam na primeira fase.
// Em janeiro o elenco volta de férias e faz pré-temporada: os grandes (Série A, sobretudo quem joga
// Libertadores) poupam titulares nas primeiras rodadas, dão minutos a reservas e garotos da base e
// trazem os titulares aos poucos. Mata-mata decisivo (semi/final) e clássicos: força máxima.
// Clubes menores jogam com o que têm de melhor. Vale só para a IA — o usuário recebe uma dica.
import { isEstadualId } from "../data/estaduais";
import { isClassico } from "./common";
import { autoLineup } from "./lineup";
import { FORMATIONS, ovrAt } from "./positions";
import type { Club, Fixture, Lineup, World } from "./types";

/** Peso do porte do clube (0 = sempre força máxima). */
export function rotationTier(w: World, c: Club): number {
  let t = c.div === "A" ? 0.8 : c.div === "B" ? 0.4 : 0;
  if (t && (w.comps.liberta?.teams.includes(c.id) || c.rep >= 80)) t += 0.2;
  return Math.min(1, t);
}

/** Fase do estadual: começo = quase tudo poupado; quartas já com quase todos; semi/final = nada. */
function phaseFactor(f: Fixture): number {
  if (f.stage === "sf" || f.stage === "final") return 0;
  if (f.stage === "qf") return 0.3;
  const r = f.round ?? 1;
  return r <= 3 ? 1 : r <= 6 ? 0.85 : r <= 9 ? 0.7 : 0.55;
}

/** Outro jogo (fora do estadual) do clube a até 3 dias. */
function congested(w: World, c: Club, f: Fixture): boolean {
  return w.fixtures.some((x) => x !== f && !isEstadualId(x.comp) && (x.home === c.id || x.away === c.id) && Math.abs(x.day - f.day) <= 3);
}

/** Intensidade do rodízio (0 = força máxima, 1 = time alternativo completo) de um clube neste jogo. */
export function rotationIntensity(w: World, c: Club, f: Fixture): number {
  if (!isEstadualId(f.comp)) return 0;
  const tier = rotationTier(w, c);
  if (!tier) return 0;
  const phase = phaseFactor(f);
  if (!phase || isClassico(w, f.home, f.away)) return 0;
  return Math.min(1, tier * phase + (congested(w, c, f) ? 0.25 * tier : 0));
}

/**
 * Escalação poupando os `intensity × 9` melhores titulares (o goleiro só no time totalmente alternativo).
 * Os garotos da base do clube ganham preferência quanto maior o rodízio.
 */
export function alternativeLineup(w: World, c: Club, compId: string | undefined, intensity: number): Lineup {
  const k = Math.round(Math.max(0, Math.min(1, intensity)) * 9);
  if (!k) return autoLineup(w, c, compId);
  const best = autoLineup(w, c, compId, c.tactic.formation, false);
  const slots = FORMATIONS[c.tactic.formation] ?? FORMATIONS["4-3-3"];
  const starters = best.starters
    .map((id, i) => ({ id, pos: slots[i].pos }))
    .filter((x): x is { id: number; pos: typeof x.pos } => x.id != null && (x.pos !== "GOL" || k >= 9))
    .sort((a, b) => ovrAt(w.players[b.id], b.pos) - ovrAt(w.players[a.id], a.pos));
  const exclude = new Set(starters.slice(0, k).map((x) => x.id));
  return autoLineup(w, c, compId, c.tactic.formation, true, { exclude, youthBonus: 10 * intensity });
}

/** Escalação da IA para um jogo, com o rodízio do estadual. */
export function aiMatchLineup(w: World, c: Club, f: Fixture): Lineup {
  const r = rotationIntensity(w, c, f);
  return r > 0 ? alternativeLineup(w, c, f.comp, r) : autoLineup(w, c, f.comp);
}
