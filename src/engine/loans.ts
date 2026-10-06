// Empréstimos (para fora e para dentro, com opção de compra).
// O jogador emprestado fica no elenco de quem pegou (p.clubId = clube que pegou);
// o contrato (salário, término) continua sendo do clube de origem (p.loan.from).
import { userWindowOpen } from "./admin";
import { absDay, seeded, windowIndex } from "./common";
import { formatMoney } from "./finance";
import { autoLineup, squadOf } from "./lineup";
import { addNews } from "./news";
import { FORMATIONS, ovrAt } from "./positions";
import { age, roundMoney } from "./player";
import { chance, pick, rand, shuffle } from "./rng";
import { askingPrice, canAfford, completeTransfer, detachFromClub, freeShirt, isStarter, playerWillingness, wageDemand } from "./transfers";
import { onJoinUserClub } from "./dressing";
import type { Club, Player, PlayerLoan, World } from "./types";

/** Dados extras do empréstimo: overall, jogos e soma das notas no início (para o resumo e a volta). */
type LoanEx = PlayerLoan & { o?: number; a0?: number; r0?: number };

export const MAX_LOANS_OUT = 6;
/** Clubes com o elenco profissional cheio não pegam emprestado. */
const MAX_SQUAD = 34;
export const isOnLoan = (p: Player) => !!p.loan;

export interface LoanTerms { half?: boolean; wagePct: number; opt?: number }

/** Coloca o jogador emprestado no clube que o pegou. */
export function moveToLoan(w: World, p: Player, borrower: Club, t: LoanTerms) {
  const parent = p.clubId ? w.clubs[p.clubId] : null;
  if (!parent || parent.id === borrower.id || p.loan) return;
  detachFromClub(parent, p.id);
  borrower.players.push(p.id);
  p.clubId = borrower.id;
  p.youth = false;
  p.listed = false;
  const loan: LoanEx = { from: parent.id, until: w.season, wagePct: t.wagePct, since: absDay(w), o: p.ovr, a0: p.stats.apps, r0: p.stats.ratingSum };
  if (t.half) loan.half = true;
  if (t.opt) loan.opt = t.opt;
  p.loan = loan;
  parent.loanedOut = [...(parent.loanedOut ?? []).filter((x) => x !== p.id), p.id];
  p.shirt = freeShirt(w, borrower, p.pos);
  w.offers = w.offers.filter((o) => o.pid !== p.id || o.status !== "pending");
  if (borrower.id === w.userClubId) onJoinUserClub(w, p);
}

/** Tira o jogador da lista de emprestados do clube de origem. */
export function clearLoanedOut(w: World, p: Player) {
  const from = p.loan ? w.clubs[p.loan.from] : null;
  if (from?.loanedOut) {
    from.loanedOut = from.loanedOut.filter((x) => x !== p.id);
    if (!from.loanedOut.length) delete from.loanedOut;
  }
}

/** Devolve o jogador ao clube de origem (se ele não existir mais, fica livre). */
export function moveBack(w: World, p: Player) {
  const loan = p.loan;
  if (!loan) return;
  const borrower = p.clubId ? w.clubs[p.clubId] : null;
  if (borrower) detachFromClub(borrower, p.id);
  clearLoanedOut(w, p);
  p.loan = undefined;
  const parent = w.clubs[loan.from];
  if (!parent) {
    p.clubId = null;
    p.freeSince = w.season;
    p.shirt = undefined;
    return;
  }
  parent.players.push(p.id);
  p.clubId = parent.id;
  p.shirt = freeShirt(w, parent, p.pos);
}

/** Se o jogador estiver emprestado, volta para o clube de origem. */
export function returnIfLoaned(w: World, p: Player) {
  if (p.loan) moveBack(w, p);
}

/** Jogos e nota durante o empréstimo. */
export function loanStats(p: Player): { apps: number; avg: number | null } {
  const l = p.loan as LoanEx | undefined;
  if (!l) return { apps: 0, avg: null };
  const apps = p.stats.apps - (l.a0 ?? 0);
  const sum = p.stats.ratingSum - (l.r0 ?? 0);
  if (apps <= 0) {
    // fim de temporada: as estatísticas já foram zeradas, usa o histórico
    const h = p.history.find((x) => x.season === l.until && x.clubId === p.clubId);
    if (h) return { apps: h.apps, avg: h.rating };
    return { apps: 0, avg: null };
  }
  return { apps, avg: sum / apps };
}

