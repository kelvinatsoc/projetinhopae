// Patrocínios: escolha 1 de 3 ofertas por espaço (Trilha C).
import { useState } from "react";
import { formatMoney } from "../engine/finance";
import { activeDeal, nextDeal, sponsorWindow, BONUS_LABEL, currentOffers, EMPTY_SLOT_PCT, signSponsor, SLOT_INFO, SLOTS, slotBase, sponsorAnnual } from "../engine/sponsors";
import type { SponsorDeal } from "../engine/types";
import { toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { BrandLogo } from "./BrandLogo";
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
        <div className="tiny muted">Marcas e logos reais (marcas registradas dos seus donos). Espaço vazio rende só {Math.round(EMPTY_SLOT_PCT * 100)}% com anunciantes avulsos. Bônus são pagos no início da temporada seguinte.</div>
      </div>
      {SLOTS.map((slot) => {
        const info = SLOT_INFO[slot];
        const deal = activeDeal(w, c, slot);
        const list = offers.filter((o) => o.slot === slot);
        const win = sponsorWindow(w, c, slot);
        const nx = nextDeal(w, c, slot);
        return (
          <div key={slot} className="card">
            <h3>{info.emoji} {info.label}</h3>
            <div className="tiny muted">{info.desc}</div>
            {deal ? (
              <div className="eco-signed mt8">
                <BrandLogo brand={deal.brand} size={30} withName />
                <div className="small">{formatMoney(deal.annual)}/ano · até {deal.until}</div>
                {deal.bonus.map((b) => <span key={b.kind} className="eco-tag">🏆 {BONUS_LABEL[b.kind]}: +{formatMoney(b.value)}</span>)}
                {nx && <div className="small mt8">➡️ A partir de {nx.since}: <b>{nx.brand}</b> · {formatMoney(nx.annual)}/ano até {nx.until}</div>}
                {!win.open && !nx && <div className="tiny muted mt8">🔒 {win.reason}</div>}
                {win.open && (
                  <>
                    <div className="small mt8"><b>Último ano do contrato:</b> renove ou troque de marca para {win.from}.</div>
                    <div className="eco-offers">
                      {list.map((o) => (
                        <div key={o.id} className="eco-offer" role="button" tabIndex={0} onClick={() => setPick(o)}>
                          <div className="row"><span className="brand grow"><BrandLogo brand={o.brand} size={22} withName /></span><b>{formatMoney(o.annual)}</b></div>
                          <div className="tiny muted">{o.brand === deal.brand ? "renovação · " : ""}{o.years} {o.years > 1 ? "temporadas" : "temporada"} ({win.from}–{win.from + o.years - 1}) · {o.bonus.length ? "com bônus" : "valor fixo"}</div>
                          {o.bonus.map((b) => <span key={b.kind} className="eco-tag">🏆 {BONUS_LABEL[b.kind]}: +{formatMoney(b.value)}</span>)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="small mt8 muted">Sem contrato · rendendo {formatMoney(slotBase(c, slot) * EMPTY_SLOT_PCT)}/ano</div>
                <div className="eco-offers">
                  {list.map((o) => (
                    <div key={o.id} className="eco-offer" role="button" tabIndex={0} onClick={() => setPick(o)}>
                      <div className="row"><span className="brand grow"><BrandLogo brand={o.brand} size={22} withName /></span><b>{formatMoney(o.annual)}</b></div>
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
          <p className="small">{SLOT_INFO[pick.slot].label}: {formatMoney(pick.annual)} por ano durante {pick.years} {pick.years > 1 ? "temporadas" : "temporada"}, a partir de {sponsorWindow(w, c, pick.slot).from}. Depois de assinado, a troca só abre de novo no último ano do contrato.</p>
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
