// Mapa 3D da sede do clube (estilo PS2). Toque num prédio para abrir a tela correspondente.
// O renderizador three.js só é baixado aqui; sem WebGL, mostra a grade de botões (fallback).
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Club } from "../../engine/types";
import { facLevel } from "../../engine/facilities";
import { push, setTab } from "../../store";
import { haptic } from "../haptics";
import { GIcon, visibleColor } from "../components";
import type { IconSlug } from "../icons";
import type { HqBuilding, HqRenderer } from "./HqRenderer";
import "./hq.css";

interface Dest { label: string; slug: IconSlug; go: () => void }

const BUILDINGS: Record<HqBuilding, { name: string; slug: IconSlug; dests: Dest[] }> = {
  stadium: { name: "Estádio", slug: "estadio", dests: [{ label: "Estrutura", slug: "estrutura", go: () => push({ name: "facilities" }) }] },
  office: { name: "Diretoria", slug: "diretoria", dests: [
    { label: "Diretoria", slug: "diretoria", go: () => push({ name: "board" }) },
    { label: "Finanças", slug: "financas", go: () => push({ name: "finances" }) },
    { label: "Patrocínios", slug: "patrocinios", go: () => push({ name: "sponsors" }) },
  ] },
  training: { name: "CT", slug: "treino", dests: [
    { label: "Treino", slug: "treino", go: () => push({ name: "training" }) },
    { label: "Tática", slug: "tatica", go: () => push({ name: "tactics" }) },
    { label: "Bola parada", slug: "tatica", go: () => push({ name: "setpieces" }) },
  ] },
  locker: { name: "Vestiário", slug: "elenco", dests: [
    { label: "Elenco", slug: "elenco", go: () => setTab("squad") },
    { label: "Clima do elenco", slug: "vestiario", go: () => push({ name: "dressing" }) },
    { label: "Comissão técnica", slug: "olheiros", go: () => push({ name: "staff" }) },
  ] },
  academy: { name: "Base", slug: "base", dests: [{ label: "Categorias de base", slug: "base", go: () => push({ name: "youth" }) }] },
  medical: { name: "Médico", slug: "estrutura", dests: [{ label: "Departamento médico", slug: "estrutura", go: () => push({ name: "facilities" }) }] },
  press: { name: "Imprensa", slug: "coletiva", dests: [
    { label: "Notícias", slug: "noticias", go: () => push({ name: "news" }) },
    { label: "Caixa de entrada", slug: "caixa-entrada", go: () => push({ name: "inbox" }) },
  ] },
  scouting: { name: "Observação", slug: "olheiros", dests: [{ label: "Mercado e olheiros", slug: "mercado", go: () => setTab("market") }] },
};
const ORDER = Object.keys(BUILDINGS) as HqBuilding[];

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export function ClubHQ({ club, matchToday, fallback }: { club: Club; matchToday: boolean; fallback: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<Partial<Record<HqBuilding, HTMLElement>>>({});
  const [failed, setFailed] = useState(() => typeof document === "undefined" || !hasWebGL());
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<HqBuilding | null>(null);

  const c1 = visibleColor(club.colors);
  const c2 = club.colors.find((c) => c.toLowerCase() !== c1.toLowerCase()) ?? "#ffffff";
  const levels = [facLevel(club, "stadium"), facLevel(club, "training"), facLevel(club, "youth"), facLevel(club, "medical")];
  const hour = new Date().getHours();
  const night = matchToday || hour >= 19 || hour < 6;

  useEffect(() => {
    if (failed || !host.current) return;
    let r: HqRenderer | null = null;
    let dead = false;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    import("./HqRenderer")
      .then((m) => {
        if (dead || !host.current) return;
        r = new m.HqRenderer({
          host: host.current, colors: [c1, c2], stadiumLv: levels[0], trainLv: levels[1], youthLv: levels[2], medicalLv: levels[3],
          night, reduced, labels: labels.current,
          onPick: (b) => { haptic("tap"); setSel(b); },
        });
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => { dead = true; r?.dispose(); };
  }, [failed, c1, c2, night, levels.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <>{fallback}</>;

  const b = sel ? BUILDINGS[sel] : null;
  return (
    <div className="hq">
      <div className="hq-stage" ref={host}>
        {!ready && <div className="hq-loading">Carregando a sede…</div>}
        {ORDER.map((id) => (
          <button key={id} className="hq-pin" ref={(el) => { if (el) labels.current[id] = el; }} onClick={() => { haptic("tap"); setSel(id); }}>
            <GIcon slug={BUILDINGS[id].slug} size={16} />{BUILDINGS[id].name}
          </button>
        ))}
        <div className="hq-hint">Arraste para girar · toque num prédio</div>
      </div>
      {b && (
        <div className="hq-menu" role="menu" aria-label={b.name}>
          <div className="hq-menu-head"><GIcon slug={b.slug} size={22} /><b>{b.name}</b>
            <button className="hq-x" aria-label="Fechar" onClick={() => setSel(null)}>×</button></div>
          <div className="hq-menu-items">
            {b.dests.map((d) => (
              <button key={d.label} className="btn" onClick={() => { setSel(null); d.go(); }}><GIcon slug={d.slug} size={20} />{d.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
