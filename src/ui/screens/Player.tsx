import { useState } from "react";
import { LEGEND_BY_ID, TIER_NAMES } from "../../data/legends";
import { inWindow } from "../../engine/calendar";
import { COMP_META } from "../../engine/competitions";
import { formatMoney } from "../../engine/finance";
import { addNews } from "../../engine/news";
import { age, fitAttrs, playerValue, roundMoney, wageFor } from "../../engine/player";
import { ATTR_NAMES, POS_NAME, ovrAt, POSITIONS, recalcOvr } from "../../engine/positions";
import { askingPrice, canAfford, completeTransfer, evaluateUserBid, playerWillingness, releasePlayer, wageDemand, type OfferResponse } from "../../engine/transfers";
import type { Attrs, Player, World } from "../../engine/types";
import { back, push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Avatar, Bar, Crest, Flag, Ovr, PosBadge, Sheet } from "../components";
import { COUNTRY_NAME } from "../flags";
import { potLabel } from "./Squad";

export function PlayerScreen({ id }: { id: number }) {
  const w = useWorld();
  const p = w.players[id];
  const [sheet, setSheet] = useState<null | "offer" | "renew" | "photo" | "release" | "edit">(null);
  if (!p) return <div className="page"><div className="empty">Este jogador se aposentou ou não existe mais.</div></div>;
  const club = p.clubId ? w.clubs[p.clubId] : null;
  const mine = p.clubId === w.userClubId;
  const legend = p.legend ? LEGEND_BY_ID[p.legend] : null;
  const ageY = age(p, w.season);
  const value = playerValue(p, w.season);
  const shortlisted = w.shortlist.includes(p.id);
  const attrKeys: (keyof Attrs)[] = p.pos === "GOL" ? ["gol", "fis", "vel", "pas"] : ["vel", "fin", "pas", "dri", "def", "fis"];
  const best = POSITIONS.map((pos) => ({ pos, v: ovrAt(p, pos) })).sort((a, b) => b.v - a.v).slice(0, 4);
  const avgRating = p.stats.apps ? (p.stats.ratingSum / p.stats.apps).toFixed(2) : "-";

  return (
    <div className="page">
      <div className="hero" style={{ background: `linear-gradient(135deg, ${club?.colors[0] ?? "#334"} , ${club?.colors[1] ?? "#556"})` }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <Avatar p={p} club={club} season={w.season} size={96} />
          <div className="grow">
            {legend && <span className="tag legend">★ Lenda {TIER_NAMES[legend.tier]}</span>}
            <h2 style={{ fontSize: 22, marginTop: 4 }}>{p.name}</h2>
            <div className="small" style={{ opacity: 0.9 }}>
              <Flag code={p.nat} /> {COUNTRY_NAME[p.nat] ?? p.nat} · {ageY} anos · {p.height} cm · pé {p.foot === "E" ? "esquerdo" : p.foot === "A" ? "ambos" : "direito"}
            </div>
            <div className="row gap8 mt8">
              <PosBadge pos={p.pos} /> {p.sec.map((s) => <PosBadge key={s} pos={s} />)}
              <span className="small">{POS_NAME[p.pos]}</span>
            </div>
          </div>
          <div className="col center" style={{ alignItems: "center" }}>
            <Ovr v={p.ovr} lg />
            <span className="tiny" style={{ opacity: 0.85 }}>pot. {potLabel(p)}</span>
          </div>
        </div>
        {club && (
          <div className="row mt12 small" style={{ cursor: "pointer" }} onClick={() => push({ name: "club", id: club.id })}>
            <Crest club={club} size={20} /> <b>{club.name}</b>{p.youth && <span className="tag">base</span>}{p.shirt && <span>· camisa {p.shirt}</span>}
          </div>
        )}
        {!club && <div className="mt12 small">Sem clube (jogador livre)</div>}
      </div>

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
        {mine ? (
          <>
            <button className="btn block" onClick={() => setSheet("renew")}>📝 Renovar contrato</button>
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
          </>
        ) : (
          <div className="grid2">
            <button className="btn primary" onClick={() => setSheet("offer")}>{p.clubId ? "💼 Fazer proposta" : "✍️ Contratar"}</button>
            <button className="btn" onClick={() => update((x) => { x.shortlist = shortlisted ? x.shortlist.filter((s) => s !== p.id) : [...x.shortlist, p.id]; })}>
              {shortlisted ? "★ Observando" : "☆ Observar"}
            </button>
          </div>
        )}
        <div className="grid2">
          <button className="btn sm" onClick={() => setSheet("photo")}>📷 Trocar foto</button>
          <button className="btn sm" onClick={() => setSheet("edit")}>✏️ Editar jogador</button>
        </div>
      </div>
      <div style={{ height: 30 }} />

      {sheet === "offer" && <OfferSheet w={w} p={p} onClose={() => setSheet(null)} />}
      {sheet === "renew" && <RenewSheet w={w} p={p} onClose={() => setSheet(null)} />}
      {sheet === "photo" && <PhotoSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "edit" && <EditSheet p={p} onClose={() => setSheet(null)} />}
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
  const [years, setYears] = useState(3);
  const willing = playerWillingness(w, p, user);
  const demand = wageDemand(w, p, user);
  const windowOpen = inWindow(w.day);

  function propose() {
    if (!canAfford(user, fee)) { toast("Dinheiro insuficiente."); return; }
    const r = evaluateUserBid(w, p, fee);
    setResp(r);
    if (r.status === "countered" && r.counter) setFee(r.counter);
  }

  function sign() {
    if (!willing.ok) { toast(willing.reason ?? "O jogador recusou."); return; }
    if (!canAfford(user, fee)) { toast("Dinheiro insuficiente."); return; }
    const from = p.clubId ? w.clubs[p.clubId].name : null;
    update((x) => {
      completeTransfer(x, p, user, fee, demand, years);
      addNews(x, "transfer", `${p.name} é o novo reforço do ${user.name}!`, from ? `Contratado do ${from} por ${formatMoney(fee)}. Salário de ${formatMoney(demand)}/mês até ${x.season + years}.` : `Chegou sem custo de transferência. Salário de ${formatMoney(demand)}/mês.`, { pid: p.id });
    });
    autosave();
    toast(`${p.name} contratado!`);
    onClose();
  }

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
          <button className="btn block mt12" disabled={!windowOpen} onClick={propose}>Enviar proposta</button>
        </>
      )}
      {resp && (
        <div className="card flat mt12" style={{ borderColor: resp.status === "accepted" ? "var(--accent)" : resp.status === "countered" ? "var(--warn)" : "var(--danger)" }}>
          <div className="small">{resp.message}</div>
        </div>
      )}
      {resp?.status === "accepted" && willing.ok && (
        <div className="col gap8 mt12">
          <div className="small">Salário pedido: <b>{formatMoney(demand)}/mês</b> {demand > wageFor(p.ovr, user.rep) * 1.2 ? "(acima da média do seu clube)" : ""}</div>
          <div className="row gap8 small wrap">
            <span>Contrato:</span>
            {[1, 2, 3, 4, 5].map((y) => <button key={y} className={`chip${years === y ? " active" : ""}`} onClick={() => setYears(y)}>{y} {y === 1 ? "ano" : "anos"}</button>)}
          </div>
          <button className="btn primary block" onClick={sign}>Fechar contratação {fee ? `(${formatMoney(fee)})` : ""}</button>
        </div>
      )}
    </Sheet>
  );
}

