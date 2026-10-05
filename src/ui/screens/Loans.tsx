// Empréstimos: emprestar um jogador seu ou pedir um jogador emprestado.
import { useState } from "react";
import { withWorldRng, windowIndex } from "../../engine/common";
import { formatMoney } from "../../engine/finance";
import { LOAN_IN_PAY, loanInBlock, loanOut, loanOutBlock, loanOutOffers, requestLoanIn, type LoanInResult } from "../../engine/loans";
import type { Player } from "../../engine/types";
import { toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Crest, Sheet } from "../components";
import "../market.css";

const DIV_NAME: Record<string, string> = { A: "Série A", B: "Série B", C: "Série C", D: "Série D" };

export function LoanOutSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const w = useWorld();
  const block = loanOutBlock(w, p);
  const offers = block ? [] : loanOutOffers(w, p);
  const [sel, setSel] = useState(0);
  const [noOpt, setNoOpt] = useState(false);
  const canHalf = windowIndex(w.day) === 0;
  const [half, setHalf] = useState(false);
  const visible = offers.map((o) => ({ o, off: noOpt && !!o.opt && o.dropNoOpt }));
  const chosen = visible[sel] && !visible[sel].off ? visible[sel].o : visible.find((v) => !v.off)?.o;

  function confirm() {
    if (!chosen) return;
    let err: string | null = null;
    update((x) => { err = loanOut(x, p, chosen, half, noOpt); });
    if (err) { toast(err); return; }
    autosave();
    toast(`📤 ${p.name} emprestado ao ${w.clubs[chosen.clubId].name}`);
    onClose();
  }

  return (
    <Sheet title={`Emprestar ${p.name}`} onClose={onClose}>
      {block ? <div className="banner">{block}</div> : (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>Jogando toda semana, ele volta mais forte. O contrato continua sendo seu.</p>
          {!offers.length && <div className="empty">Nenhum clube se interessou agora. Tente na próxima janela.</div>}
          <div className="col gap8">
            {visible.map(({ o, off }, i) => {
              const c = w.clubs[o.clubId];
              return (
                <div key={o.clubId} className={`loan-offer${chosen === o ? " active" : ""}${off ? " off" : ""}`} onClick={() => !off && setSel(i)}>
                  <Crest club={c} size={34} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{c.name}</b> <span className="small muted">({DIV_NAME[c.div] ?? c.div})</span>
                    <div className="small">deve ser <b>{o.starter ? "Titular" : "Rodízio"}</b> · paga {Math.round(o.wagePct * 100)}% do salário</div>
                    {o.opt && <div className="tiny muted">{off ? "Desistiu: queria opção de compra" : `opção de compra ${formatMoney(o.opt)}`}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {offers.length > 0 && (
            <>
              <div className="neg-label">Duração</div>
              <div className="neg-chips">
                <button className={`chip${!half ? " active" : ""}`} onClick={() => setHalf(false)}>Até o fim da temporada</button>
                {canHalf && <button className={`chip${half ? " active" : ""}`} onClick={() => setHalf(true)}>Meia temporada (até 30/jun)</button>}
              </div>
              <div className="neg-chips mt8">
                <button className={`chip${noOpt ? " active" : ""}`} onClick={() => setNoOpt(!noOpt)}>{noOpt ? "✓ " : ""}Sem opção de compra</button>
              </div>
              <button className="btn primary block mt12" disabled={!chosen} onClick={confirm}>
                {chosen ? `📤 Emprestar ao ${w.clubs[chosen.clubId].name}` : "Escolha um clube"}
              </button>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

export function LoanInSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const w = useWorld();
  const parent = p.clubId ? w.clubs[p.clubId] : null;
  const [pay, setPay] = useState<number>(0.75);
  const [res, setRes] = useState<LoanInResult | null>(null);
  const block = res?.ok ? null : loanInBlock(w, p);

  function ask() {
    let r: LoanInResult = { ok: false, text: "" };
    update((x) => { r = withWorldRng(x, () => requestLoanIn(x, p, pay)); });
    setRes(r);
    if (r.ok) autosave();
  }

  return (
    <Sheet title={`Pedir ${p.name} emprestado`} onClose={onClose}>
      {res && <div className={`banner ${res.ok ? "" : "red"}`} style={res.ok ? { borderColor: "var(--accent)" } : undefined}>{res.text}</div>}
      {!res?.ok && (block ? <div className="banner mt8">{block}</div> : (
        <>
          <p className="small muted" style={{ marginTop: res ? 8 : 0 }}>Ele joga por você até o fim da temporada. Quanto mais salário você pagar, maior a chance do {parent?.name} aceitar.</p>
          <div className="neg-label">Você paga</div>
          <div className="neg-chips">
            {LOAN_IN_PAY.map((v) => (
              <button key={v} className={`chip${pay === v ? " active" : ""}`} onClick={() => setPay(v)}>{Math.round(v * 100)}% do salário ({formatMoney(Math.round(p.wage * v))})</button>
            ))}
          </div>
          <button className="btn primary block mt12" onClick={ask}>📥 Pedir emprestado</button>
        </>
      ))}
      {res?.ok && <button className="btn block mt12" onClick={onClose}>Fechar</button>}
    </Sheet>
  );
}
