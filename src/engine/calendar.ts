// Calendário da temporada. Dia 0 = 1º de janeiro.
// As rodadas dos campeonatos caem em "semanas" k: domingo (liga), quarta e quinta (copas).

export function sunday(year: number, k: number): number {
  const jan25 = new Date(year, 0, 25);
  const dow = jan25.getDay(); // 0 = domingo
  const first = 24 + ((7 - dow) % 7);
  return first + 7 * k;
}
export const wednesday = (year: number, k: number) => sunday(year, k) + 3;
export const thursday = (year: number, k: number) => sunday(year, k) + 4;
export const saturday = (year: number, k: number) => sunday(year, k) - 1;

// semanas sem rodada de Série A/B (datas FIFA e finais)
const LEAGUE_SKIP = new Set([7, 15, 21, 22, 23, 33, 38, 42, 44]);

/** Semanas sem rodada a mais em ano de Copa do Mundo (só com dados mundiais); as rodadas vão para quartas livres. */
export const WC_EXTRA_SKIP = [20, 24, 25];
const WC_MIDWEEK = [14, 28, 40];

export function leagueDays(year: number, worldCup = false): number[] {
  const out: number[] = [];
  const skip = worldCup ? new Set([...LEAGUE_SKIP, ...WC_EXTRA_SKIP]) : LEAGUE_SKIP;
  const target = worldCup ? 38 - WC_MIDWEEK.length : 38;
  for (let k = 0; out.length < target; k++) if (!skip.has(k)) out.push(sunday(year, k));
  if (worldCup) { out.push(...WC_MIDWEEK.map((k) => wednesday(year, k))); out.sort((a, b) => a - b); }
  return out;
}

// ---------------------------------------------------------------- mundo: datas absolutas e datas FIFA
/** Dias do ano. */
export const yearLen = (y: number) => (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366 : 365);

/** Dia relativo a 1º/jan de `base` para a data (y, mês 0-11, dia). */
export function dayOf(base: number, y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m, d) - Date.UTC(base, 0, 1)) / 86_400_000);
}

/** Dia da semana (0 = domingo) de um dia relativo a 1º/jan de `base`. */
export const dowOf = (base: number, day: number) => new Date(Date.UTC(base, 0, 1 + day)).getUTCDay();

/** Primeiro dia (relativo a `base`) com o dia da semana `dow` a partir da data dada. */
export function onOrAfter(base: number, y: number, m: number, d: number, dow: number): number {
  const x = dayOf(base, y, m, d);
  return x + ((dow - dowOf(base, x) + 7) % 7);
}

export const isWorldCupYear = (y: number) => y >= 2026 && (y - 2026) % 4 === 0;
/** Ano de Euro e Copa América (2028, 2032...). */
export const isContinentalYear = (y: number) => y >= 2028 && y % 4 === 0;

export interface IntlWindow { k: number; start: number; end: number; days: [number, number] }

/** Datas FIFA do ano (dias relativos a 1º/jan do ano): convocação seg → ter da semana seguinte, jogos qui e ter. */
export function intlWindows(year: number): IntlWindow[] {
  const ks = [7, 21, 33, 38, 42].filter((k) => k !== 21 || !(isWorldCupYear(year) || isContinentalYear(year)));
  return ks.map((k) => {
    const s = sunday(year, k);
    return { k, start: s - 6, end: s + 2, days: [s - 3, s + 2] as [number, number] };
  });
}

/** Sábados das ligas europeias (ago/Y–mai/Y+1, relativos a 1º/jan de Y), sem as datas FIFA; completa com terças. */
export function euroLeagueDays(year: number, rounds: number): number[] {
  const blocked = new Set<number>();
  for (const win of intlWindows(year)) for (let d = win.start - 1; d <= win.end; d++) blocked.add(d);
  const off = yearLen(year);
  for (const win of intlWindows(year + 1)) for (let d = win.start - 1; d <= win.end; d++) blocked.add(d + off);
  const first = onOrAfter(year, year, 7, 15, 6);
  const last = dayOf(year, year + 1, 4, 24);
  const sats: number[] = [];
  for (let d = first; d <= last; d += 7) if (!blocked.has(d)) sats.push(d);
  // faltando datas: terças no meio da temporada (dez, jan, fev, abr)
  const tues: number[] = [];
  for (let d = onOrAfter(year, year, 11, 1, 2); tues.length < 12 && d < last; d += 7) if (!blocked.has(d)) tues.push(d);
  let out = sats.slice();
  for (let i = 0; out.length < rounds && i < tues.length; i++) out.push(tues[(i * 5) % tues.length]);
  out = [...new Set(out)].sort((a, b) => a - b);
  while (out.length > rounds) out.splice(Math.floor(out.length / 2), 1); // sobrou: tira do meio
  return out;
}

