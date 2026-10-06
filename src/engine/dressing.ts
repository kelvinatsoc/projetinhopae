// Vestiário: papéis no elenco, minutos, conversas, promessas, pedidos de saída, entrosamento e líderes.
// chemOf é final (a IA sempre tem 70, neutro). Tudo aqui mexe só no clube do usuário.
import { absDay } from "./common";
import { defaultRole, ROLE_LABEL, ROLE_RANK, ROLE_SHARE, roleOf, seasonsAtClub } from "./contracts";
import { addNews } from "./news";
import { ensureLinks, growLinks, onLeaveLinks } from "./chemistry";
import { addFan } from "./narrative";
import { growFamiliarity } from "./tactics";
import { H, hidOf } from "./personality";
import { age } from "./player";
import { chance, clamp } from "./rng";
import { staffStars } from "./staff";
import { tacticalChemBonus } from "./training";
import { hasTrait } from "./traits";
import type { Club, Fixture, MatchResult, Player, SquadRole, World } from "./types";

/** Campos internos do vestiário guardados no próprio jogador (opcionais, só no clube do usuário). */
type MoodPlayer = Player & { gm?: number; bp?: number }; // gm = meses bons seguidos; bp = promessa quebrada nesta temporada

export const TALK_COOLDOWN = 21;
export const MAX_PROMISES = 3;

const userPlayers = (w: World, club: Club) =>
  club.players.map((id) => w.players[id]).filter((p): p is Player => !!p && !p.youth);

/** Moral com o piso de 30 para quem pediu para sair. */
export const moraleFloor = (p: Player) => (p.wantsOut ? 30 : 15);
const addMorale = (p: Player, d: number) => { p.morale = clamp(Math.round(p.morale + d), moraleFloor(p), 100); };

const addChem = (club: Club, d: number) => { club.chem = clamp((club.chem ?? 70) + d, 0, 100); };

/** Fatia de jogos (jogou / podia jogar). */
export function shareOf(p: Player): number | null {
  const pt = p.pt;
  if (!pt || pt[1] <= 0) return null;
  return pt[0] / pt[1];
}

/** Depois de cada partida do usuário (minutos, entrosamento). */
export function afterUserMatch(w: World, f: Fixture, r: MatchResult, userIdx: 0 | 1) {
  const club = w.clubs[w.userClubId];
  if (!club) return;
  const played = new Set(r.lineups[userIdx]);
  for (const p of userPlayers(w, club)) {
    const on = played.has(p.id);
    if (!on && (p.injury > 0 || (p.bans[f.comp] ?? 0) > 0)) continue;
    const pt = p.pt ?? [0, 0];
    p.pt = [pt[0] + (on ? 1 : 0), pt[1] + 1];
  }
  addChem(club, 0.5);
  // entrosamento entre pares e familiaridade com o sistema (chemistry.ts / tactics.ts)
  const lu = r.lineups[userIdx];
  growLinks(w, club, lu, lu.slice(0, 11));
  growFamiliarity(club, 1.2);
}

/** Um jogador deixou o clube do usuário (venda, dispensa): entrosamento e torcida sentem. */
export function onLeaveUserClub(w: World, p: Player) {
  const club = w.clubs[w.userClubId];
  if (!club) return;
  onLeaveLinks(w, club, p);
  if (p.fav) {
    addFan(w, -6);
    addNews(w, "dressing", `💔 Torcida protesta pela saída de ${p.name}`, `Ele era ídolo da arquibancada. O humor da torcida caiu.`, { pid: p.id });
    delete p.fav;
  }
}

/** Líderes do vestiário: fama, tempo de casa, idade e a jogada "Líder". */
export function leadersOf(w: World, club: Club): Player[] {
  const score = (p: Player) => p.fame * 0.5 + seasonsAtClub(w, p) * 5 + age(p, w.season) + (hasTrait(p, "LID") ? 20 : 0);
  return userPlayers(w, club).sort((a, b) => score(b) - score(a)).slice(0, 3);
}

