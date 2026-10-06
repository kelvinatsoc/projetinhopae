// Tática a fundo: instruções do time, funções por posição, familiaridade com o sistema e modelos prontos.
// Módulo puro (sem sorteio): o motor (match.ts) e o auxiliar leem os mesmos números.
// Tudo é centrado no neutro: instruções padrão, sem funções e familiaridade 70 = multiplicadores 1.
// Os efeitos são trocas (ganha de um lado, perde de outro) e pequenos, para não quebrar a calibragem.
import { POS_GROUP, ovrAt } from "./positions";
import { clamp } from "./rng";
import type { Attrs, Club, Player, Pos, Tactic, TeamInstr, World } from "./types";

// ---------------------------------------------------------------- instruções do time
export const DEFAULT_TI: Readonly<TeamInstr> = Object.freeze({ line: 1, width: 1, tempo: 1, direct: 1, cpress: false, waste: false });
export const tiOf = (t: Tactic): TeamInstr => ({ ...DEFAULT_TI, ...(t.ti ?? {}) });

export const TI_INFO: Record<"line" | "width" | "tempo" | "direct", { label: string; opts: [string, string, string]; hint: string }> = {
  line: { label: "Linha defensiva", opts: ["Recuada", "Normal", "Adiantada"], hint: "Adiantada rouba bolas no meio, mas deixa espaço nas costas." },
  width: { label: "Largura", opts: ["Fechado", "Normal", "Aberto"], hint: "Aberto cria mais jogadas pelos lados; fechado congestiona o meio." },
  tempo: { label: "Ritmo", opts: ["Cadenciado", "Normal", "Acelerado"], hint: "Acelerado gera mais lances (para os dois lados) e cansa mais." },
  direct: { label: "Passes", opts: ["Curtos", "Mistos", "Diretos"], hint: "Curtos seguram a posse; diretos pulam o meio-campo." },
};

/** Efeito tático de um time em campo (multiplicadores). */
export interface TacticFx {
  att: number;
  mid: number;
  def: number;
  open: number; // volume de chances do próprio ataque
  openAgainst: number; // volume de chances que o adversário ganha (jogo mais aberto)
  xg: number; // qualidade das próprias finalizações
  xgAgainst: number; // qualidade das finalizações sofridas
  fatigue: number;
  card: number;
}
export const NEUTRAL_FX: Readonly<TacticFx> = Object.freeze({ att: 1, mid: 1, def: 1, open: 1, openAgainst: 1, xg: 1, xgAgainst: 1, fatigue: 1, card: 1 });

const avgAttr = (ps: Player[], k: keyof Attrs, dflt = 70) => (ps.length ? ps.reduce((s, p) => s + p.attrs[k], 0) / ps.length : dflt);

/**
 * Multiplicadores das instruções do time. ids/slots: os 11 em campo (para medir quem executa o plano).
 * lead/minute: o "fazer cera" só vale vencendo na reta final.
 */
