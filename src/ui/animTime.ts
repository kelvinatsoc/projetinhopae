// Passo de animação baseado em tempo (puro, testável sem DOM).

/** Corrida base (px do campinho por segundo, na 1x). ~1,5 px = 1 m. */
export const RUN_PX_S = 28;

/**
 * Quanto um jogador anda neste quadro rumo ao alvo (a dist px). Tudo em função do tempo
 * decorrido (dt ms), nunca do número de quadros: a mesma velocidade em telas de 60, 90, 120 ou 144 Hz.
 * Aproxima com suavização exponencial (tau ms) + um piso constante por segundo, limitado a vmax px/s.
 */
export function chaseStep(dist: number, dt: number, vmax: number, tau: number): number {
  const ease = 1 - Math.exp(-dt / tau);
  return Math.min(dist, (vmax * dt) / 1000, dist * ease + (7.2 * dt) / 1000);
}

/** Intervalo entre quadros em ms, limitado (aba em segundo plano / travadas não dão saltos). */
export function frameDt(prev: number, now: number, max = 50): number {
  return Math.max(0, Math.min(max, now - prev));
}
