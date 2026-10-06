// Habilidades do jogador (barras + radar) e comparação lado a lado de até 3 jogadores.
import { useState, type MouseEvent } from "react";
import { bestIndexes, starterFor, SUMMARY_KEYS, SUMMARY_NAMES, summaryStats } from "../engine/compare";
import { formatMoney } from "../engine/finance";
import { H, hidOf, type HiddenKey } from "../engine/personality";
import { age, playerValue } from "../engine/player";
import { ATTR_NAMES, POS_NAME } from "../engine/positions";
import { knowledgeOf, PERSONALITY_K, potRange, potRangeLabel } from "../engine/scouting";
import type { Attrs, Player, World } from "../engine/types";
import { push, replace, toast, useWorld } from "../store";
import { Avatar, FormDots, PosBadge, Sheet } from "./components";
import "./compare.css";

/** Cores dos jogadores na comparação (1º, 2º, 3º). */
const SERIES = ["#2ecc71", "#4fa3ff", "#f5c542"];
export const MAX_COMPARE = 3;

export function attrColor(v: number): string {
  return v >= 80 ? "#2ecc71" : v >= 65 ? "#b9e66d" : v >= 50 ? "var(--warn)" : "var(--danger)";
}

type Row = { label: string; get: (p: Player) => number | null; mental?: boolean };
type Group = { title: string; rows: Row[] };

const attr = (k: keyof Attrs): Row => ({ label: ATTR_NAMES[k], get: (p) => Math.round(p.attrs[k]) });
/** Ocultos (1–20) mostrados em escala 1–99; "Calma" é o temperamento invertido. */
const hid = (label: string, k: HiddenKey, invert = false): Row => ({
  label, mental: true,
  get: (p) => { const v = hidOf(p)[H[k]]; return Math.round(((invert ? 21 - v : v) / 20) * 99); },
});

export function abilityGroups(gk: boolean): Group[] {
  const groups: Group[] = [
    { title: "Técnica", rows: [attr("fin"), attr("pas"), attr("dri"), attr("def")] },
    { title: "Físico", rows: [attr("vel"), attr("fis")] },
    { title: "Mental", rows: [hid("Profissionalismo", "pro"), hid("Regularidade", "con"), hid("Jogos grandes", "big"), hid("Calma", "temp", true), hid("Ambição", "amb")] },
  ];
  if (gk) groups.unshift({ title: "Goleiro", rows: [attr("gol")] });
  return groups;
}

/** Nível em palavras para atributos mentais (o clube não vê o número exato). */
function mentalWord(v: number): string {
  return v >= 80 ? "Excelente" : v >= 60 ? "Alto" : v >= 40 ? "Médio" : "Baixo";
}

const mentalKnown = (w: World, p: Player) => knowledgeOf(w, p) >= PERSONALITY_K;

