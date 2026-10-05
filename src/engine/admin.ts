// Modo Administrador: trapaças no próprio save offline ("dar uma burladinha").
// Toda operação passa por markAdmin (marca a temporada com 🛠️) e nunca lança erro:
// entrada inválida devolve { ok: false } sem mexer no mundo.
import { LEGEND_BY_ID, type LegendDef } from "../data/legends";
import { finishAllProjects } from "./board";
import { inWindow } from "./calendar";
import { sortTable } from "./competitions";
import { withWorldRng } from "./common";
import { addExpense, addIncome, formatMoney } from "./finance";
import { repairWorld } from "./integrity";
import { returnIfLoaned } from "./loans";
import { fitAttrs, makeAttrs, newPlayerBase, wageFor } from "./player";
import { POSITIONS, recalcOvr } from "./positions";
import { fireAndRehire } from "./season";
import { allStaffFive, setStaffStars, STAFF_INFO } from "./staff";
import { TRAIT_IDS } from "./traits";
import { askingPrice, completeTransfer, releasePlayer, wageDemand } from "./transfers";
import type { AdminCheats, AdminState, Attrs, Club, Div, Hidden, IntakeQuality, Player, Pos, StaffRole, TraitId, World } from "./types";
import { intakeForClub, legendWave, spawnLegend } from "./youth";

const NONE: AdminCheats = Object.freeze({}) as AdminCheats;

/** Trapaças ativas (vazio quando o Modo Administrador está desligado). */
export function adminCheats(w: World): AdminCheats {
  return w.admin?.on ? w.admin.cheats : NONE;
}

/** A janela está aberta para o usuário? (sempre, com a trapaça "janela aberta") */
export function userWindowOpen(w: World): boolean {
  return inWindow(w.day) || !!adminCheats(w).window;
}

export interface AdminResult { ok: boolean; msg: string }

/** Registra uma ação do administrador (marca o save e a temporada com 🛠️). */
export function markAdmin(w: World, text: string): AdminResult {
  const a = (w.admin ??= { on: true, seasons: [], cheats: {}, log: [] });
  a.everUsed = true;
  if (!a.seasons.includes(w.season)) a.seasons.push(w.season);
  a.log.push({ season: w.season, day: w.day, text });
  if (a.log.length > 100) a.log.splice(0, a.log.length - 100);
  return { ok: true, msg: text };
}

const fail = (msg: string): AdminResult => ({ ok: false, msg });
const ok = (n: unknown, lo: number, hi: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
/** "R$ 10 mi" em vez de "R$ 10,0 mi". */
export const money = (v: number) => formatMoney(v).replace(",0 ", " ");
const userClub = (w: World) => w.clubs[w.userClubId];

// ---------------------------------------------------------------- ligar / senha
function state(w: World): AdminState {
  return (w.admin ??= { on: false, seasons: [], cheats: {}, log: [] });
}

/** Liga ou desliga o modo (ligar não marca a temporada; usar uma ferramenta marca). */
export function adminSetOn(w: World, on: boolean, pin?: string) {
  const a = state(w);
  a.on = on;
  if (on && pin && /^\d{4}$/.test(pin)) a.pin = pin;
}

export function adminSetPin(w: World, pin: string): AdminResult {
  if (!/^\d{4}$/.test(pin)) return fail("A senha precisa ter 4 números.");
  state(w).pin = pin;
  return { ok: true, msg: "Senha criada." };
}

export function adminClearPin(w: World): AdminResult {
  if (w.admin) delete w.admin.pin;
  return { ok: true, msg: "Senha removida." };
}

/** "Esqueci a senha": confere o nome do treinador (sem diferenciar maiúsculas). */
export function adminForgotPin(w: World, managerName: string): boolean {
  if (managerName.trim().toLowerCase() !== w.managerName.trim().toLowerCase()) return false;
  adminClearPin(w);
  return true;
}

// ---------------------------------------------------------------- desfazer (só na memória)
interface UndoEntry { saveId: string; label: string; kind: "player" | "club"; id: string | number; before: string }
let undoStack: UndoEntry[] = [];

function pushUndo(w: World, kind: UndoEntry["kind"], id: string | number, label: string, obj: object) {
  undoStack.push({ saveId: w.saveId, label, kind, id, before: JSON.stringify(obj) });
  if (undoStack.length > 10) undoStack.shift();
}

/** Esquece as edições (ao abrir outro jogo). */
export function clearAdminUndo() {
  undoStack = [];
}

/** Última edição que dá para desfazer (ou null). */
export function lastUndo(w: World): { label: string } | null {
  const e = undoStack[undoStack.length - 1];
  if (!e || e.saveId !== w.saveId) return null;
  const alive = e.kind === "player" ? !!w.players[e.id as number] : !!w.clubs[e.id as string];
  return alive ? { label: e.label } : null;
}

export function adminUndo(w: World): AdminResult {
  const e = undoStack[undoStack.length - 1];
  if (!e || e.saveId !== w.saveId) return fail("Nada para desfazer.");
  const target: Record<string, unknown> | undefined =
    e.kind === "player" ? (w.players[e.id as number] as unknown as Record<string, unknown>) : (w.clubs[e.id as string] as unknown as Record<string, unknown>);
  if (!target) return fail("Não dá para desfazer: ele não existe mais.");
  undoStack.pop();
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, JSON.parse(e.before));
  repairWorld(w);
  return markAdmin(w, `Desfez: ${e.label}`);
}

