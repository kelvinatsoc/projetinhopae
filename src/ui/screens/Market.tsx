import { useMemo, useState } from "react";
import { CompareIconBtn } from "../Compare";
import { userWindowOpen } from "../../engine/admin";
import { windowLabel } from "../../engine/calendar";
import { formatMoney } from "../../engine/finance";
import { playerValue } from "../../engine/player";
import { POSITIONS } from "../../engine/positions";
import { TRAIT_IDS, TRAITS } from "../../engine/traits";
import { acceptOffer, feeWithSellOn, searchMarket, type MarketFilter } from "../../engine/transfers";
import type { Pos, TraitId } from "../../engine/types";
import { push, toast, update, useVersion, useWorld } from "../../store";
import { autosave } from "../actions";
import { Crest, PlayerRow, Ic } from "../components";
import { ScoutingTab } from "./Scouting";
import "../market.css";

export function MarketScreen() {
  const w = useWorld();
  const [tab, setTab] = useState<"search" | "offers" | "short" | "legends" | "scout">("search");
  const open = userWindowOpen(w);
  const pending = w.offers.filter((o) => o.status === "pending" && !o.byUser).length;
  return (
    <div className="page">
      <div className={`card flat small ${open ? "" : "muted"}`} style={{ borderColor: open ? "var(--accent)" : undefined }}>
        {windowLabel(w.day) ?? (open ? "🛠️ Janela sempre aberta (Modo Administrador)." : "Janela fechada: só jogadores livres podem ser contratados. Próxima janela: 1º de julho / janeiro.")}
      </div>
      <div className="seg">
        <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>Buscar</button>
        <button className={tab === "offers" ? "active" : ""} onClick={() => setTab("offers")}>Propostas{pending ? ` (${pending})` : ""}</button>
        <button className={tab === "short" ? "active" : ""} onClick={() => setTab("short")}>Observados</button>
        <button className={tab === "legends" ? "active" : ""} onClick={() => setTab("legends")}>Lendas</button>
        <button className={tab === "scout" ? "active" : ""} onClick={() => setTab("scout")}>Olheiros</button>
      </div>
      {tab === "search" && <Search />}
      {tab === "offers" && <Offers />}
      {tab === "short" && <Shortlist />}
      {tab === "legends" && <LegendsMarket />}
      {tab === "scout" && <ScoutingTab />}
      <div style={{ height: 40 }} />
    </div>
  );
}

function Search() {
  const w = useWorld();
  const version = useVersion();
  const [f, setF] = useState<MarketFilter>({ pos: "", maxAge: 0, minOvr: 0, maxValue: 0, scope: "all" });
  const results = useMemo(() => searchMarket(w, f, 80), [w, f, version]);
  const set = (patch: Partial<MarketFilter>) => setF((x) => ({ ...x, ...patch }));
  return (
    <>
      <input className="text" placeholder="Buscar por nome" value={f.query ?? ""} onChange={(e) => set({ query: e.target.value })} />
      <div className="chips">
        <button className={`chip${!f.pos ? " active" : ""}`} onClick={() => set({ pos: "" })}>Todas</button>
        {POSITIONS.map((p) => <button key={p} className={`chip${f.pos === p ? " active" : ""}`} onClick={() => set({ pos: p as Pos })}>{p}</button>)}
      </div>
      <div className="grid2">
        <select className="text" value={f.maxAge} onChange={(e) => set({ maxAge: Number(e.target.value) })}>
          <option value={0}>Qualquer idade</option>
          {[19, 21, 23, 25, 28, 30, 33].map((a) => <option key={a} value={a}>Até {a} anos</option>)}
        </select>
        <select className="text" value={f.minOvr} onChange={(e) => set({ minOvr: Number(e.target.value) })}>
          <option value={0}>Qualquer overall</option>
          {[60, 65, 70, 75, 80, 85].map((o) => <option key={o} value={o}>Overall {o}+</option>)}
        </select>
        <select className="text" value={f.maxValue} onChange={(e) => set({ maxValue: Number(e.target.value) })}>
          <option value={0}>Qualquer valor</option>
          {[1, 5, 10, 25, 50, 100].map((v) => <option key={v} value={v * 1_000_000}>Até R$ {v} mi</option>)}
        </select>
        <select className="text" value={f.scope} onChange={(e) => set({ scope: e.target.value as MarketFilter["scope"] })}>
          <option value="all">Brasil + exterior</option>
          <option value="br">Só clubes brasileiros</option>
          <option value="foreign">Só sul-americanos</option>
        </select>
      </div>
      <select className="text" value={f.trait ?? ""} onChange={(e) => set({ trait: e.target.value as TraitId | "" })} aria-label="Jogada preferida">
        <option value="">Jogada: qualquer</option>
        {TRAIT_IDS.filter((t) => !TRAITS[t].bad).map((t) => <option key={t} value={t}>{TRAITS[t].emoji} {TRAITS[t].label}</option>)}
      </select>
      {f.trait && <div className="tiny muted">Só aparecem jogadores que seus olheiros conhecem bem (observe mais jogadores para ampliar a busca).</div>}
      <div className="chips">
        <button className={`chip${f.freeOnly ? " active" : ""}`} onClick={() => set({ freeOnly: !f.freeOnly })}>Livres</button>
        <button className={`chip${f.listedOnly ? " active" : ""}`} onClick={() => set({ listedOnly: !f.listedOnly })}>À venda</button>
        <button className={`chip${f.legendsOnly ? " active" : ""}`} onClick={() => set({ legendsOnly: !f.legendsOnly })}>★ Lendas</button>
      </div>
      <div className="card flat" style={{ padding: "2px 10px" }}>
        <div className="list">
          {results.map((p) => (
            <PlayerRow key={p.id} p={p} club={p.clubId ? w.clubs[p.clubId] : null} season={w.season} showClub onClick={() => push({ name: "player", id: p.id })}
              right={<><CompareIconBtn p={p} withStarter /><span className="small muted" style={{ whiteSpace: "nowrap" }}>{formatMoney(playerValue(p, w.season))}</span></>} />
          ))}
        </div>
        {!results.length && <div className="empty">Nenhum jogador encontrado com esses filtros.</div>}
      </div>
    </>
  );
}

