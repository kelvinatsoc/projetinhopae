// Vestiário: entrosamento, líderes, papéis e minutos, conversas e emprestados.
import { useState } from "react";
import { withWorldRng } from "../../engine/common";
import { ROLE_LABEL, ROLE_LIST, ROLE_SHARE, ROLE_SHORT, roleOf } from "../../engine/contracts";
import { chemOf, leadersOf, moodEmoji, shareOf, talkOptions, talkTo, talkWait, unhappyCount, type TalkId, type TalkResult } from "../../engine/dressing";
import { squadOf } from "../../engine/lineup";
import { loanStats, loanUntilLabel } from "../../engine/loans";
import type { Player, SquadRole } from "../../engine/types";
import { push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Avatar, Crest, Ovr, Sheet } from "../components";
import "../market.css";

export function DressingScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const chem = Math.round(chemOf(w, club));
  const leaders = leadersOf(w, club);
  const squad = squadOf(w, club).sort((a, b) => {
    const pa = (a.wantsOut ? 2 : 0) + ((a.unhappy ?? 0) >= 2 ? 1 : 0);
    const pb = (b.wantsOut ? 2 : 0) + ((b.unhappy ?? 0) >= 2 ? 1 : 0);
    return pb - pa || b.ovr - a.ovr;
  });
  const loaned = (club.loanedOut ?? []).map((id) => w.players[id]).filter((p): p is Player => !!p?.loan);
  const [talk, setTalk] = useState<Player | null>(null);
  const chemColor = chem >= 65 ? "var(--accent)" : chem >= 50 ? "var(--warn)" : "var(--danger)";

  return (
    <div className="page">
      <div className="card">
        <div className="row"><b className="grow">🤝 Entrosamento {chem}%</b></div>
        <div className="agent-bar"><i style={{ width: `${chem}%`, background: chemColor }} /></div>
        <div className="small muted mt8">Time entrosado rende até 1% a mais; cada reforço derruba um pouco. Sobe com jogos e treinos (o foco Tático ajuda).</div>
      </div>

      {leaders.length > 0 && (
        <div className="card">
          <h3>🧭 Líderes do vestiário</h3>
          <div className="leaders mt8">
            {leaders.map((p) => (
              <div key={p.id} onClick={() => push({ name: "player", id: p.id })}>
                <Avatar p={p} club={club} season={w.season} size={48} />
                <b className="small ellipsis" style={{ maxWidth: "100%" }}>{p.name.split(" ").slice(-1)[0]}</b>
                <span style={{ fontSize: 20 }}>{moodEmoji(p)}</span>
              </div>
            ))}
          </div>
          <div className="tiny muted mt8">Se um líder fica insatisfeito, o grupo inteiro sente.</div>
        </div>
      )}

      <div className="card">
        <h3>Elenco</h3>
        <div className="tiny muted">Barra = jogos em que entrou · traço = o esperado para o papel. Toque em 💬 para conversar.</div>
        <div className="mt8">
          {squad.map((p) => {
            const role = roleOf(w, p);
            const share = shareOf(p);
            const exp = ROLE_SHARE[role];
            const low = share != null && share < exp - 0.25;
            return (
              <div key={p.id} className="dr-row" onClick={() => push({ name: "player", id: p.id })}>
                <Avatar p={p} club={club} season={w.season} size={42} />
                <div style={{ minWidth: 0 }}>
                  <div className="row gap4" style={{ minWidth: 0 }}>
                    <b className="ellipsis">{p.name}</b>
                    {p.promise && <span title="Promessa de minutos">⏱️</span>}
                    {p.loan && <span className="tag">📥</span>}
                  </div>
                  <div className="row gap8 mt4" style={{ minWidth: 0 }}>
                    <span className="role-chip">{ROLE_SHORT[role]}</span>
                    <div className="pt-bar grow" title={share != null ? `${p.pt![0]} de ${p.pt![1]} jogos` : "Sem jogos ainda"}>
                      <i style={{ width: `${Math.round((share ?? 0) * 100)}%`, background: low ? "var(--danger)" : "var(--accent)" }} />
                      <s style={{ left: `${Math.round(exp * 100)}%` }} />
                    </div>
                    <span className="tiny muted" style={{ flex: "none", width: 34, textAlign: "right" }}>{share != null ? `${Math.round(share * 100)}%` : "-"}</span>
                  </div>
                </div>
                <div className="row gap4">
                  <span style={{ fontSize: 20 }}>{moodEmoji(p)}</span>
                  <button className="btn sm" style={{ minWidth: 40, minHeight: 40 }} aria-label={`Conversar com ${p.name}`} onClick={(e) => { e.stopPropagation(); setTalk(p); }}>💬</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>📤 Emprestados</h3>
        {!loaned.length && <div className="small muted mt8">Nenhum jogador emprestado. No perfil de um jogador seu, toque em “📤 Emprestar” para ele ganhar minutos em outro clube.</div>}
        {loaned.map((p) => {
          const c = p.clubId ? w.clubs[p.clubId] : null;
          const st = loanStats(p);
          return (
            <div key={p.id} className="dr-row" onClick={() => push({ name: "player", id: p.id })}>
              <Avatar p={p} club={c} season={w.season} size={42} />
              <div style={{ minWidth: 0 }}>
                <b className="ellipsis" style={{ display: "block" }}>{p.name}</b>
                <div className="row gap4 small muted" style={{ minWidth: 0 }}>
                  {c && <Crest club={c} size={16} />}
                  <span className="ellipsis">{c?.name} · até {loanUntilLabel(p)}</span>
                </div>
                <div className="tiny muted">{st.apps} jogos{st.avg != null ? ` · nota ${st.avg.toFixed(1).replace(".", ",")}` : ""}</div>
              </div>
              <Ovr v={p.ovr} />
            </div>
          );
        })}
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
    <Sheet title={`💬 Conversar com ${p.name}`} onClose={onClose}>
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
      <div className="row">
        <span style={{ fontSize: 26 }}>💬</span>
        <div className="grow">
          <b>{n === 1 ? "1 jogador quer conversar" : `${n} jogadores querem conversar`}</b>
          <div className="small muted">Toque para ir ao Vestiário.</div>
        </div>
        <span className="muted">›</span>
      </div>
    </div>
  );
}
