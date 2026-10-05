// Patrocínios: escolha 1 de 3 ofertas por espaço (Trilha C).
import { useState } from "react";
import { formatMoney } from "../engine/finance";
import { activeDeal, BONUS_LABEL, currentOffers, EMPTY_SLOT_PCT, signSponsor, SLOT_INFO, SLOTS, slotBase, sponsorAnnual } from "../engine/sponsors";
import type { SponsorDeal } from "../engine/types";
import { toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { Sheet } from "./components";
import "./economy.css";

export function SponsorsScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const [pick, setPick] = useState<SponsorDeal | null>(null);
  const offers = currentOffers(w, c);
  return (
    <div className="page">
      <div className="card">
        <div className="card-title"><h3>🤝 Receita de patrocínio</h3><b>{formatMoney(sponsorAnnual(w, c))}/ano</b></div>
        <div className="tiny muted">Espaço vazio rende só {Math.round(EMPTY_SLOT_PCT * 100)}% com anunciantes avulsos. Bônus são pagos no início da temporada seguinte.</div>
      </div>
      {SLOTS.map((slot) => {
        const info = SLOT_INFO[slot];
        const deal = activeDeal(w, c, slot);
        const list = offers.filter((o) => o.slot === slot);
        return (
          <div key={slot} className="card">
            <h3>{info.emoji} {info.label}</h3>
            <div className="tiny muted">{info.desc}</div>
            {deal ? (
              <div className="eco-signed mt8">
                <b>{deal.brand}</b>
                <div className="small">{formatMoney(deal.annual)}/ano · até {deal.until}</div>
                {deal.bonus.map((b) => <span key={b.kind} className="eco-tag">🏆 {BONUS_LABEL[b.kind]}: +{formatMoney(b.value)}</span>)}
              </div>
            ) : (
              <>
                <div className="small mt8 muted">Sem contrato · rendendo {formatMoney(slotBase(c, slot) * EMPTY_SLOT_PCT)}/ano</div>
                <div className="eco-offers">
                  {list.map((o) => (
                    <div key={o.id} className="eco-offer" role="button" tabIndex={0} onClick={() => setPick(o)}>
                      <div className="row"><span className="brand grow">{o.brand}</span><b>{formatMoney(o.annual)}</b></div>
                      <div className="tiny muted">{o.years} {o.years > 1 ? "temporadas" : "temporada"} · {o.bonus.length ? "com bônus" : "valor fixo, sem bônus"}</div>
                      {o.bonus.map((b) => <span key={b.kind} className="eco-tag">🏆 {BONUS_LABEL[b.kind]}: +{formatMoney(b.value)}</span>)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
      {pick && (
        <Sheet title={`Assinar com ${pick.brand}?`} onClose={() => setPick(null)}>
          <p className="small">{SLOT_INFO[pick.slot].label}: {formatMoney(pick.annual)} por ano durante {pick.years} {pick.years > 1 ? "temporadas" : "temporada"}. Depois de assinado, não dá para trocar até o fim do contrato.</p>
          <div className="grid2 mt12">
            <button className="btn" onClick={() => setPick(null)}>Cancelar</button>
            <button className="btn primary" onClick={() => {
              let err: string | null = null;
              update((wd) => { err = signSponsor(wd, wd.clubs[wd.userClubId], pick.id); });
              toast(err ?? `Contrato assinado com ${pick.brand}!`);
              setPick(null);
              autosave();
            }}>Assinar</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
