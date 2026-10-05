// Ações de alto nível disparadas pela interface.
import { migrateWorld, type Database } from "../engine/world";
import { advance, runEndOfSeason } from "../engine/game";
import { registerMedia, type RegenFace } from "../engine/media";
import { clearAdminUndo, markAdmin } from "../engine/admin";
import type { World } from "../engine/types";
import { loadSnapshot, saveSnapshot, saveWorld } from "../save";
import { getWorld, push, replace, resetNav, setWorld, toast, update } from "../store";

let dbPromise: Promise<Database> | null = null;

// índices da mídia empacotada (rostos dos regens, fotos das lendas); glob não quebra se faltar arquivo
const mediaIndex = import.meta.glob<{ default: unknown }>(["../data/regenFaces.json", "../data/media.json", "../data/sportsdbPhotos.json"]);

async function loadMediaIndex() {
  const load = async <T,>(path: string): Promise<T | null> => {
    const mod = mediaIndex[path];
    if (!mod) return null;
    try {
      return (await mod()).default as T;
    } catch {
      return null;
    }
  };
  const [faces, media, sportsdb] = await Promise.all([
    load<{ faces: RegenFace[] }>("../data/regenFaces.json"),
    load<{ legends?: Record<string, string> }>("../data/media.json"),
    load<Record<string, string>>("../data/sportsdbPhotos.json"),
  ]);
  registerMedia({ regenFaces: faces?.faces, legends: media?.legends, sportsdb: sportsdb ?? undefined });
}

/** O banco de dados (elencos reais + índice de mídia) só é carregado quando o usuário abre ou cria um jogo. */
export function loadDatabase(): Promise<Database> {
  dbPromise ??= Promise.all([import("../data/database.json"), loadMediaIndex()]).then(([m]) => m.default as unknown as Database);
  return dbPromise;
}

/** Abre um jogo salvo (ou importado), atualizando-o com as fotos/escudos do banco atual. */
export async function openWorld(w: World) {
  let info: ReturnType<typeof migrateWorld> | null = null;
  try {
    info = migrateWorld(w, await loadDatabase());
  } catch (e) {
    console.error(e);
  }
  clearAdminUndo();
  setWorld(w);
  if (info?.newer) toast("Este save é de uma versão mais nova do jogo — atualize o app.");
  else if (info && info.repaired > 0) toast(`Save verificado: ${info.repaired} problema${info.repaired > 1 ? "s" : ""} corrigido${info.repaired > 1 ? "s" : ""} ✔`);
}

/** Admin: volta para o ponto de restauração (antes do último jogo). */
export async function restoreBeforeMatch(): Promise<boolean> {
  const w = getWorld();
  if (!w) return false;
  const rec = await loadSnapshot(w.saveId);
  if (!rec) {
    toast("Não há ponto de restauração.");
    return false;
  }
  await openWorld(rec.world);
  resetNav();
  update((x) => { markAdmin(x, `⏪ Voltou para antes do jogo contra ${rec.meta.opp}`); });
  autosave(true);
  toast(`⏪ De volta para antes do jogo contra ${rec.meta.opp}`);
  return true;
}

let saveTimer: number | undefined;
let saving = false;

export function autosave(immediate = false) {
  const w = getWorld();
  if (!w || !w.settings.autoSave) return;
  window.clearTimeout(saveTimer);
  const run = async () => {
    if (saving) return;
    saving = true;
    try {
      await saveWorld(w);
    } catch (e) {
      console.error(e);
      toast("Não foi possível salvar o jogo neste aparelho.");
    } finally {
      saving = false;
    }
  };
  if (immediate) void run();
  else saveTimer = window.setTimeout(run, 400);
}

export async function saveNow() {
  const w = getWorld();
  if (!w) return;
  await saveWorld(w);
  toast("Jogo salvo ✔");
}

/** Botão "Continuar": avança até o próximo jogo do usuário ou até o fim da temporada. */
export function continueGame() {
  const w = getWorld();
  if (!w) return;
  if (w.fired) {
    push({ name: "fired" });
    return;
  }
  let res: ReturnType<typeof advance> | null = null;
  const day0 = w.day;
  update((world) => {
    res = advance(world);
  });
  const r = res as ReturnType<typeof advance> | null;
  if (!r) return;
  // resumo rápido do que foi simulado até o próximo compromisso
  const days = (getWorld()?.day ?? day0) - day0;
  if (days > 1) toast(`⏩ ${days} dias simulados${r.reason === "match" ? " · dia de jogo!" : ""}`);
  if (r.reason === "match") {
    // admin: ponto de restauração antes de cada jogo (cópia síncrona; gravação em segundo plano)
    if (w.admin?.on && r.fixture) {
      const opp = w.clubs[r.fixture.home === w.userClubId ? r.fixture.away : r.fixture.home]?.name ?? "?";
      saveSnapshot(w, opp).catch((e) => console.error(e));
    }
    push({ name: "prematch" });
  }
  else if (r.reason === "seasonEnd") finishSeason();
  autosave();
}

export function finishSeason() {
  let summary: string[] = [];
  update((w) => {
    summary = runEndOfSeason(w);
  });
  push({ name: "seasonEnd", summary });
  autosave(true);
}

export function startNewWorld(w: World) {
  clearAdminUndo();
  setWorld(w);
  autosave(true);
}

export function goToMatch(quick: boolean) {
  replace({ name: "match", quick });
}
