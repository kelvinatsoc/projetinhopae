// Sede do clube em 3D. Estádio, CT, sede social e CT da base ficam nas posições relativas reais
// (Wikidata + OpenStreetMap, src/data/clubSites.json), com o entorno real do OSM: ruas com largura,
// faixas e tráfego animado, pedestres nas calçadas e esplanada, rios e piscinas com reflexo e ondas,
// árvores orgânicas instanciadas, nuvens e ciclo de iluminação (Dia, Tarde/Pôr do sol e Noite).
//
// A qualidade cresce com a Estrutura do clube, mas o nível 1 já usa PBR, sombras suaves (PCFSoft),
// antialiasing (SMAA + MSAA), texturas nítidas e DPR nativo.
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
export type HqTimeOfDay = "day" | "sunset" | "night";

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
  timeOfDay?: HqTimeOfDay;
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
const SKY_DAY = 0x8ec5f0, SKY_SUNSET = 0xd98a6c, SKY_NIGHT = 0x091026;

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
  const d2 = lim + 800 * (1 - Math.exp(-(d - lim) / 4000));
  return [(x / d) * d2, (z / d) * d2];
}

export class HqRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 1, 9000);
  private ray = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  private anchors: Partial<Record<HqBuilding, THREE.Vector3>> = {};
  private siteCenter: Partial<Record<HqSiteKind, THREE.Vector3>> = {};
  private movers: ((t: number, dt: number) => void)[] = [];
  private q: number;
  private rnd: () => number;
  private sun!: THREE.DirectionalLight;
  private sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
  private composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  private texCache: THREE.Texture[] = [];
  // câmera
  private yaw = -0.45;
  private pitch = 0.68;
  private dist = 80;
  private target = new THREE.Vector3();
  private fly: { t0: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; p0: number; p1: number; then?: () => void } | null = null;
  private overview = { target: new THREE.Vector3(), dist: 80 };
  private idleSince = 0;
  private tourI = 0;
  private stadiumRing: P2[] | null = null;
  private overlays: THREE.Object3D[] = [];
  private slope: { k: number; dir: number; c: THREE.Vector3 } | null = null;
  private slopeY(x: number, z: number): number {
    const s = this.slope;
    if (!s) return 0;
    const d = (s.dir * Math.PI) / 180;
    const raw = s.k * ((x - s.c.x) * Math.cos(d) + (z - s.c.z) * Math.sin(d));
    const r = Math.hypot(x - s.c.x, z - s.c.z), R = ISLAND_M / U;
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
    const tod = this.timeOfDay();
    this.renderer.toneMappingExposure = tod === "night" ? 1.08 : tod === "sunset" ? 0.96 : 0.96;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  private timeOfDay(): HqTimeOfDay {
    if (this.o.timeOfDay) return this.o.timeOfDay;
    return this.o.night ? "night" : "day";
  }

  /** Pós-processamento moderno: MSAA 4x + GTAO + UnrealBloom + OutputPass. */
  private post() {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth <= 768 || "ontouchstart" in window || (navigator && navigator.maxTouchPoints > 0);
    if (this.q <= 1 || (isMobile && this.q < 4)) {
      this.composer = undefined;
      return;
    }
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isMobile ? 1 : 2 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (!isMobile) {
      const ao = new GTAOPass(this.scene, this.camera, 1, 1);
      ao.updateGtaoMaterial({ radius: 2.0, distanceExponent: 1.4, thickness: 1.8, scale: 1.05, samples: this.q >= 4 ? 16 : 8 });
      ao.blendIntensity = 0.85;
      const render = ao.render.bind(ao);
      ao.render = (...args: Parameters<GTAOPass["render"]>) => {
        for (const s of this.overlays) s.visible = false;
        render(...args);
        for (const s of this.overlays) s.visible = true;
      };
      c.addPass(ao);
    }
    const tod = this.timeOfDay();
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      tod === "night" ? 0.82 : tod === "sunset" ? 0.22 : 0.14,
      0.45,
      tod === "night" ? 0.62 : 0.94
    );
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
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, alphaTest: 0.5, depthWrite: true }));
        sp.scale.set(size, size * 1.1, 1);
        sp.position.set(p.x, p.y + dy, p.z);
        this.overlays.push(sp);
        this.scene.add(sp);
      };
      mk(this.anchors.stadium, 2.8, 1.8);
      mk(this.anchors.office, 2.4, 0.7);
      mk(this.anchors.training, 2.4, 0.7);
      mk(this.anchors.academy, 2.2, 0.6);
    };
    img.src = url;
  }

  /** Locais disponíveis (para os botões de atalho da interface). */
  sites(): HqSiteKind[] { return Object.keys(this.siteCenter) as HqSiteKind[]; }

  // ------------------------------------------------------------ materiais e texturas (sem NearestFilter, resolução total)
  private tex: TexFactory = (w, h, draw, repeat = false) => {
    const c = document.createElement("canvas");
    const W = Math.max(16, Math.round(w)), H = Math.max(16, Math.round(h));
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    if (!g) return null;
    draw(g);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    this.texCache.push(t);
    return t;
  };
  private smat = (p: THREE.MeshStandardMaterialParameters): THREE.Material => {
    const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as THREE.MeshStandardMaterialParameters;
    return new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.05, ...clean });
  };
  private mat(color: THREE.ColorRepresentation, extra: Record<string, unknown> = {}): THREE.Material {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.06, ...extra });
  }
  private mesh(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true, receive = true) {
    const me = this.meshRaw(geo, m, cast, receive);
    return me;
  }
  private meshRaw(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true, receive = true) {
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

  // ------------------------------------------------------------ cena, céu, nuvens e iluminação
  private build() {
    const { o, scene } = this;
    const tod = this.timeOfDay();
    const night = tod === "night";
    const sunset = tod === "sunset";
    const fogCol = night ? SKY_NIGHT : sunset ? SKY_SUNSET : SKY_DAY;
    scene.background = new THREE.Color(fogCol);
    scene.fog = new THREE.Fog(fogCol, 340, 1600);

    const polar = night ? 100 : sunset ? 78 : 52;
    const azim = sunset ? 245 : 128;
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(polar), THREE.MathUtils.degToRad(azim));
    this.sunDir = sunDir.clone();
    const pm = new THREE.PMREMGenerator(this.renderer);
    if (!night) {
      const sky = new Sky();
      sky.scale.setScalar(4500);
      const u = sky.material.uniforms;
      u.turbidity.value = sunset ? 8.2 : 3.8;
      u.rayleigh.value = sunset ? 2.5 : 1.25;
      u.mieCoefficient.value = sunset ? 0.007 : 0.004;
      u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(sunDir);
      scene.add(sky);
      const envScene = new THREE.Scene();
      const sky2 = new Sky(); sky2.scale.setScalar(4500);
      for (const k of Object.keys(u)) (sky2.material.uniforms[k].value as unknown) = u[k].value;
      envScene.add(sky2);
      const gnd = new THREE.Mesh(new THREE.CircleGeometry(4000, 16), new THREE.MeshBasicMaterial({ color: sunset ? 0x5c4a3e : 0x566352 }));
      gnd.rotation.x = -Math.PI / 2; gnd.position.y = -10; envScene.add(gnd);
      scene.environment = pm.fromScene(envScene, 0).texture;
      scene.environmentIntensity = sunset ? 0.14 : 0.11;
      scene.background = null;
    } else {
      const sky = new THREE.SphereGeometry(4000, 24, 12);
      const sc: number[] = [];
      const top = new THREE.Color(0x040714), hor = new THREE.Color(0x132247);
      const sp = sky.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sp.count; i++) { const k = Math.max(0, sp.getY(i) / 4000); const c = hor.clone().lerp(top, Math.pow(k, 0.55)); sc.push(c.r, c.g, c.b); }
      sky.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
      scene.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.14;
    }
    pm.dispose();

    // Camada de nuvens suaves no céu alto (excluídas do GTAO)
    this.clouds(tod);

    scene.add(new THREE.HemisphereLight(
      night ? 0x5a72b8 : sunset ? 0xffb88c : 0xcfe3ff,
      night ? 0x141c2b : sunset ? 0x4a3b32 : 0x5c6b50,
      night ? 0.42 : sunset ? 0.38 : 0.34
    ));
    const sun = new THREE.DirectionalLight(
      night ? 0xa8c0ff : sunset ? 0xffa96b : 0xfff0d6,
      night ? 0.58 : sunset ? 2.15 : 2.4
    );
    sun.castShadow = true;
    const sz = this.q >= 4 ? 4096 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 2.5;
    this.sun = sun;
    scene.add(sun, sun.target);
    if (night || sunset) {
      const fl = new THREE.PointLight(0xfff2d0, night ? 3.2 : 1.2, 160, 1.2);
      this.movers.push(() => { const s = this.siteCenter.stadium; if (s) fl.position.set(s.x, 10, s.z); });
      scene.add(fl);
    }

    const geo = o.geo && o.geo.sites.stadium ? o.geo : null;
    if (geo) this.buildGeo(geo); else this.buildCompact();
    this.terrain();

    // visão geral: enquadra todos os locais mantendo os modelos completos (near LOD) visíveis
    const pts3 = Object.values(this.siteCenter) as THREE.Vector3[];
    const c = pts3.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts3.length));
    const spread = pts3.reduce((m, p) => Math.max(m, p.distanceTo(c)), 0);
    this.overview = { target: c, dist: Math.max(95, spread * 2.45 + 60) };
    this.target.copy(c);
    this.dist = this.overview.dist;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.overview.dist * 1.55;
    fog.far = this.overview.dist * 5.2 + 650;
  }

  /** Nuvens volumétricas estilizadas derivando suavemente no céu alto. */
  private clouds(tod: HqTimeOfDay) {
    const cloudGroup = new THREE.Group();
    const puff = new THREE.SphereGeometry(1, 10, 8);
    const puffs: [number, number, number, number, number, number][] = [
      [0, 0, 0, 22, 7.5, 15],
      [-15, -1, 4, 15, 6, 12],
      [16, -1, -3, 16, 6.5, 13],
      [5, 3, 4, 13, 6.5, 11],
      [-7, 2.5, -4, 12, 6, 10],
    ];
    const singleCloud = mergeGeometries(puffs.map(([x, y, z, sx, sy, sz]) => {
      const g = puff.clone();
      g.scale(sx, sy, sz);
      g.translate(x, y, z);
      return g;
    }));
    singleCloud.computeVertexNormals();
    const count = 24;
    const col = tod === "night" ? 0x24345a : tod === "sunset" ? 0xffcfb3 : 0xf8fbff;
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: tod === "night" ? 0.35 : 0.72,
      fog: false,
      depthWrite: false,
    });
    const im = new THREE.InstancedMesh(singleCloud, mat, count);
    const r = rng(109);
    const bases: { x: number; y: number; z: number; s: number; rot: number; spd: number }[] = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + r() * 0.3;
      const dist = 420 + r() * 750;
      bases.push({
        x: Math.cos(ang) * dist,
        y: 260 + r() * 80,
        z: Math.sin(ang) * dist,
        s: 0.75 + r() * 0.85,
        rot: r() * Math.PI * 2,
        spd: 1.1 + r() * 1.3,
      });
    }
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const update = (t: number) => {
      for (let i = 0; i < count; i++) {
        const b = bases[i];
        const x = (((b.x + t * b.spd + 1200) % 2400) + 2400) % 2400 - 1200;
        qq.setFromAxisAngle(up, b.rot);
        pp.set(x, b.y, b.z);
        ss.set(b.s, b.s * 0.55, b.s);
        mm.compose(pp, qq, ss);
        im.setMatrixAt(i, mm);
      }
      im.instanceMatrix.needsUpdate = true;
    };
    update(0);
    this.movers.push(update);
    cloudGroup.add(im);
    this.overlays.push(cloudGroup);
    this.scene.add(cloudGroup);
  }

  /** Relevo suave ao redor das ilhas urbanas, com textura detalhada de vegetação e colinas. */
  private terrain() {
    const S = 3000, seg = this.q >= 3 ? 220 : 160;
    const g = new THREE.PlaneGeometry(S, S, seg, seg);
    g.rotateX(-Math.PI / 2);
    const nz = noise2(Math.round((this.o.geo?.sites.stadium?.lon ?? 3) * 100));
    const pos = g.attributes.position as THREE.BufferAttribute;
    const centers = Object.values(this.siteCenter) as THREE.Vector3[];
    const R = ISLAND_M / U;
    const col: number[] = [];
    const city = new THREE.Color(0x989f94), grass = new THREE.Color(0x4c7d3b), lush = new THREE.Color(0x3a692d), wood = new THREE.Color(0x2b5422);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let d = Infinity;
      for (const p of centers) d = Math.min(d, Math.hypot(x - p.x, z - p.z));
      const n = nz(x / 90, z / 90) * 0.7 + nz(x / 28 + 7, z / 28) * 0.3;
      const k = Math.min(1, Math.max(0, (d - R - 4) / 60));
      let sy = this.slopeY(x, z);
      if (this.slope && this.stadiumRing) {
        const r = Math.hypot(x - this.slope.c.x, z - this.slope.c.z);
        const f = Math.min(1, Math.max(0, (r - 24) / 10));
        sy = Math.min(sy, sy * f) - (1 - f) * 0.6;
      }
      pos.setY(i, (n - 0.35) * 26 * k * k - 0.3 + sy);
      const u = Math.min(1, Math.max(0, (d - R + 10) / 65));
      c.copy(city).lerp(n > 0.62 ? wood : n < 0.38 ? lush : grass, u);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const terrainTex = this.tex(128, 128, (x) => {
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, 128, 128);
      const rr = rng(33);
      for (let i = 0; i < 2000; i++) {
        const v = 232 + Math.floor(rr() * 23);
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(rr() * 128, rr() * 128, 2, 2);
      }
    }, true);
    if (terrainTex) terrainTex.repeat.set(90, 90);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 90, uv.getY(i) * 90);
    const m = this.mesh(g, this.smat({ vertexColors: true, map: terrainTex ?? undefined, roughness: 0.94 }), false, true);
    this.scene.add(m);
  }

  /** Layout com geografia real. */
  private buildGeo(geo: ClubGeo) {
    const isSPFC = this.o.clubId === "sao-paulo";
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
    if (ct && ct.distanceTo(st) < 2 * ISLAND_M / U - 8) ct = ct.distanceTo(st) < 30 ? null : ct;
    if (sede && sede.distanceTo(st) < 30) sede = null;
    if (ct && sede && ct.distanceTo(sede) < 30) sede = null;

    const islands: [HqSiteKind, THREE.Vector3][] = [["stadium", st]];
    if (ct) islands.push(["ct", ct]);
    if (sede) islands.push(["sede", sede]);
    if (base && base.distanceTo(st) > 30 && (!ct || base.distanceTo(ct) > 30)) islands.push(["base", base]);
    for (let i = 1; i < islands.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = islands[j][1], b = islands[i][1];
        const d = a.distanceTo(b), min = (2 * ISLAND_M) / U + 6;
        if (d < min) { const dir = b.clone().sub(a).normalize(); if (!isFinite(dir.x)) dir.set(1, 0, 0); b.copy(a).addScaledVector(dir, min); }
      }
    }
    const stadiumGeo = this.placeStadium(st, geo.osm?.stadium);
    const free = (dx: number, dz: number) => {
      const s = stadiumGeo;
      const c = Math.cos(s.rotY), si = Math.sin(s.rotY);
      return new THREE.Vector3(st.x + (s.x + dx * c + dz * si) / U, 0, st.z + (s.z - dx * si + dz * c) / U);
    };
    const socialCenter = free(-(stadiumGeo.outer[0] + 108), 16);
    // Para o São Paulo FC, reserva também a área do Complexo Social do Morumbi (piscinas + ginásio + sede)
    const stAvoid = isSPFC
      ? (x: number, z: number) =>
          stadiumGeo.avoid(x, z) ||
          Math.hypot(x - (socialCenter.x - st.x) * U, z - (socialCenter.z - st.z) * U) < 115
      : stadiumGeo.avoid;

    for (const [k, p] of islands) {
      this.siteCenter[k] = p.clone();
      const osm = geo.osm?.[k];
      const skip = new Set<number>(k === "stadium" ? (isSPFC ? [1, 21] : []) : osm?.club ?? []);
      const islAvoid = k === "stadium"
        ? stAvoid
        : k === "base" && isSPFC
          ? (x: number, z: number) => Math.hypot(x + 35, z - 85) < 95
          : undefined;
      this.island(p, osm, k, skip, islAvoid);
    }
    for (const [k, p] of islands) if (k !== "stadium") this.route(st, p);

    const lockerAt = free(0, stadiumGeo.outer[1] + 40);
    this.locker(lockerAt.x, lockerAt.z);

    const hasBase = islands.some(([k]) => k === "base");
    if (hasBase) this.baseSite(this.siteCenter.base!, geo.osm?.base);
    if (ct) {
      this.ctSite(ct, geo.osm?.ct, hasBase);
    } else {
      const c2 = new THREE.Vector3(st.x + 140, 0, st.z + 40);
      for (const [, p] of islands) if (p.distanceTo(c2) < (2 * ISLAND_M) / U) c2.x += 60;
      this.siteCenter.ct = c2;
      this.island(c2, undefined, "ct");
      this.route(st, c2);
      this.training(c2.x, c2.z);
      this.academy(c2.x - 26, c2.z + 4);
      this.medical(c2.x + 26, c2.z + 4);
    }
    if (isSPFC) {
      // Complexo Social do Morumbi anexo ao estádio (piscinas sociais/olímpicas, ginásio, quadras e sede administrativa)
      this.spfcSocialComplex(socialCenter);
    } else if (sede) {
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

  // ------------------------------------------------------------ estádio e esplanada viva
  private placeStadium(c: THREE.Vector3, osm: GeoOsm | undefined) {
    const o = this.o;
    const bowl = osm?.bowl ?? null;
    const model: StadiumModel = applyCustom(findModel(o.clubId ?? "", o.stadiumName) ?? genericModel(o.colors, Math.max(1, Math.min(5, o.stadiumLv)), bowl), o.stadiumCustom);
    const built = buildStadium(model, {
      q: Math.max(3, this.q), night: this.timeOfDay() === "night", matchDay: o.matchDay, colors: o.colors, stadiumLv: o.stadiumLv, tex: this.tex, mat: this.smat,
    });
    const fit = fitToBowl(built.outer, bowl);
    const g = built.group;
    g.scale.set(fit.sx / U, 1 / U, fit.sz / U);
    g.rotation.y = fit.rotY;
    g.position.set(c.x + fit.x / U, 0, c.z + fit.z / U);
    g.traverse((m) => { if ((m as THREE.Mesh).isMesh && m.castShadow === false && m.receiveShadow === false) m.receiveShadow = true; });
    const lv = Math.max(1, Math.min(5, o.stadiumLv));
    const [A, B] = built.outer;
    const pr = (model.plazaR ?? 20) + 8;

    // Estacionamento moderno com carros detalhados e ônibus da delegação
    const lot = new THREE.Group();
    const asphalt = this.mesh(new THREE.PlaneGeometry(88, 38), this.smat({ color: 0x2d3138, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), false, true);
    asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = 0.08;
    lot.add(asphalt);
    const r = rng(77 + lv);
    const cols = [o.colors[0], "#f8fafc", "#1e293b", "#dc2626", "#3b82f6", "#eab308", "#94a3b8"];
    const nCars = 14 + lv * 6;
    const body = new THREE.BoxGeometry(4.2, 0.8, 1.85); body.translate(0, 0.55, 0);
    const cab = new THREE.BoxGeometry(2.2, 0.6, 1.6); cab.translate(-0.2, 1.15, 0);
    const carGeo = mergeGeometries([body, cab]);
    const im = new THREE.InstancedMesh(carGeo, this.smat({ color: 0xffffff, roughness: 0.25, metalness: 0.6 }), nCars);
    const mm = new THREE.Matrix4(), cc = new THREE.Color();
    for (let i = 0; i < nCars; i++) {
      mm.makeTranslation(-38 + (i % 14) * 5.4, 0, -13 + Math.floor(i / 14) * 9.5 + r() * 0.25);
      im.setMatrixAt(i, mm); cc.set(cols[Math.floor(r() * cols.length)]); im.setColorAt(i, cc);
    }
    im.castShadow = true;
    lot.add(im);
    lot.position.set(-(A + pr + 18), 0, 0);
    lot.rotation.y = Math.PI / 2;
    g.add(lot);

    // Torcedores/pedestres animados passeando na esplanada ao redor do estádio
    const fanCount = o.matchDay ? 95 : 45;
    const fTorso = new THREE.CapsuleGeometry(0.35, 0.85, 4, 8); fTorso.translate(0, 0.85, 0);
    const fHead = new THREE.SphereGeometry(0.28, 8, 6); fHead.translate(0, 1.65, 0);
    const fanGeo = mergeGeometries([fTorso, fHead]);
    const fanMesh = new THREE.InstancedMesh(fanGeo, this.smat({ color: 0xffffff, roughness: 0.65 }), fanCount);
    fanMesh.castShadow = true;
    const fanColors = [o.colors[0], o.colors[1], "#e4002b", "#ffffff", "#18181b", "#facc15"];
    const fCol = new THREE.Color();
    interface PlazaFan { ang0: number; rad: number; spd: number; phase: number }
    const plazaFans: PlazaFan[] = [];
    for (let i = 0; i < fanCount; i++) {
      plazaFans.push({
        ang0: (i / fanCount) * Math.PI * 2 + r() * 0.2,
        rad: 0.25 + r() * 0.68,
        spd: (r() < 0.5 ? 1 : -1) * (0.015 + r() * 0.025),
        phase: r() * 6.28,
      });
      fCol.set(fanColors[Math.floor(r() * fanColors.length)]);
      fanMesh.setColorAt(i, fCol);
    }
    const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fp = new THREE.Vector3(), fs = new THREE.Vector3(1.15, 1.15, 1.15);
    const upY = new THREE.Vector3(0, 1, 0);
    const updateFans = (t: number) => {
      for (let i = 0; i < plazaFans.length; i++) {
        const pf = plazaFans[i];
        const ang = pf.ang0 + t * pf.spd;
        const d = (model.plazaR ?? 20) * pf.rad;
        const [px, pz] = superEllipse(ang, A + d, B + d, model.n);
        const bob = Math.abs(Math.sin(t * 7.5 + pf.phase)) * 0.16;
        fq.setFromAxisAngle(upY, -ang + (pf.spd > 0 ? Math.PI / 2 : -Math.PI / 2));
        fp.set(px, 0.25 + bob, pz);
        fm.compose(fp, fq, fs);
        fanMesh.setMatrixAt(i, fm);
      }
      fanMesh.instanceMatrix.needsUpdate = true;
    };
    updateFans(0);
    this.movers.push(updateFans);
    g.add(fanMesh);

    if (lv >= 3) {
      const shop = new THREE.Group();
      shop.add(this.box(28, 8.5, 15, this.mat(0xf4f4f6)));
      shop.add(this.box(29, 2.2, 16, this.mat(o.colors[0]), 0, 8.5, 0));
      shop.position.set(A * 0.48, 0, B + pr + 10);
      g.add(shop);
    }
    this.tag(g, "stadium", built.topY / U + 3, 1);
    this.anchors.stadium!.set(g.position.x, built.topY / U + 3, g.position.z);
    const n = model.n, ra = A + pr, rb = B + pr;
    const cos = Math.cos(fit.rotY), sin = Math.sin(fit.rotY);
    const avoid = (x: number, z: number) => {
      const dx = x - fit.x, dz = z - fit.z;
      const lx = (dx * cos - dz * sin) / fit.sx, lz = (dx * sin + dz * cos) / fit.sz;
      return Math.abs(lx / ra) ** n + Math.abs(lz / rb) ** n < 1;
    };
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

  /**
   * Vitrine São Paulo FC — Complexo Social do Morumbi anexo ao estádio:
   * parque aquático com piscinas olímpica e sociais azuis, ginásio poliesportivo coberto,
   * quadras, sede administrativa tricolor com escudo e bandeiras, imprensa e observação.
   */
  private spfcSocialComplex(sc: THREE.Vector3) {
    const sx = sc.x, sz = sc.z;
    this.siteCenter.sede = new THREE.Vector3(sx, 0, sz);

    // Terraço e jardins do clube social alinhados à inclinação da encosta do Morumbi
    const park = new THREE.Group();
    park.position.set(sx, this.slopeY(sx, sz) + 0.15, sz);
    if (this.slope) {
      const d = (this.slope.dir * Math.PI) / 180, k = this.slope.k;
      park.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-k * Math.cos(d), 1, -k * Math.sin(d)).normalize());
    }
    park.add(this.box(21, 0.45, 19, this.mat(0x3a7d32), 0, -0.1, 0));
    park.add(this.box(21.4, 0.25, 19.4, this.mat(0xd4cfc4), 0, -0.25, 0));

    // Deck de pedra clara do parque aquático + Piscina Olímpica (50m) + Piscina Social circular
    park.add(this.box(11.5, 0.16, 8.2, this.mat(0xe6dfd1), 2.8, 0.45, -2.4));

    const poolMat = this.smat({ color: 0x0ea5e9, roughness: 0.08, metalness: 0.25, emissive: this.timeOfDay() === "night" ? 0x0b486b : 0x022c43 });
    park.add(this.box(5.8, 0.14, 3.1, this.mat(0xffffff), 0.8, 0.54, -2.5));
    park.add(this.box(5.4, 0.16, 2.7, poolMat, 0.8, 0.56, -2.5));

    const poolRim = this.mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.14, 28), this.mat(0xffffff));
    poolRim.position.set(6.0, 0.61, -2.2);
    park.add(poolRim);
    const recPool = this.mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.16, 28), poolMat);
    recPool.position.set(6.0, 0.62, -2.2);
    park.add(recPool);

    // Quadra poliesportiva externa ao lado das piscinas
    park.add(this.box(4.6, 0.12, 2.8, this.mat(0x2563eb), -2.8, 0.45, 3.8));
    park.add(this.box(4.2, 0.14, 2.4, this.mat(0xdc2626), -2.8, 0.46, 3.8));

    // Ginásio Poliesportivo coberto em arco com faixa tricolor
    const gym = new THREE.Group();
    gym.position.set(5.2, 0.45, 3.6);
    gym.add(this.box(4.8, 2.2, 6.4, this.mat(0xe4e0d8)));
    gym.add(this.box(5.0, 0.35, 6.6, this.mat("#e4002b"), 0, 2.2, 0));
    const roofVault = this.mesh(new THREE.CylinderGeometry(2.4, 2.4, 6.4, 16, 1, false, 0, Math.PI), this.smat({ color: 0xdadce0, roughness: 0.55, metalness: 0.18 }));
    roofVault.rotation.z = Math.PI / 2;
    roofVault.rotation.y = Math.PI / 2;
    roofVault.position.set(0, 2.35, 0);
    gym.add(roofVault);
    park.add(gym);
    this.scene.add(park);

    // Prédio principal da Sede Social do São Paulo FC (clicável como "office")
    const hq = new THREE.Group();
    hq.position.set(sx - 3.6, 0, sz - 1.5);
    const win = this.windows(10, 4, "#e8eaed", true);
    const facade = this.mat(0xffffff, { map: win, metalness: 0.3, roughness: 0.32, emissive: this.timeOfDay() === "night" ? 0xffe29a : 0x000000, emissiveMap: this.timeOfDay() === "night" ? win : undefined, emissiveIntensity: this.timeOfDay() === "night" ? 0.55 : 0 });
    hq.add(this.box(7.2, 4.2, 3.6, facade));
    // Frisos tricolores no topo da Sede Social
    hq.add(this.box(7.5, 0.32, 3.9, this.mat("#e4002b"), 0, 4.2, 0));
    hq.add(this.box(7.5, 0.22, 3.9, this.mat("#ffffff"), 0, 4.52, 0));
    hq.add(this.box(7.5, 0.32, 3.9, this.mat("#141414"), 0, 4.74, 0));
    // Marquise de entrada
    hq.add(this.box(2.8, 0.25, 1.4, this.mat("#e4002b"), 0, 1.4, 2.2));
    // Mastros com bandeiras vermelha, branca e preta
    this.flag("#e4002b", -2.6, 3.2, 4.2, hq);
    this.flag("#ffffff", 0, 3.2, 4.2, hq);
    this.flag("#141414", 2.6, 3.2, 4.2, hq);
    this.tag(hq, "office", 6.2, 1);

    // Centro de Imprensa e Departamento de Observação integrados ao complexo
    this.press(sx - 6.8, sz + 4.8);
    this.scouting(sx - 0.5, sz + 5.4);
  }

  // ------------------------------------------------------------ entorno
  private island(c: THREE.Vector3, osm: GeoOsm | undefined, kind: HqSiteKind, skip?: Set<number>, avoid?: (x: number, z: number) => boolean) {
    const data = osm ?? this.fakeOsm(kind);
    const lod = buildCity(data, {
      q: Math.max(3, this.q), night: this.timeOfDay() === "night", tex: this.tex, mat: this.smat, radius: ISLAND_M, avoid, skip,
      hole: kind === "stadium" && this.slope ? this.stadiumRing ?? undefined : undefined,
      seed: Math.round(c.x * 31 + c.z * 17) + 5, farAt: 1200,
      movers: this.movers, clubColors: this.o.colors,
    });
    lod.scale.setScalar(1 / U);
    lod.position.set(c.x, 0, c.z);
    if (kind === "stadium" && this.slope) {
      const d = (this.slope.dir * Math.PI) / 180, k = this.slope.k;
      lod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-k * Math.cos(d), 1, -k * Math.sin(d)).normalize());
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
        this.scene.add(this.mesh(wg, this.smat({ color: 0xbdb7ab, roughness: 0.9, side: THREE.DoubleSide }), true, true));
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
    this.scene.add(this.mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: 0xc8f43c, transparent: true, opacity: 0.78 }), false, false));
  }

  // ------------------------------------------------------------ prédios reais do clube (contorno do OSM)
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
      const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.2, bevelSegments: 1, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      geos.push(g);
      cen.push(centroid(p));
    }
    if (!geos.length) return null;
    const ctr = centroid(cen);
    const night = this.timeOfDay() === "night";
    const win = this.tex(128, 128, (x) => {
      x.fillStyle = "#f4f4f2"; x.fillRect(0, 0, 128, 128);
      for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 3; fx++) {
        x.fillStyle = night ? "#ffd98c" : "#3a5570"; x.fillRect(fx * 42 + 6, fy * 64 + 16, 30, 32);
        x.fillStyle = "rgba(255,255,255,0.28)"; x.fillRect(fx * 42 + 6, fy * 64 + 16, 9, 32);
      }
      x.fillStyle = this.o.colors[0].toLowerCase() === "#ffffff" ? "#e4002b" : this.o.colors[0];
      x.fillRect(0, 0, 128, 8);
    }, true);
    if (win) win.repeat.set(1 / 6, 1 / 6);
    const roofHex = roofColor.toLowerCase() === "#ffffff" ? "#e4002b" : roofColor;
    const m = this.mesh(mergeExtruded(geos)!, [
      this.smat({ color: roofHex, roughness: 0.6 }),
      this.smat({ color: 0xffffff, map: win ?? undefined, roughness: 0.5, metalness: 0.15, emissive: night ? 0xffffff : 0x000000, emissiveMap: night ? win ?? undefined : undefined, emissiveIntensity: night ? 0.45 : 0 }),
    ]);
    m.scale.setScalar(1 / U);
    const g = new THREE.Group();
    g.position.set(c.x + ctr[0] / U, 0, c.z + ctr[1] / U);
    m.position.set(-ctr[0] / U, 0, -ctr[1] / U);
    g.add(m);
    this.tag(g, id, topH / U + 2, 1);
    return { g, top: topH / U, x: g.position.x, z: g.position.z };
  }

  /** CT: prédios e campos reais quando o OSM tem (ex.: CT da Barra Funda ao lado do Rio Tietê). */
  private ctSite(c: THREE.Vector3, osm: GeoOsm | undefined, noAcademy = false) {
    const blds = osm?.buildings ?? [];
    const club = (osm?.club ?? []).map((i) => blds[i]).filter(Boolean).sort((a, b) => Math.abs(area(pts(b[1]))) - Math.abs(area(pts(a[1]))));
    const fields = (osm?.pitches ?? []).map((e) => (Array.isArray(e[1]) ? (e as [number, number[]]) : [0, e as number[]] as [number, number[]]))
      .filter(([s, f]) => s && Math.abs(area(pts(f))) > 2500)
      .map(([, f]) => minRect(pts(f)))
      .sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz));
    if (fields.length) {
      const f = fields[0];
      this.training(c.x + f.cx / U, c.z + f.cz / U, -f.ang, true);
    } else this.training(c.x, c.z);
    const roof = this.o.colors[0].toLowerCase() === "#ffffff" ? "#e4002b" : this.o.colors[0];
    const a = club[0] && !noAcademy ? this.realBuilding(c, [club[0]], "academy", roof) : null;
    if (!a && !noAcademy) this.academy(c.x - 26, c.z + 4);
    if (noAcademy && club[0]) this.realBuilding(c, [club[0]], "training", roof, 9);
    const m = club[1] ? this.realBuilding(c, [club[1]], "medical", "#e9ecef", 8) : null;
    if (!m) this.medical(c.x + 26, c.z + 4);
    if (club.length > 2) this.realBuilding(c, club.slice(2), "training", roof, 6);
    // Bandeiras tricolores na entrada do CT
    const flags = new THREE.Group();
    flags.position.set(c.x, 0, c.z + 5);
    this.flag(roof, -2.2, 0, 4.2, flags);
    this.flag(this.o.colors[1], 0, 0, 4.2, flags);
    this.flag("#141414", 2.2, 0, 4.2, flags);
    this.scene.add(flags);
  }

  /** CT da base (ex.: CFA Laudo Natel em Cotia): complexo de formação com hotel/alojamento, mini-estádio, campos e mata. */
  private baseSite(c: THREE.Vector3, osm: GeoOsm | undefined) {
    if (this.o.clubId === "sao-paulo") {
      // CFA Presidente Laudo Natel (Cotia): edifício principal/alojamento, Estádio Marcelo Portugal Gouvêa e campo principal
      const g = new THREE.Group();
      g.position.set(c.x - 3.5, 0, c.z + 8.5);
      this.siteCenter.base = g.position.clone();
      const lawn = this.mesh(new THREE.PlaneGeometry(18, 16), this.smat({ color: 0x3b7d2f, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), false, true);
      lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.05;
      g.add(lawn);
      const win = this.windows(10, 3, "#e8eaed", true);
      const mainMat = this.mat(0xffffff, { map: win, roughness: 0.35 });
      // Ala principal do hotel/alojamento da base em Cotia
      g.add(this.box(10.5, 3.6, 3.2, mainMat, 0, 0, -3.6));
      g.add(this.box(10.9, 0.38, 3.6, this.mat("#e4002b"), 0, 3.6, -3.6));
      g.add(this.box(10.9, 0.22, 3.6, this.mat("#141414"), 0, 3.98, -3.6));
      // Ala lateral (refeitório, auditório e fisiologia)
      g.add(this.box(3.2, 3.0, 6.8, mainMat, -4.2, 0, 1.0));
      g.add(this.box(3.5, 0.32, 7.1, this.mat("#e4002b"), -4.2, 3.0, 1.0));
      // Arquibancada coberta do Estádio Marcelo Portugal Gouvêa (campo principal de Cotia)
      g.add(this.box(8.8, 2.2, 2.2, this.mat("#d4d0c8"), 1.6, 0, 0.4));
      g.add(this.box(9.2, 0.3, 2.9, this.mat("#e4002b"), 1.6, 2.2, 0.5));
      // Gramado do campo principal de Cotia em frente à arquibancada
      const pitch = this.mesh(new THREE.PlaneGeometry(10.2, 6.4), this.smat({ color: 0x38882b, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), false, true);
      pitch.rotation.x = -Math.PI / 2; pitch.position.set(1.6, 0.08, 4.9);
      g.add(pitch);
      this.flag("#e4002b", -2, -1.2, 4.2, g);
      this.flag("#ffffff", 0, -1.2, 4.2, g);
      this.flag("#141414", 2, -1.2, 4.2, g);
      this.tag(g, "academy", 5.5, 1);
      return;
    }
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
    const lit = this.timeOfDay() === "night";
    const k = 16;
    const t = this.tex(cols * k, rows * k, (g) => {
      g.fillStyle = base; g.fillRect(0, 0, cols * k, rows * k);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const on = lit ? (x * 7 + y * 3) % 5 !== 0 : false;
        g.fillStyle = on ? "#ffe9a3" : glass ? "#4a7eb0" : "#2c4a6e";
        const p = glass ? 1.5 : k / 4;
        g.fillRect(x * k + p, y * k + p, k - 2 * p, k - 2 * p);
        if (!on) { g.fillStyle = "rgba(255,255,255,0.28)"; g.fillRect(x * k + p, y * k + p, (k - 2 * p) / 3, k - 2 * p); }
      }
    });
    return t ?? undefined;
  }

  private flag(color: string, x: number, z: number, h: number, parent: THREE.Object3D) {
    parent.add(this.box(0.14, h, 0.14, this.mat(0xe2e8f0, { metalness: 0.5, roughness: 0.3 }), x, 0, z));
    const geo = new THREE.PlaneGeometry(1.6, 1, 10, 2);
    const flag = this.mesh(geo, this.mat(color, { side: THREE.DoubleSide, roughness: 0.6 }));
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
    const floors = 3 + Math.round(this.q / 1.5);
    const win = this.windows(6, floors * 2, "#9fb4c8", true);
    const facade = this.mat(0xffffff, { map: win, metalness: 0.4, roughness: 0.22 });
    const side = this.mat(0xd5dbe3);
    g.add(this.box(8, floors * 1.4, 6, [side, side, this.mat(0x8e95a3), this.mat(0x8e95a3), facade, facade]));
    g.add(this.box(8.4, 0.5, 6.4, this.mat(c1), 0, floors * 1.4, 0));
    g.add(this.box(2.4, 1.8, 0.5, this.mat(c2), 0, 0, 3.1));
    this.flag(c1, -3, 4.2, 4.5, g);
    this.flag(c2, -1.6, 4.2, 4.5, g);
    this.flag("#2fa84f", 2.4, 4.2, 4.5, g);
    const plaza = this.mesh(new THREE.CircleGeometry(4, 24), this.mat(c1), false, true);
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.08, 7);
    g.add(plaza);
    this.tag(g, "office", floors * 1.4 + 2.5);
  }

  /** CT: campos, prédio do Reffis/concentração, piscina de recuperação e jogadores animados treinando. */
  private training(x: number, z: number, rot = 0, real = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const lv = Math.max(1, Math.min(5, this.o.trainLv));
    const n = 1 + Math.floor(lv * 0.8);
    const k = 4;
    const tex = this.tex(32 * k, 20 * k, (x2) => {
      x2.scale(k, k);
      for (let i = 0; i < 8; i++) { x2.fillStyle = i % 2 ? "#358628" : "#429634"; x2.fillRect((i * 32) / 8, 0, 32 / 8, 20); }
      x2.strokeStyle = "#f0fff0"; x2.lineWidth = 0.55; x2.strokeRect(1.5, 1.5, 29, 17); x2.beginPath(); x2.moveTo(16, 1.5); x2.lineTo(16, 18.5); x2.stroke();
      x2.beginPath(); x2.arc(16, 10, 3, 0, Math.PI * 2); x2.stroke();
    });
    const pm = this.mat(0xffffff, { map: tex ?? undefined, roughness: 0.88 });
    const spots: [number, number][] = [[0, 0], [12, 0], [-12, 0], [0, -9], [12, -9]];
    for (let i = 0; i < n; i++) {
      const [px, pz] = spots[i];
      if (real && i > 0) break;
      if (!real) {
        const p = this.mesh(new THREE.PlaneGeometry(10.5, 6.8), pm, false, true);
        p.rotation.x = -Math.PI / 2; p.position.set(px, 0.05, pz);
        g.add(p);
      }
      for (const s of [-1, 1]) {
        const gm = this.mat(0xffffff, { roughness: 0.35 });
        g.add(this.box(0.08, 0.6, 1.6, gm, px + s * 5.05, 0, pz));
      }
    }
    const ctW = 7 + lv;
    const nReal = real ? 1 : n;
    const win = this.windows(6 + lv, 2 + Math.ceil(lv / 2), "#e8ecf0", true);
    const fm = this.mat(0xffffff, { map: win, roughness: 0.35, metalness: 0.2 });
    const c1 = this.o.colors[0].toLowerCase() === "#ffffff" ? "#e4002b" : this.o.colors[0];
    g.add(this.box(ctW, (1.5 + Math.ceil(lv / 2)) * 1.3, 4.2, fm, 0, 0, 7.5));
    g.add(this.box(ctW + 0.4, 0.45, 4.6, this.mat(c1), 0, (1.5 + Math.ceil(lv / 2)) * 1.3, 7.5));
    // Piscina regenerativa / Reffis
    const pool = this.mesh(new THREE.PlaneGeometry(5.2, 2.8), new THREE.MeshStandardMaterial({ color: 0x22a6e0, roughness: 0.08, metalness: 0.35 }), false, true);
    pool.rotation.x = -Math.PI / 2; pool.position.set(ctW / 2 + 4, 0.1, 7.5);
    g.add(pool);
    // Jogadores suaves (cápsula + cabeça) treinando no gramado
    const kit = [this.mat(c1), this.mat(this.o.colors[1])];
    const skin = this.mat(0xc68e5e);
    const count = 8 + lv * 3;
    const torsoG = new THREE.CapsuleGeometry(0.18, 0.45, 4, 8); torsoG.translate(0, 0.48, 0);
    const headG = new THREE.SphereGeometry(0.16, 8, 6); headG.translate(0, 0.96, 0);
    for (let i = 0; i < count; i++) {
      const pl = new THREE.Group();
      pl.add(this.mesh(torsoG, kit[i % 2]), this.mesh(headG, skin));
      g.add(pl);
      const [px, pz] = spots[i % nReal];
      const r = 1.4 + (i % 4) * 0.65, ph = (i / count) * Math.PI * 2;
      this.movers.push((t) => {
        const a = ph + t * (0.85 + (i % 2) * 0.35);
        pl.position.set(px + Math.cos(a) * r, Math.abs(Math.sin(t * 9 + i)) * 0.12, pz + Math.sin(a) * r * 0.65);
        pl.rotation.y = -a;
      });
    }
    for (let i = 0; i < 4 + lv; i++) {
      const cone = this.mesh(new THREE.ConeGeometry(0.18, 0.4, 8), this.mat(0xff6a00));
      cone.position.set(-4 + i * 1.3, 0.2, -2.8);
      g.add(cone);
    }
    this.tag(g, "training", 4.5);
  }

  private locker(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const c1 = this.o.colors[0].toLowerCase() === "#ffffff" ? "#e4002b" : this.o.colors[0];
    g.add(this.box(6.5, 2.5, 3.8, this.mat(0xd8dde6, { roughness: 0.5 })));
    g.add(this.box(6.9, 0.42, 4.2, this.mat(c1), 0, 2.5, 0));
    g.add(this.box(1.4, 1.7, 0.2, this.mat(0x2d3540), 0, 0, 1.95));
    // Ônibus oficial do clube estacionado na porta do vestiário
    const bus = new THREE.Group();
    bus.position.set(5.2, 0, 0);
    bus.add(this.box(3.4, 1.15, 1.45, this.mat(c1, { roughness: 0.25, metalness: 0.4 })));
    bus.add(this.box(3.42, 0.38, 1.48, this.mat(0x1e293b, { roughness: 0.15, metalness: 0.7 }), 0, 0.62, 0));
    g.add(bus);
    this.tag(g, "locker", 4);
  }

  private academy(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const y = Math.max(1, Math.min(5, this.o.youthLv));
    const floors = 2 + y;
    const win = this.windows(5, floors, "#f0ece1", true);
    g.add(this.box(5.4, floors * 1.2, 4.6, this.mat(0xffffff, { map: win, roughness: 0.4 })));
    const c1 = this.o.colors[0].toLowerCase() === "#ffffff" ? "#e4002b" : this.o.colors[0];
    g.add(this.box(5.8, 0.42, 5.0, this.mat(c1), 0, floors * 1.2, 0));
    if (y >= 2) g.add(this.box(4.2, 2.4, 3.2, this.mat(0xf5f2e9, { map: this.windows(4, 2, "#f5f2e9") }), 0, 0, -5));
    const mini = this.mesh(new THREE.PlaneGeometry(5.8, 3.8), this.mat(0x3f8f33), false, true);
    mini.rotation.x = -Math.PI / 2; mini.position.set(0, 0.05, 5.2);
    g.add(mini);
    this.tag(g, "academy", floors * 1.2 + 2);
  }

  private medical(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const m = Math.max(1, Math.min(5, this.o.medicalLv));
    const top = 3.0 + (m >= 4 ? 1.2 : 0);
    g.add(this.box(5.4, top, 4.6, this.mat(0xf8fafc, { map: this.windows(5, m >= 4 ? 3 : 2, "#f8fafc", true), roughness: 0.35 })));
    if (m >= 2) g.add(this.box(3.6, 2.2, 3.4, this.mat(0xeef2f6), 4.2, 0, 0.5));
    const red = new THREE.MeshBasicMaterial({ color: 0xe53935 });
    g.add(this.box(1.6, 0.45, 0.12, red, 0, top - 1, 2.35));
    g.add(this.box(0.45, 1.6, 0.12, red, 0, top - 1.57, 2.35));
    const pad = this.mesh(new THREE.CircleGeometry(1.8, 24), this.mat(0x30343c), false, true);
    pad.rotation.x = -Math.PI / 2; pad.position.y = top + 0.02;
    g.add(pad);
    const hm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    g.add(this.box(0.25, 0.02, 1.4, hm, -0.5, top + 0.03, 0), this.box(0.25, 0.02, 1.4, hm, 0.5, top + 0.03, 0), this.box(1, 0.02, 0.25, hm, 0, top + 0.03, 0));
    this.tag(g, "medical", top + 2);
  }

  private press(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(this.box(5.2, 2.8, 3.6, this.mat(0x475569, { roughness: 0.4, metalness: 0.25 })));
    const dish = this.mesh(new THREE.ConeGeometry(0.95, 0.5, 16, 1, true), this.mat(0xf1f5f9, { side: THREE.DoubleSide, metalness: 0.3 }));
    dish.position.set(1.4, 3.7, 0); dish.rotation.z = 2.2;
    g.add(this.box(0.15, 0.9, 0.15, this.mat(0x94a3b8), 1.4, 2.8, 0), dish);
    g.add(this.box(1.5, 1.25, 3.2, this.mat(0xf8fafc, { roughness: 0.3 }), -3.8, 0, 0));
    this.movers.push((t) => { dish.rotation.y = Math.sin(t * 0.4) * 0.6; });
    this.tag(g, "press", 4.5);
  }

  private scouting(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(this.box(3.4, 2.4, 3.4, this.mat(0x64748b, { roughness: 0.45 })));
    g.add(this.box(1.3, 4.2, 1.3, this.mat(0x94a3b8, { metalness: 0.35 }), 0, 2.4, 0));
    g.add(this.box(2.2, 1.0, 2.2, this.mat(0x2563eb, { roughness: 0.25, metalness: 0.5 }), 0, 6.6, 0));
    const beacon = this.box(0.4, 0.4, 0.4, new THREE.MeshBasicMaterial({ color: 0xff3b3b }), 0, 7.6, 0);
    g.add(beacon);
    this.movers.push((t) => { beacon.visible = Math.sin(t * 3) > -0.2; });
    this.tag(g, "scouting", 8.2);
  }

  // ------------------------------------------------------------ câmera
  focus(id: HqBuilding | "overview", then?: () => void) {
    const to = id === "overview" ? this.overview.target.clone() : this.anchors[id]?.clone().setY(0);
    if (!to) return;
    const dist = id === "overview" ? this.overview.dist : id === "stadium" ? 52 : 34;
    const pitch = id === "overview" ? 0.76 : id === "stadium" ? 0.62 : 0.58;
    this.flyTo(to, dist, pitch, then);
  }
  focusSite(k: HqSiteKind) {
    const p = this.siteCenter[k];
    if (p) this.flyTo(p.clone(), k === "stadium" ? 54 : k === "sede" ? 38 : 64, k === "stadium" ? 0.62 : 0.66);
  }
  private flyTo(to: THREE.Vector3, d1: number, p1 = this.pitch, then?: () => void) {
    this.idleSince = this.t + 4;
    this.fly = { t0: performance.now() / 1000, dur: this.o.reduced ? 0.001 : 1.05, from: this.target.clone(), to, d0: this.dist, d1, p0: this.pitch, p1, then };
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
        this.pitch = Math.min(1.35, Math.max(0.36, this.drag.pitch + dy * 0.004));
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
    const dpr = window.devicePixelRatio || 1;
    // PixelRatio inteligente: limitado a 1.25x em mobile para manter 60 FPS cravados
    const isMobile = typeof window !== "undefined" && (window.innerWidth <= 768 || "ontouchstart" in window || (navigator && navigator.maxTouchPoints > 0));
    const pr = Math.min(dpr, isMobile ? 1.25 : 2.0);
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
      const k = Math.min(1, (now / 1000 - f.t0) / f.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.target.lerpVectors(f.from, f.to, e);
      this.dist = f.d0 + (f.d1 - f.d0) * e;
      this.pitch = f.p0 + (f.p1 - f.p0) * e;
      if (k >= 1) { this.fly = null; f.then?.(); }
    } else if (!this.drag && !this.o.reduced && t - this.idleSince > 3) {
      this.yaw += (dt / 1000) * 0.055;
      const ks = this.sites();
      if (ks.length > 1 && t - this.idleSince > 14) {
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
    const placed: [number, number, number, number][] = [];
    for (const [id, el] of Object.entries(this.o.labels) as [HqBuilding, HTMLElement][]) {
      const a = this.anchors[id];
      if (!a || !el) continue;
      this.tmp.copy(a).project(this.camera);
      const off = this.tmp.z > 1 || this.tmp.x < -1.15 || this.tmp.x > 1.15 || this.tmp.y < -1.15 || this.tmp.y > 1.15;
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
