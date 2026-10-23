// Troféus 3D feitos proceduralmente em three.js, inspirados nas taças reais de cada competição
// (Orelhuda da Champions, taça da Copa do Mundo com o globo, Libertadores com o jogadorzinho no
// topo e a base de madeira, Meisterschale da Bundesliga, Hexagoal da Ligue 1...).
// Usado quando não há foto recortada do troféu (ver trophies.ts) e na festa do título, em que a
// taça gira ao vivo. Só é baixado sob demanda (import dinâmico), junto com o three.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TrophySpec } from "./trophies";

type V2 = [number, number];

const METAL: Record<TrophySpec["metal"], { color: number; rough: number }> = {
  gold: { color: 0xf2c75c, rough: 0.22 },
  silver: { color: 0xe6e9ee, rough: 0.16 },
  bronze: { color: 0xc98a52, rough: 0.3 },
};

function mats(spec: TrophySpec) {
  const m = METAL[spec.metal];
  const accent = METAL[spec.accent ?? spec.metal];
  return {
    main: new THREE.MeshStandardMaterial({ color: m.color, metalness: 1, roughness: m.rough }),
    accent: new THREE.MeshStandardMaterial({ color: accent.color, metalness: 1, roughness: accent.rough }),
    wood: new THREE.MeshStandardMaterial({ color: 0x3a2312, metalness: 0.1, roughness: 0.45 }),
    green: new THREE.MeshStandardMaterial({ color: 0x0f7a4a, metalness: 0.3, roughness: 0.18 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.4, roughness: 0.35 }),
  };
}

const lathe = (pts: V2[], seg = 64) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), seg);

/** Tubo ao longo de uma curva (alças, filetes). */
function tube(points: THREE.Vector3[], r: number, closed = false) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed), 64, r, 12, closed);
}

/** Perfil do corpo (taça) de cada formato: [raio, altura]. */
function bodyProfile(shape: TrophySpec["shape"]): V2[] {
  switch (shape) {
    case "ears": // Orelhuda: haste fina que abre num vaso largo
      return [[0, 0.32], [0.16, 0.32], [0.1, 0.42], [0.08, 0.7], [0.12, 0.95], [0.26, 1.25], [0.38, 1.55], [0.42, 1.78], [0.4, 1.86], [0.36, 1.86]];
    case "vase": // Europa League / Henri Delaunay: vaso alto
      return [[0, 0.32], [0.2, 0.32], [0.14, 0.45], [0.12, 0.62], [0.24, 0.95], [0.3, 1.3], [0.24, 1.62], [0.2, 1.8], [0.26, 1.95], [0.22, 1.98]];
    case "slim":
      return [[0, 0.32], [0.18, 0.32], [0.08, 0.5], [0.07, 1.0], [0.16, 1.4], [0.3, 1.78], [0.32, 1.86], [0.28, 1.86]];
    case "bowl": // taça clássica com bojo
      return [[0, 0.32], [0.22, 0.32], [0.1, 0.45], [0.08, 0.7], [0.14, 0.82], [0.36, 1.0], [0.44, 1.25], [0.42, 1.48], [0.38, 1.52], [0.34, 1.52]];
    case "tall": // taça alta e cônica (Sul-Americana, Copa do Brasil)
      return [[0, 0.32], [0.24, 0.32], [0.12, 0.48], [0.1, 0.78], [0.18, 0.95], [0.3, 1.25], [0.36, 1.62], [0.38, 1.72], [0.34, 1.72]];
    case "wc": // Copa do Mundo: figuras em espiral que sobem e abrem
      return [[0, 0.3], [0.34, 0.3], [0.3, 0.42], [0.2, 0.62], [0.17, 0.85], [0.22, 1.1], [0.3, 1.32], [0.33, 1.42]];
    default:
      return [[0, 0.32], [0.2, 0.32], [0.1, 0.45], [0.09, 0.8], [0.3, 1.2], [0.36, 1.5], [0.32, 1.5]];
  }
}

