import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "../../engine/calendar";
import { COMP_META, fixtureById, STAGE_NAMES, tieAggregate } from "../../engine/competitions";
import { finishUserMatch, loadRng, saveRng } from "../../engine/game";
import { lineupStrength, validLineup, autoLineup } from "../../engine/lineup";
import { MatchSim } from "../../engine/match";
import { shortName } from "../../engine/player";
import { MENTALITY_NAMES, ovrAt } from "../../engine/positions";
import type { Fixture, MatchEvent, MatchResult, World } from "../../engine/types";
import { forceBack, getWorld, push, update, useWorld } from "../../store";
import { autosave, goToMatch } from "../actions";
import { goalRoar, loadMedia, ooh, playCustomGoal, setCustomGoalAudio, soundEnabled, startCrowd, stopCrowd, whistle } from "../audio";
import { Avatar, Bar, CompLogo, Crest, Ovr, PosBadge, Sheet, visibleColor } from "../components";
import { LiveAdvice, PreMatchAdvice } from "../Assistant";
import { GoalCelebration, MatchView } from "../MatchView";
import { Pitch } from "./Squad";

function stageLabel(w: World, f: Fixture) {
  const comp = w.comps[f.comp];
  if (f.stage === "league") return `Rodada ${f.round}`;
  if (f.stage === "group") return `${comp?.groups[f.group ?? 0]?.name ?? "Grupos"} · ${f.round}ª rodada`;
  return `${STAGE_NAMES[f.stage]}${f.leg ? ` · ${f.leg === 1 ? "ida" : "volta"}` : ""}`;
}

