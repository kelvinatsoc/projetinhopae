// Mapa e Complexo do Clube em estilo 2D HD (Sea of Stars / Final Fantasy / RPG Moderno)
// Focado nos 3 núcleos fundamentais: Estádio Principal, CT Profissional e Categorias de Base (Cotia).
import type { ReactNode } from "react";
import type { Club } from "../../engine/types";
import { Hd2dComplex } from "./Hd2dComplex";
import "./hq.css";

export function ClubHQ({ club, matchToday = false }: { club: Club; matchToday?: boolean; fallback?: ReactNode }) {
  return <Hd2dComplex club={club} matchToday={matchToday} />;
}
