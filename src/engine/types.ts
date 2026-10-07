// Tipos centrais do jogo. Todo o estado do jogo fica em um único objeto World,
// que é salvo inteiro no IndexedDB do navegador.

export type Pos = "GOL" | "ZAG" | "LD" | "LE" | "VOL" | "MC" | "MEI" | "PD" | "PE" | "ATA";
export type Race = "white" | "black" | "brown" | "asian";
export type Div = "A" | "B" | "C" | "D" | "F"; // F = clube estrangeiro (sul-americano)

/** Atributos de 1 a 99. "gol" só importa para goleiros. */
export interface Attrs {
  vel: number; // velocidade
  fin: number; // finalização
  pas: number; // passe
  dri: number; // drible / técnica
  def: number; // marcação / desarme
  fis: number; // físico / força / resistência
  gol: number; // goleiro (reflexos, posicionamento)
}

// ---------------------------------------------------------------- gestão (v3)
/** Jogadas preferidas (traços). Códigos curtos para o save ficar pequeno. PAV é o único negativo. */
export type TraitId = "MAT" | "CHF" | "CAB" | "DRI" | "GAR" | "PEN" | "FAL" | "VEL" | "RAC" | "DES" | "LID" | "DEC" | "VER" | "PEG" | "MUR" | "PAV";
/** Atributos ocultos (1–20): profissionalismo, ambição, lealdade, temperamento, regularidade, jogos grandes, propensão a lesões. */
export type Hidden = [number, number, number, number, number, number, number];
/** Papel no elenco: C = craque, T = titular, R = rotação, S = reserva, J = jovem promessa. */
export type SquadRole = "C" | "T" | "R" | "S" | "J";
/** Foco do treino do time: equilibrado, físico, ataque, defesa, tático, recuperação, bola parada. */
export type TeamFocus = "eq" | "fis" | "atk" | "def" | "tat" | "rec" | "bola";
/** Treino individual. */
export type TrainFocus =
  | { k: "attr"; a: keyof Attrs }
  | { k: "pos"; pos: Pos; prog: number }
  | { k: "trait"; t: TraitId; prog: number }
  | { k: "calm"; prog: number };
/** Comissão técnica: auxiliar, treinador, preparador físico, olheiro-chefe, coordenador da base. */
export type StaffRole = "aux" | "tre" | "fis" | "olh" | "bas";
export interface StaffMember { id: number; role: StaffRole; name: string; nat: string; born: number; stars: number; wage: number; until: number }
export type IntakeQuality = "fraca" | "normal" | "boa" | "dourada";
export interface PlayerLoan { from: string; until: number; half?: boolean; wagePct: number; opt?: number; since: number }
export interface PlayerPromise { until: number; base: [number, number] }
export interface ScoutMission { id: number; region: string; focus: "young" | "ready" | "cheap"; until: number; next: number }
export interface ScoutState { k: Record<number, number>; queue: number[]; missions: ScoutMission[]; recs: number[] }
export interface AdminCheats {
  noInj?: boolean; noBans?: boolean; window?: boolean; anyBid?: boolean; willing?: boolean; money?: boolean;
  noFire?: boolean; youthTurbo?: boolean; legendRain?: boolean; boost?: 0 | 0.05 | 0.1 | 0.2;
}
// ---------------------------------------------------------------- economia e dia de jogo (Trilha C)
export type SponsorSlot = "shirt" | "stadium" | "kit";
export interface SponsorBonus { kind: "title" | "top4" | "safe"; value: number }
export interface SponsorDeal { id: string; slot: SponsorSlot; brand: string; annual: number; years: number; bonus: SponsorBonus[]; since?: number; until?: number }
export interface SponsorState {
  deals: Partial<Record<SponsorSlot, SponsorDeal>>;
  offers?: { season: number; list: SponsorDeal[] };
  paidFor?: number; // última temporada com bônus avaliados
  log?: { season: number; brand: string; text: string; value: number }[];
}
export type FacilityKind = "stadium" | "training" | "youth" | "medical";
export interface FacilityBuild { kind: FacilityKind; to: number; start: number; done: number; cost: number }
export interface FacilityState { stadium: number; medical: number; builds: FacilityBuild[] }
export type SetPieceRoutine = "pp" | "sp" | "curto";
export interface SetPieceConfig { corner?: number; fk?: number; pen?: number; cap?: number; routine: SetPieceRoutine }
export interface AdminLogEntry { season: number; day: number; text: string }
export interface AdminState { on: boolean; pin?: string; everUsed?: boolean; seasons: number[]; cheats: AdminCheats; log: AdminLogEntry[] }

