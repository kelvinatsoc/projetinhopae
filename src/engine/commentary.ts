// Frases da narração (português do Brasil). {p} = jogador, {a} = assistência, {t} = time, {g} = goleiro.
import { pick } from "./rng";

const T = {
  goal: [
    "GOOOOOL! {p} bate firme e marca para o {t}!",
    "É GOL! {p} recebe de {a} e balança a rede!",
    "GOLAÇO! {p} solta a bomba de fora da área, no ângulo!",
    "GOL do {t}! {a} cruza e {p} cabeceia para o fundo do gol!",
    "Que jogada! {p} dribla o goleiro e só empurra para a rede!",
    "GOOOL! {p} aproveita o passe de {a} e toca na saída de {g}!",
    "Bola na rede! {p} finaliza com categoria. Explode a torcida do {t}!",
    "É dele! {p} completa a jogada de {a} e amplia a festa do {t}!",
    "GOOOOL! Contra-ataque fulminante e {p} não perdoa!",
    "{p}, de primeira, sem chance para {g}! Gol do {t}!",
  ],
  goalSolo: [
    "GOOOOOL! {p} arranca sozinho e marca um belo gol para o {t}!",
    "É GOL! {p} aproveita o rebote e manda para as redes!",
    "GOLAÇO de {p}! Que chute, que categoria!",
    "Falta cobrada com perfeição! {p} coloca no ângulo de {g}!",
  ],
  ownGoal: ["Gol contra! {p} tenta cortar e manda para o próprio gol. Azar!"],
  penGoal: ["Pênalti convertido! {p} desloca {g} e marca.", "{p} bate com força, no meio do gol. É gol!"],
  penMiss: ["Defendeu! {g} pega o pênalti cobrado por {p}!", "Para fora! {p} desperdiça a cobrança de pênalti!"],
  penAward: ["Pênalti para o {t}! O árbitro aponta a marca da cal.", "É pênalti! Derrubaram {p} dentro da área!"],
  save: [
    "Grande defesa de {g} no chute de {p}!",
    "{g} voa e espalma a finalização de {p}!",
    "{p} finaliza, mas {g} segura firme.",
    "Que defesa! {g} salva o time no chute à queima-roupa de {p}!",
  ],
  miss: [
    "{p} chuta por cima do gol.",
    "{p} arrisca de longe, mas a bola sai à direita.",
    "Finalização fraca de {p}, sem perigo.",
    "{p} tenta a cavadinha e a bola passa raspando!",
    "Cabeçada de {p} sai à esquerda do gol.",
  ],
  post: ["NA TRAVE! {p} quase marca!", "Uhhh! A bola de {p} explode no travessão!"],
  bigChance: ["Chance clara para {p}, sozinho na cara do gol...", "{a} enfia um passe açucarado para {p}..."],
  yellow: ["Cartão amarelo para {p} após falta dura.", "{p} recebe o amarelo por reclamação.", "Amarelo para {p}, que parou o contra-ataque."],
  red: ["EXPULSO! {p} recebe o vermelho direto!", "Vermelho para {p}! O {t} fica com um a menos."],
  secondYellow: ["Segundo amarelo para {p}, que está expulso!"],
  injury: ["{p} sente a lesão e pede atendimento médico.", "{p} cai no gramado sentindo dores. Preocupação no {t}."],
  sub: ["Substituição no {t}: sai {a}, entra {p}."],
  var: ["Gol anulado pelo VAR! Impedimento milimétrico de {p}.", "O VAR chama e o gol de {p} é anulado por falta no início da jogada."],
  corner: ["Escanteio para o {t}.", "{p} cobra o escanteio... a zaga afasta."],
  info: [
    "O {t} troca passes no meio-campo.",
    "Pressão do {t}, que empurra o adversário para a defesa.",
    "Jogo truncado, muitas faltas no meio-campo.",
    "{p} tenta a jogada individual, mas é desarmado.",
    "A torcida do {t} canta alto nas arquibancadas!",
    "{p} faz boa jogada pela lateral e cruza, mas a defesa corta.",
    "Lançamento longo para {p}, que não alcança.",
    "O {t} tenta encaixar o contra-ataque.",
    "Partida movimentada, as duas equipes buscam o gol.",
    "{p} sofre falta perto da área.",
  ],
};

export type CommentaryKind = keyof typeof T;

export function phrase(kind: CommentaryKind, v: { p?: string; a?: string; t?: string; g?: string }): string {
  let s = pick(T[kind]);
  if (!v.a && s.includes("{a}")) {
    // frase sem assistência
    s = kind === "goal" ? pick(T.goalSolo) : s;
  }
  return s
    .replace(/\{p\}/g, v.p ?? "")
    .replace(/\{a\}/g, v.a ?? "companheiro")
    .replace(/\{t\}/g, v.t ?? "")
    .replace(/\{g\}/g, v.g ?? "o goleiro");
}