function topOf(shape: TrophySpec["shape"]): number {
  const p = bodyProfile(shape);
  return Math.max(...p.map((q) => q[1]));
}

function radiusAt(shape: TrophySpec["shape"], y: number): number {
  const p = bodyProfile(shape);
  for (let i = 1; i < p.length; i++) {
    const [r0, y0] = p[i - 1], [r1, y1] = p[i];
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  }
  return 0.2;
}

/** Base do troféu. */
function addBase(g: THREE.Group, spec: TrophySpec, m: ReturnType<typeof mats>) {
  const kind = spec.base ?? "plinth";
  if (kind === "wood") {
    const b = new THREE.Mesh(lathe([[0, 0], [0.42, 0], [0.42, 0.03], [0.36, 0.06], [0.34, 0.34], [0.3, 0.36], [0, 0.36]], 16), m.wood);
    g.add(b);
    // plaquinhas dos campeões da Libertadores
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.01), m.accent);
      for (let row = 0; row < 4; row++) {
        const q = p.clone();
        q.position.set(Math.sin(a) * 0.335, 0.08 + row * 0.065, Math.cos(a) * 0.335);
        q.rotation.y = a;
        g.add(q);
      }
    }
  } else if (kind === "green") {
    g.add(new THREE.Mesh(lathe([[0, 0], [0.4, 0], [0.4, 0.04], [0, 0.04]]), m.main));
    g.add(new THREE.Mesh(lathe([[0, 0.04], [0.39, 0.04], [0.37, 0.12], [0, 0.12]]), m.green));
    g.add(new THREE.Mesh(lathe([[0, 0.12], [0.37, 0.12], [0.36, 0.16], [0, 0.16]]), m.main));
    g.add(new THREE.Mesh(lathe([[0, 0.16], [0.36, 0.16], [0.34, 0.24], [0, 0.24]]), m.green));
    g.add(new THREE.Mesh(lathe([[0, 0.24], [0.34, 0.24], [0.33, 0.3], [0, 0.3]]), m.main));
  } else if (kind === "star") {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 ? 0.24 : 0.42;
      if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    g.add(new THREE.Mesh(geo, m.dark));
    g.add(new THREE.Mesh(lathe([[0, 0.14], [0.22, 0.14], [0.2, 0.32], [0, 0.32]]), m.accent));
  } else {
    g.add(new THREE.Mesh(lathe([[0, 0], [0.36, 0], [0.36, 0.06], [0.3, 0.1], [0.26, 0.26], [0.22, 0.32], [0, 0.32]]), m.accent));
  }
}

function addHandles(g: THREE.Group, spec: TrophySpec, m: ReturnType<typeof mats>) {
  const h = spec.handles ?? "none";
  if (h === "none") return;
  const top = topOf(spec.shape);
  for (const side of [-1, 1]) {
    let pts: THREE.Vector3[];
    let r = 0.035;
    if (h === "ears") {
      // as "orelhas": alça enorme que desce do bocal até a haste
      const y0 = top - 0.08, y1 = 0.82;
      const r0 = radiusAt(spec.shape, y0) - 0.02, r1 = radiusAt(spec.shape, y1);
      pts = [
        new THREE.Vector3(side * r0, y0, 0), new THREE.Vector3(side * (r0 + 0.32), y0 + 0.08, 0),
        new THREE.Vector3(side * (r0 + 0.5), y0 - 0.3, 0), new THREE.Vector3(side * (r0 + 0.42), y0 - 0.72, 0),
        new THREE.Vector3(side * (r1 + 0.18), y1 + 0.02, 0), new THREE.Vector3(side * r1, y1, 0),
      ];
      r = 0.045;
    } else if (h === "loops") {
      const y0 = top - 0.1, y1 = top - 0.55;
      const r0 = radiusAt(spec.shape, y0) - 0.02, r1 = radiusAt(spec.shape, y1) - 0.02;
      pts = [new THREE.Vector3(side * r0, y0, 0), new THREE.Vector3(side * (r0 + 0.2), y0 + 0.02, 0), new THREE.Vector3(side * (r0 + 0.26), y0 - 0.2, 0), new THREE.Vector3(side * (r1 + 0.14), y1 + 0.02, 0), new THREE.Vector3(side * r1, y1, 0)];
    } else {
      const y0 = top - 0.12, y1 = top - 0.38;
      const r0 = radiusAt(spec.shape, y0) - 0.02, r1 = radiusAt(spec.shape, y1) - 0.02;
      pts = [new THREE.Vector3(side * r0, y0, 0), new THREE.Vector3(side * (r0 + 0.12), y0, 0), new THREE.Vector3(side * (r0 + 0.13), y1 + 0.08, 0), new THREE.Vector3(side * r1, y1, 0)];
      r = 0.025;
    }
    g.add(new THREE.Mesh(tube(pts, r), m.main));
  }
}

