// Olheiros e potencial escondido (névoa de guerra).
// O overall é sempre visível (casual); o potencial aparece como uma faixa que estreita
// conforme o seu clube conhece o jogador. Jogadas aparecem com 50% e personalidade com 70%.
import { absDay, divMult } from "./common";
import { addExpense, formatMoney } from "./finance";
import { addNews } from "./news";
import { personalityLabel } from "./personality";
import { age, playerValue } from "./player";
import { ovrAt } from "./positions";
import { gauss, hashString, randInt } from "./rng";
import { staffStars } from "./staff";
import { TRAITS } from "./traits";
import { askingPrice } from "./transfers";
import type { Club, Player, ScoutMission, ScoutState, World } from "./types";

/** Conhecimento mínimo para ver as jogadas e a personalidade. */
export const TRAITS_K = 50;
export const PERSONALITY_K = 70;
/** Relatório pronto. */
export const REPORT_K = 95;

const SUL_SUDESTE = new Set(["SP", "RJ", "MG", "ES", "PR", "SC", "RS"]);

/** Regiões das missões de observação. */
export const SCOUT_REGIONS: { id: string; label: string; youth?: boolean; test: (c: Club) => boolean }[] = [
  { id: "sul", label: "Sul/Sudeste", test: (c) => c.country === "BRA" && SUL_SUDESTE.has(c.region) },
  { id: "nne", label: "Norte/Nordeste/Centro-Oeste", test: (c) => c.country === "BRA" && !SUL_SUDESTE.has(c.region) },
  { id: "arg", label: "Argentina", test: (c) => c.country === "ARG" },
  { id: "urupar", label: "Uruguai e Paraguai", test: (c) => c.country === "URU" || c.country === "PAR" },
  { id: "colecu", label: "Colômbia e Equador", test: (c) => c.country === "COL" || c.country === "ECU" },
  { id: "andes", label: "Chile, Peru, Bolívia e Venezuela", test: (c) => ["CHI", "PER", "BOL", "VEN"].includes(c.country) },
  { id: "base", label: "Bases de outros clubes", youth: true, test: (c) => c.country === "BRA" },
];
export const regionLabel = (id: string) => SCOUT_REGIONS.find((r) => r.id === id)?.label ?? id;

export const SCOUT_FOCUS: Record<ScoutMission["focus"], string> = {
  young: "Jovens promessas (até 21)",
  ready: "Prontos para o time",
  cheap: "Baratos (até R$ 2 mi)",
};

const scoutOf = (w: World): ScoutState => (w.scout ??= { k: {}, queue: [], missions: [], recs: [] });

/** Conhecimento que o clube tem de graça (sem olheiro). */
function baseKnowledge(w: World, p: Player): number {
  if (p.clubId === w.userClubId || p.loan?.from === w.userClubId) return 100;
  if (!p.clubId) return 40;
  const c = w.clubs[p.clubId];
  if (!c) return 40;
  if (p.youth) return 20;
  if (c.div === "F") return 15;
  const user = w.clubs[w.userClubId];
  if (user && c.div === user.div) return 55;
  return 35;
}

/** Quanto o seu clube conhece do jogador (0-100). */
export function knowledgeOf(w: World, p: Player): number {
  return Math.max(baseKnowledge(w, p), w.scout?.k[p.id] ?? 0);
}

/** Faixa de potencial que o usuário enxerga (sempre contém o potencial real). */
export function potRange(w: World, p: Player): [number, number] {
  if (p.legend) return [p.pot, p.pot]; // potencial de lenda é conhecido
  const k = knowledgeOf(w, p);
  const hw = 1 + Math.round((100 - k) * 0.07);
  const bias = (hashString(`${w.seed}:b:${p.id}`) % 5) - 2;
  const center = p.pot + Math.round((bias * (100 - k)) / 50);
  return [Math.max(p.ovr, center - hw), Math.min(99, center + hw)];
}

export function potRangeLabel(w: World, p: Player): string {
  if (p.legend) return `até ${p.pot}`;
  const [lo, hi] = potRange(w, p);
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}

/** Centro da faixa de potencial (o "palpite" do clube). */
export function potGuess(w: World, p: Player): number {
  const [lo, hi] = potRange(w, p);
  return Math.round((lo + hi) / 2);
}

