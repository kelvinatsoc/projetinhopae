import { useState, type CSSProperties } from "react";
import { userWindowOpen } from "../../engine/admin";
import { formatDate } from "../../engine/calendar";
import { COMP_META, leagueOf, nextFixture, sortTable } from "../../engine/competitions";
import { chemOf, dynDelta, squadMood } from "../../engine/dressing";
import { formatMoney, wageBill } from "../../engine/finance";
import { syncInbox } from "../../engine/inbox";
import { clubStrength, squadOf } from "../../engine/lineup";
import { fanMood } from "../../engine/narrative";
import { broadcasters, newsSource } from "../../engine/outlets";
import { shortName } from "../../engine/player";
import { stadiumName } from "../../engine/sponsors";
import type { Fixture, Player, World } from "../../engine/types";
import { push, setTab, update, useWorld } from "../../store";
import { continueGame } from "../actions";
import { Avatar, CompLogo, Crest, DeltaTag, GIcon, Ic, Icon, PosBadge, stadiumSrc, visibleColor } from "../components";
import { matchPhase, PhaseBanner } from "../MatchPhase";
import { PeneiraHomeCard } from "./Academy";
import { BoardHomeCard, BoardScreen } from "./Board";
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
  const col = color ?? (val >= 66 ? "#10b981" : val >= 40 ? "#f59e0b" : "#ef4444");
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

type PortalSubTab = "overview" | "alerts" | "board" | "table" | "window";

