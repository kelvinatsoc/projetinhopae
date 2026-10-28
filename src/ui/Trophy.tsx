import { Icon } from "./components";
/** Imagem do troféu oficial de uma competição: foto real recortada ou modelo 3D renderizado. */
import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "./mediaUrl";
import { trophyPhoto, trophySpec } from "./trophies";

export function TrophyImg({ comp, size = 64, className }: { comp: string; size?: number; className?: string }) {
  const photo = trophyPhoto(comp);
  const [src, setSrc] = useState<string | null>(photo ? mediaUrl(photo) : null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (src && !failed) return;
    let alive = true;
    const px = size > 128 ? 512 : 256;
    void import("./trophy3d").then((m) => {
      if (!alive) return;
      const url = m.trophyImage(trophySpec(comp), px);
      if (url) setSrc(url);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [comp, failed]); // eslint-disable-line react-hooks/exhaustive-deps
  const spec = trophySpec(comp);
  if (!src) return <span className={`trophy-img ph ${className ?? ""}`} style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true"><Icon name="trophy" size={Math.round(size * 0.7)} /></span>;
  return (
    <img className={`trophy-img ${className ?? ""}`} src={src} alt={spec.name} title={spec.name} width={size} height={size} decoding="async"
      onError={() => { if (!failed) { setFailed(true); setSrc(null); } }} />
  );
}

/** Troféu girando em 3D (festa do título). Com foto real, mostra a foto com brilho. */
export function TrophyLive({ comp, size = 200 }: { comp: string; size?: number }) {
  const photo = trophyPhoto(comp);
  const ref = useRef<HTMLCanvasElement>(null);
  const [usePhoto, setUsePhoto] = useState(!!photo);
  useEffect(() => {
    if (usePhoto || !ref.current) return;
    let stop: (() => void) | null = null;
    let alive = true;
    void import("./trophy3d").then((m) => {
      if (alive && ref.current) stop = m.mountTrophy(ref.current, trophySpec(comp));
    }).catch(() => undefined);
    return () => { alive = false; stop?.(); };
  }, [comp, usePhoto]);
  if (usePhoto && photo) {
    return <img className="trophy-live photo" src={mediaUrl(photo)} alt={trophySpec(comp).name} style={{ width: size, height: size }} onError={() => setUsePhoto(false)} />;
  }
  return <canvas ref={ref} className="trophy-live" style={{ width: size, height: size }} aria-label={trophySpec(comp).name} />;
}