/** Potencial em estrelas (1-5) em relação ao nível do clube. Seus jogadores usam o potencial real. */
export function potStars(w: World, p: Player, club: Club): number {
  const center = knowledgeOf(w, p) >= 100 ? p.pot : potGuess(w, p);
  return starsFor(center, club.level);
}

/** Estrelas a partir de um potencial (peneira: potencial real). */
export function starsFor(pot: number, level: number): number {
  const d = pot - level;
  return d >= 8 ? 5 : d >= 3 ? 4 : d >= -2 ? 3 : d >= -7 ? 2 : 1;
}

// ---------------------------------------------------------------- fila de observação
export const queueSlots = (w: World) => 2 + Math.floor(staffStars(w, w.clubs[w.userClubId], "olh") / 2);
export const missionSlots = (w: World) => 1 + Math.floor(staffStars(w, w.clubs[w.userClubId], "olh") / 2);
/** Custo de uma missão (R$ 100 mil por 30 dias, ajustado à divisão). */
export const missionCost = (w: World, days: number) => Math.round(100_000 * divMult(w.clubs[w.userClubId]) * (days / 30));

export type ScoutStatus = "none" | "queued" | "done";
export function scoutStatus(w: World, p: Player): ScoutStatus {
  if (w.scout?.queue.includes(p.id)) return "queued";
  return knowledgeOf(w, p) >= REPORT_K ? "done" : "none";
}

/** Põe o jogador na fila dos olheiros. Devolve uma mensagem de erro ou null. */
export function queueScout(w: World, p: Player): string | null {
  const s = scoutOf(w);
  if (s.queue.includes(p.id)) return null;
  if (knowledgeOf(w, p) >= REPORT_K) return "Já existe um relatório completo deste jogador.";
  const n = queueSlots(w);
  if (s.queue.length >= n) return `Seus olheiros estão ocupados (${n}/${n}).`;
  s.queue.push(p.id);
  s.k[p.id] = Math.max(s.k[p.id] ?? 0, baseKnowledge(w, p));
  return null;
}

export function unqueueScout(w: World, pid: number) {
  if (w.scout) w.scout.queue = w.scout.queue.filter((id) => id !== pid);
}

/** Nota do relatório: compara o potencial com o melhor do seu elenco na posição. */
export function reportGrade(w: World, p: Player): string {
  const user = w.clubs[w.userClubId];
  const best = Math.max(0, ...user.players.map((id) => w.players[id]).filter((x) => x && !x.youth && x.id !== p.id).map((x) => ovrAt(x, p.pos)));
  const d = potGuess(w, p) - best;
  const g = d >= 5 ? "A" : d >= 2 ? "B" : d >= -2 ? "C" : "D";
  return g + (age(p, w.season) <= 21 ? "+" : "");
}

export function priceVerdict(w: World, p: Player): string {
  if (!p.clubId) return "sem custo de transferência";
  const ask = askingPrice(w, p);
  return `${ask <= 1.15 * playerValue(p, w.season) ? "preço justo" : "caro"} (pedem ${formatMoney(ask)})`;
}

/** Corpo do relatório (também usado na ficha do jogador). */
export function reportBody(w: World, p: Player): string {
  const [lo, hi] = potRange(w, p);
  const traits = (p.traits ?? []).map((t) => `${TRAITS[t].emoji} ${TRAITS[t].label}`).join(", ") || "nenhuma";
  return `Potencial ${lo}–${hi} · Jogadas: ${traits} · Personalidade: ${personalityLabel(p)} · ${priceVerdict(w, p)}`;
}

function postReport(w: World, p: Player) {
  addNews(w, "scout", `📋 Relatório: ${p.name} — Recomendação ${reportGrade(w, p)}`, reportBody(w, p), { pid: p.id, clubId: p.clubId ?? undefined });
}

// ---------------------------------------------------------------- missões
/** Começa uma missão (cobra na hora). Devolve uma mensagem de erro ou null. */
export function startMission(w: World, region: string, focus: ScoutMission["focus"], days: 30 | 60 | 90): string | null {
  const s = scoutOf(w);
  if (!SCOUT_REGIONS.some((r) => r.id === region)) return "Região inválida.";
  if (s.missions.length >= missionSlots(w)) return `Você já tem ${s.missions.length} missão(ões) em andamento.`;
  const cost = missionCost(w, days);
  addExpense(w.clubs[w.userClubId], "scout", cost);
  const now = absDay(w);
  s.missions.push({ id: w.nextId++, region, focus, until: now + days, next: now + 7 });
  return null;
}

