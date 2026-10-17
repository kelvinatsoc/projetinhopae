import { useMemo, useState } from "react";
import { CompareIconBtn } from "../Compare";
import { chemOf, dynDelta, moodEmoji, moraleDelta } from "../../engine/dressing";
import { formatMoney, wageBill } from "../../engine/finance";
import { awardsOf, formResidual, pendingRequest, streakOf } from "../../engine/form";
import { autoLineup, lineupStrength, squadOf, validLineup } from "../../engine/lineup";
import { age, playerValue } from "../../engine/player";
import { potRangeLabel } from "../../engine/scouting";
import { POS_ORDER } from "../../engine/positions";
import type { Player, World } from "../../engine/types";
import { push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { DeltaTag, FormDots, PlayerCard, PlayerRow } from "../components";
import { AcademyScreen } from "./Academy";
import { TrainingScreen } from "./Training";
import { Pitch, TacticsScreen } from "./Tactics";

export { Pitch, TacticsScreen };

type Sort = "pos" | "ovr" | "age" | "cond" | "value" | "form";
type SquadFilter = "all" | "starters" | "GK" | "DEF" | "MID" | "ATT" | "out" | "listed";

export function SquadScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const [tab, setTab] = useState<"list" | "tactics" | "train" | "youth">("list");
  const proCount = squadOf(w, club).length;
  const youthCount = club.players.filter((id) => w.players[id]?.youth).length;
  return (
    <div>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="seg">
          <button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>Elenco ({proCount})</button>
          <button className={tab === "tactics" ? "active" : ""} onClick={() => setTab("tactics")}>Campo Tático</button>
          <button className={tab === "train" ? "active" : ""} onClick={() => setTab("train")}>Treino</button>
          <button className={tab === "youth" ? "active" : ""} onClick={() => setTab("youth")}>Base ({youthCount})</button>
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
  const [filter, setFilter] = useState<SquadFilter>("all");
  const [view, setViewMode] = useState<"cards" | "list">(() => {
    try { return localStorage.getItem("ldb.squadView") === "cards" ? "cards" : "list"; } catch { return "list"; }
  });
  const pickView = (v: "cards" | "list") => {
    setViewMode(v);
    try { localStorage.setItem("ldb.squadView", v); } catch { /* sem armazenamento */ }
  };
  const lineup = useMemo(() => validLineup(w, club), [w, club, club.players.length, club.lineup]);
  const starters = new Set(lineup.starters.filter((x): x is number => x != null));
  let list = squadOf(w, club);
  if (filter === "starters") list = list.filter((p) => starters.has(p.id));
  else if (filter === "GK") list = list.filter((p) => p.pos === "GOL");
  else if (filter === "DEF") list = list.filter((p) => p.pos === "ZAG" || p.pos === "LD" || p.pos === "LE");
  else if (filter === "MID") list = list.filter((p) => p.pos === "VOL" || p.pos === "MC" || p.pos === "MEI");
  else if (filter === "ATT") list = list.filter((p) => p.pos === "PD" || p.pos === "PE" || p.pos === "ATA");
  else if (filter === "out") list = list.filter((p) => p.injury > 0 || Object.values(p.bans).some((b) => b > 0));
  else if (filter === "listed") list = list.filter((p) => p.listed);

  const sorters: Record<Sort, (a: Player, b: Player) => number> = {
    pos: (a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr,
    ovr: (a, b) => b.ovr - a.ovr,
    age: (a, b) => a.born - b.born,
    cond: (a, b) => a.cond - b.cond,
    value: (a, b) => playerValue(b, w.season) - playerValue(a, w.season),
    form: (a, b) => formResidual(b, 5) - formResidual(a, 5) || b.ovr - a.ovr,
  };
  list.sort(sorters[sort]);
  const chem = chemOf(w, club);

  return (
    <div className="page">
      <div className="kpi-bar">
        <div className="kb-item">
          <b>{Math.round(lineupStrength(w, club, lineup))}</b>
          <span>Força XI</span>
        </div>
        <div className="kb-item">
          <b style={{ color: "var(--accent)" }}>{Math.round(chem)}%<DeltaTag d={dynDelta(w, "chem", chem)} /></b>
          <span>Química</span>
        </div>
        <div className="kb-item">
          <b style={{ fontSize: 14 }}>{formatMoney(wageBill(w, club))}</b>
          <span>Folha/Mês</span>
        </div>
        <div className="kb-actions">
          <button className="kb-auto" onClick={() => {
            update(() => { club.lineup = autoLineup(w, club, undefined, club.tactic.formation, true); });
            autosave();
            toast("Melhores disponíveis escalados!");
          }}>⚡ Escalar</button>
          <div className="view-toggle">
            <button className={view === "list" ? "active" : ""} onClick={() => pickView("list")} aria-label="Ver lista">☰</button>
            <button className={view === "cards" ? "active" : ""} onClick={() => pickView("cards")} aria-label="Ver cartas">▦</button>
          </div>
        </div>
      </div>

      <SquadPulse w={w} players={squadOf(w, club)} />

      <div className="chip-row">
        {([
          ["all", "Todos"],
          ["starters", "Titulares"],
          ["GK", "GOL"],
          ["DEF", "DEF"],
          ["MID", "MEI"],
          ["ATT", "ATA"],
          ["out", "Lesionados"],
          ["listed", "À venda"],
        ] as const).map(([k, l]) => (
          <button key={k} className={`chip${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <select className="chip-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar elenco">
          <option value="pos">↕ Posição</option>
          <option value="ovr">↕ Overall</option>
          <option value="form">↕ Fase</option>
          <option value="age">↕ Idade</option>
          <option value="cond">↕ Condição</option>
          <option value="value">↕ Valor</option>
        </select>
      </div>

      {view === "cards" ? (
        <div className="pgrid">
          {list.map((p, i) => (
            <PlayerCard key={p.id} p={p} club={club} season={w.season} starter={starters.has(p.id)} delay={i} onClick={() => push({ name: "player", id: p.id })}
              mood={<span title={`Moral ${p.morale}`}>{moodEmoji(p)}<DeltaTag d={moraleDelta(w, p)} what="de moral desde o último jogo" /></span>} />
          ))}
        </div>
      ) : (
        <div className="card flat" style={{ padding: "2px 10px" }}>
          <div className="list">
            {list.map((p) => (
              <PlayerRow key={p.id} p={p} club={club} season={w.season} starter={starters.has(p.id)} onClick={() => push({ name: "player", id: p.id })}
                mood={<span title={`Moral ${p.morale}`}>{moodEmoji(p)}<DeltaTag d={moraleDelta(w, p)} what="de moral desde o último jogo" /></span>}
                right={
                  <span className="row gap4" style={{ flex: "none" }}>
                    {p.form.length > 0 && <FormDots p={p} size={13} />}
                    <CompareIconBtn p={p} />
                  </span>
                }
              />
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
