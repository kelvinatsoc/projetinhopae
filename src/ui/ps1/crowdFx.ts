// Festa da torcida brasileira no modo 📼 Retrô PS1: torcedores pulando e fazendo a ola,
// bandeiras ondulando, bandeirão sobre a arquibancada, mosaico, sinalizadores, fumaça colorida
// e papel picado no gol.
// Desempenho: cada efeito é UMA malha instanciada (InstancedBufferGeometry) animada inteiramente
// no shader a partir de uniforms de tempo. Por quadro a CPU só escreve meia dúzia de números:
// nenhuma alocação, nenhum laço sobre partículas, mesma velocidade em 60 ou 120 Hz.
// Transparência "screen-door" (pontilhado com descarte), como no PS1: sem ordenação nem blending.
import * as THREE from "three";
import { drawText, textWidth } from "./font";

/** Uma arquibancada como o Ps1Renderer a montou (grupo posicionado e girado). */
export interface StandInfo { len: number; rot: number; x: number; z: number; t: number; d: number; h: number }

export interface FestaOptions {
  level: number; // 0..1
  selecao: boolean;
  colors: [string, string, string];
  abbr: string;
  /** arquibancadas da torcida dona da casa: t = 0 (fundo esquerdo) e 2 (lados) */
  stands: StandInfo[];
  /** lado da torcida: 0 = mandante (fundo esquerdo), 1 = visitante */
  side: 0 | 1;
}

export interface SharedUniforms {
  uRes: { value: THREE.Vector2 };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uSnap: { value: number };
}

const H0 = 1.6;

function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Ponto sobre a arquibancada: u ao longo (-len/2..len/2), k na profundidade (0 frente .. 1 fundo). */
function standPoint(s: StandInfo, u: number, k: number, out: number[]) {
  const ly = H0 + (s.h - H0) * k;
  const lz = -k * s.d;
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  out[0] = s.x + u * c + lz * sn;
  out[1] = ly;
  out[2] = s.z - u * sn + lz * c;
}

const COMMON = /* glsl */ `
uniform vec2 uRes;
uniform float uSnap;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
varying float vFog;
vec4 psx(vec4 mv) {
  vec4 p = projectionMatrix * mv;
  if (uSnap > 0.5 && p.w > 0.0) { vec2 g = uRes * 0.5; p.xy = floor(p.xy / p.w * g + 0.5) / g * p.w; }
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
  return p;
}
const vec4 HIDDEN = vec4(2.0, 2.0, 2.0, 1.0);
`;

const FRAG_COMMON = /* glsl */ `
uniform vec3 uFogColor;
varying float vFog;
float bayer2(vec2 a) { return mod(2.0 * a.x + 3.0 * a.y, 4.0); }
float bayer4(vec2 p) { p = mod(floor(p), 4.0); return (4.0 * bayer2(mod(p, 2.0)) + bayer2(floor(p / 2.0))) / 16.0; }
`;

// torcedores que levantam (pulo no gol / ola): só aparecem quando sobem
const FANS_VERT = COMMON + /* glsl */ `
attribute vec3 aPos;
attribute vec3 aCol;
attribute vec2 aInfo; // x: posição na volta da ola (0..1), y: semente
uniform float uJump;
uniform float uOlaT;
varying vec3 vCol;
void main() {
  float ola = 0.0;
  if (uOlaT >= 0.0 && uOlaT < 9.0) {
    float d = aInfo.x - uOlaT / 9.0;
    d -= floor(d + 0.5);
    ola = exp(-d * d / 0.0009);
  }
  float jump = uJump * abs(sin(uTime * 9.0 + aInfo.y * 31.0));
  float lift = max(ola * 1.4, jump * 0.9);
  if (lift < 0.12) { gl_Position = HIDDEN; vCol = vec3(0.0); vFog = 0.0; return; }
  vec4 mv = modelViewMatrix * vec4(aPos + vec3(0.0, lift, 0.0), 1.0);
  mv.xy += position.xy * vec2(1.3, 2.6);
  gl_Position = psx(mv);
  // parte de cima: braços e cabeça (pele); embaixo, a camisa
  vCol = position.y > 0.7 ? vec3(0.93, 0.76, 0.6) : aCol;
}
`;
const FLAT_FRAG = FRAG_COMMON + /* glsl */ `
varying vec3 vCol;
void main() { gl_FragColor = vec4(mix(vCol, uFogColor, vFog), 1.0); }
`;

