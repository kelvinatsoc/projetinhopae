// Patrocínios: em cada espaço (camisa, nome do estádio, material esportivo) o clube escolhe 1 de 3 ofertas.
// Marcas reais: o clube começa com os contratos verdadeiros de 2025/26 (src/data/sponsorsReal.json) e as
// ofertas novas vêm de marcas ativas no futebol brasileiro (brands.json). Valores escalam com a reputação e a divisão (somadas, ficam perto de annualSponsor).
// As ofertas usam um gerador próprio por clube/temporada/espaço: não mexem no gerador global.
import { addIncome, annualSponsor } from "./finance";
import { hashString, makeRng } from "./rng";
import REAL_JSON from "../data/sponsorsReal.json";
import LOGOS_JSON from "../data/brandLogos.json";
import POOL from "./brands.json";
import type { Club, SponsorBonus, SponsorDeal, SponsorSlot, SponsorState, World } from "./types";

export const SLOTS: SponsorSlot[] = ["shirt", "stadium", "kit"];

export const SLOT_INFO: Record<SponsorSlot, { emoji: string; label: string; share: number; desc: string }> = {
  shirt: { emoji: "👕", label: "Patrocínio master (camisa)", share: 0.5, desc: "A marca estampada no peito da camisa." },
  stadium: { emoji: "🏟️", label: "Nome do estádio", share: 0.3, desc: "Direito de dar nome à sua casa." },
  kit: { emoji: "👟", label: "Material esportivo", share: 0.2, desc: "Fornecedora dos uniformes e chuteiras." },
};

/** Sem contrato, o espaço rende só uma fração (anunciantes avulsos). */
export const EMPTY_SLOT_PCT = 0.55;

const BRANDS: Record<SponsorSlot, string[]> = {
  shirt: POOL.shirt,
  stadium: POOL.stadium.map((x) => x.name),
  kit: POOL.kit,
};

/** Contratos reais de cada clube (fornecedora, master e naming rights onde existe). */
export const REAL_SPONSORS = REAL_JSON as Record<string, { kit?: string; shirt?: string; stadium?: string }>;
const LOGOS = LOGOS_JSON as Record<string, string>;
const STADIUM_LOGO: Record<string, string> = {
  ...Object.fromEntries(POOL.stadium.map((x) => [x.name, x.logo])),
  ...(POOL.stadiumBrands as Record<string, string>),
};

/** Caminho (em public/media) da logo da marca, se houver. */
export function brandLogo(brand: string | undefined | null): string | null {
  if (!brand) return null;
  const key = LOGOS[brand] ?? LOGOS[STADIUM_LOGO[brand] ?? ""];
  return key ? `brands/${key}.webp` : null;
}

/** Marcas fictícias das versões antigas (saves antigos são trocados pelas reais). */
const LEGACY_BRANDS = new Set(["Banco Arapuã", "TeleVerde", "Construtora Pedra Alta", "Seguros Capivara", "Cerveja Tropeira", "PixRápido", "Farmácias Boa Saúde", "Mercado Sabiá", "Aero Tucano", "Energia Ipê", "Café Serrano", "Lotérica da Sorte",
  "Arena Jequitibá", "Parque Bandeirante", "Arena Sol Nascente", "Estádio Grupo Aurora", "Arena Rede Vale", "Arena Sertaneja", "Complexo Maré Alta", "Arena Horizonte",
  "Kanguru Sports", "Trilha", "Onça Pro", "Ventania", "Garra Esportes", "Pé de Pano", "Arremate", "Bicuda"]);

/** Contrato atual verdadeiro de um espaço (ou undefined se o clube não tem/não sabemos). */
function realDeal(w: World, c: Club, slot: SponsorSlot): SponsorDeal | undefined {
  const brand = REAL_SPONSORS[c.id]?.[slot];
  if (!brand) return undefined;
  // contratos já em vigor: valor de mercado, vencem nas próximas temporadas
  const years = 1 + (hashString(`${c.id}:${slot}`) % 3);
  return { id: `${slot}-real`, slot, brand, annual: round(slotBase(c, slot) * 1.15), years, bonus: [], since: w.season, until: w.season + years - 1 };
}

