import type { CSSProperties } from "react";
import { formatDate } from "../../engine/calendar";
import { COMP_META, leagueOf, nextFixture, sortTable, STAGE_NAMES } from "../../engine/competitions";
import { chemOf } from "../../engine/dressing";
import { inboxUnread } from "../../engine/inbox";
import { fanMood } from "../../engine/narrative";
import { LEGENDS } from "../../data/legends";
import type { Fixture, NewsItem, World } from "../../engine/types";
import { push, setTab, update, useWorld } from "../../store";
import { broadcasters, newsSource } from "../../engine/outlets";
import { stadiumName } from "../../engine/sponsors";
import { CompLogo, Crest, Icon, stadiumSrc, visibleColor } from "../components";
import { PeneiraHomeCard } from "./Academy";
import { BoardHomeCard } from "./Board";
import { SquadMoodHomeCard } from "./Dressing";

/** Últimos resultados do clube (mais recente por último). */
function formOf(w: World, clubId: string, n = 5): ("V" | "E" | "D")[] {
  return w.fixtures
    .filter((f) => f.result && (f.home === clubId || f.away === clubId))
    .sort((a, b) => a.day - b.day)
    .slice(-n)
    .map((f) => {
      const r = f.result!;
      const us = f.home === clubId ? r.hg : r.ag, them = f.home === clubId ? r.ag : r.hg;
      return us > them ? "V" : us < them ? "D" : "E";
    });
}

export function FormPills({ w, clubId }: { w: World; clubId: string }) {
  const form = formOf(w, clubId);
  return (
    <div className="form-row" aria-label="Últimos jogos">
      {Array.from({ length: 5 }, (_, i) => {
        const r = form[i - (5 - form.length)];
        return <span key={i} className={`form-pill ${r ?? "none"}`}>{r ?? "·"}</span>;
      })}
    </div>
  );
}

/** Anel de progresso animado (0-100). */
export function Ring({ v, size = 58, color }: { v: number; size?: number; color?: string }) {
  const r = size / 2 - 5;
  const full = 2 * Math.PI * r;
  const val = Math.max(0, Math.min(100, v));
  const col = color ?? (val >= 66 ? "#1fbf68" : val >= 40 ? "#f5a524" : "#e5484d");
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={6} />
        <circle className="v" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={full} strokeDashoffset={full * (1 - val / 100)} style={{ "--full": full } as CSSProperties} />
      </svg>
      <b>{Math.round(val)}</b>
    </div>
  );
}

