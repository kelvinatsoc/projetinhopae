import { formatDate } from "../../engine/calendar";
import { COMP_META, leagueOf, nextFixture, sortTable, STAGE_NAMES } from "../../engine/competitions";
import { LEGENDS } from "../../data/legends";
import type { Fixture, NewsItem, World } from "../../engine/types";
import { push, setTab, update, useWorld } from "../../store";
import { Bar, CompLogo, Crest } from "../components";

export function HomeScreen() {
  const w = useWorld();
  const user = w.clubs[w.userClubId];
  const next = nextFixture(w, user.id);
  const league = leagueOf(w, user.id);
  const last = [...w.fixtures].filter((f) => f.result && (f.home === user.id || f.away === user.id)).sort((a, b) => b.day - a.day)[0];
  const appeared = Object.keys(w.legends).length;
  const myLegends = user.players.filter((id) => w.players[id]?.legend).length;

  return (
    <div className="page">
      {next ? <NextMatchCard w={w} f={next} /> : (
        <div className="card center"><b>Sem jogos marcados</b><div className="small muted">Toque em Continuar para encerrar a temporada.</div></div>
      )}

      {last && <LastResult w={w} f={last} />}

      {league && (
        <div className="card tap" onClick={() => setTab("comps")}>
          <div className="card-title"><h3>{league.name}</h3><span className="small muted">ver tabela ›</span></div>
          <MiniTable w={w} compId={league.id} />
        </div>
      )}

      <div className="card">
        <div className="card-title"><h3>Diretoria</h3><span className="small muted">{Math.round(w.board.confidence)}% de confiança</span></div>
        <Bar v={w.board.confidence} />
        <div className="small mt8">🎯 {w.board.objective}</div>
        {w.settings.casual && <div className="tiny muted mt8">Modo casual: sem demissões.</div>}
      </div>

      <div className="card tap" onClick={() => push({ name: "legends" })} style={{ background: "linear-gradient(135deg, #3b2e05, #172a21)" }}>
        <div className="row">
          <div style={{ fontSize: 30 }}>⭐</div>
          <div className="grow">
            <b>Álbum de Lendas</b>
            <div className="small muted">{appeared} de {LEGENDS.length} lendas já renasceram · {myLegends} no seu clube</div>
          </div>
          <span className="muted">›</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h3>Últimas notícias</h3><button className="btn sm ghost" onClick={() => push({ name: "news" })}>ver todas</button></div>
        <div className="list">
          {w.news.slice(0, 4).map((n) => <NewsRow key={n.id} n={n} w={w} />)}
        </div>
      </div>
      <div style={{ height: 40 }} />
    </div>
  );
}

function NextMatchCard({ w, f }: { w: World; f: Fixture }) {
  const comp = w.comps[f.comp];
  const home = w.clubs[f.home];
  const away = w.clubs[f.away];
  const meta = COMP_META[f.comp];
  const days = f.day - w.day;
  const stage = f.stage === "league" ? `Rodada ${f.round}` : f.stage === "group" ? `${comp?.groups[f.group ?? 0]?.name ?? "Grupos"} · ${f.round}ª rodada` : `${STAGE_NAMES[f.stage]}${f.leg ? ` · jogo ${f.leg}` : ""}`;
  return (
    <div className="hero" style={{ background: `linear-gradient(135deg, ${meta.color}cc, ${home.colors[0]}99 60%, ${away.colors[0]}99)` }}>
      <div className="row small" style={{ opacity: 0.9 }}>
        <CompLogo id={f.comp} size={18} /><b>{meta.short}</b><span>· {stage}</span>
        <span className="right">{days === 0 ? "Hoje" : days === 1 ? "Amanhã" : `em ${days} dias`}</span>
      </div>
      <div className="row" style={{ justifyContent: "space-around", margin: "14px 0" }}>
        <div className="col center" style={{ alignItems: "center", width: 120 }}>
          <Crest club={home} size={54} />
          <b className="ellipsis" style={{ maxWidth: 120 }}>{home.name}</b>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, opacity: 0.85 }}>×</div>
        <div className="col center" style={{ alignItems: "center", width: 120 }}>
          <Crest club={away} size={54} />
          <b className="ellipsis" style={{ maxWidth: 120 }}>{away.name}</b>
        </div>
      </div>
      <div className="row small" style={{ opacity: 0.9 }}>
        <span>📅 {formatDate(w.season, f.day)}</span>
        <span className="right ellipsis">🏟️ {f.neutral ? "Campo neutro" : home.stadium}</span>
      </div>
      <div className="row mt12">
        <button className="btn sm" style={{ background: "#0006", color: "#fff", border: 0 }} onClick={() => push({ name: "tactics" })}>⚙️ Tática</button>
        <button className="btn sm" style={{ background: "#0006", color: "#fff", border: 0 }} onClick={() => push({ name: "club", id: f.home === w.userClubId ? f.away : f.home })}>🔎 Adversário</button>
      </div>
    </div>
  );
}

