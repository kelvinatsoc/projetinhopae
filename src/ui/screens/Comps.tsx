import { useState } from "react";
import { formatDate } from "../../engine/calendar";
import { clubFixtures, fixtureById, sortTable, STAGE_NAMES, tieAggregate } from "../../engine/competitions";
import type { Competition, Fixture, TableRow, Tie, World } from "../../engine/types";
import { push, useWorld } from "../../store";
import { CompLogo, Crest, Ic, Icon } from "../components";
import { CompHeader } from "../CompTheme";
import { compTheme } from "../compThemes";

export function CompsScreen() {
  const w = useWorld();
  const user = w.clubs[w.userClubId];
  const comps = Object.values(w.comps).sort((a, b) => a.tier - b.tier);
  const mine = comps.filter((c) => c.teams.includes(user.id));
  const [sel, setSel] = useState<string>("mine");
  const comp = w.comps[sel];

  return (
    <div className="page">
      <div className="chips">
        <button className={`chip${sel === "mine" ? " active" : ""}`} onClick={() => setSel("mine")}><Ic n="calendar" /> Meus jogos</button>
        {[...mine, ...comps.filter((c) => !mine.includes(c))].map((c) => (
          <button key={c.id} className={`chip${sel === c.id ? " active" : ""}`} onClick={() => setSel(c.id)}><CompLogo id={c.id} size={16} /> {c.short}{mine.includes(c) ? " •" : ""}</button>
        ))}
      </div>
      {sel === "mine" && <MyFixtures w={w} />}
      {comp && (
        <>
          <CompHeader id={comp.id} title={`${comp.name} ${comp.season}`} sub={compTheme(comp.id, comp.color).motto} right={<span className="ct-pill">{STAGE_NAMES[comp.stage]}</span>} />
          {comp.champion && (
            <div className="card row" style={{ borderColor: "var(--gold)" }}>
              <span className="champ-ic"><Icon name="trophy" size={24} /></span><Crest club={w.clubs[comp.champion]} size={30} /><b>{w.clubs[comp.champion].name}</b><span className="muted small">campeão</span>
            </div>
          )}
          {comp.format === "league" && <LeagueView w={w} comp={comp} />}
          {comp.format === "cup" && <CupView w={w} comp={comp} />}
          {comp.format === "groups" && <GroupsView w={w} comp={comp} />}
          <TopScorers w={w} comp={comp} />
        </>
      )}
      
    </div>
  );
}

function MyFixtures({ w }: { w: World }) {
  const list = clubFixtures(w, w.userClubId);
  return (
    <div className="card flat" style={{ padding: "2px 10px" }}>
      <div className="list">
        {list.map((f) => <FixtureLine key={f.id} w={w} f={f} showComp />)}
      </div>
      {!list.length && <div className="empty">Sem jogos.</div>}
    </div>
  );
}

export function FixtureLine({ w, f, showComp }: { w: World; f: Fixture; showComp?: boolean }) {
  const H = w.clubs[f.home], A = w.clubs[f.away];
  const r = f.result;
  const isUser = f.home === w.userClubId || f.away === w.userClubId;
  let color: string | undefined;
  if (r && isUser) {
    const us = f.home === w.userClubId ? r.hg : r.ag, them = f.home === w.userClubId ? r.ag : r.hg;
    color = us > them ? "var(--accent)" : us < them ? "var(--danger)" : "var(--warn)";
  }
  return (
    <div className="list-item" onClick={() => r && push({ name: "fixture", id: f.id })} style={{ cursor: r ? "pointer" : "default" }}>
      <div style={{ width: 52 }} className="tiny muted">
        {formatDate(w.season, f.day, false)}
        {showComp && <div style={{ color: w.comps[f.comp]?.color }}>{w.comps[f.comp]?.short}</div>}
      </div>
      <div className="grow col gap4">
        <div className="row gap8"><Crest club={H} size={18} /><span className={`ellipsis ${H.id === w.userClubId ? "bold" : ""}`}>{H.name}</span></div>
        <div className="row gap8"><Crest club={A} size={18} /><span className={`ellipsis ${A.id === w.userClubId ? "bold" : ""}`}>{A.name}</span></div>
      </div>
      <div className="col center kbd" style={{ minWidth: 34, fontWeight: 800, color }}>
        {r ? <><span>{r.hg}</span><span>{r.ag}</span></> : <span className="tiny muted">{f.stage === "league" ? `R${f.round}` : f.leg ? `${f.leg}º jogo` : ""}</span>}
      </div>
      {r?.pens && <span className="tiny muted">({r.pens[0]}-{r.pens[1]} pên.)</span>}
    </div>
  );
}

