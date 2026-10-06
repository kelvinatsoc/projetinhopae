// Contrato dos dados do mundo (src/data/world.json): ligas estrangeiras, clubes, jogadores e seleções.
// Escrito pelo agente de dados (scripts) e lido pelo motor (src/engine/worldLeagues.ts, international.ts).
// O jogo funciona sem este arquivo: sem world.json, o comportamento é idêntico ao Brasil-only.
import type { DbClub, DbPlayer } from "../engine/world";

/** Chave de um jogador: "Nome|anoDeNascimento" (igual ao nome em DbPlayer.n e ao ano em DbPlayer.b). */
export type PlayerKey = string;

export type Confed = "UEFA" | "CONMEBOL" | "CONCACAF" | "AFC" | "CAF" | "OFC";

/**
 * Calendário da liga.
 * - "aug-may": nasce no dia 181 (1º/jul) do ano Y, joga de ago/Y a mai/Y+1 (Europa, Saudita, J1 a partir de 2026/27).
 * - "feb-dec": nasce no início do ano e joga fev–dez (Argentina, MLS).
 */
export type LeagueCalendar = "aug-may" | "feb-dec";

export interface WorldLeagueDef {
  /** eng1 esp1 ita1 ger1 fra1 por1 ned1 tur1 sco1 arg1 ksa1 jpn1 usa1 */
  id: string;
  /** nome oficial ("Premier League", "LaLiga", "Serie A", "Bundesliga"...) */
  name: string;
  short: string;
  /** código FIFA do país (ENG, ESP, ITA, GER, FRA, POR, NED, TUR, SCO, ARG, KSA, JPN, USA) */
  country: string;
  confed: Confed;
  /** número de clubes (= clubs.length) */
  size: number;
  calendar: LeagueCalendar;
  /** quantos caem por temporada (0 = liga fechada; quem cai é trocado por clube gerado do mesmo país) */
  relegation: number;
  /** cor de destaque (hex) */
  color: string;
  /** ids dos clubes da liga em 2026/27 (podem ser ids do world.json ou do database.json, ex.: clubes argentinos) */
  clubs: string[];
  /** classificados reais à Champions/Europa League 2026/27 (ids de clube), em ordem de prioridade */
  ucl2026Seeds?: string[];
  uel2026Seeds?: string[];
}

/** Clube estrangeiro de liga. div é sempre "F" (como os sul-americanos); o que distingue é `league`. */
export interface WorldClub extends DbClub {
  div: "F";
  league: string;
  confed: Confed;
}

export interface NationalTeamDef {
  /** "nt-BRA" */
  id: string;
  /** código FIFA ("BRA") — é o que casa com Player.nat */
  fifa: string;
  /** nome em português ("Brasil", "Alemanha") */
  name: string;
  confed: Confed;
  /** 1 = elite (top 10 do ranking) … 5 = fraca */
  rankingTier: 1 | 2 | 3 | 4 | 5;
  /** força de referência (como Club.level), usada quando faltam jogadores modelados */
  level: number;
  colors: [string, string, string] | string[];
  /** escudo oficial em public/media/crests/<id>.webp */
  logo?: 1;
  /** jogadores elegíveis/recentemente convocados (só os que existem em clubes modelados contam) */
  pool: PlayerKey[];
  /** convocação oficial da Copa do Mundo 2026 (26 nomes), se a seleção estiver na Copa */
  wc2026?: PlayerKey[];
}

export interface WorldData {
  version: number;
  fetchedAt: string;
  /** temporada das composições (2026 = 2026/27) */
  season: number;
  leagues: WorldLeagueDef[];
  /** só os clubes que NÃO existem no database.json */
  clubs: WorldClub[];
  /** jogadores dos clubes do world.json (DbPlayer.c = id do clube) */
  players: DbPlayer[];
  nationalTeams: NationalTeamDef[];
  /** jogadores do database.json que agora estão num clube do world.json: são ignorados no createWorld */
  supersedes?: PlayerKey[];
}

export const playerKey = (name: string, born: number): PlayerKey => `${name}|${born}`;