export interface Face {
  s: number; // semente do gerador de rosto
  r: Race;
  o?: Record<string, unknown>; // sobrescritas (lendas: cabelo, barba...)
}

export interface SeasonStats {
  apps: number;
  goals: number;
  assists: number;
  ratingSum: number; // soma das notas (média = ratingSum / apps)
  yel: number;
  red: number;
  motm: number;
  cs: number; // jogos sem sofrer gol (goleiros)
}

export interface CareerEntry {
  season: number;
  clubId: string;
  apps: number;
  goals: number;
  assists: number;
  rating: number;
  ovr: number;
}

export interface Player {
  id: number;
  name: string;
  nat: string; // código FIFA (BRA, ARG, ...)
  born: number; // ano de nascimento
  pos: Pos;
  sec: Pos[]; // posições secundárias
  foot: "D" | "E" | "A";
  height: number;
  attrs: Attrs;
  pot: number; // potencial
  ovr: number; // overall na posição principal (cache, recalculado ao evoluir)
  clubId: string | null; // null = livre
  youth: boolean; // está nas categorias de base
  wage: number; // salário mensal (R$)
  contractEnd: number; // temporada em que o contrato termina
  cond: number; // condição física 0-100
  morale: number; // 0-100
  injury: number; // dias de lesão restantes
  injuryName?: string;
  bans: Record<string, number>; // suspensões por competição
  yel: Record<string, number>; // amarelos acumulados por competição
  face: Face;
  photo?: string; // foto personalizada (URL ou dataURL)
  ext?: string; // foto do TheSportsDB (caminho na CDN, ver media.ts sportsdbUrl), carregada online
  img?: string; // foto empacotada: "Q123" (jogador real, media/players) ou "r45" (rosto de regen, media/regens)
  legend?: string; // id da lenda, se for uma lenda renascida
  real?: boolean; // jogador real (dados da Wikipedia)
  listed?: boolean; // na lista de transferências
  shirt?: number;
  joined: number; // temporada em que chegou ao clube
  stats: SeasonStats;
  compGoals: Record<string, number>; // gols por competição na temporada (artilharia)
  history: CareerEntry[];
  form: number[]; // últimas notas
  fame: number; // 0-100, reputação (afeta valor e salário)
  freeSince?: number; // dia/temporada em que ficou livre
  // --- gestão (v3, tudo opcional: saves antigos ganham valores na migração ou sob demanda)
  traits?: TraitId[]; // jogadas preferidas
  lockedTraits?: TraitId[]; // jogadas de lenda ainda não despertadas
  hid?: Hidden; // atributos ocultos
  tf?: TrainFocus; // treino individual
  dx?: number; // acumulador fracionário da evolução mensal
  ma?: number; // jogos disputados no mês
  ot?: [number, number]; // overall/temporada de referência (setas ▲▼)
  trend?: number; // última variação mensal
  role?: SquadRole;
  pt?: [number, number]; // minutos: jogos como titular / jogos possíveis
  unhappy?: number;
  promise?: PlayerPromise;
  wantsOut?: boolean;
  talkAt?: number; // dia absoluto da última conversa
  loan?: PlayerLoan;
  clause?: number; // multa rescisória
  goalBonus?: number;
  sellOn?: { club: string; pct: number };
  // --- seleções (mundo)
  caps?: number; // jogos pela seleção
  intGoals?: number; // gols pela seleção
  away?: string; // convocado: id da seleção (nt-BRA) enquanto durar a data FIFA / torneio
  // --- dinâmica (opcionais)
  acad?: string; // clube onde foi formado
  mr?: number; // soma das notas no mês (evolução pela forma)
  px?: number; // acumulador de crescimento do potencial (fase espetacular)
  hm?: number; // meses seguidos em alta
  fav?: boolean; // ídolo da torcida
}

