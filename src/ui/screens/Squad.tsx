import { useMemo, useState } from "react";
import { teamLinkAvg } from "../../engine/chemistry";
import { chemOf } from "../../engine/dressing";
import { formatMoney, wageBill } from "../../engine/finance";
import { awardsOf, formResidual, pendingRequest, streakOf } from "../../engine/form";
import { lineupStrength, squadOf, validLineup } from "../../engine/lineup";
import { age, playerValue } from "../../engine/player";
import { potRangeLabel } from "../../engine/scouting";
import { POS_ORDER } from "../../engine/positions";
import { familiarityOf } from "../../engine/tactics";
import type { Player, World } from "../../engine/types";
import { push, useWorld } from "../../store";
import { FormDots, PlayerCard, PlayerRow, TrendArrow } from "../components";
import { AcademyScreen } from "./Academy";
import { TrainingScreen } from "./Training";
import { Pitch, TacticsScreen } from "./Tactics";

export { Pitch, TacticsScreen };

type Sort = "pos" | "ovr" | "age" | "cond" | "value" | "form";

export function SquadScreen() {
  const [tab, setTab] = useState<"list" | "tactics" | "train" | "youth">("list");
  return (
    <div>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="seg">
          <button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>Elenco</button>
          <button className={tab === "tactics" ? "active" : ""} onClick={() => setTab("tactics")}>Tática</button>
          <button className={tab === "train" ? "active" : ""} onClick={() => setTab("train")}>Treino</button>
          <button className={tab === "youth" ? "active" : ""} onClick={() => setTab("youth")}>Base</button>
        </div>
      </div>
      {tab === "list" ? <SquadList /> : tab === "tactics" ? <TacticsScreen /> : tab === "train" ? <TrainingScreen /> : <AcademyScreen />}
    </div>
  );
}

