// Motor de Mundo Interativo HD-2D a 60 FPS (estilo Sea of Stars / Pocket League Story / Octopath Traveler)
// Combina os dioramas isométricos HD-2D com atores 16-bit vivos (jogadores reais do elenco e da base
// treinando no gramado, trocando passes, ganhando +XP flutuante, sinalizadores na arquibancada,
// feixes volumétricos de refletores e partículas atmosféricas).
import { useEffect, useMemo, useRef, useState } from "react";
import type { Club, Player, StadiumLook, World } from "../../engine/types";
import { visibleColor } from "../components";
import { lookOf, drawPitchDude, type SpriteDude } from "../matchSprites";
import { mediaUrl } from "../mediaUrl";

export type Hd2dSceneSite = "stadium" | "ct" | "academy";
export type Hd2dTimeOfDay = "day" | "sunset" | "night";
export type Hd2dStadiumVariant = "auto" | "morumbis" | "arena" | "caldeirao";

interface Hd2dWorldCanvasProps {
  club: Club;
  world?: World | null;
  site?: Hd2dSceneSite;
  timeOfDay?: Hd2dTimeOfDay;
  variant?: Hd2dStadiumVariant;
  look?: StadiumLook | null;
  height?: number | string;
  onPlayerClick?: (pid: number) => void;
}

const ARENA_CLUBS = new Set([
  "flamengo", "fluminense", "palmeiras", "corinthians", "atletico_mg",
  "gremio", "internacional", "athletico_pr", "bahia", "fortaleza", "botafogo", "cruzeiro",
]);

const CALDEIRAO_CLUBS = new Set([
  "santos", "vasco", "vitoria", "juventude", "criciuma", "atletico_go", "bragantino", "remo", "paysandu",
]);

interface WorldActor {
  pid: number;
  name: string;
  ovr: number;
  age: number;
  isWonderkid: boolean;
  homeX: number;
  homeY: number;
  dude: SpriteDude;
  tx: number;
  ty: number;
  waitUntil: number;
}

interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
  dur: number;
}

interface FlareSmoke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

const RPG_GAIN_LABELS = [
  { text: "+1 FIN", color: "#facc15" },
  { text: "+1 PAS", color: "#38bdf8" },
  { text: "+1 DRI", color: "#4ade80" },
  { text: "+1 VEL", color: "#f472b6" },
  { text: "+1 FIS", color: "#fb923c" },
  { text: "★ EVOLUÇÃO!", color: "#fde047" },
  { text: "🔥 FOCO MÁXIMO", color: "#f87171" },
];

const ACADEMY_GAIN_LABELS = [
  { text: "+2 POTENCIAL ★", color: "#fde047" },
  { text: "+1 TÉCNICA", color: "#4ade80" },
  { text: "+1 VISÃO DE JOGO", color: "#38bdf8" },
  { text: "✨ JOIA DE COTIA!", color: "#facc15" },
  { text: "+1 FINALIZAÇÃO", color: "#fb923c" },
];

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName.slice(0, 11);
  const last = parts[parts.length - 1];
  if (last.length <= 10) return last;
  return parts[0].slice(0, 10);
}

export function resolveArtworkPath(
  club: Club,
  site: Hd2dSceneSite,
  timeOfDay: Hd2dTimeOfDay,
  variant: Hd2dStadiumVariant,
  look?: StadiumLook | null
): string {
  if (site === "ct") return mediaUrl("hd2d/training-ct.jpg");
  if (site === "academy") return mediaUrl("hd2d/academy-cotia.jpg");

  const roofType = look?.roof?.type;
  const facadeType = look?.facade?.type;

  if (variant === "arena") return mediaUrl("hd2d/stadium-arena.jpg");
  if (variant === "caldeirao") return mediaUrl("hd2d/stadium-caldeirao.jpg");
  if (variant === "morumbis") {
    if (timeOfDay === "day") return mediaUrl("hd2d/stadium-day.jpg");
    if (timeOfDay === "sunset") return mediaUrl("hd2d/stadium-sunset.jpg");
    return mediaUrl("hd2d/stadium-night.jpg");
  }

  if (timeOfDay === "day") return mediaUrl("hd2d/stadium-day.jpg");
  if (timeOfDay === "sunset") return mediaUrl("hd2d/stadium-sunset.jpg");

  if (roofType === "none" || roofType === "canopy" || facadeType === "classic") {
    return mediaUrl("hd2d/stadium-caldeirao.jpg");
  }
  if (roofType === "box" || roofType === "petals" || facadeType === "glass" || facadeType === "membrane") {
    return mediaUrl("hd2d/stadium-arena.jpg");
  }
  if (club.id === "sao_paulo" || club.id === "sao-paulo") return mediaUrl("hd2d/stadium-night.jpg");
  if (CALDEIRAO_CLUBS.has(club.id) || (club.capacity && club.capacity < 32000)) {
    return mediaUrl("hd2d/stadium-caldeirao.jpg");
  }
  if (ARENA_CLUBS.has(club.id)) {
    return mediaUrl("hd2d/stadium-arena.jpg");
  }
  return mediaUrl("hd2d/stadium-night.jpg");
}

