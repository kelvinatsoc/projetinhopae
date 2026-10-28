import { useMemo, useState } from "react";
import { chemOf, dynDelta, moodEmoji, moraleDelta } from "../../engine/dressing";
import { formatMoney, wageBill } from "../../engine/finance";
import { awardsOf, formResidual, pendingRequest, streakOf } from "../../engine/form";
import { autoLineup, lineupStrength, squadOf, validLineup } from "../../engine/lineup";
import { age, playerValue } from "../../engine/player";
import { FORMATIONS, POS_ORDER } from "../../engine/positions";
import { potRangeLabel } from "../../engine/scouting";
import type { Player, World } from "../../engine/types";
import { push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { CompareIconBtn } from "../Compare";
import { DeltaTag, Ic, Icon, KosmalaPlayerRow, PlayerCard, PlayerRow, Stars } from "../components";
import { AcademyScreen } from "./Academy";
import { DressingScreen } from "./Dressing";
import { Pitch, TacticsScreen } from "./Tactics";
import { TrainingScreen } from "./Training";

export { Pitch, TacticsScreen };

type Sort = "pos" | "ovr" | "age" | "cond" | "value" | "form";
type SquadFilter = "all" | "starters" | "GK" | "DEF" | "MID" | "ATT" | "out" | "listed";

export function SquadScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const [tab, setTab] = useState<"list" | "dressing" | "train" | "youth">("list");
  const proCount = squadOf(w, club).length;
  const youthCount = club.players.filter((id) => w.players[id]?.youth).length;

  return (
    <div className="k-screen">
      <div className="k-subtabs" role="tablist" aria-label="Sub-abas do Elenco">
        <button className={`k-subtab${tab === "list" ? " active" : ""}`} onClick={() => setTab("list")}>
          Plantel Principal ({proCount})
        </button>
        <button className={`k-subtab${tab === "dressing" ? " active" : ""}`} onClick={() => setTab("dressing")}>
          Dinâmica & Vestiário
        </button>
        <button className={`k-subtab${tab === "train" ? " active" : ""}`} onClick={() => setTab("train")}>
          Treinos
        </button>
        <button className={`k-subtab${tab === "youth" ? " active" : ""}`} onClick={() => setTab("youth")}>
          Base Sub-20 ({youthCount})
        </button>
      </div>

      {tab === "list" ? (
        <SquadList />
      ) : tab === "dressing" ? (
        <DressingScreen />
      ) : tab === "train" ? (
        <TrainingScreen />
      ) : (
        <AcademyScreen />
      )}
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
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];
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
    cond: (a, b) => b.cond - a.cond,
    value: (a, b) => playerValue(b, w.season) - playerValue(a, w.season),
    form: (a, b) => formResidual(b, 5) - formResidual(a, 5) || b.ovr - a.ovr,
  };
  list.sort(sorters[sort]);
  const chem = chemOf(w, club);

  return (
    <div className="page k-squad-page">
      {/* Barra de filtros + KPIs estilo Opção 1 */}
      <div className="k-squad-toolbar">
        <div className="k-filter-pills">
          {([
            ["all", "Todos"],
            ["starters", "Titulares (11)"],
            ["GK", "Goleiros"],
            ["DEF", "Defensores"],
            ["MID", "Meio-Campistas"],
            ["ATT", "Atacantes"],
            ["out", "DM / Suspensos"],
            ["listed", "À venda"],
          ] as const).map(([k, l]) => (
            <button key={k} className={`k-filter-pill${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>

        <div className="k-squad-kpis">
          <span className="k-kpi-pill">XI <b>{Math.round(lineupStrength(w, club, lineup))}</b></span>
          <span className="k-kpi-pill">Química <b style={{ color: "#10b981" }}>{Math.round(chem)}%</b><DeltaTag d={dynDelta(w, "chem", chem)} /></span>
          <span className="k-kpi-pill">Folha <b>{formatMoney(wageBill(w, club))}</b></span>
          <button
            className="k-tac-chip active"
            onClick={() => {
              update(() => { club.lineup = autoLineup(w, club, undefined, club.tactic.formation, true); });
              autosave();
              toast("Melhores disponíveis escalados!");
            }}
          >
            <Ic n="sparkle" size={12} /> Escalar
          </button>
          <div className="view-toggle">
            <button className={view === "list" ? "active" : ""} onClick={() => pickView("list")} aria-label="Ver lista"><Icon name="list" size={14} /></button>
            <button className={view === "cards" ? "active" : ""} onClick={() => pickView("cards")} aria-label="Ver cartas"><Icon name="more" size={14} /></button>
          </div>
        </div>
      </div>

      <SquadPulse w={w} players={squadOf(w, club)} />

      {view === "cards" ? (
        <div className="pgrid">
          {list.map((p, i) => (
            <PlayerCard
              key={p.id}
              p={p}
              club={club}
              season={w.season}
              starter={starters.has(p.id)}
              delay={i}
              onClick={() => push({ name: "player", id: p.id })}
              mood={<span title={`Moral ${p.morale}`}>{moodEmoji(p)}<DeltaTag d={moraleDelta(w, p)} what="de moral desde o último jogo" /></span>}
            />
          ))}
        </div>
      ) : (
        <div className="k-squad-table-card">
          <div className="k-table-header extended">
            <span className="k-th-pos" onClick={() => setSort("pos")}>Posição {sort === "pos" ? "▼" : "↕"}</span>
            <span className="k-th-inf">Inf</span>
            <span className="k-th-role">Função (Dever)</span>
            <span className="k-th-flag">Nac</span>
            <span className="k-th-stars" onClick={() => setSort("ovr")}>Capacidade {sort === "ovr" ? "▼" : "↕"}</span>
            <span className="k-th-name">Nome</span>
            <span className="k-th-age" onClick={() => setSort("age")}>Idade {sort === "age" ? "▼" : "↕"}</span>
            <span className="k-th-morale" onClick={() => setSort("form")}>Moral</span>
            <span className="k-th-cond" onClick={() => setSort("cond")}>Condição {sort === "cond" ? "▼" : "↕"}</span>
            <span className="k-th-wage">Salário</span>
            <span className="k-th-val" onClick={() => setSort("value")}>Valor {sort === "value" ? "▼" : "↕"}</span>
            <span className="k-th-cmp">Cmp</span>
          </div>
          <div className="k-table-body">
            {list.map((p) => {
              const stIdx = lineup.starters.indexOf(p.id);
              const benchIdx = lineup.bench.indexOf(p.id);
              const subLabel = stIdx >= 0 ? (slots[stIdx]?.pos ?? p.pos) : benchIdx >= 0 ? `RES 0${benchIdx + 1}` : p.pos;
              return (
                <div key={p.id} className="k-ext-row-wrap">
                  <KosmalaPlayerRow
                    w={w}
                    p={p}
                    club={club}
                    slotPos={stIdx >= 0 ? slots[stIdx]?.pos : p.pos}
                    slotIdx={stIdx >= 0 ? stIdx : undefined}
                    starter={stIdx >= 0}
                    subLabel={subLabel}
                    extended
                    onClick={() => push({ name: "player", id: p.id })}
                  />
                  <div className="k-ext-cmp">
                    <CompareIconBtn p={p} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!list.length && <div className="empty">Nenhum jogador neste filtro.</div>}
      <div style={{ height: 32 }} />
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
    <div className="k-card squad-pulse" style={{ marginBottom: 8 }}>
      <div className="row"><b className="small grow">Pulso de Fase do Elenco</b><span className="tiny muted"><span className="k-pulse-chip hot"><Ic n="flame" size={12} /> Em alta: {hot.length}</span> · <span className="k-pulse-chip cold"><Ic n="snowflake" size={12} /> Em baixa: {cold.length}</span></span></div>
      {awards.length > 0 && <div className="chips mt4">{awards.map(({ p, a }) => chip(p, `${a.emoji} ${a.label.split(" ")[0]}`, "active"))}</div>}
      {reqs.length > 0 && <div className="chips mt4">{reqs.map(({ p, r }) => chip(p, r === "raise" ? "Pede valorização:" : "Quer transferência:"))}</div>}
      {(hot.length > 0 || cold.length > 0) && (
        <div className="chips mt4">{hot.slice(0, 4).map((p) => chip(p, "Em alta"))}{cold.slice(0, 3).map((p) => chip(p, "Em baixa"))}</div>
      )}
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
        <span className="row center gap6"><Ic n="sprout" size={14} /> Nível da base: <Stars count={club.youthLevel} size={13} /></span>. Novos garotos chegam todo fim de janeiro, depois da Copinha.
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
