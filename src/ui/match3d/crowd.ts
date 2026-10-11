// Torcida 3D instanciada (milhares de torcedores numa só chamada de desenho) e a festa da
// arquibancada: bandeiras, bandeirão, mosaico, sinalizadores, fumaça colorida e papel picado.
// A torcida reage ao jogo no shader: pula e levanta os braços no gol, e vai embora na goleada
// (cada torcedor tem uma "ordem de saída"; uLeave esconde quem já saiu).
import * as THREE from "three";

export interface FanSpot {
  x: number;
  y: number;
  z: number;
  /** direção para onde olha (rad, em torno de y) */
  rot: number;
  /** 0 = torcida da casa, 1 = visitante */
  team: 0 | 1;
  shirt: THREE.Color;
  /** cor do mosaico (time da casa) */
  mosaic?: THREE.Color;
  /** ordem de saída 0..1 (quem tem número menor vai embora primeiro) */
  rank: number;
  scale: number;
}

const SKINS = ["#f1c9a0", "#d9a273", "#b07546", "#7a4a2b", "#e8bb8c", "#5a3520"].map((c) => new THREE.Color(c));

/** Um torcedor de poucos polígonos: pernas, tronco, braços (marcados para levantar) e cabeça. */
function fanGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, number][] = [];
  const legs = new THREE.BoxGeometry(0.34, 0.62, 0.26);
  legs.translate(0, 0.42, 0);
  parts.push([legs, 3]);
  const torso = new THREE.CylinderGeometry(0.2, 0.17, 0.6, 7);
  torso.scale(1, 1, 0.7);
  torso.translate(0, 1.0, 0);
  parts.push([torso, 0]);
  for (const sx of [-1, 1]) {
    const a = new THREE.BoxGeometry(0.09, 0.5, 0.09);
    a.translate(sx * 0.25, 1.0, 0.02);
    parts.push([a, 1]);
  }
  const head = new THREE.IcosahedronGeometry(0.12, 1);
  head.translate(0, 1.43, 0);
  parts.push([head, 2]);
  const pos: number[] = [], nor: number[] = [], part: number[] = [];
  for (const [g0, k] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute("position"), n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      part.push(k);
    }
    g.dispose();
    if (g !== g0) g0.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  return g;
}

export class FanCrowd {
  mesh: THREE.InstancedMesh;
  uniforms = {
    uTime: { value: 0 },
    uJump: { value: new THREE.Vector2(0, 0) },
    uRaise: { value: new THREE.Vector2(0, 0) },
    uLeave: { value: 0 },
    uLeaveTeam: { value: 0 },
    uMosaic: { value: 0 },
    uExcite: { value: 0.5 },
    uSkin: { value: SKINS },
  };
  private mat: THREE.MeshLambertMaterial;

  constructor(spots: FanSpot[]) {
    const geo = fanGeometry();
    const n = spots.length;
    const aFan = new Float32Array(n * 4), aShirt = new Float32Array(n * 3), aMos = new Float32Array(n * 3);
    spots.forEach((s, i) => {
      aFan.set([Math.random(), s.rank, s.team, Math.random()], i * 4);
      aShirt.set([s.shirt.r, s.shirt.g, s.shirt.b], i * 3);
      const m = s.mosaic ?? s.shirt;
      aMos.set([m.r, m.g, m.b], i * 3);
    });
    geo.setAttribute("aFan", new THREE.InstancedBufferAttribute(aFan, 4));
    geo.setAttribute("aShirt", new THREE.InstancedBufferAttribute(aShirt, 3));
    geo.setAttribute("aMos", new THREE.InstancedBufferAttribute(aMos, 3));
    this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const U = this.uniforms;
    this.mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
attribute float aPart; attribute vec4 aFan; attribute vec3 aShirt; attribute vec3 aMos;
uniform float uTime; uniform vec2 uJump; uniform vec2 uRaise; uniform float uLeave; uniform float uLeaveTeam;
uniform float uMosaic; uniform float uExcite; uniform vec3 uSkin[6];
varying vec3 vFanCol;`)
        .replace("#include <begin_vertex>", `vec3 transformed = vec3(position);
float team = aFan.z;
float j = team < 0.5 ? uJump.x : uJump.y;
float r = team < 0.5 ? uRaise.x : uRaise.y;
float mos = team < 0.5 ? uMosaic : 0.0;
float idleUp = step(0.9, fract(aFan.w * 13.7 + floor(uTime * 0.3 + aFan.x * 7.0) * 0.618)) * uExcite;
r = max(max(r, idleUp), mos);
if (aPart > 0.5 && aPart < 1.5) transformed.y = mix(transformed.y, 2.48 - transformed.y, r);
float bounce = abs(sin(uTime * (6.5 + aFan.w * 3.0) + aFan.x * 6.283));
transformed.y += bounce * 0.3 * j;
transformed.x += sin(uTime * 1.3 + aFan.x * 6.0) * 0.03 * (0.3 + uExcite);
float gone = (abs(team - uLeaveTeam) < 0.5 && aFan.y < uLeave) ? 1.0 : 0.0;
transformed *= 1.0 - gone;
int si = int(floor(aFan.w * 5.99));
vec3 skin = uSkin[0];
for (int k = 1; k < 6; k++) if (k == si) skin = uSkin[k];
vec3 shirt = mix(aShirt, aMos, mos);
vFanCol = aPart > 2.5 ? mix(vec3(0.08, 0.09, 0.12), aShirt * 0.35, 0.3) : aPart > 1.5 ? skin : shirt;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vFanCol;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vFanCol;");
    };
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    spots.forEach((s, i) => {
      e.set(0, s.rot, 0);
      q.setFromEuler(e);
      m.compose(v.set(s.x, s.y, s.z), q, sc.setScalar(s.scale));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------- texturas
export function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.2, "rgba(255,255,255,0.7)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.18)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

export function smokeTexture(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    for (let i = 0; i < 26; i++) {
      const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.22)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    }
  });
}