/** Começo de jogo: cada clube com os seus patrocinadores reais. */
export function seedRealSponsors(w: World) {
  for (const c of Object.values(w.clubs)) {
    if (c.sponsors) continue;
    const deals: SponsorState["deals"] = {};
    for (const slot of SLOTS) {
      const d = realDeal(w, c, slot);
      if (d) deals[slot] = d;
    }
    if (Object.keys(deals).length) c.sponsors = { deals };
  }
}

/** Fornecedora de material atual (contrato assinado ou o real). */
export function kitSupplier(w: World, c: Club): string | undefined {
  return activeDeal(w, c, "kit")?.brand ?? REAL_SPONSORS[c.id]?.kit;
}

/** Nome do estádio com o naming rights em vigor (ou o nome de sempre). */
export function stadiumName(w: World, c: Club): string {
  return activeDeal(w, c, "stadium")?.brand ?? c.stadium;
}

/** Patrocinador master atual. */
export function shirtSponsor(w: World, c: Club): string | undefined {
  return activeDeal(w, c, "shirt")?.brand ?? REAL_SPONSORS[c.id]?.shirt;
}

export const BONUS_LABEL: Record<SponsorBonus["kind"], string> = {
  title: "Título da liga",
  top4: "Terminar no G-4",
  safe: "Escapar do rebaixamento",
};

const sp = (c: Club): SponsorState => (c.sponsors ??= { deals: {} });

/** Valor-base de um espaço (R$/ano) para a reputação e divisão atuais. */
export function slotBase(c: Club, slot: SponsorSlot): number {
  return annualSponsor(c) * SLOT_INFO[slot].share;
}

/** Três ofertas para um espaço, determinísticas por clube/temporada. */
export function makeOffers(w: World, c: Club, slot: SponsorSlot): SponsorDeal[] {
  const rng = makeRng(hashString(`sponsor:${w.seed}:${w.season}:${c.id}:${slot}`));
  const base = slotBase(c, slot);
  const real = REAL_SPONSORS[c.id]?.[slot];
  const names = BRANDS[slot].filter((b) => b !== real);
  const out: SponsorDeal[] = [];
  // perfis: seguro (fixo alto), equilibrado, arrojado (fixo baixo, bônus gordos)
  const profiles = [
    { fixed: 1.08, bonus: 0.0 },
    { fixed: 0.95, bonus: 0.25 },
    { fixed: 0.8, bonus: 0.6 },
  ];
  for (let i = 0; i < 3; i++) {
    const k = Math.floor(rng() * names.length);
    // o parceiro atual (real) sempre aparece para renovar, no perfil seguro
    const brand = i === 0 && real ? real : names.splice(k, 1)[0];
    const pr = profiles[i];
    const annual = round(base * pr.fixed * (0.92 + rng() * 0.16));
    const bonus: SponsorBonus[] = [];
    if (pr.bonus > 0) {
      const pool = bonusKinds(c);
      const n = i === 2 ? Math.min(2, pool.length) : 1;
      for (let j = 0; j < n; j++) {
        const kind = pool[j];
        const mult = kind === "title" ? 2 : kind === "top4" ? 1 : 0.6;
        bonus.push({ kind, value: round(base * pr.bonus * mult * (0.85 + rng() * 0.3)) });
      }
    }
    out.push({ id: `${slot}-${w.season}-${i}`, slot, brand, annual, years: 1 + Math.floor(rng() * 3), bonus });
  }
  return out;
}

/** Cláusulas que fazem sentido para o tamanho do clube. */
function bonusKinds(c: Club): SponsorBonus["kind"][] {
  if (c.rep >= 72) return ["title", "top4"];
  if (c.rep >= 55) return ["top4", "safe"];
  return ["safe", "top4"];
}

/** Ofertas abertas do clube nesta temporada (geradas sob demanda). */
export function currentOffers(w: World, c: Club): SponsorDeal[] {
  const s = sp(c);
  if (!s.offers || s.offers.season !== w.season) {
    s.offers = { season: w.season, list: SLOTS.flatMap((slot) => makeOffers(w, c, slot)) };
  }
  return s.offers.list.filter((o) => !activeDeal(w, c, o.slot));
}

export function activeDeal(w: World, c: Club, slot: SponsorSlot): SponsorDeal | undefined {
  const d = c.sponsors?.deals[slot];
  return d && (d.until ?? 0) >= w.season ? d : undefined;
}

