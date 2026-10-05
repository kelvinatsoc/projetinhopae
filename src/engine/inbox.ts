// Caixa de entrada: mensagens tipadas (com lido/não lido e botões de ação) que embrulham
// notícias, propostas de compra, alertas de contrato e lesões. Sem sorteio.
import { formatMoney } from "./finance";
import { acceptOffer } from "./transfers";
import type { InboxAction, InboxKind, InboxMsg, InboxState, NewsKind, NewsItem, World } from "./types";

export const INBOX_MAX = 120;

export function inboxOf(w: World): InboxState {
  w.inbox ??= { msgs: [], lastNews: 0 };
  if (!Array.isArray(w.inbox.msgs)) w.inbox.msgs = [];
  if (typeof w.inbox.lastNews !== "number") w.inbox.lastNews = 0;
  return w.inbox;
}

const KIND_OF: Partial<Record<NewsKind, InboxKind>> = {
  injury: "injury", contract: "contract", board: "board", dressing: "dressing", transfer: "transfer", offer: "offer", match: "match",
};

function newsActions(n: NewsItem, kind: InboxKind): InboxAction[] {
  const a: InboxAction[] = [];
  if (kind === "contract" && n.pid != null) a.push({ id: "renew", label: "📝 Renovar" });
  if (n.pid != null) a.push({ id: "player", label: "👤 Ver jogador" });
  if (kind === "board") a.push({ id: "board", label: "🏛️ Diretoria" });
  if (kind === "dressing") a.push({ id: "dressing", label: "🤝 Vestiário" });
  if (kind === "offer" || kind === "transfer") a.push({ id: "market", label: "💼 Mercado" });
  return a;
}

function push(w: World, m: Omit<InboxMsg, "id" | "day" | "season" | "read"> & Partial<Pick<InboxMsg, "day" | "season" | "read">>) {
  const ib = inboxOf(w);
  ib.msgs.unshift({ id: w.nextId++, day: w.day, season: w.season, read: false, ...m });
}

/** Traz para a caixa as novidades (notícias novas, propostas, contratos no fim). Idempotente. */
export function syncInbox(w: World) {
  const ib = inboxOf(w);
  // notícias novas (w.news vem da mais nova para a mais velha)
  const fresh = w.news.filter((n) => n.id > ib.lastNews).reverse();
  for (const n of fresh) {
    const kind = KIND_OF[n.kind] ?? "news";
    push(w, { day: n.day, season: n.season, kind, title: n.title, body: n.body, read: n.read, pid: n.pid, clubId: n.clubId, newsId: n.id, actions: newsActions(n, kind) });
  }
  if (fresh.length) ib.lastNews = Math.max(ib.lastNews, ...fresh.map((n) => n.id));
  // propostas recebidas pelos jogadores do usuário
  const known = new Set(ib.msgs.filter((m) => m.offerId != null).map((m) => m.offerId));
  for (const o of w.offers) {
    if (o.byUser || o.to !== w.userClubId || o.status !== "pending" || known.has(o.id)) continue;
    const p = w.players[o.pid];
    const buyer = w.clubs[o.from];
    if (!p || !buyer) continue;
    push(w, {
      kind: "offer", title: `💼 ${buyer.name} quer ${p.name}`,
      body: `Proposta de ${formatMoney(o.fee)} pelo jogador. Ela expira em alguns dias.`,
      pid: p.id, clubId: buyer.id, offerId: o.id,
      actions: [{ id: "accept", label: "✅ Aceitar" }, { id: "reject", label: "❌ Recusar" }, { id: "player", label: "👤 Ver" }],
    });
  }
  // propostas que deixaram de estar pendentes perdem os botões
  for (const m of ib.msgs) {
    if (m.offerId == null || m.done) continue;
    const o = w.offers.find((x) => x.id === m.offerId);
    if (!o || o.status !== "pending") closeMsg(m, o?.status === "done" ? "Negócio fechado." : "Proposta encerrada.");
  }
  // contratos terminando nesta temporada (a partir de julho, um alerta por jogador)
  if (w.day >= 181) {
    const alerted = new Set(ib.msgs.filter((m) => m.kind === "contract" && m.season === w.season && m.pid != null).map((m) => m.pid));
    for (const id of w.clubs[w.userClubId]?.players ?? []) {
      const p = w.players[id];
      if (!p || p.youth || p.loan || p.contractEnd > w.season || alerted.has(p.id)) continue;
      push(w, {
        kind: "contract", title: `📝 Contrato de ${p.name} acaba em dezembro`,
        body: "Renove agora ou ele poderá sair de graça no fim da temporada.",
        pid: p.id, actions: [{ id: "renew", label: "📝 Renovar" }, { id: "player", label: "👤 Ver jogador" }],
      });
    }
  }
  if (ib.msgs.length > INBOX_MAX) ib.msgs.length = INBOX_MAX;
}

function closeMsg(m: InboxMsg, note: string) {
  m.done = true;
  m.actions = m.actions.filter((a) => a.id !== "accept" && a.id !== "reject");
  if (!m.body.endsWith(note)) m.body = `${m.body} ${note}`;
}

/** Não lidas: mensagens da caixa + notícias que ainda não entraram nela. */
export function inboxUnread(w: World): number {
  const ib = w.inbox;
  const last = ib?.lastNews ?? 0;
  const pendingNews = w.news.reduce((s, n) => s + (n.id > last && !n.read ? 1 : 0), 0);
  return (ib?.msgs.reduce((s, m) => s + (m.read ? 0 : 1), 0) ?? 0) + pendingNews;
}

export function markRead(w: World, id: number) {
  const m = inboxOf(w).msgs.find((x) => x.id === id);
  if (!m) return;
  m.read = true;
  if (m.newsId != null) {
    const n = w.news.find((x) => x.id === m.newsId);
    if (n) n.read = true;
  }
}

export function markAllRead(w: World) {
  for (const m of inboxOf(w).msgs) m.read = true;
  for (const n of w.news) n.read = true;
}

export function deleteMsg(w: World, id: number) {
  const ib = inboxOf(w);
  ib.msgs = ib.msgs.filter((m) => m.id !== id);
}

/** Ações que mexem no mundo (aceitar/recusar proposta). As de navegação ficam com a interface. */
export function runInboxAction(w: World, id: number, action: InboxAction["id"]): { ok: boolean; msg: string } {
  const m = inboxOf(w).msgs.find((x) => x.id === id);
  if (!m) return { ok: false, msg: "Mensagem não encontrada" };
  markRead(w, id);
  if (action !== "accept" && action !== "reject") return { ok: true, msg: "" };
  const o = w.offers.find((x) => x.id === m.offerId);
  if (!o || o.status !== "pending") {
    closeMsg(m, "Proposta encerrada.");
    return { ok: false, msg: "Essa proposta não está mais valendo" };
  }
  if (action === "accept") {
    acceptOffer(w, o);
    const done = (o.status as string) === "done";
    closeMsg(m, done ? "Negócio fechado." : "Proposta encerrada.");
    return { ok: done, msg: done ? "💰 Venda concluída" : "Não foi possível concluir a venda" };
  }
  o.status = "rejected";
  closeMsg(m, "Você recusou.");
  return { ok: true, msg: "Proposta recusada" };
}

export const INBOX_ICON: Record<InboxKind, string> = {
  news: "📰", offer: "💼", contract: "📝", injury: "🚑", board: "🏛️", dressing: "🤝", transfer: "🔁", press: "🎤", match: "⚽",
};