export function Hd2dWorldCanvas({
  club,
  world,
  site = "stadium",
  timeOfDay = "night",
  variant = "auto",
  look,
  height = 260,
  onPlayerClick,
}: Hd2dWorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const c1 = visibleColor(club.colors);
  const c2 = club.colors.find((c) => c.toLowerCase() !== c1.toLowerCase()) ?? "#ffffff";
  const c3 = club.colors[2] ?? "#111827";

  const artworkSrc = useMemo(
    () => resolveArtworkPath(club, site, timeOfDay, variant, look),
    [club, site, timeOfDay, variant, look]
  );

  // Seleciona jogadores reais do elenco profissional (CT/Estádio) ou da Base (Cotia)
  const rosterPlayers = useMemo<Player[]>(() => {
    if (!world) return [];
    const allClubPlayers = (club.players ?? [])
      .map((id: number) => world.players[id])
      .filter((p): p is Player => !!p);
    if (site === "academy") {
      const youthList = allClubPlayers.filter((p) => p.youth);
      const source = youthList.length >= 4 ? youthList : allClubPlayers;
      return [...source].sort((a, b) => b.born - a.born || b.pot - a.pot).slice(0, 8);
    }
    const proList = allClubPlayers.filter((p) => !p.youth);
    const source = proList.length >= 4 ? proList : allClubPlayers;
    return [...source].sort((a, b) => b.ovr - a.ovr).slice(0, 8);
  }, [world, club, site]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CW = 960;
    const CH = 380;
    canvas.width = CW;
    canvas.height = CH;

    const bgImg = new Image();
    let bgLoaded = false;
    bgImg.onload = () => {
      bgLoaded = true;
    };
    bgImg.src = artworkSrc;

    // Coordenadas do gramado isométrico em cada diorama (em espaço lógico 192x76 com escala 5x)
    const SCALE = 5;
    const LW = CW / SCALE; // 192
    const LH = CH / SCALE; // 76

    const pitchZone =
      site === "ct"
        ? { x0: 60, x1: 152, y0: 44, y1: 65 }
        : site === "academy"
          ? { x0: 48, x1: 116, y0: 47, y1: 66 }
          : { x0: 58, x1: 132, y0: 43, y1: 60 };

    const count = Math.max(6, rosterPlayers.length || 8);
    const actors: WorldActor[] = Array.from({ length: count }, (_, idx) => {
      const p = rosterPlayers[idx];
      const lookSpec = lookOf(p);
      const t = idx / Math.max(1, count - 1);
      const hx = pitchZone.x0 + 8 + t * (pitchZone.x1 - pitchZone.x0 - 16);
      const hy = pitchZone.y0 + 4 + ((idx % 3) / 2) * (pitchZone.y1 - pitchZone.y0 - 8);
      const isSecondGroup = idx % 2 === 1;
      const shirtColor = site === "academy" ? c1 : isSecondGroup && site === "stadium" ? c2 : c1;
      const stripeColor = site === "academy" ? c2 : isSecondGroup && site === "stadium" ? c1 : c2;

      return {
        pid: p?.id ?? idx,
        name: p ? shortName(p.name) : site === "academy" ? `Joia #${idx + 1}` : `Atleta #${idx + 1}`,
        ovr: p?.ovr ?? (site === "academy" ? 64 + (idx % 8) : 76 + (idx % 7)),
        age: p ? (world?.season ?? 2026) - p.born : site === "academy" ? 16 + (idx % 3) : 24,
        isWonderkid: site === "academy" ? (p ? p.pot >= 82 : idx < 3) : p ? p.ovr >= 80 : idx < 2,
        homeX: hx,
        homeY: hy,
        tx: hx + (Math.random() - 0.5) * 12,
        ty: hy + (Math.random() - 0.5) * 8,
        waitUntil: idx * 350,
        dude: {
          side: isSecondGroup ? 1 : 0,
          x: hx,
          y: hy,
          vx: 0.04,
          vy: 0,
          walk: idx * 2.1,
          speed: 1.1,
          down: -1,
          dive: -1,
          diveDir: 1,
          arms: -1,
          shirt: shirtColor,
          sleeve: shirtColor,
          shorts: c3,
          socks: c1,
          pattern: idx % 3 === 0 ? "stripes" : "hoops",
          stripe: stripeColor,
          skin: lookSpec.skin,
          hair: lookSpec.hair,
          look: lookSpec,
        },
      };
    });

    // Duas bolas de treino rolando entre os jogadores
    const balls = [
      {
        x: actors[0]?.dude.x ?? 80,
        y: actors[0]?.dude.y ?? 50,
        h: 0,
        fromIdx: 0,
        toIdx: Math.min(1, actors.length - 1),
        t0: 0,
        dur: 1100,
        spin: 0,
      },
      {
        x: actors[Math.min(2, actors.length - 1)]?.dude.x ?? 100,
        y: actors[Math.min(2, actors.length - 1)]?.dude.y ?? 54,
        h: 0,
        fromIdx: Math.min(2, actors.length - 1),
        toIdx: Math.min(3, actors.length - 1),
        t0: 400,
        dur: 1250,
        spin: 0,
      },
    ];

    const popups: FloatingPopup[] = [];
    const smokes: FlareSmoke[] = [];
    const fireflies = Array.from({ length: 22 }, (_, i) => ({
      x: (i * 47) % CW,
      y: 40 + ((i * 73) % (CH - 60)),
      r: 1.4 + (i % 3) * 0.8,
      speed: 0.25 + (i % 4) * 0.12,
      phase: i * 1.3,
    }));

    const spawnPopup = (actor: WorldActor, now: number, customText?: string) => {
      const pool = site === "academy" ? ACADEMY_GAIN_LABELS : RPG_GAIN_LABELS;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      popups.push({
        x: actor.dude.x,
        y: actor.dude.y - 12,
        text: customText ?? `${actor.name} ${pick.text}`,
        color: pick.color,
        born: now,
        dur: 1850,
      });
    };

    // Dispara primeiro popup logo ao abrir a cena
    if (actors[0]) spawnPopup(actors[0], 100);

    let raf = 0;
    let last = performance.now();
    let nextPopupAt = last + 1400;

    const handleCanvasClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = ((ev.clientX - rect.left) / rect.width) * LW;
      const clickY = ((ev.clientY - rect.top) / rect.height) * LH;
      let nearest: WorldActor | null = null;
      let bestD = 999;
      for (const a of actors) {
        const d = Math.hypot(a.dude.x - clickX, a.dude.y - 4 - clickY);
        if (d < bestD) {
          bestD = d;
          nearest = a;
        }
      }
      if (nearest) {
        const now = performance.now();
        nearest.dude.arms = now + 900;
        spawnPopup(nearest, now, `⚡ ${nearest.name} (${nearest.ovr} OVR) · TREINO INTENSO!`);
        setSelectedName(`${nearest.name} · ${nearest.ovr} OVR`);
        if (onPlayerClick && nearest.pid >= 0) onPlayerClick(nearest.pid);
      }
    };
    canvas.addEventListener("click", handleCanvasClick);

    const tick = (now: number) => {
      const dt = Math.min(50, Math.max(1, now - last));
      last = now;

      // 1. Desenha o diorama HD-2D de fundo
      ctx.clearRect(0, 0, CW, CH);
      if (bgLoaded) {
        ctx.save();
        if (timeOfDay === "day") ctx.filter = "saturate(1.12) contrast(1.04)";
        else if (timeOfDay === "sunset") ctx.filter = "saturate(1.18) contrast(1.06) sepia(0.08)";
        else ctx.filter = "saturate(1.14) contrast(1.06)";
        const imgRatio = bgImg.width / Math.max(1, bgImg.height);
        const canvasRatio = CW / CH;
        let dw = CW;
        let dh = CH;
        let dx = 0;
        let dy = 0;
        if (imgRatio > canvasRatio) {
          dh = CH;
          dw = CH * imgRatio;
          dx = (CW - dw) * 0.5;
        } else {
          dw = CW;
          dh = CW / imgRatio;
          dy = (CH - dh) * 0.46;
        }
        ctx.drawImage(bgImg, dx, dy, dw, dh);
        ctx.restore();
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, CH);
        grad.addColorStop(0, "#0b1325");
        grad.addColorStop(1, "#0d2818");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CW, CH);
      }

      // 2. Feixes de luz volumétricos dinâmicos (estilo Sea of Stars / Octopath)
      if (timeOfDay !== "day") {
        ctx.save();
        const beamSwing = Math.sin(now * 0.0008) * 35;
        for (const [bx, targetX] of [
          [90, CW * 0.36 + beamSwing],
          [CW - 90, CW * 0.64 - beamSwing],
        ] as const) {
          const beam = ctx.createLinearGradient(bx, 0, targetX, CH * 0.85);
          beam.addColorStop(0, timeOfDay === "sunset" ? "rgba(251, 191, 36, 0.22)" : "rgba(254, 249, 195, 0.18)");
          beam.addColorStop(0.55, timeOfDay === "sunset" ? "rgba(251, 146, 60, 0.08)" : "rgba(186, 230, 253, 0.06)");
          beam.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = beam;
          ctx.beginPath();
          ctx.moveTo(bx - 18, 0);
          ctx.lineTo(bx + 18, 0);
          ctx.lineTo(targetX + 150, CH * 0.9);
          ctx.lineTo(targetX - 150, CH * 0.9);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // 3. No Estádio: sinalizadores e fumaça nas cores do clube nas arquibancadas
      if (site === "stadium") {
        if (Math.random() < 0.35 && smokes.length < 36) {
          const leftStand = Math.random() < 0.5;
          smokes.push({
            x: leftStand ? 160 + Math.random() * 200 : 580 + Math.random() * 200,
            y: 95 + Math.random() * 55,
            vx: (Math.random() - 0.35) * 0.45,
            vy: -0.35 - Math.random() * 0.35,
            size: 6 + Math.random() * 10,
            alpha: 0.42,
            color: Math.random() < 0.65 ? c1 : "#ef4444",
          });
        }
        for (const sm of smokes) {
          sm.x += sm.vx;
          sm.y += sm.vy;
          sm.size += 0.12;
          sm.alpha -= 0.0045;
          if (sm.alpha > 0) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, sm.alpha);
            ctx.fillStyle = sm.color;
            ctx.beginPath();
            ctx.arc(sm.x, sm.y, sm.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
        for (let i = smokes.length - 1; i >= 0; i--) {
          if (smokes[i].alpha <= 0) smokes.splice(i, 1);
        }
      }

      // 4. Atores 16-Bit HD-2D no gramado (Escala 5x)
      ctx.save();
      ctx.scale(SCALE, SCALE);

      // Atualiza posição dos atletas no treino / aquecimento
      for (const a of actors) {
        const d = a.dude;
        if (now >= a.waitUntil) {
          const dx = a.tx - d.x;
          const dy = a.ty - d.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.6) {
            a.waitUntil = now + 450 + Math.random() * 900;
            a.tx = Math.max(pitchZone.x0 + 4, Math.min(pitchZone.x1 - 4, a.homeX + (Math.random() - 0.5) * 16));
            a.ty = Math.max(pitchZone.y0 + 3, Math.min(pitchZone.y1 - 3, a.homeY + (Math.random() - 0.5) * 9));
            d.vx = 0;
            d.vy = 0;
          } else {
            const step = Math.min(dist, (dt / 1000) * 11.5);
            d.vx = (dx / dist) * step;
            d.vy = (dy / dist) * step;
            d.x += d.vx;
            d.y += d.vy;
            d.walk += step * 0.95;
          }
        } else {
          d.vx = 0;
          d.vy = 0;
        }
      }

      // Atualiza as bolas de treino trocando passes entre os jogadores
      for (const b of balls) {
        const u = Math.min(1, Math.max(0, (now - b.t0) / Math.max(1, b.dur)));
        const fromA = actors[b.fromIdx] ?? actors[0];
        const toA = actors[b.toIdx] ?? actors[0];
        if (fromA && toA) {
          b.x = fromA.dude.x + (toA.dude.x - fromA.dude.x) * u;
          b.y = fromA.dude.y + (toA.dude.y - fromA.dude.y) * u;
          b.h = Math.sin(Math.PI * u) * 2.4;
          b.spin += dt;
          if (u >= 1) {
            b.fromIdx = b.toIdx;
            b.toIdx = (b.toIdx + 1 + Math.floor(Math.random() * Math.max(1, actors.length - 1))) % actors.length;
            b.t0 = now;
            b.dur = 850 + Math.random() * 650;
          }
        }
      }

      // Popups periódicos de evolução estilo Pocket League Story / RPG
      if (now >= nextPopupAt && actors.length > 0) {
        const pickActor = actors[Math.floor(Math.random() * actors.length)];
        spawnPopup(pickActor, now);
        nextPopupAt = now + 2100 + Math.random() * 1200;
      }

      // Ordena jogadores por profundidade Y e desenha cada um com drawPitchDude
      const sorted = [...actors].sort((a, b) => a.dude.y - b.dude.y);
      const scaleActor = site === "stadium" ? 0.55 : 0.74;

      for (const a of sorted) {
        ctx.save();
        ctx.translate(a.dude.x, a.dude.y);
        ctx.scale(scaleActor, scaleActor);
        ctx.translate(-a.dude.x, -a.dude.y);
        const isHolder = balls.some((b) => b.toIdx === actors.indexOf(a));
        const facing: 1 | -1 = a.tx >= a.dude.x ? 1 : -1;
        drawPitchDude(ctx, a.dude, now, isHolder, facing);
        ctx.restore();

        // Plaquinha RPG discreta com nome do jogador no CT e na Base
        if (site !== "stadium") {
          const label = a.isWonderkid ? `★ ${a.name}` : a.name;
          ctx.save();
          ctx.font = "bold 2.1px Inter, system-ui, sans-serif";
          ctx.textAlign = "center";
          const tw = ctx.measureText(label).width;
          const pw = tw + 2.2;
          const ph = 2.7;
          const px = a.dude.x - pw * 0.5;
          const py = a.dude.y + 1.1;
          ctx.fillStyle = "rgba(7, 13, 22, 0.82)";
          ctx.fillRect(px, py, pw, ph);
          ctx.fillStyle = a.isWonderkid ? "#facc15" : c1;
          ctx.fillRect(px, py, 0.55, ph);
          ctx.fillStyle = a.isWonderkid ? "#fde047" : "#f8fafc";
          ctx.fillText(label, a.dude.x + 0.2, py + 2.05);
          ctx.restore();
        }
      }

      // Desenha as bolas de treino
      for (const b of balls) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(b.x, b.y + 0.45, 1.1, 0.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(b.x, b.y - b.h, 1.05, 0, Math.PI * 2);
        ctx.fillStyle = "#070d14";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x, b.y - b.h, 0.82, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.restore();
      }

      // Desenha popups flutuantes de +XP / Treino
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        const age = now - p.born;
        if (age >= p.dur) {
          popups.splice(i, 1);
          continue;
        }
        const k = age / p.dur;
        const py = p.y - k * 6.5;
        const alpha = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.font = "900 2.35px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        const tw = ctx.measureText(p.text).width;
        const bx = p.x - tw * 0.5 - 1.4;
        const by = py - 2.4;
        ctx.fillStyle = "rgba(8, 14, 26, 0.88)";
        ctx.fillRect(bx, by, tw + 2.8, 3.3);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.35;
        ctx.strokeRect(bx, by, tw + 2.8, 3.3);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, py);
        ctx.restore();
      }

      ctx.restore();

      // 5. Partículas atmosféricas douradas (vaga-lumes / brasas estilo Sea of Stars)
      ctx.save();
      for (const f of fireflies) {
        f.y -= f.speed;
        f.x += Math.sin(now * 0.0015 + f.phase) * 0.35;
        if (f.y < 12) f.y = CH - 16;
        const glow = 0.35 + 0.45 * Math.sin(now * 0.004 + f.phase);
        ctx.fillStyle = `rgba(253, 224, 71, ${glow.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 6. Vinheta cinematográfica nas bordas
      const vig = ctx.createLinearGradient(0, 0, 0, CH);
      vig.addColorStop(0, "rgba(6, 10, 19, 0.38)");
      vig.addColorStop(0.25, "rgba(6, 10, 19, 0)");
      vig.addColorStop(0.72, "rgba(6, 10, 19, 0)");
      vig.addColorStop(1, "rgba(6, 10, 19, 0.78)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, CW, CH);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("click", handleCanvasClick);
    };
  }, [artworkSrc, site, timeOfDay, rosterPlayers, c1, c2, c3, onPlayerClick]);

  return (
    <div
      className="hd2d-live-canvas-wrap"
      style={{
        width: "100%",
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: 14,
        background: "#070c16",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: "cover",
          cursor: "pointer",
        }}
        title="Toque nos jogadores em campo para incentivar o treino!"
      />
      {selectedName && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: "rgba(10, 16, 28, 0.88)",
            border: "1px solid rgba(250, 204, 21, 0.55)",
            color: "#fde047",
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.04em",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
          }}
        >
          ⚡ {selectedName}
        </div>
      )}
    </div>
  );
}
