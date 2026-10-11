// Troféu oficial de cada competição: modelo 3D procedural fiel ao formato da taça real
// (trophy3d.ts). Se uma foto recortada com fundo transparente for colocada em
// public/media/trophies/<id>.webp e listada em src/data/trophyPhotos.json, ela tem prioridade.
// (As fotos do Commons testadas tinham fundos de museu/estádio que não recortam limpo.)
import PHOTOS from "../data/trophyPhotos.json";

export interface TrophySpec {
  key: string;
  /** nome popular da taça */
  name: string;
  metal: "gold" | "silver" | "bronze";
  accent?: "gold" | "silver" | "bronze";
  shape: "ears" | "vase" | "slim" | "bowl" | "tall" | "wc" | "dish" | "hex" | "ring";
  handles?: "none" | "ears" | "loops" | "small";
  base?: "plinth" | "wood" | "green" | "star";
  top?: "none" | "globe" | "ball" | "figure" | "crown" | "lid";
}

const S = (key: string, name: string, o: Omit<TrophySpec, "key" | "name">): TrophySpec => ({ key, name, ...o });

const SPECS: Record<string, TrophySpec> = {
  serieA: S("serieA", "Taça do Brasileirão", { metal: "gold", accent: "silver", shape: "bowl", handles: "loops", base: "star", top: "ball" }),
  serieB: S("serieB", "Taça da Série B", { metal: "silver", accent: "gold", shape: "bowl", handles: "loops", base: "star", top: "ball" }),
  serieC: S("serieC", "Taça da Série C", { metal: "silver", accent: "bronze", shape: "bowl", handles: "small", base: "star" }),
  serieD: S("serieD", "Taça da Série D", { metal: "bronze", accent: "silver", shape: "bowl", handles: "small", base: "star" }),
  copaBR: S("copaBR", "Taça da Copa do Brasil", { metal: "silver", accent: "gold", shape: "tall", handles: "loops", base: "plinth", top: "lid" }),
  supercopa: S("supercopa", "Taça da Supercopa", { metal: "gold", shape: "slim", handles: "small", base: "plinth" }),
  liberta: S("liberta", "Taça Libertadores", { metal: "silver", accent: "gold", shape: "bowl", handles: "loops", base: "wood", top: "figure" }),
  sula: S("sula", "Taça Sul-Americana", { metal: "silver", accent: "gold", shape: "tall", handles: "small", base: "wood" }),
  recopa: S("recopa", "Taça da Recopa", { metal: "silver", shape: "bowl", handles: "small", base: "wood" }),
  ucl: S("ucl", "Orelhuda", { metal: "silver", shape: "ears", handles: "ears", base: "plinth" }),
  uel: S("uel", "Taça da Europa League", { metal: "silver", shape: "vase", handles: "none", base: "plinth" }),
  uecl: S("uecl", "Taça da Conference League", { metal: "silver", shape: "slim", handles: "none", base: "plinth" }),
  wc: S("wc", "Taça da Copa do Mundo", { metal: "gold", shape: "wc", base: "green", top: "globe" }),
  euro: S("euro", "Troféu Henri Delaunay", { metal: "silver", shape: "vase", handles: "small", base: "plinth" }),
  ca: S("ca", "Taça da Copa América", { metal: "silver", accent: "gold", shape: "tall", handles: "loops", base: "wood", top: "lid" }),
  cwc: S("cwc", "Troféu do Mundial de Clubes", { metal: "gold", shape: "ring", base: "plinth" }),
  intercontinental: S("intercontinental", "Taça Intercontinental", { metal: "gold", accent: "silver", shape: "slim", base: "plinth", top: "globe" }),
  acle: S("acle", "Taça da Champions da Ásia", { metal: "silver", accent: "gold", shape: "vase", handles: "loops", base: "plinth" }),
  eng1: S("eng1", "Troféu da Premier League", { metal: "silver", accent: "gold", shape: "bowl", handles: "loops", base: "plinth", top: "crown" }),
  esp1: S("esp1", "Troféu de LaLiga", { metal: "silver", shape: "tall", handles: "small", base: "plinth" }),
  ita1: S("ita1", "Coppa Campioni d'Italia", { metal: "silver", accent: "gold", shape: "bowl", handles: "small", base: "plinth" }),
  ger1: S("ger1", "Meisterschale", { metal: "silver", accent: "gold", shape: "dish" }),
  fra1: S("fra1", "Hexagoal", { metal: "silver", shape: "hex", base: "plinth" }),
  por1: S("por1", "Taça da Liga Portugal", { metal: "silver", accent: "gold", shape: "tall", handles: "loops", base: "plinth" }),
  ned1: S("ned1", "Schaal van de Eredivisie", { metal: "silver", accent: "gold", shape: "dish" }),
  tur1: S("tur1", "Taça da Süper Lig", { metal: "silver", accent: "gold", shape: "vase", handles: "small", base: "plinth" }),
  sco1: S("sco1", "Taça da Premiership", { metal: "silver", shape: "bowl", handles: "loops", base: "wood" }),
  arg1: S("arg1", "Copa de la Liga", { metal: "silver", accent: "gold", shape: "tall", handles: "loops", base: "wood" }),
  ksa1: S("ksa1", "Taça da Saudi Pro League", { metal: "gold", shape: "vase", handles: "small", base: "plinth" }),
  jpn1: S("jpn1", "Taça da J1 League", { metal: "silver", shape: "slim", handles: "small", base: "plinth" }),
  usa1: S("usa1", "Philip F. Anschutz Trophy", { metal: "silver", accent: "gold", shape: "bowl", handles: "small", base: "plinth" }),
};

