import { useEffect, useRef, useState } from "react";
import { LEGEND_BY_ID, TIER_NAMES } from "../../data/legends";
import { userWindowOpen } from "../../engine/admin";
import { COMP_META } from "../../engine/competitions";
import { formatMoney } from "../../engine/finance";
import { withWorldRng } from "../../engine/common";
import { peekClause } from "../../engine/contracts";
import { roleLine } from "../../engine/dressing";
import { canAskLoan, endLoanNow, exerciseOption, loanUntilLabel } from "../../engine/loans";
import { age, fitAttrs, playerValue, roundMoney } from "../../engine/player";
import { ATTR_NAMES, POS_NAME, POS_ORDER, ovrAt, POSITIONS, recalcOvr } from "../../engine/positions";
import { askingPrice, canAfford, evaluateUserBid, playerWillingness, releasePlayer, type OfferResponse } from "../../engine/transfers";
import type { Attrs, Player, World } from "../../engine/types";
import { back, push, replace, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Avatar, Bar, cardTier, Crest, Flag, FormDots, PosBadge, Sheet, Stars, TrendArrow } from "../components";
import { bestPartners } from "../../engine/chemistry";
import { awardsOf, expectedRating, formResidual, injuryProne, pendingRequest, streakOf } from "../../engine/form";
import { roleStars, rolesFor } from "../../engine/tactics";
import { loadCredits, type Credit } from "../credits";
import { COUNTRY_NAME, flag } from "../flags";
import { potRangeLabel } from "../../engine/scouting";
import { AdminPlayerEditor } from "./Admin";
import { NegotiationSheet } from "./Contracts";
import { TalkSheet } from "./Dressing";
import { LoanInSheet, LoanOutSheet } from "./Loans";
import "../market.css";
import { PlayerInsightCards, ScoutButton } from "./Scouting";
import { IndividualTrainingSheet } from "./Training";
import { interact, interactionOptions, type InteractionId, type InteractionResult } from "../../engine/interactions";
import "../narrative.css";

