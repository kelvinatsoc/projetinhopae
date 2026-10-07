// Mapa 3D da sede do clube (estilo PS2, com detalhe que cresce com a Estrutura).
// Estádio, CT e sede ficam nas posições reais quando há dados (src/data/clubSites.json).
// Toque num prédio: a câmera voa até ele e abre o menu do local.
// O renderizador three.js e os dados geográficos só são baixados aqui; sem WebGL, mostra a grade.
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/chakra-petch/latin-700-italic.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Club } from "../../engine/types";
import { facLevel } from "../../engine/facilities";
import { push, setTab } from "../../store";
import { haptic } from "../haptics";
import { GIcon, Icon, visibleColor } from "../components";
import type { IconSlug } from "../icons";
import type { ClubGeo, HqBuilding, HqRenderer, HqSiteKind } from "./HqRenderer";
import "./hq.css";

interface Dest { label: string; slug: IconSlug; go: () => void }

const BUILDINGS: Record<HqBuilding, { name: string; slug: IconSlug; dests: Dest[] }> = {
  stadium: { name: "Estádio", slug: "estadio", dests: [{ label: "Estrutura do estádio", slug: "estrutura", go: () => push({ name: "facilities" }) }] },
  office: { name: "Sede", slug: "diretoria", dests: [
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
  medical: { name: "Médico", slug: "estrutura", dests: [{ label: "Departamento médico (Estrutura)", slug: "estrutura", go: () => push({ name: "facilities" }) }] },
  press: { name: "Imprensa", slug: "coletiva", dests: [
    { label: "Notícias", slug: "noticias", go: () => push({ name: "news" }) },
    { label: "Caixa de entrada", slug: "caixa-entrada", go: () => push({ name: "inbox" }) },
  ] },
  scouting: { name: "Observação", slug: "olheiros", dests: [{ label: "Mercado e olheiros", slug: "mercado", go: () => setTab("market") }] },
};
const ORDER = Object.keys(BUILDINGS) as HqBuilding[];
const SITE_LABEL: Record<HqSiteKind, string> = { stadium: "Estádio", ct: "CT", sede: "Sede" };

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

function km(a?: { lat: number; lon: number }, b?: { lat: number; lon: number }): string | null {
  if (!a || !b) return null;
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  const d = 6371 * 2 * Math.asin(Math.sqrt(h));
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

export function ClubHQ({ club, matchToday, fallback }: { club: Club; matchToday: boolean; fallback: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const rRef = useRef<HqRenderer | null>(null);
  const labels = useRef<Partial<Record<HqBuilding, HTMLElement>>>({});
  const [failed, setFailed] = useState(() => typeof document === "undefined" || !hasWebGL());
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<HqBuilding | null>(null);
  const [geo, setGeo] = useState<ClubGeo | null>(null);
  const [sites, setSites] = useState<HqSiteKind[]>([]);

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
    Promise.all([
      import("./HqRenderer"),
      import("../../data/clubSites.json").then((m) => (m.default as unknown as { clubs: Record<string, ClubGeo> }).clubs[club.id] ?? null).catch(() => null),
    ])
      .then(([m, g]) => {
        if (dead || !host.current) return;
        setGeo(g);
        r = new m.HqRenderer({
          host: host.current, colors: [c1, c2], stadiumLv: levels[0], trainLv: levels[1], youthLv: levels[2], medicalLv: levels[3],
          matchDay: matchToday, night, reduced, geo: g, labels: labels.current,
          onPick: (b) => { haptic("tap"); setSel(b); },
        });
        rRef.current = r;
        setSites(r.sites());
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => { dead = true; rRef.current = null; r?.dispose(); };
  }, [failed, club.id, c1, c2, night, matchToday, levels.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <>{fallback}</>;

  const b = sel ? BUILDINGS[sel] : null;
  const open = (id: HqBuilding) => {
    haptic("tap");
    if (rRef.current) rRef.current.focus(id, () => setSel(id));
    else setSel(id);
  };
  const st = geo?.sites.stadium;
  const real = !!st;
  return (
    <div className="hq">
      <div className="hq-stage" ref={host} role="application" aria-label="Mapa 3D da sede do clube. Arraste para girar, use dois dedos para aproximar e toque num prédio.">
        {!ready && <div className="hq-loading">Carregando a sede…</div>}
        {ORDER.map((id) => (
          <button key={id} className="hq-pin" ref={(el) => { if (el) labels.current[id] = el; }} onClick={() => open(id)} aria-label={`Ir para ${BUILDINGS[id].name}`}>
            <GIcon slug={BUILDINGS[id].slug} size={16} />{BUILDINGS[id].name}
          </button>
        ))}
        {real && <div className="hq-credit">Mapa: © OpenStreetMap · Wikidata</div>}
        {b && (
          <div className="hq-menu" role="dialog" aria-label={b.name}>
            <div className="hq-menu-head"><GIcon slug={b.slug} size={22} /><b>{b.name}</b>
              <button className="hq-x" aria-label="Fechar" onClick={() => { setSel(null); rRef.current?.focus("overview"); }}><Icon name="close" size={22} /></button></div>
            <div className="hq-menu-items">
              {b.dests.map((d) => (
                <button key={d.label} className="btn" onClick={() => { setSel(null); d.go(); }}><GIcon slug={d.slug} size={20} />{d.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="hq-sites" role="group" aria-label="Ir para um local">
        <button className="chip" onClick={() => rRef.current?.focus("overview")}><Icon name="compass" size={18} /> Visão geral</button>
        {sites.map((k) => {
          const d = k === "stadium" ? null : km(st, geo?.sites[k]);
          return (
            <button key={k} className="chip" onClick={() => rRef.current?.focusSite(k)}>
              {SITE_LABEL[k]}{d ? <span className="t-3"> · {d}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="hq-note t-3">
        {real
          ? `Locais reais: ${[geo?.sites.stadium?.name, geo?.sites.ct ? "CT" : null, geo?.sites.sede ? "sede" : null].filter(Boolean).join(", ")}. Distâncias longas aparecem encurtadas.`
          : "Mapa ilustrativo: ainda não temos a localização real deste clube."}
        {" "}Os prédios crescem com a Estrutura.
      </p>
    </div>
  );
}
