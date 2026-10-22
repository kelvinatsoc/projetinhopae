// "Uniformes": os kits da temporada do clube (titular, reserva e terceiro) com a camisa de frente
// e de costas, a fornecedora, o patrocinador master, o desenho completo (camisa, calção e meias)
// e, quando existe, a foto oficial da camisa (TheSportsDB).
import { useEffect, useState } from "react";
import { kitSupplier, shirtSponsor } from "../engine/sponsors";
import type { Club, World } from "../engine/types";
import { toast, update, useWorld } from "../store";
import { autosave } from "./actions";
import { canEditCustomKit, draftCustomKit, KIT_PATTERNS, saveCustomKit, setCustomKitWear } from "../engine/customKit";
import type { CustomKit } from "../engine/types";
import { customToKit } from "./Kit";
import { Sheet } from "./components";
import { BrandLogo } from "./BrandLogo";
import { Crest } from "./components";
import { kitsOf, KitView, plainKit, type Kit } from "./Kit";
import { kitPhoto, makeKitTexture, type KitTexOptions, type KitWhich } from "./kitTexture";
import { mediaUrl } from "./mediaUrl";
import "./uniforms.css";

/** Caminho do escudo para a camisa (escudo próprio do jogador, arquivo real ou nenhum). */
export function crestFor(c: Club): string | null {
  if (c.customCrest) return c.customCrest;
  return `crests/${c.id}.webp`;
}

/** Camisa desenhada (frente ou costas) em alta resolução. */
export function KitShirt({ clubId, which = 0, side = "front", width = 140, ...o }: { clubId: string; which?: KitWhich; side?: "front" | "back"; width?: number } & Omit<KitTexOptions, "layout" | "size" | "onReady">) {
  const [src, setSrc] = useState<string | null>(null);
  const dep = `${clubId}|${which}|${side}|${o.num}|${o.name}|${o.supplier}|${o.sponsor}|${o.crest}|${(o.colors ?? []).join()}|${o.kit ? JSON.stringify(o.kit) : ""}`;
  useEffect(() => {
    let live = true;
    const dpr = typeof window !== "undefined" ? Math.min(3, window.devicePixelRatio || 1) : 1;
    const c = makeKitTexture(clubId, which, {
      ...o, layout: side, size: Math.round(width * 1.1 * dpr),
      onReady: (cv) => { if (live) setSrc(cv.toDataURL()); },
    });
    setSrc(c.toDataURL());
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep, width]);
  const label = `${side === "front" ? "Frente" : "Costas"} da camisa`;
  return <span className="kit-shirt" style={{ width, height: Math.round(width * 1.1) }}>{src && <img src={src} alt={label} title={label} draggable={false} />}</span>;
}

const PAT_LABEL: Record<NonNullable<Kit["pat"]>, string> = {
  stripes: "listras verticais", hoops: "listras horizontais", sash: "faixa diagonal", halves: "metade/metade", band: "faixa no peito",
};

function Swatch({ c, label }: { c: string; label: string }) {
  return <span className="kit-sw"><i style={{ background: c }} />{label}</span>;
}

/** Jogador "modelo" das costas: o mais experiente do elenco com número. */
function modelPlayer(w: World, c: Club) {
  const ps = c.players.map((id) => w.players[id]).filter((p) => p && p.shirt);
  ps.sort((a, b) => b.ovr - a.ovr);
  const p = ps[0];
  return p ? { num: p.shirt, name: p.name.split(" ").slice(-1)[0] } : { num: 10, name: c.abbr };
}