/** Estaduais: cada um com a sua taça (formatos variados, todas douradas ou prateadas). */
const ESTADUAL_SPECS: Record<string, Omit<TrophySpec, "key" | "name">> = {
  "est-SP": { metal: "gold", accent: "silver", shape: "tall", handles: "loops", base: "plinth", top: "lid" },
  "est-RJ": { metal: "silver", accent: "gold", shape: "bowl", handles: "loops", base: "plinth" },
  "est-MG": { metal: "gold", shape: "bowl", handles: "small", base: "wood" },
  "est-RS": { metal: "silver", accent: "gold", shape: "vase", handles: "small", base: "plinth" },
  "est-PR": { metal: "gold", shape: "slim", handles: "small", base: "plinth" },
  "est-SC": { metal: "silver", shape: "tall", handles: "small", base: "plinth" },
  "est-GO": { metal: "gold", shape: "bowl", handles: "loops", base: "plinth" },
  "est-CE": { metal: "silver", accent: "gold", shape: "slim", base: "wood" },
  "est-PE": { metal: "gold", shape: "vase", handles: "small", base: "plinth" },
  "est-BA": { metal: "gold", accent: "silver", shape: "tall", handles: "loops", base: "wood" },
  "est-PA": { metal: "silver", shape: "bowl", handles: "small", base: "plinth" },
};

/** Chave da logo/troféu: torneios de seleções vêm como "wc-2026", "euroq-2027"...; Apertura/Clausura usam a liga. */
export function compKey(id: string): string {
  const m = /^(wc|wcq|fr|euro|euroq|ca)-/.exec(id);
  if (m) return m[1] === "euroq" ? "euro" : m[1];
  if (id === "arg1a" || id === "arg1c") return "arg1";
  return id;
}

const ESTADUAL_NAMES: Record<string, string> = {
  "est-SP": "Taça do Paulistão", "est-RJ": "Taça Guanabara", "est-MG": "Taça do Mineiro", "est-RS": "Taça do Gauchão",
};

export function trophySpec(id: string): TrophySpec {
  const k = compKey(id);
  if (SPECS[k]) return SPECS[k];
  if (k.startsWith("est-")) {
    const o = ESTADUAL_SPECS[k] ?? { metal: "gold", shape: "bowl", handles: "loops", base: "plinth" };
    return S(k, ESTADUAL_NAMES[k] ?? "Taça do Estadual", o);
  }
  return S(k, "Taça", { metal: "gold", shape: "bowl", handles: "loops", base: "plinth" });
}

const PHOTO_SET = new Set<string>(PHOTOS as string[]);

/** Caminho da foto recortada do troféu (relativo a media/), se houver. */
export function trophyPhoto(id: string): string | null {
  const k = compKey(id);
  return PHOTO_SET.has(k) ? `trophies/${k}.webp` : null;
}
