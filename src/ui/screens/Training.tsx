// Treino: foco do time, intensidade, treino individual e destaques do mês (setas ▲▼).
import { useState } from "react";
import { age } from "../../engine/player";
import { ATTR_NAMES, ovrAt, POS_NAME, POSITIONS, rawOvr } from "../../engine/positions";
import { staffStars } from "../../engine/staff";
import {
  canCalm, FOCUS_INFO, INTENSITY_LABELS, learnChance, posProgress, setTrainFocus, trainableAttrs, trainFocusLabel, trainOf, traitProgress,
} from "../../engine/training";
import { canLearn, LEARN_REQ, TRAITS } from "../../engine/traits";
import type { Player, Pos, TeamFocus, TraitId } from "../../engine/types";
import { push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Avatar, Bar, Ovr, PosBadge, Sheet, Ic, Icon } from "../components";

const FOCUS_ICON: Record<TeamFocus, string> = { eq: "target", fis: "dumbbell", atk: "bolt", def: "shield", tat: "board", bola: "ball", rec: "calm" };
const FOCUS_ORDER: TeamFocus[] = ["eq", "fis", "atk", "def", "tat", "bola", "rec"];
const BTN40 = { minHeight: 40 } as const;

export function TrainingScreen() {
  return (
    <div className="page">
      <TrainingTab />
    </div>
  );
}

/** Conteúdo do treino (também usado como aba do Elenco). */
export function TrainingTab() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const t = trainOf(club);
  const [picker, setPicker] = useState(false);
  const [sheetFor, setSheetFor] = useState<number | null>(null);
  const players = club.players.map((id) => w.players[id]).filter(Boolean);
  const withTf = players.filter((p) => p.tf);
  const highlights = players.filter((p) => p.trend).sort((a, b) => Math.abs(b.trend!) - Math.abs(a.trend!) || b.trend! - a.trend!).slice(0, 5);
  const tre = staffStars(w, club, "tre");

  const setTrain = (patch: Partial<typeof t>) => {
    update(() => { club.train = { ...trainOf(club), ...patch }; });
    autosave();
  };

  return (
    <>
      <div className="card">
        <h3><Ic n="dumbbell" /> Foco do treino</h3>
        <div className="chips" style={{ flexWrap: "wrap", overflow: "visible", marginTop: 8 }}>
          {FOCUS_ORDER.map((f) => (
            <button key={f} className={`chip${t.focus === f ? " active" : ""}`} style={BTN40} onClick={() => setTrain({ focus: f })}>
              <Ic n={FOCUS_ICON[f]} /> {FOCUS_INFO[f].label}
            </button>
          ))}
        </div>
        <div className="small mt8">{FOCUS_INFO[t.focus].effect}</div>
      </div>

      <div className="card">
        <h3>Intensidade</h3>
        <div className="seg mt8">
          {INTENSITY_LABELS.map((l, i) => (
            <button key={l} className={t.int === i ? "active" : ""} style={BTN40} onClick={() => setTrain({ int: i as 0 | 1 | 2 })}>{l}</button>
          ))}
        </div>
        <div className="small muted mt8">
          {t.int === 2 ? "Puxado: evoluem 12% mais rápido, mas cansam mais e podem se machucar no treino."
            : t.int === 0 ? "Leve: recuperam o físico mais rápido, mas evoluem 10% mais devagar."
            : "Normal: o equilíbrio entre evolução e descanso."}
        </div>
        <div className="tiny muted mt8">Treinador {"★".repeat(tre)}{"☆".repeat(5 - tre)} · a evolução acontece todo dia 1º do mês.</div>
      </div>

      <div className="card">
        <h3><Ic n="target" /> Treino individual</h3>
        {withTf.length === 0 && <div className="small muted mt8">Ninguém com treino individual. Ensine uma posição nova ou uma jogada especial!</div>}
        <div className="list mt8">
          {withTf.map((p) => (
            <TfRow key={p.id} p={p} onOpen={() => setSheetFor(p.id)} onClear={() => { update(() => { delete p.tf; }); autosave(); }} />
          ))}
        </div>
        <button className="btn block mt8" style={BTN40} onClick={() => setPicker(true)}>+ Definir treino individual</button>
      </div>

      <div className="card">
        <h3><Ic n="trend" /> Destaques do mês</h3>
        {highlights.length === 0 && <div className="small muted mt8">As setas ▲▼ aparecem depois do próximo treino mensal (dia 1º).</div>}
        <div className="list mt8">
          {highlights.map((p) => (
            <div key={p.id} className="list-item" style={{ minHeight: 44 }} onClick={() => push({ name: "player", id: p.id })}>
              <Avatar p={p} club={club} season={w.season} size={36} />
              <div className="grow"><b className="ellipsis">{p.name}</b><div className="tiny muted">{POS_NAME[p.pos]} · {age(p, w.season)} anos</div></div>
              <b className="kbd" style={{ color: p.trend! > 0 ? "var(--accent)" : "var(--danger)" }}>{p.trend! > 0 ? "▲" : "▼"}{Math.abs(p.trend!)}</b>
              <Ovr v={p.ovr} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 30 }} />

      {picker && (
        <Sheet title="Quem vai treinar?" onClose={() => setPicker(false)}>
          <div className="list" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {players.slice().sort((a, b) => Number(a.youth) - Number(b.youth) || b.ovr - a.ovr).map((p) => (
              <div key={p.id} className="list-item" style={{ minHeight: 44 }} onClick={() => { setPicker(false); setSheetFor(p.id); }}>
                <Avatar p={p} club={club} season={w.season} size={34} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="ellipsis">{p.name}</b>
                  <div className="tiny muted ellipsis">{p.tf ? trainFocusLabel(p) : p.youth ? "base" : `${age(p, w.season)} anos`}</div>
                </div>
                <PosBadge pos={p.pos} />
                <Ovr v={p.ovr} />
              </div>
            ))}
          </div>
        </Sheet>
      )}
      {sheetFor != null && w.players[sheetFor] && <IndividualTrainingSheet p={w.players[sheetFor]} onClose={() => setSheetFor(null)} />}
    </>
  );
}

