import { ensureLinks } from "./chemistry";
import { ROLES } from "./tactics";
import { inboxOf } from "./inbox";
import { narrativeOf } from "./narrative";
// Criação de um novo jogo a partir do banco de dados (src/data/database.json).
import { ensureAch } from "./achievements";
import { formatDate } from "./calendar";
import { ensureCareer } from "./career";
import { SCENARIO_BY_ID } from "./scenarios";
import { fillExtras, initPlayerExtras, migrateTo3 } from "./extras";
import { migrateBoardProjects } from "./board";
import { migrateFacilities } from "./facilities";
import { repairWorld } from "./integrity";
import { migrateSetPieces } from "./setpieces";
import { COMP_META } from "./competitions";
import { migrateSponsors, seedRealSponsors } from "./sponsors";
import { addNews } from "./news";
import { assignRegenFace, legendImage, sportsdbPath } from "./media";
import { generatePlayer, makeAttrs, newPlayerBase, randomPos, wageFor } from "./player";
import { clamp, gauss, hashString, rand, randInt, setRngState, getRngState } from "./rng";
import { initialEntrants, startSeason } from "./season";
import { freeShirt } from "./transfers";
import type { Club, CrestPattern, Div, Pos, Settings, World } from "./types";
import type { WorldData } from "../data/worldTypes";
import { initWorldLeagues, leagueWageMult, registerWorldMetas, worldBalance } from "./worldLeagues";
import { initIntl } from "./international";

export interface DbClub {
  id: string; name: string; full: string; abbr: string; region: string; city: string; country: string;
  div: Div; level: number; rep: number; colors: string[]; crest: string; stadium: string; capacity: number;
  founded?: string; nickname?: string;
  logo?: 1; // escudo oficial em public/media/crests/<id>.webp
  stadiumImg?: string; // foto do estádio em public/media/stadiums/<stadiumImg>.webp
}

export interface DbPlayer {
  c: string; n: string; nat: string; p: Pos; s: Pos[]; b: number; h: number; f: "D" | "E" | "A";
  o: number; pt: number; fm: number; y: 0 | 1; no?: number;
  q?: string; // item do Wikidata
  img?: 1; // foto real em public/media/players/<q>.webp
  pi?: string; // retrato do elenco atual (ogol / site do clube) em public/media/players/<pi>.webp
}

export interface Database {
  fetchedAt: string;
  season: number;
  clubs: DbClub[];
  players: DbPlayer[];
}

// 1: original · 2: mídia real · 3: gestão (traços, personalidade, base, comissão, admin...) · 4: mundo (ligas estrangeiras, seleções)
export const SAVE_VERSION = 4;

const FAMOUS_ACADEMIES = new Set(["sao-paulo", "fluminense", "santos", "flamengo", "gremio", "internacional", "vasco", "athletico-pr", "palmeiras", "cruzeiro", "river-plate", "boca-juniors", "independiente-del-valle", "argentinos-juniors"]);
const JERSEYS = ["football", "football2", "football4", "football5", "football3"];

export const defaultSettings = (): Settings => ({ casual: true, legendFreq: 2, speed: 250, theme: "dark", autoSave: true });

/** Cria um jogador real do banco de dados no clube dele (ou ignora, se o clube não existir). */
export function addDbPlayer(w: World, dp: DbPlayer) {
  const club = w.clubs[dp.c];
  if (!club) return;
  const ageY = w.season - dp.b;
  const p = newPlayerBase(w, {
    name: dp.n,
    nat: dp.nat,
    born: dp.b,
    pos: dp.p,
    sec: dp.s ?? [],
    foot: dp.f,
    height: dp.h,
    attrs: makeAttrs(dp.p, dp.o, { height: dp.h, age: ageY }),
    pot: Math.max(dp.pt, dp.o),
    youth: dp.y === 1 && ageY <= 20,
    real: true,
    fame: clamp(Math.round(11 * Math.log1p(dp.fm)), 0, 100),
    shirt: dp.no,
  });
  if (p.ovr !== dp.o) {
    // o overall real manda; os extras (que dependem do overall) são refeitos com o mesmo gerador próprio
    p.ovr = dp.o;
    delete p.hid;
    delete p.traits;
    initPlayerExtras(w, p);
  }
  if (dp.img && dp.q) p.img = dp.q;
  p.ext = sportsdbPath(dp.n, dp.b);
  if (dp.pi) { p.img = dp.pi; delete p.ext; } // retrato do elenco atual vence as outras fontes
  p.clubId = club.id;
  club.players.push(p.id);
  const foreignMult = club.league ? leagueWageMult(club) : club.country === "BRA" ? 1 : 0.5;
  p.wage = Math.round(wageFor(p.ovr, club.rep, ageY) * foreignMult * (0.85 + rand() * 0.3));
  p.contractEnd = w.season + randInt(1, 3);
}