function zoneFor(compId: string, pos: number, n: number): string {
  if (compId === "serieA") return pos <= 4 ? "lib" : pos <= 6 ? "lib" : pos <= 12 ? "sula" : pos > n - 4 ? "rel" : "";
  if (compId === "serieB") return pos <= 2 ? "up" : pos <= 6 ? "po" : pos > n - 4 ? "rel" : "";
  if (compId === "serieC") return pos <= 8 ? "up" : pos > n - 2 ? "rel" : "";
  return "";
}

export function Table({ w, rows, compId, qualify }: { w: World; rows: TableRow[]; compId: string; qualify?: number }) {
  const sorted = sortTable(rows.slice());
  return (
    <table className="tbl">
      <thead>
        <tr><th></th><th>#</th><th style={{ textAlign: "left" }}>Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const c = w.clubs[r.club];
          const z = qualify ? (i < qualify ? "up" : "") : zoneFor(compId, i + 1, sorted.length);
          return (
            <tr key={r.club} className={r.club === w.userClubId ? "me" : ""} onClick={() => push({ name: "club", id: r.club })}>
              <td className={`zone ${z}`} />
              <td>{i + 1}</td>
              <td className="team"><span className="row gap8"><Crest club={c} size={18} /><span className="ellipsis" style={{ maxWidth: 130 }}>{c.name}</span></span></td>
              <td className="bold">{r.pts}</td><td>{r.p}</td><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td><td>{r.gf - r.ga}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LeagueView({ w, comp }: { w: World; comp: Competition }) {
  const league = w.fixtures.filter((f) => f.comp === comp.id && f.stage === "league");
  const maxRound = Math.max(1, ...league.map((f) => f.round));
  const current = Math.min(maxRound, Math.max(1, ...league.filter((f) => f.result).map((f) => f.round)));
  const [round, setRound] = useState(current);
  const fx = league.filter((f) => f.round === round);
  const legend: Record<string, [string, string][]> = {
    serieA: [["lib", "Libertadores (1º-6º)"], ["sula", "Sul-Americana (7º-12º)"], ["rel", "Rebaixamento"]],
    serieB: [["up", "Acesso direto"], ["po", "Playoff de acesso"], ["rel", "Rebaixamento"]],
    serieC: [["up", "Mata-mata (quartas = acesso)"], ["rel", "Rebaixamento"]],
  };
  if (comp.id.startsWith("est-")) legend[comp.id] = [["up", "Semifinal (jogo único) e final em ida e volta"]];
  return (
    <>
      <div className="card" style={{ padding: 6 }}>
        <Table w={w} rows={comp.table} compId={comp.id} qualify={comp.id.startsWith("est-") ? 4 : undefined} />
        <div className="row wrap gap8 tiny muted" style={{ padding: 6 }}>
          {legend[comp.id]?.map(([z, l]) => <span key={z} className="row gap4"><i className={`zone ${z}`} style={{ width: 10, height: 10, display: "inline-block", borderRadius: 2 }} />{l}</span>)}
        </div>
      </div>
      {comp.ties.length > 0 && <TieList w={w} comp={comp} />}
      <div className="card flat">
        <div className="row">
          <button className="btn sm" disabled={round <= 1} onClick={() => setRound(round - 1)}>‹</button>
          <b className="grow center">Rodada {round}</b>
          <button className="btn sm" disabled={round >= maxRound} onClick={() => setRound(round + 1)}>›</button>
        </div>
        <div className="list mt8">
          {fx.map((f) => <FixtureLine key={f.id} w={w} f={f} />)}
        </div>
      </div>
    </>
  );
}

function TieRow({ w, t }: { w: World; t: Tie }) {
  const agg = tieAggregate(w, t);
  const A = w.clubs[t.a], B = w.clubs[t.b];
  const last = fixtureById(w, t.fixtures[t.fixtures.length - 1]);
  return (
    <div className="list-item" onClick={() => last?.result && push({ name: "fixture", id: last.id })}>
      <div className="grow col gap4">
        <div className="row gap8"><Crest club={A} size={18} /><span className={`ellipsis ${t.winner === t.a ? "bold" : t.winner ? "muted" : ""}`}>{A.name}</span></div>
        <div className="row gap8"><Crest club={B} size={18} /><span className={`ellipsis ${t.winner === t.b ? "bold" : t.winner ? "muted" : ""}`}>{B.name}</span></div>
      </div>
      <div className="col center kbd bold" style={{ minWidth: 30 }}>
        {agg.played ? <><span>{agg.a}</span><span>{agg.b}</span></> : <span className="tiny muted">{formatDate(w.season, fixtureById(w, t.fixtures[0])!.day, false)}</span>}
      </div>
      {last?.result?.pens && <span className="tiny muted">pên. {last.result.pens[0]}-{last.result.pens[1]}</span>}
      {t.legs === 2 && agg.played === 1 && <span className="tiny muted">ida</span>}
    </div>
  );
}

function TieList({ w, comp }: { w: World; comp: Competition }) {
  const stages = [...new Set(comp.ties.map((t) => t.stage))].reverse();
  return (
    <>
      {stages.map((s) => (
        <div key={s} className="card flat">
          <h3>{STAGE_NAMES[s]}</h3>
          <div className="list mt8">{comp.ties.filter((t) => t.stage === s).map((t) => <TieRow key={t.id} w={w} t={t} />)}</div>
        </div>
      ))}
    </>
  );
}

function CupView({ w, comp }: { w: World; comp: Competition }) {
  return <TieList w={w} comp={comp} />;
}

function GroupsView({ w, comp }: { w: World; comp: Competition }) {
  const user = w.userClubId;
  const groups = comp.groups.slice().sort((a, b) => Number(b.teams.includes(user)) - Number(a.teams.includes(user)));
  return (
    <>
      {comp.ties.length > 0 && <TieList w={w} comp={comp} />}
      {groups.map((g) => (
        <div key={g.name} className="card" style={{ padding: 6 }}>
          <b style={{ padding: 6, display: "block" }}>{g.name}</b>
          <Table w={w} rows={g.table} compId={comp.id} qualify={2} />
        </div>
      ))}
    </>
  );
}

function TopScorers({ w, comp }: { w: World; comp: Competition }) {
  const list = Object.values(w.players)
    .filter((p) => (p.compGoals[comp.id] ?? 0) > 0)
    .sort((a, b) => (b.compGoals[comp.id] ?? 0) - (a.compGoals[comp.id] ?? 0))
    .slice(0, 10);
  if (!list.length) return null;
  return (
    <div className="card">
      <h3>Artilharia</h3>
      <div className="list mt8">
        {list.map((p, i) => (
          <div key={p.id} className="list-item" onClick={() => push({ name: "player", id: p.id })}>
            <span className="muted" style={{ width: 18 }}>{i + 1}</span>
            {p.clubId && <Crest club={w.clubs[p.clubId]} size={18} />}
            <span className="grow ellipsis">{p.name}{p.legend ? " ★" : ""}</span>
            <b>{p.compGoals[comp.id]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
