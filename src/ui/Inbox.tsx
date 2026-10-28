// Caixa de Entrada estilo FM24/FM26 (Opção 1 - Piotr Kosmala):
// Layout Mestre-Detalhe com ações diretas dentro da própria mensagem (responder, aceitar, contraproposta, renovar).
import { useEffect, useState } from "react";
import { formatDate } from "../engine/calendar";
import { formatMoney } from "../engine/finance";
import { deleteMsg, INBOX_ICON, inboxOf, markAllRead, markRead, runInboxAction, syncInbox } from "../engine/inbox";
import { squadOf } from "../engine/lineup";
import { fanLabel } from "../engine/narrative";
import { inboxSource } from "../engine/outlets";
import { playerValue } from "../engine/player";
import { acceptOffer } from "../engine/transfers";
import type { InboxAction, InboxKind, InboxMsg, Player, World } from "../engine/types";
import { push, setTab, toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { Crest, Ic, Icon, KosmalaPlayerRow } from "./components";
import "./narrative.css";
import { NegotiationSheet } from "./screens/Contracts";
import { TalkSheet } from "./screens/Dressing";

const KIND_ICON: Partial<Record<InboxKind, string>> = {
  news: "news",
  offer: "briefcase",
  contract: "scroll",
  injury: "alert",
  board: "bank",
  dressing: "handshake",
  transfer: "swap",
  press: "mic",
  match: "ball",
};

const KIND_COLOR: Record<InboxKind, string> = {
  offer: "#10b981",
  transfer: "#10b981",
  injury: "#ef4444",
  contract: "#f59e0b",
  dressing: "#f59e0b",
  board: "#5842f4",
  press: "#3b82f6",
  match: "#3b82f6",
  news: "#6366f1",
};

const KIND_LABEL: Record<InboxKind, string> = {
  offer: "Proposta Oficial",
  transfer: "Mercado da Bola",
  injury: "Departamento Médico",
  contract: "Alerta Contratual",
  dressing: "Vestiário & Elenco",
  board: "Diretoria Executiva",
  press: "Assessoria de Imprensa",
  match: "Relatório de Jogo",
  news: "Imprensa Esportiva",
};

type Filter = "all" | "unread" | "offer" | "squad";
const SQUAD_KINDS: InboxKind[] = ["injury", "contract", "dressing"];

/** Semeia relatórios úteis do auxiliar e alertas contratuais caso a caixa esteja no início (idempotente). */
function ensureInitialInboxContext(w: World) {
  syncInbox(w);
  const ib = inboxOf(w);
  const club = w.clubs[w.userClubId];
  if (!club) return;

  const hasStaffWelcome = ib.msgs.some((m) => m.title.includes("Relatório da Comissão Técnica"));
  if (!hasStaffWelcome) {
    const squad = squadOf(w, club).sort((a, b) => b.ovr - a.ovr);
    const star = squad[0];
    const exp = squad.find((p) => !p.loan && p.contractEnd <= w.season + 1) ?? star;
    if (exp) {
      ib.msgs.unshift({
        id: w.nextId++,
        day: w.day,
        season: w.season,
        read: false,
        kind: "contract",
        title: `Situação contratual e papel de ${exp.name}`,
        body: `O representante de ${exp.name} entrou em contato com a diretoria do ${club.name} para alinhar a valorização salarial e a extensão do vínculo. Você pode abrir a negociação ou conversar com o atleta diretamente por esta mensagem.`,
        pid: exp.id,
        clubId: club.id,
        actions: [
          { id: "renew", label: "Renovar Contrato" },
          { id: "dressing", label: "Conversar" },
          { id: "player", label: "Ver Perfil" },
        ],
      });
    }
    if (star) {
      ib.msgs.unshift({
        id: w.nextId++,
        day: w.day,
        season: w.season,
        read: false,
        kind: "dressing",
        title: `Relatório da Comissão Técnica: destaque para ${star.name}`,
        body: `O auxiliar técnico preparou o diagnóstico tático do ${club.name} (${club.tactic.formation}). ${star.name} (OVR ${star.ovr}) é a referência técnica do time titular. Confira a função e o dever tático antes da próxima rodada.`,
        pid: star.id,
        clubId: club.id,
        actions: [
          { id: "player", label: "Ver Atleta" },
          { id: "board", label: "Metas da Diretoria" },
        ],
      });
    }
  }
}

export function InboxScreen() {
  const w = useWorld();
  const userClub = w.clubs[w.userClubId];
  const [filter, setFilter] = useState<Filter>("all");
  const [selId, setSelId] = useState<number | null>(null);
  const [renewPlayer, setRenewPlayer] = useState<Player | null>(null);
  const [talkPlayer, setTalkPlayer] = useState<Player | null>(null);

  useEffect(() => {
    update((x) => ensureInitialInboxContext(x));
  }, []);

  const allMsgs = w.inbox?.msgs ?? [];
  const msgs = allMsgs.filter((m) =>
    filter === "all" ? true : filter === "unread" ? !m.read : filter === "offer" ? (m.kind === "offer" || m.kind === "transfer") : SQUAD_KINDS.includes(m.kind),
  );
  const unread = allMsgs.filter((m) => !m.read).length;
  const fan = w.narrative?.fan ?? 60;

  const activeMsg = msgs.find((m) => m.id === selId) ?? msgs[0] ?? null;

  function selectMsg(m: InboxMsg) {
    setSelId(m.id);
    if (!m.read) {
      update((x) => markRead(x, m.id));
      autosave();
    }
  }

  function act(m: InboxMsg, a: InboxAction) {
    if (a.id === "accept" || a.id === "reject") {
      let r = { ok: false, msg: "" };
      update((x) => { r = runInboxAction(x, m.id, a.id); });
      if (r.msg) toast(r.msg);
      autosave();
      return;
    }
    update((x) => markRead(x, m.id));
    const p = m.pid != null ? w.players[m.pid] : null;
    if (a.id === "renew" && p && p.clubId === w.userClubId) {
      setRenewPlayer(p);
      return;
    }
    if ((a.id === "player" || a.id === "renew") && m.pid != null) push({ name: "player", id: m.pid });
    else if (a.id === "board") push({ name: "board" });
    else if (a.id === "dressing") {
      if (p && p.clubId === w.userClubId) setTalkPlayer(p);
      else push({ name: "dressing" });
    }
    else if (a.id === "market") setTab("market");
    else if (a.id === "fixture" && m.fid != null) push({ name: "fixture", id: m.fid });
  }

  function counterOffer(m: InboxMsg) {
    if (m.offerId == null) return;
    const o = w.offers.find((x) => x.id === m.offerId);
    if (!o || o.status !== "pending") {
      toast("Esta proposta já foi encerrada.");
      return;
    }
    const p = w.players[o.pid];
    const buyer = w.clubs[o.from];
    if (!p || !buyer) return;
    const boostedFee = Math.round(o.fee * 1.15);
    const val = playerValue(p, w.season);
    if (buyer.balance >= boostedFee && boostedFee <= val * 1.45) {
      update((x) => {
        const xo = x.offers.find((item) => item.id === m.offerId);
        if (!xo) return;
        xo.fee = boostedFee;
        acceptOffer(x, xo);
        const xm = inboxOf(x).msgs.find((item) => item.id === m.id);
        if (xm) {
          xm.done = true;
          xm.read = true;
          xm.actions = xm.actions.filter((a) => a.id !== "accept" && a.id !== "reject");
          xm.body = `${xm.body}\n\nContraproposta de ${formatMoney(boostedFee)} aceita pelo ${buyer.name}!`;
        }
      });
      toast(`${buyer.name} aceitou a contraproposta de ${formatMoney(boostedFee)}!`);
      autosave();
    } else {
      update((x) => {
        const xm = inboxOf(x).msgs.find((item) => item.id === m.id);
        if (xm) {
          xm.body = `${xm.body}\n\nO ${buyer.name} considerou ${formatMoney(boostedFee)} alto demais, mas manteve a oferta original de ${formatMoney(o.fee)}.`;
        }
      });
      toast(`${buyer.name} manteve a oferta original de ${formatMoney(o.fee)}.`);
      autosave();
    }
  }

  const msgPlayer = activeMsg?.pid != null ? w.players[activeMsg.pid] : null;
  const msgClub = activeMsg?.clubId ? w.clubs[activeMsg.clubId] : msgPlayer?.clubId ? w.clubs[msgPlayer.clubId] : userClub;
  const msgOffer = activeMsg?.offerId != null ? w.offers.find((o) => o.id === activeMsg.offerId) : null;
  const isMyPlayer = msgPlayer && msgPlayer.clubId === w.userClubId;

  return (
    <div className="k-screen">
      {/* Sub-abas horizontais estilo Opção 1 */}
      <div className="k-subtabs" role="tablist" aria-label="Filtros da Caixa de Entrada">
        {([
          ["all", `Todas (${allMsgs.length})`],
          ["unread", `Não lidas${unread ? ` (${unread})` : ""}`],
          ["offer", "Propostas & Mercado"],
          ["squad", "Elenco, Contratos & DM"],
        ] as [Filter, string][]).map(([id, label]) => (
          <button key={id} className={`k-subtab${filter === id ? " active" : ""}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
        <div className="k-subtabs-right">
          <span className="k-subtab-meta">Torcida: <b>{fanLabel(fan)} ({fan}%)</b></span>
          <span className="k-subtab-meta">Diretoria: <b>{w.board.confidence}%</b></span>
          <button className="k-subtab-btn" disabled={!unread} onClick={() => { update((x) => markAllRead(x)); autosave(); }}>
            <Ic n="check" size={13} /> Ler tudo
          </button>
          <button className="k-subtab-btn" onClick={() => push({ name: "news" })}>
            <Ic n="news" size={13} /> Imprensa
          </button>
        </div>
      </div>

      {/* Layout Mestre-Detalhe */}
      <div className="k-inbox-split">
        {/* Lista de Mensagens (Esquerda) */}
        <div className="k-inbox-list-pane">
          {!msgs.length && <div className="empty">Nenhuma mensagem neste filtro.</div>}
          {msgs.map((m) => {
            const isSel = activeMsg?.id === m.id;
            const col = KIND_COLOR[m.kind] ?? "#5842f4";
            return (
              <button
                key={m.id}
                className={`k-ib-item${isSel ? " selected" : ""}${!m.read ? " unread" : ""}`}
                onClick={() => selectMsg(m)}
              >
                <i className="k-ib-stripe" style={{ background: col }} />
                <span className="k-ib-ic">
                  {KIND_ICON[m.kind] ? <Icon name={KIND_ICON[m.kind]!} size={16} /> : INBOX_ICON[m.kind]}
                </span>
                <div className="k-ib-item-body">
                  <div className="k-ib-item-top">
                    <span className="k-ib-cat" style={{ color: col }}>{ inboxSource(w, m) || KIND_LABEL[m.kind] }</span>
                    <span className="k-ib-date">{formatDate(m.season, m.day)}</span>
                  </div>
                  <b className="k-ib-title ellipsis">{m.title}</b>
                </div>
                {!m.read && <span className="k-ib-dot" aria-label="Não lida" />}
              </button>
            );
          })}
        </div>

        {/* Painel de Leitura e Decisão (Direita) */}
        <div className="k-inbox-detail-pane">
          {activeMsg ? (
            <div className="k-ib-detail-card">
              <div className="k-ib-detail-head">
                {msgClub && <Crest club={msgClub} size={36} />}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="k-ib-detail-kicker" style={{ color: KIND_COLOR[activeMsg.kind] }}>
                    {inboxSource(w, activeMsg) || KIND_LABEL[activeMsg.kind]} · {formatDate(activeMsg.season, activeMsg.day)} de {activeMsg.season}
                  </div>
                  <h3 className="k-ib-detail-title">{activeMsg.title}</h3>
                </div>
                <button
                  className="btn sm"
                  onClick={() => { update((x) => deleteMsg(x, activeMsg.id)); autosave(); }}
                  aria-label="Apagar mensagem"
                  title="Apagar mensagem"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>

              <div className="k-ib-detail-body">
                <p>{activeMsg.body || "Sem detalhes adicionais."}</p>

                {/* Card financeiro quando for uma proposta de transferência */}
                {msgOffer && msgPlayer && (
                  <div className="k-offer-box">
                    <div className="k-offer-item">
                      <span>Valor da Proposta</span>
                      <b style={{ color: "#10b981" }}>{formatMoney(msgOffer.fee)}</b>
                    </div>
                    <div className="k-offer-item">
                      <span>Valor de Mercado</span>
                      <b>{formatMoney(playerValue(msgPlayer, w.season))}</b>
                    </div>
                    <div className="k-offer-item">
                      <span>Salário Atual</span>
                      <b>{formatMoney(msgPlayer.wage)}/mês</b>
                    </div>
                    <div className="k-offer-item">
                      <span>Status</span>
                      <b>{msgOffer.status === "pending" ? "Aguardando Resposta" : msgOffer.status === "done" ? "Aceita" : "Encerrada"}</b>
                    </div>
                  </div>
                )}

                {/* Linha de jogador estilo Kosmala Opção 1 embutida na mensagem */}
                {msgPlayer && (
                  <div className="k-ib-player-embed">
                    <div className="k-embed-head">
                      <span>Atleta Relacionado</span>
                      <span className="muted">Contrato até dez/{msgPlayer.contractEnd} · Moral {Math.round(msgPlayer.morale)}%</span>
                    </div>
                    <KosmalaPlayerRow
                      w={w}
                      p={msgPlayer}
                      club={msgClub ?? userClub}
                      onClick={() => push({ name: "player", id: msgPlayer.id })}
                    />
                  </div>
                )}
              </div>

              {/* Barra de Ações Diretas Dentro da Mensagem (2 toques no máximo!) */}
              <div className="k-ib-actions-bar">
                {/* Se for proposta pendente, botões de Negociação Direta */}
                {msgOffer && msgOffer.status === "pending" && (
                  <>
                    <button className="k-act-btn accept" onClick={() => act(activeMsg, { id: "accept", label: "Aceitar" })}>
                      <Ic n="check" size={14} /> Aceitar ({formatMoney(msgOffer.fee)})
                    </button>
                    <button className="k-act-btn primary" onClick={() => counterOffer(activeMsg)}>
                      <Ic n="swap" size={14} /> Contraproposta (+15%: {formatMoney(Math.round(msgOffer.fee * 1.15))})
                    </button>
                    <button className="k-act-btn reject" onClick={() => act(activeMsg, { id: "reject", label: "Recusar" })}>
                      <span className="row center gap4"><Ic n="close" size={13} /> Recusar</span>
                    </button>
                  </>
                )}

                {/* Se o jogador pertence ao clube do usuário, permite Conversar e Renovar direto daqui */}
                {isMyPlayer && msgPlayer && (
                  <>
                    <button className="k-act-btn primary" onClick={() => setRenewPlayer(msgPlayer)}>
                      <Ic n="scroll" size={14} /> Renovar Contrato
                    </button>
                    <button className="k-act-btn" onClick={() => setTalkPlayer(msgPlayer)}>
                      <Ic n="handshake" size={14} /> Conversar com Atleta
                    </button>
                    <button className="k-act-btn" onClick={() => setTab("tactics")}>
                      <Ic n="board" size={14} /> Ver na Tática
                    </button>
                  </>
                )}

                {/* Demais ações da mensagem */}
                {activeMsg.actions
                  .filter((a) => !(msgOffer && (a.id === "accept" || a.id === "reject")) && !(isMyPlayer && a.id === "renew"))
                  .map((a) => (
                    <button
                      key={a.id}
                      className={`k-act-btn${a.id === "accept" ? " accept" : a.id === "reject" ? " reject" : ""}`}
                      onClick={() => act(activeMsg, a)}
                    >
                      <span className="row center gap4">
                        {a.id === "renew" && <Ic n="edit" size={14} />}
                        {a.id === "dressing" && <Ic n="chat" size={14} />}
                        {a.id === "player" && <Ic n="user" size={14} />}
                        {a.id === "board" && <Ic n="bank" size={14} />}
                        {a.id === "accept" && <Ic n="check" size={14} />}
                        {a.id === "reject" && <Ic n="close" size={14} />}
                        {a.label.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, "")}
                      </span>
                    </button>
                  ))}

                {msgPlayer && !isMyPlayer && (
                  <button className="k-act-btn primary" onClick={() => push({ name: "player", id: msgPlayer.id })}>
                    <Ic n="search" size={14} /> Ver Perfil / Fazer Proposta
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="empty">Selecione uma mensagem à esquerda para ler e tomar decisões.</div>
          )}
        </div>
      </div>

      {/* Modais diretos sem sair da Caixa de Entrada */}
      {renewPlayer && (
        <NegotiationSheet
          p={renewPlayer}
          mode="renew"
          onClose={() => setRenewPlayer(null)}
        />
      )}
      {talkPlayer && (
        <TalkSheet
          p={talkPlayer}
          onClose={() => setTalkPlayer(null)}
        />
      )}
    </div>
  );
}