export function instructionFx(w: World, t: Tactic, slots: Pos[], ids: (number | null)[], lead = 0, minute = 0): TacticFx {
  const ti = tiOf(t);
  const fx: TacticFx = { ...NEUTRAL_FX };
  const ps: Player[] = [];
  const defs: Player[] = [];
  ids.forEach((id, k) => {
    if (id == null) return;
    const p = w.players[id];
    if (!p || slots[k] === "GOL") return;
    ps.push(p);
    if (POS_GROUP[slots[k]] === "DEF") defs.push(p);
  });
  // quem executa: pressão depende de fôlego e velocidade; toque curto depende do passe; linha alta, da velocidade dos zagueiros
  const engine = clamp((avgAttr(ps, "fis") + avgAttr(ps, "vel")) / 140, 0.85, 1.15);
  const passing = clamp(avgAttr(ps, "pas") / 70, 0.85, 1.15);
  const recovery = clamp(avgAttr(defs, "vel") / 70, 0.8, 1.2);
  const lv = (v: number) => v - 1; // -1, 0, +1
  // linha defensiva
  const L = lv(ti.line);
  if (L > 0) { fx.mid *= 1 + 0.01 * engine; fx.def *= 1 - 0.015 / recovery; fx.xgAgainst *= 1 + 0.03 / recovery; }
  else if (L < 0) { fx.mid *= 0.99; fx.att *= 0.99; fx.def *= 1.012; fx.xgAgainst *= 0.98; }
  // largura
  const W = lv(ti.width);
  if (W > 0) { fx.att *= 1.01; fx.open *= 1.02; fx.def *= 0.99; fx.openAgainst *= 1.01; }
  else if (W < 0) { fx.mid *= 1.005; fx.att *= 0.99; fx.open *= 0.98; fx.openAgainst *= 0.99; }
  // ritmo
  const T = lv(ti.tempo);
  if (T > 0) { fx.open *= 1.04; fx.openAgainst *= 1.04; fx.fatigue *= 1.06; fx.xg *= 0.98; }
  else if (T < 0) { fx.open *= 0.96; fx.openAgainst *= 0.96; fx.fatigue *= 0.95; fx.xg *= 1.02; }
  // passes
  const D = lv(ti.direct);
  if (D > 0) { fx.mid *= 0.98; fx.att *= 1.015; fx.xg *= 0.98; fx.open *= 1.03; }
  else if (D < 0) { fx.mid *= 1 + 0.015 * passing; fx.att *= 0.99; fx.open *= 0.97; fx.xg *= 1 + 0.03 * (passing - 0.85); }
  // contrapressão
  if (ti.cpress) { fx.mid *= 1 + 0.015 * engine; fx.def *= 0.995; fx.fatigue *= 1.08; fx.xgAgainst *= 1.04; }
  // cera: só vencendo depois dos 70'
  if (ti.waste && lead > 0 && minute >= 70) { fx.open *= 0.88; fx.openAgainst *= 0.88; fx.card *= 1.2; }
  return fx;
}

// ---------------------------------------------------------------- funções por posição
export type RoleId =
  | "gk" | "lib" | "zag" | "cons" | "lat_ap" | "lat_def" | "destr" | "reg" | "box" | "arm" | "mat" | "ponta" | "inv" | "piv" | "fin";

export interface RoleDef {
  id: RoleId;
  label: string;
  short: string;
  pos: Pos[];
  attrs: Partial<Record<keyof Attrs, number>>; // pesos para a aptidão
  d: number; m: number; a: number; // ajuste nos pesos de setor do motor
  shoot: number; assist: number; header: number; fatigue: number;
  desc: string;
}

const R = (id: RoleId, label: string, short: string, pos: Pos[], attrs: RoleDef["attrs"], fx: Partial<Pick<RoleDef, "d" | "m" | "a" | "shoot" | "assist" | "header" | "fatigue">>, desc: string): RoleDef =>
  ({ id, label, short, pos, attrs, d: 0, m: 0, a: 0, shoot: 1, assist: 1, header: 1, fatigue: 1, ...fx, desc });

