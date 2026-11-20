import { GamePreloader, isGamePreloaded } from "./GamePreloader";
import { syncCustomKits } from "./Kit";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { markTitleSeen, TitleCelebration, titlesSeen } from "./CompTheme";
import { installTapHaptics } from "./haptics";
import { nextFixture } from "../engine/competitions";
import { formatDate } from "../engine/calendar";
import { formatMoney } from "../engine/finance";
import { inboxUnread } from "../engine/inbox";
import { back, dismissToast, push, resetNav, setTab, toast, useNav, useVersion, getWorld, type Route, type Tab } from "../store";
import { popToast } from "../engine/achievements";
import { continueGame } from "./actions";
import { Crest, Icon, textOn, visibleColor } from "./components";
import { HomeScreen, NewsScreen } from "./screens/Home";
import { SquadScreen, TacticsScreen } from "./screens/Squad";
import { StartScreen } from "./screens/Start";
import { InboxScreen } from "./Inbox";
import { MoreScreen } from "./screens/More";
import { UniformsScreen } from "./Uniforms";
import { SetPiecesScreen } from "./SetPieces";
import { CompareScreen } from "./Compare";
import { AcademyScreen, PeneiraScreen } from "./screens/Academy";
import { BoardScreen } from "./screens/Board";
import { DressingScreen } from "./screens/Dressing";
import { StaffScreen } from "./screens/Staff";
import { TrainingScreen } from "./screens/Training";

const SponsorsScreen = lazy(() => import("./Sponsors").then((m) => ({ default: m.SponsorsScreen })));
const PowersScreen = lazy(() => import("./screens/Powers").then((m) => ({ default: m.PowersScreen })));
const FacilitiesScreen = lazy(() => import("./Facilities").then((m) => ({ default: m.FacilitiesScreen })));
const StadiumLookScreen = lazy(() => import("./StadiumLook").then((m) => ({ default: m.StadiumLookScreen })));
const AchievementsScreen = lazy(() => import("./Achievements").then((m) => ({ default: m.AchievementsScreen })));
const CareerScreen = lazy(() => import("./Career").then((m) => ({ default: m.CareerScreen })));
const TrophyRoomScreen = lazy(() => import("./TrophyRoom").then((m) => ({ default: m.TrophyRoomScreen })));
const ClubScreen = lazy(() => import("./screens/Club").then((m) => ({ default: m.ClubScreen })));
const ClubInfoScreen = lazy(() => import("./screens/Club").then((m) => ({ default: m.ClubInfoScreen })));
const CreditsScreen = lazy(() => import("./screens/Club").then((m) => ({ default: m.CreditsScreen })));
const FinancesScreen = lazy(() => import("./screens/Club").then((m) => ({ default: m.FinancesScreen })));
const FiredScreen = lazy(() => import("./screens/Club").then((m) => ({ default: m.FiredScreen })));
const HistoryScreen = lazy(() => import("./screens/Club").then((m) => ({ default: m.HistoryScreen })));
const LegendsScreen = lazy(() => import("./screens/Club").then((m) => ({ default: m.LegendsScreen })));
const SeasonEndScreen = lazy(() => import("./screens/Club").then((m) => ({ default: m.SeasonEndScreen })));
const SettingsScreen = lazy(() => import("./screens/Club").then((m) => ({ default: m.SettingsScreen })));
const CompsScreen = lazy(() => import("./screens/Comps").then((m) => ({ default: m.CompsScreen })));
const NationalTeamsScreen = lazy(() => import("./screens/World").then((m) => ({ default: m.NationalTeamsScreen })));
const NationalTeamScreen = lazy(() => import("./screens/World").then((m) => ({ default: m.NationalTeamScreen })));
const NtMatchScreen = lazy(() => import("./screens/World").then((m) => ({ default: m.NtMatchScreen })));
const MarketScreen = lazy(() => import("./screens/Market").then((m) => ({ default: m.MarketScreen })));
const PreMatchScreen = lazy(() => import("./screens/Match").then((m) => ({ default: m.PreMatchScreen })));
const MatchScreen = lazy(() => import("./screens/Match").then((m) => ({ default: m.MatchScreen })));
const FixtureReport = lazy(() => import("./screens/Match").then((m) => ({ default: m.FixtureReport })));
const PlayerScreen = lazy(() => import("./screens/Player").then((m) => ({ default: m.PlayerScreen })));
const AdminScreen = lazy(() => import("./screens/Admin").then((m) => ({ default: m.AdminScreen })));
const PressConferenceScreen = lazy(() => import("./PressConference").then((m) => ({ default: m.PressConferenceScreen })));

