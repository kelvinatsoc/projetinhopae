// Sala de troféus e história do clube: estante de taças, linha do tempo e recordes.
import { useState } from "react";
import { COMP_META } from "../engine/competitions";
import type { ClubSeasonLog, World } from "../engine/types";
import { push, useWorld } from "../store";
import { CompLogo } from "./components";
import "./progression.css";
import { TrophyImg } from "./Trophy";
import { trophySpec } from "./trophies";

const CUP_ORDER = ["liberta", "serieA", "copaBR", "sula", "serieB", "serieC"];

function TrophyIcon({ comp }: { comp: string }) {
  // a taça real da competição (foto recortada ou modelo 3D) com a logo oficial como selo
  return (
    <span className="cup">
      <TrophyImg comp={comp} size={64} />
      <span className="cup-logo"><CompLogo id={comp} size={22} /></span>
    </span>
  );
}

export function clubRecords(w: World, clubId: string) {
  const c = w.clubs[clubId];
  const logs = (w.clubLog ?? []).filter((l) => l.clubId === clubId);
  const aSeasons = c.history.filter((h) => h.div === "A");
  const bestA = aSeasons.filter((h) => h.pos != null).sort((x, y) => (x.pos ?? 99) - (y.pos ?? 99))[0];
  const mostTitles = c.history.slice().sort((x, y) => y.titles.length - x.titles.length)[0];
  const scorer = logs.filter((l) => l.topScorer).sort((x, y) => y.topScorer!.goals - x.topScorer!.goals)[0];
  const mvp = logs.filter((l) => l.mvp).sort((x, y) => y.mvp!.rating - x.mvp!.rating)[0];
  const signing = logs.filter((l) => l.bestSigning).sort((x, y) => y.bestSigning!.rating - x.bestSigning!.rating)[0];
  const rows: { icon: string; label: string; value: string; sub?: string }[] = [
    { icon: "🏆", label: "Títulos (no jogo)", value: String(c.trophies.length) },
    { icon: "📅", label: "Temporadas na Série A", value: String(aSeasons.length) },
  ];
  if (bestA) rows.push({ icon: "🥇", label: "Melhor campanha na Série A", value: `${bestA.pos}º`, sub: String(bestA.season) });
  if (mostTitles?.titles.length) rows.push({ icon: "✨", label: "Mais títulos numa temporada", value: String(mostTitles.titles.length), sub: String(mostTitles.season) });
  if (scorer) rows.push({ icon: "👟", label: "Artilheiro de uma temporada", value: `${scorer.topScorer!.goals} gols`, sub: `${scorer.topScorer!.name} (${scorer.season})` });
  if (mvp) rows.push({ icon: "⭐", label: "Melhor jogador de uma temporada", value: mvp.mvp!.rating.toFixed(2), sub: `${mvp.mvp!.name} (${mvp.season})` });
  if (signing) rows.push({ icon: "✍️", label: "Melhor contratação", value: signing.bestSigning!.rating.toFixed(2), sub: `${signing.bestSigning!.name} (${signing.season})` });
  const big = w.ach?.c.bigWin;
  if (big && clubId === w.userClubId) rows.push({ icon: "💥", label: "Maior goleada (sob seu comando)", value: `+${big.gd}`, sub: `${big.text} (${big.season})` });
  return rows;
}