// bandeiras no mastro, ondulando (presas do lado do mastro)
const FLAG_VERT = COMMON + /* glsl */ `
attribute vec3 aPos;
attribute vec4 aDir; // cos, sen do giro, largura, altura
attribute vec3 aAtlas; // u0, v0, fase
varying vec2 vUv;
void main() {
  float u = position.x + 0.5;
  float w = aDir.z, h = aDir.w;
  float wave = sin(uTime * 3.2 - u * 5.0 + aAtlas.z) * 0.32 * u * w * 0.4;
  float sag = -u * u * 0.12 * h;
  vec3 l = vec3(u * w, position.y * h + sag + h * 0.5, wave);
  vec3 wp = aPos + vec3(l.x * aDir.x + l.z * aDir.y, l.y, -l.x * aDir.y + l.z * aDir.x);
  gl_Position = psx(modelViewMatrix * vec4(wp, 1.0));
  vUv = vec2(aAtlas.x + uv.x * 0.25, aAtlas.y + uv.y * 0.5);
}
`;
const TEX_FRAG = FRAG_COMMON + /* glsl */ `
uniform sampler2D uMap;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  if (uAlpha < 1.0 && uAlpha <= bayer4(gl_FragCoord.xy)) discard;
  vec3 c = texture2D(uMap, vUv).rgb;
  gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
}
`;

// pano grande deitado sobre a arquibancada (bandeirão / mosaico): ondula pela normal
const CLOTH_VERT = COMMON + /* glsl */ `
uniform float uWave;
varying vec2 vUv;
void main() {
  vec3 p = position + normal * (uWave * sin(uTime * 2.2 + position.x * 0.35 + position.z * 0.35) * 0.7 + 0.25);
  gl_Position = psx(modelViewMatrix * vec4(p, 1.0));
  vUv = uv;
}
`;

