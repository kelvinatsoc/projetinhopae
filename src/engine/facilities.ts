// Estrutura do clube: estádio, CT, categorias de base e departamento médico (níveis 1–5).
// As obras custam dinheiro na hora e ficam prontas depois de algumas semanas.
// CT e base reaproveitam os campos já existentes (club.facilities e club.youthFac), então os efeitos
// de evolução (training.ts) e de qualidade da peneira (youth.ts) valem automaticamente.
import { absDay } from "./common";
import { addExpense } from "./finance";
import type { Club, FacilityBuild, FacilityKind, FacilityState, World } from "./types";

export const FAC_KINDS: FacilityKind[] = ["stadium", "training", "youth", "medical"];
export const FAC_MAX = 5;

export const FAC_INFO: Record<FacilityKind, { emoji: string; label: string; effect: (lv: number) => string }> = {
  stadium: { emoji: "🏟️", label: "Estádio", effect: (lv) => `+${Math.round((stadiumGateMult(lv) - 1) * 100)}% na bilheteria (conforto e camarotes)` },
  training: { emoji: "🏋️", label: "Centro de treinamento", effect: (lv) => `Evolução dos jogadores nível ${lv}/5` },
  youth: { emoji: "🌱", label: "Categorias de base", effect: (lv) => `Peneiras melhores (estrutura ${lv}/5)` },
  medical: { emoji: "🩺", label: "Departamento médico", effect: (lv) => `Lesões ${Math.round((1 - medicalInjuryMult(lv)) * 100)}% mais curtas` },
};

/** Lugares a mais por nível de estádio. */
export const STADIUM_SEATS = 6_000;

function stadiumLevelFromCapacity(cap: number): number {
  return cap < 15_000 ? 1 : cap < 30_000 ? 2 : cap < 45_000 ? 3 : cap < 60_000 ? 4 : 5;
}

/** Estado das obras (criado sob demanda). */
export function facState(c: Club): FacilityState {
  return (c.fac ??= { stadium: stadiumLevelFromCapacity(c.capacity), medical: 2, builds: [] });
}

export function facLevel(c: Club, k: FacilityKind): number {
  switch (k) {
    case "stadium": return c.fac?.stadium ?? stadiumLevelFromCapacity(c.capacity);
    case "training": return c.facilities;
    case "youth": return c.youthFac ?? c.youthLevel;
    case "medical": return c.fac?.medical ?? 2;
  }
}

/** Multiplicador da bilheteria pelo nível do estádio (nível 2 = neutro, sem estado = neutro). */
export function stadiumGateMult(lv: number): number {
  return 1 + 0.05 * (lv - 2);
}

/** Multiplicador dos dias de lesão pelo departamento médico (nível 2 = neutro). */
export function medicalInjuryMult(lv: number): number {
  return 1 - 0.07 * (lv - 2);
}

/** Lesões do clube: só quem montou o departamento (estado criado) sente o efeito. */
export function clubInjuryMult(c: Club): number {
  return c.fac ? medicalInjuryMult(c.fac.medical) : 1;
}

export function clubGateMult(c: Club): number {
  return c.fac ? stadiumGateMult(c.fac.stadium) : 1;
}

/** Custo (R$) e prazo (semanas) para subir para o nível `to`. */
export function upgradeCost(c: Club, k: FacilityKind, to: number): { cost: number; weeks: number } {
  const divMul = c.div === "A" ? 1 : c.div === "B" ? 0.45 : 0.2;
  const base: Record<FacilityKind, number> = { stadium: 9_000_000, training: 6_000_000, youth: 4_000_000, medical: 3_000_000 };
  const weeks: Record<FacilityKind, number> = { stadium: 20, training: 12, youth: 10, medical: 6 };
  return {
    cost: Math.round((base[k] * to * to * divMul) / 4 / 50_000) * 50_000,
    weeks: weeks[k] + 2 * to,
  };
}

export function buildOf(c: Club, k: FacilityKind): FacilityBuild | undefined {
  return c.fac?.builds.find((b) => b.kind === k);
}

/** Pode começar a obra? Retorna o motivo se não puder. */
export function canUpgrade(c: Club, k: FacilityKind): string | null {
  const lv = facLevel(c, k);
  if (lv >= FAC_MAX) return "Já está no nível máximo.";
  if (buildOf(c, k)) return "Já há uma obra em andamento aqui.";
  if ((c.fac?.builds.length ?? 0) >= 2) return "No máximo duas obras ao mesmo tempo.";
  const { cost } = upgradeCost(c, k, lv + 1);
  if (c.balance < cost) return "Saldo insuficiente.";
  return null;
}

export function startUpgrade(w: World, c: Club, k: FacilityKind): string | null {
  const why = canUpgrade(c, k);
  if (why) return why;
  const st = facState(c);
  const to = facLevel(c, k) + 1;
  const { cost, weeks } = upgradeCost(c, k, to);
  addExpense(c, "infra", cost);
  st.builds.push({ kind: k, to, start: absDay(w), done: absDay(w) + weeks * 7, cost });
  return null;
}

export function buildPct(w: World, b: FacilityBuild): number {
  const total = Math.max(1, b.done - b.start);
  return Math.max(0, Math.min(100, Math.round(((absDay(w) - b.start) / total) * 100)));
}

export function weeksLeft(w: World, b: FacilityBuild): number {
  return Math.max(0, Math.ceil((b.done - absDay(w)) / 7));
}

/** Avanço diário das obras. Retorna as obras concluídas hoje. */
export function facilitiesDaily(w: World): FacilityBuild[] {
  const done: FacilityBuild[] = [];
  for (const c of Object.values(w.clubs)) {
    const st = c.fac;
    if (!st || !st.builds.length) continue;
    const now = absDay(w);
    st.builds = st.builds.filter((b) => {
      if (b.done > now) return true;
      applyLevel(c, b.kind, b.to);
      done.push(b);
      return false;
    });
  }
  return done;
}

function applyLevel(c: Club, k: FacilityKind, lv: number) {
  const st = facState(c);
  if (k === "stadium") {
    if (lv > st.stadium) c.capacity += STADIUM_SEATS * (lv - st.stadium);
    st.stadium = lv;
  } else if (k === "training") c.facilities = Math.max(c.facilities, lv);
  else if (k === "youth") c.youthFac = Math.max(c.youthFac ?? c.youthLevel, lv);
  else st.medical = lv;
}

/** Repara o estado de saves antigos/corrompidos. */
export function migrateFacilities(c: Club) {
  const st = c.fac;
  if (!st) return;
  if (typeof st !== "object") { delete c.fac; return; }
  const lv = (v: unknown, d: number) => (typeof v === "number" && v >= 1 && v <= FAC_MAX ? Math.round(v) : d);
  st.stadium = lv(st.stadium, stadiumLevelFromCapacity(c.capacity));
  st.medical = lv(st.medical, 2);
  st.builds = Array.isArray(st.builds) ? st.builds.filter((b) => b && FAC_KINDS.includes(b.kind) && typeof b.done === "number") : [];
}