/** Assina uma das ofertas. Retorna erro em texto ou null. */
export function signSponsor(w: World, c: Club, id: string): string | null {
  const offer = currentOffers(w, c).find((o) => o.id === id);
  if (!offer) return "Oferta não disponível.";
  const s = sp(c);
  s.deals[offer.slot] = { ...offer, since: w.season, until: w.season + offer.years - 1 };
  (s.log ??= []).push({ season: w.season, brand: offer.brand, text: `Contrato assinado: ${SLOT_INFO[offer.slot].label}`, value: offer.annual });
  return null;
}

/** Receita anual de patrocínio: contratos assinados + avulsos nos espaços vazios. */
export function sponsorAnnual(w: World, c: Club): number {
  if (!c.sponsors) return annualSponsor(c);
  let v = 0;
  for (const slot of SLOTS) {
    const d = activeDeal(w, c, slot);
    v += d ? d.annual : slotBase(c, slot) * EMPTY_SLOT_PCT;
  }
  return Math.round(v);
}

/** O clube cumpriu a cláusula na temporada que passou? */
export function bonusMet(kind: SponsorBonus["kind"], div: string, pos: number | null, teams = 20): boolean {
  if (pos == null || div !== "A") return kind === "safe" && pos != null && pos <= teams - 4;
  if (kind === "title") return pos === 1;
  if (kind === "top4") return pos <= 4;
  return pos <= teams - 4;
}

/**
 * Bônus de fim de temporada: roda no primeiro processamento mensal da temporada nova,
 * olhando o histórico do clube (assim não depende do fechamento da temporada).
 */
export function settleSponsorBonuses(w: World, c: Club): number {
  const s = c.sponsors;
  if (!s) return 0;
  const last = w.season - 1;
  if ((s.paidFor ?? last - 1) >= last) return 0;
  s.paidFor = last;
  const rec = c.history.find((h) => h.season === last);
  if (!rec) return 0;
  let total = 0;
  for (const slot of SLOTS) {
    const d = s.deals[slot];
    if (!d || (d.since ?? 0) > last || (d.until ?? 0) < last) continue;
    for (const b of d.bonus) {
      if (!bonusMet(b.kind, rec.div, rec.pos)) continue;
      total += b.value;
      (s.log ??= []).push({ season: w.season, brand: d.brand, text: `Bônus: ${BONUS_LABEL[b.kind]}`, value: b.value });
    }
  }
  if (s.log && s.log.length > 30) s.log.splice(0, s.log.length - 30);
  if (total > 0) addIncome(c, "sponsor", total);
  return total;
}

/** Limpa dados inválidos de saves antigos/corrompidos. */
export function migrateSponsors(c: Club, w?: World) {
  const s = c.sponsors;
  if (!s) return;
  if (w) {
    // marcas fictícias de saves antigos viram as reais (mesmo valor e prazo)
    for (const slot of SLOTS) {
      const d = s.deals?.[slot];
      if (!d || !LEGACY_BRANDS.has(d.brand)) continue;
      const real = REAL_SPONSORS[c.id]?.[slot];
      d.brand = real ?? BRANDS[slot][hashString(`${c.id}:${slot}:${d.brand}`) % BRANDS[slot].length];
    }
    if (s.offers?.list?.some?.((o) => LEGACY_BRANDS.has(o.brand))) delete s.offers;
    for (const e of s.log ?? []) {
      if (!LEGACY_BRANDS.has(e.brand)) continue;
      const slot: SponsorSlot = /Arena|Parque|Estádio|Complexo/.test(e.brand) ? "stadium" : "shirt";
      e.brand = REAL_SPONSORS[c.id]?.[slot] ?? BRANDS[slot][hashString(e.brand) % BRANDS[slot].length];
    }
  }
  if (typeof s !== "object" || !s.deals || typeof s.deals !== "object") { delete c.sponsors; return; }
  for (const slot of Object.keys(s.deals) as SponsorSlot[]) {
    const d = s.deals[slot];
    if (!SLOTS.includes(slot) || !d || !(d.annual >= 0) || !Array.isArray(d.bonus)) delete s.deals[slot];
  }
  if (s.offers && !Array.isArray(s.offers.list)) delete s.offers;
}

const round = (v: number) => Math.max(10_000, Math.round(v / 10_000) * 10_000);
