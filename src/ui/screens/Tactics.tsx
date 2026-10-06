// Tela de Tática: modelos prontos, formação, campo com arrastar/tocar, funções por posição,
// instruções do time, mudanças de mentalidade programadas e linhas de entrosamento.
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { pitchLinks, teamLinkAvg } from "../../engine/chemistry";
import { chemOf } from "../../engine/dressing";
import { autoLineup, lineupStrength, squadOf, validLineup } from "../../engine/lineup";
import { shortName } from "../../engine/player";
import { FORMATION_DESC, FORMATIONS, MENTALITY_NAMES, ovrAt, POS_NAME, POS_ORDER, PRESSING_NAMES } from "../../engine/positions";
import {
  applyPreset, bestRole, familiarityOf, onFormationChange, PRESETS, roleAt, ROLES, roleStars, rolesFor, TI_INFO, tiOf, type RoleId,
} from "../../engine/tactics";
import type { Club, Lineup, Player, TeamInstr, World } from "../../engine/types";
import { push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { TacticsAdvice } from "../Assistant";
import { Avatar, Bar, Ovr, PosBadge, Sheet, Stars, Ic } from "../components";
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

const linkColor = (v: number) => (v >= 70 ? "#34d27b" : v >= 50 ? "#c9e05a" : v >= 35 ? "#f5a742" : "#ef5350");
const slotTop = (y: number) => 100 - y * 0.92 - 4;

export function TacticsScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const lineup = validLineup(w, club);
  const [sel, setSel] = useState<number | null>(null);
  const [roleSheet, setRoleSheet] = useState<number | null>(null);
  const [showLinks, setShowLinks] = useState(true);
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
    if (sel === i) { setRoleSheet(i); return; } // segundo toque: escolher a função
    swap(sel, i);
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
  const others = squadOf(w, club, true).filter((p) => !startersSet.has(p.id)).sort((a, b) => {
    const ba = lineup.bench.includes(a.id) ? 0 : 1, bb = lineup.bench.includes(b.id) ? 0 : 1;
    if (ba !== bb) return ba - bb;
    if (sel !== null) return ovrAt(b, slots[sel].pos) - ovrAt(a, slots[sel].pos);
    return POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr;
  });
  const sh = club.tactic.shift ?? {};

  return (
    <div className="page">
      <TacticsAdvice />
      <div className="tac-meters">
        <div className="tac-meter" title="Familiaridade com a formação: cresce jogando e treinando (foco Tático acelera)">
          <span className="tiny muted"><Ic n="book" size={13} /> Familiaridade {club.tactic.formation}</span>
          <Bar v={fam} /><b className="kbd">{Math.round(fam)}%</b>
        </div>
        <div className="tac-meter" title="Entrosamento dos titulares vizinhos em campo (minutos juntos, nacionalidade, base, tempo de casa)">
          <span className="tiny muted"><Ic n="link" size={13} /> Entrosamento em campo</span>
          <Bar v={links} /><b className="kbd">{Math.round(links)}</b>
        </div>
        <div className="tac-meter" title="Entrosamento geral do grupo (vestiário)">
          <span className="tiny muted"><Ic n="users" size={13} /> Grupo</span>
          <Bar v={chemOf(w, club)} /><b className="kbd">{Math.round(chemOf(w, club))}%</b>
        </div>
      </div>

      <div className="small muted">Modelos prontos</div>
      <div className="chips">
        {PRESETS.map((pr) => (
          <button key={pr.id} className={`chip${club.tactic.preset === pr.id ? " active" : ""}`} title={pr.desc} onClick={() => pickPreset(pr.id)}>{pr.emoji} {pr.label}</button>
        ))}
      </div>
      <div className="chips">
        {Object.keys(FORMATIONS).map((f) => (
          <button key={f} className={`chip${club.tactic.formation === f ? " active" : ""}`} onClick={() => setFormation(f)}>{f}</button>
        ))}
      </div>
      <div className="small muted">{FORMATION_DESC[club.tactic.formation]} · força {Math.round(lineupStrength(w, club, lineup))}</div>

      <TacticsPitch w={w} club={club} lineup={lineup} sel={sel} showLinks={showLinks} onTap={tapSlot} onSwap={(a, b) => { swap(a, b); setSel(null); }} />

      <div className="row gap8 wrap">
        <button className="btn sm" onClick={() => { save(autoLineup(w, club, undefined, club.tactic.formation, true)); setSel(null); toast("Time escalado automaticamente"); }}>✨ Escalar</button>
        <button className={`btn sm${showLinks ? " primary" : ""}`} onClick={() => setShowLinks((x) => !x)}><Ic n="link" /> Linhas</button>
        <button className="btn sm" onClick={() => push({ name: "setpieces" })}><Ic n="target" /> Bola parada</button>
        {sel !== null && <button className="btn sm primary" onClick={() => setRoleSheet(sel)}><Ic n="role" /> Função</button>}
      </div>
      <div className="tiny muted">{sel !== null ? "Toque em outro jogador para trocar, ou de novo nele para escolher a função." : "Toque num jogador para selecionar; arraste para trocar de posição."}</div>

      <div className="card flat">
        <b className="small">Mentalidade</b>
        <div className="seg mt8">
          {[-2, -1, 0, 1, 2].map((m) => (
            <button key={m} className={club.tactic.mentality === m ? "active" : ""} onClick={() => { update(() => { club.tactic.mentality = m; delete club.tactic.preset; }); autosave(); }}>
              {MENTALITY_NAMES[m].split(" ")[0]}
            </button>
          ))}
        </div>
        <b className="small" style={{ display: "block", marginTop: 10 }}>Pressão</b>
        <div className="seg mt8">
          {[0, 1, 2].map((m) => (
            <button key={m} className={club.tactic.pressing === m ? "active" : ""} onClick={() => { update(() => { club.tactic.pressing = m; delete club.tactic.preset; }); autosave(); }}>
              {PRESSING_NAMES[m].replace("Marcação ", "")}
            </button>
          ))}
        </div>
        {(Object.keys(TI_INFO) as (keyof typeof TI_INFO)[]).map((k) => (
          <div key={k}>
            <div className="row" style={{ marginTop: 10 }}><b className="small grow">{TI_INFO[k].label}</b></div>
            <div className="seg mt4">
              {TI_INFO[k].opts.map((label, v) => (
                <button key={v} className={ti[k] === v ? "active" : ""} onClick={() => setTi({ [k]: v })}>{label}</button>
              ))}
            </div>
            <div className="tiny muted mt4">{TI_INFO[k].hint}</div>
          </div>
        ))}
        <div className="chips mt12">
          <button className={`chip${ti.cpress ? " active" : ""}`} onClick={() => setTi({ cpress: !ti.cpress })}><Ic n="bolt" size={14} /> Contrapressão</button>
          <button className={`chip${ti.waste ? " active" : ""}`} onClick={() => setTi({ waste: !ti.waste })}>⏳ Fazer cera (vencendo)</button>
        </div>
        <div className="tiny muted mt4">Contrapressão rouba a bola logo após perder, mas cansa e expõe a defesa. Cera esfria o jogo na reta final.</div>
      </div>

      <div className="card flat">
        <b className="small">Mudanças durante o jogo</b>
        <div className="tiny muted mt4">O time muda a mentalidade sozinho conforme o placar (você ainda pode mexer ao vivo).</div>
        <div className="small mt8">Vencendo a partir dos 75'</div>
        <div className="seg mt4">
          {([[null, "Manter"], [-1, "Segurar"], [-2, "Retranca"]] as const).map(([v, l]) => (
            <button key={l} className={(sh.lead ?? null) === v ? "active" : ""} onClick={() => setShift("lead", v)}>{l}</button>
          ))}
        </div>
        <div className="small mt8">Perdendo a partir dos 70'</div>
        <div className="seg mt4">
          {([[null, "Manter"], [1, "Ofensiva"], [2, "Tudo ao ataque"]] as const).map(([v, l]) => (
            <button key={l} className={(sh.trail ?? null) === v ? "active" : ""} onClick={() => setShift("trail", v)}>{l}</button>
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

      {roleSheet !== null && <RoleSheet w={w} club={club} lineup={lineup} k={roleSheet} onClose={() => { setRoleSheet(null); setSel(null); }} />}
    </div>
  );
}

/** Campo da tática: toque seleciona/troca; arrastar um jogador até outro troca os dois. */
export function TacticsPitch({ w, club, lineup, sel, showLinks, onTap, onSwap }: {
  w: World; club: Club; lineup: Lineup; sel: number | null; showLinks?: boolean; onTap?: (i: number) => void; onSwap?: (a: number, b: number) => void;
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
    <div className="pitch tac-pitch" ref={ref}>
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
      {links.length > 0 && (
        <svg className="lines chem-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {links.map((l) => (
            <line key={`${l.i}-${l.j}`} x1={slots[l.i].x} y1={slotTop(slots[l.i].y)} x2={slots[l.j].x} y2={slotTop(slots[l.j].y)}
              stroke={linkColor(l.v)} strokeLinecap="round" opacity={0.85} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.5 + l.v / 25 }} />
          ))}
        </svg>
      )}
      {slots.map((s, i) => {
        const id = lineup.starters[i];
        const p = id != null ? w.players[id] : null;
        const fit = p ? ovrAt(p, s.pos) : 0;
        const role = roleAt(club.tactic, i, s.pos);
        const stars = p && role ? roleStars(p, role, s.pos) : null;
        const g = ghost?.k === i ? ghost : null;
        return (
          <div key={i} data-slot={i}
            className={`slot${sel === i ? " selected" : ""}${p ? "" : " empty"}${g ? " dragging" : ""}${ghost?.over === i ? " drop" : ""}`}
            style={{ left: `${s.x}%`, top: `${slotTop(s.y)}%`, transform: g ? `translate(calc(-50% + ${g.dx}px), calc(-50% + ${g.dy}px))` : undefined, touchAction: "none" }}
            onPointerDown={down(i)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setGhost(null); }}>
            {p ? <Avatar p={p} club={club} season={w.season} size={40} /> : <div className="avatar" style={{ width: 40, height: 40 }} />}
            <span className="nm">{p ? shortName(p.name) : s.pos}</span>
            {p && (
              <span className="meta">
                <span className="pos" style={{ background: fit >= p.ovr - 1 ? "#1f9d55" : fit >= p.ovr - 6 ? "#c78a12" : "#c0392b", minWidth: 0 }}>{role ? role.short : s.pos} {fit}</span>
              </span>
            )}
            {stars != null && <span className="role-stars">{"★".repeat(Math.floor(stars))}{stars % 1 ? "½" : ""}</span>}
            {p && stars == null && <span style={{ width: 36 }}><Bar v={p.cond} /></span>}
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
    <Sheet title={`Função · ${POS_NAME[pos]}`} onClose={onClose}>
      {p && <div className="small muted" style={{ marginBottom: 8 }}>{p.name}{best ? <> · melhor função: <b style={{ color: "var(--text)" }}>{best.label}</b></> : null}</div>}
      <div className="list">
        <div className={`list-item role-opt${cur == null ? " on" : ""}`} onClick={() => set(null)}>
          <div className="grow"><b>Padrão da posição</b><div className="tiny muted">Sem instruções individuais (neutro).</div></div>
          {cur == null && <span className="tag good">atual</span>}
        </div>
        {rolesFor(pos).map((r) => (
          <div key={r.id} className={`list-item role-opt${cur === r.id ? " on" : ""}`} onClick={() => set(r.id)}>
            <div className="grow">
              <b>{r.label}</b> <span className="tag">{ROLES[r.id].short}</span>
              <div className="tiny muted">{r.desc}</div>
            </div>
            {p && <Stars n={roleStars(p, r, pos)} half />}
            {cur === r.id && <span className="tag good">atual</span>}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