/** Bandeira listrada nas cores do clube (com a sigla). */
export function flagTexture(colors: readonly string[], abbr: string, stripes: "v" | "h" | "d", star = false): THREE.CanvasTexture {
  return canvasTex(256, 160, (g) => {
    const cs = [colors[0], colors[1] ?? "#ffffff", colors[2] ?? colors[0]];
    const n = 5;
    for (let i = 0; i < n; i++) {
      g.fillStyle = cs[i % 2];
      if (stripes === "v") g.fillRect((i * 256) / n, 0, 256 / n + 1, 160);
      else if (stripes === "h") g.fillRect(0, (i * 160) / n, 256, 160 / n + 1);
      else {
        g.save();
        g.translate(128, 80);
        g.rotate(-0.5);
        g.fillRect(-200 + (i * 400) / n, -200, 400 / n + 1, 400);
        g.restore();
      }
    }
    if (star) {
      g.fillStyle = cs[2] === cs[0] ? "#f5c542" : cs[2];
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5 - Math.PI / 2, r = k % 2 ? 14 : 34;
        g.lineTo(200 + Math.cos(a) * r, 46 + Math.sin(a) * r);
      }
      g.fill();
    }
    g.font = `900 64px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.strokeText(abbr, 128, 84);
    g.fillStyle = "#ffffff";
    g.fillText(abbr, 128, 84);
  });
}

/** Material de pano que tremula ao vento (vértices ondulam no shader). */
export function clothMaterial(map: THREE.Texture, timeU: { value: number }, amp = 0.35): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", `vec3 transformed = vec3(position);
float wv = uv.x;
transformed.z += sin(uTime * 4.0 + position.x * 1.7 + position.y * 0.8) * ${amp.toFixed(3)} * wv + sin(uTime * 7.3 + position.x * 3.1) * ${(amp * 0.25).toFixed(3)} * wv;`);
  };
  return m;
}

// ---------------------------------------------------------------- festa
export interface FestaSetup {
  colors: readonly string[];
  abbr: string;
  /** força 0..1 (tamanho da torcida e importância do jogo) */
  level: number;
  reduced: boolean;
  /** pontos na frente da arquibancada da torcida (sinalizadores, bandeiras): [x, y, z, rot] */
  front: [number, number, number, number][];
  /** onde fica o bandeirão: centro, largura, profundidade, inclinação (rad) e rotação */
  banner?: { x: number; y: number; z: number; w: number; d: number; slope: number; rot: number };
}

interface Smoke { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; base: number }

export class Festa {
  group = new THREE.Group();
  private t = { value: 0 };
  private flares: { core: THREE.Sprite; light?: THREE.PointLight; base: THREE.Vector3; on: number }[] = [];
  private smokes: Smoke[] = [];
  private smokeMats: THREE.SpriteMaterial[] = [];
  private conf: THREE.Points;
  private confVel: Float32Array;
  private confOn = 0;
  private banner: THREE.Mesh | null = null;
  private bannerOn = 0;
  private bannerK = 0;
  private flareUntil = 0;
  private time = 0;
  private disposables: { dispose(): void }[] = [];
  private smokeTex: THREE.Texture;
  private glow: THREE.Texture;

  constructor(private o: FestaSetup, private area: { cx: number; cz: number; w: number; d: number }) {
    this.glow = glowTexture();
    this.smokeTex = smokeTexture();
    this.disposables.push(this.glow, this.smokeTex);
    const nFlags = Math.round(4 + o.level * 14);
    const flagGeo = new THREE.PlaneGeometry(3.2, 2, 14, 6);
    flagGeo.translate(1.6, 0, 0);
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 3.4, 5);
    const poleMat = new THREE.MeshStandardMaterial({ color: "#d9d9d9", metalness: 0.6, roughness: 0.35 });
    this.disposables.push(flagGeo, poleGeo, poleMat);
    const flagMats = (["v", "h", "d"] as const).map((k, i) => {
      const t = flagTexture(o.colors, o.abbr, k, i === 2);
      this.disposables.push(t);
      const m = clothMaterial(t, this.t);
      this.disposables.push(m);
      return m;
    });
    const front = o.front;
    for (let i = 0; i < nFlags && front.length; i++) {
      const [x, y, z, rot] = front[Math.floor(((i + 0.5) / nFlags) * front.length)];
      const g = new THREE.Group();
      g.position.set(x, y + 0.6, z);
      g.rotation.y = rot + (Math.random() - 0.5) * 0.6;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 1.7;
      const flag = new THREE.Mesh(flagGeo, flagMats[i % 3]);
      flag.position.y = 2.4;
      g.add(pole, flag);
      g.rotation.z = (Math.random() - 0.5) * 0.4;
      this.group.add(g);
    }
    // sinalizadores (com luz de verdade nos primeiros)
    const nFl = Math.round(3 + o.level * 13);
    for (let i = 0; i < nFl && front.length; i++) {
      const [x, y, z] = front[Math.floor(((i + 0.25) / nFl) * front.length)];
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(4, 1.2, 0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      core.scale.setScalar(2.4);
      const base = new THREE.Vector3(x, y + 1.9, z);
      core.position.copy(base);
      core.visible = false;
      this.group.add(core);
      let light: THREE.PointLight | undefined;
      if (i < 3) {
        light = new THREE.PointLight("#ff5a1e", 0, 30, 2);
        light.position.copy(base);
        this.group.add(light);
      }
      this.flares.push({ core, light, base, on: 0 });
    }
    // fumaça nas cores do clube
    for (const c of [o.colors[0], o.colors[1] ?? "#ffffff", o.colors[0]]) {
      const m = new THREE.SpriteMaterial({ map: this.smokeTex, color: c, transparent: true, depthWrite: false, opacity: 0 });
      this.smokeMats.push(m);
      this.disposables.push(m);
    }
    // papel picado
    const N = Math.round(800 + o.level * 2200);
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    this.confVel = new Float32Array(N * 3);
    const cs = [o.colors[0], o.colors[1] ?? "#ffffff", "#ffffff", o.colors[2] ?? "#ffffff"].map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      const c = cs[i % cs.length];
      col.set([c.r, c.g, c.b], i * 3);
      pos.set([0, -50, 0], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pm = new THREE.PointsMaterial({ size: 0.13, vertexColors: true, sizeAttenuation: true });
    this.conf = new THREE.Points(pg, pm);
    this.conf.frustumCulled = false;
    this.group.add(this.conf);
    this.disposables.push(pg, pm);
    // bandeirão
    if (o.banner) {
      const b = o.banner;
      const t = canvasTex(1024, 512, (g) => {
        const cs2 = [o.colors[0], o.colors[1] ?? "#ffffff"];
        for (let i = 0; i < 8; i++) {
          g.fillStyle = cs2[i % 2];
          g.fillRect(0, (i * 512) / 8, 1024, 512 / 8 + 1);
        }
        g.fillStyle = cs2[0];
        g.beginPath();
        g.arc(512, 256, 200, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 18;
        g.strokeStyle = cs2[1];
        g.stroke();
        g.font = `900 210px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = cs2[1];
        g.fillText(o.abbr, 512, 268);
      });
      this.disposables.push(t);
      const geo = new THREE.PlaneGeometry(b.w, b.d, 24, 10);
      const m = clothMaterial(t, this.t, 0.25);
      this.disposables.push(geo, m);
      const mesh = new THREE.Mesh(geo, m);
      const g = new THREE.Group();
      g.position.set(b.x, b.y, b.z);
      g.rotation.y = b.rot;
      mesh.rotation.x = -Math.PI / 2 + b.slope;
      mesh.position.y = 1.9;
      g.add(mesh);
      g.visible = false;
      this.group.add(g);
      this.banner = mesh;
    }
  }

  /** Acende tudo por `ms` (entrada dos times, gol). */
  fire(ms: number, banner = false) {
    if (this.o.reduced) return;
    this.flareUntil = Math.max(this.flareUntil, this.time + ms);
    this.confOn = Math.max(this.confOn, this.time + Math.min(ms, 6000));
    if (banner) this.bannerOn = Math.max(this.bannerOn, this.time + ms);
    this.spawnConfetti();
  }

  private spawnConfetti() {
    const p = this.conf.geometry.getAttribute("position") as THREE.BufferAttribute;
    const a = this.area;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, a.cx + (Math.random() - 0.5) * a.w, 10 + Math.random() * 14, a.cz + (Math.random() - 0.5) * a.d);
      this.confVel.set([(Math.random() - 0.5) * 1.5, -1.2 - Math.random() * 1.6, (Math.random() - 0.5) * 1.5], i * 3);
    }
    p.needsUpdate = true;
  }

  update(dt: number) {
    const s = dt / 1000;
    this.time += dt;
    this.t.value = this.time / 1000;
    const flaring = this.time < this.flareUntil;
    for (const f of this.flares) {
      f.on += ((flaring ? 1 : 0) - f.on) * Math.min(1, s * 2);
      const fl = 0.75 + Math.random() * 0.5;
      f.core.visible = f.on > 0.02;
      f.core.scale.setScalar(2.4 * fl * f.on);
      f.core.position.set(f.base.x + (Math.random() - 0.5) * 0.08, f.base.y + Math.sin(this.time / 300 + f.base.x) * 0.3, f.base.z);
      if (f.light) f.light.intensity = 140 * f.on * fl;
      if (flaring && Math.random() < s * 3.2) this.puff(f.base);
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const m = this.smokes[i];
      m.life += s;
      m.s.position.addScaledVector(m.v, s);
      m.v.x += 0.25 * s;
      const k = m.life / m.max;
      m.s.scale.setScalar(m.base * (1 + k * 2.5));
      m.s.material.opacity = Math.sin(Math.PI * Math.min(1, k)) * 0.55;
      if (k >= 1) {
        this.group.remove(m.s);
        m.s.material.dispose();
        this.smokes.splice(i, 1);
      }
    }
    if (this.time < this.confOn + 9000) {
      const p = this.conf.geometry.getAttribute("position") as THREE.BufferAttribute;
      const v = this.confVel;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i);
        if (y < -10) continue;
        const fx = Math.sin(this.time / 300 + i) * 0.6;
        y += v[i * 3 + 1] * s;
        p.setXYZ(i, p.getX(i) + (v[i * 3] + fx) * s, y < 0.05 ? -50 : y, p.getZ(i) + v[i * 3 + 2] * s);
      }
      p.needsUpdate = true;
    }
    if (this.banner) {
      const on = this.time < this.bannerOn;
      this.bannerK += ((on ? 1 : 0) - this.bannerK) * Math.min(1, s * 1.2);
      const g = this.banner.parent!;
      g.visible = this.bannerK > 0.01;
      this.banner.scale.y = Math.max(0.01, this.bannerK);
    }
  }

  private puff(at: THREE.Vector3) {
    if (this.smokes.length > 70) return;
    const m = this.smokeMats[Math.floor(Math.random() * this.smokeMats.length)];
    const s = new THREE.Sprite(m.clone());
    const base = 2.2 + Math.random() * 1.5;
    s.position.set(at.x + (Math.random() - 0.5), at.y + 0.5, at.z + (Math.random() - 0.5));
    s.scale.setScalar(base);
    this.group.add(s);
    this.smokes.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.4 + Math.random(), (Math.random() - 0.3) * 0.8), life: 0, max: 4 + Math.random() * 3, base });
  }

  dispose() {
    for (const m of this.smokes) m.s.material.dispose();
    for (const f of this.flares) f.core.material.dispose();
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
