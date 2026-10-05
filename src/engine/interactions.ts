// Interações rápidas com jogadores: elogiar, criticar, prometer minutos e conversar sobre a fase.
// A reação depende da personalidade (atributos ocultos) e da forma recente.
// Usa o gerador global: chame dentro de withWorldRng (ações da interface).
import { absDay } from "./common";
import { activePromises, MAX_PROMISES } from "./dressing";
import { addPlayerMorale, narrativeOf } from "./narrative";
import { H, hidOf } from "./personality";
import { chance } from "./rng";
import type { Player, World } from "./types";

export type InteractionId = "praise" | "criticize" | "promise" | "form";
export const INTERACTION_COOLDOWN = 7;

export interface InteractionOption { id: InteractionId; emoji: string; label: string; hint: string; disabled?: string }
export interface InteractionResult { ok: boolean; delta: number; reaction: "😄" | "🙂" | "😐" | "😠"; text: string }

/** Média das últimas 3 notas (null sem jogos). */
export function recentForm(p: Player): number | null {
  const f = p.form.slice(-3);
  return f.length ? f.reduce((s, x) => s + x, 0) / f.length : null;
}

export function interactionWait(w: World, p: Player): number {
  const last = w.narrative?.talks?.[p.id];
  return last == null ? 0 : Math.max(0, INTERACTION_COOLDOWN - (absDay(w) - last));
}

export function interactionOptions(w: World, p: Player): InteractionOption[] {
  const wait = interactionWait(w, p);
  const cd = wait > 0 ? `Espere ${wait} dia${wait > 1 ? "s" : ""}` : undefined;
  const promiseBlock = p.promise ? "Já existe uma promessa" : activePromises(w) >= MAX_PROMISES ? `Máximo de ${MAX_PROMISES} promessas` : undefined;
  return [
    { id: "praise", emoji: "👏", label: "Elogiar", hint: "Funciona melhor com quem está jogando bem.", disabled: cd },
    { id: "criticize", emoji: "☝️", label: "Criticar", hint: "Profissionais aceitam; temperamentais explodem.", disabled: cd },
    { id: "promise", emoji: "⏱️", label: "Prometer minutos", hint: "Anima na hora, mas cobra em 2 meses.", disabled: cd ?? promiseBlock },
    { id: "form", emoji: "📈", label: "Conversar sobre a fase", hint: "Conversa franca: ajuda quem oscila.", disabled: cd },
  ];
}

const reactionOf = (d: number): InteractionResult["reaction"] => (d >= 5 ? "😄" : d > 0 ? "🙂" : d === 0 ? "😐" : "😠");

/** Executa a interação. Retorna ok=false se estiver em espera ou bloqueada. */
export function interact(w: World, p: Player, id: InteractionId): InteractionResult {
  const opt = interactionOptions(w, p).find((o) => o.id === id);
  if (!opt || opt.disabled) return { ok: false, delta: 0, reaction: "😐", text: opt?.disabled ?? "Indisponível" };
  const h = hidOf(p);
  const fa = recentForm(p);
  const good = fa != null && fa >= 7;
  const bad = fa != null && fa < 6.3;
  const first = p.name.split(" ")[0];
  let d = 0;
  let text = "";
  switch (id) {
    case "praise":
      if (good) {
        d = h[H.pro] <= 6 ? 2 : 6;
        text = h[H.pro] <= 6 ? `${first} agradece, mas parece achar que já está bom demais.` : `${first} fica motivado com o reconhecimento.`;
      } else if (bad) {
        d = h[H.pro] >= 15 ? -1 : 2;
        text = h[H.pro] >= 15 ? `${first} acha o elogio vazio: sabe que não vem jogando bem.` : `${first} gosta de ouvir, mesmo na fase ruim.`;
      } else {
        d = 3;
        text = `${first} agradece a confiança.`;
      }
      break;
    case "criticize":
      if (good) {
        d = h[H.temp] >= 15 ? -12 : -7;
        text = `${first} acha a crítica injusta: vinha jogando bem.`;
      } else if (h[H.temp] >= 15 && chance(0.6)) {
        d = -10;
        p.unhappy = (p.unhappy ?? 0) + 1;
        text = `${first} perde a cabeça e bate boca com você. O clima ficou ruim.`;
      } else if (h[H.pro] >= 14 || chance(0.35 + h[H.pro] * 0.02)) {
        d = 4;
        text = `${first} aceita a cobrança e promete trabalhar mais.`;
      } else {
        d = -4;
        text = `${first} fica chateado com a cobrança.`;
      }
      break;
    case "promise":
      p.promise = { until: absDay(w) + 60, base: [p.pt?.[0] ?? 0, p.pt?.[1] ?? 0] };
      d = h[H.amb] >= 15 ? 8 : 5;
      text = `${first} gosta da promessa de mais minutos. Ele vai cobrar em 2 meses.`;
      break;
    case "form":
      if (bad || h[H.con] <= 6) {
        d = h[H.pro] >= 12 || h[H.con] <= 6 ? 4 : 2;
        text = `Conversa franca: ${first} entende o que precisa melhorar.`;
      } else if (good) {
        d = 2;
        text = `${first} diz que está no melhor momento e quer manter o ritmo.`;
      } else {
        d = h[H.amb] >= 15 ? 1 : 0;
        text = `${first} ouve com atenção, sem grandes mudanças.`;
      }
      break;
  }
  // leais perdoam mais, ambiciosos sentem mais as broncas
  if (d < 0 && h[H.loy] >= 16) d = Math.round(d / 2);
  if (d < 0 && h[H.amb] >= 16) d -= 1;
  addPlayerMorale(p, d);
  narrativeOf(w).talks[p.id] = absDay(w);
  return { ok: true, delta: d, reaction: reactionOf(d), text };
}
