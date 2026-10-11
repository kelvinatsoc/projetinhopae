// Sede do clube em 3D. Estádio, CT e sede ficam nas posições relativas reais (Wikidata +
// OpenStreetMap, src/data/clubSites.json, gerado por scripts/fetch_club_sites.py), com o
// entorno real do OSM: ruas com largura e faixas, quadras, prédios vizinhos com a altura real,
// árvores, água e um relevo leve em volta. Os estádios marcantes saem de uma descrição
// paramétrica (src/data/stadiumModels.json, gerador em ./stadium.ts) ajustada ao contorno real
// do prédio; os prédios do CT e da sede usam o contorno real do OSM.
//
// A qualidade cresce com a Estrutura do clube (resolução, sombras, texturas, árvores, detalhes),
// mas o nível 1 já tem iluminação, sombras e texturas. LOD e instancing seguram os 60 fps.
//
// Só é baixado quando a tela do Clube abre (import dinâmico). Animação por tempo (frameDt):
// igual a 60 ou 120 Hz.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { frameDt } from "../animTime";
import { rng, pts, area, centroid, minRect, noise2, superEllipse, type P2 } from "./geo";
import { applyCustom, buildStadium, findModel, fitToBowl, genericModel, type StadiumCustom, type StadiumModel, type TexFactory } from "./stadium";
import { buildCity, mergeExtruded, type GeoOsm } from "./city";

export type { GeoOsm } from "./city";
export type HqBuilding = "stadium" | "office" | "training" | "locker" | "academy" | "medical" | "press" | "scouting";
export type HqSiteKind = "stadium" | "ct" | "sede" | "base";

export interface GeoSite { lat: number; lon: number; name?: string; src?: string }
export interface ClubGeo { sites: Partial<Record<HqSiteKind, GeoSite>>; osm?: Partial<Record<HqSiteKind, GeoOsm>> }

export interface HqOptions {
  host: HTMLElement;
  colors: [string, string];
  clubId?: string;
  stadiumName?: string;
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
  /** força a qualidade (1-5); por padrão vem da média da Estrutura */
  quality?: number;
  /** escudo do clube (aparece no estádio, na sede e no CT) */
  crestUrl?: string | null;
  /** personalização/reformas do estádio feitas pelo clube */
  stadiumCustom?: StadiumCustom | null;
}

const U = 10; // metros por unidade da cena
const ISLAND_M = 600; // raio do entorno real (m)
const SKY_DAY = 0xa9d4f5, SKY_NIGHT = 0x0a1030;

/**
 * Escudo como textura com fundo transparente: se o arquivo vier com fundo chapado (cor dos
 * cantos), esse fundo vira transparente a partir das bordas (flood fill), sem furar o escudo.
 */