export const ROLES: Record<RoleId, RoleDef> = {
  gk: R("gk", "Goleiro clássico", "GOL", ["GOL"], { gol: 3, fis: 1 }, {}, "Fica na área e foca em defender."),
  lib: R("lib", "Goleiro líbero", "LÍB", ["GOL"], { gol: 2, pas: 1, vel: 1 }, { m: 0.06 }, "Sai jogando com os pés e cobre a linha alta."),
  zag: R("zag", "Zagueiro de marcação", "ZAG", ["ZAG"], { def: 2, fis: 1.5 }, { d: 0.08, m: -0.03, header: 1.15 }, "Prioriza desarmes e bola aérea."),
  cons: R("cons", "Zagueiro construtor", "CON", ["ZAG"], { def: 1.5, pas: 1.5 }, { d: -0.04, m: 0.1 }, "Inicia as jogadas com passes verticais."),
  lat_ap: R("lat_ap", "Lateral apoiador", "APO", ["LD", "LE"], { vel: 1.5, pas: 1, dri: 1 }, { d: -0.15, a: 0.15, assist: 1.25, fatigue: 1.08 }, "Vai ao fundo e cruza; deixa espaço atrás."),
  lat_def: R("lat_def", "Lateral defensivo", "LDF", ["LD", "LE"], { def: 2, fis: 1 }, { d: 0.12, a: -0.1, assist: 0.8 }, "Fecha o corredor e quase não sobe."),
  destr: R("destr", "Volante destruidor", "DES", ["VOL", "MC"], { def: 2, fis: 1.5 }, { d: 0.15, m: -0.08, a: -0.03 }, "Morde, desarma e protege a zaga."),
  reg: R("reg", "Volante regista", "REG", ["VOL"], { pas: 2, def: 1 }, { d: -0.06, m: 0.12, assist: 1.2 }, "Organiza de trás com passes longos."),
  box: R("box", "Meia box-to-box", "BOX", ["MC", "VOL"], { fis: 1.5, pas: 1, def: 1 }, { d: 0.06, a: 0.06, shoot: 1.1, fatigue: 1.1 }, "Chega à área e volta para marcar."),
  arm: R("arm", "Meia armador", "ARM", ["MC", "MEI"], { pas: 2, dri: 1 }, { m: 0.1, a: 0.02, assist: 1.35, shoot: 0.9 }, "O cérebro: dita o ritmo e dá o último passe."),
  mat: R("mat", "Meia atacante", "MAT", ["MEI"], { fin: 1.5, dri: 1.5 }, { m: -0.08, a: 0.15, shoot: 1.3, assist: 0.9 }, "Joga perto do centroavante e finaliza muito."),
  ponta: R("ponta", "Ponta aberto", "PNT", ["PD", "PE"], { vel: 2, dri: 1 }, { a: 0.04, assist: 1.25, shoot: 0.9 }, "Abre o campo e cruza da linha de fundo."),
  inv: R("inv", "Ponta invertido", "INV", ["PD", "PE"], { fin: 1.5, dri: 1.5 }, { m: 0.04, shoot: 1.3, assist: 0.85 }, "Corta para dentro e chuta com a perna boa."),
  piv: R("piv", "Centroavante pivô", "PIV", ["ATA"], { fis: 2, pas: 1 }, { m: 0.06, shoot: 0.85, assist: 1.35, header: 1.3 }, "Segura a bola de costas e prepara para os meias."),
  fin: R("fin", "Finalizador", "FIN", ["ATA"], { fin: 2, vel: 1 }, { m: -0.04, shoot: 1.25, assist: 0.8 }, "Vive na área: só pensa em fazer o gol."),
};
export const ROLE_IDS = Object.keys(ROLES) as RoleId[];
export const rolesFor = (pos: Pos): RoleDef[] => ROLE_IDS.map((r) => ROLES[r]).filter((r) => r.pos.includes(pos));
/** Função efetiva do slot (null = padrão da posição, sem ajustes). */
export function roleAt(t: Tactic, k: number, pos: Pos): RoleDef | null {
  const id = t.roles?.[k];
  if (!id) return null;
  const r = ROLES[id as RoleId];
  return r && r.pos.includes(pos) ? r : null;
}

/** Aptidão (1–5 estrelas, meias estrelas) de um jogador para uma função. */
export function roleStars(p: Player, role: RoleDef, pos: Pos = role.pos[0]): number {
  let s = 0, wsum = 0;
  for (const [k, wt] of Object.entries(role.attrs)) { s += p.attrs[k as keyof Attrs] * (wt ?? 0); wsum += wt ?? 0; }
  const fit = wsum ? s / wsum : p.ovr;
  const base = ovrAt(p, pos);
  // perfil acima do próprio nível = função sob medida; fora de posição também pesa
  const stars = 3 + (fit - base) / 4 + (base - p.ovr) / 6;
  return clamp(Math.round(stars * 2) / 2, 1, 5);
}

/** Melhor função para um jogador numa posição. */
export function bestRole(p: Player, pos: Pos): RoleDef | null {
  const rs = rolesFor(pos);
  if (!rs.length) return null;
  return rs.slice().sort((a, b) => roleStars(p, b, pos) - roleStars(p, a, pos))[0];
}

/** Rendimento pela aptidão: ±1,6% (só quando o técnico definiu a função). */
export const roleEff = (stars: number) => 1 + 0.008 * (stars - 3);

// ---------------------------------------------------------------- familiaridade com o sistema
export const FAM_NEUTRAL = 70;
/** Familiaridade (0–100) do clube com a formação atual. IA = neutro. */
export function familiarityOf(w: World, club: Club, formation = club.tactic.formation): number {
  if (club.id !== w.userClubId) return FAM_NEUTRAL;
  return club.tfam?.[formation] ?? FAM_NEUTRAL;
}
/** Multiplicador da familiaridade: de −2,1% (sistema novo) a +0,9% (dominado). */
export const famMult = (fam: number) => 1 + (0.03 * (fam - FAM_NEUTRAL)) / 100;