/** Início do mês: humor do elenco, reclamações, promessas, entrosamento e líderes. */
export function monthlyMood(w: World) {
  const club = w.clubs[w.userClubId];
  if (!club) return;
  const now = absDay(w);
  for (const p0 of userPlayers(w, club)) {
    const p = p0 as MoodPlayer;
    p.role ??= defaultRole(w, club, p);
    const E = ROLE_SHARE[p.role];
    const hid = hidOf(p);
    // promessa vencida: cumpriu ou não?
    if (p.promise && now >= p.promise.until) {
      const pt = p.pt ?? [0, 0];
      const pl = pt[0] - p.promise.base[0];
      const av = pt[1] - p.promise.base[1];
      const share = av > 0 ? pl / av : 1;
      p.promise = undefined;
      if (share >= E) {
        addMorale(p, 6);
        addNews(w, "dressing", `🤝 ${p.name} elogia a palavra do treinador`, `Você prometeu mais minutos e cumpriu: ele jogou ${pl} de ${av} jogos.`, { pid: p.id });
      } else {
        p.wantsOut = true;
        p.bp = 1;
        addMorale(p, -20);
        addNews(w, "dressing", `😠 ${p.name} diz que você não cumpriu a promessa`, `Ele jogou só ${pl} de ${av} jogos desde a conversa e agora quer ser negociado.`, { pid: p.id });
      }
      continue;
    }
    const pt = p.pt;
    if (!pt || pt[1] < 3) continue;
    const share = pt[0] / pt[1];
    if (share < E - 0.25 && p.injury === 0) {
      if (p.promise) continue; // esperando a promessa
      addMorale(p, hid[H.amb] >= 15 ? -9 : hid[H.loy] >= 16 ? -3 : -6);
      p.unhappy = (p.unhappy ?? 0) + 1;
      p.gm = 0;
      if (p.unhappy === 2) addNews(w, "dressing", `💬 ${p.name} quer conversar sobre minutos`, `Ele jogou ${pt[0]} de ${pt[1]} jogos e esperava mais como ${ROLE_LABEL[p.role]}. Converse com ele no perfil ou no Vestiário.`, { pid: p.id });
      if (p.unhappy >= 4 && hid[H.loy] < 16 && !p.wantsOut) {
        p.wantsOut = true;
        addNews(w, "dressing", `😤 ${p.name} pediu para ser negociado`, `Cansado do banco, ele quer sair. Converse, prometa minutos ou venda.`, { pid: p.id });
      }
    } else if (share >= E) {
      p.unhappy = Math.max(0, (p.unhappy ?? 0) - 1);
      addMorale(p, 2);
      p.gm = (p.gm ?? 0) + 1;
      if (p.wantsOut && p.gm >= 2 && !p.bp) {
        p.wantsOut = false;
        addNews(w, "dressing", `🙂 ${p.name} está feliz de novo`, `Com minutos em campo, ele desistiu de pedir para sair.`, { pid: p.id });
      }
    }
  }
  // pedidos de quem está voando: valorização (contrato curto) ou um clube maior (ambicioso)
  for (const p of userPlayers(w, club)) {
    const hm = p.hm ?? 0;
    if (hm < 2 || p.loan) continue;
    const hid = hidOf(p);
    if (hm === 2 && p.contractEnd <= w.season + 1) {
      addNews(w, "contract", `📝 ${p.name} quer ser valorizado`, `Vivendo grande fase, ele espera uma renovação com aumento. Renove no perfil antes que outros clubes apareçam.`, { pid: p.id });
    } else if (hm >= 3 && hid[H.amb] >= 15 && hid[H.loy] < 12 && club.rep < 75 && !p.wantsOut && age(p, w.season) <= 29) {
      p.wantsOut = true;
      addNews(w, "dressing", `🚀 ${p.name} quer dar um passo maior`, `Depois de ${hm} meses em alta, ele acha que merece um clube maior e pediu para ser negociado. Uma conversa ou um novo contrato pode segurar.`, { pid: p.id });
    }
  }
  // entrosamento
  addChem(club, 2 + tacticalChemBonus(club));
  // líderes
  const leaders = leadersOf(w, club);
  const sad = leaders.find((p) => p.morale < 35);
  if (sad) {
    for (const p of userPlayers(w, club)) addMorale(p, -4);
    addNews(w, "dressing", `😟 Clima pesado no vestiário`, `${sad.name}, um dos líderes do elenco, está insatisfeito e o grupo sentiu. Uma conversa pode ajudar.`, { pid: sad.id });
  } else if (leaders.length === 3 && leaders.every((p) => p.morale > 75)) {
    for (const p of userPlayers(w, club)) addMorale(p, 2);
  }
}

