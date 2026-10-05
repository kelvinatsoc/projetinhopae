// Comissão técnica (auxiliar, treinador, preparador físico, olheiro-chefe, coordenador da base).
// staffStars é final (a IA sempre tem 3★ = números neutros). Só o clube do usuário tem comissão própria.
import { generateName, natForClub } from "../data/names";
import { divMult, windowIndex } from "./common";
import { addExpense } from "./finance";
import { addNews } from "./news";
import { roundMoney } from "./player";
import { clamp, gauss, getRngState, hashString, rand, randInt, setRngState } from "./rng";
import type { Club, StaffMember, StaffRole, World } from "./types";

export const STAFF_ROLES: StaffRole[] = ["aux", "tre", "fis", "olh", "bas"];

export const STAFF_INFO: Record<StaffRole, { emoji: string; label: string }> = {
  aux: { emoji: "🧑‍💼", label: "Auxiliar técnico" },
  tre: { emoji: "🏃", label: "Treinador de campo" },
  fis: { emoji: "🩺", label: "Fisioterapeuta" },
  olh: { emoji: "🔭", label: "Olheiro-chefe" },
  bas: { emoji: "🌱", label: "Coordenador da base" },
};

/** Salário mensal por estrelas (1★…5★) na Série A; outras divisões pagam proporcionalmente. */
const WAGE_BY_STARS = [25_000, 60_000, 130_000, 250_000, 450_000];

/** Estrelas (1-5) de um cargo. Clubes da IA são sempre 3★ (neutro). */
export function staffStars(w: World, club: Club, role: StaffRole): number {
  return club.id === w.userClubId ? (w.staff?.[role]?.stars ?? 3) : 3;
}

/** Salário mensal de um profissional com estas estrelas neste clube. */
export function staffWage(stars: number, club: Club): number {
  return roundMoney(WAGE_BY_STARS[clamp(Math.round(stars), 1, 5) - 1] * divMult(club));
}

/** Folha mensal da comissão do usuário (R$). 0 enquanto não houver comissão contratada. */
export function staffWageBill(w: World): number {
  let s = 0;
  for (const m of Object.values(w.staff ?? {})) s += m?.wage ?? 0;
  return s;
}

/**
 * Roda fn com o gerador global numa semente fixa e devolve o estado original depois.
 * (os geradores de nomes usam o gerador global; assim a comissão não mexe na simulação)
 */
function withSeed<T>(seed: number, fn: () => T): T {
  const saved = getRngState();
  setRngState(seed);
  try {
    return fn();
  } finally {
    setRngState(saved);
  }
}

function makeMember(w: World, club: Club, role: StaffRole, stars: number, id: number): StaffMember {
  const nat = rand() < 0.8 ? "BRA" : natForClub(club.country);
  const name = generateName(nat);
  const born = w.season - randInt(35, 64);
  return { id, role, name, nat, born, stars, wage: staffWage(stars, club), until: w.season + 1 + randInt(0, 1) };
}

/** Garante a comissão do usuário (gerada de forma determinística pela semente + clube). */
export function ensureStaff(w: World): Partial<Record<StaffRole, StaffMember>> {
  const club = w.clubs[w.userClubId];
  if (!club) return w.staff ?? {};
  if (w.staff && STAFF_ROLES.every((r) => w.staff?.[r])) return w.staff;
  const staff = (w.staff ??= {});
  withSeed(hashString(`${w.seed}:staff0:${w.userClubId}`), () => {
    STAFF_ROLES.forEach((role, i) => {
      const r = rand();
      const stars = clamp(Math.round(club.rep / 25) + [-1, 0, 0, 1][Math.floor(r * 4)], 1, 5);
      const m = makeMember(w, club, role, stars, w.season * 100 + i);
      if (!staff[role]) staff[role] = m;
    });
  });
  return staff;
}

