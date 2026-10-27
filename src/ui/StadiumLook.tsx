// Meu estádio: personalização paga (cadeiras, cobertura, fachada, telões, anel extra) e o nome
// do estádio pelo contrato de naming rights. As reformas mudam o mapa da sede e a partida.
import { useState } from "react";
import { formatMoney } from "../engine/finance";
import { activeDeal, stadiumName } from "../engine/sponsors";
import { canStartWork, lookWorks, startWork, WORK_INFO, WORK_KINDS, workCost, workPct } from "../engine/stadiumLook";
import type { StadiumLook, StadiumWorkKind } from "../engine/types";
import { push, toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { Bar, Sheet } from "./components";
import "./economy.css";

const ROOFS: { v: NonNullable<StadiumLook["roof"]>["type"]; label: string }[] = [
  { v: "ring", label: "Anel completo" },
  { v: "box", label: "Caixote (arena)" },
  { v: "canopy", label: "Só a social" },
  { v: "petals", label: "Pétalas" },
  { v: "none", label: "Sem cobertura" },
];
const FACADES: { v: NonNullable<NonNullable<StadiumLook["facade"]>["type"]>; label: string }[] = [
  { v: "columns", label: "Pilares de concreto" },
  { v: "cantilever", label: "Concreto em balanço" },
  { v: "glass", label: "Vidro" },
  { v: "waves", label: "Lâminas onduladas" },
  { v: "ribbons", label: "Faixas horizontais" },
  { v: "panels", label: "Lâminas verticais" },
  { v: "membrane", label: "Membrana" },
  { v: "classic", label: "Clássica (arcos)" },
];
const PATTERNS: { v: NonNullable<StadiumLook["pattern"]>; label: string }[] = [
  { v: "solid", label: "Uma cor" },
  { v: "sectors", label: "Setores" },
  { v: "bands", label: "Faixas por anel" },
  { v: "mosaic", label: "Mosaico" },
];

function Swatch({ v, on }: { v: string; on: (v: string) => void }) {
  return <input type="color" value={v} onChange={(e) => on(e.target.value)} aria-label="Cor" style={{ width: 44, height: 40, border: 0, background: "none" }} />;
}

export function StadiumLookScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const look = c.look ?? {};
  const [ask, setAsk] = useState<StadiumWorkKind | null>(null);
  const [seats, setSeats] = useState<string[]>(look.seats ?? [c.colors[0], c.colors[1]]);
  const [pattern, setPattern] = useState<NonNullable<StadiumLook["pattern"]>>(look.pattern ?? "sectors");
  const [roof, setRoof] = useState<NonNullable<StadiumLook["roof"]>["type"]>(look.roof?.type ?? "ring");
  const [roofColor, setRoofColor] = useState(look.roof?.color ?? "#f2f3f4");
  const [facade, setFacade] = useState<NonNullable<NonNullable<StadiumLook["facade"]>["type"]>>(look.facade?.type ?? "columns");
  const [fc, setFc] = useState(look.facade?.color ?? "#d3cfc6");
  const [fc2, setFc2] = useState(look.facade?.color2 ?? c.colors[0]);
  const naming = activeDeal(w, c, "stadium");
  const lookFor = (k: StadiumWorkKind): Partial<StadiumLook> =>
    k === "seats" ? { seats, pattern }
      : k === "roof" ? { roof: { type: roof, color: roofColor, opacity: roof === "ring" ? 0.6 : 1 } }
      : k === "facade" ? { facade: { type: facade, color: fc, color2: fc2 } }
      : k === "screens" ? { screens: 2 }
      : { extraTier: true };
  const works = lookWorks(c);
  return (
    <div className="page k-stadium-page">
      <div className="k-stadium-grid">
        <aside className="k-stadium-aside">
          <div className="card">
            <div className="card-title"><h3>🏟️ {stadiumName(w, c)}</h3><b style={{ color: "#34d27b" }}>{formatMoney(c.balance)}</b></div>
            <div className="small mt4">{c.capacity.toLocaleString("pt-BR")} lugares. Reformas alteram a sede 3D e as partidas.</div>
          </div>
          <div className="card">
            <div className="card-title"><h3>🏷️ Naming Rights</h3></div>
            {naming ? (
              <div className="tiny">Contrato com <b>{naming.brand}</b>: {formatMoney(naming.annual)}/ano{naming.until ? ` até ${naming.until}` : ""}.</div>
            ) : <div className="tiny muted">Sem contrato: chama-se {c.stadium}. Venda em patrocínios.</div>}
            <button className="btn sm mt6 block" onClick={() => push({ name: "sponsors" })}>Patrocínios ›</button>
          </div>
          {works.length > 0 && (
            <div className="card">
              <div className="card-title"><h3>🏗️ Em Andamento</h3></div>
              {works.map((x) => (
                <div key={x.kind} className="mt6">
                  <div className="row tiny"><span className="grow">{WORK_INFO[x.kind].emoji} {WORK_INFO[x.kind].label}</span><span className="muted">{workPct(w, x)}%</span></div>
                  <Bar v={workPct(w, x)} color="var(--accent)" />
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="k-stadium-main">
          <div className="k-stadium-cards-grid">
            {WORK_KINDS.map((k) => {
        const info = WORK_INFO[k];
        const why = canStartWork(c, k);
        return (
          <div key={k} className="card">
            <div className="card-title"><h3>{info.emoji} {info.label}</h3><b>{formatMoney(workCost(c, k))}</b></div>
            <div className="tiny muted">{info.desc} Fica pronto em {info.weeks} semanas.</div>
            {k === "seats" && (
              <div className="mt8">
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {seats.map((s, i) => <Swatch key={i} v={s} on={(v) => setSeats(seats.map((x, j) => (j === i ? v : x)))} />)}
                  {seats.length < 4 && <button className="btn sm ghost" onClick={() => setSeats([...seats, "#ffffff"])}>+ cor</button>}
                  {seats.length > 1 && <button className="btn sm ghost" onClick={() => setSeats(seats.slice(0, -1))}>− cor</button>}
                </div>
                <div className="row mt8" style={{ gap: 6, flexWrap: "wrap" }}>
                  {PATTERNS.map((p) => <button key={p.v} className={`chip${pattern === p.v ? " on" : ""}`} aria-pressed={pattern === p.v} onClick={() => setPattern(p.v)}>{p.label}</button>)}
                </div>
              </div>
            )}
            {k === "roof" && (
              <div className="row mt8" style={{ gap: 6, flexWrap: "wrap" }}>
                {ROOFS.map((r) => <button key={r.v} className={`chip${roof === r.v ? " on" : ""}`} aria-pressed={roof === r.v} onClick={() => setRoof(r.v)}>{r.label}</button>)}
                {roof !== "none" && <Swatch v={roofColor} on={setRoofColor} />}
              </div>
            )}
            {k === "facade" && (
              <div className="row mt8" style={{ gap: 6, flexWrap: "wrap" }}>
                {FACADES.map((f) => <button key={f.v} className={`chip${facade === f.v ? " on" : ""}`} aria-pressed={facade === f.v} onClick={() => setFacade(f.v)}>{f.label}</button>)}
                <Swatch v={fc} on={setFc} /><Swatch v={fc2} on={setFc2} />
              </div>
            )}
            <div className="row mt8">
              {why ? <div className="grow tiny" style={{ color: "var(--warn)" }}>{why}</div> : <div className="grow" />}
              <button className="btn sm primary" disabled={!!why} onClick={() => setAsk(k)}>Reformar</button>
            </div>
          </div>
        );
      })}
          </div>
        </main>
      </div>
      {ask && (
        <Sheet title={`Reforma: ${WORK_INFO[ask].label}`} onClose={() => setAsk(null)}>
          <p className="small">Custo: {formatMoney(workCost(c, ask))} (saldo: {formatMoney(c.balance)}). Fica pronto em {WORK_INFO[ask].weeks} semanas.</p>
          <div className="grid2 mt12">
            <button className="btn" onClick={() => setAsk(null)}>Cancelar</button>
            <button className="btn primary" onClick={() => {
              let err: string | null = null;
              const lk = lookFor(ask);
              update((wd) => { err = startWork(wd, wd.clubs[wd.userClubId], ask, lk); });
              toast(err ?? "Reforma iniciada! 🏗️");
              setAsk(null);
              autosave();
            }}>Confirmar</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
