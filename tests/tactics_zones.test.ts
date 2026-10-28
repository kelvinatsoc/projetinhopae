import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { phrase } from "../src/engine/commentary";
import { DEFAULT_TI, instructionFx, TI_INFO } from "../src/engine/tactics";
import type { Pos, Tactic } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

describe("Táticas por Zonas & Comentários Dinâmicos (Openfoot Manager style)", () => {
  it("contém as novas instruções de foco por zona e desarme no TI_INFO e DEFAULT_TI", () => {
    expect(DEFAULT_TI.focus).toBe(1);
    expect(DEFAULT_TI.tackling).toBe(1);
    expect(TI_INFO.focus).toBeDefined();
    expect(TI_INFO.focus.opts.length).toBe(3);
    expect(TI_INFO.tackling).toBeDefined();
    expect(TI_INFO.tackling.opts.length).toBe(3);
  });

  it("calcula os efeitos de foco e desarme em instructionFx", () => {
    const w = createWorld(db as Database, { managerName: "Treinador", clubId: "sao-paulo", seed: 99 });
    const club = w.clubs[w.userClubId];
    const slots: Pos[] = ["GOL", "ZAG", "ZAG", "LD", "LE", "VOL", "MC", "MEI", "PD", "PE", "ATA"];
    const ids = club.players.slice(0, 11);

    // Tática neutra
    const tNeutral: Tactic = { formation: "4-3-3", mentality: 0, pressing: 1, ti: { ...DEFAULT_TI } };
    const fxNeutral = instructionFx(w, tNeutral, slots, ids);
    expect(fxNeutral.focusLane).toBe(1);

    // Tática focada nas alas
    const tWings: Tactic = { formation: "4-3-3", mentality: 0, pressing: 1, ti: { ...DEFAULT_TI, focus: 0 } };
    const fxWings = instructionFx(w, tWings, slots, ids);
    expect(fxWings.focusLane).toBe(0);
    expect(fxWings.att).toBeGreaterThan(fxNeutral.att);
    expect(fxWings.open).toBeGreaterThan(fxNeutral.open);

    // Tática focada no centro
    const tCenter: Tactic = { formation: "4-3-3", mentality: 0, pressing: 1, ti: { ...DEFAULT_TI, focus: 2 } };
    const fxCenter = instructionFx(w, tCenter, slots, ids);
    expect(fxCenter.focusLane).toBe(2);
    expect(fxCenter.mid).toBeGreaterThan(fxNeutral.mid);

    // Desarme agressivo
    const tAggressive: Tactic = { formation: "4-3-3", mentality: 0, pressing: 1, ti: { ...DEFAULT_TI, tackling: 2 } };
    const fxAggressive = instructionFx(w, tAggressive, slots, ids);
    expect(fxAggressive.def).toBeGreaterThan(fxNeutral.def);
    expect(fxAggressive.card).toBeGreaterThan(fxNeutral.card);
  });

  it("gera frases válidas de narração por zona (zoneWing, zoneMid, zoneDef, pressMomentum)", () => {
    const wing = phrase("zoneWing", { t: "São Paulo", p: "Lucas", a: "Ferreirinha" });
    expect(wing).toBeTruthy();
    expect(wing.includes("Lucas")).toBe(true);

    const mid = phrase("zoneMid", { t: "São Paulo", p: "Rodrigo Nestor", a: "Calleri" });
    expect(mid).toBeTruthy();
    expect(mid.includes("Rodrigo Nestor")).toBe(true);

    const def = phrase("zoneDef", { t: "São Paulo", p: "Arboleda" });
    expect(def).toBeTruthy();
    expect(def.includes("Arboleda")).toBe(true);

    const mom = phrase("pressMomentum", { t: "São Paulo" });
    expect(mom).toBeTruthy();
    expect(mom.includes("São Paulo")).toBe(true);
  });
});