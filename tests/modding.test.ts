import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { applyModToWorld, getModTemplateJson, parseModPackage, type ModPackage } from "../src/engine/modding";
import { createWorld, type Database } from "../src/engine/world";

describe("Sistema de Modding & Custom Database (Openfoot Manager style)", () => {
  it("valida e interpreta template de patch padrão", () => {
    const template = getModTemplateJson();
    const res = parseModPackage(template);
    expect(res.ok).toBe(true);
    expect(res.mod?.meta.name).toBe("Super Copa Paulista & Amigos");
    expect(res.mod?.clubs?.length).toBe(1);
    expect(res.mod?.players?.length).toBe(2);
  });

  it("rejeita JSON inválido ou sem meta.name", () => {
    const invalidJson = "{ algo: quebrado }";
    expect(parseModPackage(invalidJson).ok).toBe(false);

    const noName = JSON.stringify({ meta: {}, clubs: [] });
    expect(parseModPackage(noName).ok).toBe(false);

    const empty = JSON.stringify({ meta: { name: "Vazio" }, clubs: [], players: [] });
    expect(parseModPackage(empty).ok).toBe(false);
  });

  it("aplica novos clubes e jogadores a um World existente com segurança", () => {
    const w = createWorld(db as Database, { managerName: "Treinador Teste", clubId: "sao-paulo", seed: 99 });
    const mod: ModPackage = {
      meta: { name: "Patch Teste", author: "Dev", version: "1.0" },
      clubs: [
        {
          id: "xv_piracicaba",
          name: "XV de Piracicaba",
          abbr: "XVP",
          colors: ["#000000", "#ffffff"],
          stadium: "Barão de Serra Negra",
          stadiumCapacity: 18000,
          level: 65,
        },
      ],
      players: [
        {
          name: "Nhô Quim",
          clubId: "xv_piracicaba",
          pos: "ATA",
          age: 20,
          ovr: 75,
          pot: 85,
          foot: "D",
        },
        {
          name: "Craque Sem Clube",
          pos: "MEI",
          age: 25,
          ovr: 76,
          pot: 78,
          foot: "E",
        },
      ],
    };

    const res = applyModToWorld(w, mod);
    expect(res.clubsAdded).toBe(1);
    expect(res.playersAdded).toBe(2);

    const club = w.clubs["xv_piracicaba"];
    expect(club).toBeDefined();
    expect(club.name).toBe("XV de Piracicaba");
    expect(club.abbr).toBe("XVP");
    expect(club.stadium).toBe("Barão de Serra Negra");
    expect(club.players.length).toBe(1);

    const p = w.players[club.players[0]];
    expect(p).toBeDefined();
    expect(p.name).toBe("Nhô Quim");
    expect(p.pos).toBe("ATA");
    expect(p.ovr).toBeGreaterThanOrEqual(70);

    // Jogador sem clube adicionado
    const freeAgent = Object.values(w.players).find((pl) => pl.name === "Craque Sem Clube");
    expect(freeAgent).toBeDefined();
    expect(freeAgent?.clubId).toBeNull();
  });
});