function SquadList() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const [sort, setSort] = useState<Sort>("pos");
  const [filter, setFilter] = useState<"all" | "starters" | "out" | "listed">("all");
  const [view, setViewMode] = useState<"cards" | "list">(() => { try { return localStorage.getItem("ldb.squadView") === "list" ? "list" : "cards"; } catch { return "cards"; } });
  const pickView = (v: "cards" | "list") => { setViewMode(v); try { localStorage.setItem("ldb.squadView", v); } catch { /* sem armazenamento */ } };
  const lineup = useMemo(() => validLineup(w, club), [w, club, club.players.length, club.lineup]);
  const starters = new Set(lineup.starters.filter((x): x is number => x != null));
  let list = squadOf(w, club);
  if (filter === "starters") list = list.filter((p) => starters.has(p.id));
  if (filter === "out") list = list.filter((p) => p.injury > 0 || Object.values(p.bans).some((b) => b > 0));
  if (filter === "listed") list = list.filter((p) => p.listed);
  const sorters: Record<Sort, (a: Player, b: Player) => number> = {
    pos: (a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr,
    ovr: (a, b) => b.ovr - a.ovr,
    age: (a, b) => a.born - b.born,
    cond: (a, b) => a.cond - b.cond,
    value: (a, b) => playerValue(b, w.season) - playerValue(a, w.season),
    form: (a, b) => formResidual(b, 5) - formResidual(a, 5) || b.ovr - a.ovr,
  };
  list.sort(sorters[sort]);
  const avg = list.length ? Math.round(list.reduce((s, p) => s + p.ovr, 0) / list.length) : 0;

  return (
    <div className="page">
      <div className="grid3">
        <div className="stat-box"><b>{squadOf(w, club).length}</b><span>jogadores</span></div>
        <div className="stat-box"><b>{Math.round(lineupStrength(w, club, lineup))}</b><span>força do time</span></div>
        <div className="stat-box"><b style={{ fontSize: 14 }}>{formatMoney(wageBill(w, club))}</b><span>folha mensal</span></div>
      </div>
      <div className="row">
      <div className="small muted grow" title="Entrosamento: o time joga melhor junto (vitórias, poucas trocas no elenco e o foco Tático no treino)">
        🤝 Entrosamento <b style={{ color: "var(--text)" }}>{Math.round(chemOf(w, club))}%</b> · em campo {Math.round(teamLinkAvg(w, club, lineup.starters))} · 📘 {Math.round(familiarityOf(w, club))}% · média {avg}
      </div>
      <div className="view-toggle">
        <button className={view === "cards" ? "active" : ""} onClick={() => pickView("cards")} aria-label="Ver cartas">▦</button>
        <button className={view === "list" ? "active" : ""} onClick={() => pickView("list")} aria-label="Ver lista">☰</button>
      </div>
      </div>
      <SquadPulse w={w} players={squadOf(w, club)} />
      <div className="chips">
        {([["all", "Todos"], ["starters", "Titulares"], ["out", "Lesionados/suspensos"], ["listed", "À venda"]] as const).map(([k, l]) => (
          <button key={k} className={`chip${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="chips">
        <span className="small muted" style={{ alignSelf: "center" }}>Ordenar:</span>
        {([["pos", "Posição"], ["ovr", "Overall"], ["form", "Fase"], ["age", "Idade"], ["cond", "Condição"], ["value", "Valor"]] as const).map(([k, l]) => (
          <button key={k} className={`chip${sort === k ? " active" : ""}`} onClick={() => setSort(k)}>{l}</button>
        ))}
      </div>
      {view === "cards" ? (
        <div className="pgrid">
          {list.map((p, i) => (
            <PlayerCard key={p.id} p={p} club={club} season={w.season} starter={starters.has(p.id)} delay={i} onClick={() => push({ name: "player", id: p.id })} />
          ))}
        </div>
      ) : (
      <div className="card flat" style={{ padding: "2px 10px" }}>
        <div className="list">
          {list.map((p) => (
            <PlayerRow key={p.id} p={p} club={club} season={w.season} onClick={() => push({ name: "player", id: p.id })}
              right={<span className="col" style={{ alignItems: "flex-end", gap: 2 }}><FormDots p={p} size={13} /><span className="tiny"><TrendArrow p={p} />{starters.has(p.id) ? <span className="tag good" style={{ marginLeft: 4 }}>XI</span> : null}</span></span>} />
          ))}
        </div>
      </div>
      )}
      {!list.length && <div className="empty">😶 Nenhum jogador neste filtro.</div>}
      <div style={{ height: 50 }} />
    </div>
  );
}

/** Fase do elenco: quem está em alta/baixa, pedidos em aberto e prêmios recentes. */
function SquadPulse({ w, players }: { w: World; players: Player[] }) {
  const hot = players.filter((p) => streakOf(p) === "hot");
  const cold = players.filter((p) => streakOf(p) === "cold");
  const reqs = players.map((p) => ({ p, r: pendingRequest(w, p) })).filter((x) => x.r);
  const last = w.history[w.history.length - 1]?.season;
  const awards = last == null ? [] : players.flatMap((p) => awardsOf(w, p.id).filter((a) => a.season === last).map((a) => ({ p, a })));
  if (!hot.length && !cold.length && !reqs.length && !awards.length) return null;
  const chip = (p: Player, label: string, cls = "") => (
    <button key={`${label}-${p.id}`} className={`chip ${cls}`} onClick={() => push({ name: "player", id: p.id })}>{label} {p.name.split(" ").slice(-1)[0]}</button>
  );
  return (
    <div className="card flat squad-pulse">
      <div className="row"><b className="small grow">Fase do elenco</b><span className="tiny muted">🔥 {hot.length} · 🧊 {cold.length}</span></div>
      {awards.length > 0 && <div className="chips mt4">{awards.map(({ p, a }) => chip(p, `${a.emoji} ${a.label.split(" ")[0]}`, "active"))}</div>}
      {reqs.length > 0 && <div className="chips mt4">{reqs.map(({ p, r }) => chip(p, r === "raise" ? "📝 Quer aumento:" : "🚀 Quer clube maior:"))}</div>}
      {(hot.length > 0 || cold.length > 0) && (
        <div className="chips mt4">{hot.slice(0, 4).map((p) => chip(p, "🔥"))}{cold.slice(0, 3).map((p) => chip(p, "🧊"))}</div>
      )}
      <div className="tiny muted mt4">Boa fase com minutos acelera a evolução; banco e notas ruins travam.</div>
    </div>
  );
}

export function YouthScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const youth = club.players.map((id) => w.players[id]).filter((p) => p?.youth).sort((a, b) => b.pot - a.pot);
  return (
    <div className="page">
      <div className="card flat small">
        🌱 Nível da base: <b>{"★".repeat(club.youthLevel)}{"☆".repeat(5 - club.youthLevel)}</b>. Novos garotos chegam todo fim de janeiro, depois da Copinha.
        Lendas do futebol podem renascer aqui! Promova quem estiver pronto para o profissional.
      </div>
      <div className="card flat" style={{ padding: "2px 10px" }}>
        <div className="list">
          {youth.map((p) => (
            <PlayerRow key={p.id} p={p} club={club} season={w.season} onClick={() => push({ name: "player", id: p.id })}
              right={<span className="tag">pot. {potLabel(w, p)}</span>} />
          ))}
        </div>
        {!youth.length && <div className="empty">Nenhum jogador nas categorias de base.</div>}
      </div>
      <div className="tiny muted center">{youth.length} jogadores · idade média {youth.length ? Math.round(youth.reduce((s, p) => s + age(p, w.season), 0) / youth.length) : 0}</div>
      <div style={{ height: 40 }} />
    </div>
  );
}

/** Potencial aproximado (faixa), como os olheiros enxergam. */
export function potLabel(w: World, p: Player): string {
  return potRangeLabel(w, p);
}