/** Mensal: garante a comissão, avisa contratos que vencem e renova sozinho (+10%). */
export function staffMonthly(w: World) {
  const staff = ensureStaff(w);
  // aviso no início de novembro (perto do dia 300)
  if (w.day >= 295 && w.day < 326) {
    for (const r of STAFF_ROLES) {
      const s = staff[r];
      if (s && s.until <= w.season) {
        addNews(w, "staff", `Contrato de ${s.name} termina no fim do ano`,
          `Contrato de ${s.name} (${STAFF_INFO[r].label}) termina no fim do ano — renovaremos automaticamente com +10%.`);
      }
    }
  }
  // primeiro mês da nova temporada: renovação automática
  for (const r of STAFF_ROLES) {
    const s = staff[r];
    if (s && s.until < w.season) {
      s.until += 2;
      s.wage = roundMoney(s.wage * 1.1);
    }
  }
}

/** O usuário trocou de clube: a comissão é refeita para o novo clube. */
export function staffOnClubChange(w: World) {
  delete w.staff;
  delete w.staffPool;
  ensureStaff(w);
}

/** Chave do mercado de técnicos: muda a cada janela (e temporada) e por cargo. */
function poolKey(w: World, role: StaffRole) {
  return `${w.season}:${windowIndex(w.day)}:${role}`;
}

/** 6 candidatos para o cargo (fixos durante a janela atual). */
export function staffCandidates(w: World, role: StaffRole): StaffMember[] {
  const club = w.clubs[w.userClubId];
  const staff = ensureStaff(w);
  const key = poolKey(w, role);
  if (w.staffPool?.key === key) return w.staffPool.list;
  const cur = staff[role]?.stars ?? 3;
  const list = withSeed(hashString(`${w.seed}:staff:${key}`), () => {
    const out: StaffMember[] = [];
    for (let i = 0; i < 6; i++) {
      const stars = clamp(Math.round(club.rep / 25 + gauss(0, 1.1)), 1, 5);
      out.push(makeMember(w, club, role, stars, hashString(`${key}:${i}`) & 0x7fffffff));
    }
    // sempre há ao menos uma opção melhor que o atual
    if (cur < 5 && !out.some((s) => s.stars === cur + 1)) {
      out[0].stars = cur + 1;
      out[0].wage = staffWage(cur + 1, club);
    }
    return out.sort((a, b) => b.stars - a.stars);
  });
  for (const s of list) s.until = w.season + 2;
  w.staffPool = { key, list };
  return list;
}

/** O candidato aceita vir? (clubes pequenos não atraem os melhores) */
export function staffAccepts(w: World, s: Pick<StaffMember, "stars">): boolean {
  const club = w.clubs[w.userClubId];
  return s.stars <= Math.ceil(club.rep / 20) + 1;
}

/** Rescisão do atual: 3 salários. */
export function staffSeverance(w: World, role: StaffRole): number {
  return 3 * (w.staff?.[role]?.wage ?? 0);
}

/** Contrata um candidato (o atual sai com 3 salários de rescisão). */
export function hireStaff(w: World, cand: StaffMember): { ok: boolean; msg: string } {
  const club = w.clubs[w.userClubId];
  const staff = ensureStaff(w);
  if (!staffAccepts(w, cand)) return { ok: false, msg: `${cand.name} não quer vir (clube pequeno demais).` };
  const old = staff[cand.role];
  const sev = staffSeverance(w, cand.role);
  if (sev > 0) addExpense(club, "release", sev);
  staff[cand.role] = { ...cand, until: w.season + 2, wage: staffWage(cand.stars, club) };
  if (w.staffPool) w.staffPool.list = w.staffPool.list.filter((s) => s.id !== cand.id);
  const label = STAFF_INFO[cand.role].label;
  addNews(w, "staff", `${cand.name} é o novo ${label.toLowerCase()}`,
    `${cand.name} (${"★".repeat(cand.stars)}) chega ao ${club.name}${old ? ` no lugar de ${old.name}` : ""}. Contrato até ${w.season + 2}.`);
  return { ok: true, msg: `${cand.name} contratado!` };
}

/** Admin: define as estrelas de um cargo (o salário acompanha). */
export function setStaffStars(w: World, role: StaffRole, stars: number) {
  const staff = ensureStaff(w);
  const s = staff[role];
  if (!s) return;
  s.stars = clamp(Math.round(stars), 1, 5);
  s.wage = staffWage(s.stars, w.clubs[w.userClubId]);
}

/** Admin: comissão técnica toda 5★. */
export function allStaffFive(w: World) {
  for (const r of STAFF_ROLES) setStaffStars(w, r, 5);
}
