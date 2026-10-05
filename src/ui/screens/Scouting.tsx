// Olheiros e potencial escondido: aba do Mercado, botão do perfil e cartões de jogadas/personalidade.
import { useState } from "react";
import { absDay } from "../../engine/common";
import { formatMoney } from "../../engine/finance";
import { PERSONALITY_DESC, personalityLabel, reportLines } from "../../engine/personality";
import {
  dismissRec, endMission, knowledgeOf, missionCost, missionSlots, PERSONALITY_K, potRangeLabel, queueScout, queueSlots,
  regionLabel, reportBody, reportGrade, REPORT_K, SCOUT_FOCUS, SCOUT_REGIONS, scoutStatus, startMission, TRAITS_K, unqueueScout,
} from "../../engine/scouting";
import { staffStars } from "../../engine/staff";
import { trainFocusLabel } from "../../engine/training";
import { TRAIT_UNLOCK_OVR, TRAITS } from "../../engine/traits";
import type { Player, ScoutMission, TraitId } from "../../engine/types";
import { push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Bar, PlayerRow, Sheet } from "../components";
import "../manage.css";

const BTN40 = { minHeight: 40 } as const;

/** Aba "Olheiros" do Mercado (missões e relatórios). */
export function ScoutingTab() {
  const w = useWorld();
  const user = w.clubs[w.userClubId];
  const s = w.scout ?? { k: {}, queue: [], missions: [], recs: [] };
  const [region, setRegion] = useState("sul");
  const [focus, setFocus] = useState<ScoutMission["focus"]>("young");
  const [days, setDays] = useState<30 | 60 | 90>(30);
  const [report, setReport] = useState<number | null>(null);
  const now = absDay(w);
  const olh = staffStars(w, user, "olh");
  const mSlots = missionSlots(w);
  const qSlots = queueSlots(w);
  const queue = s.queue.map((id) => w.players[id]).filter(Boolean);
  const recs = s.recs.map((id) => w.players[id]).filter(Boolean).reverse();
  const reports = Object.entries(s.k).filter(([id, k]) => k >= REPORT_K && w.players[Number(id)] && w.players[Number(id)].clubId !== user.id)
    .map(([id]) => w.players[Number(id)]).slice(-12).reverse();
  const cost = missionCost(w, days);

  const start = () => {
    let err: string | null = null;
    update(() => { err = startMission(w, region, focus, days); });
    if (err) { toast(err); return; }
    autosave();
    toast(`Olheiro a caminho: ${regionLabel(region)}!`);
  };

  return (
    <>
      <div className="card">
        <div className="card-title"><h3>🔭 Nova missão</h3><span className="tiny muted">Olheiro-chefe {"★".repeat(olh)}{"☆".repeat(5 - olh)}</span></div>
        <div className="small muted">Onde procurar?</div>
        <div className="chips mt8" style={{ flexWrap: "wrap", overflow: "visible" }}>
          {SCOUT_REGIONS.map((r) => (
            <button key={r.id} className={`chip${region === r.id ? " active" : ""}`} style={{ ...BTN40, whiteSpace: "normal", textAlign: "left" }} onClick={() => setRegion(r.id)}>{r.label}</button>
          ))}
        </div>
        <div className="small muted mt12">O que procurar?</div>
        <div className="chips mt8" style={{ flexWrap: "wrap", overflow: "visible" }}>
          {(Object.keys(SCOUT_FOCUS) as ScoutMission["focus"][]).map((f) => (
            <button key={f} className={`chip${focus === f ? " active" : ""}`} style={BTN40} onClick={() => setFocus(f)}>{SCOUT_FOCUS[f]}</button>
          ))}
        </div>
        <div className="seg mt12">
          {([30, 60, 90] as const).map((d) => <button key={d} className={days === d ? "active" : ""} style={BTN40} onClick={() => setDays(d)}>{d} dias</button>)}
        </div>
        <button className="btn primary block mt12" style={{ minHeight: 44 }} disabled={s.missions.length >= mSlots} onClick={start}>
          Enviar olheiro · {formatMoney(cost)}
        </button>
        <div className="tiny muted mt8">Missões ao mesmo tempo: {s.missions.length}/{mSlots}. A cada semana o olheiro indica 1 ou 2 jogadores.</div>
      </div>

      {s.missions.length > 0 && (
        <div className="card">
          <h3>Missões em andamento</h3>
          <div className="list mt8">
            {s.missions.map((m) => (
              <div key={m.id} className="list-item" style={{ minHeight: 48, cursor: "default" }}>
                <span style={{ fontSize: 20 }}>🧭</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="small">{regionLabel(m.region)}</b>
                  <div className="tiny muted">{SCOUT_FOCUS[m.focus]} · faltam {Math.max(0, m.until - now)} dias</div>
                </div>
                <button className="btn sm" style={BTN40} onClick={() => { update(() => endMission(w, m.id)); autosave(); }}>Encerrar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title"><h3>Na fila de observação</h3><span className="tiny muted">{queue.length}/{qSlots}</span></div>
        {!queue.length && <div className="small muted">Ninguém sendo observado. No perfil de qualquer jogador, toque em “🔭 Mandar olheiro”.</div>}
        <div className="list">
          {queue.map((p) => {
            const k = Math.round(knowledgeOf(w, p));
            return (
              <div key={p.id}>
                <PlayerRow p={p} club={p.clubId ? w.clubs[p.clubId] : null} season={w.season} showClub onClick={() => push({ name: "player", id: p.id })}
                  right={<button className="icon-btn" style={{ minWidth: 40, minHeight: 40 }} aria-label="Tirar da fila" onClick={(e) => { e.stopPropagation(); update(() => unqueueScout(w, p.id)); }}>✕</button>} />
                <div className="row gap8 tiny muted" style={{ margin: "-2px 0 6px 52px" }}><span style={{ flex: 1 }}><Bar v={k} color="var(--info)" /></span>{k}%</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>Recomendados</h3>
        {!recs.length && <div className="small muted mt8">Mande um olheiro em missão para receber indicações.</div>}
        <div className="list mt8">
          {recs.map((p) => (
            <PlayerRow key={p.id} p={p} club={p.clubId ? w.clubs[p.clubId] : null} season={w.season} showClub onClick={() => push({ name: "player", id: p.id })}
              right={
                <div className="row gap4" style={{ flex: "none" }}>
                  <span className="tiny muted" style={{ textAlign: "center", lineHeight: 1.15 }}>pot.<br /><b style={{ color: "var(--text)" }}>{potRangeLabel(w, p)}</b></span>
                  <button className="icon-btn" style={{ minWidth: 32, minHeight: 40, padding: 0 }} aria-label="Dispensar" onClick={(e) => { e.stopPropagation(); update(() => dismissRec(w, p.id)); }}>✕</button>
                </div>
              } />
          ))}
        </div>
      </div>

      {reports.length > 0 && (
        <div className="card">
          <h3>📋 Relatórios prontos</h3>
          <div className="list mt8">
            {reports.map((p) => (
              <PlayerRow key={p.id} p={p} club={p.clubId ? w.clubs[p.clubId] : null} season={w.season} showClub onClick={() => setReport(p.id)}
                right={<span className="tag good">{reportGrade(w, p)}</span>} />
            ))}
          </div>
        </div>
      )}
      <div style={{ height: 30 }} />
      {report != null && w.players[report] && <ReportSheet p={w.players[report]} onClose={() => setReport(null)} />}
    </>
  );
}

function ReportSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const w = useWorld();
  const aux = staffStars(w, w.clubs[w.userClubId], "aux");
  return (
    <Sheet title={`📋 Relatório: ${p.name}`} onClose={onClose}>
      <div className="row gap8"><span className="tag good" style={{ fontSize: 14 }}>Recomendação {reportGrade(w, p)}</span></div>
      <p className="small">{reportBody(w, p)}</p>
      {reportLines(p, aux).length > 0 && <ul className="small" style={{ paddingLeft: 18, margin: "6px 0" }}>{reportLines(p, aux).map((l) => <li key={l}>{l}</li>)}</ul>}
      <button className="btn block mt8" style={{ minHeight: 44 }} onClick={() => { onClose(); push({ name: "player", id: p.id }); }}>Ver perfil</button>
    </Sheet>
  );
}

/** Botão "Mandar olheiro" no perfil de jogadores de outros clubes. */
export function ScoutButton({ p }: { p: Player }) {
  const w = useWorld();
  const [open, setOpen] = useState(false);
  const st = scoutStatus(w, p);
  if (p.clubId === w.userClubId) return null;
  if (st === "done") {
    return (
      <>
        <button className="btn block" style={{ minHeight: 44 }} onClick={() => setOpen(true)}>📋 Ver relatório</button>
        {open && <ReportSheet p={p} onClose={() => setOpen(false)} />}
      </>
    );
  }
  if (st === "queued") {
    return <button className="btn block" style={{ minHeight: 44 }} disabled>🔭 Observando… {Math.round(knowledgeOf(w, p))}%</button>;
  }
  return (
    <button className="btn block" style={{ minHeight: 44 }} onClick={() => {
      let err: string | null = null;
      update(() => { err = queueScout(w, p); });
      if (err) { toast(err); return; }
      autosave();
      toast("Olheiro a caminho! O relatório chega em alguns dias.");
    }}>🔭 Mandar olheiro</button>
  );
}

/** Cartões de jogadas preferidas, personalidade e relatório do auxiliar no perfil. */
export function PlayerInsightCards({ p }: { p: Player }) {
  const w = useWorld();
  const [sheet, setSheet] = useState<null | { t: TraitId } | "pers">(null);
  const mine = p.clubId === w.userClubId;
  const k = knowledgeOf(w, p);
  const traits = p.traits ?? [];
  const locked = p.lockedTraits ?? [];
  const showTraits = mine || k >= TRAITS_K;
  const showPers = mine || k >= PERSONALITY_K;
  const aux = staffStars(w, w.clubs[w.userClubId], "aux");
  const lines = showPers ? reportLines(p, aux) : [];
  const label = personalityLabel(p);

  return (
    <>
      <div className="card">
        <h3>Jogadas preferidas</h3>
        {!showTraits ? (
          <div className="small muted mt8">❔ Jogadas desconhecidas — mande um olheiro.</div>
        ) : (
          <>
            <div className="row gap8 wrap mt8">
              {traits.map((t) => (
                <button key={t} className="trait-chip" style={TRAITS[t].bad ? { borderColor: "#6b2523", color: "#ffb3b1" } : undefined} onClick={() => setSheet({ t })}>
                  {TRAITS[t].emoji} {TRAITS[t].label}
                </button>
              ))}
              {locked.map((t) => {
                const i = Math.min(2, Math.max(0, traits.length - 1 + locked.indexOf(t)));
                return <span key={t} className="trait-chip locked">🔒 desperta aos {TRAIT_UNLOCK_OVR[i]} de overall</span>;
              })}
            </div>
            {!traits.length && !locked.length && <div className="small muted mt8">Nenhuma jogada especial ainda — dá para ensinar no Treino individual.</div>}
          </>
        )}
        {mine && p.tf && <div className="small mt12">🎯 {trainFocusLabel(p)}{"prog" in p.tf ? ` · ${p.tf.prog}%` : ""}</div>}
      </div>

      <div className="card">
        <div className="row gap8" style={{ cursor: showPers ? "pointer" : undefined, minHeight: 32 }} onClick={() => showPers && setSheet("pers")}>
          <span className="grow">🧠 Personalidade: {showPers ? <b>{label}</b> : <span className="muted">❔ (precisa de relatório do olheiro)</span>}</span>
          {showPers && <span className="small muted">ⓘ</span>}
        </div>
        {lines.length > 0 && (
          <>
            <div className="small muted mt8">Relatório do auxiliar</div>
            <ul className="small" style={{ paddingLeft: 18, margin: "4px 0 0" }}>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </>
        )}
      </div>

      {sheet && sheet !== "pers" && (
        <Sheet title={`${TRAITS[sheet.t].emoji} ${TRAITS[sheet.t].label}`} onClose={() => setSheet(null)}>
          <p className="small">{TRAITS[sheet.t].desc}</p>
          {!TRAITS[sheet.t].bad && sheet.t !== "DEC" && <p className="small muted">Como ganhar: Elenco › Treino › Treino individual › Nova jogada.</p>}
          {sheet.t === "PAV" && <p className="small muted">Dá para melhorar: Treino individual › Nova jogada › 🧘 Trabalhar o temperamento.</p>}
        </Sheet>
      )}
      {sheet === "pers" && (
        <Sheet title={`🧠 ${label}`} onClose={() => setSheet(null)}>
          <p className="small">{PERSONALITY_DESC[label]}</p>
        </Sheet>
      )}
    </>
  );
}
