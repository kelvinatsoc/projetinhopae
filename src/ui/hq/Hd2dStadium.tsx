// Renderizador de Estádio Vivo em estilo HD-2D (Sea of Stars / Pocket League Story / Octopath Traveler)
// Utiliza o motor Hd2dWorldCanvas a 60 FPS com iluminação volumétrica, sinalizadores nas cores do clube,
// atletas aquecendo no gramado e vaga-lumes atmosféricos.
import type { Club, StadiumLook } from "../../engine/types";
import { getWorld } from "../../store";
import { visibleColor } from "../components";
import { Hd2dWorldCanvas, type Hd2dStadiumVariant, type Hd2dTimeOfDay } from "./Hd2dWorldCanvas";

export type { Hd2dTimeOfDay, Hd2dStadiumVariant };

interface Hd2dStadiumProps {
  club: Club;
  look?: StadiumLook | null;
  timeOfDay?: Hd2dTimeOfDay;
  variant?: Hd2dStadiumVariant;
  width?: number | string;
  height?: number | string;
  showSpotlights?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  stadiumName?: string;
  capacity?: number;
}

export function Hd2dStadium({
  club,
  look,
  timeOfDay = "night",
  variant = "auto",
  width = "100%",
  height = 240,
  interactive = false,
  onClick,
  stadiumName,
  capacity,
}: Hd2dStadiumProps) {
  const c1 = visibleColor(club.colors);
  const c2 = club.colors.find((c) => c.toLowerCase() !== c1.toLowerCase()) ?? "#ffffff";
  const seatPrimary = look?.seats?.[0] ?? c1;
  const seatSecondary = look?.seats?.[1] ?? c2;

  const name = stadiumName || club.stadium || "Estádio do Clube";
  const cap = capacity || club.capacity || 50000;
  const world = getWorld();

  return (
    <div
      className={`hd2d-stadium-wrap ${interactive ? "is-interactive" : ""}`}
      onClick={onClick}
      style={{
        width,
        height,
        position: "relative",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid rgba(250, 204, 21, 0.28)",
        background: "#090d16",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 12px 30px rgba(0,0,0,0.62)",
        cursor: interactive || onClick ? "pointer" : "default",
      }}
    >
      <Hd2dWorldCanvas
        club={club}
        world={world}
        site="stadium"
        timeOfDay={timeOfDay}
        variant={variant}
        look={look}
        height="100%"
      />

      {/* Badge Superior Esquerdo: Identidade RPG HD-2D */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "12px",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "rgba(9, 13, 22, 0.84)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(250, 204, 21, 0.35)",
          padding: "3px 10px",
          borderRadius: "999px",
          fontSize: "10.5px",
          fontWeight: 800,
          color: "#fef08a",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: seatPrimary,
            border: `1.5px solid ${seatSecondary}`,
            display: "inline-block",
          }}
        />
        <span>Mundo HD-2D Ao Vivo</span>
      </div>

      {/* Badge Inferior Esquerdo: Nome Oficial do Estádio e Lotação */}
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          left: "12px",
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(9, 13, 22, 0.88)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.22)",
          padding: "5px 12px",
          borderRadius: "9px",
          fontSize: "12px",
          fontWeight: 800,
          color: "#f8fafc",
          letterSpacing: "0.02em",
          boxShadow: "0 4px 14px rgba(0,0,0,0.55)",
          pointerEvents: "none",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", boxShadow: "0 0 8px #22c55e" }} />
        <span>{name}</span>
        <span style={{ color: "#cbd5e1", fontWeight: 600 }}>· {cap.toLocaleString("pt-BR")} lugares</span>
      </div>

      {interactive && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            right: "12px",
            background: "rgba(234, 179, 8, 0.22)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(250, 204, 21, 0.6)",
            color: "#fef08a",
            padding: "5px 11px",
            borderRadius: "9px",
            fontSize: "11px",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            pointerEvents: "none",
          }}
        >
          Explorar Estádio ›
        </div>
      )}
    </div>
  );
}
