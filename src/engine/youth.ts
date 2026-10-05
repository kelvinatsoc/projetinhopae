// Categorias de base: novos talentos (regens) e lendas renascidas.
import { LEGENDS, TIER_NAMES, type LegendDef } from "../data/legends";
import { adminCheats } from "./admin";
import { seeded } from "./common";
import { legendImage } from "./media";
import { addNews } from "./news";
import { fitAttrs, generatePlayer, newPlayerBase, wageFor } from "./player";
import { H, hidOf } from "./personality";
import { POS_NAME, rawOvr } from "./positions";
import { chance, clamp, gauss, pickWeighted, rand, randInt } from "./rng";
import { staffStars } from "./staff";
import { freeShirt } from "./transfers";
import type { Attrs, Club, IntakeQuality, Player, Pos, TraitId, World } from "./types";

export interface IntakeOpts {
  quality?: IntakeQuality; // qualidade forçada da safra (relatório do coordenador / admin)
  forceGem?: boolean; // garante uma joia rara
  pending?: boolean; // garotos vão para a peneira (fora de w.players) em vez de direto para a base
}

/** Notas da base (as duas novas caem para youthLevel em saves antigos). */
export const youthRec = (c: Club) => c.youthLevel;
export const youthFac = (c: Club) => c.youthFac ?? c.youthLevel;
export const youthCoach = (c: Club) => c.youthCoach ?? c.youthLevel;
/** Vagas na base do usuário. */
export const youthCap = (c: Club) => 10 + 2 * youthFac(c);
/** Garotos que ocupam vaga (lendas não contam: nunca são cortadas). */
export const youthCount = (w: World, c: Club) => c.players.filter((id) => w.players[id]?.youth && !w.players[id].legend).length;

const Q_MOD: Record<IntakeQuality, number> = { fraca: -3, normal: 0, boa: 3, dourada: 6 };
export const Q_LABEL: Record<IntakeQuality, string> = { fraca: "Fraca", normal: "Normal", boa: "Boa", dourada: "Dourada" };
export const Q_STARS: Record<IntakeQuality, number> = { fraca: 2, normal: 3, boa: 4, dourada: 5 };
const Q_ORDER: IntakeQuality[] = ["fraca", "normal", "boa", "dourada"];

/** Qualidade da safra do usuário nesta temporada (admin > relatório do coordenador > normal). */
function userQuality(w: World): IntakeQuality {
  if (w.intakeForce) return w.intakeForce;
  if (w.intakePreview?.season === w.season) return w.intakePreview.q;
  return "normal";
}

/**
 * Safra anual de um clube: gera os garotos de 15-17 anos e enxuga a base.
 * A ordem dos sorteios é a mesma da safra antiga; nas notas padrão as médias também são as mesmas.
 */
export function intakeForClub(w: World, club: Club, opts: IntakeOpts = {}): Player[] {
  const user = club.id === w.userClubId;
  const rec = youthRec(club), fac = youthFac(club), coach = youthCoach(club);
  const quality: IntakeQuality = opts.quality ?? (user ? userQuality(w) : "normal");
  const gemPos = user && w.intakePreview?.season === w.season ? w.intakePreview.pos : undefined;
  const forceGem = !!opts.forceGem || (user && !!w.forceGem) || quality === "dourada";
  const bas = staffStars(w, club, "bas");
  const out: Player[] = [];
  let n = club.div === "A" ? randInt(3, 5) : club.div === "B" || club.div === "F" ? randInt(2, 4) : randInt(2, 3);
  if (rec === 5) n++;
  if (quality === "dourada") n++;
  for (let i = 0; i < n; i++) {
    const ageY = randInt(15, 17);
    const ovr = clamp(Math.round(38 + fac * 2.5 + (ageY - 15) * 3 + gauss(0, 4)), 30, 70);
    const gemKid = forceGem && i === 0;
    const p = generatePlayer(w, club, ovr, ageY, gemKid ? gemPos : undefined, true);
    let pot = Math.round(ovr + 14 + rec * 2 + coach + gauss(0, 7)) + Q_MOD[quality];
    const gemChance = 0.02 + rec * 0.004 + (user ? 0.005 * (bas - 3) : 0);
    if (chance(gemChance) || gemKid) pot += 8; // joia rara
    p.pot = Math.max(clamp(pot, ovr + 5, 92), p.ovr); // o overall real pode variar um pouco do sorteado
    p.fame = 1;
    p.wage = Math.round(wageFor(p.ovr, club.rep, ageY));
    p.contractEnd = w.season + 3;
    if (user) {
      // coordenador da base forma garotos mais profissionais
      const h = [...hidOf(p)] as NonNullable<Player["hid"]>;
      h[H.pro] = clamp(h[H.pro] + Math.round((bas - 3) * 1.5), 1, 20);
      p.hid = h;
      const pav = !p.real && !p.legend && h[H.temp] >= 17;
      const traits: TraitId[] = (p.traits ?? []).filter((t) => t !== "PAV");
      if (pav) traits.push("PAV");
      p.traits = traits;
    }
    out.push(p);
  }
  if (user) {
    delete w.intakeForce;
    delete w.forceGem;
  }
  if (opts.pending) toPeneira(w, club, out);
  else trimYouth(w, club);
  return out;
}

