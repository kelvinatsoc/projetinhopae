// Sede do clube em 3D, estilo PS2 que "evolui": um clube pequeno começa modesto (poucos
// polígonos, sombreamento chapado, sem sombras) e um clube estruturado ganha modelos mais
// detalhados, texturas melhores, sombras, iluminação, torcida, objetos e mais prédios.
//
// Geografia real: quando há dados em src/data/clubSites.json (Wikidata + OpenStreetMap,
// gerado por scripts/fetch_club_sites.py), estádio, CT e sede ficam nas posições relativas
// reais (distâncias longas comprimidas), com as ruas, áreas verdes, água e prédios vizinhos
// do OSM simplificados. Sem dados, usa um layout compacto de reserva.
//
// Só é baixado quando a tela do Clube abre (import dinâmico). Animação por tempo (frameDt):
// igual a 60 ou 120 Hz.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { frameDt } from "../animTime";

THREE.ColorManagement.enabled = false;

export type HqBuilding = "stadium" | "office" | "training" | "locker" | "academy" | "medical" | "press" | "scouting";
export type HqSiteKind = "stadium" | "ct" | "sede";

export interface GeoSite { lat: number; lon: number; name?: string; src?: string }
export interface GeoOsm {
  roads?: [number, number[]][];
  green?: number[][];
  water?: number[][];
  pitches?: number[][];
  buildings?: [number, number[]][];
}
export interface ClubGeo { sites: Partial<Record<HqSiteKind, GeoSite>>; osm?: Partial<Record<HqSiteKind, GeoOsm>> }

export interface HqOptions {
  host: HTMLElement;
  colors: [string, string];
  /** níveis 1-5 vindos da Estrutura */
  stadiumLv: number;
  trainLv: number;
  youthLv: number;
  medicalLv: number;
  /** dia de jogo: arquibancada cheia */
  matchDay: boolean;
  night: boolean;
  reduced: boolean;
  geo: ClubGeo | null;
  labels: Partial<Record<HqBuilding, HTMLElement>>;
  onPick: (b: HqBuilding) => void;
}

const U = 10; // metros por unidade da cena
const SKY_DAY = 0x9fd0ff, SKY_NIGHT = 0x0a1030;

/** Gerador pseudoaleatório determinístico (mesma sede sempre igual). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, smooth = false): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (!smooth) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  t.anisotropy = 4;
  return t;
}

/** Projeção local (m): x = leste, z = sul. */
function projectM(lat0: number, lon0: number, lat: number, lon: number): [number, number] {
  const x = (lon - lon0) * Math.cos((lat0 * Math.PI) / 180) * 111320;
  const z = -(lat - lat0) * 110540;
  return [x, z];
}

/** Distâncias longas comprimidas (CT a 10 km não pode sumir do mapa). */
function compress(x: number, z: number): [number, number] {
  const d = Math.hypot(x, z);
  const lim = 900;
  if (d <= lim) return [x, z];
  // satura em ~1,5 km: a ordem e a direção reais continuam, mas tudo cabe na tela
  const d2 = lim + 600 * (1 - Math.exp(-(d - lim) / 4000));
  return [(x / d) * d2, (z / d) * d2];
}

