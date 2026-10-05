// Salvamento no IndexedDB do navegador (funciona offline no celular).
import type { World } from "./engine/types";

const DB_NAME = "lendas-da-base";
const STORE = "saves";

export interface SaveMeta {
  id: string;
  savedAt: number;
  manager: string;
  clubId: string;
  clubName: string;
  season: number;
  day: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export function metaOf(w: World): SaveMeta {
  const c = w.clubs[w.userClubId];
  return { id: w.saveId, savedAt: Date.now(), manager: w.managerName, clubId: c.id, clubName: c.name, season: w.season, day: w.day };
}

export async function saveWorld(w: World): Promise<void> {
  await tx(STORE, "readwrite", (s) => s.put({ id: w.saveId, world: w }));
  await tx("meta", "readwrite", (s) => s.put(metaOf(w)));
  try {
    localStorage.setItem("lastSave", w.saveId);
  } catch {
    /* modo privado */
  }
}

export async function loadWorld(id: string): Promise<World | null> {
  const rec = await tx<{ id: string; world: World } | undefined>(STORE, "readonly", (s) => s.get(id));
  return rec?.world ?? null;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<SaveMeta[]>("meta", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(id: string): Promise<void> {
  await tx(STORE, "readwrite", (s) => s.delete(id));
  await tx("meta", "readwrite", (s) => s.delete(id));
}

export function lastSaveId(): string | null {
  try {
    return localStorage.getItem("lastSave");
  } catch {
    return null;
  }
}

/** Baixa o jogo salvo como arquivo .json (backup). */
export function exportWorld(w: World) {
  const blob = new Blob([JSON.stringify(w)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const c = w.clubs[w.userClubId];
  a.download = `lendas-da-base-${c.abbr.toLowerCase()}-${w.season}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importWorldFile(file: File): Promise<World> {
  const text = await file.text();
  const w = JSON.parse(text) as World;
  if (!w || !w.clubs || !w.players || !w.userClubId) throw new Error("Arquivo inválido");
  return w;
}