// ---------------------------------------------------------------- radar
export function Radar({ players, size = 220 }: { players: Player[]; size?: number }) {
  const c = size / 2, r = size / 2 - 34;
  const n = SUMMARY_KEYS.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r * (v / 99), c + Math.sin(a) * r * (v / 99)] as const;
  };
  const poly = (v: number[]) => v.map((x, i) => pt(i, x).join(",")).join(" ");
  const stats = players.map(summaryStats);
  const single = players.length === 1;
  return (
    <svg className="cmp-radar" viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label="Radar de habilidades">
      {[25, 50, 75, 99].map((lv) => <polygon key={lv} points={poly(SUMMARY_KEYS.map(() => lv))} className="cmp-radar-grid" />)}
      {SUMMARY_KEYS.map((_, i) => { const [x, y] = pt(i, 99); return <line key={i} x1={c} y1={c} x2={x} y2={y} className="cmp-radar-grid" />; })}
      {stats.map((s, j) => (
        <polygon key={j} points={poly(SUMMARY_KEYS.map((k) => s[k]))} fill={SERIES[j]} fillOpacity={single ? 0.28 : 0.16} stroke={SERIES[j]} strokeWidth={2} strokeLinejoin="round" />
      ))}
      {SUMMARY_KEYS.map((k, i) => {
        const [x, y] = pt(i, 99 + 30);
        return (
          <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="cmp-radar-label">
            <tspan x={x} dy={single ? "-0.45em" : 0}>{SUMMARY_NAMES[k].slice(0, 3).toUpperCase()}</tspan>
            {single && <tspan x={x} dy="1.15em" className="cmp-radar-val" fill={attrColor(stats[0][k])}>{stats[0][k]}</tspan>}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- habilidades (tela do jogador)
export function AbilitiesCard({ p }: { p: Player }) {
  const w = useWorld();
  const known = mentalKnown(w, p);
  return (
    <div className="card cmp-abilities">
      <div className="card-title">
        <h3>Habilidades</h3>
        <CompareButton p={p} label="Comparar" />
      </div>
      <div className="cmp-radar-wrap"><Radar players={[p]} /></div>
      {abilityGroups(p.pos === "GOL").map((g) => (
        <div key={g.title} className="cmp-group">
          <div className="cmp-group-title">{g.title}{g.title === "Mental" && !known && <span className="tiny muted"> · observe para descobrir</span>}</div>
          {g.rows.map((r) => {
            const v = r.get(p);
            const hide = r.mental && !known;
            return (
              <div key={r.label} className="attr cmp-attr">
                <span className="muted">{r.label}</span>
                <div className="bar"><i style={{ width: hide ? 0 : `${v}%`, background: v != null ? attrColor(v) : undefined }} /></div>
                <b className={`kbd${r.mental ? " cmp-word" : ""}`}>{hide ? "?" : r.mental ? mentalWord(v ?? 0) : v}</b>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- botões de entrada
/** Abre a comparação com o jogador (e opcionalmente outros). */
export function openCompare(ids: number[]) {
  push({ name: "compare", ids: [...new Set(ids)].slice(0, MAX_COMPARE) });
}

export function CompareButton({ p, label }: { p: Player; label?: string }) {
  return (
    <button className="btn sm" onClick={() => openCompare([p.id])} aria-label={`Comparar ${p.name}`}>
      <CompareIcon /> {label}
    </button>
  );
}

/** Ícone para listas: no mercado compara direto com o seu titular da posição. */
export function CompareIconBtn({ p, withStarter }: { p: Player; withStarter?: boolean }) {
  const w = useWorld();
  const go = (e: MouseEvent) => {
    e.stopPropagation();
    const st = withStarter ? starterFor(w, p.pos, p.id) : null;
    openCompare(st ? [p.id, st.id] : [p.id]);
  };
  return (
    <button className="icon-btn cmp-icon-btn" onClick={go} aria-label={withStarter ? `Comparar ${p.name} com o seu titular` : `Comparar ${p.name}`} title="Comparar">
      <CompareIcon />
    </button>
  );
}

function CompareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-3px" }}>
      <path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" />
    </svg>
  );
}

// ---------------------------------------------------------------- tela de comparação
type InfoRow = { label: string; show: (p: Player) => string; num?: (p: Player) => number | null; lowerBetter?: boolean };

export function CompareScreen({ ids }: { ids: number[] }) {
  const w = useWorld();
  const [picking, setPicking] = useState(false);
  const ps = ids.map((id) => w.players[id]).filter((p): p is Player => !!p);
  if (!ps.length) return <div className="page"><div className="empty">Nenhum jogador para comparar.</div></div>;
  const setIds = (next: number[]) => replace({ name: "compare", ids: next });
  const remove = (id: number) => setIds(ids.filter((x) => x !== id));
  const anyGk = ps.some((p) => p.pos === "GOL");
  const allGk = ps.every((p) => p.pos === "GOL");
  const groups = abilityGroups(allGk || anyGk).filter((g) => g.title !== "Goleiro" || anyGk);
  const first = ps[0];
  const starter = first.clubId !== w.userClubId ? starterFor(w, first.pos, first.id) : null;

  const info: InfoRow[] = [
    { label: "Posição", show: (p) => POS_NAME[p.pos] ?? p.pos },
    { label: "Idade", show: (p) => `${age(p, w.season)} anos`, num: (p) => -age(p, w.season) },
    { label: "Overall", show: (p) => `${p.ovr}`, num: (p) => p.ovr },
    { label: "Potencial", show: (p) => potRangeLabel(w, p), num: (p) => { const [lo, hi] = potRange(w, p); return hi - lo <= 2 ? hi : null; } },
    { label: "Valor", show: (p) => formatMoney(playerValue(p, w.season)) },
    { label: "Salário", show: (p) => (p.clubId ? formatMoney(p.wage) : "-") },
  ];

  const cols = { gridTemplateColumns: `minmax(0, 1fr) repeat(${ps.length}, minmax(0, 1fr))` };

  return (
    <div className="page cmp-page">
      <div className="cmp-heads" style={{ gridTemplateColumns: `repeat(${ps.length + (ps.length < MAX_COMPARE ? 1 : 0)}, minmax(0, 1fr))` }}>
        {ps.map((p, j) => (
          <div key={p.id} className="cmp-head" style={{ borderColor: SERIES[j] }}>
            {ps.length > 1 && <button className="cmp-x" onClick={() => remove(p.id)} aria-label={`Tirar ${p.name}`}>×</button>}
            <div onClick={() => push({ name: "player", id: p.id })} className="cmp-head-tap">
              <Avatar p={p} club={p.clubId ? w.clubs[p.clubId] : null} season={w.season} size={48} />
              <b className="cmp-name">{p.name}</b>
              <span className="tiny muted ellipsis cmp-club">{p.clubId ? w.clubs[p.clubId]?.name : "Livre"}</span>
              <span className="row gap4" style={{ justifyContent: "center" }}><PosBadge pos={p.pos} /><b className="cmp-ovr" style={{ color: SERIES[j] }}>{p.ovr}</b></span>
            </div>
          </div>
        ))}
        {ps.length < MAX_COMPARE && (
          <button className="cmp-head cmp-add" onClick={() => setPicking(true)}>
            <span className="cmp-plus">+</span>
            <span className="small">Adicionar jogador</span>
          </button>
        )}
      </div>

      {starter && !ids.includes(starter.id) && ps.length < MAX_COMPARE && (
        <button className="btn block sm mt8" onClick={() => setIds([...ids, starter.id])}>
          Comparar com meu titular ({starter.name.split(" ").slice(-1)[0]})
        </button>
      )}

      <div className="card mt12">
        <div className="cmp-radar-wrap"><Radar players={ps} /></div>
        {ps.length > 1 && (
          <div className="cmp-legend">
            {ps.map((p, j) => <span key={p.id}><i style={{ background: SERIES[j] }} />{p.name.split(" ").slice(-1)[0]}</span>)}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Resumo</h3>
        <div className="cmp-table mt8">
          {info.map((r) => {
            const best = r.num ? bestIndexes(ps.map(r.num)) : [];
            return (
              <div key={r.label} className="cmp-row" style={cols}>
                <span className="muted">{r.label}</span>
                {ps.map((p, j) => <b key={p.id} className={best.includes(j) ? "cmp-best" : ""}>{r.show(p)}</b>)}
              </div>
            );
          })}
          <div className="cmp-row" style={cols}>
            <span className="muted">Forma</span>
            {ps.map((p) => <span key={p.id} className="cmp-form"><FormDots p={p} size={12} /></span>)}
          </div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.title} className="card">
          <h3>{g.title}</h3>
          <div className="cmp-table mt8">
            {g.rows.map((r) => {
              const vals = ps.map((p) => (r.mental && !mentalKnown(w, p) ? null : r.get(p)));
              const best = bestIndexes(vals);
              return (
                <div key={r.label} className="cmp-row" style={cols}>
                  <span className="muted ellipsis">{r.label}</span>
                  {vals.map((v, j) => (
                    <span key={j} className={`cmp-cell${best.includes(j) ? " cmp-best" : ""}`}>
                      <b>{v == null ? "?" : r.mental ? mentalWord(v) : v}</b>
                      <span className="cmp-mini"><i style={{ width: `${v ?? 0}%`, background: v != null ? attrColor(v) : undefined }} /></span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="tiny muted" style={{ padding: "0 4px 24px" }}>Em destaque, o melhor valor de cada linha. Atributos mentais de jogadores de fora aparecem com {PERSONALITY_K}% de conhecimento dos olheiros.</div>

      {picking && <PickSheet exclude={ids} pos={first.pos} onClose={() => setPicking(false)} onPick={(id) => { setPicking(false); setIds([...ids, id]); }} />}
    </div>
  );
}

function PickSheet({ exclude, pos, onClose, onPick }: { exclude: number[]; pos: Player["pos"]; onClose: () => void; onPick: (id: number) => void }) {
  const w = useWorld();
  const [tab, setTab] = useState<"squad" | "short" | "pos" | "search">("squad");
  const [q, setQ] = useState("");
  const all = Object.values(w.players);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let list: Player[];
  if (q.trim().length >= 2) {
    const nq = norm(q.trim());
    list = all.filter((p) => norm(p.name).includes(nq)).sort((a, b) => b.ovr - a.ovr);
  } else if (tab === "squad") {
    list = (w.clubs[w.userClubId]?.players ?? []).map((id) => w.players[id]).filter((p): p is Player => !!p && !p.youth).sort((a, b) => (a.pos === pos ? 0 : 1) - (b.pos === pos ? 0 : 1) || b.ovr - a.ovr);
  } else if (tab === "short") {
    list = w.shortlist.map((id) => w.players[id]).filter((p): p is Player => !!p);
  } else {
    list = all.filter((p) => p.pos === pos && p.clubId !== w.userClubId && !p.youth).sort((a, b) => b.ovr - a.ovr);
  }
  list = list.filter((p) => !exclude.includes(p.id)).slice(0, 40);
  return (
    <Sheet onClose={onClose} title="Adicionar à comparação">
      <input className="text" placeholder="Buscar pelo nome…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar jogador" />
      {q.trim().length < 2 && (
        <div className="seg mt8">
          <button className={tab === "squad" ? "active" : ""} onClick={() => setTab("squad")}>Elenco</button>
          <button className={tab === "short" ? "active" : ""} onClick={() => setTab("short")}>Observados</button>
          <button className={tab === "pos" ? "active" : ""} onClick={() => setTab("pos")}>Mesma posição</button>
        </div>
      )}
      <div className="list mt8 cmp-pick">
        {list.map((p) => (
          <div key={p.id} className="list-item" onClick={() => (exclude.length >= MAX_COMPARE ? toast("Máximo de 3 jogadores") : onPick(p.id))}>
            <Avatar p={p} club={p.clubId ? w.clubs[p.clubId] : null} season={w.season} size={36} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="ellipsis" style={{ display: "block" }}>{p.name}</b>
              <span className="row gap8 small muted"><PosBadge pos={p.pos} /> {age(p, w.season)}a <span className="ellipsis">{p.clubId ? w.clubs[p.clubId]?.name : "Livre"}</span></span>
            </div>
            <b className="kbd">{p.ovr}</b>
          </div>
        ))}
        {!list.length && <div className="empty">Nenhum jogador encontrado.</div>}
      </div>
    </Sheet>
  );
}
