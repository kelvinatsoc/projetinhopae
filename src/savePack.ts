// Serialização compacta do save: jogadores em colunas (uma lista por campo, sem repetir as chaves) e o
// resultado em JSON comprimido com gzip (CompressionStream) quando o WebView suporta; senão, JSON puro.
// O formato antigo (o objeto World guardado direto no IndexedDB) continua sendo lido.
import type { Player, World } from "./engine/types";

export const PACK_VERSION = 1;
const MISSING = "\u0000"; // campo ausente neste jogador (diferente de null, que é um valor válido, ex.: clubId)

export interface PackedPlayers { keys: string[]; cols: unknown[][]; n: number }
export interface PackedWorld { v: number; world: Omit<World, "players">; players: PackedPlayers }

/** Jogadores em colunas. A ordem dos ids é preservada. */
export function packPlayers(players: Record<number, Player>): PackedPlayers {
  const list = Object.values(players);
  const keySet = new Set<string>();
  for (const p of list) for (const k of Object.keys(p)) if ((p as unknown as Record<string, unknown>)[k] !== undefined) keySet.add(k);
  const keys = [...keySet];
  const cols = keys.map((k) => list.map((p) => {
    const v = (p as unknown as Record<string, unknown>)[k];
    return v === undefined ? MISSING : v;
  }));
  return { keys, cols, n: list.length };
}

export function unpackPlayers(pk: PackedPlayers): Record<number, Player> {
  const out: Record<number, Player> = {};
  const idCol = pk.cols[pk.keys.indexOf("id")];
  for (let i = 0; i < pk.n; i++) {
    const p: Record<string, unknown> = {};
    for (let k = 0; k < pk.keys.length; k++) {
      const v = pk.cols[k][i];
      if (v !== MISSING) p[pk.keys[k]] = v;
    }
    out[idCol[i] as number] = p as unknown as Player;
  }
  return out;
}

export function packWorld(w: World): PackedWorld {
  const { players, ...rest } = w;
  return { v: PACK_VERSION, world: rest, players: packPlayers(players) };
}

export function unpackWorld(pw: PackedWorld): World {
  return { ...(pw.world as World), players: unpackPlayers(pw.players) };
}

const hasGzip = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array): Promise<string> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Registro gravado no IndexedDB: gzip (bytes) ou JSON em colunas (texto). */
export type StoredWorld = { fmt: "gz1"; data: Uint8Array } | { fmt: "col1"; data: string };

export async function encodeWorld(w: World, allowGzip = true): Promise<StoredWorld> {
  const json = JSON.stringify(packWorld(w));
  if (allowGzip && hasGzip()) {
    try { return { fmt: "gz1", data: await gzip(json) }; } catch { /* sem gzip: texto */ }
  }
  return { fmt: "col1", data: json };
}

export async function decodeWorld(s: StoredWorld): Promise<World> {
  const json = s.fmt === "gz1" ? await gunzip(s.data) : s.data;
  return unpackWorld(JSON.parse(json) as PackedWorld);
}

/** Lê um registro do IndexedDB em qualquer formato (antigo: { world }; novo: { fmt, data }). */
export async function readRecord(rec: { world?: World; fmt?: string; data?: unknown } | undefined): Promise<World | null> {
  if (!rec) return null;
  if (rec.world) return rec.world;
  if (rec.fmt === "gz1" || rec.fmt === "col1") return decodeWorld(rec as StoredWorld);
  return null;
}
