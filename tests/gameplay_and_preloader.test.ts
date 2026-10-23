import { describe, expect, it } from "vitest";
import { SHOUTS, shoutDef } from "../src/engine/shouts";
import { TONES } from "../src/engine/teamtalk";
import { DUO } from "../src/ui/icons";
import { broadcastCam } from "../src/ui/match3d/model";
import { isGamePreloaded, setGamePreloaded } from "../src/ui/GamePreloader";

describe("Ícones Próprios, Preloader e Jogabilidade", () => {
  it("Todos os shouts possuem ícones vetoriais próprios sem depender de emojis", () => {
    for (const s of SHOUTS) {
      expect(s.icon).toBeDefined();
      expect(typeof s.icon).toBe("string");
      expect(s.icon.length).toBeGreaterThan(0);
      // Deve existir em DUO
      expect(DUO[s.icon], `Ícone ${s.icon} do shout ${s.id} deve estar cadastrado em DUO`).toBeDefined();
    }
    const retranca = shoutDef("retranca");
    expect(retranca?.icon).toBe("wall");

    const pressao = shoutDef("pressao");
    expect(pressao?.icon).toBe("flameTactical");

    const contra = shoutDef("contra");
    expect(contra?.icon).toBe("counter");
  });

  it("Todos os tons de preleção possuem ícones vetoriais próprios (substituindo foguinho de celular)", () => {
    for (const key of Object.keys(TONES) as (keyof typeof TONES)[]) {
      const t = TONES[key];
      expect(t.icon).toBeDefined();
      expect(DUO[t.icon], `Ícone ${t.icon} de ${key} deve estar cadastrado em DUO`).toBeDefined();
    }
    expect(TONES.motivar.icon).toBe("flameTactical");
    expect(TONES.exigir.icon).toBe("bullhorn");
    expect(TONES.confiar.icon).toBe("handshake");
  });

  it("Ícones de status de jogador em DUO cobrem lesão, cartões, mercado e fase", () => {
    expect(DUO.crossMedical).toBeDefined();
    expect(DUO.cardRed).toBeDefined();
    expect(DUO.priceTag).toBeDefined();
    expect(DUO.flameTactical).toBeDefined();
    expect(DUO.coldForm).toBeDefined();
    expect(DUO.heartIdol).toBeDefined();
    expect(DUO.doorExit).toBeDefined();
    expect(DUO.stopwatch).toBeDefined();
  });

  it("Câmera broadcastCam no mobile vertical (aspect < 1.5) é mais próxima e nítida", () => {
    // Mobile vertical típico: 360 x 640 (aspect = 0.56)
    const mobileCam = broadcastCam(0, 0, 0.56);

    // No mobile a câmera fica mais próxima (distância z menor) para jogadores e bola ficarem nítidos
    expect(mobileCam.pos[2]).toBeLessThan(42);
    expect(mobileCam.pos[1]).toBeLessThan(25);
    expect(mobileCam.fov).toBeGreaterThanOrEqual(36);

    // Com a bola próxima ao gol rival (x = 45m), zoom dinâmico aproxima a câmera
    const goalCam = broadcastCam(45, 0, 0.56);
    expect(goalCam.pos[2]).toBeLessThan(mobileCam.pos[2]);
  });

  it("GamePreloader controla o ciclo de pré-carregamento com flag em memória", () => {
    setGamePreloaded(false);
    expect(isGamePreloaded()).toBe(false);

    setGamePreloaded(true);
    expect(isGamePreloaded()).toBe(true);
  });
});
