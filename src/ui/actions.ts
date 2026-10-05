// Ações de alto nível disparadas pela interface.
import { migrateWorld, type Database } from "../engine/world";
import { advance, runEndOfSeason } from "../engine/game";
import { registerMedia, type RegenFace } from "../engine/media";
import type { World } from "../engine/types";
import { saveWorld } from "../save";
import { getWorld, push, replace, setWorld, toast, update } from "../store";

let dbPromise: Promise<Database> | null = null;

// índices da mídia empacotada (rostos dos regens, fotos das lendas); glob não quebra se faltar arquivo
const mediaIndex = import.meta.glob<{ default: unknown }>(["../data/regenFaces.json", "../data/media.json"]);

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
  const [faces, media] = await Promise.all([
    load<{ faces: RegenFace[] }>("../data/regenFaces.json"),
    load<{ legends?: Record<string, string> }>("../data/media.json"),
  ]);
  registerMedia({ regenFaces: faces?.faces, legends: media?.legends });
}

/** O banco de dados (elencos reais + índice de mídia) só é carregado quando o usuário abre ou cria um jogo. */
export function loadDatabase(): Promise<Database> {
  dbPromise ??= Promise.all([import("../data/database.json"), loadMediaIndex()]).then(([m]) => m.default as unknown as Database);
  return dbPromise;
}

/** Abre um jogo salvo (ou importado), atualizando-o com as fotos/escudos do banco atual. */
export async function openWorld(w: World) {
  try {
    migrateWorld(w, await loadDatabase());
  } catch (e) {
    console.error(e);
  }
  setWorld(w);
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
  update((world) => {
    res = advance(world);
  });
  const r = res as ReturnType<typeof advance> | null;
  if (!r) return;
  if (r.reason === "match") push({ name: "prematch" });
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
  setWorld(w);
  autosave(true);
}

export function goToMatch(quick: boolean) {
  replace({ name: "match", quick });
}
