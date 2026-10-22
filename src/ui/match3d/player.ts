// Jogador 3D da partida: modelo humano proporcional (cabeça, pescoço, tronco, quadril, braços com
// cotovelo, pernas com joelho, chuteiras), materiais PBR (tecido, pele, couro) e o uniforme real
// do clube na camisa (makeKitTexture). Animação procedural: corrida, passe, chute, cabeceio,
// carrinho, voo do goleiro, comemoração, tristeza, golpes especiais.
import * as THREE from "three";
import { makeKitTexture, type KitWhich } from "../kitTexture";
import { facingAngle, type Player3D } from "./model";

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  blob: THREE.Mesh;
  facing: number;
  key: string;
  mats: THREE.Material[];
  tex: THREE.Texture[];
}

export const PLAYER_SCALE = 1.12;

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}
function lum(hex: string) {
  const c = new THREE.Color(hex);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/** Geometrias compartilhadas por todos os jogadores (escala no grupo). */
class Geo {
  private cache = new Map<string, THREE.BufferGeometry>();
  get(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.cache.get(key);
    if (!g) {
      g = make();
      this.cache.set(key, g);
    }
    return g;
  }
  dispose() {
    for (const g of this.cache.values()) g.dispose();
    this.cache.clear();
  }
}

/** Membro: cápsula com o topo na origem, crescendo para baixo (pivô na articulação). */
function limb(r0: number, r1: number, len: number, seg = 14): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * r1, -len + r1 - Math.cos(a) * r1));
  }
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    const r = r1 + (r0 - r1) * t;
    pts.push(new THREE.Vector2(r * (1 + Math.sin(t * Math.PI) * 0.06), -len + r1 + (len - r1 - r0) * t));
  }
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r0, -r0 + Math.sin(a) * r0));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

