/** Peças de UI com a identidade da competição: faixa de cabeçalho, vinheta e festa do título. */
import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { COMP_META } from "../engine/competitions";
import type { Club } from "../engine/types";
import { CompLogo, Crest } from "./components";
import { compTheme, confettiColors, themeClass, themeVars } from "./compThemes";
import { haptic } from "./haptics";
import { championParty } from "./audio";
import { TrophyImg, TrophyLive } from "./Trophy";
import { trophySpec } from "./trophies";

/** Faixa no topo de telas de competição (tabela, chaveamento, pré-jogo). */
export function CompHeader({ id, title, sub, right, children }: { id: string; title?: string; sub?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  const meta = COMP_META[id];
  const t = compTheme(id, meta?.color);
  return (
    <div className={`ct-head ${themeClass(t)}`} style={themeVars(t)}>
      <div className="ct-head-row">
        <span className="ct-logo"><CompLogo id={id} size={34} /><i aria-hidden="true">{t.trophy}</i></span>
        <div className="ct-head-txt">
          <b className="ct-title">{title ?? meta?.name ?? id}</b>
          {sub && <span className="ct-sub">{sub}</span>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Vinheta de abertura da competição (≈1,6 s; toque pula). */
export function CompBumper({ id, onDone }: { id: string; onDone: () => void }) {
  const meta = COMP_META[id];
  const t = compTheme(id, meta?.color);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const tm = window.setTimeout(onDone, reduced ? 500 : 1700);
    return () => window.clearTimeout(tm);
  }, []);
  return (
    <div className={`ct-bumper ${themeClass(t)}`} style={themeVars(t)} onClick={onDone} role="presentation">
      <div className="ct-bumper-bg" />
      <div className="ct-bumper-band">
        <CompLogo id={id} size={56} />
        <div>
          <b className="ct-title">{meta?.name ?? id}</b>
          {t.motto && <span className="ct-motto">{t.motto}</span>}
        </div>
      </div>
    </div>
  );
}

const CONF_N = 90;

/** Fogos de artifício num canvas 2D, nas cores do clube. */
function Fireworks({ colors }: { colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    type P = { x: number; y: number; vx: number; vy: number; life: number; c: string; rocket?: boolean; ty?: number };
    let parts: P[] = [];
    let raf = 0, last = performance.now(), next = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
    resize();
    const burst = (x: number, y: number, c: string) => {
      const n = 46;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, sp = (60 + Math.random() * 110) * dpr;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 + Math.random() * 0.5, c: Math.random() < 0.25 ? "#ffffff" : c });
      }
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      next -= dt;
      if (next <= 0) {
        next = 0.45 + Math.random() * 0.6;
        const x = cv.width * (0.15 + Math.random() * 0.7);
        parts.push({ x, y: cv.height, vx: (Math.random() - 0.5) * 30 * dpr, vy: -(320 + Math.random() * 160) * dpr, life: 3, c: colors[Math.floor(Math.random() * colors.length)], rocket: true, ty: cv.height * (0.12 + Math.random() * 0.3) });
      }
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = "rgba(0,0,0,0.22)";
      g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = "lighter";
      const alive: P[] = [];
      for (const p of parts) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.rocket) {
          if (p.y <= (p.ty ?? 0)) { burst(p.x, p.y, p.c); continue; }
        } else { p.vy += 90 * dpr * dt; p.vx *= 0.985; p.vy *= 0.985; p.life -= dt * 0.8; }
        if (p.life <= 0) continue;
        g.globalAlpha = Math.max(0, Math.min(1, p.life));
        g.fillStyle = p.c;
        g.beginPath();
        g.arc(p.x, p.y, (p.rocket ? 2.2 : 1.8) * dpr, 0, Math.PI * 2);
        g.fill();
        alive.push(p);
      }
      g.globalAlpha = 1;
      parts = alive;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [colors.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="ct-fireworks" aria-hidden="true" />;
}

