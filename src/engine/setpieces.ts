// Bola parada: batedores (escanteio, falta, pênalti), capitão e jogada ensaiada de escanteio.
// O motor (match.ts) usa os atributos de quem cobra; sem escolha do técnico vale a escolha automática.
import { hasTrait } from "./traits";
import type { Club, Player, SetPieceConfig, SetPieceRoutine, World } from "./types";

export const ROUTINES: Record<SetPieceRoutine, { label: string; desc: string; header: number; xg: number; short: number }> = {
  pp: { label: "Primeiro pau", desc: "Bola rápida no primeiro poste: mais cabeçadas, para atacantes de movimentação.", header: 1.04, xg: 0.95, short: 0 },
  sp: { label: "Segundo pau", desc: "Bola alta no segundo poste: menos cabeçadas, mas mais perigosas para os altos.", header: 0.9, xg: 1.15, short: 0 },
  curto: { label: "Curto", desc: "Toque curto e cruzamento ou chute da entrada da área: menos cabeçadas, mais finalizações.", header: 0.75, xg: 1.0, short: 0.3 },
};

export type TakerRole = "corner" | "fk" | "pen" | "cap";
export const TAKER_LABEL: Record<TakerRole, { emoji: string; label: string }> = {
  corner: { emoji: "🚩", label: "Escanteios" },
  fk: { emoji: "🎯", label: "Faltas" },
  pen: { emoji: "⚪", label: "Pênaltis" },
  cap: { emoji: "©️", label: "Capitão" },
};

export function setPieceConfig(c: Club): SetPieceConfig {
  return c.setPieces ?? { routine: "pp" };
}

/** Nota de cada jogador para a função (maior = melhor). */
export function takerScore(p: Player, role: TakerRole): number {
  const a = p.attrs;
  switch (role) {
    case "corner": return a.pas * 0.7 + a.dri * 0.3 + (hasTrait(p, "FAL") ? 4 : 0);
    case "fk": return (a.fin + a.pas) / 2 + (hasTrait(p, "FAL") ? 1000 : 0);
    case "pen": return a.fin + (hasTrait(p, "PEN") ? 1000 : 0);
    case "cap": return p.fame * 0.5 + (hasTrait(p, "LID") ? 30 : 0) + (p.hid ? p.hid[0] : 10);
  }
}

/** Escolha automática entre os ids dados (jogadores de linha). */
export function bestTaker(w: World, ids: (number | null)[], role: TakerRole): number | null {
  let best: number | null = null, bv = -Infinity;
  for (const id of ids) {
    if (id == null) continue;
    const p = w.players[id];
    if (!p || p.pos === "GOL") continue;
    const v = takerScore(p, role);
    if (v > bv) { bv = v; best = id; }
  }
  return best;
}

/** Batedor escolhido pelo técnico, se estiver em campo; senão o melhor em campo. */
export function takerFor(w: World, c: Club, onPitch: (number | null)[], role: TakerRole): number | null {
  const cfg = c.setPieces;
  const chosen = cfg ? cfg[role] : undefined;
  if (chosen != null && onPitch.includes(chosen)) return chosen;
  return bestTaker(w, onPitch, role);
}

/** Multiplicador da chance de cabeçada pelo batedor de escanteio (passe 78, típico do melhor batedor, ≈ neutro). */
export function cornerQuality(p: Player | undefined): number {
  if (!p) return 1;
  return Math.max(0.8, Math.min(1.2, 1 + (p.attrs.pas - 78) / 100));
}

/** xG de falta direta pelo batedor: o Cobrador de falta mantém a fórmula antiga; os demais variam com finalização e passe. */
export function freeKickXgFor(p: Player): number {
  if (hasTrait(p, "FAL")) return 0.09 * (p.attrs.fin / 75);
  return Math.max(0.025, Math.min(0.07, 0.045 * (((p.attrs.fin + p.attrs.pas) / 2) / 77)));
}

export function setTaker(c: Club, role: TakerRole, pid: number | null) {
  const cfg = (c.setPieces ??= { routine: "pp" });
  if (pid == null) delete cfg[role];
  else cfg[role] = pid;
}

export function setRoutine(c: Club, r: SetPieceRoutine) {
  (c.setPieces ??= { routine: "pp" }).routine = r;
}

/** Remove batedores que saíram do clube e rotinas inválidas. */
export function migrateSetPieces(c: Club) {
  const cfg = c.setPieces;
  if (!cfg) return;
  if (typeof cfg !== "object") { delete c.setPieces; return; }
  if (!(cfg.routine in ROUTINES)) cfg.routine = "pp";
  for (const r of ["corner", "fk", "pen", "cap"] as const) {
    const id = cfg[r];
    if (id != null && !c.players.includes(id)) delete cfg[r];
  }
}
