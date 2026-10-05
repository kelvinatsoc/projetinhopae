// Patrocínios: em cada espaço (camisa, nome do estádio, material esportivo) o clube escolhe 1 de 3 ofertas.
// Marcas fictícias. Valores escalam com a reputação e a divisão (somadas, ficam perto de annualSponsor).
// As ofertas usam um gerador próprio por clube/temporada/espaço: não mexem no gerador global.
import { addIncome, annualSponsor } from "./finance";
import { hashString, makeRng } from "./rng";
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
  shirt: ["Banco Arapuã", "TeleVerde", "Construtora Pedra Alta", "Seguros Capivara", "Cerveja Tropeira", "PixRápido", "Farmácias Boa Saúde", "Mercado Sabiá", "Aero Tucano", "Energia Ipê", "Café Serrano", "Lotérica da Sorte"],
  stadium: ["Arena Jequitibá", "Parque Bandeirante", "Arena Sol Nascente", "Estádio Grupo Aurora", "Arena Rede Vale", "Arena Sertaneja", "Complexo Maré Alta", "Arena Horizonte"],
  kit: ["Kanguru Sports", "Trilha", "Onça Pro", "Ventania", "Garra Esportes", "Pé de Pano", "Arremate", "Bicuda"],
};

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
  const names = BRANDS[slot].slice();
  const out: SponsorDeal[] = [];
  // perfis: seguro (fixo alto), equilibrado, arrojado (fixo baixo, bônus gordos)
  const profiles = [
    { fixed: 1.08, bonus: 0.0 },
    { fixed: 0.95, bonus: 0.25 },
    { fixed: 0.8, bonus: 0.6 },
  ];
  for (let i = 0; i < 3; i++) {
    const k = Math.floor(rng() * names.length);
    const brand = names.splice(k, 1)[0];
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
export function migrateSponsors(c: Club) {
  const s = c.sponsors;
  if (!s) return;
  if (typeof s !== "object" || !s.deals || typeof s.deals !== "object") { delete c.sponsors; return; }
  for (const slot of Object.keys(s.deals) as SponsorSlot[]) {
    const d = s.deals[slot];
    if (!SLOTS.includes(slot) || !d || !(d.annual >= 0) || !Array.isArray(d.bonus)) delete s.deals[slot];
  }
  if (s.offers && !Array.isArray(s.offers.list)) delete s.offers;
}

const round = (v: number) => Math.max(10_000, Math.round(v / 10_000) * 10_000);