export function TrophyRoomScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const [open, setOpen] = useState<string | null>(null);
  const counts: Record<string, number[]> = {};
  for (const t of c.trophies) (counts[t.comp] ??= []).push(t.season);
  const comps = [...CUP_ORDER, ...Object.keys(counts).filter((k) => !CUP_ORDER.includes(k))];
  const logs = new Map<number, ClubSeasonLog>((w.clubLog ?? []).filter((l) => l.clubId === c.id).map((l) => [l.season, l]));
  const timeline = c.history.slice().reverse();

  return (
    <div className="page k-trophy-page">
      <div className="k-trophy-grid">
        <aside className="k-trophy-aside">
          <div className="card k-trophy-shelf-card">
            <div className="card-title">
              <h3>🏆 Galeria de Conquistas</h3>
              <b style={{ color: "var(--gold)" }}>{c.trophies.length} taças</b>
            </div>
            <div className="cabinet mt6">
              {comps.map((id) => {
                const n = counts[id]?.length ?? 0;
                return (
                  <div key={id} className={`cabinet-item${n ? "" : " empty"}${open === id ? " active" : ""}`} onClick={() => setOpen(open === id ? null : id)} role="button" aria-label={COMP_META[id]?.name ?? id}>
                    {n > 0 && <span className="count">×{n}</span>}
                    <TrophyIcon comp={id} />
                    <b className="tiny">{COMP_META[id]?.short ?? id}</b>
                  </div>
                );
              })}
            </div>
            {open && (
              <div className="small mt8 cabinet-open">
                <TrophyImg comp={open} size={84} />
                <b>{COMP_META[open]?.name ?? open}</b>
                <div className="tiny muted">{trophySpec(open).name}</div>
                <div className="tiny mt4">{counts[open]?.length ? `Anos: ${counts[open].slice().sort((a, b) => b - a).join(", ")}` : "Ainda não conquistado."}</div>
              </div>
            )}
          </div>
        </aside>

        <main className="k-trophy-main">
          <div className="card">
            <div className="card-title"><h3>📜 Recordes & Marcas Históricas</h3></div>
            <div className="mt4 col gap2">
              {clubRecords(w, c.id).map((r) => (
                <div key={r.label} className="row small" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ width: 24, fontSize: 16 }}>{r.icon}</span>
                  <div className="grow">{r.label}{r.sub && <div className="tiny muted">{r.sub}</div>}</div>
                  <b>{r.value}</b>
                </div>
              ))}
            </div>
          </div>

      <div className="card">
        <div className="card-title"><h3>Linha do tempo</h3></div>
        {timeline.length === 0 && <div className="empty-state center"><b>A estante está esperando</b><div className="small muted">Cada título conquistado ganha seu lugar aqui. Bora levantar a primeira taça?</div></div>}
        <div className="timeline">
          {timeline.map((h) => {
            const log = logs.get(h.season);
            const cls = h.titles.length ? "gold" : log?.promoted ? "up" : log?.relegated ? "down" : "";
            return (
              <div key={h.season} className={`tl-item ${cls}`}>
                <div className="row gap8">
                  <b>{h.season}</b>
                  <span className="tag">Série {h.div}{h.pos ? ` · ${h.pos}º` : ""}</span>
                  {log?.promoted && <span className="tag" style={{ color: "var(--accent)" }}>⬆ acesso</span>}
                  {log?.relegated && <span className="tag danger">⬇ rebaixado</span>}
                </div>
                {h.titles.length > 0 && (
                  <div className="row gap8 small mt8" style={{ flexWrap: "wrap" }}>
                    {h.titles.map((t) => <span key={t} className="row gap8"><CompLogo id={t} size={16} />🏆 {COMP_META[t]?.short ?? t}</span>)}
                  </div>
                )}
                {log && (
                  <div className="tiny muted mt8" style={{ lineHeight: 1.5 }}>
                    {log.topScorer && <div onClick={() => w.players[log.topScorer!.pid] && push({ name: "player", id: log.topScorer!.pid })}>⚽ Artilheiro: {log.topScorer.name} ({log.topScorer.goals})</div>}
                    {log.mvp && <div onClick={() => w.players[log.mvp!.pid] && push({ name: "player", id: log.mvp!.pid })}>⭐ Craque: {log.mvp.name} (nota {log.mvp.rating.toFixed(2)})</div>}
                    {log.bestSigning && <div>✍️ Melhor contratação: {log.bestSigning.name} (nota {log.bestSigning.rating.toFixed(2)})</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
        </main>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}