/**
 * Carrega os dados do mundo (ligas estrangeiras, clubes, jogadores e seleções) num jogo.
 * Idempotente: clubes que já existem não são recriados e jogadores reais já presentes (nome|ano) não são duplicados.
 * @param migrating save antigo: as ligas ago–mai só nascem na próxima temporada que ainda não passou do dia 181
 */
export function loadWorldData(w: World, data: WorldData, migrating: boolean) {
  const known = new Set<string>();
  if (migrating) for (const p of Object.values(w.players)) if (p.real) known.add(`${p.name}|${p.born}`);
  const fresh: Club[] = [];
  for (const c of data.clubs) {
    if (w.clubs[c.id]) continue;
    const club = makeClub(c);
    club.league = c.league;
    if (c.zone) club.zone = c.zone;
    w.clubs[c.id] = club;
    fresh.push(club);
  }
  for (const l of data.leagues) for (const id of l.clubs) if (w.clubs[id]) w.clubs[id].league = l.id;
  for (const club of Object.values(w.clubs)) if (club.league) club.balance = worldBalance(club);
  for (const dp of data.players) {
    if (known.has(`${dp.n}|${dp.b}`)) continue;
    addDbPlayer(w, dp);
  }
  if (migrating) for (const club of fresh) fillSquad(w, club);
  initWorldLeagues(w, data, migrating);
  initIntl(w, data.nationalTeams);
}

export function createWorld(db: Database, opts: { managerName: string; clubId: string; seed?: number; settings?: Partial<Settings>; world?: WorldData }): World {
  const seed = opts.seed ?? (Date.now() % 2147483647);
  setRngState(seed);
  const w: World = {
    version: SAVE_VERSION,
    saveId: `save-${Date.now()}`,
    createdAt: Date.now(),
    seed,
    rng: seed,
    season: db.season,
    day: 0,
    managerName: opts.managerName || "Treinador",
    userClubId: opts.clubId,
    clubs: {},
    players: {},
    nextPid: 1,
    nextId: 1,
    fixtures: [],
    comps: {},
    news: [],
    offers: [],
    shortlist: [],
    legends: {},
    settings: { ...defaultSettings(), ...opts.settings },
    history: [],
    board: { confidence: 60, objective: "", objectiveCode: "" },
    managerHistory: [],
    dataDate: db.fetchedAt,
  };

  for (const c of db.clubs) w.clubs[c.id] = makeClub(c);

  // jogadores reais (quem foi para um clube do mundo vem do world.json)
  const sup = opts.world?.supersedes?.length ? new Set(opts.world.supersedes) : null;
  for (const dp of db.players) {
    if (sup?.has(`${dp.n}|${dp.b}`)) continue;
    addDbPlayer(w, dp);
  }
  if (opts.world) loadWorldData(w, opts.world, false);

  // completa elencos e categorias de base
  for (const club of Object.values(w.clubs)) fillSquad(w, club);

  // jogadores livres no mercado
  for (let i = 0; i < 160; i++) generatePlayer(w, null, randInt(50, 68), randInt(22, 32));

  seedRealSponsors(w);
  startSeason(w, initialEntrants(w));
  const user = w.clubs[w.userClubId];
  ensureLinks(w, user); // entrosamento entre pares (chemistry.ts)
  addNews(w, "info", `Bem-vindo ao ${user.name}!`,
    `${w.managerName}, você é o novo técnico do ${user.full}. Hoje é ${formatDate(w.season, w.day)} de ${w.season}. ` +
    `Monte o time em Elenco › Tática e toque em "Continuar" para avançar até o próximo jogo. ` +
    `Fique de olho nas categorias de base: lendas do futebol podem renascer por lá!`);
  w.rng = getRngState();
  return w;
}