/** Limpa o estado de vestiário (jogador saiu do clube do usuário ou chegou de novo). */
export function clearMood(p: Player) {
  const m = p as MoodPlayer;
  p.role = undefined;
  p.pt = undefined;
  p.unhappy = undefined;
  p.promise = undefined;
  p.wantsOut = undefined;
  m.gm = undefined;
  m.bp = undefined;
}

/** Um jogador chegou ao clube do usuário (contratação ou empréstimo). */
export function onJoinUserClub(w: World, p: Player) {
  const club = w.clubs[w.userClubId];
  if (!club) return;
  clearMood(p);
  addChem(club, -4);
}

/** Fim de temporada: zera minutos e ajusta o entrosamento. */
export function seasonReset(w: World) {
  const club = w.clubs[w.userClubId];
  if (!club) return;
  for (const id of club.players) {
    const p = w.players[id] as MoodPlayer | undefined;
    if (!p) continue;
    if (p.pt) p.pt = [0, 0];
    if (p.promise) p.promise.base = [0, 0];
    p.bp = undefined;
  }
  club.chem = Math.max(40, (club.chem ?? 70) - 5);
}

/** O usuário trocou de clube (demissão e novo emprego). */
export function managerChanged(w: World) {
  const club = w.clubs[w.userClubId];
  if (!club) return;
  club.chem = 50;
  for (const c of Object.values(w.clubs)) if (c.id !== club.id) { delete c.links; delete c.lastXI; delete c.tfam; }
  delete club.links;
  ensureLinks(w, club);
  for (const id of club.players) {
    const p = w.players[id];
    if (p) clearMood(p);
  }
}

/** Entrosamento (0-100). Clubes da IA são sempre 70 (neutro). */
export function chemOf(w: World, club: Club): number {
  return club.id === w.userClubId ? (club.chem ?? 70) : 70;
}

// ---------------------------------------------------------------- conversas
export type TalkId = "promise" | "earn" | "role" | "praise" | "demand" | "find";
export interface TalkOption { id: TalkId; emoji: string; label: string; hint: string; disabled?: string }

const formAvg = (p: Player) => {
  const f = p.form.slice(-3);
  return f.length ? f.reduce((s, x) => s + x, 0) / f.length : null;
};

/** Dias que faltam para poder conversar de novo (0 = pode agora). */
export function talkWait(w: World, p: Player): number {
  if (p.talkAt == null) return 0;
  return Math.max(0, TALK_COOLDOWN - (absDay(w) - p.talkAt));
}

export const activePromises = (w: World) =>
  (w.clubs[w.userClubId]?.players ?? []).filter((id) => w.players[id]?.promise).length;

/** Valor esperado de cada conversa (usado pelas dicas do auxiliar). */
function expected(w: World, p: Player, id: TalkId, role?: SquadRole): number {
  const hid = hidOf(p);
  const fa = formAvg(p);
  switch (id) {
    case "promise": return 8;
    case "earn": {
      const ok = Math.min(0.95, 0.35 + hid[H.pro] * 0.03);
      return ok * 3 - (1 - ok) * (8 + (hid[H.temp] >= 15 ? 4 : 0));
    }
    case "role": {
      if (!role) return 0;
      const cur = roleOf(w, p);
      if (ROLE_RANK[role] > ROLE_RANK[cur]) return 6;
      if (ROLE_RANK[role] < ROLE_RANK[cur]) return (shareOf(p) ?? 1) < ROLE_SHARE[cur] ? 2 : -5;
      return 0;
    }
    case "praise": return fa != null && fa >= 7 ? 6 : -2;
    case "demand": {
      if (fa != null && fa >= 6.8) return -6;
      const ok = Math.min(0.95, 0.5 + hid[H.pro] * 0.025);
      return ok * 4 - (1 - ok) * 6;
    }
    case "find": return 4;
  }
}

