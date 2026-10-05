// Logo de uma marca real (material esportivo, patrocinador, naming rights). Sem arquivo: só o nome.
// As logos são marcas registradas dos seus donos (uso pessoal).
import { useState } from "react";
import { brandLogo } from "../engine/sponsors";
import { mediaUrlOrNull } from "./mediaUrl";

export function BrandLogo({ brand, size = 28, withName }: { brand: string | undefined | null; size?: number; withName?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (!brand) return null;
  const src = mediaUrlOrNull(brandLogo(brand));
  const img = src && !broken
    ? <span className="brand-logo" style={{ width: Math.round(size * 1.7), height: size }}><img src={src} alt={brand} title={brand} loading="lazy" decoding="async" onError={() => setBroken(true)} /></span>
    : null;
  if (!withName) return img ?? <span className="brand-name">{brand}</span>;
  return <span className="brand-chip">{img}<b>{brand}</b></span>;
}
