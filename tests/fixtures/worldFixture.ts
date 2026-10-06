// Dados mundiais de teste no formato de src/data/worldTypes.ts (gerados de forma determinística).
// Serve de exemplo para o agente de dados e de base para os testes do motor mundial.
import type { DbPlayer } from "../../src/engine/world";
import type { Pos } from "../../src/engine/types";
import type { Confed, NationalTeamDef, WorldClub, WorldData, WorldLeagueDef } from "../../src/data/worldTypes";

const LEAGUES: [id: string, name: string, country: string, confed: Confed, color: string, cal: "aug-may" | "feb-dec", rel: number][] = [
  ["eng1", "Premier League", "ENG", "UEFA", "#3d195b", "aug-may", 3],
  ["esp1", "LaLiga", "ESP", "UEFA", "#ee2523", "aug-may", 3],
  ["ita1", "Serie A", "ITA", "UEFA", "#008fd7", "aug-may", 3],
  ["ger1", "Bundesliga", "GER", "UEFA", "#d20515", "aug-may", 2],
  ["fra1", "Ligue 1", "FRA", "UEFA", "#091c3e", "aug-may", 2],
  ["por1", "Liga Portugal", "POR", "UEFA", "#00365f", "aug-may", 2],
  ["ned1", "Eredivisie", "NED", "UEFA", "#ff6200", "aug-may", 2],
  ["tur1", "Süper Lig", "TUR", "UEFA", "#e30a17", "aug-may", 0],
  ["sco1", "Scottish Premiership", "SCO", "UEFA", "#4b2582", "aug-may", 0],
];

const SQUAD: Pos[] = ["GOL", "GOL", "ZAG", "ZAG", "ZAG", "LD", "LE", "VOL", "VOL", "MC", "MC", "MEI", "PD", "PE", "ATA", "ATA", "ATA", "ZAG"];

