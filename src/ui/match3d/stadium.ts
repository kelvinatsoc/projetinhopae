// Estádio 3D do clube mandante: gramado PBR com listras de corte e marcações, traves com rede,
// placas de LED, arquibancadas em degraus com cadeiras nas cores do estádio, cobertura, torres
// de refletores, céu de fim de tarde, cidade em volta e a torcida 3D (crowd.ts).
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { StadiumStyle } from "../../data/stadiumStyles";
import { PITCH_LEN, PITCH_WID } from "../pitchGeom";
import { canvasTex, Festa, FanCrowd, type FanSpot } from "./crowd";
import type { Quality } from "./model";

export const HALF_L = PITCH_LEN / 2;
export const HALF_W = PITCH_WID / 2;
export const GOAL_W = 7.32;
export const GOAL_H = 2.44;

export interface StadiumOpts {
  style: StadiumStyle;
  quality: Quality;
  /** cores dos dois clubes e siglas */
  home: { colors: readonly string[]; abbr: string; name: string };
  away: { colors: readonly string[]; abbr: string; name: string };
  neutral: boolean;
  /** torcida dominante (a que faz festa e pode ir embora) */
  crowdSide: 0 | 1;
  /** força da festa 0..1 (0 = sem festa: clube estrangeiro) */
  festa: number;
  reduced: boolean;
}

/** Gerador determinístico (o cenário não mexe no gerador do jogo). */
export function prng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const AREA_L = 132, AREA_W = 92; // gramado com a área em volta (m)