function makeClub(c: DbClub): Club {
  const rep = c.rep;
  const balance =
    c.div === "A" ? 20_000_000 + rep * rep * 8_000
      : c.div === "B" ? 4_000_000 + rep * rep * 1_500
        : c.div === "C" ? 800_000 + rep * rep * 400
          : c.div === "D" ? 500_000 + rep * rep * 200
            : 5_000_000 + rep * rep * 5_000;
  const colors = [...c.colors];
  while (colors.length < 3) colors.push("#FFFFFF");
  const youthLevel = FAMOUS_ACADEMIES.has(c.id) ? 5 : clamp(Math.round(rep / 22), 1, 5);
  return {
    id: c.id, name: c.name, full: c.full, abbr: c.abbr, region: c.region, city: c.city, country: c.country,
    colors: colors.slice(0, 3) as [string, string, string],
    crest: (c.crest || "solid") as CrestPattern,
    stadium: c.stadium, capacity: c.capacity, rep, level: c.level, div: c.div, balance: Math.round(balance),
    players: [],
    tactic: { formation: "4-3-3", mentality: 0, pressing: 1 },
    youthLevel,
    youthFac: youthLevel,
    youthCoach: youthLevel,
    facilities: clamp(Math.round(rep / 22), 1, 5),
    ticket: c.div === "A" ? Math.round(40 + rep * 0.4) : c.div === "B" ? 30 : c.div === "C" ? 20 : c.div === "D" ? 15 : 25,
    history: [], trophies: [],
    finance: { income: {}, expense: {} },
    logo: c.logo === 1 || undefined,
    stadiumImg: c.stadiumImg,
    founded: c.founded, nickname: c.nickname,
    jersey: JERSEYS[hashString(c.id) % JERSEYS.length],
  };
}

/**
 * Atualiza um jogo salvo com a mídia do banco de dados atual (fotos reais, escudos, estádios,
 * rostos dos regens) e com os dados da versão atual do save (migração v3, extras e reparo).
 * Roda a cada carregamento: é barato e faz jogos antigos ganharem as novidades.
 * @returns repaired = correções feitas; newer = o save veio de uma versão mais nova do jogo
 */
export function migrateWorld(w: World, db: Database, world?: WorldData): { repaired: number; newer: boolean } {
  const from = w.version ?? 1;
  if (world && !w.wl) {
    setRngState(w.rng);
    loadWorldData(w, world, true);
    w.rng = getRngState();
  }
  registerWorldMetas(w);
  const dbClubs = new Map(db.clubs.map((c) => [c.id, c]));
  for (const c of Object.values(w.clubs)) {
    const d = dbClubs.get(c.id);
    if (!d) continue;
    c.logo = d.logo === 1 || undefined;
    c.stadiumImg = d.stadiumImg;
    if (d.stadium && /^Estádio (de|do|da) /.test(c.stadium) && c.stadium !== d.stadium) {
      c.stadium = d.stadium;
      c.capacity = d.capacity;
    }
  }
  const photos = new Map<string, string>();
  const portraits = new Map<string, string>();
  for (const dp of db.players) {
    if (dp.img && dp.q) photos.set(`${dp.n}|${dp.b}`, dp.q);
    if (dp.pi) portraits.set(`${dp.n}|${dp.b}`, dp.pi);
  }
  for (const p of Object.values(w.players)) {
    if (p.legend) {
      p.img ??= legendImage(p.legend);
    } else if (p.real) {
      // jogador real nunca usa rosto de IA (saves antigos podiam ter herdado um "r…")
      if (p.img?.startsWith("r")) delete p.img;
      const portrait = portraits.get(`${p.name}|${p.born}`);
      if (portrait) p.img = portrait;
      if (!p.img) p.img = photos.get(`${p.name}|${p.born}`);
      const ext = portrait ? undefined : sportsdbPath(p.name, p.born);
      if (ext) p.ext = ext; else delete p.ext;
    } else {
      assignRegenFace(w, p);
    }
  }
  if (from < 3) migrateTo3(w);
  fillExtras(w); // quem não tem atributos ocultos/jogadas ganha (gerador próprio, determinístico)
  narrativeOf(w); // trilha A: torcida, coletivas e interações
  inboxOf(w);
  migrateProgression(w);
  // economia e dia de jogo (opcionais): repara sub-objetos inválidos
  migrateBoardProjects(w); // obras antigas da diretoria → Estrutura
  for (const c of Object.values(w.clubs)) { migrateSponsors(c, w); migrateFacilities(c); migrateSetPieces(c); }
  for (const comp of Object.values(w.comps)) if (COMP_META[comp.id]) comp.name = COMP_META[comp.id].name; // nomes oficiais
  seedRealSponsors(w); // saves sem patrocínio: clubes ganham os contratos reais
  migrateDynamics(w); // tática a fundo, entrosamento, forma e prêmios (idempotente)
  const repaired = repairWorld(w);
  w.version = Math.max(from, SAVE_VERSION);
  return { repaired, newer: from > SAVE_VERSION };
}