/** Jogadorzinho estilizado (Libertadores). */
function figure(m: THREE.Material) {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.CapsuleGeometry(0.045, 0.12, 4, 10); body.translate(0, 0.2, 0); parts.push(body);
  const head = new THREE.SphereGeometry(0.04, 16, 12); head.translate(0, 0.32, 0); parts.push(head);
  const l1 = new THREE.CapsuleGeometry(0.02, 0.12, 4, 8); l1.rotateZ(0.25); l1.translate(-0.03, 0.08, 0); parts.push(l1);
  const l2 = new THREE.CapsuleGeometry(0.02, 0.12, 4, 8); l2.rotateZ(-0.6); l2.translate(0.05, 0.09, 0.02); parts.push(l2);
  const a1 = new THREE.CapsuleGeometry(0.016, 0.1, 4, 8); a1.rotateZ(1.0); a1.translate(-0.08, 0.24, 0); parts.push(a1);
  const a2 = new THREE.CapsuleGeometry(0.016, 0.1, 4, 8); a2.rotateZ(-1.0); a2.translate(0.08, 0.24, 0); parts.push(a2);
  const ball = new THREE.SphereGeometry(0.035, 14, 10); ball.translate(0.12, 0.035, 0.02); parts.push(ball);
  return new THREE.Mesh(mergeGeometries(parts), m);
}

function addTopper(g: THREE.Group, spec: TrophySpec, m: ReturnType<typeof mats>) {
  const top = topOf(spec.shape);
  switch (spec.top) {
    case "globe": { // Copa do Mundo: globo com meridianos
      const r = 0.36;
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), m.main);
      s.position.y = top + r * 0.82;
      g.add(s);
      for (let i = 0; i < 6; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(r * 1.004, 0.006, 6, 64), m.accent);
        t.rotation.y = (i / 6) * Math.PI;
        t.position.copy(s.position);
        g.add(t);
      }
      break;
    }
    case "ball": {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), m.accent);
      (s.material as THREE.MeshStandardMaterial).flatShading = true;
      s.position.y = top + 0.18;
      g.add(s);
      break;
    }
    case "figure": {
      const lid = new THREE.Mesh(lathe([[0, top], [radiusAt(spec.shape, top - 0.02), top], [0.1, top + 0.1], [0.04, top + 0.14], [0, top + 0.14]]), m.main);
      g.add(lid);
      const f = figure(m.main);
      f.position.y = top + 0.12;
      g.add(f);
      break;
    }
    case "crown": { // Premier League: coroa dourada sobre a tampa
      g.add(new THREE.Mesh(lathe([[0, top], [radiusAt(spec.shape, top - 0.02), top], [0.16, top + 0.12], [0, top + 0.14]]), m.main));
      const crown = new THREE.Mesh(lathe([[0.1, top + 0.12], [0.14, top + 0.2], [0.12, top + 0.3], [0.07, top + 0.3]], 10), m.accent);
      g.add(crown);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), m.accent);
      gem.position.y = top + 0.34;
      g.add(gem);
      break;
    }
    case "lid": {
      g.add(new THREE.Mesh(lathe([[0, top], [radiusAt(spec.shape, top - 0.02), top], [0.14, top + 0.1], [0.05, top + 0.16], [0.07, top + 0.2], [0, top + 0.24]]), m.main));
      break;
    }
    default:
  }
}

