// Sistema de Modding e Banco de Dados Personalizado em JSON (Estilo Openfoot Manager)
// Permite que a comunidade crie e instale patches de clubes, jogadores e ligas.
import { addNews } from "./news";
import { makeAttrs, newPlayerBase } from "./player";
import { POSITIONS } from "./positions";
import type { Attrs, Club, Pos, World } from "./types";

export interface ModClub {
  id: string;
  name: string;
  abbr: string;
  colors: string[];
  level?: number;
  stadium?: string;
  stadiumCapacity?: number;
  div?: "A" | "B" | "C" | "D";
}

export interface ModPlayer {
  id?: number;
  name: string;
  clubId?: string;
  pos: Pos;
  age?: number;
  ovr?: number;
  pot?: number;
  foot?: "D" | "E" | "A";
  attrs?: Partial<Attrs>;
}

export interface ModPackage {
  meta: {
    name: string;
    author?: string;
    version?: string;
    description?: string;
  };
  clubs?: ModClub[];
  players?: ModPlayer[];
}

export function parseModPackage(jsonString: string): { ok: boolean; mod?: ModPackage; error?: string; summary?: string } {
  try {
    const clean = jsonString.replace(/^\uFEFF/, "").trim();
    const data = JSON.parse(clean) as ModPackage;
    if (!data || typeof data !== "object") return { ok: false, error: "Arquivo JSON inválido ou vazio." };
    if (!data.meta?.name) return { ok: false, error: "O patch precisa conter 'meta.name' com o nome do mod." };

    const clubsCount = Array.isArray(data.clubs) ? data.clubs.length : 0;
    const playersCount = Array.isArray(data.players) ? data.players.length : 0;

    if (clubsCount === 0 && playersCount === 0) {
      return { ok: false, error: "O patch não contém nenhum clube ou jogador válido para importar." };
    }

    const summary = `${data.meta.name} (por ${data.meta.author ?? "Comunidade"}): ${clubsCount} clube(s) e ${playersCount} jogador(es).`;
    return { ok: true, mod: data, summary };
  } catch (err) {
    return { ok: false, error: `Erro ao interpretar JSON: ${String((err as Error)?.message ?? err)}` };
  }
}

export function applyModToWorld(w: World, mod: ModPackage): { clubsAdded: number; clubsUpdated: number; playersAdded: number } {
  let clubsAdded = 0;
  let clubsUpdated = 0;
  let playersAdded = 0;

  // 1. Processar Clubes
  if (Array.isArray(mod.clubs)) {
    for (const mc of mod.clubs) {
      if (!mc.id || !mc.name || !mc.abbr) continue;
      const cid = mc.id.trim();
      const existing = w.clubs[cid];
      const col: [string, string, string] = Array.isArray(mc.colors) && mc.colors.length >= 2
        ? [mc.colors[0], mc.colors[1], mc.colors[2] ?? "#ffffff"]
        : ["#e4002b", "#ffffff", "#000000"];

      if (existing) {
        existing.name = mc.name;
        existing.abbr = mc.abbr.substring(0, 4).toUpperCase();
        if (Array.isArray(mc.colors) && mc.colors.length >= 2) existing.colors = col;
        if (mc.stadium) existing.stadium = mc.stadium;
        if (mc.stadiumCapacity) existing.capacity = mc.stadiumCapacity;
        if (mc.level) existing.level = mc.level;
        clubsUpdated++;
      } else {
        const newClub: Club = {
          id: cid,
          name: mc.name,
          full: mc.name,
          abbr: mc.abbr.substring(0, 4).toUpperCase(),
          region: "SP",
          city: "São Paulo",
          country: "BRA",
          colors: col,
          crest: "vstripes",
          div: mc.div ?? "B",
          level: mc.level ?? 68,
          rep: 65,
          stadium: mc.stadium ?? `Arena ${mc.name}`,
          capacity: mc.stadiumCapacity ?? 22000,
          balance: 15_000_000,
          players: [],
          tactic: { formation: "4-3-3", mentality: 0, pressing: 1 },
          youthLevel: 3,
          youthFac: 3,
          youthCoach: 3,
          facilities: 3,
          ticket: 30,
          finance: { income: {}, expense: {} },
          jersey: "classic",
          history: [],
          trophies: [],
        };
        w.clubs[cid] = newClub;
        clubsAdded++;
      }
    }
  }

  // 2. Processar Jogadores
  if (Array.isArray(mod.players)) {
    for (const mp of mod.players) {
      if (!mp.name || !mp.pos) continue;
      const pos: Pos = (POSITIONS as readonly string[]).includes(mp.pos) ? mp.pos : "ATA";
      const ovr = Math.max(40, Math.min(99, mp.ovr ?? 68));
      const pot = Math.max(ovr, Math.min(99, mp.pot ?? ovr + 4));
      const playerAge = Math.max(15, Math.min(42, mp.age ?? 22));
      const born = w.season - playerAge;

      const attrs = makeAttrs(pos, ovr, { base: mp.attrs });
      const targetClubId = mp.clubId && w.clubs[mp.clubId] ? mp.clubId : undefined;

      const newPlayer = newPlayerBase(w, {
        name: mp.name,
        nat: "BRA",
        born,
        pos,
        foot: mp.foot ?? (pos === "LE" || pos === "PE" ? "E" : "D"),
        attrs,
        pot,
        clubId: targetClubId ?? null,
        youth: playerAge <= 19,
      });

      w.players[newPlayer.id] = newPlayer;
      if (targetClubId && w.clubs[targetClubId]) {
        w.clubs[targetClubId].players.push(newPlayer.id);
      }
      playersAdded++;
    }
  }

  // Registrar notícia no jogo
  addNews(
    w,
    "board",
    `Patch Comunitário Instalado: ${mod.meta.name}`,
    `O patch oficial da comunidade "${mod.meta.name}" (versão ${mod.meta.version ?? "1.0"}) foi integrado com sucesso! Foram adicionados/atualizados ${clubsAdded + clubsUpdated} clubes e ${playersAdded} atletas.`
  );

  return { clubsAdded, clubsUpdated, playersAdded };
}

export function getModTemplateJson(): string {
  const example: ModPackage = {
    meta: {
      name: "Super Copa Paulista & Amigos",
      author: "Comunidade Lendas da Base",
      version: "1.0.0",
      description: "Exemplo de patch com novos clubes e jogadores personalizados.",
    },
    clubs: [
      {
        id: "juventus_sp",
        name: "Juventus da Mooca",
        abbr: "JUV",
        colors: ["#7a161b", "#ffffff"],
        level: 70,
        stadium: "Rua Javari",
        stadiumCapacity: 8000,
        div: "B",
      },
    ],
    players: [
      {
        name: "Lucas Moleque Travesso",
        clubId: "juventus_sp",
        pos: "ATA",
        age: 18,
        ovr: 72,
        pot: 86,
        foot: "D",
        attrs: { vel: 78, fin: 74, pas: 68, dri: 76, def: 35, fis: 70, gol: 15 },
      },
      {
        name: "Matheus Armador Clássico",
        clubId: "juventus_sp",
        pos: "MEI",
        age: 23,
        ovr: 73,
        pot: 78,
        foot: "E",
        attrs: { vel: 68, fin: 66, pas: 80, dri: 75, def: 50, fis: 67, gol: 15 },
      },
    ],
  };
  return JSON.stringify(example, null, 2);
}