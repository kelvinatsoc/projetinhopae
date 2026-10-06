// Mercado de transferências: propostas do usuário, ofertas da IA e negócios entre clubes da IA.
import { adminCheats, userWindowOpen } from "./admin";
import { clauseDay, ensureClause, seasonsAtClub } from "./contracts";
import { clearMood, idolSold, onJoinUserClub, onLeaveUserClub } from "./dressing";
import { addExpense, addIncome, formatMoney } from "./finance";
import { autoLineup, squadOf } from "./lineup";
import { moveBack, clearLoanedOut } from "./loans";
import { addNews } from "./news";
import { H, hidOf } from "./personality";
import { knowledgeOf, TRAITS_K } from "./scouting";
import { FORMATIONS, ovrAt, POS_ORDER } from "./positions";
import { age, generatePlayer, playerValue, roundMoney, wageFor } from "./player";
import { chance, clamp, pick, pickWeighted, rand, randInt, shuffle } from "./rng";
import { hasTrait } from "./traits";
import type { Club, Player, Pos, TraitId, TransferOffer, World } from "./types";

export function isStarter(w: World, p: Player): boolean {
  if (!p.clubId) return false;
  const club = w.clubs[p.clubId];
  const l = autoLineup(w, club, undefined, club.tactic.formation, false);
  return l.starters.includes(p.id);
}

/** Quanto o clube pede pelo jogador. */
export function askingPrice(w: World, p: Player): number {
  const v = playerValue(p, w.season);
  if (!p.clubId) return 0;
  const yearsLeft = Math.max(0, p.contractEnd - w.season);
  let mult = 1.2 + (isStarter(w, p) ? 0.35 : 0) + yearsLeft * 0.07;
  if (p.listed) mult = 0.95;
  if (p.legend) mult += 0.6;
  return roundMoney(v * mult);
}

/** Salário que o jogador pede para assinar com um clube. */
export function wageDemand(w: World, p: Player, club: Club): number {
  const base = wageFor(p.ovr, club.rep, age(p, w.season));
  const from = p.clubId ? w.clubs[p.clubId] : null;
  let mult = 1.05;
  if (from && from.rep > club.rep + 10) mult += 0.25; // descer de patamar custa caro
  if (!p.clubId) mult = 0.95;
  mult *= 0.95 + 0.0048 * hidOf(p)[H.amb]; // ambiciosos pedem mais
  return roundMoney(Math.max(base * mult, p.wage * (p.clubId ? 1.1 : 0.8)));
}

/** O jogador aceita se transferir para este clube? */
export function playerWillingness(w: World, p: Player, club: Club): { ok: boolean; reason?: string } {
  const from = p.clubId ? w.clubs[p.clubId] : null;
  if (from && from.id === club.id) return p.loan ? { ok: true } : { ok: false, reason: "Já joga no seu clube." };
  if (adminCheats(w).willing && club.id === w.userClubId) return { ok: true };
  const gap = (from?.rep ?? 30) - club.rep;
  if (from && hidOf(p)[H.amb] >= 16 && club.rep < from.rep - 8) return { ok: false, reason: `${p.name} é ambicioso e quer um clube maior.` };
  if (p.ovr >= club.level + 12 && gap > 15) return { ok: false, reason: `${p.name} acha que seu clube não está à altura dele no momento.` };
  if (gap > 35 && p.ovr >= 70) return { ok: false, reason: `${p.name} não quer descer tanto de patamar.` };
  return { ok: true };
}

export interface OfferResponse {
  status: "accepted" | "countered" | "rejected";
  counter?: number;
  message: string;
}