/** Textura do gramado: listras/xadrez de corte, variação natural e as linhas. */
function pitchTexture(st: StadiumStyle, q: Quality): THREE.CanvasTexture {
  const W = q === "alta" ? 4096 : 2048;
  const S = W / AREA_L;
  const H = Math.round(AREA_W * S);
  const t = canvasTex(W, H, (g) => {
    const X = (m: number) => (m + AREA_L / 2) * S;
    const Y = (m: number) => (m + AREA_W / 2) * S;
    const A = "#33852d", B = "#286b24";
    g.fillStyle = A;
    g.fillRect(0, 0, W, H);
    g.fillStyle = B;
    const mow = st.mow;
    if (mow === "rings") {
      for (let r = 100; r > 0; r -= 5.5) {
        g.fillStyle = Math.round(r / 5.5) % 2 ? A : B;
        g.beginPath();
        g.ellipse(X(0), Y(0), r * S, r * S, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else if (mow === "diagonal") {
      g.save();
      g.translate(X(0), Y(0));
      g.rotate(Math.PI / 4);
      for (let i = -20; i < 20; i += 2) g.fillRect(i * 6 * S, -120 * S, 6 * S, 240 * S);
      g.restore();
    } else {
      const band = mow === "wide" ? PITCH_LEN / 10 : PITCH_LEN / 18;
      if (mow !== "rows") for (let i = -12; i < 12; i += 2) g.fillRect(X(-HALF_L + i * band), 0, band * S, H);
      if (mow === "rows" || mow === "checker") {
        const bw = PITCH_WID / 10;
        g.globalCompositeOperation = mow === "checker" ? "xor" : "source-over";
        for (let i = -8; i < 8; i += 2) g.fillRect(0, Y(-HALF_W + i * bw), W, bw * S);
        g.globalCompositeOperation = "source-over";
        if (mow === "checker") {
          // xor apaga: repinta o fundo por trás
          g.globalCompositeOperation = "destination-over";
          g.fillStyle = A;
          g.fillRect(0, 0, W, H);
          g.globalCompositeOperation = "source-over";
        }
      }
    }
    // área fora do campo um pouco mais escura; pista de atletismo
    g.fillStyle = "rgba(10,30,8,0.18)";
    g.fillRect(0, 0, W, Y(-HALF_W - 2));
    g.fillRect(0, Y(HALF_W + 2), W, H);
    g.fillRect(0, 0, X(-HALF_L - 2), H);
    g.fillRect(X(HALF_L + 2), 0, W, H);
    const isMorumbi = st.landmarks.includes("morumbi-ring") || st.key === "morumbis";
    if (isMorumbi || st.track) {
      const trackCol = isMorumbi ? "#a83c2e" : st.track!;
      // Pista de atletismo com retas laterais e curvas semicirculares atrás dos gols
      const drawTrackPath = (offset: number, lw: number, strokeStyle: string) => {
        g.strokeStyle = strokeStyle;
        g.lineWidth = lw;
        const R = (HALF_W + 5 + offset) * S;
        const xStraight = 28;
        const cxR = X(xStraight), cxL = X(-xStraight), cy = Y(0);
        g.beginPath();
        g.moveTo(cxL, cy - R);
        g.lineTo(cxR, cy - R);
        g.arc(cxR, cy, R, -Math.PI / 2, Math.PI / 2);
        g.lineTo(cxL, cy + R);
        g.arc(cxL, cy, R, Math.PI / 2, (3 * Math.PI) / 2);
        g.closePath();
        g.stroke();
      };
      // Base de tartã da pista (largura total)
      drawTrackPath(0, 9.5 * S, trackCol);
      // Raias brancas da pista de atletismo (6 raias)
      for (let r = 0; r <= 6; r++) {
        const off = -4.2 + r * 1.4;
        drawTrackPath(off, Math.max(1, 0.09 * S), "rgba(255,255,255,0.48)");
      }
    }
    if (isMorumbi) {
      // Escudo oficial do São Paulo FC pintado na grama sintética atrás de cada baliza
      const drawSpfcCrest = (cx: number, cy: number, sz: number) => {
        g.save();
        g.translate(cx, cy);
        const w = sz, h = sz * 0.96;
        // base branca do escudo
        g.beginPath();
        g.moveTo(-w / 2, -h / 2);
        g.lineTo(w / 2, -h / 2);
        g.lineTo(w / 2, 0);
        g.lineTo(0, h / 2);
        g.lineTo(-w / 2, 0);
        g.closePath();
        g.fillStyle = "#ffffff";
        g.fill();
        g.strokeStyle = "#121212";
        g.lineWidth = Math.max(2, 0.12 * S);
        g.stroke();
        // triângulos tricolores inferiores: vermelho à esquerda, preto à direita
        g.beginPath();
        g.moveTo(-w / 2 + 0.12 * S, 0);
        g.lineTo(0, h / 2 - 0.2 * S);
        g.lineTo(0, 0);
        g.closePath();
        g.fillStyle = "#c4122f";
        g.fill();
        g.beginPath();
        g.moveTo(w / 2 - 0.12 * S, 0);
        g.lineTo(0, h / 2 - 0.2 * S);
        g.lineTo(0, 0);
        g.closePath();
        g.fillStyle = "#121212";
        g.fill();
        // faixas superiores: vermelho à esquerda, preto à direita
        g.fillStyle = "#c4122f";
        g.fillRect(-w / 2 + 0.12 * S, -h / 2 + 0.12 * S, w * 0.45, 0.42 * S);
        g.fillStyle = "#121212";
        g.fillRect(w * 0.05, -h / 2 + 0.12 * S, w * 0.45 - 0.12 * S, 0.42 * S);
        // texto SPFC no meio da faixa branca
        g.font = `900 ${Math.round(w * 0.26)}px "Barlow Condensed", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#121212";
        g.fillText("SPFC", 0, -h * 0.16);
        // estrelas douradas (mundiais) e vermelhas no topo
        for (let i = -2; i <= 2; i++) {
          g.beginPath();
          g.arc(i * 0.58 * S, -h / 2 - 0.38 * S, 0.18 * S, 0, Math.PI * 2);
          g.fillStyle = Math.abs(i) <= 1 ? "#ffd700" : "#c4122f";
          g.fill();
        }
        g.restore();
      };
      drawSpfcCrest(X(-HALF_L - 6.5), Y(0), 7 * S);
      drawSpfcCrest(X(HALF_L + 6.5), Y(0), 7 * S);
    }
    // variação natural (manchas e grão)
    const r = prng(7);
    for (let i = 0; i < 2600; i++) {
      const x = r() * W, y = r() * H, rr = (0.4 + r() * 2.2) * S;
      g.fillStyle = r() < 0.5 ? "rgba(255,255,190,0.035)" : "rgba(0,30,0,0.05)";
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * 16;
      d[i] += n * 0.6;
      d[i + 1] += n;
      d[i + 2] += n * 0.4;
    }
    g.putImageData(img, 0, 0);
    // linhas
    g.strokeStyle = "rgba(250,250,245,0.92)";
    g.lineWidth = Math.max(2, 0.12 * S);
    const rect = (x0: number, y0: number, x1: number, y1: number) => g.strokeRect(X(x0), Y(y0), (x1 - x0) * S, (y1 - y0) * S);
    rect(-HALF_L, -HALF_W, HALF_L, HALF_W);
    g.beginPath();
    g.moveTo(X(0), Y(-HALF_W));
    g.lineTo(X(0), Y(HALF_W));
    g.stroke();
    g.beginPath();
    g.arc(X(0), Y(0), 9.15 * S, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(250,250,245,0.95)";
    const spot = (x: number) => {
      g.beginPath();
      g.arc(X(x), Y(0), 0.2 * S, 0, Math.PI * 2);
      g.fill();
    };
    spot(0);
    for (const sx of [-1, 1]) {
      const gx = sx * HALF_L;
      rect(Math.min(gx, gx - sx * 16.5), -20.16, Math.max(gx, gx - sx * 16.5), 20.16);
      rect(Math.min(gx, gx - sx * 5.5), -9.16, Math.max(gx, gx - sx * 5.5), 9.16);
      spot(gx - sx * 11);
      // meia-lua
      const a = Math.acos(5.5 / 9.15);
      g.beginPath();
      if (sx > 0) g.arc(X(gx - 11), Y(0), 9.15 * S, Math.PI - a, Math.PI + a);
      else g.arc(X(gx + 11), Y(0), 9.15 * S, -a, a);
      g.stroke();
      for (const sz of [-1, 1]) {
        g.beginPath();
        const s0 = sx > 0 ? (sz > 0 ? Math.PI : Math.PI / 2) : sz > 0 ? -Math.PI / 2 : 0;
        g.arc(X(gx), Y(sz * HALF_W), 1 * S, sz > 0 ? s0 : s0, s0 + Math.PI / 2);
        g.stroke();
      }
    }
  });
  t.anisotropy = 8;
  return t;
}

/** Relevo fino da grama (repetido muitas vezes, canal de UV próprio). */
function grassBump(): THREE.CanvasTexture {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = "#808080";
    g.fillRect(0, 0, 256, 256);
    const r = prng(3);
    for (let i = 0; i < 5000; i++) {
      const v = Math.floor(80 + r() * 120);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(r() * 256, r() * 256, 1, 2 + r() * 3);
    }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.channel = 1;
  return t;
}

function netTexture(): THREE.CanvasTexture {
  const t = canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 3;
    for (let i = 0; i <= 64; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Placas de LED (texto em faixas, rola devagar). */
function boardTexture(o: StadiumOpts): THREE.CanvasTexture {
  const isMorumbi = o.style.landmarks.includes("morumbi-ring") || o.style.key === "morumbis" || o.home.abbr === "SPFC";
  const t = canvasTex(2048, 64, (g) => {
    const items: [string, string, string][] = isMorumbi
      ? [
          ["#c4122f", "#ffffff", "MORUMBIS"],
          ["#0b0d12", "#ffffff", "SUPERBET"],
          ["#ffffff", "#c4122f", "NEW BALANCE"],
          ["#c4122f", "#ffffff", "SÃO PAULO FUTEBOL CLUBE"],
          ["#0b0d12", "#c4122f", "SÓCIO TORCEDOR SPFC"],
          ["#ffffff", "#0b0d12", "AVANTE MEU TRICOLOR"],
          ["#c4122f", "#f5c542", "TRICOLOR DO MORUMBI"],
          ["#0b0d12", "#ffffff", "SPFC"],
        ]
      : [
          [o.home.colors[0], "#ffffff", o.home.name.toUpperCase()],
          ["#0b1d3a", "#f5c542", "LENDAS DA BASE"],
          [o.away.colors[0], "#ffffff", o.away.name.toUpperCase()],
          ["#101010", "#3df58a", "FUTEBOL BRASILEIRO"],
          ["#f5c542", "#101010", "BASE FORTE"],
          [o.home.colors[1] ?? "#ffffff", o.home.colors[0], o.home.abbr],
        ];
    const w = 2048 / items.length;
    items.forEach(([bg, fg, txt], i) => {
      g.fillStyle = bg;
      g.fillRect(i * w, 0, w, 64);
      g.font = `800 40px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = fg;
      g.fillText(txt, i * w + w / 2, 34, w - 20);
    });
    // grade de LED
    g.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 2048, 1);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Faixa de torcida pendurada na grade. */
function bannerTexture(colors: readonly string[], txt: string): THREE.CanvasTexture {
  return canvasTex(512, 96, (g) => {
    g.fillStyle = colors[0];
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = colors[1] ?? "#ffffff";
    g.fillRect(0, 8, 512, 6);
    g.fillRect(0, 82, 512, 6);
    g.font = `italic 900 56px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(txt, 256, 50, 490);
  });
}

/** Telão LED do MorumBIS (placar, relógio, nome do estádio e escudo). */
function scoreboardTexture(homeAbbr: string, awayAbbr: string): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = "#0a0e14";
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = "rgba(255,255,255,0.035)";
    for (let y = 0; y < 256; y += 4) g.fillRect(0, y, 512, 2);
    // Topo neon vermelho: MORUMBIS
    g.fillStyle = "#c4122f";
    g.fillRect(0, 0, 512, 56);
    g.font = `italic 900 42px "Barlow Condensed", Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffffff";
    g.fillText("MORUMBIS", 256, 28);
    // Placar central
    g.font = `900 52px "Barlow Condensed", Arial, sans-serif`;
    g.fillStyle = "#ffffff";
    g.textAlign = "right";
    g.fillText(homeAbbr || "SPFC", 195, 124);
    g.textAlign = "left";
    g.fillText(awayAbbr || "ADV", 317, 124);
    // Dígitos do placar
    g.font = `900 68px "Barlow Condensed", Arial, monospace`;
    g.textAlign = "center";
    g.fillStyle = "#ffe14a";
    g.fillText("0 × 0", 256, 124);
    // Faixa inferior com mensagem tricolor
    g.fillStyle = "#161e2b";
    g.fillRect(0, 184, 512, 72);
    g.font = `800 30px "Barlow Condensed", Arial, sans-serif`;
    g.fillStyle = "#3df58a";
    g.fillText("SÃO PAULO FUTEBOL CLUBE", 256, 220);
  });
}

interface StandDef { len: number; rot: number; x: number; z: number; rows: number; h0: number; roof: boolean; end: 0 | 1 | -1 }

export class Stadium {
  group = new THREE.Group();
  crowd: FanCrowd | null = null;
  festa: Festa | null = null;
  sun: THREE.DirectionalLight;
  nets: { mesh: THREE.Mesh; side: 0 | 1; x0: number }[] = [];
  private boards: THREE.Texture | null = null;
  private disposables: { dispose(): void }[] = [];
  private sky: Sky;
  private time = 0;

  constructor(private o: StadiumOpts, scene: THREE.Scene) {
    scene.add(this.group);
    const q = o.quality;
    // céu de fim de tarde (sol baixo) + refletores acesos
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 5.5;
    su.rayleigh.value = 2.4;
    su.mieCoefficient.value = 0.006;
    su.mieDirectionalG.value = 0.86;
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(-128));
    su.sunPosition.value.copy(sunDir);
    this.group.add(this.sky);
    this.disposables.push(this.sky.geometry, this.sky.material);

    const hemi = new THREE.HemisphereLight("#cfe1ff", "#2a4d20", 1.25);
    this.group.add(hemi);
    this.sun = new THREE.DirectionalLight("#ffe2b8", 2.9);
    this.sun.position.copy(sunDir).multiplyScalar(150);
    this.sun.position.y = Math.max(this.sun.position.y, 55);
    this.sun.castShadow = q !== "baixa";
    const sm = q === "alta" ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 420;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.group.add(this.sun, this.sun.target);
    // luz dos refletores: duas luzes claras de estádio
    for (const [x, z, i] of [[-70, -60, 1.15], [70, 55, 0.95]] as const) {
      const f = new THREE.DirectionalLight("#f0f4ff", i);
      f.position.set(x, 60, z);
      this.group.add(f);
    }

    this.buildGround();
    this.buildPitch();
    this.buildGoals();
    this.buildBoards();
    const stands = this.buildStands();
    this.buildLights(stands);
    this.buildCity();
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, cast = false, recv = true, parent: THREE.Object3D = this.group): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && this.o.quality !== "baixa";
    m.receiveShadow = recv && this.o.quality !== "baixa";
    parent.add(m);
    this.disposables.push(geo);
    if (!this.disposables.includes(mat)) this.disposables.push(mat);
    return m;
  }

  private buildGround() {
    const g = new THREE.PlaneGeometry(1400, 1400);
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.05, 0);
    this.add(g, new THREE.MeshStandardMaterial({ color: "#2b302c", roughness: 0.95 }), false, false);
  }

  private buildPitch() {
    const map = pitchTexture(this.o.style, this.o.quality);
    const bump = grassBump();
    this.disposables.push(map, bump);
    const g = new THREE.PlaneGeometry(AREA_L, AREA_W, 1, 1);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute("uv");
    const uv1 = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) uv1.set([uv.getX(i) * 90, uv.getY(i) * 62], i * 2);
    g.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
    const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.4, roughness: 0.88, metalness: 0 });
    this.add(g, m, false, true);
  }

  private buildGoals() {
    const white = new THREE.MeshStandardMaterial({ color: "#f7f7f7", roughness: 0.25, metalness: 0.1 });
    const net = netTexture();
    this.disposables.push(net, white);
    const netM = new THREE.MeshStandardMaterial({ map: net, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false });
    this.disposables.push(netM);
    const R = 0.06, D = 2.2;
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? 1 : -1; // o lado 0 ataca o gol da direita (x > 0)
      const gx = sx * HALF_L;
      const grp = new THREE.Group();
      this.group.add(grp);
      const post = new THREE.CylinderGeometry(R, R, GOAL_H, 16);
      for (const z of [-GOAL_W / 2, GOAL_W / 2]) this.add(post.clone(), white, true, true, grp).position.set(gx + sx * R, GOAL_H / 2, z);
      post.dispose();
      const bar = new THREE.CylinderGeometry(R, R, GOAL_W + 2 * R, 16);
      bar.rotateX(Math.PI / 2);
      this.add(bar, white, true, true, grp).position.set(gx + sx * R, GOAL_H, 0);
      // rede: fundo, teto e laterais (o fundo balança no gol)
      const back = new THREE.PlaneGeometry(GOAL_W, GOAL_H);
      this.scaleUv(back, GOAL_W * 4, GOAL_H * 4);
      const bm = this.add(back, netM, false, false, grp);
      bm.rotation.y = Math.PI / 2;
      bm.position.set(gx + sx * D, GOAL_H / 2, 0);
      this.nets.push({ mesh: bm, side, x0: bm.position.x });
      const top = new THREE.PlaneGeometry(D, GOAL_W);
      this.scaleUv(top, D * 4, GOAL_W * 4);
      const tm = this.add(top, netM, false, false, grp);
      tm.rotation.x = -Math.PI / 2;
      tm.position.set(gx + (sx * D) / 2, GOAL_H, 0);
      for (const z of [-GOAL_W / 2, GOAL_W / 2]) {
        const sg = new THREE.PlaneGeometry(D, GOAL_H);
        this.scaleUv(sg, D * 4, GOAL_H * 4);
        this.add(sg, netM, false, false, grp).position.set(gx + (sx * D) / 2, GOAL_H / 2, z);
      }
      // bandeirinhas de escanteio
      for (const z of [-HALF_W, HALF_W]) {
        const p = new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6);
        this.add(p, white, true, false).position.set(gx, 0.75, z);
        const f = new THREE.PlaneGeometry(0.4, 0.3);
        this.add(f, new THREE.MeshStandardMaterial({ color: this.o.home.colors[0], side: THREE.DoubleSide }), false, false).position.set(gx - sx * 0.2, 1.35, z);
      }
    }
  }

  private scaleUv(g: THREE.BufferGeometry, su: number, sv: number) {
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }

  private buildBoards() {
    const isMorumbi = this.o.style.landmarks.includes("morumbi-ring") || this.o.style.key === "morumbis" || this.o.home.abbr === "SPFC";
    const t = boardTexture(this.o);
    this.boards = t;
    this.disposables.push(t);
    const m = new THREE.MeshStandardMaterial({ map: t, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.5, roughness: 0.4 });
    const frame = new THREE.MeshStandardMaterial({ color: "#1a1d22", roughness: 0.6, metalness: 0.4 });
    const H = 0.95;
    const mk = (len: number, x: number, z: number, rot: number) => {
      const g = new THREE.PlaneGeometry(len, H);
      this.scaleUv(g, len / 36, 1);
      const mesh = this.add(g, m, false, false);
      mesh.position.set(x, H / 2, z);
      mesh.rotation.y = rot;
      const b = new THREE.BoxGeometry(len, H + 0.1, 0.3);
      const bm = this.add(b, frame, true, false);
      bm.position.set(x - Math.sin(rot) * 0.17, H / 2, z - Math.cos(rot) * 0.17);
      bm.rotation.y = rot;
    };
    if (isMorumbi) {
      mk(PITCH_LEN + 14, 0, -HALF_W - 4.5, 0);
      mk(PITCH_LEN + 14, 0, HALF_W + 4.5, Math.PI);
      for (const sx of [-1, 1]) {
        mk(PITCH_WID + 8, sx * (HALF_L + 5.5), 0, (-sx * Math.PI) / 2);
      }
      return;
    }
    mk(PITCH_LEN + 8, 0, -HALF_W - 4.5, 0);
    for (const sx of [-1, 1]) {
      mk(24, sx * (HALF_L + 5), -15, (-sx * Math.PI) / 2);
      mk(24, sx * (HALF_L + 5), 15, (-sx * Math.PI) / 2);
    }
    // bancos de reservas do lado da câmera
    const glass = new THREE.MeshPhysicalMaterial({ color: "#9fb6c8", transmission: 0, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 });
    const seat = new THREE.MeshStandardMaterial({ color: "#1d2a3a", roughness: 0.5 });
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(12, 2.2, 2.4);
      this.add(g, glass, false, false).position.set(sx * 11, 1.1, HALF_W + 5);
      const s = new THREE.BoxGeometry(11.5, 0.5, 1);
      this.add(s, seat, true, true).position.set(sx * 11, 0.45, HALF_W + 5.6);
    }
  }

  /**
   * Constrói o MorumBIS fiel à arquitetura real: 3 anéis elípticos concêntricos,
   * camarotes corporativos envidraçados, mosaico gigante SÃO PAULO FC nas cadeiras,
   * fachada brutalista em balanço de Vilanova Artigas, 2 telões LED e faixas da Independente.
   */
  private buildMorumbi(_isSPFC: boolean): StandDef[] {
    const o = this.o;
    const concrete = new THREE.MeshStandardMaterial({ color: "#aba69d", roughness: 0.92 });
    const seatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#162330", roughness: 0.08, metalness: 0.85, transparent: true, opacity: 0.82 });
    const steel = new THREE.MeshStandardMaterial({ color: "#9ca1a6", roughness: 0.38, metalness: 0.82 });
    const ribbon = boardTexture(o);
    this.disposables.push(concrete, seatMat, glass, steel, ribbon);
    const ribbonMat = new THREE.MeshStandardMaterial({ map: ribbon, emissive: "#ffffff", emissiveMap: ribbon, emissiveIntensity: 1.15 });
    this.disposables.push(ribbonMat);

    // Mosaico oficial "SÃO PAULO FC" desenhado nas cadeiras do Anel Superior
    const mosC = document.createElement("canvas");
    mosC.width = 384;
    mosC.height = 64;
    const mg = mosC.getContext("2d")!;
    mg.fillStyle = "#c4122f";
    mg.fillRect(0, 0, 384, 64);
    mg.fillStyle = "#ffffff";
    mg.fillRect(0, 16, 384, 32);
    mg.font = `900 28px "Barlow Condensed", Arial, sans-serif`;
    mg.textAlign = "center";
    mg.textBaseline = "middle";
    mg.fillStyle = "#121212";
    mg.fillText("SÃO PAULO FC", 192, 32);
    const mosData = mg.getImageData(0, 0, 384, 64).data;
    const getMosaicColor = (u: number, v: number): THREE.Color => {
      const x = Math.min(383, Math.max(0, Math.floor(u * 384)));
      const y = Math.min(63, Math.max(0, Math.floor((1 - v) * 64)));
      const idx = (y * 384 + x) * 4;
      return new THREE.Color().setRGB(mosData[idx] / 255, mosData[idx + 1] / 255, mosData[idx + 2] / 255, THREE.SRGBColorSpace);
    };

    const fans: FanSpot[] = [];
    const r = prng(41);
    const fill = Math.min(1, o.style.fill * 1.15);
    const crowdCol = (team: 0 | 1) => {
      const k = r();
      if (team === 0) {
        return new THREE.Color(k < 0.45 ? "#f5f5f5" : k < 0.78 ? "#c4122f" : k < 0.94 ? "#181818" : "#d82432");
      }
      const cs = o.away.colors;
      return new THREE.Color(k < 0.6 ? cs[0] : cs[1] ?? "#ffffff");
    };

    const N_SEG = 84;
    const n = 2.1;
    const getPt = (A: number, B: number, theta: number): [number, number] => {
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      const x = A * Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / n);
      const z = B * Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / n);
      return [x, z];
    };

    const pos: number[] = [], nor: number[] = [], col: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[], nVec: number[], cc: THREE.Color) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let k = 0; k < 6; k++) {
        nor.push(...nVec);
        col.push(cc.r, cc.g, cc.b);
      }
    };

    // Gera os degraus de um anel elíptico contínuo
    const addTier = (A0: number, B0: number, Y0: number, A1: number, B1: number, Y1: number, steps: number, colorFn: (s: number, theta: number, u: number, v: number) => THREE.Color) => {
      for (let s = 0; s < steps; s++) {
        const u0 = s / steps, u1 = (s + 1) / steps;
        const ya = Y0 + u0 * (Y1 - Y0);
        const yb = Y0 + u1 * (Y1 - Y0);
        const a_in = A0 + u0 * (A1 - A0), b_in = B0 + u0 * (B1 - B0);
        const a_out = A0 + u1 * (A1 - A0), b_out = B0 + u1 * (B1 - B0);

        for (let i = 0; i < N_SEG; i++) {
          const t0 = (i / N_SEG) * Math.PI * 2;
          const t1 = ((i + 1) / N_SEG) * Math.PI * 2;
          const midT = (t0 + t1) / 2;
          const c = colorFn(s, midT, (i + 0.5) / N_SEG, (s + 0.5) / steps);

          const [x00, z00] = getPt(a_in, b_in, t0);
          const [x01, z01] = getPt(a_in, b_in, t1);
          const [x10, z10] = getPt(a_out, b_out, t0);
          const [x11, z11] = getPt(a_out, b_out, t1);

          // Piso horizontal do degrau com as cadeiras
          quad([x00, yb, z00], [x10, yb, z10], [x11, yb, z11], [x01, yb, z01], [0, 1, 0], c);
          // Espelho vertical do degrau
          const [nx, nz] = [-Math.cos(midT), -Math.sin(midT)];
          quad([x00, ya, z00], [x01, ya, z01], [x01, yb, z01], [x00, yb, z00], [nx, 0, nz], c.clone().multiplyScalar(0.72));

          // Torcedores distribuídos na arquibancada
          if (r() < fill) {
            const team: 0 | 1 = (!o.neutral && Math.cos(midT) > 0.65 && Math.sin(midT) > 0.4) ? 1 : 0;
            const midA = (a_in + a_out) / 2, midB = (b_in + b_out) / 2;
            const [fx, fz] = getPt(midA, midB, midT + (r() - 0.5) * 0.02);
            const rot = Math.atan2(-fx, -fz);
            fans.push({
              x: fx, y: yb, z: fz, rot, team, shirt: crowdCol(team),
              rank: Math.min(0.999, r() * 0.8), scale: 0.92 + r() * 0.16,
            });
          }
        }
      }
    };

    // ANEL 1 (Térreo / Inferior): 10 degraus, todo vermelho Morumbi rente à pista
    addTier(70, 47, 1.0, 83, 57, 6.2, 10, (_s, _theta) => new THREE.Color("#c4122f"));

    // ANEL 2 (Intermediário / Cadeiras Cativas & Especiais): 12 degraus em setores tricolores
    addTier(81, 55, 10.5, 95, 68, 18.5, 12, (s, theta) => {
      const deg = ((theta * 180) / Math.PI + 360) % 360;
      const sector = Math.floor(deg / 45) % 3;
      const baseCol = sector === 0 ? "#c4122f" : sector === 1 ? "#f0f0f0" : "#181818";
      return new THREE.Color(baseCol).multiplyScalar(s % 2 ? 0.9 : 1);
    });

    // ANEL 3 (Superior / A Gigantesca Arquibancada Monumental): 20 degraus, setores e mosaico SÃO PAULO FC
    addTier(89, 64, 22.5, 120, 92, 42.0, 20, (s, theta, _u, v) => {
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      // Mosaico na lateral voltada para a câmera (z < 0)
      if (sinT < -0.45 && Math.abs(cosT) < 0.65) {
        const mu = (cosT + 0.65) / 1.3;
        return getMosaicColor(mu, v);
      }
      // Setores do MorumBIS (Vermelha, Laranja, Azul, Amarela)
      const deg = ((theta * 180) / Math.PI + 360) % 360;
      if (deg >= 45 && deg < 135) return new THREE.Color(s % 2 ? "#b80f28" : "#c4122f"); // Vermelha
      if (deg >= 135 && deg < 225) return new THREE.Color(s % 2 ? "#d65e1b" : "#e66a25"); // Laranja
      if (deg >= 225 && deg < 315) return new THREE.Color(s % 2 ? "#1f4370" : "#265187"); // Azul
      return new THREE.Color(s % 2 ? "#d9a10d" : "#ebb41a"); // Amarela
    });

    const gSeats = new THREE.BufferGeometry();
    gSeats.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    gSeats.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    gSeats.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    this.add(gSeats, seatMat, true, true);

    // Paredão de camarotes corporativos envidraçados e fita de LED (entre Anel 1 e Anel 2)
    const camarotePos: number[] = [], camaroteNor: number[] = [];
    const ribbonPos: number[] = [], ribbonNor: number[] = [], ribbonUv: number[] = [];
    for (let i = 0; i < N_SEG; i++) {
      const t0 = (i / N_SEG) * Math.PI * 2;
      const t1 = ((i + 1) / N_SEG) * Math.PI * 2;
      const [x0, z0] = getPt(83, 57, t0);
      const [x1, z1] = getPt(83, 57, t1);
      const midT = (t0 + t1) / 2;
      const [nx, nz] = [-Math.cos(midT), -Math.sin(midT)];

      // Fita de LED inferior (6.2 a 8.0)
      ribbonPos.push(x0, 6.2, z0,  x1, 6.2, z1,  x1, 8.0, z1,  x0, 6.2, z0,  x1, 8.0, z1,  x0, 8.0, z0);
      for (let k = 0; k < 6; k++) ribbonNor.push(nx, 0, nz);
      const uA = (i / N_SEG) * 12, uB = ((i + 1) / N_SEG) * 12;
      ribbonUv.push(uA, 0,  uB, 0,  uB, 1,  uA, 0,  uB, 1,  uA, 1);

      // Vidro dos camarotes (8.0 a 10.5)
      camarotePos.push(x0, 8.0, z0,  x1, 8.0, z1,  x1, 10.5, z1,  x0, 8.0, z0,  x1, 10.5, z1,  x0, 10.5, z0);
      for (let k = 0; k < 6; k++) camaroteNor.push(nx, 0, nz);
    }
    const gRibbon = new THREE.BufferGeometry();
    gRibbon.setAttribute("position", new THREE.Float32BufferAttribute(ribbonPos, 3));
    gRibbon.setAttribute("normal", new THREE.Float32BufferAttribute(ribbonNor, 3));
    gRibbon.setAttribute("uv", new THREE.Float32BufferAttribute(ribbonUv, 2));
    this.add(gRibbon, ribbonMat, false, false);

    const gGlass = new THREE.BufferGeometry();
    gGlass.setAttribute("position", new THREE.Float32BufferAttribute(camarotePos, 3));
    gGlass.setAttribute("normal", new THREE.Float32BufferAttribute(camaroteNor, 3));
    this.add(gGlass, glass, false, false);

    // Muro de balanço de concreto sob o Anel 3
    const corbelPos: number[] = [], corbelNor: number[] = [];
    for (let i = 0; i < N_SEG; i++) {
      const t0 = (i / N_SEG) * Math.PI * 2;
      const t1 = ((i + 1) / N_SEG) * Math.PI * 2;
      const [x0, z0] = getPt(95, 68, t0);
      const [x1, z1] = getPt(95, 68, t1);
      const midT = (t0 + t1) / 2;
      const [nx, nz] = [-Math.cos(midT), -Math.sin(midT)];
      corbelPos.push(x0, 18.5, z0,  x1, 18.5, z1,  x1, 22.5, z1,  x0, 18.5, z0,  x1, 22.5, z1,  x0, 22.5, z0);
      for (let k = 0; k < 6; k++) corbelNor.push(nx, 0, nz);
    }
    const gCorbel = new THREE.BufferGeometry();
    gCorbel.setAttribute("position", new THREE.Float32BufferAttribute(corbelPos, 3));
    gCorbel.setAttribute("normal", new THREE.Float32BufferAttribute(corbelNor, 3));
    this.add(gCorbel, concrete, true, true);

    // Muro frontal do Anel 1 com faixas da Torcida Tricolor Independente e Dragões da Real
    const wallPos: number[] = [], wallNor: number[] = [];
    for (let i = 0; i < N_SEG; i++) {
      const t0 = (i / N_SEG) * Math.PI * 2;
      const t1 = ((i + 1) / N_SEG) * Math.PI * 2;
      const [x0, z0] = getPt(70, 47, t0);
      const [x1, z1] = getPt(70, 47, t1);
      const midT = (t0 + t1) / 2;
      const [nx, nz] = [-Math.cos(midT), -Math.sin(midT)];
      wallPos.push(x0, 0, z0,  x1, 0, z1,  x1, 1.0, z1,  x0, 0, z0,  x1, 1.0, z1,  x0, 1.0, z0);
      for (let k = 0; k < 6; k++) wallNor.push(nx, 0, nz);
    }
    const gWall = new THREE.BufferGeometry();
    gWall.setAttribute("position", new THREE.Float32BufferAttribute(wallPos, 3));
    gWall.setAttribute("normal", new THREE.Float32BufferAttribute(wallNor, 3));
    this.add(gWall, concrete, true, true);

    // 12 Faixas Oficiais da Torcida Tricolor Independente e Dragões da Real
    const spfcBanners = [
      "TORCIDA TRICOLOR INDEPENDENTE",
      "DRAGÕES DA REAL",
      "COMO EU TE AMO TRICOLOR",
      "O MAIS QUERIDO",
      "MORUMBIS - O MAIOR DO BRASIL",
      "AVANTE MEU TRICOLOR",
      "INDEPENDENTE 1972",
      "SOBERANO",
      "TRICOLOR DESDE 1930",
      "AQUI É SÃO PAULO",
      "INDEPENDENTE - O TERROR VESTE BRANCO",
      "DRAGÕES DA REAL 1984",
    ];
    for (let b = 0; b < 12; b++) {
      const theta = (b / 12) * Math.PI * 2;
      const [bx, bz] = getPt(69.8, 46.8, theta);
      const angle = Math.atan2(
        getPt(70, 47, theta + 0.05)[1] - getPt(70, 47, theta - 0.05)[1],
        getPt(70, 47, theta + 0.05)[0] - getPt(70, 47, theta - 0.05)[0]
      );
      const cols = b % 3 === 0 ? ["#ffffff", "#c4122f"] : b % 3 === 1 ? ["#c4122f", "#ffffff"] : ["#121212", "#ffffff"];
      const t = bannerTexture(cols, spfcBanners[b]);
      this.disposables.push(t);
      const bg = new THREE.PlaneGeometry(9.5, 1.0);
      const bm = this.add(bg, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), false, false);
      bm.position.set(bx, 0.52, bz);
      bm.rotation.y = -angle + Math.PI;
    }

    // Fachada Brutalista Externa (Vilanova Artigas): 36 pilares inclinados em V
    for (let p = 0; p < 36; p++) {
      const theta = (p / 36) * Math.PI * 2;
      const [px, pz] = getPt(114, 86, theta);
      const rotY = Math.atan2(-px, -pz);
      const pilarGeo = new THREE.BoxGeometry(1.4, 40, 1.4);
      const m1 = this.add(pilarGeo, concrete, true, false);
      m1.position.set(px, 20, pz);
      m1.rotation.y = rotY;
      m1.rotation.z = 0.12;
    }

    // Dois Telões Monumentais de LED do MorumBIS (atrás dos gols)
    const scoreTex = scoreboardTexture(o.home.abbr, o.away.abbr);
    this.disposables.push(scoreTex);
    const scoreMat = new THREE.MeshStandardMaterial({ map: scoreTex, emissive: "#ffffff", emissiveMap: scoreTex, emissiveIntensity: 1.25, roughness: 0.3 });
    this.disposables.push(scoreMat);
    for (const sx of [-1, 1]) {
      const tx = sx * 115, tz = 0, ty = 46;
      // Painel do telão
      const sg = new THREE.PlaneGeometry(24, 12);
      const sm = this.add(sg, scoreMat, false, false);
      sm.position.set(tx, ty, tz);
      sm.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      // Estrutura traseira de aço
      const frame = new THREE.BoxGeometry(0.8, 12.6, 24.6);
      const fm = this.add(frame, steel, true, false);
      fm.position.set(tx + sx * 0.45, ty, tz);
      // Letreiro Neon MORUMBIS no topo do telão
      const topGeo = new THREE.BoxGeometry(1.2, 2.2, 24);
      const neonMat = new THREE.MeshStandardMaterial({ color: "#c4122f", emissive: "#ff1838", emissiveIntensity: 2.2 });
      this.disposables.push(neonMat);
      this.add(topGeo, neonMat, false, false).position.set(tx, ty + 6.8, tz);
    }

    // Túnel dos Jogadores com Toldo Tricolor do SPFC na lateral do campo
    const tunnelGroup = new THREE.Group();
    const tunnelRoof = new THREE.CylinderGeometry(3.5, 3.5, 12, 16, 1, false, 0, Math.PI);
    tunnelRoof.rotateZ(Math.PI / 2);
    const tunnelMat = new THREE.MeshStandardMaterial({ color: "#c4122f", roughness: 0.5 });
    this.disposables.push(tunnelMat);
    const tMesh = this.add(tunnelRoof, tunnelMat, true, false, tunnelGroup);
    tMesh.position.set(0, 1.8, 44);
    this.group.add(tunnelGroup);

    // Bancos de reserva rente à pista
    const seatDugout = new THREE.MeshStandardMaterial({ color: "#18202d", roughness: 0.5 });
    const glassDugout = new THREE.MeshPhysicalMaterial({ color: "#8ea4b8", transparent: true, opacity: 0.4, roughness: 0.1 });
    this.disposables.push(seatDugout, glassDugout);
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(13, 2.4, 2.4);
      this.add(g, glassDugout, false, false).position.set(sx * 14, 1.2, 38);
      const s = new THREE.BoxGeometry(12.4, 0.6, 1.1);
      this.add(s, seatDugout, true, true).position.set(sx * 14, 0.48, 38.6);
    }

    if (fans.length) {
      this.crowd = new FanCrowd(fans);
      this.crowd.uniforms.uLeaveTeam.value = o.crowdSide;
      this.group.add(this.crowd.mesh);
    }
    if (o.festa > 0) {
      const front: [number, number, number, number][] = [];
      for (let k = 0; k < 28; k++) {
        const theta = (k / 28) * Math.PI * 2;
        const [fx, fz] = getPt(72, 49, theta);
        front.push([fx, 1.6, fz, Math.atan2(-fx, -fz)]);
      }
      this.festa = new Festa(
        { colors: ["#c4122f", "#ffffff", "#181818"], abbr: "SPFC", level: o.festa, reduced: o.reduced, front },
        { cx: 0, cz: -54, w: 70, d: 24 }
      );
      this.group.add(this.festa.group);
    }

    return [
      { len: 140, rot: 0, x: 0, z: -74, rows: 34, h0: 1.4, roof: false, end: -1 },
      { len: 140, rot: Math.PI, x: 0, z: 74, rows: 34, h0: 1.4, roof: false, end: -1 },
      { len: 96, rot: Math.PI / 2, x: -95, z: 0, rows: 28, h0: 1.4, roof: false, end: 0 },
      { len: 96, rot: -Math.PI / 2, x: 95, z: 0, rows: 28, h0: 1.4, roof: false, end: 1 },
    ];
  }

  /** Arquibancadas em degraus, torcida instanciada, faixas e a festa. */
  private buildStands(): StandDef[] {
    const o = this.o, st = o.style;
    const isMorumbi = st.landmarks.includes("morumbi-ring") || st.key === "morumbis" || o.home.abbr === "SPFC" || o.home.name.toLowerCase().includes("são paulo") || o.home.name.toLowerCase().includes("sao paulo");
    const isSPFC = isMorumbi || o.crowdSide === 0;
    if (isMorumbi) {
      return this.buildMorumbi(isSPFC);
    }
    const big = st.shape === "bowl" || st.shape === "track" || st.shape === "bombonera";
    const small = st.shape === "small";
    const back = st.shape === "track" ? 13 : 8;
    const rows = small ? 10 : big ? 34 : 24;
    const endRows = small ? 5 : st.shape === "english" ? rows : Math.round(rows * 0.85);
    const longLen = PITCH_LEN + 2 * back + 14;
    const endLen = PITCH_WID + 2 * back + 4;
    const stands: StandDef[] = [
      { len: longLen, rot: 0, x: 0, z: -HALF_W - back, rows: st.shape === "bombonera" ? rows + 8 : rows, h0: 1.4, roof: st.roof !== "none", end: -1 },
      { len: longLen, rot: Math.PI, x: 0, z: HALF_W + back, rows: Math.round(rows * 0.8), h0: 1.4, roof: false, end: -1 },
    ];
    if (st.shape !== "open-end") stands.push({ len: endLen, rot: Math.PI / 2, x: -HALF_L - back, z: 0, rows: endRows, h0: 1.4, roof: st.roof === "full" || st.roof === "partial", end: 0 });
    stands.push({ len: endLen, rot: -Math.PI / 2, x: HALF_L + back, z: 0, rows: endRows, h0: 1.4, roof: st.roof === "full", end: 1 });
    const RUN = 0.85, RISE = 0.42;
    const seats = (st.seats.length ? st.seats : ["#7d8386"]).map((c) => new THREE.Color(c));
    const concrete = new THREE.MeshStandardMaterial({ color: st.concrete, roughness: 0.92 });
    const seatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const roofMat = new THREE.MeshStandardMaterial({ color: st.roofColor, roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide });
    const steel = new THREE.MeshStandardMaterial({ color: "#c7ccd1", roughness: 0.35, metalness: 0.8 });
    const ribbon = boardTexture(o);
    this.disposables.push(ribbon);
    const ribbonMat = new THREE.MeshStandardMaterial({ map: ribbon, emissive: "#ffffff", emissiveMap: ribbon, emissiveIntensity: 1.1 });
    const spacing = o.quality === "alta" ? 0.72 : o.quality === "media" ? 1.0 : 1.5;
    const fans: FanSpot[] = [];
    const r = prng(41);
    const fill = Math.min(1, st.fill * 1.08);
    const crowdCol = (team: 0 | 1) => {
      const cs = team === 0 ? o.home.colors : o.away.colors;
      const k = r();
      return new THREE.Color(k < 0.55 ? cs[0] : k < 0.8 ? cs[1] ?? "#ffffff" : k < 0.9 ? "#f2f2f2" : "#2a2d33");
    };
    // mosaico: listras nas cores do clube com a sigla no meio (só a torcida dominante)
    const mosC = document.createElement("canvas");
    mosC.width = 256;
    mosC.height = 64;
    const mg = mosC.getContext("2d")!;
    const mc = o.crowdSide === 0 ? o.home : o.away;
    for (let i = 0; i < 8; i++) {
      mg.fillStyle = mc.colors[i % 2] ?? "#ffffff";
      mg.fillRect(0, i * 8, 256, 8);
    }
    mg.font = `900 54px "Barlow Condensed", Arial, sans-serif`;
    mg.textAlign = "center";
    mg.textBaseline = "middle";
    mg.fillStyle = mc.colors[1] && mc.colors[1] !== mc.colors[0] ? mc.colors[1] : "#ffffff";
    mg.fillRect(70, 6, 116, 52);
    mg.fillStyle = mc.colors[0];
    mg.fillText(mc.abbr, 128, 34);
    const mos = mg.getImageData(0, 0, 256, 64).data;
    const mosAt = (u: number, v: number) => {
      const x = Math.min(255, Math.max(0, Math.floor(u * 256))), y = Math.min(63, Math.max(0, Math.floor((1 - v) * 64)));
      const i = (y * 256 + x) * 4;
      return new THREE.Color().setRGB(mos[i] / 255, mos[i + 1] / 255, mos[i + 2] / 255, THREE.SRGBColorSpace);
    };
    const front: [number, number, number, number][] = [];
    const banners = isSPFC
      ? [
          "TORCIDA TRICOLOR INDEPENDENTE",
          "DRAGÕES DA REAL",
          "COMO EU TE AMO TRICOLOR",
          "O MAIS QUERIDO",
          "MORUMBIS - O MAIOR DO BRASIL",
          "AVANTE MEU TRICOLOR",
          "INDEPENDENTE 1972",
          "SOBERANO",
        ]
      : ["RAÇA E PAIXÃO", "SEMPRE AO SEU LADO", "ETERNO AMOR", `${mc.abbr} ATÉ MORRER`, "AQUI É CALDEIRÃO", "TORCIDA JOVEM", "GARRA"];
    let bi = 0;
    let bannerSpot: { x: number; y: number; z: number; w: number; d: number; slope: number; rot: number } | undefined;
    for (const s of stands) {
      const grp = new THREE.Group();
      grp.position.set(s.x, 0, s.z);
      grp.rotation.y = s.rot;
      this.group.add(grp);
      const half = s.len / 2;
      // degraus: espelho + piso, com as cores das cadeiras em faixas
      const pos: number[] = [], nor: number[] = [], col: number[] = [];
      const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], cc: THREE.Color) => {
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        for (let k = 0; k < 6; k++) {
          nor.push(...n);
          col.push(cc.r, cc.g, cc.b);
        }
      };
      const gap = big && s.rows > 26 ? 18 : -1; // corredor entre os anéis
      const yAt = (i: number) => s.h0 + i * RISE + (gap > 0 && i > gap ? 3.2 : 0);
      for (let i = 0; i < s.rows; i++) {
        const z0 = -i * RUN, z1 = -(i + 1) * RUN;
        const y0 = yAt(i), y1 = y0 + RISE;
        let cc: THREE.Color;
        if (isMorumbi) {
          if (i < 10) {
            cc = new THREE.Color("#c4122f").multiplyScalar(i % 2 ? 0.9 : 1);
          } else if (i < 20) {
            cc = (i % 4 < 2 ? new THREE.Color("#c4122f") : new THREE.Color("#f0f0f0")).multiplyScalar(i % 2 ? 0.88 : 1);
          } else {
            const tricolors = ["#c4122f", "#f2f2f2", "#181818"];
            cc = new THREE.Color(tricolors[Math.floor(i / 4) % tricolors.length]).multiplyScalar(i % 2 ? 0.86 : 1);
          }
        } else {
          cc = seats[Math.floor(i / 4) % seats.length].clone().multiplyScalar(i % 2 ? 0.86 : 1);
        }
        quad([-half, y0, z0], [half, y0, z0], [half, y1, z0], [-half, y1, z0], [0, 0, 1], cc.clone().multiplyScalar(0.7));
        quad([-half, y1, z0], [half, y1, z0], [half, y1, z1], [-half, y1, z1], [0, 1, 0], cc);
        if (i === gap) {
          // paredão do anel de cima, com fita de LED
          const yb = y1, yt = yAt(i + 1);
          const rib = new THREE.PlaneGeometry(s.len, yt - yb - 0.4);
          this.scaleUv(rib, s.len / 40, 1);
          const rm = this.add(rib, ribbonMat, false, false, grp);
          rm.position.set(0, (yb + yt) / 2, z1 + 0.02);
          quad([-half, yb, z1], [half, yb, z1], [half, yt, z1], [-half, yt, z1], [0, 0, 1], new THREE.Color(st.concrete));
        }
        // torcedores
        const n = Math.floor(s.len / spacing);
        const away = !o.neutral && s.end === 1;
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n;
          const xx = -half + u * s.len + (r() - 0.5) * spacing * 0.3;
          const team: 0 | 1 = away && u > 0.55 ? 1 : 0;
          const f = team === 1 ? fill * 0.75 : fill;
          if (r() > f) continue;
          if (away && u > 0.5 && u < 0.55) continue; // separação das torcidas
          const v = i / s.rows;
          const isMosaic = team === o.crowdSide && (s.end === -1 && s.rot === 0 || s.end === (o.crowdSide === 0 ? 0 : 1));
          const local = new THREE.Vector3(xx, y1, z0 - RUN * 0.55);
          local.applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
          fans.push({
            x: s.x + local.x, y: local.y, z: s.z + local.z, rot: s.rot + (r() - 0.5) * 0.5, team, shirt: crowdCol(team),
            mosaic: isMosaic ? mosAt(u, v) : undefined,
            rank: Math.min(0.999, r() * 0.75 + (1 - v) * 0.25), scale: 0.92 + r() * 0.16,
          });
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      this.add(g, seatMat, true, true, grp);
      const depth = s.rows * RUN, top = yAt(s.rows);
      // muro da frente (com faixas da torcida) e paredão do fundo
      const fw = new THREE.BoxGeometry(s.len, s.h0, 0.5);
      this.add(fw, concrete, true, true, grp).position.set(0, s.h0 / 2, 0.25);
      const bw = new THREE.BoxGeometry(s.len, top + 3, 1.2);
      this.add(bw, concrete, true, true, grp).position.set(0, (top + 3) / 2, -depth - 0.6);
      if (o.festa > 0 && s.end !== 1 && !(s.rot === Math.PI)) {
        for (let k = 0; k < 3; k++) {
          const bannerCols = isSPFC
            ? (k % 3 === 0 ? ["#ffffff", "#c4122f"] : k % 3 === 1 ? ["#c4122f", "#ffffff"] : ["#121212", "#ffffff"])
            : (k % 2 ? [mc.colors[1] ?? "#ffffff", mc.colors[0]] : mc.colors);
          const t = bannerTexture(bannerCols, banners[bi++ % banners.length]);
          this.disposables.push(t);
          const bg = new THREE.PlaneGeometry(9, 1.4);
          const bm = this.add(bg, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), false, false, grp);
          bm.position.set((k - 1) * s.len * 0.28, s.h0 - 0.3, 0.52);
        }
      }
      // pontos da festa: primeira fileira da torcida dominante
      const crowdHere = s.end === -1 ? s.rot === 0 : s.end === (o.crowdSide === 0 ? 0 : 1) || (o.neutral && s.end === 0);
      if (crowdHere) {
        for (let k = 0; k < 24; k++) {
          const u = (k + 0.5) / 24 - 0.5;
          const local = new THREE.Vector3(u * s.len * 0.9, yAt(1) + RISE, -RUN * 1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
          front.push([s.x + local.x, local.y, s.z + local.z, s.rot]);
        }
        if (s.end !== -1 && !bannerSpot) {
          const c = new THREE.Vector3(0, yAt(s.rows / 2), -depth / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
          bannerSpot = { x: s.x + c.x, y: c.y, z: s.z + c.z, w: s.len * 0.7, d: depth * 0.9, slope: Math.atan2(RISE, RUN), rot: s.rot };
        }
      }
      // cobertura com treliça
      if (s.roof) {
        const rz = -depth * 0.55, rd = depth * 1.15 + 6;
        const rg = new THREE.BoxGeometry(s.len + 4, 0.5, rd);
        const roof = this.add(rg, roofMat, true, true, grp);
        roof.position.set(0, top + 7, rz);
        roof.rotation.x = -0.06;
        const tr = new THREE.BoxGeometry(s.len + 4, 0.35, 0.35);
        this.add(tr, steel, false, false, grp).position.set(0, top + 6.4, rz + rd / 2 - 0.3);
        for (let k = -3; k <= 3; k++) {
          const p = new THREE.CylinderGeometry(0.35, 0.45, top + 7, 10);
          this.add(p, steel, true, false, grp).position.set((k / 3) * s.len * 0.47, (top + 7) / 2, -depth - 1.4);
        }
      }
    }
    // cantos dos estádios grandes
    if (big || st.shape === "english") {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const w = back + rows * RUN * 0.8;
        const g = new THREE.BoxGeometry(w, rows * RISE * 0.9, w);
        this.add(g, concrete, true, true).position.set(sx * (HALF_L + back + w / 2 - 3), (rows * RISE * 0.9) / 2, sz * (HALF_W + back + w / 2 - 3));
      }
    }
    if (fans.length) {
      this.crowd = new FanCrowd(fans);
      this.crowd.uniforms.uLeaveTeam.value = o.crowdSide;
      this.group.add(this.crowd.mesh);
    }
    if (o.festa > 0) {
      this.festa = new Festa(
        { colors: mc.colors, abbr: mc.abbr, level: o.festa, reduced: o.reduced, front, banner: bannerSpot },
        { cx: front.length ? front[Math.floor(front.length / 2)][0] : 0, cz: front.length ? front[Math.floor(front.length / 2)][2] : -HALF_W - 10, w: 60, d: 18 },
      );
      this.group.add(this.festa.group);
    }
    this.disposables.push(concrete, seatMat, roofMat, steel, ribbonMat);
    return stands;
  }

  private buildLights(stands: StandDef[]) {
    const st = this.o.style;
    const isMorumbi = st.landmarks.includes("morumbi-ring") || st.key === "morumbis" || this.o.home.abbr === "SPFC";
    const pole = new THREE.MeshStandardMaterial({ color: "#8a9196", roughness: 0.4, metalness: 0.7 });
    const lamp = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff6dd", emissiveIntensity: 6 });
    this.disposables.push(pole, lamp);
    const panels: [number, number, number, number][] = [];
    if (isMorumbi) {
      const getPt = (A: number, B: number, theta: number): [number, number] => {
        const cosT = Math.cos(theta), sinT = Math.sin(theta);
        const x = A * Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / 2.1);
        const z = B * Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / 2.1);
        return [x, z];
      };
      const lightAngles = [
        Math.PI * 0.18, Math.PI * 0.42, Math.PI * 0.58, Math.PI * 0.82,
        Math.PI * 1.18, Math.PI * 1.42, Math.PI * 1.58, Math.PI * 1.82,
      ];
      for (const theta of lightAngles) {
        const [lx, lz] = getPt(119, 91, theta);
        panels.push([lx, 46, lz, Math.atan2(-lx, -lz)]);
      }
    } else if (st.lights === "towers") {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (HALF_L + 26), z = sz * (HALF_W + 30), h = 52;
        const g = new THREE.CylinderGeometry(0.7, 1.3, h, 10);
        this.add(g, pole, true, false).position.set(x, h / 2, z);
        panels.push([x, h + 2, z, Math.atan2(-x, -z)]);
      }
    } else if (st.lights === "masts") {
      for (const sz of [-1, 1]) for (const k of [-0.7, -0.23, 0.23, 0.7]) {
        const x = k * PITCH_LEN, z = sz * (HALF_W + 9), h = 18;
        const g = new THREE.CylinderGeometry(0.18, 0.25, h, 8);
        this.add(g, pole, true, false).position.set(x, h / 2, z);
        panels.push([x, h + 0.6, z, sz > 0 ? Math.PI : 0]);
      }
    } else {
      const s = stands[0];
      const top = s.h0 + s.rows * 0.42 + 6.6;
      for (const k of [-0.4, -0.2, 0, 0.2, 0.4]) panels.push([k * PITCH_LEN, top, s.z + 2, 0]);
    }
    for (const [x, y, z, rot] of panels) {
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.rotation.y = rot;
      grp.rotation.x = -0.35;
      this.group.add(grp);
      const frame = new THREE.BoxGeometry(9, 4.4, 0.6);
      this.add(frame, pole, false, false, grp);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        const l = new THREE.CircleGeometry(0.75, 16);
        this.add(l, lamp, false, false, grp).position.set(-3.3 + i * 2.2, -1 + j * 2, 0.31);
      }
    }
  }

  /** Prédios em volta (silhueta com janelas acesas). */
  private buildCity() {
    const n = this.o.quality === "baixa" ? 40 : 110;
    const r = prng(99);
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    const win = canvasTex(64, 128, (c) => {
      c.fillStyle = "#1c2229";
      c.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
        if (Math.random() < 0.45) {
          c.fillStyle = Math.random() < 0.7 ? "#ffd89a" : "#bfe1ff";
          c.fillRect(x, y, 4, 4);
        }
      }
    });
    win.wrapS = win.wrapT = THREE.RepeatWrapping;
    win.repeat.set(2, 3);
    this.disposables.push(win);
    const m = new THREE.MeshStandardMaterial({ color: "#3a424c", map: win, emissive: "#ffffff", emissiveMap: win, emissiveIntensity: 0.6, roughness: 0.8 });
    const im = new THREE.InstancedMesh(g, m, n);
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = 230 + r() * 260;
      const h = 12 + r() * r() * 90, w = 14 + r() * 26;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
      mat.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q, new THREE.Vector3(w, h, w * (0.6 + r() * 0.8)));
      im.setMatrixAt(i, mat);
    }
    this.group.add(im);
    this.disposables.push(g, m);
  }

  update(dt: number) {
    this.time += dt;
    if (this.boards) this.boards.offset.x = (this.time / 24000) % 1;
    this.festa?.update(dt);
    if (this.crowd) this.crowd.uniforms.uTime.value = this.time / 1000;
  }

  dispose() {
    this.crowd?.dispose();
    this.festa?.dispose();
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