const untilLabel = (p: Player) => (p.loan?.half ? "30/jun" : `o fim de ${p.loan?.until}`);
export const loanUntilLabel = untilLabel;

/** Devolve os emprestados no meio ('half') ou no fim ('season') da temporada. */
export function processLoanReturns(w: World, when: "half" | "season") {
  for (const p of Object.values(w.players)) {
    const l = p.loan as LoanEx | undefined;
    if (!l) continue;
    if (when === "half" ? !l.half : l.until > w.season) continue;
    const borrower = p.clubId ? w.clubs[p.clubId] : null;
    const parent = w.clubs[l.from];
    const st = loanStats(p);
    // a IA pode exercer a opção de compra
    if (borrower && parent && borrower.id !== w.userClubId && l.opt && st.avg != null && st.avg >= 6.8 && borrower.balance >= l.opt && chance(0.5)) {
      const fee = l.opt;
      completeTransfer(w, p, borrower, fee, wageDemand(w, p, borrower), 3);
      if (parent.id === w.userClubId) addNews(w, "transfer", `💰 ${borrower.name} comprou ${p.name}`, `O clube exerceu a opção de compra do empréstimo: você recebeu ${formatMoney(fee)}.`, { pid: p.id, clubId: borrower.id });
      continue;
    }
    const was = borrower;
    moveBack(w, p);
    if (l.from === w.userClubId) {
      const o = l.o ?? p.ovr;
      addNews(w, "transfer", `↩️ ${p.name} volta do empréstimo: overall ${o} → ${p.ovr}`, `${was ? `Jogou pelo ${was.name}` : "Voltou"}${st.apps ? ` (${st.apps} jogos${st.avg != null ? `, nota ${st.avg.toFixed(1).replace(".", ",")}` : ""})` : ""}. Ele já está de volta ao elenco.`, { pid: p.id });
    } else if (was?.id === w.userClubId) {
      addNews(w, "transfer", `${p.name} voltou ao ${parent?.name ?? "clube de origem"}`, `O empréstimo terminou.`, { pid: p.id });
    }
  }
}

/** Quem seria titular no clube? (overall ≥ o pior titular da posição dele). */
export function wouldStart(w: World, club: Club, p: Player): boolean {
  const l = autoLineup(w, club, undefined, club.tactic.formation, false);
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];
  let worst = Infinity;
  l.starters.forEach((id, i) => {
    const pos = slots[i].pos;
    if (pos !== p.pos && !p.sec.includes(pos)) return;
    const v = id == null ? 0 : ovrAt(w.players[id], pos);
    if (v < worst) worst = v;
  });
  return worst !== Infinity && ovrAt(p, p.pos) >= worst;
}

/** Dia de janela: clubes da IA emprestam jovens. */
export function aiLoanDay(w: World) {
  if (!chance(0.3)) return;
  const lenders = Object.values(w.clubs).filter((c) => c.id !== w.userClubId && (c.div === "A" || !!c.league) && c.rep >= 70);
  if (!lenders.length) return;
  const lender = pick(lenders);
  const sq = squadOf(w, lender);
  if (sq.length < 25) return;
  const starters = new Set(autoLineup(w, lender, undefined, lender.tactic.formation, false).starters);
  const cands = sq.filter((p) => !p.loan && !p.legend && age(p, w.season) <= 21 && p.ovr < lender.level - 6 && !starters.has(p.id));
  if (!cands.length) return;
  const p = pick(cands);
  const borrowers = shuffle(Object.values(w.clubs).filter((c) => c.id !== w.userClubId && squadOf(w, c).length < MAX_SQUAD &&
    (c.div === "B" || c.div === "C" || (!!lender.league && (c.div === "A" || (c.league === lender.league && c.rep < lender.rep - 10))))));
  for (const b of borrowers.slice(0, 6)) {
    if (!wouldStart(w, b, p)) continue;
    moveToLoan(w, p, b, { half: windowIndex(w.day) === 0 && chance(0.5), wagePct: 1 });
    return;
  }
}