function crestTexture(img: HTMLImageElement): THREE.Texture | null {
  const W = 256, H = Math.round((256 * img.height) / Math.max(1, img.width)) || 256;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H), a = d.data;
  const k0 = 0;
  if (a[k0 + 3] > 200) {
    const [r0, g0, b0] = [a[0], a[1], a[2]];
    const near = (i: number) => Math.abs(a[i] - r0) + Math.abs(a[i + 1] - g0) + Math.abs(a[i + 2] - b0) < 60;
    const seen = new Uint8Array(W * H), st: number[] = [];
    for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
    while (st.length) {
      const p = st.pop()!;
      if (seen[p]) continue;
      seen[p] = 1;
      if (!near(p * 4)) continue;
      a[p * 4 + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1); if (y > 0) st.push(p - W); if (y < H - 1) st.push(p + W);
    }
    g.putImageData(d, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
  const lim = 1300;
  if (d <= lim) return [x, z];
  // satura em ~2,1 km: a ordem e a direção reais continuam, mas tudo cabe na tela
  const d2 = lim + 800 * (1 - Math.exp(-(d - lim) / 4000));
  return [(x / d) * d2, (z / d) * d2];
}

export class HqRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 1, 9000);
  private ray = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  private anchors: Partial<Record<HqBuilding, THREE.Vector3>> = {};
  private siteCenter: Partial<Record<HqSiteKind, THREE.Vector3>> = {};
  private movers: ((t: number, dt: number) => void)[] = [];
  private q: number;
  private rnd: () => number;
  private std = true;
  private sun!: THREE.DirectionalLight;
  private sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
  private composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  private texCache: THREE.Texture[] = [];
  // câmera
  private yaw = -0.5;
  private pitch = 0.78;
  private dist = 80;
  private target = new THREE.Vector3();
  private fly: { t0: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; then?: () => void } | null = null;
  private overview = { target: new THREE.Vector3(), dist: 80 };
  private idleSince = 0;
  private tourI = 0;
  private stadiumRing: P2[] | null = null;
  /** escudos (sprites) que não entram no GTAO */
  private overlays: THREE.Object3D[] = [];
  /** desnível do terreno em volta do estádio: inclinação (m/m) e direção da subida (graus; 0 = leste, 90 = sul) */
  private slope: { k: number; dir: number; c: THREE.Vector3 } | null = null;
  /** altura (unidades) do terreno inclinado no ponto (x, z) da cena */
  private slopeY(x: number, z: number): number {
    const s = this.slope;
    if (!s) return 0;
    const d = (s.dir * Math.PI) / 180;
    const raw = s.k * ((x - s.c.x) * Math.cos(d) + (z - s.c.z) * Math.sin(d));
    const r = Math.hypot(x - s.c.x, z - s.c.z), R = ISLAND_M / U;
    // dentro da ilha o plano inteiro; fora, volta suavemente ao relevo comum
    const f = r <= R ? 1 : Math.max(0, 1 - (r - R) / 70);
    return raw * f * f * (3 - 2 * f);
  }
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
    this.q = Math.max(1, Math.min(5, Math.round(o.quality ?? lv.reduce((s, v) => s + v, 0) / lv.length)));
    this.rnd = rng(Math.round((o.geo?.sites.stadium?.lat ?? 7) * 1e4) ^ o.colors[0].length);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = o.night ? 1.05 : 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const cv = this.renderer.domElement;
    cv.className = "hq-canvas";
    cv.style.touchAction = "none";
    o.host.prepend(cv);
    this.build();
    this.crests();
    this.post();
    this.bind(cv);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(o.host);
    this.io = new IntersectionObserver((e) => { this.visible = e[0]?.isIntersecting ?? true; if (this.visible) this.loop(); });
    this.io.observe(o.host);
    this.last = performance.now();
    this.loop();
  }

  /** Pós-processamento: oclusão de ambiente (GTAO) e brilho (bloom), conforme a qualidade. */
  private post() {
    if (typeof window === "undefined") return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.q >= 2 ? 4 : 2 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (this.q >= 2) {
      const ao = new GTAOPass(this.scene, this.camera, 1, 1);
      ao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.4, thickness: 2, scale: 1.1, samples: this.q >= 4 ? 16 : 8 });
      ao.blendIntensity = 0.9;
      // o GTAO desenha tudo com material próprio (ignora a transparência): os escudos ficam de fora
      const render = ao.render.bind(ao);
      ao.render = (...args: Parameters<GTAOPass["render"]>) => {
        for (const s of this.overlays) s.visible = false;
        render(...args);
        for (const s of this.overlays) s.visible = true;
      };
      c.addPass(ao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.o.night ? 0.9 : 0.18, 0.5, this.o.night ? 0.6 : 0.92);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.composer = c;
  }

  /** Escudo do clube em placas sobre o estádio, a sede e o CT, e bandeiras na esplanada. */
  private crests() {
    const st = this.anchors.stadium;
    if (st) {
      const g = new THREE.Group();
      g.position.set(st.x, 0, st.z + 3);
      const [c1, c2] = this.o.colors;
      for (let i = 0; i < 6; i++) this.flag(i % 2 ? c2 : c1, -6 + i * 2.4, 16 + (i % 3) * 0.1, 4.5, g);
      this.scene.add(g);
    }
    const url = this.o.crestUrl;
    if (!url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const t = crestTexture(img);
      if (!t) return;
      this.texCache.push(t);
      const mk = (p: THREE.Vector3 | undefined, size: number, dy: number) => {
        if (!p) return;
        // alphaTest + depthWrite: o escudo entra no buffer de profundidade (sem "sombra" do GTAO atrás)
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, alphaTest: 0.5, depthWrite: true }));
        sp.scale.set(size, size * 1.1, 1);
        sp.position.set(p.x, p.y + dy, p.z);
        this.overlays.push(sp);
        this.scene.add(sp);
      };
      mk(this.anchors.stadium, 2.6, 1.6);
      mk(this.anchors.office, 2.4, 0.6);
      mk(this.anchors.training, 2.4, 0.6);
      mk(this.anchors.locker, 1.6, 0.4);
    };
    img.src = url;
  }

  /** Locais disponíveis (para os botões de atalho da interface). */
  sites(): HqSiteKind[] { return Object.keys(this.siteCenter) as HqSiteKind[]; }

  // ------------------------------------------------------------ materiais e texturas
  private tex: TexFactory = (w, h, draw, repeat = false) => {
    const c = document.createElement("canvas");
    // clubes modestos usam texturas menores (mesmo desenho, menos memória)
    const k = this.q <= 1 ? 0.5 : this.q === 2 ? 0.75 : 1;
    const W = Math.max(8, Math.round(w * k)), H = Math.max(8, Math.round(h * k));
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    if (!g) return null;
    g.scale(W / w, H / h);
    draw(g);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), this.q >= 3 ? 8 : 4);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    this.texCache.push(t);
    return t;
  };
  private smat = (p: THREE.MeshStandardMaterialParameters): THREE.Material => {
    const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as THREE.MeshStandardMaterialParameters;
    return new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.02, ...clean });
  };
  private mat(color: THREE.ColorRepresentation, extra: Record<string, unknown> = {}): THREE.Material {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...extra });
  }
  private mesh(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true, receive = true) {
    const me = new THREE.Mesh(geo, m);
    me.castShadow = cast;
    me.receiveShadow = receive;
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
    scene.fog = new THREE.Fog(night ? SKY_NIGHT : SKY_DAY, 300, 1400);
    // céu físico (espalhamento atmosférico) e o mesmo céu como mapa de ambiente (HDRI procedural)
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(night ? 100 : 52), THREE.MathUtils.degToRad(125));
    this.sunDir = sunDir.clone();
    const pm = new THREE.PMREMGenerator(this.renderer);
    if (!night) {
      const sky = new Sky();
      sky.scale.setScalar(4500);
      const u = sky.material.uniforms;
      u.turbidity.value = 4; u.rayleigh.value = 1.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(sunDir);
      scene.add(sky);
      const envScene = new THREE.Scene();
      const sky2 = new Sky(); sky2.scale.setScalar(4500);
      for (const k of Object.keys(u)) (sky2.material.uniforms[k].value as unknown) = u[k].value;
      envScene.add(sky2);
      // chão neutro no ambiente (luz rebatida da cidade)
      const gnd = new THREE.Mesh(new THREE.CircleGeometry(4000, 16), new THREE.MeshBasicMaterial({ color: 0x5a5850 }));
      gnd.rotation.x = -Math.PI / 2; gnd.position.y = -10; envScene.add(gnd);
      scene.environment = pm.fromScene(envScene, 0).texture;
      scene.environmentIntensity = 0.12;
      scene.background = null;
    } else {
      const sky = new THREE.SphereGeometry(4000, 24, 12);
      const sc: number[] = [];
      const top = new THREE.Color(0x050818), hor = new THREE.Color(SKY_NIGHT);
      const sp = sky.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sp.count; i++) { const k = Math.max(0, sp.getY(i) / 4000); const c = hor.clone().lerp(top, Math.pow(k, 0.6)); sc.push(c.r, c.g, c.b); }
      sky.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
      scene.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.12;
    }
    pm.dispose();
    scene.add(new THREE.HemisphereLight(night ? 0x4a5a9a : 0xcfe3ff, night ? 0x101820 : 0x6b6a5a, night ? 0.35 : 0.35));
    const sun = new THREE.DirectionalLight(night ? 0x9fb4ff : 0xfff0d6, night ? 0.5 : 2.6);
    sun.castShadow = true;
    const sz = [1024, 2048, 2048, 4096, 4096][this.q - 1];
    sun.shadow.mapSize.set(sz, sz);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 3;
    this.sun = sun;
    scene.add(sun, sun.target);
    if (night) {
      // luz dos refletores sobre o estádio
      const fl = new THREE.PointLight(0xfff2d0, 2.2, 0, 0);
      this.movers.push(() => { const s = this.siteCenter.stadium; if (s) fl.position.set(s.x, 9, s.z); });
      scene.add(fl);
    }

    const geo = o.geo && o.geo.sites.stadium ? o.geo : null;
    if (geo) this.buildGeo(geo); else this.buildCompact();
    this.terrain();

    // visão geral: enquadra todos os locais
    const pts3 = Object.values(this.siteCenter) as THREE.Vector3[];
    const c = pts3.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts3.length));
    const spread = pts3.reduce((m, p) => Math.max(m, p.distanceTo(c)), 0);
    this.overview = { target: c, dist: Math.max(110, spread * 3.4 + 90) };
    this.target.copy(c);
    this.dist = this.overview.dist;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.overview.dist * 1.4;
    fog.far = this.overview.dist * 4.5 + 500;
  }

  /** Relevo leve em volta (achatado sob os locais), com a mancha urbana perto deles. */
  private terrain() {
    const S = 3000, seg = this.q >= 3 ? 220 : 140;
    const g = new THREE.PlaneGeometry(S, S, seg, seg);
    g.rotateX(-Math.PI / 2);
    const nz = noise2(Math.round((this.o.geo?.sites.stadium?.lon ?? 3) * 100));
    const pos = g.attributes.position as THREE.BufferAttribute;
    const centers = Object.values(this.siteCenter) as THREE.Vector3[];
    const R = ISLAND_M / U;
    const col: number[] = [];
    const city = new THREE.Color(0xa9a395), grass = new THREE.Color(0x6f8f55), dry = new THREE.Color(0x8d9a62), wood = new THREE.Color(0x4f7a40);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let d = Infinity;
      for (const p of centers) d = Math.min(d, Math.hypot(x - p.x, z - p.z));
      const n = nz(x / 90, z / 90) * 0.7 + nz(x / 30 + 7, z / 30) * 0.3;
      const k = Math.min(1, Math.max(0, (d - R - 4) / 60));
      let sy = this.slopeY(x, z);
      if (this.slope && this.stadiumRing) { const r = Math.hypot(x - this.slope.c.x, z - this.slope.c.z); const f = Math.min(1, Math.max(0, (r - 24) / 10)); sy = Math.min(sy, sy * f) - (1 - f) * 0.6; }
      pos.setY(i, (n - 0.35) * 26 * k * k - 0.3 + sy);
      const u = Math.min(1, Math.max(0, (d - R + 10) / 70));
      c.copy(city).lerp(n > 0.6 ? wood : n < 0.35 ? dry : grass, u);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = this.mesh(g, this.smat({ vertexColors: true, roughness: 1 }), false, true);
    this.scene.add(m);
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
    const base = pos("base");
    // locais colados ao estádio dividem a mesma "ilha" (o entorno real já mostra tudo)
    if (ct && ct.distanceTo(st) < 2 * ISLAND_M / U - 8) ct = ct.distanceTo(st) < 30 ? null : ct;
    if (sede && sede.distanceTo(st) < 30) sede = null;
    if (ct && sede && ct.distanceTo(sede) < 30) sede = null;

    const islands: [HqSiteKind, THREE.Vector3][] = [["stadium", st]];
    if (ct) islands.push(["ct", ct]);
    if (sede) islands.push(["sede", sede]);
    if (base && base.distanceTo(st) > 30 && (!ct || base.distanceTo(ct) > 30)) islands.push(["base", base]);
    // ilhas que se sobrepõem: afasta a menor (mantendo a direção real)
    for (let i = 1; i < islands.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = islands[j][1], b = islands[i][1];
        const d = a.distanceTo(b), min = (2 * ISLAND_M) / U + 6;
        if (d < min) { const dir = b.clone().sub(a).normalize(); if (!isFinite(dir.x)) dir.set(1, 0, 0); b.copy(a).addScaledVector(dir, min); }
      }
    }
    const stadiumGeo = this.placeStadium(st, geo.osm?.stadium);
    for (const [k, p] of islands) {
      this.siteCenter[k] = p.clone();
      const osm = geo.osm?.[k];
      const skip = new Set<number>(k === "stadium" ? [] : osm?.club ?? []);
      this.island(p, osm, k, skip, k === "stadium" ? stadiumGeo.avoid : undefined);
    }
    for (const [k, p] of islands) if (k !== "stadium") this.route(st, p);

    const free = (dx: number, dz: number) => {
      // ponto livre ao lado do estádio (fora da esplanada)
      const s = stadiumGeo;
      const c = Math.cos(s.rotY), si = Math.sin(s.rotY);
      return new THREE.Vector3(st.x + (s.x + dx * c + dz * si) / U, 0, st.z + (s.z - dx * si + dz * c) / U);
    };
    const lockerAt = free(0, stadiumGeo.outer[1] + 40);
    this.locker(lockerAt.x, lockerAt.z);
    const hasBase = islands.some(([k]) => k === "base");
    if (hasBase) this.baseSite(this.siteCenter.base!, geo.osm?.base);
    if (ct) {
      this.ctSite(ct, geo.osm?.ct, hasBase);
    } else {
      // sem CT conhecido: área de treino num terreno ao lado
      const c2 = new THREE.Vector3(st.x + 140, 0, st.z + 40);
      for (const [, p] of islands) if (p.distanceTo(c2) < (2 * ISLAND_M) / U) c2.x += 60;
      this.siteCenter.ct = c2;
      this.island(c2, undefined, "ct");
      this.route(st, c2);
      this.training(c2.x, c2.z);
      this.academy(c2.x - 26, c2.z + 4);
      this.medical(c2.x + 26, c2.z + 4);
    }
    if (sede) {
      this.sedeSite(sede, geo.osm?.sede);
    } else {
      const p = free(-(stadiumGeo.outer[0] + 60), 0);
      const p2 = free(-(stadiumGeo.outer[0] + 50), stadiumGeo.outer[1] * 0.75);
      const p3 = free(-(stadiumGeo.outer[0] + 50), -stadiumGeo.outer[1] * 0.75);
      this.office(p.x, p.z);
      this.press(p2.x, p2.z);
      this.scouting(p3.x, p3.z);
    }
  }

  /** Layout de reserva (sem dados geográficos). */
  private buildCompact() {
    const st = new THREE.Vector3(0, 0, 0), ct = new THREE.Vector3(140, 0, 50), sede = new THREE.Vector3(-125, 0, 60);
    this.siteCenter = { stadium: st, ct, sede };
    const sg = this.placeStadium(st, undefined);
    this.island(st, undefined, "stadium", undefined, sg.avoid);
    this.island(ct, undefined, "ct");
    this.island(sede, undefined, "sede");
    this.route(st, ct); this.route(st, sede);
    this.locker(st.x, st.z + (sg.outer[1] + 40) / U);
    this.training(ct.x, ct.z);
    this.academy(ct.x - 26, ct.z + 4);
    this.medical(ct.x + 26, ct.z + 4);
    this.office(sede.x, sede.z);
    this.press(sede.x - 14, sede.z + 12);
    this.scouting(sede.x + 14, sede.z + 12);
  }

  // ------------------------------------------------------------ estádio
  private placeStadium(c: THREE.Vector3, osm: GeoOsm | undefined) {
    const o = this.o;
    const bowl = osm?.bowl ?? null;
    const model: StadiumModel = applyCustom(findModel(o.clubId ?? "", o.stadiumName) ?? genericModel(o.colors, Math.max(1, Math.min(5, o.stadiumLv)), bowl), o.stadiumCustom);
    const built = buildStadium(model, {
      q: this.q, night: o.night, matchDay: o.matchDay, colors: o.colors, stadiumLv: o.stadiumLv, tex: this.tex, mat: this.smat,
    });
    const fit = fitToBowl(built.outer, bowl);
    const g = built.group;
    g.scale.set(fit.sx / U, 1 / U, fit.sz / U);
    g.rotation.y = fit.rotY;
    g.position.set(c.x + fit.x / U, 0, c.z + fit.z / U);
    g.traverse((m) => { if ((m as THREE.Mesh).isMesh && m.castShadow === false && m.receiveShadow === false) m.receiveShadow = true; });
    // extras que crescem com o nível do estádio: estacionamento com carros e loja do clube
    const lv = Math.max(1, Math.min(5, o.stadiumLv));
    const [A, B] = built.outer;
    const pr = (model.plazaR ?? 20) + 8;
    if (lv >= 2 && this.q >= 2) {
      const lot = new THREE.Group();
      const asphalt = this.mesh(new THREE.PlaneGeometry(90, 40), this.smat({ color: 0x4a4d55, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), false, true);
      asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = 0.05;
      lot.add(asphalt);
      const r = rng(77 + lv);
      const cols = [o.colors[0], "#e8e8e8", "#3a6aa8", "#d9a400", "#222222", "#b03030", "#9aa0a6"];
      const n = 10 + lv * 8;
      const car = new THREE.BoxGeometry(4.3, 1.5, 1.9); car.translate(0, 0.75, 0);
      const im = new THREE.InstancedMesh(car, this.smat({ color: 0xffffff, roughness: 0.35, metalness: 0.5 }), n);
      const mm = new THREE.Matrix4(), cc = new THREE.Color();
      for (let i = 0; i < n; i++) {
        mm.makeTranslation(-40 + (i % 16) * 5.2, 0, -15 + Math.floor(i / 16) * 9 + r() * 0.3);
        im.setMatrixAt(i, mm); cc.set(cols[Math.floor(r() * cols.length)]); im.setColorAt(i, cc);
      }
      im.castShadow = true;
      lot.add(im);
      lot.position.set(-(A + pr + 20), 0, 0);
      lot.rotation.y = Math.PI / 2;
      g.add(lot);
    }
    if (lv >= 4) {
      const shop = new THREE.Group();
      shop.add(this.box(30, 9, 16, this.mat(0xf2f2f2)));
      shop.add(this.box(31, 2, 17, this.mat(o.colors[0]), 0, 9, 0));
      shop.position.set(A * 0.5, 0, B + pr + 12);
      g.add(shop);
    }
    this.tag(g, "stadium", built.topY / U + 3, 1);
    this.anchors.stadium!.set(g.position.x, built.topY / U + 3, g.position.z);
    const n = model.n, ra = A + pr, rb = B + pr;
    const cos = Math.cos(fit.rotY), sin = Math.sin(fit.rotY);
    // ponto (m, relativo à ilha) dentro da esplanada do estádio? (sem prédios nem árvores ali)
    const avoid = (x: number, z: number) => {
      const dx = x - fit.x, dz = z - fit.z;
      const lx = (dx * cos - dz * sin) / fit.sx, lz = (dx * sin + dz * cos) / fit.sz;
      return Math.abs(lx / ra) ** n + Math.abs(lz / rb) ** n < 1;
    };
    // contorno da esplanada (m, relativo à ilha): vira buraco no chão da ilha e muro de arrimo no desnível
    const ring: P2[] = [];
    for (let i = 0; i < 96; i++) {
      const [lx, lz] = superEllipse((i / 96) * Math.PI * 2, ra, rb, n);
      const X = lx * fit.sx, Z = lz * fit.sz;
      ring.push([fit.x + X * cos + Z * sin, fit.z - X * sin + Z * cos]);
    }
    this.stadiumRing = ring;
    if (model.terrain) this.slope = { k: model.terrain.slope, dir: model.terrain.dir, c: c.clone() };
    return { avoid, outer: [A * fit.sx, B * fit.sz] as [number, number], rotY: fit.rotY, x: fit.x, z: fit.z };
  }

  // ------------------------------------------------------------ entorno
  private island(c: THREE.Vector3, osm: GeoOsm | undefined, kind: HqSiteKind, skip?: Set<number>, avoid?: (x: number, z: number) => boolean) {
    const data = osm ?? this.fakeOsm(kind);
    const lod = buildCity(data, {
      q: this.q, night: this.o.night, tex: this.tex, mat: this.smat, radius: ISLAND_M, avoid, skip,
      hole: kind === "stadium" && this.slope ? this.stadiumRing ?? undefined : undefined,
      seed: Math.round(c.x * 31 + c.z * 17) + 5, farAt: 480,
    });
    lod.scale.setScalar(1 / U);
    lod.position.set(c.x, 0, c.z);
    // ilha do estádio inclinada pelo desnível real (o estádio fica nivelado, encaixado no terreno)
    if (kind === "stadium" && this.slope) {
      const d = (this.slope.dir * Math.PI) / 180, k = this.slope.k;
      lod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-k * Math.cos(d), 1, -k * Math.sin(d)).normalize());
      // muro de arrimo em volta da esplanada (o estádio fica nivelado, cortado no terreno)
      if (this.stadiumRing) {
        const pos: number[] = [], idx: number[] = [];
        const ring = this.stadiumRing;
        ring.forEach(([x, z], i) => {
          const h = (k * (x * Math.cos(d) + z * Math.sin(d))) / U;
          pos.push(c.x + x / U, Math.min(0, h) - 0.15, c.z + z / U, c.x + x / U, Math.max(0, h) + 0.02, c.z + z / U);
          const j = (i + 1) % ring.length;
          idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
        });
        const wg = new THREE.BufferGeometry();
        wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        wg.setIndex(idx); wg.computeVertexNormals();
        this.scene.add(this.mesh(wg, this.smat({ color: 0xbdb7ab, roughness: 0.95, side: THREE.DoubleSide }), true, true));
      }
    }
    this.scene.add(lod);
  }

  /** Bairro procedural (sem dados do OSM): grade de ruas, quadras com casas e prédios. */
  private fakeOsm(kind: HqSiteKind): GeoOsm {
    const r = this.rnd;
    const roads: [number, number[]][] = [];
    const step = 110;
    for (let k = -5; k <= 5; k++) {
      const cls = k === 0 ? 3 : Math.abs(k) === 3 ? 2 : 1;
      roads.push([cls, [-620, k * step, 620, k * step]]);
      roads.push([cls, [k * step, -620, k * step, 620]]);
    }
    const keep = kind === "stadium" ? 200 : kind === "ct" ? 180 : 60;
    const buildings: [number, number[]][] = [];
    for (let bx = -5; bx < 5; bx++) for (let bz = -5; bz < 5; bz++) {
      const x0 = bx * step + 12, z0 = bz * step + 12;
      for (let i = 0; i < 6; i++) {
        const w = 14 + r() * 26, d = 14 + r() * 26;
        const x = x0 + r() * (step - 24 - w), z = z0 + r() * (step - 24 - d);
        if (Math.hypot(x + w / 2, z + d / 2) < keep) continue;
        buildings.push([r() < 0.15 ? 20 + r() * 40 : 0, [x, z, x + w, z, x + w, z + d, x, z + d]]);
      }
    }
    const green: [number, number[]][] = [[0, [step * 1.1, step * 1.1, step * 1.9, step * 1.1, step * 1.9, step * 1.9, step * 1.1, step * 1.9]]];
    return { roads, buildings, green };
  }

  private route(a0: THREE.Vector3, b0: THREE.Vector3) {
    // só o trecho entre as ilhas (dentro delas valem as ruas reais)
    const dir = b0.clone().sub(a0).normalize(), Rr = ISLAND_M / U;
    if (a0.distanceTo(b0) < 2 * Rr + 2) return;
    const a = a0.clone().addScaledVector(dir, Rr), b = b0.clone().addScaledVector(dir, -Rr);
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
      g.translate((p0.x + p1.x) / 2, 0.08, (p0.z + p1.z) / 2);
      geos.push(g);
    }
    this.scene.add(this.mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 }), false, false));
  }

  // ------------------------------------------------------------ prédios reais do clube (contorno do OSM)
  /** Extruda contornos reais (m, relativos ao centro c) como um prédio do clube clicável. */
  private realBuilding(c: THREE.Vector3, list: [number, number[]][], id: HqBuilding, roofColor: string, minH = 7) {
    const geos: THREE.BufferGeometry[] = [];
    let topH = 0;
    const cen: P2[] = [];
    for (const [h0, f] of list) {
      const p = pts(f);
      if (p.length < 3) continue;
      const h = Math.max(minH, h0 || 0) * (id === "office" ? 1 + (this.q - 1) * 0.08 : 1);
      topH = Math.max(topH, h);
      const shape = new THREE.Shape((area(p) > 0 ? p : [...p].reverse()).map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      geos.push(g);
      cen.push(centroid(p));
    }
    if (!geos.length) return null;
    const ctr = centroid(cen);
    const win = this.tex(128, 128, (x) => {
      x.fillStyle = "#f4f4f2"; x.fillRect(0, 0, 128, 128);
      for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 3; fx++) {
        x.fillStyle = this.o.night ? "#ffd98c" : "#3f5d7a"; x.fillRect(fx * 42 + 6, fy * 64 + 16, 30, 32);
        x.fillStyle = "rgba(255,255,255,0.25)"; x.fillRect(fx * 42 + 6, fy * 64 + 16, 9, 32);
      }
      x.fillStyle = this.o.colors[0]; x.fillRect(0, 0, 128, 6);
    }, true);
    if (win) win.repeat.set(1 / 6, 1 / 6);
    const m = this.mesh(mergeExtruded(geos)!, [
      this.smat({ color: roofColor, roughness: 0.7 }),
      this.smat({ color: 0xffffff, map: win ?? undefined, roughness: 0.6, emissive: this.o.night ? 0xffffff : 0x000000, emissiveMap: this.o.night ? win ?? undefined : undefined, emissiveIntensity: this.o.night ? 0.35 : 0 }),
    ]);
    m.scale.setScalar(1 / U);
    const g = new THREE.Group();
    g.position.set(c.x + ctr[0] / U, 0, c.z + ctr[1] / U);
    m.position.set(-ctr[0] / U, 0, -ctr[1] / U);
    g.add(m);
    this.tag(g, id, topH / U + 2, 1);
    return { g, top: topH / U, x: g.position.x, z: g.position.z };
  }

  /** CT: prédios e campos reais quando o OSM tem; senão, o CT procedural. */
  private ctSite(c: THREE.Vector3, osm: GeoOsm | undefined, noAcademy = false) {
    const blds = osm?.buildings ?? [];
    const club = (osm?.club ?? []).map((i) => blds[i]).filter(Boolean).sort((a, b) => Math.abs(area(pts(b[1]))) - Math.abs(area(pts(a[1]))));
    // campo real mais próximo do centro do CT para o treino
    const fields = (osm?.pitches ?? []).map((e) => (Array.isArray(e[1]) ? (e as [number, number[]]) : [0, e as number[]] as [number, number[]]))
      .filter(([s, f]) => s && Math.abs(area(pts(f))) > 2500)
      .map(([, f]) => minRect(pts(f)))
      .sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz));
    if (fields.length) {
      const f = fields[0];
      this.training(c.x + f.cx / U, c.z + f.cz / U, -f.ang, true);
    } else this.training(c.x, c.z);
    const roof = this.o.colors[0];
    const a = club[0] && !noAcademy ? this.realBuilding(c, [club[0]], "academy", roof) : null;
    if (!a && !noAcademy) this.academy(c.x - 26, c.z + 4);
    if (noAcademy && club[0]) this.realBuilding(c, [club[0]], "training", roof);
    const m = club[1] ? this.realBuilding(c, [club[1]], "medical", "#e9ecef") : null;
    if (!m) this.medical(c.x + 26, c.z + 4);
    // demais prédios do clube (sem menu próprio): fazem parte do CT
    if (club.length > 2) this.realBuilding(c, club.slice(2), "training", roof, 5);
  }

  /** CT da base (ex.: Cotia): prédios reais do clube como "Base"; senão, o prédio procedural. */
  private baseSite(c: THREE.Vector3, osm: GeoOsm | undefined) {
    const blds = osm?.buildings ?? [];
    const club = (osm?.club ?? []).map((i) => blds[i]).filter(Boolean).sort((a, b) => Math.abs(area(pts(b[1]))) - Math.abs(area(pts(a[1]))));
    const r = club.length ? this.realBuilding(c, club.slice(0, 6), "academy", this.o.colors[0], 6) : null;
    if (!r) this.academy(c.x, c.z);
  }

  /** Sede: o prédio real (contorno do OSM) com as cores do clube, imprensa e observação ao lado. */
  private sedeSite(c: THREE.Vector3, osm: GeoOsm | undefined) {
    const blds = osm?.buildings ?? [];
    const club = (osm?.club ?? []).map((i) => blds[i]).filter(Boolean).sort((a, b) => Math.abs(area(pts(b[1]))) - Math.abs(area(pts(a[1]))));
    const main = club.length ? this.realBuilding(c, club.slice(0, 4), "office", this.o.colors[0], 9) : null;
    if (!main) { this.office(c.x, c.z); this.press(c.x - 14, c.z + 12); this.scouting(c.x + 14, c.z + 12); return; }
    const [c1, c2] = this.o.colors;
    const flags = new THREE.Group();
    flags.position.set(main.x, 0, main.z + 3);
    this.flag(c1, -2, 2, 4.5, flags); this.flag(c2, 0, 2, 4.5, flags); this.flag("#2fa84f", 2, 2, 4.5, flags);
    this.scene.add(flags);
    this.press(main.x - 9, main.z + 9);
    this.scouting(main.x + 9, main.z + 9);
  }

  // ------------------------------------------------------------ prédios do clube
  /** Registra um prédio clicável. Os prédios procedurais (sem contorno real) saem em escala 0,6. */
  private tag(obj: THREE.Object3D, id: HqBuilding, anchorY: number, scale = 0.6) {
    obj.scale.multiplyScalar(scale);
    anchorY *= scale;
    if (id !== "stadium") { const y = this.slopeY(obj.position.x, obj.position.z); obj.position.y += y; anchorY += y; }
    obj.traverse((m) => { m.userData.hq = id; });
    this.pickables.push(obj);
    this.anchors[id] = new THREE.Vector3(obj.position.x, anchorY, obj.position.z);
    this.scene.add(obj);
  }

  private windows(cols: number, rows: number, base: string, glass = false) {
    const lit = this.o.night;
    const k = this.q >= 4 ? 16 : 8; // texturas mais nítidas em clubes estruturados
    const t = this.tex(cols * k, rows * k, (g) => {
      g.fillStyle = base; g.fillRect(0, 0, cols * k, rows * k);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const on = lit ? (x * 7 + y * 3) % 5 !== 0 : false;
        g.fillStyle = on ? "#ffe9a3" : glass ? "#5b8fc4" : "#2c4a6e";
        const p = glass ? 1 : k / 4;
        g.fillRect(x * k + p, y * k + p, k - 2 * p, k - 2 * p);
        if (this.q >= 4 && !on) { g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x * k + p, y * k + p, (k - 2 * p) / 3, k - 2 * p); }
      }
    });
    if (t && this.q <= 2) { t.magFilter = THREE.NearestFilter; }
    return t ?? undefined;
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

  /** CT: campos (procedurais, ou o campo real do OSM quando `real`), prédio, jogadores e cones. */
  private training(x: number, z: number, rot = 0, real = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const lv = Math.max(1, Math.min(5, this.o.trainLv));
    const n = 1 + Math.floor(lv * 0.8); // 1 a 5 campos
    const k = lv >= 4 ? 4 : 2;
    const tex = this.tex(32 * k, 20 * k, (x2) => {
      x2.scale(k, k);
      for (let i = 0; i < 6; i++) { x2.fillStyle = i % 2 ? "#3c8a2c" : "#479a35"; x2.fillRect(i * 32 / 6, 0, 32 / 6, 20); }
      x2.strokeStyle = "#e8ffe8"; x2.lineWidth = 0.6; x2.strokeRect(1.5, 1.5, 29, 17); x2.beginPath(); x2.moveTo(16, 1.5); x2.lineTo(16, 18.5); x2.stroke();
      x2.beginPath(); x2.arc(16, 10, 3, 0, Math.PI * 2); x2.stroke();
    });
    const pm = this.mat(0xffffff, { map: tex ?? undefined });
    const spots: [number, number][] = [[0, 0], [12, 0], [-12, 0], [0, -9], [12, -9]];
    for (let i = 0; i < n; i++) {
      const [px, pz] = spots[i];
      if (real && i > 0) break; // o campo real já está desenhado pelo entorno
      if (!real) {
        const p = this.mesh(new THREE.PlaneGeometry(10.5, 6.8), pm, false, true);
        p.rotation.x = -Math.PI / 2; p.position.set(px, 0.05, pz);
        g.add(p);
      }
      if (lv >= 2) for (const s of [-1, 1]) { // traves
        const gm = this.mat(0xffffff);
        g.add(this.box(0.08, 0.6, 1.6, gm, px + s * 5.05, 0, pz));
      }
    }
    // prédio do CT (ao lado do campo)
    const ctW = 6 + lv;
    const nReal = real ? 1 : n;
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
      const [px, pz] = spots[i % nReal];
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
    this.flyTo(to, id === "overview" ? this.overview.dist : id === "stadium" ? 58 : 36, then);
  }
  focusSite(k: HqSiteKind) {
    const p = this.siteCenter[k];
    if (p) this.flyTo(p.clone(), k === "stadium" ? 62 : 70);
  }
  private flyTo(to: THREE.Vector3, d1: number, then?: () => void) {
    this.idleSince = this.t + 4;
    this.fly = { t0: performance.now() / 1000, dur: this.o.reduced ? 0.001 : 1.1, from: this.target.clone(), to, d0: this.dist, d1, then };
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
        this.dist = Math.min(900, Math.max(14, this.drag.dist * (this.drag.pinch / Math.max(1, this.pinchDist()))));
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
    cv.addEventListener("wheel", (e) => { e.preventDefault(); this.dist = Math.min(900, Math.max(14, this.dist * (1 + Math.sign(e.deltaY) * 0.1))); if (!this.raf) this.loop(); }, { passive: false });
  }
  private pinchDist() {
    const [a, b] = [...this.ptrs.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  }

  private resize() {
    const w = this.o.host.clientWidth || 360, h = this.o.host.clientHeight || 300;
    // resolução cresce com a estrutura do clube
    const dpr = window.devicePixelRatio || 1;
    const pr = Math.min(dpr, [1.25, 1.5, 2, 2.25, 2.5][this.q - 1]);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    const cv = this.renderer.domElement;
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
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
      const k = Math.min(1, (now / 1000 - f.t0) / f.dur); // relógio de parede: chega no tempo certo mesmo com quadros lentos
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
      this.target.lerpVectors(f.from, f.to, e);
      this.dist = f.d0 + (f.d1 - f.d0) * e;
      if (k >= 1) { this.fly = null; f.then?.(); }
    } else if (!this.drag && !this.o.reduced && t - this.idleSince > 3) {
      this.yaw += (dt / 1000) * 0.05; // órbita lenta quando ninguém mexe
      // depois de um tempo parado, a câmera voa sozinha para o próximo local
      const ks = this.sites();
      if (ks.length > 1 && t - this.idleSince > 12) {
        this.tourI = (this.tourI + 1) % ks.length;
        this.focusSite(ks[this.tourI]);
        this.idleSince = this.t - 3.5;
      }
    }
    for (const m of this.movers) m(t, dt);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target);
    // sombra acompanha o que está na tela (mais nítida de perto)
    const half = Math.min(170, Math.max(28, this.dist * 0.8));
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 900; sc.updateProjectionMatrix(); }
    this.sun.position.copy(this.target).addScaledVector(this.sunDir, 320);
    this.sun.target.position.copy(this.target);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
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
      (Array.isArray(mm) ? mm : mm ? [mm] : []).forEach((x) => x.dispose());
    });
    for (const t of this.texCache) t.dispose();
    this.scene.environment?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