/** Tira os garotos do mundo e os coloca na peneira (os ids continuam reservados por nextPid). */
function toPeneira(w: World, club: Club, kids: Player[]) {
  if (!kids.length) return;
  const ids = new Set(kids.map((k) => k.id));
  club.players = club.players.filter((id) => !ids.has(id));
  for (const k of kids) delete w.players[k.id];
  if (w.peneira) w.peneira.kids.push(...kids);
  else w.peneira = { season: w.season, day: w.day, kids };
}

/** Promoção anual de garotos de 15-17 anos em todos os clubes. O usuário recebe os seus na peneira. */
export function youthIntake(w: World) {
  const user = w.clubs[w.userClubId];
  // o clube do usuário fica por último: as escolhas dele nunca mudam a safra da IA
  // clubes fictícios dos estaduais não têm categorias de base
  for (const club of Object.values(w.clubs)) if (club.id !== user.id && !club.minor) intakeForClub(w, club);
  resolvePeneiraAuto(w); // segurança: nunca duas peneiras ao mesmo tempo
  const kids = intakeForClub(w, user, { pending: true });
  if (!kids.length) return;
  const gem = kids.some(isGem);
  addNews(w, "youth", `🌱 Dia da peneira! ${kids.length} garotos esperando sua avaliação`,
    `Os novos talentos chegaram depois da Copinha${gem ? " — e os olheiros falam de uma joia rara" : ""}. Vire as cartas e escolha quem assina com a base. Se esquecer, o coordenador decide sozinho em 30 dias.`);
}

/** Joia rara: muito potencial acima do nível atual ou potencial de craque. */
export const isGem = (p: Player) => p.pot - p.ovr >= 30 || p.pot >= 82;

/** Relatório do coordenador da base sobre a próxima safra (dia YOUTH_PREVIEW_DAY). */
export function previewIntake(w: World) {
  const club = w.clubs[w.userClubId];
  if (!club) return;
  const r = seeded(w, `intake:${w.season + 1}:${w.userClubId}`);
  const k = youthCoach(club) - 3;
  const weights = [20 - 2 * k, 50 - 2 * k, 24 + 3 * k, 6 + k].map((x) => Math.max(1, x));
  const q = Q_ORDER[pickIdx(weights, r())];
  const bas = staffStars(w, club, "bas");
  const miss = bas <= 2 ? 0.25 : bas === 3 ? 0.1 : 0;
  let si = Q_ORDER.indexOf(q);
  const roll = r(), dir = r();
  if (roll < miss) si = clamp(si + (dir < 0.5 ? -1 : 1), 0, 3);
  const shown = Q_ORDER[si];
  const posList: Pos[] = ["GOL", "ZAG", "LD", "LE", "VOL", "MC", "MEI", "PD", "PE", "ATA"];
  const pos = posList[pickIdx([9, 17, 9, 9, 11, 11, 9, 8, 8, 11], r())];
  w.intakePreview = { season: w.season + 1, q, shown, pos };
  const posName = POS_NAME[pos];
  const text: Record<IntakeQuality, string> = {
    dourada: `🌱 Relatório da base: a próxima geração parece DOURADA! Há um ${posName} que pode ser especial.`,
    boa: `🌱 Relatório da base: safra promissora, com destaque para um ${posName}.`,
    normal: "🌱 Relatório da base: uma safra normal está a caminho.",
    fraca: "🌱 Relatório da base: ano fraco na base, não espere muito.",
  };
  addNews(w, "youth", text[shown], "O coordenador da base avaliou os garotos que chegam no fim de janeiro. Um coordenador melhor erra menos a previsão; treinadores da base melhores trazem safras melhores.");
}

