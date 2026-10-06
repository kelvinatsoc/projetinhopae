// Sede do clube em 3D, estilo PS2: complexo low-poly (estádio, diretoria, CT, vestiário, base,
// departamento médico, sala de imprensa e observação), sombreamento chapado, neblina, resolução
// interna reduzida e sem antisserrilhado. Só é baixado quando a tela do Clube abre (import dinâmico).
// Toda animação usa o tempo decorrido (frameDt), nunca o número de quadros: igual a 60 ou 120 Hz.
import * as THREE from "three";
import { frameDt } from "../animTime";

THREE.ColorManagement.enabled = false;

export type HqBuilding = "stadium" | "office" | "training" | "locker" | "academy" | "medical" | "press" | "scouting";

export interface HqOptions {
  host: HTMLElement;
  colors: [string, string];
  /** níveis 1-5 vindos da Estrutura */
  stadiumLv: number;
  trainLv: number;
  youthLv: number;
  medicalLv: number;
  night: boolean;
  reduced: boolean;
  labels: Partial<Record<HqBuilding, HTMLElement>>;
  onPick: (b: HqBuilding) => void;
}

const SKY_DAY = 0x8fc6ff, SKY_NIGHT = 0x0a1030;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

function mat(color: THREE.ColorRepresentation, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

export class HqRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
  private ray = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  private anchors: Partial<Record<HqBuilding, THREE.Vector3>> = {};
  private movers: ((t: number, dt: number) => void)[] = [];
  private yaw = -0.55;
  private pitch = 0.72;
  private dist = 62;
  private idleSince = 0;
  private raf = 0;
  private last = 0;
  private t = 0;
  private visible = true;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;
  private drag: { x: number; y: number; moved: number; yaw: number; pitch: number } | null = null;
  private tmp = new THREE.Vector3();
  private labelSize = new Map<HTMLElement, [number, number]>();

  constructor(private o: HqOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
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

  // ------------------------------------------------------------ cena
  private build() {
    const { o, scene } = this;
    const [c1, c2] = o.colors;
    const night = o.night;
    scene.background = new THREE.Color(night ? SKY_NIGHT : SKY_DAY);
    scene.fog = new THREE.Fog(night ? SKY_NIGHT : SKY_DAY, 55, 110);
    scene.add(new THREE.HemisphereLight(night ? 0x4a5a9a : 0xdff1ff, night ? 0x101820 : 0x557a3a, night ? 0.55 : 0.95));
    const sun = new THREE.DirectionalLight(night ? 0x9fb4ff : 0xfff1d6, night ? 0.35 : 1.1);
    sun.position.set(30, 50, 20);
    scene.add(sun);

    // chão: grama em xadrez + calçadas
    const grass = canvasTex(64, 64, (g) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? "#4f8f3a" : "#5a9b42"; g.fillRect(x * 8, y * 8, 8, 8);
      }
    });
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(12, 12);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat(0xffffff, { map: grass }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    // anel de rua
    const road = new THREE.Mesh(new THREE.RingGeometry(27, 30, 48, 1), mat(0x3d4048));
    road.rotation.x = -Math.PI / 2; road.position.y = 0.02;
    scene.add(road);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(25, 32), mat(0x9a9384));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.01;
    scene.add(plaza);

    this.stadium(c1, c2);
    this.office(c1, c2);
    this.training();
    this.locker(c1);
    this.academy(c2);
    this.medical();
    this.press();
    this.scouting();
    this.trees();
    this.cars(c1);
  }

  private tag(obj: THREE.Object3D, id: HqBuilding, anchorY: number) {
    obj.traverse((m) => { m.userData.hq = id; });
    this.pickables.push(obj);
    this.anchors[id] = new THREE.Vector3(obj.position.x, anchorY, obj.position.z);
    this.scene.add(obj);
  }

  private stadium(c1: string, c2: string) {
    const g = new THREE.Group();
    g.position.set(0, 0, -6);
    const lv = this.o.stadiumLv;
    const pitchTex = canvasTex(64, 40, (x) => {
      for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#3f8a2e" : "#4a9a36"; x.fillRect(i * 8, 0, 8, 40); }
      x.strokeStyle = "#e8ffe8"; x.lineWidth = 1;
      x.strokeRect(2.5, 2.5, 59, 35); x.beginPath(); x.moveTo(32, 2.5); x.lineTo(32, 37.5); x.stroke();
      x.beginPath(); x.arc(32, 20, 5, 0, Math.PI * 2); x.stroke();
      x.strokeRect(2.5, 12.5, 7, 15); x.strokeRect(54.5, 12.5, 7, 15);
    });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), mat(0xffffff, { map: pitchTex }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.05;
    g.add(pitch);
    // arquibancadas: anel elíptico, mais alto conforme o nível do estádio
    const seats = [mat(c1), mat(c2), mat(0x8a8f99)];
    const segs = 28, rx = 11.5, rz = 8.2, h = 1.6 + lv * 0.9;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(2.9, h, 2.6), seats[i % 3 === 2 ? 2 : i % 2]);
      seg.position.set(Math.cos(a) * rx, h / 2, Math.sin(a) * rz);
      seg.rotation.y = -a + Math.PI / 2;
      seg.rotation.x = 0;
      g.add(seg);
      if (lv >= 4) { // cobertura
        const roof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 3.4), mat(0xdfe3ea));
        roof.position.set(Math.cos(a) * (rx - 0.3), h + 0.8, Math.sin(a) * (rz - 0.3));
        roof.rotation.y = -a + Math.PI / 2;
        g.add(roof);
      }
    }
    // refletores nos cantos (acesos à noite)
    const glowMat = new THREE.MeshBasicMaterial({ color: this.o.night ? 0xfff6c8 : 0xc9ccd2 });
    for (const [x, z] of [[-12, -9], [12, -9], [-12, 9], [12, 9]] as const) {
      const pole = box(0.4, h + 5, 0.4, mat(0x6b6f78), x, 0, z);
      const lamp = box(2, 1, 0.5, glowMat, x, h + 5, z);
      lamp.lookAt(0, 0, 0);
      g.add(pole, lamp);
      if (this.o.night) {
        const l = new THREE.PointLight(0xfff2c0, 40, 30, 1.6);
        l.position.set(x * 0.8, h + 4, z * 0.8);
        g.add(l);
      }
    }
    this.tag(g, "stadium", h + 4);
  }

  private windows(cols: number, rows: number, base: string) {
    const lit = this.o.night;
    return canvasTex(cols * 8, rows * 8, (g) => {
      g.fillStyle = base; g.fillRect(0, 0, cols * 8, rows * 8);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const on = lit ? ((x * 7 + y * 3) % 5 !== 0) : false;
        g.fillStyle = on ? "#ffe9a3" : "#2c4a6e";
        g.fillRect(x * 8 + 2, y * 8 + 2, 4, 4);
      }
    });
  }

  private flag(color: string, x: number, z: number, h: number, parent: THREE.Object3D) {
    parent.add(box(0.15, h, 0.15, mat(0xdddddd), x, 0, z));
    const geo = new THREE.PlaneGeometry(1.6, 1, 6, 1);
    const flag = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide }));
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

  private office(c1: string, c2: string) {
    const g = new THREE.Group();
    g.position.set(-15, 0, 9);
    const win = this.windows(6, 4, "#d9dde4");
    const facade = mat(0xffffff, { map: win });
    g.add(box(7, 5, 5, [mat(0xc9ced8), mat(0xc9ced8), mat(0x8e95a3), mat(0x8e95a3), facade, facade] as unknown as THREE.Material));
    g.add(box(7.4, 0.5, 5.4, mat(c1), 0, 5, 0));
    g.add(box(2, 1.6, 0.4, mat(c2), 0, 0, 2.6)); // porta/toldo
    this.flag(c1, -2.6, 3.6, 4, g);
    this.flag(c2, -1.4, 3.6, 4, g);
    this.flag("#2fa84f", 2.2, 3.6, 4, g);
    this.tag(g, "office", 7);
  }

  private training() {
    const g = new THREE.Group();
    g.position.set(15, 0, 9);
    const n = 1 + Math.floor((this.o.trainLv - 1) / 2); // 1 a 3 campos
    const tex = canvasTex(32, 20, (x) => {
      for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? "#3c8a2c" : "#479a35"; x.fillRect(i * 8, 0, 8, 20); }
      x.strokeStyle = "#e8ffe8"; x.strokeRect(1.5, 1.5, 29, 17); x.beginPath(); x.moveTo(16, 1.5); x.lineTo(16, 18.5); x.stroke();
    });
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.4), mat(0xffffff, { map: tex }));
      p.rotation.x = -Math.PI / 2; p.position.set(0, 0.04, -5 + i * 5);
      g.add(p);
    }
    // jogadores treinando: correm em círculo e fazem tiros curtos
    const kit = [mat(0xf2c230), mat(0xff7a1a)];
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.Group();
      pl.add(box(0.5, 0.9, 0.35, kit[i % 2], 0, 0.45, 0));
      pl.add(box(0.35, 0.35, 0.35, mat(0xc68e5e), 0, 1.35, 0));
      g.add(pl);
      const r = 1.2 + (i % 3) * 0.6, ph = (i / 6) * Math.PI * 2;
      this.movers.push((t) => {
        const a = ph + t * (0.7 + (i % 2) * 0.3);
        pl.position.set(Math.cos(a) * r, Math.abs(Math.sin(t * 9 + i)) * 0.12, -5 + Math.sin(a) * r * 0.6);
        pl.rotation.y = -a;
      });
    }
    for (let i = 0; i < 5; i++) g.add(box(0.25, 0.4, 0.25, mat(0xff6a00), -3 + i * 1.5, 0, -2.2));
    this.tag(g, "training", 3);
  }

  private locker(c1: string) {
    const g = new THREE.Group();
    g.position.set(0, 0, 10.5);
    g.add(box(6, 2.4, 3.5, mat(0xb9bec8)));
    g.add(box(6.4, 0.4, 3.9, mat(c1), 0, 2.4, 0));
    g.add(box(1.2, 1.6, 0.2, mat(0x40464f), 0, 0, 1.8));
    this.tag(g, "locker", 4);
  }

  private academy(c2: string) {
    const g = new THREE.Group();
    g.position.set(-17, 0, -6);
    const floors = 1 + this.o.youthLv;
    const win = this.windows(4, floors, "#e8e2cf");
    const fm = mat(0xffffff, { map: win });
    g.add(box(4.5, floors * 1.2, 4, fm));
    g.add(box(4.9, 0.4, 4.4, mat(c2 === "#ffffff" ? 0x2fa84f : c2), 0, floors * 1.2, 0));
    const mini = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), mat(0x4a9a36));
    mini.rotation.x = -Math.PI / 2; mini.position.set(0, 0.04, 3.8);
    g.add(mini);
    this.tag(g, "academy", floors * 1.2 + 2);
  }

  private medical() {
    const g = new THREE.Group();
    g.position.set(17, 0, -6);
    g.add(box(4.5, 3, 4, mat(0xf4f6f8)));
    if (this.o.medicalLv >= 3) g.add(box(3, 2, 3, mat(0xe6eaee), 3.4, 0, 0.5));
    const red = new THREE.MeshBasicMaterial({ color: 0xe53935 });
    g.add(box(1.6, 0.45, 0.1, red, 0, 1.9, 2.05));
    g.add(box(0.45, 1.6, 0.1, red, 0, 1.33, 2.05));
    this.tag(g, "medical", 5);
  }

  private press() {
    const g = new THREE.Group();
    g.position.set(-7, 0, 19);
    g.add(box(5, 2.6, 3.5, mat(0x5a6273)));
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 8, 1, true), mat(0xe4e7ec, { side: THREE.DoubleSide }));
    dish.position.set(1.4, 3.5, 0); dish.rotation.z = 2.2;
    g.add(box(0.15, 0.9, 0.15, mat(0x999999), 1.4, 2.6, 0), dish);
    this.movers.push((t) => { dish.rotation.y = Math.sin(t * 0.4) * 0.6; });
    this.tag(g, "press", 4.5);
  }

  private scouting() {
    const g = new THREE.Group();
    g.position.set(7, 0, 19);
    g.add(box(3, 2.2, 3, mat(0x7b5a3c)));
    g.add(box(1.2, 4, 1.2, mat(0x8d6b4b), 0, 2.2, 0));
    g.add(box(2, 0.9, 2, mat(0x3a6aa8), 0, 6.2, 0));
    const beacon = box(0.4, 0.4, 0.4, new THREE.MeshBasicMaterial({ color: 0xff3b3b }), 0, 7.1, 0);
    g.add(beacon);
    this.movers.push((t) => { beacon.visible = Math.sin(t * 3) > -0.2; });
    this.tag(g, "scouting", 8);
  }

  private trees() {
    const leaf = mat(0x2f6b2a), trunk = mat(0x6b4a2b);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + 0.2;
      const r = 33 + (i % 3) * 2.5;
      const t = new THREE.Group();
      t.add(box(0.4, 1, 0.4, trunk));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 5), leaf);
      cone.position.y = 2.2;
      t.add(cone);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      this.scene.add(t);
    }
  }

  private cars(c1: string) {
    const colors = [c1, "#e8e8e8", "#3a6aa8", "#d9a400"];
    for (let i = 0; i < 4; i++) {
      const car = new THREE.Group();
      car.add(box(1.8, 0.6, 0.9, mat(colors[i]), 0, 0.2, 0));
      car.add(box(1, 0.45, 0.8, mat(0x223344), -0.1, 0.8, 0));
      this.scene.add(car);
      const ph = (i / 4) * Math.PI * 2, sp = 0.12 + i * 0.03, r = i % 2 ? 28 : 29;
      this.movers.push((t) => {
        const a = ph + t * sp * (i % 2 ? -1 : 1);
        car.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        car.rotation.y = -a + (i % 2 ? Math.PI / 2 : -Math.PI / 2);
      });
    }
  }

  // ------------------------------------------------------------ toque e câmera
  private bind(cv: HTMLCanvasElement) {
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, yaw: this.yaw, pitch: this.pitch };
      this.idleSince = this.t;
    });
    cv.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.moved = Math.max(this.drag.moved, Math.hypot(dx, dy));
      this.yaw = this.drag.yaw - dx * 0.008;
      this.pitch = Math.min(1.25, Math.max(0.45, this.drag.pitch + dy * 0.004));
      this.idleSince = this.t;
      if (!this.raf) this.loop();
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved > 10) return;
      const r = cv.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(p, this.camera);
      const hit = this.ray.intersectObjects(this.pickables, true)[0];
      const id = hit?.object.userData.hq as HqBuilding | undefined;
      if (id) this.o.onPick(id);
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", () => { this.drag = null; });
  }

  private resize() {
    const w = this.o.host.clientWidth || 360, h = this.o.host.clientHeight || 300;
    // resolução interna reduzida (visual de PS2, leve a 120 Hz)
    this.renderer.setPixelRatio(Math.min(1, window.devicePixelRatio || 1) * 0.75);
    this.renderer.setSize(w, h, false);
    const cv = this.renderer.domElement;
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
    const t = this.t;
    // órbita lenta quando ninguém está mexendo
    if (!this.drag && !this.o.reduced && t - this.idleSince > 2.5) this.yaw += (dt / 1000) * 0.06;
    for (const m of this.movers) m(t, dt);
    const cx = Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist;
    const cz = Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist;
    this.camera.position.set(cx, Math.sin(this.pitch) * this.dist, cz + 3);
    this.camera.lookAt(0, 0, 3);
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  }

  private placeLabels() {
    const w = this.o.host.clientWidth, h = this.o.host.clientHeight;
    for (const [id, el] of Object.entries(this.o.labels) as [HqBuilding, HTMLElement][]) {
      const a = this.anchors[id];
      if (!a || !el) continue;
      this.tmp.copy(a).project(this.camera);
      const behind = this.tmp.z > 1;
      // tamanho do rótulo lido uma vez só (nada de layout forçado a cada quadro)
      let sz = this.labelSize.get(el);
      if (!sz) { sz = [el.offsetWidth, el.offsetHeight]; this.labelSize.set(el, sz); }
      const hw = sz[0] / 2 + 4;
      const x = Math.round(Math.min(w - hw, Math.max(hw, (this.tmp.x * 0.5 + 0.5) * w)));
      const y = Math.round(Math.min(h - 8, Math.max(sz[1] + 8, (-this.tmp.y * 0.5 + 0.5) * h)));
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      el.style.opacity = behind ? "0" : "1";
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
