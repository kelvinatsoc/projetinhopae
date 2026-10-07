// Identidade visual de cada estádio no campo em pixel art (src/ui/stadiumArt.ts).
// Os ~45 maiores estádios dos clubes de database.json são feitos à mão; o resto sai
// de forma procedural a partir da capacidade e das cores do clube mandante.

import type { Club } from "../engine/types";
import { RIVALRIES } from "./rivalries";

/** Formato das arquibancadas. */
export type StandShape =
  | "bowl" // anel oval fechado (Morumbi, Maracanã, Mineirão)
  | "english" // quatro lados retos e cantos fechados (Allianz Parque, Baixada)
  | "track" // anel com pista de atletismo (Nilton Santos, Olímpico)
  | "small" // estádio pequeno: arquibancada baixa, atrás dos gols quase vazio
  | "bombonera" // três lados em ferradura + o paredão vertical de camarotes
  | "open-end"; // um lado aberto para a paisagem (Fonte Nova, Centenario)

export type Roof = "none" | "main" | "partial" | "full";
export type Lights = "towers" | "roof" | "masts";
export type Board = "none" | "left" | "right" | "both" | "analog";
export type Mow = "stripes" | "wide" | "checker" | "rows" | "diagonal" | "rings";

export type Landmark =
  | "morumbi-ring"
  | "maracana-roof"
  | "allianz-facade"
  | "baixada-roof"
  | "centenario-tower"
  | "beira-rio-ribbons"
  | "fonte-nova-view"
  | "corinthians-glass"
  | "sao-januario-facade"
  | "vila-houses"
  | "mineirao-pillars"
  | "bombonera-palcos"
  | "monumental-sash"
  | "castelao-ring"
  | "gremio-arches"
  | "mrv-crown"
  | "nilton-arches"
  | "couto-wall"
  | "mountains"
  | "palms";

export interface StadiumStyle {
  key: string; // chave normalizada ("" para estilos procedurais)
  name: string; // nome mostrado na faixa de abertura
  tag: string; // apelido / frase curta
  shape: StandShape;
  seats: string[]; // cores das cadeiras vazias (padrão em faixas)
  roof: Roof;
  roofColor: string;
  lights: Lights;
  board: Board;
  mow: Mow;
  track?: string; // cor da pista de atletismo
  concrete: string; // estrutura
  outside: string; // o que fica fora do estádio
  fill: number; // ocupação típica (0..1)
  landmarks: Landmark[];
  handmade: boolean;
}

type Hand = Partial<StadiumStyle> & Pick<StadiumStyle, "name" | "shape" | "seats">;

const BASE: Omit<StadiumStyle, "key" | "name" | "shape" | "seats" | "handmade"> = {
  tag: "",
  roof: "none",
  roofColor: "#d8dde0",
  lights: "towers",
  board: "left",
  mow: "stripes",
  concrete: "#5b6265",
  outside: "#16201b",
  fill: 0.8,
  landmarks: [],
};

