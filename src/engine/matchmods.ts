// Efeitos de gestão dentro do jogo: jogadas preferidas, forma do dia, jogos grandes, entrosamento,
// foco do treino, comissão técnica e turbo do Modo Administrador.
// Módulo puro, usado pelo motor (match.ts) E pelo auxiliar (assistant.ts): as contas são as mesmas nos dois.
// Tudo é centrado no neutro: clube da IA (entrosamento 70, foco equilibrado, comissão 3★) = multiplicadores 1.
import { adminCheats } from "./admin";
import { isBigMatch } from "./common";
import { chemOf } from "./dressing";
import { linkMult, teamLinkAvg } from "./chemistry";
import { confidenceMult } from "./form";
import { famMult, familiarityOf } from "./tactics";
import { H, hidOf } from "./personality";
import { clamp, hashString, makeRng } from "./rng";
import { staffStars } from "./staff";
import { focusMods } from "./training";
import { hasTrait } from "./traits";
import type { Club, Fixture, Player, Pos, World } from "./types";

/** Multiplicadores de um jogador numa partida. */
export interface PMods {
  eff: number; // forma do dia (rendimento)
  conf: number; // confiança pela fase (rendimento)
  shoot: number; // peso para ser o finalizador
  assist: number; // peso para dar a assistência
  card: number; // peso para levar cartão
  tackle: number; // peso para desarmar
  fouled: number; // peso para sofrer o pênalti
  header: number; // peso para cabecear no escanteio
  fatigue: number; // ritmo de cansaço
  xg: number; // qualidade de cada chute
  injW: number; // peso para se machucar
  injDays: number; // multiplica os dias de lesão
  redP: number; // chance de vermelho direto numa falta para cartão
  pen: number; // bônus na cobrança de pênalti
  penSave: number; // goleiro: tira chance do cobrador
}

/** Multiplicadores de um time em campo. */
export interface SideMult {
  common: number; // entrosamento × líderes (o motor junta com a preleção e limita a [0,94; 1,08])
  att: number;
  mid: number;
  def: number;
  gk: number; // turbo do admin no goleiro
  gkPlus: number; // Paredão
  setPiece: number; // bola parada (escanteio de cabeça e falta direta)
  penAward: number; // chance de cavar pênalti (dribladores)
  penPlus: number; // treino de bola parada: pênalti
  fatigue: number;
}

export const NEUTRAL_SIDE: Readonly<SideMult> = Object.freeze({ common: 1, att: 1, mid: 1, def: 1, gk: 1, gkPlus: 0, setPiece: 1, penAward: 1, penPlus: 0, fatigue: 1 });

/** Limites do bônus conjunto (entrosamento × líderes × preleção). */
export const COMMON_MIN = 0.94;
export const COMMON_MAX = 1.08;
export const commonFactor = (sm: SideMult, talk: number) => clamp(sm.common * (1 + talk), COMMON_MIN, COMMON_MAX);

/** Peso de cabeceio por posição (vezes (altura/185)²). */
export const HEADER_W: Record<Pos, number> = { GOL: 0, ZAG: 1, LD: 0.3, LE: 0.3, VOL: 0.5, MC: 0.3, MEI: 0.3, PD: 0.3, PE: 0.3, ATA: 1 };

/** Bola parada: chance de um escanteio virar cabeçada e de uma falta virar cobrança direta. */
export const SET_PIECE = { header: 0.12, freeKick: 0.04 };
/** Gols de bola parada por time num jogo (medido no motor; usado pelo modelo do auxiliar). */
export const SET_PIECE_GOALS = 0.035;

/** xG de uma cabeçada de escanteio. */
export const headerXg = (p: Player) => clamp(0.07 * (hasTrait(p, "CAB") ? 1.3 : 1) * Math.exp((p.attrs.fis - 70) / 40), 0.02, 0.3);
/** xG de uma falta direta. */
export const freeKickXg = (p: Player) => (hasTrait(p, "FAL") ? 0.09 * (p.attrs.fin / 75) : 0.045);

/**
 * Forma do dia (≈1): o Inconstante varia mais. Jogo grande: quem cresce na pressão rende mais; Decisivo +4%.
 * Determinística por partida e jogador — não mexe no gerador global.
 */
export function formOf(w: World, f: Fixture, p: Player, big = isBigMatch(w, f)): number {
  const rng = makeRng(hashString(`form:${w.seed}:${w.season}:${f.id}:${p.id}`));
  let u = rng();
  if (u <= 0) u = 1e-9;
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  const h = hidOf(p);
  let form = 1 + clamp(z * 0.0012 * (21 - h[H.con]), -0.08, 0.08);
  if (big) {
    form *= 1 + (h[H.big] - 10) * 0.004;
    if (hasTrait(p, "DEC")) form *= 1.04;
  }
  return form;
}

