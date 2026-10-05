// Salvamento no IndexedDB do navegador (funciona offline no celular).
import { Capacitor } from "@capacitor/core";
import type { World } from "./engine/types";
import { toast } from "./store";

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

function exportFileName(w: World): string {
  const c = w.clubs[w.userClubId];
  return `lendas-da-base-${c.abbr.toLowerCase()}-${w.season}.json`;
}

/**
 * Exporta o jogo salvo como arquivo .json (backup).
 * No app Android grava o arquivo no cache do app e abre o menu "Compartilhar"
 * (Drive, WhatsApp, e-mail...); no navegador baixa o arquivo.
 */
export async function exportWorld(w: World): Promise<void> {
  const name = exportFileName(w);
  const json = JSON.stringify(w);
  if (Capacitor.isNativePlatform()) {
    try {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
        import("@capacitor/filesystem"),
        import("@capacitor/share"),
      ]);
      const { uri } = await Filesystem.writeFile({ path: `backup/${name}`, data: json, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
      await Share.share({ title: name, files: [uri], dialogTitle: "Guardar o backup do jogo" });
    } catch (e) {
      // fechar o menu sem escolher nada também cai aqui: não é erro
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) {
        console.error(e);
        toast("Não foi possível exportar o save.");
      }
    }
    return;
  }
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Lê um backup .json (no app Android o arquivo vem do seletor de arquivos do sistema). */
export async function importWorldFile(file: File): Promise<World> {
  // alguns apps (WhatsApp, editores) gravam o arquivo com BOM no começo
  const text = (await file.text()).replace(/^\uFEFF/, "");
  const w = JSON.parse(text) as World;
  if (!w || !w.clubs || !w.players || !w.userClubId) throw new Error("Arquivo inválido");
  return w;
}
