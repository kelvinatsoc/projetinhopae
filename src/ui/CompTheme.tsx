/** Peças de UI com a identidade da competição: faixa de cabeçalho, vinheta e festa do título. */
import { useEffect, useMemo, type ReactNode } from "react";
import { COMP_META } from "../engine/competitions";
import type { Club } from "../engine/types";
import { CompLogo, Crest } from "./components";
import { compTheme, confettiColors, themeClass, themeVars } from "./compThemes";
import { haptic } from "./haptics";

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

const CONF_N = 70;

/** Tela de levantamento de taça com confete nas cores da competição. */
export function TitleCelebration({ id, club, season, onClose }: { id: string; club: Club; season: number; onClose: () => void }) {
  const meta = COMP_META[id];
  const t = compTheme(id, meta?.color);
  const cols = confettiColors(t);
  const bits = useMemo(() => Array.from({ length: CONF_N }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 2.4,
    dur: 2.4 + Math.random() * 2.2,
    rot: Math.random() * 360,
    c: cols[i % cols.length],
    w: 6 + Math.random() * 6,
  })), [id]);
  useEffect(() => { haptic("success"); }, []);
  return (
    <div className={`ct-title-won ${themeClass(t)}`} style={themeVars(t)} role="dialog" aria-label={`Campeão: ${meta?.name ?? id}`}>
      <div className="ct-tw-bg" />
      <div className="ct-confetti" aria-hidden="true">
        {bits.map((b, i) => (
          <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.c, width: b.w, height: b.w * 0.45, transform: `rotate(${b.rot}deg)` }} />
        ))}
      </div>
      <div className="ct-tw-body">
        <div className="ct-tw-kicker">{t.motto || "Campeão!"}</div>
        <div className="ct-tw-trophy" aria-hidden="true">{t.trophy}</div>
        <CompLogo id={id} size={64} />
        <b className="ct-title ct-tw-name">{meta?.name ?? id} {season}</b>
        <div className="ct-tw-club"><Crest club={club} size={54} /><span>{club.name}</span></div>
        <div className="ct-tw-champ">É CAMPEÃO!</div>
      </div>
      <div className="sticky-cta ct-tw-cta">
        <button className="btn primary block lg" onClick={onClose}>Continuar</button>
      </div>
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