/** Resposta do clube vendedor a uma proposta do usuário. */
export function evaluateUserBid(w: World, p: Player, fee: number): OfferResponse {
  // emprestado: quem decide é o clube de origem, e só se o jogador estiver emprestado ao seu clube
  if (p.loan && p.clubId !== w.userClubId) return { status: "rejected", message: `Está emprestado ao ${w.clubs[p.clubId!]?.name ?? "outro clube"} até o fim da temporada.` };
  const seller = p.loan ? w.clubs[p.loan.from] ?? null : p.clubId ? w.clubs[p.clubId] : null;
  if (!seller) return { status: "accepted", message: "Jogador livre, sem custo de transferência." };
  if (!userWindowOpen(w)) return { status: "rejected", message: "A janela de transferências está fechada." };
  const clause = ensureClause(w, p);
  if (clause > 0 && fee >= clause && !p.loan) return { status: "accepted", message: `💥 Você pagou a multa rescisória! ${seller.name} não pode segurar ${p.name}.` };
  const ask = askingPrice(w, p);
  if (adminCheats(w).anyBid && fee >= 0.5 * playerValue(p, w.season)) return { status: "accepted", message: `${seller.name} aceitou a proposta de ${formatMoney(fee)}!` };
  // clubes pequenos não seguram seus melhores jogadores contra propostas boas
  const squad = squadOf(w, seller);
  if (squad.length <= 18 && !p.loan) return { status: "rejected", message: `${seller.name} não pode liberar mais jogadores agora.` };
  if (fee >= ask * (0.95 + rand() * 0.08)) return { status: "accepted", message: `${seller.name} aceitou a proposta de ${formatMoney(fee)}!` };
  if (fee >= ask * 0.72) return { status: "countered", counter: roundMoney(ask), message: `${seller.name} pede ${formatMoney(ask)} para liberar ${p.name}.` };
  return { status: "rejected", message: `${seller.name} recusou. A proposta está muito abaixo do esperado (${formatMoney(ask)}).` };
}

export function canAfford(club: Club, fee: number, w?: World) {
  if (w && club.id === w.userClubId && adminCheats(w).money) return true;
  return club.balance - fee >= -Math.max(5_000_000, club.rep * 200_000);
}

/** Tira o jogador do elenco e da escalação do clube. */
export function detachFromClub(club: Club, pid: number) {
  club.players = club.players.filter((id) => id !== pid);
  if (club.lineup) {
    club.lineup.starters = club.lineup.starters.map((x) => (x === pid ? null : x));
    club.lineup.bench = club.lineup.bench.filter((x) => x !== pid);
    if (club.lineup.captain === pid) club.lineup.captain = undefined;
  }
}

/** Executa a transferência (pagamentos, elenco, contrato). Se ele estiver emprestado, quem vende é o clube de origem. */
export function completeTransfer(w: World, p: Player, buyer: Club, fee: number, wage: number, years: number) {
  const current = p.clubId ? w.clubs[p.clubId] : null;
  const seller = p.loan ? w.clubs[p.loan.from] ?? null : current;
  if (current) detachFromClub(current, p.id);
  if (p.loan) {
    clearLoanedOut(w, p);
    p.loan = undefined;
  }
  if (seller) {
    let toSeller = fee;
    // revenda: o clube que vendeu antes leva a sua parte
    const so = p.sellOn;
    if (so && so.club !== seller.id && fee > 0) {
      const old = w.clubs[so.club];
      if (old) {
        const cut = Math.round(so.pct * fee);
        toSeller -= cut;
        addIncome(old, "sales", cut);
        if (old.id === w.userClubId) addNews(w, "transfer", `💸 Revenda: você recebeu ${formatMoney(cut)}`, `${p.name} foi vendido ao ${buyer.name}, e a cláusula de revenda rendeu ${Math.round(so.pct * 100)}% do negócio para você.`, { pid: p.id, clubId: buyer.id });
      }
    }
    if (so) p.sellOn = undefined;
    addIncome(seller, "sales", toSeller);
  }
  if (fee > 0) addExpense(buyer, "transfers", fee);
  buyer.players.push(p.id);
  p.clubId = buyer.id;
  p.youth = false;
  p.listed = false;
  p.wage = wage;
  p.contractEnd = w.season + years;
  p.joined = w.season;
  p.morale = clamp(p.morale + 10, 0, 100);
  p.freeSince = undefined;
  p.shirt = freeShirt(w, buyer, p.pos);
  w.offers = w.offers.filter((o) => o.pid !== p.id || o.status === "done");
  if (buyer.id === w.userClubId) onJoinUserClub(w, p);
  else if (current?.id === w.userClubId || seller?.id === w.userClubId) {
    onLeaveUserClub(w, p);
    clearMood(p);
    p.goalBonus = undefined;
  }
}