export function PreMatchScreen() {
  const w = useWorld();
  const f = w.pendingMatch != null ? fixtureById(w, w.pendingMatch) : undefined;
  if (!f) return <div className="page"><div className="empty">Nenhum jogo pendente.</div></div>;
  const user = w.clubs[w.userClubId];
  const oppId = f.home === user.id ? f.away : f.home;
  const opp = w.clubs[oppId];
  const myLineup = validLineup(w, user, f.comp);
  const oppLineup = autoLineup(w, opp, f.comp);
  const mine = Math.round(lineupStrength(w, user, myLineup));
  const theirs = Math.round(lineupStrength(w, opp, oppLineup));
  const out = user.players.map((id) => w.players[id]).filter((p) => p && !p.youth && (p.injury > 0 || (p.bans[f.comp] ?? 0) > 0));
  const meta = COMP_META[f.comp];
  const tie = f.tie ? w.comps[f.comp].ties.find((t) => t.id === f.tie) : undefined;
  const agg = tie && f.leg === 2 ? tieAggregate(w, tie) : null;

  return (
    <div className="page">
      <div className="hero" style={{ background: `linear-gradient(135deg, ${meta.color}, #0b1a12)` }}>
        <div className="row small gap8"><CompLogo id={f.comp} size={22} /><span><b>{meta.name}</b> · {stageLabel(w, f)}</span></div>
        <div className="row" style={{ justifyContent: "space-around", margin: "12px 0" }}>
          {[f.home, f.away].map((id) => (
            <div key={id} className="col center" style={{ alignItems: "center", width: 130 }}>
              <Crest club={w.clubs[id]} size={60} />
              <b>{w.clubs[id].name}</b>
              <span className="small">força {id === user.id ? mine : theirs}</span>
            </div>
          ))}
        </div>
        <div className="small">📅 {formatDate(w.season, f.day)} · 🏟️ {f.neutral ? "Campo neutro" : w.clubs[f.home].stadium}</div>
        {agg && tie && <div className="small mt8">Jogo de ida: {w.clubs[tie.a].name} {agg.a} × {agg.b} {w.clubs[tie.b].name}{tie.advantage ? ` · ${w.clubs[tie.advantage].name} joga pelo empate no agregado` : " · empate no agregado vai para os pênaltis"}</div>}
      </div>

      <PreMatchAdvice fixtureId={f.id} />

      {out.length > 0 && (
        <div className="card flat small" style={{ borderColor: "var(--warn)" }}>
          ⚠️ Desfalques: {out.map((p) => `${p.name} (${p.injury > 0 ? "lesionado" : "suspenso"})`).join(", ")}
        </div>
      )}

      <div className="row">
        <h3 className="grow">Seu time · {user.tactic.formation} · {MENTALITY_NAMES[user.tactic.mentality]}</h3>
        <button className="btn sm" onClick={() => push({ name: "tactics" })}>Ajustar</button>
      </div>
      <Pitch w={w} club={user} lineup={myLineup} sel={null} />

      <div className="card">
        <h3>Provável time do {opp.name} ({opp.tactic.formation})</h3>
        <div className="row wrap gap8 mt8 small">
          {oppLineup.starters.filter((x): x is number => x != null).map((id) => {
            const p = w.players[id];
            return <span key={id} className="tag">{p.pos} {shortName(p.name)} <b>{p.ovr}</b></span>;
          })}
        </div>
      </div>

      <div className="grid2" style={{ position: "sticky", bottom: "calc(var(--nav-h) + 8px + env(safe-area-inset-bottom))" }}>
        <button className="btn" onClick={() => goToMatch(true)}>⏩ Resultado rápido</button>
        <button className="btn primary" onClick={() => goToMatch(false)}>▶ Assistir ao jogo</button>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

const SPEEDS = [{ l: "1x", ms: 650 }, { l: "2x", ms: 320 }, { l: "4x", ms: 120 }, { l: "8x", ms: 45 }];
const FIELD_KEY = "ldb.matchField";
const INTRO_MS = 2600;
const isGoal = (e: MatchEvent) => e.type === "goal" || e.type === "pen-goal" || e.type === "owngoal";

/** Preferência "campo animado" x "só lances" (fica neste aparelho). */
function readFieldPref(): boolean {
  try {
    return localStorage.getItem(FIELD_KEY) !== "0";
  } catch {
    return true;
  }
}
function saveFieldPref(on: boolean) {
  try {
    localStorage.setItem(FIELD_KEY, on ? "1" : "0");
  } catch {
    /* sem armazenamento local: vale só nesta partida */
  }
}

export function MatchScreen({ quick }: { quick: boolean }) {
  const w = useWorld();
  const f = useMemo(() => (w.pendingMatch != null ? fixtureById(w, w.pendingMatch) : undefined), []);
  const simRef = useRef<MatchSim | null>(null);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [speed, setSpeed] = useState(() => (w.settings.speed <= 150 ? 2 : w.settings.speed <= 350 ? 1 : 0));
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<"feed" | "stats" | "teams">("feed");
  const [subs, setSubs] = useState(false);
  const [flash, setFlash] = useState<MatchEvent | null>(null);
  const [flashTop, setFlashTop] = useState<number | null>(null);
  const [field, setField] = useState(() => !quick && readFieldPref());
  const [intro, setIntro] = useState(field);
  const [hold, setHold] = useState(false); // relógio parado para mostrar o gol (1x/2x)
  const headRef = useRef<HTMLDivElement>(null);
  const celebrated = useRef(new Set<MatchEvent>());
  const timers = useRef<number[]>([]);
  const flashTimer = useRef(0);
  const started = useRef(false);
  const fieldRef = useRef(field);
  fieldRef.current = field;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const userSide: 0 | 1 = f && f.away === w.userClubId ? 1 : 0;

  if (!simRef.current && f) {
    loadRng(w);
    simRef.current = new MatchSim(w, f, { live: !quick, userSide });
  }
  const sim = simRef.current;

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function finish() {
    if (!sim || !f || result) return;
    const r = sim.result();
    const world = getWorld()!;
    update(() => finishUserMatch(world, f, r));
    saveRng(world);
    setResult(r);
    stopCrowd();
    autosave(true);
  }

  /** Gol: grito da torcida + foto do artilheiro com confete (uma vez por gol). */
  function celebrate(e: MatchEvent) {
    if (!sim || celebrated.current.has(e)) return;
    celebrated.current.add(e);
    const homeCrowd = !sim.f.neutral && e.side === 0;
    if (e.side === userSide && playCustomGoal()) { /* áudio do usuário */ } else goalRoar(homeCrowd || e.side === userSide);
    const head = headRef.current?.getBoundingClientRect();
    setFlashTop(fieldRef.current && head ? Math.min(head.bottom + 10, window.innerHeight * 0.56) : null);
    setFlash(e);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setFlash(null);
      setHold(false);
    }, 2000);
  }

  /** Defesa, trave, pênalti perdido: "uhhh" da torcida. */
  function beat(e: MatchEvent) {
    if (e.type === "post" || (e.type === "save" && Math.random() < 0.4) || e.type === "pen-miss") ooh();
  }

  function toggleField(on: boolean) {
    setField(on);
    saveFieldPref(on);
    if (!on) setIntro(false);
  }

  // resultado rápido
  useEffect(() => {
    if (quick && sim && !sim.finished) {
      sim.runToEnd();
      finish();
    }
  }, []);

  // som de torcida personalizado do clube do usuário
  useEffect(() => {
    if (quick) return;
    loadMedia(`goal:${w.userClubId}`).then((d) => setCustomGoalAudio(d)).catch(() => undefined);
    if (soundEnabled()) startCrowd();
    return () => {
      stopCrowd();
      for (const t of timers.current) window.clearTimeout(t);
      window.clearTimeout(flashTimer.current);
    };
  }, []);

  // abertura (estádio + escudos) e apito inicial
  useEffect(() => {
    if (quick) return;
    if (intro) {
      const t = window.setTimeout(() => setIntro(false), INTRO_MS);
      return () => window.clearTimeout(t);
    }
    if (!started.current) {
      started.current = true;
      if (soundEnabled()) whistle(1);
    }
  }, [intro]);

  // relógio da partida
  useEffect(() => {
    if (!sim || quick || paused || result || subs || intro || hold) return;
    const t = window.setInterval(() => {
      const evs = sim.step();
      const slow = speedRef.current <= 1;
      // com o campo ligado, gol e "uhhh" saem quando a bola chega (o campo avisa)
      const viewLive = fieldRef.current && slow && !document.hidden;
      for (const e of evs) {
        if (isGoal(e)) {
          if (slow) setHold(true);
          if (viewLive) later(() => celebrate(e), 2600); // garantia, se o campo não avisar
          else celebrate(e);
        } else if (e.type === "post" || e.type === "save" || e.type === "pen-miss") {
          if (!viewLive) beat(e);
        } else if (e.type === "half") whistle(2);
        else if (e.type === "end") whistle(3);
      }
      if (sim.finished) finish();
      setTick((x) => x + 1);
    }, SPEEDS[speed].ms);
    return () => window.clearInterval(t);
  }, [sim, speed, paused, result, subs, intro, hold]);

  if (!f || !sim) return <div className="page"><div className="empty">Partida não encontrada.</div><button className="btn" onClick={forceBack}>Voltar</button></div>;
  const [H, A] = sim.sides;
  const st = sim.stats;
  const totalPoss = st.poss[0] + st.poss[1];
  const poss0 = totalPoss ? Math.round((st.poss[0] / totalPoss) * 100) : 50;
  const events = sim.events.filter((e) => e.type !== "info" || !quick).slice().reverse();
  const showField = field && !quick;
  const awayBar = visibleColor(A.club.colors) === visibleColor(H.club.colors) ? "#9aa5a0" : visibleColor(A.club.colors);

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 90 }}>
      <div className="mv-head" ref={headRef}>
        <div className="mv-topline">
          <span className="small muted ellipsis">{COMP_META[f.comp].short} · {stageLabel(w, f)}</span>
          {!quick && (
            <div className="mv-toggle" role="group" aria-label="Como acompanhar o jogo">
              <button className={field ? "active" : ""} aria-pressed={field} onClick={() => toggleField(true)}>📺 Campo</button>
              <button className={!field ? "active" : ""} aria-pressed={!field} onClick={() => toggleField(false)}>📜 Lances</button>
            </div>
          )}
        </div>
        <div className={`scoreboard${showField ? " mv-compact" : ""}`}>
          <div className="team"><Crest club={H.club} size={showField ? 30 : 44} /><span className="ellipsis" style={{ maxWidth: 120 }}>{H.club.name}</span></div>
          <div className="center">
            <div className="score kbd">{H.goals} : {A.goals}</div>
            {sim.pens && <div className="small">pên. {sim.pens[0]} × {sim.pens[1]}</div>}
            <span className="minute">{result || sim.finished ? "Fim" : sim.minute === 0 ? "0'" : sim.half === 2 && sim.minute === 45 ? "Intervalo" : sim.displayMinute()}</span>
          </div>
          <div className="team"><Crest club={A.club} size={showField ? 30 : 44} /><span className="ellipsis" style={{ maxWidth: 120 }}>{A.club.name}</span></div>
        </div>
        <div className={showField ? "mv-momentum" : ""} style={showField ? undefined : { padding: "0 12px 10px" }}>
          <div className="momentum">
            <i style={{ width: `${poss0}%`, background: visibleColor(H.club.colors) }} />
            <i style={{ width: `${100 - poss0}%`, background: awayBar }} />
          </div>
          <div className={`row tiny muted${showField ? "" : " mt8"}`}><span>Posse {poss0}%</span><span className="right">{100 - poss0}%</span></div>
        </div>
        {showField && (
          <MatchView
            sim={sim}
            tick={tick}
            msPerMin={SPEEDS[speed].ms}
            paused={(paused || subs) && !result}
            intro={intro}
            goalHold={speed <= 1}
            onGoal={celebrate}
            onBeat={beat}
            onSkipIntro={() => setIntro(false)}
          />
        )}
      </div>

      {flash && <GoalCelebration e={flash} sim={sim} top={flashTop} />}

      {!quick && !result && !sim.finished && (
        <div style={{ padding: "8px 12px 0", maxWidth: 560, margin: "0 auto" }}>
          <LiveAdvice sim={sim} side={userSide} onApplied={() => setTick((x) => x + 1)} />
        </div>
      )}

      <div className="page">
        <div className="seg">
          <button className={view === "feed" ? "active" : ""} onClick={() => setView("feed")}>Lances</button>
          <button className={view === "stats" ? "active" : ""} onClick={() => setView("stats")}>Estatísticas</button>
          <button className={view === "teams" ? "active" : ""} onClick={() => setView("teams")}>Times</button>
        </div>

        {result && <FinalSummary w={w} f={f} r={result} />}

        {view === "feed" && (
          <div className="feed">
            {events.map((e, i) => (
              <div key={i} className={`ev ${isGoal(e) ? "goal" : e.type}`}>
                <span className="m">{e.type === "half" || e.type === "end" ? "⏱" : `${e.min}'`}</span>
                {(e.type === "yellow" || e.type === "red") && <span className="ic" />}
                <span>{e.type === "sub" ? "🔄 " : e.type === "injury" ? "🚑 " : e.type === "var" ? "📺 " : ""}{e.text}</span>
              </div>
            ))}
            {!events.length && <div className="empty">A bola vai rolar…</div>}
          </div>
        )}
        {view === "stats" && <StatsTable sim={sim} />}
        {view === "teams" && <TeamsView sim={sim} w={w} />}
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 15, background: "var(--bg2)", borderTop: "1px solid var(--line)", padding: "10px 12px calc(10px + env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 536, margin: "0 auto" }}>
          {result ? (
            <button className="btn primary block" onClick={() => { forceBack(); }}>Continuar</button>
          ) : (
            <div className="row gap8">
              <button className="btn sm" aria-label={paused ? "Continuar" : "Pausar"} onClick={() => setPaused((p) => !p)}>{paused ? "▶" : "❚❚"}</button>
              <div className="seg grow">
                {SPEEDS.map((s, i) => <button key={s.l} className={speed === i ? "active" : ""} onClick={() => setSpeed(i)}>{s.l}</button>)}
              </div>
              <button className="btn sm" onClick={() => { setPaused(true); setSubs(true); }}>🔄 Time</button>
              <button className="btn sm" aria-label="Pular para o fim" onClick={() => { setIntro(false); sim.runToEnd(); finish(); setTick((x) => x + 1); }}>⏭</button>
            </div>
          )}
        </div>
      </div>

      {subs && !result && <SubsSheet sim={sim} side={userSide} w={w} onClose={() => { setSubs(false); setPaused(false); setTick((x) => x + 1); }} />}
    </div>
  );
}

