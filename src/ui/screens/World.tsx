// Mundo: navegador de competições por região, torneios de seleções e telas das seleções.
import { useState } from "react";
import { formatDate } from "../../engine/calendar";
import { sortTable, STAGE_NAMES } from "../../engine/competitions";
import { intlKind, pickSquad } from "../../engine/international";
import type { Club, Competition, Fixture, MatchResult, NationalTeam, TableRow, World } from "../../engine/types";
import { acceptNtJob, declineNtJob, eligible, playNtMatch, resignNtJob, toggleSquad, toggleXI } from "../../engine/ntManager";
import { autosave } from "../actions";
import { back, push, update, useWorld } from "../../store";
import { CompHeader } from "../CompTheme";
import { compTheme } from "../compThemes";
import { Crest, Ovr } from "../components";
import { flag } from "../flags";

export type CompRegion = "BRA" | "CONT" | "UEFA" | "WORLD" | "INT";
export const REGIONS: { id: CompRegion; label: string }[] = [
  { id: "BRA", label: "🇧🇷 Brasil" },
  { id: "CONT", label: "🌎 Continentais" },
  { id: "UEFA", label: "🇪🇺 Europa" },
  { id: "WORLD", label: "🌏 Outras ligas" },
  { id: "INT", label: "🏳️ Seleções" },
];

/** Região de uma competição de clubes no navegador. */
export function compRegion(c: Competition): CompRegion {
  if (["liberta", "sula", "ucl", "uel", "acle", "cwc", "intercontinental"].includes(c.id)) return "CONT";
  if (!c.region || c.region === "BRA") return "BRA";
  if (c.region === "UEFA") return "UEFA";
  return "WORLD";
}

export function RegionChips({ regions, region, setRegion }: { regions: typeof REGIONS; region: CompRegion; setRegion: (r: CompRegion) => void }) {
  return (
    <div className="chips">
      {regions.map((r) => (
        <button key={r.id} className={`chip${region === r.id ? " active" : ""}`} onClick={() => setRegion(r.id)}>{r.label}</button>
      ))}
    </div>
  );
}

/** Seleção como "clube" só para desenhar o escudo (cores e logo oficial em crests/nt-XXX.webp). */
export function ntCrestClub(nt: NationalTeam): Club {
  return { id: nt.id, name: nt.name, abbr: nt.fifa, colors: nt.colors, crest: "solid", logo: nt.logo } as unknown as Club;
}

function NtBadge({ w, id, bold }: { w: World; id: string; bold?: boolean }) {
  const nt = w.intl!.nts[id];
  if (!nt) return <span>{id}</span>;
  return (
    <span className="row gap8" onClick={(e) => { e.stopPropagation(); push({ name: "nt", id }); }} style={{ cursor: "pointer" }}>
      <span style={{ fontSize: 16 }}>{flag(nt.fifa)}</span>
      <span className={`ellipsis ${bold ? "bold" : ""}`}>{nt.name}</span>
    </span>
  );
}