export function freeShirt(w: World, club: Club, pos: Pos): number {
  const used = new Set(club.players.map((id) => w.players[id]?.shirt).filter(Boolean));
  const prefs: Record<Pos, number[]> = {
    GOL: [1, 12, 23, 33], ZAG: [3, 4, 14, 15], LD: [2, 13], LE: [6, 16], VOL: [5, 8, 17], MC: [8, 18, 20],
    MEI: [10, 20, 22], PD: [7, 11, 19], PE: [11, 7, 19], ATA: [9, 19, 21],
  };
  for (const n of prefs[pos]) if (!used.has(n)) return n;
  for (let n = 2; n < 99; n++) if (!used.has(n)) return n;
  return 99;
}

export function releasePlayer(w: World, p: Player, compensate: boolean) {
  // emprestado não fica livre: volta para o clube de origem
  if (p.loan) { moveBack(w, p); return; }
  const club = p.clubId ? w.clubs[p.clubId] : null;
  if (club) {
    if (compensate) {
      const months = Math.max(1, (p.contractEnd - w.season) * 12 + (12 - Math.floor(w.day / 30)));
      addExpense(club, "release", Math.round(p.wage * months * 0.5));
    }
    detachFromClub(club, p.id);
    if (club.id === w.userClubId) { onLeaveUserClub(w, p); clearMood(p); }
  }
  p.clubId = null;
  p.youth = false;
  p.listed = false;
  p.freeSince = w.season;
  p.shirt = undefined;
}

// ---------------------------------------------------------------- IA
function weakestSlot(w: World, club: Club): { pos: Pos; ovr: number } | null {
  const l = autoLineup(w, club, undefined, club.tactic.formation, false);
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];
  let worst: { pos: Pos; ovr: number } | null = null;
  l.starters.forEach((id, i) => {
    const v = id == null ? 0 : ovrAt(w.players[id], slots[i].pos);
    if (!worst || v < worst.ovr) worst = { pos: slots[i].pos, ovr: v };
  });
  return worst;
}

/** Um dia de mercado para a IA (só nas janelas). */
export function aiTransferDay(w: World) {
  const clubs = Object.values(w.clubs).filter((c) => c.id !== w.userClubId && c.div !== "D");
  const n = randInt(0, 3);
  for (let i = 0; i < n; i++) {
    const buyer = pickWeighted(clubs, clubs.map((c) => Math.max(1, c.balance / 1_000_000) * (c.div === "F" ? 0.5 : 1)));
    aiTryBuy(w, buyer);
  }
  // clubes com elenco curto contratam livres
  if (chance(0.5)) {
    const short = clubs.filter((c) => squadOf(w, c).length < 23);
    if (short.length) aiSignFree(w, pick(short));
  }
  aiOffersForUser(w);
}

