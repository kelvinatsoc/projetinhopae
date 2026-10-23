// Festa do Título no Estádio 3D: pódio de campeão no centro do gramado,
// capitão erguendo a taça oficial real (trophy3d.ts), elenco comemorando
// e invasão da torcida com sinalizadores, bandeirões e chuva de papel picado.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildTrophy } from "../trophy3d";
import { trophySpec } from "../trophies";
import { PlayerFactory, type Rig } from "./player";

export interface StadiumCelebrationOpts {
  club: { id: string; name: string; colors: readonly string[]; abbr: string };
  comp: string;
  season: number;
  reduced?: boolean;
}

interface CelebrationFan {
  group: THREE.Group;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  progress: number;
  hasFlag?: boolean;
  hasFlare?: boolean;
  flareLight?: THREE.PointLight;
  flareCore?: THREE.Mesh;
  jumpPhase: number;
}

export function mountStadiumCelebration(canvas: HTMLCanvasElement, opts: StadiumCelebrationOpts): () => void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    return () => undefined;
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050811");
  scene.fog = new THREE.FogExp2("#070b16", 0.007);

  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
  camera.position.set(0, 4.2, 16);
  camera.lookAt(0, 2.2, 0);

  // ---------------------------------------------------------------- iluminação de estádio
  scene.add(new THREE.AmbientLight("#222838", 1.2));

  // 4 torres de refletores noturnos mirando o centro do campo
  const spotColors = ["#ffffff", "#fff5e6", "#f0f6ff", "#ffffff"];
  const spotPositions = [
    [-35, 28, 30], [35, 28, 30],
    [-35, 28, -30], [35, 28, -30]
  ];
  spotPositions.forEach((pos, i) => {
    const spot = new THREE.SpotLight(spotColors[i], 240, 90, Math.PI / 4, 0.45, 1.2);
    spot.position.set(pos[0], pos[1], pos[2]);
    spot.target.position.set(0, 1.2, 0);
    spot.castShadow = i < 2;
    spot.shadow.mapSize.width = 1024;
    spot.shadow.mapSize.height = 1024;
    scene.add(spot);
    scene.add(spot.target);
  });

  // Holofote dourado vertical no troféu
  const trophySpot = new THREE.SpotLight("#ffe082", 180, 25, Math.PI / 5, 0.2);
  trophySpot.position.set(0, 10, 0);
  trophySpot.target.position.set(0, 1.6, 0);
  scene.add(trophySpot);
  scene.add(trophySpot.target);

  // ---------------------------------------------------------------- gramado e arquibancadas
  const pitchGeo = new THREE.PlaneGeometry(110, 75);
  pitchGeo.rotateX(-Math.PI / 2);

  // Textura do gramado cortado em faixas
  const pitchCanvas = document.createElement("canvas");
  pitchCanvas.width = 1024;
  pitchCanvas.height = 1024;
  const pctx = pitchCanvas.getContext("2d")!;
  pctx.fillStyle = "#164d27";
  pctx.fillRect(0, 0, 1024, 1024);
  // Faixas alternadas
  for (let y = 0; y < 1024; y += 64) {
    pctx.fillStyle = (y / 64) % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    pctx.fillRect(0, y, 1024, 64);
  }
  // Linhas do campo (círculo central)
  pctx.strokeStyle = "rgba(255,255,255,0.7)";
  pctx.lineWidth = 6;
  pctx.beginPath();
  pctx.arc(512, 512, 140, 0, Math.PI * 2);
  pctx.stroke();
  pctx.beginPath();
  pctx.arc(512, 512, 5, 0, Math.PI * 2);
  pctx.fillStyle = "rgba(255,255,255,0.85)";
  pctx.fill();
  pctx.beginPath();
  pctx.moveTo(0, 512); pctx.lineTo(1024, 512);
  pctx.stroke();

  const pitchTex = new THREE.CanvasTexture(pitchCanvas);
  pitchTex.colorSpace = THREE.SRGBColorSpace;
  const pitchMat = new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.85, metalness: 0.05 });
  const pitch = new THREE.Mesh(pitchGeo, pitchMat);
  pitch.receiveShadow = true;
  scene.add(pitch);

  // Arquibancadas estilizadas ao fundo
  const standColors = opts.club.id === "sao-paulo"
    ? ["#c4122f", "#ffffff", "#181818"] // Tricolor do MorumBIS
    : [opts.club.colors[0] ?? "#1a56db", opts.club.colors[1] ?? "#ffffff", "#222a38"];

  const standsGroup = new THREE.Group();
  for (let side = -1; side <= 1; side += 2) {
    const stGeo = new THREE.BoxGeometry(120, 16, 22);
    const stMat = new THREE.MeshStandardMaterial({ color: standColors[0], roughness: 0.9 });
    const stMesh = new THREE.Mesh(stGeo, stMat);
    stMesh.position.set(0, 7, side * 46);
    standsGroup.add(stMesh);

    // Faixas decorativas na arquibancada
    const bandGeo = new THREE.BoxGeometry(120, 2.5, 22.2);
    const bandMat = new THREE.MeshStandardMaterial({ color: standColors[1], roughness: 0.8 });
    const bandMesh = new THREE.Mesh(bandGeo, bandMat);
    bandMesh.position.set(0, 8.5, side * 46);
    standsGroup.add(bandMesh);
  }
  scene.add(standsGroup);

  // ---------------------------------------------------------------- pódio de campeão no centro
  const podiumGroup = new THREE.Group();

  // Nível 1 (base do pódio)
  const pod1Geo = new THREE.CylinderGeometry(5.2, 5.6, 0.45, 32);
  const pod1Mat = new THREE.MeshStandardMaterial({ color: "#141926", roughness: 0.5, metalness: 0.4 });
  const pod1 = new THREE.Mesh(pod1Geo, pod1Mat);
  pod1.position.y = 0.225;
  pod1.receiveShadow = true;
  pod1.castShadow = true;
  podiumGroup.add(pod1);

  // Nível 2 (degrau superior com carpete do clube)
  const pod2Geo = new THREE.CylinderGeometry(3.6, 4.0, 0.4, 32);
  const pod2Mat = new THREE.MeshStandardMaterial({
    color: opts.club.colors[0] ?? "#c4122f",
    roughness: 0.65,
    metalness: 0.2
  });
  const pod2 = new THREE.Mesh(pod2Geo, pod2Mat);
  pod2.position.y = 0.65;
  pod2.receiveShadow = true;
  pod2.castShadow = true;
  podiumGroup.add(pod2);

  // Pedestal central elevado para a taça
  const plinthGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.55, 24);
  const plinthMat = new THREE.MeshStandardMaterial({ color: "#222a3a", roughness: 0.35, metalness: 0.7 });
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.position.y = 1.1;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  podiumGroup.add(plinth);

  // Borda dourada no pódio
  const goldTrimGeo = new THREE.TorusGeometry(3.7, 0.06, 12, 48);
  goldTrimGeo.rotateX(Math.PI / 2);
  const goldTrimMat = new THREE.MeshStandardMaterial({ color: "#ffd54f", metalness: 0.9, roughness: 0.2 });
  const goldTrim = new THREE.Mesh(goldTrimGeo, goldTrimMat);
  goldTrim.position.y = 0.85;
  podiumGroup.add(goldTrim);

  scene.add(podiumGroup);

  // ---------------------------------------------------------------- Troféu Oficial Real 3D
  const spec = trophySpec(opts.comp);
  const trophyObj = buildTrophy(spec);
  // Escala e posiciona o troféu no centro do pódio
  trophyObj.scale.setScalar(0.72);
  trophyObj.position.set(0, 1.38, 0);
  scene.add(trophyObj);

  // ---------------------------------------------------------------- Elenco de Jogadores
  const playerFactory = new PlayerFactory(scene, true, 4);
  const squadRigs: { rig: Rig; x: number; z: number; isCaptain: boolean; jumpOffset: number }[] = [];

  const mainColor = opts.club.colors[0] ?? "#c4122f";
  const secColor = opts.club.colors[1] ?? "#ffffff";

  // Capitão (no centro, em frente ao troféu erguendo os braços)
  const makePlayer3D = (id: number, num: number, name: string, skin: string, isGk: boolean, x: number, z: number) => ({
    id, side: 0 as const, grp: isGk ? 0 : 2, num, name,
    skin, hair: "#111111",
    shirt: isGk ? "#f59e0b" : mainColor,
    sleeve: isGk ? "#f59e0b" : mainColor,
    shorts: secColor, socks: isGk ? "#f59e0b" : mainColor,
    pattern: "solid", stripe: secColor,
    x, z, vx: 0, vz: 0, walk: 0, dive: -1, diveDir: 0, down: false, arms: true, sad: false,
    pose: null, poseS: 0
  });

  const capRig = playerFactory.make(makePlayer3D(1, 10, "CAPITÃO", "#8d5524", false, 0, 0.9));
  scene.add(capRig.root);
  squadRigs.push({ rig: capRig, x: 0, z: 0.9, isCaptain: true, jumpOffset: 0 });

  // 10 companheiros de equipe ao redor do pódio
  const teamPositions = [
    [-1.2, 0.6], [1.2, 0.6],
    [-2.1, 0.1], [2.1, 0.1],
    [-1.6, -1.0], [1.6, -1.0],
    [-0.7, -1.5], [0.7, -1.5],
    [-2.6, 0.9], [2.6, 0.9],
  ];

  const skins = ["#e0ac69", "#c68642", "#8d5524", "#f1c27d", "#5c3a1e"];
  teamPositions.forEach((pos, idx) => {
    const isGk = idx === 0;
    const rig = playerFactory.make(makePlayer3D(idx + 2, isGk ? 1 : idx + 2, isGk ? "GOLEIRO" : `CAMPEÃO ${idx + 2}`, skins[idx % skins.length], isGk, pos[0], pos[1]));
    scene.add(rig.root);
    squadRigs.push({ rig, x: pos[0], z: pos[1], isCaptain: false, jumpOffset: idx * 0.45 });
  });

  // ---------------------------------------------------------------- A Invasão da Torcida (Pitch Invasion)
  const fans: CelebrationFan[] = [];
  const fanGeo = new THREE.CylinderGeometry(0.24, 0.28, 1.25, 8);
  const fanHeadGeo = new THREE.SphereGeometry(0.18, 12, 10);
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.4);
  const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 3.2, 6);

  const flagMat = new THREE.MeshStandardMaterial({
    color: mainColor,
    roughness: 0.7,
    side: THREE.DoubleSide
  });
  const poleMat = new THREE.MeshStandardMaterial({ color: "#d1d5db", metalness: 0.5 });

  const numFans = opts.reduced ? 28 : 64;
  for (let i = 0; i < numFans; i++) {
    const fanGroup = new THREE.Group();

    // Roupa nas cores do clube
    const shirtColor = i % 2 === 0 ? mainColor : secColor;
    const fanMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
    const fanBody = new THREE.Mesh(fanGeo, fanMat);
    fanBody.position.y = 0.65;
    fanBody.castShadow = true;
    fanGroup.add(fanBody);

    const headMat = new THREE.MeshStandardMaterial({ color: skins[i % skins.length], roughness: 0.6 });
    const fanHead = new THREE.Mesh(fanHeadGeo, headMat);
    fanHead.position.y = 1.38;
    fanGroup.add(fanHead);

    // Braços comemorando
    const armGeo = new THREE.BoxGeometry(0.12, 0.65, 0.12);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, fanMat);
      arm.position.set(sx * 0.32, 1.15, 0);
      arm.rotation.z = sx * -0.55;
      arm.rotation.x = -0.4;
      fanGroup.add(arm);
    }

    // Ponto de origem (fora do campo / arquibancadas)
    const angle = (i / numFans) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const startDist = 32 + Math.random() * 18;
    const origin = new THREE.Vector3(Math.cos(angle) * startDist, 0, Math.sin(angle) * (startDist * 0.75));

    // Ponto de destino (no gramado em volta do pódio, entre 5m e 14m)
    const endDist = 5.2 + Math.random() * 9.5;
    const target = new THREE.Vector3(Math.cos(angle) * endDist, 0, Math.sin(angle) * endDist);

    fanGroup.position.copy(origin);
    fanGroup.lookAt(target.x, 0, target.z);

    const hasFlag = i % 5 === 0;
    const hasFlare = (i % 7 === 1) && !opts.reduced;
    let flareLight: THREE.PointLight | undefined;
    let flareCore: THREE.Mesh | undefined;

    if (hasFlag) {
      const flagMesh = new THREE.Mesh(flagGeo, flagMat);
      flagMesh.position.set(0.6, 2.4, 0);
      const poleMesh = new THREE.Mesh(poleGeo, poleMat);
      poleMesh.position.set(0, 1.6, 0);
      const fHolder = new THREE.Group();
      fHolder.add(poleMesh, flagMesh);
      fHolder.rotation.z = (Math.random() - 0.5) * 0.3;
      fanGroup.add(fHolder);
    }

    if (hasFlare) {
      flareCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: "#ff5722" })
      );
      flareCore.position.set(0.35, 1.65, 0.2);
      fanGroup.add(flareCore);

      flareLight = new THREE.PointLight("#ff6d00", 25, 14, 2);
      flareLight.position.set(0.35, 1.65, 0.2);
      fanGroup.add(flareLight);
    }

    scene.add(fanGroup);
    fans.push({
      group: fanGroup,
      origin,
      target,
      speed: 0.18 + Math.random() * 0.14,
      progress: Math.min(1, Math.random() * 0.35), // começam já correndo para o centro
      hasFlag,
      hasFlare,
      flareLight,
      flareCore,
      jumpPhase: Math.random() * Math.PI * 2
    });
  }

  // ---------------------------------------------------------------- Confetes e Serpentinas
  const confCount = opts.reduced ? 400 : 1600;
  const confGeo = new THREE.BufferGeometry();
  const confPos = new Float32Array(confCount * 3);
  const confCols = new Float32Array(confCount * 3);
  const confVel = new Float32Array(confCount * 3);

  const palette = [
    new THREE.Color(opts.club.colors[0] ?? "#c4122f"),
    new THREE.Color(opts.club.colors[1] ?? "#ffffff"),
    new THREE.Color("#ffd54f"), // Dourado do título
    new THREE.Color("#ffffff")
  ];

  for (let i = 0; i < confCount; i++) {
    confPos[i * 3] = (Math.random() - 0.5) * 26;
    confPos[i * 3 + 1] = Math.random() * 22;
    confPos[i * 3 + 2] = (Math.random() - 0.5) * 26;

    const col = palette[i % palette.length];
    confCols[i * 3] = col.r;
    confCols[i * 3 + 1] = col.g;
    confCols[i * 3 + 2] = col.b;

    confVel[i * 3] = (Math.random() - 0.5) * 0.8;
    confVel[i * 3 + 1] = -1.2 - Math.random() * 1.5;
    confVel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
  }

  confGeo.setAttribute("position", new THREE.BufferAttribute(confPos, 3));
  confGeo.setAttribute("color", new THREE.BufferAttribute(confCols, 3));
  const confMat = new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.95 });
  const confetti = new THREE.Points(confGeo, confMat);
  scene.add(confetti);

  // ---------------------------------------------------------------- Fogos de Artifício 3D
  const fireworks: { mesh: THREE.Points; vel: Float32Array; life: number; maxLife: number }[] = [];

  function spawnFirework() {
    const pCount = 70;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(pCount * 3);
    const vel = new Float32Array(pCount * 3);
    const col = new Float32Array(pCount * 3);

    const cx = (Math.random() - 0.5) * 45;
    const cy = 18 + Math.random() * 14;
    const cz = (Math.random() - 0.5) * 35;
    const fwColor = palette[Math.floor(Math.random() * palette.length)];

    for (let i = 0; i < pCount; i++) {
      pos[i * 3] = cx;
      pos[i * 3 + 1] = cy;
      pos[i * 3 + 2] = cz;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sp = 4.5 + Math.random() * 6.5;

      vel[i * 3] = Math.sin(phi) * Math.cos(theta) * sp;
      vel[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * sp;
      vel[i * 3 + 2] = Math.cos(phi) * sp;

      col[i * 3] = fwColor.r;
      col[i * 3 + 1] = fwColor.g;
      col[i * 3 + 2] = fwColor.b;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 1 });
    const fwMesh = new THREE.Points(g, m);
    scene.add(fwMesh);
    fireworks.push({ mesh: fwMesh, vel, life: 0, maxLife: 1.8 });
  }

  // ---------------------------------------------------------------- Controles Touch / Drag de Câmera
  let camAngle = 0;
  let camRadius = 15.5;
  let camHeight = 4.2;
  let userInteracting = false;
  let lastTouchX = 0;
  let lastTouchY = 0;

  const onPointerDown = (e: PointerEvent) => {
    userInteracting = true;
    lastTouchX = e.clientX;
    lastTouchY = e.clientY;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!userInteracting) return;
    const dx = e.clientX - lastTouchX;
    const dy = e.clientY - lastTouchY;
    lastTouchX = e.clientX;
    lastTouchY = e.clientY;
    camAngle -= dx * 0.007;
    camHeight = Math.max(1.8, Math.min(8.5, camHeight - dy * 0.02));
  };
  const onPointerUp = () => { userInteracting = false; };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  // ---------------------------------------------------------------- Loop de Animação
  let raf = 0;
  let lastTime = performance.now();
  let fwTimer = 0;

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Câmera orbital automática suave quando o usuário não estiver arrastando
    if (!userInteracting) {
      camAngle += dt * 0.14;
    }
    camera.position.x = Math.sin(camAngle) * camRadius;
    camera.position.z = Math.cos(camAngle) * camRadius;
    camera.position.y = camHeight;
    camera.lookAt(0, 1.6, 0);

    // O troféu brilha e gira no topo do pedestal
    trophyObj.rotation.y += dt * 0.8;

    // Animação dos jogadores no pódio (capitão e elenco)
    for (const sq of squadRigs) {
      const { root, armL, armR, foreL, foreR, head } = sq.rig;
      const jumpTime = now / 190 + sq.jumpOffset;
      const jumpHeight = Math.abs(Math.sin(jumpTime)) * 0.32;
      root.position.set(sq.x, 0.85 + jumpHeight, sq.z);
      root.lookAt(0, 0.85, 3.5);

      if (sq.isCaptain) {
        // Capitão erguendo a taça com os dois braços altos
        armL.rotation.set(-2.8, 0.25, -0.2);
        armR.rotation.set(-2.8, -0.25, 0.2);
        foreL.rotation.set(-0.2, 0, 0);
        foreR.rotation.set(-0.2, 0, 0);
        head.rotation.x = -0.45;
      } else {
        // Companheiros pulando e vibrando com braços erguidos
        armL.rotation.set(-2.5 + Math.sin(jumpTime) * 0.35, 0.2, -0.35);
        armR.rotation.set(-2.5 + Math.cos(jumpTime) * 0.35, -0.2, 0.35);
        head.rotation.x = -0.25;
      }
    }

    // Animação da Invasão da Torcida (correndo para o pódio e comemorando)
    for (const fan of fans) {
      if (fan.progress < 1) {
        fan.progress = Math.min(1, fan.progress + dt * fan.speed);
        fan.group.position.lerpVectors(fan.origin, fan.target, fan.progress);
        fan.group.position.y = Math.abs(Math.sin(now / 140 + fan.jumpPhase)) * 0.24; // corrida saltitante
      } else {
        // Já no gramado ao redor do palco: pulando sem parar!
        fan.group.position.y = Math.abs(Math.sin(now / 180 + fan.jumpPhase)) * 0.28;
      }

      // Efeito de luz do sinalizador
      if (fan.hasFlare && fan.flareLight) {
        const pulse = 0.8 + Math.sin(now / 70 + fan.jumpPhase) * 0.35 + Math.random() * 0.2;
        fan.flareLight.intensity = 26 * pulse;
      }
    }

    // Confetes caindo
    const posAttr = confetti.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < confCount; i++) {
      let y = posAttr.getY(i) + confVel[i * 3 + 1] * dt * 2.5;
      let x = posAttr.getX(i) + confVel[i * 3] * dt * 2.5;
      let z = posAttr.getZ(i) + confVel[i * 3 + 2] * dt * 2.5;
      if (y < 0.1) {
        y = 20 + Math.random() * 4;
        x = (Math.random() - 0.5) * 26;
        z = (Math.random() - 0.5) * 26;
      }
      posAttr.setXYZ(i, x, y, z);
    }
    posAttr.needsUpdate = true;

    // Fogos de artifício
    fwTimer -= dt;
    if (fwTimer <= 0) {
      spawnFirework();
      fwTimer = 0.55 + Math.random() * 0.7;
    }
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const fw = fireworks[i];
      fw.life += dt;
      const fPos = fw.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let j = 0; j < fPos.count; j++) {
        fPos.setXYZ(
          j,
          fPos.getX(j) + fw.vel[j * 3] * dt,
          fPos.getY(j) + fw.vel[j * 3 + 1] * dt - 3.5 * dt * dt,
          fPos.getZ(j) + fw.vel[j * 3 + 2] * dt
        );
      }
      fPos.needsUpdate = true;
      (fw.mesh.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - fw.life / fw.maxLife);
      if (fw.life >= fw.maxLife) {
        scene.remove(fw.mesh);
        fw.mesh.geometry.dispose();
        (fw.mesh.material as THREE.Material).dispose();
        fireworks.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // Limpeza
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);

    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose?.());
        else mesh.material.dispose?.();
      }
    });
    env.dispose();
    pm.dispose();
    pitchTex.dispose();
    renderer.dispose();
  };
}
