// Renderizador "📼 Retrô PS1" da partida: three.js numa resolução interna baixa (240 linhas),
// vértices "tremendo" na grade de pixels, textura afim (sem correção de perspectiva), Gouraud,
// neblina, sem antisserrilhado e um pós-processamento com cor de 15 bits + pontilhado ordenado.
// Este módulo só é baixado quando o modo é escolhido (import dinâmico em MatchView).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { StadiumStyle } from "../../data/stadiumStyles";
import { PITCH_LEN, PITCH_WID } from "../pitchGeom";
import { drawText, textWidth } from "./font";
import { makeKitTexture, type KitWhich } from "../kitTexture";
import { CrowdFx, type StandInfo } from "./crowdFx";
import {
  behindGoalCam, broadcastCam, easeCam, facingAngle, internalRes, ReplayBuffer,
  type CamPose, type Ps1Player, type Ps1Snapshot,
} from "./model";

THREE.ColorManagement.enabled = false;

export interface Ps1Hud {
  abbr: [string, string];
  color: [string, string];
  score: [number, number];
  clock: string;
  /** cores da competição para a caixa do placar: [fundo, borda] (opcional) */
  frame?: [string, string];
}

export interface Ps1Options {
  host: HTMLElement;
  style: StadiumStyle;
  /** cores dos clubes (para a torcida e os mosaicos) */
  clubColors: [string, string];
  reduced: boolean;
  /** torcida brasileira: festa nas arquibancadas (omitido = clube estrangeiro, sem festa) */
  festa?: { level: number; selecao: boolean; colors: [string, string, string]; abbr: string; side: 0 | 1 };
}

const HALF_L = PITCH_LEN / 2;
const HALF_W = PITCH_WID / 2;
const GOAL_W = 7.32;
const GOAL_H = 2.44;
const PLAYER_SCALE = 1.5;

function hexRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function shade(hex: string, k: number): string {
  const [r, g, b] = hexRgb(hex);
  const f = (v: number) => Math.round(Math.max(0, Math.min(1, v * k)) * 255).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}
function lum(hex: string) {
  const [r, g, b] = hexRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ---------------------------------------------------------------- shaders
const VERT = /* glsl */ `
uniform vec2 uRes;
uniform vec3 uLightDir;
uniform float uAmbient;
uniform float uLit;
uniform float uFogNear;
uniform float uFogFar;
uniform float uSnap;
varying vec3 vCol;
varying vec3 vUvq;
varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 p = projectionMatrix * mv;
  // PS1: sem subpixel, o vértice cai na grade da tela (e treme quando a câmera anda)
  if (uSnap > 0.5 && p.w > 0.0) {
    vec2 g = uRes * 0.5;
    p.xy = floor(p.xy / p.w * g + 0.5) / g * p.w;
  }
  gl_Position = p;
  vec3 n = normalize(normalMatrix * normal);
  vec3 l = normalize((viewMatrix * vec4(uLightDir, 0.0)).xyz);
  float d = max(dot(n, l), 0.0);
  float light = mix(1.0, uAmbient + (1.0 - uAmbient) * d, uLit);
  #ifdef USE_COLOR
  vCol = color * light;
  #else
  vCol = vec3(light);
  #endif
  // textura afim: interpola uv*w e w e divide no fragmento (anula a correção de perspectiva)
  vUvq = vec3(uv * p.w, p.w);
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uUseMap;
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uAlpha;
varying vec3 vCol;
varying vec3 vUvq;
varying float vFog;
void main() {
  vec4 t = vec4(1.0);
  if (uUseMap > 0.5) {
    t = texture2D(uMap, vUvq.xy / vUvq.z);
    if (t.a < 0.5) discard;
  }
  vec3 c = t.rgb * vCol * uColor;
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, uAlpha);
}
`;

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// cor de 15 bits (5 por canal) com pontilhado ordenado 4x4, como o PS1 faz no frame buffer
const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
varying vec2 vUv;
float bayer2(vec2 a) { return mod(2.0 * a.x + 3.0 * a.y, 4.0); }
float bayer4(vec2 p) { p = mod(floor(p), 4.0); return (4.0 * bayer2(mod(p, 2.0)) + bayer2(floor(p / 2.0))) / 16.0 - 0.5; }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c = clamp(c * 255.0 + bayer4(gl_FragCoord.xy) * 8.0, 0.0, 255.0);
  c = floor(c / 255.0 * 31.0 + 0.5) / 31.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

// ---------------------------------------------------------------- geometria
function colorize(geo: THREE.BufferGeometry, hex: string | ((y: number, i: number) => string)): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [r, gg, b] = hexRgb(typeof hex === "string" ? hex : hex(pos.getY(i), i));
    col[i * 3] = r;
    col[i * 3 + 1] = gg;
    col[i * 3 + 2] = b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: string | ((y: number, i: number) => string), segY = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 1, segY, 1);
  g.translate(x, y, z);
  return colorize(g, hex);
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return m;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function tex(c: HTMLCanvasElement, repeat = false): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Pseudo-aleatório determinístico (a cena não mexe no gerador do jogo). */
function prng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------- boneco
interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shadow: THREE.Mesh;
  facing: number;
  key: string;
}

