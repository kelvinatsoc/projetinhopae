// Renderizador de Estádio em estilo HD-2D (Sea of Stars / Octopath Traveler / RPG 16-32bit moderno)
// Usa artes isométricas em pixel art de alta definição (dioramas HD-2D com iluminação volumétrica,
// tilt-shift e arquibancadas vivas) combinadas com efeitos atmosféricos dinâmicos.
import { useMemo } from "react";
import type { Club, StadiumLook } from "../../engine/types";
import { visibleColor } from "../components";
import { mediaUrl } from "../mediaUrl";

export type Hd2dTimeOfDay = "day" | "sunset" | "night";
export type Hd2dStadiumVariant = "auto" | "morumbis" | "arena" | "caldeirao";

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

const ARENA_CLUBS = new Set([
  "flamengo",
  "fluminense",
  "palmeiras",
  "corinthians",
  "atletico_mg",
  "gremio",
  "internacional",
  "athletico_pr",
  "bahia",
  "fortaleza",
  "botafogo",
  "cruzeiro",
]);

const CALDEIRAO_CLUBS = new Set([
  "santos",
  "vasco",
  "vitoria",
  "juventude",
  "criciuma",
  "atletico_go",
  "bragantino",
  "remo",
  "paysandu",
]);

export function Hd2dStadium({
  club,
  look,
  timeOfDay = "night",
  variant = "auto",
  width = "100%",
  height = 240,
  showSpotlights = true,
  interactive = false,
  onClick,
  stadiumName,
  capacity,
}: Hd2dStadiumProps) {
  const c1 = visibleColor(club.colors);
  const c2 = club.colors.find((c) => c.toLowerCase() !== c1.toLowerCase()) ?? "#ffffff";
  const seatPrimary = look?.seats?.[0] ?? c1;
  const seatSecondary = look?.seats?.[1] ?? c2;
  const roofType = look?.roof?.type;
  const facadeType = look?.facade?.type;

  const artworkPath = useMemo(() => {
    if (variant === "arena") return mediaUrl("hd2d/stadium-arena.jpg");
    if (variant === "caldeirao") return mediaUrl("hd2d/stadium-caldeirao.jpg");
    if (variant === "morumbis") {
      if (timeOfDay === "day") return mediaUrl("hd2d/stadium-day.jpg");
      if (timeOfDay === "sunset") return mediaUrl("hd2d/stadium-sunset.jpg");
      return mediaUrl("hd2d/stadium-night.jpg");
    }

    // Seleção inteligente pelo estilo de cobertura/fachada ou identidade do clube
    if (timeOfDay === "day") return mediaUrl("hd2d/stadium-day.jpg");
    if (timeOfDay === "sunset") return mediaUrl("hd2d/stadium-sunset.jpg");

    if (roofType === "none" || roofType === "canopy" || facadeType === "classic") {
      return mediaUrl("hd2d/stadium-caldeirao.jpg");
    }
    if (roofType === "box" || roofType === "petals" || facadeType === "glass" || facadeType === "membrane") {
      return mediaUrl("hd2d/stadium-arena.jpg");
    }
    if (club.id === "sao_paulo" || club.id === "sao-paulo") return mediaUrl("hd2d/stadium-night.jpg");
    if (CALDEIRAO_CLUBS.has(club.id) || (club.capacity && club.capacity < 32000)) {
      return mediaUrl("hd2d/stadium-caldeirao.jpg");
    }
    if (ARENA_CLUBS.has(club.id)) {
      return mediaUrl("hd2d/stadium-arena.jpg");
    }
    return mediaUrl("hd2d/stadium-night.jpg");
  }, [club.id, club.capacity, timeOfDay, variant, roofType, facadeType]);

  const name = stadiumName || club.stadium || "Estádio do Clube";
  const cap = capacity || club.capacity || 50000;

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
        border: "1px solid rgba(255, 255, 255, 0.18)",
        background: "#090d16",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 28px rgba(0,0,0,0.55)",
        cursor: interactive || onClick ? "pointer" : "default",
      }}
    >
      {/* Imagem Principal do Diorama HD-2D */}
      <img
        src={artworkPath}
        alt={name}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 46%",
          display: "block",
          filter:
            timeOfDay === "day"
              ? "saturate(1.1) contrast(1.04)"
              : timeOfDay === "sunset"
              ? "saturate(1.15) contrast(1.06)"
              : "saturate(1.12) contrast(1.05)",
        }}
      />

      {/* Iluminação Volumétrica & Vinheta Cinematográfica estilo Sea of Stars */}
      {showSpotlights && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              timeOfDay === "night"
                ? `radial-gradient(circle at 50% 42%, transparent 35%, rgba(2, 6, 23, 0.55) 100%), linear-gradient(180deg, rgba(254, 240, 138, 0.08) 0%, transparent 45%, rgba(2, 6, 23, 0.72) 100%)`
                : timeOfDay === "sunset"
                ? `radial-gradient(circle at 50% 35%, rgba(251, 146, 60, 0.14) 0%, rgba(15, 23, 42, 0.55) 100%), linear-gradient(180deg, transparent 50%, rgba(9, 13, 22, 0.75) 100%)`
                : `linear-gradient(180deg, transparent 55%, rgba(9, 13, 22, 0.7) 100%)`,
          }}
        />
      )}

      {/* Faixa de Identidade nas Cores do Clube / Reforma */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "12px",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "rgba(9, 13, 22, 0.78)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          padding: "3px 9px",
          borderRadius: "999px",
          fontSize: "10.5px",
          fontWeight: 800,
          color: "#f8fafc",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
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
        <span>HD-2D Diorama</span>
      </div>

      {/* Badge Flutuante Inferior com Naming Rights e Capacidade */}
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          left: "12px",
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(9, 13, 22, 0.86)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          padding: "5px 11px",
          borderRadius: "9px",
          fontSize: "12px",
          fontWeight: 700,
          color: "#f8fafc",
          letterSpacing: "0.02em",
          boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", boxShadow: "0 0 8px #22c55e" }} />
        <span>{name}</span>
        <span style={{ color: "var(--muted, #cbd5e1)", fontWeight: 500 }}>· {cap.toLocaleString("pt-BR")} lugares</span>
      </div>

      {interactive && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            right: "12px",
            background: "rgba(34, 197, 94, 0.24)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(74, 222, 128, 0.55)",
            color: "#86efac",
            padding: "5px 11px",
            borderRadius: "9px",
            fontSize: "11px",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Gerenciar Estádio ›
        </div>
      )}
    </div>
  );
}
