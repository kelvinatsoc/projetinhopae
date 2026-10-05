// Modo Administrador: trapaças no próprio save offline ("dar uma burladinha").
// FUNDAÇÃO: adminCheats, userWindowOpen e markAdmin são finais; as operações vêm com a Trilha C.
import { inWindow } from "./calendar";
import type { AdminCheats, World } from "./types";

const NONE: AdminCheats = Object.freeze({}) as AdminCheats;

/** Trapaças ativas (vazio quando o Modo Administrador está desligado). */
export function adminCheats(w: World): AdminCheats {
  return w.admin?.on ? w.admin.cheats : NONE;
}

/** A janela está aberta para o usuário? (sempre, com a trapaça "janela aberta") */
export function userWindowOpen(w: World): boolean {
  return inWindow(w.day) || !!adminCheats(w).window;
}

/** Registra uma ação do administrador (marca o save e a temporada com 🛠️). */
export function markAdmin(w: World, text: string) {
  const a = (w.admin ??= { on: true, seasons: [], cheats: {}, log: [] });
  a.everUsed = true;
  if (!a.seasons.includes(w.season)) a.seasons.push(w.season);
  a.log.push({ season: w.season, day: w.day, text });
  if (a.log.length > 100) a.log.splice(0, a.log.length - 100);
}
