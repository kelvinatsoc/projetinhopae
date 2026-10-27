// Renderizador de Estádio em estilo HD-2D (Sea of Stars / Final Fantasy / RPG 16-32bit moderno)
// Exibe o estádio em perspectiva isométrica detalhada com gramado listrado, anéis de arquibancada,
// cobertura personalizável, torres de refletores com iluminação volumétrica e placar retro-digital.
import { useMemo } from "react";
import type { Club, StadiumLook } from "../../engine/types";
import { visibleColor } from "../components";

export type Hd2dTimeOfDay = "day" | "sunset" | "night";

interface Hd2dStadiumProps {
  club: Club;
  look?: StadiumLook | null;
  timeOfDay?: Hd2dTimeOfDay;
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
  const c3 = club.colors[2] ?? "#111111";

  const seatPrimary = look?.seats?.[0] ?? c1;
  const seatSecondary = look?.seats?.[1] ?? c2;
  const roofType = look?.roof?.type ?? "ring";
  const roofColor = look?.roof?.color ?? "#e2e8f0";
  const facadeType = look?.facade?.type ?? "columns";
  const facadeColor = look?.facade?.color ?? "#94a3b8";
  const screens = look?.screens ?? 2;
  const hasExtraTier = look?.extraTier ?? false;

  // Paleta de iluminação por horário estilo Sea of Stars
  const lighting = useMemo(() => {
    switch (timeOfDay) {
      case "day":
        return {
          skyGradient: ["#38bdf8", "#0284c7", "#0369a1"],
          ambient: "rgba(255, 255, 255, 0.95)",
          grassLight: "#22c55e",
          grassDark: "#16a34a",
          standShadow: "rgba(15, 23, 42, 0.35)",
          floodlightGlow: "rgba(255, 255, 255, 0.25)",
          spotlightOpacity: 0.15,
          sunRay: "rgba(255, 245, 200, 0.35)",
        };
      case "sunset":
        return {
          skyGradient: ["#fb923c", "#db2777", "#4c1d95"],
          ambient: "rgba(251, 146, 60, 0.85)",
          grassLight: "#15803d",
          grassDark: "#166534",
          standShadow: "rgba(30, 10, 50, 0.55)",
          floodlightGlow: "rgba(254, 215, 170, 0.65)",
          spotlightOpacity: 0.4,
          sunRay: "rgba(251, 191, 36, 0.4)",
        };
      case "night":
      default:
        return {
          skyGradient: ["#0f172a", "#090d16", "#020617"],
          ambient: "rgba(148, 163, 184, 0.3)",
          grassLight: "#16a34a",
          grassDark: "#15803d",
          standShadow: "rgba(0, 0, 0, 0.75)",
          floodlightGlow: "rgba(254, 240, 138, 0.85)",
          spotlightOpacity: 0.65,
          sunRay: "transparent",
        };
    }
  }, [timeOfDay]);

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
        border: "1px solid rgba(255, 255, 255, 0.14)",
        background: `radial-gradient(ellipse at 50% 20%, ${lighting.skyGradient[0]} 0%, ${lighting.skyGradient[1]} 60%, ${lighting.skyGradient[2]} 100%)`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.45)",
      }}
    >
      <svg
        viewBox="0 0 600 360"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          {/* Efeito Pixel Art Dithering / Filtro HD-2D */}
          <filter id="hd2d-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Gradiente do Gramado */}
          <linearGradient id="grass-stripe" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={lighting.grassLight} />
            <stop offset="100%" stopColor={lighting.grassDark} />
          </linearGradient>

          {/* Feixes de Luz dos Refletores */}
          <linearGradient id="spotlight-beam" x1="0%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={lighting.floodlightGlow} stopOpacity={lighting.spotlightOpacity} />
            <stop offset="100%" stopColor={lighting.floodlightGlow} stopOpacity="0" />
          </linearGradient>

          {/* Gradiente da Cobertura */}
          <linearGradient id="roof-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={roofColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor="#334155" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        {/* 1. Céu com estrelas ou raios no estilo Sea of Stars */}
        {timeOfDay === "night" && (
          <g className="hd2d-stars" opacity="0.75">
            <circle cx="80" cy="40" r="1.5" fill="#ffffff" />
            <circle cx="160" cy="25" r="1" fill="#cbd5e1" />
            <circle cx="280" cy="50" r="1.5" fill="#fef08a" />
            <circle cx="390" cy="30" r="1.2" fill="#ffffff" />
            <circle cx="480" cy="65" r="1" fill="#cbd5e1" />
            <circle cx="530" cy="35" r="1.8" fill="#fef08a" />
            <circle cx="210" cy="70" r="1" fill="#ffffff" />
            <circle cx="340" cy="20" r="1.2" fill="#ffffff" />
          </g>
        )}

        {/* 2. Base do Terreno e Calçadão Isométrico */}
        <polygon
          points="300,90 550,195 300,310 50,195"
          fill="#1e293b"
          stroke="#334155"
          strokeWidth="2"
        />
        <polygon
          points="50,195 300,310 300,335 50,220"
          fill="#0f172a"
        />
        <polygon
          points="550,195 300,310 300,335 550,220"
          fill="#090d16"
        />

        {/* 3. Anel Externo da Fachada / Estrutura do Estádio */}
        <ellipse
          cx="300"
          cy="200"
          rx="220"
          ry="115"
          fill={facadeType === "glass" ? "#0369a1" : facadeColor}
          stroke="#1e293b"
          strokeWidth="3"
        />
        {/* Pilares da Fachada se aplicável */}
        {facadeType === "columns" && (
          <g stroke="#0f172a" strokeWidth="2" opacity="0.65">
            <line x1="120" y1="200" x2="120" y2="235" />
            <line x1="170" y1="230" x2="170" y2="265" />
            <line x1="240" y1="255" x2="240" y2="295" />
            <line x1="360" y1="255" x2="360" y2="295" />
            <line x1="430" y1="230" x2="430" y2="265" />
            <line x1="480" y1="200" x2="480" y2="235" />
          </g>
        )}

        {/* 4. Anel das Arquibancadas (Tiers) */}
        {/* Anel Inferior / Médio */}
        <ellipse
          cx="300"
          cy="198"
          rx="195"
          ry="98"
          fill={seatPrimary}
          stroke={lighting.standShadow}
          strokeWidth="4"
        />
        {/* Anel Superior com cor secundária (Bandeiras / Setores) */}
        <path
          d="M 125,185 C 125,120 475,120 475,185 C 475,160 125,160 125,185 Z"
          fill={seatSecondary}
          opacity="0.9"
        />
        {hasExtraTier && (
          <ellipse
            cx="300"
            cy="192"
            rx="180"
            ry="88"
            fill={seatPrimary}
            stroke={c3}
            strokeWidth="2"
          />
        )}

        {/* 5. Fosso / Pista Atlética em volta do campo */}
        <polygon
          points="300,135 460,200 300,265 140,200"
          fill="#991b1b"
          opacity="0.85"
        />

        {/* 6. Gramado Isométrico HD-2D (com faixas de corte estilo Sea of Stars) */}
        <g id="pitch">
          <polygon
            points="300,140 450,200 300,260 150,200"
            fill="url(#grass-stripe)"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          {/* Faixas de corte da grama */}
          <polygon points="300,140 337,155 187,215 150,200" fill={lighting.grassLight} opacity="0.4" />
          <polygon points="375,170 412,185 262,245 225,230" fill={lighting.grassLight} opacity="0.4" />
          <polygon points="412,185 450,200 300,260 262,245" fill={lighting.grassLight} opacity="0.4" />

          {/* Marcações do Campo em Isometria */}
          {/* Círculo Central */}
          <ellipse cx="300" cy="200" rx="28" ry="12" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.9" />
          <line x1="225" y1="170" x2="375" y2="230" stroke="#ffffff" strokeWidth="1.2" opacity="0.9" />

          {/* Áreas de Gol */}
          {/* Área Superior / Esquerda */}
          <polygon points="262,155 300,170 270,182 232,167" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.85" />
          {/* Trave 1 */}
          <line x1="247" y1="161" x2="247" y2="152" stroke="#ffffff" strokeWidth="2" />
          <line x1="257" y1="165" x2="257" y2="156" stroke="#ffffff" strokeWidth="2" />
          <line x1="247" y1="152" x2="257" y2="156" stroke="#ffffff" strokeWidth="2" />

          {/* Área Inferior / Direita */}
          <polygon points="338,245 300,230 330,218 368,233" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.85" />
          {/* Trave 2 */}
          <line x1="343" y1="243" x2="343" y2="234" stroke="#ffffff" strokeWidth="2" />
          <line x1="353" y1="247" x2="353" y2="238" stroke="#ffffff" strokeWidth="2" />
          <line x1="343" y1="234" x2="353" y2="238" stroke="#ffffff" strokeWidth="2" />

          {/* Bancos de Reservas */}
          <rect x="230" y="196" width="18" height="5" rx="1" fill="#3b82f6" />
          <rect x="352" y="196" width="18" height="5" rx="1" fill="#ef4444" />
        </g>

        {/* 7. Telões Digitais (Screens) */}
        {screens >= 1 && (
          <g id="screen-north" transform="translate(265, 88)">
            <rect x="0" y="0" width="70" height="24" rx="2" fill="#020617" stroke="#38bdf8" strokeWidth="1" />
            <text x="35" y="11" fill="#38bdf8" fontSize="6.5" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">
              {name.substring(0, 14).toUpperCase()}
            </text>
            <text x="35" y="20" fill="#22c55e" fontSize="5.5" fontWeight="700" textAnchor="middle" fontFamily="monospace">
              {cap.toLocaleString("pt-BR")} LUG
            </text>
          </g>
        )}
        {screens >= 2 && (
          <g id="screen-south" transform="translate(265, 290)">
            <rect x="0" y="0" width="70" height="20" rx="2" fill="#020617" stroke={c1} strokeWidth="1" />
            <text x="35" y="13" fill="#facc15" fontSize="7" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">
              ★ {club.name.substring(0, 12).toUpperCase()} ★
            </text>
          </g>
        )}

        {/* 8. Cobertura (Roof) em Estilo Sea of Stars */}
        {roofType === "ring" && (
          <path
            d="M 90,185 C 90,80 510,80 510,185 C 470,185 460,115 300,115 C 140,115 130,185 90,185 Z"
            fill="url(#roof-grad)"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
            opacity="0.88"
          />
        )}
        {roofType === "box" && (
          <polygon
            points="100,120 500,120 460,175 140,175"
            fill="url(#roof-grad)"
            stroke="#ffffff"
            strokeWidth="1.5"
            opacity="0.9"
          />
        )}
        {roofType === "canopy" && (
          <path
            d="M 120,165 C 120,95 380,95 440,155 C 380,140 180,140 120,165 Z"
            fill="url(#roof-grad)"
            stroke="#ffffff"
            strokeWidth="1.5"
            opacity="0.92"
          />
        )}
        {roofType === "petals" && (
          <g fill="url(#roof-grad)" stroke="#ffffff" strokeWidth="1" opacity="0.9">
            <path d="M 140,140 Q 220,90 260,135 Z" />
            <path d="M 240,120 Q 300,75 360,120 Z" />
            <path d="M 340,135 Q 380,90 460,140 Z" />
          </g>
        )}

        {/* 9. Torres de Refletores (4 Mastros de Iluminação) */}
        {/* Torre Noroeste */}
        <g id="tower-nw" transform="translate(100, 110)">
          <line x1="0" y1="60" x2="10" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="20" y1="60" x2="10" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="0" y1="40" x2="20" y2="40" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="5" y1="20" x2="15" y2="20" stroke="#cbd5e1" strokeWidth="1.5" />
          <rect x="0" y="-8" width="20" height="9" rx="1" fill="#020617" stroke="#facc15" strokeWidth="1" />
          <circle cx="10" cy="-4" r="5" fill={lighting.floodlightGlow} filter="url(#hd2d-glow)" />
        </g>

        {/* Torre Nordeste */}
        <g id="tower-ne" transform="translate(480, 110)">
          <line x1="0" y1="60" x2="10" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="20" y1="60" x2="10" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="0" y1="40" x2="20" y2="40" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="5" y1="20" x2="15" y2="20" stroke="#cbd5e1" strokeWidth="1.5" />
          <rect x="0" y="-8" width="20" height="9" rx="1" fill="#020617" stroke="#facc15" strokeWidth="1" />
          <circle cx="10" cy="-4" r="5" fill={lighting.floodlightGlow} filter="url(#hd2d-glow)" />
        </g>

        {/* Torre Sudoeste */}
        <g id="tower-sw" transform="translate(80, 225)">
          <line x1="0" y1="60" x2="10" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="20" y1="60" x2="10" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="0" y1="40" x2="20" y2="40" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="5" y1="20" x2="15" y2="20" stroke="#cbd5e1" strokeWidth="1.5" />
          <rect x="0" y="-8" width="20" height="9" rx="1" fill="#020617" stroke="#facc15" strokeWidth="1" />
          <circle cx="10" cy="-4" r="5" fill={lighting.floodlightGlow} filter="url(#hd2d-glow)" />
        </g>

        {/* Torre Sudeste */}
        <g id="tower-se" transform="translate(500, 225)">
          <line x1="0" y1="60" x2="10" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="20" y1="60" x2="10" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="0" y1="40" x2="20" y2="40" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="5" y1="20" x2="15" y2="20" stroke="#cbd5e1" strokeWidth="1.5" />
          <rect x="0" y="-8" width="20" height="9" rx="1" fill="#020617" stroke="#facc15" strokeWidth="1" />
          <circle cx="10" cy="-4" r="5" fill={lighting.floodlightGlow} filter="url(#hd2d-glow)" />
        </g>

        {/* 10. Feixes Volumétricos de Luz (Spotlights) cruzando o gramado */}
        {showSpotlights && (
          <g className="hd2d-spotlight-beams" pointerEvents="none">
            {/* Feixe NW */}
            <polygon points="110,105 280,180 340,220" fill="url(#spotlight-beam)" />
            {/* Feixe NE */}
            <polygon points="490,105 320,180 260,220" fill="url(#spotlight-beam)" />
            {/* Feixe SW */}
            <polygon points="90,220 250,190 320,240" fill="url(#spotlight-beam)" />
            {/* Feixe SE */}
            <polygon points="510,220 350,190 280,240" fill="url(#spotlight-beam)" />
          </g>
        )}

        {/* 11. Bandeirinhas tremulando nas cores do clube */}
        <g id="flags" opacity="0.9">
          <path d="M 170,120 L 178,116 L 170,112 Z" fill={c1} />
          <line x1="170" y1="112" x2="170" y2="128" stroke="#ffffff" strokeWidth="1" />
          <path d="M 430,120 L 438,116 L 430,112 Z" fill={c2} />
          <line x1="430" y1="112" x2="430" y2="128" stroke="#ffffff" strokeWidth="1" />
        </g>
      </svg>

      {/* Badge Flutuante no Topo com Naming Rights / Capacidade */}
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          left: "12px",
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.16)",
          padding: "4px 10px",
          borderRadius: "8px",
          fontSize: "12px",
          fontWeight: 700,
          color: "#f8fafc",
          letterSpacing: "0.02em",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
        <span>{name}</span>
        <span style={{ color: "var(--muted, #94a3b8)", fontWeight: 400 }}>· {cap.toLocaleString("pt-BR")} lugares</span>
      </div>

      {interactive && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            right: "12px",
            background: "rgba(34, 197, 94, 0.2)",
            border: "1px solid rgba(34, 197, 94, 0.5)",
            color: "#4ade80",
            padding: "4px 10px",
            borderRadius: "8px",
            fontSize: "11px",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Toque para Gerenciar ›
        </div>
      )}
    </div>
  );
}
