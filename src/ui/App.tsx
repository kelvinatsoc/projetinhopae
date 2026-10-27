import { GamePreloader, isGamePreloaded } from "./GamePreloader";
import { SponsorsScreen } from "./Sponsors";
import { UniformsScreen } from "./Uniforms";
import { PowersScreen } from "./screens/Powers";
import { syncCustomKits } from "./Kit";
import { FacilitiesScreen } from "./Facilities";
import { StadiumLookScreen } from "./StadiumLook";
import { SetPiecesScreen } from "./SetPieces";
import { useEffect, useRef, useState } from "react";
import { markTitleSeen, TitleCelebration, titlesSeen } from "./CompTheme";
import { installTapHaptics } from "./haptics";
import { nextFixture } from "../engine/competitions";
import { formatDate } from "../engine/calendar";
import { formatMoney } from "../engine/finance";
import { inboxUnread } from "../engine/inbox";
import { back, dismissToast, push, setTab, toast, useNav, useVersion, getWorld, type Route, type Tab } from "../store";
import { popToast } from "../engine/achievements";
import { AchievementsScreen } from "./Achievements";
import { CareerScreen } from "./Career";
import { TrophyRoomScreen } from "./TrophyRoom";
import { continueGame } from "./actions";
import { Crest, Icon, textOn, visibleColor } from "./components";
import { ClubInfoScreen, ClubScreen, CreditsScreen, FinancesScreen, FiredScreen, HistoryScreen, LegendsScreen, SeasonEndScreen, SettingsScreen } from "./screens/Club";
import { CompsScreen } from "./screens/Comps";
import { NationalTeamScreen, NationalTeamsScreen, NtMatchScreen } from "./screens/World";
import { HomeScreen, NewsScreen } from "./screens/Home";
import { MarketScreen } from "./screens/Market";
import { FixtureReport, MatchScreen, PreMatchScreen } from "./screens/Match";
import { PlayerScreen } from "./screens/Player";
import { CompareScreen } from "./Compare";
import { SquadScreen, TacticsScreen } from "./screens/Squad";
import { StartScreen } from "./screens/Start";
import { AdminScreen } from "./screens/Admin";
import { AcademyScreen, PeneiraScreen } from "./screens/Academy";
import { BoardScreen } from "./screens/Board";
import { DressingScreen } from "./screens/Dressing";
import { StaffScreen } from "./screens/Staff";
import { TrainingScreen } from "./screens/Training";
import { InboxScreen } from "./Inbox";
import { PressConferenceScreen } from "./PressConference";
import { MoreScreen } from "./screens/More";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Início", icon: "home" },
  { id: "inbox", label: "Caixa", icon: "mail" },
  { id: "squad", label: "Elenco", icon: "squad" },
  { id: "tactics", label: "Tática", icon: "tactics" },
  { id: "more", label: "Mais", icon: "more" },
];

const RAIL_ITEMS: { id: string; label: string; icon: string; action: () => void; isActive: (tab: Tab, top?: Route) => boolean }[] = [
  { id: "home", label: "Início (Portal)", icon: "home", action: () => setTab("home"), isActive: (t, top) => !top && t === "home" },
  { id: "inbox", label: "Caixa de Entrada", icon: "mail", action: () => setTab("inbox"), isActive: (t, top) => (!top && t === "inbox") || top?.name === "inbox" },
  { id: "tactics", label: "Tática", icon: "tactics", action: () => setTab("tactics"), isActive: (t, top) => (!top && t === "tactics") || top?.name === "tactics" || top?.name === "setpieces" },
  { id: "squad", label: "Elenco", icon: "squad", action: () => setTab("squad"), isActive: (t, top) => !top && t === "squad" },
  { id: "training", label: "Treinos", icon: "cone", action: () => push({ name: "training" }), isActive: (_, top) => top?.name === "training" },
  { id: "medical", label: "Centro Médico & Vestiário", icon: "medical", action: () => push({ name: "dressing" }), isActive: (_, top) => top?.name === "dressing" },
  { id: "comps", label: "Competições", icon: "trophy", action: () => setTab("comps"), isActive: (t, top) => !top && t === "comps" },
  { id: "calendar", label: "Calendário", icon: "calendar", action: () => setTab("comps"), isActive: (_, top) => top?.name === "fixture" },
  { id: "scouting", label: "Olheiros & Base", icon: "search", action: () => push({ name: "youth" }), isActive: (_, top) => top?.name === "youth" || top?.name === "peneira" },
  { id: "market", label: "Mercado de Transferências", icon: "swap", action: () => setTab("market"), isActive: (t, top) => !top && t === "market" },
  { id: "club", label: "Clube & Sede 3D", icon: "club", action: () => setTab("club"), isActive: (t, top) => (!top && (t === "club" || t === "more")) || top?.name === "facilities" || top?.name === "board" || top?.name === "staff" },
  { id: "finances", label: "Finanças & Diretoria", icon: "bank", action: () => push({ name: "finances" }), isActive: (_, top) => top?.name === "finances" || top?.name === "sponsors" },
];