/** Início do mês: resumo dos emprestados do usuário (uma notícia). */
export function loanDigest(w: World) {
  const user = w.clubs[w.userClubId];
  const ids = user?.loanedOut ?? [];
  const lines: string[] = [];
  for (const id of ids) {
    const p = w.players[id];
    if (!p?.loan) continue;
    const c = p.clubId ? w.clubs[p.clubId] : null;
    const st = loanStats(p);
    const o = (p.loan as LoanEx).o ?? p.ovr;
    const arrow = p.ovr > o ? " ▲" : p.ovr < o ? " ▼" : "";
    lines.push(`${p.name} (${c?.name ?? "?"}) — ${st.apps} jogo${st.apps === 1 ? "" : "s"}${st.avg != null ? `, nota ${st.avg.toFixed(1).replace(".", ",")}` : ""}, overall ${p.ovr}${arrow}`);
  }
  if (!lines.length) return;
  addNews(w, "transfer", `📤 Emprestados: como estão seus jogadores`, lines.join(" · "));
}

// ---------------------------------------------------------------- ações do usuário
/** Pode emprestar? Devolve o motivo quando não pode. */
export function loanOutBlock(w: World, p: Player): string | null {
  const user = w.clubs[w.userClubId];
  if (p.clubId !== user.id) return "Ele não é do seu clube.";
  if (p.loan) return "Ele já está emprestado ao seu clube.";
  if (!userWindowOpen(w)) return "A janela está fechada. Empréstimos só nas janelas (até 31/mar e de 1/jul a 31/ago).";
  if ((user.loanedOut?.length ?? 0) >= MAX_LOANS_OUT) return `Você já tem ${MAX_LOANS_OUT} jogadores emprestados.`;
  if (p.legend && age(p, w.season) < 16) return "Lendas com menos de 16 anos ficam na base.";
  if (!p.youth && squadOf(w, user).length <= 18) return "Seu elenco ficaria curto demais.";
  return null;
}

export interface LoanOffer {
  clubId: string;
  starter: boolean;
  wagePct: number;
  opt?: number;
  dropNoOpt: boolean; // desiste se você tirar a opção de compra
}

/** 3 propostas de empréstimo (determinísticas por jogador e janela). */
export function loanOutOffers(w: World, p: Player): LoanOffer[] {
  const rng = seeded(w, `loan:${p.id}:${w.season}:${windowIndex(w.day)}`);
  const pool = Object.values(w.clubs)
    .filter((c) => c.country === "BRA" && c.div !== "F" && c.id !== w.userClubId && c.level >= p.ovr - 6 && c.level <= p.ovr + 4 && squadOf(w, c).length < MAX_SQUAD)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const picked: Club[] = [];
  while (pool.length && picked.length < 3) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const ask = askingPrice(w, p);
  return picked.map((c) => {
    const starter = wouldStart(w, c, p);
    const wagePct = starter ? 0.8 + 0.1 * Math.floor(rng() * 3) : 0.5 + 0.1 * Math.floor(rng() * 4);
    const wantsOpt = rng() < 0.5;
    const dropNoOpt = rng() < 0.5;
    return { clubId: c.id, starter, wagePct: Math.round(wagePct * 10) / 10, opt: wantsOpt ? roundMoney(ask * 1.1) : undefined, dropNoOpt };
  });
}

/** Empresta o jogador do usuário. */
export function loanOut(w: World, p: Player, offer: LoanOffer, half: boolean, noOpt: boolean): string | null {
  const block = loanOutBlock(w, p);
  if (block) return block;
  const c = w.clubs[offer.clubId];
  if (!c) return "Clube não encontrado.";
  moveToLoan(w, p, c, { half: half && windowIndex(w.day) === 0, wagePct: offer.wagePct, opt: noOpt ? undefined : offer.opt });
  addNews(w, "transfer", `📤 ${p.name} emprestado ao ${c.name}`, `Fica lá até ${untilLabel(p)}. O ${c.name} paga ${Math.round(offer.wagePct * 100)}% do salário${p.loan?.opt ? ` e tem opção de compra de ${formatMoney(p.loan.opt)}` : ""}.`, { pid: p.id, clubId: c.id });
  return null;
}

