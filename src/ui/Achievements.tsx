// Conquistas do treinador.
import { useState } from "react";
import { ACHIEVEMENTS, type AchCategory } from "../engine/achievements";
import { useWorld } from "../store";
import { Bar } from "./components";
import "./progression.css";

const CATS: { id: AchCategory | "all"; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "jogo", label: "Jogos" },
  { id: "sequencia", label: "Sequências" },
  { id: "temporada", label: "Temporada" },
  { id: "carreira", label: "Carreira" },
];

export function AchievementsScreen() {
  const w = useWorld();
  const [cat, setCat] = useState<AchCategory | "all">("all");
  const got = w.ach?.got ?? {};
  const c = w.ach?.c;
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
  const list = ACHIEVEMENTS.filter((a) => cat === "all" || a.cat === cat).sort((a, b) => Number(!!got[b.id]) - Number(!!got[a.id]));
  return (
    <div className="page">
      <div className="card">
        <div className="card-title"><h3>🏅 Conquistas</h3><b>{n}/{ACHIEVEMENTS.length}</b></div>
        <Bar v={(n / ACHIEVEMENTS.length) * 100} color="var(--gold)" />
        {c && (
          <div className="grid3 mt12">
            <div className="stat-box"><b>{c.games}</b><span>jogos</span></div>
            <div className="stat-box"><b>{c.w}-{c.d}-{c.l}</b><span>V-E-D</span></div>
            <div className="stat-box"><b>{c.unb}</b><span>sem perder</span></div>
          </div>
        )}
      </div>
      <div className="row gap8" style={{ overflowX: "auto", paddingBottom: 4 }}>
        {CATS.map((x) => <button key={x.id} className={`chip${cat === x.id ? " active" : ""}`} onClick={() => setCat(x.id)}>{x.label}</button>)}
      </div>
      <div className="ach-grid">
        {list.map((a) => {
          const g = got[a.id];
          return (
            <div key={a.id} className={`ach ${g ? "got" : "locked"}`}>
              <span className="em">{a.emoji}</span>
              <div>
                <b className="small">{a.name}</b>
                <div className="tiny muted">{a.desc}</div>
                {g && <div className="tiny" style={{ color: "var(--gold)" }}>✔ {g.season}{w.clubs[g.clubId] ? ` · ${w.clubs[g.clubId].name}` : ""}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 30 }} />
    </div>
  );
}
