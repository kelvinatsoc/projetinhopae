// Meu estádio: personalização paga (cadeiras, cobertura, fachada, telões, anel extra) e o nome
// do estádio pelo contrato de naming rights. As reformas mudam a visualização HD-2D do complexo.
import { useState } from "react";
import { formatMoney } from "../engine/finance";
import { activeDeal, stadiumName } from "../engine/sponsors";
import { canStartWork, lookWorks, startWork, WORK_INFO, WORK_KINDS, workCost, workPct } from "../engine/stadiumLook";
import type { StadiumLook, StadiumWorkKind } from "../engine/types";
import { push, toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { Bar, Icon, Sheet } from "./components";
import { Hd2dStadium } from "./hq/Hd2dStadium";
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

const WORK_ICONS: Record<StadiumWorkKind, string> = {
  seats: "shirt",
  roof: "stadium",
  facade: "wall",
  screens: "tv",
  tier: "crane",
};

function Swatch({ v, on }: { v: string; on: (v: string) => void }) {
  return <input type="color" value={v} onChange={(e) => on(e.target.value)} aria-label="Cor" style={{ width: 44, height: 40, border: 0, background: "none", cursor: "pointer" }} />;
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

  const previewLook: StadiumLook = {
    ...look,
    seats,
    pattern,
    roof: { type: roof, color: roofColor, opacity: roof === "ring" ? 0.6 : 1 },
    facade: { type: facade, color: fc, color2: fc2 },
  };

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
          {/* Maquete HD-2D Estilo Sea of Stars do Estádio */}
          <div className="card" style={{ padding: 8 }}>
            <div className="card-title" style={{ marginBottom: 6 }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="stadium" size={16} /> Maquete 2D HD
              </h3>
              <b style={{ color: "#34d27b" }}>{formatMoney(c.balance)}</b>
            </div>
            <Hd2dStadium
              club={c}
              look={previewLook}
              height={170}
              stadiumName={stadiumName(w, c)}
              capacity={c.capacity}
            />
            <div className="small mt6" style={{ color: "var(--muted)" }}>
              {c.capacity.toLocaleString("pt-BR")} lugares · As reformas atualizam a maquete em tempo real.
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="priceTag" size={16} /> Naming Rights
              </h3>
            </div>
            {naming ? (
              <div className="tiny">Contrato ativo com <b>{naming.brand}</b>: {formatMoney(naming.annual)}/ano{naming.until ? ` até ${naming.until}` : ""}.</div>
            ) : <div className="tiny muted">Sem contrato: chama-se {c.stadium}. Disponível em patrocínios.</div>}
            <button className="btn sm mt6 block" onClick={() => push({ name: "sponsors" })}>
              <Icon name="handshake" size={14} /> Negociar Patrocínios ›
            </button>
          </div>

          {works.length > 0 && (
            <div className="card">
              <div className="card-title">
                <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="crane" size={16} /> Em Andamento
                </h3>
              </div>
              {works.map((x) => (
                <div key={x.kind} className="mt6">
                  <div className="row tiny">
                    <span className="grow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name={WORK_ICONS[x.kind]} size={14} /> {WORK_INFO[x.kind].label}
                    </span>
                    <span className="muted">{workPct(w, x)}%</span>
                  </div>
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
                  <div className="card-title">
                    <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name={WORK_ICONS[k]} size={18} /> {info.label}
                    </h3>
                    <b style={{ color: "var(--gold)" }}>{formatMoney(workCost(c, k))}</b>
                  </div>
                  <div className="tiny muted">{info.desc} Conclusão em {info.weeks} semanas.</div>

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
                    <div className="mt8">
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        {ROOFS.map((r) => <button key={r.v} className={`chip${roof === r.v ? " on" : ""}`} aria-pressed={roof === r.v} onClick={() => setRoof(r.v)}>{r.label}</button>)}
                      </div>
                      <div className="row mt8" style={{ alignItems: "center", gap: 8 }}>
                        <span className="tiny muted">Cor da cobertura:</span>
                        <Swatch v={roofColor} on={setRoofColor} />
                      </div>
                    </div>
                  )}

                  {k === "facade" && (
                    <div className="mt8">
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        {FACADES.map((f) => <button key={f.v} className={`chip${facade === f.v ? " on" : ""}`} aria-pressed={facade === f.v} onClick={() => setFacade(f.v)}>{f.label}</button>)}
                      </div>
                      <div className="row mt8" style={{ alignItems: "center", gap: 8 }}>
                        <span className="tiny muted">Cor principal:</span>
                        <Swatch v={fc} on={setFc} />
                        <span className="tiny muted" style={{ marginLeft: 6 }}>Secundária:</span>
                        <Swatch v={fc2} on={setFc2} />
                      </div>
                    </div>
                  )}

                  {k === "screens" && (
                    <div className="mt8 tiny muted">
                      Instala telões digitais de alta definição nas arquibancadas com animações do escudo e tempo de jogo.
                    </div>
                  )}

                  {k === "tier" && (
                    <div className="mt8 tiny muted">
                      {c.look?.extraTier ? "O estádio já possui capacidade expandida." : `Acrescenta ${(c.capacity * 0.2).toLocaleString("pt-BR")} lugares ao estádio.`}
                    </div>
                  )}

                  <div className="mt8">
                    {why ? (
                      <span className="small muted">{why}</span>
                    ) : (
                      <button className="btn sm primary block" onClick={() => setAsk(k)}>
                        Contratar Reforma ({formatMoney(workCost(c, k))})
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {ask && (
        <Sheet title={`Confirmar: ${WORK_INFO[ask].label}`} onClose={() => setAsk(null)}>
          <p className="mt8">Custo da obra: <b>{formatMoney(workCost(c, ask))}</b> pagos à vista.</p>
          <p className="tiny muted mt4">Prazo: {WORK_INFO[ask].weeks} semanas de reformas. O visual será atualizado em todo o jogo.</p>
          <div className="row mt12" style={{ gap: 8 }}>
            <button
              className="btn primary grow"
              onClick={() => {
                const err = startWork(w, c, ask, lookFor(ask));
                if (err) toast(err);
                else {
                  update();
                  autosave(true);
                  toast(`Reforma iniciada: ${WORK_INFO[ask].label}.`);
                }
                setAsk(null);
              }}
            >
              Iniciar Reforma
            </button>
            <button className="btn" onClick={() => setAsk(null)}>Cancelar</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
