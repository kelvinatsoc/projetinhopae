// Utilitários compartilhados pelos módulos de gestão (treino, base, vestiário, admin...).
import { getRngState, hashString, makeRng, setRngState } from "./rng";
import type { Club, Div, Fixture, World } from "./types";

/** Dia absoluto (cresce sempre, atravessando temporadas). */
export const absDay = (w: World) => w.season * 400 + w.day;

/**
 * Roda fn usando o gerador aleatório do mundo e salva o estado no fim.
 * Use SÓ em ações disparadas pela interface — nunca dentro de advance().
 */
export function withWorldRng<T>(w: World, fn: () => T): T {
  setRngState(w.rng);
  try {
    return fn();
  } finally {
    w.rng = getRngState();
  }
}

/** Gerador independente e determinístico por mundo + chave (não mexe no estado global). */
export const seeded = (w: World, key: string) => makeRng(hashString(`${w.seed}:${key}`));

export const DIV_MULT: Record<Div, number> = { A: 1, B: 0.4, C: 0.15, D: 0.1, F: 0.5 };
export const divMult = (c: Club) => DIV_MULT[c.div];

/** 0 = janela do início do ano, 1 = janela do meio do ano, -1 = fechada. */
export const windowIndex = (day: number) => (day <= 89 ? 0 : day >= 181 && day <= 242 ? 1 : -1);

const CLASSICOS: [string, string][] = [
  ["remo", "paysandu"], ["sport", "santa-cruz"], ["sport", "nautico"], ["ceara", "fortaleza"], ["bahia", "vitoria"],
  ["atletico-mg", "cruzeiro"], ["gremio", "internacional"], ["athletico-pr", "coritiba"], ["goias", "vila-nova"],
  ["avai", "figueirense"], ["ponte-preta", "guarani"], ["boca-juniors", "river-plate"],
];
const CLASSICO_SET = new Set(CLASSICOS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

/** Clássico: pares tradicionais, ou dois grandes (rep ≥ 70) brasileiros do mesmo estado. */
export function isClassico(w: World, a: string, b: string): boolean {
  if (CLASSICO_SET.has(`${a}|${b}`)) return true;
  const ca = w.clubs[a];
  const cb = w.clubs[b];
  if (!ca || !cb) return false;
  return ca.country === "BRA" && cb.country === "BRA" && ca.region === cb.region && ca.rep >= 70 && cb.rep >= 70;
}

/** Jogo grande: quartas, semi, final, mata-mata da Libertadores ou clássico. */
export function isBigMatch(w: World, f: Fixture): boolean {
  return ["qf", "sf", "final"].includes(f.stage) || (f.comp === "liberta" && f.stage !== "group") || isClassico(w, f.home, f.away);
}

/** Estrelas de 0 a 5 em texto: ★★★☆☆. */
export const stars = (n: number) => {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(k) + "☆".repeat(5 - k);
};