export class Ps1Renderer {
  private opts: Ps1Options;
  private renderer: THREE.WebGLRenderer;
  private glCanvas: HTMLCanvasElement;
  private hud: HTMLCanvasElement;
  private hg: CanvasRenderingContext2D;
  private box: HTMLDivElement;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 4 / 3, 3, 420);
  private rt: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: THREE.ShaderMaterial;
  private res = { w: 320, h: 240, aspect: 4 / 3 };
  private uniforms = {
    uRes: { value: new THREE.Vector2(320, 240) },
    uLightDir: { value: new THREE.Vector3(-0.35, 0.85, 0.45).normalize() },
    uFogColor: { value: new THREE.Color(0.55, 0.66, 0.8) },
    uFogNear: { value: 90 },
    uFogFar: { value: 260 },
    uSnap: { value: 1 },
  };
  private mats: THREE.ShaderMaterial[] = [];
  private textures: THREE.Texture[] = [];
  private rigs = new Map<number, Rig>();
  private ball!: THREE.Mesh;
  private ballShadow!: THREE.Mesh;
  private nets: { mesh: THREE.Mesh; side: 0 | 1; x0: number }[] = [];
  private crowdTex: THREE.Texture[] = [];
  private cam: CamPose | null = null;
  private replay = new ReplayBuffer(6, 30);
  private clip: Ps1Snapshot[] | null = null;
  private clipT = 0;
  private clipSide: 0 | 1 = 0;
  private goalTimer = 0;
  private wasCelebrating = false;
  private pendingClip = -1;
  private lost = false;
  private disposed = false;
  private time = 0;
  private shirtTex = new Map<string, THREE.Texture>();
  private v3 = new THREE.Vector3();
  private stands: StandInfo[] = [];
  private festa: CrowdFx | null = null;

  constructor(opts: Ps1Options) {
    this.opts = opts;
    const box = document.createElement("div");
    box.className = "ps1-box";
    this.box = box;
    this.glCanvas = document.createElement("canvas");
    this.glCanvas.className = "ps1-gl";
    this.hud = document.createElement("canvas");
    this.hud.className = "ps1-hud";
    box.append(this.glCanvas, this.hud);
    opts.host.append(box);
    this.hg = this.hud.getContext("2d")!;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: false, powerPreference: "low-power", alpha: false, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.rt = new THREE.WebGLRenderTarget(320, 240, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
    this.postMat = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms: { tScene: { value: this.rt.texture } }, depthTest: false, depthWrite: false });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
    this.glCanvas.addEventListener("webglcontextlost", this.onLost, false);
    this.glCanvas.addEventListener("webglcontextrestored", this.onRestored, false);
    this.build();
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };
  private onRestored = () => {
    this.lost = false;
    for (const t of this.textures) t.needsUpdate = true;
    for (const t of this.shirtTex.values()) t.needsUpdate = true;
  };

  // ------------------------------------------------ materiais
  private mat(o: { map?: THREE.Texture | null; color?: string; lit?: boolean; alpha?: number; side?: THREE.Side; snap?: boolean; fog?: boolean } = {}): THREE.ShaderMaterial {
    const transparent = (o.alpha ?? 1) < 1;
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
      transparent,
      depthWrite: !transparent,
      side: o.side ?? THREE.FrontSide,
      uniforms: {
        uRes: this.uniforms.uRes,
        uLightDir: this.uniforms.uLightDir,
        uFogColor: this.uniforms.uFogColor,
        uFogNear: o.fog === false ? { value: 1e5 } : this.uniforms.uFogNear,
        uFogFar: o.fog === false ? { value: 2e5 } : this.uniforms.uFogFar,
        uSnap: o.snap === false ? { value: 0 } : this.uniforms.uSnap,
        uAmbient: { value: 0.52 },
        uLit: { value: o.lit === false ? 0 : 1 },
        uMap: { value: o.map ?? null },
        uUseMap: { value: o.map ? 1 : 0 },
        uColor: { value: new THREE.Color(...hexRgb(o.color ?? "#ffffff")) },
        uAlpha: { value: o.alpha ?? 1 },
      },
    });
    this.mats.push(m);
    return m;
  }

  private addMesh(geo: THREE.BufferGeometry, m: THREE.ShaderMaterial, parent: THREE.Object3D = this.scene): THREE.Mesh {
    if (!geo.getAttribute("color")) colorize(geo, "#ffffff");
    const mesh = new THREE.Mesh(geo, m);
    mesh.matrixAutoUpdate = parent !== this.scene;
    parent.add(mesh);
    if (!mesh.matrixAutoUpdate) mesh.updateMatrix();
    return mesh;
  }

  // ------------------------------------------------ cenário
  private build() {
    const st = this.opts.style;
    const sky = this.skyColors();
    this.uniforms.uFogColor.value.setRGB(...hexRgb(sky[1]));
    this.renderer.setClearColor(new THREE.Color(...hexRgb(sky[1])), 1);
    this.buildSky(sky);
    this.buildPitch(st);
    this.buildGoals();
    this.buildBoards();
    this.buildStands(st);
    this.buildLights(st);
    const fo = this.opts.festa;
    if (fo) {
      // arquibancada oposta (a que a câmera mostra) + o fundo da torcida dona da casa
      const end = fo.side === 0 ? 0 : 1;
      const stands = this.stands.filter((s, i) => i === 0 || s.t === end);
      this.festa = new CrowdFx({ ...fo, stands }, this.uniforms);
      this.scene.add(this.festa.group);
    }
    this.buildBall();
  }

  private skyColors(): [string, string] {
    // fim de tarde azulado, como nos jogos de 97/98
    return ["#2c4f8c", "#9db8d8"];
  }

  private buildSky([top, horizon]: [string, string]) {
    const g = new THREE.SphereGeometry(380, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const geo = colorize(g, (y) => (y > 150 ? top : y > 40 ? shade(horizon, 0.85) : horizon));
    const m = this.mat({ lit: false, side: THREE.BackSide, fog: false, snap: false });
    this.addMesh(geo, m);
  }

  private pitchTexture(st: StadiumStyle): THREE.Texture {
    const S = 4; // pixels por metro
    const pw = 128 * S, ph = 84 * S; // 128 x 84 m (campo + gramado em volta)
    const [c, g] = canvas(pw, ph);
    const ox = (pw - PITCH_LEN * S) / 2, oy = (ph - PITCH_WID * S) / 2;
    const A = "#3d8a3a", B = "#337a31";
    g.fillStyle = A;
    g.fillRect(0, 0, pw, ph);
    g.fillStyle = B;
    const band = PITCH_LEN / 18;
    for (let i = -6; i < 24; i++) {
      const x = ox + i * band * S;
      if (st.mow === "checker") {
        for (let j = 0; j < 12; j++) if ((i + j) % 2 === 0) g.fillRect(x, oy + (j * PITCH_WID * S) / 10, band * S, (PITCH_WID * S) / 10);
      } else if (st.mow === "rows") {
        if (i % 2 === 0) g.fillRect(0, oy + i * band * S * 0.66, pw, band * S * 0.66);
      } else if (st.mow === "wide") {
        if (((i % 4) + 4) % 4 < 2) g.fillRect(x, 0, band * S, ph);
      } else if (i % 2 === 0) g.fillRect(x, 0, band * S, ph);
    }
    // ruído de grama (textura "suja" do PS1)
    const r = prng(77);
    for (let i = 0; i < pw * ph * 0.05; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(20,50,18,0.35)" : "rgba(120,170,90,0.25)";
      g.fillRect(Math.floor(r() * pw), Math.floor(r() * ph), 1, 1);
    }
    // linhas
    g.strokeStyle = "#e9f2e6";
    g.fillStyle = "#e9f2e6";
    g.lineWidth = 2;
    const X = (m: number) => Math.round(ox + (m + HALF_L) * S) + 0.5;
    const Y = (m: number) => Math.round(oy + (m + HALF_W) * S) + 0.5;
    g.strokeRect(X(-HALF_L), Y(-HALF_W), PITCH_LEN * S, PITCH_WID * S);
    g.beginPath();
    g.moveTo(X(0), Y(-HALF_W));
    g.lineTo(X(0), Y(HALF_W));
    g.stroke();
    g.beginPath();
    g.arc(X(0), Y(0), 9.15 * S, 0, Math.PI * 2);
    g.stroke();
    for (const s of [-1, 1]) {
      const gx = s * HALF_L;
      g.strokeRect(s < 0 ? X(gx) : X(gx - 16.5), Y(-20.16), 16.5 * S, 40.32 * S);
      g.strokeRect(s < 0 ? X(gx) : X(gx - 5.5), Y(-9.16), 5.5 * S, 18.32 * S);
      g.fillRect(X(gx - s * 11) - 1.5, Y(0) - 1.5, 3, 3);
      g.beginPath();
      g.arc(X(gx - s * 11), Y(0), 9.15 * S, s < 0 ? -0.93 : Math.PI - 0.93, s < 0 ? 0.93 : Math.PI + 0.93);
      g.stroke();
    }
    g.fillRect(X(0) - 1.5, Y(0) - 1.5, 3, 3);
    const t = tex(c);
    this.textures.push(t);
    return t;
  }

  private buildPitch(st: StadiumStyle) {
    const t = this.pitchTexture(st);
    // malha subdividida: a textura afim "dobra" só um pouquinho, como no console
    const g = new THREE.PlaneGeometry(128, 84, 16, 10);
    g.rotateX(-Math.PI / 2);
    this.addMesh(colorize(g, "#ffffff"), this.mat({ map: t }));
    // chão em volta (pista de atletismo ou concreto)
    const ring = st.track ?? shade(st.concrete, 0.9);
    const out = new THREE.PlaneGeometry(200, 150, 4, 4);
    out.rotateX(-Math.PI / 2);
    out.translate(0, -0.6, 0);
    this.addMesh(colorize(out, st.track ? ring : "#2f6b2d"), this.mat());
  }

  private netTexture(): THREE.Texture {
    const [c, g] = canvas(32, 32);
    g.clearRect(0, 0, 32, 32);
    g.fillStyle = "#f0f0f0";
    for (let i = 0; i < 32; i += 4) {
      g.fillRect(i, 0, 1, 32);
      g.fillRect(0, i, 32, 1);
    }
    const t = tex(c, true);
    this.textures.push(t);
    return t;
  }

  private buildGoals() {
    const nt = this.netTexture();
    const netM = this.mat({ map: nt, side: THREE.DoubleSide, lit: false });
    const postM = this.mat({ lit: true });
    const D = 2.2;
    for (const s of [-1, 1] as const) {
      const x = s * HALF_L;
      const p = 0.12;
      const parts = [
        box(p, GOAL_H, p, x, GOAL_H / 2, -GOAL_W / 2, "#ffffff"),
        box(p, GOAL_H, p, x, GOAL_H / 2, GOAL_W / 2, "#ffffff"),
        box(p, p, GOAL_W + p, x, GOAL_H, 0, "#ffffff"),
        box(p * 0.6, p * 0.6, GOAL_W, x + s * D, 0.03, 0, "#cfcfcf"),
      ];
      this.addMesh(merge(parts), postM);
      const uvs = (g: THREE.PlaneGeometry, ru: number, rv: number) => {
        const uv = g.getAttribute("uv");
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
        return g;
      };
      // fundo da rede (é ele que balança no gol)
      const back = uvs(new THREE.PlaneGeometry(GOAL_W, GOAL_H, 1, 1), 9, 3);
      back.rotateY(Math.PI / 2);
      back.translate(0, GOAL_H / 2, 0);
      const bm = this.addMesh(colorize(back, "#ffffff"), netM);
      bm.position.set(x + s * D, 0, 0);
      bm.matrixAutoUpdate = true;
      this.nets.push({ mesh: bm, side: s > 0 ? 0 : 1, x0: x + s * D });
      const top = uvs(new THREE.PlaneGeometry(D, GOAL_W, 1, 1), 3, 9);
      top.rotateX(-Math.PI / 2);
      top.translate(x + (s * D) / 2, GOAL_H, 0);
      this.addMesh(colorize(top, "#ffffff"), netM);
      for (const z of [-GOAL_W / 2, GOAL_W / 2]) {
        const side = uvs(new THREE.PlaneGeometry(D, GOAL_H, 1, 1), 3, 3);
        side.translate(x + (s * D) / 2, GOAL_H / 2, z);
        this.addMesh(colorize(side, "#ffffff"), netM);
      }
    }
  }

  private boardTexture(): THREE.Texture {
    const [c, g] = canvas(256, 16);
    const ads: [string, string, string][] = [
      ["#1d4ed8", "#ffffff", "LENDAS"],
      ["#f5c400", "#111111", "BOLA 10"],
      ["#d62020", "#ffffff", "SUPER TV"],
      ["#0b7a3b", "#ffffff", "GOL"],
      ["#111111", "#f5c400", "RETRO"],
      ["#ffffff", "#c81e1e", "CRAQUE"],
    ];
    let x = 0;
    let i = 0;
    while (x < 256) {
      const [bg, fg, txt] = ads[i % ads.length];
      const w = Math.max(40, textWidth(txt) + 10);
      g.fillStyle = bg;
      g.fillRect(x, 0, w, 16);
      drawText(g, txt, x + Math.round((w - textWidth(txt)) / 2), 4, fg);
      x += w;
      i++;
    }
    const t = tex(c, true);
    this.textures.push(t);
    return t;
  }

  private buildBoards() {
    const t = this.boardTexture();
    const m = this.mat({ map: t, lit: false });
    const geos: THREE.BufferGeometry[] = [];
    const H = 0.95;
    const add = (len: number, rotY: number, x: number, z: number, rep: number) => {
      const g = new THREE.PlaneGeometry(len, H);
      const uv = g.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep);
      g.rotateY(rotY);
      g.translate(x, H / 2, z);
      geos.push(colorize(g, "#ffffff"));
    };
    add(PITCH_LEN + 8, 0, 0, -HALF_W - 4, 6); // lado oposto, de frente para a câmera
    add(PITCH_LEN + 8, Math.PI, 0, HALF_W + 4, 6);
    for (const s of [-1, 1]) {
      add(18, -s * Math.PI / 2, s * (HALF_L + 4), -14, 1);
      add(18, -s * Math.PI / 2, s * (HALF_L + 4), 14, 1);
    }
    this.addMesh(merge(geos), m);
    // estrutura atrás das placas
    const back = merge([
      box(PITCH_LEN + 8, H, 0.2, 0, H / 2, -HALF_W - 4.15, "#2a2a2a"),
      box(PITCH_LEN + 8, H, 0.2, 0, H / 2, HALF_W + 4.15, "#2a2a2a"),
    ]);
    this.addMesh(back, this.mat());
  }

  private crowdTexture(seed: number, seats: string[], colors: string[], fill: number): THREE.Texture {
    const [c, g] = canvas(64, 64);
    const r = prng(seed);
    for (let y = 0; y < 64; y++) {
      g.fillStyle = shade(seats[Math.floor(y / 8) % seats.length], y % 2 ? 0.75 : 0.95);
      g.fillRect(0, y, 64, 1);
    }
    const skins = ["#f0c49a", "#c98d5b", "#7c4c2b", "#e3b585"];
    for (let y = 0; y < 64; y += 4) {
      for (let x = (y / 4) % 2 ? 1 : 0; x < 64; x += 3) {
        if (r() > fill) continue;
        const shirt = r() < 0.7 ? colors[Math.floor(r() * colors.length)] : ["#f2f2f2", "#222222", "#555b66"][Math.floor(r() * 3)];
        g.fillStyle = shirt;
        g.fillRect(x, y + 2, 2, 2);
        g.fillStyle = skins[Math.floor(r() * skins.length)];
        g.fillRect(x, y + 1, 2, 1);
        if (r() < 0.25) {
          g.fillStyle = "#1a1a1a";
          g.fillRect(x, y, 2, 1);
        }
      }
    }
    const t = tex(c, true);
    this.textures.push(t);
    return t;
  }

  /** Arquibancada em degraus: uma rampa com a torcida + o paredão da frente. */
  private stand(len: number, depth: number, h0: number, h1: number, crowd: THREE.Texture, concrete: string): THREE.BufferGeometry[] {
    // construída de frente para +z, centrada na origem, a borda da frente em z=0
    const steps = 6;
    const geos: THREE.BufferGeometry[] = [];
    const g = new THREE.BufferGeometry();
    const pos: number[] = [], uv: number[] = [], nor: number[] = [];
    const rep = Math.max(1, Math.round(len / 9));
    for (let i = 0; i < steps; i++) {
      const z0 = -(i / steps) * depth, z1 = -((i + 1) / steps) * depth;
      const y0 = h0 + ((h1 - h0) * i) / steps, y1 = h0 + ((h1 - h0) * (i + 1)) / steps;
      const v0 = i / steps, v1 = (i + 1) / steps;
      // degrau: espelho (vertical) + piso (horizontal), as duas faces com a torcida
      const quad = (a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[], n: number[]) => {
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
        for (let k = 0; k < 6; k++) nor.push(...n);
      };
      const half = len / 2;
      const ym = (y0 + y1) / 2;
      quad([-half, y0, z0], [half, y0, z0], [half, ym + (y1 - y0) / 2, z0], [-half, y1, z0], [0, v0], [rep, v0], [rep, (v0 + v1) / 2], [0, (v0 + v1) / 2], [0, 0.2, 1]);
      quad([-half, y1, z0], [half, y1, z0], [half, y1, z1], [-half, y1, z1], [0, (v0 + v1) / 2], [rep, (v0 + v1) / 2], [rep, v1], [0, v1], [0, 1, 0.3]);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    colorize(g, "#ffffff");
    void crowd;
    geos.push(g);
    // paredão de baixo e parede do fundo
    geos.push(box(len, h0, 0.6, 0, h0 / 2, 0.3, concrete));
    geos.push(box(len, h1 + 2, 1.2, 0, (h1 + 2) / 2, -depth - 0.6, shade(concrete, 0.8)));
    return geos;
  }

  private buildStands(st: StadiumStyle) {
    const [home, away] = this.opts.clubColors;
    const seats = st.seats.length ? st.seats : ["#7d8386"];
    const tHome = this.crowdTexture(11, seats, [home, home, shade(home, 0.8), "#ffffff"], st.fill);
    const tAway = this.crowdTexture(23, seats, [away, shade(away, 0.85), "#ffffff"], st.fill * 0.8);
    const tMix = this.crowdTexture(37, seats, [home, away, home], st.fill * 0.9);
    this.crowdTex = [tHome, tAway, tMix];
    const crowdM = [this.mat({ map: tHome }), this.mat({ map: tAway }), this.mat({ map: tMix })];
    const conc = this.mat();
    const roofM = this.mat({ color: "#ffffff" });
    const big = st.shape === "bowl" || st.shape === "track" || st.shape === "bombonera";
    const small = st.shape === "small";
    const back = st.shape === "track" ? 12 : 8;
    const depth = small ? 10 : big ? 30 : 22;
    const h1 = small ? 6 : big ? 24 : 16;
    type Side = { len: number; rot: number; x: number; z: number; t: number; d: number; h: number; roof: boolean };
    const sides: Side[] = [
      // lado oposto (o que mais aparece na transmissão)
      { len: PITCH_LEN + 2 * back + 6, rot: 0, x: 0, z: -HALF_W - back, t: 2, d: depth, h: st.shape === "bombonera" ? h1 + 10 : h1, roof: st.roof !== "none" },
      // lado da câmera (fica atrás/baixo da tela)
      { len: PITCH_LEN + 2 * back + 6, rot: Math.PI, x: 0, z: HALF_W + back, t: 2, d: depth * 0.7, h: h1 * 0.6, roof: false },
    ];
    const endDepth = small ? 6 : depth;
    const endH = small ? 3.5 : h1 * (big ? 1 : 0.85);
    if (st.shape !== "open-end") sides.push({ len: PITCH_WID + 2 * back, rot: Math.PI / 2, x: -HALF_L - back, z: 0, t: 0, d: endDepth, h: endH, roof: st.roof === "full" || st.roof === "partial" });
    else sides.push({ len: PITCH_WID * 0.6, rot: Math.PI / 2, x: -HALF_L - back - 30, z: 0, t: 0, d: 4, h: 2.5, roof: false });
    sides.push({ len: PITCH_WID + 2 * back, rot: -Math.PI / 2, x: HALF_L + back, z: 0, t: 1, d: endDepth, h: endH, roof: st.roof === "full" });
    this.stands = sides.map((s) => ({ len: s.len, rot: s.rot, x: s.x, z: s.z, t: s.t, d: s.d, h: s.h }));
    for (const s of sides) {
      const parts = this.stand(s.len, s.d, 1.6, s.h, this.crowdTex[s.t], st.concrete);
      const [ramp, ...rest] = parts;
      const grp = new THREE.Group();
      grp.position.set(s.x, 0, s.z);
      grp.rotation.y = s.rot;
      this.scene.add(grp);
      this.addMesh(ramp, crowdM[s.t], grp);
      this.addMesh(merge(rest), conc, grp);
      if (s.roof) {
        const rc = st.roofColor;
        const roof = merge([
          box(s.len + 2, 0.8, s.d * 0.75, 0, s.h + 6, -s.d * 0.62, rc),
          box(s.len + 2, 0.5, 0.5, 0, s.h + 5.6, -s.d * 0.25, shade(rc, 0.7)),
          ...[-0.42, -0.14, 0.14, 0.42].map((k) => box(0.6, s.h + 6, 0.6, k * s.len, (s.h + 6) / 2, -s.d - 0.4, shade(st.concrete, 0.9))),
        ]);
        this.addMesh(roof, roofM, grp);
      }
      grp.updateMatrixWorld(true);
    }
    // cantos: blocos de concreto para fechar o anel nos estádios grandes
    if (big || st.shape === "english") {
      const cg: THREE.BufferGeometry[] = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const w = back + depth * 0.8;
        cg.push(box(w, h1 * 0.8, w, sx * (HALF_L + back + w / 2 - 2), (h1 * 0.8) / 2, sz * (HALF_W + back + w / 2 - 2), shade(st.concrete, 0.85)));
      }
      this.addMesh(merge(cg), conc);
    }
  }

  private buildLights(st: StadiumStyle) {
    const towerM = this.mat();
    const lampM = this.mat({ lit: false, color: "#fffbe0", fog: false });
    const poles: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[] = [];
    if (st.lights === "towers") {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (HALF_L + 22), z = sz * (HALF_W + 26), h = 46;
        poles.push(box(1.4, h, 1.4, x, h / 2, z, "#6c7377"));
        poles.push(box(8, 4.5, 0.8, x, h + 2, z, "#3a3f42"));
        lamps.push(box(7, 3.5, 0.3, x, h + 2, z + (sz < 0 ? 0.5 : -0.5), "#ffffff"));
      }
    } else if (st.lights === "masts") {
      for (const sz of [-1, 1]) for (const k of [-0.7, -0.23, 0.23, 0.7]) {
        const x = k * PITCH_LEN, z = sz * (HALF_W + 7), h = 16;
        poles.push(box(0.4, h, 0.4, x, h / 2, z, "#7b8285"));
        lamps.push(box(2.4, 1, 0.3, x, h + 0.4, z, "#ffffff"));
      }
    } else {
      // luz no teto: uma faixa acesa na borda da cobertura do lado oposto
      lamps.push(box(PITCH_LEN * 0.9, 0.5, 0.3, 0, 30, -HALF_W - 10, "#ffffff"));
    }
    if (poles.length) this.addMesh(merge(poles), towerM);
    if (lamps.length) this.addMesh(merge(lamps), lampM);
  }

  private buildBall() {
    const g = new THREE.IcosahedronGeometry(0.34, 0);
    const pos = g.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    for (let f = 0; f < pos.count / 3; f++) {
      const c = f % 4 === 0 ? 0.1 : 1;
      for (let k = 0; k < 3; k++) col.set([c, c, c], (f * 3 + k) * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.ball = this.addMesh(g, this.mat({ lit: true }));
    this.ball.matrixAutoUpdate = true;
    const sg = new THREE.CircleGeometry(0.4, 6);
    sg.rotateX(-Math.PI / 2);
    this.ballShadow = this.addMesh(colorize(sg, "#000000"), this.mat({ lit: false, alpha: 0.45 }));
    this.ballShadow.matrixAutoUpdate = true;
  }

  // ------------------------------------------------ jogadores
  private shirtTexture(p: Ps1Player): THREE.Texture {
    const key = `${p.shirt}|${p.pattern}|${p.stripe}|${p.num}|${p.kit ?? ""}|${p.kit ? p.name : ""}`;
    const hit = this.shirtTex.get(key);
    if (hit) return hit;
    if (p.kit) {
      // uniforme real: tecido, fornecedora, escudo, patrocinador, nome e número (kitTexture.ts)
      const [club, which] = p.kit.split(":");
      const kt = tex(makeKitTexture(club, (Number(which) || 0) as KitWhich, { num: p.num, name: p.name, layout: "sheet", size: 64, onReady: () => { kt.needsUpdate = true; } }));
      this.shirtTex.set(key, kt);
      return kt;
    }
    // 32x16: metade esquerda = costas (número grande), direita = frente
    const [c, g] = canvas(32, 16);
    g.fillStyle = p.shirt;
    g.fillRect(0, 0, 32, 16);
    if (p.pattern === "stripes") {
      g.fillStyle = p.stripe;
      for (let x = 1; x < 32; x += 4) g.fillRect(x, 0, 2, 16);
    } else if (p.pattern === "hoops") {
      g.fillStyle = p.stripe;
      for (let y = 2; y < 16; y += 5) g.fillRect(0, y, 32, 2);
    } else if (p.pattern === "sash") {
      g.fillStyle = p.stripe;
      for (let i = 0; i < 16; i++) g.fillRect(16 + i, i, 3, 1);
    }
    const n = String(p.num || "").slice(0, 2);
    if (n) {
      const light = lum(p.shirt) < 0.55 && p.pattern === "solid";
      const fg = light ? "#ffffff" : "#111111";
      const w = textWidth(n);
      if (p.pattern !== "solid") {
        g.fillStyle = light ? "#111111" : "#ffffff";
        g.fillRect(Math.round((16 - w) / 2) - 1, 3, w + 2, 9);
      }
      drawText(g, n, Math.round((16 - w) / 2), 4, fg);
    }
    const t = tex(c);
    this.shirtTex.set(key, t);
    return t;
  }

  private makeRig(p: Ps1Player): Rig {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    root.scale.setScalar(PLAYER_SCALE);
    const litV = this.mat();
    // tronco com textura (costas = -z, o boneco olha para +z)
    const tg = new THREE.BoxGeometry(0.44, 0.56, 0.24);
    const uv = tg.getAttribute("uv");
    // faces do BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices cada)
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u = uv.getX(i);
      uv.setX(i, f === 5 ? u * 0.5 : 0.5 + u * 0.5);
      if (f !== 5 && f !== 4) uv.setXY(i, 0.75, 0.5);
    }
    tg.translate(0, 1.33, 0);
    const torso = this.addMesh(colorize(tg, "#ffffff"), this.mat({ map: this.shirtTexture(p) }), body);
    const hips = box(0.4, 0.24, 0.24, 0, 0.97, 0, p.shorts);
    const neck = box(0.12, 0.08, 0.12, 0, 1.64, 0, p.skin);
    this.addMesh(merge([hips, neck]), litV, body);
    const head = this.addMesh(
      merge([
        box(0.24, 0.27, 0.25, 0, 1.8, 0, p.skin),
        box(0.27, 0.09, 0.28, 0, 1.96, -0.01, p.hair),
        box(0.27, 0.16, 0.06, 0, 1.86, -0.13, p.hair),
      ]),
      litV,
      body,
    );
    const limb = (len: number, w: number, top: string, mid: string, bot: string, boot: string | null) => {
      const g = box(w, len, w, 0, -len / 2, 0, (y) => {
        const t = -y / len; // 0 no topo, 1 embaixo
        if (boot && t > 0.92) return boot;
        return t < 0.3 ? top : t < 0.55 ? mid : bot;
      }, 4);
      return g;
    };
    const arm = (sx: number) => {
      const grp = new THREE.Group();
      grp.position.set(sx * 0.29, 1.57, 0);
      this.addMesh(limb(0.56, 0.11, p.sleeve, p.side === 2 ? p.sleeve : p.skin, p.grp === 0 ? "#f2f2f2" : p.skin, null), litV, grp);
      body.add(grp);
      return grp;
    };
    const leg = (sx: number) => {
      const grp = new THREE.Group();
      grp.position.set(sx * 0.11, 0.92, 0);
      this.addMesh(limb(0.92, 0.15, p.shorts, p.skin, p.socks, "#151515"), litV, grp);
      body.add(grp);
      return grp;
    };
    const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);
    const sg = new THREE.CircleGeometry(0.42, 6);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, 0.03, 0);
    const shadow = this.addMesh(colorize(sg, "#000000"), this.mat({ lit: false, alpha: 0.4 }), root);
    this.scene.add(root);
    return { root, body, torso, head, armL, armR, legL, legR, shadow, facing: p.side === 1 ? -Math.PI / 2 : Math.PI / 2, key: this.rigKey(p) };
  }

  private rigKey(p: Ps1Player) {
    return `${p.shirt}|${p.shorts}|${p.socks}|${p.skin}|${p.hair}|${p.num}|${p.sleeve}|${p.pattern}|${p.kit ?? ""}`;
  }

  private disposeObj(o: THREE.Object3D) {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.ShaderMaterial;
        const i = this.mats.indexOf(mat);
        if (i >= 0) this.mats.splice(i, 1);
        mat.dispose();
      }
    });
    o.removeFromParent();
  }

  private pose(p: Ps1Player, r: Rig, now: number, ball: { x: number; z: number }) {
    const { root, body, armL, armR, legL, legR, head } = r;
    root.position.set(p.x, 0, p.z);
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    const sp = Math.hypot(p.vx, p.vz);
    const moving = sp > 0.02;
    if (moving) r.facing = facingAngle(p.vx, p.vz, r.facing);
    else if (p.dive < 0 && Math.hypot(ball.x - p.x, ball.z - p.z) > 0.5) r.facing = Math.atan2(ball.x - p.x, ball.z - p.z);
    // ângulos em degraus de 22,5° (os bonecos do PS1 viravam "aos trancos")
    const step = Math.PI / 8;
    root.rotation.y = Math.round(r.facing / step) * step;
    const phase = p.walk * 0.95;
    const amp = moving ? Math.min(1, sp * 4) : 0;
    const sw = Math.sin(phase) * 0.85 * amp;
    legL.rotation.set(sw, 0, 0);
    legR.rotation.set(-sw, 0, 0);
    armL.rotation.set(-sw * 0.8, 0, 0.08);
    armR.rotation.set(sw * 0.8, 0, -0.08);
    if (moving) body.position.y = Math.abs(Math.cos(phase)) * 0.06 * amp;
    if (moving) body.rotation.x = 0.12 * amp;

    if (p.dive >= 0) {
      // goleiro voando para o lado
      const s = p.dive;
      const toward = p.side === 0 ? 1 : -1; // olha para o meio do campo
      root.rotation.y = toward > 0 ? Math.PI / 2 : -Math.PI / 2;
      const dir = (p.diveDir >= 0 ? 1 : -1) * (toward > 0 ? 1 : -1);
      body.rotation.z = dir * (Math.PI / 2) * Math.min(1, s * 2.5);
      body.position.y = 0.25 + Math.sin(Math.PI * Math.min(1, s * 1.3)) * 0.9;
      armL.rotation.set(Math.PI, 0, 0.2);
      armR.rotation.set(Math.PI, 0, -0.2);
      legL.rotation.set(0, 0, -0.15);
      legR.rotation.set(0, 0, 0.25);
      return;
    }
    if (p.down || p.pose === "fall") {
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.2;
      armL.rotation.set(Math.PI * 0.8, 0, 0);
      armR.rotation.set(Math.PI * 0.7, 0, 0);
      return;
    }
    const s = p.poseS;
    switch (p.pose) {
      case "kick":
      case "volley": {
        const a = s < 0.35 ? 0.8 * (s / 0.35) : 0.8 - 2.4 * Math.min(1, (s - 0.35) / 0.4);
        legR.rotation.set(a, 0, 0);
        legL.rotation.set(0.1, 0, 0);
        armL.rotation.set(-0.5, 0, 0.7);
        armR.rotation.set(0.4, 0, -0.6);
        body.rotation.x = -0.15;
        if (p.pose === "volley") body.position.y = Math.sin(Math.PI * s) * 0.35;
        return;
      }
      case "header":
        body.position.y = Math.sin(Math.PI * s) * 0.95;
        body.rotation.x = s < 0.5 ? -0.3 : 0.45;
        head.rotation.x = s < 0.5 ? -0.3 : 0.5;
        armL.rotation.set(-0.3, 0, 0.6);
        armR.rotation.set(-0.3, 0, -0.6);
        legL.rotation.set(0.4, 0, 0);
        legR.rotation.set(0.2, 0, 0);
        return;
      case "bicycle":
      case "flip":
        body.position.y = 0.6 + Math.sin(Math.PI * s) * 1.1;
        body.rotation.x = -Math.PI * 2 * s;
        legR.rotation.set(-1.6, 0, 0);
        return;
      case "slide":
        body.rotation.z = Math.PI / 2.4;
        body.position.y = 0.35;
        legR.rotation.set(-1.2, 0, 0);
        return;
      case "knee":
        body.position.y = -0.55;
        legL.rotation.set(1.5, 0, 0);
        legR.rotation.set(1.5, 0, 0);
        body.rotation.x = -0.25;
        armL.rotation.set(Math.PI * 0.95, 0, 0.5);
        armR.rotation.set(Math.PI * 0.95, 0, -0.5);
        return;
      case "card":
        armR.rotation.set(Math.PI, 0, -0.1);
        return;
      default:
        break;
    }
    if (p.arms) {
      const w = Math.sin(now / 90 + p.id);
      armL.rotation.set(Math.PI * 0.92 + w * 0.15, 0, 0.35);
      armR.rotation.set(Math.PI * 0.92 - w * 0.15, 0, -0.35);
      body.position.y += Math.abs(Math.sin(now / 140 + p.id)) * 0.25;
    } else if (p.sad) {
      body.rotation.x = 0.25;
      head.rotation.x = 0.5;
      armL.rotation.set(0, 0, 0.02);
      armR.rotation.set(0, 0, -0.02);
    }
  }

  private syncPlayers(s: Ps1Snapshot) {
    const live = new Set<number>();
    for (const p of s.players) {
      live.add(p.id);
      let r = this.rigs.get(p.id);
      if (r && r.key !== this.rigKey(p)) {
        this.disposeObj(r.root);
        this.rigs.delete(p.id);
        r = undefined;
      }
      if (!r) {
        r = this.makeRig(p);
        this.rigs.set(p.id, r);
      }
      r.root.visible = true;
      this.pose(p, r, s.now, s.ball);
    }
    for (const [id, r] of this.rigs) if (!live.has(id)) r.root.visible = false;
  }

  // ------------------------------------------------ quadro
  resize(cssW: number, cssH: number) {
    const res = internalRes(cssW, cssH);
    this.res = res;
    // tarja preta quando a área é mais larga que 2:1 ou mais estreita que 4:3
    let w = cssW, h = cssW / res.aspect;
    if (h > cssH) {
      h = cssH;
      w = cssH * res.aspect;
    }
    this.box.style.width = `${Math.floor(w)}px`;
    this.box.style.height = `${Math.floor(h)}px`;
    this.renderer.setSize(res.w, res.h, false);
    this.rt.setSize(res.w, res.h);
    this.hud.width = res.w;
    this.hud.height = res.h;
    this.uniforms.uRes.value.set(res.w, res.h);
    this.camera.aspect = res.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Desenha um quadro. live = retrato do jogo agora; dt em ms. */
  render(live: Ps1Snapshot, dt: number, hud: Ps1Hud) {
    if (this.disposed || this.lost) return;
    this.time += dt;
    // grava para o replay e detecta o gol
    if (!this.clip) this.replay.push(live);
    if (live.celebrating && !this.wasCelebrating && live.goalSide != null) {
      this.goalTimer = 2600;
      this.clipSide = live.goalSide;
      this.festa?.goal(this.time, live.goalSide === this.opts.festa?.side);
      this.pendingClip = this.time + 700; // mais um tiquinho: a bola estufando a rede
    }
    this.wasCelebrating = live.celebrating;
    if (this.pendingClip > 0 && this.time >= this.pendingClip) {
      this.pendingClip = -1;
      const all = this.replay.clip();
      const end = all.length ? all[all.length - 1].now : 0;
      const clip = all.filter((f) => f.now >= end - 4200);
      if (!this.opts.reduced && clip.length > 4) {
        this.clip = clip;
        this.clipT = -1900; // deixa o "GOL!" aparecer antes do replay
      }
    }
    if (this.goalTimer > 0) this.goalTimer -= dt;

    let snap = live;
    let replaying = false;
    if (this.clip) {
      this.clipT += dt * 0.7; // câmera lenta
      if (this.clipT >= 0) {
        const f = ReplayBuffer.at(this.clip, this.clipT);
        if (f && this.clipT <= ReplayBuffer.duration(this.clip)) {
          snap = f;
          replaying = true;
        } else {
          this.clip = null;
          this.replay.frames = [];
          this.cam = null;
        }
      }
    }

    this.syncPlayers(snap);
    const b = snap.ball;
    this.ball.position.set(b.x, 0.34 + b.h, b.z);
    this.ball.rotation.set(snap.now / 120, snap.now / 170, 0);
    this.ballShadow.position.set(b.x, 0.03, b.z);
    for (const n of this.nets) {
      const shake = snap.netShake === n.side ? Math.sin(this.time / 30) * 0.35 : 0;
      n.mesh.position.x = n.x0 + (n.side === 0 ? 1 : -1) * Math.abs(shake);
    }
    // torcida pulando no gol: a textura "sobe e desce" 1 texel
    const jump = snap.cheer ? (Math.floor(this.time / 120) % 2) / 64 : 0;
    for (const t of this.crowdTex) t.offset.y = jump;
    this.festa?.update(this.time, dt, !!snap.cheer && this.clipSide === this.opts.festa?.side, this.opts.reduced);

    const to = replaying ? behindGoalCam(this.clipSide, b.x, b.z) : broadcastCam(b.x, b.z, this.res.aspect);
    this.cam = this.cam && !replaying ? easeCam(this.cam, to, dt, 380) : replaying && this.cam ? easeCam(this.cam, to, dt, 180) : to;
    if (replaying && this.clipT < 40) this.cam = to; // corte seco para a câmera do replay
    const c = this.cam;
    this.camera.position.set(...c.pos);
    this.camera.lookAt(...c.look);
    if (Math.abs(this.camera.fov - c.fov) > 0.01) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }

    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
    this.drawHud(snap, hud, replaying);
  }

  private project(x: number, y: number, z: number): [number, number] | null {
    this.v3.set(x, y, z).project(this.camera);
    if (this.v3.z > 1) return null;
    return [Math.round((this.v3.x * 0.5 + 0.5) * this.res.w), Math.round((-this.v3.y * 0.5 + 0.5) * this.res.h)];
  }

  private drawHud(s: Ps1Snapshot, hud: Ps1Hud, replaying: boolean) {
    const g = this.hg;
    const { w, h } = this.res;
    g.clearRect(0, 0, w, h);
    // placar no canto (caixa azul-marinho com borda, como no WE)
    const sc = `${hud.score[0]}-${hud.score[1]}`;
    const line = `${hud.abbr[0]} ${sc} ${hud.abbr[1]}`;
    const bw = textWidth(line) + 18;
    const bx = 6, by = 6;
    g.fillStyle = hud.frame?.[0] ?? "rgba(8,16,48,0.82)";
    g.fillRect(bx, by, bw, 22);
    g.fillStyle = hud.frame?.[1] ?? "#c9d6ff";
    g.fillRect(bx, by, bw, 1);
    g.fillRect(bx, by + 21, bw, 1);
    g.fillStyle = hud.color[0];
    g.fillRect(bx + 3, by + 3, 3, 7);
    g.fillStyle = hud.color[1];
    g.fillRect(bx + bw - 6, by + 3, 3, 7);
    drawText(g, line, bx + 9, by + 3, "#ffffff", 1, "#000000");
    drawText(g, hud.clock, bx + 9, by + 13, "#ffe14a", 1, "#000000");

    if (!replaying) {
      // cursor sobre quem está com a bola + caixa com nome e número embaixo
      const p = s.holder != null ? s.players.find((q) => q.id === s.holder) : undefined;
      if (p && p.side !== 2) {
        const pt = this.project(p.x, 2.95 * PLAYER_SCALE, p.z);
        const col = hud.color[p.side];
        if (pt) {
          const [x, y] = pt;
          const bob = Math.floor(this.time / 200) % 2;
          g.fillStyle = "#000000";
          for (let i = 0; i < 6; i++) g.fillRect(x - 6 + i, y - 9 + i + bob, 13 - i * 2, 1);
          g.fillStyle = col;
          for (let i = 0; i < 5; i++) g.fillRect(x - 4 + i, y - 8 + i + bob, 9 - i * 2, 1);
        }
        const label = `${p.num || ""} ${p.name}`.trim();
        const lw = textWidth(label) + 14;
        const lx = Math.round((w - lw) / 2), ly = h - 17;
        g.fillStyle = "rgba(8,16,48,0.85)";
        g.fillRect(lx, ly, lw, 13);
        g.fillStyle = col;
        g.fillRect(lx, ly, 4, 13);
        g.fillStyle = "#c9d6ff";
        g.fillRect(lx, ly, lw, 1);
        g.fillRect(lx, ly + 12, lw, 1);
        drawText(g, label, lx + 9, ly + 3, "#ffffff", 1, "#000000");
      }
    }
    if (this.goalTimer > 0 && !replaying) {
      const t = 2600 - this.goalTimer;
      const scale = t < 200 ? 2 : 3;
      const txt = "GOAL!";
      const tw = textWidth(txt, scale);
      const flash = Math.floor(t / 110) % 2;
      const y = Math.round(h * 0.36 - Math.max(0, 1 - t / 250) * 40);
      drawText(g, txt, Math.round((w - tw) / 2), y, flash ? "#ffe14a" : "#ff5a2a", scale, "#000000");
    }
    if (replaying) {
      if (Math.floor(this.time / 450) % 2 === 0) {
        g.fillStyle = "#d61b1b";
        g.fillRect(w - 62, 8, 6, 6);
      }
      drawText(g, "REPLAY", w - 52, 8, "#ffffff", 1, "#000000");
      g.fillStyle = "rgba(0,0,0,0.9)";
      g.fillRect(0, 0, w, 3);
      g.fillRect(0, h - 3, w, 3);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.glCanvas.removeEventListener("webglcontextlost", this.onLost);
    this.glCanvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.postScene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    this.festa?.dispose();
    this.postMat.dispose();
    for (const t of this.textures) t.dispose();
    for (const t of this.shirtTex.values()) t.dispose();
    this.rt.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.box.remove();
  }
}