export function KitCard({ w, c, kit, which, photoIdx }: { w: World; c: Club; kit: Kit; which: KitWhich; photoIdx?: number }) {
  const supplier = kitSupplier(w, c);
  const sponsor = shirtSponsor(w, c);
  const crest = crestFor(c);
  const photo = kit.custom ? null : kitPhoto(c.id, (photoIdx ?? which) as KitWhich);
  const m = modelPlayer(w, c);
  const common = { clubId: c.id, which, supplier: supplier ?? null, sponsor: sponsor ?? null, crest, colors: c.colors };
  return (
    <div className="card kit-card">
      <div className="card-title"><h3>{kit.name}</h3>{kit.synthetic ? <span className="tag">sem dados reais</span> : <span className="tiny muted">temporada {w.season}</span>}</div>
      <div className="kit-shirts">
        <KitShirt {...common} side="front" width={132} />
        <KitShirt {...common} side="back" width={132} num={m.num} name={m.name} />
      </div>
      <div className="kit-meta">
        <KitView kit={kit} width={58} supplier={supplier} />
        <div className="kit-meta-info">
          <div className="kit-sws">
            <Swatch c={kit.b} label="corpo" />
            <Swatch c={kit.la} label="mangas" />
            <Swatch c={kit.sh} label="calção" />
            <Swatch c={kit.so} label="meias" />
            {kit.pat && kit.st && <Swatch c={kit.st} label={PAT_LABEL[kit.pat]} />}
          </div>
          <div className="kit-brands">
            <div><span className="tiny muted">Fornecedor</span>{supplier ? <BrandLogo brand={supplier} size={22} withName /> : <span className="tiny muted">—</span>}</div>
            <div><span className="tiny muted">Patrocínio master</span>{sponsor ? <BrandLogo brand={sponsor} size={22} withName /> : <span className="tiny muted">—</span>}</div>
          </div>
        </div>
        {photo && (
          <figure className="kit-photo">
            <img src={mediaUrl(photo)} alt={`Camisa oficial (${kit.name})`} loading="lazy" decoding="async" />
            <figcaption className="tiny muted">foto oficial</figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}

export function UniformsScreen({ id }: { id: string }) {
  const w = useWorld();
  const c = w.clubs[id];
  if (!c) return <div className="page"><div className="empty">Clube não encontrado.</div></div>;
  const real = kitsOf(c.id);
  const kits = real.length ? real : [plainKit(c.colors), plainKit([c.colors[1] ?? "#FFFFFF", c.colors[0]], "Reserva")];
  return (
    <div className="page">
      <div className="card row gap8">
        <Crest club={c} size={36} />
        <div className="grow">
          <h3 style={{ margin: 0 }}>Uniformes {w.season}</h3>
          <div className="tiny muted">
            {real.length ? "Desenho dos uniformes da Wikipedia; marcas e escudos são dos seus donos (uso pessoal)." : "Este clube ainda não tem uniformes reais: liso nas cores do clube."}
            {" "}Em jogo, o visitante troca para o uniforme 2 quando as camisas se confundem.
          </div>
        </div>
      </div>
      {kits.slice(0, 3).map((k, i) => <KitCard key={i} w={w} c={c} kit={k} which={i as KitWhich} photoIdx={kits.slice(0, i).filter((x) => !x.custom).length} />)}
      {c.id === w.userClubId && <CustomKitCard w={w} c={c} />}
    </div>
  );
}

// ---------------------------------------------------------------- editor do 3º uniforme
const COLLARS: { id: CustomKit["collar"]; label: string }[] = [{ id: "redonda", label: "Redonda" }, { id: "v", label: "Em V" }, { id: "polo", label: "Polo" }];
const SPONSOR_POS: { id: CustomKit["sponsorPos"]; label: string }[] = [{ id: "alto", label: "Alto" }, { id: "centro", label: "Centro" }, { id: "baixo", label: "Baixo" }];
const SUPPLIER_POS: { id: CustomKit["supplierPos"]; label: string }[] = [{ id: "direita", label: "Peito direito" }, { id: "centro", label: "Centro" }, { id: "esquerda", label: "Peito esquerdo" }];

function Chips<T extends string>({ value, options, onPick }: { value: T; options: { id: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="kit-chips">
      {options.map((o) => <button key={o.id} type="button" className={`chip${o.id === value ? " active" : ""}`} onClick={() => onPick(o.id)}>{o.label}</button>)}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="kit-color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <span>{label}</span>
    </label>
  );
}

function CustomKitCard({ w, c }: { w: World; c: Club }) {
  const [draft, setDraft] = useState<CustomKit | null>(null);
  const can = canEditCustomKit(w, c);
  const supplier = kitSupplier(w, c) ?? null;
  const sponsor = shirtSponsor(w, c) ?? null;
  const crest = crestFor(c);
  const set = (p: Partial<CustomKit>) => setDraft((d) => (d ? { ...d, ...p } : d));
  return (
    <div className="card">
      <div className="card-title"><h3>🎨 3º uniforme personalizado</h3>{c.customKit && <span className="tiny muted">lançado em {c.customKit.season}</span>}</div>
      <div className="tiny muted">Crie a camisa alternativa do clube: uma vez por temporada. Ela vira o 3º uniforme na partida e aqui na aba.</div>
      {c.customKit && (
        <label className="row gap8 mt8 small">
          <input type="checkbox" checked={!!c.customKit.wear} onChange={(e) => { const on = e.target.checked; update((x) => setCustomKitWear(x.clubs[c.id], on)); autosave(); }} />
          Usar como uniforme principal nos jogos (troca sozinho se houver choque de cores)
        </label>
      )}
      <button className="btn block mt8" disabled={!can} onClick={() => setDraft(draftCustomKit(w, c))}>
        {can ? (c.customKit ? "Criar o uniforme desta temporada" : "Criar 3º uniforme") : `🔒 Já lançado em ${w.season}: novo só em ${w.season + 1}`}
      </button>
      {draft && (
        <Sheet title="Editor de uniforme" onClose={() => setDraft(null)}>
          <div className="kit-shirts">
            <KitShirt clubId={c.id} side="front" width={120} kit={customToKit(draft)} supplier={supplier} sponsor={sponsor} crest={crest} />
            <KitShirt clubId={c.id} side="back" width={120} kit={customToKit(draft)} num={10} name={c.abbr} />
          </div>
          <div className="kit-colors">
            <ColorField label="Corpo" value={draft.b} onChange={(b) => set({ b })} />
            <ColorField label="Mangas" value={draft.sl} onChange={(sl) => set({ sl })} />
            <ColorField label="Calção" value={draft.sh} onChange={(sh) => set({ sh })} />
            <ColorField label="Meias" value={draft.so} onChange={(so) => set({ so })} />
            {draft.pat !== "solid" && <ColorField label="Padrão" value={draft.st} onChange={(st) => set({ st })} />}
          </div>
          <div className="tiny muted mt8">Padrão</div>
          <Chips value={draft.pat} options={KIT_PATTERNS} onPick={(pat) => set({ pat })} />
          <div className="tiny muted mt8">Gola</div>
          <Chips value={draft.collar} options={COLLARS} onPick={(collar) => set({ collar })} />
          <div className="tiny muted mt8">Patrocínio master</div>
          <Chips value={draft.sponsorPos} options={SPONSOR_POS} onPick={(sponsorPos) => set({ sponsorPos })} />
          <div className="tiny muted mt8">Fornecedora</div>
          <Chips value={draft.supplierPos} options={SUPPLIER_POS} onPick={(supplierPos) => set({ supplierPos })} />
          <div className="grid2 mt12">
            <button className="btn" onClick={() => setDraft(null)}>Cancelar</button>
            <button className="btn primary" onClick={() => {
              let err: string | null = null;
              update((x) => { err = saveCustomKit(x, x.clubs[c.id], draft); });
              toast(err ?? "👕 3º uniforme lançado!");
              if (!err) { setDraft(null); autosave(); }
            }}>Lançar uniforme</button>
          </div>
          <div className="tiny muted mt8">Depois de lançado, só dá para criar outro na próxima temporada.</div>
        </Sheet>
      )}
    </div>
  );
}