export class PlayerFactory {
  private geo = new Geo();
  private kitTex = new Map<string, THREE.Texture>();
  private shared = new Map<string, THREE.MeshStandardMaterial>();
  private blobTex: THREE.Texture;
  private blobMat: THREE.MeshBasicMaterial;
  constructor(private scene: THREE.Scene, private shadows: boolean, private maxAniso: number) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,0.55)");
    gr.addColorStop(0.6, "rgba(0,0,0,0.22)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    this.blobTex = new THREE.CanvasTexture(c);
    this.blobMat = new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false });
  }

  key(p: Player3D) {
    return `${p.shirt}|${p.shorts}|${p.socks}|${p.skin}|${p.hair}|${p.num}|${p.sleeve}|${p.pattern}|${p.kit ?? ""}|${p.name}|${p.hairStyle}|${p.tall}|${p.broad}|${p.beard}`;
  }

  private mat(color: string, rough: number, metal = 0, sheen = false): THREE.MeshStandardMaterial {
    const k = `${color}|${rough}|${metal}|${sheen}`;
    let m = this.shared.get(k);
    if (!m) {
      m = sheen
        ? new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.4) })
        : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      this.shared.set(k, m);
    }
    return m;
  }

  /** Camisa: uniforme real (escudo, fornecedora, patrocínio, nome e número) ou camisa gerada. */
  private shirtTexture(p: Player3D): THREE.Texture {
    const key = `${p.kit ?? ""}|${p.shirt}|${p.pattern}|${p.stripe}|${p.num}|${p.name}|${p.sleeve}`;
    const hit = this.kitTex.get(key);
    if (hit) return hit;
    let t: THREE.Texture;
    if (p.kit) {
      const [club, which] = p.kit.split(":");
      const kt: THREE.CanvasTexture = new THREE.CanvasTexture(makeKitTexture(club, (Number(which) || 0) as KitWhich, { num: p.num, name: p.name, layout: "sheet", size: 256, onReady: () => { kt.needsUpdate = true; } }));
      t = kt;
    } else {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 256;
      const g = c.getContext("2d")!;
      g.fillStyle = p.shirt;
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = p.stripe;
      if (p.pattern === "stripes") for (let x = 12; x < 512; x += 48) g.fillRect(x, 0, 24, 256);
      else if (p.pattern === "hoops") for (let y = 24; y < 256; y += 64) g.fillRect(0, y, 512, 28);
      else if (p.pattern === "sash") {
        g.beginPath();
        g.moveTo(256 + 40, 0); g.lineTo(256 + 110, 0); g.lineTo(512 - 20, 256); g.lineTo(512 - 90, 256);
        g.fill();
      }
      g.fillStyle = shade(p.sleeve, 0.7);
      g.fillRect(0, 0, 512, 10);
      const dark = lum(p.shirt) < 0.55;
      g.fillStyle = dark ? "#ffffff" : "#141414";
      g.strokeStyle = dark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)";
      g.lineWidth = 4;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const n = String(p.num || "").slice(0, 2);
      if (p.name) {
        g.font = `800 34px "Barlow Condensed", Arial, sans-serif`;
        g.fillText(p.name, 128, 52, 170);
      }
      if (n) {
        g.font = `900 120px "Barlow Condensed", Arial, sans-serif`;
        g.strokeText(n, 128, 150);
        g.fillText(n, 128, 150);
        g.font = `900 40px "Barlow Condensed", Arial, sans-serif`;
        g.fillText(n, 256 + 170, 70);
      }
      t = new THREE.CanvasTexture(c);
    }
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.maxAniso;
    this.kitTex.set(key, t);
    return t;
  }

  make(p: Player3D): Rig {
    const G = this.geo;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const tall = p.tall ?? 0;
    root.scale.setScalar(PLAYER_SCALE * (1 + tall * 0.045));
    const wide = p.broad ? 1.1 : tall < 0 ? 0.96 : 1;
    const gk = p.grp === 0 && p.side !== 2;
    const ref = p.side === 2;
    const skin = this.mat(p.skin, 0.55, 0, true);
    const shirtTex = this.shirtTexture(p);
    const shirtM = new THREE.MeshPhysicalMaterial({ map: shirtTex, roughness: 0.72, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color("#ffffff") });
    const sleeveM = this.mat(p.sleeve, 0.72, 0, true);
    const shortsM = this.mat(p.shorts, 0.68, 0, true);
    const socksM = this.mat(p.socks, 0.8, 0, true);
    const bootM = this.mat(ref ? "#111111" : ["#111111", "#f2f2f2", "#ff4d1a", "#1e6cff", "#d4ff2a"][(p.num + p.id) % 5], 0.3, 0.15);
    const soleM = this.mat("#e8e8e8", 0.5);
    const hairM = this.mat(p.hair, 0.6, 0, true);
    const gloveM = this.mat("#f4f4f4", 0.5);
    const eyeM = this.mat("#15110e", 0.2);
    const mats: THREE.Material[] = [shirtM];
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, cast = true) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = cast && this.shadows;
      mesh.receiveShadow = false;
      parent.add(mesh);
      return mesh;
    };

    // quadril e calção
    const hips = new THREE.Group();
    hips.position.y = 0.93;
    body.add(hips);
    const shortsG = G.get(`shorts${wide}`, () => {
      const g = new THREE.LatheGeometry([0.17, 0.185, 0.19, 0.18, 0.16].map((r, i) => new THREE.Vector2(r * wide, -0.12 + i * 0.07)), 20);
      g.scale(1, 1, 0.66);
      return g;
    });
    add(shortsG, shortsM, hips);

    // tronco: peito mais largo que a cintura, camisa com o uniforme (frente em +z)
    const spine = new THREE.Group();
    spine.position.y = 0.16;
    hips.add(spine);
    const torsoG = G.get(`torso${wide}`, () => {
      const prof: [number, number][] = [[0.165, -0.12], [0.17, 0], [0.18, 0.12], [0.2, 0.25], [0.22, 0.37], [0.225, 0.44], [0.205, 0.5], [0.14, 0.545], [0.07, 0.56]];
      const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * wide, y)), 28, Math.PI / 2);
      g.scale(1, 1, 0.64);
      return g;
    });
    add(torsoG, shirtM, spine);
    // ombros (manga)
    const shoulderG = G.get(`sh${wide}`, () => {
      const g = new THREE.SphereGeometry(0.085, 14, 10);
      g.scale(1.05, 0.95, 0.95);
      return g;
    });
    for (const sx of [-1, 1]) add(shoulderG, sleeveM, spine).position.set(sx * 0.2 * wide, 0.47, 0);
    // pescoço e cabeça
    const neckG = G.get("neck", () => limb(0.058, 0.064, 0.12, 12));
    add(neckG, skin, spine).position.set(0, 0.64, 0.005);
    const head = new THREE.Group();
    head.position.set(0, 0.62, 0.01);
    spine.add(head);
    const skullG = G.get("skull", () => {
      const g = new THREE.SphereGeometry(0.115, 24, 18);
      g.scale(0.9, 1.08, 1);
      // queixo um pouco mais estreito
      const pos = g.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < 0) {
          const k = 1 + y * 1.6;
          pos.setX(i, pos.getX(i) * k);
          pos.setZ(i, pos.getZ(i) * (0.94 + 0.06 * k));
        }
      }
      g.computeVertexNormals();
      g.translate(0, 0.12, 0);
      return g;
    });
    add(skullG, skin, head);
    const noseG = G.get("nose", () => {
      const g = new THREE.ConeGeometry(0.022, 0.05, 8);
      g.rotateX(Math.PI / 2 + 0.3);
      g.translate(0, 0.105, 0.115);
      return g;
    });
    add(noseG, skin, head, false);
    const earG = G.get("ear", () => {
      const g = new THREE.SphereGeometry(0.025, 8, 6);
      g.scale(0.5, 1.1, 0.8);
      return g;
    });
    for (const sx of [-1, 1]) add(earG, skin, head, false).position.set(sx * 0.104, 0.115, -0.005);
    const eyeG = G.get("eye", () => new THREE.SphereGeometry(0.012, 8, 6));
    for (const sx of [-1, 1]) add(eyeG, eyeM, head, false).position.set(sx * 0.038, 0.135, 0.1);
    const browG = G.get("brow", () => new THREE.BoxGeometry(0.04, 0.008, 0.01));
    for (const sx of [-1, 1]) add(browG, hairM, head, false).position.set(sx * 0.038, 0.158, 0.104);
    const hs = p.hairStyle ?? "short";
    const cap = (r: number, sy: number, cut: number, dy: number) => G.get(`cap${r}|${sy}|${cut}|${dy}`, () => {
      const g = new THREE.SphereGeometry(r, 22, 12, 0, Math.PI * 2, 0, Math.PI * cut);
      g.scale(0.93, sy, 1.02);
      g.rotateX(-0.18);
      g.translate(0, 0.12 + dy, -0.008);
      return g;
    });
    if (hs === "afro") add(cap(0.155, 1.0, 0.6, 0.02), hairM, head);
    else if (hs === "long") {
      add(cap(0.124, 1.08, 0.56, 0.005), hairM, head);
      add(G.get("longback", () => {
        const g = new THREE.CylinderGeometry(0.11, 0.1, 0.2, 16, 1, true, Math.PI / 2, Math.PI);
        g.translate(0, 0.06, -0.02);
        return g;
      }), hairM, head).material = this.mat(p.hair, 0.6, 0, true);
    } else if (hs === "buzz") add(cap(0.118, 1.1, 0.45, 0), hairM, head);
    else if (hs === "mohawk") {
      add(cap(0.117, 1.1, 0.38, 0), hairM, head);
      add(G.get("mohawk", () => {
        const g = new THREE.BoxGeometry(0.035, 0.06, 0.2);
        g.translate(0, 0.245, -0.01);
        return g;
      }), hairM, head);
    } else if (hs !== "bald") add(cap(0.122, 1.12, 0.5, 0.004), hairM, head);
    if (p.beard) add(G.get("beard", () => {
      const g = new THREE.SphereGeometry(0.108, 16, 10, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.55, Math.PI * 0.35);
      g.scale(0.92, 1.05, 1.04);
      g.translate(0, 0.12, 0.004);
      return g;
    }), this.mat(shade(p.hair, 1.05), 0.8), head, false);

    // braços: ombro -> cotovelo -> mão
    const arm = (sx: number): [THREE.Group, THREE.Group] => {
      const up = new THREE.Group();
      up.position.set(sx * 0.215 * wide, 0.47, 0);
      spine.add(up);
      add(G.get(`uarm${wide}`, () => limb(0.058 * wide, 0.047, 0.29)), skin, up);
      const longSleeve = gk || ref;
      add(G.get(`sleeve${longSleeve}`, () => limb(0.072 * wide, 0.064, longSleeve ? 0.3 : 0.16)), sleeveM, up);
      const fore = new THREE.Group();
      fore.position.y = -0.28;
      up.add(fore);
      add(G.get("farm", () => limb(0.046, 0.036, 0.25)), longSleeve ? sleeveM : skin, fore);
      add(G.get("hand", () => {
        const g = new THREE.SphereGeometry(0.045, 12, 8);
        g.scale(0.8, 1.25, 0.55);
        g.translate(0, -0.27, 0);
        return g;
      }), gk ? gloveM : skin, fore);
      if (gk) add(G.get("glove", () => {
        const g = new THREE.SphereGeometry(0.055, 12, 8);
        g.scale(0.95, 1.35, 0.7);
        g.translate(0, -0.28, 0);
        return g;
      }), gloveM, fore);
      return [up, fore];
    };
    // pernas: quadril -> joelho -> chuteira
    const leg = (sx: number): [THREE.Group, THREE.Group] => {
      const thigh = new THREE.Group();
      thigh.position.set(sx * 0.095 * wide, -0.06, 0);
      hips.add(thigh);
      add(G.get(`thigh${wide}`, () => limb(0.085 * wide, 0.06, 0.45)), skin, thigh);
      add(G.get(`sleg${wide}`, () => limb(0.1 * wide, 0.092 * wide, 0.2)), shortsM, thigh).position.y = 0.02;
      const shin = new THREE.Group();
      shin.position.y = -0.44;
      thigh.add(shin);
      add(G.get("shin", () => limb(0.058, 0.04, 0.42)), skin, shin);
      add(G.get("sock", () => {
        const g = limb(0.062, 0.045, 0.34);
        g.translate(0, -0.06, 0);
        return g;
      }), socksM, shin);
      add(G.get("boot", () => {
        const g = new THREE.CapsuleGeometry(0.048, 0.13, 6, 12);
        g.rotateX(Math.PI / 2);
        g.scale(1, 0.75, 1);
        g.translate(0, -0.44, 0.045);
        return g;
      }), bootM, shin);
      add(G.get("sole", () => {
        const g = new THREE.BoxGeometry(0.085, 0.015, 0.23);
        g.translate(0, -0.473, 0.045);
        return g;
      }), soleM, shin, false);
      return [thigh, shin];
    };
    const [armL, foreL] = arm(-1);
    const [armR, foreR] = arm(1);
    const [legL, shinL] = leg(-1);
    const [legR, shinR] = leg(1);
    // sombra de contato (macia) sob os pés
    const blob = new THREE.Mesh(G.get("blob", () => {
      const g = new THREE.PlaneGeometry(1.2, 1.2);
      g.rotateX(-Math.PI / 2);
      return g;
    }), this.blobMat);
    blob.position.y = 0.02;
    blob.renderOrder = 1;
    root.add(blob);
    this.scene.add(root);
    return { root, body, spine, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, blob, facing: p.side === 1 ? -Math.PI / 2 : Math.PI / 2, key: this.key(p), mats, tex: [] };
  }

  disposeRig(r: Rig) {
    r.root.removeFromParent();
    for (const m of r.mats) m.dispose();
  }

  dispose() {
    this.geo.dispose();
    for (const t of this.kitTex.values()) t.dispose();
    for (const m of this.shared.values()) m.dispose();
    this.blobTex.dispose();
    this.blobMat.dispose();
  }
}

