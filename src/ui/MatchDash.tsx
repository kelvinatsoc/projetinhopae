// Painel da partida (aba de lances / histórico): momentum, posse ao longo do jogo, números do jogo,
// zonas de ataque e notas ao vivo — tudo a partir do que o motor já anota (MatchSim.stats / .extra).
// E a barra de instruções rápidas (shouts) estilo FM, com um toque.
import { useState } from "react";
import { threatBy } from "../engine/assistant";
import { LANE, type MatchSim } from "../engine/match";
import { shortName } from "../engine/player";
import { POS_GROUP } from "../engine/positions";
import { SHOUTS, shoutDef } from "../engine/shouts";
import type { World } from "../engine/types";
import { visibleColor, Icon } from "./components";
import { haptic } from "./haptics";
import "./matchDash.css";

const rgb = (c: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
/** Cores parecidas demais para distinguir os dois times num gráfico (vermelho x vermelho). */
function similar(a: string, b: string): boolean {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return a.toLowerCase() === b.toLowerCase();
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 110;
}

/** Cores dos dois times nos gráficos: se forem parecidas, o visitante usa outra cor dele (ou cinza). */
export function sideColors(sim: MatchSim): [string, string] {
  const h = visibleColor(sim.sides[0].club.colors);
  const a = visibleColor(sim.sides[1].club.colors);
  if (!similar(h, a)) return [h, a];
  const alt = sim.sides[1].club.colors.find((c) => {
    const x = rgb(c);
    return x && !similar(h, c) && x[0] + x[1] + x[2] > 150;
  });
  return [h, alt ?? (similar(h, "#9aa5a0") ? "#60a5fa" : "#9aa5a0")];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------- momentum
/** Barras minuto a minuto (média de 3 minutos): para cima o mandante, para baixo o visitante. */
function Momentum({ sim, colors }: { sim: MatchSim; colors: [string, string] }) {
  const tl = sim.extra.timeline;
  const W = 300, H = 64, mid = H / 2;
  const len = Math.max(96, tl.length);
  const bw = W / len;
  const vals = tl.map((_, i) => {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - 2); k <= i; k++) { const x = tl[k]; s += x.a === 0 ? x.d : x.a === 1 ? -x.d : 0; n++; }
    return s / n;
  });
  const max = Math.max(0.9, ...vals.map(Math.abs));
  const ht = tl.findIndex((x) => x.h === 2);
  return (
    <svg className="md-mom" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Momentum do jogo: barras para cima são do mandante, para baixo do visitante">
      <line x1="0" x2={W} y1={mid} y2={mid} className="md-axis" />
      {ht > 0 && <line x1={ht * bw} x2={ht * bw} y1="2" y2={H - 2} className="md-ht" />}
      {vals.map((v, i) => {
        const h = (Math.abs(v) / max) * (mid - 3);
        return <rect key={i} x={i * bw} width={Math.max(0.6, bw - 0.4)} y={v >= 0 ? mid - h : mid} height={Math.max(0.5, h)} fill={v >= 0 ? colors[0] : colors[1]} />;
      })}
      {tl.map((x, i) => (x.g ? <circle key={`g${i}`} cx={i * bw + bw / 2} cy={x.a === 0 ? 5 : H - 5} r="3.2" className="md-goal" /> : null))}
    </svg>
  );
}