export class HqRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.5, 4000);
  private ray = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  private anchors: Partial<Record<HqBuilding, THREE.Vector3>> = {};
  private siteCenter: Partial<Record<HqSiteKind, THREE.Vector3>> = {};
  private movers: ((t: number, dt: number) => void)[] = [];
  private q: number;
  private rnd: () => number;
  private std: boolean;
  // câmera
  private yaw = -0.5;
  private pitch = 0.78;
  private dist = 80;
  private target = new THREE.Vector3();
  private fly: { t0: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; then?: () => void } | null = null;
  private overview = { target: new THREE.Vector3(), dist: 80 };
  private idleSince = 0;
  private raf = 0;
  private last = 0;
  private t = 0;
  private visible = true;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;
  private ptrs = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: number; yaw: number; pitch: number; pinch?: number; dist: number } | null = null;
  private tmp = new THREE.Vector3();
  private labelSize = new Map<HTMLElement, [number, number]>();

  constructor(private o: HqOptions) {
    const lv = [o.stadiumLv, o.trainLv, o.youthLv, o.medicalLv];
    this.q = Math.max(1, Math.min(5, Math.round(lv.reduce((s, v) => s + v, 0) / lv.length)));
    this.std = this.q >= 3;
    this.rnd = rng(Math.round((o.geo?.sites.stadium?.lat ?? 7) * 1e4) ^ o.colors[0].length);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    if (this.q >= 2) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = this.q >= 4 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    }
    const cv = this.renderer.domElement;
    cv.className = "hq-canvas";
    cv.style.touchAction = "none";
    o.host.prepend(cv);
    this.build();
    this.bind(cv);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(o.host);
    this.io = new IntersectionObserver((e) => { this.visible = e[0]?.isIntersecting ?? true; if (this.visible) this.loop(); });
    this.io.observe(o.host);
    this.last = performance.now();
    this.loop();
  }

  /** Locais disponíveis (para os botões de atalho da interface). */
  sites(): HqSiteKind[] { return Object.keys(this.siteCenter) as HqSiteKind[]; }

  // ------------------------------------------------------------ materiais
  private mat(color: THREE.ColorRepresentation, extra: Record<string, unknown> = {}): THREE.Material {
    if (this.std) return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, flatShading: this.q < 5, ...extra });
    return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  }
  private mesh(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true, receive = true) {
    const me = new THREE.Mesh(geo, m);
    me.castShadow = cast && this.q >= 2;
    me.receiveShadow = receive && this.q >= 2;
    return me;
  }
  private box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
    const me = this.mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y + h / 2, z);
    return me;
  }

  // ------------------------------------------------------------ cena
  private build() {
    const { o, scene } = this;
    const night = o.night;
    scene.background = new THREE.Color(night ? SKY_NIGHT : SKY_DAY);
    scene.fog = new THREE.Fog(night ? SKY_NIGHT : SKY_DAY, 160, 700);
    scene.add(new THREE.HemisphereLight(night ? 0x4a5a9a : 0xe4f2ff, night ? 0x101820 : 0x5d7a45, night ? 0.5 : this.std ? 0.75 : 0.95));
    const sun = new THREE.DirectionalLight(night ? 0x9fb4ff : 0xfff0d8, night ? 0.45 : this.std ? 2.1 : 1.15);
    sun.position.set(120, 180, 80);
    if (this.q >= 2) {
      sun.castShadow = true;
      const sz = this.q >= 4 ? 4096 : 2048;
      sun.shadow.mapSize.set(sz, sz);
      const cam = sun.shadow.camera as THREE.OrthographicCamera;
      cam.left = -140; cam.right = 140; cam.top = 140; cam.bottom = -140; cam.near = 10; cam.far = 500;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.4;
    }
    scene.add(sun);
    scene.add(sun.target);
    this.movers.push(() => { sun.position.set(this.target.x + 120, 180, this.target.z + 80); sun.target.position.copy(this.target); });

    // chão base (cidade ao longe)
    const groundTex = canvasTex(128, 128, (g) => {
      const r = rng(3);
      g.fillStyle = "#6f8a5a"; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) { g.fillStyle = r() > 0.5 ? "#6a8556" : "#77925f"; g.fillRect(r() * 128, r() * 128, 2, 2); }
    }, true);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(60, 60);
    const ground = this.mesh(new THREE.PlaneGeometry(4000, 4000), this.mat(0xffffff, { map: groundTex }), false, true);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    scene.add(ground);

    const geo = o.geo && o.geo.sites.stadium ? o.geo : null;
    if (geo) this.buildGeo(geo); else this.buildCompact();

    // visão geral: enquadra todos os locais
    const pts = Object.values(this.siteCenter) as THREE.Vector3[];
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
    const spread = pts.reduce((m, p) => Math.max(m, p.distanceTo(c)), 0);
    this.overview = { target: c, dist: Math.max(70, spread * 1.3 + 46) };
    this.target.copy(c);
    this.dist = this.overview.dist;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.overview.dist * 1.2;
    fog.far = this.overview.dist * 4 + 300;
  }

  /** Layout com geografia real. */
  private buildGeo(geo: ClubGeo) {
    const s0 = geo.sites.stadium!;
    const pos = (k: HqSiteKind): THREE.Vector3 | null => {
      const s = geo.sites[k];
      if (!s) return null;
      const [x, z] = compress(...projectM(s0.lat, s0.lon, s.lat, s.lon));
      return new THREE.Vector3(x / U, 0, z / U);
    };
    const st = pos("stadium")!;
    let ct = pos("ct");
    let sede = pos("sede");
    // locais muito colados ao estádio dividem a mesma "ilha"
    if (ct && ct.distanceTo(st) < 26) ct = null;
    if (sede && sede.distanceTo(st) < 18) sede = null;

    const islands: [HqSiteKind, THREE.Vector3][] = [["stadium", st]];
    if (ct) islands.push(["ct", ct]);
    if (sede) islands.push(["sede", sede]);
    for (const [k, p] of islands) {
      this.siteCenter[k] = p.clone();
      this.island(p, geo.osm?.[k], k);
    }
    // estrada entre os locais (linha tracejada amarela)
    for (const [k, p] of islands) if (k !== "stadium") this.route(st, p);

    // prédios do clube em cada local
    this.stadium(st.x, st.z);
    this.locker(st.x + 0, st.z + 24);
    if (ct) {
      this.training(ct.x, ct.z);
      this.academy(ct.x - 26, ct.z + 4);
      this.medical(ct.x + 26, ct.z + 4);
    } else {
      // sem CT conhecido: área de treino num terreno ao lado
      const c2 = new THREE.Vector3(st.x + 70, 0, st.z + 34);
      this.siteCenter.ct = c2;
      this.island(c2, undefined, "ct");
      this.route(st, c2);
      this.training(c2.x, c2.z);
      this.academy(c2.x - 26, c2.z + 4);
      this.medical(c2.x + 26, c2.z + 4);
    }
    if (sede) {
      this.office(sede.x, sede.z);
      this.press(sede.x - 14, sede.z + 12);
      this.scouting(sede.x + 14, sede.z + 12);
    } else {
      this.office(st.x - 30, st.z + 22);
      this.press(st.x - 16, st.z + 36);
      this.scouting(st.x + 16, st.z + 36);
    }
  }

  /** Layout de reserva (sem dados geográficos). */
  private buildCompact() {
    const st = new THREE.Vector3(0, 0, 0), ct = new THREE.Vector3(70, 0, 36), sede = new THREE.Vector3(-56, 0, 40);
    this.siteCenter = { stadium: st, ct, sede };
    this.island(st, undefined, "stadium");
    this.island(ct, undefined, "ct");
    this.island(sede, undefined, "sede");
    this.route(st, ct); this.route(st, sede);
    this.stadium(st.x, st.z);
    this.locker(st.x, st.z + 24);
    this.training(ct.x, ct.z);
    this.academy(ct.x - 26, ct.z + 4);
    this.medical(ct.x + 26, ct.z + 4);
    this.office(sede.x, sede.z);
    this.press(sede.x - 14, sede.z + 12);
    this.scouting(sede.x + 14, sede.z + 12);
  }

  // ------------------------------------------------------------ contexto urbano (OSM)
  private island(c: THREE.Vector3, osm: GeoOsm | undefined, kind: HqSiteKind) {
    const R = 56;
    const base = this.mesh(new THREE.CircleGeometry(R, 48), this.mat(0xa59f92), false, true);
    base.rotation.x = -Math.PI / 2; base.position.set(c.x, 0.01, c.z);
    this.scene.add(base);
    const keepOut = kind === "stadium" ? 19 : kind === "ct" ? 24 : 12;
    if (!osm) { this.procedural(c, R, keepOut); return; }

    const inR = (x: number, z: number) => Math.hypot(x, z) < R - 1;
    const poly = (flat: number[]) => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) pts.push(new THREE.Vector2(flat[i] / U, -flat[i + 1] / U));
      return pts;
    };
    const fill = (list: number[][] | undefined, color: number, y: number) => {
      if (!list?.length) return;
      const geos: THREE.BufferGeometry[] = [];
      for (const flat of list) {
        const pts = poly(flat);
        if (pts.length < 3) continue;
        const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
        g.rotateX(-Math.PI / 2);
        geos.push(g);
      }
      if (!geos.length) return;
      const m = this.mesh(mergeGeometries(geos), this.mat(color), false, true);
      m.position.set(c.x, y, c.z);
      this.scene.add(m);
    };
    fill(osm.green, 0x5f9446, 0.03);
    fill(osm.water, 0x3f7fc0, 0.035);
    // ruas como fitas (largura pela categoria)
    if (osm.roads?.length) {
      const pos: number[] = [];
      for (const [w, flat] of osm.roads) {
        const half = (0.45 + w * 0.32) / 2;
        for (let i = 0; i + 3 < flat.length; i += 2) {
          const x1 = flat[i] / U, z1 = flat[i + 1] / U, x2 = flat[i + 2] / U, z2 = flat[i + 3] / U;
          if (!inR(x1, z1) && !inR(x2, z2)) continue;
          const dx = x2 - x1, dz = z2 - z1, n = Math.hypot(dx, dz) || 1;
          const px = (-dz / n) * half, pz = (dx / n) * half;
          pos.push(x1 + px, 0, z1 + pz, x1 - px, 0, z1 - pz, x2 + px, 0, z2 + pz, x2 + px, 0, z2 + pz, x1 - px, 0, z1 - pz, x2 - px, 0, z2 - pz);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const m = this.mesh(g, this.mat(0x3b3e46, { side: THREE.DoubleSide }), false, true);
      m.position.set(c.x, 0.05, c.z);
      this.scene.add(m);
    }
    // prédios vizinhos extrudados (altura pelos andares do OSM)
    if (osm.buildings?.length) {
      const geos: THREE.BufferGeometry[] = [];
      const r = rng(osm.buildings.length * 31 + Math.round(c.x));
      for (const [lv, flat] of osm.buildings) {
        const pts = poly(flat);
        if (pts.length < 3) continue;
        let cx = 0, cz = 0;
        for (const p of pts) { cx += p.x; cz -= p.y; }
        cx /= pts.length; cz /= pts.length;
        if (!inR(cx, cz) || Math.hypot(cx, cz) < keepOut) continue;
        const h = lv ? Math.min(9, 0.3 + lv * 0.32) : 0.6 + r() * (this.q >= 3 ? 1.6 : 0.9);
        const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        geos.push(g);
      }
      if (geos.length) {
        const m = this.mesh(mergeGeometries(geos), this.mat(this.o.night ? 0x8a8478 : 0xd9d2c3), true, true);
        m.position.set(c.x, 0, c.z);
        this.scene.add(m);
      }
    }
    // campos de futebol de verdade que estão por perto (fora do estádio)
    if (osm.pitches?.length && kind !== "stadium") fill(osm.pitches, 0x3f9a3a, 0.06);
    this.trees(c, R, keepOut, this.q >= 3 ? 40 : 18);
  }

  /** Bairro procedural quando não há dados do OSM. */
  private procedural(c: THREE.Vector3, R: number, keepOut: number) {
    const r = this.rnd;
    const pos: number[] = [];
    // grade de ruas
    for (let k = -2; k <= 2; k++) {
      const off = k * 18;
      for (const horiz of [true, false]) {
        const x1 = horiz ? -R : off, z1 = horiz ? off : -R, x2 = horiz ? R : off, z2 = horiz ? off : R;
        const half = k === 0 ? 1.2 : 0.7;
        const px = horiz ? 0 : half, pz = horiz ? half : 0;
        pos.push(x1 + px, 0, z1 + pz, x1 - px, 0, z1 - pz, x2 + px, 0, z2 + pz, x2 + px, 0, z2 + pz, x1 - px, 0, z1 - pz, x2 - px, 0, z2 - pz);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const roads = this.mesh(g, this.mat(0x3b3e46, { side: THREE.DoubleSide }), false, true);
    roads.position.set(c.x, 0.05, c.z);
    this.scene.add(roads);
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.5) * 2 * R, z = (r() - 0.5) * 2 * R;
      if (Math.hypot(x, z) > R - 4 || Math.hypot(x, z) < keepOut + 4) continue;
      if (Math.abs(((x + 900) % 18) - 9) > 6.5 || Math.abs(((z + 900) % 18) - 9) > 6.5) continue;
      const w = 3 + r() * 4, d = 3 + r() * 4, h = 0.8 + r() * 2.4;
      const b = new THREE.BoxGeometry(w, h, d);
      b.translate(x, h / 2, z);
      geos.push(b);
    }
    if (geos.length) {
      const m = this.mesh(mergeGeometries(geos), this.mat(0xd9d2c3));
      m.position.set(c.x, 0, c.z);
      this.scene.add(m);
    }
    this.trees(c, R, keepOut, 24);
  }

  private route(a: THREE.Vector3, b: THREE.Vector3) {
    const d = a.distanceTo(b);
    const n = Math.max(2, Math.floor(d / 4));
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i += 2) {
      const t0 = i / n, t1 = Math.min(1, (i + 1) / n);
      const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
      const len = p0.distanceTo(p1);
      const g = new THREE.PlaneGeometry(len, 0.8);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-Math.atan2(p1.z - p0.z, p1.x - p0.x));
      g.translate((p0.x + p1.x) / 2, 0.07, (p0.z + p1.z) / 2);
      geos.push(g);
    }
    this.scene.add(this.mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: 0xffd23f }), false, false));
  }

  private trees(c: THREE.Vector3, R: number, keepOut: number, n: number) {
    const r = rng(Math.round(c.x * 13 + c.z * 7) + 5);
    const leafG: THREE.BufferGeometry[] = [], trunkG: THREE.BufferGeometry[] = [];
    const seg = this.q >= 4 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = keepOut + 6 + r() * (R - keepOut - 8);
      const x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.7 + r() * 0.7;
      const t = new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1.1 * s, 5); t.translate(x, 0.55 * s, z); trunkG.push(t);
      const l = this.q >= 4 ? new THREE.IcosahedronGeometry(1.1 * s, 0) : new THREE.ConeGeometry(1.1 * s, 2.4 * s, seg);
      l.translate(x, (this.q >= 4 ? 1.9 : 2.1) * s, z); leafG.push(l);
    }
    if (!n) return;
    const m1 = this.mesh(mergeGeometries(leafG), this.mat(0x2f6b2a)); m1.position.set(c.x, 0, c.z);
    const m2 = this.mesh(mergeGeometries(trunkG), this.mat(0x6b4a2b)); m2.position.set(c.x, 0, c.z);
    this.scene.add(m1, m2);
  }

  // ------------------------------------------------------------ prédios do clube
  private tag(obj: THREE.Object3D, id: HqBuilding, anchorY: number) {
    obj.traverse((m) => { m.userData.hq = id; });
    this.pickables.push(obj);
    this.anchors[id] = new THREE.Vector3(obj.position.x, anchorY, obj.position.z);
    this.scene.add(obj);
  }

  private windows(cols: number, rows: number, base: string, glass = false) {
    const lit = this.o.night;
    const k = this.q >= 4 ? 16 : 8; // texturas mais nítidas em clubes estruturados
    return canvasTex(cols * k, rows * k, (g) => {
      g.fillStyle = base; g.fillRect(0, 0, cols * k, rows * k);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const on = lit ? (x * 7 + y * 3) % 5 !== 0 : false;
        g.fillStyle = on ? "#ffe9a3" : glass ? "#5b8fc4" : "#2c4a6e";
        const p = glass ? 1 : k / 4;
        g.fillRect(x * k + p, y * k + p, k - 2 * p, k - 2 * p);
        if (this.q >= 4 && !on) { g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x * k + p, y * k + p, (k - 2 * p) / 3, k - 2 * p); }
      }
    }, this.q >= 4);
  }

  private flag(color: string, x: number, z: number, h: number, parent: THREE.Object3D) {
    parent.add(this.box(0.15, h, 0.15, this.mat(0xdddddd), x, 0, z));
    const seg = this.q >= 3 ? 10 : 5;
    const geo = new THREE.PlaneGeometry(1.6, 1, seg, 2);
    const flag = this.mesh(geo, this.mat(color, { side: THREE.DoubleSide }));
    flag.position.set(x + 0.85, h - 0.6, z);
    parent.add(flag);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const base = Float32Array.from(pos.array as Float32Array);
    const phase = x * 1.7 + z;
    this.movers.push((t) => {
      for (let i = 0; i < pos.count; i++) {
        const px = base[i * 3];
        pos.setZ(i, Math.sin(t * 4 + px * 3 + phase) * 0.18 * (px + 0.8));
      }
      pos.needsUpdate = true;
    });
  }

  private stadium(cx: number, cz: number) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const lv = Math.max(1, Math.min(5, this.o.stadiumLv));
    const [c1, c2] = this.o.colors;
    const k = lv >= 4 ? 4 : 2;
    const pitchTex = canvasTex(64 * k, 40 * k, (x) => {
      x.scale(k, k);
      for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? "#3c8a2c" : "#46992f"; x.fillRect(i * 64 / 12, 0, 64 / 12, 40); }
      x.strokeStyle = "#f0fff0"; x.lineWidth = 0.6;
      x.strokeRect(2.5, 2.5, 59, 35); x.beginPath(); x.moveTo(32, 2.5); x.lineTo(32, 37.5); x.stroke();
      x.beginPath(); x.arc(32, 20, 5, 0, Math.PI * 2); x.stroke();
      x.strokeRect(2.5, 12, 8, 16); x.strokeRect(53.5, 12, 8, 16);
      x.strokeRect(2.5, 16, 3, 8); x.strokeRect(58.5, 16, 3, 8);
    }, lv >= 4);
    const pitch = this.mesh(new THREE.PlaneGeometry(10.5, 6.8), this.mat(0xffffff, { map: pitchTex }), false, true);
    pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.08;
    g.add(pitch);
    // pista/entorno
    const apron = this.mesh(new THREE.PlaneGeometry(13, 9.5), this.mat(lv >= 3 ? 0x3d7a33 : 0x7a6a55), false, true);
    apron.rotation.x = -Math.PI / 2; apron.position.y = 0.06;
    g.add(apron);

    // arquibancadas: anéis por nível (mais segmentos, mais anéis, cobertura)
    const segs = 14 + lv * 8;
    const tiers = 1 + Math.floor((lv - 1) / 2); // 1..3
    const seatMats = [this.mat(c1), this.mat(c2), this.mat(0x8a8f99)];
    const concrete = this.mat(0xb9bcc4);
    let rx = 8.2, rz = 6.2, h0 = 0;
    const crowdSpots: [number, number, number, number][] = [];
    for (let tr = 0; tr < tiers; tr++) {
      const depth = 2.4 + (lv >= 3 ? 0.6 : 0);
      const th = 1.5 + lv * 0.35;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const w = (2 * Math.PI * Math.max(rx, rz)) / segs + 0.25;
        const seg = this.mesh(new THREE.BoxGeometry(w, th, depth), seatMats[(i + tr) % 3 === 2 ? 2 : (i % 2)]);
        seg.position.set(Math.cos(a) * (rx + depth / 2), h0 + th / 2, Math.sin(a) * (rz + depth / 2));
        seg.rotation.y = -a + Math.PI / 2;
        seg.rotation.x = 0;
        g.add(seg);
        if (h0 > 0) {
          const col = this.mesh(new THREE.BoxGeometry(w, h0, 0.6), concrete);
          col.position.set(Math.cos(a) * (rx + depth - 0.3), h0 / 2, Math.sin(a) * (rz + depth - 0.3));
          col.rotation.y = -a + Math.PI / 2;
          g.add(col);
        }
        crowdSpots.push([a, rx + depth * 0.5, rz + depth * 0.5, h0 + th]);
      }
      rx += depth; rz += depth; h0 += th + 0.2;
    }
    // cobertura
    if (lv >= 3) {
      const roofM = this.mat(lv >= 5 ? 0xf2f4f7 : 0xdfe3ea, lv >= 5 ? { transparent: true, opacity: 0.88 } : {});
      const ring = this.mesh(new THREE.RingGeometry(Math.max(rx, rz) - 3.8 - (lv >= 5 ? 1.5 : 0), Math.max(rx, rz) + 0.3, segs, 1), roofM);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(1, rz / rx, 1);
      ring.position.y = h0 + 1.4;
      g.add(ring);
      // treliça
      for (let i = 0; i < segs; i += 2) {
        const a = (i / segs) * Math.PI * 2;
        const p = this.box(0.25, 1.4, 0.25, this.mat(0x9aa0aa), Math.cos(a) * rx, h0, Math.sin(a) * rz);
        g.add(p);
      }
    }
    // torcida: cubinhos instanciados (mais gente com estádio maior / dia de jogo)
    if (lv >= 2 && crowdSpots.length) {
      const per = (this.o.matchDay ? 4 : 2) + (lv >= 4 ? 2 : 0);
      const n = crowdSpots.length * per;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.42, 0.28), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
      const r = rng(lv * 101);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      const bases: [number, number, number][] = [];
      let k2 = 0;
      for (const [a0, ax, az, y] of crowdSpots) {
        for (let j = 0; j < per; j++) {
          const a = a0 + (r() - 0.5) * (Math.PI * 2 / segs) * 0.9;
          const off = (r() - 0.5) * 1.6;
          const x = Math.cos(a) * (ax + off), z = Math.sin(a) * (az + off);
          bases.push([x, y + 0.2, z]);
          m4.makeTranslation(x, y + 0.2, z);
          im.setMatrixAt(k2, m4);
          col.set(r() < 0.6 ? c1 : r() < 0.7 ? c2 : "#e8d7c4");
          im.setColorAt(k2, col);
          k2++;
        }
      }
      im.instanceMatrix.needsUpdate = true;
      g.add(im);
      if (this.o.matchDay && !this.o.reduced) {
        this.movers.push((t) => {
          for (let i = 0; i < bases.length; i += 1) {
            const [x, y, z] = bases[i];
            const wave = Math.max(0, Math.sin(t * 2.2 - Math.atan2(z, x) * 2));
            m4.makeTranslation(x, y + wave * 0.35, z);
            im.setMatrixAt(i, m4);
          }
          im.instanceMatrix.needsUpdate = true;
        });
      }
    }
    // placas de LED em volta do campo
    if (lv >= 3) {
      const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(c1).multiplyScalar(this.o.night ? 1.2 : 0.9) });
      for (const [w, x, z, ry] of [[10, 0, -3.8, 0], [10, 0, 3.8, 0], [6.5, -5.6, 0, Math.PI / 2], [6.5, 5.6, 0, Math.PI / 2]] as const) {
        const b = this.box(w, 0.35, 0.12, led, x, 0.08, z); b.rotation.y = ry; g.add(b);
      }
    }
    // telão
    if (lv >= 4) {
      const scr = this.box(4, 2, 0.3, new THREE.MeshBasicMaterial({ color: 0x1a2a4a }), 0, h0 + 0.5, -(rz + 0.6));
      g.add(scr);
      const face = this.mesh(new THREE.PlaneGeometry(3.6, 1.6), new THREE.MeshBasicMaterial({ color: this.o.night ? 0x7fb8ff : 0x3a6aa8 }), false, false);
      face.position.set(0, h0 + 1.5, -(rz + 0.43)); face.rotation.y = 0;
      g.add(face);
    }
    // refletores: 4 torres simples → mastros altos → 8 torres (nível 5)
    const nTow = lv >= 5 ? 8 : 4;
    const glowMat = new THREE.MeshBasicMaterial({ color: this.o.night ? 0xfff6c8 : 0xd5d8de });
    const towerH = h0 + 3 + lv * 1.2;
    for (let i = 0; i < nTow; i++) {
      const a = (i / nTow) * Math.PI * 2 + Math.PI / nTow;
      const x = Math.cos(a) * (rx + 1.5), z = Math.sin(a) * (rz + 1.5);
      const pole = this.mesh(new THREE.CylinderGeometry(0.18, 0.3, towerH, lv >= 3 ? 8 : 4), this.mat(0x6b6f78));
      pole.position.set(x, towerH / 2, z);
      const lamp = this.box(lv >= 3 ? 2.6 : 1.6, 1.1, 0.4, glowMat, x, towerH, z);
      lamp.lookAt(0, towerH, 0);
      g.add(pole, lamp);
      if (this.o.night && i % 2 === 0) {
        const l = new THREE.PointLight(0xfff2c0, 60 + lv * 20, 60, 1.6);
        l.position.set(x * 0.7, towerH - 1, z * 0.7);
        g.add(l);
      }
    }
    // estacionamento com carros
    if (lv >= 2) {
      const lot = this.mesh(new THREE.PlaneGeometry(14, 6), this.mat(0x4a4d55), false, true);
      lot.rotation.x = -Math.PI / 2; lot.position.set(-(rx + 9), 0.06, 0);
      lot.rotation.z = Math.PI / 2;
      g.add(lot);
      const r = rng(77 + lv);
      const cols = [c1, "#e8e8e8", "#3a6aa8", "#d9a400", "#222222", "#b03030"];
      for (let i = 0; i < 4 + lv * 3; i++) {
        const car = this.box(0.9, 0.45, 1.8, this.mat(cols[i % cols.length]), -(rx + 7.5) - (i % 3) * 1.6, 0.05, -6 + Math.floor(i / 3) * 2.2 + r() * 0.2);
        g.add(car);
      }
    }
    // loja / museu do clube (estádio nível 4+)
    if (lv >= 4) {
      const mus = this.box(5, 2.2, 3, this.mat(0xeeeeee), rx + 6, 0, 3);
      const band = this.box(5.2, 0.5, 3.2, this.mat(c1), rx + 6, 2.2, 3);
      g.add(mus, band);
    }
    this.tag(g, "stadium", h0 + 4);
  }

  private office(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const [c1, c2] = this.o.colors;
    const floors = 2 + Math.round(this.q / 1.5);
    const glass = this.q >= 4;
    const win = this.windows(6, floors * (glass ? 2 : 1), glass ? "#9fb4c8" : "#d9dde4", glass);
    const facade = this.mat(0xffffff, { map: win, ...(glass && this.std ? { metalness: 0.4, roughness: 0.25 } : {}) });
    const side = this.mat(0xc9ced8);
    g.add(this.box(8, floors * 1.4, 6, [side, side, this.mat(0x8e95a3), this.mat(0x8e95a3), facade, facade]));
    g.add(this.box(8.4, 0.5, 6.4, this.mat(c1), 0, floors * 1.4, 0));
    g.add(this.box(2.4, 1.8, 0.5, this.mat(c2), 0, 0, 3.1));
    this.flag(c1, -3, 4.2, 4.5, g);
    this.flag(c2, -1.6, 4.2, 4.5, g);
    this.flag("#2fa84f", 2.4, 4.2, 4.5, g);
    if (this.q >= 3) { // praça com escudo no chão
      const plaza = this.mesh(new THREE.CircleGeometry(4, 24), this.mat(c1), false, true);
      plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.08, 7);
      g.add(plaza);
    }
    this.tag(g, "office", floors * 1.4 + 2.5);
  }

  private training(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const lv = Math.max(1, Math.min(5, this.o.trainLv));
    const n = 1 + Math.floor(lv * 0.8); // 1 a 5 campos
    const k = lv >= 4 ? 4 : 2;
    const tex = canvasTex(32 * k, 20 * k, (x2) => {
      x2.scale(k, k);
      for (let i = 0; i < 6; i++) { x2.fillStyle = i % 2 ? "#3c8a2c" : "#479a35"; x2.fillRect(i * 32 / 6, 0, 32 / 6, 20); }
      x2.strokeStyle = "#e8ffe8"; x2.lineWidth = 0.6; x2.strokeRect(1.5, 1.5, 29, 17); x2.beginPath(); x2.moveTo(16, 1.5); x2.lineTo(16, 18.5); x2.stroke();
      x2.beginPath(); x2.arc(16, 10, 3, 0, Math.PI * 2); x2.stroke();
    }, lv >= 4);
    const pm = this.mat(0xffffff, { map: tex });
    const spots: [number, number][] = [[0, 0], [12, 0], [-12, 0], [0, -9], [12, -9]];
    for (let i = 0; i < n; i++) {
      const [px, pz] = spots[i];
      const p = this.mesh(new THREE.PlaneGeometry(10.5, 6.8), pm, false, true);
      p.rotation.x = -Math.PI / 2; p.position.set(px, 0.05, pz);
      g.add(p);
      if (lv >= 2) for (const s of [-1, 1]) { // traves
        const gm = this.mat(0xffffff);
        g.add(this.box(0.08, 0.6, 1.6, gm, px + s * 5.05, 0, pz));
      }
    }
    // prédio do CT
    const ctW = 6 + lv;
    const win = this.windows(5 + lv, 1 + Math.ceil(lv / 2), "#e3e6ea", lv >= 4);
    const fm = this.mat(0xffffff, { map: win });
    g.add(this.box(ctW, (1 + Math.ceil(lv / 2)) * 1.3, 4, fm, 0, 0, 7.5));
    g.add(this.box(ctW + 0.4, 0.4, 4.4, this.mat(this.o.colors[0]), 0, (1 + Math.ceil(lv / 2)) * 1.3, 7.5));
    if (lv >= 3) g.add(this.box(5, 2, 4, this.mat(0xd8dde4), -ctW / 2 - 3.5, 0, 7.5)); // academia
    if (lv >= 4) { // piscina
      const pool = this.mesh(new THREE.PlaneGeometry(5, 2.6), this.std ? new THREE.MeshStandardMaterial({ color: 0x3fa9e0, roughness: 0.1, metalness: 0.2 }) : this.mat(0x3fa9e0), false, true);
      pool.rotation.x = -Math.PI / 2; pool.position.set(ctW / 2 + 4, 0.1, 7.5);
      g.add(pool);
    }
    if (lv >= 5) g.add(this.box(7, 4.2, 3.5, this.mat(0xffffff, { map: this.windows(8, 4, "#dfe4ea", true) }), 0, 0, 13)); // concentração
    // jogadores treinando
    const kit = [this.mat(0xf2c230), this.mat(0xff7a1a)];
    const skin = this.mat(0xc68e5e);
    const count = 4 + lv * 3;
    for (let i = 0; i < count; i++) {
      const pl = new THREE.Group();
      pl.add(this.box(0.5, 0.9, 0.35, kit[i % 2], 0, 0.15, 0));
      pl.add(this.box(0.35, 0.35, 0.35, skin, 0, 1.05, 0));
      pl.add(this.box(0.18, 0.3, 0.18, this.mat(0x222222), -0.12, 0, 0));
      pl.add(this.box(0.18, 0.3, 0.18, this.mat(0x222222), 0.12, 0, 0));
      g.add(pl);
      const [px, pz] = spots[i % n];
      const r = 1.2 + (i % 3) * 0.7, ph = (i / count) * Math.PI * 2;
      this.movers.push((t) => {
        const a = ph + t * (0.7 + (i % 2) * 0.3);
        pl.position.set(px + Math.cos(a) * r, Math.abs(Math.sin(t * 9 + i)) * 0.12, pz + Math.sin(a) * r * 0.6);
        pl.rotation.y = -a;
      });
    }
    // cones
    for (let i = 0; i < 4 + lv; i++) {
      const cone = this.mesh(new THREE.ConeGeometry(0.18, 0.4, 6), this.mat(0xff6a00));
      cone.position.set(-4 + i * 1.3, 0.2, -2.8);
      g.add(cone);
    }
    this.tag(g, "training", 4);
  }

  private locker(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(this.box(6.5, 2.4, 3.6, this.mat(0xb9bec8)));
    g.add(this.box(6.9, 0.4, 4, this.mat(this.o.colors[0]), 0, 2.4, 0));
    g.add(this.box(1.2, 1.6, 0.2, this.mat(0x40464f), 0, 0, 1.85));
    if (this.q >= 3) g.add(this.box(2.5, 0.8, 1.4, this.mat(0x2b2f3a), 4.8, 0, 0)); // ônibus
    this.tag(g, "locker", 4);
  }

  private academy(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const y = Math.max(1, Math.min(5, this.o.youthLv));
    const floors = 1 + y;
    const win = this.windows(4, floors, "#e8e2cf", y >= 4);
    g.add(this.box(5, floors * 1.2, 4.4, this.mat(0xffffff, { map: win })));
    const c2 = this.o.colors[1];
    g.add(this.box(5.4, 0.4, 4.8, this.mat(c2.toLowerCase() === "#ffffff" ? 0x2fa84f : c2), 0, floors * 1.2, 0));
    if (y >= 3) g.add(this.box(4, 2.4, 3, this.mat(0xf1ece0, { map: this.windows(4, 2, "#f1ece0") }), 0, 0, -5)); // alojamento
    const mini = this.mesh(new THREE.PlaneGeometry(5.5, 3.6), this.mat(0x4a9a36), false, true);
    mini.rotation.x = -Math.PI / 2; mini.position.set(0, 0.05, 5);
    g.add(mini);
    this.tag(g, "academy", floors * 1.2 + 2);
  }

  private medical(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const m = Math.max(1, Math.min(5, this.o.medicalLv));
    g.add(this.box(5, 2.8 + (m >= 4 ? 1.2 : 0), 4.4, this.mat(0xf4f6f8, { map: this.windows(5, m >= 4 ? 3 : 2, "#f4f6f8") })));
    if (m >= 3) g.add(this.box(3.4, 2, 3.2, this.mat(0xe6eaee), 4, 0, 0.5));
    const red = new THREE.MeshBasicMaterial({ color: 0xe53935 });
    const top = 2.8 + (m >= 4 ? 1.2 : 0);
    g.add(this.box(1.6, 0.45, 0.1, red, 0, top - 1, 2.25));
    g.add(this.box(0.45, 1.6, 0.1, red, 0, top - 1.57, 2.25));
    if (m >= 5) { // heliponto
      const pad = this.mesh(new THREE.CircleGeometry(1.8, 24), this.mat(0x30343c), false, true);
      pad.rotation.x = -Math.PI / 2; pad.position.y = top + 0.02;
      g.add(pad);
      const hm = new THREE.MeshBasicMaterial({ color: 0xffffff });
      g.add(this.box(0.25, 0.02, 1.4, hm, -0.5, top + 0.03, 0), this.box(0.25, 0.02, 1.4, hm, 0.5, top + 0.03, 0), this.box(1, 0.02, 0.25, hm, 0, top + 0.03, 0));
    }
    this.tag(g, "medical", top + 2);
  }

  private press(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(this.box(5, 2.6, 3.5, this.mat(0x5a6273)));
    const dish = this.mesh(new THREE.ConeGeometry(0.9, 0.5, this.q >= 3 ? 16 : 8, 1, true), this.mat(0xe4e7ec, { side: THREE.DoubleSide }));
    dish.position.set(1.4, 3.5, 0); dish.rotation.z = 2.2;
    g.add(this.box(0.15, 0.9, 0.15, this.mat(0x999999), 1.4, 2.6, 0), dish);
    if (this.q >= 3) g.add(this.box(1.4, 1.2, 3, this.mat(0xffffff), -3.6, 0, 0)); // caminhão de TV
    this.movers.push((t) => { dish.rotation.y = Math.sin(t * 0.4) * 0.6; });
    this.tag(g, "press", 4.5);
  }

  private scouting(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(this.box(3, 2.2, 3, this.mat(0x7b5a3c)));
    g.add(this.box(1.2, 4, 1.2, this.mat(0x8d6b4b), 0, 2.2, 0));
    g.add(this.box(2, 0.9, 2, this.mat(0x3a6aa8), 0, 6.2, 0));
    const beacon = this.box(0.4, 0.4, 0.4, new THREE.MeshBasicMaterial({ color: 0xff3b3b }), 0, 7.1, 0);
    g.add(beacon);
    this.movers.push((t) => { beacon.visible = Math.sin(t * 3) > -0.2; });
    this.tag(g, "scouting", 8);
  }

  // ------------------------------------------------------------ câmera
  /** Voa até um prédio (ou volta à visão geral). */
  focus(id: HqBuilding | "overview", then?: () => void) {
    const to = id === "overview" ? this.overview.target.clone() : this.anchors[id]?.clone().setY(0);
    if (!to) return;
    this.flyTo(to, id === "overview" ? this.overview.dist : id === "stadium" ? 48 : 34, then);
  }
  focusSite(k: HqSiteKind) {
    const p = this.siteCenter[k];
    if (p) this.flyTo(p.clone(), 70);
  }
  private flyTo(to: THREE.Vector3, d1: number, then?: () => void) {
    this.idleSince = this.t + 4;
    this.fly = { t0: this.t, dur: this.o.reduced ? 0.001 : 1.1, from: this.target.clone(), to, d0: this.dist, d1, then };
    if (!this.raf) this.loop();
  }

  private bind(cv: HTMLCanvasElement) {
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = this.ptrs.size === 2 ? this.pinchDist() : undefined;
      this.drag = { x: e.clientX, y: e.clientY, moved: pinch ? 99 : 0, yaw: this.yaw, pitch: this.pitch, pinch, dist: this.dist };
      this.idleSince = this.t;
      this.fly = null;
    });
    cv.addEventListener("pointermove", (e) => {
      if (!this.ptrs.has(e.pointerId) || !this.drag) return;
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.drag.pinch && this.ptrs.size === 2) {
        this.dist = Math.min(420, Math.max(18, this.drag.dist * (this.drag.pinch / Math.max(1, this.pinchDist()))));
      } else {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.moved = Math.max(this.drag.moved, Math.hypot(dx, dy));
        this.yaw = this.drag.yaw - dx * 0.008;
        this.pitch = Math.min(1.35, Math.max(0.4, this.drag.pitch + dy * 0.004));
      }
      this.idleSince = this.t;
      if (!this.raf) this.loop();
    });
    const end = (e: PointerEvent) => {
      this.ptrs.delete(e.pointerId);
      const d = this.drag;
      if (this.ptrs.size) return;
      this.drag = null;
      if (!d || d.moved > 10) return;
      const r = cv.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(p, this.camera);
      const hit = this.ray.intersectObjects(this.pickables, true)[0];
      const id = hit?.object.userData.hq as HqBuilding | undefined;
      if (id) this.focus(id, () => this.o.onPick(id));
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", (e) => { this.ptrs.delete(e.pointerId); this.drag = null; });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); this.dist = Math.min(420, Math.max(18, this.dist * (1 + Math.sign(e.deltaY) * 0.1))); if (!this.raf) this.loop(); }, { passive: false });
  }
  private pinchDist() {
    const [a, b] = [...this.ptrs.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  }

  private resize() {
    const w = this.o.host.clientWidth || 360, h = this.o.host.clientHeight || 300;
    // resolução cresce com a estrutura do clube (nível 1: cara de PS2; nível 5: nítido)
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, [0.75, 1, 1.5, 2, 3][this.q - 1]));
    this.renderer.setSize(w, h, false);
    const cv = this.renderer.domElement;
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    cv.style.imageRendering = this.q <= 2 ? "pixelated" : "auto";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.labelSize.clear();
    if (!this.raf) this.frame(performance.now());
  }

  private loop = () => {
    if (this.raf || !this.visible) return;
    this.raf = requestAnimationFrame((now) => { this.raf = 0; this.frame(now); this.loop(); });
  };

  private frame(now: number) {
    const dt = frameDt(this.last, now);
    this.last = now;
    if (!this.o.reduced) this.t += dt / 1000;
    else this.t += 0.0001;
    const t = this.t;
    if (this.fly) {
      const f = this.fly;
      const k = Math.min(1, (t - f.t0) / f.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
      this.target.lerpVectors(f.from, f.to, e);
      this.dist = f.d0 + (f.d1 - f.d0) * e;
      if (k >= 1) { this.fly = null; f.then?.(); }
    } else if (!this.drag && !this.o.reduced && t - this.idleSince > 3) {
      this.yaw += (dt / 1000) * 0.05; // órbita lenta quando ninguém mexe
    }
    for (const m of this.movers) m(t, dt);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  }

  private placeLabels() {
    const w = this.o.host.clientWidth, h = this.o.host.clientHeight;
    const placed: [number, number, number, number][] = []; // rótulos já postos (evita sobreposição)
    for (const [id, el] of Object.entries(this.o.labels) as [HqBuilding, HTMLElement][]) {
      const a = this.anchors[id];
      if (!a || !el) continue;
      this.tmp.copy(a).project(this.camera);
      const off = this.tmp.z > 1 || this.tmp.x < -1.15 || this.tmp.x > 1.15 || this.tmp.y < -1.15 || this.tmp.y > 1.15;
      // tamanho do rótulo lido uma vez só (nada de layout forçado a cada quadro)
      let sz = this.labelSize.get(el);
      if (!sz) { sz = [el.offsetWidth, el.offsetHeight]; this.labelSize.set(el, sz); }
      const hw = sz[0] / 2 + 4;
      const x = Math.round(Math.min(w - hw, Math.max(hw, (this.tmp.x * 0.5 + 0.5) * w)));
      const y = Math.round(Math.min(h - 8, Math.max(sz[1] + 8, (-this.tmp.y * 0.5 + 0.5) * h)));
      const box: [number, number, number, number] = [x - sz[0] / 2, y - sz[1], x + sz[0] / 2, y];
      const hit = placed.some((b) => box[0] < b[2] + 2 && box[2] > b[0] - 2 && box[1] < b[3] + 2 && box[3] > b[1] - 2);
      const hide = off || hit;
      if (!hide) placed.push(box);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      el.style.opacity = hide ? "0" : "1";
      el.style.pointerEvents = hide ? "none" : "auto";
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.io?.disconnect();
    this.ro?.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mm = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mm) ? mm : mm ? [mm] : []).forEach((x) => { (x as THREE.MeshLambertMaterial).map?.dispose(); x.dispose(); });
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