/** Dica do auxiliar (precisa de 3★ ou mais). */
export function talkHint(w: World, p: Player, id: TalkId, role?: SquadRole): string {
  if (staffStars(w, w.clubs[w.userClubId], "aux") < 3) return "O auxiliar não tem certeza.";
  const e = expected(w, p, id, role);
  const fa = formAvg(p);
  if (e >= 1) return id === "praise" || (fa != null && fa >= 7) ? "Ele está em boa fase — deve gostar 🙂" : "Deve gostar 🙂";
  if (e <= -1) return hidOf(p)[H.temp] >= 15 ? "Arriscado: ele é esquentado 😬" : id === "praise" ? (fa == null ? "Ele ainda não jogou — pode achar falso 😬" : "Ele não está jogando bem — pode achar falso 😬") : "Arriscado 😬";
  return "Pode ir para qualquer lado 🤷";
}

export function talkOptions(w: World, p: Player): TalkOption[] {
  const full = activePromises(w) >= MAX_PROMISES && !p.promise;
  return [
    { id: "promise", emoji: "⏱️", label: "Prometo mais minutos", hint: talkHint(w, p, "promise"), disabled: p.promise ? "Já existe uma promessa com ele." : full ? `Máximo de ${MAX_PROMISES} promessas ao mesmo tempo.` : undefined },
    { id: "earn", emoji: "💪", label: "Você precisa merecer a vaga", hint: talkHint(w, p, "earn") },
    { id: "role", emoji: "🔄", label: "Vamos mudar seu papel", hint: "Escolha o novo papel abaixo." },
    { id: "praise", emoji: "👏", label: "Está jogando muito!", hint: talkHint(w, p, "praise") },
    { id: "demand", emoji: "📢", label: "Espero mais de você", hint: talkHint(w, p, "demand") },
    { id: "find", emoji: "💲", label: "Vou buscar um clube para você", hint: talkHint(w, p, "find"), disabled: p.wantsOut || (p.unhappy ?? 0) >= 2 ? undefined : "Só quando ele estiver insatisfeito." },
  ];
}

export interface TalkResult { ok: boolean; delta: number; text: string }

/**
 * Conversa com o jogador. Usa o gerador global: chame dentro de withWorldRng.
 * Devolve a reação (também vira notícia).
 */
