// Auxiliar técnico na interface: card do pré-jogo, card da tela de tática e dicas durante a partida.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeMatch, analyzeSquad, applyAdvice, applyFix, applyTip, currentPlan, dismissTip, estimateOdds, liveTips,
  type LineupFix, type MatchAnalysis, type Odds, type Outlook, type TacticPlan,
} from "../engine/assistant";
import { fixtureById, nextFixture } from "../engine/competitions";
import type { MatchSim } from "../engine/match";
import { MENTALITY_NAMES, PRESSING_NAMES } from "../engine/positions";
import { shortName } from "../engine/player";
import { TONES, userPreTalk } from "../engine/teamtalk";
import type { Fixture, Lineup, World } from "../engine/types";
import { toast, update, useVersion, useWorld } from "../store";
import { autosave } from "./actions";
import { Avatar, Crest, PosBadge } from "./components";
import "./assistant.css";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const FIX_ICON: Record<LineupFix["kind"], string> = { missing: "🚑", tired: "🔋", position: "🧭", better: "⬆️" };
const VERDICT: Record<MatchAnalysis["verdict"], { label: string; cls: string }> = {
  favorito: { label: "Favorito", cls: "good" },
  equilibrado: { label: "Jogo parelho", cls: "warn" },
  azarão: { label: "Azarão", cls: "danger" },
};

/** Para o azarão, o que muda é a chance de pontuar (empates); para os outros, a de vencer. */
function chanceLine(a: MatchAnalysis) {
  const under = a.verdict === "azarão";
  const v = (o: Outlook) => (under ? o.win + o.draw : o.win);
  return `${under ? "Chance de pontuar" : "Vitória"} ${pct(v(a.now))}${a.changed ? ` → ${pct(v(a.suggested))} com a sugestão` : ""}`;
}

function planKey(p: TacticPlan) {
  return `${p.formation}|${p.mentality}|${p.pressing}|${p.lineup?.starters.join(",") ?? ""}`;
}

/** Barra empilhada Vitória / Empate / Derrota. */
function WDL({ o, compact }: { o: Outlook | Odds; compact?: boolean }) {
  return (
    <div className="as-wdl">
      <div className="as-wdl-bar" role="img" aria-label={`Vitória ${pct(o.win)}, empate ${pct(o.draw)}, derrota ${pct(o.loss)}`}>
        <i className="w" style={{ width: pct(o.win) }} />
        <i className="d" style={{ width: pct(o.draw) }} />
        <i className="l" style={{ width: pct(o.loss) }} />
      </div>
      {!compact && (
        <div className="as-wdl-nums tiny">
          <span><b>V</b> {pct(o.win)}</span><span><b>E</b> {pct(o.draw)}</span><span><b>D</b> {pct(o.loss)}</span>
        </div>
      )}
    </div>
  );
}

function RecRow({ icon, label, value, reason, changed }: { icon: string; label: string; value: string; reason: string; changed: boolean }) {
  return (
    <div className="as-rec">
      <span className="as-rec-ico" aria-hidden="true">{icon}</span>
      <div className="grow">
        <div className="row gap8 wrap"><span className="small muted">{label}</span><b>{value}</b>{changed && <span className="tag good">mudar</span>}</div>
        <div className="small as-reason">{reason}</div>
      </div>
    </div>
  );
}

function FixList({ w, fixes, compId }: { w: World; fixes: LineupFix[]; compId?: string }) {
  if (!fixes.length) return <div className="small muted">✅ Escalação sem problemas: ninguém cansado ou fora de posição.</div>;
  const club = w.clubs[w.userClubId];
  return (
    <div className="as-fixes">
      {fixes.map((f, i) => (
        <div key={`${f.kind}-${f.slot}-${i}`} className="as-fix">
          <span aria-hidden="true">{FIX_ICON[f.kind]}</span>
          <span className="grow small">{f.text}</span>
          {f.kind !== "missing" && f.inId != null && (
            <button className="btn sm" onClick={() => { update((world) => applyFix(world, world.clubs[club.id], f, compId)); autosave(); toast("Escalação ajustada"); }}>Trocar</button>
          )}
        </div>
      ))}
    </div>
  );
}

function applyPlan(plan: TacticPlan, compId?: string) {
  update((world) => applyAdvice(world, world.clubs[world.userClubId], plan, compId));
  autosave();
  toast("Sugestões do auxiliar aplicadas ✔");
}

function applyAlternative(l: Lineup) {
  update((world) => { world.clubs[world.userClubId].lineup = { starters: l.starters.slice(), bench: l.bench.slice(), captain: l.captain }; });
  autosave();
  toast("Time alternativo escalado ✔");
}

