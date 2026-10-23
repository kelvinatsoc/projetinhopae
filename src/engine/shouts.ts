// Instruções rápidas de beira de campo (as "shouts" do Football Manager).
// Cada uma é só um atalho para alavancas que o motor já tem: mentalidade, pressão e instruções do time
// (tactics.ts). Valem só durante a partida (não mexem na tática salva) e o auxiliar avalia cada uma
// pelo mesmo modelo das outras dicas, então "seguir a ordem" nunca é um palpite.
import type { TeamInstr } from "./types";

export type ShoutId = "retranca" | "contra" | "posse" | "pressao" | "pontas" | "abafa" | "cera";

export interface ShoutDef {
  id: ShoutId;
  label: string; // botão
  icon: string; // ícone vetorial do jogo (substitui emojis)
  emoji: string; // fallback
  hint: string; // uma linha explicando o que muda
  phrase: string; // como o auxiliar fala ("fechar a casinha")
  m?: number; // mentalidade alvo (-2..2); sem valor, mantém a atual
  p?: number; // pressão alvo (0..2)
  ti: Partial<TeamInstr>;
}

export const SHOUTS: readonly ShoutDef[] = [
  { id: "retranca", label: "Fechar a casinha", icon: "wall", emoji: "🧱", phrase: "fechar a casinha com linha baixa", hint: "Retranca, linha recuada e time compacto.", m: -2, ti: { line: 0, width: 0 } },
  { id: "contra", label: "Contra-ataque", icon: "counter", emoji: "⚡", phrase: "fechar atrás e sair no contra-ataque", hint: "Defensivo, linha recuada, bola rápida e direta para a frente.", m: -1, ti: { line: 0, direct: 2, tempo: 2 } },
  { id: "posse", label: "Segurar a bola", icon: "possession", emoji: "🔁", phrase: "segurar a bola e baixar o ritmo", hint: "Passes curtos e ritmo cadenciado: menos lances para os dois lados.", ti: { direct: 0, tempo: 0 } },
  { id: "pressao", label: "Pressão alta", icon: "flameTactical", emoji: "🔥", phrase: "subir a marcação e pressionar a saída", hint: "Marcação alta, linha adiantada e contrapressão (cansa mais).", p: 2, ti: { line: 2, cpress: true } },
  { id: "pontas", label: "Explorar as pontas", icon: "wings", emoji: "↔️", phrase: "abrir o jogo pelas pontas", hint: "Time aberto: mais jogadas pelos lados.", ti: { width: 2 } },
  { id: "abafa", label: "Abafa!", icon: "rocket", emoji: "🚀", phrase: "ir para o abafa, com bola na área e pressão", hint: "Tudo ao ataque, linha alta, ligação direta e ritmo acelerado.", m: 2, ti: { line: 2, direct: 2, tempo: 2 } },
  { id: "cera", label: "Fazer cera", icon: "stopwatch", emoji: "⏳", phrase: "fazer cera e esfriar o jogo", hint: "Só vale vencendo, depois dos 70'. Mais risco de cartão.", ti: { waste: true } },
];

export const shoutDef = (id: string | null | undefined): ShoutDef | undefined => SHOUTS.find((s) => s.id === id);
