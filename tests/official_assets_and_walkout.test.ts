import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import db from "../src/data/database.json";
import { postHit } from "../src/ui/audio";
import { lookOf } from "../src/ui/matchSprites";

describe("Ativos Oficiais, Walkout Cerimonial e IA de Jogo", () => {
  it("todos os clubes possuem flag de logo ativo no banco de dados", () => {
    expect(db.clubs.length).toBe(222);
    const semLogo = db.clubs.filter((c) => c.logo !== 1);
    expect(semLogo.length).toBe(0);
  });

  it("escudos oficiais do São Paulo FC e Clube do Remo existem no disco em alta qualidade", () => {
    const spfcPath = path.resolve("public/media/crests/sao-paulo.webp");
    const remoPath = path.resolve("public/media/crests/remo.webp");

    expect(fs.existsSync(spfcPath)).toBe(true);
    expect(fs.existsSync(remoPath)).toBe(true);

    const spfcSize = fs.statSync(spfcPath).size;
    const remoSize = fs.statSync(remoPath).size;

    expect(spfcSize).toBeGreaterThan(5000);
    expect(remoSize).toBeGreaterThan(5000);
  });

  it("jogadores reais do São Paulo possuem aparências fiéis mapeadas", () => {
    const calleri = lookOf({
      id: 1, name: "Jonathan Calleri", pos: "ATA", born: 1993,
      face: { s: 12345, r: "white" },
      attrs: { fin: 84, pas: 72, vel: 76, dri: 75, def: 40, fis: 83, psi: 82, rec: 75 },
    } as any);

    expect(calleri.beard).toBe(true);
    expect(calleri.hairStyle).toBe("short");

    const lucas = lookOf({
      id: 2, name: "Lucas Moura", pos: "MEI", born: 1992,
      face: { s: 54321, r: "brown" },
      attrs: { fin: 78, pas: 80, vel: 85, dri: 86, def: 50, fis: 72, psi: 80, rec: 74 },
    } as any);

    expect(lucas.hairStyle).toBe("buzz");
    expect(lucas.beard).toBe(true);
  });

  it("função de som metálico na trave (postHit) está exportada e é chamável", () => {
    expect(typeof postHit).toBe("function");
    // Não deve lançar erro mesmo fora de navegador/DOM ativo
    expect(() => postHit()).not.toThrow();
  });
});
