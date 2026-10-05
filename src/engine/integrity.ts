// Integridade do save: verificação (validateWorld) e reparo (repairWorld).
// O clubId de cada jogador é a fonte da verdade; as listas dos clubes são reconstruídas a partir dele.
import { rollHidden } from "./personality";
import { rawOvr, recalcOvr } from "./positions";
import { clamp } from "./rng";
import { TRAIT_IDS } from "./traits";
import type { Attrs, Club, Player, TraitId, World } from "./types";

const ATTR_KEYS: (keyof Attrs)[] = ["vel", "fin", "pas", "dri", "def", "fis", "gol"];
const TRAIT_SET = new Set<string>(TRAIT_IDS);
const MAX_TRAITS = 5;

const isInt = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

function badTraits(list: TraitId[] | undefined): boolean {
  if (!list) return false;
  if (!Array.isArray(list) || list.length > MAX_TRAITS) return true;
  return list.some((t, i) => !TRAIT_SET.has(t) || list.indexOf(t) !== i);
}

function badHid(p: Player): boolean {
  if (p.hid === undefined) return false;
  return !Array.isArray(p.hid) || p.hid.length !== 7 || p.hid.some((v) => !isInt(v, 1, 20));
}

function levelOk(v: number | undefined) {
  return v === undefined || isInt(v, 1, 5);
}

/** Lista os problemas de consistência do mundo (vazia = tudo certo). */
export function validateWorld(w: World): string[] {
  const out: string[] = [];
  const err = (s: string) => { if (out.length < 200) out.push(s); };
  const seen = new Map<number, string>();

  for (const c of Object.values(w.clubs)) {
    const ids = new Set<number>();
    for (const id of c.players) {
      const p = w.players[id];
      // (1) ids do elenco existem e apontam para o clube
      if (!p) { err(`${c.id}: jogador ${id} não existe`); continue; }
      if (p.clubId !== c.id) err(`${c.id}: jogador ${id} tem clubId ${p.clubId}`);
      if (ids.has(id)) err(`${c.id}: jogador ${id} repetido`);
      ids.add(id);
      // (2) em um único clube
      const other = seen.get(id);
      if (other && other !== c.id) err(`jogador ${id} está em ${other} e ${c.id}`);
      seen.set(id, c.id);
    }
    // (3) escalação
    if (c.lineup) {
      for (const id of [...c.lineup.starters, ...c.lineup.bench]) if (id != null && !ids.has(id)) err(`${c.id}: escalação com jogador ${id} de fora`);
      if (c.lineup.captain != null && !ids.has(c.lineup.captain)) err(`${c.id}: capitão ${c.lineup.captain} de fora`);
    }
    // (11) níveis do clube
    if (!levelOk(c.youthLevel) || !levelOk(c.facilities) || !levelOk(c.youthFac) || !levelOk(c.youthCoach)) err(`${c.id}: nível fora de 1-5`);
    if (c.chem !== undefined && !(c.chem >= 0 && c.chem <= 100)) err(`${c.id}: entrosamento fora de 0-100`);
    // (7) emprestados
    for (const id of c.loanedOut ?? []) if (w.players[id]?.loan?.from !== c.id) err(`${c.id}: emprestado ${id} sem empréstimo correspondente`);
  }

  let maxId = 0;
  for (const p of Object.values(w.players)) {
    maxId = Math.max(maxId, p.id);
    // (2) quem tem clube aparece na lista dele
    if (p.clubId) {
      if (!w.clubs[p.clubId]) err(`jogador ${p.id}: clube ${p.clubId} não existe`);
      else if (seen.get(p.id) !== p.clubId) err(`jogador ${p.id}: fora da lista do ${p.clubId}`);
    }
    // (5) atributos, overall e potencial
    if (ATTR_KEYS.some((k) => !isInt(p.attrs[k], 1, 99))) err(`jogador ${p.id}: atributo inválido`);
    else if (!p.real && Math.abs(p.ovr - rawOvr(p.attrs, p.pos)) > 1) err(`jogador ${p.id}: overall ${p.ovr} não bate com os atributos`);
    if (!(p.pot >= p.ovr)) err(`jogador ${p.id}: potencial abaixo do overall`);
    // (6) jogadas e atributos ocultos
    if (badTraits(p.traits) || badTraits(p.lockedTraits)) err(`jogador ${p.id}: jogadas inválidas`);
    if (badHid(p)) err(`jogador ${p.id}: atributos ocultos inválidos`);
    // (7) empréstimos
    if (p.loan) {
      const from = w.clubs[p.loan.from];
      if (!from || p.clubId === p.loan.from) err(`jogador ${p.id}: empréstimo inconsistente`);
      else if (!from.loanedOut?.includes(p.id)) err(`jogador ${p.id}: fora da lista de emprestados do ${p.loan.from}`);
    }
  }

  // (4) lendas ativas
  for (const [id, st] of Object.entries(w.legends)) {
    if (st.active != null && w.players[st.active]?.legend !== id) err(`lenda ${id}: ativa aponta para ${st.active}`);
  }

  // (8) peneira fora do mundo; (9) nextPid
  for (const k of w.peneira?.kids ?? []) {
    maxId = Math.max(maxId, k.id);
    if (w.players[k.id]) err(`peneira: garoto ${k.id} também está em w.players`);
    if (seen.has(k.id)) err(`peneira: garoto ${k.id} está num clube`);
  }
  if (!(w.nextPid > maxId)) err(`nextPid ${w.nextPid} <= maior id ${maxId}`);

  // (10) referências
  for (const o of w.offers) if (o.status === "pending" && !w.players[o.pid]) err(`proposta ${o.id}: jogador ${o.pid} não existe`);
  for (const id of w.shortlist) if (!w.players[id]) err(`observados: jogador ${id} não existe`);
  if (w.scout) {
    for (const id of Object.keys(w.scout.k)) if (!w.players[Number(id)]) err(`olheiros: conhecimento de ${id} que não existe`);
    for (const id of [...w.scout.queue, ...w.scout.recs]) if (!w.players[id]) err(`olheiros: jogador ${id} não existe`);
  }

  // (11) comissão técnica
  for (const s of Object.values(w.staff ?? {})) if (s && !isInt(s.stars, 1, 5)) err(`comissão: ${s.role} com ${s.stars} estrelas`);
  return out;
}

