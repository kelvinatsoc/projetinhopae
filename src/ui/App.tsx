import { useEffect } from "react";
import { formatDate } from "../engine/calendar";
import { formatMoney } from "../engine/finance";
import { unreadCount } from "../engine/news";
import { back, push, setTab, useNav, useVersion, getWorld, type Route, type Tab } from "../store";
import { continueGame } from "./actions";
import { Crest, Icon } from "./components";
import { ClubInfoScreen, ClubScreen, CreditsScreen, FinancesScreen, FiredScreen, HistoryScreen, LegendsScreen, SeasonEndScreen, SettingsScreen } from "./screens/Club";
import { CompsScreen } from "./screens/Comps";
import { HomeScreen, NewsScreen } from "./screens/Home";
import { MarketScreen } from "./screens/Market";
import { FixtureReport, MatchScreen, PreMatchScreen } from "./screens/Match";
import { PlayerScreen } from "./screens/Player";
import { SquadScreen, TacticsScreen } from "./screens/Squad";
import { StartScreen } from "./screens/Start";
import { AdminScreen } from "./screens/Admin";
import { AcademyScreen, PeneiraScreen } from "./screens/Academy";
import { BoardScreen } from "./screens/Board";
import { DressingScreen } from "./screens/Dressing";
import { StaffScreen } from "./screens/Staff";
import { TrainingScreen } from "./screens/Training";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Início", icon: "home" },
  { id: "squad", label: "Elenco", icon: "squad" },
  { id: "comps", label: "Torneios", icon: "trophy" },
  { id: "market", label: "Mercado", icon: "market" },
  { id: "club", label: "Clube", icon: "club" },
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
    case "board": return "Diretoria e obras";
    case "dressing": return "Vestiário";
    default: return "";
  }
}

export function App() {
  useVersion();
  const nav = useNav();
  const w = getWorld();

  useEffect(() => {
    document.documentElement.dataset.theme = w?.settings.theme ?? "dark";
  }, [w?.settings.theme]);

  if (!w) return <StartScreen />;

  const top = nav.stack[nav.stack.length - 1];
  const fullScreen = top && (top.name === "match" || top.name === "seasonEnd" || top.name === "fired");
  const club = w.clubs[w.userClubId];
  const unread = unreadCount(w);

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
      default: content = null;
    }
  }

  const showFab = !top && (nav.tab === "home" || nav.tab === "squad" || nav.tab === "comps");

  return (
    <div className={`app${fullScreen ? " no-chrome" : ""}`}>
      {!fullScreen && (
        <header className="topbar">
          {top ? (
            <button className="icon-btn" onClick={back} aria-label="Voltar"><Icon name="back" /></button>
          ) : (
            <Crest club={club} size={30} />
          )}
          <div className="title">
            <b>{top ? routeTitle(top) || club.name : club.name}</b>
            <small>{formatDate(w.season, w.day)} {w.season} · {formatMoney(club.balance)}</small>
          </div>
          {w.admin?.on && (
            <button className="icon-btn" style={{ color: "#f5c542", fontSize: 18 }} onClick={() => push({ name: "admin" })} aria-label="Painel do administrador">🛠️</button>
          )}
          <button className="icon-btn badge-dot" data-count={unread > 0 ? Math.min(unread, 99) : undefined} onClick={() => push({ name: "news" })} aria-label="Notícias">
            <Icon name="bell" />
          </button>
        </header>
      )}
      {content}
      {showFab && (
        <button className="fab" onClick={continueGame}>
          <Icon name="play" fill size={18} /> Continuar
        </button>
      )}
      {!fullScreen && (
        <nav className="bottomnav">
          {TABS.map((t) => (
            <button key={t.id} className={!top && nav.tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>
      )}
      {nav.toast && <div className="toast">{nav.toast}</div>}
    </div>
  );
}