/** 48 seleções (código FIFA, nome, confederação, nível). */
export const NT_CODES: [string, string, Confed, number][] = [
  ["BRA", "Brasil", "CONMEBOL", 82], ["ARG", "Argentina", "CONMEBOL", 84], ["URU", "Uruguai", "CONMEBOL", 78], ["COL", "Colômbia", "CONMEBOL", 78],
  ["ECU", "Equador", "CONMEBOL", 75], ["PAR", "Paraguai", "CONMEBOL", 73], ["CHI", "Chile", "CONMEBOL", 71], ["PER", "Peru", "CONMEBOL", 70],
  ["VEN", "Venezuela", "CONMEBOL", 69], ["BOL", "Bolívia", "CONMEBOL", 64],
  ["ENG", "Inglaterra", "UEFA", 84], ["ESP", "Espanha", "UEFA", 85], ["FRA", "França", "UEFA", 85], ["GER", "Alemanha", "UEFA", 82],
  ["POR", "Portugal", "UEFA", 82], ["NED", "Holanda", "UEFA", 81], ["ITA", "Itália", "UEFA", 80], ["BEL", "Bélgica", "UEFA", 79],
  ["CRO", "Croácia", "UEFA", 78], ["SUI", "Suíça", "UEFA", 76], ["TUR", "Turquia", "UEFA", 75], ["SCO", "Escócia", "UEFA", 72],
  ["AUT", "Áustria", "UEFA", 75], ["NOR", "Noruega", "UEFA", 76], ["DEN", "Dinamarca", "UEFA", 75], ["CZE", "Tchéquia", "UEFA", 72],
  ["USA", "Estados Unidos", "CONCACAF", 75], ["MEX", "México", "CONCACAF", 75], ["CAN", "Canadá", "CONCACAF", 72], ["PAN", "Panamá", "CONCACAF", 66],
  ["HAI", "Haiti", "CONCACAF", 60], ["CUW", "Curaçao", "CONCACAF", 61],
  ["JPN", "Japão", "AFC", 77], ["KOR", "Coreia do Sul", "AFC", 75], ["IRN", "Irã", "AFC", 72], ["AUS", "Austrália", "AFC", 71],
  ["KSA", "Arábia Saudita", "AFC", 68], ["QAT", "Catar", "AFC", 66], ["UZB", "Uzbequistão", "AFC", 67], ["JOR", "Jordânia", "AFC", 65],
  ["MAR", "Marrocos", "CAF", 79], ["SEN", "Senegal", "CAF", 76], ["EGY", "Egito", "CAF", 72], ["CIV", "Costa do Marfim", "CAF", 73],
  ["ALG", "Argélia", "CAF", 72], ["TUN", "Tunísia", "CAF", 69], ["RSA", "África do Sul", "CAF", 67], ["NZL", "Nova Zelândia", "OFC", 62],
];

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** Mundo de teste: 9 ligas europeias (n clubes cada, 18 jogadores por clube) e 48 seleções. */
export function makeWorldFixture(opts: { clubsPerLeague?: number; leagues?: string[] } = {}): WorldData {
  const n = opts.clubsPerLeague ?? 8;
  const r = lcg(7);
  const leagues: WorldLeagueDef[] = [];
  const clubs: WorldClub[] = [];
  const players: DbPlayer[] = [];
  const natPool: Record<string, string[]> = {};
  const natCodes = NT_CODES.map((x) => x[0]);
  for (const [id, name, country, confed, color, calendar, rel] of LEAGUES) {
    if (opts.leagues && !opts.leagues.includes(id)) continue;
    const ids: string[] = [];
    const big = ["ENG", "ESP", "ITA", "GER"].includes(country);
    for (let i = 0; i < n; i++) {
      const cid = `${id}-c${i + 1}`;
      ids.push(cid);
      const level = Math.round(80 - i * 1.5 - (big ? 0 : 5));
      clubs.push({
        id: cid, name: `${country} Clube ${i + 1}`, full: `${country} Football Club ${i + 1}`, abbr: `${country.slice(0, 2)}${i + 1}`,
        region: country, city: `Cidade ${i + 1}`, country, div: "F", level, rep: Math.min(95, level + 8 - i), colors: [color, "#FFFFFF"],
        crest: "solid", stadium: `${country} Arena ${i + 1}`, capacity: 30000 + i * 1000, league: id, confed,
      });
      SQUAD.forEach((p, k) => {
        // metade é do país, o resto de seleções variadas (garante pool para as 48)
        const nat = k % 2 === 0 ? country : natCodes[Math.floor(r() * natCodes.length)];
        const nm = `Jogador ${cid} ${k + 1}`;
        const b = 1990 + Math.floor(r() * 16);
        const o = Math.round(level - 4 + r() * 8);
        players.push({ c: cid, n: nm, nat, p, s: [], b, h: 180, f: "D", o, pt: o + 4, fm: 10, y: 0, no: k + 1 });
        (natPool[nat] ??= []).push(`${nm}|${b}`);
      });
    }
    leagues.push({
      id, name, short: name, country, confed, size: n, calendar, relegation: rel, color, clubs: ids,
      ucl2026Seeds: ids.slice(0, 2), uel2026Seeds: ids.slice(2, 3),
    });
  }
  const nationalTeams: NationalTeamDef[] = NT_CODES.map(([fifa, name, confed, level], i) => ({
    id: `nt-${fifa}`, fifa, name, confed, level, rankingTier: Math.min(5, 1 + Math.floor((i % 10) / 2)) as 1 | 2 | 3 | 4 | 5,
    colors: ["#ffdf00", "#009c3b", "#002776"], pool: natPool[fifa] ?? [], wc2026: (natPool[fifa] ?? []).slice(0, 26),
  }));
  return { version: 1, fetchedAt: "2026-10-01", season: 2026, leagues, clubs, players, nationalTeams, supersedes: [] };
}