/** Conserta o que for possível e devolve o número de correções feitas. */
export function repairWorld(w: World): number {
  let fixes = 0;

  // jogadores com clube inexistente ficam livres
  for (const p of Object.values(w.players)) {
    if (p.clubId && !w.clubs[p.clubId]) { p.clubId = null; fixes++; }
  }

  // reconstrói as listas dos clubes a partir do clubId (mantendo a ordem dos ids que já estavam lá)
  const byClub = new Map<string, number[]>();
  for (const p of Object.values(w.players)) {
    if (!p.clubId) continue;
    let l = byClub.get(p.clubId);
    if (!l) byClub.set(p.clubId, (l = []));
    l.push(p.id);
  }
  for (const c of Object.values(w.clubs)) {
    const mine = new Set(byClub.get(c.id) ?? []);
    const kept: number[] = [];
    const used = new Set<number>();
    for (const id of c.players) {
      if (mine.has(id) && !used.has(id)) { kept.push(id); used.add(id); }
    }
    for (const id of byClub.get(c.id) ?? []) if (!used.has(id)) { kept.push(id); used.add(id); }
    if (kept.length !== c.players.length || kept.some((id, i) => id !== c.players[i])) {
      fixes += Math.max(1, Math.abs(kept.length - c.players.length));
      c.players = kept;
    }
    fixes += repairLineup(c, used);
    fixes += clampLevels(c);
  }

  // lendas ativas
  for (const [id, st] of Object.entries(w.legends)) {
    if (st.active != null && w.players[st.active]?.legend !== id) { st.active = undefined; fixes++; }
  }

  // jogadores: atributos, overall, potencial, jogadas, ocultos
  for (const p of Object.values(w.players)) fixes += repairPlayer(w, p);

  // empréstimos
  for (const c of Object.values(w.clubs)) {
    if (!c.loanedOut) continue;
    const ok = c.loanedOut.filter((id, i, a) => w.players[id]?.loan?.from === c.id && a.indexOf(id) === i);
    if (ok.length !== c.loanedOut.length) { fixes += c.loanedOut.length - ok.length; c.loanedOut = ok; }
  }
  for (const p of Object.values(w.players)) {
    if (!p.loan) continue;
    const from = w.clubs[p.loan.from];
    if (!from || p.clubId === p.loan.from || !p.clubId) {
      if (from?.loanedOut) from.loanedOut = from.loanedOut.filter((id) => id !== p.id);
      delete p.loan;
      fixes++;
    } else if (!from.loanedOut?.includes(p.id)) {
      (from.loanedOut ??= []).push(p.id);
      fixes++;
    }
  }

  // peneira: garotos não podem estar no mundo
  if (w.peneira) {
    const kids = w.peneira.kids.filter((k) => !w.players[k.id]);
    if (kids.length !== w.peneira.kids.length) { fixes += w.peneira.kids.length - kids.length; w.peneira.kids = kids; }
    for (const k of kids) fixes += repairPlayer(w, k);
  }

  // nextPid
  let maxId = 0;
  for (const p of Object.values(w.players)) maxId = Math.max(maxId, p.id);
  for (const k of w.peneira?.kids ?? []) maxId = Math.max(maxId, k.id);
  if (!(w.nextPid > maxId)) { w.nextPid = maxId + 1; fixes++; }

  // referências soltas
  const offers = w.offers.filter((o) => !!w.players[o.pid]);
  if (offers.length !== w.offers.length) { fixes += w.offers.length - offers.length; w.offers = offers; }
  const short = w.shortlist.filter((id, i, a) => !!w.players[id] && a.indexOf(id) === i);
  if (short.length !== w.shortlist.length) { fixes += w.shortlist.length - short.length; w.shortlist = short; }
  if (w.scout) {
    for (const id of Object.keys(w.scout.k)) if (!w.players[Number(id)]) { delete w.scout.k[Number(id)]; fixes++; }
    const q = w.scout.queue.filter((id) => !!w.players[id]);
    const r = w.scout.recs.filter((id) => !!w.players[id]);
    fixes += w.scout.queue.length - q.length + w.scout.recs.length - r.length;
    w.scout.queue = q;
    w.scout.recs = r;
  }

  // comissão técnica
  for (const s of Object.values(w.staff ?? {})) {
    if (s && !isInt(s.stars, 1, 5)) { s.stars = clamp(Math.round(Number(s.stars) || 3), 1, 5); fixes++; }
  }
  return fixes;
}

