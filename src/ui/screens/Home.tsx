import { useState, type CSSProperties } from "react";
import { formatDate } from "../../engine/calendar";
import { COMP_META, leagueOf, nextFixture, sortTable } from "../../engine/competitions";
import { chemOf, dynDelta, squadMood } from "../../engine/dressing";
import { facLevel } from "../../engine/facilities";
import { formatMoney, wageBill } from "../../engine/finance";
import { syncInbox } from "../../engine/inbox";
import { clubStrength, squadOf } from "../../engine/lineup";
import { fanMood } from "../../engine/narrative";
import { newsSource } from "../../engine/outlets";
import { shortName } from "../../engine/player";
import { stadiumName } from "../../engine/sponsors";
import type { Fixture, Player, World } from "../../engine/types";
import { push, setTab, update, useWorld } from "../../store";
import { continueGame } from "../actions";
import { Avatar, CompLogo, Crest, DeltaTag, Ic, Icon, visibleColor } from "../components";
import { Hd2dWorldCanvas, type Hd2dSceneSite, type Hd2dTimeOfDay } from "../hq/Hd2dWorldCanvas";
import { matchPhase } from "../MatchPhase";

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

export function Ring({ v, size = 58, color }: { v: number; size?: number; color?: string }) {
  const r = size / 2 - 5;
  const full = 2 * Math.PI * r;
  const val = Math.max(0, Math.min(100, v));
  const col = color ?? (val >= 66 ? "#10b981" : val >= 40 ? "#f59e0b" : "#ef4444");
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={6} />
        <circle
          className="v"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={full}
          strokeDashoffset={full * (1 - val / 100)}
          style={{ "--full": full } as CSSProperties}
        />
      </svg>
      <b>{Math.round(val)}</b>
    </div>
  );
}

type DeckTab = "table" | "status" | "inbox" | "alerts";