/** Jogador estilizado com o uniforme do clube, braços para o alto. */
function Celebrant({ c1, c2, skin, x, scale, delay, lift }: { c1: string; c2: string; skin: string; x: number; scale: number; delay: number; lift?: boolean }) {
  return (
    <svg className={`ct-player${lift ? " lifter" : ""}`} viewBox="0 0 60 120" style={{ left: `${x}%`, height: `${scale * 100}%`, animationDelay: `${delay}s` }} aria-hidden="true">
      <g className="arms">
        <path d="M18 40 L8 6" stroke={c1} strokeWidth="8" strokeLinecap="round" />
        <path d="M42 40 L52 6" stroke={c1} strokeWidth="8" strokeLinecap="round" />
        <circle cx="8" cy="5" r="4" fill={skin} />
        <circle cx="52" cy="5" r="4" fill={skin} />
      </g>
      <circle cx="30" cy="22" r="10" fill={skin} />
      <path d="M15 36 Q30 30 45 36 L44 74 L16 74 Z" fill={c1} />
      <path d="M26 33 L34 33 L34 74 L26 74 Z" fill={c2} opacity="0.9" />
      <path d="M16 74 L44 74 L45 88 L15 88 Z" fill={c2} />
      <path d="M19 88 L27 88 L26 116 L19 116 Z" fill={skin} />
      <path d="M33 88 L41 88 L41 116 L34 116 Z" fill={skin} />
      <path d="M18 104 L27 104 L27 116 L18 116 Z M33 104 L42 104 L42 116 L33 116 Z" fill={c1} />
    </svg>
  );
}

/**
 * Festa do título: a logo do campeonato entra com brilho e partículas, confete e fogos nas cores
 * do clube, os jogadores levantam a taça real da competição e a torcida explode (audio.ts).
 */
/** Visualização 3D da cerimônia no estádio com troféu oficial e invasão de campo. */
function StadiumCelebrationCanvas({ id, club, season }: { id: string; club: Club; season: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let stop: (() => void) | null = null;
    let alive = true;
    void import("./match3d/StadiumCelebration").then((m) => {
      if (alive && ref.current) {
        stop = m.mountStadiumCelebration(ref.current, {
          club: { id: club.id, name: club.name, colors: club.colors, abbr: club.abbr },
          comp: id,
          season,
          reduced: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        });
      }
    }).catch(() => undefined);
    return () => { alive = false; stop?.(); };
  }, [id, club, season]);

  return <canvas ref={ref} className="stadium-ceremony-canvas" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1 }} />;
}