function tabTitle(tab: Tab, clubName: string): string {
  switch (tab) {
    case "home": return `Portal • ${clubName}`;
    case "inbox": return "Caixa de Entrada";
    case "squad": return "Elenco Principal";
    case "tactics": return "Tática";
    case "comps": return "Competições & Calendário";
    case "market": return "Mercado & Olheiros";
    case "club": return `Clube • ${clubName}`;
    case "more": return "Central do Manager";
    default: return clubName;
  }
}

function routeTitle(r: Route): string {
  switch (r.name) {
    case "player": return "Jogador";
    case "club": return "Clube";
    case "tactics": return "Tática";
    case "prematch": return "Pré-jogo";
    case "news": return "Notícias";
    case "legends": return "Álbum de Lendas";
    case "settings": return "Configurações";
    case "credits": return "Créditos";
    case "finances": return "Finanças";
    case "youth": return "Categorias de base";
    case "history": return "Histórico";
    case "fixture": return "Ficha do jogo";
    case "admin": return "Administrador";
    case "training": return "Treino";
    case "peneira": return "Dia da peneira";
    case "staff": return "Comissão técnica";
    case "board": return "Diretoria";
    case "dressing": return "Vestiário";
    case "inbox": return "Caixa de entrada";
    case "press": return "Coletiva";
    case "trophies": return "Sala de troféus";
    case "achievements": return "Conquistas";
    case "career": return "Carreira";
    case "compare": return "Comparar jogadores";
    case "sponsors": return "Patrocínios";
    case "kits": return "Uniformes";
    case "powers": return "Loja de Poderes";
    case "facilities": return "Estrutura";
    case "stadiumLook": return "Meu estádio";
    case "setpieces": return "Bola parada";
    case "nts": return "Seleções";
    case "nt": return "Seleção";
    case "ntmatch": return "Jogo da seleção";
    default: return "";
  }
}

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

  useEffect(() => installTapHaptics(), []);

  // festa do título: uma vez por taça conquistada pelo clube do usuário
  const [, bumpSeen] = useState(0);
  const seen = titlesSeen();
  const wonComp = w ? Object.values(w.comps).find((c) => c.champion === w.userClubId && !seen.has(`${w.userClubId}:${c.season}:${c.id}`)) : undefined;

  // o app inteiro veste as cores do clube comandado
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

  // conquistas e desafios: avisos pendentes viram toasts, um de cada vez
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
  // pré-jogo: sem a navegação flutuante para não disputar o toque com "Jogar"
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
  const opp = nf ? w.clubs[nf.home === w.userClubId ? nf.away : nf.home] : null;
  const nfComp = nf ? w.comps[nf.comp] : null;
  const nextSub = nf && opp
    ? `Próximo jogo: ${opp.name} (${nf.home === w.userClubId ? "C" : "F"}) - ${nfComp?.name ?? "Temporada"}`
    : `${formatDate(w.season, w.day)} ${w.season}`;

  const routeKey = top ? `${nav.stack.length}:${top.name}:${"id" in top ? top.id : ""}` : `tab:${nav.tab}`;
  if (routeKey !== lastRouteKey) { lastRouteKey = routeKey; navAt = performance.now(); }

  return (
    <div className={`app k-shell${fullScreen ? " no-chrome" : ""}${hideNav ? " no-nav" : ""}`}>
      {!fullScreen && (
        <aside className="k-rail" aria-label="Menu lateral Football Manager">
          <div className="k-rail-arrows">
            <button className="k-rail-arrow" onClick={() => (top ? back() : setTab("home"))} aria-label="Voltar" title="Voltar">
              <Icon name="chevLeft" size={14} />
            </button>
            <button className="k-rail-arrow" onClick={() => setTab("more")} aria-label="Módulos" title="Todos os módulos">
              <Icon name="chevRight" size={14} />
            </button>
          </div>
          <div className="k-rail-list">
            {RAIL_ITEMS.map((item) => {
              const active = item.isActive(nav.tab, top);
              return (
                <button
                  key={item.id}
                  className={`k-rail-btn${active ? " active" : ""}`}
                  onClick={item.action}
                  title={item.label}
                  aria-label={item.label}
                >
                  <Icon name={item.icon} size={17} />
                  {item.id === "inbox" && unread > 0 && <i className="k-rail-dot" />}
                </button>
              );
            })}
          </div>
        </aside>
      )}
      <div className="k-main-col">
        {!fullScreen && (
          <header className="topbar k-topbar">
            {top ? (
              <button className="icon-btn back-btn" onClick={back} aria-label="Voltar"><Icon name="back" size={20} /></button>
            ) : (
              <span className="topbar-crest" onClick={() => setTab("club")} style={{ cursor: "pointer" }}><Crest club={club} size={32} /></span>
            )}
            <span className="k-hd-ud" aria-hidden="true"><Icon name="chevUpDown" size={13} /></span>
            <div className="title k-hd-title">
              <b>{top ? routeTitle(top) || club.name : tabTitle(nav.tab, club.name)}</b>
              <small>{nextSub}</small>
            </div>
            <button className="money-chip k-date-pill" onClick={() => push({ name: "finances" })} aria-label={`Saldo ${formatMoney(club.balance)}. Abrir finanças`}>
              <span>{formatDate(w.season, w.day)}</span>
              <span className="k-sep">•</span>
              <b>{formatMoney(club.balance)}</b>
            </button>
            {w.admin?.on && (
              <button className="icon-btn" onClick={() => push({ name: "admin" })} aria-label="Painel do administrador"><Icon name="wrench" size={18} /></button>
            )}
            <button
              className={`k-continue-btn${matchToday ? " matchday" : ""}`}
              onClick={continueGame}
              aria-label={matchToday ? "Dia de Jogo: Ir para a partida" : "Continuar"}
            >
              <span>{matchToday ? "Dia de Jogo" : "Continuar"}</span>
              <Icon name="play" size={13} fill />
            </button>
          </header>
        )}
        <div className={`screen k-content${top ? "" : " from-tab"}`} key={routeKey}>{content}</div>
        {!fullScreen && !hideNav && (
          <nav className="bottomnav k-bottomnav" aria-label="Navegação principal">
            {TABS.map((t) => {
              const isAct = (!top && nav.tab === t.id) || (t.id === "inbox" && top?.name === "inbox") || (t.id === "tactics" && top?.name === "tactics");
              return (
                <button
                  key={t.id}
                  className={isAct ? "active" : ""}
                  aria-current={isAct ? "page" : undefined}
                  onClick={() => setTab(t.id)}
                >
                  <span className="nav-ic"><Icon name={t.icon} size={18} /></span>
                  <span className="nav-lb">{t.label}</span>
                  {t.id === "inbox" && unread > 0 && <i className="nav-badge num">{Math.min(unread, 99)}</i>}
                  {t.id === "more" && (w.career?.offers.length ?? 0) > 0 && <i className="nav-badge" />}
                </button>
              );
            })}
          </nav>
        )}
      </div>
      {wonComp && w && !(top?.name === "match") && (
        <TitleCelebration id={wonComp.id} club={club} season={wonComp.season}
          onClose={() => { markTitleSeen(`${w.userClubId}:${wonComp.season}:${wonComp.id}`); bumpSeen((x) => x + 1); }} />
      )}
      {nav.toast && <Toast key={nav.toast} msg={nav.toast} />}
    </div>
  );
}

/** Aviso compacto no topo: some sozinho, ao tocar ou ao deslizar para o lado. */
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
