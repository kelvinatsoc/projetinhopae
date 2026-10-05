// Categorias de base: novos talentos (regens) e lendas renascidas.
import { LEGENDS, TIER_NAMES, type LegendDef } from "../data/legends";
import { legendImage } from "./media";
import { addNews } from "./news";
import { fitAttrs, generatePlayer, newPlayerBase, wageFor } from "./player";
import { POS_NAME, rawOvr } from "./positions";
import { chance, clamp, gauss, pickWeighted, rand, randInt } from "./rng";
import type { Attrs, Club, Player, World } from "./types";

/** Promoção anual de garotos de 15-17 anos em todos os clubes. */
export function youthIntake(w: World) {
  const user = w.clubs[w.userClubId];
  const userNew: Player[] = [];
  for (const club of Object.values(w.clubs)) {
    const n = club.div === "A" ? randInt(3, 5) : club.div === "B" || club.div === "F" ? randInt(2, 4) : randInt(2, 3);
    for (let i = 0; i < n; i++) {
      const ageY = randInt(15, 17);
      const ovr = clamp(Math.round(38 + club.youthLevel * 2.5 + (ageY - 15) * 3 + gauss(0, 4)), 30, 70);
      const p = generatePlayer(w, club, ovr, ageY, undefined, true);
      let pot = Math.round(ovr + 14 + club.youthLevel * 3 + gauss(0, 7));
      if (chance(0.03)) pot += 8; // joia rara
      p.pot = clamp(pot, ovr + 5, 92);
      p.fame = 1;
      p.wage = Math.round(wageFor(p.ovr, club.rep, ageY));
      p.contractEnd = w.season + 3;
      if (club.id === user.id) userNew.push(p);
    }
    trimYouth(w, club);
  }
  if (userNew.length) {
    userNew.sort((a, b) => b.pot - a.pot);
    const best = userNew[0];
    addNews(w, "youth", `${userNew.length} garotos promovidos à base`,
      `Os novos talentos chegaram depois da Copinha. Destaque: ${best.name} (${POS_NAME[best.pos]}, ${w.season - best.born} anos). Veja em Clube › Base.`, { pid: best.id });
  }
}

/** Mantém a base com no máximo 14 jogadores (dispensa quem tem menos potencial). */
function trimYouth(w: World, club: Club) {
  const youth = club.players.map((id) => w.players[id]).filter((p) => p?.youth && !p.legend);
  if (youth.length <= 14) return;
  youth.sort((a, b) => a.pot - b.pot);
  for (const p of youth.slice(0, youth.length - 14)) {
    club.players = club.players.filter((id) => id !== p.id);
    delete w.players[p.id];
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
  if (chance(0.3)) return user;
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
