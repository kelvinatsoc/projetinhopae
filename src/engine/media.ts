// Mídia real empacotada com o jogo (fotos dos jogadores, rostos dos regens, fotos das lendas).
// O motor só guarda chaves curtas em Player.img; os arquivos ficam em public/media/.
// Os índices são registrados pela interface (ou pelos testes) com registerMedia().
import { rand } from "./rng";
import type { Player, Race, World } from "./types";

export type FaceAge = "teen" | "young" | "adult";
export type FaceSkin = "light" | "medium" | "dark" | "asian";
export interface RegenFace { id: number; age: FaceAge; skin: FaceSkin }

let faces: RegenFace[] = [];
let sportsdb: Record<string, string> = {};
let buckets = new Map<string, number[]>();
let legendImages: Record<string, string> = {};

export function registerMedia(m: { regenFaces?: RegenFace[]; legends?: Record<string, string>; sportsdb?: Record<string, string> }) {
  if (m.sportsdb) sportsdb = m.sportsdb;
  if (m.regenFaces) {
    faces = m.regenFaces;
    buckets = new Map();
    for (const f of faces) {
      for (const key of [`${f.age}|${f.skin}`, `*|${f.skin}`, `${f.age}|*`, "*|*"]) {
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(f.id);
      }
    }
  }
  if (m.legends) legendImages = m.legends;
}

export function hasRegenFaces(): boolean {
  return faces.length > 0;
}

export function legendImage(legendId: string): string | undefined {
  return legendImages[legendId];
}

const SKIN: Record<Race, FaceSkin> = { white: "light", brown: "medium", black: "dark", asian: "asian" };

// quantas vezes cada rosto já está em uso (calculado sob demanda para cada mundo)
const usage = new WeakMap<World, Map<number, number>>();

function usageOf(w: World): Map<number, number> {
  let u = usage.get(w);
  if (!u) {
    u = new Map();
    for (const p of Object.values(w.players)) {
      if (p.img?.startsWith("r")) {
        const id = Number(p.img.slice(1));
        u.set(id, (u.get(id) ?? 0) + 1);
      }
    }
    usage.set(w, u);
  }
  return u;
}

/** Dá um rosto realista (pessoa que não existe) a um jogador fictício: regen, base ou reforço gerado. */
export function assignRegenFace(w: World, p: Player) {
  if (!faces.length || p.real || p.legend || p.img) return;
  const ageY = w.season - p.born;
  const age: FaceAge = ageY <= 19 ? "teen" : ageY <= 27 ? "young" : "adult";
  const skin = SKIN[p.face.r] ?? "light";
  const pool =
    pickPool(`${age}|${skin}`) ??
    (age === "teen" ? pickPool(`young|${skin}`) : age === "adult" ? pickPool(`young|${skin}`) : undefined) ??
    pickPool(`*|${skin}`) ??
    pickPool(`${age}|*`) ??
    buckets.get("*|*")!;
  // entre alguns candidatos sorteados, usa o rosto menos repetido
  const u = usageOf(w);
  let best = pool[Math.floor(rand() * pool.length)];
  for (let i = 0; i < 4; i++) {
    const c = pool[Math.floor(rand() * pool.length)];
    if ((u.get(c) ?? 0) < (u.get(best) ?? 0)) best = c;
  }
  u.set(best, (u.get(best) ?? 0) + 1);
  p.img = `r${best}`;
}

function pickPool(key: string): number[] | undefined {
  const list = buckets.get(key);
  return list && list.length >= 6 ? list : undefined;
}

/** Foto do TheSportsDB (só URL; carregada da CDN em tempo de execução) por "nome|ano". */
export function sportsdbPath(name: string, born: number | undefined): string | undefined {
  return sportsdb[`${name}|${born}`];
}

/** URL da variante pequena (/small, ~40 KB) da foto do TheSportsDB. */
export function sportsdbUrl(p: Pick<Player, "ext">): string | null {
  return p.ext ? `https://r2.thesportsdb.com/images/media/player/${p.ext}/small` : null;
}

/** Caminho da foto empacotada do jogador dentro de media/ (ex.: "players/Q1.webp"), se houver. */
export function playerImagePath(p: Pick<Player, "img">): string | null {
  if (!p.img) return null;
  return p.img.startsWith("r") ? `regens/${p.img.slice(1)}.webp` : `players/${p.img}.webp`;
}

/** Caminho relativo (sem barra inicial) da foto empacotada do jogador, se houver. */
export function playerImageUrl(p: Pick<Player, "img">): string | null {
  const path = playerImagePath(p);
  return path && `media/${path}`;
}
