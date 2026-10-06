// Entrosamento entre jogadores (pares): cresce com minutos juntos e com afinidades
// (mesma nacionalidade/idioma, mesma base, tempo de casa, funções que se completam).
// Só o clube do usuário guarda os pares (save enxuto); a IA é sempre neutra no jogo.
// Sem sorteio: não mexe no gerador global.
import { addNews } from "./news";
import { FORMATIONS, type Slot } from "./positions";
import { clamp } from "./rng";
import { ROLES, type RoleId } from "./tactics";
import type { Club, Player, World } from "./types";

const LANG: Record<string, string> = {
  BRA: "pt", POR: "pt", ANG: "pt", MOZ: "pt",
  ARG: "es", URU: "es", PAR: "es", CHI: "es", COL: "es", PER: "es", ECU: "es", VEN: "es", BOL: "es", ESP: "es", MEX: "es",
  ENG: "en", USA: "en", SCO: "en", WAL: "en", IRL: "en", NIR: "en", AUS: "en",
  FRA: "fr", BEL: "fr", CMR: "fr", CIV: "fr", SEN: "fr",
  ITA: "it", GER: "de", AUT: "de", SUI: "de", NED: "nl",
};
export const langOf = (nat: string) => LANG[nat] ?? nat;

export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const academyOf = (p: Player) => p.acad ?? (p.youth ? p.clubId ?? undefined : undefined);
const tenure = (w: World, p: Player) => (p.loan ? 0 : Math.max(0, w.season - p.joined));

/** Funções que se completam (lado a lado em campo). */
const COMPLEMENT: [RoleId, RoleId][] = [
  ["destr", "arm"], ["destr", "reg"], ["piv", "fin"], ["piv", "mat"], ["lat_ap", "inv"], ["lat_def", "ponta"],
  ["cons", "zag"], ["box", "arm"], ["reg", "box"], ["arm", "fin"], ["mat", "fin"],
];
export function complementary(a?: string | null, b?: string | null): boolean {
  if (!a || !b || !(a in ROLES) || !(b in ROLES)) return false;
  return COMPLEMENT.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Parte fixa do entrosamento (afinidades), 0–40. */
export function affinity(w: World, a: Player, b: Player): number {
  let s = 8;
  if (a.nat === b.nat) s += 10;
  else if (langOf(a.nat) === langOf(b.nat)) s += 5;
  const ac = academyOf(a);
  if (ac && ac === academyOf(b)) s += 10;
  s += Math.min(12, 3 * Math.min(tenure(w, a), tenure(w, b)));
  return Math.min(40, s);
}

/** Entrosamento total do par (0–100). */
export function linkOf(w: World, club: Club, a: Player, b: Player): number {
  const g = club.links?.[pairKey(a.id, b.id)] ?? 0;
  return clamp(Math.round(affinity(w, a, b) + g), 0, 100);
}

/** Cria os pares de um elenco já formado (tempo juntos vira entrosamento inicial). */
export function ensureLinks(w: World, club: Club) {
  if (club.links) return;
  club.links = {};
  const ps = club.players.map((id) => w.players[id]).filter((p): p is Player => !!p && !p.youth);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    // elenco que já jogava junto antes do técnico chegar: começa com entrosamento razoável
    const together = Math.min(tenure(w, ps[i]), tenure(w, ps[j]));
    club.links[pairKey(ps[i].id, ps[j].id)] = Math.min(50, 25 + 10 * together);
  }
}

/** Pares vizinhos em campo (distância entre as posições da formação). */
export function neighbourPairs(slots: Slot[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    const dx = slots[i].x - slots[j].x, dy = (slots[i].y - slots[j].y) * 1.2;
    if (Math.hypot(dx, dy) <= 32) out.push([i, j]);
  }
  return out;
}

