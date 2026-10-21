// Renderizador 3D da partida: three.js com materiais PBR, sombras dos refletores e do sol de fim
// de tarde, oclusão de ambiente (GTAO), bloom, tone mapping ACES, MSAA e gradação de cor.
// Jogadores com modelo humano animado (player.ts), estádio do mandante com torcida 3D reativa
// (stadium.ts / crowd.ts), chegada do ônibus (arrival.ts), entrada dos times, golpes especiais
// com close e rastro, replay do gol e câmera livre (pinça para zoom, arrastar para girar).
// Este módulo só é baixado quando a partida abre o campo (import dinâmico em MatchView).
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { StadiumStyle } from "../../data/stadiumStyles";
import { Arrival } from "./arrival";
import { glowTexture } from "./crowd";
import {
  behindGoalCam, broadcastCam, clampFree, closeUpCam, easeCam, freeCamPose, freeFromPose, renderRes, ReplayBuffer,
  type CamPose, type FreeCam, type MatchSnapshot, type Player3D, type Quality,
} from "./model";
import { PLAYER_SCALE, PlayerFactory, poseRig, stepMotion, type Motion, type Rig } from "./player";
import { HALF_W, Stadium } from "./stadium";

export interface Hud3D {
  abbr: [string, string];
  color: [string, string];
  score: [number, number];
  clock: string;
  /** cores da competição para a caixa do placar: [fundo, borda] (opcional) */
  frame?: [string, string];
}

export interface ClubInfo3D {
  colors: readonly string[];
  abbr: string;
  name: string;
  stadium: string;
}

export interface MatchRendererOptions {
  host: HTMLElement;
  style: StadiumStyle;
  quality: Quality;
  home: ClubInfo3D;
  away: ClubInfo3D;
  neutral: boolean;
  /** torcida dominante (faz a festa; é a que vai embora na goleada) */
  crowdSide: 0 | 1;
  /** força da festa 0..1 (0 = sem festa) */
  festa: number;
  /** importância do jogo 0..1 (rituais, chegada do ônibus) */
  importance: number;
  reduced: boolean;
  /** toque na tela durante a abertura (pular) */
  onSkip?: () => void;
}

