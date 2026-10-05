import type { ReactNode } from "react";
import { formatMoney } from "../engine/finance";
import { age } from "../engine/player";
import { POS_GROUP } from "../engine/positions";
import type { Club, Player, Pos } from "../engine/types";
import { faceSvg } from "./faces";
import { flag } from "./flags";

// ---------------------------------------------------------------- escudo
function luminance(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
export const textOn = (hex: string) => (luminance(hex) > 0.6 ? "#111" : "#fff");

/** Cor do clube visível sobre fundo escuro (evita preto no preto). */
export function visibleColor(colors: string[]): string {
  for (const c of colors) {
    const l = luminance(c);
    if (l > 0.12 && l < 0.93) return c;
  }
  return luminance(colors[0]) <= 0.12 ? "#9aa5a0" : colors[0];
}

const SHIELD = "M50 4 L92 15 V56 C92 87 73 105 50 116 C27 105 8 87 8 56 V15 Z";

function starPath(cx: number, cy: number, r: number) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    d += `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }
  return d + "Z";
}

export function Crest({ club, size = 32 }: { club: Club; size?: number }) {
  if (club.customCrest) {
    return (
      <span className="crest" style={{ width: size, height: size * 1.15 }}>
        <img src={club.customCrest} alt={club.name} />
      </span>
    );
  }
  const [c0, c1, c2] = club.colors;
  const id = `cr-${club.id}`;
  const round = club.crest === "circle";
  const body = (() => {
    switch (club.crest) {
      case "vstripes":
        return [0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={8 + i * 12} y="0" width="12" height="120" fill={i % 2 ? c1 : c0} />);
      case "vstripes3":
        return [0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={8 + i * 12} y="0" width="12" height="120" fill={[c0, c1, c2][i % 3]} />);
      case "hoops":
        return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x="0" y={i * 15} width="100" height="15" fill={i % 2 ? c1 : c0} />);
      case "sash":
        return (<><rect width="100" height="120" fill={c0} /><path d="M-10 10 L20 -10 L120 100 L90 125 Z" fill={c1} /></>);
      case "diagonal":
        return (<><rect width="100" height="120" fill={c0} />{[0, 1, 2, 3].map((i) => <path key={i} d={`M${-40 + i * 36} 120 L${-20 + i * 36} 120 L${60 + i * 36} 0 L${40 + i * 36} 0 Z`} fill={c1} />)}</>);
      case "halves":
        return (<><rect width="50" height="120" fill={c0} /><rect x="50" width="50" height="120" fill={c1} /></>);
      case "band":
        return (<><rect width="100" height="120" fill={c0} /><rect y="40" width="100" height="26" fill={c1} /></>);
      case "triband":
        return (<><rect width="100" height="120" fill={c0} /><rect y="34" width="100" height="12" fill={c1} /><rect y="46" width="100" height="10" fill={c0} /><rect y="56" width="100" height="12" fill={c2} /></>);
      case "star":
        return (<><rect width="100" height="120" fill={c0} /><path d={starPath(50, 52, 26)} fill={c1} /></>);
      case "stars":
        return (<><rect width="100" height="120" fill={c0} />{[[50, 26, 9], [34, 50, 8], [66, 48, 8], [50, 74, 9], [58, 60, 4]].map(([x, y, r], i) => <path key={i} d={starPath(x, y, r)} fill={c1} />)}</>);
      case "chevron":
        return (<><rect width="100" height="120" fill={c0} /><path d="M0 30 L50 70 L100 30 L100 48 L50 88 L0 48 Z" fill={c1} /></>);
      case "cross":
        return (<><rect width="100" height="120" fill={c0} /><rect x="40" width="20" height="120" fill={c1} /><rect y="42" width="100" height="20" fill={c1} /></>);
      default:
        return <rect width="100" height="120" fill={c0} />;
    }
  })();
  const showText = !["star", "stars"].includes(club.crest);
  const textBg = club.crest === "band" ? c1 : c0;
  const plain = ["solid", "circle", "band", "triband"].includes(club.crest);
  return (
    <svg className="crest" width={size} height={size * 1.15} viewBox="0 0 100 120" aria-label={club.name}>
      <defs>
        <clipPath id={id}>{round ? <circle cx="50" cy="58" r="46" /> : <path d={SHIELD} />}</clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{body}</g>
      {round ? (
        <>
          <circle cx="50" cy="58" r="46" fill="none" stroke={c1} strokeWidth="7" />
          <circle cx="50" cy="58" r="49" fill="none" stroke="#0007" strokeWidth="2" />
        </>
      ) : (
        <path d={SHIELD} fill="none" stroke="#0009" strokeWidth="3" />
      )}
      {showText && (
        <text x="50" y={round ? 66 : 60} textAnchor="middle" fontSize={club.abbr.length > 3 ? 22 : 27} fontWeight="900"
          fontFamily="system-ui, sans-serif" fill={plain && luminance(textBg) > 0.6 ? "#111" : "#fff"}
          stroke={plain && luminance(textBg) > 0.6 ? "none" : "#000"} strokeWidth="5" paintOrder="stroke" strokeLinejoin="round">
          {club.abbr}
        </text>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- avatar
export function Avatar({ p, club, season, size = 40 }: { p: Player; club?: Club | null; season: number; size?: number }) {
  const svg = p.photo ? "" : faceSvg(p, club, season);
  return (
    <div className={`avatar${p.legend ? " legend" : ""}`} style={{ width: size, height: size }}>
      {p.photo ? <img src={p.photo} alt={p.name} /> : <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  );
}

// ---------------------------------------------------------------- pequenos
export function Ovr({ v, lg }: { v: number; lg?: boolean }) {
  const cls = v >= 88 ? "o90" : v >= 78 ? "o80" : v >= 70 ? "o70" : v >= 62 ? "o60" : v >= 52 ? "o50" : "o0";
  return <span className={`ovr ${cls}${lg ? " lg" : ""}`}>{v}</span>;
}

export function PosBadge({ pos }: { pos: Pos }) {
  return <span className={`pos ${POS_GROUP[pos]}`}>{pos}</span>;
}

export function Flag({ code }: { code: string }) {
  return <span title={code}>{flag(code)}</span>;
}

export function Money({ v }: { v: number }) {
  return <span className="kbd" style={{ color: v < 0 ? "var(--danger)" : undefined }}>{formatMoney(v)}</span>;
}

export function Bar({ v, color }: { v: number; color?: string }) {
  return (
    <div className="bar">
      <i style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color ?? (v > 75 ? "var(--accent)" : v > 50 ? "var(--warn)" : "var(--danger)") }} />
    </div>
  );
}

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  const full = Math.round(n * 2) / 2;
  return (
    <span style={{ color: "var(--gold)", letterSpacing: 1 }}>
      {Array.from({ length: max }, (_, i) => (i + 1 <= full ? "★" : i + 0.5 === full ? "⯪" : "☆")).join("")}
    </span>
  );
}

export function clubStars(level: number) {
  return Math.max(0.5, Math.min(5, (level - 52) / 5.6));
}

export function Sheet({ onClose, children, title }: { onClose: () => void; children: ReactNode; title?: string }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && <h2 style={{ marginBottom: 10 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function PlayerRow({ p, club, season, right, onClick, showClub }: {
  p: Player; club?: Club | null; season: number; right?: ReactNode; onClick?: () => void; showClub?: boolean;
}) {
  const injured = p.injury > 0;
  const banned = Object.values(p.bans).some((b) => b > 0);
  return (
    <div className="list-item" onClick={onClick}>
      <Avatar p={p} club={club} season={season} size={42} />
      <div className="grow">
        <div className="row gap4">
          <b className="ellipsis">{p.name}</b>
          {p.legend && <span className="tag legend">★</span>}
          {injured && <span className="tag danger">🚑 {p.injury}d</span>}
          {banned && <span className="tag danger">🟥</span>}
          {p.listed && <span className="tag">💲</span>}
        </div>
        <div className="row gap8 small muted" style={{ whiteSpace: "nowrap", minWidth: 0 }}>
          <PosBadge pos={p.pos} />
          <span style={{ flex: "none" }}><Flag code={p.nat} /> {age(p, season)}a</span>
          {showClub && club && <span className="ellipsis" style={{ minWidth: 0 }}>{club.name}</span>}
          {!showClub && <span style={{ width: 46 }}><Bar v={p.cond} /></span>}
        </div>
      </div>
      {right}
      <Ovr v={p.ovr} />
    </div>
  );
}

// ---------------------------------------------------------------- ícones
const PATHS: Record<string, string> = {
  home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  squad: "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm8 1c-3.3 0-6 1.7-6 4v2h12v-2c0-2.3-2.7-4-6-4zm-8 0c-2.8 0-5 1.3-5 3v3h5v-2c0-1.6.7-3 2-4H8z",
  trophy: "M7 4h10v3a5 5 0 0 1-10 0zM5 5H3v2a4 4 0 0 0 4 4M19 5h2v2a4 4 0 0 1-4 4M12 12v4M8 20h8M9 16h6v4H9z",
  market: "M3 7h18l-2 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 7a4 4 0 0 1 8 0",
  club: "M4 21V9l8-5 8 5v12M9 21v-6h6v6M2 21h20",
  back: "M15 5l-7 7 7 7",
  play: "M8 5v14l11-7z",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  gear: "M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm9 4-2.1.8a7 7 0 0 1-.6 1.5l.9 2-1.4 1.4-2-.9a7 7 0 0 1-1.5.6L13.5 21h-3l-.8-2.1a7 7 0 0 1-1.5-.6l-2 .9-1.4-1.4.9-2a7 7 0 0 1-.6-1.5L3 13.5v-3l2.1-.8a7 7 0 0 1 .6-1.5l-.9-2 1.4-1.4 2 .9a7 7 0 0 1 1.5-.6L10.5 3h3l.8 2.1a7 7 0 0 1 1.5.6l2-.9 1.4 1.4-.9 2a7 7 0 0 1 .6 1.5L21 10.5z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  pause: "M7 5h4v14H7zM13 5h4v14h-4z",
  ff: "M4 6v12l8-6zM12 6v12l8-6z",
  swap: "M7 7h13l-3-3M17 17H4l3 3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};

export function Icon({ name, size = 22, fill = false }: { name: keyof typeof PATHS | string; size?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={fill ? 0 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
