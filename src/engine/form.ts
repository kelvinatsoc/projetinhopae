// Fase do jogador: forma (últimas notas), sequência em alta/baixa, confiança, tendência de evolução,
// ídolo da torcida e propensão a lesões. Funções puras (sem sorteio).
import { H, hidOf } from "./personality";
import { clamp } from "./rng";
import type { Player, World } from "./types";

/** Nota "normal" de um jogador do nível dele (medida no motor: média ~6,2 aos 70 de overall). */
export const expectedRating = (p: Player) => 6.18 + (p.ovr - 70) * 0.035;

/** Média das últimas n notas (null sem jogos). */
export function formAvg(p: Player, n = 5): number | null {
  const f = p.form.slice(-n);
  return f.length ? f.reduce((s, x) => s + x, 0) / f.length : null;
}

/** Quanto acima (+) ou abaixo (−) do esperado ele vem jogando (últimos 3 jogos), em pontos de nota. */
export function formResidual(p: Player, n = 3): number {
  const f = p.form.slice(-n);
  if (f.length < 2) return 0;
  return f.reduce((s, x) => s + x, 0) / f.length - expectedRating(p);
}

export type Streak = "hot" | "cold" | null;
/** 🔥 em alta / 🧊 em baixa. */
export function streakOf(p: Player): Streak {
  const r = formResidual(p);
  if (p.form.length >= 3 && r >= 0.6) return "hot";
  if (p.form.length >= 3 && r <= -0.6) return "cold";
  return null;
}

/** Confiança: multiplica o rendimento em até ±1,5% (fase boa embala, fase ruim pesa). */
export const confidenceMult = (p: Player) => clamp(1 + 0.012 * formResidual(p), 0.985, 1.015);

export type Trend = "up" | "down" | null;
/** Seta de evolução: combina a última variação do treino com a fase. */
export function trendOf(p: Player): Trend {
  const t = p.trend ?? 0;
  const r = formResidual(p, 5);
  const score = t + r * 1.5 + ((p.ma ?? 0) === 0 && p.form.length === 0 ? -0.5 : 0);
  if (score >= 1) return "up";
  if (score <= -1) return "down";
  return null;
}

/** Propenso a lesões (atributo oculto alto). */
export const injuryProne = (p: Player) => hidOf(p)[H.inj] >= 15;

/** Ídolo da torcida: marcado todo mês (tempo de casa + fase ou fama). */
export function updateFanFavourite(w: World, p: Player) {
  const ten = p.loan ? 0 : w.season - p.joined;
  const avg = p.stats.apps >= 5 ? p.stats.ratingSum / p.stats.apps : 0;
  const fav = !!p.legend || (ten >= 3 && (p.fame >= 55 || avg >= 7.1)) || (ten >= 1 && p.stats.motm >= 5) || (ten >= 5 && hidOf(p)[H.loy] >= 15);
  if (fav) p.fav = true; else delete p.fav;
}

/** Cor de uma nota (para as bolinhas de forma). */
export const ratingColor = (r: number) => (r >= 7.5 ? "#1f9d55" : r >= 6.8 ? "#7cb342" : r >= 6.2 ? "#c78a12" : "#c0392b");
