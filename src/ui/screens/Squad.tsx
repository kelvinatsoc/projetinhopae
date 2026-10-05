import { useMemo, useState } from "react";
import { chemOf } from "../../engine/dressing";
import { formatMoney, wageBill } from "../../engine/finance";
import { autoLineup, lineupStrength, squadOf, validLineup } from "../../engine/lineup";
import { age, playerValue, shortName } from "../../engine/player";
import { potRangeLabel } from "../../engine/scouting";
import { FORMATION_DESC, FORMATIONS, MENTALITY_NAMES, ovrAt, POS_ORDER, PRESSING_NAMES } from "../../engine/positions";
import type { Club, Lineup, Player, World } from "../../engine/types";
import { push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { TacticsAdvice } from "../Assistant";
import { Avatar, Bar, Ovr, PlayerCard, PlayerRow, PosBadge } from "../components";
import { AcademyScreen } from "./Academy";
import { TrainingScreen } from "./Training";

type Sort = "pos" | "ovr" | "age" | "cond" | "value";

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
        🤝 Entrosamento <b style={{ color: "var(--text)" }}>{Math.round(chemOf(w, club))}%</b> · média {avg}
      </div>
      <div className="view-toggle">
        <button className={view === "cards" ? "active" : ""} onClick={() => pickView("cards")} aria-label="Ver cartas">▦</button>
        <button className={view === "list" ? "active" : ""} onClick={() => pickView("list")} aria-label="Ver lista">☰</button>
      </div>
      </div>
      <div className="chips">
        {([["all", "Todos"], ["starters", "Titulares"], ["out", "Lesionados/suspensos"], ["listed", "À venda"]] as const).map(([k, l]) => (
          <button key={k} className={`chip${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="chips">
        <span className="small muted" style={{ alignSelf: "center" }}>Ordenar:</span>
        {([["pos", "Posição"], ["ovr", "Overall"], ["age", "Idade"], ["cond", "Condição"], ["value", "Valor"]] as const).map(([k, l]) => (
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
              right={starters.has(p.id) ? <span className="tag good">titular</span> : undefined} />
          ))}
        </div>
      </div>
      )}
      {!list.length && <div className="empty">😶 Nenhum jogador neste filtro.</div>}
      <div style={{ height: 50 }} />
    </div>
  );
}

/** Reencaixa os mesmos 11 jogadores numa nova formação. */
function refit(w: World, formation: string, current: Lineup): Lineup {
  const slots = FORMATIONS[formation];
  const players = current.starters.filter((x): x is number => x != null).map((id) => w.players[id]);
  const pairs: { s: number; p: Player; v: number }[] = [];
  slots.forEach((slot, s) => players.forEach((p) => pairs.push({ s, p, v: ovrAt(p, slot.pos) })));
  pairs.sort((a, b) => b.v - a.v);
  const starters: (number | null)[] = slots.map(() => null);
  const used = new Set<number>();
  for (const { s, p } of pairs) {
    if (starters[s] != null || used.has(p.id)) continue;
    starters[s] = p.id;
    used.add(p.id);
  }
  return { ...current, starters };
}

export function TacticsScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const lineup = validLineup(w, club);
  const [sel, setSel] = useState<number | null>(null); // slot selecionado
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];

  function save(l: Lineup) {
    update(() => { club.lineup = l; });
    autosave();
  }

  function setFormation(f: string) {
    update(() => {
      const cur = validLineup(w, club);
      club.tactic.formation = f;
      club.lineup = refit(w, f, cur);
    });
    autosave();
  }

  function tapSlot(i: number) {
    if (sel === null) { setSel(i); return; }
    if (sel === i) { setSel(null); return; }
    const s = lineup.starters.slice();
    [s[sel], s[i]] = [s[i], s[sel]];
    save({ ...lineup, starters: s });
    setSel(null);
  }

  function tapReserve(p: Player) {
    if (p.injury > 0) { toast(`${p.name} está lesionado.`); return; }
    if (sel !== null) {
      const s = lineup.starters.slice();
      const out = s[sel];
      s[sel] = p.id;
      let bench = lineup.bench.filter((b) => b !== p.id);
      if (out != null && lineup.bench.includes(p.id)) bench = [...bench, out];
      save({ ...lineup, starters: s, bench });
      setSel(null);
      return;
    }
    // sem posição selecionada: entra/sai do banco
    if (lineup.bench.includes(p.id)) save({ ...lineup, bench: lineup.bench.filter((b) => b !== p.id) });
    else if (lineup.bench.length < 9) save({ ...lineup, bench: [...lineup.bench, p.id] });
    else toast("O banco já tem 9 jogadores. Tire alguém antes.");
  }

  const startersSet = new Set(lineup.starters.filter((x): x is number => x != null));
  const others = squadOf(w, club, true).filter((p) => !startersSet.has(p.id)).sort((a, b) => {
    const ba = lineup.bench.includes(a.id) ? 0 : 1, bb = lineup.bench.includes(b.id) ? 0 : 1;
    if (ba !== bb) return ba - bb;
    if (sel !== null) return ovrAt(b, slots[sel].pos) - ovrAt(a, slots[sel].pos);
    return POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr;
  });

  return (
    <div className="page">
      <TacticsAdvice />
      <div className="chips">
        {Object.keys(FORMATIONS).map((f) => (
          <button key={f} className={`chip${club.tactic.formation === f ? " active" : ""}`} onClick={() => setFormation(f)}>{f}</button>
        ))}
      </div>
      <div className="small muted">{FORMATION_DESC[club.tactic.formation]} · força {Math.round(lineupStrength(w, club, lineup))}</div>

      <Pitch w={w} club={club} lineup={lineup} sel={sel} onTap={tapSlot} />

      <div className="row gap8">
        <button className="btn sm" onClick={() => { save(autoLineup(w, club, undefined, club.tactic.formation, true)); setSel(null); toast("Time escalado automaticamente"); }}>✨ Escalar automaticamente</button>
        <button className="btn sm" onClick={() => push({ name: "setpieces" })}>🎯 Bola parada</button>
        {sel !== null && <span className="small muted">Toque em outro jogador para trocar</span>}
      </div>

      <div className="card flat">
        <b className="small">Mentalidade</b>
        <div className="seg mt8">
          {[-2, -1, 0, 1, 2].map((m) => (
            <button key={m} className={club.tactic.mentality === m ? "active" : ""} onClick={() => { update(() => { club.tactic.mentality = m; }); autosave(); }}>
              {MENTALITY_NAMES[m].split(" ")[0]}
            </button>
          ))}
        </div>
        <b className="small" style={{ display: "block", marginTop: 10 }}>Marcação</b>
        <div className="seg mt8">
          {[0, 1, 2].map((m) => (
            <button key={m} className={club.tactic.pressing === m ? "active" : ""} onClick={() => { update(() => { club.tactic.pressing = m; }); autosave(); }}>
              {PRESSING_NAMES[m].replace("Marcação ", "")}
            </button>
          ))}
        </div>
      </div>

      <h3>Banco ({lineup.bench.length}/9) e reservas</h3>
      <div className="card flat" style={{ padding: "2px 10px" }}>
        <div className="list">
          {others.map((p) => {
            const onBench = lineup.bench.includes(p.id);
            return (
              <div key={p.id} className="list-item" onClick={() => tapReserve(p)}>
                <Avatar p={p} club={club} season={w.season} size={36} />
                <div className="grow">
                  <div className="row gap4"><b className="ellipsis">{p.name}</b>{p.youth && <span className="tag">base</span>}{p.legend && <span className="tag legend">★</span>}{p.injury > 0 && <span className="tag danger">🚑</span>}</div>
                  <div className="row gap8 small muted"><PosBadge pos={p.pos} /><span style={{ width: 46 }}><Bar v={p.cond} /></span>{sel !== null && <span>na posição: {ovrAt(p, slots[sel].pos)}</span>}</div>
                </div>
                {onBench && <span className="tag good">banco</span>}
                <Ovr v={p.ovr} />
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ height: 40 }} />
    </div>
  );
}

export function Pitch({ w, club, lineup, sel, onTap }: { w: World; club: Club; lineup: Lineup; sel: number | null; onTap?: (i: number) => void }) {
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];
  return (
    <div className="pitch">
      <svg className="lines" viewBox="0 0 100 140" preserveAspectRatio="none">
        <g fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5">
          <rect x="3" y="3" width="94" height="134" />
          <line x1="3" y1="70" x2="97" y2="70" />
          <circle cx="50" cy="70" r="11" />
          <rect x="22" y="3" width="56" height="20" />
          <rect x="36" y="3" width="28" height="8" />
          <rect x="22" y="117" width="56" height="20" />
          <rect x="36" y="129" width="28" height="8" />
        </g>
      </svg>
      {slots.map((s, i) => {
        const id = lineup.starters[i];
        const p = id != null ? w.players[id] : null;
        const fit = p ? ovrAt(p, s.pos) : 0;
        return (
          <div key={i} className={`slot${sel === i ? " selected" : ""}${p ? "" : " empty"}`} style={{ left: `${s.x}%`, top: `${100 - s.y * 0.92 - 4}%` }} onClick={() => onTap?.(i)}>
            {p ? <Avatar p={p} club={club} season={w.season} size={40} /> : <div className="avatar" style={{ width: 40, height: 40 }} />}
            <span className="nm">{p ? shortName(p.name) : s.pos}</span>
            {p && (
              <span className="meta">
                <span className="pos" style={{ background: fit >= p.ovr - 1 ? "#1f9d55" : fit >= p.ovr - 6 ? "#c78a12" : "#c0392b", minWidth: 0 }}>{s.pos} {fit}</span>
              </span>
            )}
            {p && <span style={{ width: 36 }}><Bar v={p.cond} /></span>}
          </div>
        );
      })}
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
