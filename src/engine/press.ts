// Coletivas de imprensa antes e depois dos jogos do usuário.
// As perguntas saem do contexto (fase, rival, clássico, moral do elenco, diretoria, resultado)
// e são sorteadas com um gerador determinístico por mundo + jogo (não mexe no gerador global).
import { derbyIntensity, derbyName } from "../data/rivalries";
import { seeded } from "./common";
import { addBoard, addFan, addPlayerMorale, addSquadMorale, narrativeOf, squadPlayers } from "./narrative";
import { addNews } from "./news";
import { H, hidOf } from "./personality";
import type { Fixture, World } from "./types";

export type PressTone = "calm" | "confident" | "aggressive" | "deflect";
export type PressPhase = "pre" | "post";
export type PressTopic = "form" | "rival" | "derby" | "player" | "board" | "result" | "fans";

export const PRESS_TONES: Record<PressTone, { emoji: string; label: string }> = {
  calm: { emoji: "😌", label: "Calmo" },
  confident: { emoji: "😎", label: "Confiante" },
  aggressive: { emoji: "😤", label: "Agressivo" },
  deflect: { emoji: "🤐", label: "Desconversar" },
};

export interface PressAnswer { tone: PressTone; text: string }
export interface PressQuestion { id: string; topic: PressTopic; reporter: string; text: string; pid?: number; answers: PressAnswer[] }
export interface PressEffect { morale: number; board: number; fans: number; player: number }
export interface PressCtx {
  phase: PressPhase; fid: number; opp: string; oppName: string; derby: number; derbyName?: string;
  form: number; // pontos por jogo nos últimos 5 (0 a 3)
  formStr: string; // ex.: "VVEDV"
  board: number; fan: number;
  result?: number; // pós-jogo: 1 vitória, 0 empate, -1 derrota
  score?: string;
  sadPid?: number; starPid?: number;
}

const REPORTERS = ["Rádio Gaúcha", "GE", "Lance!", "ESPN", "Rádio Itatiaia", "TNT Sports", "Jornal local", "Podcast da torcida", "SporTV", "Placar"];

export const pressKey = (fid: number, phase: PressPhase) => `${fid}:${phase}`;
export const pressDone = (w: World, fid: number, phase: PressPhase) => !!w.narrative?.press?.includes(pressKey(fid, phase));

/** Contexto da coletiva a partir do estado do mundo. */
export function pressContext(w: World, f: Fixture, phase: PressPhase): PressCtx {
  const me = w.userClubId;
  const oppId = f.home === me ? f.away : f.home;
  const played = w.fixtures
    .filter((x) => x.result && (x.home === me || x.away === me))
    .sort((a, b) => a.day - b.day)
    .slice(-5);
  let pts = 0;
  let formStr = "";
  for (const x of played) {
    const r = x.result!;
    const d = x.home === me ? r.hg - r.ag : r.ag - r.hg;
    pts += d > 0 ? 3 : d === 0 ? 1 : 0;
    formStr += d > 0 ? "V" : d === 0 ? "E" : "D";
  }
  const squad = squadPlayers(w);
  const sad = squad.filter((p) => p.morale < 45 || p.wantsOut).sort((a, b) => b.ovr - a.ovr)[0];
  const star = squad.slice().sort((a, b) => b.ovr + b.fame * 0.2 - (a.ovr + a.fame * 0.2))[0];
  const ctx: PressCtx = {
    phase, fid: f.id, opp: oppId, oppName: w.clubs[oppId]?.name ?? "adversário",
    derby: derbyIntensity(f.home, f.away), derbyName: derbyName(f.home, f.away),
    form: played.length ? pts / played.length : 1.5, formStr,
    board: w.board.confidence, fan: w.narrative?.fan ?? 60,
    sadPid: sad?.id, starPid: star?.id,
  };
  if (phase === "post" && f.result) {
    const r = f.result;
    const mine = f.home === me ? r.hg : r.ag;
    const theirs = f.home === me ? r.ag : r.hg;
    ctx.result = Math.sign(mine - theirs);
    ctx.score = `${mine} × ${theirs}`;
  }
  return ctx;
}