/** Ângulo mais curto de a para b. */
function angDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Estado de movimento suavizado de cada jogador (posição, velocidade, passada). */
export interface Motion {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** fase da passada (rad): avança com a distância percorrida (sem patinar) */
  phase: number;
  /** velocidade de giro do corpo (rad/s), para inclinar na curva */
  turn: number;
  /** ângulos das articulações no quadro anterior (blend entre animações) */
  prev?: number[];
}

/**
 * Persegue a posição do lance com uma mola criticamente amortecida: acelera e freia, faz curva em
 * vez de ziguezague e nunca dá "pulo". dt em ms.
 */
export function stepMotion(m: Motion, tx: number, tz: number, dt: number) {
  const d = Math.hypot(tx - m.x, tz - m.z);
  if (d > 9) {
    // mudança de cena (replay, gol, intervalo): reposiciona
    m.x = tx;
    m.z = tz;
    m.vx = m.vz = 0;
    return;
  }
  const w = 7.5; // rigidez (1/s)
  let left = Math.min(dt, 100) / 1000;
  while (left > 0) {
    const h = Math.min(left, 1 / 120);
    left -= h;
    const ax = w * w * (tx - m.x) - 2 * w * m.vx;
    const az = w * w * (tz - m.z) - 2 * w * m.vz;
    m.vx += ax * h;
    m.vz += az * h;
    // limite humano: ~9 m/s
    const v = Math.hypot(m.vx, m.vz);
    if (v > 9) {
      m.vx *= 9 / v;
      m.vz *= 9 / v;
    }
    m.x += m.vx * h;
    m.z += m.vz * h;
  }
  const speed = Math.hypot(m.vx, m.vz);
  // passada mais longa quanto mais rápido; 2 passos por ciclo
  const stride = 0.85 + 0.17 * speed;
  m.phase += ((speed * Math.min(dt, 100)) / 1000 / (2 * stride)) * Math.PI * 2;
}