// ---------------------------------------------------------------- clube
export function adminMoney(w: World, clubId: string, op: { add?: number; set?: number }): AdminResult {
  const c = w.clubs[clubId];
  if (!c) return fail("Clube não encontrado.");
  const LIM = 10_000_000_000;
  let target: number;
  if (op.set !== undefined) {
    if (!ok(op.set, -1e15, 1e15)) return fail("Valor inválido.");
    target = Math.max(-LIM, Math.min(LIM, Math.round(op.set)));
  } else if (op.add !== undefined) {
    if (!ok(op.add, -1e15, 1e15)) return fail("Valor inválido.");
    target = Math.max(-LIM, Math.min(LIM, Math.round(c.balance + op.add)));
  } else return fail("Nada a fazer.");
  const delta = target - c.balance;
  if (!delta) return fail("O saldo já é esse.");
  const label = op.set !== undefined ? `Saldo definido em ${money(target)} (${c.name})` : `Saldo ${delta > 0 ? "+" : "−"}${money(Math.abs(delta))} (${c.name})`;
  pushUndo(w, "club", c.id, label, c);
  if (delta > 0) addIncome(c, "admin", delta);
  else addExpense(c, "admin", -delta);
  return markAdmin(w, label);
}

export type ClubPatch = Partial<Pick<Club, "rep" | "capacity" | "ticket" | "facilities" | "youthLevel" | "youthFac" | "youthCoach">>;
const CLUB_LIMITS: Record<keyof ClubPatch, [number, number, string]> = {
  rep: [1, 100, "reputação"],
  capacity: [1000, 120_000, "capacidade"],
  ticket: [5, 300, "ingresso"],
  facilities: [1, 5, "CT"],
  youthLevel: [1, 5, "captação da base"],
  youthFac: [1, 5, "instalações da base"],
  youthCoach: [1, 5, "treinadores da base"],
};

export function adminClub(w: World, clubId: string, patch: ClubPatch): AdminResult {
  const c = w.clubs[clubId];
  if (!c) return fail("Clube não encontrado.");
  const keys = Object.keys(patch).filter((k) => k in CLUB_LIMITS) as (keyof ClubPatch)[];
  if (!keys.length) return fail("Nada a mudar.");
  for (const k of keys) if (typeof patch[k] !== "number" || !Number.isFinite(patch[k])) return fail("Valor inválido.");
  const changed = keys.filter((k) => Math.round(patch[k]!) !== c[k]);
  if (!changed.length) return fail("Nada mudou.");
  const label = `${c.name}: ${changed.map((k) => `${CLUB_LIMITS[k][2]} ${clampTo(patch[k]!, k)}`).join(", ")}`;
  pushUndo(w, "club", c.id, label, c);
  for (const k of changed) c[k] = clampTo(patch[k]!, k);
  repairWorld(w);
  return markAdmin(w, label);
}

