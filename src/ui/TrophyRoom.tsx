// Sala de troféus e história do clube: estante de taças, linha do tempo e recordes.
import { useState } from "react";
import { COMP_META } from "../engine/competitions";
import type { ClubSeasonLog, World } from "../engine/types";
import { push, useWorld } from "../store";
import { CompLogo, Crest } from "./components";
import "./progression.css";

const CUP_ORDER = ["liberta", "serieA", "copaBR", "sula", "serieB", "serieC"];

function TrophyIcon({ comp }: { comp: string }) {
  // o logo oficial aparece se existir; o troféu fica como reserva por baixo
  return (
    <span className="cup" style={{ position: "relative" }}>
      <span>🏆</span>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><CompLogo id={comp} size={32} /></span>
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
    <div className="page">
      <div className="hero" style={{ background: `linear-gradient(135deg, ${c.colors[0]}, ${c.colors[1]})` }}>
        <div className="row">
          <Crest club={c} size={56} />
          <div className="grow">
            <h2>Sala de troféus</h2>
            <div className="small" style={{ opacity: 0.9 }}>{c.full} · {c.trophies.length} título{c.trophies.length === 1 ? "" : "s"} no jogo</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h3>Estante</h3><span className="small muted">toque para ver os anos</span></div>
        <div className="cabinet">
          {comps.map((id) => {
            const n = counts[id]?.length ?? 0;
            return (
              <div key={id} className={`cabinet-item${n ? "" : " empty"}`} onClick={() => setOpen(open === id ? null : id)} role="button" aria-label={COMP_META[id]?.name ?? id}>
                {n > 0 && <span className="count">×{n}</span>}
                <TrophyIcon comp={id} />
                <b className="tiny">{COMP_META[id]?.short ?? id}</b>
              </div>
            );
          })}
        </div>
        {open && (
          <div className="small mt8">
            <b>{COMP_META[open]?.name ?? open}:</b>{" "}
            {counts[open]?.length ? counts[open].slice().sort((a, b) => b - a).join(", ") : "ainda não conquistado."}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><h3>Recordes do clube</h3></div>
        {clubRecords(w, c.id).map((r) => (
          <div key={r.label} className="row small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ width: 26, fontSize: 18 }}>{r.icon}</span>
            <div className="grow">{r.label}{r.sub && <div className="tiny muted">{r.sub}</div>}</div>
            <b>{r.value}</b>
          </div>
        ))}
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
      <div style={{ height: 30 }} />
    </div>
  );
}
