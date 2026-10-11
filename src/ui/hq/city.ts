// Entorno urbano real de cada local (estádio, CT, sede) a partir do OpenStreetMap:
// ruas com largura pela categoria, calçadas e faixas, trilhos, rios e lagos, áreas verdes,
// campos, árvores (instanciadas) e prédios vizinhos extrudados com a altura real.
// Tudo em metros, com LOD: de longe só ficam os prédios grandes e as ruas simples.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng, pts, area, centroid, inside, minRect, type P2 } from "./geo";
import type { TexFactory } from "./stadium";

export interface GeoOsm {
  roads?: [number, number[]][];
  rail?: number[][];
  rivers?: [number, number[]][];
  green?: [number, number[]][] | number[][];
  water?: number[][];
  pitches?: [number, number[]][] | number[][];
  /** [altura em metros (0 = desconhecida), contorno] */
  buildings?: [number, number[]][];
  trees?: number[];
  bowl?: { rect: [number, number, number, number, number]; h: number; outline: number[]; fill: number };
  /** índices em buildings dos prédios do próprio clube */
  club?: number[];
  area?: number[];
}

export interface CityOpts {
  q: number;
  night: boolean;
  tex: TexFactory;
  mat: (p: THREE.MeshStandardMaterialParameters) => THREE.Material;
  radius: number;            // m
  /** pontos (m) onde não pode nascer árvore nem prédio de enchimento */
  avoid?: (x: number, z: number) => boolean;
  /** buraco no chão da ilha (contorno em m, ex.: a esplanada do estádio encaixado no desnível) */
  hole?: P2[];
  /** índices de prédios que quem chama desenha (prédios do clube) */
  skip?: Set<number>;
  seed: number;
  /** distância (unidades da cena) a partir da qual só fica o essencial */
  farAt?: number;
}

const ROAD_W = [4.5, 7.5, 10, 13, 18, 26];

/** Fita ao longo de uma polilinha (x, z), com uv: u = metros ao longo, v = 0..1 na largura. */
function ribbon(p: P2[], w: number, y: number): THREE.BufferGeometry | null {
  if (p.length < 2) return null;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let acc = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    // meia largura corrigida na dobra (limitada para não estourar em ângulos fechados)
    let k = 1;
    if (i > 0 && i < p.length - 1) {
      const d1x = p[i][0] - p[i - 1][0], d1z = p[i][1] - p[i - 1][1], l1 = Math.hypot(d1x, d1z) || 1;
      const cos = (d1x / l1) * dx + (d1z / l1) * dz;
      k = Math.min(2, 1 / Math.max(0.5, Math.sqrt((1 + cos) / 2)));
    }
    const nx = -dz * (w / 2) * k, nz = dx * (w / 2) * k;
    if (i > 0) acc += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    pos.push(p[i][0] + nx, y, p[i][1] + nz, p[i][0] - nx, y, p[i][1] - nz);
    uv.push(acc, 0, acc, 1);
    if (i > 0) { const s = (i - 1) * 2; idx.push(s, s + 2, s + 1, s + 1, s + 2, s + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function disc(x: number, z: number, r: number, y: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0, 0.5); // cor do asfalto, sem faixa
  return g;
}

function fillPoly(p: P2[], y: number): THREE.BufferGeometry | null {
  if (p.length < 3) return null;
  const sh = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  // uv em metros (texturas repetidas)
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
  return g;
}

/**
 * Junta prédios extrudados mantendo telhado (grupo 0) e paredes (grupo 1) separados.
 * (mergeGeometries com grupos numera um grupo por geometria, o que sumia com quase todos os prédios.)
 */
export function mergeExtruded(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const parts: THREE.BufferGeometry[][] = [[], []];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: (g.attributes.position as THREE.BufferAttribute).count, materialIndex: 1 }];
    for (const gr of groups) {
      const part = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) {
        const a = attr as THREE.BufferAttribute;
        part.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
      }
      parts[Math.min(1, gr.materialIndex ?? 1)].push(part);
    }
  }
  const caps = parts[0].length ? mergeGeometries(parts[0]) : null, sides = parts[1].length ? mergeGeometries(parts[1]) : null;
  const both = [caps, sides].filter(Boolean) as THREE.BufferGeometry[];
  const out = mergeGeometries(both, true);
  // grupos: 0 = telhados, 1 = paredes
  if (out && both.length === 1) out.groups[0].materialIndex = caps ? 0 : 1;
  return out;
}

