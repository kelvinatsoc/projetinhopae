// Rivalidades e clássicos reais (ids de src/data/database.json).
// Intensidade: 3 = clássico máximo, 2 = grande rivalidade, 1 = rivalidade regional.

export interface Rivalry { a: string; b: string; name: string; int: 1 | 2 | 3 }

export const RIVALRIES: Rivalry[] = [
  // Rio de Janeiro
  { a: "flamengo", b: "fluminense", name: "Fla-Flu", int: 3 },
  { a: "flamengo", b: "vasco", name: "Clássico dos Milhões", int: 3 },
  { a: "flamengo", b: "botafogo", name: "Clássico da Rivalidade", int: 2 },
  { a: "fluminense", b: "botafogo", name: "Clássico Vovô", int: 2 },
  { a: "fluminense", b: "vasco", name: "Clássico dos Gigantes", int: 2 },
  { a: "botafogo", b: "vasco", name: "Clássico da Amizade", int: 2 },
  // São Paulo
  { a: "palmeiras", b: "corinthians", name: "Derby Paulista", int: 3 },
  { a: "palmeiras", b: "sao-paulo", name: "Choque-Rei", int: 3 },
  { a: "corinthians", b: "sao-paulo", name: "Majestoso", int: 3 },
  { a: "santos", b: "sao-paulo", name: "San-São", int: 2 },
  { a: "santos", b: "corinthians", name: "Clássico Alvinegro", int: 2 },
  { a: "santos", b: "palmeiras", name: "Clássico da Saudade", int: 2 },
  { a: "ponte-preta", b: "guarani", name: "Derby Campineiro", int: 3 },
  // Sul
  { a: "gremio", b: "internacional", name: "Gre-Nal", int: 3 },
  { a: "athletico-pr", b: "coritiba", name: "Atletiba", int: 3 },
  { a: "juventude", b: "caxias", name: "Ca-Ju", int: 2 },
  { a: "avai", b: "figueirense", name: "Clássico da Ilha", int: 2 },
  // Minas, Nordeste, Norte e Centro-Oeste
  { a: "atletico-mg", b: "cruzeiro", name: "Clássico Mineiro", int: 3 },
  { a: "america-mg", b: "atletico-mg", name: "Clássico Mineiro (Coelho × Galo)", int: 1 },
  { a: "bahia", b: "vitoria", name: "Ba-Vi", int: 3 },
  { a: "remo", b: "paysandu", name: "Re-Pa", int: 3 },
  { a: "ceara", b: "fortaleza", name: "Clássico-Rei", int: 3 },
  { a: "sport", b: "santa-cruz", name: "Clássico das Multidões", int: 2 },
  { a: "sport", b: "nautico", name: "Clássico dos Clássicos", int: 2 },
  { a: "nautico", b: "santa-cruz", name: "Clássico das Emoções", int: 2 },
  { a: "goias", b: "vila-nova", name: "Clássico Goiano", int: 2 },
  { a: "goias", b: "atletico-go", name: "Clássico Goiano (Dragão)", int: 1 },
  { a: "abc", b: "america-rn", name: "Clássico-Rei Potiguar", int: 2 },
  { a: "crb", b: "csa", name: "Clássico Alagoano", int: 2 },
  { a: "botafogo-pb", b: "treze", name: "Clássico Tradição", int: 2 },
  { a: "confianca", b: "itabaiana", name: "Clássico Sergipano", int: 1 },
  // América do Sul
  { a: "boca-juniors", b: "river-plate", name: "Superclásico", int: 3 },
  { a: "racing", b: "independiente", name: "Clásico de Avellaneda", int: 3 },
  { a: "penarol", b: "nacional-uru", name: "Clásico Uruguayo", int: 3 },
  { a: "olimpia", b: "cerro-porteno", name: "Superclásico Paraguayo", int: 3 },
  { a: "colo-colo", b: "u-de-chile", name: "Superclásico Chileno", int: 3 },
  { a: "u-de-chile", b: "u-catolica", name: "Clásico Universitario", int: 2 },
  { a: "atletico-nacional", b: "medellin", name: "Clásico Paisa", int: 3 },
  { a: "millonarios", b: "santa-fe", name: "Clásico Capitalino", int: 3 },
  { a: "barcelona-sc", b: "emelec", name: "Clásico del Astillero", int: 3 },
  { a: "universitario", b: "alianza-lima", name: "Clásico del Perú", int: 3 },
  { a: "bolivar", b: "the-strongest", name: "Clásico Paceño", int: 3 },
  { a: "caracas", b: "ucv", name: "Clásico Capitalino Venezuelano", int: 2 },
];

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const BY_PAIR = new Map(RIVALRIES.map((r) => [key(r.a, r.b), r]));

/** Rivalidade entre dois clubes (ou undefined). */
export const rivalryOf = (a: string, b: string): Rivalry | undefined => BY_PAIR.get(key(a, b));
/** 0 = sem rivalidade; 1 a 3 = intensidade do clássico. */
export const derbyIntensity = (a: string, b: string): number => rivalryOf(a, b)?.int ?? 0;
export const isDerby = (a: string, b: string): boolean => BY_PAIR.has(key(a, b));
/** Nome do clássico (ex.: "Fla-Flu"). */
export const derbyName = (a: string, b: string): string | undefined => rivalryOf(a, b)?.name;
/** Rivais de um clube, do maior para o menor. */
export const rivalsOf = (id: string): { id: string; name: string; int: number }[] =>
  RIVALRIES.filter((r) => r.a === id || r.b === id)
    .map((r) => ({ id: r.a === id ? r.b : r.a, name: r.name, int: r.int }))
    .sort((x, y) => y.int - x.int);
