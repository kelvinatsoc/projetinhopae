// Estrutura: obras de estádio, CT, base e departamento médico (Trilha C).
import { useState } from "react";
import { buildOf, buildPct, canUpgrade, FAC_INFO, FAC_KINDS, FAC_MAX, facLevel, startUpgrade, upgradeCost, weeksLeft } from "../engine/facilities";
import { formatMoney } from "../engine/finance";
import type { FacilityKind } from "../engine/types";
import { push, toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { Bar, Sheet } from "./components";
import "./economy.css";

export function FacilitiesScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const [ask, setAsk] = useState<FacilityKind | null>(null);
  return (
    <div className="page k-fac-page">
      <div className="card k-fac-banner">
        <div className="card-title">
          <h3>🏗️ Complexo & Estrutura do Clube</h3>
          <span>Saldo em Caixa: <b style={{ color: "#34d27b" }}>{formatMoney(c.balance)}</b></span>
        </div>
        <div className="tiny muted">Obras pagas à vista com duração de semanas. Até duas reformas simultâneas.</div>
      </div>

      <div className="k-fac-grid">
        {FAC_KINDS.map((k) => {
          const info = FAC_INFO[k];
          const lv = facLevel(c, k);
          const b = buildOf(c, k);
          const next = Math.min(FAC_MAX, lv + 1);
          const { cost, weeks } = upgradeCost(c, k, next);
          const why = canUpgrade(c, k);
          return (
            <div key={k} className="card k-fac-card">
              <div className="card-title"><h3>{info.emoji} {info.label}</h3><b>Nível {lv} / {FAC_MAX}</b></div>
              <div className="eco-levels" aria-label={`Nível ${lv} de ${FAC_MAX}`}>
                {Array.from({ length: FAC_MAX }, (_, i) => <i key={i} className={i < lv ? "on" : b && i === lv ? "next" : ""} />)}
              </div>
              <div className="small mt4">{info.effect(lv)}{k === "stadium" ? ` · ${c.capacity.toLocaleString("pt-BR")} lug.` : ""}</div>
              {b ? (
                <div className="mt6">
                  <div className="row small"><span className="grow">Obra nível {b.to}</span><span className="muted">{weeksLeft(w, b)} sem.</span></div>
                  <Bar v={buildPct(w, b)} color="var(--accent)" />
                </div>
              ) : lv < FAC_MAX ? (
                <div className="row mt6" style={{ alignItems: "center" }}>
                  <div className="grow tiny muted">Próx: {formatMoney(cost)} · {weeks} sem.</div>
                  <button className="btn sm primary" disabled={!!why} onClick={() => setAsk(k)}>Melhorar</button>
                </div>
              ) : <div className="tiny muted mt6">Nível máximo atingido! ⭐</div>}
              {why && !b && lv < FAC_MAX && <div className="tiny" style={{ color: "var(--warn)" }}>{why}</div>}
              {k === "stadium" && <button className="btn sm ghost mt6 block" onClick={() => push({ name: "stadiumLook" })}>🎨 Personalizar Estádio ›</button>}
            </div>
          );
        })}
      </div>
      {ask && (
        <Sheet title={`Melhorar: ${FAC_INFO[ask].label}`} onClose={() => setAsk(null)}>
          <p className="small">Custo: {formatMoney(upgradeCost(c, ask, facLevel(c, ask) + 1).cost)} (saldo: {formatMoney(c.balance)}). Fica pronto em {upgradeCost(c, ask, facLevel(c, ask) + 1).weeks} semanas.</p>
          <div className="grid2 mt12">
            <button className="btn" onClick={() => setAsk(null)}>Cancelar</button>
            <button className="btn primary" onClick={() => {
              let err: string | null = null;
              update((wd) => { err = startUpgrade(wd, wd.clubs[wd.userClubId], ask); });
              toast(err ?? "Obra iniciada! 🏗️");
              setAsk(null);
              autosave();
            }}>Começar obra</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