// ---------------------------------------------------------------- pré-jogo
export function PreMatchAdvice({ fixtureId }: { fixtureId: number }) {
  const w = useWorld();
  const v = useVersion();
  const f = fixtureById(w, fixtureId);
  const a = useMemo(() => (f && !f.result ? analyzeMatch(w, f) : null), [v, fixtureId]);
  if (!f || !a) return null;
  return <PreMatchCard w={w} f={f} a={a} />;
}

function PreMatchCard({ w, f, a }: { w: World; f: Fixture; a: MatchAnalysis }) {
  const user = w.clubs[w.userClubId];
  const opp = w.clubs[a.opp.id];
  const verdict = VERDICT[a.verdict];
  const balance = Math.max(0.04, Math.min(0.96, a.suggested.win + a.suggested.draw / 2));
  const venue = a.neutral ? "campo neutro" : a.home ? "você joga em casa" : "você joga fora";
  const t = user.tactic;
  return (
    <div className="card as-card">
      <div className="as-head">
        <span className="as-brain" aria-hidden="true">🧠</span>
        <div className="grow">
          <b>Auxiliar técnico</b>
          <div className="tiny muted">Análise do {opp.name} e do seu time</div>
        </div>
        <span className={`tag ${verdict.cls}`}>{verdict.label}</span>
      </div>

      <div className="as-meter">
        <div className="row gap8">
          <Crest club={user} size={22} />
          <b className="kbd">{Math.round(a.user.strength)}</b>
          <div className="grow as-meter-track" aria-label="Equilíbrio de forças">
            <i style={{ left: `${balance * 100}%` }} />
          </div>
          <b className="kbd">{Math.round(a.opp.strength)}</b>
          <Crest club={opp} size={22} />
        </div>
        <div className="row tiny muted as-meter-labels"><span>Azarão</span><span>Parelho</span><span>Favorito</span></div>
        <div className="tiny muted center">Força média dos titulares · {venue}</div>
      </div>

      <div className="as-section">
        <div className="as-title">O adversário</div>
        <div className="small">
          Deve vir no <b>{a.opp.formation}</b>, {MENTALITY_NAMES[a.opp.mentality].toLowerCase()}, {PRESSING_NAMES[a.opp.pressing].toLowerCase()}.
        </div>
        <div className="small mt8">💪 Ponto forte: <b>{a.opp.strong}</b> · 🎯 Ponto fraco: <b>{a.opp.weak}</b></div>
        <div className="as-stars">
          {a.opp.stars.map((s) => {
            const p = w.players[s.id];
            return (
              <div key={s.id} className="as-star">
                {p && <Avatar p={p} club={opp} season={w.season} size={34} />}
                <div className="as-star-txt">
                  <b className="ellipsis">{shortName(s.name)}</b>
                  <span className="row gap4"><PosBadge pos={s.pos} /><b className="kbd">{s.ovr}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="as-section">
        <div className="as-title">O que eu faria</div>
        <RecRow icon="🧩" label="Formação" value={a.rec.formation.value} reason={a.rec.formation.reason} changed={a.rec.formation.value !== t.formation} />
        <RecRow icon="🎯" label="Mentalidade" value={MENTALITY_NAMES[a.rec.mentality.value]} reason={a.rec.mentality.reason} changed={a.rec.mentality.value !== t.mentality} />
        <RecRow icon="⚡" label="Marcação" value={PRESSING_NAMES[a.rec.pressing.value]} reason={a.rec.pressing.reason} changed={a.rec.pressing.value !== t.pressing} />
        <div className="as-compare">
          <div><span className="tiny muted">Chances com a sua tática</span><WDL o={a.now} /></div>
          {a.changed && <div><span className="tiny muted">Com as sugestões</span><WDL o={a.suggested} /></div>}
        </div>
      </div>

      <div className="as-section">
        <div className="as-title">Escalação</div>
        <FixList w={w} fixes={a.fixes} compId={f.comp} />
      </div>

      {a.rotation && (
        <div className="as-section">
          <div className="as-title">Estadual</div>
          <div className="small">💡 {a.rotation.text}</div>
          <button className="btn sm block mt8" onClick={() => applyAlternative(a.rotation!.lineup)}>🔄 Escalar time alternativo</button>
        </div>
      )}

      <TalkTip w={w} f={f} />

      <div className="col gap8">
        {a.changed
          ? <button className="btn primary block" onClick={() => applyPlan(a.plan, f.comp)}>✅ Aplicar sugestões</button>
          : <div className="as-ok small">✔ Seu time já está do jeito que eu sugiro.</div>}
        <OddsSim w={w} f={f} a={a} />
      </div>
    </div>
  );
}

/** Balão da preleção: o que o auxiliar diria no vestiário (os botões ficam no card "Preleção"). */
function TalkTip({ w, f }: { w: World; f: Fixture }) {
  const tone = userPreTalk(w, f).tone;
  const t = TONES[tone];
  return (
    <div className="as-section">
      <div className="as-title">Preleção</div>
      <div className="as-talk small">💡 “{t.bubble}” <span className="muted">Eu diria:</span> <b>{t.emoji} {t.label}</b></div>
    </div>
  );
}

/** "Simular 300 jogos": tática atual × sugerida, com barra de progresso. */
function OddsSim({ w, f, a }: { w: World; f: Fixture; a: MatchAnalysis }) {
  const N = 300;
  const cur = currentPlan(w, f);
  const key = `${planKey(cur)}#${planKey(a.plan)}`;
  const [state, setState] = useState<{ key: string; progress: number; cur?: Odds; sug?: Odds; running: boolean } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const stale = state && state.key !== key && !state.running;

  async function run() {
    const both = a.changed;
    const total = both ? 2 * N : N;
    setState({ key, progress: 0, running: true });
    const c = await estimateOdds(w, f, cur, N, (d) => alive.current && setState((s) => s && { ...s, progress: d / total }));
    const s = both ? await estimateOdds(w, f, a.plan, N, (d) => alive.current && setState((st) => st && { ...st, progress: (N + d) / total })) : c;
    if (alive.current) setState({ key, progress: 1, cur: c, sug: s, running: false });
  }

  if (!state || stale) {
    return <button className="btn block" onClick={run}>🎲 Simular {N} jogos</button>;
  }
  if (state.running) {
    return (
      <div className="as-sim">
        <div className="small muted">Simulando {N} partidas{a.changed ? " com cada tática" : ""}… {pct(state.progress)}</div>
        <div className="as-progress"><i style={{ width: pct(state.progress) }} /></div>
      </div>
    );
  }
  const c = state.cur!, s = state.sug!;
  const better = s.pts > c.pts + 0.02;
  return (
    <div className="as-sim">
      <div className={`as-sim-grid${a.changed ? "" : " one"}`}>
        <div className="as-sim-col">
          <div className="tiny muted">{a.changed ? "Tática atual" : "Sua tática"}</div>
          <WDL o={c} />
          <div className="tiny muted">{c.pts.toFixed(2).replace(".", ",")} pts/jogo · gols {c.gf.toFixed(1).replace(".", ",")} × {c.ga.toFixed(1).replace(".", ",")}</div>
        </div>
        {a.changed && (
          <div className={`as-sim-col${better ? " best" : ""}`}>
            <div className="tiny muted">Sugerida</div>
            <WDL o={s} />
            <div className="tiny muted">{s.pts.toFixed(2).replace(".", ",")} pts/jogo · gols {s.gf.toFixed(1).replace(".", ",")} × {s.ga.toFixed(1).replace(".", ",")}</div>
          </div>
        )}
      </div>
      <div className="tiny muted center mt8">Os mesmos {N} jogos sorteados para as duas táticas, com o motor do jogo.</div>
      <button className="btn sm ghost block" onClick={run}>Simular de novo</button>
    </div>
  );
}

// ---------------------------------------------------------------- tela de tática
export function TacticsAdvice() {
  const w = useWorld();
  const v = useVersion();
  const [open, setOpen] = useState(false);
  const f = useMemo(() => {
    const pending = w.pendingMatch != null ? fixtureById(w, w.pendingMatch) : undefined;
    return pending && !pending.result ? pending : nextFixture(w, w.userClubId);
  }, [v]);
  const match = useMemo(() => (f ? analyzeMatch(w, f) : null), [v, f?.id]);
  const squad = useMemo(() => (f ? null : analyzeSquad(w)), [v, f?.id]);
  const user = w.clubs[w.userClubId];
  const t = user.tactic;

  if (match && f) {
    const opp = w.clubs[match.opp.id];
    return (
      <div className="card flat as-card">
        <div className="as-head">
          <span className="as-brain" aria-hidden="true">🧠</span>
          <div className="grow">
            <b>Auxiliar técnico</b>
            <div className="tiny muted row gap4">Próximo jogo: <Crest club={opp} size={14} /> {opp.name} ({match.neutral ? "neutro" : match.home ? "casa" : "fora"})</div>
          </div>
          <span className={`tag ${VERDICT[match.verdict].cls}`}>{VERDICT[match.verdict].label}</span>
        </div>
        <div className="as-summary">
          <span className={`as-pill${match.plan.formation !== t.formation ? " diff" : ""}`}>{match.plan.formation}</span>
          <span className={`as-pill${match.plan.mentality !== t.mentality ? " diff" : ""}`}>{MENTALITY_NAMES[match.plan.mentality]}</span>
          <span className={`as-pill${match.plan.pressing !== t.pressing ? " diff" : ""}`}>{PRESSING_NAMES[match.plan.pressing]}</span>
        </div>
        <div className="row gap8">
          <span className="tiny muted grow">{chanceLine(match)}</span>
          <button className="btn sm ghost" onClick={() => setOpen((o) => !o)}>{open ? "Fechar" : "Por quê?"}</button>
        </div>
        {open && (
          <div className="as-section">
            <RecRow icon="🧩" label="Formação" value={match.rec.formation.value} reason={match.rec.formation.reason} changed={match.rec.formation.value !== t.formation} />
            <RecRow icon="🎯" label="Mentalidade" value={MENTALITY_NAMES[match.rec.mentality.value]} reason={match.rec.mentality.reason} changed={match.rec.mentality.value !== t.mentality} />
            <RecRow icon="⚡" label="Marcação" value={PRESSING_NAMES[match.rec.pressing.value]} reason={match.rec.pressing.reason} changed={match.rec.pressing.value !== t.pressing} />
            <div className="small muted">Destaques do {opp.name}: {match.opp.stars.map((s) => `${shortName(s.name)} (${s.ovr})`).join(", ")}</div>
          </div>
        )}
        <FixList w={w} fixes={match.fixes} compId={f.comp} />
        {match.changed
          ? <button className="btn primary block" onClick={() => applyPlan(match.plan, f.comp)}>✅ Aplicar sugestões</button>
          : <div className="as-ok small">✔ Tática e escalação já estão do jeito que eu sugiro.</div>}
      </div>
    );
  }

  if (!squad) return null;
  const changed = squad.best !== t.formation || squad.fixes.some((x) => x.kind !== "missing");
  return (
    <div className="card flat as-card">
      <div className="as-head">
        <span className="as-brain" aria-hidden="true">🧠</span>
        <div className="grow"><b>Auxiliar técnico</b><div className="tiny muted">Formação que mais aproveita o elenco</div></div>
      </div>
      <div className="as-summary">
        {squad.formations.slice(0, 3).map((x) => (
          <span key={x.formation} className={`as-pill${x.formation === squad.best ? " diff" : ""}`}>{x.formation} · {Math.round(x.strength)}</span>
        ))}
      </div>
      <div className="small as-reason">{squad.reason}</div>
      <FixList w={w} fixes={squad.fixes} />
      {changed && <button className="btn primary block" onClick={() => applyPlan(squad.plan)}>✅ Aplicar sugestão</button>}
    </div>
  );
}

// ---------------------------------------------------------------- durante o jogo
export function LiveAdvice({ sim, side, onApplied }: { sim: MatchSim; side: 0 | 1; onApplied: () => void }) {
  const [, force] = useState(0);
  const [which, setWhich] = useState(0);
  const tips = liveTips(sim, side);
  if (!tips.length) return null;
  const tip = tips[Math.min(which, tips.length - 1)];
  const other = tips.length > 1 ? tips[(Math.min(which, tips.length - 1) + 1) % tips.length] : null;

  function act(index?: number) {
    const n = applyTip(sim, side, tip, index);
    toast(n > 0 ? "Feito! ✔" : "Não deu para aplicar agora");
    setWhich(0);
    force((x) => x + 1);
    onApplied();
  }

  return (
    <div className={`as-live tone-${tip.tone}`} role="status">
      <div className="row gap8">
        <span className="as-live-ico" aria-hidden="true">🧠</span>
        <b className="grow as-live-title">{tip.title}</b>
        <button className="as-x" aria-label="Dispensar dica" onClick={() => { dismissTip(sim, tip.id); setWhich(0); force((x) => x + 1); }}>✕</button>
      </div>
      <div className="small as-live-text">{tip.text}</div>
      {tip.actions.length > 0 && (
        <div className="as-live-actions">
          {tip.actions.map((a, i) => (
            <button key={`${a.kind}-${i}`} className={`btn sm${tip.actions.length === 1 ? " primary" : ""}`} onClick={() => act(i)}>{a.label}</button>
          ))}
          {tip.actions.length > 1 && <button className="btn sm primary" onClick={() => act()}>✅ Fazer tudo</button>}
        </div>
      )}
      {other && <button className="as-next tiny" onClick={() => setWhich((x) => x + 1)}>Outra dica: {other.title} ›</button>}
    </div>
  );
}
