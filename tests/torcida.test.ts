import { describe, expect, it } from "vitest";
import { crowdMood, crowdProfile, crowdSize, festaLevel, isBrazilian, isSelecao, type MoodInput } from "../src/ui/torcida";
import type { Club } from "../src/engine/types";

const club = (id: string, country: string, rep: number, capacity: number) => ({ id, country, rep, capacity, colors: ["#f00", "#000", "#fff"] }) as unknown as Club;
const fla = club("flamengo", "BRA", 100, 78838);
const vasco = club("vasco", "BRA", 85, 21880);
const small = club("tombense", "BRA", 30, 3000);
const boca = club("boca", "ARG", 95, 54000);
const selecao = club("nt-BRA", "BRA", 100, 78000);

const base: MoodInput = { minute: 50, goals: [0, 0], poss: [25, 25], shots: [5, 5], atk: null, streak: 0 };

describe("torcida brasileira", () => {
  it("só clubes brasileiros e a Seleção", () => {
    expect(isBrazilian(fla)).toBe(true);
    expect(isBrazilian(boca)).toBe(false);
    expect(isSelecao(selecao)).toBe(true);
    expect(crowdProfile(boca, fla, false)).toBeNull();
    expect(crowdProfile(fla, boca, false)?.clubId).toBe("flamengo");
    // campo neutro: vale a torcida do usuário, se for brasileiro
    expect(crowdProfile(boca, fla, true, 1)?.side).toBe(1);
    expect(festaLevel(boca, false)).toBe(0);
  });

  it("Seleção tem ambiente próprio; clube com gravação usa a dele", () => {
    const s = crowdProfile(selecao, boca, false)!;
    expect(s.selecao).toBe(true);
    expect(s.bed).not.toBe(crowdProfile(fla, boca, false)!.bed);
    expect(crowdProfile(vasco, fla, false)!.clubSpecific).toBe(true);
    expect(crowdProfile(fla, vasco, false)!.clubSpecific).toBe(false);
  });

  it("torcida grande faz mais barulho", () => {
    expect(crowdSize(fla)).toBeGreaterThan(crowdSize(small));
    expect(crowdSize(fla)).toBeLessThanOrEqual(1);
    expect(crowdSize(small)).toBeGreaterThan(0);
  });

  it("vaia quando o time perde feio, olé quando domina ganhando", () => {
    expect(crowdMood({ ...base, goals: [0, 2] }, 0, 0.8).boo).toBe(true);
    expect(crowdMood({ ...base, goals: [1, 1] }, 0, 0.8).boo).toBe(false);
    const ole = crowdMood({ ...base, goals: [3, 0], poss: [32, 18], atk: 0, streak: 3 }, 0, 0.8);
    expect(ole.ole).toBe(true);
    expect(ole.boo).toBe(false);
    // do ponto de vista do visitante, o mesmo placar é vaia
    expect(crowdMood({ ...base, goals: [3, 0] }, 1, 0.8).boo).toBe(true);
  });

  it("ataque do time levanta a arquibancada", () => {
    const calm = crowdMood(base, 0, 0.6).intensity;
    const press = crowdMood({ ...base, atk: 0, streak: 3 }, 0, 0.6).intensity;
    expect(press).toBeGreaterThan(calm);
    for (const m of [calm, press]) expect(m).toBeGreaterThanOrEqual(0.35);
  });
});
