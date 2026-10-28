// Geração procedural de notícias, rumores de mercado e boletins da comissão técnica
// Inspirado nas narrativas do Openfoot Manager e do Football Manager.
import { inWindow } from "./calendar";
import { formatMoney } from "./finance";
import { addNews } from "./news";
import { shortName } from "./player";
import { hashString, makeRng } from "./rng";
import type { Player, World } from "./types";

const FOREIGN_CLUBS = [
  "Real Madrid", "Barcelona", "Arsenal", "Manchester City", "Chelsea", "Liverpool",
  "Bayern de Munique", "Paris Saint-Germain", "Juventus", "Inter de Milão", "Benfica", "Porto"
];

const PRESS_OUTLETS = [
  "Globo Esporte", "Gazeta Esportiva", "UOL Esporte", "ESPN Brasil", "TNT Sports"
];

/**
 * Roda a cada dia no dailyTick para produzir rumores e notícias procedurais.
 * Mantém frequência moderada (1 notícia a cada 6-10 dias) para não poluir o feed.
 * Usa gerador pseudo-aleatório local independente (makeRng) para NÃO interferir
 * no fluxo de RNG determinístico do jogo nem causar desvios em temporadas/testes.
 */
export function proceduralNewsTick(w: World) {
  const d = w.day;
  // Só gera a cada ~4 dias
  if (d % 4 !== 0) return;

  const club = w.clubs[w.userClubId];
  if (!club) return;

  const players = club.players.map((id) => w.players[id]).filter((p): p is Player => p != null && !p.loan);
  if (!players.length) return;

  // RNG local isolado do dia
  const rng = makeRng(hashString(`rumors:${w.seed}:${w.season}:${d}`));
  const localChance = (p: number) => rng() < p;
  const localPick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

  // 1. Rumores de Transferência (Janela de mercado ou proximidade)
  if (inWindow(d) && localChance(0.35)) {
    const star = players.slice().sort((a, b) => b.ovr - a.ovr)[0];
    const gem = players.filter((p) => p.youth || (w.season - p.born) <= 20).sort((a, b) => b.pot - a.pot)[0];
    const target = (gem && localChance(0.55)) ? gem : star;
    if (!target) return;

    const foreign = localPick(FOREIGN_CLUBS);
    const outlet = localPick(PRESS_OUTLETS);
    const estVal = formatMoney(Math.round(target.ovr * target.ovr * 1800));

    const templates = [
      {
        title: `Mercado: ${foreign} monitora situação de ${shortName(target.name)}`,
        body: `Segundo apuração do ${outlet}, olheiros do ${foreign} estiveram no Brasil acompanhando ${target.name}. Avaliado em cerca de ${estVal}, o atleta é visto com potencial imediato para o futebol europeu.`
      },
      {
        title: `Sondagem: Proposta milionária pode chegar por ${shortName(target.name)}`,
        body: `O estafe de ${target.name} foi consultado por intermediários ligados ao ${foreign}. A diretoria do ${club.name} afirma que só abre negociações pelo valor integral da multa rescisória.`
      },
      {
        title: `Destaque: Imprensa internacional elogia evolução de ${shortName(target.name)}`,
        body: `Uma matéria especial do ${outlet} colocou ${target.name} entre as principais revelações sul-americanas da temporada. O ${club.name} planeja blindar o contrato do jogador.`
      }
    ];

    const chosen = localPick(templates);
    addNews(w, "transfer", chosen.title, chosen.body, { pid: target.id });
    return;
  }

  // 2. Boletim Tático da Comissão Técnica (a cada ~12 dias)
  if (d % 12 === 0 && localChance(0.6)) {
    const ti = club.tactic.ti;
    const focus = ti?.focus ?? 1;
    const tackling = ti?.tackling ?? 1;

    let title = `Boletim da Comissão Técnica: Análise Tática`;
    let body = "";

    if (focus === 0) {
      body = `Nossa equipe tem explorado os corredores laterais com muita agressividade. Os pontas e laterais lideram as chances criadas por jogo. O auxiliar sugere manter cruzamentos rápidos na área.`;
    } else if (focus === 2) {
      body = `O jogo concentrado pelo funil central tem gerado triangulações de alta precisão. A comissão técnica destaca a movimentação entre as linhas dos nossos meias ofensivos.`;
    } else if (tackling === 2) {
      body = `O desarme agressivo subiu o número de recuperações no campo de ataque, mas o departamento de desempenho alerta para o cansaço acumulado e risco de suspensões.`;
    } else {
      body = `O padrão tático da equipe está consolidado com equilíbrio entre defesa e transição ofensiva. O entrosamento nas tabelas vem crescendo semana a semana.`;
    }

    addNews(w, "dressing", title, body);
    return;
  }

  // 3. Clima da Torcida e Imprensa
  if (localChance(0.2)) {
    const outlet = localPick(PRESS_OUTLETS);
    const fanTopics = [
      {
        title: `Torcida do ${club.name} esgota ingressos para os próximos compromissos`,
        body: `A torcida tricolor segue dando show nas arquibancadas. O apoio maciço reflete a sintonia do elenco com o trabalho da comissão técnica.`
      },
      {
        title: `Mesa Redonda (${outlet}): A consistência defensiva do ${club.name}`,
        body: `Comentaristas elogiaram a disciplina tática imposta pelo treinador. A transição rápida e o posicionamento das linhas foram destacados no debate esportivo.`
      }
    ];
    const item = localPick(fanTopics);
    addNews(w, "board", item.title, item.body);
  }
}