const flatOf = (e: [number, number[]] | number[]): [number, number[]] => (Array.isArray(e[1]) ? (e as [number, number[]]) : [0, e as number[]]);

/** Monta o entorno; devolve um LOD (perto: tudo; longe: só o essencial). */
export function buildCity(osm: GeoOsm, o: CityOpts): THREE.LOD {
  const { q, tex, mat, radius: R } = o;
  const r = rng(o.seed);
  const near = new THREE.Group(), far = new THREE.Group();
  const avoid = o.avoid ?? (() => false);
  const inR = (x: number, z: number) => Math.hypot(x, z) < R;
  const off = (f: number) => ({ polygonOffset: true, polygonOffsetFactor: -f, polygonOffsetUnits: -f * 2 });

  // ---------------- chão da cidade (quadras), com borda que se dissolve no relevo
  const groundTex = tex(256, 256, (x) => {
    x.fillStyle = "#b4aea2"; x.fillRect(0, 0, 256, 256);
    const rr = rng(11);
    for (let i = 0; i < 2600; i++) { const v = 150 + Math.floor(rr() * 40); x.fillStyle = `rgb(${v},${v - 4},${v - 12})`; x.fillRect(rr() * 256, rr() * 256, 3, 3); }
    x.strokeStyle = "rgba(0,0,0,0.06)"; for (let i = 0; i < 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  }, true);
  if (groundTex) groundTex.repeat.set(1 / 40, 1 / 40);
  let gg: THREE.BufferGeometry;
  if (o.hole && o.hole.length > 3) {
    const sh = new THREE.Shape();
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; const x = Math.cos(a) * R * 1.04, y = Math.sin(a) * R * 1.04; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
    // furo com orientação oposta à do contorno
    const hp = o.hole.map(([x, z]) => new THREE.Vector2(x, -z));
    const ccw = THREE.ShapeUtils.isClockWise(hp);
    sh.holes.push(new THREE.Path(ccw ? hp : hp.reverse()));
    gg = new THREE.ShapeGeometry(sh, 1);
  } else gg = new THREE.CircleGeometry(R * 1.04, 96);
  gg.rotateX(-Math.PI / 2);
  const gpos = gg.attributes.position as THREE.BufferAttribute, guv = gg.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, gpos.getX(i), gpos.getZ(i));
  const ground = new THREE.Mesh(gg, mat({ color: groundTex ? 0xffffff : 0xb4aea2, map: groundTex ?? undefined, roughness: 1 }));
  ground.position.y = 0.02; ground.receiveShadow = true;
  near.add(ground);
  const groundFar = new THREE.Mesh(gg, mat({ color: 0xb0aa9e, roughness: 1 }));
  groundFar.position.y = 0.02; far.add(groundFar);

  // ---------------- áreas verdes e água
  const greens: THREE.BufferGeometry[] = [], woods: THREE.BufferGeometry[] = [];
  const greenPolys: [number, P2[]][] = [];
  for (const e of osm.green ?? []) {
    const [kind, f] = flatOf(e);
    const p = pts(f);
    if (p.length < 3 || !p.some(([x, z]) => inR(x, z))) continue;
    const g = fillPoly(p, 0.06 + (kind ? 0.01 : 0));
    if (g) (kind ? woods : greens).push(g);
    greenPolys.push([kind, p]);
  }
  const grassTex = tex(128, 128, (x) => {
    x.fillStyle = "#5f9447"; x.fillRect(0, 0, 128, 128);
    const rr = rng(5);
    for (let i = 0; i < 1500; i++) { x.fillStyle = rr() < 0.5 ? "#588c40" : "#6a9e50"; x.fillRect(rr() * 128, rr() * 128, 2, 2); }
  }, true);
  if (grassTex) grassTex.repeat.set(1 / 20, 1 / 20);
  if (greens.length) {
    const m = new THREE.Mesh(mergeGeometries(greens), mat({ color: grassTex ? 0xffffff : 0x5f9447, map: grassTex ?? undefined, roughness: 1, ...off(1) }));
    m.receiveShadow = true; near.add(m); far.add(new THREE.Mesh(m.geometry, mat({ color: 0x5f9447, roughness: 1, ...off(1) })));
  }
  if (woods.length) {
    const m = new THREE.Mesh(mergeGeometries(woods), mat({ color: 0x3f6f32, roughness: 1, ...off(1) }));
    m.receiveShadow = true; near.add(m); far.add(m.clone());
  }
  const waterM = mat({ color: 0x2f6688, roughness: 0.08, metalness: 0.25, ...off(2) });
  const waters: THREE.BufferGeometry[] = [];
  for (const f of osm.water ?? []) { const g = fillPoly(pts(f), 0.09); if (g) waters.push(g); }
  for (const [w, f] of osm.rivers ?? []) { const g = ribbon(pts(f), w, 0.09); if (g) waters.push(g); }
  if (waters.length) {
    const wm = new THREE.Mesh(mergeGeometries(waters.map((g) => { const h = g.index ? g.toNonIndexed() : g; h.deleteAttribute("uv"); return h; })), waterM);
    wm.receiveShadow = true; near.add(wm); far.add(wm.clone());
  }

  // ---------------- ruas: calçada + asfalto com faixas
  const asphalt = tex(64, 64, (x) => {
    x.fillStyle = "#3c3f44"; x.fillRect(0, 0, 64, 64);
    const rr = rng(9);
    for (let i = 0; i < 400; i++) { const v = 52 + Math.floor(rr() * 18); x.fillStyle = `rgb(${v},${v + 2},${v + 6})`; x.fillRect(rr() * 64, rr() * 64, 1, 1); }
  }, true);
  const markTex = (cls: number) => tex(64, 64, (x) => {
    x.fillStyle = "#3c3f44"; x.fillRect(0, 0, 64, 64);
    const rr = rng(cls + 3);
    for (let i = 0; i < 300; i++) { const v = 52 + Math.floor(rr() * 18); x.fillStyle = `rgb(${v},${v + 2},${v + 6})`; x.fillRect(rr() * 64, rr() * 64, 1, 1); }
    // bordas brancas e eixo (amarelo duplo nas avenidas, tracejado nas menores)
    x.fillStyle = "#e9e9e2"; x.fillRect(0, 2, 64, 1.5); x.fillRect(0, 60.5, 64, 1.5);
    if (cls >= 4) { x.fillStyle = "#e7c23a"; x.fillRect(0, 30, 64, 1.4); x.fillRect(0, 33, 64, 1.4); x.fillStyle = "#e9e9e2"; for (const y of [16, 47]) x.fillRect(0, y, 30, 1.2); }
    else if (cls >= 2) { x.fillStyle = "#e7c23a"; x.fillRect(0, 31, 34, 1.6); }
    else if (cls === 1) { x.fillStyle = "rgba(233,233,226,0.6)"; x.fillRect(0, 31.5, 22, 1); }
  }, true);
  const byCls: THREE.BufferGeometry[][] = [[], [], [], [], [], []];
  const walks: THREE.BufferGeometry[] = [], joints: THREE.BufferGeometry[] = [], wjoints: THREE.BufferGeometry[] = [];
  const streetTrees: P2[] = [];
  for (const [cls, f] of osm.roads ?? []) {
    const p = pts(f);
    if (!p.some(([x, z]) => inR(x, z))) continue;
    const w = ROAD_W[Math.max(0, Math.min(5, cls))];
    const a = ribbon(p, w, 0.14); if (a) byCls[cls].push(a);
    if (cls >= 1 && cls <= 4) { const s = ribbon(p, w + 4.5, 0.11); if (s) walks.push(s); }
    for (const [x, z] of p) {
      joints.push(disc(x, z, w / 2, 0.135, 10));
      if (cls >= 1 && cls <= 4) wjoints.push(disc(x, z, w / 2 + 2.25, 0.105, 10));
    }
    // árvores de rua a cada ~22 m nas calçadas das ruas locais e avenidas
    if (q >= 2 && cls >= 1 && cls <= 3) {
      for (let i = 1; i < p.length; i++) {
        const [x1, z1] = p[i - 1], [x2, z2] = p[i];
        const L = Math.hypot(x2 - x1, z2 - z1);
        const nx = -(z2 - z1) / (L || 1), nz = (x2 - x1) / (L || 1);
        for (let s = 8; s < L - 6; s += 22) {
          if (r() < 0.45) continue;
          const side = r() < 0.5 ? -1 : 1, d = w / 2 + 1.6;
          streetTrees.push([x1 + ((x2 - x1) * s) / L + nx * d * side, z1 + ((z2 - z1) * s) / L + nz * d * side]);
        }
      }
    }
  }
  const walkTex = tex(32, 32, (x) => { x.fillStyle = "#cfcac0"; x.fillRect(0, 0, 32, 32); x.fillStyle = "rgba(0,0,0,0.08)"; x.fillRect(0, 0, 32, 1); x.fillRect(0, 0, 1, 32); }, true);
  if (walkTex) walkTex.repeat.set(1 / 2, 1);
  if (walks.length) {
    const m = new THREE.Mesh(mergeGeometries([...walks, ...wjoints].map((g) => g.toNonIndexed())), mat({ color: walkTex ? 0xffffff : 0xcfcac0, map: walkTex ?? undefined, roughness: 0.95, ...off(3) }));
    m.receiveShadow = true; near.add(m);
  }
  const jm = new THREE.Mesh(mergeGeometries(joints.map((g) => g.toNonIndexed())), mat({ color: asphalt ? 0xffffff : 0x3c3f44, map: asphalt ?? undefined, roughness: 0.9, ...off(4) }));
  if (joints.length) { jm.receiveShadow = true; near.add(jm); }
  const allRoads: THREE.BufferGeometry[] = [];
  byCls.forEach((list, cls) => {
    if (!list.length) return;
    const g = mergeGeometries(list.map((x) => x.toNonIndexed()));
    allRoads.push(g);
    const t = markTex(cls);
    if (t) t.repeat.set(1 / (cls >= 2 ? 9 : 6), 1);
    const m = new THREE.Mesh(g, mat({ color: t ? 0xffffff : 0x3c3f44, map: t ?? undefined, roughness: 0.85, ...off(5) }));
    m.receiveShadow = true; near.add(m);
  });
  if (allRoads.length) far.add(new THREE.Mesh(mergeGeometries(allRoads), mat({ color: 0x45484e, roughness: 0.9, ...off(5) })));
  // trilhos
  const rails: THREE.BufferGeometry[] = [];
  for (const f of osm.rail ?? []) { const g = ribbon(pts(f), 6, 0.12); if (g) rails.push(g.toNonIndexed()); }
  if (rails.length) {
    const rt = tex(32, 64, (x) => {
      x.fillStyle = "#6f6a62"; x.fillRect(0, 0, 32, 64);
      x.fillStyle = "#5a4535"; for (let i = 0; i < 32; i += 4) x.fillRect(i, 10, 2, 44);
      x.fillStyle = "#b9bcc0"; for (const y of [16, 26, 38, 48]) x.fillRect(0, y, 32, 2);
    }, true);
    if (rt) rt.repeat.set(1 / 3, 1);
    const m = new THREE.Mesh(mergeGeometries(rails), mat({ color: rt ? 0xffffff : 0x6f6a62, map: rt ?? undefined, roughness: 0.9, ...off(4) }));
    m.receiveShadow = true; near.add(m); far.add(m.clone());
  }

  // ---------------- campos e quadras vizinhos
  const pitchTex = tex(256, 166, (x) => {
    x.fillStyle = "#3f8f31"; x.fillRect(0, 0, 256, 166);
    for (let i = 0; i < 10; i++) { x.fillStyle = i % 2 ? "#47993a" : "#3f8f31"; x.fillRect(8 + i * 24, 0, 24, 166); }
    x.strokeStyle = "#f2fff0"; x.lineWidth = 2; x.strokeRect(8, 8, 240, 150);
    x.beginPath(); x.moveTo(128, 8); x.lineTo(128, 158); x.stroke(); x.beginPath(); x.arc(128, 83, 20, 0, 7); x.stroke();
    x.strokeRect(8, 40, 36, 86); x.strokeRect(212, 40, 36, 86);
  });
  const courts: THREE.BufferGeometry[] = [], fields: THREE.Mesh[] = [];
  for (const e of osm.pitches ?? []) {
    const [soccer, f] = flatOf(e);
    const p = pts(f);
    if (p.length < 3 || !inR(...centroid(p)) || avoid(...centroid(p))) continue;
    const mr = minRect(p);
    if (soccer && mr.hw > 14) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(mr.hw * 2, mr.hh * 2), mat({ color: pitchTex ? 0xffffff : 0x3f8f31, map: pitchTex ?? undefined, roughness: 0.95, ...off(6) }));
      pl.rotation.x = -Math.PI / 2; pl.rotation.z = -mr.ang; pl.position.set(mr.cx, 0.16, mr.cz);
      pl.receiveShadow = true; fields.push(pl);
    } else {
      const g = fillPoly(p, 0.15); if (g) courts.push(g);
    }
  }
  for (const f of fields) near.add(f);
  if (courts.length) near.add(new THREE.Mesh(mergeGeometries(courts), mat({ color: 0x3f7fa8, roughness: 0.8, ...off(6) })));

  // ---------------- prédios
  const winTex = (lit: boolean) => tex(128, 128, (x) => {
    // ladrilho de 6 x 6 m: 2 andares x 2 janelas
    x.fillStyle = lit ? "#000000" : "#ffffff"; x.fillRect(0, 0, 128, 128);
    const rr = rng(lit ? 7 : 3);
    for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) {
      const on = lit && rr() < 0.45;
      x.fillStyle = lit ? (on ? "#ffd98c" : "#000000") : "#4c5a68";
      x.fillRect(fx * 64 + 12, fy * 64 + 14, 40, 30);
      if (!lit) { x.fillStyle = "rgba(255,255,255,0.18)"; x.fillRect(fx * 64 + 12, fy * 64 + 14, 12, 30); x.fillStyle = "rgba(0,0,0,0.15)"; x.fillRect(fx * 64 + 8, fy * 64 + 46, 48, 4); }
    }
  }, true);
  const wt = winTex(false), lt = o.night ? winTex(true) : null;
  for (const t of [wt, lt]) if (t) t.repeat.set(1 / 6, 1 / 6);
  const roofTex = tex(64, 64, (x) => {
    x.fillStyle = "#9a958c"; x.fillRect(0, 0, 64, 64);
    const rr = rng(21); for (let i = 0; i < 120; i++) { x.fillStyle = rr() < 0.5 ? "#8e8980" : "#a6a198"; x.fillRect(rr() * 64, rr() * 64, 3, 3); }
  }, true);
  if (roofTex) roofTex.repeat.set(1 / 12, 1 / 12);
  const tall: THREE.BufferGeometry[] = [], low: THREE.BufferGeometry[] = [], bigFar: THREE.BufferGeometry[] = [];
  const palette = ["#e8e2d4", "#d9d2c3", "#f0ece4", "#cfc6b4", "#e4d9c4", "#c9cfd6", "#dcd3c0", "#efe2c8", "#d7c7b0", "#b9c3c9"];
  const housePal = ["#f1e3c6", "#e8d2b0", "#f4efe6", "#d9e2e8", "#f0d9c8", "#e6e6d6", "#f2c9a0", "#d7e4cf"];
  const col = new THREE.Color();
  const blds = osm.buildings ?? [];
  const lim = q >= 4 ? 1400 : q >= 2 ? 1000 : 700;
  let nb = 0;
  for (let i = 0; i < blds.length && nb < lim; i++) {
    if (o.skip?.has(i)) continue;
    const [h0, f] = blds[i];
    const p = pts(f);
    if (p.length < 3) continue;
    const c = centroid(p);
    if (!inR(c[0], c[1]) || avoid(c[0], c[1])) continue;
    const a = Math.abs(area(p));
    if (a < 12) continue;
    const rr = rng(Math.round(c[0] * 7 + c[1] * 13));
    let h = h0;
    if (!h) {
      // altura desconhecida no OSM: estimativa pelo tamanho da planta (casas baixas, alguns prédios)
      h = a < 140 ? 4 + rr() * 4 : a < 600 ? (rr() < 0.18 ? 18 + rr() * 30 : 6 + rr() * 6) : a < 2500 ? 8 + rr() * 10 : 10 + rr() * 6;
    }
    nb++;
    const shape = new THREE.Shape((area(p) > 0 ? p : [...p].reverse()).map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    const house = h < 8.5;
    col.set(house ? housePal[Math.floor(rr() * housePal.length)] : palette[Math.floor(rr() * palette.length)]);
    const n = (g.attributes.position as THREE.BufferAttribute).count;
    const cols = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { cols[k * 3] = col.r; cols[k * 3 + 1] = col.g; cols[k * 3 + 2] = col.b; }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    (house ? low : tall).push(g);
    if (h > 14 || a > 900) bigFar.push(g);
  }
  // ---------------- lotes: onde o OSM ainda não mapeou as casas (comum em bairros residenciais),
  // preenche as quadras ao longo das ruas locais com casas baixas de telhado cerâmico
  if (nb < 900 && (osm.roads?.length ?? 0) > 20) {
    const CS = 5, NG = Math.ceil((2 * R) / CS);
    const occ = new Uint8Array(NG * NG);
    const cell = (x: number, z: number) => { const i = Math.floor((x + R) / CS), j = Math.floor((z + R) / CS); return i < 0 || j < 0 || i >= NG || j >= NG ? -1 : j * NG + i; };
    const mark = (x: number, z: number, r: number) => {
      for (let dz = -r; dz <= r; dz += CS) for (let dx = -r; dx <= r; dx += CS) { const k = cell(x + dx, z + dz); if (k >= 0) occ[k] = 1; }
    };
    for (const [cls, f] of osm.roads ?? []) {
      const p = pts(f), w = ROAD_W[Math.max(0, Math.min(5, cls))] / 2 + 3;
      for (let i = 1; i < p.length; i++) {
        const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        for (let s = 0; s <= L; s += CS * 0.8) { const t = s / (L || 1); mark(p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t, w); }
      }
    }
    for (const [, f] of blds) { const p = pts(f); if (p.length < 3) continue; const c = centroid(p); mark(c[0], c[1], Math.sqrt(Math.abs(area(p))) / 2 + 2); }
    for (const [, p] of greenPolys) { const mr = minRect(p); if (mr.hw * mr.hh > 400) for (let dz = -mr.hh; dz <= mr.hh; dz += CS) for (let dx = -mr.hw; dx <= mr.hw; dx += CS) {
      const x = mr.cx + dx * Math.cos(mr.ang) - dz * Math.sin(mr.ang), z = mr.cz + dx * Math.sin(mr.ang) + dz * Math.cos(mr.ang);
      if (inside([x, z], p)) mark(x, z, 0);
    } }
    for (const f of osm.water ?? []) { const p = pts(f); const mr = minRect(p); for (let dz = -mr.hh; dz <= mr.hh; dz += CS) for (let dx = -mr.hw; dx <= mr.hw; dx += CS) mark(mr.cx + dx * Math.cos(mr.ang) - dz * Math.sin(mr.ang), mr.cz + dx * Math.sin(mr.ang) + dz * Math.cos(mr.ang), 0); }
    const maxFill = [0, 350, 650, 1000, 1300, 1600][q];
    let nf = 0;
    const free = (x: number, z: number) => { const k = cell(x, z); return k >= 0 && !occ[k]; };
    for (const [cls, f] of osm.roads ?? []) {
      if (cls < 1 || cls > 2 || nf >= maxFill) continue;
      const p = pts(f), w = ROAD_W[cls] / 2;
      for (let i = 1; i < p.length && nf < maxFill; i++) {
        const [x1, z1] = p[i - 1], [x2, z2] = p[i];
        const L = Math.hypot(x2 - x1, z2 - z1); if (L < 12) continue;
        const ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz, nz = ux;
        for (let s = 7; s < L - 7 && nf < maxFill; s += 13) for (const side of [-1, 1]) {
          const lw = 9 + r() * 3, ld = 12 + r() * 8, off = w + 4 + ld / 2;
          const cx = x1 + ux * s + nx * off * side, cz = z1 + uz * s + nz * off * side;
          if (!inR(cx, cz) || avoid(cx, cz) || !free(cx, cz) || !free(cx + nx * side * ld * 0.4, cz + nz * side * ld * 0.4)) continue;
          mark(cx, cz, 4);
          const hx = lw / 2, hz = ld / 2;
          const corners: P2[] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [cx + ux * a + nx * side * b, cz + uz * a + nz * side * b]);
          const shape = new THREE.Shape((area(corners) > 0 ? corners : [...corners].reverse()).map(([x, z]) => new THREE.Vector2(x, -z)));
          const h = r() < 0.08 ? 9 + r() * 4 : 4 + r() * 3.5;
          const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
          g.rotateX(-Math.PI / 2);
          col.set(housePal[Math.floor(r() * housePal.length)]);
          const n = (g.attributes.position as THREE.BufferAttribute).count, cols = new Float32Array(n * 3);
          for (let k = 0; k < n; k++) { cols[k * 3] = col.r; cols[k * 3 + 1] = col.g; cols[k * 3 + 2] = col.b; }
          g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
          low.push(g);
          // quintal com árvore
          if (r() < 0.45) streetTrees.push([cx + nx * side * (ld / 2 + 3), cz + nz * side * (ld / 2 + 3)]);
          nf++;
        }
      }
    }
  }
  const wallM = mat({ color: 0xffffff, map: wt ?? undefined, vertexColors: true, roughness: 0.75, emissive: lt ? 0xffffff : 0x000000, emissiveMap: lt ?? undefined, emissiveIntensity: lt ? 0.9 : 0 });
  const roofM = mat({ color: 0xffffff, map: roofTex ?? undefined, roughness: 0.95 });
  const houseWall = mat({ color: 0xffffff, vertexColors: true, roughness: 0.9 });
  const tileM = mat({ color: 0xb4553a, roughness: 0.85 });
  const addB = (list: THREE.BufferGeometry[], walls: THREE.Material, roofs: THREE.Material) => {
    if (!list.length) return;
    const g = mergeExtruded(list);
    if (!g) return;
    const m = new THREE.Mesh(g, [roofs, walls]);
    m.castShadow = true; m.receiveShadow = true;
    near.add(m);
  };
  addB(tall, wallM, roofM);
  addB(low, houseWall, q >= 2 ? tileM : roofM);
  if (bigFar.length) {
    const m = new THREE.Mesh(mergeGeometries(bigFar.map((g) => { const h = g.clone(); h.clearGroups(); return h; })), mat({ color: 0xffffff, vertexColors: true, roughness: 0.85 }));
    m.castShadow = true; far.add(m);
  }

  // ---------------- árvores (instanciadas)
  const treeP: P2[] = [];
  const tr = osm.trees ?? [];
  for (let i = 0; i + 1 < tr.length; i += 2) treeP.push([tr[i], tr[i + 1]]);
  treeP.push(...streetTrees);
  for (const [kind, p] of greenPolys) {
    const a = Math.abs(area(p));
    const mr = minRect(p);
    const want = Math.min(kind ? 600 : 160, Math.floor(a / (kind ? 140 : 520)));
    let tries = want * 3;
    let got = 0;
    while (got < want && tries-- > 0) {
      const u = (r() * 2 - 1) * mr.hw, v = (r() * 2 - 1) * mr.hh;
      const x = mr.cx + u * Math.cos(mr.ang) - v * Math.sin(mr.ang), z = mr.cz + u * Math.sin(mr.ang) + v * Math.cos(mr.ang);
      if (!inside([x, z], p)) continue;
      treeP.push([x, z]); got++;
    }
  }
  const maxT = [0, 500, 900, 1500, 2200, 3000][q];
  const keep = treeP.filter(([x, z]) => inR(x, z) && !avoid(x, z)).slice(0, maxT);
  if (keep.length) {
    const crown = new THREE.IcosahedronGeometry(1, q >= 3 ? 1 : 0);
    const posA = crown.attributes.position as THREE.BufferAttribute;
    const jr = rng(4);
    for (let i = 0; i < posA.count; i++) posA.setXYZ(i, posA.getX(i) * (0.85 + jr() * 0.3), posA.getY(i) * (0.8 + jr() * 0.25), posA.getZ(i) * (0.85 + jr() * 0.3));
    crown.computeVertexNormals();
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 1, 5); trunk.translate(0, 0.5, 0);
    const imC = new THREE.InstancedMesh(crown, mat({ color: 0xffffff, roughness: 0.9, flatShading: q < 3 }), keep.length);
    const imT = new THREE.InstancedMesh(trunk, mat({ color: 0x6b4a2b, roughness: 0.95 }), keep.length);
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3();
    const greensC = ["#2f6b2a", "#3b7a30", "#28602a", "#4a8a3a", "#356f2c", "#5a8f3f"];
    keep.forEach(([x, z], i) => {
      const k = 0.75 + r() * 0.7;
      const rad = 2.6 * k, ht = 3.2 * k;
      qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      mm.compose(pv.set(x, ht + rad * 0.7, z), qq, s.set(rad, rad * 0.9, rad)); imC.setMatrixAt(i, mm);
      mm.compose(pv.set(x, 0, z), qq, s.set(k, ht + rad * 0.3, k)); imT.setMatrixAt(i, mm);
      col.set(greensC[Math.floor(r() * greensC.length)]); imC.setColorAt(i, col);
    });
    imC.castShadow = true; imC.receiveShadow = true; imT.castShadow = q >= 3;
    near.add(imC, imT);
  }

  const lod = new THREE.LOD();
  lod.addLevel(near, 0);
  lod.addLevel(far, o.farAt ?? 260); // unidades da cena (o LOD mede a distância no mundo)
  lod.autoUpdate = true;
  return lod;
}