type Rnd = () => number;
const pickR = <T,>(r: Rnd, a: readonly T[]): T => a[Math.floor(r() * a.length)];

/** Respostas por tom (variações). {o} = adversário, {p} = jogador. */
const ANSWERS: Record<PressTopic, Record<PressTone, string[]>> = {
  form: {
    calm: ["Sigo confiando no trabalho. Fase boa ou ruim, o caminho é o mesmo.", "É jogo a jogo. O grupo sabe o que precisa fazer."],
    confident: ["Esse time vai brigar lá em cima, podem escrever.", "Estamos no caminho certo e os resultados vão aparecer."],
    aggressive: ["Quem fala de crise não acompanha nossos treinos.", "Tem muita gente torcendo contra. Vamos calar todo mundo."],
    deflect: ["Prefiro falar do próximo jogo.", "Isso eu converso com o grupo, não aqui."],
  },
  rival: {
    calm: ["Respeito muito o {o}. Vai ser um jogo duro.", "O {o} tem qualidade, precisamos estar atentos."],
    confident: ["Jogando o nosso futebol, vencemos o {o}.", "Conhecemos o {o} e sabemos como machucá-los."],
    aggressive: ["O {o} vai sentir a pressão desde o primeiro minuto.", "Não tenho medo do {o}. Eles é que precisam se preocupar."],
    deflect: ["Me preocupo com o meu time, não com o {o}.", "Não vou ficar comentando o adversário."],
  },
  derby: {
    calm: ["Clássico é clássico. Cabeça fria e respeito.", "Sabemos o peso desse jogo, mas é preciso equilíbrio."],
    confident: ["A cidade vai ser nossa de novo.", "Clássico se ganha, e nós vamos ganhar."],
    aggressive: ["Nesse jogo não tem amizade. Vamos para cima deles!", "O torcedor pode preparar a festa. O rival que se cuide."],
    deflect: ["Vale os mesmos três pontos de qualquer jogo.", "Não vou alimentar polêmica."],
  },
  player: {
    calm: ["{p} é importante para nós. Estamos conversando internamente.", "Confio no {p}. Ele vai dar a volta por cima."],
    confident: ["{p} é craque e vai decidir muitos jogos para nós.", "Podem anotar: {p} ainda vai ser o melhor da temporada."],
    aggressive: ["{p} sabe que precisa render mais. Ninguém tem lugar garantido.", "Quem não estiver feliz conhece a porta. Vale para o {p} também."],
    deflect: ["Não falo de casos individuais.", "Assunto do vestiário fica no vestiário."],
  },
  board: {
    calm: ["Tenho ótima relação com a diretoria e entendo a cobrança.", "A cobrança faz parte. Sigo tranquilo."],
    confident: ["Vou entregar o que a diretoria espera, tenho certeza.", "Os resultados vão mostrar que acertaram ao me contratar."],
    aggressive: ["Se querem resultado, precisam me dar reforços.", "Ninguém da diretoria entende de futebol mais do que eu."],
    deflect: ["Isso é com o presidente.", "Não comento bastidores."],
  },
  result: {
    calm: ["Foi o resultado possível. Vamos analisar e corrigir.", "Precisamos manter os pés no chão, independentemente do placar."],
    confident: ["Esse é o time que eu quero ver toda semana.", "Mostramos que podemos encarar qualquer um."],
    aggressive: ["A arbitragem precisa ser melhor. Isso não pode acontecer.", "Tem jogador que precisa acordar. Cobrei no vestiário."],
    deflect: ["Agora é descansar e pensar no próximo.", "Não vou falar do jogo de cabeça quente."],
  },
  fans: {
    calm: ["Entendo a torcida, ela tem todo o direito de cobrar.", "O apoio da arquibancada faz diferença. Peço paciência."],
    confident: ["Vamos dar muitas alegrias para essa torcida.", "O torcedor vai se orgulhar desse time."],
    aggressive: ["Quem vaia não ajuda. Precisamos de apoio, não de pressão.", "Torcedor de verdade apoia nas horas ruins."],
    deflect: ["Minha cabeça está no campo.", "Respeito todas as opiniões."],
  },
};

