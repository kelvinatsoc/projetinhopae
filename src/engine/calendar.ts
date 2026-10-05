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

export function leagueDays(year: number): number[] {
  const out: number[] = [];
  for (let k = 0; out.length < 38; k++) if (!LEAGUE_SKIP.has(k)) out.push(sunday(year, k));
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
