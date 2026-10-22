// Chegada do ônibus ao estádio (cinemática curta antes do jogo): a rua tomada pela torcida em
// "corredor", sinalizadores, fumaça nas cores do clube, bandeiras, papel picado e o ônibus do
// time passando devagar até o portão do estádio. Maior em jogos grandes; pulável.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { canvasTex, FanCrowd, Festa, type FanSpot } from "./crowd";
import { prng } from "./stadium";
import type { Quality } from "./model";

export interface ArrivalOpts {
  colors: readonly string[];
  abbr: string;
  name: string;
  stadium: string;
  /** importância/tamanho da festa 0..1 */
  level: number;
  quality: Quality;
  reduced: boolean;
}

const ROAD0 = -130, ROAD1 = 70;

export class Arrival {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.3, 5000);
  private bus = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private crowd: FanCrowd;
  private festa: Festa;
  private disposables: { dispose(): void }[] = [];
  private t = 0;

  constructor(private o: ArrivalOpts, private duration: number) {
    const sc = this.scene;
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const su = sky.material.uniforms;
    su.turbidity.value = 6;
    su.rayleigh.value = 2.6;
    su.mieCoefficient.value = 0.007;
    su.mieDirectionalG.value = 0.86;
    const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(86), THREE.MathUtils.degToRad(70));
    su.sunPosition.value.copy(sun);
    sc.add(sky);
    this.disposables.push(sky.geometry, sky.material);
    sc.add(new THREE.HemisphereLight("#b9cdf5", "#3a3330", 1.0));
    const dl = new THREE.DirectionalLight("#ffc98f", 2.2);
    dl.position.copy(sun).multiplyScalar(120);
    dl.position.y = Math.max(40, dl.position.y);
    dl.castShadow = o.quality !== "baixa";
    dl.shadow.mapSize.set(2048, 2048);
    Object.assign(dl.shadow.camera, { left: -60, right: 60, top: 40, bottom: -40, near: 1, far: 400 });
    dl.shadow.bias = -0.0005;
    sc.add(dl, dl.target);
    sc.fog = new THREE.Fog("#c9a98f", 90, 420);

    const mat = (c: string, r = 0.8, m = 0) => {
      const x = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
      this.disposables.push(x);
      return x;
    };
    const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = cast && o.quality !== "baixa";
      mesh.receiveShadow = o.quality !== "baixa";
      sc.add(mesh);
      this.disposables.push(g);
      return mesh;
    };
    // asfalto com faixas, calçadas
    const roadT = canvasTex(512, 64, (g) => {
      g.fillStyle = "#33363a";
      g.fillRect(0, 0, 512, 64);
      for (let i = 0; i < 3000; i++) {
        const v = 40 + Math.random() * 40;
        g.fillStyle = `rgb(${v},${v},${v + 3})`;
        g.fillRect(Math.random() * 512, Math.random() * 64, 2, 2);
      }
      g.fillStyle = "#e9d27a";
      for (let x = 0; x < 512; x += 64) g.fillRect(x, 31, 36, 2);
    });
    roadT.wrapS = THREE.RepeatWrapping;
    roadT.repeat.set(8, 1);
    this.disposables.push(roadT);
    const road = new THREE.PlaneGeometry(ROAD1 - ROAD0, 12);
    road.rotateX(-Math.PI / 2);
    add(road, new THREE.MeshStandardMaterial({ map: roadT, roughness: 0.75 }), false).position.set((ROAD0 + ROAD1) / 2, 0, 0);
    for (const sz of [-1, 1]) {
      const sw = new THREE.BoxGeometry(ROAD1 - ROAD0, 0.2, 14);
      add(sw, mat("#8d8780", 0.9), false).position.set((ROAD0 + ROAD1) / 2, 0.1, sz * 13);
    }
    const ground = new THREE.PlaneGeometry(2000, 2000);
    ground.rotateX(-Math.PI / 2);
    add(ground, mat("#2c2a27", 1), false).position.y = -0.02;
    // prédios dos dois lados e postes de luz
    const r = prng(5);
    const win = canvasTex(64, 128, (c) => {
      c.fillStyle = "#3b3f46";
      c.fillRect(0, 0, 64, 128);
      for (let y = 6; y < 128; y += 10) for (let x = 5; x < 64; x += 10) {
        c.fillStyle = Math.random() < 0.4 ? "#ffcf87" : "#1d2128";
        c.fillRect(x, y, 6, 6);
      }
    });
    win.wrapS = win.wrapT = THREE.RepeatWrapping;
    this.disposables.push(win);
    const bm = new THREE.MeshStandardMaterial({ map: win, emissive: "#ffffff", emissiveMap: win, emissiveIntensity: 0.35, roughness: 0.85 });
    this.disposables.push(bm);
    for (const sz of [-1, 1]) for (let x = ROAD0; x < ROAD1 - 30; x += 14 + r() * 6) {
      const h = 9 + r() * 22, w = 10 + r() * 4, d = 10;
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 10), uv.getY(i) * (h / 12));
      const tint = new THREE.MeshStandardMaterial({ map: win, emissive: "#ffffff", emissiveMap: win, emissiveIntensity: 0.35, roughness: 0.85, color: new THREE.Color().setHSL(0.08 + r() * 0.08, 0.15 + r() * 0.2, 0.55 + r() * 0.3) });
      this.disposables.push(tint);
      add(g, tint).position.set(x, h / 2, sz * (25 + d / 2));
    }
    const lampM = new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#ffd8a0", emissiveIntensity: 5 });
    this.disposables.push(lampM);
    for (const sz of [-1, 1]) for (let x = ROAD0 + 10; x < ROAD1 - 30; x += 22) {
      const p = new THREE.CylinderGeometry(0.1, 0.14, 7, 8);
      add(p, mat("#4a4e54", 0.4, 0.7)).position.set(x, 3.5, sz * 6.8);
      const h = new THREE.SphereGeometry(0.35, 12, 8);
      add(h, lampM, false).position.set(x, 7.1, sz * 6.5);
    }
    const isMorumbis = o.abbr === "SAO" || o.name.toLowerCase().includes("são paulo") || o.stadium.toLowerCase().includes("morumb");

    // fachada do estádio no fim da rua (MorumBIS oficial ou cores do clube)
    const fac = canvasTex(1024, 256, (g) => {
      if (isMorumbis) {
        // Fachada Brutalista Monumental do MorumBIS na Praça Roberto Gomes Pedrosa
        g.fillStyle = "#1e2229";
        g.fillRect(0, 0, 1024, 256);
        // Friso contínuo tricolor superior (vermelho, branco, preto)
        g.fillStyle = "#c4122f";
        g.fillRect(0, 0, 1024, 18);
        g.fillStyle = "#ffffff";
        g.fillRect(0, 18, 1024, 18);
        g.fillStyle = "#111111";
        g.fillRect(0, 36, 1024, 18);

        // Painel central escurecido para o letreiro
        g.fillStyle = "#0c0e14";
        g.fillRect(120, 65, 784, 115);
        g.strokeStyle = "rgba(196, 18, 47, 0.6)";
        g.lineWidth = 4;
        g.strokeRect(120, 65, 784, 115);

        // Letreiro oficial MorumBIS em neon
        g.font = `900 84px "Barlow Condensed", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#ffffff";
        g.fillText("Morum", 440, 120);
        g.fillStyle = "#ff1744"; // Vermelho vibrante BIS
        g.fillText("BIS", 585, 120);

        // Faixa inferior: Praça Roberto Gomes Pedrosa / São Paulo FC
        g.fillStyle = "#c4122f";
        g.fillRect(0, 195, 1024, 61);
        g.font = `800 36px "Barlow Condensed", Arial, sans-serif`;
        g.fillStyle = "#ffffff";
        g.fillText("SÃO PAULO FUTEBOL CLUBE · PRAÇA ROBERTO GOMES PEDROSA", 512, 226, 960);
      } else {
        g.fillStyle = o.colors[0];
        g.fillRect(0, 0, 1024, 256);
        g.fillStyle = o.colors[1] ?? "#ffffff";
        for (let x = 0; x < 1024; x += 64) g.fillRect(x, 0, 6, 256);
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(0, 150, 1024, 106);
        g.font = `900 92px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#ffffff";
        g.fillText(o.stadium.toUpperCase(), 512, 80, 980);
        g.font = `800 64px "Barlow Condensed", Arial, sans-serif`;
        g.fillText(o.name.toUpperCase(), 512, 200, 900);
      }
    });
    this.disposables.push(fac);
    const fg = new THREE.CylinderGeometry(90, 90, 34, 64, 1, true, -Math.PI / 2 - 0.55, 1.1);
    const facade = add(fg, new THREE.MeshStandardMaterial({ map: fac, side: THREE.DoubleSide, roughness: 0.6, emissive: "#ffffff", emissiveMap: fac, emissiveIntensity: 0.25 }));
    facade.position.set(ROAD1 + 90 - 6, 17, 0);
    const gate = new THREE.BoxGeometry(1, 7, 14);
    add(gate, mat("#151515", 0.4, 0.6)).position.set(ROAD1 - 5.5, 3.5, 0);

    // ônibus do clube (tricolor oficial para o São Paulo)
    const side = canvasTex(1024, 256, (g) => {
      if (isMorumbis) {
        g.fillStyle = "#fdfdfd"; // Branco oficial do ônibus do SPFC
        g.fillRect(0, 0, 1024, 256);
        // Faixa tricolor horizontal larga
        g.fillStyle = "#c4122f";
        g.fillRect(0, 140, 1024, 30);
        g.fillStyle = "#111111";
        g.fillRect(0, 170, 1024, 30);

        // Janelas panorâmicas escuras
        g.fillStyle = "#0a0e14";
        g.fillRect(40, 25, 944, 95);

        // Texto do clube e patrocinadores
        g.font = `italic 900 52px "Barlow Condensed", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#111111";
        g.fillText("SÃO PAULO FUTEBOL CLUBE", 460, 222);

        // Superbet / BIS
        g.font = `900 36px "Barlow Condensed", Arial, sans-serif`;
        g.fillStyle = "#c4122f";
        g.fillText("SUPERBET", 850, 222);
        g.fillStyle = "#0055ff";
        g.fillText("BIS", 120, 222);
      } else {
        g.fillStyle = o.colors[0];
        g.fillRect(0, 0, 1024, 256);
        g.fillStyle = o.colors[1] ?? "#ffffff";
        g.beginPath();
        g.moveTo(0, 200); g.lineTo(1024, 120); g.lineTo(1024, 170); g.lineTo(0, 256);
        g.fill();
        g.fillStyle = "#0d1117";
        g.fillRect(40, 30, 944, 90);
        g.font = `italic 900 70px "Barlow Condensed", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = o.colors[1] && o.colors[1] !== o.colors[0] ? o.colors[1] : "#ffffff";
        g.fillText(o.name.toUpperCase(), 512, 175, 900);
      }
    });
    this.disposables.push(side);
    const bodyG = new RoundedBoxGeometry(13, 3.5, 2.6, 4, 0.35);
    const busBody = new THREE.Mesh(bodyG, new THREE.MeshPhysicalMaterial({ map: side, roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }));
    busBody.position.y = 2.15;
    busBody.castShadow = true;
    this.bus.add(busBody);
    this.disposables.push(bodyG, busBody.material as THREE.Material);
    const glass = new THREE.MeshPhysicalMaterial({ color: "#0b1118", roughness: 0.05, metalness: 0.4, clearcoat: 1 });
    this.disposables.push(glass);
    const wind = new THREE.BoxGeometry(0.1, 1.7, 2.3);
    const wm = new THREE.Mesh(wind, glass);
    wm.position.set(6.52, 2.7, 0);
    this.bus.add(wm);
    this.disposables.push(wind);
    const sign = canvasTex(256, 64, (g) => {
      g.fillStyle = "#050505";
      g.fillRect(0, 0, 256, 64);
      g.font = `900 46px "Barlow Condensed", Arial, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffb627";
      g.fillText(o.abbr, 128, 34);
    });
    this.disposables.push(sign);
    const sg = new THREE.PlaneGeometry(2, 0.45);
    const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: sign, emissive: "#ffffff", emissiveMap: sign, emissiveIntensity: 2 }));
    sm.rotation.y = Math.PI / 2;
    sm.position.set(6.58, 3.65, 0);
    this.bus.add(sm);
    this.disposables.push(sg, sm.material as THREE.Material);
    const hl = new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff8e6", emissiveIntensity: 2.5 });
    this.disposables.push(hl);
    for (const z of [-0.95, 0.95]) {
      const h = new THREE.BoxGeometry(0.08, 0.25, 0.5);
      const m = new THREE.Mesh(h, hl);
      m.position.set(6.55, 1.0, z);
      this.bus.add(m);
      this.disposables.push(h);
    }
    const tyre = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 20);
    tyre.rotateX(Math.PI / 2);
    this.disposables.push(tyre);
    const tm = mat("#121212", 0.7);
    for (const x of [-4.2, 4.2]) for (const z of [-1.2, 1.2]) {
      const w = new THREE.Mesh(tyre, tm);
      w.position.set(x, 0.55, z);
      w.castShadow = true;
      this.bus.add(w);
      this.wheels.push(w);
    }
    const busLight = new THREE.SpotLight("#fff2d8", 400, 60, 0.5, 0.6, 2);
    busLight.position.set(6.6, 1.2, 0);
    busLight.target.position.set(30, 0, 0);
    this.bus.add(busLight, busLight.target);
    sc.add(this.bus);

    // o corredor de torcedores
    const spots: FanSpot[] = [];
    const cs = o.colors;
    const dens = o.quality === "alta" ? 0.55 : o.quality === "media" ? 0.8 : 1.2;
    const front: [number, number, number, number][] = [];
    for (const sz of [-1, 1]) {
      for (let x = ROAD0 + 6; x < ROAD1 - 8; x += dens) {
        const rows = 4 + Math.floor(o.level * 8);
        for (let k = 0; k < rows; k++) {
          if (r() > 0.85) continue;
          const z = sz * (6.6 + k * 0.75 + r() * 0.3);
          const kk = r();
          spots.push({
            x: x + (r() - 0.5) * 0.4, y: 0.2, z, rot: sz > 0 ? Math.PI + (r() - 0.5) * 0.8 : (r() - 0.5) * 0.8, team: 0,
            shirt: new THREE.Color(kk < 0.6 ? cs[0] : kk < 0.85 ? cs[1] ?? "#ffffff" : "#f2f2f2"), rank: 1, scale: 0.92 + r() * 0.16,
          });
        }
        if (Math.floor(x) % 7 === 0) front.push([x, -0.3, sz * 7.4, sz > 0 ? Math.PI : 0]);
      }
    }
    this.crowd = new FanCrowd(spots);
    this.crowd.uniforms.uJump.value.set(0.9, 0);
    this.crowd.uniforms.uRaise.value.set(0.6, 0);
    this.crowd.uniforms.uExcite.value = 1;
    sc.add(this.crowd.mesh);
    this.festa = new Festa({ colors: cs, abbr: o.abbr, level: Math.max(0.5, o.level), reduced: o.reduced, front }, { cx: -20, cz: 0, w: 120, d: 26 });
    sc.add(this.festa.group);
    this.festa.fire(duration + 2000);
  }

  /** Avança e posiciona a câmera. dt em ms; devolve a legenda do momento. */
  update(dt: number, aspect: number): string {
    this.t += dt;
    const k = Math.min(1, this.t / this.duration);
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const bx = ROAD0 + 10 + ease * (ROAD1 - ROAD0 - 30);
    this.bus.position.set(bx, 0, -2.2);
    for (const w of this.wheels) w.rotation.z = -bx / 0.55;
    this.crowd.uniforms.uTime.value = this.t / 1000;
    this.festa.update(dt);
    const cam = this.camera;
    cam.aspect = aspect;
    if (k < 0.34) {
      // de frente: o ônibus vindo na direção da câmera entre a torcida
      cam.position.set(bx + 26 - k * 20, 1.6, 2.5);
      cam.lookAt(bx, 2.4, -2);
    } else if (k < 0.7) {
      // ao lado, acompanhando (torcida em primeiro plano)
      cam.position.set(bx + 2, 3.2, 10.5);
      cam.lookAt(bx - 1, 2.2, -2);
    } else {
      // de trás e do alto: o ônibus chegando ao portão do estádio
      cam.position.set(bx - 22, 9, 4);
      cam.lookAt(bx + 18, 5, -1);
    }
    cam.fov = aspect < 1 ? 58 : 42;
    cam.updateProjectionMatrix();
    return k < 0.7 ? `O ônibus do ${this.o.name} chegando` : `Chegada ao ${this.o.stadium}`;
  }

  get done() {
    return this.t >= this.duration;
  }

  dispose() {
    this.crowd.dispose();
    this.festa.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