/** Multiplicadores do jogador nesta partida. isUser = joga no clube do usuário. */
export function playerMods(w: World, f: Fixture, p: Player, isUser: boolean, big = isBigMatch(w, f)): PMods {
  const t = (id: Parameters<typeof hasTrait>[1]) => hasTrait(p, id);
  const h = hidOf(p);
  const mat = t("MAT"), chf = t("CHF");
  const fis = isUser ? staffStars(w, w.clubs[w.userClubId], "fis") : 3;
  return {
    eff: formOf(w, f, p, big),
    conf: confidenceMult(p), // fase boa embala (form.ts); fora da nota para não virar bola de neve // fase boa embala (form.ts)
    shoot: mat ? 1.25 : chf && p.pos !== "ATA" ? 1.2 : 1,
    xg: mat ? 1.08 : chf ? 0.9 : 1,
    assist: t("GAR") ? 1.4 : 1,
    card: (0.7 + 0.0286 * h[H.temp]) * (t("PAV") ? 2 : 1) * (t("DES") ? 0.7 : 1),
    tackle: t("RAC") || t("DES") ? 1.3 : 1,
    fouled: t("DRI") ? 2 : 1,
    header: t("CAB") ? 3 : 1,
    fatigue: t("RAC") ? 0.8 : 1,
    injW: 0.4 + h[H.inj] / 12.5,
    injDays: (0.88 + 0.016 * h[H.inj]) * (1 + 0.05 * (3 - fis)), // 1,15 − 0,05 × estrelas do preparador (3★ = exatamente 1)
    redP: t("PAV") ? 0.05 : 0.025,
    pen: t("PEN") ? 0.06 : 0,
    penSave: t("PEG") ? 0.07 : 0,
  };
}

/**
 * Multiplicadores do time com estes 11 em campo.
 * Entrosamento e foco do treino só existem no clube do usuário; o turbo do admin só com a trapaça ligada.
 */
export function sideMult(
  w: World, _f: Fixture, club: Club, slots: Pos[], ids: (number | null)[], oppMentality: number, ownMentality: number, captain?: number,
): SideMult {
  const isUser = club.id === w.userClubId;
  let lid = 1, nDes = 0, nVel = 0, nDri = 0, mur = false;
  ids.forEach((id, k) => {
    if (id == null) return;
    const p = w.players[id];
    if (!p) return;
    if (hasTrait(p, "LID")) lid = Math.max(lid, id === captain ? 1.02 : 1.01);
    if (hasTrait(p, "DES")) nDes++;
    if (hasTrait(p, "VEL")) nVel++;
    if (hasTrait(p, "DRI")) nDri++;
    if (slots[k] === "GOL" && hasTrait(p, "MUR")) mur = true;
  });
  const chem = 1 + (0.04 * (chemOf(w, club) - 70)) / 100;
  // entrosamento dos pares em campo e familiaridade com o sistema (só o usuário; IA = 1)
  const pairs = isUser ? linkMult(teamLinkAvg(w, club, ids)) : 1;
  const fam = isUser ? famMult(familiarityOf(w, club)) : 1;
  const cap = captainMult(w, club, ids, captain);
  const fm = isUser ? focusMods(club) : { att: 1, def: 1, fatigue: 1, setPiece: 1, pen: 0 };
  const boost = isUser ? (adminCheats(w).boost ?? 0) : 0;
  const counter = oppMentality >= 1 || ownMentality <= -1;
  const b = 1 + boost;
  return {
    common: chem * lid * pairs * fam * cap,
    att: fm.att * (counter ? 1 + Math.min(0.03, 0.015 * nVel) : 1) * b,
    mid: b,
    def: fm.def * (1 + Math.min(0.02, 0.01 * nDes)) * b,
    gk: b,
    gkPlus: mur ? 3 : 0,
    setPiece: fm.setPiece,
    penAward: Math.min(1.25, 1 + 0.08 * nDri),
    penPlus: fm.pen,
    fatigue: fm.fatigue,
  };
}

/**
 * Influência do capitão em campo: liderança (fama, tempo de casa, profissionalismo e temperamento).
 * Pequena (−0,4% a +0,8%) e igual para todos os clubes.
 */
export function captainMult(w: World, _club: Club, ids: (number | null)[], captain?: number): number {
  if (captain == null || !ids.includes(captain)) return 1;
  const p = w.players[captain];
  if (!p) return 1;
  const h = hidOf(p);
  const ten = Math.max(0, w.season - p.joined);
  const lead = (p.fame - 40) / 60 + Math.min(ten, 6) / 6 + (h[H.pro] - 10) / 10 - Math.max(0, h[H.temp] - 14) / 6;
  return clamp(1 + 0.003 * lead, 0.996, 1.008);
}
