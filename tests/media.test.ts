import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { LEGEND_BY_ID } from "../src/data/legends";
import { playerImageUrl, registerMedia, type RegenFace } from "../src/engine/media";
import { createWorld, migrateWorld, type Database } from "../src/engine/world";
import { spawnLegend, youthIntake } from "../src/engine/youth";

// índice falso de rostos: 4 por combinação de idade e tom de pele
const FACES: RegenFace[] = [];
for (const age of ["teen", "young", "adult"] as const)
  for (const skin of ["light", "medium", "dark", "asian"] as const)
    for (let i = 0; i < 8; i++) FACES.push({ id: FACES.length, age, skin });

describe("mídia real", () => {
  it("dá rosto realista só aos jogadores fictícios e foto às lendas", () => {
    registerMedia({ regenFaces: FACES, legends: { pele: "Q12897" } });
    const w = createWorld(db as Database, { managerName: "T", clubId: "santos", seed: 7 });
    const all = Object.values(w.players);
    const fictional = all.filter((p) => !p.real && !p.legend);
    expect(fictional.length).toBeGreaterThan(500);
    expect(fictional.every((p) => p.img?.startsWith("r"))).toBe(true);
    expect(all.filter((p) => p.real).every((p) => !p.img?.startsWith("r"))).toBe(true);
    // jogadores reais com foto no banco recebem a chave do Wikidata
    const withPhoto = (db as Database).players.filter((dp) => dp.img).length;
    expect(all.filter((p) => p.real && p.img).length).toBe(withPhoto);

    youthIntake(w);
    const kids = Object.values(w.players).filter((p) => p.youth && !p.real && w.season - p.born <= 17);
    expect(kids.every((p) => p.img?.startsWith("r"))).toBe(true);
    // o rosto respeita a idade: garotos usam rostos "teen"
    const teen = new Set(FACES.filter((f) => f.age === "teen").map((f) => `r${f.id}`));
    expect(kids.filter((p) => teen.has(p.img!)).length / kids.length).toBeGreaterThan(0.95);

    const pele = spawnLegend(w, LEGEND_BY_ID.pele, w.clubs.santos);
    expect(pele.img).toBe("Q12897");
    expect(playerImageUrl(pele)).toBe("media/players/Q12897.webp");
    expect(playerImageUrl({ img: "r12" })).toBe("media/regens/12.webp");
  });

  it("atualiza jogos salvos antigos com fotos, escudos e rostos", () => {
    registerMedia({ regenFaces: [] });
    const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 3 });
    // simula um save antigo: sem nenhuma mídia
    for (const p of Object.values(w.players)) delete p.img;
    for (const c of Object.values(w.clubs)) { delete c.logo; delete c.stadiumImg; }
    w.version = 1;
    registerMedia({ regenFaces: FACES });
    migrateWorld(w, db as Database);
    expect(w.version).toBe(2);
    expect(Object.values(w.players).filter((p) => !p.real && !p.legend).every((p) => p.img?.startsWith("r"))).toBe(true);
    const dbLogos = (db as Database).clubs.filter((c) => c.logo).length;
    expect(Object.values(w.clubs).filter((c) => c.logo).length).toBe(dbLogos);
  });
});
