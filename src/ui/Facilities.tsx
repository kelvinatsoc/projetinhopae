// Estrutura: obras de estádio, CT, base e departamento médico (Trilha C).
import { useState } from "react";
import { buildOf, buildPct, canUpgrade, FAC_INFO, FAC_KINDS, FAC_MAX, facLevel, startUpgrade, upgradeCost, weeksLeft } from "../engine/facilities";
import { formatMoney } from "../engine/finance";
import type { FacilityKind } from "../engine/types";
import { toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { Bar, Sheet } from "./components";
import "./economy.css";

export function FacilitiesScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const [ask, setAsk] = useState<FacilityKind | null>(null);
  return (
    <div className="page">
      <div className="card">
        <div className="card-title"><h3>🏗️ Estrutura do clube</h3><b>{formatMoney(c.balance)}</b></div>
        <div className="tiny muted">As obras são pagas na hora e ficam prontas em algumas semanas. Até duas ao mesmo tempo.</div>
      </div>
      {FAC_KINDS.map((k) => {
        const info = FAC_INFO[k];
        const lv = facLevel(c, k);
        const b = buildOf(c, k);
        const next = Math.min(FAC_MAX, lv + 1);
        const { cost, weeks } = upgradeCost(c, k, next);
        const why = canUpgrade(c, k);
        return (
          <div key={k} className="card">
            <div className="card-title"><h3>{info.emoji} {info.label}</h3><b>Nível {lv}</b></div>
            <div className="eco-levels" aria-label={`Nível ${lv} de ${FAC_MAX}`}>
              {Array.from({ length: FAC_MAX }, (_, i) => <i key={i} className={i < lv ? "on" : b && i === lv ? "next" : ""} />)}
            </div>
            <div className="small">{info.effect(lv)}{k === "stadium" ? ` · ${c.capacity.toLocaleString("pt-BR")} lugares` : ""}</div>
            {b ? (
              <div className="mt8">
                <div className="row small"><span className="grow">Obra para o nível {b.to}</span><span className="muted">faltam {weeksLeft(w, b)} sem.</span></div>
                <Bar v={buildPct(w, b)} color="var(--accent)" />
              </div>
            ) : lv < FAC_MAX ? (
              <div className="row mt8">
                <div className="grow tiny muted">Nível {next}: {formatMoney(cost)} · {weeks} semanas<br />{info.effect(next)}</div>
                <button className="btn sm primary" disabled={!!why} onClick={() => setAsk(k)}>Melhorar</button>
              </div>
            ) : <div className="tiny muted mt8">Nível máximo!</div>}
            {why && !b && lv < FAC_MAX && <div className="tiny" style={{ color: "var(--warn)" }}>{why}</div>}
          </div>
        );
      })}
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