// partículas de fumaça, sinalizador e papel picado (billboards); vida contada desde o gol
const PART_VERT = COMMON + /* glsl */ `
attribute vec3 aPos;
attribute vec3 aCol;
attribute vec4 aInfo; // x: atraso (s), y: vida (s), z: semente, w: tipo (0 fumaça, 1 sinalizador, 2 papel)
uniform float uGoalT; // segundos desde o gol (negativo = nada)
uniform float uLevel;
varying vec3 vCol;
varying float vA;
void main() {
  float t = uGoalT - aInfo.x;
  if (uGoalT < 0.0 || t < 0.0 || t > aInfo.y || aInfo.z > uLevel + 0.15) { gl_Position = HIDDEN; vCol = vec3(0.0); vA = 0.0; vFog = 0.0; return; }
  float s = t / aInfo.y;
  vec3 p = aPos;
  float size;
  vCol = aCol;
  vA = 1.0;
  if (aInfo.w < 0.5) {
    // fumaça: sobe, o vento empurra, cresce e some
    p += vec3(t * 0.9 + sin(t + aInfo.z * 20.0) * 0.8, t * 1.5, sin(aInfo.z * 40.0) * t * 0.4);
    size = 3.0 + s * 9.0;
    vA = (1.0 - s) * 0.8;
  } else if (aInfo.w < 1.5) {
    // sinalizador: chama piscando
    float f = fract(sin(floor(uTime * 18.0) + aInfo.z * 91.0) * 43758.5);
    size = 1.1 + f * 0.9;
    vCol = mix(vec3(1.0, 0.3, 0.1), vec3(1.0, 0.95, 0.7), f);
  } else {
    // papel picado: cai girando
    p += vec3(sin(t * 2.3 + aInfo.z * 50.0) * 1.2, -t * 1.7, cos(t * 1.9 + aInfo.z * 30.0) * 1.2);
    size = 0.55 * (0.4 + 0.6 * abs(sin(t * 7.0 + aInfo.z * 13.0)));
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * size;
  gl_Position = psx(mv);
}
`;
const PART_FRAG = FRAG_COMMON + /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  if (vA <= bayer4(gl_FragCoord.xy)) discard;
  gl_FragColor = vec4(mix(vCol, uFogColor, vFog), 1.0);
}
`;

export class CrowdFx {
  readonly group = new THREE.Group();
  private u = {
    uTime: { value: 0 },
    uJump: { value: 0 },
    uOlaT: { value: -1 },
    uGoalT: { value: -1 },
    uLevel: { value: 1 },
  };
  private tifoAlpha = { value: 0 };
  private bandWave = { value: 0 };
  private bandAlpha = { value: 0 };
  private mats: THREE.ShaderMaterial[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private texs: THREE.Texture[] = [];
  private goalAt = -1;
  private olaAt = -1e9;
  private nextOla = 45;
  private tifoUntil = 9;
  private level: number;

  constructor(private o: FestaOptions, private shared: SharedUniforms) {
    this.level = Math.max(0.25, Math.min(1, o.level));
    this.u.uLevel.value = this.level;
    this.group.name = "festa";
    const [c0, c1, c2] = o.selecao ? ["#1a9a3c", "#f7d117", "#1f3f9a"] : o.colors;
    this.buildFans(c0, c1);
    const atlas = this.flagAtlas(c0, c1, c2);
    this.buildFlags(atlas);
    this.buildCloths(c0, c1, c2);
    this.buildParticles(c0, c1, c2);
  }

  private mat(vert: string, frag: string, extra: Record<string, { value: unknown }> = {}): THREE.ShaderMaterial {
    const s = this.shared;
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uRes: s.uRes, uSnap: s.uSnap, uFogNear: s.uFogNear, uFogFar: s.uFogFar, uFogColor: s.uFogColor, ...this.u, ...extra },
      side: THREE.DoubleSide,
    });
    this.mats.push(m);
    return m;
  }

  private add(geo: THREE.BufferGeometry, m: THREE.ShaderMaterial) {
    this.geos.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    return mesh;
  }

  private quad(instances: number, attrs: Record<string, [Float32Array, number]>, segX = 1, segY = 1): THREE.InstancedBufferGeometry {
    const base = new THREE.PlaneGeometry(1, 1, segX, segY);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.getAttribute("position"));
    g.setAttribute("uv", base.getAttribute("uv"));
    for (const [k, [arr, n]] of Object.entries(attrs)) g.setAttribute(k, new THREE.InstancedBufferAttribute(arr, n));
    g.instanceCount = instances;
    return g;
  }

  /** ângulo do ponto em volta do campo (0..1), para a ola andar em volta do estádio */
  private ang(x: number, z: number) {
    return (Math.atan2(z * 1.5, x) / (Math.PI * 2) + 1) % 1;
  }

  private buildFans(c0: string, c1: string) {
    const stands = this.o.stands;
    const per = Math.round(260 + this.level * 340);
    const n = per * stands.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), info = new Float32Array(n * 2);
    const cols = [rgb(c0), rgb(c0), rgb(c1), [0.95, 0.95, 0.95] as [number, number, number]];
    const p = [0, 0, 0];
    let i = 0;
    for (const s of stands) {
      for (let k = 0; k < per; k++, i++) {
        standPoint(s, (Math.random() - 0.5) * s.len * 0.94, 0.08 + Math.random() * 0.85, p);
        pos.set(p, i * 3);
        col.set(cols[Math.floor(Math.random() * cols.length)], i * 3);
        info[i * 2] = this.ang(p[0], p[2]);
        info[i * 2 + 1] = Math.random();
      }
    }
    const g = this.quad(n, { aPos: [pos, 3], aCol: [col, 3], aInfo: [info, 2] });
    g.translate(0, 0.5, 0);
    this.add(g, this.mat(FANS_VERT, FLAT_FRAG));
  }

  /** atlas 4x2 com desenhos de bandeira nas cores do clube (ou da Seleção) */
  private flagAtlas(c0: string, c1: string, c2: string): THREE.Texture {
    const W = 128, H = 64, fw = 32, fh = 32;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d")!;
    for (let k = 0; k < 8; k++) {
      const x = (k % 4) * fw, y = Math.floor(k / 4) * fh;
      if (this.o.selecao) {
        g.fillStyle = "#1a9a3c";
        g.fillRect(x, y, fw, fh);
        g.fillStyle = "#f7d117";
        g.beginPath();
        g.moveTo(x + fw / 2, y + 3); g.lineTo(x + fw - 3, y + fh / 2); g.lineTo(x + fw / 2, y + fh - 3); g.lineTo(x + 3, y + fh / 2);
        g.fill();
        g.fillStyle = "#1f3f9a";
        g.beginPath();
        g.arc(x + fw / 2, y + fh / 2, 7, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      const v = k % 4;
      if (v === 0) { // listras verticais
        for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? c1 : c0; g.fillRect(x + i * 8, y, 8, fh); }
      } else if (v === 1) { // metade/metade
        g.fillStyle = c0; g.fillRect(x, y, fw, fh / 2);
        g.fillStyle = c1; g.fillRect(x, y + fh / 2, fw, fh / 2);
      } else if (v === 2) { // faixa diagonal
        g.fillStyle = c0; g.fillRect(x, y, fw, fh);
        g.fillStyle = c1;
        g.beginPath(); g.moveTo(x, y + fh); g.lineTo(x + 10, y + fh); g.lineTo(x + fw, y + 10); g.lineTo(x + fw, y); g.lineTo(x + fw - 10, y); g.lineTo(x, y + fh - 10); g.fill();
      } else { // fundo com estrela
        g.fillStyle = c0; g.fillRect(x, y, fw, fh);
        g.fillStyle = c2 === c0 ? c1 : c2;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 4 : 10, a = -Math.PI / 2 + (i * Math.PI) / 5;
          g.lineTo(x + fw / 2 + Math.cos(a) * r, y + fh / 2 + Math.sin(a) * r);
        }
        g.fill();
      }
    }
    return this.tex(cv);
  }

  private tex(cv: HTMLCanvasElement): THREE.Texture {
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    this.texs.push(t);
    return t;
  }

  private buildFlags(atlas: THREE.Texture) {
    const stands = this.o.stands;
    const per = 3 + Math.round(this.level * 5);
    const n = per * stands.length;
    const pos = new Float32Array(n * 3), dir = new Float32Array(n * 4), at = new Float32Array(n * 3);
    const p = [0, 0, 0];
    let i = 0;
    for (const s of stands) {
      for (let k = 0; k < per; k++, i++) {
        standPoint(s, ((k + 0.5) / per - 0.5) * s.len * 0.85, 0.15 + (k % 3) * 0.25, p);
        pos.set([p[0], p[1] + 1.2, p[2]], i * 3);
        const big = Math.random() < 0.35;
        dir.set([Math.cos(s.rot), Math.sin(s.rot), big ? 6 : 3.5, big ? 4 : 2.4], i * 4);
        const a = Math.floor(Math.random() * 8);
        at.set([(a % 4) * 0.25, Math.floor(a / 4) * 0.5, Math.random() * 6.28], i * 3);
      }
    }
    const g = this.quad(n, { aPos: [pos, 3], aDir: [dir, 4], aAtlas: [at, 3] }, 6, 2);
    this.add(g, this.mat(FLAG_VERT, TEX_FRAG, { uMap: { value: atlas }, uAlpha: { value: 1 } }));
  }

  /** malha que segue a inclinação de uma arquibancada (u0..u1 ao longo, k0..k1 na profundidade) */
  private slope(s: StandInfo, u0: number, u1: number, k0: number, k1: number, nx: number, ny: number): THREE.BufferGeometry {
    const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
    const p = [0, 0, 0];
    // normal da rampa (para fora/cima), no mundo
    const ny0 = s.d, nz0 = s.h - H0;
    const len = Math.hypot(ny0, nz0);
    const ln = [0, ny0 / len, nz0 / len];
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const wn = [ln[2] * sn, ln[1], ln[2] * c];
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const u = u0 + ((u1 - u0) * i) / nx, k = k0 + ((k1 - k0) * j) / ny;
        standPoint(s, u, k, p);
        pos.push(p[0], p[1], p[2]);
        uv.push(i / nx, j / ny);
        nor.push(wn[0], wn[1], wn[2]);
      }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      idx.push(a, b, e, a, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }

  private buildCloths(c0: string, c1: string, c2: string) {
    const stands = this.o.stands;
    // bandeirão: na arquibancada atrás do gol (a mais "organizada"), passa por cima da torcida
    const end = stands.find((s) => s.t !== 2) ?? stands[0];
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 32;
    const g = cv.getContext("2d")!;
    if (this.o.selecao) {
      g.fillStyle = "#1a9a3c"; g.fillRect(0, 0, 64, 32);
      g.fillStyle = "#f7d117"; g.beginPath(); g.moveTo(32, 3); g.lineTo(60, 16); g.lineTo(32, 29); g.lineTo(4, 16); g.fill();
      g.fillStyle = "#1f3f9a"; g.beginPath(); g.arc(32, 16, 8, 0, 6.3); g.fill();
    } else {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c1 : c0; g.fillRect(0, i * 4, 64, 4); }
      g.fillStyle = c2 === c0 ? c1 : c2;
      g.fillRect(22, 6, 20, 20);
    }
    const band = this.slope(end, -end.len * 0.32, end.len * 0.32, 0.15, 0.85, 16, 6);
    this.add(band, this.mat(CLOTH_VERT, TEX_FRAG, { uMap: { value: this.tex(cv) }, uAlpha: this.bandAlpha, uWave: this.bandWave }));
    // mosaico: na arquibancada da frente da câmera (a do lado oposto), com o nome do clube
    const side = stands.find((s) => s.t === 2) ?? stands[0];
    const tv = document.createElement("canvas");
    tv.width = 128;
    tv.height = 32;
    const tg = tv.getContext("2d")!;
    tg.imageSmoothingEnabled = false;
    for (let x = 0; x < 128; x += 8) { tg.fillStyle = (x / 8) % 2 ? c1 : c0; tg.fillRect(x, 0, 8, 32); }
    tg.fillStyle = c0;
    tg.fillRect(24, 6, 80, 20);
    const txt = this.o.selecao ? "BRASIL" : this.o.abbr.slice(0, 6);
    const sc = 2;
    drawText(tg, txt, Math.round((128 - textWidth(txt, sc)) / 2), 9, c1 === c0 ? "#ffffff" : c1, sc);
    const tifo = this.slope(side, -side.len * 0.28, side.len * 0.28, 0.12, 0.92, 12, 4);
    // a arquibancada oposta está girada de frente para a câmera; o texto precisa ler da esquerda para a direita
    this.add(tifo, this.mat(CLOTH_VERT, TEX_FRAG, { uMap: { value: this.tex(tv) }, uAlpha: this.tifoAlpha, uWave: { value: 0 } }));
  }

  private buildParticles(c0: string, c1: string, c2: string) {
    const stands = this.o.stands;
    const nSmoke = 110, nFlare = 34, nPaper = 600;
    const n = nSmoke + nFlare + nPaper;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), info = new Float32Array(n * 4);
    const smoke = [rgb(c0), rgb(c1), [0.85, 0.2, 0.15] as [number, number, number]];
    const paper = [[1, 1, 1], [1, 1, 1], rgb(c0), rgb(c1), rgb(c2)] as [number, number, number][];
    const flareAt: number[][] = [];
    const p = [0, 0, 0];
    for (let i = 0; i < nFlare; i++) {
      const s = stands[i % stands.length];
      standPoint(s, (Math.random() - 0.5) * s.len * 0.8, 0.05 + Math.random() * 0.4, p);
      flareAt.push([p[0], p[1] + 0.6, p[2]]);
    }
    let i = 0;
    for (let k = 0; k < nSmoke; k++, i++) {
      const f = flareAt[k % nFlare];
      pos.set(f, i * 3);
      col.set(smoke[k % smoke.length], i * 3);
      info.set([0.2 + Math.random() * 7, 3 + Math.random() * 2.5, Math.random(), 0], i * 4);
    }
    for (let k = 0; k < nFlare; k++, i++) {
      pos.set(flareAt[k], i * 3);
      col.set([1, 0.4, 0.1], i * 3);
      info.set([Math.random() * 0.6, 7 + Math.random() * 3, Math.random(), 1], i * 4);
    }
    for (let k = 0; k < nPaper; k++, i++) {
      const s = stands[k % stands.length];
      standPoint(s, (Math.random() - 0.5) * s.len, 0.3 + Math.random() * 0.7, p);
      pos.set([p[0], p[1] + 4 + Math.random() * 5, p[2]], i * 3);
      col.set(paper[k % paper.length], i * 3);
      info.set([Math.random() * 2.5, 4 + Math.random() * 4, Math.random(), 2], i * 4);
    }
    const g = this.quad(n, { aPos: [pos, 3], aCol: [col, 3], aInfo: [info, 4] });
    this.add(g, this.mat(PART_VERT, PART_FRAG));
  }

  /** Gol: se for da torcida dona da casa, explode a festa. */
  goal(timeMs: number, forCrowd: boolean) {
    if (!forCrowd) return;
    this.goalAt = timeMs / 1000;
    if (Math.random() < 0.6) this.olaAt = this.goalAt + 5;
  }

  /** Atualiza só os uniforms (chamado a cada quadro com o tempo do renderizador, em ms). */
  update(timeMs: number, dt: number, cheer: boolean, reduced: boolean) {
    const ease = 1 - Math.exp(-dt / 250);
    const t = timeMs / 1000;
    const u = this.u;
    u.uTime.value = t;
    if (reduced) {
      u.uJump.value = 0;
      u.uOlaT.value = -1;
      u.uGoalT.value = -1;
      this.tifoAlpha.value = 0;
      this.bandAlpha.value = 1;
      this.bandWave.value = 0;
      return;
    }
    const since = this.goalAt >= 0 ? t - this.goalAt : -1;
    u.uGoalT.value = since >= 0 && since < 14 ? since : -1;
    const target = cheer ? 1 : 0;
    u.uJump.value += (target - u.uJump.value) * ease;
    if (t > this.nextOla) {
      this.nextOla = t + 70 + Math.random() * 60 * (1.3 - this.level);
      if (t - this.olaAt > 15) this.olaAt = t;
    }
    const ot = t - this.olaAt;
    u.uOlaT.value = ot >= 0 && ot < 9 ? ot : -1;
    // mosaico na entrada em campo; bandeirão sobe no começo e depois de cada gol
    this.tifoAlpha.value = t < this.tifoUntil ? Math.min(1, (this.tifoUntil - t) / 1.5) : 0;
    const bandOn = t < this.tifoUntil + 6 || (since >= 0 && since < 12);
    this.bandAlpha.value += ((bandOn ? 1 : 0) - this.bandAlpha.value) * ease * 0.5;
    this.bandWave.value = 0.6 + 0.4 * Math.sin(t * 0.7);
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
    for (const t of this.texs) t.dispose();
  }
}
