// Diretoria: confiança, objetivos e pedido de verba (obras ficam em Estrutura).
import { useState } from "react";
import { canRequest, makeRequest, REQUESTS, requestCost, requestTitle, type RequestKind } from "../../engine/board";
import { buildPct, FAC_INFO, weeksLeft } from "../../engine/facilities";
import { formatMoney } from "../../engine/finance";
import { push, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Bar, Sheet } from "../components";
import "../club.css";

export function BoardScreen() {
  const w = useWorld();
  const [ask, setAsk] = useState<RequestKind | null>(null);
  const [answer, setAnswer] = useState<{ ok: boolean; msg: string } | null>(null);

  return (
    <div className="page k-board-page">
      <div className="k-board-grid">
        <aside className="k-board-aside">
          <div className="card">
            <div className="card-title"><h3>🏛️ Diretoria</h3><b>{Math.round(w.board.confidence)}%</b></div>
            <Bar v={w.board.confidence} />
            <div className="mt8 col gap4">
              <div className="small">🎯 <b>Objetivo Liga:</b> {w.board.objective}</div>
              {w.board.estadual?.season === w.season && <div className="small">🏅 <b>Estadual:</b> {w.board.estadual.text}</div>}
            </div>
            <div className="tiny muted mt8" style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
              Vencer partidas e cumprir metas eleva a confiança. Confiança alta destrava verbas maiores.
            </div>
          </div>

          <div className="card tap small" onClick={() => push({ name: "facilities" })}>
            🏗️ <b>Estrutura do Clube:</b> Obras de estádio, CT e categorias de base ›
          </div>
        </aside>

        <main className="k-board-main">
          <div className="card">
            <h3>📋 Solicitações & Verbas Extras</h3>
            <p className="tiny muted mt4">Reuniões com o presidente para liberar orçamento suplementar.</p>
            <div className="mt8 col gap8">
              {REQUESTS.map((r) => {
                const can = canRequest(w, r.kind);
                const cost = requestCost(w, r.kind);
                return (
                  <div key={r.kind} className="req-row">
                    <div className="grow">
                      <b className="small" style={{ display: "block" }}>{requestTitle(w, r.kind)}</b>
                      <div className="tiny muted">Liberação de {formatMoney(cost)} · 1x por temporada · exige confiança ≥ {r.conf}%</div>
                      {!can.ok && <div className="tiny" style={{ color: "var(--warn)" }}>{can.reason}</div>}
                    </div>
                    <button className="btn sm primary" disabled={!can.ok} onClick={() => { setAnswer(null); setAsk(r.kind); }}>Pedir</button>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {ask && (
        <Sheet title={answer ? "Resposta da diretoria" : requestTitle(w, ask)} onClose={() => setAsk(null)}>
          {!answer && (
            <>
              <p className="small">
                {`Pedir ${formatMoney(requestCost(w, ask))} para reforços. A diretoria só libera uma vez por temporada e espera resultado depois.`}
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

/** Cartão no Início com obras de Estrutura em andamento. */
export function BoardHomeCard() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const builds = c?.fac?.builds ?? [];
  if (!builds.length) return null;
  return (
    <div className="card tap small" onClick={() => push({ name: "facilities" })}>
      🏗️ Obras: {builds.map((b) => `${FAC_INFO[b.kind].label} ${buildPct(w, b)}% · faltam ${weeksLeft(w, b)} sem.`).join(" | ")}
    </div>
  );
}
