import type { CSSProperties } from "react";
import { formatDate } from "../../engine/calendar";
import { COMP_META, leagueOf, nextFixture, sortTable } from "../../engine/competitions";
import { chemOf, dynDelta, squadMood } from "../../engine/dressing";
import { fanMood } from "../../engine/narrative";
import { LEGENDS } from "../../data/legends";
import { clubStrength } from "../../engine/lineup";
import type { Fixture, World } from "../../engine/types";
import { push, setTab, update, useWorld } from "../../store";
import { broadcasters, newsSource } from "../../engine/outlets";
import { stadiumName } from "../../engine/sponsors";
import { continueGame } from "../actions";
import { matchPhase, PhaseBanner } from "../MatchPhase";
import { CompLogo, Crest, DeltaTag, Icon, stadiumSrc, visibleColor, Ic, GIcon } from "../components";
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

export function FormPills({ w, clubId, count = 5 }: { w: World; clubId: string; count?: number }) {
  const form = formOf(w, clubId, count);
  return (
    <div className="form-row" aria-label="Últimos jogos">
      {Array.from({ length: count }, (_, i) => {
        const r = form[i - (count - form.length)];
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
  const offers = w.career?.offers.length ?? 0;
  const youthCount = user.players.filter((id) => w.players[id]?.youth).length;

  const meters: { label: string; slug: IconSlug; v: number; key: "board" | "fan" | "chem" | "mood"; go: () => void }[] = [
    { label: "Diretoria", slug: "diretoria", key: "board", v: w.board.confidence, go: () => push({ name: "board" }) },
    { label: "Torcida", slug: "torcida", key: "fan", v: fanMood(w), go: () => push({ name: "inbox" }) },
    { label: "Entrosamento", slug: "tatica", key: "chem", v: chemOf(w, user), go: () => push({ name: "dressing" }) },
    { label: "Clima Grupo", slug: "vestiario", key: "mood", v: squadMood(w, user), go: () => push({ name: "dressing" }) },
  ];

  const quickActions: { label: string; sub: string; slug: IconSlug; go: () => void; badge?: number }[] = [
    { label: "Base", sub: `${youthCount} jovens`, slug: "base", go: () => push({ name: "youth" }) },
    { label: "Treino", sub: "Foco & evolução", slug: "treino", go: () => push({ name: "training" }) },
    { label: "Vestiário", sub: `${Math.round(squadMood(w, user))}% moral`, slug: "vestiario", go: () => push({ name: "dressing" }) },
    offers > 0
      ? { label: "Carreira", sub: `${offers} oferta${offers > 1 ? "s" : ""}`, slug: "carreira", go: () => push({ name: "career" }), badge: offers }
      : { label: "Lendas", sub: `${appeared}/${LEGENDS.length}`, slug: "lendas", go: () => push({ name: "legends" }), badge: myLegends || undefined },
  ];

  const topNews = w.news[0];

  return (
    <div className="page home">
      {next ? <NextMatchCard w={w} f={next} /> : (
        <section className="ui-card empty-hero">
          <Icon name="calendar" size={36} />
          <h2>Sem jogos marcados</h2>
          <p className="t-2">Toque em Continuar para encerrar a temporada.</p>
          <button className="btn primary" style={{ marginTop: 8 }} onClick={continueGame}>
            <Icon name="play" size={16} /> Continuar Temporada
          </button>
        </section>
      )}

      <section className="ui-card status-compact" aria-labelledby="st-h">
        <div className="sec-head">
          <h3 id="st-h">Pulso do Clube</h3>
          <FormPills w={w} clubId={user.id} />
        </div>
        <div className="pulse-strip">
          {meters.map((m) => {
            const d = dynDelta(w, m.key, m.v);
            const lvl = m.v >= 66 ? "ok" : m.v >= 40 ? "mid" : "low";
            return (
              <button key={m.label} className="pulse-card" onClick={m.go}
                aria-label={`${m.label}: ${Math.round(m.v)} de 100${d ? ` (${d > 0 ? "+" : ""}${d} desde o último jogo)` : ""}`}>
                <div className="pc-top">
                  <span className="pc-num num">{Math.round(m.v)}%</span>
                  <DeltaTag d={d} />
                </div>
                <span className="pc-lbl">{m.label}</span>
                <div className="pc-bar" aria-hidden="true">
                  <i className={lvl} style={{ width: `${Math.max(4, Math.min(100, m.v))}%` }} />
                </div>
              </button>
            );
          })}
        </div>
        <p className="objective">
          <Ic n="target" /> <span><b>Meta:</b> {w.board.objective}{w.settings.casual ? " · modo casual" : ""}</span>
        </p>
      </section>

      <nav className="quick-row" aria-label="Ações rápidas do clube">
        {quickActions.map((q) => (
          <button key={q.label} className="q-pill" onClick={q.go}>
            <span className="q-ic"><GIcon slug={q.slug} size={22} /></span>
            <span className="q-lbl">{q.label}</span>
            <span className="q-sub">{q.sub}</span>
            {!!q.badge && <span className="q-badge" aria-hidden="true">{Math.min(q.badge, 99)}</span>}
          </button>
        ))}
      </nav>

      <PeneiraHomeCard />
      <SquadMoodHomeCard />
      <BoardHomeCard />

      {last && <LastResult w={w} f={last} />}

      {league && (
        <section className="ui-card">
          <div className="sec-head">
            <h3><CompLogo id={league.id} size={18} /> {league.name}</h3>
            <button className="link" onClick={() => setTab("comps")}>Tabela completa ›</button>
          </div>
          <MiniTable w={w} compId={league.id} />
        </section>
      )}

      {topNews ? (
        <div className="news-strip" onClick={() => { update(() => { topNews.read = true; }); if (topNews.pid && w.players[topNews.pid]) push({ name: "player", id: topNews.pid }); else push({ name: "news" }); }}>
          <span className="ns-ic">{ICON[topNews.kind] ?? "📣"}</span>
          <div className="ns-body">
            <b>{topNews.title}</b>
            <span>{newsSource(w, topNews) ? `${newsSource(w, topNews)} · ` : ""}{formatDate(topNews.season, topNews.day)} · Toque para ver mais ({w.news.length})</span>
          </div>
          <Icon name="chev" size={18} />
        </div>
      ) : (
        <div className="news-strip" onClick={() => push({ name: "news" })}>
          <span className="ns-ic"><Icon name="news" size={18} /></span>
          <div className="ns-body">
            <b>Imprensa esportiva</b>
            <span>A imprensa está de olho no seu trabalho.</span>
          </div>
          <Icon name="chev" size={18} />
        </div>
      )}
    </div>
  );
}

function NextMatchCard({ w, f }: { w: World; f: Fixture }) {
  const home = w.clubs[f.home];
  const away = w.clubs[f.away];
  const meta = COMP_META[f.comp];
  const days = f.day - w.day;
  const photo = f.neutral ? null : stadiumSrc(home);
  const ph = matchPhase(w, f);
  const stage = ph.decisive ? ph.label : ph.detail ? `${ph.label} · ${ph.detail}` : ph.label;
  const tv = broadcasters(f);
  const hStr = Math.round(clubStrength(w, home));
  const aStr = Math.round(clubStrength(w, away));
  const whenLabel = days === 0 ? "Hoje" : days === 1 ? "Amanhã" : `Em ${days} dias`;

  return (
    <>
      {ph.decisive && <PhaseBanner w={w} f={f} compact />}
      <section className={`ui-card next-match${ph.decisive ? ` is-${ph.decisive}` : ""}`} aria-label="Próximo jogo" style={{ "--h": visibleColor(home.colors), "--a": visibleColor(away.colors) } as CSSProperties}>
        <div className="nm-media">
          {photo && <img src={photo} alt="" decoding="async" />}
          <div className="nm-badges">
            <span className="pill"><CompLogo id={f.comp} size={16} /> {meta.short} · {stage}</span>
            <span className={`pill dot when${days === 0 ? " today" : ""}`}>{whenLabel} · {formatDate(w.season, f.day)}</span>
          </div>
        </div>
        <div className="nm-teams">
          <div className="nm-team tap" onClick={() => push({ name: "club", id: home.id })}>
            <Crest club={home} size={56} />
            <b>{home.name}</b>
            <span className="t-3">Mandante · {home.tactic.formation}</span>
          </div>
          <div className="nm-vs" aria-hidden="true">VS</div>
          <div className="nm-team tap" onClick={() => push({ name: "club", id: away.id })}>
            <Crest club={away} size={56} />
            <b>{away.name}</b>
            <span className="t-3">Visitante · {away.tactic.formation}</span>
          </div>
        </div>
        <ul className="nm-info">
          <li className="ellipsis"><Icon name="stadium" size={15} />{f.neutral ? "Campo neutro" : stadiumName(w, home)}</li>
          <li>⚡ Força {hStr} × {aStr}</li>
          {tv.length > 0 && <li className="ellipsis"><Icon name="tv" size={15} />{tv.join(" · ")}</li>}
        </ul>
        <div className="nm-actions">
          <button className="btn" onClick={() => push({ name: "tactics" })}>
            <GIcon slug="tatica" size={19} /> Escalação
          </button>
          <button className="btn primary" onClick={continueGame}>
            <Icon name="play" size={16} /> {days <= 0 ? "Jogar Partida" : "Continuar"}
          </button>
        </div>
      </section>
    </>
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
        <b style={{ fontSize: 18 }} className="kbd">{r.hg} × {r.ag}</b>
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
    <table className="tbl mini-tbl">
      <thead>
        <tr>
          <th style={{ width: 24 }}>#</th>
          <th style={{ textAlign: "left" }}>Clube</th>
          <th>J</th>
          <th>V</th>
          <th>SG</th>
          <th>PTS</th>
          <th style={{ textAlign: "right" }}>Forma</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(start, start + 5).map((r, k) => {
          const c = w.clubs[r.club];
          const sg = r.gf - r.ga;
          const form = formOf(w, r.club, 3);
          return (
            <tr key={r.club} className={r.club === w.userClubId ? "me" : ""} onClick={() => push({ name: "club", id: c.id })} style={{ cursor: "pointer" }}>
              <td className="num">{start + k + 1}</td>
              <td className="team"><span className="row gap8"><Crest club={c} size={18} /><span className="ellipsis">{c.name}</span></span></td>
              <td className="num">{r.p}</td>
              <td className="num">{r.w}</td>
              <td className="num">{sg > 0 ? `+${sg}` : sg}</td>
              <td className="bold num" style={{ color: r.club === w.userClubId ? "#c8f43c" : "var(--text)" }}>{r.pts}</td>
              <td>
                <div className="form-row" style={{ justifyContent: "flex-end" }}>
                  {Array.from({ length: 3 }, (_, idx) => {
                    const fr = form[idx - (3 - form.length)];
                    return <span key={idx} className={`form-pill sm ${fr ?? "none"}`}>{fr ?? "·"}</span>;
                  })}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const ICON: Record<string, string> = { legend: "⭐", youth: "🌱", transfer: "💼", offer: "💰", board: "🏛️", injury: "🚑", contract: "📝", season: "🏆", match: "⚽", info: "📣", training: "🏋️", staff: "👔", scout: "🔭", dressing: "💬", admin: "🛠️" };

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
