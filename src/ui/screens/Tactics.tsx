// Tela de Tática estilo FM24/FM26 (Opção 1 - Piotr Kosmala) em Português Brasileiro:
// Visão dupla horizontal: Campo Tático Escuro (foto + camisa + código Função/Dever colorido) + Coluna de Reservas + Tabela Densa do Elenco.
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { pitchLinks, teamLinkAvg } from "../../engine/chemistry";
import { dynDelta } from "../../engine/dressing";
import { autoLineup, lineupStrength, squadOf, validLineup } from "../../engine/lineup";
import { shortName } from "../../engine/player";
import { FORMATIONS, MENTALITY_NAMES, ovrAt, POS_NAME, POS_ORDER, PRESSING_NAMES } from "../../engine/positions";
import {
  applyPreset, bestRole, familiarityOf, onFormationChange, PRESETS, roleAt, ROLES, roleStars, rolesFor, TI_INFO, tiOf, type RoleId,
} from "../../engine/tactics";
import type { Club, Lineup, Player, TeamInstr, World } from "../../engine/types";
import { push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { TacticsAdvice } from "../Assistant";
import { Avatar, DeltaTag, Ic, Icon, KitIcon, KosmalaPlayerRow, roleDutyDisplay, Sheet, Stars } from "../components";
import { SetPiecesScreen } from "../SetPieces";
import "../tactics.css";

/** Reencaixa os mesmos 11 jogadores numa nova formação. */
export function refit(w: World, formation: string, current: Lineup): Lineup {
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

const linkColor = (v: number) => (v >= 70 ? "#10b981" : v >= 50 ? "#a3e635" : v >= 35 ? "#f59e0b" : "#ef4444");
const slotTop = (y: number) => 100 - y * 0.90 - 5;

type TacSubTab = "overview" | "instr" | "roles" | "setpieces" | "plans";

export function TacticsScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const lineup = validLineup(w, club);
  const [sub, setSub] = useState<TacSubTab>("overview");
  const [sel, setSel] = useState<number | null>(null);
  const [roleSheet, setRoleSheet] = useState<number | null>(null);
  const [showLinks, setShowLinks] = useState(true);
  const [sortCol, setSortCol] = useState<"pos" | "ovr" | "cond">("pos");
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];
  const ti = tiOf(club.tactic);
  const fam = familiarityOf(w, club);
  const links = teamLinkAvg(w, club, lineup.starters);

  function save(l: Lineup) {
    update(() => { club.lineup = l; });
    autosave();
  }
  function setFormation(f: string, keepRoles = false) {
    update(() => {
      const cur = validLineup(w, club);
      onFormationChange(club, f);
      club.tactic.formation = f;
      club.lineup = refit(w, f, cur);
      if (!keepRoles) { delete club.tactic.roles; delete club.tactic.preset; }
    });
    autosave();
  }
  function setTi(patch: Partial<TeamInstr>) {
    update(() => { club.tactic.ti = { ...tiOf(club.tactic), ...patch }; delete club.tactic.preset; });
    autosave();
  }
  function swap(a: number, b: number) {
    const s = lineup.starters.slice();
    [s[a], s[b]] = [s[b], s[a]];
    save({ ...lineup, starters: s });
  }
  function tapSlot(i: number) {
    if (sel === null) { setSel(i); return; }
    if (sel === i) { setRoleSheet(i); return; }
    swap(sel, i);
    setSel(null);
  }
  function tapReserve(p: Player) {
    if (p.injury > 0) { toast(`${p.name} está no Departamento Médico.`); return; }
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
    if (lineup.bench.includes(p.id)) save({ ...lineup, bench: lineup.bench.filter((b) => b !== p.id) });
    else if (lineup.bench.length < 9) save({ ...lineup, bench: [...lineup.bench, p.id] });
    else toast("O banco já tem 9 jogadores. Tire alguém antes.");
  }
  function pickPreset(id: string) {
    const pr = PRESETS.find((x) => x.id === id)!;
    update(() => {
      const cur = validLineup(w, club);
      onFormationChange(club, pr.formation);
      club.tactic.formation = pr.formation;
      club.lineup = refit(w, pr.formation, cur);
      applyPreset(club, pr, FORMATIONS[pr.formation]);
    });
    autosave();
    toast(`${pr.emoji} ${pr.label} aplicado`);
  }
  function setShift(kind: "lead" | "trail", v: number | null) {
    update(() => {
      const sh = { ...(club.tactic.shift ?? {}) };
      if (v == null) delete sh[kind]; else sh[kind] = v;
      club.tactic.shift = Object.keys(sh).length ? sh : undefined;
    });
    autosave();
  }

  const startersSet = new Set(lineup.starters.filter((x): x is number => x != null));
  const benchPlayers = lineup.bench.map((id) => w.players[id]).filter((p): p is Player => !!p && !startersSet.has(p.id));
  const sh = club.tactic.shift ?? {};

  // Lista completa ordenada para a tabela à direita (Titulares primeiro, depois Banco, depois Suplentes)
  const starterPlayers: { p: Player; slotIdx: number; badge: string }[] = [];
  lineup.starters.forEach((id, idx) => {
    if (id != null && w.players[id]) {
      starterPlayers.push({ p: w.players[id], slotIdx: idx, badge: slots[idx]?.pos ?? "TIT" });
    }
  });
  const nonStarters = squadOf(w, club, true)
    .filter((p) => !startersSet.has(p.id))
    .sort((a, b) => {
      const ba = lineup.bench.includes(a.id) ? 0 : 1;
      const bb = lineup.bench.includes(b.id) ? 0 : 1;
      if (ba !== bb) return ba - bb;
      if (sortCol === "ovr") return b.ovr - a.ovr;
      if (sortCol === "cond") return b.cond - a.cond;
      return POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr;
    });

  return (
    <div className="k-screen">
      {/* Sub-abas horizontais estilo Opção 1 */}
      <div className="k-subtabs" role="tablist" aria-label="Sub-abas de Tática">
        <button className={`k-subtab${sub === "overview" ? " active" : ""}`} onClick={() => setSub("overview")}>Visão Geral</button>
        <button className={`k-subtab${sub === "instr" ? " active" : ""}`} onClick={() => setSub("instr")}>Instruções da Equipe</button>
        <button className={`k-subtab${sub === "roles" ? " active" : ""}`} onClick={() => setSub("roles")}>Funções & Deveres</button>
        <button className={`k-subtab${sub === "setpieces" ? " active" : ""}`} onClick={() => setSub("setpieces")}>Bola Parada</button>
        <button className={`k-subtab${sub === "plans" ? " active" : ""}`} onClick={() => setSub("plans")}>Planos de Jogo</button>
      </div>

      {sub === "setpieces" ? (
        <SetPiecesScreen />
      ) : sub === "instr" ? (
        <div className="page">
          <div className="k-card">
            <div className="k-card-head">
              <span>Modelos Táticos Prontos</span>
              <span className="muted">Aplicam formação, mentalidade e instruções</span>
            </div>
            <div className="chips mt4">
              {PRESETS.map((pr) => (
                <button key={pr.id} className={`chip${club.tactic.preset === pr.id ? " active" : ""}`} title={pr.desc} onClick={() => pickPreset(pr.id)}>
                  <Icon name={pr.icon ?? "board"} size={13} /> {pr.label} ({pr.formation})
                </button>
              ))}
            </div>
          </div>

          <div className="k-card mt8">
            <div className="k-card-head">
              <span>Instruções Coletivas (Com a Bola, Transição e Sem a Bola)</span>
            </div>
            {(Object.keys(TI_INFO) as (keyof typeof TI_INFO)[]).map((k) => (
              <div key={k} className="mt8">
                <div className="row"><b className="small grow">{TI_INFO[k].label}</b></div>
                <div className="seg mt4">
                  {TI_INFO[k].opts.map((label, v) => (
                    <button key={v} className={ti[k] === v ? "active" : ""} onClick={() => setTi({ [k]: v })}>{label}</button>
                  ))}
                </div>
                <div className="tiny muted mt4">{TI_INFO[k].hint}</div>
              </div>
            ))}
            <div className="chips mt12">
              <button className={`chip${ti.cpress ? " active" : ""}`} onClick={() => setTi({ cpress: !ti.cpress })}><Ic n="bolt" size={14} /> Contrapressão imediata</button>
              <button className={`chip${ti.waste ? " active" : ""}`} onClick={() => setTi({ waste: !ti.waste })}><Ic n="stopwatch" size={14} /> Esfriar o jogo (vencendo)</button>
            </div>
          </div>
          <TacticsAdvice />
        </div>
      ) : sub === "roles" ? (
        <div className="page">
          <div className="k-card">
            <div className="k-card-head">
              <span>Funções e Deveres dos 11 Titulares ({club.tactic.formation})</span>
              <span className="muted">Toque em qualquer posição para escolher a Função (Defender / Apoiar / Atacar)</span>
            </div>
            <div className="k-table-wrap">
              {slots.map((s, i) => {
                const pid = lineup.starters[i];
                const p = pid != null ? w.players[pid] : null;
                if (!p) return null;
                return (
                  <KosmalaPlayerRow
                    key={`${i}-${p.id}`}
                    w={w}
                    p={p}
                    club={club}
                    slotPos={s.pos}
                    slotIdx={i}
                    starter
                    onClick={() => setRoleSheet(i)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      ) : sub === "plans" ? (
        <div className="page">
          <div className="k-card">
            <div className="k-card-head">
              <span>Planos Automáticos Durante a Partida</span>
              <span className="muted">Ajuste automático conforme o placar no 2º tempo</span>
            </div>
            <div className="small mt8">Vencendo a partir dos 75 minutos:</div>
            <div className="seg mt4">
              {([[null, "Manter postura"], [-1, "Segurar o resultado"], [-2, "Fechar a casinha (Retranca)"]] as const).map(([v, l]) => (
                <button key={l} className={(sh.lead ?? null) === v ? "active" : ""} onClick={() => setShift("lead", v)}>{l}</button>
              ))}
            </div>
            <div className="small mt12">Perdendo a partir dos 70 minutos:</div>
            <div className="seg mt4">
              {([[null, "Manter postura"], [1, "Postura Ofensiva"], [2, "Abafa / Tudo ao ataque"]] as const).map(([v, l]) => (
                <button key={l} className={(sh.trail ?? null) === v ? "active" : ""} onClick={() => setShift("trail", v)}>{l}</button>
              ))}
            </div>
          </div>
          <TacticsAdvice />
        </div>
      ) : (
        /* VISÃO GERAL: Layout Horizontal 3 Colunas idêntico à Opção 1 (Piotr Kosmala) */
        <div className="k-tactics-workspace">
          {/* COLUNA 1: CAMPO TÁTICO ESCURO + BARRA DE COMANDOS */}
          <div className="k-pitch-col">
            <div className="k-pitch-toolbar">
              <button className="k-edit-tactic-btn" onClick={() => setSub("instr")}>
                <Ic n="edit" size={13} /> Editar tática
              </button>
              <select className="k-tac-select" value={club.tactic.formation} onChange={(e) => setFormation(e.target.value)} aria-label="Formação">
                {Object.keys(FORMATIONS).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select className="k-tac-select" value={club.tactic.mentality} onChange={(e) => { update(() => { club.tactic.mentality = Number(e.target.value); delete club.tactic.preset; }); autosave(); }} aria-label="Mentalidade">
                {[-2, -1, 0, 1, 2].map((m) => <option key={m} value={m}>{MENTALITY_NAMES[m]}</option>)}
              </select>
              <select className="k-tac-select" value={club.tactic.pressing} onChange={(e) => { update(() => { club.tactic.pressing = Number(e.target.value); delete club.tactic.preset; }); autosave(); }} aria-label="Pressão">
                {[0, 1, 2].map((m) => <option key={m} value={m}>Pressão {PRESSING_NAMES[m].replace("Marcação ", "")}</option>)}
              </select>
              <button className="k-tac-chip" onClick={() => { save(autoLineup(w, club, undefined, club.tactic.formation, true)); setSel(null); toast("Melhores disponíveis escalados!"); }}>
                <Ic n="sparkle" size={12} /> Auto
              </button>
              <button className={`k-tac-chip${showLinks ? " active" : ""}`} onClick={() => setShowLinks((x) => !x)} title="Exibir linhas de entrosamento">
                <Ic n="link" size={12} /> {Math.round(links)}
              </button>
            </div>

            <TacticsPitch
              w={w}
              club={club}
              lineup={lineup}
              sel={sel}
              showLinks={showLinks}
              onTap={tapSlot}
              onSwap={(a, b) => { swap(a, b); setSel(null); }}
              onOpenRole={(i) => setRoleSheet(i)}
            />

            <div className="k-pitch-footer">
              <span>Familiaridade <b>{Math.round(fam)}%</b></span>
              <span>Entrosamento <b>{Math.round(links)}</b><DeltaTag d={dynDelta(w, "links", links)} /></span>
              <span>Força XI <b>{Math.round(lineupStrength(w, club, lineup))}</b></span>
              {sel !== null && (
                <button className="k-role-quick-btn" onClick={() => setRoleSheet(sel)}>
                  <Ic n="role" size={12} /> Mudar Função ({slots[sel]?.pos})
                </button>
              )}
            </div>
          </div>

          {/* COLUNA 2: COLUNA VERTICAL DE RESERVAS (Reserva 01..07+) */}
          <div className="k-subs-col">
            <div className="k-subs-header">Reservas ({benchPlayers.length}/9)</div>
            <div className="k-subs-list">
              {benchPlayers.slice(0, 9).map((p, idx) => (
                <div
                  key={p.id}
                  className={`k-sub-card${sel !== null ? " swap-ready" : ""}`}
                  onClick={() => tapReserve(p)}
                >
                  <div className="k-sub-title">Reserva 0{idx + 1}</div>
                  <div className="k-sub-Visual">
                    <Avatar p={p} club={club} season={w.season} size={26} />
                    <KitIcon club={club} gk={p.pos === "GOL"} size={22} />
                  </div>
                  <div className="k-sub-pos">{p.pos} · {sel !== null ? ovrAt(p, slots[sel].pos) : p.ovr}</div>
                  <div className="k-sub-name ellipsis">{shortName(p.name)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* COLUNA 3: TABELA DENSA DO ELENCO (Kosmala Style) */}
          <div className="k-table-col">
            <div className="k-table-header">
              <span className="k-th-pos" onClick={() => setSortCol("pos")}>Posição ↕</span>
              <span className="k-th-inf">Inf</span>
              <span className="k-th-role">Função (Dever)</span>
              <span className="k-th-flag">Nac</span>
              <span className="k-th-stars" onClick={() => setSortCol("ovr")}>Capacidade ↕</span>
              <span className="k-th-name">Nome</span>
              <span className="k-th-cond" onClick={() => setSortCol("cond")}>Condição ↕</span>
            </div>
            <div className="k-table-body">
              {starterPlayers.map(({ p, slotIdx, badge }) => (
                <KosmalaPlayerRow
                  key={`st-${slotIdx}-${p.id}`}
                  w={w}
                  p={p}
                  club={club}
                  slotPos={slots[slotIdx]?.pos}
                  slotIdx={slotIdx}
                  starter
                  subLabel={badge}
                  selected={sel === slotIdx}
                  onClick={() => tapSlot(slotIdx)}
                  onRoleClick={() => setRoleSheet(slotIdx)}
                />
              ))}
              {nonStarters.map((p) => {
                const benchIdx = lineup.bench.indexOf(p.id);
                const subTag = benchIdx >= 0 ? `RES 0${benchIdx + 1}` : "SUP";
                return (
                  <KosmalaPlayerRow
                    key={`ns-${p.id}`}
                    w={w}
                    p={p}
                    club={club}
                    subLabel={subTag}
                    onClick={() => {
                      if (sel !== null) tapReserve(p);
                      else push({ name: "player", id: p.id });
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {roleSheet !== null && (
        <RoleSheet
          w={w}
          club={club}
          lineup={lineup}
          k={roleSheet}
          onClose={() => { setRoleSheet(null); setSel(null); }}
        />
      )}
    </div>
  );
}

/** Campo da tática: visual escuro carbono estilo Piotr Kosmala (Foto + Camisa + Código FUN - Dever colorido). */
export function TacticsPitch({
  w, club, lineup, sel, showLinks, onTap, onSwap, onOpenRole,
}: {
  w: World;
  club: Club;
  lineup: Lineup;
  sel: number | null;
  showLinks?: boolean;
  onTap?: (i: number) => void;
  onSwap?: (a: number, b: number) => void;
  onOpenRole?: (i: number) => void;
}) {
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ k: number; x0: number; y0: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ k: number; dx: number; dy: number; over: number | null } | null>(null);
  const links = showLinks ? pitchLinks(w, club, club.tactic.formation, lineup.starters) : [];

  const nearest = (cx: number, cy: number, not: number): number | null => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    let best: number | null = null, bd = Infinity;
    slots.forEach((s, i) => {
      if (i === not) return;
      const x = r.left + (s.x / 100) * r.width, y = r.top + (slotTop(s.y) / 100) * r.height;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = i; }
    });
    return bd < r.width * 0.16 ? best : null;
  };
  const down = (k: number) => (e: RPointerEvent<HTMLDivElement>) => {
    drag.current = { k, x0: e.clientX, y0: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 10) return;
    d.moved = true;
    setGhost({ k: d.k, dx, dy, over: nearest(e.clientX, e.clientY, d.k) });
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { setGhost(null); onTap?.(d.k); return; }
    const t = nearest(e.clientX, e.clientY, d.k);
    setGhost(null);
    if (t != null) onSwap?.(d.k, t);
  };

  return (
    <div className="pitch tac-pitch k-dark-pitch" ref={ref}>
      <svg className="lines" viewBox="0 0 100 140" preserveAspectRatio="none">
        <g fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.55">
          <rect x="3" y="3" width="94" height="134" rx="2" />
          <line x1="3" y1="70" x2="97" y2="70" />
          <circle cx="50" cy="70" r="11" />
          <rect x="22" y="3" width="56" height="20" />
          <rect x="36" y="3" width="28" height="8" />
          <rect x="22" y="117" width="56" height="20" />
          <rect x="36" y="129" width="28" height="8" />
        </g>
      </svg>
      {links.length > 0 && (
        <svg className="lines chem-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {links.map((l) => (
            <line
              key={`${l.i}-${l.j}`}
              x1={slots[l.i].x}
              y1={slotTop(slots[l.i].y)}
              x2={slots[l.j].x}
              y2={slotTop(slots[l.j].y)}
              stroke={linkColor(l.v)}
              strokeLinecap="round"
              opacity={0.75}
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 1.4 + l.v / 32 }}
            />
          ))}
        </svg>
      )}
      {slots.map((s, i) => {
        const id = lineup.starters[i];
        const p = id != null ? w.players[id] : null;
        const role = roleAt(club.tactic, i, s.pos);
        const rd = roleDutyDisplay(s.pos, role);
        const g = ghost?.k === i ? ghost : null;
        return (
          <div
            key={i}
            data-slot={i}
            className={`slot k-slot${sel === i ? " selected" : ""}${p ? "" : " empty"}${g ? " dragging" : ""}${ghost?.over === i ? " drop" : ""}`}
            style={{
              left: `${s.x}%`,
              top: `${slotTop(s.y)}%`,
              transform: g ? `translate(calc(-50% + ${g.dx}px), calc(-50% + ${g.dy}px))` : undefined,
              touchAction: "none",
            }}
            onPointerDown={down(i)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => { drag.current = null; setGhost(null); }}
          >
            <div className="k-node-visual">
              {p ? <Avatar p={p} club={club} season={w.season} size={28} /> : <div className="avatar" style={{ width: 28, height: 28 }} />}
              <KitIcon club={club} gk={s.pos === "GOL"} size={24} />
            </div>
            <span className={`k-node-role ${rd.dutyClass}`}>{rd.shortCode}</span>
            <span className="k-node-name nm">{p ? shortName(p.name) : s.pos}</span>
            {sel === i && p && onOpenRole && (
              <div className="k-node-pop" onPointerDown={(e) => e.stopPropagation()}>
                <button onClick={() => onOpenRole(i)}>Função</button>
                <button onClick={() => push({ name: "player", id: p.id })}>Perfil</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Campo simples (pré-jogo, ao vivo): mesmas posições e funções, sem arrastar. */
export function Pitch(props: { w: World; club: Club; lineup: Lineup; sel: number | null; onTap?: (i: number) => void }) {
  return <TacticsPitch {...props} />;
}

/** Folha de funções: estrelas do titular em cada função da posição. */
function RoleSheet({ w, club, lineup, k, onClose }: { w: World; club: Club; lineup: Lineup; k: number; onClose: () => void }) {
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];
  const pos = slots[k].pos;
  const id = lineup.starters[k];
  const p = id != null ? w.players[id] : null;
  const cur = roleAt(club.tactic, k, pos)?.id ?? null;
  const best = p ? bestRole(p, pos) : null;
  const set = (r: RoleId | null) => {
    update(() => {
      const roles = slots.map((_, i) => club.tactic.roles?.[i] ?? null);
      roles[k] = r;
      club.tactic.roles = roles.some(Boolean) ? roles : undefined;
      delete club.tactic.preset;
    });
    autosave();
    onClose();
  };
  return (
    <Sheet title={`Função & Dever · ${POS_NAME[pos]}`} onClose={onClose}>
      {p && <div className="small muted" style={{ marginBottom: 8 }}>{p.name}{best ? <> · melhor função: <b style={{ color: "var(--text)" }}>{best.label}</b></> : null}</div>}
      <div className="list">
        <div className={`list-item role-opt${cur == null ? " on" : ""}`} onClick={() => set(null)}>
          <div className="grow"><b>Padrão da posição</b><div className="tiny muted">Equilibrado sem instruções individuais extras.</div></div>
          {cur == null && <span className="tag good">atual</span>}
        </div>
        {rolesFor(pos).map((r) => {
          const rd = roleDutyDisplay(pos, r);
          return (
            <div key={r.id} className={`list-item role-opt${cur === r.id ? " on" : ""}`} onClick={() => set(r.id)}>
              <div className="grow">
                <b>{r.label}</b> <span className="tag">{ROLES[r.id].short} · {rd.duty}</span>
                <div className="tiny muted">{r.desc}</div>
              </div>
              {p && <Stars n={roleStars(p, r, pos)} half />}
              {cur === r.id && <span className="tag good">atual</span>}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