function aiTryBuy(w: World, buyer: Club) {
  const weak = weakestSlot(w, buyer);
  if (!weak) return;
  const budget = Math.max(0, buyer.balance * 0.45);
  if (budget < 300_000) return;
  const maxOvr = buyer.level + 6;
  const candidates: Player[] = [];
  for (const p of Object.values(w.players)) {
    if (!p.clubId || p.clubId === buyer.id || p.clubId === w.userClubId || p.youth || p.loan) continue;
    if (p.pos !== weak.pos && !p.sec.includes(weak.pos)) continue;
    if (p.ovr < weak.ovr + 3 || p.ovr > maxOvr) continue;
    if (age(p, w.season) > 31) continue;
    const seller = w.clubs[p.clubId];
    if (seller.rep > buyer.rep + 8 && !p.listed) continue;
    candidates.push(p);
  }
  if (!candidates.length) return;
  shuffle(candidates);
  for (const p of candidates.slice(0, 6)) {
    const fee = askingPrice(w, p);
    if (fee > budget) continue;
    const seller = w.clubs[p.clubId!];
    if (squadOf(w, seller).length <= 20) continue;
    if (!playerWillingness(w, p, buyer).ok) continue;
    const wage = wageDemand(w, p, buyer);
    completeTransfer(w, p, buyer, fee, wage, randInt(2, 4));
    if (seller.div !== "F" || buyer.div !== "F") {
      if (p.ovr >= 77 || fee >= 25_000_000 || p.legend) {
        addNews(w, "transfer", `${p.name} troca ${seller.name} pelo ${buyer.name}`, `Negócio fechado por ${formatMoney(fee)}. O ${posLabel(p.pos)} de ${age(p, w.season)} anos assina até ${p.contractEnd}.`, { pid: p.id, clubId: buyer.id });
      }
    }
    // o vendedor repõe a peça com um jogador mais barato se precisar
    if (squadOf(w, seller).length < 22) aiSignFree(w, seller);
    return;
  }
}

const posLabel = (p: Pos) => ({ GOL: "goleiro", ZAG: "zagueiro", LD: "lateral", LE: "lateral", VOL: "volante", MC: "meio-campista", MEI: "meia", PD: "ponta", PE: "ponta", ATA: "atacante" })[p];

export function aiSignFree(w: World, club: Club) {
  const need = weakestSlot(w, club);
  const frees = Object.values(w.players).filter((p) => !p.clubId && p.ovr <= club.level + 4 && age(p, w.season) <= 34);
  frees.sort((a, b) => (b.pos === need?.pos ? 5 : 0) + b.ovr - ((a.pos === need?.pos ? 5 : 0) + a.ovr));
  const p = frees[0];
  if (p && p.ovr >= club.level - 10) {
    completeTransfer(w, p, club, 0, wageDemand(w, p, club), randInt(1, 2));
  } else {
    generatePlayer(w, club, club.level - 3, randInt(21, 29), need?.pos);
  }
}

/** Propostas da IA pelos jogadores do usuário. */
function aiOffersForUser(w: World) {
  const user = w.clubs[w.userClubId];
  for (const id of user.players) {
    const p = w.players[id];
    if (!p || p.youth || p.loan) continue;
    if (w.offers.some((o) => o.pid === p.id && o.status === "pending")) continue;
    let prob = p.listed ? 0.07 : Math.max(0, (p.ovr - user.level - 2) * 0.0015) + (p.legend && p.ovr > 75 ? 0.01 : 0);
    if (p.wantsOut) prob = Math.max(prob, 0.005) * 4; // quem pediu para sair atrai propostas
    if (!chance(prob)) continue;
    const value = playerValue(p, w.season);
    const buyers = Object.values(w.clubs).filter((c) => c.id !== user.id && c.rep >= user.rep - 12 && c.balance > value * 0.9 && c.level + 8 >= p.ovr);
    if (!buyers.length) continue;
    const buyer = pick(buyers);
    const fee = roundMoney(value * (p.listed ? 0.8 + rand() * 0.3 : 1 + rand() * 0.45));
    const offer: TransferOffer = { id: w.nextId++, pid: p.id, from: buyer.id, to: user.id, fee, status: "pending", day: w.day, season: w.season, byUser: false };
    w.offers.push(offer);
    addNews(w, "offer", `Proposta por ${p.name}`, `O ${buyer.name} oferece ${formatMoney(fee)} pelo ${posLabel(p.pos)}. Responda no Mercado em até 10 dias.`, { pid: p.id, clubId: buyer.id });
  }
  clauseDay(w);
}