export function HomeScreen() {
  const w = useWorld();
  const user = w.clubs[w.userClubId];
  const next = nextFixture(w, user.id);
  const league = leagueOf(w, user.id);
  const squad = squadOf(w, user);

  const [worldSite, setWorldSite] = useState<Hd2dSceneSite>("ct");
  const [timeOfDay, setTimeOfDay] = useState<Hd2dTimeOfDay>("sunset");
  const [deckTab, setDeckTab] = useState<DeckTab>(league ? "table" : "status");

  const stadiumLv = facLevel(user, "stadium");
  const trainLv = facLevel(user, "training");
  const youthLv = facLevel(user, "youth");

  const injured = squad.filter((p) => p.injury > 0);
  const suspended = squad.filter((p) => Object.values(p.bans).some((b) => b > 0));
  const expiring = squad.filter((p) => !p.loan && p.contractEnd <= w.season + 1);
  const alertCount = injured.length + suspended.length + expiring.length;

  if (!w.inbox || w.inbox.lastNews < (w.news[0]?.id ?? 0)) {
    syncInbox(w);
  }
  const recentInbox = (w.inbox?.msgs ?? []).slice(0, 4);
  const wages = wageBill(w, user);

  const meters: { label: string; v: number; key: "board" | "fan" | "chem" | "mood"; go: () => void }[] = [
    { label: "Diretoria", key: "board", v: w.board.confidence, go: () => push({ name: "board" }) },
    { label: "Torcida", key: "fan", v: fanMood(w), go: () => setTab("inbox") },
    { label: "Entrosamento", key: "chem", v: chemOf(w, user), go: () => setTab("tactics") },
    { label: "Vestiário", key: "mood", v: squadMood(w, user), go: () => push({ name: "dressing" }) },
  ];

  return (
    <div className="rpg-home-console">
      {/* COLUNA ESQUERDA (58%): O MUNDO HD-2D AO VIVO A 60 FPS (Zero Jogadores Fantasmas no Gramado!) */}
      <section className="rpg-world-stage-card">
        <header className="rpg-world-bar">
          <div className="rpg-world-tabs" role="tablist">
            <button
              className={`rpg-wtab ${worldSite === "ct" ? "active" : ""}`}
              onClick={() => setWorldSite("ct")}
            >
              <Icon name="dumbbell" size={13} />
              <span>CT</span>
              <em>Lv {trainLv}</em>
            </button>
            <button
              className={`rpg-wtab ${worldSite === "academy" ? "active" : ""}`}
              onClick={() => setWorldSite("academy")}
            >
              <Icon name="sprout" size={13} />
              <span>Base Cotia</span>
              <em>Lv {youthLv}</em>
            </button>
            <button
              className={`rpg-wtab ${worldSite === "stadium" ? "active" : ""}`}
              onClick={() => setWorldSite("stadium")}
            >
              <Icon name="stadium" size={13} />
              <span>Estádio</span>
              <em>Lv {stadiumLv}</em>
            </button>
          </div>

          <div className="rpg-time-pills">
            {([
              ["day", "Dia", "sun"],
              ["sunset", "Tarde", "flame"],
              ["night", "Noite", "sparkle"],
            ] as [Hd2dTimeOfDay, string, string][]).map(([t, label, ic]) => (
              <button
                key={t}
                className={`rpg-tpill ${timeOfDay === t ? "active" : ""}`}
                onClick={() => setTimeOfDay(t)}
                title={`Horário: ${label}`}
              >
                <Icon name={ic} size={12} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </header>

        <div className="rpg-world-canvas-box">
          <Hd2dWorldCanvas
            club={user}
            world={w}
            site={worldSite}
            timeOfDay={timeOfDay}
            look={user.look}
            height="100%"
            onPlayerClick={(pid) => {
              if (w.players[pid]) push({ name: "player", id: pid });
            }}
          />
          <div className="rpg-world-caption">
            <span className="rpg-live-dot" />
            {worldSite === "ct" && (
              <span>CT Profissional Ao Vivo · Titulares treinando (toque num jogador em campo para abrir a ficha!)</span>
            )}
            {worldSite === "academy" && (
              <span>CFA Cotia Ao Vivo · Joias Sub-20 evoluindo em campo (toque numa promessa!)</span>
            )}
            {worldSite === "stadium" && (
              <span>{user.stadium} · {user.capacity.toLocaleString("pt-BR")} lugares · Gramado e iluminação HD-2D</span>
            )}
          </div>
        </div>

        <footer className="rpg-world-actions">
          {worldSite === "ct" && (
            <>
              <button className="rpg-act-btn gold" onClick={() => push({ name: "training" })}>
                <Icon name="dumbbell" size={13} /> Foco & Intensidade
              </button>
              <button className="rpg-act-btn" onClick={() => setTab("tactics")}>
                <Icon name="tactics" size={13} /> Prancheta Tática
              </button>
              <button className="rpg-act-btn" onClick={() => push({ name: "dressing" })}>
                <Icon name="chat" size={13} /> Vestiário & Moral
              </button>
              <button className="rpg-act-btn" onClick={() => push({ name: "staff" })}>
                <Icon name="briefcase" size={13} /> Comissão Técnica
              </button>
            </>
          )}
          {worldSite === "academy" && (
            <>
              <button className="rpg-act-btn gold" onClick={() => push({ name: "youth" })}>
                <Icon name="sprout" size={13} /> Joias Sub-20
              </button>
              <button className="rpg-act-btn" onClick={() => push({ name: "peneira" })}>
                <Icon name="star" size={13} /> Dia da Peneira
              </button>
              <button className="rpg-act-btn" onClick={() => push({ name: "facilities" })}>
                <Icon name="crane" size={13} /> Evoluir Cotia
              </button>
            </>
          )}
          {worldSite === "stadium" && (
            <>
              <button className="rpg-act-btn gold" onClick={() => push({ name: "stadiumLook" })}>
                <Icon name="wrench" size={13} /> Reformar Estádio
              </button>
              <button className="rpg-act-btn" onClick={() => push({ name: "facilities" })}>
                <Icon name="crane" size={13} /> Obras & Níveis
              </button>
              <button className="rpg-act-btn" onClick={() => push({ name: "trophies" })}>
                <Icon name="trophy" size={13} /> Sala de Troféus
              </button>
              <button className="rpg-act-btn" onClick={() => push({ name: "finances" })}>
                <Icon name="coins" size={13} /> Finanças
              </button>
            </>
          )}
        </footer>
      </section>

      {/* COLUNA DIREITA (42%): DECK DE COMANDO RPG (Sem Comer Tela, 100% Visível no Viewport!) */}
      <aside className="rpg-command-deck">
        {/* CARD 1: PRÓXIMO CONFRONTO */}
        {next ? (
          <NextMatchDeckCard w={w} f={next} />
        ) : (
          <section className="rpg-deck-card rpg-next-card">
            <div className="rpg-card-bar">
              <span><Icon name="calendar" size={14} /> Calendário da Temporada</span>
            </div>
            <div className="rpg-duel-empty">
              <span>Sem partida agendada hoje · Avance o calendário</span>
              <button className="rpg-act-btn gold" onClick={continueGame}>
                <Icon name="play" size={13} fill /> Avançar Temporada
              </button>
            </div>
          </section>
        )}

        {/* CARD 2: PAINEL INTEGRADO (TABELA | CLUBE & META | CAIXA | AVISOS — Sem Cortar Classificação!) */}
        <section className="rpg-deck-card rpg-multi-deck">
          <header className="rpg-deck-tabs">
            {league && (
              <button
                className={`rpg-dtab ${deckTab === "table" ? "active" : ""}`}
                onClick={() => setDeckTab("table")}
              >
                <Icon name="trophy" size={12} />
                <span>Classificação</span>
              </button>
            )}
            <button
              className={`rpg-dtab ${deckTab === "status" ? "active" : ""}`}
              onClick={() => setDeckTab("status")}
            >
              <Icon name="shield" size={12} />
              <span>Clube & Meta</span>
            </button>
            <button
              className={`rpg-dtab ${deckTab === "inbox" ? "active" : ""}`}
              onClick={() => setDeckTab("inbox")}
            >
              <Icon name="mail" size={12} />
              <span>Decisões</span>
            </button>
            <button
              className={`rpg-dtab ${deckTab === "alerts" ? "active" : ""}`}
              onClick={() => setDeckTab("alerts")}
            >
              <Icon name="crossMedical" size={12} />
              <span>DM ({alertCount})</span>
            </button>
          </header>

          <div className="rpg-deck-body">
            {deckTab === "table" && league && (
              <div className="rpg-table-pane">
                <div className="rpg-pane-head">
                  <span className="row center gap6">
                    <CompLogo id={league.id} size={15} />
                    <b>{league.name}</b>
                  </span>
                  <button className="rpg-link-btn" onClick={() => setTab("comps")}>
                    Tabela Completa ›
                  </button>
                </div>
                <MiniTable w={w} compId={league.id} />
              </div>
            )}

            {deckTab === "status" && (
              <div className="rpg-status-pane">
                <div className="rpg-fin-strip">
                  <div className="rpg-fin-pill" onClick={() => push({ name: "finances" })}>
                    <span>Caixa Atual</span>
                    <b style={{ color: "#4ade80" }}>{formatMoney(user.balance)}</b>
                  </div>
                  <div className="rpg-fin-pill" onClick={() => push({ name: "finances" })}>
                    <span>Folha / Mês</span>
                    <b>{formatMoney(wages)}</b>
                  </div>
                  <div className="rpg-fin-pill" onClick={() => push({ name: "board" })}>
                    <span>Meta Diretoria</span>
                    <b style={{ color: "#fde047" }}>{w.board.objective}</b>
                  </div>
                </div>
                <div className="rpg-meters-grid">
                  {meters.map((m) => {
                    const d = dynDelta(w, m.key, m.v);
                    const col = m.v >= 66 ? "#10b981" : m.v >= 45 ? "#f59e0b" : "#ef4444";
                    return (
                      <div key={m.label} className="rpg-meter-box tap" onClick={m.go}>
                        <div className="rpg-meter-head">
                          <span>{m.label}</span>
                          <b style={{ color: col }}>{Math.round(m.v)}% <DeltaTag d={d} /></b>
                        </div>
                        <div className="rpg-meter-bar">
                          <i style={{ width: `${Math.max(5, Math.min(100, m.v))}%`, background: col }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {deckTab === "inbox" && (
              <div className="rpg-inbox-pane">
                {recentInbox.slice(0, 3).map((m) => {
                  const barCol =
                    m.kind === "offer" || m.kind === "transfer"
                      ? "#10b981"
                      : m.kind === "injury"
                        ? "#ef4444"
                        : "#facc15";
                  return (
                    <div
                      key={m.id}
                      className={`rpg-ib-row${!m.read ? " unread" : ""}`}
                      onClick={() => {
                        update(() => { m.read = true; });
                        setTab("inbox");
                      }}
                    >
                      <i style={{ background: barCol }} />
                      <div className="rpg-ib-text">
                        <b className="ellipsis">{m.title.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "")}</b>
                        <span>{formatDate(m.season, m.day)} · {m.actions.length ? "Decisão pendente" : "Informativo"}</span>
                      </div>
                      <Icon name="chev" size={13} />
                    </div>
                  );
                })}
                <button className="rpg-link-btn block mt4" onClick={() => setTab("inbox")}>
                  Abrir Caixa de Entrada Completa ›
                </button>
              </div>
            )}

            {deckTab === "alerts" && (
              <CompactAlertsPane w={w} injured={injured} suspended={suspended} expiring={expiring} />
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function NextMatchDeckCard({ w, f }: { w: World; f: Fixture }) {
  const home = w.clubs[f.home];
  const away = w.clubs[f.away];
  const meta = COMP_META[f.comp];
  const days = f.day - w.day;
  const ph = matchPhase(w, f);
  const stage = ph.decisive ? ph.label : ph.detail ? `${ph.label} · ${ph.detail}` : ph.label;
  const hStr = Math.round(clubStrength(w, home));
  const aStr = Math.round(clubStrength(w, away));
  const whenLabel = days === 0 ? "HOJE" : days === 1 ? "AMANHÃ" : `EM ${days} DIAS`;

  return (
    <section
      className="rpg-deck-card rpg-next-card"
      style={{ "--h": visibleColor(home.colors), "--a": visibleColor(away.colors) } as CSSProperties}
    >
      <div className="rpg-card-bar">
        <span className="row center gap6 ellipsis">
          <CompLogo id={f.comp} size={15} />
          <b>{meta.short} · {stage}</b>
        </span>
        <span className={`rpg-when-tag${days === 0 ? " today" : ""}`}>
          {whenLabel} · {formatDate(w.season, f.day)}
        </span>
      </div>

      <div className="rpg-duel-row">
        <div className="rpg-duel-club tap" onClick={() => push({ name: "club", id: home.id })}>
          <Crest club={home} size={38} />
          <div className="rpg-duel-meta">
            <b className="ellipsis">{home.name}</b>
            <span>Mandante · Força {hStr}</span>
            <FormPills w={w} clubId={home.id} count={4} />
          </div>
        </div>

        <div className="rpg-duel-vs">VS</div>

        <div className="rpg-duel-club right tap" onClick={() => push({ name: "club", id: away.id })}>
          <div className="rpg-duel-meta right">
            <b className="ellipsis">{away.name}</b>
            <span>Visitante · Força {aStr}</span>
            <FormPills w={w} clubId={away.id} count={4} />
          </div>
          <Crest club={away} size={38} />
        </div>
      </div>

      <div className="rpg-duel-foot">
        <span className="rpg-duel-stadium ellipsis">
          <Icon name="stadium" size={13} />
          {f.neutral ? "Campo neutro" : stadiumName(w, home)}
        </span>
        <div className="rpg-duel-btns">
          <button className="rpg-act-btn" onClick={() => setTab("tactics")}>
            <Icon name="tactics" size={13} /> Escalar Time
          </button>
          <button className="rpg-act-btn gold" onClick={continueGame}>
            <Icon name="play" size={12} fill /> {days <= 0 ? "Jogar" : "Avançar"}
          </button>
        </div>
      </div>
    </section>
  );
}

function CompactAlertsPane({
  w,
  injured,
  suspended,
  expiring,
}: {
  w: World;
  injured: Player[];
  suspended: Player[];
  expiring: Player[];
}) {
  const club = w.clubs[w.userClubId];
  const items: { id: string; p: Player; badge: string; color: string; sub: string }[] = [];
  for (const p of injured) items.push({ id: `i-${p.id}`, p, badge: "DM", color: "#ef4444", sub: `Lesionado (${p.injury}d)` });
  for (const p of suspended) items.push({ id: `s-${p.id}`, p, badge: "SUS", color: "#ef4444", sub: "Suspenso" });
  for (const p of expiring.slice(0, 3)) items.push({ id: `c-${p.id}`, p, badge: "CON", color: "#38bdf8", sub: `Contrato dez/${p.contractEnd}` });

  if (items.length === 0) {
    return (
      <div className="rpg-alert-ok">
        <Icon name="check" size={16} />
        <div>
          <b>Departamento Médico Zerado</b>
          <span>Todos os jogadores estão 100% aptos para entrar em campo.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rpg-inbox-pane">
      {items.slice(0, 3).map((it) => (
        <div key={it.id} className="rpg-ib-row" onClick={() => push({ name: "player", id: it.p.id })}>
          <i style={{ background: it.color }} />
          <Avatar p={it.p} club={club} season={w.season} size={24} />
          <div className="rpg-ib-text">
            <b className="ellipsis">{shortName(it.p.name)} ({it.p.pos})</b>
            <span>{it.sub}</span>
          </div>
          <span className="rpg-badge-mini" style={{ color: it.color, borderColor: `${it.color}55` }}>{it.badge}</span>
        </div>
      ))}
    </div>
  );
}

export function MiniTable({ w, compId, full }: { w: World; compId: string; full?: boolean }) {
  const comp = w.comps[compId];
  const rows = sortTable(comp.table.slice());
  const i = rows.findIndex((r) => r.club === w.userClubId);
  const start = full ? 0 : Math.max(0, Math.min(rows.length - 5, i - 2));
  const slice = full ? rows : rows.slice(start, start + 5);
  return (
    <table className="tbl mini-tbl k-mini-tbl rpg-mini-tbl">
      <thead>
        <tr>
          <th style={{ width: 22 }}>#</th>
          <th style={{ textAlign: "left" }}>Clube</th>
          <th>J</th>
          <th>V</th>
          <th>SG</th>
          <th>PTS</th>
          <th style={{ textAlign: "right" }}>Forma</th>
        </tr>
      </thead>
      <tbody>
        {slice.map((r, k) => {
          const c = w.clubs[r.club];
          const sg = r.gf - r.ga;
          const form = formOf(w, r.club, 3);
          return (
            <tr
              key={r.club}
              className={r.club === w.userClubId ? "me" : ""}
              onClick={() => push({ name: "club", id: c.id })}
              style={{ cursor: "pointer" }}
            >
              <td className="num">{start + k + 1}</td>
              <td className="team">
                <span className="row gap6">
                  <Crest club={c} size={15} />
                  <span className="ellipsis">{c.name}</span>
                </span>
              </td>
              <td className="num">{r.p}</td>
              <td className="num">{r.w}</td>
              <td className="num">{sg > 0 ? `+${sg}` : sg}</td>
              <td className="bold num" style={{ color: r.club === w.userClubId ? "#fde047" : "var(--text)" }}>
                {r.pts}
              </td>
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

const NEWS_ICONS: Record<string, string> = {
  legend: "star",
  youth: "sprout",
  transfer: "swap",
  offer: "coins",
  board: "bank",
  injury: "crossMedical",
  contract: "doc",
  season: "trophy",
  match: "ball",
  info: "megaphone",
  training: "dumbbell",
  staff: "briefcase",
  scout: "binoculars",
  dressing: "chat",
  admin: "wrench",
};

export function NewsScreen() {
  const w = useWorld();
  return (
    <div className="page k-news-page">
      <div className="row" style={{ alignItems: "center", marginBottom: 8 }}>
        <h2 className="grow" style={{ margin: 0, fontSize: 16 }}>Notícias da Imprensa</h2>
        <button className="btn sm" onClick={() => update((x) => x.news.forEach((n) => (n.read = true)))}>Marcar todas como lidas</button>
      </div>
      <div className="k-news-grid">
        {w.news.map((n) => (
          <div key={n.id} className="card k-news-card" style={{ borderColor: n.kind === "legend" ? "#8a6a00" : undefined }} onClick={() => update(() => { n.read = true; })}>
            <div className="row">
              <span className="row center" style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }}><Icon name={NEWS_ICONS[n.kind] ?? "megaphone"} size={16} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="ellipsis" style={{ display: "block" }}>{n.title.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "")}</b>
                <div className="tiny muted">{newsSource(w, n) ? <span className="row center gap2 inline-flex"><Ic n="news" size={11} /> {newsSource(w, n)} · </span> : ""}{formatDate(n.season, n.day)} {n.season}</div>
              </div>
              {!n.read && <span className="tag good">novo</span>}
            </div>
            {n.body && <p className="tiny mt4" style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{n.body}</p>}
            {n.pid && w.players[n.pid] && <button className="btn sm mt6" onClick={(e) => { e.stopPropagation(); push({ name: "player", id: n.pid! }); }}>Ver jogador</button>}
          </div>
        ))}
      </div>
      {!w.news.length && <div className="empty">Nenhuma notícia ainda.</div>}
      <div style={{ height: 20 }} />
    </div>
  );
}