interface ConsoleHubItem {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  isActive: (tab: Tab, top?: Route) => boolean;
}

const CONSOLE_HUBS: ConsoleHubItem[] = [
  {
    id: "home",
    label: "QG",
    icon: "home",
    action: () => { resetNav(); setTab("home"); },
    isActive: (t, top) => !top && t === "home",
  },
  {
    id: "tactics",
    label: "Tática",
    icon: "tactics",
    action: () => { resetNav(); setTab("tactics"); },
    isActive: (t, top) => (!top && t === "tactics") || top?.name === "tactics" || top?.name === "setpieces",
  },
  {
    id: "squad",
    label: "Elenco",
    icon: "squad",
    action: () => { resetNav(); setTab("squad"); },
    isActive: (t, top) => !top && t === "squad",
  },
  {
    id: "training",
    label: "Treino",
    icon: "dumbbell",
    action: () => { resetNav(); push({ name: "training" }); },
    isActive: (_, top) => top?.name === "training",
  },
  {
    id: "youth",
    label: "Base",
    icon: "sprout",
    action: () => { resetNav(); push({ name: "youth" }); },
    isActive: (_, top) => top?.name === "youth" || top?.name === "peneira",
  },
  {
    id: "market",
    label: "Mercado",
    icon: "swap",
    action: () => { resetNav(); setTab("market"); },
    isActive: (t, top) => !top && t === "market",
  },
  {
    id: "comps",
    label: "Ligas",
    icon: "trophy",
    action: () => { resetNav(); setTab("comps"); },
    isActive: (t, top) => (!top && t === "comps") || top?.name === "fixture",
  },
  {
    id: "club",
    label: "Clube",
    icon: "club",
    action: () => { resetNav(); setTab("club"); },
    isActive: (t, top) => (!top && t === "club") || top?.name === "stadiumLook" || top?.name === "facilities",
  },
  {
    id: "inbox",
    label: "Caixa",
    icon: "mail",
    action: () => { resetNav(); setTab("inbox"); },
    isActive: (t, top) => (!top && t === "inbox") || top?.name === "inbox",
  },
];

let navAt = 0;
let lastRouteKey = "";
const GHOST_MS = 380;
const GHOST_SEL = ".bottomnav, .pm-dock, .nextbar, .mv-ctrl, .sticky-cta, .action-dock";
if (typeof document !== "undefined") {
  const guard = (e: Event) => {
    if (performance.now() - navAt > GHOST_MS) return;
    const el = e.target as Element | null;
    if (el?.closest?.(GHOST_SEL)) { e.preventDefault(); e.stopPropagation(); }
  };
  document.addEventListener("click", guard, true);
}