export interface PitchLink { i: number; j: number; v: number }
/** Ligações vizinhas dos 11 (para desenhar no campo e para o motor). */
export function pitchLinks(w: World, club: Club, formation: string, ids: (number | null)[]): PitchLink[] {
  const slots = FORMATIONS[formation] ?? FORMATIONS["4-3-3"];
  const out: PitchLink[] = [];
  for (const [i, j] of neighbourPairs(slots)) {
    const a = ids[i] != null ? w.players[ids[i]!] : null, b = ids[j] != null ? w.players[ids[j]!] : null;
    if (!a || !b) continue;
    let v = linkOf(w, club, a, b);
    if (complementary(club.tactic.roles?.[i], club.tactic.roles?.[j])) v = Math.min(100, v + 8);
    out.push({ i, j, v });
  }
  return out;
}

/** Média do entrosamento dos vizinhos em campo (0–100). IA = neutro (50). */
export function teamLinkAvg(w: World, club: Club, ids: (number | null)[], formation = club.tactic.formation): number {
  if (club.id !== w.userClubId || !club.links) return 50; // sem registro de pares = neutro
  const ls = pitchLinks(w, club, formation, ids);
  return ls.length ? ls.reduce((s, l) => s + l.v, 0) / ls.length : 50;
}
/** Efeito no jogo: ±2,5% em torno de 50 (modesto). */
export const linkMult = (avg: number) => clamp(1 + (0.025 * (avg - 50)) / 50, 0.975, 1.025);

/** Depois de cada jogo do usuário: quem jogou junto se entende melhor. */
export function growLinks(w: World, club: Club, played: number[], starters: number[]) {
  ensureLinks(w, club);
  const links = club.links!;
  // rodízio demais: com poucos titulares repetidos, o entrosamento cresce devagar
  const prev = new Set(club.lastXI ?? starters);
  const kept = starters.filter((id) => prev.has(id)).length;
  const stability = 0.4 + 0.6 * (starters.length ? kept / starters.length : 1);
  club.lastXI = starters.slice();
  const ps = played.map((id) => w.players[id]).filter((p): p is Player => !!p);
  const st = new Set(starters);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const k = pairKey(ps[i].id, ps[j].id);
    const cur = links[k] ?? 0;
    const both = st.has(ps[i].id) && st.has(ps[j].id) ? 1 : 0.4; // quem entrou no fim jogou menos junto
    const add = 2.2 * stability * both * (1 - cur / 70);
    links[k] = Math.round(clamp(cur + add, 0, 60) * 10) / 10;
  }
}

/** Mês: pares que não jogam juntos esfriam; saem os que deixaram o clube; marca a base. */
export function monthlyLinks(w: World, club: Club) {
  for (const id of club.players) {
    const p = w.players[id];
    if (p?.youth && !p.acad) p.acad = club.id;
  }
  if (!club.links) return;
  const here = new Set(club.players);
  for (const k of Object.keys(club.links)) {
    const [a, b] = k.split("-").map(Number);
    if (!here.has(a) || !here.has(b)) { delete club.links[k]; continue; }
    const v = club.links[k] * 0.96;
    if (v < 0.5) delete club.links[k]; else club.links[k] = Math.round(v * 10) / 10;
  }
}

/** Um jogador deixou o clube do usuário: se era peça-chave do entrosamento, o time sente. */
export function onLeaveLinks(w: World, club: Club, p: Player): number {
  if (!club.links) return 0;
  let strong = 0;
  for (const [k, v] of Object.entries(club.links)) {
    const [a, b] = k.split("-").map(Number);
    if (a !== p.id && b !== p.id) continue;
    if (v >= 25) strong++;
    delete club.links[k];
  }
  const hit = Math.min(8, Math.round(strong * 0.7));
  if (hit > 0) {
    club.chem = clamp((club.chem ?? 70) - hit, 0, 100);
    if (hit >= 3) addNews(w, "dressing", `🧩 A saída de ${p.name} mexeu com o entrosamento`, `Ele tinha ligação forte com ${strong} companheiros. O time vai precisar de tempo para se reencontrar.`, { pid: p.id });
  }
  return hit;
}

/** Os parceiros mais entrosados de um jogador (perfil). */
export function bestPartners(w: World, club: Club, p: Player, n = 3): { p: Player; v: number }[] {
  return club.players.map((id) => w.players[id]).filter((q): q is Player => !!q && q.id !== p.id && !q.youth)
    .map((q) => ({ p: q, v: linkOf(w, club, p, q) })).sort((a, b) => b.v - a.v).slice(0, n);
}
