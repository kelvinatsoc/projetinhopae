// Bola parada: batedores, capitão e jogada ensaiada de escanteio (Trilha C).
import { useState } from "react";
import { validLineup } from "../engine/lineup";
import { shortName } from "../engine/player";
import { bestTaker, ROUTINES, setPieceConfig, setRoutine, setTaker, TAKER_LABEL, takerScore, type TakerRole } from "../engine/setpieces";
import type { SetPieceRoutine } from "../engine/types";
import { update, useWorld } from "../store";
import { autosave } from "./actions";
import { Avatar, PosBadge, Sheet } from "./components";
import "./economy.css";

const ROLES: TakerRole[] = ["corner", "fk", "pen", "cap"];

export function SetPiecesScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const cfg = setPieceConfig(c);
  const [role, setRole] = useState<TakerRole | null>(null);
  const starters = validLineup(w, c).starters;
  const squad = c.players.map((id) => w.players[id]).filter((p) => p && !p.youth && p.pos !== "GOL" && !p.loan);
  const who = (r: TakerRole) => cfg[r] ?? (r === "cap" ? c.lineup?.captain : undefined);
  const save = (fn: () => void) => { update(fn); autosave(); };
  return (
    <div className="page">
      <div className="card">
        <h3>🎯 Batedores</h3>
        <div className="tiny muted">Sem escolha (ou se o escolhido não estiver em campo), vale o melhor jogador em campo.</div>
        <div className="sp-roles mt8">
          {ROLES.map((r) => {
            const id = who(r);
            const auto = id == null ? bestTaker(w, starters, r) : null;
            const p = id != null ? w.players[id] : auto != null ? w.players[auto] : null;
            return (
              <button key={r} className="sp-role" onClick={() => setRole(r)}>
                <span className="tiny muted">{TAKER_LABEL[r].emoji} {TAKER_LABEL[r].label}</span>
                <b className="ellipsis">{p ? shortName(p.name) : "—"}</b>
                <span className="tiny muted">{id == null ? "automático" : "escolhido"}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="card">
        <h3>🚩 Jogada de escanteio</h3>
        <div className="eco-offers">
          {(Object.keys(ROUTINES) as SetPieceRoutine[]).map((k) => (
            <div key={k} className={`eco-offer${cfg.routine === k ? " sel" : ""}`} role="button" tabIndex={0} aria-pressed={cfg.routine === k}
              onClick={() => save(() => setRoutine(c, k))}>
              <span className="brand">{ROUTINES[k].label}</span>
              <div className="tiny muted">{ROUTINES[k].desc}</div>
            </div>
          ))}
        </div>
      </div>
      {role && (
        <Sheet title={`${TAKER_LABEL[role].emoji} ${TAKER_LABEL[role].label}`} onClose={() => setRole(null)}>
          <div className="list">
            <div className="list-item" onClick={() => { save(() => setTaker(c, role, null)); setRole(null); }}>
              <span className="grow">✨ Automático (melhor em campo)</span>
            </div>
            {squad.slice().sort((a, b) => takerScore(b, role) - takerScore(a, role)).map((p) => (
              <div key={p.id} className="list-item" onClick={() => {
                save(() => { setTaker(c, role, p.id); if (role === "cap" && c.lineup) c.lineup.captain = p.id; });
                setRole(null);
              }}>
                <Avatar p={p} club={c} season={w.season} size={30} />
                <PosBadge pos={p.pos} />
                <span className="grow ellipsis">{who(role) === p.id ? "✅ " : ""}{p.name}</span>
                <span className="small muted">{role === "corner" ? `PAS ${p.attrs.pas}` : role === "cap" ? `fama ${p.fame}` : `FIN ${p.attrs.fin}`}</span>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