// ---------------------------------------------------------------- torneios de seleções
export function IntlBrowser({ w }: { w: World }) {
  const intl = w.intl!;
  const comps = Object.values(intl.comps).sort((a, b) => order(a) - order(b));
  const [sel, setSel] = useState<string>(comps[0]?.id ?? "");
  const comp = intl.comps[sel] ?? comps[0];
  return (
    <>
      <div className="chips">
        {comps.map((c) => (
          <button key={c.id} className={`chip${comp?.id === c.id ? " active" : ""}`} onClick={() => setSel(c.id)}>{c.short} {c.label}</button>
        ))}
        <button className="chip" onClick={() => push({ name: "nts" })}>🌍 Todas as seleções</button>
      </div>
      {comp && <IntlCompView w={w} comp={comp} />}
      {!comp && <div className="empty">Nenhum torneio de seleções no momento.</div>}
      {intl.honors.length > 0 && (
        <div className="card">
          <h3>Campeões</h3>
          <div className="list mt8">
            {intl.honors.slice().reverse().map((h) => (
              <div key={`${h.comp}${h.season}`} className="list-item"><span className="muted" style={{ width: 90 }}>{h.name.replace("FIFA", "")} {h.season}</span><NtBadge w={w} id={h.winner} bold /></div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const order = (c: Competition) => ({ wc: 0, euro: 1, ca: 2, wcq: 3, euroq: 4, fr: 5 } as Record<string, number>)[intlKind(c.id)] ?? 6;

function IntlCompView({ w, comp }: { w: World; comp: Competition }) {
  const intl = w.intl!;
  const fx = intl.fixtures.filter((f) => f.comp === comp.id);
  return (
    <>
      <CompHeader id={comp.id} title={`${comp.name} ${comp.label ?? comp.season}`} sub={compTheme(comp.id, comp.color).motto} right={<span className="ct-pill">{STAGE_NAMES[comp.stage] ?? comp.stage}</span>} />
      {comp.champion && <div className="card row" style={{ borderColor: "var(--gold)" }}><span style={{ fontSize: 26 }}>🏆</span><NtBadge w={w} id={comp.champion} bold /><span className="muted small">campeã</span></div>}
      {comp.ties.length > 0 && [...new Set(comp.ties.map((t) => t.stage))].reverse().map((s) => (
        <div key={s} className="card flat">
          <h3>{STAGE_NAMES[s] ?? s}</h3>
          <div className="list mt8">{fx.filter((f) => f.stage === s).map((f) => <IntlFixtureLine key={f.id} w={w} f={f} />)}</div>
        </div>
      ))}
      {comp.format === "league" && <div className="card" style={{ padding: 6 }}><IntlTable w={w} rows={comp.table} qualify={6} /></div>}
      {comp.groups.map((g) => (
        <div key={g.name} className="card" style={{ padding: 6 }}>
          <b style={{ padding: 6, display: "block" }}>{g.name}</b>
          <IntlTable w={w} rows={g.table} qualify={2} />
        </div>
      ))}
      {(comp.format !== "groups" || !comp.ties.length) && <RecentIntl w={w} list={fx.filter((f) => !f.tie)} />}
      <IntlScorers w={w} comp={comp} />
    </>
  );
}

function RecentIntl({ w, list }: { w: World; list: Fixture[] }) {
  const sorted = list.slice().sort((a, b) => b.day - a.day);
  const shown = [...sorted.filter((f) => !f.result).reverse().slice(0, 12), ...sorted.filter((f) => f.result).slice(0, 24)];
  if (!shown.length) return null;
  return (
    <div className="card flat">
      <h3>Jogos</h3>
      <div className="list mt8">{shown.map((f) => <IntlFixtureLine key={f.id} w={w} f={f} />)}</div>
    </div>
  );
}

function IntlFixtureLine({ w, f }: { w: World; f: Fixture }) {
  const r = f.result;
  return (
    <div className="list-item">
      <div style={{ width: 52 }} className="tiny muted">{formatDate(w.season, f.day, false)}</div>
      <div className="grow col gap4">
        <NtBadge w={w} id={f.home} bold={!!r && r.hg > r.ag} />
        <NtBadge w={w} id={f.away} bold={!!r && r.ag > r.hg} />
      </div>
      <div className="col center kbd" style={{ minWidth: 34, fontWeight: 800 }}>
        {r ? <><span>{r.hg}</span><span>{r.ag}</span></> : <span className="tiny muted">—</span>}
      </div>
      {r?.pens && <span className="tiny muted">({r.pens[0]}-{r.pens[1]} pên.)</span>}
    </div>
  );
}

function IntlTable({ w, rows, qualify }: { w: World; rows: TableRow[]; qualify: number }) {
  const sorted = sortTable(rows.slice());
  return (
    <table className="tbl">
      <thead><tr><th></th><th>#</th><th style={{ textAlign: "left" }}>Seleção</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={r.club} className={r.club === "nt-BRA" ? "me" : ""} onClick={() => push({ name: "nt", id: r.club })}>
            <td className={`zone ${i < qualify ? "up" : ""}`} />
            <td>{i + 1}</td>
            <td className="team"><NtBadge w={w} id={r.club} /></td>
            <td className="bold">{r.pts}</td><td>{r.p}</td><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td><td>{r.gf - r.ga}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IntlScorers({ w, comp }: { w: World; comp: Competition }) {
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
            <span>{flag(p.nat)}</span>
            <span className="grow ellipsis">{p.name}</span>
            <b>{p.compGoals[comp.id]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- seleções
const CONFEDS = ["CONMEBOL", "UEFA", "CONCACAF", "AFC", "CAF", "OFC"];

export function NationalTeamsScreen() {
  const w = useWorld();
  const nts = Object.values(w.intl?.nts ?? {});
  if (!nts.length) return <div className="page"><div className="empty">Sem seleções neste jogo.</div></div>;
  return (
    <div className="page">
      <NtJobCard />
      {CONFEDS.map((cf) => {
        const list = nts.filter((n) => n.confed === cf).sort((a, b) => b.level - a.level);
        if (!list.length) return null;
        return (
          <div key={cf} className="card flat">
            <h3>{cf}</h3>
            <div className="list mt8">
              {list.map((n) => (
                <div key={n.id} className="list-item" onClick={() => push({ name: "nt", id: n.id })}>
                  <span style={{ fontSize: 20 }}>{flag(n.fifa)}</span>
                  <span className="grow ellipsis">{n.name}{w.intl!.callups[n.id] ? " · convocada" : ""}</span>
                  <span className="tiny muted">{n.form.join(" ")}</span>
                  {n.trophies.length > 0 && <span>🏆{n.trophies.length}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NationalTeamScreen({ id }: { id: string }) {
  const w = useWorld();
  const intl = w.intl;
  const nt = intl?.nts[id];
  if (!intl || !nt) return <div className="page"><div className="empty">Seleção não encontrada.</div></div>;
  const called = (intl.callups[id] ?? []).map((pid) => w.players[pid]).filter(Boolean);
  // sem convocação ativa: os destaques da nacionalidade (por overall)
  const stars = called.length ? called : Object.values(w.players).filter((p) => p.nat === nt.fifa && p.clubId && !p.youth).sort((a, b) => b.ovr - a.ovr).slice(0, 23);
  const games = intl.fixtures.filter((f) => f.home === id || f.away === id).sort((a, b) => a.day - b.day);
  return (
    <div className="page">
      <div className="card row gap12">
        <Crest club={ntCrestClub(nt)} size={44} />
        <div className="grow">
          <h2 style={{ margin: 0 }}>{flag(nt.fifa)} {nt.name}</h2>
          <div className="muted small">{nt.confed} · força {nt.level} · últimos: {nt.form.join(" ") || "—"}</div>
        </div>
      </div>
      {nt.trophies.length > 0 && (
        <div className="card"><h3>Títulos</h3>{nt.trophies.map((t, i) => <div key={i} className="small">🏆 {t.name}</div>)}</div>
      )}
      {games.length > 0 && (
        <div className="card flat"><h3>Jogos</h3><div className="list mt8">{games.map((f) => <IntlFixtureLine key={f.id} w={w} f={f} />)}</div></div>
      )}
      {w.ntJob === id && <SquadPicker w={w} id={id} />}
      <div className="card flat">
        <h3>{called.length ? `Convocados (${called.length})` : "Principais jogadores"}</h3>
        <div className="list mt8">
          {stars.map((p) => (
            <div key={p.id} className="list-item" onClick={() => push({ name: "player", id: p.id })}>
              <Ovr v={p.ovr} />
              <span className="tiny muted" style={{ width: 30 }}>{p.pos}</span>
              <span className="grow ellipsis">{p.name}</span>
              {p.clubId && w.clubs[p.clubId] && <Crest club={w.clubs[p.clubId]} size={18} />}
              <span className="tiny muted">{p.caps ?? 0} j · {p.intGoals ?? 0} g</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- técnico de seleção
/** Convite (aceitar/recusar) ou o cargo atual na seleção. */
export function NtJobCard() {
  const w = useWorld();
  const intl = w.intl;
  if (!intl) return null;
  if (w.ntJob) {
    const nt = intl.nts[w.ntJob];
    return (
      <div className="card row gap8" onClick={() => push({ name: "nt", id: w.ntJob! })} style={{ cursor: "pointer" }}>
        <span style={{ fontSize: 24 }}>{flag(nt.fifa)}</span>
        <div className="grow"><b>Técnico da seleção ({nt.name})</b><div className="small muted">Toque para convocar e ver os jogos.</div></div>
      </div>
    );
  }
  const o = intl.offer;
  if (!o) return null;
  const nt = intl.nts[o.nt];
  return (
    <div className="card" style={{ borderColor: "var(--gold)" }}>
      <div className="row gap8"><span style={{ fontSize: 24 }}>{flag(nt.fifa)}</span><b className="grow">Convite: técnico da seleção ({nt.name})</b></div>
      <div className="small muted mt8">Você acumula o cargo com o clube. Os jogos da seleção param o Continuar.</div>
      <div className="row gap8 mt8">
        <button className="btn primary" onClick={() => { update((x) => { acceptNtJob(x); }); autosave(); }}>Aceitar</button>
        <button className="btn" onClick={() => update((x) => declineNtJob(x))}>Recusar</button>
      </div>
    </div>
  );
}

/** Convocação manual (até 26) da seleção do usuário. */
function SquadPicker({ w, id }: { w: World; id: string }) {
  const intl = w.intl!;
  const squad = new Set(intl.userSquad ?? []);
  const list = eligible(w, id).slice(0, 60);
  return (
    <div className="card flat">
      <div className="row"><h3 className="grow">Sua convocação ({squad.size}/26)</h3>
        <button className="btn sm" onClick={() => update((x) => { x.intl!.userSquad = pickSquad(x, x.intl!.nts[id], 26).map((p) => p.id); })}>Automática</button>
      </div>
      <div className="small muted">Vale a partir da próxima data FIFA ou torneio.</div>
      <div className="list mt8">
        {list.map((p) => (
          <div key={p.id} className="list-item" onClick={() => update((x) => toggleSquad(x, p.id))}>
            <input type="checkbox" readOnly checked={squad.has(p.id)} />
            <Ovr v={p.ovr} />
            <span className="tiny muted" style={{ width: 30 }}>{p.pos}</span>
            <span className="grow ellipsis">{p.name}{p.injury > 0 ? " 🚑" : ""}</span>
            {p.clubId && w.clubs[p.clubId] && <Crest club={w.clubs[p.clubId]} size={18} />}
          </div>
        ))}
      </div>
      <button className="btn sm mt8" onClick={() => { if (confirm("Deixar a seleção?")) update((x) => resignNtJob(x)); }}>Pedir demissão da seleção</button>
    </div>
  );
}

/** Jogo da seleção do usuário: escolher os 11, a postura e jogar. */
export function NtMatchScreen({ id }: { id: number }) {
  const w = useWorld();
  const intl = w.intl;
  const [mentality, setMentality] = useState<-1 | 0 | 1>(0);
  const [result, setResult] = useState<MatchResult | null>(null);
  const f = intl?.fixtures.find((x) => x.id === id);
  if (!intl || !f || !w.ntJob) return <div className="page"><div className="empty">Jogo não encontrado.</div></div>;
  const squad = (intl.callups[w.ntJob] ?? []).map((pid) => w.players[pid]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const xi = new Set(intl.userXI ?? []);
  const comp = intl.comps[f.comp];
  const r = result ?? f.result;
  const ntNm = (nid: string) => intl.nts[nid]?.name ?? nid;
  return (
    <div className="page">
      <CompHeader id={f.comp} title={`${comp?.name ?? ""} ${comp?.label ?? ""}`} sub={STAGE_NAMES[f.stage] ?? ""} />
      <div className="card row gap12" style={{ justifyContent: "center" }}>
        <NtBadge w={w} id={f.home} bold />
        <b className="kbd" style={{ fontSize: 22 }}>{r ? `${r.hg} x ${r.ag}` : "x"}</b>
        <NtBadge w={w} id={f.away} bold />
      </div>
      {r ? (
        <div className="card">
          <h3>Gols</h3>
          {r.events.filter((e) => e.type === "goal").map((e, i) => <div key={i} className="small">{e.min}' {e.pid != null ? w.players[e.pid]?.name : ""} ({ntNm(e.side === 0 ? f.home : f.away)})</div>)}
          {r.pens && <div className="small">Pênaltis: {r.pens[0]} x {r.pens[1]}</div>}
          <button className="btn primary mt8" onClick={() => back()}>Continuar</button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="seg">
              {([[-1, "Defensivo"], [0, "Equilibrado"], [1, "Ofensivo"]] as const).map(([m, l]) => (
                <button key={m} className={mentality === m ? "active" : ""} onClick={() => setMentality(m)}>{l}</button>
              ))}
            </div>
            <button className="btn primary mt8" style={{ width: "100%" }} onClick={() => {
              let res: MatchResult | null = null;
              update((x) => { const fx = x.intl!.fixtures.find((y) => y.id === id)!; res = playNtMatch(x, fx, mentality); });
              setResult(res);
              autosave();
            }}>Jogar</button>
          </div>
          <div className="card flat">
            <h3>Titulares ({xi.size}/11, o resto é completado automaticamente)</h3>
            <div className="list mt8">
              {squad.map((p) => (
                <div key={p.id} className="list-item" onClick={() => update((x) => toggleXI(x, p.id))}>
                  <input type="checkbox" readOnly checked={xi.has(p.id)} />
                  <Ovr v={p.ovr} />
                  <span className="tiny muted" style={{ width: 30 }}>{p.pos}</span>
                  <span className="grow ellipsis">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
