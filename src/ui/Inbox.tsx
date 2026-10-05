// Caixa de entrada: notícias, propostas, contratos e lesões com botões de ação.
import { useEffect, useState } from "react";
import { formatDate } from "../engine/calendar";
import { deleteMsg, INBOX_ICON, markAllRead, markRead, runInboxAction, syncInbox } from "../engine/inbox";
import { inboxSource } from "../engine/outlets";
import { fanEmoji, fanLabel } from "../engine/narrative";
import type { InboxAction, InboxKind, InboxMsg } from "../engine/types";
import { push, setTab, toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import "./narrative.css";

type Filter = "all" | "unread" | "offer" | "squad";
const SQUAD_KINDS: InboxKind[] = ["injury", "contract", "dressing"];

export function InboxScreen() {
  const w = useWorld();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { update((x) => syncInbox(x)); }, []);
  const msgs = (w.inbox?.msgs ?? []).filter((m) =>
    filter === "all" ? true : filter === "unread" ? !m.read : filter === "offer" ? m.kind === "offer" : SQUAD_KINDS.includes(m.kind));
  const unread = (w.inbox?.msgs ?? []).filter((m) => !m.read).length;
  const fan = w.narrative?.fan ?? 60;

  function toggle(m: InboxMsg) {
    setOpen(open === m.id ? null : m.id);
    if (!m.read) { update((x) => markRead(x, m.id)); autosave(); }
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
    if ((a.id === "player" || a.id === "renew") && m.pid != null) push({ name: "player", id: m.pid });
    else if (a.id === "board") push({ name: "board" });
    else if (a.id === "dressing") push({ name: "dressing" });
    else if (a.id === "market") setTab("market");
    else if (a.id === "fixture" && m.fid != null) push({ name: "fixture", id: m.fid });
  }

  return (
    <div className="page">
      <div className="card flat row gap8">
        <span style={{ fontSize: 24 }}>{fanEmoji(fan)}</span>
        <div className="grow">
          <b className="small">Torcida: {fanLabel(fan)}</b>
          <div className="agent-bar"><i style={{ width: `${fan}%`, background: fan >= 60 ? "var(--accent)" : fan >= 40 ? "var(--warn)" : "var(--danger)" }} /></div>
        </div>
        <span className="small muted">🏛️ {w.board.confidence}%</span>
      </div>

      <div className="seg">
        {([["all", "Tudo"], ["unread", `Não lidas${unread ? ` (${unread})` : ""}`], ["offer", "Propostas"], ["squad", "Elenco"]] as [Filter, string][]).map(([id, l]) => (
          <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{l}</button>
        ))}
      </div>

      <div className="row">
        <button className="btn sm" disabled={!unread} onClick={() => { update((x) => markAllRead(x)); autosave(); }}>✔ Marcar tudo como lido</button>
        <span className="grow" />
        <button className="btn sm" onClick={() => push({ name: "news" })}>📰 Notícias</button>
      </div>

      {!msgs.length && <div className="empty">Nada por aqui.</div>}
      <div className="inbox-list">
        {msgs.map((m) => (
          <div key={m.id} className={`inbox-item${m.read ? "" : " unread"}${m.done ? " done" : ""}`}>
            <button className="inbox-row" onClick={() => toggle(m)}>
              <span className="inbox-ic">{INBOX_ICON[m.kind]}</span>
              <span className="inbox-txt">
                <b className="ellipsis">{m.title}</b>
                <span className="tiny muted">{inboxSource(w, m) ? `📰 ${inboxSource(w, m)} · ` : ""}{formatDate(m.season, m.day)} {m.season}</span>
              </span>
              {!m.read && <i className="inbox-dot" aria-label="Não lida" />}
            </button>
            {open === m.id && (
              <div className="inbox-body">
                {m.body && <p className="small">{m.body}</p>}
                <div className="row wrap gap8 mt8">
                  {m.actions.map((a) => (
                    <button key={a.id} className={`btn sm${a.id === "accept" ? " primary" : a.id === "reject" ? " danger" : ""}`} onClick={() => act(m, a)}>{a.label}</button>
                  ))}
                  <button className="btn sm" onClick={() => { update((x) => deleteMsg(x, m.id)); autosave(); }}>🗑️</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