function clampTo(v: number, k: keyof ClubPatch): number {
  const [lo, hi] = CLUB_LIMITS[k];
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** Objetivos da diretoria por divisão (mesmos textos do setBoardObjective). */
export const OBJECTIVES: Record<string, string> = {
  "A-title": "Brigar pelo título (terminar entre os 3)",
  "A-lib": "Vaga na Libertadores (terminar entre os 6)",
  "A-sula": "Vaga na Sul-Americana (terminar entre os 12)",
  "A-stay": "Evitar o rebaixamento (terminar até 16º)",
  "B-up": "Subir para a Série A",
  "B-mid": "Brigar pelo acesso (terminar entre os 8)",
  "B-stay": "Evitar o rebaixamento (terminar até 16º)",
  "C-up": "Conquistar o acesso à Série B",
  "C-stay": "Evitar o rebaixamento (terminar até 18º)",
  mid: "Fazer uma campanha segura",
};
export const objectivesFor = (div: Div): string[] => {
  const list = Object.keys(OBJECTIVES).filter((k) => k.startsWith(`${div}-`));
  return list.length ? list : ["mid"];
};

export function adminBoard(w: World, conf?: number, objectiveCode?: string): AdminResult {
  const parts: string[] = [];
  if (conf !== undefined) {
    if (!ok(conf, 0, 100)) return fail("Confiança inválida.");
    w.board.confidence = Math.round(conf);
    parts.push(`confiança ${Math.round(conf)}%`);
  }
  if (objectiveCode !== undefined) {
    if (!OBJECTIVES[objectiveCode]) return fail("Objetivo inválido.");
    w.board.objectiveCode = objectiveCode;
    w.board.objective = OBJECTIVES[objectiveCode];
    parts.push(`objetivo "${w.board.objective}"`);
  }
  if (!parts.length) return fail("Nada a mudar.");
  return markAdmin(w, `Diretoria: ${parts.join(", ")}`);
}

export function adminStaffStars(w: World, role: StaffRole, stars: number): AdminResult {
  if (!ok(stars, 1, 5) || !STAFF_INFO[role]) return fail("Valor inválido.");
  setStaffStars(w, role, stars);
  return markAdmin(w, `${STAFF_INFO[role].label}: ${Math.round(stars)}★`);
}

export function adminAllStaffFive(w: World): AdminResult {
  allStaffFive(w);
  return markAdmin(w, "Comissão técnica toda 5★");
}

export function adminFinishProjects(w: World, clubId = w.userClubId): AdminResult {
  const n = finishAllProjects(w, clubId);
  if (!n) return fail("Não há obras em andamento.");
  return markAdmin(w, `${n} obra${n > 1 ? "s" : ""} concluída${n > 1 ? "s" : ""} na hora`);
}

/** Assume outro clube na hora (sem demissão; as notícias ficam). */
export function adminTakeOver(w: World, clubId: string): AdminResult {
  const c = w.clubs[clubId];
  if (!c) return fail("Clube não encontrado.");
  if (clubId === w.userClubId) return fail("Você já treina esse clube.");
  w.pendingMatch = undefined;
  fireAndRehire(w, clubId);
  return markAdmin(w, `Assumiu o ${c.name}`);
}

// ---------------------------------------------------------------- elenco do usuário
export type SquadOp = "heal" | "cond" | "morale" | "cards" | "renew";
const SQUAD_TEXT: Record<SquadOp, string> = {
  heal: "🚑 Elenco curado",
  cond: "🔋 Condição 100% para todos",
  morale: "😄 Moral máxima para todos",
  cards: "🟨 Cartões e suspensões zerados",
  renew: "📝 Todos renovados por +2 anos",
};

export function adminSquad(w: World, op: SquadOp): AdminResult {
  if (!SQUAD_TEXT[op]) return fail("Operação inválida.");
  for (const id of userClub(w).players) {
    const p = w.players[id];
    if (!p) continue;
    if (op === "heal") { p.injury = 0; p.injuryName = undefined; }
    else if (op === "cond") p.cond = 100;
    else if (op === "morale") p.morale = 100;
    else if (op === "cards") { p.yel = {}; p.bans = {}; }
    else p.contractEnd = Math.min(w.season + 7, Math.max(p.contractEnd, w.season) + 2);
  }
  return markAdmin(w, SQUAD_TEXT[op]);
}

// ---------------------------------------------------------------- jogadores
export interface AdminPlayerPatch {
  name?: string;
  nat?: string;
  age?: number;
  height?: number;
  foot?: Player["foot"];
  pos?: Pos;
  sec?: Pos[];
  attrs?: Partial<Attrs>;
  ovrTarget?: number; // ajusta os atributos para este overall na posição
  pot?: number;
  traits?: TraitId[];
  hid?: number[];
  morale?: number;
  cond?: number;
  fame?: number;
  heal?: boolean;
  clearCards?: boolean;
  wage?: number;
  contractEnd?: number;
  clause?: number;
}

const ATTR_KEYS: (keyof Attrs)[] = ["vel", "fin", "pas", "dri", "def", "fis", "gol"];

function validatePatch(w: World, x: AdminPlayerPatch): string | null {
  if (x.name !== undefined && (typeof x.name !== "string" || x.name.trim().length > 40)) return "Nome inválido (até 40 letras).";
  if (x.nat !== undefined && !/^[A-Z]{3}$/.test(x.nat)) return "Nacionalidade inválida.";
  if (x.age !== undefined && !ok(x.age, 15, 45)) return "Idade deve ficar entre 15 e 45.";
  if (x.height !== undefined && !ok(x.height, 150, 210)) return "Altura deve ficar entre 150 e 210 cm.";
  if (x.foot !== undefined && !["D", "E", "A"].includes(x.foot)) return "Pé inválido.";
  if (x.pos !== undefined && !POSITIONS.includes(x.pos)) return "Posição inválida.";
  if (x.sec !== undefined && (!Array.isArray(x.sec) || x.sec.some((s) => !POSITIONS.includes(s)))) return "Posição secundária inválida.";
  if (x.attrs) for (const [k, v] of Object.entries(x.attrs)) if (!ATTR_KEYS.includes(k as keyof Attrs) || !ok(v, 1, 99)) return "Atributos vão de 1 a 99.";
  if (x.ovrTarget !== undefined && !ok(x.ovrTarget, 1, 99)) return "Overall vai de 1 a 99.";
  if (x.pot !== undefined && !ok(x.pot, 1, 99)) return "Potencial vai de 1 a 99.";
  if (x.traits !== undefined && !Array.isArray(x.traits)) return "Jogadas inválidas.";
  if (x.hid !== undefined && (!Array.isArray(x.hid) || x.hid.length !== 7 || x.hid.some((v) => !ok(v, 1, 20)))) return "Atributos ocultos vão de 1 a 20.";
  for (const k of ["morale", "cond", "fame"] as const) if (x[k] !== undefined && !ok(x[k], 0, 100)) return "Valores de 0 a 100.";
  if (x.wage !== undefined && !ok(x.wage, 0, 1e9)) return "Salário inválido.";
  if (x.contractEnd !== undefined && !ok(x.contractEnd, w.season, w.season + 10)) return "Fim de contrato inválido.";
  if (x.clause !== undefined && !ok(x.clause, 0, 1e12)) return "Multa inválida.";
  return null;
}

/** Editor completo: valida tudo antes; nada muda se algo for inválido. */
export function adminEditPlayer(w: World, pid: number, x: AdminPlayerPatch): AdminResult {
  const p = w.players[pid];
  if (!p) return fail("Jogador não encontrado.");
  const err = validatePatch(w, x);
  if (err) return fail(err);
  pushUndo(w, "player", pid, `Edição de ${p.name}`, p);

  if (x.name?.trim()) p.name = x.name.trim();
  if (x.nat) p.nat = x.nat;
  if (x.age !== undefined) {
    p.born = w.season - Math.round(x.age);
    if (x.age > 20 && !p.legend) p.youth = false;
  }
  if (x.height !== undefined) p.height = Math.round(x.height);
  if (x.foot) p.foot = x.foot;
  if (x.pos) p.pos = x.pos;
  if (x.sec) p.sec = x.sec.filter((s, i, a) => a.indexOf(s) === i);
  p.sec = p.sec.filter((s) => s !== p.pos).slice(0, 3);
  if (x.attrs) for (const k of ATTR_KEYS) if (x.attrs[k] !== undefined) p.attrs[k] = Math.round(x.attrs[k]!);
  if (x.ovrTarget !== undefined) {
    const target = Math.round(x.ovrTarget);
    withWorldRng(w, () => fitAttrs(p.attrs, p.pos, target));
  }
  recalcOvr(p);
  p.pot = Math.max(Math.round(x.pot ?? p.pot), p.ovr);
  if (x.traits) {
    p.traits = x.traits.filter((t, i, a) => TRAIT_IDS.includes(t) && a.indexOf(t) === i).slice(0, 5);
    if (p.lockedTraits) p.lockedTraits = p.lockedTraits.filter((t) => !p.traits!.includes(t));
  }
  if (x.hid) p.hid = x.hid.map((v) => Math.round(v)) as Hidden;
  if (x.morale !== undefined) p.morale = Math.round(x.morale);
  if (x.cond !== undefined) p.cond = Math.round(x.cond);
  if (x.fame !== undefined) p.fame = Math.round(x.fame);
  if (x.heal) { p.injury = 0; p.injuryName = undefined; }
  if (x.clearCards) { p.yel = {}; p.bans = {}; }
  if (x.wage !== undefined) p.wage = Math.round(x.wage);
  if (x.contractEnd !== undefined) p.contractEnd = Math.round(x.contractEnd);
  if (x.clause !== undefined) {
    if (x.clause > 0) p.clause = Math.round(x.clause);
    else delete p.clause;
  }
  repairWorld(w);
  return markAdmin(w, `Editou ${p.name}`);
}

/** Transfere na hora (de graça ou pagando o valor). null = libera (fica livre). */
export function adminMovePlayer(w: World, pid: number, toClubId: string | null, pay = false): AdminResult {
  const p = w.players[pid];
  if (!p) return fail("Jogador não encontrado.");
  const club = toClubId ? w.clubs[toClubId] : null;
  if (toClubId && !club) return fail("Clube não encontrado.");
  if ((p.clubId ?? null) === (toClubId ?? null)) return fail(toClubId ? "Ele já joga nesse clube." : "Ele já está livre.");
  returnIfLoaned(w, p);
  let text: string;
  if (!club) {
    releasePlayer(w, p, false);
    text = `${p.name} liberado (agora está livre)`;
  } else if (p.clubId === club.id) {
    text = `${p.name} voltou ao ${club.name}`;
  } else {
    const fee = pay ? askingPrice(w, p) : 0;
    const wage = p.wage || wageDemand(w, p, club);
    completeTransfer(w, p, club, fee, wage, 3);
    text = `${p.name} transferido para o ${club.name}${fee ? ` por ${money(fee)}` : " de graça"}`;
  }
  repairWorld(w);
  return markAdmin(w, text);
}

/** Manda para a base ou sobe ao profissional. */
export function adminSetYouth(w: World, pid: number, youth: boolean): AdminResult {
  const p = w.players[pid];
  if (!p) return fail("Jogador não encontrado.");
  if (!p.clubId) return fail("Ele está sem clube.");
  if (p.youth === youth) return fail(youth ? "Ele já está na base." : "Ele já está no profissional.");
  p.youth = youth;
  repairWorld(w);
  return markAdmin(w, youth ? `${p.name} mandado para a base` : `${p.name} subiu ao profissional`);
}

/** Aposenta na hora (espelha a remoção do fim de temporada e limpa todas as referências). */
export function adminRetire(w: World, pid: number): AdminResult {
  const p = w.players[pid];
  if (!p) return fail("Jogador não encontrado.");
  for (const c of Object.values(w.clubs)) {
    if (c.players.includes(pid)) c.players = c.players.filter((id) => id !== pid);
    if (c.lineup) {
      if (c.lineup.starters.includes(pid)) c.lineup.starters = c.lineup.starters.map((x) => (x === pid ? null : x));
      if (c.lineup.bench.includes(pid)) c.lineup.bench = c.lineup.bench.filter((x) => x !== pid);
      if (c.lineup.captain === pid) c.lineup.captain = undefined;
    }
    if (c.loanedOut?.includes(pid)) c.loanedOut = c.loanedOut.filter((x) => x !== pid);
  }
  if (p.legend && w.legends[p.legend]?.active === pid) w.legends[p.legend].active = undefined;
  w.shortlist = w.shortlist.filter((x) => x !== pid);
  w.offers = w.offers.filter((o) => o.pid !== pid);
  if (w.scout) {
    delete w.scout.k[pid];
    w.scout.queue = w.scout.queue.filter((x) => x !== pid);
    w.scout.recs = w.scout.recs.filter((x) => x !== pid);
  }
  delete w.players[pid];
  repairWorld(w);
  return markAdmin(w, `${p.name} aposentado`);
}

export interface CreateSpec {
  name: string;
  pos: Pos;
  age: number;
  nat: string;
  ovr: number;
  pot: number;
  foot: Player["foot"];
  height: number;
  dest: "youth" | "squad" | "free" | { club: string };
}

export function adminCreatePlayer(w: World, s: CreateSpec): AdminResult & { pid?: number } {
  const name = (s.name ?? "").trim();
  if (!name || name.length > 40) return fail("Dê um nome (até 40 letras).");
  if (!POSITIONS.includes(s.pos)) return fail("Posição inválida.");
  if (!ok(s.age, 15, 40)) return fail("Idade entre 15 e 40.");
  if (!/^[A-Z]{3}$/.test(s.nat ?? "")) return fail("Nacionalidade inválida.");
  if (!ok(s.ovr, 30, 99)) return fail("Overall entre 30 e 99.");
  if (!ok(s.pot, 1, 99)) return fail("Potencial inválido.");
  if (!["D", "E", "A"].includes(s.foot)) return fail("Pé inválido.");
  if (!ok(s.height, 150, 210)) return fail("Altura entre 150 e 210 cm.");
  const club = s.dest === "free" ? null : typeof s.dest === "object" ? w.clubs[s.dest.club] : userClub(w);
  if (s.dest !== "free" && !club) return fail("Clube não encontrado.");
  const ageY = Math.round(s.age);
  const p = withWorldRng(w, () => {
    const attrs = makeAttrs(s.pos, Math.round(s.ovr), { height: Math.round(s.height), age: ageY });
    return newPlayerBase(w, { name, nat: s.nat, born: w.season - ageY, pos: s.pos, attrs, pot: Math.round(s.pot), foot: s.foot, height: Math.round(s.height), fame: s.ovr >= 80 ? 30 : 10 });
  });
  p.pot = Math.max(p.pot, p.ovr);
  if (club) {
    completeTransfer(w, p, club, 0, wageFor(p.ovr, club.rep, ageY), 3);
    if (s.dest === "youth" && ageY <= 20) p.youth = true;
  } else {
    p.freeSince = w.season;
    p.wage = wageFor(p.ovr, 50, ageY);
  }
  repairWorld(w);
  const where = !club ? "livre no mercado" : s.dest === "youth" && p.youth ? `na base do ${club.name}` : `no ${club.name}`;
  return { ...markAdmin(w, `Criou ${p.name} (${p.pos}, ${p.ovr}) ${where}`), pid: p.id };
}

// ---------------------------------------------------------------- lendas e base
export type LegendStatus = { k: "free" } | { k: "active"; pid: number; clubId: string | null } | { k: "waiting" };

export function legendStatus(w: World, def: LegendDef): LegendStatus {
  const st = w.legends[def.id];
  if (!st) return { k: "free" };
  const p = st.active != null ? w.players[st.active] : undefined;
  if (p) return { k: "active", pid: p.id, clubId: p.clubId };
  return { k: "waiting" };
}

/** Renasce uma lenda na base (ignora a espera de 15 anos; nunca duplica). */
export function adminSpawnLegend(w: World, legendId: string, clubId = w.userClubId): AdminResult & { pid?: number } {
  const def = LEGEND_BY_ID[legendId];
  const club = w.clubs[clubId];
  if (!def || !club) return fail("Lenda não encontrada.");
  const st = legendStatus(w, def);
  if (st.k === "active") return fail(`${def.name} já está ativo${st.clubId ? ` no ${w.clubs[st.clubId]?.name}` : " (livre)"}.`);
  const p = withWorldRng(w, () => spawnLegend(w, def, club));
  repairWorld(w);
  return { ...markAdmin(w, `⭐ Invocou ${def.name} na base do ${club.name}`), pid: p.id };
}

/** Nova peneira agora no clube do usuário. */
export function adminIntake(w: World, quality: IntakeQuality): AdminResult {
  if (!["fraca", "normal", "boa", "dourada"].includes(quality)) return fail("Qualidade inválida.");
  const kids = withWorldRng(w, () => intakeForClub(w, userClub(w), { quality, pending: true }));
  repairWorld(w);
  const pending = !!w.peneira?.kids.length;
  return markAdmin(w, `🌱 Peneira ${quality}: ${kids.length} garotos ${pending ? "esperando sua escolha na peneira" : "chegaram à base"}`);
}

export function adminForceGem(w: World): AdminResult {
  w.forceGem = true;
  return markAdmin(w, "💎 Joia rara garantida na próxima peneira");
}

/** Onda de lendas agora (com frequência mínima "média" se estiver desligada). */
export function adminLegendWave(w: World): AdminResult {
  const before = Object.values(w.legends).reduce((s, l) => s + l.appearances.length, 0);
  const freq = w.settings.legendFreq;
  if (!freq) w.settings.legendFreq = 2;
  try {
    withWorldRng(w, () => legendWave(w));
  } finally {
    w.settings.legendFreq = freq;
  }
  const n = Object.values(w.legends).reduce((s, l) => s + l.appearances.length, 0) - before;
  repairWorld(w);
  return markAdmin(w, n ? `⭐ Onda de lendas: ${n} renasceram` : "⭐ Onda de lendas: nenhuma lenda disponível");
}

// ---------------------------------------------------------------- mundo
/** Soma (ou tira) pontos de um clube numa liga/grupo e reordena a tabela. */
export function adminPoints(w: World, compId: string, clubId: string, delta: number): AdminResult {
  const comp = w.comps[compId];
  if (!comp || !ok(delta, -99, 99) || !Number.isInteger(delta)) return fail("Dados inválidos.");
  const rows = comp.table.some((r) => r.club === clubId) ? comp.table : comp.groups.find((g) => g.table.some((r) => r.club === clubId))?.table;
  const row = rows?.find((r) => r.club === clubId);
  if (!rows || !row) return fail("Clube não está nessa tabela.");
  row.pts += delta;
  sortTable(rows);
  return markAdmin(w, `${comp.short}: ${w.clubs[clubId]?.name ?? clubId} ${delta > 0 ? "+" : ""}${delta} ponto${Math.abs(delta) > 1 ? "s" : ""}`);
}

export const CHEATS: { key: Exclude<keyof AdminCheats, "boost">; label: string; desc: string }[] = [
  { key: "noInj", label: "Sem lesões no meu time", desc: "Seus jogadores não se machucam nos jogos." },
  { key: "noBans", label: "Sem suspensões no meu time", desc: "Cartões não geram suspensão para o seu time." },
  { key: "window", label: "Janela sempre aberta (só para mim)", desc: "Contrate a qualquer momento da temporada." },
  { key: "anyBid", label: "Clubes aceitam proposta ≥ 50% do valor", desc: "Ofereça metade do valor de mercado e leve." },
  { key: "willing", label: "Jogadores sempre topam vir", desc: "Ninguém recusa o seu clube por ser pequeno." },
  { key: "money", label: "Dinheiro infinito (saldo pode ficar negativo)", desc: "Compre e construa mesmo sem caixa." },
  { key: "noFire", label: "Nunca ser demitido", desc: "A diretoria nunca te manda embora." },
  { key: "youthTurbo", label: "Base turbo (garotos evoluem 2x)", desc: "Seus garotos da base evoluem o dobro." },
  { key: "legendRain", label: "Chuva de lendas (75% renascem no seu clube)", desc: "As lendas preferem a sua base." },
];
export const BOOSTS: (0 | 0.05 | 0.1 | 0.2)[] = [0, 0.05, 0.1, 0.2];

export function adminSetCheat<K extends keyof AdminCheats>(w: World, key: K, value: AdminCheats[K]): AdminResult {
  const a = state(w);
  if (key === "boost") {
    if (!BOOSTS.includes(value as 0)) return fail("Valor inválido.");
    a.cheats.boost = (value as AdminCheats["boost"]) || undefined;
    return markAdmin(w, value ? `Turbo do time +${Math.round((value as number) * 100)}%` : "Turbo do time desligado");
  }
  const info = CHEATS.find((c) => c.key === key);
  if (!info) return fail("Trapaça desconhecida.");
  if (value) a.cheats[key] = value;
  else delete a.cheats[key];
  return markAdmin(w, `${info.label}: ${value ? "ligado" : "desligado"}`);
}
