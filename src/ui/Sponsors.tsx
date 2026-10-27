// Tela de patrocínios: ver contratos ativos e escolher ofertas novas nas janelas de renovação.
import { useState } from "react";
import { formatMoney } from "../engine/finance";
import { activeDeal, BONUS_LABEL, currentOffers, EMPTY_SLOT_PCT, nextDeal, signSponsor, slotBase, SLOT_INFO, SLOTS, sponsorAnnual, sponsorWindow } from "../engine/sponsors";
import type { SponsorDeal, SponsorSlot } from "../engine/types";
import { toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { BrandLogo } from "./BrandLogo";
import { Icon, Sheet } from "./components";
import "./economy.css";

const SLOT_ICONS: Record<SponsorSlot, string> = {
  shirt: "shirt",
  stadium: "stadium",
  kit: "boot",
};

export function SponsorsScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const [pick, setPick] = useState<SponsorDeal | null>(null);
  const offers = currentOffers(w, c);
  return (
    <div className="page k-sponsors-page">
      <div className="card k-sponsors-banner">
        <div className="card-title">
          <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="handshake" size={16} /> Gestão de Patrocínios & Marcas
          </h3>
          <span>Receita Total: <b style={{ color: "#34d27b" }}>{formatMoney(sponsorAnnual(w, c))}/ano</b></span>
        </div>
        <div className="tiny muted">Marcas oficiais registradas. Espaços vazios rendem {Math.round(EMPTY_SLOT_PCT * 100)}% com anúncios genéricos. Bônus por títulos pagos na virada de ano.</div>
      </div>

      <div className="k-sponsors-grid">
        {SLOTS.map((slot) => {
          const info = SLOT_INFO[slot];
          const deal = activeDeal(w, c, slot);
          const list = offers.filter((o) => o.slot === slot);
          const win = sponsorWindow(w, c, slot);
          const nx = nextDeal(w, c, slot);
          return (
            <div key={slot} className="card">
              <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name={SLOT_ICONS[slot]} size={16} /> {info.label}
              </h3>
              <div className="tiny muted">{info.desc}</div>
              {deal ? (
                <div className="eco-signed mt8">
                  <BrandLogo brand={deal.brand} size={30} withName />
                  <div className="small">{formatMoney(deal.annual)}/ano · até {deal.until}</div>
                  {deal.bonus.map((b) => (
                    <span key={b.kind} className="eco-tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name="trophy" size={12} /> {BONUS_LABEL[b.kind]}: +{formatMoney(b.value)}
                    </span>
                  ))}
                  {nx && (
                    <div className="small mt8" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="chev" size={12} /> A partir de {nx.since}: <b>{nx.brand}</b> · {formatMoney(nx.annual)}/ano até {nx.until}
                    </div>
                  )}
                  {!win.open && !nx && (
                    <div className="tiny muted mt8" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="lock" size={12} /> {win.reason}
                    </div>
                  )}
                  {win.open && (
                    <>
                      <div className="small mt8"><b>Último ano do contrato:</b> renove ou troque de marca para {win.from}.</div>
                      <div className="eco-offers">
                        {list.map((o) => (
                          <div key={o.id} className="eco-offer" role="button" tabIndex={0} onClick={() => setPick(o)}>
                            <div className="row"><span className="brand grow"><BrandLogo brand={o.brand} size={22} withName /></span><b>{formatMoney(o.annual)}</b></div>
                            <div className="tiny muted">{o.brand === deal.brand ? "renovação · " : ""}{o.years} {o.years > 1 ? "temporadas" : "temporada"} ({win.from}–{win.from + o.years - 1}) · {o.bonus.length ? "com bônus" : "valor fixo"}</div>
                            {o.bonus.map((b) => (
                              <span key={b.kind} className="eco-tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <Icon name="trophy" size={12} /> {BONUS_LABEL[b.kind]}: +{formatMoney(b.value)}
                              </span>
                            ))}
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
                        {o.bonus.map((b) => (
                          <span key={b.kind} className="eco-tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Icon name="trophy" size={12} /> {BONUS_LABEL[b.kind]}: +{formatMoney(b.value)}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {pick && (
        <Sheet title={`Fechar com ${pick.brand}?`} onClose={() => setPick(null)}>
          <div className="row mt8"><BrandLogo brand={pick.brand} size={48} withName /></div>
          <p className="mt8"><b>{formatMoney(pick.annual)}</b> por ano durante {pick.years} {pick.years > 1 ? "temporadas" : "temporada"}.</p>
          {pick.bonus.length > 0 && (
            <div className="mt8 small">
              <b>Premiações por título:</b>
              <ul className="mt4">{pick.bonus.map((b) => <li key={b.kind}>{BONUS_LABEL[b.kind]}: +{formatMoney(b.value)} por conquista</li>)}</ul>
            </div>
          )}
          <div className="grid2 mt12">
            <button className="btn" onClick={() => setPick(null)}>Voltar</button>
            <button className="btn primary" onClick={() => {
              let err: string | null = null;
              update((wd) => { err = signSponsor(wd, wd.clubs[wd.userClubId], pick.id); });
              if (err) toast(err);
              else { toast(`Contrato assinado com ${pick.brand}!`); autosave(); }
              setPick(null);
            }}>Assinar contrato</button>
          </div>
        </Sheet>
      )}
      <div style={{ height: 30 }} />
    </div>
  );
}
