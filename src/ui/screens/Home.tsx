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
import { CompLogo, Crest, Icon, stadiumSrc, visibleColor, Ic, GIcon } from "../components";
import type { IconSlug } from "../icons";
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

  const meters: { label: string; slug: "diretoria" | "torcida" | "vestiario"; v: number; go: () => void }[] = [
    { label: "Diretoria", slug: "diretoria", v: w.board.confidence, go: () => push({ name: "board" }) },
    { label: "Torcida", slug: "torcida", v: fanMood(w), go: () => push({ name: "inbox" }) },
    { label: "Entrosamento", slug: "vestiario", v: chemOf(w, user), go: () => push({ name: "dressing" }) },
  ];
  const shortcuts: { label: string; slug: IconSlug; go: () => void; count?: number }[] = [
    { label: "Tática", slug: "tatica", go: () => push({ name: "tactics" }) },
    { label: "Treino", slug: "treino", go: () => push({ name: "training" }) },
    { label: "Mensagens", slug: "caixa-entrada", go: () => push({ name: "inbox" }), count: unread },
    { label: "Base", slug: "base", go: () => push({ name: "youth" }) },
    { label: "Vestiário", slug: "vestiario", go: () => push({ name: "dressing" }) },
    { label: "Finanças", slug: "financas", go: () => push({ name: "finances" }) },
    { label: "Carreira", slug: "carreira", go: () => push({ name: "career" }), count: offers },
    { label: "Lendas", slug: "lendas", go: () => push({ name: "legends" }) },
  ];

  return (
    <div className="page home">
      {next ? <NextMatchCard w={w} f={next} /> : (
        <section className="ui-card empty-hero">
          <Icon name="calendar" size={36} />
          <h2>Sem jogos marcados</h2>
          <p className="t-2">Toque em Continuar para encerrar a temporada.</p>
        </section>
      )}

      <section className="ui-card status" aria-labelledby="st-h">
        <div className="sec-head"><h3 id="st-h">Momento do clube</h3><FormPills w={w} clubId={user.id} /></div>
        <ul className="meters">
          {meters.map((m) => (
            <li key={m.label}>
              <button className="meter" onClick={m.go} aria-label={`${m.label}: ${Math.round(m.v)} de 100`}>
                <span className="meter-ic"><GIcon slug={m.slug} size={20} /></span>
                <span className="meter-txt"><span>{m.label}</span><b className="num">{Math.round(m.v)}</b></span>
                <span className="meter-bar" aria-hidden="true"><i className={m.v >= 66 ? "ok" : m.v >= 40 ? "mid" : "low"} style={{ width: `${Math.max(3, Math.min(100, m.v))}%` }} /></span>
              </button>
            </li>
          ))}
        </ul>
        <p className="objective"><Ic n="target" /> <span><b>Meta:</b> {w.board.objective}{w.settings.casual ? " · modo casual" : ""}</span></p>
      </section>

      <nav className="shortcuts" aria-label="Atalhos">
        {shortcuts.map((s) => (
          <button key={s.label} className="shortcut" onClick={s.go} aria-label={s.count ? `${s.label} (${s.count})` : s.label}>
            <span className="shortcut-ic"><GIcon slug={s.slug} size={26} /></span>
            <span className="shortcut-lb">{s.label}</span>
            {!!s.count && <span className="count" aria-hidden="true">{Math.min(s.count, 99)}</span>}
          </button>
        ))}
      </nav>

      <PeneiraHomeCard />
      <SquadMoodHomeCard />
      <BoardHomeCard />

      {last && <LastResult w={w} f={last} />}

      {league && (
        <section className="ui-card">
          <div className="sec-head"><h3>{league.name}</h3><button className="link" onClick={() => setTab("comps")}>Ver tabela</button></div>
          <MiniTable w={w} compId={league.id} />
        </section>
      )}

      <div className="sec-head"><h3>Últimas notícias</h3><button className="link" onClick={() => push({ name: "news" })}>Ver todas</button></div>
      <div className="hscroll">
        {w.news.slice(0, 6).map((n) => <NewsCard key={n.id} n={n} w={w} />)}
        {!w.news.length && <div className="news-card"><span className="ic"><Icon name="news" /></span><b>Nenhuma notícia ainda</b><span className="tiny muted">A imprensa está de olho no seu trabalho.</span></div>}
      </div>

      <button className="ui-card legends-card" onClick={() => push({ name: "legends" })}>
        <span className="legends-ic"><GIcon slug="lendas" size={28} /></span>
        <span className="grow">
          <b>Álbum de Lendas</b>
          <span className="t-2">{appeared} de {LEGENDS.length} lendas já renasceram · {myLegends} no seu clube</span>
        </span>
        <Icon name="chev" size={20} />
      </button>
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
  const photo = f.neutral ? null : stadiumSrc(home);
  const stage = f.stage === "league" ? `Rodada ${f.round}` : f.stage === "group" ? `${comp?.groups[f.group ?? 0]?.name ?? "Grupos"} · ${f.round}ª rodada` : `${STAGE_NAMES[f.stage]}${f.leg ? ` · jogo ${f.leg}` : ""}`;
  const tv = broadcasters(f);
  return (
    <section className="ui-card next-match" aria-label="Próximo jogo" style={{ "--h": visibleColor(home.colors), "--a": visibleColor(away.colors) } as CSSProperties}>
      <div className="nm-media">
        {photo && <img src={photo} alt="" decoding="async" />}
        <div className="nm-badges">
          <span className="pill"><CompLogo id={f.comp} size={16} /> {meta.short} · {stage}</span>
          <span className={`pill dot when${days === 0 ? " today" : ""}`}>{days === 0 ? "Hoje" : days === 1 ? "Amanhã" : `Em ${days} dias`}</span>
        </div>
      </div>
      <div className="nm-teams">
        <div className="nm-team"><Crest club={home} size={60} /><b>{home.name}</b><span className="t-3">Mandante</span></div>
        <div className="nm-vs" aria-hidden="true">×</div>
        <div className="nm-team"><Crest club={away} size={60} /><b>{away.name}</b><span className="t-3">Visitante</span></div>
      </div>
      <ul className="nm-info">
        <li><Icon name="calendar" size={16} />{formatDate(w.season, f.day)}</li>
        <li className="ellipsis"><Icon name="stadium" size={16} />{f.neutral ? "Campo neutro" : stadiumName(w, home)}</li>
        {tv.length > 0 && <li className="ellipsis"><Icon name="tv" size={16} />{tv.join(" · ")}</li>}
      </ul>
      <div className="nm-actions">
        <button className="btn" onClick={() => push({ name: "tactics" })}><GIcon slug="tatica" size={20} />Escalação</button>
        <button className="btn" onClick={() => push({ name: "club", id: opp.id })}><Icon name="scout" size={20} />Ver {opp.name.length > 12 ? opp.abbr : opp.name}</button>
      </div>
    </section>
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
