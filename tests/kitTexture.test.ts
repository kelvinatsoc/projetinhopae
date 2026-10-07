import { describe, expect, it } from "vitest";
import { awayKitIndex, kitBrands, kitInk, kitOf } from "../src/ui/kitTexture";
import { colorDistance, kitShirtColor, kitsOf } from "../src/ui/Kit";

describe("uniformes", () => {
  it("clube sem dados cai para uniforme liso nas cores dadas", () => {
    const k = kitOf("clube-que-nao-existe", 0, ["#123456", "#FFFFFF"]);
    expect(k.synthetic).toBe(true);
    expect(k.b).toBe("#123456");
    expect(kitOf("clube-que-nao-existe", 1, ["#123456", "#FFFFFF"]).b).toBe("#FFFFFF");
  });

  it("pede o reserva quando o titular se confunde com o mandante", () => {
    const i = awayKitIndex("flamengo", "flamengo");
    expect(i).toBeGreaterThan(0);
    const away = kitsOf("flamengo")[i];
    expect(colorDistance(kitShirtColor(away), kitShirtColor(kitsOf("flamengo")[0]))).toBeGreaterThanOrEqual(40);
  });

  it("marcas reais e cor do silk", () => {
    expect(kitBrands("flamengo").supplier).toBeTruthy();
    expect(kitInk({ name: "x", la: "#FFFFFF", b: "#FFFFFF", ra: "#FFFFFF", sh: "#000000", so: "#FFFFFF" })).toBe("#111111");
    expect(kitInk({ name: "x", la: "#000080", b: "#000080", ra: "#000080", sh: "#000000", so: "#FFFFFF" })).toBe("#FFFFFF");
  });

  it("padrões do corpo são válidos", () => {
    for (const id of ["flamengo", "palmeiras", "corinthians", "botafogo"]) {
      for (const k of kitsOf(id)) if (k.pat) expect(["stripes", "hoops", "sash", "halves", "band"]).toContain(k.pat);
    }
  });
});