export function HomeScreen() {
  const w = useWorld();
  const [sub, setSub] = useState<PortalSubTab>("overview");
  const user = w.clubs[w.userClubId];
  const next = nextFixture(w, user.id);
  const league = leagueOf(w, user.id);
  const last = [...w.fixtures].filter((f) => f.result && (f.home === user.id || f.away === user.id)).sort((a, b) => b.day - a.day)[0];
  const squad = squadOf(w, user);

  // Avisos reais do elenco
  const injured = squad.filter((p) => p.injury > 0);
  const suspended = squad.filter((p) => Object.values(p.bans).some((b) => b > 0));
  const yellowRisk = squad.filter((p) => Object.values(p.yel ?? {}).some((y) => y >= 2));
  const expiring = squad.filter((p) => !p.loan && p.contractEnd <= w.season + 1);
  const lowCond = squad.filter((p) => p.injury === 0 && p.cond < 75);

  const winOpen = userWindowOpen(w);
  const winLabel = winOpen ? "Janela aberta para transferências" : "Janela fechada para registros";
  const pendingOffers = w.offers.filter((o) => o.status === "pending" && (o.to === user.id || o.from === user.id));

  // Garante caixa sincronizada para exibir no portal
  if (!w.inbox || w.inbox.lastNews < (w.news[0]?.id ?? 0)) {
    syncInbox(w);
  }
  const recentInbox = (w.inbox?.msgs ?? []).slice(0, 4);

  const meters: { label: string; v: number; key: "board" | "fan" | "chem" | "mood"; go: () => void }[] = [
    { label: "Resultados / Meta", key: "board", v: w.board.confidence, go: () => push({ name: "board" }) },
    { label: "Apoio da Torcida", key: "fan", v: fanMood(w), go: () => setTab("inbox") },
    { label: "Entrosamento Tático", key: "chem", v: chemOf(w, user), go: () => setTab("tactics") },
    { label: "Clima do Vestiário", key: "mood", v: squadMood(w, user), go: () => push({ name: "dressing" }) },
  ];

  return (
    <div className="k-screen">
      {/* Sub-abas estilo FM24/FM26 Opção 1 */}
      <div className="k-subtabs" role="tablist" aria-label="Sub-abas do Portal">
        <button className={`k-subtab${sub === "overview" ? " active" : ""}`} onClick={() => setSub("overview")}>Visão Geral</button>
        <button className={`k-subtab${sub === "alerts" ? " active" : ""}`} onClick={() => setSub("alerts")}>
          Avisos & Lesões {(injured.length + suspended.length) > 0 ? `(${injured.length + suspended.length})` : ""}
        </button>
        <button className={`k-subtab${sub === "board" ? " active" : ""}`} onClick={() => setSub("board")}>Confiança da Diretoria</button>
        <button className={`k-subtab${sub === "table" ? " active" : ""}`} onClick={() => setSub("table")}>Forma & Classificação</button>
        <button className={`k-subtab${sub === "window" ? " active" : ""}`} onClick={() => setSub("window")}>Janela de Transferências</button>
      </div>

      {sub === "board" ? (
        <BoardScreen />
      ) : sub === "alerts" ? (
        <div className="page">
          <AlertsPanel w={w} injured={injured} suspended={suspended} yellowRisk={yellowRisk} expiring={expiring} lowCond={lowCond} expanded />
        </div>
      ) : sub === "table" ? (
        <div className="page">
          {last && <LastResult w={w} f={last} />}
          {league && (
            <section className="k-card">
              <div className="k-card-head">
                <span><CompLogo id={league.id} size={16} /> {league.name}</span>
                <button className="link" onClick={() => setTab("comps")}>Ver todas as competições ›</button>
              </div>
              <MiniTable w={w} compId={league.id} full />
            </section>
          )}
        </div>
      ) : sub === "window" ? (
        <div className="page">
          <TransferWindowCard w={w} winOpen={winOpen} winLabel={winLabel} pendingCount={pendingOffers.length} expanded />
        </div>
      ) : (
        <div className="page home k-portal-page">
          <div className="k-portal-grid">
            {/* COLUNA 1: PRÓXIMO JOGO + JANELA DE TRANSFERÊNCIAS */}
            <div className="k-portal-col">
              {next ? (
                <NextMatchCard w={w} f={next} />
              ) : (
                <section className="k-card empty-hero">
                  <Icon name="calendar" size={32} />
                  <h3>Sem jogos marcados</h3>
                  <p className="t-2">Toque em Continuar para avançar a temporada.</p>
                  <button className="btn primary mt8" onClick={continueGame}>
                    <Icon name="play" size={15} /> Continuar Temporada
                  </button>
                </section>
              )}

              <TransferWindowCard w={w} winOpen={winOpen} winLabel={winLabel} pendingCount={pendingOffers.length} />
            </div>

            {/* COLUNA 2: CENTRO MÉDICO & AVISOS + CONFIANÇA DA DIRETORIA */}
            <div className="k-portal-col">
              <AlertsPanel w={w} injured={injured} suspended={suspended} yellowRisk={yellowRisk} expiring={expiring} lowCond={lowCond} />

              <section className="k-card" aria-labelledby="st-h">
                <div className="k-card-head">
                  <span id="st-h">Confiança da Diretoria & Clima</span>
                  <button className="k-pill-link" onClick={() => push({ name: "board" })}>Meta: {w.board.objective} ›</button>
                </div>
                <div className="k-meters-list">
                  {meters.map((m) => {
                    const d = dynDelta(w, m.key, m.v);
                    const col = m.v >= 66 ? "#10b981" : m.v >= 45 ? "#f59e0b" : "#ef4444";
                    return (
                      <div key={m.label} className="k-meter-row tap" onClick={m.go}>
                        <div className="k-meter-top">
                          <span>{m.label}</span>
                          <b style={{ color: col }}>{Math.round(m.v)}% <DeltaTag d={d} /></b>
                        </div>
                        <div className="k-meter-track">
                          <i style={{ width: `${Math.max(4, Math.min(100, m.v))}%`, background: col }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="k-quick-strip">
                  <button className="k-qbtn" onClick={() => push({ name: "training" })}><Ic n="dumbbell" size={14} /> Treinos</button>
                  <button className="k-qbtn" onClick={() => push({ name: "dressing" })}><Ic n="handshake" size={14} /> Vestiário</button>
                  <button className="k-qbtn" onClick={() => push({ name: "youth" })}><Ic n="seed" size={14} /> Base</button>
                  <button className="k-qbtn" onClick={() => push({ name: "facilities" })}><Ic n="stadium" size={14} /> Sede 3D</button>
                </div>
              </section>

              <PeneiraHomeCard />
              <SquadMoodHomeCard />
              <BoardHomeCard />
            </div>

            {/* COLUNA 3: CAIXA DE ENTRADA + CLASSIFICAÇÃO */}
            <div className="k-portal-col">
              <section className="k-card">
                <div className="k-card-head">
                  <span>Caixa de Entrada — Decisões</span>
                  <button className="k-pill-link" onClick={() => setTab("inbox")}>Abrir Caixa ›</button>
                </div>
                <div className="k-inbox-preview">
                  {recentInbox.map((m) => {
                    const barCol = m.kind === "offer" || m.kind === "transfer" ? "#10b981" : m.kind === "injury" ? "#ef4444" : m.kind === "contract" || m.kind === "dressing" ? "#f59e0b" : "#5842f4";
                    return (
                      <div key={m.id} className={`k-ib-mini${!m.read ? " unread" : ""}`} onClick={() => { update(() => { m.read = true; }); setTab("inbox"); }}>
                        <i className="k-ib-bar" style={{ background: barCol }} />
                        <div className="k-ib-txt">
                          <b className="ellipsis">{m.title}</b>
                          <span>{formatDate(m.season, m.day)} · {m.actions.length ? `${m.actions.length} ação(ões) rápida(s)` : "Informativo"}</span>
                        </div>
                        <Icon name="chev" size={14} />
                      </div>
                    );
                  })}
                  {!recentInbox.length && (
                    <div className="k-ib-mini" onClick={() => setTab("inbox")}>
                      <i className="k-ib-bar" style={{ background: "#5842f4" }} />
                      <div className="k-ib-txt">
                        <b>Caixa de Entrada em dia</b>
                        <span>Toque para revisar notícias e relatórios</span>
                      </div>
                      <Icon name="chev" size={14} />
                    </div>
                  )}
                </div>
              </section>

              {league && (
                <section className="k-card">
                  <div className="k-card-head">
                    <span className="row gap4"><CompLogo id={league.id} size={15} /> {league.name}</span>
                    <button className="k-pill-link" onClick={() => setTab("comps")}>Tabela ›</button>
                  </div>
                  <MiniTable w={w} compId={league.id} />
                </section>
              )}

              {last && <LastResult w={w} f={last} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertsPanel({
  w, injured, suspended, yellowRisk, expiring, lowCond, expanded,
}: {
  w: World;
  injured: Player[];
  suspended: Player[];
  yellowRisk: Player[];
  expiring: Player[];
  lowCond: Player[];
  expanded?: boolean;
}) {
  const club = w.clubs[w.userClubId];
  const items: { id: string; p: Player; badge: string; color: string; sub: string; actLabel: string; onAct: () => void }[] = [];

  for (const p of injured) {
    items.push({
      id: `inj-${p.id}`, p, badge: "LES", color: "#ef4444",
      sub: `Departamento Médico · volta em ${p.injury} dia${p.injury > 1 ? "s" : ""}`,
      actLabel: "Substituir", onAct: () => setTab("tactics"),
    });
  }
  for (const p of suspended) {
    const days = Math.max(...Object.values(p.bans));
    items.push({
      id: `ban-${p.id}`, p, badge: "SUS", color: "#ef4444",
      sub: `Suspenso por ${days} jogo${days > 1 ? "s" : ""}`,
      actLabel: "Tática", onAct: () => setTab("tactics"),
    });
  }
  for (const p of yellowRisk.slice(0, expanded ? 10 : 2)) {
    items.push({
      id: `yel-${p.id}`, p, badge: "PEN", color: "#f59e0b",
      sub: "Pendurado com 2 cartões amarelos",
      actLabel: "Ver atleta", onAct: () => push({ name: "player", id: p.id }),
    });
  }
  for (const p of expiring.slice(0, expanded ? 10 : 3)) {
    items.push({
      id: `exp-${p.id}`, p, badge: "CON", color: "#3b82f6",
      sub: `Contrato termina em dez/${p.contractEnd}`,
      actLabel: "Renovar", onAct: () => push({ name: "player", id: p.id }),
    });
  }
  for (const p of lowCond.slice(0, expanded ? 8 : 2)) {
    items.push({
      id: `cnd-${p.id}`, p, badge: "FIS", color: "#f59e0b",
      sub: `Condição física baixa (${Math.round(p.cond)}%)`,
      actLabel: "Poupar", onAct: () => setTab("tactics"),
    });
  }

  const shown = expanded ? items : items.slice(0, 4);

  return (
    <section className="k-card">
      <div className="k-card-head">
        <span>Centro Médico & Avisos ({items.length})</span>
        <button className="k-pill-link" onClick={() => setTab("squad")}>Elenco ›</button>
      </div>
      {shown.length > 0 ? (
        <div className="k-alert-list">
          {shown.map((it) => (
            <div key={it.id} className="k-alert-row" onClick={() => push({ name: "player", id: it.p.id })}>
              <span className="k-alert-tag" style={{ background: `${it.color}22`, color: it.color, borderColor: `${it.color}55` }}>{it.badge}</span>
              <Avatar p={it.p} club={club} season={w.season} size={26} />
              <div className="k-alert-txt">
                <b className="ellipsis">{shortName(it.p.name)} <small>({it.p.pos})</small></b>
                <span className="ellipsis">{it.sub}</span>
              </div>
              <button className="k-mini-act" onClick={(e) => { e.stopPropagation(); it.onAct(); }}>{it.actLabel}</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="k-alert-empty">
          <span className="k-alert-ok">✓</span>
          <div>
            <b>Departamento Médico zerado</b>
            <span>Todos os atletas estão aptos para a próxima partida.</span>
          </div>
        </div>
      )}
    </section>
  );
}

function TransferWindowCard({
  w, winOpen, winLabel, pendingCount, expanded,
}: {
  w: World;
  winOpen: boolean;
  winLabel: string;
  pendingCount: number;
  expanded?: boolean;
}) {
  const user = w.clubs[w.userClubId];
  const wages = wageBill(w, user);
  return (
    <section className="k-card">
      <div className="k-card-head">
        <span>Janela de Transferências</span>
        <span className={`k-win-badge ${winOpen ? "open" : "closed"}`}>{winOpen ? "JANELA ABERTA" : "JANELA FECHADA"}</span>
      </div>
      <div className="k-fin-grid">
        <div className="k-fin-box">
          <span>Caixa para Transferências</span>
          <b style={{ color: "#10b981" }}>{formatMoney(user.balance)}</b>
        </div>
        <div className="k-fin-box">
          <span>Folha Salarial / Mês</span>
          <b>{formatMoney(wages)}</b>
        </div>
      </div>
      <div className="k-win-sub">
        <span>{winLabel} · {pendingCount} proposta(s) ativa(s) · {w.shortlist.length} na Lista de Interesse</span>
      </div>
      <div className="k-quick-strip">
        <button className="k-qbtn primary" onClick={() => setTab("market")}><Ic n="search" size={14} /> Buscar Jogadores</button>
        <button className="k-qbtn" onClick={() => { try { localStorage.setItem("ldb.marketTab", "scouting"); } catch {} setTab("market"); }}><Ic n="binoculars" size={14} /> Olheiros</button>
        <button className="k-qbtn" onClick={() => push({ name: "finances" })}><Ic n="coins" size={14} /> Finanças</button>
      </div>
      {expanded && w.shortlist.length > 0 && (
        <div className="mt8">
          <b className="small">Lista de Interesse ({w.shortlist.length})</b>
          <div className="k-alert-list mt4">
            {w.shortlist.slice(0, 6).map((pid) => {
              const p = w.players[pid];
              if (!p) return null;
              return (
                <div key={pid} className="k-alert-row" onClick={() => push({ name: "player", id: pid })}>
                  <PosBadge pos={p.pos} />
                  <div className="k-alert-txt">
                    <b>{p.name}</b>
                    <span>OVR {p.ovr} · {p.clubId ? w.clubs[p.clubId]?.name : "Sem clube"}</span>
                  </div>
                  <button className="k-mini-act" onClick={(e) => { e.stopPropagation(); push({ name: "player", id: pid }); }}>Negociar</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
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
      <section className={`k-card next-match k-next-match${ph.decisive ? ` is-${ph.decisive}` : ""}`} aria-label="Próximo jogo" style={{ "--h": visibleColor(home.colors), "--a": visibleColor(away.colors) } as CSSProperties}>
        <div className="k-card-head">
          <span className="row gap4"><CompLogo id={f.comp} size={15} /> {meta.short} · {stage}</span>
          <span className={`k-when-pill${days === 0 ? " today" : ""}`}>{whenLabel} · {formatDate(w.season, f.day)}</span>
        </div>
        {photo && (
          <div className="k-nm-banner">
            <img src={photo} alt="" decoding="async" />
          </div>
        )}
        <div className="nm-teams k-nm-teams">
          <div className="nm-team tap" onClick={() => push({ name: "club", id: home.id })}>
            <Crest club={home} size={46} />
            <b>{home.name}</b>
            <span className="t-3">Mandante · {home.tactic.formation}</span>
            <FormPills w={w} clubId={home.id} count={4} />
          </div>
          <div className="nm-vs" aria-hidden="true">VS</div>
          <div className="nm-team tap" onClick={() => push({ name: "club", id: away.id })}>
            <Crest club={away} size={46} />
            <b>{away.name}</b>
            <span className="t-3">Visitante · {away.tactic.formation}</span>
            <FormPills w={w} clubId={away.id} count={4} />
          </div>
        </div>
        <ul className="nm-info k-nm-info">
          <li className="ellipsis"><Icon name="stadium" size={14} />{f.neutral ? "Campo neutro" : stadiumName(w, home)}</li>
          <li>⚡ Força {hStr} × {aStr}</li>
          {tv.length > 0 && <li className="ellipsis"><Icon name="tv" size={14} />{tv.join(" · ")}</li>}
        </ul>
        <div className="nm-actions k-nm-actions">
          <button className="btn sm" onClick={() => setTab("tactics")}>
            <GIcon slug="tatica" size={16} /> Editar Tática
          </button>
          <button className="btn sm primary" onClick={continueGame}>
            <Icon name="play" size={14} /> {days <= 0 ? "Ir para a Partida" : "Continuar"}
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
  const color = res === "V" ? "#10b981" : res === "D" ? "#ef4444" : "#f59e0b";
  return (
    <div className="k-card tap" onClick={() => push({ name: "fixture", id: f.id })}>
      <div className="k-card-head">
        <span>Último Resultado</span>
        <span style={{ color, fontWeight: 800 }}>{res === "V" ? "Vitória" : res === "D" ? "Derrota" : "Empate"}</span>
      </div>
      <div className="row" style={{ padding: "4px 2px" }}>
        <Crest club={home} size={24} />
        <b className="grow ellipsis">{home.name}</b>
        <b style={{ fontSize: 16 }} className="kbd">{r.hg} × {r.ag}</b>
        <b className="grow ellipsis" style={{ textAlign: "right" }}>{away.name}</b>
        <Crest club={away} size={24} />
      </div>
      {r.pens && <div className="small muted center">Pênaltis: {r.pens[0]} × {r.pens[1]}</div>}
    </div>
  );
}

export function MiniTable({ w, compId, full }: { w: World; compId: string; full?: boolean }) {
  const comp = w.comps[compId];
  const rows = sortTable(comp.table.slice());
  const i = rows.findIndex((r) => r.club === w.userClubId);
  const start = full ? 0 : Math.max(0, Math.min(rows.length - 6, i - 2));
  const slice = full ? rows : rows.slice(start, start + 6);
  return (
    <table className="tbl mini-tbl k-mini-tbl">
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
            <tr key={r.club} className={r.club === w.userClubId ? "me" : ""} onClick={() => push({ name: "club", id: c.id })} style={{ cursor: "pointer" }}>
              <td className="num">{start + k + 1}</td>
              <td className="team"><span className="row gap6"><Crest club={c} size={16} /><span className="ellipsis">{c.name}</span></span></td>
              <td className="num">{r.p}</td>
              <td className="num">{r.w}</td>
              <td className="num">{sg > 0 ? `+${sg}` : sg}</td>
              <td className="bold num" style={{ color: r.club === w.userClubId ? "#a78bfa" : "var(--text)" }}>{r.pts}</td>
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
        <h2 className="grow">Notícias da Imprensa</h2>
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