export function PlayerScreen({ id }: { id: number }) {
  const w = useWorld();
  const p = w.players[id];
  const [sheet, setSheet] = useState<null | "offer" | "renew" | "photo" | "release" | "edit" | "train" | "talk" | "loanOut" | "loanIn" | "option" | "act">(null);
  const swipeX = useRef<number | null>(null);
  if (!p) return <div className="page"><div className="empty">Este jogador se aposentou ou não existe mais.</div></div>;
  const club = p.clubId ? w.clubs[p.clubId] : null;
  const mine = p.clubId === w.userClubId;
  const loanedIn = mine && !!p.loan; // emprestado ao seu clube
  const ownedOut = p.loan?.from === w.userClubId; // seu, emprestado a outro clube
  const parent = p.loan ? w.clubs[p.loan.from] : null;
  const clause = mine && !loanedIn ? p.clause ?? 0 : peekClause(w, p);
  const legend = p.legend ? LEGEND_BY_ID[p.legend] : null;
  const ageY = age(p, w.season);
  const value = playerValue(p, w.season);
  const shortlisted = w.shortlist.includes(p.id);
  const attrKeys: (keyof Attrs)[] = p.pos === "GOL" ? ["gol", "fis", "vel", "pas"] : ["vel", "fin", "pas", "dri", "def", "fis"];
  const best = POSITIONS.map((pos) => ({ pos, v: ovrAt(p, pos) })).sort((a, b) => b.v - a.v).slice(0, 4);
  // colegas de elenco, na ordem de posição, para trocar de carta deslizando
  const mates = club ? club.players.map((pid) => w.players[pid]).filter((x): x is Player => !!x && !x.youth === !p.youth).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr) : [];
  const go = (d: number) => {
    if (mates.length < 2) return;
    const i = mates.findIndex((x) => x.id === p.id);
    replace({ name: "player", id: mates[(i + d + mates.length) % mates.length].id });
  };
  const avgRating = p.stats.apps ? (p.stats.ratingSum / p.stats.apps).toFixed(2) : "-";

  return (
    <div className="page">
      <div
        className={`pcard fut ${cardTier(p)}`}
        onTouchStart={(e) => { swipeX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (swipeX.current == null) return;
          const dx = e.changedTouches[0].clientX - swipeX.current;
          swipeX.current = null;
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        }}
      >
        {legend && <span className="tag legend fut-legend">★ Lenda {TIER_NAMES[legend.tier]}</span>}
        <div className="fut-top">
          <div className="fut-ovr">
            <span className="pc-ovr">{p.ovr}</span>
            <span className="pc-pos">{p.pos}</span>
            <Flag code={p.nat} />
            {club && <Crest club={club} size={26} />}
          </div>
          <Avatar p={p} club={club} season={w.season} size={150} />
        </div>
        <div className="fut-name">{p.name}</div>
        <div className="fut-attrs">
          {attrKeys.map((k) => (
            <div key={k}><b>{Math.round(p.attrs[k])}</b> {ATTR_NAMES[k].slice(0, 3).toUpperCase()}</div>
          ))}
        </div>
        <div className="fut-foot">
          pot. {potRangeLabel(w, p)} · {ageY} anos · {p.height} cm · pé {p.foot === "E" ? "esq." : p.foot === "A" ? "ambos" : "dir."}
        </div>
      </div>
      <div className="swipe-hint">
        <button className="btn sm ghost" disabled={!mates.length} onClick={() => go(-1)} aria-label="Jogador anterior">‹</button>
        <div className="col center grow" style={{ alignItems: "center", gap: 4 }}>
          <div className="row gap8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <PosBadge pos={p.pos} /> {p.sec.map((s) => <PosBadge key={s} pos={s} />)}
            <span className="small">{POS_NAME[p.pos]}</span>
          </div>
          {club ? (
            <div className="row small" style={{ cursor: "pointer" }} onClick={() => push({ name: "club", id: club.id })}>
              <Crest club={club} size={18} /> <b>{club.name}</b>{p.youth && <span className="tag">base</span>}{p.shirt && <span>· camisa {p.shirt}</span>}
            </div>
          ) : <div className="small">Sem clube (jogador livre)</div>}
          <span className="tiny muted"><Flag code={p.nat} /> {COUNTRY_NAME[p.nat] ?? p.nat}{mates.length > 1 ? " · deslize a carta para trocar" : ""}</span>
        </div>
        <button className="btn sm ghost" disabled={!mates.length} onClick={() => go(1)} aria-label="Próximo jogador">›</button>
      </div>
      <PhotoCredit p={p} />

      {ownedOut && club && (
        <div className="banner blue">
          <span className="grow">📤 Emprestado ao <b>{club.name}</b> até {loanUntilLabel(p)}</span>
          <button className="btn sm" onClick={() => { update((x) => { endLoanNow(x, p); }); autosave(); toast(`↩️ ${p.name} voltou ao elenco`); }}>↩️ Chamar de volta</button>
        </div>
      )}
      {loanedIn && (
        <div className="banner blue">
          <span className="grow">📥 Emprestado pelo <b>{parent?.name ?? "outro clube"}</b> até o fim de {p.loan!.until}{p.loan!.opt ? ` · opção de compra ${formatMoney(p.loan!.opt)}` : ""}</span>
        </div>
      )}
      {!mine && !ownedOut && p.loan && club && (
        <div className="banner">📤 Emprestado pelo {parent?.name ?? "?"} ao {club.name} até {loanUntilLabel(p)}. Não pode ser negociado agora.</div>
      )}
      {mine && p.wantsOut && <div className="banner red">😤 {pendingRequest(w, p) === "bigger" ? `Depois de ${p.hm} meses em alta, quer um clube maior` : "Quer ser negociado"} — converse, prometa minutos ou venda.</div>}
      {mine && pendingRequest(w, p) === "raise" && (
        <div className="banner blue row gap8">
          <span className="grow">📝 Em grande fase, quer ser valorizado: renove com aumento antes que outros clubes apareçam.</span>
          <button className="btn sm primary" onClick={() => setSheet("renew")}>Renovar</button>
        </div>
      )}

      {legend && (
        <div className="card" style={{ borderColor: "#8a6a00" }}>
          <b>⭐ {legend.full}</b>
          <div className="small muted">{legend.era}</div>
          <p className="small" style={{ marginBottom: 0 }}>{legend.bio} Potencial de lenda: pode chegar a {legend.ovr} de overall.</p>
        </div>
      )}

      <div className="grid3">
        <div className="stat-box"><b style={{ fontSize: 14 }}>{formatMoney(value)}</b><span>valor</span></div>
        <div className="stat-box"><b style={{ fontSize: 14 }}>{p.clubId ? formatMoney(p.wage) : "-"}</b><span>salário/mês</span></div>
        <div className="stat-box"><b>{p.clubId ? p.contractEnd : "-"}</b><span>contrato até</span></div>
      </div>
      {p.clubId && (
        <div className="card flat small" style={{ padding: "8px 12px" }}>
          <div className="muted">
          {loanedIn ? `Contrato com o ${parent?.name ?? "clube de origem"} · você paga ${Math.round((p.loan!.wagePct) * 100)}% do salário` : clause > 0 ? <>Multa rescisória: <b>{formatMoney(clause)}</b></> : "Sem multa rescisória"}
          {p.goalBonus && mine ? ` · bônus de ${formatMoney(p.goalBonus)} por gol` : ""}
          </div>
          {mine && <div className="mt4">{roleLine(w, p)}{p.promise ? " · ⏱️ promessa ativa" : ""}</div>}
        </div>
      )}

      <div className="card">
        <h3>Atributos</h3>
        <div className="col gap8 mt8">
          {attrKeys.map((k) => (
            <div key={k} className="attr">
              <span className="muted">{ATTR_NAMES[k]}</span>
              <Bar v={p.attrs[k]} color={p.attrs[k] >= 80 ? "var(--accent)" : p.attrs[k] >= 65 ? "#b9e66d" : p.attrs[k] >= 50 ? "var(--warn)" : "var(--danger)"} />
              <b className="kbd" style={{ textAlign: "right" }}>{p.attrs[k]}</b>
            </div>
          ))}
        </div>
        <div className="row gap8 wrap mt12 small">
          <span className="muted">Rende melhor como:</span>
          {best.map((b) => <span key={b.pos} className="tag">{b.pos} {b.v}</span>)}
        </div>
        <div className="row gap12 mt12 small">
          <span>Condição <b>{Math.round(p.cond)}%</b></span>
          <span>Moral <b>{p.morale >= 75 ? "😄" : p.morale >= 50 ? "🙂" : p.morale >= 30 ? "😐" : "😞"}</b></span>
          {p.injury > 0 && <span className="tag danger">🚑 {p.injuryName} ({p.injury} dias)</span>}
          {Object.entries(p.bans).filter(([, n]) => n > 0).map(([c, n]) => <span key={c} className="tag danger">Suspenso: {COMP_META[c]?.short} ({n})</span>)}
        </div>
      </div>

      <FormCard w={w} p={p} mine={mine} />
      <RolesCard w={w} p={p} mine={mine} />

      <PlayerInsightCards p={p} />

      <div className="card">
        <h3>Temporada {w.season}</h3>
        <div className="grid3 mt8">
          <div className="stat-box"><b>{p.stats.apps}</b><span>jogos</span></div>
          <div className="stat-box"><b>{p.stats.goals}</b><span>gols</span></div>
          <div className="stat-box"><b>{p.stats.assists}</b><span>assist.</span></div>
          <div className="stat-box"><b>{avgRating}</b><span>nota média</span></div>
          <div className="stat-box"><b>{p.stats.motm}</b><span>craque do jogo</span></div>
          <div className="stat-box"><b>{p.pos === "GOL" ? p.stats.cs : p.stats.yel}</b><span>{p.pos === "GOL" ? "sem sofrer gol" : "amarelos"}</span></div>
        </div>
        {p.form.length > 0 && <div className="small muted mt8">Últimas notas: {p.form.map((f) => f.toFixed(1)).join(" · ")}</div>}
      </div>

      {(p.caps ?? 0) > 0 && (
        <div className="card row gap8" onClick={() => push({ name: "nt", id: `nt-${p.nat}` })}>
          <span style={{ fontSize: 20 }}>{flag(p.nat)}</span>
          <span className="grow">Seleção: <b>{p.caps}</b> jogo{p.caps === 1 ? "" : "s"} · <b>{p.intGoals ?? 0}</b> gol{p.intGoals === 1 ? "" : "s"}</span>
          {p.away && <span className="tiny muted">convocado</span>}
        </div>
      )}
      {p.history.length > 0 && (
        <div className="card">
          <h3>Carreira</h3>
          <table className="tbl mt8">
            <thead><tr><th>Ano</th><th style={{ textAlign: "left" }}>Clube</th><th>J</th><th>G</th><th>A</th><th>Nota</th><th>OVR</th></tr></thead>
            <tbody>
              {p.history.slice().reverse().map((h, i) => (
                <tr key={i}>
                  <td>{h.season}</td>
                  <td className="team">{w.clubs[h.clubId]?.name ?? h.clubId}</td>
                  <td>{h.apps}</td><td>{h.goals}</td><td>{h.assists}</td><td>{h.rating.toFixed(1)}</td><td>{h.ovr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="col gap8">
        {loanedIn ? (
          <>
            {p.loan!.opt
              ? <button className="btn primary block" onClick={() => setSheet("option")}>💰 Exercer opção ({formatMoney(p.loan!.opt)})</button>
              : <button className="btn primary block" onClick={() => setSheet("offer")}>💼 Comprar em definitivo</button>}
            <div className="grid2">
              <button className="btn" onClick={() => setSheet("talk")}>💬 Conversar</button>
              <button className="btn" onClick={() => { update((x) => { endLoanNow(x, p); }); autosave(); toast(`${p.name} devolvido ao ${parent?.name ?? "clube"}`); back(); }}>↩️ Devolver</button>
            </div>
          </>
        ) : ownedOut ? (
          <button className="btn block" onClick={() => setSheet("renew")}>📝 Renovar contrato</button>
        ) : mine ? (
          <>
            <button className="btn block" onClick={() => setSheet("renew")}>📝 Renovar contrato</button>
            <div className="grid2">
              <button className="btn" onClick={() => setSheet("talk")}>💬 Conversar</button>
              <button className="btn" onClick={() => setSheet("train")}>🎯 Treino individual</button>
            </div>
            <button className="btn block" onClick={() => setSheet("act")}>⚡ Interação rápida</button>
            <div className="grid2">
              <button className="btn" onClick={() => { update(() => { p.listed = !p.listed; }); toast(p.listed ? "Colocado na lista de transferências" : "Retirado da lista"); autosave(); }}>
                {p.listed ? "Tirar da venda" : "💲 Colocar à venda"}
              </button>
              {p.youth ? (
                <button className="btn" onClick={() => { update(() => { p.youth = false; }); toast(`${p.name} promovido ao profissional!`); autosave(); }}>⬆️ Promover</button>
              ) : ageY <= 20 ? (
                <button className="btn" onClick={() => { update(() => { p.youth = true; if (club?.lineup) { club.lineup.starters = club.lineup.starters.map((x) => (x === p.id ? null : x)); club.lineup.bench = club.lineup.bench.filter((x) => x !== p.id); } }); autosave(); }}>⬇️ Mandar à base</button>
              ) : (
                <button className="btn danger" onClick={() => setSheet("release")}>Dispensar</button>
              )}
            </div>
            <button className="btn block" onClick={() => setSheet("loanOut")}>📤 Emprestar</button>
          </>
        ) : (
          <>
            <div className="grid2">
              <button className="btn primary" disabled={!!p.loan} onClick={() => setSheet("offer")}>{p.clubId ? "💼 Fazer proposta" : "✍️ Contratar"}</button>
              <button className="btn" onClick={() => update((x) => { x.shortlist = shortlisted ? x.shortlist.filter((s) => s !== p.id) : [...x.shortlist, p.id]; })}>
                {shortlisted ? "★ Observando" : "☆ Observar"}
              </button>
            </div>
            {canAskLoan(w, p) && <button className="btn block" onClick={() => setSheet("loanIn")}>📥 Pedir emprestado</button>}
          </>
        )}
        {!mine && !ownedOut && <ScoutButton p={p} />}
        <div className="grid2">
          <button className="btn sm" onClick={() => setSheet("photo")}>📷 Trocar foto</button>
          <button className="btn sm" onClick={() => setSheet("edit")}>{w.admin?.on ? "🛠️ Editor completo" : "✏️ Editar jogador"}</button>
        </div>
      </div>
      <div style={{ height: 30 }} />

      {sheet === "offer" && <OfferSheet w={w} p={p} onClose={() => setSheet(null)} />}
      {sheet === "renew" && <NegotiationSheet p={p} mode="renew" onClose={() => setSheet(null)} />}
      {sheet === "talk" && <TalkSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "loanOut" && <LoanOutSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "loanIn" && <LoanInSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "option" && p.loan?.opt && (
        <Sheet title={`Comprar ${p.name}`} onClose={() => setSheet(null)}>
          <p className="small">Exercer a opção de compra: você paga <b>{formatMoney(p.loan.opt)}</b> ao {parent?.name} e ele assina com você por 3 anos.</p>
          <button className="btn primary block" onClick={() => {
            let err: string | null = null;
            update((x) => { err = exerciseOption(x, p); });
            if (err) { toast(err); return; }
            autosave(); setSheet(null); toast(`💰 ${p.name} agora é seu!`);
          }}>💰 Exercer opção</button>
        </Sheet>
      )}
      {sheet === "photo" && <PhotoSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "edit" && (w.admin?.on ? <AdminPlayerEditor p={p} onClose={() => setSheet(null)} /> : <EditSheet p={p} onClose={() => setSheet(null)} />)}
      {sheet === "act" && <InteractionSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "train" && <IndividualTrainingSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "release" && (
        <Sheet title={`Dispensar ${p.name}?`} onClose={() => setSheet(null)}>
          <p className="small">O clube paga metade dos salários restantes do contrato como rescisão (aprox. {formatMoney(Math.round(p.wage * Math.max(1, (p.contractEnd - w.season) * 12 + (12 - Math.floor(w.day / 30))) * 0.5))}).</p>
          <button className="btn danger block" onClick={() => { update((x) => releasePlayer(x, p, true)); autosave(); setSheet(null); back(); toast("Jogador dispensado."); }}>Confirmar dispensa</button>
        </Sheet>
      )}
    </div>
  );
}

function OfferSheet({ w, p, onClose }: { w: World; p: Player; onClose: () => void }) {
  const user = w.clubs[w.userClubId];
  const free = !p.clubId;
  const ask = free ? 0 : askingPrice(w, p);
  const [fee, setFee] = useState(free ? 0 : roundMoney(ask * 0.9));
  const [resp, setResp] = useState<OfferResponse | null>(free ? { status: "accepted", message: "Jogador livre: basta acertar o salário." } : null);
  const [neg, setNeg] = useState(false);
  const willing = playerWillingness(w, p, user);
  const windowOpen = userWindowOpen(w);
  const clause = p.loan ? 0 : peekClause(w, p);

  function propose(value = fee) {
    if (!canAfford(user, value, w)) { toast("Dinheiro insuficiente."); return; }
    let r: OfferResponse = { status: "rejected", message: "" };
    // evaluateUserBid usa o gerador do mundo
    update((x) => { r = withWorldRng(x, () => evaluateUserBid(x, p, value)); });
    setFee(value);
    setResp(r);
    if (r.status === "countered" && r.counter) setFee(r.counter);
  }

  function next() {
    if (!willing.ok) { toast(willing.reason ?? "O jogador recusou."); return; }
    if (!canAfford(user, fee, w)) { toast("Dinheiro insuficiente."); return; }
    setNeg(true);
  }

  if (neg) return <NegotiationSheet p={p} mode="sign" fee={fee} onClose={onClose} />;

  return (
    <Sheet title={free ? `Contratar ${p.name}` : `Proposta por ${p.name}`} onClose={onClose}>
      {!free && !windowOpen && <div className="card flat small" style={{ borderColor: "var(--warn)" }}>A janela está fechada. Só dá para contratar jogadores livres agora (janelas: até 31/mar e de 1/jul a 31/ago).</div>}
      {!willing.ok && <div className="card flat small" style={{ borderColor: "var(--danger)" }}>{willing.reason}</div>}
      {!free && (
        <>
          <div className="row small muted"><span>Valor de mercado: {formatMoney(playerValue(p, w.season))}</span><span className="right">Seu saldo: {formatMoney(user.balance)}</span></div>
          <div className="row mt12" style={{ justifyContent: "center", gap: 6 }}>
            <button className="btn sm" onClick={() => setFee((f) => roundMoney(Math.max(0, f * 0.9)))}>−10%</button>
            <b style={{ fontSize: 22, minWidth: 150, textAlign: "center" }}>{formatMoney(fee)}</b>
            <button className="btn sm" onClick={() => setFee((f) => roundMoney(f * 1.1 + 50_000))}>+10%</button>
          </div>
          <button className="btn block mt12" disabled={!windowOpen} onClick={() => propose()}>Enviar proposta</button>
          {clause > 0 && windowOpen && resp?.status !== "accepted" && (
            <button className="btn gold block mt8" onClick={() => propose(clause)}>💥 Pagar a multa ({formatMoney(clause)})</button>
          )}
        </>
      )}
      {resp && (
        <div className="card flat mt12" style={{ borderColor: resp.status === "accepted" ? "var(--accent)" : resp.status === "countered" ? "var(--warn)" : "var(--danger)" }}>
          <div className="small">{resp.message}</div>
        </div>
      )}
      {resp?.status === "accepted" && willing.ok && (
        <button className="btn primary block mt12" onClick={next}>✍️ Acertar o contrato {fee ? `(${formatMoney(fee)})` : ""}</button>
      )}
    </Sheet>
  );
}

/** Reduz a imagem escolhida para 200x200 (JPEG) para não pesar o save. */
export function resizeImage(file: File, size = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d")!;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function PhotoSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const [url, setUrl] = useState(p.photo?.startsWith("http") ? p.photo : "");
  return (
    <Sheet title="Foto do jogador" onClose={onClose}>
      <p className="small muted">Escolha uma foto do seu celular ou cole um link de imagem. A foto fica salva só no seu jogo.</p>
      <label className="btn block">
        📁 Escolher imagem do aparelho
        <input type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const data = await resizeImage(f);
          update(() => { p.photo = data; });
          autosave(); onClose();
        }} />
      </label>
      <div className="row mt12">
        <input className="text" placeholder="https://…/foto.jpg" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn" onClick={() => { update(() => { p.photo = url.trim() || undefined; }); autosave(); onClose(); }}>OK</button>
      </div>
      {p.photo && <button className="btn danger block mt12" onClick={() => { update(() => { p.photo = undefined; }); autosave(); onClose(); }}>Voltar ao rosto gerado</button>}
    </Sheet>
  );
}

function EditSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const [name, setName] = useState(p.name);
  const [ovr, setOvr] = useState(p.ovr);
  const [pot, setPot] = useState(p.pot);
  const [pos, setPos] = useState(p.pos);
  return (
    <Sheet title="Editar jogador" onClose={onClose}>
      <label className="field">Nome
        <input className="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <div className="grid2 mt12">
        <label className="field">Overall ({ovr})
          <input type="range" min={30} max={99} value={ovr} onChange={(e) => setOvr(Number(e.target.value))} />
        </label>
        <label className="field">Potencial ({Math.max(pot, ovr)})
          <input type="range" min={30} max={99} value={Math.max(pot, ovr)} onChange={(e) => setPot(Number(e.target.value))} />
        </label>
      </div>
      <label className="field mt12">Posição
        <select className="text" value={pos} onChange={(e) => setPos(e.target.value as Player["pos"])}>
          {POSITIONS.map((x) => <option key={x} value={x}>{x} — {POS_NAME[x]}</option>)}
        </select>
      </label>
      <button className="btn primary block mt12" onClick={() => {
        update(() => {
          if (name.trim()) p.name = name.trim();
          const changed = pos !== p.pos || ovr !== p.ovr;
          if (pos !== p.pos) { p.sec = p.sec.filter((x) => x !== pos); p.pos = pos; }
          if (changed) fitAttrs(p.attrs, p.pos, ovr);
          recalcOvr(p);
          p.pot = Math.max(pot, p.ovr);
        });
        autosave(); onClose();
      }}>Salvar</button>
    </Sheet>
  );
}

/** Linha discreta com o autor e a licença da foto (exigência das licenças livres). */
function PhotoCredit({ p }: { p: Player }) {
  const [credit, setCredit] = useState<Credit | null>(null);
  const real = !p.photo && p.img && !p.img.startsWith("r") ? p.img : null;
  useEffect(() => {
    if (!real) return;
    let alive = true;
    loadCredits().then((c) => { if (alive) setCredit(c[`players/${real}.webp`] ?? null); });
    return () => { alive = false; };
  }, [real]);
  if (!p.photo && p.ext) return <div className="tiny mt8" style={{ opacity: 0.7 }}>📷 Foto: TheSportsDB.com</div>;
  if (!p.photo && p.img && /^[os]\d/.test(p.img)) return <div className="tiny mt8" style={{ opacity: 0.7 }}>📷 Foto: {p.img.startsWith("s") ? "São Paulo FC" : "ogol.com.br"}</div>;
  if (!p.photo && p.img?.startsWith("r")) return <div className="tiny mt8" style={{ opacity: 0.7 }}>Rosto gerado por IA (pessoa que não existe).</div>;
  if (!real || !credit) return null;
  return (
    <div className="tiny mt8" style={{ opacity: 0.7 }}>
      📷 {p.legend ? "Foto do jogador original · " : ""}{credit.author || "Wikimedia Commons"} · {credit.license}
    </div>
  );
}

/** Folha de ações rápidas: elogiar, criticar, prometer minutos, conversar sobre a fase. */
function InteractionSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const w = useWorld();
  const [res, setRes] = useState<InteractionResult | null>(null);
  const opts = interactionOptions(w, p);
  function go(id: InteractionId) {
    let r: InteractionResult | null = null;
    update((x) => { const px = x.players[p.id]; if (px) r = withWorldRng(x, () => interact(x, px, id)); });
    const got = r as InteractionResult | null;
    if (!got) return;
    if (!got.ok) { toast(got.text); return; }
    setRes(got);
    autosave();
  }
  return (
    <Sheet title={`Falar com ${p.name.split(" ")[0]}`} onClose={onClose}>
      {res ? (
        <div className="act-result">
          <div className="big">{res.reaction}</div>
          <p>{res.text}</p>
          <div className="small muted">Moral {res.delta > 0 ? `+${res.delta}` : res.delta} · agora {p.morale}</div>
          <button className="btn primary block mt8" onClick={onClose}>Fechar</button>
        </div>
      ) : (
        <>
          <div className="small muted" style={{ marginBottom: 10 }}>Moral atual: {p.morale}. A reação depende da personalidade e da fase.</div>
          <div className="act-grid">
            {opts.map((o) => (
              <button key={o.id} className="act-btn" disabled={!!o.disabled} onClick={() => go(o.id)}>
                <span className="e">{o.emoji}</span>
                <b className="small">{o.label}</b>
                <small>{o.disabled ?? o.hint}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Fase: últimas 5 notas, moral, seta de evolução, sequência e selos (ídolo, propenso a lesões). */
function FormCard({ w, p, mine }: { w: World; p: Player; mine: boolean }) {
  const res = formResidual(p, 5);
  const streak = streakOf(p);
  const exp = expectedRating(p);
  const awards = awardsOf(w, p.id);
  return (
    <div className="card">
      <div className="row"><h3 className="grow">Fase</h3><TrendArrow p={p} label /></div>
      <div className="row gap8 mt8" style={{ justifyContent: "space-between" }}>
        <FormDots p={p} size={30} />
        <span className="tiny muted" style={{ textAlign: "right" }}>esperado<br /><b style={{ color: "var(--text)" }}>{exp.toFixed(1)}</b></span>
      </div>
      <div className="attr mt12">
        <span className="muted">Moral</span>
        <Bar v={p.morale} />
        <b className="kbd" style={{ textAlign: "right" }}>{Math.round(p.morale)}</b>
      </div>
      <div className="row gap8 wrap mt8 small">
        {streak === "hot" && <span className="tag good">🔥 Em alta: confiança lá em cima</span>}
        {streak === "cold" && <span className="tag danger">🧊 Em baixa: precisa de confiança</span>}
        {!streak && p.form.length >= 3 && <span className="tag">{res >= 0.25 ? "Acima do esperado" : res <= -0.25 ? "Abaixo do esperado" : "Dentro do esperado"}</span>}
        {p.fav && <span className="tag legend">❤️ Ídolo da torcida</span>}
        {injuryProne(p) && <span className="tag danger">🩹 Propenso a lesões</span>}
        {(p.hm ?? 0) >= 2 && mine && <span className="tag good">📈 {p.hm} meses em alta</span>}
      </div>
      {awards.length > 0 && (
        <div className="row gap8 wrap mt8 small">
          {awards.map((a) => <span key={`${a.season}-${a.kind}`} className="tag legend" title={`${a.label} (${a.season})`}>{a.emoji} {a.label} {a.season}</span>)}
        </div>
      )}
      <div className="tiny muted mt8">Boas notas com minutos aceleram a evolução (principalmente dos jovens) e podem até subir o potencial; banco e notas ruins travam.{p.form.length === 0 ? ` ${age(p, w.season) <= 21 ? "Ainda sem jogos nesta fase." : ""}` : ""}</div>
    </div>
  );
}

/** Aptidão por função tática (estrelas) e entrosamento com os parceiros. */
function RolesCard({ w, p, mine }: { w: World; p: Player; mine: boolean }) {
  const club = p.clubId ? w.clubs[p.clubId] : null;
  const poss = [p.pos, ...p.sec];
  const seen = new Set<string>();
  const rows = poss.flatMap((pos) => rolesFor(pos).filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => ({ r, pos, s: roleStars(p, r, pos) })))
    .sort((a, b) => b.s - a.s).slice(0, 5);
  const partners = mine && club && !p.youth ? bestPartners(w, club, p) : [];
  if (!rows.length && !partners.length) return null;
  return (
    <div className="card">
      <h3>Funções táticas</h3>
      <div className="col gap4 mt8">
        {rows.map(({ r, pos, s }) => (
          <div key={r.id} className="row gap8 small" title={r.desc}>
            <PosBadge pos={pos} />
            <span className="grow ellipsis">{r.label}</span>
            <Stars n={s} half />
          </div>
        ))}
      </div>
      {partners.length > 0 && (
        <>
          <div className="small muted mt12">🤝 Mais entrosado com</div>
          <div className="row gap8 wrap mt4">
            {partners.map(({ p: q, v }) => (
              <span key={q.id} className="tag" style={{ cursor: "pointer", borderColor: v >= 70 ? "var(--accent)" : undefined }} onClick={() => push({ name: "player", id: q.id })}>
                {q.name.split(" ").slice(-1)[0]} · {v}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
