// Entorno urbano real de cada local (estádio, CT, sede) a partir do OpenStreetMap:
// ruas com largura pela categoria, calçadas e faixas, trilhos, rios e lagos com reflexo e ondas,
// áreas verdes, campos, árvores orgânicas (instanciadas), carros animados no tráfego,
// pedestres circulando e prédios vizinhos extrudados com chanfro (bevel) e janelas PBR.
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
  /** animadores registrados na cena principal (carros, água, pedestres) */
  movers?: ((t: number, dt: number) => void)[];
  /** cores do clube para torcedores/pedestres próximos */
  clubColors?: [string, string];
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

function disc(x: number, z: number, r: number, y: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0, 0.5);
  return g;
}

function fillPoly(p: P2[], y: number): THREE.BufferGeometry | null {
  if (p.length < 3) return null;
  const sh = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
  return g;
}

/**
 * Junta prédios extrudados mantendo telhado (grupo 0) e paredes (grupo 1) separados.
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
  if (out && both.length === 1) out.groups[0].materialIndex = caps ? 0 : 1;
  return out;
}

const flatOf = (e: [number, number[]] | number[]): [number, number[]] => (Array.isArray(e[1]) ? (e as [number, number[]]) : [0, e as number[]]);

/** Gera uma copa de árvore orgânica suave (multi-esfera fundida, sem flatShading). */
function makeOrganicCrown(): THREE.BufferGeometry {
  const puffs: [number, number, number, number][] = [
    [0, 0.15, 0, 0.82],
    [-0.42, -0.05, 0.28, 0.62],
    [0.44, -0.02, 0.24, 0.60],
    [0.05, -0.06, -0.44, 0.64],
    [-0.25, 0.42, -0.15, 0.56],
    [0.28, 0.38, 0.12, 0.54],
  ];
  const geos = puffs.map(([x, y, z, rad]) => {
    const s = new THREE.SphereGeometry(rad, 10, 8);
    s.translate(x, y, z);
    return s;
  });
  const m = mergeGeometries(geos);
  m.computeVertexNormals();
  return m;
}

/** Gera geometria de carro estilizado (carroceria + cabine + rodas). */
function makeCarGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(4.2, 0.78, 1.88);
  body.translate(0, 0.55, 0);
  const cabin = new THREE.BoxGeometry(2.3, 0.62, 1.62);
  cabin.translate(-0.2, 1.18, 0);
  const hood = new THREE.BoxGeometry(0.9, 0.16, 1.76);
  hood.translate(1.4, 0.96, 0);
  const g = mergeGeometries([body, cabin, hood]);
  g.computeVertexNormals();
  return g;
}