export function serieCDays(year: number) {
  const rounds: number[] = [];
  for (let k = 12; k <= 30; k++) rounds.push(saturday(year, k));
  return {
    rounds,
    qf: [saturday(year, 32), saturday(year, 33)],
    sf: [saturday(year, 35), saturday(year, 36)],
    final: [saturday(year, 38), saturday(year, 39)],
  };
}

export function serieBPlayoffDays(year: number): [number, number] {
  return [wednesday(year, 46), sunday(year, 47)];
}

export function copaDays(year: number) {
  return {
    r64: [wednesday(year, 2)],
    r32: [wednesday(year, 5)],
    r16: [wednesday(year, 10), wednesday(year, 12)],
    qf: [wednesday(year, 17), wednesday(year, 19)],
    sf: [wednesday(year, 27), wednesday(year, 29)],
    final: [wednesday(year, 36), sunday(year, 38)],
  };
}

export function continentalDays(year: number, thursdayGames: boolean) {
  const mid = thursdayGames ? thursday : wednesday;
  return {
    groups: [9, 11, 13, 16, 18, 20].map((k) => mid(year, k)),
    r16: [mid(year, 24), mid(year, 26)],
    qf: [mid(year, 30), mid(year, 32)],
    sf: [mid(year, 35), mid(year, 37)],
    final: [saturday(year, thursdayGames ? 44 : 42)],
  };
}

/**
 * Campeonatos estaduais (jan–mar). A maior parte das rodadas vem antes da estreia da Série A; o resto
 * cai nas quartas-feiras livres de Copa do Brasil (semanas 2 e 5) e antes das copas continentais. A final de volta
 * cai no domingo da semana 7, que não tem rodada de Série A/B (data FIFA).
 */
export function estadualDays(year: number) {
  const s0 = sunday(year, 0);
  return {
    rounds: [s0 - 17, s0 - 14, s0 - 11, s0 - 7, s0 - 4, wednesday(year, 0), wednesday(year, 1)],
    qf: [wednesday(year, 1)],
    sf: [wednesday(year, 3)],
    final: [wednesday(year, 6), sunday(year, 7)],
  };
}

export const seasonEndDay = (year: number) => sunday(year, 47) + 2;
export const YOUTH_INTAKE_DAY = 25; // depois da Copinha
export const MID_SEASON_DAY = 181; // 1º de julho
export const LEGEND_WAVE_DAY = 196; // meados de julho
export const YOUTH_PREVIEW_DAY = 305; // relatório do coordenador da base sobre a próxima safra (início de novembro)

export function inWindow(day: number): boolean {
  return day <= 89 || (day >= 181 && day <= 242);
}

export function windowLabel(day: number): string | null {
  if (day <= 89) return "Janela de transferências aberta até 31/mar";
  if (day >= 181 && day <= 242) return "Janela de transferências aberta até 31/ago";
  return null;
}

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function dateOf(year: number, day: number): Date {
  return new Date(year, 0, 1 + day);
}

export function formatDate(year: number, day: number, withDow = true): string {
  const d = dateOf(year, day);
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withDow ? `${DOW[d.getDay()]}, ${s}` : s;
}

export function formatDateLong(year: number, day: number): string {
  const d = dateOf(year, day);
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function isMonthStart(year: number, day: number): boolean {
  return dateOf(year, day).getDate() === 1;
}

export function monthOf(year: number, day: number): number {
  return dateOf(year, day).getMonth();
}
