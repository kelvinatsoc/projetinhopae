// Diretoria: pedidos e obras (Trilha C).
import { useState } from "react";
import {
  absDate, boardShare, canRequest, daysUntil, makeRequest, projectLabel, projectPct, REQUEST_BY_KIND, REQUESTS, requestCost, requestTitle,
  stadiumOccupancy, type RequestKind,
} from "../../engine/board";
import { formatMoney } from "../../engine/finance";
import { push, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Bar, Sheet } from "../components";
import "../club.css";

export function BoardScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const [ask, setAsk] = useState<RequestKind | null>(null);
  const [answer, setAnswer] = useState<{ ok: boolean; msg: string } | null>(null);
  const occ = stadiumOccupancy(w);
  const proj = c.proj ?? [];

  return (
    <div className="page">
      <div className="card">
        <div className="card-title"><h3>🏛️ Confiança da diretoria</h3><b>{Math.round(w.board.confidence)}%</b></div>
        <Bar v={w.board.confidence} />
        <div className="small mt8">🎯 {w.board.objective}</div>
        {w.board.estadual?.season === w.season && <div className="small mt8">🏅 {w.board.estadual.text}</div>}
        <div className="tiny muted mt8">Vencer aumenta a confiança. Com mais confiança, a diretoria aprova obras maiores.</div>
      </div>

      <div className="card">
        <h3>🏗️ Obras em andamento</h3>
        {!proj.length && <div className="small muted">Nenhuma obra agora. Faça um pedido abaixo!</div>}
        {proj.map((p, i) => (
          <div key={i} className="mt8">
            <div className="row small"><b className="grow">{projectLabel(c, p)}</b><span className="muted">faltam {daysUntil(w, p.done)} dias</span></div>
            <Bar v={projectPct(w, p)} color="var(--accent)" />
            <div className="tiny muted mt8">Pronto em {absDate(p.done)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>📋 Fazer um pedido</h3>
        {REQUESTS.map((r) => {
          const can = canRequest(w, r.kind);
          const cost = requestCost(w, r.kind);
          const share = boardShare(w, r.kind);
          return (
            <div key={r.kind} className="req-row">
              <div className="grow">
                <b className="small" style={{ display: "block" }}>{requestTitle(w, r.kind)}</b>
                {!(r.kind !== "grant" && r.kind !== "stadium" && !can.ok && can.reason?.includes("máximo")) && <div className="tiny muted">
                  {r.kind === "grant"
                    ? `Recebe ${formatMoney(cost)} · 1 vez por temporada · confiança ≥ ${r.conf}%`
                    : `${formatMoney(Math.round(cost * (1 - share)))}${share ? " (a diretoria paga 30%)" : ""} · ${r.days} dias · confiança ≥ ${r.conf}%`}
                </div>}
                {!can.ok && <div className="tiny" style={{ color: "var(--warn)" }}>{can.reason}</div>}
                {r.kind === "stadium" && can.ok && occ != null && occ < 0.85 && (
                  <div className="tiny" style={{ color: "var(--warn)" }}>Seu estádio está com {Math.round(occ * 100)}% de ocupação — ampliar agora rende pouco.</div>
                )}
              </div>
              <button className="btn sm primary" disabled={!can.ok} onClick={() => { setAnswer(null); setAsk(r.kind); }}>Pedir</button>
            </div>
          );
        })}
      </div>

      {ask && (
        <Sheet title={answer ? "Resposta da diretoria" : requestTitle(w, ask)} onClose={() => setAsk(null)}>
          {!answer && (
            <>
              <p className="small">
                {ask === "grant"
                  ? `Pedir ${formatMoney(requestCost(w, "grant"))} para reforços. A diretoria só libera uma vez por temporada e espera resultado depois.`
                  : `Custo para o clube: ${formatMoney(Math.round(requestCost(w, ask) * (1 - boardShare(w, ask))))} (saldo: ${formatMoney(c.balance)}). Fica pronto em ${REQUEST_BY_KIND[ask].days} dias.`}
              </p>
              <p className="tiny muted mt8">Se a diretoria negar, só dá para pedir de novo em 60 dias.</p>
              <div className="grid2 mt12">
                <button className="btn" onClick={() => setAsk(null)}>Cancelar</button>
                <button className="btn primary" onClick={() => {
                  let r = { ok: false, msg: "" };
                  update((x) => { r = makeRequest(x, ask); });
                  autosave();
                  setAnswer(r);
                }}>Fazer o pedido</button>
              </div>
            </>
          )}
          {answer && (
            <>
              <div className="center" style={{ fontSize: 44 }}>{answer.ok ? "✅" : "❌"}</div>
              <p className="center"><b>{answer.msg.replace(/^[✅❌]\s*/u, "")}</b></p>
              <button className="btn primary block mt12" onClick={() => setAsk(null)}>Ok</button>
            </>
          )}
        </Sheet>
      )}
      <div style={{ height: 30 }} />
    </div>
  );
}

/** Cartão no Início com obras em andamento. */
export function BoardHomeCard() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  if (!c?.proj?.length) return null;
  return (
    <div className="card tap small" onClick={() => push({ name: "board" })}>
      🏗️ Obras: {c.proj.map((p) => `${projectLabel(c, p).split(" ★")[0].replace(/ \+.*/, "")} ${projectPct(w, p)}% · pronto em ${absDate(p.done)}`).join(" | ")}
    </div>
  );
}
