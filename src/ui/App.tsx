import { SponsorsScreen } from "./Sponsors";
import { UniformsScreen } from "./Uniforms";
import { FacilitiesScreen } from "./Facilities";
import { SetPiecesScreen } from "./SetPieces";
import { useEffect, useRef, useState } from "react";
import { markTitleSeen, TitleCelebration, titlesSeen } from "./CompTheme";
import { installTapHaptics } from "./haptics";
import type { IconSlug } from "./icons";
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
import { Crest, Icon, textOn, visibleColor, GIcon } from "./components";
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

const TABS: { id: Tab; label: string; icon: IconSlug }[] = [
  { id: "home", label: "Início", icon: "inicio" },
  { id: "squad", label: "Elenco", icon: "elenco" },
  { id: "comps", label: "Torneios", icon: "competicoes" },
  { id: "market", label: "Mercado", icon: "mercado" },
  { id: "club", label: "Clube", icon: "clube" },
];

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
    case "facilities": return "Estrutura";
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

  if (!w) return <StartScreen />;

  const top = nav.stack[nav.stack.length - 1];
  const fullScreen = top && (top.name === "match" || top.name === "seasonEnd" || top.name === "fired");
  // pré-jogo: sem a navegação flutuante para não disputar o toque com "Jogar"
  const hideNav = top?.name === "prematch";
  const club = w.clubs[w.userClubId];
  const unread = inboxUnread(w);

  let content;
  if (!top) {
    content =
      nav.tab === "home" ? <HomeScreen /> :
        nav.tab === "squad" ? <SquadScreen /> :
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
      case "facilities": content = <FacilitiesScreen />; break;
      case "setpieces": content = <SetPiecesScreen />; break;
      case "nts": content = <NationalTeamsScreen />; break;
      case "nt": content = <NationalTeamScreen id={top.id} key={top.id} />; break;
      case "ntmatch": content = <NtMatchScreen id={top.id} key={top.id} />; break;
      default: content = null;
    }
  }

  const showFab = !top && (nav.tab === "home" || nav.tab === "squad" || nav.tab === "comps");
  const nf = nextFixture(w, w.userClubId);
  const matchToday = !!nf && nf.day === w.day;
  const routeKey = top ? `${nav.stack.length}:${top.name}:${"id" in top ? top.id : ""}` : `tab:${nav.tab}`;
  // anti "toque fantasma": logo após trocar de tela, ignora toques nas barras de ação/navegação
  if (routeKey !== lastRouteKey) { lastRouteKey = routeKey; navAt = performance.now(); }

  return (
    <div className={`app${fullScreen ? " no-chrome" : ""}${showFab ? " has-fab" : ""}${hideNav ? " no-nav" : ""}`}>
      {!fullScreen && (
        <header className="topbar">
          {top ? (
            <button className="icon-btn back-btn" onClick={back} aria-label="Voltar"><Icon name="back" size={24} /></button>
          ) : (
            <span className="topbar-crest"><Crest club={club} size={34} /></span>
          )}
          <div className="title">
            <b>{top ? routeTitle(top) || club.name : club.name}</b>
            <small>{formatDate(w.season, w.day)} {w.season}</small>
          </div>
          <button className="money-chip" onClick={() => push({ name: "finances" })} aria-label={`Saldo ${formatMoney(club.balance)}. Abrir finanças`}>{formatMoney(club.balance)}</button>
          {w.admin?.on && (
            <button className="icon-btn" onClick={() => push({ name: "admin" })} aria-label="Painel do administrador"><Icon name="wrench" size={22} /></button>
          )}
          <button className="icon-btn badge-dot" data-count={unread > 0 ? Math.min(unread, 99) : undefined} onClick={() => push({ name: "inbox" })} aria-label={unread > 0 ? `Caixa de entrada, ${unread} não lidas` : "Caixa de entrada"}>
            <Icon name="bell" size={24} />
          </button>
        </header>
      )}
      <div className={`screen${top ? "" : " from-tab"}`} key={routeKey}>{content}</div>
      {wonComp && w && !(top?.name === "match") && (
        <TitleCelebration id={wonComp.id} club={club} season={wonComp.season}
          onClose={() => { markTitleSeen(`${w.userClubId}:${wonComp.season}:${wonComp.id}`); bumpSeen((x) => x + 1); }} />
      )}
      {showFab && (
        <div className="nextbar" role="region" aria-label="Próximo passo">
          {nf ? (
            <div className="nextbar-info">
              <Crest club={w.clubs[nf.home === w.userClubId ? nf.away : nf.home]} size={30} />
              <span>
                <b className="ellipsis">{nf.home === w.userClubId ? "x " : "@ "}{w.clubs[nf.home === w.userClubId ? nf.away : nf.home].name}</b>
                <small>{matchToday ? "Jogo hoje" : `${formatDate(w.season, nf.day)} · em ${nf.day - w.day} dia${nf.day - w.day > 1 ? "s" : ""}`}</small>
              </span>
            </div>
          ) : <div className="nextbar-info"><span><b>Fim da temporada</b><small>Sem jogos marcados</small></span></div>}
          <button className="btn primary nextbar-go" onClick={continueGame}>
            <GIcon slug={matchToday ? "jogar" : "continuar"} size={22} /> {matchToday ? "Jogar" : "Continuar"}
          </button>
        </div>
      )}
      {!fullScreen && !hideNav && (
        <nav className="bottomnav" aria-label="Navegação principal">
          {TABS.map((t) => (
            <button key={t.id} className={!top && nav.tab === t.id ? "active" : ""} aria-current={!top && nav.tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <span className="nav-ic"><GIcon slug={t.icon} size={24} /></span>
              <span className="nav-lb">{t.label}</span>
              {t.id === "club" && (w.career?.offers.length ?? 0) > 0 && <i className="nav-badge" />}
            </button>
          ))}
        </nav>
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