interface Intro { arrival: Arrival | null; arrivalMs: number; walkMs: number; t: number }

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uFlash: { value: 0 }, uVig: { value: 0.38 }, uSat: { value: 1.08 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uFlash; uniform float uVig; uniform float uSat; varying vec2 vUv;
void main(){ vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
c = mix(vec3(l), c, uSat); vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * uVig; c = mix(c, vec3(1.0), uFlash); gl_FragColor = vec4(c, t.a); }`,
};

export class MatchRenderer {
  private o: MatchRendererOptions;
  private renderer: THREE.WebGLRenderer;
  private box: HTMLDivElement;
  private glCanvas: HTMLCanvasElement;
  private hud: HTMLCanvasElement;
  private hg: CanvasRenderingContext2D;
  private tvBtn: HTMLButtonElement;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 6000);
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private stadium: Stadium;
  private players: PlayerFactory;
  private rigs = new Map<number, Rig>();
  private motions = new Map<number, Motion>();
  private ballPrev = new THREE.Vector3();
  private rollAxis = new THREE.Vector3();
  private rollQ = new THREE.Quaternion();
  private ball!: THREE.Mesh;
  private ballShadow!: THREE.Mesh;
  private css = { w: 0, h: 0 };
  private ratio = 1;
  private dyn = 1;
  private perf = { n: 0, sum: 0 };
  private cam: CamPose | null = null;
  private free: FreeCam | null = null;
  private replay = new ReplayBuffer(6, 30);
  private clip: MatchSnapshot[] | null = null;
  private clipT = 0;
  private clipSide: 0 | 1 = 0;
  private goalTimer = 0;
  private goalText = "GOL!";
  private wasCelebrating = false;
  private pendingClip = -1;
  private time = 0;
  private lost = false;
  private disposed = false;
  private intro: Intro | null = null;
  private introBegun = false;
  private introCaption = "";
  private flash = 0;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private glowTex: THREE.Texture;
  private glow!: THREE.Sprite;
  private aura!: THREE.Sprite;
  private ring!: THREE.Mesh;
  private trail: THREE.Sprite[] = [];
  private trailPts: THREE.Vector3[] = [];
  private v3 = new THREE.Vector3();
  // torcida reativa
  private leave = 0;
  private leaveTarget = 0;
  private jump = [0, 0];
  private raise = [0, 0];
  private excite = 0.5;
  private mosaic = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { d: number; x: number; y: number; moved: number } | null = null;

  constructor(opts: MatchRendererOptions) {
    this.o = opts;
    const box = document.createElement("div");
    box.className = "m3d-box";
    this.box = box;
    this.glCanvas = document.createElement("canvas");
    this.glCanvas.className = "m3d-gl";
    this.hud = document.createElement("canvas");
    this.hud.className = "m3d-hud";
    this.tvBtn = document.createElement("button");
    this.tvBtn.type = "button";
    this.tvBtn.className = "m3d-tv";
    this.tvBtn.textContent = "Câmera TV";
    this.tvBtn.hidden = true;
    this.tvBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resetCam();
    });
    box.append(this.glCanvas, this.hud, this.tvBtn);
    opts.host.append(box);
    this.hg = this.hud.getContext("2d")!;
    const q = opts.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: q === "baixa", powerPreference: "high-performance", alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = q !== "baixa";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envRT = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.35;
    room.dispose();
    pmrem.dispose();
    const crowdClub = opts.crowdSide === 0 ? opts.home : opts.away;
    void crowdClub;
    this.stadium = new Stadium({
      style: opts.style, quality: q,
      home: opts.home, away: opts.away, neutral: opts.neutral, crowdSide: opts.crowdSide,
      festa: opts.festa > 0 ? Math.min(1, opts.festa * 0.6 + opts.importance * 0.5) : 0, reduced: opts.reduced,
    }, this.scene);
    this.players = new PlayerFactory(this.scene, q !== "baixa", Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.glowTex = glowTexture();
    this.buildBall();
    this.buildSpecialFx();
    if (q !== "baixa") this.buildComposer();
    this.glCanvas.addEventListener("webglcontextlost", this.onLost, false);
    this.glCanvas.addEventListener("webglcontextrestored", this.onRestored, false);
    box.addEventListener("pointerdown", this.onDown);
    box.addEventListener("pointermove", this.onMove);
    box.addEventListener("pointerup", this.onUp);
    box.addEventListener("pointercancel", this.onUp);
    box.addEventListener("wheel", this.onWheel, { passive: false });
    // depuração (só no servidor de desenvolvimento): window.__m3d
    if (import.meta.env?.DEV) (window as unknown as { __m3d?: MatchRenderer }).__m3d = this;
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };
  private onRestored = () => {
    this.lost = false;
  };

  private buildComposer() {
    const q = this.o.quality;
    const isMobile = typeof window !== "undefined" && (window.innerWidth <= 768 || "ontouchstart" in window || (navigator && navigator.maxTouchPoints > 0));
    if (isMobile && q !== "alta") {
      this.composer = null;
      return;
    }
    const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: isMobile ? 1 : (q === "alta" ? 4 : 2) });
    const c = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    c.addPass(this.renderPass);
    if (q === "alta" && !isMobile) {
      this.gtao = new GTAOPass(this.scene, this.camera, 16, 16);
      this.gtao.blendIntensity = 0.8;
      try {
        this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
      } catch {
        /* versão sem esses parâmetros */
      }
      c.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(16, 16), isMobile ? 0.2 : 0.38, 0.5, 0.93);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    c.addPass(this.grade);
    this.composer = c;
  }

  private buildBall() {
    const tex = new THREE.CanvasTexture((() => {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 256;
      const g = c.getContext("2d")!;
      g.fillStyle = "#f6f6f2";
      g.fillRect(0, 0, 512, 256);
      const cols = [this.o.home.colors[0], "#1b2a6b", "#f5c542"];
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = cols[i % 3];
        g.lineWidth = 16;
        g.beginPath();
        const x0 = (i * 512) / 6;
        g.moveTo(x0, 30);
        g.bezierCurveTo(x0 + 70, 90, x0 + 10, 170, x0 + 80, 228);
        g.stroke();
      }
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 2;
      for (let x = 0; x < 512; x += 64) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 256); g.stroke();
      }
      return c;
    })());
    tex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.SphereGeometry(0.17, 32, 20);
    this.ball = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
    this.ball.castShadow = this.o.quality !== "baixa";
    this.scene.add(this.ball);
    const sg = new THREE.PlaneGeometry(0.7, 0.7);
    sg.rotateX(-Math.PI / 2);
    this.ballShadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    this.scene.add(this.ballShadow);
  }

  private buildSpecialFx() {
    const add = (size: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
      s.scale.setScalar(size);
      s.visible = false;
      s.renderOrder = 5;
      this.scene.add(s);
      return s;
    };
    this.glow = add(1.6);
    this.aura = add(4.2);
    for (let i = 0; i < 28; i++) this.trail.push(add(1));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 48), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: 0xffffff }));
    this.ring.visible = false;
    this.ring.renderOrder = 6;
    this.scene.add(this.ring);
  }

  // ------------------------------------------------ abertura
  /** Começa a abertura: chegada do ônibus (opcional) e entrada dos times com os rituais. */
  startIntro(arrivalMs: number, walkMs: number) {
    if (this.introBegun) return; // uma vez por partida
    this.introBegun = true;
    if (this.o.reduced) arrivalMs = 0;
    const club = this.o.crowdSide === 0 || this.o.neutral ? this.o.home : this.o.away;
    const arrival = arrivalMs > 0 ? new Arrival({ ...club, level: Math.max(this.o.importance, this.o.festa), quality: this.o.quality, reduced: this.o.reduced }, arrivalMs) : null;
    this.intro = { arrival, arrivalMs, walkMs, t: 0 };
    if (!arrival) this.beginWalkout();
  }

  private beginWalkout() {
    const w = this.intro?.walkMs ?? 0;
    this.stadium.festa?.fire(w + 3000, true);
  }

  /** Pula/encerra a abertura. */
  endIntro() {
    if (!this.intro) return;
    this.intro.arrival?.dispose();
    this.intro = null;
    this.introCaption = "";
    this.cam = null;
  }

  // ------------------------------------------------ torcida reativa
  /**
   * Estado da arquibancada: fração da torcida dominante que já foi embora (goleada) e a empolgação
   * (0..1.6, do humor da torcida). Mudanças são suaves.
   */
  setCrowd(o: { exodus: number; intensity: number }) {
    this.leaveTarget = Math.max(this.leaveTarget, Math.max(0, Math.min(0.9, o.exodus)));
    this.excite = Math.max(0, Math.min(1.2, (o.intensity - 0.5) * 0.9));
  }

  /** A torcida explode (gol da torcida; virada = ainda mais forte, com bandeirão). */
  erupt(side: 0 | 1, virada: boolean) {
    this.jump[side] = virada ? 1.6 : 1.2;
    this.raise[side] = 1;
    if (side === this.o.crowdSide) this.stadium.festa?.fire(virada ? 14000 : 8000, virada);
    if (virada) this.goalText = "VIRADA!";
  }

  // ------------------------------------------------ câmera livre (pinça / arrastar)
  private onDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.box.setPointerCapture?.(e.pointerId);
    this.gesture = { d: this.pinchDist(), x: e.clientX, y: e.clientY, moved: 0 };
  };
  private pinchDist() {
    const p = [...this.pointers.values()];
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  }
  private ensureFree() {
    if (!this.free) this.free = freeFromPose(this.cam ?? broadcastCam(0, 0, 1));
    this.tvBtn.hidden = false;
  }
  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev || !this.gesture || this.intro) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.gesture.moved += Math.abs(dx) + Math.abs(dy);
    if (this.gesture.moved < 6) return;
    this.ensureFree();
    const f = this.free!;
    if (this.pointers.size >= 2) {
      const d = this.pinchDist();
      if (this.gesture.d > 0 && d > 0) f.dist *= this.gesture.d / d;
      this.gesture.d = d;
      // dois dedos arrastando: move o alvo
      const k = f.dist / 600;
      f.panX -= (dx * Math.cos(f.yaw) + dy * Math.sin(f.yaw)) * k * 0.5;
      f.panZ -= (-dx * Math.sin(f.yaw) + dy * Math.cos(f.yaw)) * k * 0.5;
    } else {
      f.yaw -= dx * 0.008;
      f.pitch += dy * 0.006;
    }
    this.free = clampFree(f);
  };
  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (this.pointers.size === 0) {
      if (g && g.moved < 6 && this.intro) this.o.onSkip?.();
      this.gesture = null;
    } else if (g) g.d = this.pinchDist();
  };
  private onWheel = (e: WheelEvent) => {
    if (this.intro) return;
    e.preventDefault();
    this.ensureFree();
    this.free = clampFree({ ...this.free!, dist: this.free!.dist * Math.exp(e.deltaY * 0.0012) });
  };
  /** Volta para a câmera de TV. */
  resetCam() {
    this.free = null;
    this.tvBtn.hidden = true;
  }
  get freeCam() {
    return !!this.free;
  }
  /** Precisa continuar desenhando mesmo com o jogo pausado (abertura ou câmera livre). */
  get busy() {
    return !!this.free || !!this.intro;
  }

  // ------------------------------------------------ quadro
  resize(cssW: number, cssH: number) {
    this.css = { w: cssW, h: cssH };
    const r = renderRes(cssW, cssH, window.devicePixelRatio || 1, this.o.quality, this.dyn);
    this.ratio = r.ratio;
    this.box.style.width = `${Math.floor(cssW)}px`;
    this.box.style.height = `${Math.floor(cssH)}px`;
    this.renderer.setPixelRatio(r.ratio);
    this.renderer.setSize(cssW, cssH, false);
    this.composer?.setPixelRatio(r.ratio);
    this.composer?.setSize(cssW, cssH);
    this.hud.width = Math.round(cssW * r.ratio);
    this.hud.height = Math.round(cssH * r.ratio);
    this.camera.aspect = cssW / Math.max(1, cssH);
    this.camera.updateProjectionMatrix();
  }

  private draw(scene: THREE.Scene, camera: THREE.Camera, ao: boolean) {
    if (this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      if (this.gtao) this.gtao.enabled = ao;
      if (this.grade) this.grade.uniforms.uFlash.value = this.flash;
      this.composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }

  /** Desenha um quadro. live = retrato do jogo agora; dt em ms. */
  render(live: MatchSnapshot, dt: number, hud: Hud3D, wall = dt) {
    if (this.disposed || this.lost || this.css.w < 2) return;
    this.time += dt;
    this.adaptQuality(dt);
    const aspect = this.css.w / Math.max(1, this.css.h);

    // abertura: ônibus chegando, depois a entrada dos times
    if (this.intro) {
      const it = this.intro;
      it.t += Math.min(wall, 1000); // a abertura segue o relógio de verdade (o mesmo da tela da partida)
      if (it.arrival) {
        this.introCaption = it.arrival.update(Math.min(wall, 1000), aspect);
        if (it.arrival.done) {
          it.arrival.dispose();
          it.arrival = null;
          it.t = it.arrivalMs;
          this.beginWalkout();
          this.cam = null;
        } else {
          this.flash = 0;
          this.draw(it.arrival.scene, it.arrival.camera, false);
          this.drawHud(live, hud, false);
          return;
        }
      }
    }

    this.stadium.update(dt);
    this.updateCrowd(live, dt);
    if (!this.clip && !this.intro) this.replay.push(live);
    if (live.celebrating && !this.wasCelebrating && live.goalSide != null) {
      this.goalTimer = 2600;
      this.clipSide = live.goalSide;
      this.jump[live.goalSide] = Math.max(this.jump[live.goalSide], 1.2);
      this.raise[live.goalSide] = 1;
      if (live.goalSide === this.o.crowdSide) this.stadium.festa?.fire(8000);
      this.pendingClip = this.time + 700;
    }
    if (!live.celebrating && this.goalTimer <= 0) this.goalText = "GOL!";
    this.wasCelebrating = live.celebrating;
    if (this.pendingClip > 0 && this.time >= this.pendingClip) {
      this.pendingClip = -1;
      const all = this.replay.clip();
      const end = all.length ? all[all.length - 1].now : 0;
      const clip = all.filter((f) => f.now >= end - 4200);
      if (!this.o.reduced && clip.length > 4) {
        this.clip = clip;
        this.clipT = -1900;
      }
    }
    if (this.goalTimer > 0) this.goalTimer -= dt;

    let snap = live;
    let replaying = false;
    if (this.clip) {
      this.clipT += dt * 0.6; // câmera lenta
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

    const walk = this.intro && !this.intro.arrival ? Math.min(1, (this.intro.t - this.intro.arrivalMs) / Math.max(1, this.intro.walkMs)) : -1;
    if (walk >= 1) this.endIntro();
    this.syncPlayers(snap, dt, walk >= 0 && walk < 1 ? walk : -1);
    const b = snap.ball;
    if (walk >= 0 && walk < 1) {
      this.ball.position.set(0, 0.17, 0);
    } else {
      this.ball.position.set(b.x, 0.17 + b.h, b.z);
      // a bola gira conforme anda (rolando sem deslizar)
      const dx = b.x - this.ballPrev.x, dz = b.z - this.ballPrev.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4 && dist < 8) {
        this.rollAxis.set(dz, 0, -dx).normalize();
        this.rollQ.setFromAxisAngle(this.rollAxis, dist / 0.17);
        this.ball.quaternion.premultiply(this.rollQ);
      }
      this.ballPrev.set(b.x, 0, b.z);
    }
    this.ballShadow.position.set(this.ball.position.x, 0.025, this.ball.position.z);
    this.ballShadow.scale.setScalar(1 / (1 + b.h * 0.25));
    for (const n of this.stadium.nets) {
      const shake = snap.netShake === n.side ? Math.sin(this.time / 30) * 0.35 : 0;
      n.mesh.position.x = n.x0 + (n.side === 0 ? 1 : -1) * Math.abs(shake);
    }

    // câmera: TV, close do golpe especial, replay atrás do gol, entrada dos times ou livre
    const sp = !replaying && !this.o.reduced ? snap.special : null;
    const star = sp ? snap.players.find((p) => p.id === sp.who) : undefined;
    const closeUp = !!sp && !!star && sp.impact < 0 && sp.t < 1700;
    let to: CamPose;
    if (walk >= 0 && walk < 1) to = this.walkoutCam(walk);
    else if (replaying) to = behindGoalCam(this.clipSide, b.x, b.z);
    else if (closeUp && star) to = closeUpCam(star.x, star.z, star.side === 1 ? -1 : 1, sp!.t);
    else if (this.free) to = freeCamPose(this.free, b.x, b.z);
    else {
      to = broadcastCam(b.x, b.z, aspect);
      const [lx, , lz] = to.look;
      const dx = to.pos[0] - lx, dy = to.pos[1], dz = to.pos[2] - lz;
      const k = aspect < 1 ? 0.6 : 0.68;
      to = { pos: [lx + dx * k, dy * k * 0.9, lz + dz * k], look: [lx, 0.6, lz - 1], fov: aspect < 1 ? 40 : to.fov };
    }
    const tau = this.free && !closeUp && !replaying ? 90 : closeUp ? 140 : walk >= 0 ? 700 : 380;
    this.cam = this.cam && !(replaying && this.clipT < 40) ? easeCam(this.cam, to, dt, tau) : to;
    const c = this.cam;
    this.camera.position.set(...c.pos);
    this.camera.lookAt(...c.look);
    if (Math.abs(this.camera.fov - c.fov) > 0.01 || this.camera.aspect !== aspect) {
      this.camera.fov = c.fov;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    this.updateSpecialFx(snap);
    this.draw(this.scene, this.camera, !replaying);
    this.drawHud(snap, hud, replaying);
  }

  /** Câmera da entrada dos times: túnel, depois a festa da torcida, depois o estádio inteiro. */
  private walkoutCam(k: number): CamPose {
    if (k < 0.42) return { pos: [6 - k * 8, 2.2, HALF_W + 1], look: [0, 1.4, HALF_W - 14], fov: 46 };
    if (k < 0.72) {
      const end = this.o.crowdSide === 0 || this.o.neutral ? -1 : 1;
      const u = (k - 0.42) / 0.3;
      return { pos: [end * (20 + u * 6), 8 + u * 3, 8 - u * 10], look: [end * 62, 10, 0], fov: 50 };
    }
    const u = (k - 0.72) / 0.28;
    return { pos: [-60 + u * 50, 55 - u * 18, 110 - u * 40], look: [0, 0, 0], fov: 46 };
  }

  private updateCrowd(s: MatchSnapshot, dt: number) {
    const cr = this.stadium.crowd;
    if (!cr) return;
    const k = 1 - Math.exp(-dt / 1200);
    for (const side of [0, 1] as const) {
      const cheering = s.cheer && this.clipSide === side;
      const want = cheering ? 1.1 : this.intro && !this.intro.arrival ? 0.55 : 0;
      this.jump[side] += (want - this.jump[side]) * (want > this.jump[side] ? 0.2 : k * 0.6);
      this.raise[side] += ((cheering ? 1 : 0) - this.raise[side]) * k;
    }
    // goleada: a torcida vai saindo aos poucos (alguns por segundo)
    this.leave += (this.leaveTarget - this.leave) * (1 - Math.exp(-dt / 9000));
    const walkout = !!this.intro && !this.intro.arrival;
    this.mosaic += ((walkout && this.o.festa > 0 ? 1 : 0) - this.mosaic) * (1 - Math.exp(-dt / 700));
    const u = cr.uniforms;
    const gone = Math.max(0, 1 - this.leave * 1.3);
    u.uJump.value.set(this.jump[0] * (this.o.crowdSide === 0 ? gone : 1), this.jump[1] * (this.o.crowdSide === 1 ? gone : 1));
    u.uRaise.value.set(this.raise[0], this.raise[1]);
    u.uLeave.value = this.leave;
    u.uMosaic.value = this.mosaic;
    u.uExcite.value = this.excite * gone;
  }

  private adaptQuality(dt: number) {
    if (dt <= 0 || this.intro) return;
    this.perf.n++;
    this.perf.sum += dt;
    if (this.perf.n < 120) return;
    const avg = this.perf.sum / this.perf.n;
    this.perf = { n: 0, sum: 0 };
    if (avg > 21 && this.dyn > 0.6) {
      this.dyn = Math.max(0.6, this.dyn - 0.12);
      if (this.dyn <= 0.7 && this.gtao) {
        this.gtao.enabled = false;
        this.composer?.removePass(this.gtao);
        this.gtao.dispose();
        this.gtao = null;
      }
      this.resize(this.css.w, this.css.h);
    }
  }

  private syncPlayers(s: MatchSnapshot, dt: number, walk: number) {
    const live = new Set<number>();
    const order: [number[], number[], number[]] = [[], [], []];
    for (const p of s.players) order[p.side].push(p.id);
    for (const p0 of s.players) {
      live.add(p0.id);
      let r = this.rigs.get(p0.id);
      const key = this.players.key(p0);
      if (r && r.key !== key) {
        this.players.disposeRig(r);
        this.rigs.delete(p0.id);
        r = undefined;
      }
      if (!r) {
        r = this.players.make(p0);
        this.rigs.set(p0.id, r);
      }
      r.root.visible = true;
      const p = walk >= 0 ? this.walkoutPose(p0, order[p0.side].indexOf(p0.id), walk, s.now) : p0;
      // movimento natural: posição/velocidade suavizadas (aceleração, curvas) e passada pela distância
      let m = this.motions.get(p0.id);
      if (!m) {
        m = { x: p.x, z: p.z, vx: 0, vz: 0, phase: 0, turn: 0 };
        this.motions.set(p0.id, m);
      }
      stepMotion(m, p.x, p.z, dt);
      poseRig(p, r, s.now, dt, s.ball, m);
    }
    for (const [id, r] of this.rigs) if (!live.has(id)) r.root.visible = false;
  }

  /** Entrada dos times: saem do túnel em fila, lado a lado, e se perfilam no meio do campo. */
  private walkoutPose(p: Player3D, idx: number, k: number, now: number): Player3D {
    const t = k * (this.intro?.walkMs ?? 8000);
    const lane = p.side === 0 ? -1 : p.side === 1 ? 1 : 0;
    const start = { x: lane * 1.2, z: HALF_W + 9 };
    const line = p.side === 2 ? { x: (idx - 1) * 1.3, z: 2.5 } : { x: lane * (2.6 + idx * 1.25), z: 2.5 };
    const delay = (p.side === 2 ? 0 : 300 + idx * 230);
    const mid = { x: lane * 1.2, z: 3.5 };
    const speed = 2.1; // m/s
    const d1 = Math.hypot(mid.x - start.x, mid.z - start.z), d2 = Math.hypot(line.x - mid.x, line.z - mid.z);
    const dist = Math.max(0, ((t - delay) / 1000) * speed);
    let x: number, z: number, vx = 0, vz = 0;
    if (dist <= 0) return { ...p, x: start.x, z: start.z + 30, vx: 0, vz: 0 };
    if (dist < d1) {
      const u = dist / d1;
      x = start.x + (mid.x - start.x) * u;
      z = start.z + (mid.z - start.z) * u;
      vz = -0.07;
    } else if (dist < d1 + d2) {
      const u = (dist - d1) / d2;
      x = mid.x + (line.x - mid.x) * u;
      z = mid.z + (line.z - mid.z) * u;
      vx = Math.sign(line.x - mid.x) * 0.07;
    } else {
      x = line.x;
      z = line.z;
    }
    const moving = vx !== 0 || vz !== 0;
    const pp = { ...p, x, z, vx: moving ? vx * 0.5 : 0, vz: moving ? vz * 0.5 : 0.0001, walk: moving ? now / 110 : 0, pose: null, arms: false, sad: false, dive: -1, down: false };
    // no fim, vai para a posição do jogo
    const blend = Math.max(0, (k - 0.85) / 0.15);
    if (blend > 0) {
      pp.x = x + (p.x - x) * blend;
      pp.z = z + (p.z - z) * blend;
    }
    return pp;
  }

  private updateSpecialFx(s: MatchSnapshot) {
    const sp = s.special;
    const setCol = (m: THREE.Sprite | THREE.Mesh, hex: string, a: number, hdr = 2.2) => {
      const mm = m.material as THREE.SpriteMaterial;
      mm.color.set(hex).multiplyScalar(hdr);
      mm.opacity = a;
    };
    if (!sp || this.o.reduced) {
      this.glow.visible = this.aura.visible = this.ring.visible = false;
      for (const t of this.trail) t.visible = false;
      this.trailPts = [];
      this.flash = 0;
      return;
    }
    const bp = this.ball.position;
    this.glow.visible = true;
    this.glow.position.copy(bp);
    this.glow.scale.setScalar(1.6 * (1 + Math.sin(this.time / 60) * 0.18));
    setCol(this.glow, sp.colors[1], 0.95, 3);
    this.trailPts.unshift(bp.clone());
    if (this.trailPts.length > this.trail.length) this.trailPts.length = this.trail.length;
    this.trail.forEach((m, i) => {
      const pt = this.trailPts[i];
      m.visible = !!pt && i > 0;
      if (!pt) return;
      const j = i / 4;
      m.position.set(pt.x + Math.sin(i * 2.3 + this.time / 90) * 0.1 * j, pt.y + Math.cos(i * 1.7) * 0.06 * j, pt.z);
      m.scale.setScalar(1.2 * (1 - i / this.trail.length));
      setCol(m, i % 3 === 0 ? sp.colors[0] : sp.colors[1], 0.85 * (1 - i / this.trail.length));
    });
    const who = s.players.find((p) => p.id === sp.who);
    this.aura.visible = !!who && sp.impact < 0;
    if (who) {
      this.aura.position.set(who.x, 1.1 * PLAYER_SCALE, who.z);
      this.aura.scale.setScalar(4.2 * (1 + Math.sin(this.time / 80) * 0.12 + Math.min(1, sp.t / 500) * 0.4));
      setCol(this.aura, sp.colors[1], 0.5, 1.6);
    }
    this.ring.visible = sp.impact >= 0;
    if (sp.impact >= 0) {
      const k = Math.min(1, sp.impact / 450);
      this.ring.position.copy(bp);
      this.ring.quaternion.copy(this.camera.quaternion);
      this.ring.scale.setScalar(0.5 + k * 5);
      setCol(this.ring, sp.colors[0], 1 - k, 3);
      this.flash = Math.max(0, 0.45 * (1 - sp.impact / 220));
    } else this.flash = 0;
  }

  // ------------------------------------------------ HUD (placar, nome de quem tem a bola, GOL!, REPLAY)
  private project(x: number, y: number, z: number): [number, number] | null {
    this.v3.set(x, y, z).project(this.camera);
    if (this.v3.z > 1) return null;
    return [(this.v3.x * 0.5 + 0.5) * this.css.w, (-this.v3.y * 0.5 + 0.5) * this.css.h];
  }

  private rrect(x: number, y: number, w: number, h: number, r: number) {
    const g = this.hg;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  private drawHud(s: MatchSnapshot, hud: Hud3D, replaying: boolean) {
    const g = this.hg;
    const R = this.ratio;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.hud.width, this.hud.height);
    g.setTransform(R, 0, 0, R, 0, 0);
    const W = this.css.w, H = this.css.h;
    const font = (w: number, px: number) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    g.textBaseline = "middle";
    if (this.intro) {
      // legenda da abertura e "toque para pular"
      const cap = this.intro.arrival ? this.introCaption : "Os times entram em campo";
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(0, H - 46, W, 46);
      g.font = font(800, 19);
      g.textAlign = "left";
      g.fillStyle = "#ffffff";
      g.fillText(cap.toUpperCase(), 14, H - 28);
      g.font = font(600, 13);
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText("Toque para pular", 14, H - 11);
      g.fillStyle = this.o.home.colors[0];
      g.fillRect(0, H - 46, 4, 46);
      return;
    }
    // placar
    const x = 8, y = 8;
    g.font = font(800, 16);
    g.textAlign = "left";
    const line = `${hud.abbr[0]}  ${hud.score[0]} - ${hud.score[1]}  ${hud.abbr[1]}`;
    const tw = g.measureText(line).width;
    const bw = tw + 26;
    this.rrect(x, y, bw, 26, 6);
    g.fillStyle = hud.frame?.[0] ? `${hud.frame[0]}e6` : "rgba(10,16,30,0.86)";
    g.fill();
    g.fillStyle = hud.color[0];
    g.fillRect(x + 5, y + 6, 4, 14);
    g.fillStyle = hud.color[1];
    g.fillRect(x + bw - 9, y + 6, 4, 14);
    g.fillStyle = "#ffffff";
    g.fillText(line, x + 13, y + 14);
    this.rrect(x, y + 29, 50, 18, 5);
    g.fillStyle = hud.frame?.[1] ?? "#f5c542";
    g.fill();
    g.font = font(800, 13);
    g.fillStyle = "#0b0f18";
    g.textAlign = "center";
    g.fillText(hud.clock, x + 25, y + 38.5);

    if (!replaying) {
      const p = s.holder != null ? s.players.find((q) => q.id === s.holder) : undefined;
      if (p && p.side !== 2) {
        const col = hud.color[p.side];
        const mp = this.motions.get(p.id) ?? p;
        const pt = this.project(mp.x, 2.25 * PLAYER_SCALE, mp.z);
        if (pt) {
          const bob = Math.sin(this.time / 160) * 2;
          g.beginPath();
          g.moveTo(pt[0] - 6, pt[1] - 10 + bob);
          g.lineTo(pt[0] + 6, pt[1] - 10 + bob);
          g.lineTo(pt[0], pt[1] - 2 + bob);
          g.closePath();
          g.fillStyle = col;
          g.strokeStyle = "rgba(0,0,0,0.6)";
          g.lineWidth = 1.5;
          g.fill();
          g.stroke();
        }
        const label = p.name;
        g.font = font(700, 15);
        const lw = g.measureText(label).width + 44;
        const lx = (W - lw) / 2, ly = H - 30;
        this.rrect(lx, ly, lw, 22, 5);
        g.fillStyle = "rgba(10,16,30,0.82)";
        g.fill();
        this.rrect(lx, ly, 28, 22, 5);
        g.fillStyle = col;
        g.fill();
        g.textAlign = "center";
        g.fillStyle = "#ffffff";
        g.strokeStyle = "rgba(0,0,0,0.5)";
        g.font = font(800, 14);
        g.strokeText(String(p.num || ""), lx + 14, ly + 11.5);
        g.fillText(String(p.num || ""), lx + 14, ly + 11.5);
        g.textAlign = "left";
        g.font = font(700, 15);
        g.fillText(label, lx + 35, ly + 11.5);
      }
    }
    if (this.goalTimer > 0 && !replaying) {
      const t = 2600 - this.goalTimer;
      const sc = t < 160 ? 0.5 + (t / 160) * 0.7 : 1.2 - Math.min(0.2, (t - 160) / 900);
      g.save();
      g.translate(W / 2, H * 0.36);
      g.scale(sc, sc);
      // Fundo em moldura de placar de videogame
      const bannerW = Math.min(480, W * 0.85);
      const bannerH = 110;
      this.rrect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 16);
      g.fillStyle = "rgba(10, 14, 22, 0.88)";
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = Math.floor(t / 100) % 2 ? "#ffd700" : "#c4122f";
      g.stroke();
      // Texto GOL principal
      g.font = font(900, Math.min(72, W * 0.16));
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = "rgba(255,215,0,0.95)";
      g.shadowBlur = 28;
      g.lineWidth = 6;
      g.strokeStyle = "#080c14";
      g.strokeText(this.goalText, 0, -10);
      g.fillStyle = Math.floor(t / 120) % 2 ? "#ffe14a" : "#ffffff";
      g.fillText(this.goalText, 0, -10);
      // Subtítulo
      g.shadowBlur = 0;
      g.font = font(800, 16);
      g.fillStyle = "#3df58a";
      g.fillText("BOLA NA REDE!", 0, 34);
      g.restore();
    }
    if (replaying) {
      g.fillStyle = "rgba(0,0,0,0.85)";
      g.fillRect(0, 0, W, 4);
      g.fillRect(0, H - 4, W, 4);
      this.rrect(W - 86, 10, 76, 22, 5);
      g.fillStyle = "rgba(10,16,30,0.85)";
      g.fill();
      if (Math.floor(this.time / 450) % 2 === 0) {
        g.fillStyle = "#e0262b";
        g.beginPath();
        g.arc(W - 74, 21, 4, 0, Math.PI * 2);
        g.fill();
      }
      g.font = font(800, 14);
      g.textAlign = "left";
      g.fillStyle = "#ffffff";
      g.fillText("REPLAY", W - 64, 21.5);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.glCanvas.removeEventListener("webglcontextlost", this.onLost);
    this.glCanvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.intro?.arrival?.dispose();
    for (const r of this.rigs.values()) this.players.disposeRig(r);
    this.players.dispose();
    this.stadium.dispose();
    this.ball.geometry.dispose();
    (this.ball.material as THREE.Material).dispose();
    this.ballShadow.geometry.dispose();
    (this.ballShadow.material as THREE.Material).dispose();
    for (const s of [this.glow, this.aura, ...this.trail]) s.material.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.glowTex.dispose();
    this.envRT?.dispose();
    this.gtao?.dispose();
    this.bloom?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.box.remove();
  }
}
