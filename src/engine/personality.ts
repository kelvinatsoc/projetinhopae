// Personalidade e atributos ocultos (escala 1–20, estilo FM).
// Gerados com um gerador próprio por jogador: não mexem no gerador global do mundo.
import { LEGEND_BY_ID } from "../data/legends";
import { seeded } from "./common";
import { clamp } from "./rng";
import type { Hidden, Player, World } from "./types";

/** Índices da tupla Hidden. */
export const H = { pro: 0, amb: 1, loy: 2, temp: 3, con: 4, big: 5, inj: 6 } as const;
export type HiddenKey = keyof typeof H;

/** Valores neutros para quem ainda não tem atributos ocultos. */
const NEUTRAL: Hidden = [10, 10, 10, 10, 10, 10, 8];

export const hidOf = (p: Player): Hidden => p.hid ?? NEUTRAL;

/** Sorteia os atributos ocultos de um jogador (determinístico por semente do mundo + id). */
export function rollHidden(w: World, p: Player): Hidden {
  const r = seeded(w, `${p.id}:h`);
  const tri = () => 1 + Math.floor((19 * (r() + r())) / 2); // triangular, média 10,5
  const pro = tri();
  const amb = tri();
  const loy = tri();
  const temp = tri();
  const con = clamp(tri() + Math.round((p.ovr - 62) / 6), 1, 20);
  const big = tri();
  const inj = clamp(tri() - 3, 1, 20);
  const h: Hidden = [pro, amb, loy, temp, con, big, inj];
  if (p.real && p.fame >= 30) h[H.amb] = Math.min(20, h[H.amb] + 2);
  if (p.real || p.legend) {
    // pessoas reais e lendas nunca ganham rótulos negativos
    h[H.pro] = Math.max(8, h[H.pro]);
    h[H.temp] = Math.min(14, h[H.temp]);
    h[H.con] = Math.max(7, h[H.con]);
  }
  if (p.legend) {
    h[H.pro] = Math.max(h[H.pro], 15);
    h[H.big] = Math.max(h[H.big], 14);
    const min = LEGEND_BY_ID[p.legend]?.hid;
    if (min?.pro) h[H.pro] = Math.max(h[H.pro], min.pro);
    if (min?.big) h[H.big] = Math.max(h[H.big], min.big);
    if (min?.loy) h[H.loy] = Math.max(h[H.loy], min.loy);
  }
  return h;
}

/** Rótulo de personalidade (o primeiro que se aplica). */
export function personalityLabel(p: Player): string {
  const h = hidOf(p);
  if (h[H.pro] >= 16) return "Profissional exemplar";
  if (h[H.loy] >= 16) return "Leal ao clube";
  if (h[H.amb] >= 16) return "Ambicioso";
  if (h[H.big] >= 16) return "Cresce na pressão";
  if (h[H.temp] >= 16) return "Temperamental";
  if (h[H.pro] <= 5) return "Desleixado";
  if (h[H.con] <= 5) return "Inconstante";
  return "Equilibrado";
}

/** Uma frase explicando cada rótulo (para a ficha do jogador). */
export const PERSONALITY_DESC: Record<string, string> = {
  "Profissional exemplar": "Treina forte todo dia e evolui mais rápido que a média.",
  "Leal ao clube": "Muito ligado ao clube: pede menos para renovar e raramente quer sair.",
  "Ambicioso": "Quer jogar sempre e sonha alto — cobra minutos e pode querer um clube maior.",
  "Cresce na pressão": "Rende mais em mata-mata, finais e clássicos.",
  "Temperamental": "Esquentado: leva mais cartões e reage mal a broncas.",
  "Desleixado": "Não gosta de treinar e evolui mais devagar.",
  "Inconstante": "Alterna jogos ótimos com atuações apagadas.",
  "Equilibrado": "Sem extremos: um jogador tranquilo de lidar.",
};

/** Linhas do relatório do auxiliar, das mais marcantes para as menos (até 4; 2 com auxiliar fraco). */
export function reportLines(p: Player, auxStars: number): string[] {
  const h = hidOf(p);
  const lines: { t: string; x: number }[] = [];
  const add = (cond: boolean, t: string, x: number) => { if (cond) lines.push({ t, x }); };
  const con = h[H.con], big = h[H.big], inj = h[H.inj], pro = h[H.pro];
  add(con >= 15, "Muito regular, raramente vai mal", con - 10.5);
  add(con <= 6, "Oscila muito de um jogo para outro", 10.5 - con);
  add(big >= 15, "Cresce nos jogos grandes", big - 10.5);
  add(big <= 6, "Costuma sumir em jogos grandes", 10.5 - big);
  add(inj >= 13, "Propenso a lesões", inj - 7.5);
  add(inj <= 3, "Raramente se machuca", 7.5 - inj);
  add(pro >= 15, "Exemplo nos treinos", pro - 10.5);
  add(pro <= 6, "Não gosta de treinar", 10.5 - pro);
  add(h[H.amb] >= 15, "Quer jogar sempre e sonha alto", h[H.amb] - 10.5);
  add(h[H.loy] >= 15, "Muito ligado ao clube", h[H.loy] - 10.5);
  add(h[H.temp] >= 15, "Perde a cabeça com facilidade", h[H.temp] - 10.5);
  lines.sort((a, b) => b.x - a.x); // ordenação estável: empates mantêm a ordem acima
  return lines.slice(0, auxStars < 3 ? 2 : 4).map((l) => l.t);
}