function pickIdx(weights: number[], r: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** Diário: resolve sozinha a peneira esquecida depois de 30 dias. */
export function peneiraTick(w: World) {
  const pn = w.peneira;
  if (pn && (w.season !== pn.season || w.day >= pn.day + 30)) resolvePeneiraAuto(w);
}

type PeneiraState = NonNullable<World["peneira"]> & { signed?: number };

function signKid(w: World, club: Club, k: Player) {
  k.clubId = club.id;
  k.youth = true;
  k.contractEnd = w.season + 3;
  k.joined = w.season;
  w.players[k.id] = k;
  club.players.push(k.id);
  k.shirt = freeShirt(w, club, k.pos);
}

/** O garoto dispensado: 30% de chance de assinar com outro clube brasileiro (A/B). Devolve o clube. */
function releaseKid(w: World, k: Player): Club | null {
  if (!chance(0.3)) return null;
  const pool = Object.values(w.clubs).filter((c) => c.country === "BRA" && (c.div === "A" || c.div === "B") && c.id !== w.userClubId);
  if (!pool.length) return null;
  const c = pool[Math.floor(rand() * pool.length)];
  k.clubId = c.id;
  k.youth = true;
  k.contractEnd = w.season + 3;
  k.joined = w.season;
  k.wage = Math.round(wageFor(k.ovr, c.rep, w.season - k.born));
  w.players[k.id] = k;
  c.players.push(k.id);
  return c;
}

function closePeneira(w: World) {
  const pn = w.peneira as PeneiraState | undefined;
  if (!pn || pn.kids.length) return;
  const n = pn.signed ?? 0;
  w.peneira = undefined;
  addNews(w, "youth", `🌱 Peneira encerrada: ${n} garoto${n === 1 ? "" : "s"} assinado${n === 1 ? "" : "s"}.`, n ? "Eles já estão na base. Veja em Elenco › Base." : "Ninguém novo na base desta vez.");
}

/**
 * Assina e dispensa garotos da peneira (ids). Assina só enquanto houver vaga na base;
 * quem não couber continua esperando. Use dentro de withWorldRng quando vier da interface.
 */
export function resolvePeneira(w: World, sign: number[], release: number[]) {
  const pn = w.peneira as PeneiraState | undefined;
  if (!pn) return;
  const club = w.clubs[w.userClubId];
  const cap = youthCap(club);
  for (const id of sign) {
    const k = pn.kids.find((x) => x.id === id);
    if (!k || youthCount(w, club) >= cap) continue;
    signKid(w, club, k);
    pn.kids = pn.kids.filter((x) => x !== k);
    pn.signed = (pn.signed ?? 0) + 1;
  }
  for (const id of release) {
    const k = pn.kids.find((x) => x.id === id);
    if (!k) continue;
    pn.kids = pn.kids.filter((x) => x !== k);
    const c = releaseKid(w, k);
    if (c) addNews(w, "youth", `O garoto que você dispensou, ${k.name}, assinou com o ${c.name}`, "Quem sabe ele não vira craque por lá…", { pid: k.id, clubId: c.id });
  }
  closePeneira(w);
}

/**
 * Resolve a peneira pendente automaticamente (esquecida por 30 dias ou fim de temporada).
 * Faz o mesmo que a base antiga: entram todos e a base fica com os de maior potencial.
 */
export function resolvePeneiraAuto(w: World) {
  const pn = w.peneira as PeneiraState | undefined;
  if (!pn) return;
  const club = w.clubs[w.userClubId];
  const kids = pn.kids.slice().sort((a, b) => b.pot - a.pot);
  pn.kids = [];
  if (!club) { w.peneira = undefined; return; }
  for (const k of kids) signKid(w, club, k);
  trimYouth(w, club);
  const kept = kids.filter((k) => w.players[k.id]).length;
  pn.signed = (pn.signed ?? 0) + kept;
  const best = kids.find((k) => w.players[k.id]);
  if (best) addNews(w, "youth", `🌱 O coordenador avaliou a peneira por você`, `${kept} garoto${kept === 1 ? "" : "s"} assinado${kept === 1 ? "" : "s"}. Destaque: ${best.name} (${POS_NAME[best.pos]}, ${w.season - best.born} anos).`, { pid: best.id });
  closePeneira(w);
}

/** Mantém a base dentro do limite (dispensa quem tem menos potencial). */
function trimYouth(w: World, club: Club) {
  // IA: 14 vagas como sempre; usuário: 10 + 2 × instalações da base
  const cap = club.id === w.userClubId ? youthCap(club) : 14;
  const youth = club.players.map((id) => w.players[id]).filter((p) => p?.youth && !p.legend);
  if (youth.length <= cap) return;
  youth.sort((a, b) => a.pot - b.pot);
  for (const p of youth.slice(0, youth.length - cap)) {
    club.players = club.players.filter((id) => id !== p.id);
    delete w.players[p.id];
    if (w.scout) {
      delete w.scout.k[p.id];
      w.scout.queue = w.scout.queue.filter((id) => id !== p.id);
      w.scout.recs = w.scout.recs.filter((id) => id !== p.id);
    }
  }
}

// ---------------------------------------------------------------- lendas
const TIER_WEIGHT: Record<number, number> = { 1: 0.25, 2: 0.55, 3: 1 };

export function legendsPerWave(freq: number): number {
  switch (freq) {
    case 0: return 0;
    case 1: return 1;
    case 2: return 2;
    default: return randInt(3, 4);
  }
}

function availableLegends(w: World): LegendDef[] {
  return LEGENDS.filter((l) => {
    const st = w.legends[l.id];
    if (!st) return true;
    if (st.active != null && w.players[st.active]) return false;
    const last = st.appearances[st.appearances.length - 1];
    return !last || w.season - last.season >= 15;
  });
}

function chooseClub(w: World, def: LegendDef): Club {
  const user = w.clubs[w.userClubId];
  if (chance(adminCheats(w).legendRain ? 0.75 : 0.3)) return user; // trapaça "chuva de lendas"
  const origin = def.clubs.map((id) => w.clubs[id]).find(Boolean);
  if (origin && chance(0.75)) return origin;
  const br = Object.values(w.clubs).filter((c) => c.country === "BRA" && c.div !== "D");
  return pickWeighted(br, br.map((c) => c.youthLevel + c.rep / 30));
}

/** Atributos de "lenda" na idade atual: mesmo perfil do auge, porém mais fracos. */
function legendAttrs(def: LegendDef, target: number): Attrs {
  const [vel, fin, pas, dri, def_, fis, gol] = def.a;
  const peak: Attrs = { vel, fin, pas, dri, def: def_, fis, gol };
  fitAttrs(peak, def.pos, def.ovr);
  const diff = def.ovr - target;
  const cur: Attrs = { ...peak };
  for (const k of Object.keys(cur) as (keyof Attrs)[]) {
    // físico e força crescem mais tarde que a técnica
    const extra = k === "fis" ? 6 : k === "vel" ? -2 : 0;
    cur[k] = peak[k] - diff - extra;
  }
  fitAttrs(cur, def.pos, target);
  return cur;
}

export function spawnLegend(w: World, def: LegendDef, club?: Club): Player {
  const c = club ?? chooseClub(w, def);
  const ageY = chance(0.5) ? 15 : 16;
  const target = clamp(Math.round(49 + (ageY - 15) * 3 + rand() * 6 + (def.ovr - 88) * 0.5), 45, 64);
  const attrs = legendAttrs(def, target);
  const p = newPlayerBase(w, {
    name: def.name,
    nat: def.nat,
    born: w.season - ageY,
    pos: def.pos,
    sec: def.sec ? def.sec.slice() : [],
    foot: def.foot,
    height: def.height - (ageY === 15 ? 6 : 3),
    attrs,
    pot: def.ovr,
    youth: true,
    fame: 30,
    legend: def.id,
    face: {
      s: Math.floor(rand() * 2 ** 31),
      r: def.face.r,
      o: { hair: def.face.hair, hc: def.face.hc, fh: def.face.fh, acc: def.face.acc },
    },
  });
  p.ovr = rawOvr(p.attrs, p.pos);
  p.img = legendImage(def.id);
  p.clubId = c.id;
  c.players.push(p.id);
  p.wage = Math.round(wageFor(p.ovr, c.rep, ageY) * 1.5);
  p.contractEnd = w.season + 3;
  const st = (w.legends[def.id] ??= { appearances: [] });
  st.appearances.push({ season: w.season, pid: p.id, clubId: c.id, name: def.name });
  st.active = p.id;
  const tier = TIER_NAMES[def.tier];
  if (c.id === w.userClubId) {
    addNews(w, "legend", `⭐ Uma lenda surgiu na SUA base: ${def.name}!`,
      `Um garoto de ${ageY} anos que lembra muito ${def.full} chegou às suas categorias de base. Lenda ${tier}. Potencial altíssimo — cuide bem dele!`, { pid: p.id, clubId: c.id });
  } else {
    addNews(w, "legend", `🌟 ${def.name} renasce na base do ${c.name}`,
      `Lenda ${tier}: um garoto de ${ageY} anos com o talento de ${def.full} apareceu nas categorias de base do ${c.name}. Será que dá para contratá-lo?`, { pid: p.id, clubId: c.id });
  }
  return p;
}

export function legendWave(w: World) {
  const n = legendsPerWave(w.settings.legendFreq);
  for (let i = 0; i < n; i++) {
    const avail = availableLegends(w);
    if (!avail.length) return;
    // as maiores lendas tendem a aparecer só depois de algumas temporadas
    const seasonsPlayed = w.history.length;
    const weights = avail.map((l) => TIER_WEIGHT[l.tier] * (l.tier === 1 && seasonsPlayed < 1 ? 0.3 : 1));
    spawnLegend(w, pickWeighted(avail, weights));
  }
}