function TfRow({ p, onOpen, onClear }: { p: Player; onOpen: () => void; onClear: () => void }) {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const prog = p.tf && "prog" in p.tf ? p.tf.prog : null;
  return (
    <div className="list-item" style={{ minHeight: 48 }}>
      <div onClick={onOpen} style={{ display: "contents" }}>
        <Avatar p={p} club={club} season={w.season} size={36} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="ellipsis">{p.name}</b>
          <div className="tiny muted ellipsis">{trainFocusLabel(p)}{p.injury > 0 ? " · pausado (lesão)" : ""}</div>
          {prog != null ? <div className="mt8"><Bar v={prog} color="var(--accent)" /></div> : <div className="tiny muted">treino contínuo</div>}
        </div>
      </div>
      <button className="icon-btn" style={{ minWidth: 40, minHeight: 40 }} aria-label="Cancelar treino" onClick={onClear}><Icon name="close" size={18} /></button>
    </div>
  );
}

type Mode = "attr" | "pos" | "trait";

export function IndividualTrainingSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const [mode, setMode] = useState<Mode>(p.tf?.k === "pos" ? "pos" : p.tf?.k === "trait" || p.tf?.k === "calm" ? "trait" : "attr");
  if (p.clubId !== w.userClubId) {
    return (
      <Sheet title="Treino individual" onClose={onClose}>
        <p className="small muted">Só jogadores do seu elenco podem ter treino individual.</p>
      </Sheet>
    );
  }
  const ageY = age(p, w.season);
  const set = (tf: Player["tf"] | null, msg: string) => {
    let err: string | null = null;
    update(() => { err = setTrainFocus(w, p, tf); });
    if (err) { toast(err); return; }
    autosave();
    toast(msg);
    onClose();
  };
  const prog = p.tf && "prog" in p.tf ? p.tf.prog : null;
  const posMonths = Math.ceil(100 / posProgress(w, p, club));
  const traitMonths = Math.ceil(100 / traitProgress(w, p, club));
  const chancePct = Math.round(learnChance(w, club) * 100);
  const positions = POSITIONS.filter((x) => x !== p.pos && !p.sec.includes(x) && (x === "GOL") === (p.pos === "GOL"));
  // só as jogadas que combinam com a posição (goleiro × linha); as que ele já pode aprender vêm primeiro
  const learnable = (Object.keys(LEARN_REQ) as TraitId[])
    .filter((t) => !(p.traits ?? []).includes(t) && !p.lockedTraits?.includes(t) && (p.pos === "GOL" ? !!TRAITS[t].gk || t === "LID" : !TRAITS[t].gk))
    .sort((a, b) => Number(canLearn(p, b, w.season)) - Number(canLearn(p, a, w.season)));

  return (
    <Sheet title={`Treino individual: ${p.name}`} onClose={onClose}>
      <div className="card flat small" style={{ marginTop: 0 }}>
        <div className="row gap8">
          <span className="grow">Agora: <b>{trainFocusLabel(p)}</b></span>
          {p.tf && <button className="btn sm" style={BTN40} onClick={() => set(null, "Treino individual cancelado.")}>Cancelar</button>}
        </div>
        {prog != null && <div className="mt8"><Bar v={prog} color="var(--accent)" /><div className="tiny muted mt8">{prog}% concluído{p.injury > 0 ? " · pausado enquanto estiver lesionado" : ""}</div></div>}
      </div>

      <div className="seg mt8">
        {([["attr", "Atributo"], ["pos", "Nova posição"], ["trait", "Nova jogada"]] as const).map(([k, l]) => (
          <button key={k} className={mode === k ? "active" : ""} style={BTN40} onClick={() => setMode(k)}>{l}</button>
        ))}
      </div>

      {mode === "attr" && (
        <div className="mt12">
          <div className="small muted">
            {ageY >= 29 ? "Aos 29+ o foco protege o atributo escolhido da queda da idade."
              : p.ovr >= p.pot ? "No limite do potencial — o foco mantém a forma."
              : "Todo mês, 50% de chance de +1 no atributo escolhido."}
          </div>
          <div className="grid2 mt8">
            {trainableAttrs(p).map((a) => {
              const on = p.tf?.k === "attr" && p.tf.a === a;
              return (
                <button key={a} className={`btn${on ? " primary" : ""}`} style={BTN40} onClick={() => set({ k: "attr", a }, `${p.name} vai focar em ${ATTR_NAMES[a].toLowerCase()}.`)}>
                  {ATTR_NAMES[a]} <span className="kbd" style={{ opacity: 0.8 }}>{p.attrs[a]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === "pos" && (
        <div className="mt12">
          <div className="small muted">Leva uns {posMonths} meses. Enquanto treina, ele já rende melhor na posição nova.</div>
          <div className="list mt8">
            {positions.map((pos: Pos) => {
              const on = p.tf?.k === "pos" && p.tf.pos === pos;
              const after = Math.max(1, rawOvr(p.attrs, pos) - 1);
              return (
                <div key={pos} className="list-item" style={{ minHeight: 44, background: on ? "var(--card2)" : undefined }}
                  onClick={() => set({ k: "pos", pos, prog: on && p.tf?.k === "pos" ? p.tf.prog : 0 }, `${p.name} vai aprender a jogar de ${POS_NAME[pos].toLowerCase()}.`)}>
                  <PosBadge pos={pos} />
                  <span className="grow small">{POS_NAME[pos]}</span>
                  <span className="small">hoje <b>{ovrAt(p, pos)}</b> → depois ~<b>{after}</b></span>
                  {on && <span className="tag good">treinando</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mode === "trait" && (
        <div className="mt12">
          <div className="small muted">Leva uns {traitMonths} meses e no fim tem {chancePct}% de chance de dar certo (melhor treinador, mais chance).</div>
          <div className="list mt8">
            {learnable.map((t) => {
              const ok = canLearn(p, t, w.season);
              const on = p.tf?.k === "trait" && p.tf.t === t;
              return (
                <div key={t} className="list-item" style={{ minHeight: 44, opacity: ok ? 1 : 0.45, background: on ? "var(--card2)" : undefined }}
                  onClick={() => ok ? set({ k: "trait", t, prog: on && p.tf?.k === "trait" ? p.tf.prog : 0 }, `${p.name} começou a treinar: ${TRAITS[t].label}.`) : toast(`Requisito: ${LEARN_REQ[t]!.text}`)}>
                  <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{TRAITS[t].emoji}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="small">{TRAITS[t].label}</b>
                    <div className="tiny muted">{ok ? TRAITS[t].desc : `🔒 ${LEARN_REQ[t]!.text}`}</div>
                  </div>
                  {on && <span className="tag good">treinando</span>}
                </div>
              );
            })}
            {canCalm(p) && (
              <div className="list-item" style={{ minHeight: 44, background: p.tf?.k === "calm" ? "var(--card2)" : undefined }}
                onClick={() => set({ k: "calm", prog: p.tf?.k === "calm" ? p.tf.prog : 0 }, `${p.name} vai trabalhar o temperamento.`)}>
                <span style={{ width: 28, display: "grid", placeItems: "center" }}><Icon name="calm" size={20} /></span>
                <div className="grow"><b className="small">Trabalhar o temperamento</b><div className="tiny muted">Fica mais calmo e leva menos cartões bobos.</div></div>
                {p.tf?.k === "calm" && <span className="tag good">treinando</span>}
              </div>
            )}
          </div>
          {(p.traits ?? []).filter((t) => !TRAITS[t].bad).length >= 4 && <div className="small muted mt8">Ele já tem 4 jogadas especiais — é o máximo.</div>}
        </div>
      )}
    </Sheet>
  );
}