export function HomeScreen() {
  const w = useWorld();
  const user = w.clubs[w.userClubId];
  const next = nextFixture(w, user.id);
  const league = leagueOf(w, user.id);
  const last = [...w.fixtures].filter((f) => f.result && (f.home === user.id || f.away === user.id)).sort((a, b) => b.day - a.day)[0];
  const appeared = Object.keys(w.legends).length;
  const myLegends = user.players.filter((id) => w.players[id]?.legend).length;
  const unread = inboxUnread(w);
  const offers = w.career?.offers.length ?? 0;

  const stadium = stadiumSrc(user);

  return (
    <div className="page home-page">
      {stadium && (
        <div className="home-stadium" aria-hidden="true">
          <img src={stadium} alt="" decoding="async" />
        </div>
      )}
      {next ? <NextMatchCard w={w} f={next} /> : (
        <div className="match-hero center" style={{ "--h": visibleColor(user.colors), "--a": "#1f6fd1" } as CSSProperties}>
          <div style={{ fontSize: 44 }}>🏁</div>
          <h2>Sem jogos marcados</h2>
          <div className="small" style={{ opacity: 0.85 }}>Toque em Continuar para encerrar a temporada.</div>
        </div>
      )}

      <div className="row">
        <h3 className="grow">Forma</h3>
        <FormPills w={w} clubId={user.id} />
      </div>

      <div className="rings">
        <div className="ring-card" onClick={() => push({ name: "board" })}>
          <Ring v={w.board.confidence} />
          <span>Diretoria</span>
        </div>
        <div className="ring-card" onClick={() => push({ name: "inbox" })}>
          <Ring v={fanMood(w)} />
          <span>Torcida</span>
        </div>
        <div className="ring-card" onClick={() => push({ name: "dressing" })}>
          <Ring v={chemOf(w, user)} />
          <span>Entrosamento</span>
        </div>
      </div>
      <div className="small muted" style={{ marginTop: -6, padding: "0 4px" }}>🎯 {w.board.objective}{w.settings.casual ? " · modo casual" : ""}</div>

      <PeneiraHomeCard />
      <SquadMoodHomeCard />
      <BoardHomeCard />

      <div className="quick">
        <button onClick={() => push({ name: "tactics" })}><span className="qi"><Icon name="board" /></span>Tática</button>
        <button onClick={() => push({ name: "training" })}><span className="qi"><Icon name="dumbbell" /></span>Treino</button>
        <button onClick={() => push({ name: "inbox" })} data-count={unread > 0 ? Math.min(unread, 99) : undefined}><span className="qi"><Icon name="mail" /></span>Mensagens</button>
        <button onClick={() => push({ name: "youth" })}><span className="qi"><Icon name="sprout" /></span>Base</button>
        <button onClick={() => push({ name: "dressing" })}><span className="qi"><Icon name="shirt" /></span>Vestiário</button>
        <button onClick={() => push({ name: "finances" })}><span className="qi"><Icon name="coins" /></span>Finanças</button>
        <button onClick={() => push({ name: "career" })} data-count={offers > 0 ? offers : undefined}><span className="qi"><Icon name="briefcase" /></span>Carreira</button>
        <button onClick={() => push({ name: "legends" })}><span className="qi"><Icon name="star" /></span>Lendas</button>
      </div>

      {last && <LastResult w={w} f={last} />}

      {league && (
        <div className="card tap" onClick={() => setTab("comps")}>
          <div className="card-title"><h3>{league.name}</h3><span className="small muted">ver tabela ›</span></div>
          <MiniTable w={w} compId={league.id} />
        </div>
      )}

      <div className="section-head"><h3>Últimas notícias</h3><button onClick={() => push({ name: "news" })}>ver todas ›</button></div>
      <div className="hscroll">
        {w.news.slice(0, 6).map((n) => <NewsCard key={n.id} n={n} w={w} />)}
        {!w.news.length && <div className="news-card"><span className="ic">📰</span><b>Nenhuma notícia ainda</b><span className="tiny muted">A imprensa está de olho no seu trabalho.</span></div>}
      </div>

      <div className="card tap" onClick={() => push({ name: "legends" })} style={{ background: "linear-gradient(135deg, rgba(120,90,10,0.55), var(--card))", borderColor: "rgba(255,207,63,0.35)" }}>
        <div className="row">
          <div style={{ fontSize: 32 }}>⭐</div>
          <div className="grow">
            <b className="display" style={{ fontSize: 19 }}>Álbum de Lendas</b>
            <div className="small muted">{appeared} de {LEGENDS.length} lendas já renasceram · {myLegends} no seu clube</div>
          </div>
          <span className="muted">›</span>
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
  const opp = f.home === w.userClubId ? away : home;
  const stage = f.stage === "league" ? `Rodada ${f.round}` : f.stage === "group" ? `${comp?.groups[f.group ?? 0]?.name ?? "Grupos"} · ${f.round}ª rodada` : `${STAGE_NAMES[f.stage]}${f.leg ? ` · jogo ${f.leg}` : ""}`;
  return (
    <div className="match-hero" style={{ "--h": `${visibleColor(home.colors)}cc`, "--a": `${visibleColor(away.colors)}cc` } as CSSProperties}>
      <div className="mh-top">
        <CompLogo id={f.comp} size={20} /><b>{meta.short}</b><span style={{ opacity: 0.8 }}>· {stage}</span>
        <span className={`mh-when${days === 0 ? " today" : ""}`}>{days === 0 ? "Hoje" : days === 1 ? "Amanhã" : `em ${days} dias`}</span>
      </div>
      <div className="mh-teams">
        <div className="mh-team"><Crest club={home} size={74} /><b>{home.name}</b></div>
        <div className="mh-vs">VS</div>
        <div className="mh-team"><Crest club={away} size={74} /><b>{away.name}</b></div>
      </div>
      <div className="mh-info">
        <span className="ico-txt"><Icon name="calendar" size={15} />{formatDate(w.season, f.day)}</span>
        <span className="ellipsis ico-txt" style={{ maxWidth: "60%" }}><Icon name="stadium" size={15} />{f.neutral ? "Campo neutro" : stadiumName(w, home)}</span>
      </div>
      {broadcasters(f).length > 0 && <div className="mh-info"><span className="ico-txt"><Icon name="tv" size={15} />{broadcasters(f).join(" · ")}</span></div>}
      <div className="mh-actions">
        <button onClick={() => push({ name: "tactics" })}><Icon name="board" size={18} />Escalação</button>
        <button onClick={() => push({ name: "club", id: opp.id })}><Icon name="scout" size={18} />{opp.name.length > 12 ? opp.abbr : opp.name}</button>
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

const ICON: Record<string, string> = { legend: "⭐", youth: "🌱", transfer: "💼", offer: "💰", board: "🏛️", injury: "🚑", contract: "📝", season: "🏆", match: "⚽", info: "📣", training: "🏋️", staff: "👔", scout: "🔭", dressing: "💬", admin: "🛠️" };

function NewsCard({ n, w }: { n: NewsItem; w: World }) {
  return (
    <div className={`news-card${n.read ? "" : " unread"}`} onClick={() => { update(() => { n.read = true; }); if (n.pid && w.players[n.pid]) push({ name: "player", id: n.pid }); else push({ name: "news" }); }}>
      <span className="ic">{ICON[n.kind] ?? "📣"}</span>
      <b>{n.title}</b>
      <span className="tiny muted">{formatDate(n.season, n.day)} {n.season}{n.read ? "" : " · novo"}</span>
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
              <div className="tiny muted">{newsSource(w, n) ? `📰 ${newsSource(w, n)} · ` : ""}{formatDate(n.season, n.day)} {n.season}</div>
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