export function App() {
  useVersion();
  const nav = useNav();
  const w = getWorld();

  useEffect(() => {
    document.documentElement.dataset.theme = w?.settings.theme ?? "dark";
  }, [w?.settings.theme]);

  useEffect(() => {
    installTapHaptics();
    try {
      const ori = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
      ori?.lock?.("landscape")?.catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  const [, bumpSeen] = useState(0);
  const seen = titlesSeen();
  const wonComp = w ? Object.values(w.comps).find((c) => c.champion === w.userClubId && !seen.has(`${w.userClubId}:${c.season}:${c.id}`)) : undefined;

  const colors = w ? w.clubs[w.userClubId]?.colors : undefined;
  const colorKey = colors?.join(",") ?? "";
  useEffect(() => {
    const root = document.documentElement.style;
    if (!colors) { root.removeProperty("--club"); root.removeProperty("--club2"); root.removeProperty("--club-ink"); return; }
    const c1 = visibleColor(colors);
    const rest = colors.filter((c) => c.toLowerCase() !== c1.toLowerCase());
    const c2 = rest.length ? visibleColor(rest) : "#1f6fd1";
    root.setProperty("--club", c1);
    root.setProperty("--club2", c2.toLowerCase() === c1.toLowerCase() ? "#1f6fd1" : c2);
    root.setProperty("--club-ink", textOn(c1) === "#fff" ? "#fff" : "#0b0f1a");
  }, [colorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = w?.ach?.toasts.length ?? 0;
  const toastBusy = !!nav.toast;
  useEffect(() => {
    if (!pending || toastBusy) return;
    const t = window.setTimeout(() => {
      const wd = getWorld();
      const msg = wd && popToast(wd);
      if (msg) toast(msg);
    }, 350);
    return () => window.clearTimeout(t);
  }, [pending, toastBusy]);

  const [preloaded, setPreloaded] = useState(() => isGamePreloaded());

  if (!preloaded) {
    return <GamePreloader onComplete={() => setPreloaded(true)} />;
  }

  if (!w) return <StartScreen />;

  const top = nav.stack[nav.stack.length - 1];
  const fullScreen = top && (top.name === "match" || top.name === "seasonEnd" || top.name === "fired");
  const hideNav = top?.name === "prematch";
  const club = w.clubs[w.userClubId];
  syncCustomKits(w);
  const unread = inboxUnread(w);

  let content;
  if (!top) {
    content =
      nav.tab === "home" ? <HomeScreen /> :
      nav.tab === "inbox" ? <InboxScreen /> :
      nav.tab === "squad" ? <SquadScreen /> :
      nav.tab === "tactics" ? <TacticsScreen /> :
      nav.tab === "more" ? <MoreScreen /> :
      nav.tab === "comps" ? <CompsScreen /> :
      nav.tab === "market" ? <MarketScreen /> : <ClubScreen />;
  } else {
    switch (top.name) {
      case "player": content = <PlayerScreen id={top.id} key={top.id} />; break;
      case "club": content = <ClubInfoScreen id={top.id} key={top.id} />; break;
      case "tactics": content = <TacticsScreen />; break;
      case "prematch": content = <PreMatchScreen />; break;
      case "match": content = <MatchScreen quick={!!top.quick} />; break;
      case "news": content = <NewsScreen />; break;
      case "legends": content = <LegendsScreen />; break;
      case "settings": content = <SettingsScreen />; break;
      case "credits": content = <CreditsScreen />; break;
      case "finances": content = <FinancesScreen />; break;
      case "youth": content = <AcademyScreen />; break;
      case "history": content = <HistoryScreen />; break;
      case "fixture": content = <FixtureReport id={top.id} />; break;
      case "seasonEnd": content = <SeasonEndScreen summary={top.summary} />; break;
      case "fired": content = <FiredScreen />; break;
      case "admin": content = <AdminScreen />; break;
      case "training": content = <TrainingScreen />; break;
      case "peneira": content = <PeneiraScreen />; break;
      case "staff": content = <StaffScreen />; break;
      case "board": content = <BoardScreen />; break;
      case "dressing": content = <DressingScreen />; break;
      case "inbox": content = <InboxScreen />; break;
      case "press": content = <PressConferenceScreen fid={top.fid} phase={top.phase} key={`${top.fid}${top.phase}`} />; break;
      case "trophies": content = <TrophyRoomScreen />; break;
      case "achievements": content = <AchievementsScreen />; break;
      case "career": content = <CareerScreen />; break;
      case "compare": content = <CompareScreen ids={top.ids} />; break;
      case "sponsors": content = <SponsorsScreen />; break;
      case "kits": content = <UniformsScreen id={top.id} key={top.id} />; break;
      case "powers": content = <PowersScreen />; break;
      case "facilities": content = <FacilitiesScreen />; break;
      case "stadiumLook": content = <StadiumLookScreen />; break;
      case "setpieces": content = <SetPiecesScreen />; break;
      case "nts": content = <NationalTeamsScreen />; break;
      case "nt": content = <NationalTeamScreen id={top.id} key={top.id} />; break;
      case "ntmatch": content = <NtMatchScreen id={top.id} key={top.id} />; break;
      default: content = null;
    }
  }

  const nf = nextFixture(w, w.userClubId);
  const matchToday = !!nf && nf.day === w.day;

  const routeKey = top ? `${nav.stack.length}:${top.name}:${"id" in top ? top.id : ""}` : `tab:${nav.tab}`;
  if (routeKey !== lastRouteKey) { lastRouteKey = routeKey; navAt = performance.now(); }

  return (
    <div className={`app k-shell rpg-console-shell${fullScreen ? " no-chrome" : ""}${hideNav ? " no-nav" : ""}`}>
      <div className="k-main-col" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        {!fullScreen && (
          <header className="rpg-top-hud">
            <div className="rpg-hud-brand">
              {top ? (
                <button className="rpg-back-btn" onClick={back} aria-label="Voltar" title="Voltar">
                  <Icon name="back" size={16} />
                </button>
              ) : null}
              <span
                className="rpg-club-pill"
                onClick={() => { resetNav(); setTab("club"); }}
                title="Abrir Complexo do Clube"
              >
                <Crest club={club} size={28} />
                <span className="rpg-club-meta">
                  <b>{club.name}</b>
                  <small>{formatDate(w.season, w.day)} · <em style={{ color: "#4ade80", fontStyle: "normal" }}>{formatMoney(club.balance)}</em></small>
                </span>
              </span>
            </div>

            {/* Dock Horizontal Console RPG: Substitui a antiga barra lateral de 11 itens */}
            <nav className="rpg-console-dock" aria-label="Menu Principal RPG">
              {CONSOLE_HUBS.map((item) => {
                const active = item.isActive(nav.tab, top);
                return (
                  <button
                    key={item.id}
                    className={`rpg-dock-tab${active ? " active" : ""}`}
                    onClick={item.action}
                    title={item.label}
                  >
                    <Icon name={item.icon} size={14} />
                    <span>{item.label}</span>
                    {item.id === "inbox" && unread > 0 && <i className="rpg-dock-badge">{Math.min(unread, 99)}</i>}
                  </button>
                );
              })}
              <button
                className={`rpg-dock-tab${!top && nav.tab === "more" ? " active" : ""}`}
                onClick={() => { resetNav(); setTab("more"); }}
                title="Mais opções (Comissão, Troféus, Poderes, Ajustes)"
              >
                <Icon name="more" size={14} />
              </button>
            </nav>

            <div className="rpg-hud-actions">
              {w.admin?.on && (
                <button className="rpg-icon-pill" onClick={() => push({ name: "admin" })} title="Painel Admin">
                  <Icon name="wrench" size={15} />
                </button>
              )}
              <button
                className={`k-continue-btn rpg-continue-cta${matchToday ? " matchday" : ""}`}
                onClick={continueGame}
              >
                <span>{matchToday ? "Jogar Partida" : "Avançar"}</span>
                <Icon name="play" size={13} fill />
              </button>
            </div>
          </header>
        )}

        <div className={`screen k-content rpg-viewport${top ? "" : " from-tab"}`} key={routeKey}>
          <Suspense fallback={<div className="page" />}>
            {content}
          </Suspense>
        </div>
      </div>

      {wonComp && w && !(top?.name === "match") && (
        <TitleCelebration
          id={wonComp.id}
          club={club}
          season={wonComp.season}
          onClose={() => {
            markTitleSeen(`${w.userClubId}:${wonComp.season}:${wonComp.id}`);
            bumpSeen((x) => x + 1);
          }}
        />
      )}
      {nav.toast && <Toast key={nav.toast} msg={nav.toast} />}
    </div>
  );
}

function Toast({ msg }: { msg: string }) {
  const start = useRef<number | null>(null);
  const el = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={el}
      className="toast"
      role="status"
      onClick={dismissToast}
      onPointerDown={(e) => { start.current = e.clientX; }}
      onPointerMove={(e) => {
        if (start.current == null || !el.current) return;
        const dx = e.clientX - start.current;
        el.current.style.transform = `translateX(calc(-50% + ${dx}px))`;
        el.current.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 160));
      }}
      onPointerUp={(e) => {
        const dx = start.current == null ? 0 : e.clientX - start.current;
        start.current = null;
        if (Math.abs(dx) > 60) dismissToast();
        else if (el.current) { el.current.style.transform = ""; el.current.style.opacity = ""; }
      }}
    >
      {msg}
    </div>
  );
}