function repairLineup(c: Club, ids: Set<number>): number {
  const l = c.lineup;
  if (!l) return 0;
  let fixes = 0;
  l.starters = l.starters.map((id) => {
    if (id != null && !ids.has(id)) { fixes++; return null; }
    return id;
  });
  const bench = l.bench.filter((id) => ids.has(id));
  if (bench.length !== l.bench.length) { fixes += l.bench.length - bench.length; l.bench = bench; }
  if (l.captain != null && !ids.has(l.captain)) { l.captain = undefined; fixes++; }
  return fixes;
}

function clampLevels(c: Club): number {
  let fixes = 0;
  const fix = (v: number) => clamp(Math.round(Number(v) || 1), 1, 5);
  if (!levelOk(c.youthLevel)) { c.youthLevel = fix(c.youthLevel); fixes++; }
  if (!levelOk(c.facilities)) { c.facilities = fix(c.facilities); fixes++; }
  if (!levelOk(c.youthFac)) { c.youthFac = fix(c.youthFac!); fixes++; }
  if (!levelOk(c.youthCoach)) { c.youthCoach = fix(c.youthCoach!); fixes++; }
  if (c.chem !== undefined && !(c.chem >= 0 && c.chem <= 100)) { c.chem = clamp(Number(c.chem) || 70, 0, 100); fixes++; }
  return fixes;
}

function repairPlayer(w: World, p: Player): number {
  let fixes = 0;
  let attrsChanged = false;
  for (const k of ATTR_KEYS) {
    const v = p.attrs[k];
    if (!isInt(v, 1, 99)) { p.attrs[k] = clamp(Math.round(Number(v) || 1), 1, 99); attrsChanged = true; fixes++; }
  }
  if (!p.real && (attrsChanged || Math.abs(p.ovr - rawOvr(p.attrs, p.pos)) > 1)) {
    recalcOvr(p);
    if (!attrsChanged) fixes++;
  }
  if (!(p.pot >= p.ovr)) { p.pot = p.ovr; fixes++; }
  const cleanTraits = (list: TraitId[]) => list.filter((t, i) => TRAIT_SET.has(t) && list.indexOf(t) === i).slice(0, MAX_TRAITS);
  if (p.traits !== undefined && badTraits(p.traits)) { p.traits = Array.isArray(p.traits) ? cleanTraits(p.traits) : []; fixes++; }
  if (p.lockedTraits !== undefined && badTraits(p.lockedTraits)) { p.lockedTraits = Array.isArray(p.lockedTraits) ? cleanTraits(p.lockedTraits) : []; fixes++; }
  if (badHid(p)) {
    if (Array.isArray(p.hid) && p.hid.length === 7) p.hid = p.hid.map((v) => clamp(Math.round(Number(v) || 10), 1, 20)) as Player["hid"];
    else p.hid = rollHidden(w, p);
    fixes++;
  }
  return fixes;
}
