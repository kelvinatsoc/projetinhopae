// Carreira do treinador: reputação, propostas de emprego e trajetória.
import { useState } from "react";
import { acceptOffer, activeOffers, declineOffer, ensureCareer, repLabel } from "../engine/career";
import { COMP_META } from "../engine/competitions";
import { clubStrength } from "../engine/lineup";
import { SCENARIO_BY_ID } from "../engine/scenarios";
import type { JobOffer, World } from "../engine/types";
import { forceBack, setTab, toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { clubStars, Crest, Stars, Ic, Icon } from "./components";
import "./progression.css";
import { NtJobCard } from "./screens/World";

/** Lista de propostas com aceitar/recusar (usada também na tela de demissão). */
export function OfferList({ w, onAccepted }: { w: World; onAccepted?: () => void }) {
  const [confirm, setConfirm] = useState<number | null>(null);
  const offers = activeOffers(w);
  if (!offers.length) return <div className="empty-state center"><b>Nenhuma proposta por enquanto</b><div className="small muted">Bons resultados atraem clubes maiores — o telefone vai tocar.</div></div>;
  const accept = (o: JobOffer) => {
    const name = w.clubs[o.clubId].name;
    let ok = false;
    update((x) => { ok = acceptOffer(x, o.id); });
    if (ok) {
      toast(`Você é o novo técnico do ${name}!`);
      autosave(true);
      onAccepted?.();
    }
  };
  return (
    <div className="col gap8">
      {offers.map((o) => {
        const c = w.clubs[o.clubId];
        return (
          <div key={o.id} className="card flat" style={{ padding: 10 }}>
            <div className="row">
              <Crest club={c} size={36} />
              <div className="grow">
                <b>{c.name}</b>
                <div className="small muted">Série {c.div} · {c.city}/{c.region} · reputação {c.rep}</div>
              </div>
              <Stars n={clubStars(clubStrength(w, c))} />
            </div>
            <div className="grid2 mt8">
              {confirm === o.id ? (
                <button className="btn primary sm" onClick={() => accept(o)}>Confirmar</button>
              ) : (
                <button className="btn primary sm" onClick={() => setConfirm(o.id)}>Aceitar</button>
              )}
              <button className="btn sm" onClick={() => { update((x) => declineOffer(x, o.id)); autosave(); }}>Recusar</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CareerScreen() {
  const w = useWorld();
  const car = w.career ?? ensureCareer(w);
  const sc = w.scenario;
  const scDef = sc ? SCENARIO_BY_ID[sc.id] : undefined;
  const titles = w.managerHistory.reduce((s, h) => s + h.titles.length, 0);
  const clubs = new Set([...w.managerHistory.map((h) => h.clubId), w.userClubId]).size;
  return (
    <div className="page k-career-page">
      <div className="k-career-grid">
        <aside className="k-career-aside">
          <div className="card">
            <div className="card-title"><h3><Ic n="briefcase" /> {w.managerName}</h3><span className="tag">{repLabel(car.rep)}</span></div>
            <div className="row small"><span className="grow muted">Reputação</span><b>{car.rep}/100</b></div>
            <div className="rep-meter mt6"><div style={{ width: `${car.rep}%` }} /></div>
            <div className="grid3 mt8">
              <div className="stat-box"><b>{titles}</b><span>títulos</span></div>
              <div className="stat-box"><b>{clubs}</b><span>clubes</span></div>
              <div className="stat-box"><b>{car.sackings}</b><span>demissões</span></div>
            </div>
          </div>

          <NtJobCard />

          {sc && scDef && (
            <div className="card">
              <div className="card-title"><h3>{scDef.emoji} Desafio</h3><span className="tag" style={{ color: sc.status === "won" ? "var(--accent)" : sc.status === "lost" ? "#ef4444" : "var(--gold)" }}>{sc.status === "active" ? "em andamento" : sc.status === "won" ? "vencido" : "perdido"}</span></div>
              <b className="small">{scDef.title}</b>
              <div className="tiny muted mt6"><Ic n="target" /> {scDef.goal}</div>
            </div>
          )}
        </aside>

        <main className="k-career-main">
          <div className="card">
            <div className="card-title"><h3>Propostas de Emprego</h3><span className="small muted">{activeOffers(w).length}</span></div>
            <OfferList w={w} onAccepted={() => { forceBack(); setTab("home"); }} />
            <div className="tiny muted mt6">Propostas chegam na virada de temporada ou após demissão.</div>
          </div>

          <div className="card">
            <div className="card-title"><h3>Trajetória nos Clubes</h3></div>
            {w.managerHistory.length === 0 && <div className="small muted">Complete uma temporada para ver seu histórico.</div>}
            <div className="col gap2 mt4">
              {w.managerHistory.slice().reverse().map((h, i) => (
                <div key={i} className="row small" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                  <b style={{ width: 44 }}>{h.season}</b>
                  <Crest club={w.clubs[h.clubId]} size={18} />
                  <span className="grow">{w.clubs[h.clubId]?.name} · Série {h.div}{h.pos ? ` · ${h.pos}º` : ""}</span>
                  {h.titles.map((t) => <span key={t} title={COMP_META[t]?.name}><Icon name="trophy" size={16} /></span>)}
                </div>
              ))}
            </div>
            {car.moves.length > 0 && (
              <div className="tiny muted mt6">
                {car.moves.slice().reverse().map((m, i) => (
                  <div key={i}><Ic n="luggage" /> {m.season}: {w.clubs[m.from]?.name ?? m.from} → {w.clubs[m.to]?.name ?? m.to}{m.fired ? " (após demissão)" : ""}</div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