/** Valor que entra no caixa ao aceitar com % de revenda (cada 10% de revenda custa 5% da oferta). */
export const feeWithSellOn = (fee: number, pct: number) => roundMoney(fee * (1 - pct * 0.5));

export function acceptOffer(w: World, offer: TransferOffer, sellOnPct = 0) {
  const p = w.players[offer.pid];
  const buyer = w.clubs[offer.from];
  if (!p || !buyer || p.clubId !== offer.to || p.loan) { offer.status = "expired"; return; }
  const idol = hidOf(p)[H.loy] >= 16 && seasonsAtClub(w, p) >= 4;
  const fee = sellOnPct > 0 ? feeWithSellOn(offer.fee, sellOnPct) : offer.fee;
  offer.fee = fee;
  completeTransfer(w, p, buyer, fee, wageDemand(w, p, buyer), randInt(2, 4));
  if (sellOnPct > 0) p.sellOn = { club: offer.to, pct: sellOnPct };
  offer.status = "done";
  addNews(w, "transfer", `${p.name} vendido ao ${buyer.name}`, `Você recebeu ${formatMoney(fee)} pela venda.${sellOnPct > 0 ? ` E fica com ${Math.round(sellOnPct * 100)}% de uma futura venda.` : ""}`, { pid: p.id, clubId: buyer.id });
  if (idol && offer.to === w.userClubId) idolSold(w, p);
}

export function expireOffers(w: World) {
  for (const o of w.offers) if (o.status === "pending" && (o.season !== w.season || w.day - o.day > 10)) o.status = "expired";
  if (w.offers.length > 60) w.offers = w.offers.filter((o) => o.status === "pending").concat(w.offers.filter((o) => o.status !== "pending").slice(-30));
}

/** Busca no mercado para a tela do usuário. */
export interface MarketFilter {
  pos?: Pos | "";
  maxAge?: number;
  minOvr?: number;
  maxValue?: number;
  freeOnly?: boolean;
  listedOnly?: boolean;
  legendsOnly?: boolean;
  query?: string;
  scope?: "all" | "br" | "foreign";
  trait?: TraitId | ""; // jogada preferida (só aparece quem você conhece o bastante)
}

export function searchMarket(w: World, f: MarketFilter, limit = 60): Player[] {
  const out: Player[] = [];
  const q = f.query?.trim().toLowerCase();
  for (const p of Object.values(w.players)) {
    if (p.clubId === w.userClubId) continue;
    if (p.loan && !q) continue; // emprestados só aparecem buscando pelo nome
    if (f.freeOnly && p.clubId) continue;
    if (f.listedOnly && !p.listed) continue;
    if (f.legendsOnly && !p.legend) continue;
    if (f.pos && p.pos !== f.pos) continue;
    if (f.maxAge && age(p, w.season) > f.maxAge) continue;
    if (f.minOvr && p.ovr < f.minOvr) continue;
    if (q && !p.name.toLowerCase().includes(q)) continue;
    if (f.scope === "br" && p.clubId && w.clubs[p.clubId].country !== "BRA") continue;
    if (f.scope === "foreign" && (!p.clubId || w.clubs[p.clubId].country === "BRA")) continue;
    if (f.maxValue && playerValue(p, w.season) > f.maxValue) continue;
    if (f.trait && (!hasTrait(p, f.trait) || knowledgeOf(w, p) < TRAITS_K)) continue;
    out.push(p);
  }
  out.sort((a, b) => b.ovr - a.ovr || POS_ORDER[a.pos] - POS_ORDER[b.pos]);
  return out.slice(0, limit);
}
