import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

// Mock de document/canvas para execução sem navegador
if (typeof document === "undefined") {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => new Proxy({}, {
        get: (_target, prop) => {
          if (prop === "measureText") return () => ({ width: 50 });
          if (prop === "createLinearGradient" || prop === "createRadialGradient") {
            return () => ({ addColorStop: () => {} });
          }
          if (prop === "getImageData") {
            return () => ({ data: new Uint8ClampedArray(100 * 100 * 4) });
          }
          return () => {};
        },
      }),
      width: 100,
      height: 100,
    }),
  };
}

import { ballPass, ballKick, netRipple, savePunch, tackle } from "../src/ui/audio";
import { Stadium, type StadiumOpts } from "../src/ui/match3d/stadium";
import { handStyle } from "../src/data/stadiumStyles";
import { stadiumArt } from "../src/ui/stadiumArt";

describe("Ativos e dados fiéis (Remo, MorumBIS, Jogadores)", () => {
  it("escudo do Clube do Remo existe e é um arquivo de imagem válido", () => {
    const remoPath = path.resolve(__dirname, "../public/media/crests/remo.webp");
    expect(fs.existsSync(remoPath)).toBe(true);
    const stats = fs.statSync(remoPath);
    expect(stats.size).toBeGreaterThan(1000);

    // Checa cabeçalho WebP (RIFF .... WEBP)
    const buf = Buffer.alloc(12);
    const fd = fs.openSync(remoPath, "r");
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("foto de Lucas Moura (Q312886) existe e é um WebP válido", () => {
    const lucasPath = path.resolve(__dirname, "../public/media/players/Q312886.webp");
    expect(fs.existsSync(lucasPath)).toBe(true);
    const stats = fs.statSync(lucasPath);
    expect(stats.size).toBeGreaterThan(1000);

    const buf = Buffer.alloc(12);
    const fd = fs.openSync(lucasPath, "r");
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("Luciano está cadastrado com ano de nascimento correto (1993)", () => {
    const dbPath = path.resolve(__dirname, "../src/data/database.json");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    const luciano = db.players.find((p: any) => p.n === "Luciano" && p.q === "Q15966749");
    expect(luciano).toBeDefined();
    expect(luciano.b).toBe(1993);

    const portraitsPath = path.resolve(__dirname, "../src/data/portraits.json");
    const portraits = JSON.parse(fs.readFileSync(portraitsPath, "utf-8"));
    expect(portraits["Luciano|1993"]).toBe("s126");
  });

  it("efeitos sonoros essenciais de futebol estão exportados e implementados", () => {
    expect(typeof ballPass).toBe("function");
    expect(typeof ballKick).toBe("function");
    expect(typeof netRipple).toBe("function");
    expect(typeof savePunch).toBe("function");
    expect(typeof tackle).toBe("function");

    // No ambiente Node/JSDOM, AudioContext deve retornar graciosamente sem estourar
    expect(() => ballPass()).not.toThrow();
    expect(() => ballKick(1.0)).not.toThrow();
    expect(() => netRipple()).not.toThrow();
    expect(() => savePunch()).not.toThrow();
    expect(() => tackle()).not.toThrow();
  });

  it("estádio 2D (stadiumArt) define pista vermelha e setores oficiais para o MorumBIS", () => {
    const style = handStyle("morumbis")!;
    expect(style.track).toBe("#a83c2e");
    const art = stadiumArt({
      home: { id: "sao-paulo", stadium: "MorumBIS", capacity: 66795, colors: ["#ffffff", "#c4122f", "#111111"], rep: 92, abbr: "SAO" },
      away: { id: "palmeiras", rep: 92, colors: ["#006437", "#ffffff", "#006437"] },
      neutral: false,
      stage: "league",
    });
    // Setor Sul deve ter vermelho Independente
    expect(art.seatAt(40, 60)).toBe("#c4122f");
    // Setor Leste deve ter azul fora do mosaico e branco no mosaico
    expect(art.seatAt(65, 10)).toBe("#1a3d6e");
    expect(art.seatAt(100, 10)).toBe("#ffffff");
  });

  it("modelo 3D do MorumBIS constrói estrutura completa com rampas helicoidais, fosso e setores", () => {
    const scene = new THREE.Scene();
    const style = handStyle("morumbis");
    expect(style).not.toBeNull();
    const opts: StadiumOpts = {
      style: style!,
      quality: "alta",
      home: { colors: ["#c81d25", "#ffffff", "#000000"], abbr: "SAO", name: "São Paulo" },
      away: { colors: ["#0044ff", "#ffffff"], abbr: "REM", name: "Remo" },
      neutral: false,
      crowdSide: 0,
      festa: 1,
      reduced: false,
    };
    const stadium = new Stadium(opts, scene);
    expect(stadium).toBeDefined();
    expect(stadium.group.children.length).toBeGreaterThan(80);

    // Verifica que existe geometria com profundidade do fosso (Y = -1.6m) e topo do Anel 3 (Y >= 40m)
    let foundMoatDepth = false;
    let foundHighTiers = false;
    let foundRampTowers = 0;
    stadium.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry && mesh.geometry.attributes.position) {
        const pos = mesh.geometry.attributes.position.array;
        for (let i = 1; i < pos.length; i += 3) {
          if (pos[i] <= -1.5) foundMoatDepth = true;
          if (pos[i] >= 38.0) foundHighTiers = true;
        }
      }
      if (mesh.geometry instanceof THREE.CylinderGeometry) {
        const params = mesh.geometry.parameters;
        if (params && params.radiusTop >= 9.5 && params.height >= 35) {
          foundRampTowers++;
        }
      }
    });

    expect(foundMoatDepth).toBe(true);
    expect(foundHighTiers).toBe(true);
    expect(foundRampTowers).toBe(4); // 4 rampas helicoidais monumentais
  });
});