/** Cresce jogando (por partida) e treinando (por mês); as outras formações esquecem devagar. */
export function growFamiliarity(club: Club, amount: number) {
  const f = club.tactic.formation;
  const map = (club.tfam ??= {});
  const cur = map[f] ?? FAM_NEUTRAL;
  map[f] = Math.round(clamp(cur + amount * (1 - cur / 110), 0, 100) * 10) / 10;
}
export function decayFamiliarity(club: Club) {
  if (!club.tfam) return;
  for (const k of Object.keys(club.tfam)) {
    if (k === club.tactic.formation) continue;
    club.tfam[k] = Math.round(Math.max(30, club.tfam[k] - 2) * 10) / 10;
  }
}
/** Mudou para uma formação nunca usada: começa baixo. */
export function onFormationChange(club: Club, formation: string) {
  const map = (club.tfam ??= {});
  if (map[formation] === undefined) map[formation] = 40;
}

// ---------------------------------------------------------------- modelos prontos
export interface Preset { id: string; label: string; emoji: string; desc: string; formation: string; mentality: number; pressing: number; ti: TeamInstr; roles: Partial<Record<Pos, RoleId>> }
export const PRESETS: Preset[] = [
  { id: "tiki", label: "Tiki-taka", emoji: "🎼", desc: "Posse, toque curto e paciência.", formation: "4-3-3", mentality: 1, pressing: 2,
    ti: { line: 2, width: 1, tempo: 0, direct: 0, cpress: true, waste: false }, roles: { GOL: "lib", ZAG: "cons", VOL: "reg", MC: "arm", PD: "inv", PE: "inv", ATA: "fin", LD: "lat_ap", LE: "lat_ap" } },
  { id: "gegen", label: "Gegenpress", emoji: "⚡", desc: "Pressão sufocante e ataque vertical.", formation: "4-2-3-1", mentality: 1, pressing: 2,
    ti: { line: 2, width: 1, tempo: 2, direct: 1, cpress: true, waste: false }, roles: { VOL: "box", MEI: "mat", PD: "inv", PE: "inv", ATA: "fin", LD: "lat_ap", LE: "lat_ap" } },
  { id: "retranca", label: "Retranca e contra-ataque", emoji: "🛡️", desc: "Bloco baixo e saída rápida.", formation: "5-3-2", mentality: -1, pressing: 0,
    ti: { line: 0, width: 0, tempo: 2, direct: 2, cpress: false, waste: true }, roles: { ZAG: "zag", VOL: "destr", MC: "box", LD: "lat_def", LE: "lat_def", ATA: "fin" } },
  { id: "direto", label: "Jogo direto", emoji: "🎯", desc: "Bola longa no pivô e segunda bola.", formation: "4-4-2", mentality: 0, pressing: 1,
    ti: { line: 1, width: 2, tempo: 2, direct: 2, cpress: false, waste: false }, roles: { ZAG: "zag", MC: "box", PD: "ponta", PE: "ponta", ATA: "piv" } },
];

/** Aplica um modelo: formação, instruções e funções (a escalação é reencaixada pela interface). */
export function applyPreset(club: Club, pr: Preset, slots: { pos: Pos }[]) {
  club.tactic.mentality = pr.mentality;
  club.tactic.pressing = pr.pressing;
  club.tactic.ti = { ...pr.ti };
  club.tactic.roles = slots.map((s) => pr.roles[s.pos] ?? null);
  club.tactic.preset = pr.id;
}

/** Mudança de mentalidade programada para o jogo (vencendo / perdendo depois de um minuto). */
export function plannedMentality(t: Tactic, base: number, diff: number, minute: number): number {
  const sh = t.shift;
  if (!sh) return base;
  if (diff > 0 && sh.lead != null && minute >= (sh.leadMin ?? 75)) return clamp(sh.lead, -2, 2);
  if (diff < 0 && sh.trail != null && minute >= (sh.trailMin ?? 70)) return clamp(sh.trail, -2, 2);
  return base;
}
