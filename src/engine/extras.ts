// Dados extras de gestão por jogador (atributos ocultos e jogadas preferidas) e migração para a v3.
// Tudo é derivado com geradores próprios (semente do mundo + id): o gerador global não é tocado,
// então um save migrado recebe exatamente o que um mundo novo com a mesma semente receberia.
import { LEGEND_BY_ID } from "../data/legends";
import { seeded } from "./common";
import { rollHidden } from "./personality";
import { legendTraitsFor, rollTraits, TRAIT_UNLOCK_OVR } from "./traits";
import type { Player, World } from "./types";

/** Garante que o jogador tem atributos ocultos e jogadas (não sobrescreve o que já existe). */
export function initPlayerExtras(w: World, p: Player) {
  if (!p.hid) p.hid = rollHidden(w, p);
  if (!p.traits) {
    const def = p.legend ? LEGEND_BY_ID[p.legend] : undefined;
    if (def) {
      // lenda: a 1ª jogada vem de nascença; as outras despertam conforme o overall
      const sig = legendTraitsFor(def);
      const traits = sig.slice(0, 1);
      let i = 1;
      while (i < sig.length && p.ovr >= TRAIT_UNLOCK_OVR[Math.min(i, TRAIT_UNLOCK_OVR.length) - 1]) traits.push(sig[i++]);
      p.traits = traits;
      const locked = sig.slice(i);
      if (locked.length) p.lockedTraits = locked;
      else delete p.lockedTraits;
    } else {
      p.traits = rollTraits(p, seeded(w, `${p.id}:t`), { real: !!p.real, legend: !!p.legend, hid: p.hid, age: w.season - p.born });
    }
  }
}

/** Preenche os extras de todos os jogadores (inclusive os garotos da peneira). Barato: O(n). */
export function fillExtras(w: World) {
  for (const p of Object.values(w.players)) initPlayerExtras(w, p);
  for (const p of w.peneira?.kids ?? []) initPlayerExtras(w, p);
}

/** Migração estrutural para a versão 3 do save. */
export function migrateTo3(w: World) {
  for (const c of Object.values(w.clubs)) {
    c.youthFac ??= c.youthLevel;
    c.youthCoach ??= c.youthLevel;
  }
}
