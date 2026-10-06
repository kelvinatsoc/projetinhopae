import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import { createWorld, type Database } from "../src/engine/world";
import { decodeWorld, encodeWorld, packWorld, readRecord, unpackWorld } from "../src/savePack";
import type { World } from "../src/engine/types";
import { makeWorldFixture } from "./fixtures/worldFixture";

/** Save em escala real: 13 ligas de 20 clubes + Brasil, depois de uma temporada inteira. */
function bigWorld(): World {
  const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 2, world: makeWorldFixture({ clubsPerLeague: 20 }) });
  for (let i = 0; i < 900; i++) {
    const r = advance(w);
    if (r.reason === "match" && r.fixture) { loadRng(w); const res = simulateFixture(w, r.fixture); saveRng(w); finishUserMatch(w, r.fixture, res); }
    else if (r.reason === "seasonEnd") { runEndOfSeason(w); break; }
  }
  return w;
}

describe("save compacto", () => {
  const w = bigWorld();
  const plain = JSON.parse(JSON.stringify(w)) as World; // o que um save antigo/exportado guarda

  it("jogadores em colunas: ida e volta exata", () => {
    const back = unpackWorld(JSON.parse(JSON.stringify(packWorld(w))));
    expect(back).toEqual(plain);
    expect(Object.keys(back.players)).toEqual(Object.keys(plain.players));
    // null (jogador livre) não vira "ausente"
    const free = Object.values(plain.players).find((p) => p.clubId === null)!;
    expect(back.players[free.id].clubId).toBeNull();
  });

  it("gzip bem abaixo de 5 MB, com tempo de gravação medido", async () => {
    const t0 = performance.now();
    const enc = await encodeWorld(w);
    const t1 = performance.now();
    const back = await decodeWorld(enc);
    const t2 = performance.now();
    const raw = JSON.stringify(w).length;
    const size = enc.fmt === "gz1" ? enc.data.byteLength : enc.data.length;
    console.log(`save: JSON ${(raw / 1e6).toFixed(1)} MB → ${enc.fmt} ${(size / 1e6).toFixed(2)} MB · gravar ${Math.round(t1 - t0)} ms · ler ${Math.round(t2 - t1)} ms`);
    expect(enc.fmt).toBe("gz1");
    expect(size).toBeLessThan(2.5e6);
    expect(back).toEqual(plain);
    expect(t1 - t0).toBeLessThan(5000);
  });

  it("sem gzip: JSON em colunas (menor que o antigo) e saves antigos continuam abrindo", async () => {
    const enc = await encodeWorld(w, false);
    expect(enc.fmt).toBe("col1");
    expect((enc.data as string).length).toBeLessThan(JSON.stringify(w).length);
    expect(await readRecord(enc)).toEqual(plain);
    expect(await readRecord({ world: plain })).toBe(plain);
    expect(await readRecord(undefined)).toBeNull();
  });
});