/** Monta o entorno; devolve um LOD (perto: tudo; longe: só o essencial). */
export function buildCity(osm: GeoOsm, o: CityOpts): THREE.LOD {
  const { q, tex, mat, radius: R } = o;
  const r = rng(o.seed);
  const near = new THREE.Group(), far = new THREE.Group();
  const avoid = o.avoid ?? (() => false);
  const inR = (x: number, z: number) => Math.hypot(x, z) < R;
  const off = (f: number) => ({ polygonOffset: true, polygonOffsetFactor: -f, polygonOffsetUnits: -f * 2 });

  // ---------------- chão da cidade (quadras urbanas com textura sutil de pavimento e jardins)
  const groundTex = tex(256, 256, (x) => {
    x.fillStyle = "#9da399"; x.fillRect(0, 0, 256, 256);
    const rr = rng(11);
    for (let i = 0; i < 2800; i++) {
      const v = 142 + Math.floor(rr() * 32);
      const gr = rr() < 0.35 ? 6 : 0;
      x.fillStyle = `rgb(${v - gr},${v + gr},${v - 6})`;
      x.fillRect(rr() * 256, rr() * 256, 3, 3);
    }
    x.strokeStyle = "rgba(0,0,0,0.05)";
    for (let i = 0; i < 256; i += 32) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
    }
  }, true);
  if (groundTex) groundTex.repeat.set(1 / 36, 1 / 36);
  let gg: THREE.BufferGeometry;
  if (o.hole && o.hole.length > 3) {
    const sh = new THREE.Shape();
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; const x = Math.cos(a) * R * 1.04, y = Math.sin(a) * R * 1.04; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
    const hp = o.hole.map(([x, z]) => new THREE.Vector2(x, -z));
    const ccw = THREE.ShapeUtils.isClockWise(hp);
    sh.holes.push(new THREE.Path(ccw ? hp : hp.reverse()));
    gg = new THREE.ShapeGeometry(sh, 1);
  } else gg = new THREE.CircleGeometry(R * 1.04, 96);
  gg.rotateX(-Math.PI / 2);
  const gpos = gg.attributes.position as THREE.BufferAttribute, guv = gg.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, gpos.getX(i), gpos.getZ(i));
  const ground = new THREE.Mesh(gg, mat({ color: groundTex ? 0xffffff : 0x9da399, map: groundTex ?? undefined, roughness: 0.94 }));
  ground.position.y = 0.02; ground.receiveShadow = true;
  near.add(ground);
  const groundFar = new THREE.Mesh(gg, mat({ color: 0x989e94, roughness: 0.96 }));
  groundFar.position.y = 0.02; far.add(groundFar);

  // ---------------- áreas verdes e água com reflexo e ondas animadas
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
    x.fillStyle = "#4d8a3b"; x.fillRect(0, 0, 128, 128);
    const rr = rng(5);
    for (let i = 0; i < 1800; i++) { x.fillStyle = rr() < 0.5 ? "#447e34" : "#599846"; x.fillRect(rr() * 128, rr() * 128, 2, 2); }
  }, true);
  if (grassTex) grassTex.repeat.set(1 / 18, 1 / 18);
  if (greens.length) {
    const m = new THREE.Mesh(mergeGeometries(greens), mat({ color: grassTex ? 0xffffff : 0x4d8a3b, map: grassTex ?? undefined, roughness: 0.9, ...off(1) }));
    m.receiveShadow = true; near.add(m); far.add(new THREE.Mesh(m.geometry, mat({ color: 0x4d8a3b, roughness: 0.92, ...off(1) })));
  }
  if (woods.length) {
    const m = new THREE.Mesh(mergeGeometries(woods), mat({ color: 0x36682b, roughness: 0.92, ...off(1) }));
    m.receiveShadow = true; near.add(m); far.add(m.clone());
  }

  // Água com textura de ondas specular/normal e movimento contínuo
  const waterTex = tex(128, 128, (x) => {
    const gr = x.createLinearGradient(0, 0, 128, 128);
    gr.addColorStop(0, "#1d5b7d");
    gr.addColorStop(0.5, "#256d94");
    gr.addColorStop(1, "#1a5272");
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
    const rr = rng(73);
    for (let i = 0; i < 180; i++) {
      x.fillStyle = rr() < 0.5 ? "rgba(170,225,255,0.14)" : "rgba(10,35,55,0.14)";
      x.fillRect(rr() * 128, rr() * 128, 10 + rr() * 18, 2);
    }
  }, true);
  if (waterTex) waterTex.repeat.set(1 / 28, 1 / 28);
  const waterBump = tex(128, 128, (x) => {
    x.fillStyle = "#808080"; x.fillRect(0, 0, 128, 128);
    const rr = rng(91);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = rr() < 0.5 ? "#b8b8b8" : "#484848";
      x.fillRect(rr() * 128, rr() * 128, 12 + rr() * 16, 3);
    }
  }, true);
  if (waterBump) waterBump.repeat.set(1 / 22, 1 / 22);
  if (o.movers && waterTex) {
    o.movers.push((t) => {
      waterTex.offset.set((t * 0.03) % 1, (Math.sin(t * 0.4) * 0.02) % 1);
      if (waterBump) waterBump.offset.set((-t * 0.025) % 1, (t * 0.018) % 1);
    });
  }
  const waterM = mat({
    color: waterTex ? 0xffffff : 0x226488,
    map: waterTex ?? undefined,
    bumpMap: waterBump ?? undefined,
    bumpScale: 0.35,
    roughness: 0.09,
    metalness: 0.45,
    ...off(2),
  });
  const waters: THREE.BufferGeometry[] = [], banks: THREE.BufferGeometry[] = [];
  for (const f of osm.water ?? []) { const g = fillPoly(pts(f), 0.09); if (g) waters.push(g); }
  for (const [w, f] of osm.rivers ?? []) {
    const rp = pts(f);
    const g = ribbon(rp, Math.max(w, 8), 0.09);
    if (g) waters.push(g);
    if (w >= 14) {
      const b = ribbon(rp, w + 7, 0.075);
      if (b) banks.push(b);
    }
  }
  if (banks.length) {
    const bm = new THREE.Mesh(mergeGeometries(banks.map((g) => g.toNonIndexed())), mat({ color: 0x7d8078, roughness: 0.9, ...off(1) }));
    bm.receiveShadow = true; near.add(bm);
  }
  if (waters.length) {
    const wm = new THREE.Mesh(mergeGeometries(waters.map((g) => {
      const h = g.index ? g.toNonIndexed() : g;
      if (!h.attributes.uv) {
        const p = h.attributes.position as THREE.BufferAttribute;
        const uv = new Float32Array(p.count * 2);
        for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
        h.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      }
      return h;
    })), waterM);
    wm.receiveShadow = true; near.add(wm); far.add(wm.clone());
  }

  // ---------------- ruas: calçada + asfalto escuro moderno com faixas + tráfego de carros
  const asphalt = tex(64, 64, (x) => {
    x.fillStyle = "#2b2e34"; x.fillRect(0, 0, 64, 64);
    const rr = rng(9);
    for (let i = 0; i < 400; i++) { const v = 38 + Math.floor(rr() * 16); x.fillStyle = `rgb(${v},${v + 2},${v + 5})`; x.fillRect(rr() * 64, rr() * 64, 1, 1); }
  }, true);
  const markTex = (cls: number) => tex(64, 64, (x) => {
    x.fillStyle = "#2b2e34"; x.fillRect(0, 0, 64, 64);
    const rr = rng(cls + 3);
    for (let i = 0; i < 300; i++) { const v = 38 + Math.floor(rr() * 16); x.fillStyle = `rgb(${v},${v + 2},${v + 5})`; x.fillRect(rr() * 64, rr() * 64, 1, 1); }
    x.fillStyle = "#e9e9e2"; x.fillRect(0, 2, 64, 1.5); x.fillRect(0, 60.5, 64, 1.5);
    if (cls >= 4) { x.fillStyle = "#f2c94c"; x.fillRect(0, 30, 64, 1.5); x.fillRect(0, 33, 64, 1.5); x.fillStyle = "#e9e9e2"; for (const y of [16, 47]) x.fillRect(0, y, 30, 1.3); }
    else if (cls >= 2) { x.fillStyle = "#f2c94c"; x.fillRect(0, 31, 34, 1.6); }
    else if (cls === 1) { x.fillStyle = "rgba(233,233,226,0.65)"; x.fillRect(0, 31.5, 22, 1.1); }
  }, true);
  const byCls: THREE.BufferGeometry[][] = [[], [], [], [], [], []];
  const walks: THREE.BufferGeometry[] = [], joints: THREE.BufferGeometry[] = [], wjoints: THREE.BufferGeometry[] = [];
  const streetTrees: P2[] = [];
  interface RoadSeg { x1: number; z1: number; x2: number; z2: number; len: number; ux: number; uz: number; nx: number; nz: number; w: number; cls: number }
  const carSegs: RoadSeg[] = [];
  const pedSegs: RoadSeg[] = [];

  for (const [cls, f] of osm.roads ?? []) {
    const p = pts(f);
    if (!p.some(([x, z]) => inR(x, z))) continue;
    const w = ROAD_W[Math.max(0, Math.min(5, cls))];
    const a = ribbon(p, w, 0.14); if (a) byCls[cls].push(a);
    if (cls >= 1 && cls <= 4) { const s = ribbon(p, w + 4.5, 0.11); if (s) walks.push(s); }
    for (const [x, z] of p) {
      joints.push(disc(x, z, w / 2, 0.135, 12));
      if (cls >= 1 && cls <= 4) wjoints.push(disc(x, z, w / 2 + 2.25, 0.105, 12));
    }
    for (let i = 1; i < p.length; i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 16) continue;
      const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
      const nx = -uz, nz = ux;
      if (inR((x1 + x2) * 0.5, (z1 + z2) * 0.5)) {
        if (cls >= 1 && L >= 28) carSegs.push({ x1, z1, x2, z2, len: L, ux, uz, nx, nz, w, cls });
        if (cls >= 1 && cls <= 3 && L >= 20) pedSegs.push({ x1, z1, x2, z2, len: L, ux, uz, nx, nz, w, cls });
      }
      if (cls >= 1 && cls <= 3) {
        for (let s = 8; s < L - 6; s += 20) {
          if (r() < 0.4) continue;
          const side = r() < 0.5 ? -1 : 1, d = w / 2 + 1.8;
          streetTrees.push([x1 + ux * s + nx * d * side, z1 + uz * s + nz * d * side]);
        }
      }
    }
  }
  const walkTex = tex(32, 32, (x) => { x.fillStyle = "#cdc8be"; x.fillRect(0, 0, 32, 32); x.fillStyle = "rgba(0,0,0,0.08)"; x.fillRect(0, 0, 32, 1); x.fillRect(0, 0, 1, 32); }, true);
  if (walkTex) walkTex.repeat.set(1 / 2, 1);
  if (walks.length) {
    const m = new THREE.Mesh(mergeGeometries([...walks, ...wjoints].map((g) => g.toNonIndexed())), mat({ color: walkTex ? 0xffffff : 0xcdc8be, map: walkTex ?? undefined, roughness: 0.92, ...off(3) }));
    m.receiveShadow = true; near.add(m);
  }
  if (joints.length) {
    const jm = new THREE.Mesh(mergeGeometries(joints.map((g) => g.toNonIndexed())), mat({ color: asphalt ? 0xffffff : 0x2b2e34, map: asphalt ?? undefined, roughness: 0.85, ...off(4) }));
    jm.receiveShadow = true; near.add(jm);
  }
  const allRoads: THREE.BufferGeometry[] = [];
  byCls.forEach((list, cls) => {
    if (!list.length) return;
    const g = mergeGeometries(list.map((x) => x.toNonIndexed()));
    allRoads.push(g);
    const t = markTex(cls);
    if (t) t.repeat.set(1 / (cls >= 2 ? 9 : 6), 1);
    const m = new THREE.Mesh(g, mat({ color: t ? 0xffffff : 0x2b2e34, map: t ?? undefined, roughness: 0.8, ...off(5) }));
    m.receiveShadow = true; near.add(m);
  });
  if (allRoads.length) far.add(new THREE.Mesh(mergeGeometries(allRoads), mat({ color: 0x35383e, roughness: 0.88, ...off(5) })));

  // ---------------- tráfego de carros animados e pedestres nas calçadas
  if (o.movers && carSegs.length > 0) {
    const maxCars = Math.min(carSegs.length * 2, [28, 42, 64, 88, 110][q - 1] ?? 60);
    const carGeo = makeCarGeometry();
    const carMat = mat({ color: 0xffffff, roughness: 0.25, metalness: 0.6, emissive: o.night ? 0x221808 : 0x000000 });
    const carsMesh = new THREE.InstancedMesh(carGeo, carMat, maxCars);
    carsMesh.castShadow = true;
    carsMesh.receiveShadow = true;
    const carPalette = ["#e53935", "#f8fafc", "#1e293b", "#3b82f6", "#eab308", "#94a3b8", "#dc2626", "#cbd5e1", ...(o.clubColors ?? [])];
    const colTmp = new THREE.Color();
    interface CarAgent { seg: RoadSeg; dir: 1 | -1; speed: number; offset: number; lane: number }
    const agents: CarAgent[] = [];
    for (let i = 0; i < maxCars; i++) {
      const seg = carSegs[Math.floor(r() * carSegs.length)];
      const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
      const speed = (seg.cls >= 4 ? 22 : seg.cls >= 2 ? 15 : 10) * (0.8 + r() * 0.45);
      const lane = (seg.w * 0.24) * dir;
      agents.push({ seg, dir, speed, offset: r() * seg.len, lane });
      colTmp.set(carPalette[Math.floor(r() * carPalette.length)]);
      carsMesh.setColorAt(i, colTmp);
    }
    const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cp = new THREE.Vector3(), cs = new THREE.Vector3(1, 1, 1);
    const upY = new THREE.Vector3(0, 1, 0);
    const updateCars = (t: number) => {
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        const d = (a.offset + t * a.speed) % a.seg.len;
        const s = a.dir === 1 ? d : a.seg.len - d;
        const x = a.seg.x1 + a.seg.ux * s + a.seg.nx * a.lane;
        const z = a.seg.z1 + a.seg.uz * s + a.seg.nz * a.lane;
        const yaw = Math.atan2(-(a.seg.uz * a.dir), a.seg.ux * a.dir);
        cq.setFromAxisAngle(upY, yaw);
        cp.set(x, 0.16, z);
        cm.compose(cp, cq, cs);
        carsMesh.setMatrixAt(i, cm);
      }
      carsMesh.instanceMatrix.needsUpdate = true;
    };
    updateCars(0);
    o.movers.push(updateCars);
    near.add(carsMesh);
  }

  // Pedestres caminhando pelas calçadas
  if (o.movers && pedSegs.length > 0) {
    const maxPeds = Math.min(pedSegs.length * 3, [35, 55, 80, 110, 140][q - 1] ?? 70);
    const torso = new THREE.CapsuleGeometry(0.32, 0.75, 4, 8);
    torso.translate(0, 0.75, 0);
    const head = new THREE.SphereGeometry(0.26, 8, 6);
    head.translate(0, 1.52, 0);
    const pedGeo = mergeGeometries([torso, head]);
    const pedMat = mat({ color: 0xffffff, roughness: 0.7 });
    const pedMesh = new THREE.InstancedMesh(pedGeo, pedMat, maxPeds);
    pedMesh.castShadow = true;
    const pedColors = [...(o.clubColors ?? ["#e4002b", "#ffffff"]), "#1e293b", "#f8fafc", "#ef4444", "#3b82f6", "#10b981", "#f59e0b"];
    const pCol = new THREE.Color();
    interface PedAgent { seg: RoadSeg; dir: 1 | -1; speed: number; offset: number; side: number; phase: number }
    const peds: PedAgent[] = [];
    for (let i = 0; i < maxPeds; i++) {
      const seg = pedSegs[Math.floor(r() * pedSegs.length)];
      const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
      const side = (r() < 0.5 ? -1 : 1) * (seg.w * 0.5 + 1.4);
      peds.push({ seg, dir, speed: 1.5 + r() * 1.1, offset: r() * seg.len, side, phase: r() * 6.28 });
      pCol.set(pedColors[Math.floor(r() * pedColors.length)]);
      pedMesh.setColorAt(i, pCol);
    }
    const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), pp = new THREE.Vector3(), ps = new THREE.Vector3(1.1, 1.1, 1.1);
    const upY = new THREE.Vector3(0, 1, 0);
    const updatePeds = (t: number) => {
      for (let i = 0; i < peds.length; i++) {
        const a = peds[i];
        const d = (a.offset + t * a.speed) % a.seg.len;
        const s = a.dir === 1 ? d : a.seg.len - d;
        const x = a.seg.x1 + a.seg.ux * s + a.seg.nx * a.side;
        const z = a.seg.z1 + a.seg.uz * s + a.seg.nz * a.side;
        const bob = Math.abs(Math.sin(t * 7 + a.phase)) * 0.14;
        pq.setFromAxisAngle(upY, Math.atan2(-(a.seg.uz * a.dir), a.seg.ux * a.dir));
        pp.set(x, 0.14 + bob, z);
        pm.compose(pp, pq, ps);
        pedMesh.setMatrixAt(i, pm);
      }
      pedMesh.instanceMatrix.needsUpdate = true;
    };
    updatePeds(0);
    o.movers.push(updatePeds);
    near.add(pedMesh);
  }

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
    x.fillStyle = "#35852b"; x.fillRect(0, 0, 256, 166);
    for (let i = 0; i < 10; i++) { x.fillStyle = i % 2 ? "#429636" : "#35852b"; x.fillRect(8 + i * 24, 0, 24, 166); }
    x.strokeStyle = "#f2fff0"; x.lineWidth = 2.2; x.strokeRect(8, 8, 240, 150);
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
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(mr.hw * 2, mr.hh * 2), mat({ color: pitchTex ? 0xffffff : 0x35852b, map: pitchTex ?? undefined, roughness: 0.9, ...off(6) }));
      pl.rotation.x = -Math.PI / 2; pl.rotation.z = -mr.ang; pl.position.set(mr.cx, 0.16, mr.cz);
      pl.receiveShadow = true; fields.push(pl);
    } else {
      const g = fillPoly(p, 0.15); if (g) courts.push(g);
    }
  }
  for (const f of fields) near.add(f);
  if (courts.length) near.add(new THREE.Mesh(mergeGeometries(courts), mat({ color: 0x2b72a8, roughness: 0.72, ...off(6) })));

  // ---------------- prédios com chanfro (bevel) e janelas iluminadas PBR
  const winTex = (lit: boolean) => tex(256, 256, (x) => {
    x.fillStyle = lit ? "#000000" : "#f4f3ef"; x.fillRect(0, 0, 256, 256);
    const rr = rng(lit ? 7 : 3);
    for (let fy = 0; fy < 4; fy++) {
      if (!lit) {
        x.fillStyle = "rgba(0,0,0,0.09)";
        x.fillRect(0, fy * 64 + 58, 256, 6);
      }
      for (let fx = 0; fx < 4; fx++) {
        const on = lit && rr() < 0.52;
        const warm = rr() < 0.65 ? "#ffe299" : "#cde8ff";
        x.fillStyle = lit ? (on ? warm : "#000000") : "#36495c";
        x.fillRect(fx * 64 + 10, fy * 64 + 12, 44, 36);
        if (!lit) {
          x.fillStyle = "rgba(255,255,255,0.22)";
          x.fillRect(fx * 64 + 10, fy * 64 + 12, 14, 36);
          x.fillStyle = "rgba(0,0,0,0.18)";
          x.fillRect(fx * 64 + 8, fy * 64 + 48, 48, 4);
        }
      }
    }
  }, true);
  const wt = winTex(false), lt = winTex(true);
  for (const t of [wt, lt]) if (t) t.repeat.set(1 / 12, 1 / 12);
  const roofTex = tex(64, 64, (x) => {
    x.fillStyle = "#8d8980"; x.fillRect(0, 0, 64, 64);
    const rr = rng(21); for (let i = 0; i < 140; i++) { x.fillStyle = rr() < 0.5 ? "#7f7b72" : "#9c978d"; x.fillRect(rr() * 64, rr() * 64, 3, 3); }
    x.strokeStyle = "rgba(0,0,0,0.14)"; x.lineWidth = 2; x.strokeRect(2, 2, 60, 60);
  }, true);
  if (roofTex) roofTex.repeat.set(1 / 12, 1 / 12);
  const tall: THREE.BufferGeometry[] = [], low: THREE.BufferGeometry[] = [], bigFar: THREE.BufferGeometry[] = [];
  const palette = ["#e9e4d8", "#dad3c5", "#f2eee6", "#cfd6de", "#e4dac7", "#c6d0da", "#dfd6c5", "#f0e4cc", "#d8cab4", "#b8c4ce"];
  const housePal = ["#f3e5cb", "#ead5b5", "#f6f1e8", "#dce4ea", "#f2dccb", "#e8e8d8", "#f4ceaa", "#dae6d2"];
  const col = new THREE.Color();
  const blds = osm.buildings ?? [];
  const lim = q >= 4 ? 1400 : q >= 2 ? 1050 : 800;
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
      h = a < 140 ? 4.5 + rr() * 4 : a < 600 ? (rr() < 0.22 ? 20 + rr() * 34 : 6.5 + rr() * 6) : a < 2500 ? 9 + rr() * 12 : 11 + rr() * 7;
    }
    nb++;
    const shape = new THREE.Shape((area(p) > 0 ? p : [...p].reverse()).map(([x, z]) => new THREE.Vector2(x, -z)));
    const useBevel = h >= 12 && p.length <= 16;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: h,
      bevelEnabled: useBevel,
      bevelThickness: useBevel ? 0.35 : 0,
      bevelSize: useBevel ? 0.28 : 0,
      bevelSegments: 1,
      curveSegments: 1,
    });
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
  // Lotes residenciais ao longo das ruas locais quando o OSM tem poucos prédios mapeados
  if (nb < 900 && (osm.roads?.length ?? 0) > 20) {
    const CS = 5, NG = Math.ceil((2 * R) / CS);
    const occ = new Uint8Array(NG * NG);
    const cell = (x: number, z: number) => { const i = Math.floor((x + R) / CS), j = Math.floor((z + R) / CS); return i < 0 || j < 0 || i >= NG || j >= NG ? -1 : j * NG + i; };
    const mark = (x: number, z: number, r2: number) => {
      for (let dz = -r2; dz <= r2; dz += CS) for (let dx = -r2; dx <= r2; dx += CS) { const k = cell(x + dx, z + dz); if (k >= 0) occ[k] = 1; }
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
    const maxFill = [0, 450, 750, 1050, 1350, 1650][q];
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
          const lw = 9 + r() * 3, ld = 12 + r() * 8, off2 = w + 4 + ld / 2;
          const cx = x1 + ux * s + nx * off2 * side, cz = z1 + uz * s + nz * off2 * side;
          if (!inR(cx, cz) || avoid(cx, cz) || !free(cx, cz) || !free(cx + nx * side * ld * 0.4, cz + nz * side * ld * 0.4)) continue;
          mark(cx, cz, 4);
          const hx = lw / 2, hz = ld / 2;
          const corners: P2[] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [cx + ux * a + nx * side * b, cz + uz * a + nz * side * b]);
          const shape = new THREE.Shape((area(corners) > 0 ? corners : [...corners].reverse()).map(([x, z]) => new THREE.Vector2(x, -z)));
          const h = r() < 0.1 ? 9 + r() * 5 : 4.2 + r() * 3.5;
          const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
          g.rotateX(-Math.PI / 2);
          col.set(housePal[Math.floor(r() * housePal.length)]);
          const n = (g.attributes.position as THREE.BufferAttribute).count, cols = new Float32Array(n * 3);
          for (let k = 0; k < n; k++) { cols[k * 3] = col.r; cols[k * 3 + 1] = col.g; cols[k * 3 + 2] = col.b; }
          g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
          low.push(g);
          if (r() < 0.5) streetTrees.push([cx + nx * side * (ld / 2 + 3), cz + nz * side * (ld / 2 + 3)]);
          nf++;
        }
      }
    }
  }
  const wallM = mat({
    color: 0xffffff,
    map: wt ?? undefined,
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.12,
    emissive: lt ? 0xffffff : 0x000000,
    emissiveMap: lt ?? undefined,
    emissiveIntensity: o.night ? 0.95 : 0.08,
  });
  const roofM = mat({ color: 0xffffff, map: roofTex ?? undefined, roughness: 0.9 });
  const houseWall = mat({ color: 0xffffff, vertexColors: true, roughness: 0.82 });
  const tileM = mat({ color: 0xb85638, roughness: 0.78 });
  const addB = (list: THREE.BufferGeometry[], walls: THREE.Material, roofs: THREE.Material) => {
    if (!list.length) return;
    const g = mergeExtruded(list);
    if (!g) return;
    const m = new THREE.Mesh(g, [roofs, walls]);
    m.castShadow = true; m.receiveShadow = true;
    near.add(m);
  };
  addB(tall, wallM, roofM);
  addB(low, houseWall, tileM);
  if (bigFar.length) {
    const m = new THREE.Mesh(mergeGeometries(bigFar.map((g) => { const h = g.clone(); h.clearGroups(); return h; })), mat({ color: 0xffffff, vertexColors: true, roughness: 0.85 }));
    m.castShadow = true; far.add(m);
  }

  // ---------------- árvores orgânicas (instanciadas, sem flatShading)
  const treeP: P2[] = [];
  const tr = osm.trees ?? [];
  for (let i = 0; i + 1 < tr.length; i += 2) treeP.push([tr[i], tr[i + 1]]);
  treeP.push(...streetTrees);
  for (const [kind, p] of greenPolys) {
    const a = Math.abs(area(p));
    const mr = minRect(p);
    const want = Math.min(kind ? 600 : 180, Math.floor(a / (kind ? 130 : 480)));
    let tries = want * 3;
    let got = 0;
    while (got < want && tries-- > 0) {
      const u = (r() * 2 - 1) * mr.hw, v = (r() * 2 - 1) * mr.hh;
      const x = mr.cx + u * Math.cos(mr.ang) - v * Math.sin(mr.ang), z = mr.cz + u * Math.sin(mr.ang) + v * Math.cos(mr.ang);
      if (!inside([x, z], p)) continue;
      treeP.push([x, z]); got++;
    }
  }
  const maxT = [0, 650, 1050, 1600, 2300, 3000][q];
  const keep = treeP.filter(([x, z]) => inR(x, z) && !avoid(x, z)).slice(0, maxT);
  if (keep.length) {
    const crown = makeOrganicCrown();
    const trunk = new THREE.CylinderGeometry(0.18, 0.3, 1, 7); trunk.translate(0, 0.5, 0);
    const imC = new THREE.InstancedMesh(crown, mat({ color: 0xffffff, roughness: 0.78 }), keep.length);
    const imT = new THREE.InstancedMesh(trunk, mat({ color: 0x5d4026, roughness: 0.92 }), keep.length);
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3();
    const greensC = ["#2d6e28", "#3a8030", "#255e24", "#488c38", "#32732a", "#56943e", "#3d7a35"];
    keep.forEach(([x, z], i) => {
      const k = 0.75 + r() * 0.75;
      const rad = 2.5 * k, ht = 3.1 * k;
      qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      mm.compose(pv.set(x, ht + rad * 0.65, z), qq, s.set(rad, rad * 0.88, rad)); imC.setMatrixAt(i, mm);
      mm.compose(pv.set(x, 0, z), qq, s.set(k, ht + rad * 0.28, k)); imT.setMatrixAt(i, mm);
      col.set(greensC[Math.floor(r() * greensC.length)]); imC.setColorAt(i, col);
    });
    imC.castShadow = true; imC.receiveShadow = true; imT.castShadow = true;
    near.add(imC, imT);
  }

  const lod = new THREE.LOD();
  lod.addLevel(near, 0);
  lod.addLevel(far, o.farAt ?? 260);
  lod.autoUpdate = true;
  return lod;
}