function Offers() {
  const w = useWorld();
  const incoming = w.offers.filter((o) => !o.byUser).slice().reverse();
  const [sellOn, setSellOn] = useState<Record<number, number>>({});
  return (
    <div className="col gap8">
      {incoming.map((o) => {
        const p = w.players[o.pid];
        const buyer = w.clubs[o.from];
        if (!p || !buyer) return null;
        return (
          <div key={o.id} className="card">
            <div className="row">
              <Crest club={buyer} size={30} />
              <div className="grow">
                <b>{buyer.name}</b> quer <b>{p.name}</b>
                <div className="small muted">Oferta: {formatMoney(o.fee)} · valor de mercado {formatMoney(playerValue(p, w.season))}</div>
              </div>
            </div>
            {o.status === "pending" ? (
              <>
                <div className="row gap4 mt8 wrap">
                  <span className="tiny muted">Revenda:</span>
                  {[0, 0.1, 0.2].map((pct) => (
                    <button key={pct} className={`chip${(sellOn[o.id] ?? 0) === pct ? " active" : ""}`} style={{ minHeight: 36 }} onClick={() => setSellOn((x) => ({ ...x, [o.id]: pct }))}>
                      {pct ? `${pct * 100}%` : "Sem revenda"}
                    </button>
                  ))}
                </div>
                {(sellOn[o.id] ?? 0) > 0 && <div className="tiny muted mt4">Você recebe {formatMoney(feeWithSellOn(o.fee, sellOn[o.id]))} agora e {sellOn[o.id] * 100}% de uma futura venda dele.</div>}
                <div className="grid2 mt8">
                  <button className="btn sm danger" onClick={() => { update(() => { o.status = "rejected"; }); autosave(); }}>Recusar</button>
                  <button className="btn sm primary" onClick={() => { update((x) => acceptOffer(x, o, sellOn[o.id] ?? 0)); autosave(); toast(`${p.name} vendido!`); }}>Aceitar</button>
                </div>
              </>
            ) : (
              <div className="small muted mt8">{o.status === "done" ? <><Ic n="check" /> Vendido</> : o.status === "rejected" ? <><Ic n="close" /> Recusada</> : "Expirada"}</div>
            )}
          </div>
        );
      })}
      {!incoming.length && <div className="empty">Nenhuma proposta recebida. Coloque jogadores à venda no perfil deles para atrair ofertas.</div>}
    </div>
  );
}

function Shortlist() {
  const w = useWorld();
  const list = w.shortlist.map((id) => w.players[id]).filter(Boolean);
  return (
    <div className="card flat" style={{ padding: "2px 10px" }}>
      <div className="list">
        {list.map((p) => (
          <PlayerRow key={p.id} p={p} club={p.clubId ? w.clubs[p.clubId] : null} season={w.season} showClub onClick={() => push({ name: "player", id: p.id })}
            right={<><CompareIconBtn p={p} withStarter /><span className="small muted">{formatMoney(playerValue(p, w.season))}</span></>} />
        ))}
      </div>
      {!list.length && <div className="empty">Toque em “Observar” no perfil de um jogador para acompanhá-lo aqui.</div>}
    </div>
  );
}

function LegendsMarket() {
  const w = useWorld();
  const list = Object.values(w.players).filter((p) => p.legend && p.clubId !== w.userClubId).sort((a, b) => b.ovr - a.ovr);
  return (
    <div className="card flat" style={{ padding: "2px 10px" }}>
      <div className="list">
        {list.map((p) => (
          <PlayerRow key={p.id} p={p} club={p.clubId ? w.clubs[p.clubId] : null} season={w.season} showClub onClick={() => push({ name: "player", id: p.id })}
            right={<><CompareIconBtn p={p} withStarter /><span className="small muted">{formatMoney(playerValue(p, w.season))}</span></>} />
        ))}
      </div>
      {!list.length && <div className="empty">Nenhuma lenda renascida em outros clubes ainda. Elas aparecem nas bases a partir do fim de janeiro.</div>}
    </div>
  );
}
