// Negociação de contrato estilo FM (contratar ou renovar), com a barra de satisfação do empresário.
import { useState } from "react";
import {
  AGENT_OK, agentScore, BONUS_BASE, CLAUSE_LABEL, CLAUSE_MULT, clauseValue, defaultTerms, demandFor, goalBonusValue, LUVAS_MULT,
  renewWithTerms, ROLE_LABEL, ROLE_LIST, signWithTerms, type ContractTerms, type NegMode,
} from "../../engine/contracts";
import { formatMoney } from "../../engine/finance";
import { addNews } from "../../engine/news";
import { roundMoney } from "../../engine/player";
import { canAfford } from "../../engine/transfers";
import type { Player } from "../../engine/types";
import { toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Sheet } from "../components";
import "../market.css";

const STEPS = 17; // 70% a 150% em passos de 5%

export function NegotiationSheet({ p, mode, fee = 0, onClose }: { p: Player; mode: NegMode; fee?: number; onClose: () => void }) {
  const w = useWorld();
  const user = w.clubs[w.userClubId];
  const [t, setT] = useState<ContractTerms>(() => defaultTerms(w, p, mode));
  const demand = demandFor(w, p, mode);
  const pct = Math.round((t.wage / demand) * 100);
  const set = (patch: Partial<ContractTerms>) => setT((x) => ({ ...x, ...patch }));
  const stepWage = (d: number) => {
    const k = Math.max(0, Math.min(STEPS - 1, Math.round((pct - 70) / 5) + d));
    set({ wage: roundMoney((demand * (70 + k * 5)) / 100) });
  };

  if (mode === "renew" && p.wantsOut) {
    return (
      <Sheet title={`Renovar com ${p.name}`} onClose={onClose}>
        <div className="banner red">😤 {p.name} quer sair e não aceita renovar agora.</div>
        <p className="small muted mt8">Converse com ele, prometa minutos ou venda. Quando ele ficar feliz de novo, a renovação volta a ser possível.</p>
      </Sheet>
    );
  }

  const view = agentScore(w, p, mode, t);
  const ok = view.score >= AGENT_OK;
  const luvas = Math.round(t.wage * LUVAS_MULT[t.luvas]);
  const total = fee + luvas;
  const color = view.score >= 80 ? "var(--accent)" : view.score >= AGENT_OK ? "#b9e66d" : view.score >= 45 ? "var(--warn)" : "var(--danger)";
  const face = view.score >= 80 ? "😄" : view.score >= AGENT_OK ? "😊" : view.score >= 45 ? "😐" : "😠";

  function close() {
    if (!ok) return;
    if (mode === "sign" && !canAfford(user, total, w)) { toast("Dinheiro insuficiente."); return; }
    const from = p.clubId ? w.clubs[p.clubId]?.name : null;
    update((x) => {
      if (mode === "sign") {
        signWithTerms(x, p, fee, t);
        addNews(x, "transfer", `${p.name} é o novo reforço do ${user.name}!`,
          from ? `Contratado do ${from} por ${formatMoney(fee)}. Salário de ${formatMoney(t.wage)}/mês até ${x.season + t.years}.` : `Chegou sem custo de transferência. Salário de ${formatMoney(t.wage)}/mês até ${x.season + t.years}.`, { pid: p.id });
      } else {
        renewWithTerms(x, p, t);
        addNews(x, "contract", `✍️ ${p.name} renovou até ${x.season + t.years}`, `Salário de ${formatMoney(t.wage)}/mês · papel: ${ROLE_LABEL[t.role]}${t.clause ? ` · multa de ${formatMoney(p.clause ?? 0)}` : ""}.`, { pid: p.id });
      }
    });
    autosave();
    toast(mode === "sign" ? `${p.name} contratado! ✍️` : "Contrato renovado! ✍️");
    onClose();
  }

  return (
    <Sheet title={mode === "sign" ? `Contrato de ${p.name}` : `Renovar com ${p.name}`} onClose={onClose}>
      <div className="small muted">
        {mode === "renew" ? `Salário atual ${formatMoney(p.wage)} · ` : ""}pedido: <b>{formatMoney(demand)}/mês</b>
      </div>

      <div className="neg-label">Salário</div>
      <div className="neg-step">
        <button className="btn" aria-label="Diminuir salário" onClick={() => stepWage(-1)}>−</button>
        <b>{formatMoney(t.wage)} <span className="small muted">({pct}%)</span></b>
        <button className="btn" aria-label="Aumentar salário" onClick={() => stepWage(1)}>+</button>
      </div>

      <div className="neg-label">Duração</div>
      <div className="neg-grid c5">
        {[1, 2, 3, 4, 5].map((y) => <button key={y} className={`chip${t.years === y ? " active" : ""}`} onClick={() => set({ years: y })}>{y} {y === 1 ? "ano" : "anos"}</button>)}
      </div>

      <div className="neg-label">Papel prometido</div>
      <div className="neg-chips">
        {ROLE_LIST.map((r) => <button key={r} className={`chip${t.role === r ? " active" : ""}`} onClick={() => set({ role: r })}>{ROLE_LABEL[r]}</button>)}
      </div>

      <div className="neg-label">Multa rescisória</div>
      <div className="neg-grid c4">
        {CLAUSE_LABEL.map((l, i) => (
          <button key={l} className={`chip${t.clause === i ? " active" : ""}`} onClick={() => set({ clause: i as ContractTerms["clause"] })}>
            {l}{i ? ` ${String(CLAUSE_MULT[i]).replace(".", ",")}×` : ""}
          </button>
        ))}
      </div>
      {t.clause > 0 && <div className="tiny muted mt4">Multa de {formatMoney(clauseValue(w, p, t.clause))}: se um clube pagar, ele sai na hora (e o dinheiro é seu).</div>}

      <div className="neg-label">Bônus por gol</div>
      <div className="neg-grid c4">
        {BONUS_BASE.map((_, i) => (
          <button key={i} className={`chip${t.bonus === i ? " active" : ""}`} onClick={() => set({ bonus: i as ContractTerms["bonus"] })}>
            {i ? formatMoney(goalBonusValue(user, i)) : "Nenhum"}
          </button>
        ))}
      </div>

      <div className="neg-label">Luvas (pagas uma vez)</div>
      <div className="neg-grid c4">
        {LUVAS_MULT.map((m, i) => (
          <button key={i} className={`chip${t.luvas === i ? " active" : ""}`} onClick={() => set({ luvas: i as ContractTerms["luvas"] })}>
            {m ? `${m}× salário` : "Nada"}
          </button>
        ))}
      </div>

      {(fee > 0 || luvas > 0) && (
        <div className="small muted mt12">
          {fee > 0 && <>Transferência: <b>{formatMoney(fee)}</b>{luvas > 0 ? " · " : ""}</>}
          {luvas > 0 && <>Luvas: <b>{formatMoney(luvas)}</b></>}
        </div>
      )}
      <div className="neg-foot">
      <div className="agent">
        <div className="agent-head"><span>{face} Empresário: {view.score}% satisfeito</span></div>
        <div className="agent-bar" style={{ marginTop: 6 }}><i style={{ width: `${view.score}%`, background: color }} /><s style={{ left: `${AGENT_OK}%` }} /></div>
        <div className="small mt4" style={{ color: ok ? undefined : "var(--warn)" }}>{view.hint}</div>
      </div>
      <button className="btn primary block mt8" disabled={!ok} onClick={close}>
        ✍️ Fechar contrato{ok ? ` até ${w.season + t.years}` : ` (precisa de ${AGENT_OK}%)`}
      </button>
      </div>
    </Sheet>
  );
}