export type CrestPattern =
  | "solid" | "vstripes" | "vstripes3" | "hoops" | "sash" | "diagonal" | "halves" | "band"
  | "triband" | "star" | "stars" | "circle" | "chevron" | "cross";

export interface ClubSeasonRecord {
  season: number;
  div: Div;
  pos: number | null; // posição na liga
  titles: string[]; // ids de competições vencidas
}

export interface Trophy {
  comp: string; // id da competição
  name: string;
  season: number;
}

export interface Tactic {
  formation: string;
  mentality: number; // -2 (retranca) a +2 (tudo ao ataque)
  pressing: number; // 0 baixa, 1 média, 2 alta
  // --- tática a fundo (opcionais; ausentes = neutro, ver tactics.ts)
  ti?: Partial<TeamInstr>;
  roles?: (string | null)[]; // função por slot da formação (RoleId)
  preset?: string;
  shift?: { lead?: number; leadMin?: number; trail?: number; trailMin?: number }; // mentalidade programada
}

/** Instruções do time: 0/1/2 (1 = normal). */
export interface TeamInstr {
  line: number; // linha defensiva: recuada / normal / adiantada
  width: number; // largura
  tempo: number; // ritmo
  direct: number; // passes curtos / mistos / diretos
  cpress: boolean; // contrapressão
  waste: boolean; // fazer cera quando estiver vencendo
}

export interface Lineup {
  starters: (number | null)[]; // 11 ids, na ordem dos slots da formação
  bench: number[];
  captain?: number;
}

export interface Club {
  id: string;
  name: string;
  full: string;
  abbr: string;
  region: string; // estado (BR) ou país
  city: string;
  country: string; // código FIFA
  colors: [string, string, string];
  crest: CrestPattern;
  stadium: string;
  capacity: number;
  rep: number; // 0-100
  level: number; // força de referência
  div: Div;
  balance: number;
  players: number[]; // ids (elenco + base)
  tactic: Tactic;
  lineup?: Lineup;
  youthLevel: number; // 1-5
  facilities: number; // 1-5
  ticket: number; // preço médio do ingresso
  history: ClubSeasonRecord[];
  trophies: Trophy[];
  customCrest?: string;
  logo?: boolean; // escudo oficial em media/crests/<id>.webp
  stadiumImg?: string; // foto do estádio em media/stadiums/<id>.webp
  finance: FinanceBook;
  founded?: string;
  nickname?: string;
  jersey: string; // modelo de camisa do avatar
  // --- gestão (v3)
  youthFac?: number; // estrutura da base 1-5 (padrão: youthLevel)
  youthCoach?: number; // formação da base 1-5 (padrão: youthLevel)
  train?: { focus: TeamFocus; int: 0 | 1 | 2 };
  chem?: number; // entrosamento 0-100
  tfam?: Record<string, number>; // familiaridade tática por formação 0-100 (só o usuário)
  links?: Record<string, number>; // entrosamento entre pares "a-b" (parte construída em campo, só o usuário)
  lastXI?: number[]; // titulares do último jogo (rodízio demais atrasa o entrosamento)
  expansions?: number;
  loanedOut?: number[];
  // --- economia e dia de jogo (Trilha C, opcionais)
  sponsors?: SponsorState;
  fac?: FacilityState;
  setPieces?: SetPieceConfig;
  /** UF: clube que só disputa o estadual (fora da pirâmide nacional A–C e do sorteio da Série D).
   *  Real (vem do banco, flag "minor") ou fictício (fictional). */
  minor?: string;
  fictional?: boolean; // clube inventado (último recurso para completar um estadual)
  genSquad?: boolean; // clube real sem elenco publicado: jogadores gerados com semente fixa
  league?: string; // liga estrangeira (eng1, esp1...): div "F" + league = clube de liga do mundo
  zone?: string; // zona/conferência na liga (Argentina A/B, MLS E/W)
}

export interface FinanceBook {
  income: Record<string, number>; // temporada atual
  expense: Record<string, number>;
  lastIncome?: Record<string, number>; // temporada anterior
  lastExpense?: Record<string, number>;
}

