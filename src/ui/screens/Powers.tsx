// Loja de Poderes: compra com o dinheiro do clube, equipa num jogador (vale a temporada inteira).
import { useState } from "react";
import { formatMoney } from "../../engine/finance";
import { activePowers, buyPower, canEquip, POWER_SLOTS, POWERS, powerDef, removePower, type PowerDef } from "../../engine/powers";
import type { Player } from "../../engine/types";
import { toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { haptic } from "../haptics";
import "../uniforms.css";

export function PowersScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const owned = activePowers(w, c);
  const [pick, setPick] = useState<PowerDef | null>(null);
  const squad = c.players.map((id) => w.players[id]).filter((p): p is Player => !!p).sort((a, b) => b.ovr - a.ovr);
  const free = POWER_SLOTS - owned.length;

  const buy = (def: PowerDef, pid: number) => {
    let res = { ok: false, msg: "" };
    update((x) => { res = buyPower(x, x.clubs[x.userClubId], def.id, pid); });
    toast(res.msg);
    if (res.ok) {
      haptic("success");
      autosave();
      setPick(null);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <h3>Loja de Poderes</h3>
        <div className="small muted">
          Poderes especiais para os seus craques, estilo fliperama. Cada um vale a temporada inteira e enche um medidor durante o jogo:
          cheio, aparece o botão para ATIVAR na hora certa. O efeito é real, mas moderado.
        </div>
        <div className="row mt8 small"><b className="grow">Vagas: {owned.length}/{POWER_SLOTS}</b><span>Saldo: <b>{formatMoney(c.balance)}</b></span></div>
      </div>

      {owned.length > 0 && (
        <div className="card">
          <h3>Equipados em {w.season}</h3>
          {owned.map((o) => {
            const d = powerDef(o.id)!;
            const p = w.players[o.pid];
            return (
              <div key={o.pid} className="row gap8 mt8">
                <span style={{ fontSize: 22 }} aria-hidden="true">{d.emoji}</span>
                <div className="grow"><b>{d.name}</b><div className="tiny muted">{p?.name}</div></div>
                <button className="btn sm" onClick={() => { update((x) => removePower(x, x.clubs[x.userClubId], o.pid)); autosave(); }}>Tirar</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="col gap8">
        {POWERS.map((d) => (
          <div key={d.id} className="card">
            <div className="row gap8">
              <span style={{ fontSize: 30 }} aria-hidden="true">{d.emoji}</span>
              <div className="grow">
                <b>{d.name}</b>{d.gk && <span className="tiny muted"> · goleiro</span>}
                <div className="small muted">{d.desc}</div>
              </div>
            </div>
            <div className="row mt8">
              <span className="grow small">{formatMoney(d.price)} <span className="muted">por temporada</span></span>
              <button className="btn sm primary" disabled={free <= 0 || c.balance < d.price} onClick={() => setPick(pick?.id === d.id ? null : d)}>
                {free <= 0 ? "Sem vagas" : c.balance < d.price ? "Sem saldo" : pick?.id === d.id ? "Fechar" : "Comprar"}
              </button>
            </div>
            {pick?.id === d.id && (
              <div className="col gap4 mt8" role="list" aria-label={`Escolha quem recebe ${d.name}`}>
                {squad.filter((p) => canEquip(p, d) && !owned.some((o) => o.pid === p.id)).slice(0, 12).map((p) => (
                  <button key={p.id} role="listitem" className="btn sm" style={{ justifyContent: "space-between" }} onClick={() => buy(d, p.id)}>
                    <span>{p.name}</span><span className="muted">{p.pos} · {p.ovr}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