/** Posse nos últimos 10 minutos ao longo do jogo (linha do mandante; 50% no meio). */
function PossessionLine({ sim, colors }: { sim: MatchSim; colors: [string, string] }) {
  const tl = sim.extra.timeline;
  const W = 300, H = 44;
  const len = Math.max(96, tl.length);
  const pts: string[] = [];
  let home = 0, tot = 0;
  const q: (0 | 1 | null)[] = [];
  tl.forEach((x, i) => {
    q.push(x.a);
    if (x.a === 0) home++;
    if (x.a != null) tot++;
    if (q.length > 10) { const o = q.shift(); if (o === 0) home--; if (o != null) tot--; }
    const share = tot ? home / tot : 0.5;
    pts.push(`${((i + 0.5) * W) / len},${(H - 4 - share * (H - 8)).toFixed(1)}`);
  });
  return (
    <svg className="md-poss" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Posse de bola ao longo do jogo">
      <rect x="0" y="0" width={W} height={H / 2} fill={colors[0]} opacity="0.07" />
      <rect x="0" y={H / 2} width={W} height={H / 2} fill={colors[1]} opacity="0.07" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="md-axis" strokeDasharray="3 3" />
      {pts.length > 1 && <polyline points={pts.join(" ")} fill="none" stroke={colors[0]} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
    </svg>
  );
}

// ---------------------------------------------------------------- números
function StatRow({ label, a, b, fmt, colors, invert }: { label: string; a: number; b: number; fmt?: (x: number) => string; colors: [string, string]; invert?: boolean }) {
  const t = a + b;
  const pa = t ? (a / t) * 100 : 50;
  const lead = invert ? (a < b ? 0 : a > b ? 1 : -1) : a > b ? 0 : a < b ? 1 : -1;
  const f = fmt ?? ((x: number) => String(x));
  return (
    <div className="md-row">
      <b className={lead === 0 ? "lead" : ""}>{f(a)}</b>
      <span>{label}</span>
      <b className={lead === 1 ? "lead" : ""}>{f(b)}</b>
      <div className="md-split" aria-hidden="true">
        <i style={{ width: `${t ? pa : 50}%`, background: colors[0], opacity: t ? 1 : 0.25 }} />
        <i style={{ width: `${t ? 100 - pa : 50}%`, background: colors[1], opacity: t ? 1 : 0.25 }} />
      </div>
    </div>
  );
}

function Numbers({ sim, colors }: { sim: MatchSim; colors: [string, string] }) {
  const s = sim.stats, x = sim.extra;
  const tot = s.poss[0] + s.poss[1] || 1;
  const p0 = Math.round((s.poss[0] / tot) * 100);
  const acc = (i: 0 | 1) => (x.passes[i] ? Math.round((x.passesOk[i] / x.passes[i]) * 100) : 0);
  const pc = (v: number) => `${v}%`;
  return (
    <div className="md-nums">
      <StatRow label="Posse" a={p0} b={100 - p0} fmt={pc} colors={colors} />
      <StatRow label="Finalizações" a={s.shots[0]} b={s.shots[1]} colors={colors} />
      <StatRow label="No alvo" a={s.onTarget[0]} b={s.onTarget[1]} colors={colors} />
      <StatRow label="Gols esperados (xG)" a={r2(s.xg[0])} b={r2(s.xg[1])} fmt={(v) => v.toFixed(2).replace(".", ",")} colors={colors} />
      <StatRow label="Passes certos" a={acc(0)} b={acc(1)} fmt={pc} colors={colors} />
      <StatRow label="Desarmes" a={x.tackles[0]} b={x.tackles[1]} colors={colors} />
      <StatRow label="Defesas do goleiro" a={x.saves[0]} b={x.saves[1]} colors={colors} />
      <StatRow label="Escanteios" a={s.corners[0]} b={s.corners[1]} colors={colors} />
      <StatRow label="Faltas" a={s.fouls[0]} b={s.fouls[1]} colors={colors} invert />
      <StatRow label="Impedimentos" a={x.offsides[0]} b={x.offsides[1]} colors={colors} invert />
      <div className="md-row md-cards">
        <b>{s.yellows[0] ? `🟨${s.yellows[0]}` : "–"}{s.reds[0] ? ` 🟥${s.reds[0]}` : ""}</b>
        <span>Cartões</span>
        <b>{s.yellows[1] ? `🟨${s.yellows[1]}` : "–"}{s.reds[1] ? ` 🟥${s.reds[1]}` : ""}</b>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- zonas
const LANES = ["Esquerda", "Centro", "Direita"];

/** Mini campo (atacando para cima): calor por terço × corredor, e a divisão pelos corredores. */
function Zones({ sim, side, color, title }: { sim: MatchSim; side: 0 | 1; color: string; title: string }) {
  const z = sim.extra.zones[side];
  const max = Math.max(1, ...z);
  const lane = [0, 1, 2].map((l) => z[l * 3] + z[l * 3 + 1] + z[l * 3 + 2]);
  const lt = lane.reduce((a, b) => a + b, 0) || 1;
  const att = [0, 1, 2].map((l) => z[l * 3 + 2]);
  const at = att.reduce((a, b) => a + b, 0) || 1;
  const top = att.indexOf(Math.max(...att));
  return (
    <div className="md-zone">
      <div className="md-zone-title tiny">{title}</div>
      <div className="md-pitch" role="img" aria-label={`${title}: ${LANES.map((n, l) => `${n} ${Math.round((lane[l] / lt) * 100)}%`).join(", ")}`}>
        {[2, 1, 0].map((third) => [0, 1, 2].map((l) => {
          const v = z[l * 3 + third] / max;
          return <i key={`${third}${l}`} style={{ background: color, opacity: 0.08 + 0.8 * v }} />;
        }))}
        <span className="md-pitch-line" />
      </div>
      <div className="md-lanes tiny">
        {LANES.map((n, l) => <span key={n} className={l === top && at > 3 ? "hot" : ""}><b>{Math.round((lane[l] / lt) * 100)}%</b>{n.slice(0, 3)}</span>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- jogadores
interface PRow { id: number; pos: string; name: string; r: number; cond: number; y: boolean; red: boolean; off: boolean; sh: number; tk: number; alert: string | null }

function playerRows(sim: MatchSim, w: World, side: 0 | 1): PRow[] {
  const S = sim.sides[side];
  const reds = new Set(sim.events.filter((e) => e.type === "red" && e.side === side).map((e) => e.pid));
  return S.played.map((id) => {
    const p = w.players[id];
    const k = S.onPitch.indexOf(id);
    const r = S.rating.get(id) ?? 6;
    const st = sim.extra.pl.get(id);
    const y = S.yellows.has(id), red = reds.has(id), off = k < 0;
    const pos = k >= 0 ? S.slots[k] : p.pos;
    let alert: string | null = null;
    if (!off) {
      if (r < 5.8) alert = "jogando mal";
      else if (p.cond < 60) alert = "esgotado";
      else if (y && POS_GROUP[pos] !== "ATT") alert = "pendurado";
    }
    return { id, pos, name: shortName(p.name), r, cond: p.cond, y, red, off, sh: st?.sh ?? 0, tk: st?.tk ?? 0, alert };
  });
}

function Players({ sim, w, side }: { sim: MatchSim; w: World; side: 0 | 1 }) {
  const rows = playerRows(sim, w, side);
  const on = rows.filter((x) => !x.off).sort((a, b) => a.r - b.r || a.cond - b.cond);
  const out = rows.filter((x) => x.off);
  return (
    <div className="md-players" role="list">
      {[...on, ...out].map((x) => (
        <div key={x.id} role="listitem" className={`md-pl${x.alert ? " alert" : ""}${x.off ? " off" : ""}`}>
          <span className="md-pos">{x.pos}</span>
          <span className="md-name ellipsis">{x.name}{x.y && !x.red ? <i className="md-cd y" aria-label="amarelo" /> : null}{x.red ? <i className="md-cd r" aria-label="expulso" /> : null}</span>
          <span className="md-extra tiny">{x.alert ? <em>{x.alert}</em> : x.off ? (x.red ? "expulso" : "saiu") : `${x.sh ? `${x.sh} fin. ` : ""}${x.tk ? `${x.tk} des.` : ""}`}</span>
          <span className="md-cond" aria-label={`condição ${Math.round(x.cond)}%`}><i style={{ width: `${Math.max(0, Math.min(100, x.cond))}%`, background: x.cond > 75 ? "var(--ok)" : x.cond > 60 ? "var(--warn)" : "var(--danger)" }} /></span>
          <b className={`md-rt ${x.r >= 7 ? "good" : x.r < 6 ? "bad" : ""}`}>{Math.min(10, x.r).toFixed(1)}</b>
        </div>
      ))}
    </div>
  );
}

/** Quem do adversário mais assusta (jogo todo). */
function Threats({ sim, side }: { sim: MatchSim; side: 0 | 1 }) {
  const opp = (1 - side) as 0 | 1;
  const by = new Map<number, number>();
  for (const t of sim.extra.timeline) if (t.a === opp && t.p != null && t.v) by.set(t.p, (by.get(t.p) ?? 0) + t.v);
  const list = [...by].filter(([id]) => sim.sides[opp].onPitch.includes(id)).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const recent = threatBy(sim, opp, 25).top;
  if (!list.length) return null;
  const O = sim.sides[opp];
  return (
    <div className="md-threats tiny">
      <span className="muted">Quem mais assusta:</span>
      {list.map(([id, v]) => {
        const k = O.onPitch.indexOf(id);
        const lane = k >= 0 ? LANE[O.slots[k]] : 1;
        return <span key={id} className={`md-threat${recent?.pid === id ? " hot" : ""}`}>{O.slots[k]} {sim.name(id)} <b>{v.toFixed(2).replace(".", ",")}</b>{lane !== 1 ? (lane === 0 ? " ◂" : " ▸") : ""}</span>;
      })}
      {sim.sides[side].mark != null && <span className="md-threat mark">🛡️ marcando {sim.name(sim.sides[side].mark)}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- painel
export function MatchDashboard({ sim, w, userSide }: { sim: MatchSim; w: World; userSide: 0 | 1 }) {
  const colors = sideColors(sim);
  const [who, setWho] = useState<0 | 1>(userSide);
  const [H, A] = sim.sides;
  return (
    <div className="md">
      <section className="md-card">
        <div className="md-head"><b>Momentum</b><span className="tiny muted">pressão minuto a minuto · ⚪ gol</span></div>
        <div className="md-legend tiny"><span><i style={{ background: colors[0] }} />{H.club.abbr}</span><span><i style={{ background: colors[1] }} />{A.club.abbr}</span></div>
        <Momentum sim={sim} colors={colors} />
        <div className="md-head mt4"><b>Posse ao longo do jogo</b><span className="tiny muted">últimos 10 min</span></div>
        <PossessionLine sim={sim} colors={colors} />
      </section>

      <section className="md-card">
        <div className="md-teams tiny"><b style={{ color: colors[0] }}>{H.club.abbr}</b><span className="muted">Números do jogo</span><b style={{ color: colors[1] }}>{A.club.abbr}</b></div>
        <Numbers sim={sim} colors={colors} />
      </section>

      <section className="md-card">
        <div className="md-head"><b>Zonas de ataque</b><span className="tiny muted">por onde cada time chega · ataque ↑</span></div>
        <div className="md-zones">
          <Zones sim={sim} side={0} color={colors[0]} title={H.club.abbr} />
          <Zones sim={sim} side={1} color={colors[1]} title={A.club.abbr} />
        </div>
        <Threats sim={sim} side={userSide} />
      </section>

      <section className="md-card">
        <div className="md-head">
          <b>Notas ao vivo</b>
          <div className="seg md-who">
            <button className={who === 0 ? "active" : ""} onClick={() => setWho(0)}>{H.club.abbr}</button>
            <button className={who === 1 ? "active" : ""} onClick={() => setWho(1)}>{A.club.abbr}</button>
          </div>
        </div>
        <div className="tiny muted">Pior nota primeiro · barra = fôlego · <i className="md-cd y" /> amarelo</div>
        <Players sim={sim} w={w} side={who} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- instruções rápidas
/** Barra de instruções rápidas (shouts): um toque aplica; tocar de novo na ativa volta ao plano. */
export function ShoutBar({ sim, side, onChange, inSheet }: { sim: MatchSim; side: 0 | 1; onChange?: () => void; inSheet?: boolean }) {
  const [, force] = useState(0);
  const S = sim.sides[side];
  const cur = S.shout ?? null;
  const set = (id: (typeof SHOUTS)[number]["id"] | null) => {
    sim.applyShout(side, id);
    haptic("tap");
    force((x) => x + 1);
    onChange?.();
  };
  const lead = S.goals - sim.sides[1 - side].goals;
  return (
    <div className={`md-shouts${inSheet ? " in-sheet" : ""}`} role="group" aria-label="Instruções rápidas">
      <div className="md-shouts-row">
        {SHOUTS.map((d) => {
          const on = cur === d.id;
          const idle = d.id === "cera" && !(lead > 0 && sim.minute >= 70);
          return (
            <button key={d.id} className={`md-shout${on ? " on" : ""}${idle ? " idle" : ""}`} aria-pressed={on} title={d.hint} onClick={() => set(on ? null : d.id)}>
              <span className="md-shout-ic" aria-hidden="true"><Icon name={d.icon} size={15} /></span>
              <span>{d.label}</span>
            </button>
          );
        })}
      </div>
      <div className="tiny muted md-shout-hint">
        {cur ? <>{shoutDef(cur)!.hint} <button className="md-link" onClick={() => set(null)}>Voltar ao plano</button></> : "Toque numa instrução: vale só nesta partida."}
        {S.mark != null && <> · <Icon name="shield" size={12} /> marcando {sim.name(S.mark)} <button className="md-link" onClick={() => { sim.setMark(side, null); force((x) => x + 1); onChange?.(); }}>desfazer</button></>}
      </div>
    </div>
  );
}

