// Geometria do campinho (unidades de pixel do modo 2D). Compartilhada pelo campo em pixel art
// (MatchView) e pelo renderizador 3D "Retrô PS1", que convertem a mesma posição dos jogadores.
export const W = 196;
export const H = 132;
export const PX0 = 18; // linha de fundo esquerda
export const PX1 = 178; // linha de fundo direita
export const PY0 = 20; // lateral de cima
export const PY1 = 116; // lateral de baixo
export const PL = PX1 - PX0;
export const PW = PY1 - PY0;
export const CX = (PX0 + PX1) / 2;
export const CY = (PY0 + PY1) / 2;
export const POST = 5; // meia largura do gol
export const BOX_D = 25; // profundidade da grande área
export const BOX_H = 28; // meia largura da grande área
export const SPOT = 17; // marca do pênalti

/** Campo de verdade em metros (o 3D usa estas medidas). */
export const PITCH_LEN = 105;
export const PITCH_WID = 68;

/** Pixel do campinho -> metros no mundo 3D (x ao longo do campo, z na largura; centro = 0). */
export function pitchToWorld(x: number, y: number): [number, number] {
  return [((x - CX) / PL) * PITCH_LEN, ((y - CY) / PW) * PITCH_WID];
}
