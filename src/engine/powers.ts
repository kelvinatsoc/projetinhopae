// Loja de Poderes (estilo Super Mario Strikers): o clube compra poderes com o próprio dinheiro e
// equipa em jogadores específicos, por uma temporada, com limite de vagas. Na partida, cada poder
// enche um medidor; cheio, o usuário ATIVA o poder e a jogada ganha um bônus moderado (chance de gol
// maior ou o goleiro fechando o gol por alguns minutos). Tudo determinístico: sem sorteio extra.
import { addExpense } from "./finance";
import type { Club, Player, World } from "./types";

export type PowerId = "trovao" | "velocidade" | "muralha" | "fantasma" | "teleguiado" | "fulminante";
export type PowerKind = "shot" | "speed" | "keeper" | "dribble" | "pass" | "header";

export interface PowerDef {
  id: PowerId;
  name: string;
  emoji: string;
  kind: PowerKind;
  desc: string;
  /** preço por temporada (R$) */
  price: number;
  /** quanto enche por minuto em campo (100 = cheio) */
  rate: number;
  /** multiplicador do xG da jogada (poderes de ataque) */
  xgMult: number;
  /** golpe visual (src/ui/specials.ts) disparado na ativação */
  special: string;
  /** só para goleiros */
  gk?: boolean;
}

export const POWERS: PowerDef[] = [
  { id: "trovao", name: "Chute Trovão", emoji: "⚡", kind: "shot", price: 6_000_000, rate: 5, xgMult: 1.8, special: "trovao",
    desc: "Finalização que rasga a rede: a próxima jogada termina num chute muito mais perigoso." },
  { id: "velocidade", name: "Super Velocidade", emoji: "💨", kind: "speed", price: 4_000_000, rate: 6, xgMult: 1.5, special: "trivela",
    desc: "Arrancada que deixa a defesa para trás e termina em finalização." },
  { id: "muralha", name: "Muralha", emoji: "🧱", kind: "keeper", price: 5_000_000, rate: 5, xgMult: 1, special: "muralha", gk: true,
    desc: "O goleiro fecha o gol por 10 minutos: os chutes do adversário entram bem menos." },
  { id: "fantasma", name: "Drible Fantasma", emoji: "👻", kind: "dribble", price: 4_500_000, rate: 6, xgMult: 1.55, special: "cavadinha",
    desc: "Some na frente do marcador e sai cara a cara com o goleiro." },
  { id: "teleguiado", name: "Passe Teleguiado", emoji: "🎯", kind: "pass", price: 3_500_000, rate: 7, xgMult: 1.45, special: "folha-seca",
    desc: "Lançamento perfeito para o companheiro finalizar na frente do gol." },
  { id: "fulminante", name: "Cabeçada Fulminante", emoji: "🚀", kind: "header", price: 4_000_000, rate: 6, xgMult: 1.7, special: "cabecada",
    desc: "Sobe mais que todo mundo e testa com força no cantinho." },
];

const BY_ID = new Map(POWERS.map((p) => [p.id, p]));
export const powerDef = (id: string): PowerDef | undefined => BY_ID.get(id as PowerId);

/** Vagas de poder por temporada. */
export const POWER_SLOTS = 3;

export interface OwnedPower { id: PowerId; pid: number; season: number }

/** Poderes válidos agora (desta temporada, com o jogador ainda no clube). */
export function activePowers(w: World, club: Club): OwnedPower[] {
  return (club.powers ?? []).filter((o): o is OwnedPower => o.season === w.season && !!powerDef(o.id) && club.players.includes(o.pid)) as OwnedPower[];
}

/** O jogador pode receber esse poder? (Muralha só goleiro; os outros, só de linha) */
export function canEquip(p: Player | undefined, def: PowerDef): boolean {
  if (!p) return false;
  return def.gk ? p.pos === "GOL" : p.pos !== "GOL";
}

export function buyPower(w: World, club: Club, id: PowerId, pid: number): { ok: boolean; msg: string } {
  const def = powerDef(id);
  const p = w.players[pid];
  if (!def) return { ok: false, msg: "Poder desconhecido." };
  if (!club.players.includes(pid) || !canEquip(p, def)) return { ok: false, msg: def.gk ? "A Muralha é só para goleiros." : "Esse poder é para jogadores de linha." };
  const act = activePowers(w, club);
  if (act.length >= POWER_SLOTS) return { ok: false, msg: `Limite de ${POWER_SLOTS} poderes por temporada.` };
  if (act.some((o) => o.pid === pid)) return { ok: false, msg: `${p.name} já tem um poder.` };
  if (club.balance < def.price) return { ok: false, msg: "Dinheiro insuficiente." };
  addExpense(club, "powers", def.price);
  club.powers = [...act, { id, pid, season: w.season }];
  return { ok: true, msg: `${def.name} equipado em ${p.name} até o fim da temporada.` };
}

/** Tira o poder (sem reembolso). */
export function removePower(w: World, club: Club, pid: number) {
  club.powers = activePowers(w, club).filter((o) => o.pid !== pid);
}

function hash(...xs: (number | string)[]): number {
  let h = 2166136261;
  for (const x of xs) for (const ch of String(x)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Poderes da IA (com moderação): só quando o usuário também tem poderes, um poder no melhor
 * atacante dos clubes fortes (ou a Muralha no goleiro). Determinístico.
 */
export function aiPowers(w: World, club: Club, userHasPowers: boolean): OwnedPower[] {
  if (!userHasPowers || club.rep < 60) return [];
  const squad = club.players.map((id) => w.players[id]).filter((p): p is Player => !!p && p.injury <= 0);
  const h = hash(club.id, w.season) % 3;
  if (h === 0) {
    const gk = squad.filter((p) => p.pos === "GOL").sort((a, b) => b.ovr - a.ovr)[0];
    return gk ? [{ id: "muralha", pid: gk.id, season: w.season }] : [];
  }
  const att = squad.filter((p) => p.pos !== "GOL").sort((a, b) => b.attrs.fin - a.attrs.fin)[0];
  return att ? [{ id: h === 1 ? "trovao" : "fulminante", pid: att.id, season: w.season }] : [];
}
