import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { monthlyFinances } from "../src/engine/finance";
import { getRngState, setRngState } from "../src/engine/rng";
import { ensureStaff, hireStaff, staffAccepts, staffCandidates, staffMonthly, staffStars, staffWageBill, setStaffStars, STAFF_ROLES } from "../src/engine/staff";
import type { StaffMember } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const make = (seed: number, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });

describe("comissão técnica", () => {
  it("ensureStaff é determinístico por semente e não mexe no gerador global", () => {
    const a = make(5);
    const b = make(5);
    setRngState(12345);
    ensureStaff(a);
    expect(getRngState()).toBe(12345);
    ensureStaff(b);
    expect(JSON.stringify(a.staff)).toBe(JSON.stringify(b.staff));
    expect(STAFF_ROLES.every((r) => a.staff?.[r] && a.staff[r]!.stars >= 1 && a.staff[r]!.stars <= 5)).toBe(true);
    // candidatos também não mexem no global e ficam em cache na janela
    const c1 = staffCandidates(a, "tre");
    expect(getRngState()).toBe(12345);
    expect(c1).toHaveLength(6);
    expect(staffCandidates(a, "tre")).toBe(c1);
  });

  it("clubes da IA têm sempre 3★", () => {
    const w = make(6);
    ensureStaff(w);
    for (const r of STAFF_ROLES) setStaffStars(w, r, 5);
    expect(staffStars(w, w.clubs[w.userClubId], "tre")).toBe(5);
    expect(staffStars(w, w.clubs.palmeiras, "tre")).toBe(3);
    expect(staffStars(w, w.clubs.palmeiras, "fis")).toBe(3);
  });

  it("contratar cobra 3 salários do atual e define o contrato", () => {
    const w = make(7);
    ensureStaff(w);
    const club = w.clubs[w.userClubId];
    const old = w.staff!.fis!;
    const cand: StaffMember = { ...staffCandidates(w, "fis")[0], stars: 3 };
    const bal = club.balance;
    const r = hireStaff(w, cand);
    expect(r.ok).toBe(true);
    expect(bal - club.balance).toBe(3 * old.wage);
    expect(club.finance.expense.release).toBe(3 * old.wage);
    expect(w.staff!.fis!.until).toBe(w.season + 2);
    expect(w.staff!.fis!.name).toBe(cand.name);
  });

  it("candidato bom demais para clube pequeno recusa", () => {
    const w = make(8);
    ensureStaff(w);
    const club = w.clubs[w.userClubId];
    club.rep = 30; // ceil(30/20) + 1 = 3
    const cand: StaffMember = { ...staffCandidates(w, "olh")[0], stars: 4 };
    expect(staffAccepts(w, cand)).toBe(false);
    const before = JSON.stringify(w.staff);
    expect(hireStaff(w, cand).ok).toBe(false);
    expect(JSON.stringify(w.staff)).toBe(before);
    expect(staffAccepts(w, { stars: 3 })).toBe(true);
  });

  it("folha com todos 3★ na Série A = R$ 650 mil", () => {
    const w = make(9);
    ensureStaff(w);
    for (const r of STAFF_ROLES) setStaffStars(w, r, 3);
    expect(staffWageBill(w)).toBe(650_000);
  });

  it("monthlyFinances lança 'comissao' só para o usuário", () => {
    const w = make(10);
    staffMonthly(w);
    monthlyFinances(w);
    expect(w.clubs[w.userClubId].finance.expense.comissao).toBe(staffWageBill(w));
    expect(staffWageBill(w)).toBeGreaterThan(0);
    expect(Object.values(w.clubs).filter((c) => c.id !== w.userClubId && c.finance.expense.comissao).length).toBe(0);
  });

  it("renova sozinho com +10% quando o contrato vence", () => {
    const w = make(11);
    ensureStaff(w);
    const s = w.staff!.aux!;
    s.until = w.season - 1;
    const wage = s.wage;
    staffMonthly(w);
    expect(s.until).toBe(w.season + 1);
    expect(s.wage).toBeGreaterThan(wage);
  });
});
