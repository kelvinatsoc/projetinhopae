// 3º uniforme criado pelo usuário: um por temporada, salvo no clube (Club.customKit).
import { addNews } from "./news";
import type { Club, CustomKit, World } from "./types";

export const KIT_PATTERNS: { id: CustomKit["pat"]; label: string }[] = [
  { id: "solid", label: "Liso" },
  { id: "stripes", label: "Listras" },
  { id: "band", label: "Faixa" },
  { id: "sash", label: "Diagonal" },
  { id: "halves", label: "Metades" },
  { id: "hoops", label: "Aros" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Rascunho inicial: o atual ou as cores do clube invertidas. */
export function draftCustomKit(w: World, c: Club): CustomKit {
  if (c.customKit) return { ...c.customKit };
  const [c0 = "#FFFFFF", c1 = "#111111", c2] = c.colors;
  return { season: w.season, b: c1, sl: c1, sh: c0, so: c1, pat: "solid", st: c2 ?? c0, collar: "redonda", sponsorPos: "centro", supplierPos: "direita" };
}

/** Pode criar/editar o uniforme nesta temporada? */
export function canEditCustomKit(w: World, c: Club): boolean {
  return !c.customKit || c.customKit.season < w.season;
}

/** Salva o uniforme (uma vez por temporada). Retorna erro em texto ou null. */
export function saveCustomKit(w: World, c: Club, k: CustomKit): string | null {
  if (!canEditCustomKit(w, c)) return `O 3º uniforme de ${w.season} já foi lançado. Dá para criar outro na próxima temporada.`;
  for (const v of [k.b, k.sl, k.sh, k.so, k.st]) if (!HEX.test(v)) return "Cor inválida.";
  if (!KIT_PATTERNS.some((p) => p.id === k.pat)) return "Padrão inválido.";
  c.customKit = { ...k, season: w.season, wear: c.customKit?.wear ?? false };
  if (c.id === w.userClubId) addNews(w, "info", `${c.name} lança o 3º uniforme de ${w.season}`, "A nova camisa alternativa já está à venda e pode ser usada nos jogos.");
  return null;
}

/** Liga/desliga o 3º uniforme como primeira opção nos jogos (livre, a qualquer hora). */
export function setCustomKitWear(c: Club, on: boolean) {
  if (c.customKit) c.customKit.wear = on;
}