function StatsTable({ sim }: { sim: MatchSim }) {
  const s = sim.stats;
  const total = s.poss[0] + s.poss[1] || 1;
  const rows: [string, number, number][] = [
    ["Posse (%)", Math.round((s.poss[0] / total) * 100), Math.round((s.poss[1] / total) * 100)],
    ["Finalizações", s.shots[0], s.shots[1]],
    ["No gol", s.onTarget[0], s.onTarget[1]],
    ["Gols esperados (xG)", Math.round(s.xg[0] * 10) / 10, Math.round(s.xg[1] * 10) / 10],
    ["Escanteios", s.corners[0], s.corners[1]],
    ["Faltas", s.fouls[0], s.fouls[1]],
    ["Amarelos", s.yellows[0], s.yellows[1]],
    ["Vermelhos", s.reds[0], s.reds[1]],
  ];
  return (
    <div className="card col gap12">
      {rows.map(([l, a, b]) => {
        const t = a + b || 1;
        return (
          <div key={l}>
            <div className="statline"><b className="kbd">{a}</b><span className="center small muted">{l}</span><b className="kbd" style={{ textAlign: "right" }}>{b}</b></div>
            <div className="statline" style={{ gridTemplateColumns: "1fr" }}>
              <div className="bars"><i style={{ background: "var(--accent)", marginLeft: `${100 - (a / t) * 100}%` }} /><i style={{ background: "var(--info)", width: `${(b / t) * 100}%` }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamsView({ sim, w }: { sim: MatchSim; w: World }) {
  return (
    <div className="col gap12">
      {sim.sides.map((s, idx) => (
        <div key={idx} className="card">
          <div className="row"><Crest club={s.club} size={22} /><b>{s.club.name}</b><span className="small muted right">{s.club.tactic.formation} · {MENTALITY_NAMES[s.mentality]}</span></div>
          <div className="list mt8">
            {s.played.map((id) => {
              const p = w.players[id];
              const on = s.onPitch.includes(id);
              const r = s.rating.get(id) ?? 6;
              return (
                <div key={id} className="row small" style={{ padding: "4px 0", opacity: on ? 1 : 0.55 }}>
                  <PosBadge pos={p.pos} />
                  <span className="grow ellipsis">{p.name}{!on ? " (saiu)" : ""}</span>
                  <span style={{ width: 40 }}><Bar v={p.cond} /></span>
                  <b className="kbd" style={{ width: 30, textAlign: "right", color: r >= 7 ? "var(--accent)" : r < 6 ? "var(--danger)" : undefined }}>{Math.min(10, r).toFixed(1)}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SubsSheet({ sim, side, w, onClose }: { sim: MatchSim; side: 0 | 1; w: World; onClose: () => void }) {
  const S = sim.sides[side];
  const [out, setOut] = useState<number | null>(null);
  const [made, setMade] = useState(0);
  const [, force] = useState(0);
  const halftime = sim.half === 2 && sim.minute === 45;

  function close() {
    if (made > 0 && !halftime) sim.useWindow(side);
    onClose();
  }

  return (
    <Sheet title="Mexer no time" onClose={close}>
      <div className="small muted">Substituições restantes: <b>{S.subsLeft}</b> · paradas restantes: <b>{S.windowsLeft}</b>{halftime ? " (intervalo não conta)" : ""}</div>
      <b className="small" style={{ display: "block", marginTop: 10 }}>Mentalidade</b>
      <div className="seg mt8">
        {[-2, -1, 0, 1, 2].map((m) => (
          <button key={m} className={S.mentality === m ? "active" : ""} onClick={() => { sim.setMentality(side, m); force((x) => x + 1); }}>{MENTALITY_NAMES[m].split(" ")[0]}</button>
        ))}
      </div>
      <h3 className="mt12">Em campo {out ? "— escolha quem entra" : "— toque em quem sai"}</h3>
      <div className="list">
        {S.onPitch.map((id, k) => {
          if (id == null) return <div key={k} className="list-item muted small">{S.slots[k]} — expulso</div>;
          const p = w.players[id];
          return (
            <div key={id} className="list-item" style={{ background: out === id ? "color-mix(in srgb, var(--danger) 20%, transparent)" : undefined }} onClick={() => setOut(out === id ? null : id)}>
              <Avatar p={p} club={S.club} season={w.season} size={32} />
              <span className="pos DEF" style={{ background: "#445" }}>{S.slots[k]}</span>
              <span className="grow ellipsis">{p.name}</span>
              <span style={{ width: 44 }}><Bar v={p.cond} /></span>
              <b className="kbd">{(S.rating.get(id) ?? 6).toFixed(1)}</b>
            </div>
          );
        })}
      </div>
      {out != null && (
        <>
          <h3 className="mt12">Banco</h3>
          <div className="list">
            {S.bench.map((id) => {
              const p = w.players[id];
              const slot = S.slots[S.onPitch.indexOf(out)];
              return (
                <div key={id} className="list-item" onClick={() => {
                  if (S.subsLeft <= 0 || (S.windowsLeft <= 0 && !halftime && made === 0)) return;
                  if (sim.substitute(side, out, id, true)) { setMade((m) => m + 1); setOut(null); }
                }}>
                  <Avatar p={p} club={S.club} season={w.season} size={32} />
                  <PosBadge pos={p.pos} />
                  <span className="grow ellipsis">{p.name}</span>
                  <span className="small muted">na posição {ovrAt(p, slot)}</span>
                  <Ovr v={p.ovr} />
                </div>
              );
            })}
            {!S.bench.length && <div className="empty">Banco vazio.</div>}
          </div>
        </>
      )}
      <button className="btn primary block mt12" onClick={close}>Voltar ao jogo</button>
    </Sheet>
  );
}

function FinalSummary({ w, f, r }: { w: World; f: Fixture; r: MatchResult }) {
  const userHome = f.home === w.userClubId;
  const us = userHome ? r.hg : r.ag, them = userHome ? r.ag : r.hg;
  let label = us > them ? "Vitória!" : us < them ? "Derrota" : "Empate";
  if (r.pens) label = (userHome ? r.pens[0] > r.pens[1] : r.pens[1] > r.pens[0]) ? "Classificado nos pênaltis!" : "Eliminado nos pênaltis";
  const motm = r.motm != null ? w.players[r.motm] : null;
  const goals = r.events.filter((e) => e.type === "goal" || e.type === "pen-goal" || e.type === "owngoal");
  return (
    <div className="card" style={{ borderColor: us > them ? "var(--accent)" : us < them ? "var(--danger)" : "var(--warn)" }}>
      <h2>{label}</h2>
      <div className="small mt8 col gap4">
        {goals.map((e, i) => (
          <span key={i}>⚽ {e.min}' {e.pid ? w.players[e.pid]?.name : ""}{e.type === "pen-goal" ? " (pên.)" : e.type === "owngoal" ? " (contra)" : ""} — {w.clubs[e.side === 0 ? f.home : f.away].abbr}</span>
        ))}
      </div>
      {motm && <div className="row mt12"><Avatar p={motm} club={motm.clubId ? w.clubs[motm.clubId] : null} season={w.season} size={36} /><span>Craque do jogo: <b>{motm.name}</b> ({r.ratings[motm.id]?.toFixed(1)})</span></div>}
    </div>
  );
}

export function FixtureReport({ id }: { id: number }) {
  const w = useWorld();
  const f = fixtureById(w, id);
  if (!f?.result) return <div className="page"><div className="empty">Jogo ainda não disputado.</div></div>;
  const r = f.result;
  const H = w.clubs[f.home], A = w.clubs[f.away];
  return (
    <div className="page">
      <div className="card">
        <div className="center small muted">{COMP_META[f.comp].name} · {stageLabel(w, f)} · {formatDate(w.season, f.day)}</div>
        <div className="scoreboard">
          <div className="team"><Crest club={H} size={44} />{H.name}</div>
          <div className="center"><div className="score kbd">{r.hg} : {r.ag}</div>{r.pens && <div className="small">pên. {r.pens[0]} × {r.pens[1]}</div>}</div>
          <div className="team"><Crest club={A} size={44} />{A.name}</div>
        </div>
        {r.attendance ? <div className="center small muted">Público: {r.attendance.toLocaleString("pt-BR")} · {f.neutral ? "campo neutro" : H.stadium}</div> : null}
      </div>
      <div className="card feed">
        {r.events.filter((e) => e.type !== "save" && e.type !== "miss" && e.type !== "chance").map((e, i) => (
          <div key={i} className={`ev ${e.type === "goal" || e.type === "pen-goal" || e.type === "owngoal" ? "goal" : e.type}`}>
            <span className="m">{e.min}'</span>{(e.type === "yellow" || e.type === "red") && <span className="ic" />}<span>{e.text}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Notas</h3>
        {[0, 1].map((side) => (
          <div key={side} className="mt8">
            <b className="small">{side === 0 ? H.name : A.name}</b>
            <div className="row wrap gap8 mt8">
              {r.lineups[side].map((pid) => {
                const p = w.players[pid];
                if (!p) return null;
                return <span key={pid} className="tag" onClick={() => push({ name: "player", id: pid })}>{shortName(p.name)} <b>{r.ratings[pid]?.toFixed(1)}</b></span>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