function questionText(ctx: PressCtx, topic: PressTopic, r: Rnd, pName?: string): string {
  const o = ctx.oppName;
  switch (topic) {
    case "form":
      return ctx.form >= 2
        ? pickR(r, [`São ${ctx.formStr || "bons"} resultados recentes. O time chegou no ponto ideal?`, "A equipe vive grande fase. Dá para sonhar com título?"])
        : ctx.form < 1
          ? pickR(r, [`A sequência ${ctx.formStr} preocupa. O trabalho está em risco?`, "O time não engrena. O que está faltando?"])
          : pickR(r, ["O time oscila muito. Como achar regularidade?", "Uma vitória, um tropeço... falta constância?"]);
    case "rival": return pickR(r, [`O que espera do ${o}?`, `Qual o ponto forte do ${o} que mais preocupa?`, `O ${o} vem embalado. Como parar o adversário?`]);
    case "derby": return pickR(r, [`É ${ctx.derbyName}! Qual o recado para o torcedor?`, `O ${ctx.derbyName} mexe com a cidade. Seu time está preparado para o clássico?`, `Perder o ${ctx.derbyName} não é opção, certo?`]);
    case "player": return pickR(r, [`${pName} anda insatisfeito. Ele continua nos planos?`, `Fala-se de clima ruim com ${pName}. O que aconteceu?`]);
    case "board": return ctx.board < 40
      ? pickR(r, ["A diretoria estaria perdendo a paciência. Você se sente ameaçado?", "Seu cargo está em jogo?"])
      : pickR(r, ["Como está a relação com a diretoria?", "A diretoria prometeu reforços. Está satisfeito?"]);
    case "result": return ctx.result! > 0
      ? pickR(r, [`Vitória por ${ctx.score}. O que mais agradou?`, `${ctx.score} sobre o ${o}. Foi a melhor atuação do ano?`])
      : ctx.result! < 0
        ? pickR(r, [`Derrota por ${ctx.score}. O que deu errado?`, `O ${o} foi melhor hoje. Faltou atitude?`])
        : pickR(r, [`Empate em ${ctx.score}. Resultado justo?`, "Um ponto fora ou dois perdidos?"]);
    case "fans": return ctx.fan < 40
      ? pickR(r, ["A torcida protestou no treino. Como responde?", "Os torcedores pedem mudanças. Vai ouvir a arquibancada?"])
      : pickR(r, ["A torcida está lotando os jogos. Qual o recado para ela?", "Como é sentir o apoio da arquibancada?"]);
  }
}

/** 3 perguntas, cada uma com 3 respostas de tons diferentes. Determinístico por mundo + jogo + fase. */
export function generatePress(w: World, f: Fixture, phase: PressPhase): PressQuestion[] {
  const ctx = pressContext(w, f, phase);
  const r = seeded(w, `press:${f.id}:${phase}`);
  const topics: PressTopic[] = [];
  if (phase === "post") topics.push("result");
  if (ctx.derby) topics.push("derby");
  const pool: PressTopic[] = ["form", "rival", "board", "fans"];
  if (ctx.sadPid != null) pool.push("player", "player");
  if (ctx.board < 40) pool.push("board");
  if (ctx.fan < 40 || ctx.fan > 80) pool.push("fans");
  if (ctx.form >= 2 || ctx.form < 1) pool.push("form");
  while (topics.length < 3 && pool.length) {
    const t = pool.splice(Math.floor(r() * pool.length), 1)[0];
    if (!topics.includes(t) && !(t === "rival" && topics.includes("derby"))) topics.push(t);
  }
  const all: PressTone[] = ["calm", "confident", "aggressive", "deflect"];
  return topics.slice(0, 3).map((topic, i) => {
    const pid = topic === "player" ? ctx.sadPid : undefined;
    const pName = pid != null ? w.players[pid]?.name : undefined;
    const drop = Math.floor(r() * 4);
    const tones = all.filter((_, k) => k !== drop);
    const answers = tones.map((tone) => ({
      tone,
      text: pickR(r, ANSWERS[topic][tone]).replace(/\{o\}/g, ctx.oppName).replace(/\{p\}/g, pName ?? "ele"),
    }));
    return { id: `${phase}${i}`, topic, reporter: pickR(r, REPORTERS), text: questionText(ctx, topic, r, pName), pid, answers };
  });
}

