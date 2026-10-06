// Imprensa e transmissões reais: veículos que fazem as perguntas nas coletivas, assinam as notícias
// e emissoras que passam cada competição (direitos de 2025/26, simplificados).
import { hashString } from "./rng";
import type { Fixture, InboxMsg, NewsItem, World } from "./types";

export const NATIONAL_OUTLETS = ["ge", "ESPN", "Lance!", "UOL Esporte", "Folha", "Estadão", "CNN Esportes", "TNT Sports", "SporTV", "Premiere", "CazéTV", "Placar", "Jovem Pan"];

/** Veículos regionais por estado (entram nas coletivas e notícias de clubes de lá). */
export const REGIONAL_OUTLETS: Record<string, string[]> = {
  SP: ["Rádio Bandeirantes", "Jovem Pan"],
  RJ: ["O Globo", "Rádio Tupi"],
  MG: ["Rádio Itatiaia", "O Tempo"],
  RS: ["Gaúcha ZH", "Rádio Guaíba"],
  PR: ["Banda B", "Tribuna do Paraná"],
  SC: ["NSC Total"],
  BA: ["Correio", "Rádio Sociedade"],
  PE: ["Jornal do Commercio", "Rádio Jornal"],
  CE: ["Diário do Nordeste", "O Povo"],
  PA: ["O Liberal", "Diário do Pará"],
  GO: ["O Popular"],
};

/** Lista de veículos para uma coletiva: nacionais + os da região (com peso dobrado). */
export function pressOutlets(region?: string): string[] {
  const reg = (region && REGIONAL_OUTLETS[region]) || [];
  return [...NATIONAL_OUTLETS, ...reg, ...reg];
}

// tipos de notícia que saem na imprensa (os demais são comunicados internos do clube)
const PRESS_KINDS = new Set(["match", "transfer", "legend", "youth", "season", "injury", "offer", "info"]);

/** Veículo que assina a notícia (determinístico pelo id), ou null para comunicados internos. */
export function newsSource(w: World, n: Pick<NewsItem, "id" | "kind" | "clubId">): string | null {
  if (!PRESS_KINDS.has(n.kind)) return null;
  const region = w.clubs[n.clubId ?? w.userClubId]?.region;
  const list = pressOutlets(region);
  return list[hashString(`news:${n.id}`) % list.length];
}

/** Veículo da notícia que originou a mensagem da caixa de entrada (se veio da imprensa). */
export function inboxSource(w: World, m: Pick<InboxMsg, "newsId" | "clubId">): string | null {
  if (m.newsId == null) return null;
  const n = w.news.find((x) => x.id === m.newsId);
  return n ? newsSource(w, n) : null;
}

const TV: Record<string, string[][]> = {
  serieA: [["Globo", "Premiere"], ["Premiere"], ["SporTV", "Premiere"], ["Record", "CazéTV"], ["Amazon Prime Video"], ["CazéTV", "Premiere"]],
  serieB: [["SporTV", "Premiere"], ["Band"], ["ESPN", "Disney+"], ["Premiere"]],
  serieC: [["DAZN"], ["TV Brasil", "DAZN"]],
  copaBR: [["Globo", "SporTV", "Premiere"], ["Amazon Prime Video"], ["SporTV", "Premiere"]],
  liberta: [["Globo", "ESPN", "Disney+"], ["ESPN", "Disney+"], ["Paramount+"]],
  sula: [["ESPN", "Disney+"], ["Paramount+"]],
  "est-SP": [["Record", "CazéTV"], ["CazéTV"], ["HBO Max"]],
  "est-RJ": [["Band"], ["CazéTV"]],
  "est-MG": [["Globo", "Premiere"], ["CazéTV"]],
  "est-RS": [["RBS TV", "Premiere"], ["SporTV"]],
};

/** Emissoras que transmitem o jogo (vazio quando não há transmissão conhecida). */
export function broadcasters(f: Pick<Fixture, "id" | "comp">): string[] {
  const opts = TV[f.comp];
  if (!opts) return [];
  return opts[hashString(`tv:${f.id}`) % opts.length];
}