const JOINTS = 14;
/** Blend entre poses: cada articulação segue a pose nova com um pequeno atraso (sem estalos). */
function blendJoints(r: Rig, dt: number, m: Motion | undefined, snap: boolean) {
  if (!m) return;
  const js = [r.legL, r.legR, r.shinL, r.shinR, r.armL, r.armR, r.foreL, r.foreR, r.spine, r.head];
  const cur: number[] = [];
  for (const j of js) cur.push(j.rotation.x, j.rotation.y, j.rotation.z);
  cur.push(r.body.rotation.x, r.body.rotation.z, r.body.position.y, r.body.rotation.y);
  if (!m.prev || snap || m.prev.length !== cur.length) {
    m.prev = cur;
    return;
  }
  const k = 1 - Math.exp(-Math.max(0, dt) / 55);
  for (let i = 0; i < cur.length; i++) cur[i] = m.prev[i] + (cur[i] - m.prev[i]) * k;
  let i = 0;
  for (const j of js) {
    j.rotation.set(cur[i], cur[i + 1], cur[i + 2]);
    i += 3;
  }
  r.body.rotation.x = cur[i++];
  r.body.rotation.z = cur[i++];
  r.body.position.y = cur[i++];
  r.body.rotation.y = cur[i++];
  m.prev = cur;
}
void JOINTS;

