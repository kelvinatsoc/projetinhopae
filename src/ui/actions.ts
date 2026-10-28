import { whenIdle } from "./perf";
import type { WorldData } from "../data/worldTypes";
// Ações de alto nível disparadas pela interface.
import { migrateWorld, type Database } from "../engine/world";
import { advance, runEndOfSeason } from "../engine/game";
import { registerMedia, type RegenFace } from "../engine/media";
import { clearAdminUndo, markAdmin } from "../engine/admin";
import { autoLineup } from "../engine/lineup";
import { PROFILE, recalcOvr } from "../engine/positions";
import type { Attrs, Pos, World } from "../engine/types";
import { loadSnapshot, saveSnapshot, saveWorld } from "../save";
import { getNav, getWorld, push, replace, resetNav, setWorld, toast, update } from "../store";

/** Calibração oficial do elenco 2026 do São Paulo FC aplicada ao iniciar/abrir carreira na interface. */
export const SPFC_REAL_2026: Record<string, { ovr: number; pot: number; pos: Pos; secs?: Pos[]; num?: number }> = {
  "Lucas Moura": { ovr: 80, pot: 80, pos: "PD", secs: ["MEI", "PE", "ATA"], num: 7 },
  "Jonathan Calleri": { ovr: 79, pot: 79, pos: "ATA", num: 9 },
  "Rafael": { ovr: 78, pot: 78, pos: "GOL", num: 23 },
  "Robert Arboleda": { ovr: 78, pot: 78, pos: "ZAG", num: 5 },
  "Luciano": { ovr: 77, pot: 78, pos: "MEI", secs: ["ATA", "PD", "MC"], num: 10 },
  "Pablo Maia": { ovr: 77, pot: 82, pos: "VOL", secs: ["MC"], num: 29 },
  "Ferreira": { ovr: 76, pot: 77, pos: "PE", secs: ["ATA", "PD"], num: 11 },
  "Wendell": { ovr: 76, pot: 76, pos: "LE", num: 18 },
  "Sabino": { ovr: 76, pot: 76, pos: "ZAG", num: 35 },
  "Marcos Antônio": { ovr: 76, pot: 79, pos: "VOL", secs: ["MC"], num: 8 },
  "Cédric Soares": { ovr: 76, pot: 76, pos: "LD", num: 21 },
  "Damián Bobadilla": { ovr: 75, pot: 79, pos: "MC", secs: ["VOL"], num: 16 },
  "Rafael Tolói": { ovr: 75, pot: 75, pos: "ZAG", num: 2 },
  "Carlos Coronel": { ovr: 74, pot: 75, pos: "GOL", num: 31 },
  "Domingos Duarte": { ovr: 74, pot: 75, pos: "ZAG", num: 22 },
  "Aurélio Buta": { ovr: 74, pot: 75, pos: "LD", num: 20 },
  "Iago Borduchi": { ovr: 74, pot: 76, pos: "LE", num: 12 },
  "Enzo Díaz": { ovr: 74, pot: 75, pos: "LE", num: 13 },
  "André Silva": { ovr: 74, pot: 75, pos: "ATA", secs: ["PE", "PD"], num: 17 },
  "Cauly": { ovr: 74, pot: 75, pos: "MEI", secs: ["MC", "PD"], num: 80 },
  "Danielzinho": { ovr: 73, pot: 73, pos: "MC", secs: ["VOL"], num: 14 },
  "Newton": { ovr: 73, pot: 76, pos: "VOL", secs: ["ZAG"], num: 28 },
  "Pedro Lima": { ovr: 73, pot: 83, pos: "LD", num: 32 },
  "Ryan Francisco": { ovr: 72, pot: 86, pos: "ATA", secs: ["PE", "PD"], num: 49 },
  "Lucca Marques": { ovr: 69, pot: 85, pos: "PE", secs: ["PD", "ATA"], num: 45 },
  "Igão": { ovr: 66, pot: 82, pos: "ZAG", num: 44 },
};

