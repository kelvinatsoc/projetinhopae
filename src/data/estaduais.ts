// Campeonatos estaduais: definição (sem dependências do motor, para evitar import circular).

export type EstadualFormat = "league8" | "groups16";

export interface EstadualDef {
  id: string; // id da competição ("est-SP")
  uf: string; // estado (Club.region)
  name: string; // nome oficial
  short: string; // apelido
  color: string;
  size: 8 | 16;
  format: EstadualFormat;
  prize: number; // multiplicador da premiação (Paulistão = 1)
  /** participantes reais da edição 2026 que existem no banco (Wikipedia, 2026); têm prioridade na chave.
   *  As vagas que sobrarem vão para outros clubes reais do estado, pela força. */
  real2026: string[];
  /** último recurso: clubes fictícios (nome curto, nome completo, sigla, cidade) — só usados se o
   *  estado não tiver clubes reais suficientes (com o banco atual, nenhum estadual precisa) */
  minors: [string, string, string, string][];
}

export const ESTADUAIS: EstadualDef[] = [
  {
    id: "est-SP", uf: "SP", name: "Campeonato Paulista", short: "Paulistão", color: "#e11d48", size: 16, format: "groups16", prize: 1,
    real2026: ["palmeiras", "corinthians", "sao-paulo", "santos", "bragantino", "mirassol", "botafogo-sp", "novorizontino", "ponte-preta", "guarani", "sao-bernardo", "portuguesa"],
    minors: [
      ["Bandeirante", "Esporte Clube Bandeirante da Serra", "BAN", "Serra Azul Paulista"],
      ["Tietê Sul", "Associação Atlética Tietê Sul", "TIE", "Vale do Tietê"],
    ],
  },
  {
    id: "est-RJ", uf: "RJ", name: "Campeonato Carioca", short: "Carioca", color: "#0ea5e9", size: 8, format: "league8", prize: 0.6,
    real2026: ["flamengo", "botafogo", "fluminense", "vasco", "volta-redonda", "boavista-rj", "madureira"],
    minors: [
      ["Serra Verde", "Atlético Serra Verde", "SVE", "Serra Verde"],
      ["Restinga", "Esporte Clube Restinga", "RES", "Restinga Fluminense"],
      ["Real Guanabara", "Real Guanabara Futebol Clube", "RGU", "Baía Velha"],
      ["Itaguaçu", "União Itaguaçu Fluminense", "ITG", "Itaguaçu"],
    ],
  },
  {
    id: "est-MG", uf: "MG", name: "Campeonato Mineiro", short: "Mineiro", color: "#f59e0b", size: 8, format: "league8", prize: 0.5,
    real2026: ["atletico-mg", "cruzeiro", "america-mg", "athletic", "tombense", "uberlandia", "pouso-alegre", "democrata-gv"],
    minors: [
      ["Ouro Velho", "Social Clube Ouro Velho", "OUV", "Ouro Velho"],
      ["Ipê Amarelo", "Ipê Amarelo Futebol Clube", "IPE", "Vale do Ipê"],
      ["Mantiqueira", "União Mantiqueira", "MAN", "Serra da Mantiqueira"],
      ["Jequitá", "Atlético Vale do Jequitá", "JEQ", "Jequitá"],
    ],
  },
  {
    id: "est-RS", uf: "RS", name: "Campeonato Gaúcho", short: "Gauchão", color: "#16a34a", size: 8, format: "league8", prize: 0.5,
    real2026: ["gremio", "internacional", "juventude", "caxias", "ypiranga-rs", "sao-jose-rs", "novo-hamburgo"],
    minors: [
      ["Coxilha", "Grêmio Esportivo Coxilha", "COX", "Coxilha Alta"],
      ["Minuano", "Esporte Clube Minuano", "MIN", "São Minuano"],
      ["Pampa Sul", "Sociedade Esportiva Pampa Sul", "PAM", "Campanha"],
    ],
  },
  {
    id: "est-PR", uf: "PR", name: "Campeonato Paranaense", short: "Paranaense", color: "#2563eb", size: 8, format: "league8", prize: 0.35,
    real2026: ["athletico-pr", "coritiba", "londrina", "operario-pr", "maringa", "cascavel", "cianorte"],
    minors: [
      ["Campos Gerais", "Esporte Clube Campos Gerais", "CGE", "Campos Gerais"],
      ["Pinheiral", "Clube Atlético Pinheiral", "PIN", "Pinheiral"],
      ["Iguaçu", "Iguaçu Paranaense Futebol Clube", "IGU", "Vale do Iguaçu"],
    ],
  },
  {
    id: "est-SC", uf: "SC", name: "Campeonato Catarinense", short: "Catarinense", color: "#dc2626", size: 8, format: "league8", prize: 0.3,
    real2026: ["chapecoense", "avai", "criciuma", "barra-sc", "brusque", "figueirense", "joinville", "marcilio-dias"],
    minors: [
      ["Serra Catarinense", "Atlético Serra Catarinense", "SCA", "Planalto Serrano"],
      ["Vale Itajubá", "Esporte Clube Vale do Itajubá", "VIT", "Itajubá do Sul"],
    ],
  },
  {
    id: "est-GO", uf: "GO", name: "Campeonato Goiano", short: "Goianão", color: "#65a30d", size: 8, format: "league8", prize: 0.25,
    real2026: ["atletico-go", "goias", "vila-nova", "anapolis", "aparecidense", "crac", "goiatuba", "inhumas"],
    minors: [
      ["Cerrado", "Cerrado Esporte Clube", "CER", "Chapadão do Cerrado"],
      ["Planalto", "Sociedade Esportiva Planalto Goiano", "PLA", "Planalto"],
      ["Araguaia", "Araguaia Futebol Clube", "ARA", "Beira-Araguaia"],
      ["Buriti", "Esporte Clube Buriti", "BUR", "Buritizal"],
      ["Veadeiros", "União Veadeiros", "VEA", "Alto Veadeiros"],
    ],
  },
  {
    id: "est-CE", uf: "CE", name: "Campeonato Cearense", short: "Cearense", color: "#ea580c", size: 8, format: "league8", prize: 0.25,
    real2026: ["ceara", "fortaleza", "floresta", "ferroviario-ce", "horizonte", "iguatu", "maracana-ce", "tirol"],
    minors: [
      ["Jangadeiro", "Jangadeiro Esporte Clube", "JAN", "Praia da Jangada"],
      ["Sertão Central", "Sertão Central Futebol Clube", "SER", "Sertão Central"],
      ["Carnaúba", "Atlético Carnaúba", "CAR", "Carnaubal Velho"],
      ["Ibiapaba", "Esporte Clube Ibiapaba", "IBI", "Serra da Ibiapaba"],
      ["Jaguaribana", "União Jaguaribana", "JAG", "Vale do Jaguaribe"],
    ],
  },
  {
    id: "est-PE", uf: "PE", name: "Campeonato Pernambucano", short: "Pernambucano", color: "#b91c1c", size: 8, format: "league8", prize: 0.25,
    real2026: ["sport", "nautico", "santa-cruz", "retro", "decisao", "jaboatao", "maguary", "vitoria-tabocas"],
    minors: [
      ["Agreste", "Agreste Futebol Clube", "AGR", "Agreste Meridional"],
      ["Capibaribe", "Esporte Clube Capibaribe", "CAP", "Beira-Capibaribe"],
      ["Frevo", "Frevo Atlético Clube", "FRE", "Olinda Velha"],
      ["Maracatu", "Sociedade Esportiva Maracatu", "MAR", "Zona da Mata"],
      ["Caeteense", "União Caeteense", "CAE", "Caetés do Sertão"],
      ["Pajeú", "Pajeú Esporte Clube", "PAJ", "Vale do Pajeú"],
    ],
  },
  {
    id: "est-BA", uf: "BA", name: "Campeonato Baiano", short: "Baianão", color: "#1d4ed8", size: 8, format: "league8", prize: 0.25,
    real2026: ["bahia", "vitoria", "juazeirense", "atletico-ba", "jacuipense", "porto-ba", "bahia-de-feira", "galicia"],
    minors: [
      ["Recôncavo", "Recôncavo Esporte Clube", "REC", "Recôncavo"],
      ["Chapada", "Atlético Chapada Diamantina", "CHA", "Chapada Diamantina"],
      ["Dendê", "Esporte Clube Dendê", "DEN", "Costa do Dendê"],
      ["Sertão Baiano", "Sociedade Esportiva Sertão Baiano", "SBA", "Sertão Baiano"],
      ["Cacaueira", "União Cacaueira", "CAC", "Costa do Cacau"],
      ["Abrolhos", "Associação Desportiva Abrolhos", "ABR", "Extremo Sul"],
      ["Itapuã", "Itapuã Futebol Clube", "ITA", "Lagoa do Itapuã"],
    ],
  },
  {
    id: "est-PA", uf: "PA", name: "Campeonato Paraense", short: "Parazão", color: "#0891b2", size: 8, format: "league8", prize: 0.2,
    real2026: ["remo", "paysandu", "tuna-luso", "aguia-maraba", "cameta", "castanhal", "bragantino-pa", "amazonia-pa"],
    minors: [
      ["Tapajós", "Tapajós Esporte Clube", "TAP", "Beira-Tapajós"],
      ["Marajoara", "Marajoara Futebol Clube", "MRJ", "Ilha do Marajó"],
      ["Xingu", "Atlético Xingu", "XIN", "Vale do Xingu"],
      ["Açaí", "Esporte Clube Açaí", "ACA", "Igarapé-Açu Velho"],
      ["Guamá", "União Paraense do Guamá", "GUA", "Beira-Guamá"],
      ["Carajás", "Sociedade Esportiva Serra dos Carajás", "SCJ", "Serra dos Carajás"],
      ["Caeté", "Caeté Futebol Clube", "CTE", "Bragança Velha"],
    ],
  },
];

export const ESTADUAL_BY_ID: Record<string, EstadualDef> = Object.fromEntries(ESTADUAIS.map((e) => [e.id, e]));

/** Premiação base (R$) do Paulistão; os outros estaduais usam o multiplicador prize. */
export const ESTADUAL_PRIZES = { team: 400_000, qf: 500_000, sf: 1_200_000, runnerUp: 2_500_000, champion: 5_000_000 };

export const isEstadualId = (id: string) => id.startsWith("est-");