/** Posa o jogador no quadro: corrida, golpes, goleiro voando, comemoração. */
export function poseRig(p: Player3D, r: Rig, now: number, dt: number, ball: { x: number; z: number }, m?: Motion) {
  posePlayer(p, r, now, dt, ball, m);
  // golpes e quedas entram/saem com blend; a locomoção já é contínua
  blendJoints(r, dt, m, false);
}

function posePlayer(p: Player3D, r: Rig, now: number, dt: number, ball: { x: number; z: number }, m?: Motion) {
  const { root, body, spine, head, armL, armR, legL, legR, shinL, shinR, foreL, foreR } = r;
  const px = m ? m.x : p.x, pz = m ? m.z : p.z;
  root.position.set(px, 0, pz);
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  spine.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  for (const j of [shinL, shinR, foreL, foreR]) j.rotation.set(0, 0, 0);
  r.blob.scale.setScalar(1);
  const vx = m ? m.vx : p.vx, vz = m ? m.vz : p.vz;
  const speed = m ? Math.hypot(vx, vz) : Math.hypot(vx, vz) * 60; // m/s
  const moving = speed > 0.35;
  let target = r.facing;
  if (moving) target = facingAngle(vx, vz, r.facing);
  else if (p.dive < 0 && Math.hypot(ball.x - px, ball.z - pz) > 0.5) target = Math.atan2(ball.x - px, ball.z - pz);
  // giro do corpo amortecido (mais rápido parado, mais largo correndo)
  const before = r.facing;
  r.facing += angDelta(r.facing, target) * (1 - Math.exp(-Math.max(0, dt) / (moving ? 120 : 200)));
  const turn = dt > 0 ? angDelta(before, r.facing) / (dt / 1000) : 0;
  if (m) m.turn += (turn - m.turn) * (1 - Math.exp(-Math.max(0, dt) / 150));
  root.rotation.y = r.facing;
  // trote -> corrida -> disparada (pesos contínuos)
  const phase = m ? m.phase : p.walk * 0.95;
  const amp = Math.min(1, Math.max(0, (speed - 0.3) / 5.5));
  const run = Math.min(1, Math.max(0, (speed - 3.5) / 4));
  const legA = (0.42 + 0.5 * run) * amp;
  const sw = Math.sin(phase) * legA;
  legL.rotation.set(sw, 0, 0);
  legR.rotation.set(-sw, 0, 0);
  if (p.side === 2 && (p.pose === "carryBall" as any || (p.x === 0 && Math.abs(p.z) < 25))) {
    // Árbitro segurando a bola oficial com as duas mãos na frente do abdômen/peito
    armL.rotation.set(0.68, 0.32, -0.35);
    armR.rotation.set(0.68, -0.32, 0.35);
    foreL.rotation.set(-0.85, 0.25, 0);
    foreR.rotation.set(-0.85, -0.25, 0);
  } else {
    armL.rotation.set(-Math.sin(phase) * (0.35 + 0.45 * run) * amp, 0, 0.1);
    armR.rotation.set(Math.sin(phase) * (0.35 + 0.45 * run) * amp, 0, -0.1);
  }
  // joelho dobra na volta da passada (mais na disparada)
  shinL.rotation.x = Math.max(0, -Math.sin(phase - 0.6)) * (0.7 + 0.9 * run) * amp + 0.08 * amp + 0.04;
  shinR.rotation.x = Math.max(0, Math.sin(phase - 0.6)) * (0.7 + 0.9 * run) * amp + 0.08 * amp + 0.04;
  foreL.rotation.x = -0.25 - (0.7 + 0.4 * run) * amp;
  foreR.rotation.x = -0.25 - (0.7 + 0.4 * run) * amp;
  if (moving) {
    body.position.y = (Math.abs(Math.cos(phase)) - 0.5) * 0.06 * amp;
    body.rotation.x = 0.05 + 0.1 * amp + 0.08 * run;
    body.rotation.y = -Math.sin(phase) * 0.08 * amp; // quadril gira com a passada
    spine.rotation.y = Math.sin(phase) * 0.2 * amp; // ombros contra o quadril
    head.rotation.y = -Math.sin(phase) * 0.1 * amp;
    // inclina para dentro da curva
    if (m) body.rotation.z = Math.max(-0.32, Math.min(0.32, -m.turn * speed * 0.035));
  } else {
    // parado: respiração leve e peso do corpo mudando de perna
    const br = Math.sin(now / 520 + p.id) * 0.015;
    spine.rotation.x = br;
    body.rotation.z = Math.sin(now / 1700 + p.id) * 0.02;
    armL.rotation.z = 0.12 + br;
    armR.rotation.z = -0.12 - br;
    foreL.rotation.x = foreR.rotation.x = -0.25;
  }

  if (p.dive >= 0) {
    const s = p.dive;
    const toward = p.side === 0 ? 1 : -1;
    root.rotation.y = r.facing = toward > 0 ? Math.PI / 2 : -Math.PI / 2;
    const dir = (p.diveDir >= 0 ? 1 : -1) * (toward > 0 ? 1 : -1);
    body.rotation.z = dir * (Math.PI / 2) * Math.min(1, s * 2.5);
    body.position.y = 0.25 + Math.sin(Math.PI * Math.min(1, s * 1.3)) * 0.9;
    armL.rotation.set(Math.PI, 0, 0.2);
    armR.rotation.set(Math.PI, 0, -0.2);
    foreL.rotation.x = foreR.rotation.x = 0;
    legL.rotation.set(0.1, 0, -0.15);
    legR.rotation.set(-0.1, 0, 0.25);
    shinL.rotation.x = 0.5;
    r.blob.scale.setScalar(Math.max(0.4, 1 - body.position.y * 0.5));
    return;
  }
  if (p.down || p.pose === "fall") {
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.2;
    armL.rotation.set(Math.PI * 0.8, 0, 0);
    armR.rotation.set(Math.PI * 0.7, 0, 0);
    shinL.rotation.x = 0.6;
    head.rotation.x = -0.4;
    return;
  }
  const s = p.poseS;
  switch (p.pose) {
    case "pass": {
      const a = s < 0.4 ? 0.7 * (s / 0.4) : 0.7 - 1.5 * Math.min(1, (s - 0.4) / 0.35);
      legR.rotation.set(a, 0, -0.25);
      legL.rotation.set(0.05, 0, 0);
      shinR.rotation.x = s < 0.4 ? 0.9 : 0.2;
      armL.rotation.set(-0.3, 0, 0.55);
      armR.rotation.set(0.2, 0, -0.3);
      spine.rotation.y = -0.25;
      return;
    }
    case "special": {
      body.position.y = -0.12 * Math.min(1, s * 3);
      body.rotation.x = 0.28;
      legR.rotation.set(1.0 * Math.min(1, s * 2), 0, 0);
      shinR.rotation.x = 1.4;
      armL.rotation.set(0.6, 0, 0.9);
      armR.rotation.set(0.6, 0, -0.9);
      spine.rotation.y = 0.35;
      return;
    }
    case "save": {
      body.position.y = Math.sin(Math.PI * s) * 0.6;
      armL.rotation.set(Math.PI * 0.95, 0, 0.25);
      armR.rotation.set(Math.PI * 0.95, 0, -0.25);
      foreL.rotation.x = foreR.rotation.x = 0;
      legL.rotation.set(-0.3, 0, 0);
      shinL.rotation.x = 0.9;
      return;
    }
    case "kick":
    case "volley": {
      // armação lá atrás (joelho dobrado) e chicotada à frente
      const a = s < 0.35 ? 0.8 * (s / 0.35) : 0.8 - 2.4 * Math.min(1, (s - 0.35) / 0.4);
      legR.rotation.set(a, 0, 0);
      shinR.rotation.x = s < 0.35 ? 1.6 * (s / 0.35) : Math.max(0, 1.6 - 4 * (s - 0.35));
      legL.rotation.set(-0.1, 0, 0);
      armL.rotation.set(-0.5, 0, 0.75);
      armR.rotation.set(0.4, 0, -0.6);
      body.rotation.x = -0.15;
      spine.rotation.y = s < 0.35 ? -0.3 : 0.25;
      if (p.pose === "volley") body.position.y = Math.sin(Math.PI * s) * 0.35;
      return;
    }
    case "header":
      body.position.y = Math.sin(Math.PI * s) * 0.95;
      body.rotation.x = s < 0.5 ? -0.3 : 0.45;
      head.rotation.x = s < 0.5 ? -0.3 : 0.5;
      armL.rotation.set(-0.3, 0, 0.6);
      armR.rotation.set(-0.3, 0, -0.6);
      legL.rotation.set(-0.4, 0, 0);
      shinL.rotation.x = 1;
      legR.rotation.set(0.2, 0, 0);
      shinR.rotation.x = 0.8;
      r.blob.scale.setScalar(Math.max(0.4, 1 - body.position.y * 0.5));
      return;
    case "bicycle":
    case "flip":
      body.position.y = 0.6 + Math.sin(Math.PI * s) * 1.1;
      body.rotation.x = -Math.PI * 2 * s;
      legR.rotation.set(-1.6, 0, 0);
      legL.rotation.set(0.4, 0, 0);
      shinL.rotation.x = 1.2;
      armL.rotation.set(0, 0, 1.2);
      armR.rotation.set(0, 0, -1.2);
      r.blob.scale.setScalar(0.5);
      return;
    case "stepover": {
      const w = Math.sin(s * Math.PI * 4);
      legR.rotation.set(-0.3, 0, -0.5 * Math.max(0, w));
      legL.rotation.set(-0.3, 0, 0.5 * Math.max(0, -w));
      body.rotation.z = w * 0.18;
      armL.rotation.set(0, 0, 0.5);
      armR.rotation.set(0, 0, -0.5);
      return;
    }
    case "slide":
      body.rotation.z = Math.PI / 2.4;
      body.position.y = 0.35;
      legR.rotation.set(-1.2, 0, 0);
      shinL.rotation.x = 1.3;
      armL.rotation.set(0, 0, 1.2);
      return;
    case "knee":
      body.position.y = -0.52;
      legL.rotation.set(-1.5, 0, 0);
      legR.rotation.set(-1.5, 0, 0);
      shinL.rotation.x = shinR.rotation.x = 1.6;
      body.rotation.x = -0.25;
      armL.rotation.set(Math.PI * 0.95, 0, 0.5);
      armR.rotation.set(Math.PI * 0.95, 0, -0.5);
      foreL.rotation.x = foreR.rotation.x = 0;
      head.rotation.x = -0.5;
      return;
    case "card":
      armR.rotation.set(Math.PI, 0, -0.1);
      foreR.rotation.x = 0;
      return;
    default:
      break;
  }
  if (p.arms) {
    const w = Math.sin(now / 90 + p.id);
    armL.rotation.set(Math.PI * 0.92 + w * 0.15, 0, 0.35);
    armR.rotation.set(Math.PI * 0.92 - w * 0.15, 0, -0.35);
    foreL.rotation.x = foreR.rotation.x = -0.2;
    body.position.y += Math.abs(Math.sin(now / 140 + p.id)) * 0.25;
    head.rotation.x = -0.35;
  } else if (p.sad) {
    body.rotation.x = 0.2;
    spine.rotation.x = 0.15;
    head.rotation.x = 0.55;
    armL.rotation.set(0, 0, 0.04);
    armR.rotation.set(0, 0, -0.04);
    foreL.rotation.x = foreR.rotation.x = -0.1;
  }
}