export function applySpfcRealRoster(w: World) {
  const spfc = w.clubs["sao-paulo"];
  if (!spfc) return;
  spfc.stadium = "MorumBIS";
  spfc.capacity = 66795;
  for (const pid of spfc.players) {
    const p = w.players[pid];
    if (!p) continue;
    const spec = SPFC_REAL_2026[p.name];
    if (!spec) continue;
    const prof = PROFILE[spec.pos];
    p.pos = spec.pos;
    if (spec.secs) p.sec = spec.secs;
    if (spec.num) p.shirt = spec.num;
    p.pot = Math.max(p.pot, spec.pot);
    for (const k of Object.keys(p.attrs) as (keyof Attrs)[]) {
      p.attrs[k] = Math.max(25, Math.min(95, spec.ovr + prof[k]));
    }
    recalcOvr(p);
    const diff = spec.ovr - p.ovr;
    if (diff !== 0) {
      for (const k of Object.keys(p.attrs) as (keyof Attrs)[]) {
        p.attrs[k] = Math.max(25, Math.min(95, p.attrs[k] + diff));
      }
      p.ovr = spec.ovr;
    }
  }
  if (w.day <= 2 && w.season === 2026) {
    spfc.tactic.formation = "4-2-3-1";
    spfc.lineup = autoLineup(w, spfc, undefined, spfc.tactic.formation, false);
    if (w.inbox?.msgs) {
      w.inbox.msgs = w.inbox.msgs.filter((m) => !String(m.id).startsWith("seed-tact-"));
    }
  }
}

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

// world.json (ligas estrangeiras e seleções) é opcional: sem ele o jogo é só Brasil/América do Sul
const worldFiles = import.meta.glob("../data/world.json");
let worldPromise: Promise<WorldData | undefined> | undefined;
/** Dados do mundo (chunk separado, carregado sob demanda); undefined se o arquivo não existir. */
export function loadWorldFile(): Promise<WorldData | undefined> {
  const f = worldFiles["../data/world.json"];
  worldPromise ??= f ? f().then((m) => (m as { default: WorldData }).default).catch(() => undefined) : Promise.resolve(undefined);
  return worldPromise;
}

/** Abre um jogo salvo (ou importado), atualizando-o com as fotos/escudos do banco atual. */
export async function openWorld(w: World) {
  let info: ReturnType<typeof migrateWorld> | null = null;
  try {
    info = migrateWorld(w, await loadDatabase(), await loadWorldFile());
  } catch (e) {
    console.error(e);
  }
  clearAdminUndo();
  applySpfcRealRoster(w);
  setWorld(w);
  if (info?.newer) toast("Este save é de uma versão mais nova do jogo — atualize o app.");
  else if (info && info.repaired > 0) toast(`Save verificado: ${info.repaired} problema${info.repaired > 1 ? "s" : ""} corrigido${info.repaired > 1 ? "s" : ""}`);
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
  // Durante a partida ao vivo, adia o autosave em segundo plano para não roubar quadros (19 FPS) da animação
  const inMatch = getNav().stack.some((r) => r.name === "match");
  if (inMatch && !immediate) return;
  window.clearTimeout(saveTimer);
  const run = async () => {
    if (saving) return;
    saving = true;
    try {
      await saveWorld(w);
    } catch (e) {
      console.error(e);
    } finally {
      saving = false;
    }
  };
  if (immediate) void run();
  else saveTimer = window.setTimeout(() => whenIdle(() => void run()), 400);
}

export async function saveNow() {
  const w = getWorld();
  if (!w) return;
  await saveWorld(w);
  toast("Jogo salvo");
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
  const days = (getWorld()?.day ?? day0) - day0;
  if (days > 1) toast(`⏩ ${days} dias simulados${r.reason === "match" ? " · dia de jogo!" : ""}`);
  if (r.reason === "match") {
    if (w.admin?.on && r.fixture) {
      const opp = w.clubs[r.fixture.home === w.userClubId ? r.fixture.away : r.fixture.home]?.name ?? "?";
      saveSnapshot(w, opp).catch((e) => console.error(e));
    }
    push({ name: "prematch" });
  }
  else if (r.reason === "ntMatch" && r.fixture) push({ name: "ntmatch", id: r.fixture.id });
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
  applySpfcRealRoster(w);
  setWorld(w);
  autosave(true);
}

export function goToMatch(quick: boolean) {
  replace({ name: "match", quick });
}
