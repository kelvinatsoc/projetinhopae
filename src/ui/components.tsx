import { useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Award,
  Bell,
  Binoculars,
  BookOpen,
  Briefcase,
  BriefcaseMedical,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleDot,
  ClipboardList,
  Clock,
  Coins,
  Compass,
  Cone,
  DoorOpen,
  Download,
  Dumbbell,
  FastForward,
  Feather,
  FileText,
  Film,
  Flame,
  Grid2x2,
  Hammer,
  Handshake,
  Heart,
  Home,
  Landmark,
  LayoutList,
  Lightbulb,
  Link2,
  Lock,
  Luggage,
  Mail,
  Medal,
  Megaphone,
  Menu,
  MessageSquare,
  Mic,
  Newspaper,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  ScrollText,
  Search,
  Settings,
  Shield,
  Shirt,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Sprout,
  Square,
  Star,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Tv,
  User,
  UserCheck,
  Users,
  Wind,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { formatMoney } from "../engine/finance";
import { ratingColor, streakOf, trendOf } from "../engine/form";
import { playerImagePath, sportsdbUrl } from "../engine/media";
import { age, playerValue } from "../engine/player";
import { POS_GROUP } from "../engine/positions";
import { roleAt, type RoleDef } from "../engine/tactics";
import type { Club, Player, Pos, World } from "../engine/types";
import { faceSvg } from "./faces";
import { flag } from "./flags";
import "./media.css";
import { compKey } from "./trophies";
import { mediaUrlOrNull } from "./mediaUrl";
import { DUO, GameIcon, type IconSlug } from "./icons";
import { PlayerBadges } from "./PlayerBadges";

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
  const [broken, setBroken] = useState<string | null>(null);
  const logo = club.customCrest ?? mediaUrlOrNull(club.id ? `crests/${club.id}.webp` : null);
  const src = logo;
  if (src && broken !== src) {
    return (
      <span className="crest" style={{ width: size, height: size * 1.15 }}>
        <img src={src} alt={club.name} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(src)} />
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
/**
 * Foto do jogador: foto do usuário > foto do TheSportsDB (online, conferida com o clube atual) >
 * foto real empacotada (Wikimedia Commons, às vezes com a camisa de um clube antigo) > rosto realista
 * de regen. Se uma imagem falhar (ex.: sem internet), passa para a próxima. Jogador real sem foto livre aparece como silhueta com a camisa do clube (como nos apps
 * oficiais), a não ser que o usuário prefira rostos ilustrados.
 */
export function Avatar({ p, club, season, size = 40 }: { p: Player; club?: Club | null; season: number; size?: number }) {
  const [broken, setBroken] = useState<string[]>([]);
  const cands = p.photo ? [p.photo] : [mediaUrlOrNull(playerImagePath(p)), sportsdbUrl(p)];
  const src = cands.find((u): u is string => !!u && !broken.includes(u));
  const star = p.ovr >= 80;
  const cls = `avatar${p.legend ? " legend" : star ? " star" : ""}${src && src === sportsdbUrl(p) ? " ext" : ""}`;
  if (src) {
    return (
      <div className={cls} style={{ width: size, height: size }}>
        <img key={src} src={src} alt={p.name} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setBroken((b) => [...b, src])} />
      </div>
    );
  }

  const svg = faceSvg(p, club, season);
  return (
    <div className={cls} style={{ width: size, height: size }}>
      <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

/** Silhueta neutra vestindo a cor principal do clube. */
export function Silhouette({ club }: { club?: Club | null }) {
  const shirt = club?.colors[0] ?? "#1e293b";
  const trim = club ? (luminance(club.colors[1]) !== luminance(shirt) ? club.colors[1] : club.colors[2]) : "#cbd5e1";
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <radialGradient id="sil-glow" cx="50%" cy="32%" r="65%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#090d16" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#sil-glow)" />
      <rect x="43" y="46" width="14" height="14" rx="5" fill="#64748b" />
      <ellipse cx="50" cy="34" rx="16" ry="18" fill="#94a3b8" />
      <path d="M50 56C28 56 14 66 11 84L8 100H92L89 84C86 66 72 56 50 56Z" fill={shirt} stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" />
      <path d="M41 57L50 67L59 57" fill="none" stroke={trim} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Foto real do estádio (Wikimedia Commons), com nome e capacidade por cima. */
/** Endereço da foto do estádio (ou null se o clube não tiver). */
export function stadiumSrc(club: { stadiumImg?: string }): string | null {
  return mediaUrlOrNull(club.stadiumImg ? `stadiums/${club.stadiumImg}.webp` : null);
}

export function StadiumPhoto({ club }: { club: Club }) {
  const [broken, setBroken] = useState(false);
  const src = mediaUrlOrNull(club.stadiumImg ? `stadiums/${club.stadiumImg}.webp` : null);
  if (!src || broken) return null;
  return (
    <div className="stadium-photo">
      <img src={src} alt={club.stadium} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      <div className="stadium-caption">
        <b>{club.stadium}</b>
        <span>{club.capacity ? `${club.capacity.toLocaleString("pt-BR")} lugares · ` : ""}{club.city}</span>
      </div>
    </div>
  );
}

/** Logo oficial de uma competição (ou nada, se não houver arquivo). */
export function CompLogo({ id, size = 24, fallback = null }: { id: string; size?: number; fallback?: ReactNode }) {
  const [broken, setBroken] = useState(false);
  const src = mediaUrlOrNull(`comps/${compKey(id)}.webp`);
  if (broken || !src) return <>{fallback}</>;
  return <img className="comp-logo" src={src} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />;
}

// ---------------------------------------------------------------- pequenos
export function Ovr({ v, lg }: { v: number; lg?: boolean }) {
  const cls = v >= 88 ? "o90" : v >= 78 ? "o80" : v >= 70 ? "o70" : v >= 62 ? "o60" : v >= 52 ? "o50" : "o0";
  return <span className={`ovr ${cls}${lg ? " lg" : ""}`}>{v}</span>;
}

/** Cor da carta pelo overall (álbum de figurinhas). */
export function cardTier(p: Player): string {
  return p.legend ? "legend" : p.ovr >= 78 ? "gold" : p.ovr >= 66 ? "silver" : "bronze";
}

/** Carta de jogador estilo álbum: overall, posição, rosto, nome e condição. */
export function PlayerCard({ p, club, season, starter, onClick, delay = 0, mood }: {
  p: Player; club?: Club | null; season: number; starter?: boolean; onClick?: () => void; delay?: number; mood?: ReactNode;
}) {
  const injured = p.injury > 0;
  const banned = Object.values(p.bans).some((b) => b > 0);
  return (
    <div data-player className={`pcard ${cardTier(p)}`} onClick={onClick} style={{ animationDelay: `${Math.min(delay, 20) * 25}ms` }}>
      <div className="pc-photo"><Avatar p={p} club={club} season={season} size={96} /></div>
      <div className="pc-rate"><span className="pc-ovr">{p.ovr}</span><span className="pc-pos">{p.pos}</span></div>
      {starter && <span className="pc-xi">XI</span>}
      <div className="pc-flags">
        {injured && <span title="Lesionado" className="pc-flag-badge danger"><Icon name="crossMedical" size={12} fill /></span>}
        {banned && <span title="Suspenso" className="pc-flag-badge danger"><Icon name="cardRed" size={12} fill /></span>}
        {p.listed && <span title="À venda" className="pc-flag-badge gold"><Icon name="priceTag" size={12} /></span>}
        {streakOf(p) === "hot" && <span title="Em alta" className="pc-flag-badge hot"><Icon name="flameTactical" size={12} fill /></span>}
        {streakOf(p) === "cold" && <span title="Em baixa" className="pc-flag-badge cold"><Icon name="coldForm" size={12} /></span>}
        {p.fav && <span title="Ídolo da torcida" className="pc-flag-badge fav"><Icon name="heartIdol" size={12} fill /></span>}
        {mood && <span className="pc-mood">{mood}</span>}
      </div>
      <div className="pc-foot">
        <div className="pc-name">{p.name.split(" ").slice(-1)[0]}</div>
        <div className="pc-meta"><span>{flag(p.nat)}</span><span>{age(p, season)}a</span><span>{formatMoney(p.wage)}</span></div>
        <div className="pc-cond"><i style={{ width: `${p.cond}%`, background: p.cond < 60 ? "#ff6b6b" : p.cond < 80 ? "#ffc145" : undefined }} /></div>
      </div>
    </div>
  );
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

export function Stars({ n, max = 5, half }: { n: number; max?: number; half?: boolean }) {
  if (half) {
    // meias estrelas (aptidão por função): ★★★⯪☆
    const full = Math.floor(n), h = n - full >= 0.5 ? 1 : 0;
    return <span className="stars" aria-label={`${n} de ${max} estrelas`} style={{ color: "var(--gold)", letterSpacing: 1 }}>{"★".repeat(full)}{h ? "⯪" : ""}{"☆".repeat(Math.max(0, max - full - h))}</span>;
  }
  const full = Math.max(1, Math.round(n));
  return <span style={{ color: "var(--gold)", letterSpacing: 1 }}>{"★".repeat(full)}{"☆".repeat(Math.max(0, max - full))}</span>;
}

/** Bolinhas das últimas 5 notas (mais antiga à esquerda). */
export function FormDots({ p, size = 22 }: { p: Player; size?: number }) {
  const f = p.form.slice(-5);
  return (
    <span className="form-dots" aria-label={`Últimas notas: ${f.map((x) => x.toFixed(1)).join(", ") || "sem jogos"}`}>
      {Array.from({ length: 5 }, (_, i) => {
        const r = f[i - (5 - f.length)];
        return r == null
          ? <i key={i} className="fd empty" style={{ width: size, height: size }} />
          : <i key={i} className="fd" style={{ width: size, height: size, background: ratingColor(r), fontSize: size * 0.45 }}>{r.toFixed(1)}</i>;
      })}
    </span>
  );
}

/** Seta "em evolução / em queda" (combina treino mensal e fase). */
export function TrendArrow({ p, label }: { p: Player; label?: boolean }) {
  const t = trendOf(p);
  const s = streakOf(p);
  const txt = t === "up" ? "Em evolução" : t === "down" ? "Em queda" : "Estável";
  return (
    <span className={`trend-arrow ${t ?? "flat"}`} title={txt}>
      {t === "up" ? "↗" : t === "down" ? "↘" : "→"}{label ? ` ${txt}` : ""}{s === "hot" ? " 🔥" : s === "cold" ? " 🧊" : ""}
    </span>
  );
}

/** Setinha de variação desde o último jogo (▲3 / ▼2 / =). Sem referência, não mostra nada. */
export function DeltaTag({ d, what = "desde o último jogo" }: { d: number | null; what?: string }) {
  if (d == null) return null;
  const cls = d > 0 ? "up" : d < 0 ? "down" : "flat";
  const txt = d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : "=";
  const lbl = d === 0 ? `sem variação ${what}` : `${d > 0 ? "+" : ""}${d} ${what}`;
  return <span className={`delta-tag ${cls}`} title={lbl} aria-label={lbl}>{txt}</span>;
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

export function PlayerRow({ p, club, season, right, onClick, showClub, starter, mood }: {
  p: Player; club?: Club | null; season: number; right?: ReactNode; onClick?: () => void; showClub?: boolean; starter?: boolean; mood?: ReactNode;
}) {
  const injured = p.injury > 0;
  const banned = Object.values(p.bans).some((b) => b > 0);
  const condColor = p.cond >= 80 ? "var(--ok)" : p.cond >= 60 ? "var(--warn)" : "var(--danger)";
  return (
    <div data-player className={`list-item prow-modern${p.legend ? " is-legend" : ""}`} onClick={onClick}>
      <Avatar p={p} club={club} season={season} size={38} />
      <PosBadge pos={p.pos} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row gap4" style={{ minWidth: 0 }}>
          <b className="ellipsis" style={{ fontSize: 14.5 }}>{p.name}</b>
          {starter && <span className="xi-pill">XI</span>}
          {p.legend && <span className="tag legend">★ LENDA</span>}
          {injured && <span className="tag danger"><Icon name="crossMedical" size={12} fill /> {p.injury}d</span>}
          {banned && <span className="tag danger"><Icon name="cardRed" size={12} fill /></span>}
          {p.listed && <span className="tag"><Icon name="priceTag" size={12} /></span>}
        </div>
        <div className="row gap6 small muted" style={{ whiteSpace: "nowrap", minWidth: 0, fontSize: 11.5 }}>
          <span style={{ flex: "none" }}><Flag code={p.nat} /> {age(p, season)}a</span>
          {showClub && club && <span className="ellipsis" style={{ minWidth: 0 }}>· {club.name}</span>}
          {!showClub && (
            <span style={{ color: condColor, fontWeight: 700, flex: "none" }}>· ⚡{Math.round(p.cond)}% <TrendArrow p={p} /></span>
          )}
          {mood && <span style={{ flex: "none" }}>{mood}</span>}
          <PlayerBadges p={p} />
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
  chev: "M9 6l6 6-6 6",
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
  // conjunto próprio do jogo (traço 2px, cantos redondos)
  board: "M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 8h.01M8 16h.01M16 8h.01M12 12h.01M8.5 8.5l3 3M16 16l-3-3",
  dumbbell: "M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  sprout: "M12 21v-9M12 12C12 8 9 5 4 5c0 4 3 7 8 7zM12 10c0-3 2.5-6 8-6 0 4-3 6.5-8 6.5",
  shirt: "M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 0 1-8 0z",
  coins: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v12",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  stadium: "M2 18c0-3 4.5-5 10-5s10 2 10 5M2 18v2h20v-2M5 13V7M19 13V7M5 7l2-2M19 7l-2-2M12 13V9",
  tv: "M3 6h18v12H3zM8 21h8M9 3l3 3 3-3",
  bank: "M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  crane: "M6 21V4l12 3M6 7h14M18 7v5M16 12h4v3h-4zM3 21h8M6 4 3 7",
  handshake: "M2 11l4-4 4 2 3-2 3 2 4-2 2 4-6 6-3-2-2 2-3-3-2 1zM9 13l3 3M12 12l3 3",
  chat: "M4 5h16v11H9l-5 4zM8 10h.01M12 10h.01M16 10h.01",
  medal: "M8 3l4 6 4-6M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-8.5 1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 14.8l2-.3z",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  scroll: "M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1zM10 9h4M10 13h4",
  wrench: "M14.5 5.5a4 4 0 0 0 4.9 4.9L21 12l-9 9-3-3 9-9-1.6-1.6a4 4 0 0 0-4.9-4.9l2.5 2.5-1.5 1.5z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  refresh: "M20 7a8 8 0 0 0-14.5 1M4 17a8 8 0 0 0 14.5-1M20 3v4h-4M4 21v-4h4",
  alert: "M12 3 2 20h20zM12 10v4M12 17h.01",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  role: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0M17 4l3 3",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14",
  check: "M4 12l5 5L20 6",
  close: "M6 6l12 12M18 6 6 18",
  news: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5",
  flame: "M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8a7 7 0 0 0 7 7z",
  ball: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5l4 2.9-1.5 4.7h-5L8 10.4zM12 3v4.5M16 10.4l4.5-1.6M14.5 15.1l2.7 4M9.5 15.1l-2.7 4M8 10.4 3.5 8.8",
  film: "M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4",
  feather: "M20 4c-8 0-14 6-14 14v2M6 18l8-8M10 12h7c2-2 3-5 3-8",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7",
  book: "M4 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4zM20 4h-6M20 4v15h-6",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  luggage: "M6 7h12v13H6zM9 7V4h6v3M10 11v6M14 11v6",
  pitch: "M3 5h18v14H3zM12 5v14M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 9h3v6H3M21 9h-3v6h3",
  calm: "M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 21l3-6 4 2 4-2 3 6M8 15V9h8v6",
  megaphone: "M3 10v4h4l8 5V5L7 10zM18 9a4 4 0 0 1 0 6",
  save: "M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7",
  door: "M6 21V3h10v18M16 7l4-1v16l-4-1M12 12h.01",
  user: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  scout: "M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm10 16-5.5-5.5M10 7v6M7 10h6",
  flameTactical: "M12 2c-.5 2.5-2.5 4.5-4 6.5C6.5 10.5 5 13 5 15.5a7 7 0 0 0 14 0c0-3.5-2-6-4.5-8-1 2-2 3-2.5 3.5C12 9 12 5 12 2z",
  wall: "M3 6.5h18v12H3zM3 10.5h18M3 14.5h18M9 6.5v4M15 6.5v4M6 10.5v4M12 10.5v4M18 10.5v4M9 14.5v4M15 14.5v4",
  counter: "M13 2.5L4 13.5h7l-2 8 11-11.5h-7l2-7.5z",
  possession: "M20.5 12a8.5 8.5 0 0 0-14.5-6L3 9M3 3.5v5.5h5.5M3.5 12a8.5 8.5 0 0 0 14.5 6l3-3M21 20.5V15h-5.5M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  wings: "M7.5 6L2 12l5.5 6M16.5 6l5.5 6-5.5 6M2 12h8M14 12h8M12 4.5v15",
  rocket: "M12 2.5c3 3.5 4.5 7.5 4.5 11.5l2 2v2l-3-1-1.5 2.5h-4L8.5 17l-3 1v-2l2-2C7.5 10 9 6 12 2.5zM12 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  stopwatch: "M12 2v2M9.5 2h5M12 5a8 8 0 1 0 8 8 8 8 0 0 0-8-8zm0 3.5v4.5l3 2M19 6.5l1.5-1.5",
  crossMedical: "M9 3.5h6v5h5v6h-5v6H9v-6H4v-5h5v-6z",
  cardRed: "M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z",
  cardYellow: "M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z",
  priceTag: "M12.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v7.5l9 9a1.5 1.5 0 0 0 2.1 0l6.4-6.4a1.5 1.5 0 0 0 0-2.1l-9-9zM7.5 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z",
  coldForm: "M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1L19.1 4.9M12 6l2-2M12 6l-2-2M12 18l2 2M12 18l-2 2M6 12l-2 2M6 12l-2-2M18 12l2 2M18 12l2-2",
  heartIdol: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  doorExit: "M14 3.5v17M4.5 3.5h9.5v17H4.5a1.5 1.5 0 0 1-1.5-1.5V5a1.5 1.5 0 0 1 1.5-1.5zm12 8.5h4.5m-2-2l2 2-2 2",
  bullhorn: "M3.5 11v2a2 2 0 0 0 2 2h2.5l6.5 4.5V4.5L8 9H5.5a2 2 0 0 0-2 2zm13-3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14",
  whistleReferee: "M4 13a5 5 0 1 0 10 0l7-4V6h-9.5A5 5 0 0 0 4 13zM13 6V4M9 13h.01",
};

const LUCIDE_MAP: Record<string, ComponentType<{ size?: number; strokeWidth?: number; fill?: string; className?: string }>> = {
  home: Home,
  squad: LayoutList,
  trophy: Trophy,
  market: Tag,
  club: Shield,
  back: ChevronLeft,
  chev: ChevronRight,
  chevLeft: ChevronLeft,
  chevRight: ChevronRight,
  chevUpDown: ChevronsUpDown,
  play: Play,
  bell: Bell,
  gear: Settings,
  star: Star,
  pause: Pause,
  ff: FastForward,
  swap: ArrowLeftRight,
  search: Search,
  edit: Pencil,
  camera: Camera,
  board: ClipboardList,
  tactics: ClipboardList,
  dumbbell: Dumbbell,
  cone: Cone,
  mail: Mail,
  inbox: Mail,
  sprout: Sprout,
  shirt: Shirt,
  coins: Coins,
  briefcase: Briefcase,
  calendar: CalendarDays,
  stadium: Building2,
  tv: Tv,
  bank: Landmark,
  crane: Hammer,
  handshake: Handshake,
  chat: MessageSquare,
  medal: Medal,
  compass: Compass,
  scroll: ScrollText,
  wrench: Wrench,
  mic: Mic,
  refresh: RefreshCw,
  alert: AlertTriangle,
  target: Target,
  sparkle: Sparkles,
  link: Link2,
  role: UserCheck,
  bolt: Zap,
  trend: TrendingUp,
  lock: Lock,
  trash: Trash2,
  check: Check,
  close: X,
  news: Newspaper,
  flame: Flame,
  ball: CircleDot,
  film: Film,
  feather: Feather,
  list: LayoutList,
  users: Users,
  book: BookOpen,
  bulb: Lightbulb,
  luggage: Luggage,
  pitch: ClipboardList,
  calm: Activity,
  megaphone: Megaphone,
  save: Save,
  door: DoorOpen,
  user: User,
  shield: Shield,
  scout: Binoculars,
  binoculars: Binoculars,
  flameTactical: Flame,
  wall: Shield,
  counter: Zap,
  possession: RefreshCw,
  wings: Wind,
  rocket: Rocket,
  stopwatch: Clock,
  crossMedical: BriefcaseMedical,
  medical: BriefcaseMedical,
  cardRed: Square,
  cardYellow: Square,
  priceTag: Tag,
  coldForm: Snowflake,
  heartIdol: Heart,
  heart: Heart,
  doorExit: DoorOpen,
  bullhorn: Megaphone,
  whistleReferee: Award,
  plus: Plus,
  download: Download,
  doc: FileText,
  filter: SlidersHorizontal,
  more: Grid2x2,
  menu: Menu,
};

/** Ícone alinhado ao texto (usa pacote Lucide React estilo Opção 1). */
export function Ic({ n, size = 16 }: { n: string; size?: number }) {
  return <span className="ic-inline" aria-hidden="true"><Icon name={n} size={size} /></span>;
}

export function Icon({ name, size = 22, fill = false }: { name: keyof typeof PATHS | string; size?: number; fill?: boolean }) {
  const LucideComp = LUCIDE_MAP[name];
  if (LucideComp) {
    return (
      <LucideComp
        className="ico"
        size={size}
        strokeWidth={2}
        fill={fill ? "currentColor" : "none"}
      />
    );
  }
  const duo = DUO[name];
  if (fill) {
    return (
      <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d={duo?.f ?? PATHS[name] ?? ""} />
      </svg>
    );
  }
  return (
    <svg className={`ico${duo?.f ? " duo" : ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {duo?.f && <path className="ico-f" d={duo.f} stroke="none" />}
      <path d={duo?.d ?? PATHS[name] ?? ""} />
    </svg>
  );
}

/** Ícone substituível por imagem (public/media/icons/<slug>.png), com o SVG Lucide/duotom de reserva. */
export function GIcon({ slug, size = 22 }: { slug: IconSlug; size?: number }) {
  return <GameIcon slug={slug} size={size} svg={(n, sz) => <Icon name={n} size={sz} />} />;
}

// =====================================================================
// Componentes da Opção 1 (Piotr Kosmala FM Modern Dark em PT-BR)
// =====================================================================

/** Cor da barra vertical por setor da posição (Op. 1: verde, amarelo, vermelho). */
export function sectorColor(pos: Pos): string {
  const g = POS_GROUP[pos];
  if (g === "GK" || g === "DEF") return "#10b981";
  if (g === "MID") return "#f59e0b";
  return "#ef4444";
}

/** Retorna sigla da Função + Dever em PT-BR e classe de cor do dever (Op. 1). */
export function roleDutyDisplay(pos: Pos, role?: RoleDef | null): { code: string; duty: string; dutyShort: string; shortCode: string; dutyClass: "at" | "ap" | "def" | "au" } {
  const code = role?.short ?? pos;
  const pack = (c: string, duty: string, dutyShort: string, dutyClass: "at" | "ap" | "def" | "au") => ({
    code: c,
    duty,
    dutyShort,
    shortCode: `${c} - ${dutyShort}`,
    dutyClass,
  });
  if (role) {
    if (role.id === "gk" || role.id === "zag" || role.id === "lat_def" || role.id === "destr") {
      return pack(code, "Defender", "Def", "def");
    }
    if (role.id === "lat_ap") {
      return pack(code, "Automático", "Au", "au");
    }
    if (role.id === "mat" || role.id === "ponta" || role.id === "inv" || role.id === "fin") {
      return pack(code, "Atacar", "At", "at");
    }
    return pack(code, "Apoiar", "Ap", "ap");
  }
  if (pos === "GOL") return pack("GOL-L", "Atacar", "At", "at");
  if (pos === "ZAG") return pack("ZAG-C", "Defender", "Def", "def");
  if (pos === "LD" || pos === "LE") return pack(pos, "Automático", "Au", "au");
  if (pos === "VOL") return pack("VOL", "Defender", "Def", "def");
  if (pos === "MC") return pack("MC-AA", "Apoiar", "Ap", "ap");
  if (pos === "MEI") return pack("MEI", "Apoiar", "Ap", "ap");
  if (pos === "PD") return pack("PTD", "Atacar", "At", "at");
  if (pos === "PE") return pack("PTE", "Atacar", "At", "at");
  return pack("CA", "Atacar", "At", "at");
}

/** Camisa vetorial do clube estilo Opção 1 (ao lado da foto no campo tático). */
export function KitIcon({ club, gk = false, size = 24 }: { club?: Club | null; gk?: boolean; size?: number }) {
  const c0 = gk ? "#84cc16" : (club?.colors[0] ?? "#5842f4");
  const c1 = gk ? "#bef264" : (club?.colors[1] ?? "#ffffff");
  const c2 = gk ? "#365314" : (club?.colors[2] ?? "#111827");
  return (
    <svg width={size} height={Math.round(size * 0.92)} viewBox="0 0 28 26" fill="none" className="k-kit-svg" aria-hidden="true">
      <path d="M8 2L2 6L5 12L8 10V24H20V10L23 12L26 6L20 2L17 4H11L8 2Z" fill={c0} stroke={c1} strokeWidth="1.3" />
      {!gk && <rect x="8" y="11" width="12" height="2.3" fill={c1} opacity="0.9" />}
      {!gk && <rect x="8" y="14" width="12" height="2.2" fill={c2} opacity="0.85" />}
    </svg>
  );
}

/** Indicador de Condição Física e Ritmo de Jogo (Coração + Barra + Círculo) da Opção 1. */
export function ConditionPill({ cond, showSharp = true }: { cond: number; showSharp?: boolean }) {
  const c = Math.max(0, Math.min(100, Math.round(cond)));
  const color = c >= 80 ? "#10b981" : c >= 62 ? "#f59e0b" : "#ef4444";
  return (
    <div className="k-cond-pill" title={`Condição física: ${c}%`}>
      <span className="k-heart-ic" style={{ color }}>
        <Heart size={12} fill={color} strokeWidth={2} />
      </span>
      <span className="k-cond-track">
        <i style={{ width: `${c}%`, background: color }} />
      </span>
      {showSharp && (
        <span className="k-cond-ok" style={{ background: color }}>
          <Check size={8} strokeWidth={3} color="#062016" />
        </span>
      )}
    </div>
  );
}

/** Linha densa de jogador no padrão exato da Opção 1 (Piotr Kosmala) em PT-BR. */
export function KosmalaPlayerRow({
  w,
  p,
  club,
  season,
  slotPos,
  slotIdx,
  role,
  starter,
  subLabel,
  selected,
  onClick,
  onRoleClick,
  extended = false,
  rightSlot,
}: {
  w?: World;
  p: Player;
  club?: Club | null;
  season?: number;
  slotPos?: Pos;
  slotIdx?: number;
  role?: RoleDef | null;
  starter?: boolean;
  subLabel?: string;
  selected?: boolean;
  onClick?: () => void;
  onRoleClick?: () => void;
  extended?: boolean;
  rightSlot?: ReactNode;
}) {
  const effSeason = season ?? w?.season ?? 2026;
  const effPos = slotPos ?? p.pos;
  const effRole = role !== undefined ? role : (club && slotIdx != null ? roleAt(club.tactic, slotIdx, effPos) : null);
  const rd = roleDutyDisplay(effPos, effRole);
  const stars = Math.max(1, Math.min(5, Math.round((p.ovr - 50) / 7)));
  const injured = p.injury > 0;
  const banned = Object.values(p.bans).some((b) => b > 0);
  const moralLabel = p.morale >= 85 ? "Perfeita" : p.morale >= 72 ? "Excelente" : p.morale >= 58 ? "Muito Boa" : p.morale >= 45 ? "Regular" : "Baixa";
  const moralColor = p.morale >= 70 ? "#10b981" : p.morale >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div
      data-player
      className={`k-tr${starter ? " is-starter" : ""}${selected ? " is-selected" : ""}${p.legend ? " is-legend" : ""}`}
      onClick={onClick}
    >
      <span className="k-tr-bar" style={{ background: sectorColor(effPos) }} />
      <span className="k-tr-pos" style={{ color: sectorColor(effPos) }}>{subLabel ?? effPos}</span>
      <span
        className="k-tr-inf"
        onClick={(e) => {
          if (onRoleClick) {
            e.stopPropagation();
            onRoleClick();
          }
        }}
        title="Função e ficha do atleta"
      >
        <span className="k-inf-ic"><FileText size={11} /></span>
        <span className="k-inf-ic"><User size={11} /></span>
        {injured && <span className="k-inf-badge inj">DM</span>}
        {banned && <span className="k-inf-badge ban">SUS</span>}
        {p.listed && <span className="k-inf-badge lst">VEN</span>}
      </span>
      <div
        className="k-tr-role"
        onClick={(e) => {
          if (onRoleClick) {
            e.stopPropagation();
            onRoleClick();
          }
        }}
      >
        <b>{rd.code}</b> <em className={`duty-${rd.dutyClass}`}>({rd.duty})</em>
      </div>
      <span className="k-tr-flag"><Flag code={p.nat} /></span>
      <div className="k-tr-stars">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} style={{ color: i < stars ? "#f59e0b" : "#323644" }}>★</span>
        ))}
      </div>
      <div className="k-tr-player">
        <Avatar p={p} club={club} season={effSeason} size={22} />
        <span className="k-tr-name ellipsis">{p.name}</span>
      </div>
      {extended && (
        <>
          <span className="k-tr-age num">{age(p, effSeason)}a</span>
          <span className="k-tr-morale" style={{ color: moralColor }}>↗ {moralLabel}</span>
        </>
      )}
      <ConditionPill cond={p.cond} />
      {extended && (
        <>
          <span className="k-tr-wage num">{formatMoney(p.wage)}/m</span>
          <span className="k-tr-val num">{formatMoney(playerValue(p, effSeason))}</span>
        </>
      )}
      {rightSlot}
    </div>
  );
}