/** Tática a fundo e entrosamento (opcionais): saves antigos ganham pares e funções válidas. */
export function migrateDynamics(w: World) {
  const user = w.clubs[w.userClubId];
  if (user) ensureLinks(w, user);
  for (const c of Object.values(w.clubs)) {
    const t = c.tactic;
    if (c.id !== w.userClubId) { delete c.links; delete c.lastXI; delete c.tfam; }
    if (t.roles && (!Array.isArray(t.roles) || t.roles.some((r) => r != null && !(r in ROLES)))) t.roles = Array.isArray(t.roles) ? t.roles.map((r) => (r != null && r in ROLES ? r : null)) : undefined;
    if (t.ti) for (const k of ["line", "width", "tempo", "direct"] as const) {
      const v = t.ti[k];
      if (v !== undefined && !(v === 0 || v === 1 || v === 2)) t.ti[k] = 1;
    }
  }
}

/** Progressão (troféus, conquistas, desafios, carreira): campos opcionais que saves antigos não têm. */
export function migrateProgression(w: World) {
  if (!w.clubLog) {
    // saves antigos: a linha do tempo nasce do histórico do treinador
    w.clubLog = (w.managerHistory ?? []).map((h) => ({ season: h.season, clubId: h.clubId, div: h.div, pos: h.pos, titles: [...h.titles] }));
  }
  if (w.ach) ensureAch(w);
  if (w.career) ensureCareer(w);
  if (w.scenario && !SCENARIO_BY_ID[w.scenario.id]) w.scenario = undefined;
}

const MIN_BY_POS: Record<Pos, number> = { GOL: 3, ZAG: 4, LD: 2, LE: 2, VOL: 2, MC: 2, MEI: 2, PD: 2, PE: 2, ATA: 3 };

function fillSquad(w: World, club: Club) {
  const first = () => club.players.map((id) => w.players[id]).filter((p) => p && !p.youth);
  const target = club.div === "A" || club.div === "B" ? 27 : 24;
  // mínimo por posição
  for (const pos of Object.keys(MIN_BY_POS) as Pos[]) {
    const have = first().filter((p) => p.pos === pos).length;
    for (let i = have; i < MIN_BY_POS[pos]; i++) generatePlayer(w, club, club.level - 7 + gauss(0, 2), randInt(19, 31), pos);
  }
  // completa até o tamanho alvo
  let guard = 0;
  while (first().length < target && guard++ < 40) {
    const pos = randomPos();
    generatePlayer(w, club, club.level - 6, randInt(19, 32), pos);
  }
  // base
  const youthTarget = club.country === "BRA" ? 4 + club.youthLevel : 3;
  const youth = club.players.map((id) => w.players[id]).filter((p) => p?.youth).length;
  for (let i = youth; i < youthTarget; i++) {
    const ageY = randInt(15, 18);
    const ovr = clamp(Math.round(40 + club.youthLevel * 2.5 + (ageY - 15) * 3 + gauss(0, 4)), 32, 70);
    const p = generatePlayer(w, club, ovr, ageY, undefined, true);
    p.pot = clamp(Math.round(ovr + 14 + club.youthLevel * 3 + gauss(0, 7)), ovr + 5, 90);
    p.fame = 1;
  }
  // camisas
  for (const p of first()) if (!p.shirt) p.shirt = freeShirt(w, club, p.pos);
  for (const p of club.players.map((id) => w.players[id])) if (!p.shirt) p.shirt = freeShirt(w, club, p.pos);
}