/** Estádios feitos à mão: chave = nome normalizado (sem acento, minúsculo). Apelidos em ALIASES. */
const HAND: Record<string, Hand> = {
  "maracana": { name: "Maracanã", tag: "O templo do futebol", shape: "bowl", seats: ["#f2c230", "#1f57b8", "#f4f4f4"], roof: "full", roofColor: "#eef1f2", lights: "roof", board: "both", mow: "rings", concrete: "#8d969a", fill: 0.85, landmarks: ["maracana-roof"] },
  "morumbis": { name: "MorumBIS", tag: "O Gigante do Morumbi", shape: "bowl", seats: ["#c81d25", "#f2f2f2", "#1b1b1b"], roof: "partial", roofColor: "#c9ced1", lights: "roof", board: "both", mow: "wide", concrete: "#a9adab", fill: 0.82, landmarks: ["morumbi-ring"] },
  "estadio monumental": { name: "Más Monumental", tag: "El Monumental de Núñez", shape: "bowl", seats: ["#e9e9e9", "#d1202f"], roof: "partial", roofColor: "#e6e6e6", lights: "roof", board: "both", mow: "checker", concrete: "#9a9fa2", fill: 0.92, landmarks: ["monumental-sash"] },
  "estadio monumental u": { name: "Estadio Monumental", tag: "La casa crema de Ate", shape: "bowl", seats: ["#e8ddc0", "#a3192b"], roof: "main", lights: "towers", board: "both", mow: "wide", concrete: "#a29c8c", fill: 0.6, landmarks: ["mountains"] },
  "castelao": { name: "Castelão", tag: "O Gigante da Boa Vista", shape: "bowl", seats: ["#1d5fbf", "#e7392f", "#f2c230", "#2c9b4a"], roof: "full", roofColor: "#d5dadd", lights: "roof", board: "both", mow: "stripes", concrete: "#8e9599", fill: 0.78, landmarks: ["castelao-ring"] },
  "mineirao": { name: "Mineirão", tag: "O Gigante da Pampulha", shape: "bowl", seats: ["#3b4a63", "#c7a73a", "#e4e4e4"], roof: "full", roofColor: "#e3e6e8", lights: "roof", board: "both", mow: "wide", concrete: "#b4b1a6", fill: 0.8, landmarks: ["mineirao-pillars"] },
  "estadio centenario": { name: "Estadio Centenario", tag: "Monumento do futebol mundial", shape: "open-end", seats: ["#8a8f8f"], roof: "none", lights: "towers", board: "right", mow: "checker", concrete: "#b9b5aa", fill: 0.65, landmarks: ["centenario-tower"] },
  "arruda": { name: "Arruda", tag: "O Mundão do Arruda", shape: "bowl", seats: ["#7b7f80"], lights: "towers", board: "analog", mow: "stripes", concrete: "#8a8c86", fill: 0.6 },
  "estadio monumental banco pichincha": { name: "Monumental Isidro Romero", tag: "El Coloso de Guayaquil", shape: "bowl", seats: ["#f4d000", "#e8e8e8"], roof: "main", lights: "towers", board: "both", mow: "stripes", concrete: "#a6a49a", fill: 0.7, landmarks: ["palms"] },
  "estadio alberto j. armando": { name: "La Bombonera", tag: "La Bombonera no tiembla, late", shape: "bombonera", seats: ["#1a3f9c", "#f3c400"], roof: "none", lights: "towers", board: "left", mow: "rows", concrete: "#2546a5", fill: 0.98, landmarks: ["bombonera-palcos"] },
  "estadio mario alberto kempes": { name: "Estadio Kempes", tag: "O Chateau de Córdoba", shape: "track", seats: ["#9da3a6", "#2a4b8d"], roof: "main", lights: "roof", board: "both", track: "#b8553e", mow: "stripes", fill: 0.7, landmarks: ["mountains"] },
  "estadio juan domingo peron": { name: "El Cilindro", tag: "O Cilindro de Avellaneda", shape: "bowl", seats: ["#6fb4e8", "#ececec"], lights: "towers", board: "left", mow: "rows", concrete: "#9aa0a4", fill: 0.92 },
  "arena do gremio": { name: "Arena do Grêmio", tag: "A casa tricolor", shape: "english", seats: ["#1b75bb", "#1b75bb", "#0b0b0b"], roof: "full", roofColor: "#e7eaec", lights: "roof", board: "both", mow: "checker", concrete: "#6f7a80", fill: 0.85, landmarks: ["gremio-arches"] },
  "mangueirao": { name: "Mangueirão", tag: "O Colosso do Marco", shape: "bowl", seats: ["#1a3d8f", "#ffffff", "#c8102e"], roof: "partial", lights: "roof", board: "both", mow: "stripes", fill: 0.8 },
  "beira-rio": { name: "Beira-Rio", tag: "O Gigante da Beira-Rio", shape: "bowl", seats: ["#d01b1b", "#d01b1b", "#ececec"], roof: "full", roofColor: "#f3f4f4", lights: "roof", board: "both", mow: "wide", concrete: "#9aa0a2", fill: 0.85, landmarks: ["beira-rio-ribbons"] },
  "arena fonte nova": { name: "Arena Fonte Nova", tag: "A casa do Esquadrão", shape: "open-end", seats: ["#1a50b5", "#d7262e", "#f1f1f1"], roof: "full", roofColor: "#f1f2f3", lights: "roof", board: "right", mow: "stripes", concrete: "#7f8a8f", fill: 0.82, landmarks: ["fonte-nova-view"] },
  "estadio jose amalfitani": { name: "José Amalfitani", tag: "El Fortín de Liniers", shape: "english", seats: ["#e6e6e6", "#1f4fa3"], roof: "main", lights: "towers", board: "left", mow: "stripes", fill: 0.8 },
  "neo quimica arena": { name: "Neo Química Arena", tag: "A casa do Timão", shape: "english", seats: ["#e3e3e3", "#2a2a2a", "#e3e3e3"], roof: "full", roofColor: "#d9dcde", lights: "roof", board: "both", mow: "checker", concrete: "#586066", fill: 0.92, landmarks: ["corinthians-glass"] },
  "estadio nacional julio martinez pradanos": { name: "Estadio Nacional", tag: "O Nacional de Ñuñoa", shape: "track", seats: ["#c3c6c8", "#1c3f94"], roof: "partial", lights: "towers", board: "both", track: "#b5513a", mow: "stripes", fill: 0.7, landmarks: ["mountains"] },
  "estadio pedro bidegain": { name: "Nuevo Gasómetro", tag: "El Nuevo Gasómetro", shape: "english", seats: ["#1d3a8a", "#c8102e"], lights: "towers", board: "left", mow: "rows", fill: 0.85 },
  "estadio monumental david arellano": { name: "Monumental David Arellano", tag: "O Estadio do Cacique", shape: "bowl", seats: ["#e8e8e8", "#1a1a1a"], roof: "main", lights: "towers", board: "both", mow: "stripes", fill: 0.85, landmarks: ["mountains"] },
  "estadio gigante de arroyito": { name: "Gigante de Arroyito", tag: "O Gigante canalla", shape: "english", seats: ["#1d3d8f", "#f3c400"], lights: "towers", board: "left", mow: "rows", fill: 0.9 },
  "nilton santos": { name: "Nilton Santos", tag: "O Engenhão", shape: "track", seats: ["#3a3a3a", "#f0f0f0"], roof: "full", roofColor: "#e7e9ea", lights: "roof", board: "both", track: "#3a6ec2", mow: "stripes", concrete: "#7d8488", fill: 0.7, landmarks: ["nilton-arches"] },
  "arena mrv": { name: "Arena MRV", tag: "A casa do Galo", shape: "english", seats: ["#141414", "#141414", "#ececec"], roof: "full", roofColor: "#cfd3d5", lights: "roof", board: "both", mow: "checker", concrete: "#3d4246", fill: 0.9, landmarks: ["mrv-crown"] },
  "estadio atanasio girardot": { name: "Atanasio Girardot", tag: "A casa verdolaga", shape: "track", seats: ["#1e8a3f", "#e4e4e4"], roof: "partial", lights: "towers", board: "both", track: "#b5513a", mow: "stripes", fill: 0.75, landmarks: ["mountains"] },
  "nubank parque": { name: "Nubank Parque", tag: "O Allianz Parque", shape: "english", seats: ["#0f6b38", "#0f6b38", "#e6e6e6"], roof: "full", roofColor: "#bfc5c8", lights: "roof", board: "both", mow: "diagonal", concrete: "#6f777b", fill: 0.92, landmarks: ["allianz-facade"] },
  "allianz parque": { name: "Allianz Parque", tag: "A casa do Verdão", shape: "english", seats: ["#0f6b38", "#0f6b38", "#e6e6e6"], roof: "full", roofColor: "#bfc5c8", lights: "roof", board: "both", mow: "diagonal", concrete: "#6f777b", fill: 0.92, landmarks: ["allianz-facade"] },
  "arena pantanal": { name: "Arena Pantanal", tag: "O Verdão do Pantanal", shape: "english", seats: ["#2f9b47", "#f2c230"], roof: "partial", lights: "roof", board: "left", mow: "stripes", fill: 0.55 },
  "arena da baixada": { name: "Ligga Arena", tag: "O Caldeirão", shape: "english", seats: ["#c8102e", "#121212"], roof: "full", roofColor: "#a9b0b4", lights: "roof", board: "both", mow: "checker", concrete: "#3e4447", fill: 0.9, landmarks: ["baixada-roof"] },
  "estadio rodrigo paz delgado": { name: "Casa Blanca", tag: "La Casa Blanca de Ponceano", shape: "english", seats: ["#f1f1f1", "#c8102e"], lights: "towers", board: "left", mow: "stripes", fill: 0.85, landmarks: ["mountains"] },
  "estadio hernando siles": { name: "Hernando Siles", tag: "3.640 m de altitude", shape: "track", seats: ["#9aa2a6", "#2a5aa8"], lights: "towers", board: "both", track: "#a54834", mow: "stripes", fill: 0.6, landmarks: ["mountains"] },
  "couto pereira": { name: "Couto Pereira", tag: "O Alto da Glória", shape: "english", seats: ["#0c6b33", "#f0f0f0"], roof: "main", lights: "towers", board: "analog", mow: "rows", concrete: "#7c8377", fill: 0.8, landmarks: ["couto-wall"] },
  "estadio campeon del siglo": { name: "Campeón del Siglo", tag: "A casa carbonera", shape: "english", seats: ["#f3c400", "#121212"], roof: "full", roofColor: "#d6d9db", lights: "roof", board: "both", mow: "checker", fill: 0.9 },
  "gran parque central": { name: "Gran Parque Central", tag: "Onde nasceu a Copa de 1930", shape: "small", seats: ["#e8e8e8", "#1b3f94", "#c8102e"], roof: "main", lights: "towers", board: "analog", mow: "rows", fill: 0.85 },
  "estadio george capwell": { name: "George Capwell", tag: "El Bombillo", shape: "english", seats: ["#3a9be0", "#e8e8e8"], roof: "main", lights: "towers", board: "left", mow: "stripes", fill: 0.8, landmarks: ["palms"] },
  "estadio el campin": { name: "El Campín", tag: "O Nemesio Camacho", shape: "bowl", seats: ["#9ea4a8", "#1d4fa0"], roof: "main", lights: "towers", board: "both", mow: "stripes", fill: 0.75, landmarks: ["mountains"] },
  "ilha do retiro": { name: "Ilha do Retiro", tag: "A Ilha do Leão", shape: "english", seats: ["#c8102e", "#141414"], lights: "towers", board: "analog", mow: "stripes", fill: 0.8, landmarks: ["palms"] },
  "sao januario": { name: "São Januário", tag: "O Caldeirão da Colina", shape: "small", seats: ["#1b1b1b", "#f0f0f0"], roof: "main", lights: "towers", board: "analog", mow: "rows", concrete: "#d9d3c4", fill: 0.92, landmarks: ["sao-januario-facade"] },
  "vila belmiro": { name: "Vila Belmiro", tag: "O Alçapão da Vila", shape: "small", seats: ["#f4f4f4", "#141414"], roof: "main", lights: "masts", board: "analog", mow: "stripes", concrete: "#d8d8d2", fill: 0.92, landmarks: ["vila-houses"] },
  "barradao": { name: "Barradão", tag: "O Manoel Barradas", shape: "bowl", seats: ["#c8102e", "#141414"], lights: "towers", board: "analog", mow: "stripes", fill: 0.7, landmarks: ["palms"] },
  "arena das dunas": { name: "Arena das Dunas", tag: "As dunas de Natal", shape: "bowl", seats: ["#e8e8e8", "#c8102e"], roof: "full", roofColor: "#f2f2f2", lights: "roof", board: "both", mow: "stripes", fill: 0.55, landmarks: ["beira-rio-ribbons", "palms"] },
  "arena independencia": { name: "Arena Independência", tag: "O Horto", shape: "english", seats: ["#1d8a46", "#141414"], roof: "partial", lights: "roof", board: "left", mow: "stripes", fill: 0.8 },
  "arena conda": { name: "Arena Condá", tag: "A casa da Chape", shape: "small", seats: ["#118a3f", "#f0f0f0"], roof: "main", lights: "masts", board: "analog", mow: "stripes", fill: 0.85 },
  "alfredo jaconi": { name: "Alfredo Jaconi", tag: "O Jaconi na Serra", shape: "small", seats: ["#118a3f", "#f0f0f0"], roof: "main", lights: "masts", board: "analog", mow: "rows", fill: 0.85, landmarks: ["mountains"] },
  "serrinha": { name: "Estádio da Serrinha", tag: "A casa esmeraldina", shape: "small", seats: ["#118a3f", "#f0f0f0"], roof: "main", lights: "masts", board: "analog", mow: "stripes", fill: 0.8 },
  "brinco de ouro": { name: "Brinco de Ouro", tag: "O Brinco da Princesa", shape: "bowl", seats: ["#118a3f", "#f0f0f0"], lights: "towers", board: "analog", mow: "stripes", fill: 0.65 },
  "estadio monumental de maturin": { name: "Monumental de Maturín", tag: "O gigante do oriente venezuelano", shape: "bowl", seats: ["#c8102e", "#f1f1f1", "#1d4fa0"], roof: "partial", lights: "roof", board: "both", mow: "stripes", fill: 0.5, landmarks: ["palms"] },
  "estadio lanus": { name: "La Fortaleza", tag: "O Estadio Granate", shape: "english", seats: ["#7a1530", "#f1f1f1"], lights: "towers", board: "left", mow: "rows", fill: 0.85 },
  "estadio metropolitano roberto melendez": { name: "Metropolitano", tag: "O Coloso de la 72", shape: "track", seats: ["#c8102e", "#f1f1f1"], roof: "partial", lights: "towers", board: "both", track: "#b5513a", mow: "stripes", fill: 0.7, landmarks: ["palms"] },
  "estadio garcilaso": { name: "Estadio Garcilaso", tag: "Futebol a 3.400 m", shape: "track", seats: ["#a49a8a", "#c8102e"], lights: "towers", board: "analog", track: "#a54834", mow: "rows", fill: 0.55, landmarks: ["mountains"] },
  "estadio garcilaso de la vega": { name: "Garcilaso de la Vega", tag: "Futebol a 3.400 m", shape: "track", seats: ["#a49a8a", "#1d4fa0"], lights: "towers", board: "analog", track: "#a54834", mow: "rows", fill: 0.5, landmarks: ["mountains"] },
  "estadio general pablo rojas": { name: "La Nueva Olla", tag: "A Olla azulgrana", shape: "english", seats: ["#1d3d8f", "#c8102e"], roof: "full", roofColor: "#cfd4d7", lights: "roof", board: "both", mow: "checker", fill: 0.85 },
  "estadio libertadores de america – ricardo enrique bochini": { name: "Libertadores de América", tag: "El Infierno Rojo", shape: "english", seats: ["#c8102e", "#c8102e", "#f1f1f1"], roof: "partial", lights: "roof", board: "both", mow: "wide", fill: 0.85 },
  "estadio polideportivo de pueblo nuevo": { name: "Pueblo Nuevo", tag: "O Templo Sagrado de San Cristóbal", shape: "bowl", seats: ["#f3c400", "#141414"], roof: "main", lights: "towers", board: "left", mow: "stripes", fill: 0.6, landmarks: ["mountains"] },
  "estadio olimpico pascual guerrero": { name: "Pascual Guerrero", tag: "O Olímpico de Cali", shape: "track", seats: ["#c8102e", "#f1f1f1"], roof: "main", lights: "towers", board: "both", track: "#b5513a", mow: "stripes", fill: 0.7, landmarks: ["palms"] },
  "estadio arequipa": { name: "Monumental de la UNSA", tag: "Aos pés do Misti", shape: "bowl", seats: ["#141414", "#c8102e"], lights: "towers", board: "both", mow: "stripes", fill: 0.5, landmarks: ["mountains"] },
  "estadio ramon tahuichi aguilera": { name: "Tahuichi Aguilera", tag: "O estádio de Santa Cruz", shape: "track", seats: ["#9ea4a8", "#1d4fa0"], roof: "main", lights: "towers", board: "both", track: "#b5513a", mow: "stripes", fill: 0.55, landmarks: ["palms"] },
  "moises lucarelli": { name: "Moisés Lucarelli", tag: "O Majestoso", shape: "english", seats: ["#141414", "#f0f0f0"], lights: "towers", board: "analog", mow: "stripes", fill: 0.7 },
};