export function talkTo(w: World, p: Player, id: TalkId, role?: SquadRole): TalkResult {
  if (p.clubId !== w.userClubId) return { ok: false, delta: 0, text: "Ele não é do seu clube." };
  const wait = talkWait(w, p);
  if (wait > 0) return { ok: false, delta: 0, text: `Vocês conversaram há pouco. Espere mais ${wait} dia${wait === 1 ? "" : "s"}.` };
  const hid = hidOf(p);
  const fa = formAvg(p);
  let delta = 0;
  let text = "";
  switch (id) {
    case "promise": {
      if (p.promise) return { ok: false, delta: 0, text: "Já existe uma promessa com ele." };
      if (activePromises(w) >= MAX_PROMISES) return { ok: false, delta: 0, text: `Você já tem ${MAX_PROMISES} promessas ativas.` };
      p.promise = { until: absDay(w) + 60, base: p.pt ? [p.pt[0], p.pt[1]] : [0, 0] };
      p.unhappy = 0;
      delta = 8;
      text = `${p.name} gostou da promessa. Ele vai cobrar em 60 dias ⏱️`;
      break;
    }
    case "earn": {
      if (chance(Math.min(0.95, 0.35 + hid[H.pro] * 0.03))) { delta = 3; text = `${p.name} aceitou o desafio e promete treinar forte 💪`; }
      else { delta = -8 - (hid[H.temp] >= 15 ? 4 : 0); text = `${p.name} não gostou nada da cobrança 😠`; }
      break;
    }
    case "role": {
      if (!role) return { ok: false, delta: 0, text: "Escolha um papel." };
      const cur = roleOf(w, p);
      if (role === cur) return { ok: false, delta: 0, text: "Esse já é o papel dele." };
      if (ROLE_RANK[role] > ROLE_RANK[cur]) { delta = 6; text = `${p.name} ficou animado com o novo papel: ${ROLE_LABEL[role]} 😄`; }
      else {
        const s = shareOf(p) ?? 1;
        delta = s < ROLE_SHARE[cur] ? 2 : -5;
        text = delta > 0 ? `${p.name} agradeceu a sinceridade sobre o papel de ${ROLE_LABEL[role]}.` : `${p.name} ficou chateado com o papel de ${ROLE_LABEL[role]} 😕`;
      }
      p.role = role;
      p.unhappy = 0;
      break;
    }
    case "praise": {
      if (fa != null && fa >= 7) { delta = 6; text = `${p.name} adorou o elogio 😄`; }
      else { delta = -2; text = `${p.name} achou falso o elogio 🙄`; }
      break;
    }
    case "demand": {
      if (fa != null && fa >= 6.8) { delta = -6; text = `${p.name} achou injusta a cobrança 😠`; }
      else if (chance(Math.min(0.95, 0.5 + hid[H.pro] * 0.025))) { delta = 4; text = `${p.name} ouviu a cobrança e quer dar a volta por cima 💪`; }
      else { delta = -6; text = `${p.name} não reagiu bem à cobrança 😕`; }
      break;
    }
    case "find": {
      if (!p.wantsOut && (p.unhappy ?? 0) < 2) return { ok: false, delta: 0, text: "Ele não quer sair." };
      p.listed = true;
      delta = 4;
      text = `${p.name} agradeceu: agora ele está na lista de transferências 💲`;
      break;
    }
  }
  p.talkAt = absDay(w);
  addMorale(p, delta);
  addNews(w, "dressing", `💬 Conversa com ${p.name}`, text, { pid: p.id });
  return { ok: true, delta, text };
}

/** Linha do perfil: “Papel: Titular · jogou 8 de 12 (67%) · esperado 60%”. */
export function roleLine(w: World, p: Player): string {
  const role = roleOf(w, p);
  const exp = Math.round(ROLE_SHARE[role] * 100);
  const pt = p.pt;
  if (!pt || pt[1] === 0) return `Papel: ${ROLE_LABEL[role]} · esperado ${exp}% dos jogos`;
  return `Papel: ${ROLE_LABEL[role]} · jogou ${pt[0]} de ${pt[1]} (${Math.round((pt[0] / pt[1]) * 100)}%) · esperado ${exp}%`;
}

/** Emoji do humor. */
export const moodEmoji = (p: Player) => (p.wantsOut ? "😤" : p.morale >= 75 ? "😄" : p.morale >= 50 ? "🙂" : p.morale >= 30 ? "😐" : "😞");

/** Quantos jogadores do usuário querem conversar (insatisfeitos ou pedindo para sair). */
export function unhappyCount(w: World): number {
  const club = w.clubs[w.userClubId];
  if (!club) return 0;
  return userPlayers(w, club).filter((p) => p.wantsOut || (p.unhappy ?? 0) >= 2).length;
}

/** Perda de moral do elenco quando um ídolo leal é vendido. */
export function idolSold(w: World, p: Player) {
  const club = w.clubs[w.userClubId];
  if (!club) return;
  for (const q of userPlayers(w, club)) addMorale(q, -3);
  addNews(w, "dressing", `💔 O elenco sentiu a venda de ${p.name}`, `Ele era um ídolo leal ao clube. A moral do grupo caiu um pouco.`, { pid: p.id });
}