export type MatchEventType =
  | "goal" | "owngoal" | "pen-goal" | "pen-miss" | "yellow" | "red" | "sub" | "injury"
  | "save" | "miss" | "post" | "chance" | "info" | "half" | "end" | "var";

export interface MatchEvent {
  min: number;
  type: MatchEventType;
  side?: 0 | 1; // 0 = mandante, 1 = visitante
  pid?: number; // jogador principal
  pid2?: number; // assistência / quem saiu na substituição
  text: string;
  key?: boolean; // lance importante (melhores momentos)
}

export interface MatchStats {
  poss: [number, number];
  shots: [number, number];
  onTarget: [number, number];
  corners: [number, number];
  fouls: [number, number];
  yellows: [number, number];
  reds: [number, number];
  xg: [number, number];
}

export interface MatchResult {
  hg: number;
  ag: number;
  pens?: [number, number];
  events: MatchEvent[];
  stats: MatchStats;
  ratings: Record<number, number>;
  lineups: [number[], number[]]; // quem jogou (titulares + quem entrou)
  motm?: number;
  attendance?: number;
}

export interface Fixture {
  id: number;
  comp: string; // id da competição
  stage: string; // "league", "group", "r64", "r32", "r16", "qf", "sf", "final", "playoff"...
  round: number; // rodada (ligas/grupos) ou 1/2 para jogos de ida/volta
  day: number; // dia da temporada (0 = 1º de janeiro)
  home: string;
  away: string;
  tie?: number; // id do confronto (mata-mata)
  leg?: 1 | 2;
  group?: number;
  neutral?: boolean;
  result?: MatchResult;
}

export interface Tie {
  id: number;
  comp: string;
  stage: string;
  a: string; // time A (manda o 1º jogo, ou o jogo único)
  b: string;
  legs: 1 | 2;
  fixtures: number[];
  winner?: string;
  awayGoalsRule?: boolean;
  seedA?: number; // em playoffs da Série B, o melhor colocado tem vantagem
  advantage?: string; // time que avança em caso de empate no agregado
}

export interface TableRow {
  club: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; pts: number;
  form: string[]; // "V" | "E" | "D"
}

export type CompFormat = "league" | "cup" | "groups";

export interface Competition {
  id: string; // ex.: "serieA"
  name: string;
  short: string;
  format: CompFormat;
  season: number;
  teams: string[];
  table: TableRow[]; // liga (ou fase inicial)
  groups: { name: string; teams: string[]; table: TableRow[] }[];
  ties: Tie[];
  stage: string; // fase atual
  done: boolean;
  champion?: string;
  runnerUp?: string;
  promoted?: string[];
  relegated?: string[];
  color: string; // cor de destaque na interface
  tier: number; // ordem de exibição / importância
  // --- mundo (opcionais)
  carry?: boolean; // atravessa a virada do ano (temporada europeia ago–mai): preservada no fim da temporada
  lite?: boolean; // jogos sem o usuário usam a simulação rápida
  label?: string; // rótulo da temporada ("2026/27")
  region?: string; // BRA | CONMEBOL | UEFA | AFC | CONCACAF | FIFA
  awarded?: boolean; // troféu e prêmios já entregues (competições do mundo entregam ao terminar)
}

export type NewsKind =
  | "info" | "match" | "transfer" | "legend" | "youth" | "board" | "injury" | "contract" | "season" | "offer"
  | "training" | "staff" | "scout" | "dressing" | "admin";

export interface NewsItem {
  id: number;
  day: number;
  season: number;
  kind: NewsKind;
  title: string;
  body: string;
  read: boolean;
  pid?: number;
  clubId?: string;
  world?: boolean; // notícia do exterior (limitada por semana)
}

export interface TransferOffer {
  id: number;
  pid: number;
  from: string; // clube comprador
  to: string; // clube vendedor
  fee: number;
  wage?: number;
  status: "pending" | "accepted" | "rejected" | "countered" | "done" | "expired";
  counter?: number;
  day: number;
  season: number;
  byUser: boolean;
}

export interface LegendState {
  appearances: { season: number; pid: number; clubId: string; name: string }[];
  active?: number; // id do jogador ativo (renascido) desta lenda
}