const ALIASES: Record<string, string> = {
  "estadio do maracana": "maracana",
  "morumbi": "morumbis",
  "estadio do morumbi": "morumbis",
  "mas monumental": "estadio monumental",
  "la bombonera": "estadio alberto j. armando",
  "arena corinthians": "neo quimica arena",
  "engenhao": "nilton santos",
  "ligga arena": "arena da baixada",
  "estadio racing club": "estadio juan domingo peron",
  "estadio juan domingo peron ": "estadio juan domingo peron",
  "el cilindro": "estadio juan domingo peron",
  "estadio nemesio camacho el campin": "estadio el campin",
};

/** Nome sem acento, minúsculo e sem espaços duplicados. */
export function normStadium(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function handmadeKeys(): string[] {
  return Object.keys(HAND);
}

/** Estilo feito à mão para o nome do estádio (ou null). */
export function handStyle(stadium: string): StadiumStyle | null {
  const n = normStadium(stadium);
  const key = HAND[n] ? n : ALIASES[n];
  const h = key ? HAND[key] : undefined;
  if (!key || !h) return null;
  return { ...BASE, ...h, key, handmade: true };
}

const MOWS: Mow[] = ["stripes", "wide", "checker", "rows", "diagonal"];

/** Estilo procedural: tamanho define formato, teto e luz; cores do clube nas cadeiras. */
export function proceduralStyle(club: Pick<Club, "id" | "stadium" | "capacity" | "colors">): StadiumStyle {
  const h = hash(club.id + "|" + club.stadium);
  const cap = club.capacity || 0;
  const [c0, c1] = club.colors;
  const big = cap >= 38000;
  const mid = cap >= 18000;
  const shape: StandShape = big ? (h % 3 === 0 ? "track" : "bowl") : mid ? (h % 4 === 0 ? "bowl" : "english") : "small";
  const roof: Roof = big ? (h % 2 ? "full" : "partial") : mid ? (h % 3 === 0 ? "partial" : "main") : h % 2 ? "main" : "none";
  return {
    ...BASE,
    key: "",
    name: club.stadium || "Estádio",
    tag: big ? "Um gigante do continente" : mid ? "Casa cheia, pressão total" : "Futebol de raiz",
    shape,
    seats: h % 5 === 0 ? ["#7d8386"] : [c0, c0, c1 === "#FFFFFF" || c1 === "#ffffff" ? "#e6e6e6" : c1],
    roof,
    lights: roof === "full" ? "roof" : mid ? "towers" : "masts",
    board: big ? "both" : mid ? (h % 2 ? "left" : "right") : "analog",
    mow: MOWS[(h >>> 4) % MOWS.length],
    track: shape === "track" ? (h % 2 ? "#b5513a" : "#3a6ec2") : undefined,
    fill: big ? 0.72 : mid ? 0.75 : 0.85,
    landmarks: [],
    handmade: false,
  };
}

/** Estilo do estádio do clube (neutro → estilo genérico de campo neutro). */
export function stadiumStyleFor(club: Pick<Club, "id" | "stadium" | "capacity" | "colors"> & { fac?: { stadium: number } }, neutral = false): StadiumStyle {
  if (neutral) return { ...BASE, key: "neutral", name: "Campo neutro", tag: "Jogo em campo neutro", shape: "bowl", seats: ["#5d6a73", "#7a868e"], roof: "partial", lights: "roof", board: "both", mow: "stripes", fill: 0.75, landmarks: [], handmade: false };
  const hand = handStyle(club.stadium);
  if (hand) return hand;
  return upgradeByLevel(proceduralStyle(club), club.fac?.stadium);
}

const ROOF_RANK: Roof[] = ["none", "main", "partial", "full"];
/**
 * Estádio procedural reflete as obras da Estrutura (nível 1-5): cobertura maior, refletores
 * no teto e placar dos dois lados. Estádios reais feitos à mão mantêm a identidade.
 */
export function upgradeByLevel(st: StadiumStyle, lv?: number): StadiumStyle {
  if (!lv || lv < 3) return st;
  const roof = ROOF_RANK[Math.max(ROOF_RANK.indexOf(st.roof), lv >= 5 ? 3 : lv >= 4 ? 2 : 1)];
  return {
    ...st,
    roof,
    lights: lv >= 4 && roof !== "none" ? "roof" : st.lights,
    board: lv >= 4 ? "both" : st.board,
    fill: Math.min(0.95, st.fill + (lv - 2) * 0.04),
  };
}

/** Jogo grande (mosaico na arquibancada): mata-mata decisivo, clássico ou dois gigantes. */
export function isBigGame(home: Pick<Club, "id" | "rep">, away: Pick<Club, "id" | "rep">, stage = "league"): boolean {
  if (["final", "sf", "qf"].includes(stage)) return true;
  if (RIVALRIES.some((r) => r.int >= 2 && ((r.a === home.id && r.b === away.id) || (r.b === home.id && r.a === away.id)))) return true;
  return home.rep >= 85 && away.rep >= 85;
}

/** Ocupação esperada (0..1) para o jogo, pela fama do mandante e tamanho do jogo. */
export function attendance(style: StadiumStyle, home: Pick<Club, "rep" | "capacity">, big: boolean): number {
  const fame = home.rep / 100;
  const v = style.fill * (0.55 + fame * 0.5) + (big ? 0.18 : 0);
  return Math.max(0.35, Math.min(0.98, v));
}