function RenewSheet({ w, p, onClose }: { w: World; p: Player; onClose: () => void }) {
  const club = w.clubs[w.userClubId];
  const demand = roundMoney(Math.max(p.wage * 1.05, wageFor(p.ovr, club.rep, age(p, w.season)) * (p.morale < 40 ? 1.2 : 1)));
  const [years, setYears] = useState(3);
  const wantsOut = p.ovr >= club.level + 12 && age(p, w.season) < 29 && p.morale < 55;
  return (
    <Sheet title={`Renovar com ${p.name}`} onClose={onClose}>
      {wantsOut ? (
        <p className="small">{p.name} quer jogar num clube maior e não aceita renovar agora. Melhore os resultados (e a moral dele) e tente de novo.</p>
      ) : (
        <>
          <p className="small">Salário atual: {formatMoney(p.wage)}/mês · pedido: <b>{formatMoney(demand)}/mês</b></p>
          <div className="row gap8 small wrap">
            {[1, 2, 3, 4, 5].map((y) => <button key={y} className={`chip${years === y ? " active" : ""}`} onClick={() => setYears(y)}>{y} {y === 1 ? "ano" : "anos"}</button>)}
          </div>
          <button className="btn primary block mt12" onClick={() => {
            update(() => { p.wage = demand; p.contractEnd = w.season + years; p.morale = Math.min(100, p.morale + 8); });
            autosave(); toast("Contrato renovado!"); onClose();
          }}>Renovar até {w.season + years}</button>
        </>
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
