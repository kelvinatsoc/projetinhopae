// Personalização do estádio: cores das cadeiras, cobertura, fachada, telões e um anel extra de
// arquibancada. Cada mudança é uma reforma paga (na hora) que fica pronta depois de algumas semanas;
// quando termina, o visual muda no mapa da sede (src/ui/hq) e no estádio da partida (match3d).
// O nome do estádio vem do contrato de naming rights (sponsors.ts, espaço "stadium") e vale
// pela duração do contrato.
import { absDay } from "./common";
import { addExpense } from "./finance";
import type { Club, StadiumLook, StadiumWork, StadiumWorkKind, World } from "./types";

export const WORK_INFO: Record<StadiumWorkKind, { emoji: string; label: string; desc: string; weeks: number }> = {
  seats: { emoji: "💺", label: "Trocar as cadeiras", desc: "Novas cores e desenho das cadeiras em todos os anéis.", weeks: 4 },
  roof: { emoji: "⛱️", label: "Cobertura", desc: "Nova cobertura (anel completo, marquise ou caixote) ou retirar a atual.", weeks: 26 },
  facade: { emoji: "🧱", label: "Fachada", desc: "Novo revestimento e cores da fachada.", weeks: 16 },
  screens: { emoji: "📺", label: "Telões", desc: "Placares eletrônicos nas arquibancadas.", weeks: 6 },
  tier: { emoji: "🏗️", label: "Novo anel de arquibancada", desc: "Mais um anel com camarotes: +20% de lugares.", weeks: 40 },
};
export const WORK_KINDS = Object.keys(WORK_INFO) as StadiumWorkKind[];

/** Custo (R$) de uma reforma: proporcional à capacidade e menor nas divisões de baixo. */
export function workCost(c: Club, kind: StadiumWorkKind): number {
  const perSeat: Record<StadiumWorkKind, number> = { seats: 140, roof: 1100, facade: 420, screens: 0, tier: 2600 };
  const divMul = c.div === "A" ? 1 : c.div === "B" ? 0.6 : 0.35;
  const v = kind === "screens" ? 2_500_000 : c.capacity * perSeat[kind];
  return Math.round((v * divMul) / 50_000) * 50_000;
}

export function lookWorks(c: Club): StadiumWork[] {
  return c.lookWorks ?? [];
}

/** Pode começar? Retorna o motivo se não puder. */
export function canStartWork(c: Club, kind: StadiumWorkKind): string | null {
  if (lookWorks(c).some((x) => x.kind === kind)) return "Já há uma reforma dessas em andamento.";
  if (lookWorks(c).length >= 2) return "No máximo duas reformas ao mesmo tempo.";
  if (kind === "tier" && c.look?.extraTier) return "O estádio já ganhou um anel extra.";
  if (c.balance < workCost(c, kind)) return "Saldo insuficiente.";
  return null;
}

/** Começa uma reforma com o visual escolhido (aplicado quando a obra termina). */
export function startWork(w: World, c: Club, kind: StadiumWorkKind, look: Partial<StadiumLook>): string | null {
  const why = canStartWork(c, kind);
  if (why) return why;
  const cost = workCost(c, kind);
  addExpense(c, "infra", cost);
  const now = absDay(w);
  (c.lookWorks ??= []).push({ kind, start: now, done: now + WORK_INFO[kind].weeks * 7, cost, look: kind === "tier" ? { extraTier: true } : look });
  return null;
}

export function workPct(w: World, x: StadiumWork): number {
  const total = Math.max(1, x.done - x.start);
  return Math.max(0, Math.min(100, Math.round(((absDay(w) - x.start) / total) * 100)));
}

function applyWork(c: Club, x: StadiumWork) {
  const look = (c.look ??= {});
  if (x.kind === "tier" && !look.extraTier) c.capacity = Math.round(c.capacity * 1.2);
  Object.assign(look, x.look);
}

/** Avanço diário das reformas. Retorna as concluídas hoje. */
export function stadiumLookDaily(w: World): StadiumWork[] {
  const done: StadiumWork[] = [];
  const now = absDay(w);
  for (const c of Object.values(w.clubs)) {
    if (!c.lookWorks?.length) continue;
    c.lookWorks = c.lookWorks.filter((x) => {
      if (x.done > now) return true;
      applyWork(c, x);
      done.push(x);
      return false;
    });
    if (!c.lookWorks.length) delete c.lookWorks;
  }
  return done;
}

/** Admin/testes: conclui na hora as reformas de um clube. */
export function finishAllWorks(c: Club): number {
  const list = c.lookWorks ?? [];
  for (const x of list) applyWork(c, x);
  delete c.lookWorks;
  return list.length;
}
