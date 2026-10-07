// Passo de animação baseado em tempo (puro, testável sem DOM).
import { PITCH_LEN, PL } from "./pitchGeom";

/** Metros por pixel do campinho (105 m em PL px). */
export const M_PER_PX = PITCH_LEN / PL;

/**
 * Duração de um minuto de jogo na velocidade 1x (ms). Na 1x o lance acontece em ritmo de
 * transmissão: jogador correndo a 4–8 m/s e passe a ~15 m/s. As outras velocidades dividem por 2, 4, 8.
 */
export const REAL_MS_PER_MIN = 4000;

/** Corrida base realista (trote forte ~5,5 m/s) em px do campinho por segundo, na 1x. */
export const RUN_PX_S = 5.5 / M_PER_PX;

/** Velocidades típicas da bola (m/s). */
export const BALL_MPS = { pass: 15, long: 19, shot: 27, power: 33, clear: 22 } as const;

/** Fator de aceleração da animação para um relógio de msPerMin (1 = tempo real na 1x). */
export function timeScale(msPerMin: number): number {
  return Math.max(0.25, Math.min(40, REAL_MS_PER_MIN / Math.max(1, msPerMin)));
}

/** Quanto tempo (ms, na 1x) a bola leva para percorrer distPx a mps metros por segundo. */
export function ballTime(distPx: number, mps: number, min = 250): number {
  return Math.max(min, ((distPx * M_PER_PX) / mps) * 1000);
}

/**
 * Velocidade máxima de um jogador (px/s na 1x) pelo atributo de velocidade (0–100):
 * de ~6,3 m/s (lento) a ~8,6 m/s (velocista) em disparada; o trote fica em ~65% disso.
 */
export function sprintPx(vel: number): number {
  const mps = 6.3 + Math.max(0, Math.min(100, vel) - 40) * 0.038;
  return mps / M_PER_PX;
}

/**
 * Quanto um jogador anda neste quadro rumo ao alvo (a dist px). Tudo em função do tempo
 * decorrido (dt ms), nunca do número de quadros: a mesma velocidade em telas de 60, 90, 120 ou 144 Hz.
 * Aproxima com suavização exponencial (tau ms) + um piso constante por segundo, limitado a vmax px/s.
 */
export function chaseStep(dist: number, dt: number, vmax: number, tau: number): number {
  const ease = 1 - Math.exp(-dt / tau);
  return Math.min(dist, (vmax * dt) / 1000, dist * ease + (vmax * 0.18 * dt) / 1000);
}

/** Intervalo entre quadros em ms, limitado (aba em segundo plano / travadas não dão saltos). */
export function frameDt(prev: number, now: number, max = 50): number {
  return Math.max(0, Math.min(max, now - prev));
}
