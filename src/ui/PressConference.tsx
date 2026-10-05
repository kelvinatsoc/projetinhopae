// Coletiva de imprensa (pré ou pós-jogo). Opcional: dá para pular a qualquer momento.
import { useMemo, useState } from "react";
import { fixtureById } from "../engine/competitions";
import { fanEmoji, fanLabel } from "../engine/narrative";
import { applyPress, generatePress, pressDone, PRESS_TONES, type PressEffect, type PressPhase, type PressTone } from "../engine/press";
import { back, toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { Crest } from "./components";
import "./narrative.css";

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function PressConferenceScreen({ fid, phase }: { fid: number; phase: PressPhase }) {
  const w = useWorld();
  const f = fixtureById(w, fid);
  const questions = useMemo(() => (f ? generatePress(w, f, phase) : []), [fid, phase]);
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Record<string, PressTone>>({});
  const [result, setResult] = useState<PressEffect | null>(null);
  if (!f) return <div className="page"><div className="empty">Jogo não encontrado.</div></div>;
  const already = pressDone(w, fid, phase) && !result;
  const opp = w.clubs[f.home === w.userClubId ? f.away : f.home];

  function answer(tone: PressTone) {
    const q = questions[step];
    const next = { ...picks, [q.id]: tone };
    setPicks(next);
    if (step + 1 < questions.length) {
      setStep(step + 1);
      return;
    }
    let eff: PressEffect | null = null;
    update((x) => { const fx = fixtureById(x, fid); if (fx) eff = applyPress(x, fx, phase, questions, next); });
    setResult(eff);
    autosave();
  }

  function skip() {
    toast("Você deixou a coletiva para o auxiliar");
    back();
  }

  return (
    <div className="page">
      <div className="press-head card">
        <div className="row gap8">
          <span style={{ fontSize: 28 }}>🎤</span>
          <div className="grow">
            <b>Coletiva {phase === "pre" ? "pré-jogo" : "pós-jogo"}</b>
            <div className="small muted">contra o {opp?.name}</div>
          </div>
          {opp && <Crest club={opp} size={36} />}
        </div>
        <div className="press-steps mt8">
          {questions.map((q, i) => <i key={q.id} className={i < step || result ? "done" : i === step ? "on" : ""} />)}
        </div>
      </div>

      {already ? (
        <div className="card"><div className="empty">Você já falou com a imprensa sobre este jogo.</div></div>
      ) : result ? (
        <div className="card">
          <h3>Repercussão</h3>
          <div className="press-fx mt8">
            <div><span>🧑‍🤝‍🧑 Elenco</span><b className={result.morale >= 0 ? "pos" : "neg"}>{sign(result.morale)}</b></div>
            <div><span>🏛️ Diretoria</span><b className={result.board >= 0 ? "pos" : "neg"}>{sign(result.board)}</b></div>
            <div><span>📣 Torcida</span><b className={result.fans >= 0 ? "pos" : "neg"}>{sign(result.fans)}</b></div>
          </div>
          {result.player !== 0 && <div className="small mt8">O jogador citado reagiu: {sign(result.player)} de moral.</div>}
          <div className="small muted mt8">Torcida: {fanEmoji(w.narrative?.fan ?? 60)} {fanLabel(w.narrative?.fan ?? 60)} · Diretoria: {w.board.confidence}%</div>
        </div>
      ) : questions[step] && (
        <>
          <div className="card press-q">
            <div className="tiny muted">{questions[step].reporter} pergunta:</div>
            <div className="press-bubble">“{questions[step].text}”</div>
          </div>
          <div className="press-answers">
            {questions[step].answers.map((a) => (
              <button key={a.tone} className={`press-card tone-${a.tone}`} onClick={() => answer(a.tone)}>
                <span className="press-tone">{PRESS_TONES[a.tone].emoji} {PRESS_TONES[a.tone].label}</span>
                <span>{a.text}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="grid2 mt8">
        {result || already
          ? <button className="btn primary block" style={{ gridColumn: "1 / -1" }} onClick={back}>Continuar</button>
          : <button className="btn block" style={{ gridColumn: "1 / -1" }} onClick={skip}>Pular coletiva</button>}
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}