export function endMission(w: World, id: number) {
  if (w.scout) w.scout.missions = w.scout.missions.filter((m) => m.id !== id);
}

export function dismissRec(w: World, pid: number) {
  if (w.scout) w.scout.recs = w.scout.recs.filter((id) => id !== pid);
}

/** Candidatos de uma missão e o placar de cada um. Consome o gerador global (só dentro do avanço do dia). */
function missionPicks(w: World, m: ScoutMission, n: number): Player[] {
  const s = scoutOf(w);
  const region = SCOUT_REGIONS.find((r) => r.id === m.region);
  if (!region) return [];
  const user = w.clubs[w.userClubId];
  const recs = new Set(s.recs);
  const scored: { p: Player; v: number }[] = [];
  for (const p of Object.values(w.players)) {
    if (!p.clubId || p.clubId === user.id || recs.has(p.id) || p.loan?.from === user.id) continue;
    if (!!region.youth !== p.youth) continue;
    const c = w.clubs[p.clubId];
    if (!c || !region.test(c)) continue;
    const a = age(p, w.season);
    if (m.focus === "young") {
      if (a > 21) continue;
      scored.push({ p, v: p.pot + gauss(0, 4) });
    } else if (m.focus === "ready") {
      if (p.ovr < user.level - 3) continue;
      scored.push({ p, v: p.ovr + gauss(0, 2) });
    } else {
      if (p.ovr < 45 || askingPrice(w, p) > 2_000_000) continue;
      scored.push({ p, v: p.ovr + gauss(0, 2) });
    }
  }
  scored.sort((a, b) => b.v - a.v);
  return scored.slice(0, n).map((x) => x.p);
}

// ---------------------------------------------------------------- diário
/** Diário: avança a fila de observação e as missões. */
export function scoutTick(w: World) {
  const s = w.scout;
  if (!s || (!s.queue.length && !s.missions.length)) return;
  const user = w.clubs[w.userClubId];
  if (!user) return;
  if (s.queue.length) {
    const gain = 4 + 1.5 * staffStars(w, user, "olh");
    for (const id of s.queue.slice()) {
      const p = w.players[id];
      if (!p) { s.queue = s.queue.filter((x) => x !== id); continue; }
      const k = Math.max(s.k[id] ?? 0, baseKnowledge(w, p)) + gain;
      if (k >= REPORT_K) {
        s.k[id] = 100;
        s.queue = s.queue.filter((x) => x !== id);
        postReport(w, p);
      } else s.k[id] = Math.round(k * 10) / 10;
    }
  }
  if (s.missions.length) {
    const now = absDay(w);
    for (const m of s.missions.slice()) {
      if (now >= m.until) {
        s.missions = s.missions.filter((x) => x !== m);
        addNews(w, "scout", `Missão em ${regionLabel(m.region)} encerrada.`, "Os jogadores encontrados continuam em Mercado › Olheiros › Recomendados.");
        continue;
      }
      if (now < m.next) continue;
      m.next = now + 7;
      const found = missionPicks(w, m, randInt(1, 2));
      for (const p of found) {
        s.recs.push(p.id);
        s.k[p.id] = Math.max(s.k[p.id] ?? 0, 60);
      }
      if (s.recs.length > 40) s.recs.splice(0, s.recs.length - 40);
      if (found.length) {
        addNews(w, "scout", `🔭 Seu olheiro encontrou ${found.length} jogador${found.length === 1 ? "" : "es"} em ${regionLabel(m.region)}`,
          `${found.map((p) => `${p.name} (${p.pos}, ${age(p, w.season)} anos, ${p.ovr})`).join(" · ")}. Veja em Mercado › Olheiros.`, { pid: found[0].id });
      }
    }
  }
}

/** Fim de temporada: limpa conhecimento de jogadores que saíram do mundo. */
export function pruneScouting(w: World) {
  const s = w.scout;
  if (!s) return;
  for (const id of Object.keys(s.k)) {
    const pid = Number(id);
    if (!w.players[pid]) delete s.k[pid];
  }
  s.queue = s.queue.filter((id) => !!w.players[id]);
  s.recs = s.recs.filter((id) => !!w.players[id]).slice(-40);
}
