import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STADIUM_MODELS, buildStadium, findModel, fitToBowl, genericModel, type StadiumModel } from "../src/ui/hq/stadium";
import { minRect, superEllipse } from "../src/ui/hq/geo";
import { buildCity } from "../src/ui/hq/city";
import db from "../src/data/database.json";
import sites from "../src/data/clubSites.json";

const clubs = (db as unknown as { clubs: { id: string; stadium: string; div?: string }[] }).clubs;
const opts = (q: number) => ({
  q, night: false, matchDay: true, colors: ["#c4122f", "#ffffff"] as [string, string], stadiumLv: q,
  tex: () => null, mat: (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p),
});

function finite(g: THREE.Object3D): boolean {
  let ok = true;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    const a = m.geometry?.attributes?.position;
    if (!a) return;
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) { ok = false; return; }
  });
  return ok;
}

describe("estádios marcantes (stadiumModels.json)", () => {
  const keys = Object.keys(STADIUM_MODELS);
  it("cobre os grandes da Série A pedidos", () => {
    for (const k of ["morumbis", "maracana", "allianz", "neoquimica", "mineirao", "arenamrv", "beirario", "arenagremio", "vilabelmiro",
      "saojanuario", "niltonsantos", "baixada", "fontenova", "castelao", "arenape", "coutopereira", "barradao"]) expect(keys).toContain(k);
  });
  it("tem parâmetros válidos e clubes existentes", () => {
    const ids = new Set(clubs.map((c) => c.id));
    for (const [k, m] of Object.entries(STADIUM_MODELS)) {
      expect(m.tiers.length, k).toBeGreaterThan(0);
      expect(m.inner[0], k).toBeGreaterThan(52.5);
      expect(m.inner[1], k).toBeGreaterThan(34);
      expect(m.lat! < 6 && m.lat! > -34 && m.lon! < -34 && m.lon! > -74, k).toBe(true);
      for (const t of m.tiers) for (const s of t.seats) expect(s).toMatch(/^#[0-9a-f]{6}$/i);
      for (const c of m.clubs ?? []) expect(ids.has(c), `${k}: ${c}`).toBe(true);
    }
  });
  it("acha o modelo pelo clube ou pelo nome do estádio", () => {
    expect(findModel("sao-paulo")?.key).toBe("morumbis");
    expect(findModel("flamengo")?.key).toBe("maracana");
    expect(findModel("fluminense")?.key).toBe("maracana");
    expect(findModel("x", "Nubank Parque")?.key).toBe("allianz");
    expect(findModel("x", "Estádio Qualquer")).toBeNull();
  });
  it("gera geometria finita em todos os níveis", () => {
    for (const [k, m] of Object.entries(STADIUM_MODELS)) for (const q of [1, 5]) {
      const { group, topY, outer } = buildStadium(m as StadiumModel, opts(q));
      expect(finite(group), k).toBe(true);
      expect(topY, k).toBeGreaterThan(10);
      expect(outer[0], k).toBeGreaterThan(outer[1] * 0.9);
    }
  });
  it("estádio genérico usa o contorno do OSM e cresce com o nível", () => {
    const small = genericModel(["#000000", "#ffffff"], 1);
    const big = genericModel(["#000000", "#ffffff"], 5);
    expect(big.tiers.length).toBeGreaterThanOrEqual(small.tiers.length);
    expect(big.roof?.type).toBe("ring");
    const g = buildStadium(genericModel(["#000000", "#ffffff"], 3, { rect: [0, 0, 120, 95, 30], h: 0, outline: [], fill: 0.8 }), opts(3));
    expect(finite(g.group)).toBe(true);
  });
});

describe("geometria do mapa", () => {
  it("retângulo mínimo acha o eixo longo e o ângulo", () => {
    const a = 0.5, pts: [number, number][] = [];
    for (let i = 0; i < 64; i++) { const [x, z] = superEllipse((i / 64) * Math.PI * 2, 150, 120, 2); pts.push([x * Math.cos(a) - z * Math.sin(a) + 10, x * Math.sin(a) + z * Math.cos(a) - 5]); }
    const r = minRect(pts);
    expect(r.hw).toBeGreaterThan(145); expect(r.hw).toBeLessThan(155);
    expect(r.hh).toBeGreaterThan(115); expect(r.hh).toBeLessThan(125);
    expect(Math.abs(Math.sin(r.ang - a))).toBeLessThan(0.08);
    expect(Math.abs(r.cx - 10)).toBeLessThan(2);
  });
  it("encaixa o estádio no contorno real do Morumbis", () => {
    const geo = (sites as unknown as { clubs: Record<string, { osm?: { stadium?: { bowl?: { rect: [number, number, number, number, number]; h: number; outline: number[]; fill: number } } } }> }).clubs["sao-paulo"];
    const bowl = geo?.osm?.stadium?.bowl;
    expect(bowl).toBeTruthy();
    const f = fitToBowl([140, 118], bowl);
    expect(f.sx).toBeGreaterThan(0.8); expect(f.sx).toBeLessThan(1.25);
    expect(Math.hypot(f.x, f.z)).toBeLessThan(120);
  });
  it("entorno real monta sem erro (ruas, prédios, árvores)", () => {
    const all = (sites as unknown as { clubs: Record<string, { osm?: Record<string, unknown> }> }).clubs;
    const osm = all["flamengo"]?.osm?.stadium as Parameters<typeof buildCity>[0];
    const lod = buildCity(osm, { q: 3, night: false, tex: () => null, mat: (p) => new THREE.MeshStandardMaterial(p), radius: 600, seed: 1 });
    expect(lod.levels.length).toBe(2);
    expect(finite(lod)).toBe(true);
  });
  it("todos os clubes das Séries A e B têm local real", () => {
    const all = (sites as unknown as { clubs: Record<string, unknown> }).clubs;
    for (const c of clubs.filter((x) => x.div === "A" || x.div === "B")) expect(all[c.id], c.id).toBeTruthy();
  });
});
