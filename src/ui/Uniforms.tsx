// "Uniformes": os kits da temporada do clube (titular, reserva e terceiro) com a camisa de frente
// e de costas, a fornecedora, o patrocinador master, o desenho completo (camisa, calção e meias)
// e, quando existe, a foto oficial da camisa (TheSportsDB).
import { useEffect, useState } from "react";
import { kitSupplier, shirtSponsor } from "../engine/sponsors";
import type { Club, World } from "../engine/types";
import { useWorld } from "../store";
import { BrandLogo } from "./BrandLogo";
import { Crest } from "./components";
import { kitsOf, KitView, plainKit, type Kit } from "./Kit";
import { kitPhoto, makeKitTexture, type KitTexOptions, type KitWhich } from "./kitTexture";
import { mediaUrl } from "./mediaUrl";
import "./uniforms.css";

/** Caminho do escudo para a camisa (escudo próprio do jogador, arquivo real ou nenhum). */
export function crestFor(c: Club): string | null {
  if (c.customCrest) return c.customCrest;
  return c.logo ? `crests/${c.id}.webp` : null;
}

/** Camisa desenhada (frente ou costas) em alta resolução. */
export function KitShirt({ clubId, which = 0, side = "front", width = 140, ...o }: { clubId: string; which?: KitWhich; side?: "front" | "back"; width?: number } & Omit<KitTexOptions, "layout" | "size" | "onReady">) {
  const [src, setSrc] = useState<string | null>(null);
  const dep = `${clubId}|${which}|${side}|${o.num}|${o.name}|${o.supplier}|${o.sponsor}|${o.crest}|${(o.colors ?? []).join()}`;
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

export function KitCard({ w, c, kit, which }: { w: World; c: Club; kit: Kit; which: KitWhich }) {
  const supplier = kitSupplier(w, c);
  const sponsor = shirtSponsor(w, c);
  const crest = crestFor(c);
  const photo = kitPhoto(c.id, which);
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
      {kits.slice(0, 3).map((k, i) => <KitCard key={i} w={w} c={c} kit={k} which={i as KitWhich} />)}
    </div>
  );
}