export function TitleCelebration({ id, club, season, onClose }: { id: string; club: Club; season: number; onClose: () => void }) {
  const meta = COMP_META[id];
  const t = compTheme(id, meta?.color);
  const [mode3d, setMode3d] = useState(true);

  useEffect(() => {
    haptic("success");
    const stop = championParty();
    return stop;
  }, []);

  const trophyName = trophySpec(id).name;
  const clubCols = useMemo(() => [...new Set([...club.colors, t.accent, "#ffffff"])], [club.colors, t.accent]);
  const cols = useMemo(() => [...clubCols, ...confettiColors(t).slice(0, 1)], [clubCols, t]);
  const bits = useMemo(() => Array.from({ length: CONF_N }, (_, i) => ({
    left: Math.random() * 100,
    delay: 1 + Math.random() * 2.4,
    dur: 2.4 + Math.random() * 2.2,
    rot: Math.random() * 360,
    c: cols[i % cols.length],
    w: 6 + Math.random() * 6,
  })), [id, cols]);
  const sparks = useMemo(() => Array.from({ length: 24 }, (_, i) => ({ a: (i / 24) * 360, d: 90 + Math.random() * 70, s: 3 + Math.random() * 4 })), []);
  const c1 = club.colors[0] ?? "#22c55e";
  const c2 = club.colors[1] ?? "#ffffff";
  const skins = ["#8d5524", "#c68642", "#e0ac69", "#5c3a1e", "#f1c27d"];

  return (
    <div className={`ct-title-won ${themeClass(t)}`} style={themeVars(t)} role="dialog" aria-label={`Campeão: ${meta?.name ?? id}`}>
      {mode3d ? (
        <div style={{ position: "absolute", inset: 0, zIndex: 2, overflow: "hidden" }}>
          <StadiumCelebrationCanvas id={id} club={club} season={season} />
          <div style={{
            position: "absolute", top: "calc(env(safe-area-inset-top) + 14px)", left: "50%", transform: "translateX(-50%)",
            background: "rgba(9, 13, 22, 0.88)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255, 255, 255, 0.16)", borderRadius: "22px", padding: "8px 18px",
            display: "flex", alignItems: "center", gap: "12px", zIndex: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.6)"
          }}>
            <CompLogo id={id} size={36} fallback={<Crest club={club} size={36} />} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
              <b style={{ color: "#ffd54f", fontFamily: "var(--display)", fontSize: "17px", textTransform: "uppercase", letterSpacing: "1px", lineHeight: 1.1 }}>É CAMPEÃO!</b>
              <small style={{ color: "#ffffff", fontSize: "12px", fontWeight: 700, opacity: 0.9 }}>{trophyName} · {season}</small>
            </div>
            <Crest club={club} size={32} />
          </div>

          <div style={{
            position: "absolute", bottom: "calc(env(safe-area-inset-bottom) + 20px)", left: "16px", right: "16px",
            display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, gap: "10px"
          }}>
            <button
              onClick={() => setMode3d(false)}
              style={{
                background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", padding: "8px 14px", borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.15)", color: "#cbd5e1", fontSize: "12px", fontWeight: 700, cursor: "pointer"
              }}
            >
              🔄 Modo 2D
            </button>
            <button className="btn primary" onClick={onClose} style={{
              minWidth: "140px", height: "46px", borderRadius: "999px", fontSize: "14.5px", fontWeight: 900,
              boxShadow: "0 6px 24px rgba(200, 244, 60, 0.35)"
            }}>
              Continuar ❯❯
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="ct-tw-bg" />
          <div className="ct-tw-flash" aria-hidden="true" />
          <Fireworks colors={clubCols} />
          <div className="ct-confetti" aria-hidden="true">
            {bits.map((b, i) => (
              <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.c, width: b.w, height: b.w * 0.45, transform: `rotate(${b.rot}deg)` }} />
            ))}
          </div>
          <div className="ct-tw-body">
            <div className="ct-tw-logo">
              <span className="ct-tw-glow" aria-hidden="true" />
              <span className="ct-tw-sparks" aria-hidden="true">
                {sparks.map((s, i) => <i key={i} style={{ "--a": `${s.a}deg`, "--d": `${s.d}px`, width: s.s, height: s.s } as React.CSSProperties} />)}
              </span>
              <CompLogo id={id} size={92} fallback={<TrophyImg comp={id} size={92} />} />
            </div>
            <div className="ct-tw-kicker">{t.motto || "Campeão!"}</div>
            <b className="ct-title ct-tw-name">{meta?.name ?? id} {season}</b>
            <div className="ct-tw-stage">
              <div className="ct-tw-trophy3d"><TrophyLive comp={id} size={150} /></div>
              <div className="ct-tw-squad">
                <Celebrant c1={c1} c2={c2} skin={skins[0]} x={4} scale={0.62} delay={1.9} />
                <Celebrant c1={c1} c2={c2} skin={skins[1]} x={20} scale={0.74} delay={1.75} />
                <Celebrant c1={c1} c2={c2} skin={skins[3]} x={60} scale={0.74} delay={1.8} />
                <Celebrant c1={c1} c2={c2} skin={skins[4]} x={76} scale={0.62} delay={1.95} />
                <Celebrant c1={c1} c2={c2} skin={skins[2]} x={40} scale={0.9} delay={1.6} lift />
              </div>
            </div>
            <div className="ct-tw-club"><Crest club={club} size={48} /><span>{club.name}</span></div>
            <div className="ct-tw-champ">É CAMPEÃO!</div>
            <div className="ct-tw-cup tiny">{trophyName}</div>
          </div>
          <div className="sticky-cta ct-tw-cta" style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button className="btn ghost" onClick={() => setMode3d(true)}>🏟️ Ver Estádio 3D</button>
            <button className="btn primary block lg" onClick={onClose}>Continuar</button>
          </div>
        </>
      )}
    </div>
  );
}

const SEEN_KEY = "ldb.titlesSeen";
export function titlesSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") as string[]); } catch { return new Set(); }
}
export function markTitleSeen(key: string) {
  try {
    const s = titlesSeen();
    s.add(key);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-200)));
  } catch { /* sem armazenamento: a festa pode repetir, sem problema */ }
}