/** Pode pedir emprestado? */
export function loanInBlock(w: World, p: Player): string | null {
  const user = w.clubs[w.userClubId];
  if (!p.clubId || p.clubId === user.id) return "Só jogadores de outros clubes.";
  if (p.loan) return `Ele já está emprestado ao ${w.clubs[p.clubId]?.name}.`;
  if (p.youth) return "Ele está nas categorias de base do clube.";
  if (!userWindowOpen(w)) return "A janela está fechada.";
  const parent = w.clubs[p.clubId];
  if (squadOf(w, parent).length <= 18) return `${parent.name} não pode liberar mais jogadores agora.`;
  const will = playerWillingness(w, p, user);
  if (!will.ok) return will.reason ?? "Ele não quer ir.";
  return null;
}

/** Mostra o botão “Pedir emprestado”? (reservas ou jovens até 21 anos) */
export const canAskLoan = (w: World, p: Player) =>
  !!p.clubId && p.clubId !== w.userClubId && !p.loan && !p.youth && (age(p, w.season) <= 21 || !isStarter(w, p));

export const LOAN_IN_PAY = [0.5, 0.75, 1] as const;
const LOAN_IN_ACCEPT: Record<number, number> = { 0.5: 0.4, 0.75: 0.7, 1: 0.95 };

export interface LoanInResult { ok: boolean; text: string }

/** Pede o jogador emprestado. Usa o gerador global: chame dentro de withWorldRng. */
export function requestLoanIn(w: World, p: Player, pay: number): LoanInResult {
  const block = loanInBlock(w, p);
  if (block) return { ok: false, text: block };
  const parent = w.clubs[p.clubId!];
  const user = w.clubs[w.userClubId];
  const acc = (LOAN_IN_ACCEPT[pay] ?? 0.4) * (isStarter(w, p) ? 0.5 : 1);
  // um sorteio por jogador e janela: pagar mais nunca piora a resposta
  const u = seeded(w, `loanin:${p.id}:${w.season}:${windowIndex(w.day)}`)();
  if (u >= acc) return { ok: false, text: `❌ ${parent.name} não quer emprestar agora.` };
  const opt = rand() < 0.3 ? roundMoney(askingPrice(w, p) * 1.1) : undefined;
  moveToLoan(w, p, user, { wagePct: pay, opt });
  const optTxt = opt ? ` com opção de compra de ${formatMoney(opt)}` : "";
  addNews(w, "transfer", `📥 ${p.name} chega por empréstimo`, `Emprestado pelo ${parent.name} até o fim da temporada${optTxt}. Você paga ${Math.round(pay * 100)}% do salário.`, { pid: p.id, clubId: parent.id });
  return { ok: true, text: `✅ ${parent.name} aceitou! ${p.name} chega por empréstimo até o fim da temporada${optTxt}.` };
}

/** Exerce a opção de compra de um jogador emprestado ao usuário (qualquer época). */
export function exerciseOption(w: World, p: Player): string | null {
  const user = w.clubs[w.userClubId];
  const l = p.loan;
  if (!l?.opt || p.clubId !== user.id) return "Não há opção de compra.";
  if (!canAfford(user, l.opt, w)) return "Dinheiro insuficiente.";
  const parent = w.clubs[l.from];
  const fee = l.opt;
  completeTransfer(w, p, user, fee, Math.max(p.wage, wageDemand(w, p, user)), 3);
  addNews(w, "transfer", `💰 ${p.name} agora é seu!`, `Você exerceu a opção de compra e pagou ${formatMoney(fee)} ao ${parent?.name ?? "clube"}. Contrato até ${p.contractEnd}.`, { pid: p.id });
  return null;
}

/** “Chamar de volta” (seu emprestado) ou “Devolver” (emprestado ao seu clube). Qualquer dia. */
export function endLoanNow(w: World, p: Player): string | null {
  const l = p.loan;
  if (!l) return "Ele não está emprestado.";
  if (l.from === w.userClubId) {
    moveBack(w, p);
    p.morale = Math.max(15, p.morale - 5);
    return null;
  }
  if (p.clubId === w.userClubId) {
    moveBack(w, p);
    return null;
  }
  return "Esse empréstimo não é seu.";
}