/** Monta o troféu (altura ≈ 2 unidades, apoiado em y = 0). */
export function buildTrophy(spec: TrophySpec): THREE.Group {
  const g = new THREE.Group();
  const m = mats(spec);
  if (spec.shape === "dish") { // Meisterschale: prato de prata em pé
    const plate = new THREE.Mesh(lathe([[0, 0], [0.7, 0], [0.74, 0.04], [0.76, 0.1], [0.72, 0.1], [0.68, 0.05], [0, 0.04]], 96), m.main);
    plate.rotation.x = Math.PI / 2;
    plate.position.y = 0.95;
    g.add(plate);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.42, 64), m.accent);
    inner.position.set(0, 0.95, 0.045);
    g.add(inner);
    for (let i = 0; i < 18; i++) {
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), m.green);
      const a = (i / 18) * Math.PI * 2;
      gem.position.set(Math.cos(a) * 0.56, 0.95 + Math.sin(a) * 0.56, 0.06);
      g.add(gem);
    }
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), m.dark);
    stand.position.y = 0.06;
    g.add(stand);
    return g;
  }
  if (spec.shape === "hex") { // Hexagoal: coluna hexagonal facetada
    const geo = new THREE.CylinderGeometry(0.36, 0.22, 1.5, 6, 1);
    const hexm = new THREE.Mesh(geo, m.main);
    (hexm.material as THREE.MeshStandardMaterial).flatShading = true;
    hexm.position.y = 1.07;
    g.add(hexm);
    addBase(g, spec, m);
    return g;
  }
  if (spec.shape === "brasileirao") { // Taça do Brasileirão (CBF): pedestal facetado, 4 lâminas curvas e globo central
    const baseGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.28, 8);
    const baseMesh = new THREE.Mesh(baseGeo, m.dark);
    baseMesh.position.y = 0.14;
    g.add(baseMesh);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.02), m.main);
    plate.position.set(0, 0.14, 0.44);
    g.add(plate);

    const ring0 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 12, 48), m.main);
    ring0.rotation.x = Math.PI / 2;
    ring0.position.y = 0.28;
    g.add(ring0);

    const stem = new THREE.Mesh(lathe([[0, 0.28], [0.24, 0.28], [0.14, 0.55], [0.18, 0.85], [0, 0.85]]), m.main);
    g.add(stem);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(Math.cos(a) * 0.18, 0.45, Math.sin(a) * 0.18),
        new THREE.Vector3(Math.cos(a) * 0.38, 0.75, Math.sin(a) * 0.38),
        new THREE.Vector3(Math.cos(a) * 0.46, 1.25, Math.sin(a) * 0.46),
        new THREE.Vector3(Math.cos(a) * 0.38, 1.68, Math.sin(a) * 0.38),
        new THREE.Vector3(Math.cos(a) * 0.22, 1.88, Math.sin(a) * 0.22),
      ];
      g.add(new THREE.Mesh(tube(pts, 0.042), m.main));
    }

    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.36, 48, 32), m.main);
    globe.position.y = 1.25;
    g.add(globe);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.368, 0.022, 12, 64), m.green);
    band.rotation.x = Math.PI * 0.42;
    band.rotation.y = Math.PI * 0.18;
    band.position.y = 1.25;
    g.add(band);

    const topRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 10, 48), m.accent);
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = 1.86;
    g.add(topRing);
    return g;
  }

  if (spec.shape === "copaBR") { // Taça da Copa do Brasil: coroa barroca de 4 arcos e cálice com medalhão
    const bGeo = lathe([[0, 0], [0.44, 0], [0.44, 0.06], [0.38, 0.12], [0.36, 0.26], [0.32, 0.3], [0, 0.3]]);
    g.add(new THREE.Mesh(bGeo, m.dark));

    const bRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 8, 48), m.accent);
    bRing.rotation.x = Math.PI / 2;
    bRing.position.y = 0.28;
    g.add(bRing);

    const cupGeo = lathe([
      [0, 0.3], [0.18, 0.3], [0.12, 0.55], [0.18, 0.85],
      [0.32, 1.25], [0.36, 1.55], [0.34, 1.68], [0, 1.68]
    ]);
    g.add(new THREE.Mesh(cupGeo, m.main));

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(Math.cos(a) * 0.22, 0.32, Math.sin(a) * 0.22),
        new THREE.Vector3(Math.cos(a) * 0.44, 0.72, Math.sin(a) * 0.44),
        new THREE.Vector3(Math.cos(a) * 0.48, 1.22, Math.sin(a) * 0.48),
        new THREE.Vector3(Math.cos(a) * 0.38, 1.62, Math.sin(a) * 0.38),
        new THREE.Vector3(Math.cos(a) * 0.16, 1.76, Math.sin(a) * 0.16),
      ];
      g.add(new THREE.Mesh(tube(pts, 0.038), m.accent));
    }

    const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 24), m.accent);
    medal.rotation.x = Math.PI / 2;
    medal.position.set(0, 1.0, 0.38);
    g.add(medal);

    const lid = new THREE.Mesh(lathe([
      [0, 1.68], [0.34, 1.68], [0.24, 1.78], [0.1, 1.86], [0.04, 1.95], [0, 1.95]
    ]), m.main);
    g.add(lid);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), m.accent);
    finial.position.y = 1.98;
    g.add(finial);
    return g;
  }

  if (spec.shape === "paulistao") { // Troféu do Paulistão (FPF): asas douradas e bola central
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.24, 8), m.dark);
    base.position.y = 0.12;
    g.add(base);

    for (const side of [-1, 1]) {
      const pts = [
        new THREE.Vector3(side * 0.12, 0.24, 0),
        new THREE.Vector3(side * 0.38, 0.65, 0),
        new THREE.Vector3(side * 0.46, 1.25, 0),
        new THREE.Vector3(side * 0.36, 1.75, 0),
        new THREE.Vector3(side * 0.14, 1.92, 0),
      ];
      g.add(new THREE.Mesh(tube(pts, 0.045), m.main));
    }

    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 2), m.accent);
    ball.position.y = 1.15;
    g.add(ball);

    const cradle = new THREE.Mesh(lathe([[0, 0.24], [0.18, 0.24], [0.12, 0.65], [0.22, 0.9], [0, 0.9]]), m.main);
    g.add(cradle);
    return g;
  }

  if (spec.shape === "cwc") { // Mundial de Clubes FIFA: 6 colunas espirais e globo dourado
    const base = new THREE.Mesh(lathe([[0, 0], [0.42, 0], [0.4, 0.08], [0.34, 0.18], [0.28, 0.25], [0, 0.25]]), m.main);
    g.add(base);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(Math.cos(a) * 0.26, 0.25, Math.sin(a) * 0.26),
        new THREE.Vector3(Math.cos(a + 0.2) * 0.34, 0.7, Math.sin(a + 0.2) * 0.34),
        new THREE.Vector3(Math.cos(a + 0.35) * 0.36, 1.15, Math.sin(a + 0.35) * 0.36),
        new THREE.Vector3(Math.cos(a + 0.4) * 0.24, 1.5, Math.sin(a + 0.4) * 0.24),
      ];
      g.add(new THREE.Mesh(tube(pts, 0.034), m.main));
    }

    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 24), m.main);
    globe.position.y = 1.45;
    g.add(globe);

    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.342, 0.008, 6, 48), m.accent);
      ring.rotation.y = (i / 4) * Math.PI;
      ring.position.y = 1.45;
      g.add(ring);
    }
    return g;
  }

  if (spec.shape === "ring") { // Mundial de Clubes (2025): anel dourado gravado sobre base
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 24, 96), m.main);
    ring.position.y = 1.05;
    g.add(ring);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 64), m.accent);
    disc.rotation.x = Math.PI / 2;
    disc.position.y = 1.05;
    g.add(disc);
    addBase(g, spec, m);
    return g;
  }
  addBase(g, spec, m);
  g.add(new THREE.Mesh(lathe(bodyProfile(spec.shape)), m.main));
  if (spec.shape === "wc") {
    // as duas figuras que sobem em espiral
    for (let k = 0; k < 2; k++) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, y = 0.36 + t * 1.12;
        const r = radiusAt("wc", Math.min(y, 1.42)) + 0.035;
        const a = k * Math.PI + t * Math.PI * 1.6;
        pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      g.add(new THREE.Mesh(tube(pts, 0.055), m.main));
    }
  }
  // filete decorativo na boca
  const top = topOf(spec.shape);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(spec.shape, top - 0.03), 0.02, 8, 64), m.accent);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = top - 0.02;
  if (spec.shape !== "wc") g.add(lip);
  addHandles(g, spec, m);
  addTopper(g, spec, m);
  return g;
}

