// Vestiário: entrosamento, líderes, papéis e minutos, conversas e emprestados.
import { useState } from "react";
import { withWorldRng } from "../../engine/common";
import { ROLE_LABEL, ROLE_LIST, ROLE_SHARE, ROLE_SHORT, roleOf } from "../../engine/contracts";
import { chemOf, dynDelta, leadersOf, moodEmoji, moraleDelta, shareOf, squadMood, talkOptions, talkTo, talkWait, unhappyCount, type TalkId, type TalkResult } from "../../engine/dressing";
import { squadOf } from "../../engine/lineup";
import { loanStats } from "../../engine/loans";
import type { Player, SquadRole } from "../../engine/types";
import { push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Avatar, DeltaTag, Icon, Ovr, Sheet } from "../components";
import "../market.css";

export function DressingScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const chem = Math.round(chemOf(w, club));
  const mood = Math.round(squadMood(w, club));
  const leaders = leadersOf(w, club);
  const squad = squadOf(w, club).sort((a, b) => {
    const pa = (a.wantsOut ? 2 : 0) + ((a.unhappy ?? 0) >= 2 ? 1 : 0);
    const pb = (b.wantsOut ? 2 : 0) + ((b.unhappy ?? 0) >= 2 ? 1 : 0);
    return pb - pa || b.ovr - a.ovr;
  });
  const loaned = (club.loanedOut ?? []).map((id) => w.players[id]).filter((p): p is Player => !!p?.loan);
  const [talk, setTalk] = useState<Player | null>(null);
  const chemColor = chem >= 65 ? "var(--accent)" : chem >= 50 ? "var(--warn)" : "var(--danger)";
  const moodColor = mood >= 65 ? "var(--accent)" : mood >= 45 ? "var(--warn)" : "var(--danger)";

  return (
    <div className="page k-dressing-page">
      <div className="k-dressing-grid">
        <aside className="k-dressing-aside">
          <div className="card">
            <div className="row" style={{ alignItems: "center" }}>
              <b className="grow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="handshake" size={16} /> Entrosamento {chem}%<DeltaTag d={dynDelta(w, "chem", chem)} />
              </b>
            </div>
            <div className="agent-bar"><i style={{ width: `${chem}%`, background: chemColor }} /></div>
            <div className="row mt8" style={{ alignItems: "center" }}>
              <b className="grow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="users" size={16} /> Clima do Grupo {mood}<DeltaTag d={dynDelta(w, "mood", mood)} />
              </b>
            </div>
            <div className="agent-bar"><i style={{ width: `${mood}%`, background: moodColor }} /></div>
            <div className="tiny muted mt8">
              A mesma base jogando junta sobe o entrosamento. Clima = média da moral dos atletas.
            </div>
          </div>

          {leaders.length > 0 && (
            <div className="card">
              <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="compass" size={16} /> Líderes do Vestiário
              </h3>
              <div className="leaders mt6">
                {leaders.map((p) => (
                  <div key={p.id} className="tap" onClick={() => push({ name: "player", id: p.id })}>
                    <Avatar p={p} club={club} season={w.season} size={40} />
                    <b className="tiny ellipsis" style={{ maxWidth: "100%" }}>{p.name.split(" ").slice(-1)[0]}</b>
                    <span style={{ fontSize: 16 }}>{moodEmoji(p)}</span>
                  </div>
                ))}
              </div>
              <div className="tiny muted mt6">Líderes insatisfeitos abalam todo o elenco.</div>
            </div>
          )}

          <div className="card">
            <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="swap" size={16} /> Emprestados ({loaned.length})
            </h3>
            {!loaned.length && <div className="tiny muted mt4">Nenhum jogador emprestado. Use "Emprestar" no perfil do jogador.</div>}
            {loaned.map((p) => {
              const c = p.clubId ? w.clubs[p.clubId] : null;
              const st = loanStats(p);
              return (
                <div key={p.id} className="dr-row tap" onClick={() => push({ name: "player", id: p.id })}>
                  <Avatar p={p} club={c} season={w.season} size={34} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b className="small ellipsis" style={{ display: "block" }}>{p.name}</b>
                    <div className="tiny muted ellipsis">{c?.name} · {st.apps}j{st.avg != null ? ` (${st.avg.toFixed(1)})` : ""}</div>
                  </div>
                  <Ovr v={p.ovr} />
                </div>
              );
            })}
          </div>
        </aside>

        <main className="k-dressing-main">
          <div className="card">
            <div className="card-title">
              <h3>Hierarquia & Minutos do Elenco</h3>
              <span className="tiny muted">Barra = minutos · traço = esperado</span>
            </div>
            <div className="k-dressing-list mt6">
              {squad.map((p) => {
                const role = roleOf(w, p);
                const share = shareOf(p);
                const exp = ROLE_SHARE[role];
                const low = share != null && share < exp - 0.25;
                return (
                  <div key={p.id} className="dr-row tap" onClick={() => push({ name: "player", id: p.id })}>
                    <Avatar p={p} club={club} season={w.season} size={36} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="row gap4" style={{ minWidth: 0, alignItems: "center" }}>
                        <b className="small ellipsis">{p.name}</b>
                        {p.promise && <span title="Promessa de minutos" style={{ display: "inline-flex" }}><Icon name="stopwatch" size={13} /></span>}
                        {p.loan && <span className="tag" style={{ display: "inline-flex", padding: "1px 4px" }}><Icon name="swap" size={11} /></span>}
                      </div>
                      <div className="row gap6 mt2" style={{ minWidth: 0 }}>
                        <span className="role-chip">{ROLE_SHORT[role]}</span>
                        <div className="pt-bar grow" title={share != null ? `${p.pt![0]} de ${p.pt![1]} jogos` : "Sem jogos"}>
                          <i style={{ width: `${Math.round((share ?? 0) * 100)}%`, background: low ? "var(--danger)" : "var(--accent)" }} />
                          <s style={{ left: `${Math.round(exp * 100)}%` }} />
                        </div>
                        <span className="tiny muted" style={{ flex: "none", width: 28, textAlign: "right" }}>{share != null ? `${Math.round(share * 100)}%` : "-"}</span>
                      </div>
                    </div>
                    <div className="row gap4" style={{ alignItems: "center" }}>
                      <span style={{ fontSize: 18 }} title={`Moral ${p.morale}`}>{moodEmoji(p)}</span>
                      <DeltaTag d={moraleDelta(w, p)} />
                      <button className="btn sm" style={{ minWidth: 32, minHeight: 28, padding: "2px 6px", display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label={`Conversar com ${p.name}`} onClick={(e) => { e.stopPropagation(); setTalk(p); }}>
                        <Icon name="chat" size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
      <div style={{ height: 30 }} />
      {talk && <TalkSheet p={talk} onClose={() => setTalk(null)} />}
    </div>
  );
}

/** Conversa com o jogador (6 opções, uma por vez a cada 21 dias). */
export function TalkSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const w = useWorld();
  const [res, setRes] = useState<TalkResult | null>(null);
  const [rolePick, setRolePick] = useState(false);
  const wait = talkWait(w, p);
  const opts = talkOptions(w, p);
  const cur = roleOf(w, p);

  function go(id: TalkId, role?: SquadRole) {
    let r: TalkResult = { ok: false, delta: 0, text: "" };
    update((x) => { r = withWorldRng(x, () => talkTo(x, p, id, role)); });
    setRes(r);
    setRolePick(false);
    if (r.ok) { autosave(); toast(r.text); }
  }

  return (
    <Sheet title={`Conversar com ${p.name}`} onClose={onClose}>
      <div className="small muted">Moral {moodEmoji(p)} · papel {ROLE_LABEL[cur]}{p.wantsOut ? " · 😤 quer sair" : ""}</div>
      {res ? (
        <>
          <div className={`banner mt12 ${res.ok && res.delta >= 0 ? "" : "red"}`} style={res.ok && res.delta >= 0 ? { borderColor: "var(--accent)" } : undefined}>
            {res.text}{res.ok ? ` (moral ${res.delta >= 0 ? "+" : ""}${res.delta})` : ""}
          </div>
          <button className="btn block mt12" onClick={onClose}>Fechar</button>
        </>
      ) : wait > 0 ? (
        <div className="banner mt12">Vocês conversaram há pouco. Dá para conversar de novo em {wait} dia{wait === 1 ? "" : "s"}.</div>
      ) : rolePick ? (
        <>
          <div className="neg-label">Novo papel</div>
          <div className="neg-chips">
            {ROLE_LIST.filter((r) => r !== cur).map((r) => <button key={r} className="chip" onClick={() => go("role", r)}>{ROLE_LABEL[r]}</button>)}
          </div>
          <button className="btn block mt12" onClick={() => setRolePick(false)}>Voltar</button>
        </>
      ) : (
        <div className="col gap8 mt12">
          {opts.map((o) => (
            <button key={o.id} className="btn talk-opt" disabled={!!o.disabled} onClick={() => (o.id === "role" ? setRolePick(true) : go(o.id))}>
              <span>{o.emoji} {o.label}</span>
              <small>{o.disabled ?? o.hint}</small>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Cartão no Início com o clima do elenco (só aparece quando alguém quer conversar). */
export function SquadMoodHomeCard() {
  const w = useWorld();
  const n = unhappyCount(w);
  if (!n) return null;
  return (
    <div className="card tap" onClick={() => push({ name: "dressing" })}>
      <div className="row" style={{ alignItems: "center", gap: 10 }}>
        <div className="cg-ic" style={{ color: "var(--accent)" }}>
          <Icon name="chat" size={24} />
        </div>
        <div className="grow">
          <b>{n === 1 ? "1 jogador quer conversar" : `${n} jogadores querem conversar`}</b>
          <div className="small muted">Toque para ir ao Vestiário.</div>
        </div>
        <span className="muted">›</span>
      </div>
    </div>
  );
}
