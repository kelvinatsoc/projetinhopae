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
export interface BoardProject { kind: "stadium" | "ct" | "yfac" | "yrec" | "ycoach"; start: number; done: number; add?: number; cost: number }
export interface ScoutMission { id: number; region: string; focus: "young" | "ready" | "cheap"; until: number; next: number }
export interface ScoutState { k: Record<number, number>; queue: number[]; missions: ScoutMission[]; recs: number[] }
export interface AdminCheats {
  noInj?: boolean; noBans?: boolean; window?: boolean; anyBid?: boolean; willing?: boolean; money?: boolean;
  noFire?: boolean; youthTurbo?: boolean; legendRain?: boolean; boost?: 0 | 0.05 | 0.1 | 0.2;
}
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
  proj?: BoardProject[];
  expansions?: number;
  loanedOut?: number[];
  minor?: string; // UF: clube fictício que só disputa o estadual (fora da pirâmide nacional)
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
}