export interface Settings {
  casual: boolean; // sem demissão
  legendFreq: 0 | 1 | 2 | 3; // 0 desligado, 1 baixa, 2 média, 3 alta
  speed: number; // velocidade padrão da partida (ms por minuto)
  theme: "dark" | "light";
  autoSave: boolean;
  cartoonFaces?: boolean; // rosto ilustrado (em vez da silhueta) para jogadores reais sem foto
}

export interface SeasonSummary {
  season: number;
  champions: Record<string, string>; // comp -> clube
  userPos?: number;
  userDiv?: Div;
  topScorer?: { pid: number; name: string; goals: number; clubId: string };
  bestPlayer?: { pid: number; name: string; clubId: string; rating: number };
  revelation?: { pid: number; name: string; clubId: string; rating: number; age: number };
}

// ---------------------------------------------------------------- progressão (troféus, conquistas, desafios, carreira)
/** Resumo de uma temporada do clube do usuário (sala de troféus / linha do tempo). */
export interface ClubSeasonLog {
  season: number;
  clubId: string;
  div: Div;
  pos: number | null;
  titles: string[];
  promoted?: boolean;
  relegated?: boolean;
  topScorer?: { pid: number; name: string; goals: number };
  mvp?: { pid: number; name: string; rating: number };
  bestSigning?: { pid: number; name: string; rating: number; fee?: number };
}
export interface AchCounters {
  games: number; w: number; d: number; l: number;
  ws: number; // vitórias seguidas
  unb: number; // jogos sem perder
  cs: number; // jogos seguidos sem sofrer gol
  cw: number; // clássicos vencidos
  bigWin?: { gd: number; text: string; season: number };
}
export interface AchState {
  got: Record<string, { season: number; day: number; clubId: string }>;
  c: AchCounters;
  toasts: string[]; // avisos pendentes para a interface
}
export type ScenarioStatus = "active" | "won" | "lost";
export interface ScenarioState { id: string; clubId: string; season: number; status: ScenarioStatus; note?: string }
export interface JobOffer { id: number; clubId: string; season: number; until: number; reason: "season" | "fired" }
export interface CareerState {
  rep: number; // reputação do treinador 0-100
  offers: JobOffer[];
  moves: { season: number; day: number; from: string; to: string; fired: boolean }[];
  sackings: number;
}

export interface World {
  version: number;
  saveId: string;
  createdAt: number;
  seed: number;
  rng: number; // estado do gerador aleatório
  season: number;
  day: number;
  managerName: string;
  userClubId: string;
  clubs: Record<string, Club>;
  players: Record<number, Player>;
  nextPid: number;
  nextId: number; // ids genéricos (fixtures, ties, news, offers)
  fixtures: Fixture[];
  comps: Record<string, Competition>;
  news: NewsItem[];
  offers: TransferOffer[];
  shortlist: number[];
  legends: Record<string, LegendState>;
  settings: Settings;
  history: SeasonSummary[];
  board: {
    confidence: number; objective: string; objectiveCode: string; warned?: boolean;
    cool?: Record<string, number>; // pedidos à diretoria em espera
    grantSeason?: number; // última temporada com aporte extra
    estadual?: { comp: string; code: "title" | "final" | "semi" | "none"; text: string; season: number; judged?: boolean };
  };
  pendingMatch?: number; // fixture do usuário aguardando para ser jogada
  fired?: boolean;
  managerHistory: { season: number; clubId: string; pos: number | null; div: Div; titles: string[]; admin?: boolean }[];
  seasonEnded?: boolean;
  dataDate: string; // data de coleta dos elencos reais
  // --- gestão (v3)
  staff?: Partial<Record<StaffRole, StaffMember>>;
  staffPool?: { key: string; list: StaffMember[] };
  intakePreview?: { season: number; q: IntakeQuality; shown: IntakeQuality; pos: Pos };
  peneira?: { season: number; day: number; kids: Player[] }; // garotos da peneira (fora de w.players até assinarem)
  intakeForce?: IntakeQuality;
  forceGem?: boolean;
  scout?: ScoutState;
  admin?: AdminState;
  // --- narrativa e mídia (trilha A, opcionais: saves antigos ganham na migração)
  narrative?: NarrativeState;
  inbox?: InboxState;
  // --- progressão (opcionais: saves antigos ganham na migração)
  clubLog?: ClubSeasonLog[];
  ach?: AchState;
  scenario?: ScenarioState;
  career?: CareerState;
  /** save antigo com clubes fictícios nos estaduais: trocados pelos reais na virada da temporada */
  pendingEstadualSwap?: boolean;
  /** nomes de clubes que saíram do mundo (fictícios dos estaduais), para o histórico de campeões */
  formerClubs?: Record<string, string>;
  // --- mundo (opcionais: só existem quando há dados mundiais)
  wl?: WorldLeagues;
  intl?: IntlState;
  /** seleção que o usuário treina (acumulando com o clube) */
  ntJob?: string;
}