function LastResult({ w, f }: { w: World; f: Fixture }) {
  const r = f.result!;
  const home = w.clubs[f.home], away = w.clubs[f.away];
  const userHome = f.home === w.userClubId;
  const us = userHome ? r.hg : r.ag, them = userHome ? r.ag : r.hg;
  const res = us > them ? "V" : us < them ? "D" : "E";
  const color = res === "V" ? "var(--accent)" : res === "D" ? "var(--danger)" : "var(--warn)";
  return (
    <div className="card tap" onClick={() => push({ name: "fixture", id: f.id })}>
      <div className="card-title"><h3>Último jogo</h3><span className="small" style={{ color, fontWeight: 800 }}>{res === "V" ? "Vitória" : res === "D" ? "Derrota" : "Empate"}</span></div>
      <div className="row">
        <Crest club={home} size={26} />
        <b className="grow ellipsis">{home.name}</b>
        <b style={{ fontSize: 20 }} className="kbd">{r.hg} × {r.ag}</b>
        <b className="grow ellipsis" style={{ textAlign: "right" }}>{away.name}</b>
        <Crest club={away} size={26} />
      </div>
      {r.pens && <div className="small muted center">Pênaltis: {r.pens[0]} × {r.pens[1]}</div>}
    </div>
  );
}

export function MiniTable({ w, compId }: { w: World; compId: string }) {
  const comp = w.comps[compId];
  const rows = sortTable(comp.table.slice());
  const i = rows.findIndex((r) => r.club === w.userClubId);
  const start = Math.max(0, Math.min(rows.length - 5, i - 2));
  return (
    <table className="tbl">
      <tbody>
        {rows.slice(start, start + 5).map((r, k) => {
          const c = w.clubs[r.club];
          return (
            <tr key={r.club} className={r.club === w.userClubId ? "me" : ""}>
              <td style={{ width: 24 }}>{start + k + 1}</td>
              <td className="team"><span className="row gap8"><Crest club={c} size={18} /><span className="ellipsis">{c.name}</span></span></td>
              <td>{r.p}</td>
              <td className="bold">{r.pts}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const ICON: Record<string, string> = { legend: "⭐", youth: "🌱", transfer: "💼", offer: "💰", board: "🏛️", injury: "🚑", contract: "📝", season: "🏆", match: "⚽", info: "📣" };

function NewsRow({ n, w }: { n: NewsItem; w: World }) {
  return (
    <div className="list-item" onClick={() => { update(() => { n.read = true; }); if (n.pid && w.players[n.pid]) push({ name: "player", id: n.pid }); else push({ name: "news" }); }}>
      <span style={{ fontSize: 20 }}>{ICON[n.kind] ?? "📣"}</span>
      <div className="grow">
        <div className={n.read ? "" : "bold"}>{n.title}</div>
        <div className="tiny muted">{formatDate(n.season, n.day)} {n.season}</div>
      </div>
    </div>
  );
}

export function NewsScreen() {
  const w = useWorld();
  return (
    <div className="page">
      <div className="row">
        <h2 className="grow">Notícias</h2>
        <button className="btn sm" onClick={() => update((x) => x.news.forEach((n) => (n.read = true)))}>Marcar todas como lidas</button>
      </div>
      {w.news.map((n) => (
        <div key={n.id} className="card" style={{ borderColor: n.kind === "legend" ? "#8a6a00" : undefined }} onClick={() => update(() => { n.read = true; })}>
          <div className="row">
            <span style={{ fontSize: 22 }}>{ICON[n.kind] ?? "📣"}</span>
            <div className="grow">
              <b>{n.title}</b>
              <div className="tiny muted">{formatDate(n.season, n.day)} {n.season}</div>
            </div>
            {!n.read && <span className="tag good">novo</span>}
          </div>
          {n.body && <p className="small" style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{n.body}</p>}
          {n.pid && w.players[n.pid] && <button className="btn sm mt8" onClick={(e) => { e.stopPropagation(); push({ name: "player", id: n.pid! }); }}>Ver jogador</button>}
        </div>
      ))}
      {!w.news.length && <div className="empty">Nenhuma notícia ainda.</div>}
    </div>
  );
}
