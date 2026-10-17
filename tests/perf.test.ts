import { describe, expect, it } from "vitest";
import { isWeakDevice } from "../src/ui/perf";

describe("detecção de celular fraco (modo leve)", () => {
  it("Redmi 10A (Helio G25, 2–3 GB, PowerVR GE8320) é fraco", () => {
    expect(isWeakDevice({ memory: 2, cores: 8, gpu: "PowerVR Rogue GE8320" })).toBe(true);
    expect(isWeakDevice({ memory: 4, cores: 8, gpu: "PowerVR Rogue GE8320" })).toBe(true);
    expect(isWeakDevice({ memory: 3, cores: 8, gpu: "Mali-G57" })).toBe(true);
  });
  it("FPS medido baixo em GPU intermediária liga o modo leve", () => {
    expect(isWeakDevice({ memory: 4, cores: 8, gpu: "Mali-G57", fps: 28 })).toBe(true);
  });
  it("Galaxy S24 Ultra não é fraco (nem se o FPS medido em segundo plano oscilar)", () => {
    expect(isWeakDevice({ memory: 8, cores: 8, gpu: "Adreno (TM) 750", fps: 120 })).toBe(false);
    expect(isWeakDevice({ memory: 12, cores: 8, gpu: "Adreno (TM) 750", fps: 28 })).toBe(false);
    expect(isWeakDevice({ memory: 8, cores: 8, gpu: "Samsung Xclipse 940", fps: 25 })).toBe(false);
    expect(isWeakDevice({})).toBe(false);
  });
});