// ---------------------------------------------------------------- mundo: ligas estrangeiras e seleções
export interface WorldLeagueMeta {
  id: string; name: string; short: string; country: string; confed: string;
  calendar: "aug-may" | "feb-dec"; relegation: number; color: string;
}
export interface WorldLeagues {
  leagues: Record<string, WorldLeagueMeta>;
  /** primeiro ano em que as ligas ago–mai nascem (dia 181); saves migrados esperam a próxima temporada */
  startYear: number;
  /** último ano em que as temporadas ago–mai foram criadas */
  createdYear?: number;
  /** vagas reais na primeira Champions/Europa League */
  seeds?: { ucl: string[]; uel: string[] };
  /** último campeão da Champions (para a Intercontinental) */
  lastUcl?: string;
  /** clube do usuário no exterior: posição final na última liga encerrada (para a diretoria) */
  userLast?: { comp: string; pos: number; season: number; year: number };
}
export interface NationalTeam {
  id: string; // nt-BRA
  fifa: string; // BRA
  name: string;
  confed: string;
  tier: number; // 1-5
  level: number;
  colors: [string, string, string];
  logo?: boolean;
  pool: string[]; // "nome|ano"
  wc2026?: string[];
  trophies: Trophy[];
  /** resultados recentes ("V" | "E" | "D") */
  form: string[];
}
export interface IntlState {
  nts: Record<string, NationalTeam>;
  comps: Record<string, Competition>;
  fixtures: Fixture[]; // dia relativo a 1º/jan de w.season, como os jogos de clubes
  callups: Record<string, number[]>; // seleção -> convocados atuais
  /** seleção -> último dia da convocação atual (o jogador volta ao clube no dia seguinte) */
  rel: Record<string, number>;
  /** ano cujo calendário internacional já foi montado */
  year?: number;
  /** campeões dos torneios de seleções já encerrados */
  honors: { comp: string; name: string; season: number; winner: string; runnerUp?: string }[];
  /** convite para técnico de seleção (válido até o dia `until` da temporada `season`) */
  offer?: { nt: string; season: number; until: number };
  declined?: string[];
  /** técnico de seleção: convocação escolhida e os 11 titulares */
  userSquad?: number[];
  userXI?: number[];
}

// ---------------------------------------------------------------- narrativa e mídia
/** Clima da torcida, coletivas já dadas e última interação com cada jogador. */
export interface NarrativeState {
  fan: number; // humor da torcida 0-100
  press: string[]; // coletivas concluídas ("<fixture>:<pre|post>"), últimas 40
  talks: Record<number, number>; // jogador -> dia absoluto da última interação individual
}
export type InboxKind = "news" | "offer" | "contract" | "injury" | "board" | "dressing" | "transfer" | "press" | "match";
export type InboxActionId = "player" | "market" | "renew" | "accept" | "reject" | "board" | "dressing" | "fixture";
export interface InboxAction { id: InboxActionId; label: string }
export interface InboxMsg {
  id: number; day: number; season: number; kind: InboxKind; title: string; body: string; read: boolean;
  pid?: number; clubId?: string; offerId?: number; newsId?: number; fid?: number;
  actions: InboxAction[]; done?: boolean;
}
export interface InboxState { msgs: InboxMsg[]; lastNews: number }