// ---------------------------------------------------------------- cena e renderização
let shared: { r: THREE.WebGLRenderer; env: THREE.Texture } | null = null;

function renderer(): { r: THREE.WebGLRenderer; env: THREE.Texture } | null {
  if (shared) return shared;
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const pm = new THREE.PMREMGenerator(r);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    shared = { r, env };
    return shared;
  } catch {
    return null;
  }
}

function makeScene(spec: TrophySpec, env: THREE.Texture) {
  const scene = new THREE.Scene();
  scene.environment = env;
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 3);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));
  const t = buildTrophy(spec);
  // centraliza e enquadra
  const box = new THREE.Box3().setFromObject(t);
  const size = box.getSize(new THREE.Vector3());
  const h = Math.max(size.y, size.x * 1.1);
  t.position.y = -box.min.y - size.y / 2;
  scene.add(t);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const dist = (h / 2) / Math.tan((28 / 2) * Math.PI / 180) * 1.12;
  cam.position.set(0, size.y * 0.06, dist);
  cam.lookAt(0, 0, 0);
  return { scene, cam, trophy: t };
}

const imgCache = new Map<string, string>();

/** Imagem PNG (data URL) do troféu, renderizada uma vez e guardada. */
export function trophyImage(spec: TrophySpec, px = 256): string | null {
  const k = `${spec.key}:${px}`;
  const hit = imgCache.get(k);
  if (hit) return hit;
  const s = renderer();
  if (!s) return null;
  const { scene, cam, trophy } = makeScene(spec, s.env);
  trophy.rotation.y = -0.35;
  s.r.setPixelRatio(1);
  s.r.setSize(px, px, false);
  s.r.setClearColor(0x000000, 0);
  s.r.render(scene, cam);
  const url = s.r.domElement.toDataURL("image/png");
  imgCache.set(k, url);
  return url;
}

/** Troféu girando ao vivo num canvas (festa do título). Devolve a função de limpeza. */
export function mountTrophy(canvas: HTMLCanvasElement, spec: TrophySpec): () => void {
  let r: THREE.WebGLRenderer;
  try {
    r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return () => undefined;
  }
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const pm = new THREE.PMREMGenerator(r);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const { scene, cam, trophy } = makeScene(spec, env);
  const rim = new THREE.PointLight(0xfff1c0, 6, 10);
  rim.position.set(-2, 1.5, -1.5);
  scene.add(rim);
  let raf = 0;
  let last = performance.now();
  const resize = () => {
    const w = canvas.clientWidth || 200, h = canvas.clientHeight || 200;
    r.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  resize();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    trophy.rotation.y += dt * 0.9;
    r.render(scene, cam);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  window.addEventListener("resize", resize);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mm = mesh.material as THREE.Material | undefined;
      mm?.dispose?.();
    });
    env.dispose();
    pm.dispose();
    r.dispose();
  };
}