/** Efeito de uma resposta (sem sorteio, para o jogador poder aprender o padrão). */
export function pressEffect(w: World, ctx: PressCtx, q: PressQuestion, tone: PressTone): PressEffect {
  const e: PressEffect = { morale: 0, board: 0, fans: 0, player: 0 };
  const base: Record<PressTone, [number, number, number]> = {
    calm: [1, 1, 0], confident: [2, 0, 2], aggressive: [1, -2, 3], deflect: [0, -1, -1],
  };
  [e.morale, e.board, e.fans] = base[tone];
  switch (q.topic) {
    case "form":
      if (ctx.form < 1 && tone === "confident") { e.fans -= 3; e.morale -= 1; }
      if (ctx.form < 1 && tone === "calm") e.board += 1;
      if (ctx.form >= 2 && tone === "confident") e.morale += 1;
      break;
    case "derby":
      if (tone === "aggressive") { e.fans += 2 * ctx.derby; e.morale += 1; e.board -= 1; }
      if (tone === "confident") e.fans += ctx.derby;
      if (tone === "deflect") e.fans -= ctx.derby;
      break;
    case "rival":
      if (tone === "aggressive") e.board -= 1;
      break;
    case "player": {
      const p = q.pid != null ? w.players[q.pid] : undefined;
      const temp = p ? hidOf(p)[H.temp] : 10;
      e.player = tone === "calm" ? 4 : tone === "confident" ? 6 : tone === "aggressive" ? (temp >= 15 ? -12 : -8) : 0;
      if (tone === "aggressive") e.morale -= 1;
      break;
    }
    case "board":
      if (tone === "calm") e.board += ctx.board < 40 ? 2 : 1;
      if (tone === "aggressive") e.board -= 3;
      if (tone === "deflect") e.board -= 1;
      if (tone === "confident" && ctx.board < 40) e.board += 1;
      break;
    case "result":
      if ((ctx.result ?? 0) > 0) {
        if (tone === "confident") { e.morale += 2; e.fans += 1; }
        if (tone === "aggressive") { e.board -= 1; e.fans -= 1; }
      } else if ((ctx.result ?? 0) < 0) {
        if (tone === "confident") { e.fans -= 3; e.board -= 1; }
        if (tone === "calm") { e.board += 1; e.morale += 1; }
        if (tone === "aggressive") e.morale -= 2; // culpou o elenco/arbitragem
        if (tone === "deflect") e.fans -= 1;
      }
      break;
    case "fans":
      if (tone === "aggressive") e.fans -= 6;
      if (tone === "calm") e.fans += 2;
      break;
  }
  return e;
}

/** Aplica as respostas escolhidas (uma por pergunta) e marca a coletiva como feita. */
export function applyPress(w: World, f: Fixture, phase: PressPhase, questions: PressQuestion[], picks: Record<string, PressTone>): PressEffect {
  const total: PressEffect = { morale: 0, board: 0, fans: 0, player: 0 };
  if (pressDone(w, f.id, phase)) return total;
  const ctx = pressContext(w, f, phase);
  for (const q of questions) {
    const tone = picks[q.id];
    if (!tone) continue;
    const e = pressEffect(w, ctx, q, tone);
    total.morale += e.morale;
    total.board += e.board;
    total.fans += e.fans;
    total.player += e.player;
    const p = q.pid != null ? w.players[q.pid] : undefined;
    if (p && e.player) addPlayerMorale(p, e.player);
  }
  addSquadMorale(w, total.morale);
  addBoard(w, total.board);
  addFan(w, total.fans);
  const n = narrativeOf(w);
  n.press.push(pressKey(f.id, phase));
  if (n.press.length > 40) n.press.splice(0, n.press.length - 40);
  const aggressive = questions.filter((q) => picks[q.id] === "aggressive").length;
  if (aggressive >= 2) addNews(w, "info", "🎤 Declarações fortes repercutem", `As falas do técnico antes/depois do jogo contra o ${ctx.oppName} incendiaram a torcida e incomodaram a diretoria.`, { clubId: ctx.opp });
  return total;
}
