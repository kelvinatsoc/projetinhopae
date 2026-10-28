import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { deviceInfo, isWeakDevice, readPerfMode, savePerfMode, type PerfMode } from "../perf";
import { LEGENDS, TIER_NAMES } from "../../data/legends";
import { COMP_META } from "../../engine/competitions";
import { kitSupplier, shirtSponsor, stadiumName } from "../../engine/sponsors";
import { BrandLogo } from "../BrandLogo";
import { crestFor, KitShirt } from "../Uniforms";
import "../economy.css";
import { ClubHQ } from "../hq/ClubHQ";
import { nextFixture } from "../../engine/competitions";
import { estadualTitles } from "../../engine/estaduais";
import { annualSponsor, annualTV, EXPENSE_LABELS, formatMoney, INCOME_LABELS, wageBill } from "../../engine/finance";
import { clubStrength, squadOf } from "../../engine/lineup";
import { POS_ORDER } from "../../engine/positions";
import { repairWorld } from "../../engine/integrity";
import { fireAndRehire } from "../../engine/season";
import type { Club, World } from "../../engine/types";
import { exportWorld, saveWorld } from "../../save";
import { forceBack, push, resetNav, setTab, setWorld, toast, update, useWorld } from "../../store";
import { autosave, saveNow } from "../actions";
import { setSpecialsEnabled, specialsEnabled } from "../specials";
import { crowdVolume,loadMedia, saveMedia, setCrowdVolume, setSoundEnabled, soundEnabled } from "../audio";
import { Avatar, clubStars, CompLogo, Crest, Icon, PlayerRow, StadiumPhoto, stadiumSrc, Stars, Ic, GIcon } from "../components";
import { loadCredits, type Credit } from "../credits";
import { flag } from "../flags";
import { resizeImage } from "./Player";
import { AdminSettingsCard } from "./Admin";
import { activeOffers } from "../../engine/career";
import { OfferList } from "../Career";
import { ModdingModal } from "../ModdingModal";

export function ClubScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const titles = c.trophies.length + estadualTitles(c);
  const photo = stadiumSrc(c);
  const offers = w.career?.offers.length ?? 0;
  const youth = c.players.filter((id) => w.players[id]?.youth).length;
  const achs = Object.keys(w.ach?.got ?? {}).length;

  return (
    <div className="page">
      <div className="club-hero">
        {photo && <img className="bgimg" src={photo} alt="" loading="lazy" decoding="async" />}
        <div className="row" style={{ alignItems: "center", gap: 12 }}>
          <Crest club={c} size={64} />
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="ellipsis">{c.name}</h2>
            <div className="small" style={{ opacity: 0.9 }}>
              {c.city}/{c.region}{c.nickname ? ` · ${c.nickname.split(",")[0]}` : ""} · <Stars n={clubStars(clubStrength(w, c))} />
            </div>
            <div className="tiny" style={{ opacity: 0.85, marginTop: 2 }}>
              <Ic n="stadium" size={13} /> {stadiumName(w, c)} · {c.capacity.toLocaleString("pt-BR")} lug.
            </div>
          </div>
          <button className="hero-icon-btn" onClick={() => push({ name: "settings" })} aria-label="Ajustes">
            <GIcon slug="configuracoes" size={20} />
          </button>
        </div>

        <div className="club-hero-kpis">
          <button className="chk-item" onClick={() => push({ name: "finances" })}>
            <b style={{ color: "#34d27b" }}>{formatMoney(c.balance)}</b>
            <span>Saldo Atual</span>
          </button>
          <button className="chk-item" onClick={() => push({ name: "finances" })}>
            <b>{formatMoney(wageBill(w, c))}</b>
            <span>Folha / Mês</span>
          </button>
          <button className="chk-item" onClick={() => push({ name: "trophies" })}>
            <b style={{ color: "#f5c542", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="trophy" size={14} /> {titles}
            </b>
            <span>Sala de Troféus</span>
          </button>
        </div>
      </div>

      <ClubHQ club={c} matchToday={nextFixture(w, c.id)?.day === w.day} fallback={
        <div className="tiles">
          <Tile icon="coins" label="Finanças" sub="Receitas e salários" tint="#1fbf68" onClick={() => push({ name: "finances" })} />
          <Tile icon="briefcase" label="Comissão" sub="Comissão técnica" tint="#4fa3ff" onClick={() => push({ name: "staff" })} />
          <Tile icon="bank" label="Diretoria" sub={`${Math.round(w.board.confidence)}% confiança`} tint="#f5c542" onClick={() => push({ name: "board" })} />
          <Tile icon="crane" label="Estrutura" sub="Estádio, CT, base" tint="#ff8a3d" onClick={() => push({ name: "facilities" })} />
          <Tile icon="handshake" label="Patrocínios" sub={[shirtSponsor(w, c), kitSupplier(w, c)].filter(Boolean).join(" · ") || "Camisa e estádio"} tint="#b57bff" onClick={() => push({ name: "sponsors" })} />
          <Tile icon="shirt" label="Uniformes" sub={`Kits ${w.season}`} tint="#ff5d5d" onClick={() => push({ name: "kits", id: c.id })} />
          <Tile icon="bolt" label="Poderes" sub="Loja de Poderes" tint="#ffb000" onClick={() => push({ name: "powers" })} />
          <Tile icon="chat" label="Vestiário" sub="Clima do elenco" tint="#ff5d8f" onClick={() => push({ name: "dressing" })} />
          <Tile icon="dumbbell" label="Treino" sub="Foco e intensidade" tint="#34d27b" onClick={() => push({ name: "training" })} />
          <Tile icon="sprout" label="Base" sub={`${youth} jogadores`} tint="#7ddc4a" onClick={() => push({ name: "youth" })} />
          <Tile icon="gear" label="Ajustes" sub="Som, tema, escudo" tint="#9aa6c4" onClick={() => push({ name: "settings" })} />
        </div>
      } />

      <div className="sec-head">
        <h3>Gestão & Legado</h3>
        <button className="link" onClick={() => push({ name: "club", id: c.id })}>Ficha do clube ›</button>
      </div>

      <div className="club-grid3">
        <button className="cg-tile" onClick={() => push({ name: "finances" })}>
          <span className="cg-ic"><Icon name="coins" size={22} /></span>
          <b>Finanças</b>
          <small>Balanço e ingresso</small>
        </button>
        <button className="cg-tile" onClick={() => push({ name: "kits", id: c.id })}>
          <span className="cg-ic"><Icon name="shirt" size={22} /></span>
          <b>Uniformes</b>
          <small>Kits {w.season}</small>
        </button>
        <button className="cg-tile" onClick={() => push({ name: "sponsors" })}>
          <span className="cg-ic"><Icon name="handshake" size={22} /></span>
          <b>Patrocínios</b>
          <small>{shirtSponsor(w, c) || "Cotas e marcas"}</small>
        </button>
        <button className="cg-tile" onClick={() => push({ name: "board" })}>
          <span className="cg-ic"><Icon name="bank" size={22} /></span>
          <b>Diretoria</b>
          <small>{Math.round(w.board.confidence)}% confiança</small>
        </button>
        <button className="cg-tile" onClick={() => push({ name: "staff" })}>
          <span className="cg-ic"><Icon name="briefcase" size={22} /></span>
          <b>Comissão</b>
          <small>Equipe técnica</small>
        </button>
        <button className="cg-tile" onClick={() => push({ name: "facilities" })}>
          <span className="cg-ic"><Icon name="crane" size={22} /></span>
          <b>Obras & Níveis</b>
          <small>Estádio, CT, Base</small>
        </button>
        <button className="cg-tile" onClick={() => push({ name: "career" })}>
          <span className="cg-ic"><Icon name="briefcase" size={22} /></span>
          <b>Carreira</b>
          <small>{offers > 0 ? `${offers} proposta${offers > 1 ? "s" : ""}!` : "Reputação"}</small>
        </button>
        <button className="cg-tile" onClick={() => push({ name: "legends" })}>
          <span className="cg-ic"><Icon name="star" size={22} /></span>
          <b>Álbum Lendas</b>
          <small>{Object.keys(w.legends).length}/{LEGENDS.length} ativas</small>
        </button>
        <button className="cg-tile" onClick={() => push({ name: "history" })}>
          <span className="cg-ic"><Icon name="scroll" size={20} /></span>
          <b>Histórico</b>
          <small>Campeões ({achs})</small>
        </button>
      </div>

      <div className="chip-row" style={{ marginTop: 2 }}>
        <button className="chip" onClick={() => push({ name: "achievements" })} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="medal" size={14} /> Conquistas ({achs})
        </button>
        <button className="chip" onClick={() => push({ name: "powers" })} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="bolt" size={14} /> Loja de Poderes
        </button>
        <button className="chip" onClick={() => push({ name: "settings" })} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="gear" size={14} /> Ajustes
        </button>
        {w.admin?.on && (
          <button className="chip active" onClick={() => push({ name: "admin" })} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="wrench" size={14} /> Editor Admin
          </button>
        )}
      </div>

      <div className="grid2 mt4">
        <button className="btn" onClick={saveNow}><GIcon slug="salvar" size={20} /> Salvar Jogo</button>
        <button className="btn" onClick={async () => { await saveWorld(w); setWorld(null); resetNav(); }}><Ic n="door" size={18} /> Sair ao Menu</button>
      </div>
      <div style={{ height: 30 }} />
    </div>
  );
}

// emojis antigos → ícones próprios (src/ui/components.tsx)
const TILE_ICON: Record<string, string> = {
  "💰": "coins", "👔": "briefcase", "🏛️": "bank", "🏗️": "crane", "🤝": "handshake", "💬": "chat",
  "🏋️": "dumbbell", "🌱": "sprout", "⚙️": "gear", "🏆": "trophy", "⭐": "star", "🏅": "medal",
  "🧭": "compass", "📜": "scroll", "🔎": "search", "🛠️": "wrench",
};

function Tile({ icon, label, sub, tint, wide, hot, onClick }: { icon: string; label: string; sub: string; tint: string; wide?: boolean; hot?: boolean; onClick: () => void }) {
  const iconName = TILE_ICON[icon] || icon;
  return (
    <button className={`tile${wide ? " wide" : ""}${hot ? " hot" : ""}`} style={{ "--tint": tint } as CSSProperties} onClick={onClick}>
      <span className="ti"><Icon name={iconName} size={24} /></span>
      <span><b>{label}</b><small>{sub}</small></span>
    </button>
  );
}

export function ClubInfoScreen({ id }: { id: string }) {
  const w = useWorld();
  const c = w.clubs[id];
  if (!c) return <div className="page"><div className="empty">Clube não encontrado.</div></div>;
  const squad = squadOf(w, c).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr);
  const youth = c.players.map((pid) => w.players[pid]).filter((p) => p?.youth);
  return (
    <div className="page k-clubinfo-page">
      <div className="k-clubinfo-grid">
        <aside className="k-clubinfo-aside">
          <div className="hero" style={{ background: `linear-gradient(135deg, ${c.colors[0]}, ${c.colors[1]})` }}>
            <div className="row">
              <Crest club={c} size={48} />
              <div className="grow" style={{ minWidth: 0 }}>
                <h2 className="ellipsis">{c.name}</h2>
                <div className="tiny" style={{ opacity: 0.9 }}>{c.full}</div>
                <div className="tiny">{c.country === "BRA" ? `${c.city}/${c.region}` : `${flag(c.country)} ${c.city || c.country}`} · {c.div === "F" ? "Exterior" : `Série ${c.div}`}</div>
              </div>
            </div>
            <div className="tiny mt8"><Ic n="stadium" /> {stadiumName(w, c)} ({c.capacity.toLocaleString("pt-BR")}) {c.founded ? `· fundado em ${c.founded}` : ""}</div>
          </div>

          <StadiumPhoto club={c} />

          {(kitSupplier(w, c) || shirtSponsor(w, c)) && (
            <div className="card club-brands">
              {kitSupplier(w, c) && <div><span className="tiny muted">Fornecedor</span><BrandLogo brand={kitSupplier(w, c)} size={22} withName /></div>}
              {shirtSponsor(w, c) && <div><span className="tiny muted">Patrocínio Master</span><BrandLogo brand={shirtSponsor(w, c)} size={22} withName /></div>}
            </div>
          )}

          <div className="card tap row gap8" onClick={() => push({ name: "kits", id: c.id })}>
            <KitShirt clubId={c.id} which={0} width={40} supplier={kitSupplier(w, c) ?? null} sponsor={shirtSponsor(w, c) ?? null} crest={crestFor(c)} colors={c.colors} />
            <KitShirt clubId={c.id} which={1} width={40} supplier={kitSupplier(w, c) ?? null} sponsor={shirtSponsor(w, c) ?? null} crest={crestFor(c)} colors={c.colors} />
            <div className="grow"><b>Uniformes Oficiais</b><div className="tiny muted">Titular, reserva e 3º kit</div></div>
            <span className="muted">›</span>
          </div>

          <div className="grid3">
            <div className="stat-box"><b>{Math.round(clubStrength(w, c))}</b><span>força</span></div>
            <div className="stat-box"><b>{squad.length}</b><span>atletas</span></div>
            <div className="stat-box"><b>{c.trophies.length}</b><span>títulos</span></div>
          </div>
          {c.trophies.length > 0 && (
            <div className="card small">
              {estadualTitles(c) > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <Icon name="medal" size={13} /> Estaduais: {estadualTitles(c)}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name="trophy" size={13} /> {c.trophies.slice(-6).map((t) => `${COMP_META[t.comp]?.short ?? t.name} ${t.season}`).join(" · ")}
              </div>
            </div>
          )}
        </aside>

        <main className="k-clubinfo-main">
          <div className="card flat" style={{ padding: "6px 10px" }}>
            <div className="card-title">
              <h3>Elenco Profissional ({squad.length})</h3>
            </div>
            <div className="list mt4">
              {squad.map((p) => <PlayerRow key={p.id} p={p} club={c} season={w.season} onClick={() => push({ name: "player", id: p.id })} />)}
            </div>
          </div>
          {youth.length > 0 && (
            <div className="card flat mt8" style={{ padding: "6px 10px" }}>
              <div className="card-title">
                <h3>Categorias de Base ({youth.length})</h3>
              </div>
              <div className="list mt4">{youth.map((p) => <PlayerRow key={p.id} p={p} club={c} season={w.season} onClick={() => push({ name: "player", id: p.id })} />)}</div>
            </div>
          )}
        </main>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

export function FinancesScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const inc = c.finance.income, exp = c.finance.expense;
  const totalIn = Object.values(inc).reduce((s, v) => s + v, 0);
  const totalOut = Object.values(exp).reduce((s, v) => s + v, 0);
  return (
    <div className="page k-fin-page">
      <div className="fin-hero k-fin-banner">
        <div className="k-fin-kpis">
          <div className="k-fin-kpi">
            <small>Saldo em Caixa</small>
            <b className="big-num" style={{ color: "#34d27b" }}>{formatMoney(c.balance)}</b>
          </div>
          <div className="k-fin-kpi">
            <small>Receitas ({w.season})</small>
            <b style={{ color: "var(--accent)" }}>{formatMoney(totalIn)}</b>
          </div>
          <div className="k-fin-kpi">
            <small>Despesas ({w.season})</small>
            <b style={{ color: "var(--danger)" }}>{formatMoney(totalOut)}</b>
          </div>
          <div className="k-fin-kpi">
            <small>Balanço Anual</small>
            <b style={{ color: totalIn - totalOut >= 0 ? "var(--accent)" : "var(--danger)" }}>
              {formatMoney(totalIn - totalOut)}
            </b>
          </div>
        </div>
      </div>
      <div className="k-fin-grid">
        <div className="card k-fin-col">
          <h3>Receitas {w.season}</h3>
          {Object.entries(INCOME_LABELS).map(([k, l]) => <Line key={k} l={l} v={inc[k] ?? 0} />)}
          <Line l="Total" v={totalIn} bold />
        </div>
        <div className="card k-fin-col">
          <h3>Despesas {w.season}</h3>
          {Object.entries(EXPENSE_LABELS).map(([k, l]) => <Line key={k} l={l} v={-(exp[k] ?? 0)} />)}
          <Line l="Total" v={-totalOut} bold />
        </div>
        <div className="card small k-fin-col">
          <h3>Previsão anual & Ingressos</h3>
          <Line l="TV (Anual)" v={annualTV(c)} />
          <Line l="Patrocínios" v={annualSponsor(c)} />
          <Line l="Salários (12m)" v={-wageBill(w, c) * 12} />
          <div className="muted tiny mt4">Bilheteria: preço médio R$ {c.ticket}. Premiações no fim da temporada.</div>
          <div className="row gap8 mt6" style={{ alignItems: "center" }}>
            <span>Ingresso:</span>
            <button className="btn sm" onClick={() => { update(() => { c.ticket = Math.max(10, c.ticket - 10); }); autosave(); }}>−</button>
            <b>R$ {c.ticket}</b>
            <button className="btn sm" onClick={() => { update(() => { c.ticket = Math.min(300, c.ticket + 10); }); autosave(); }}>+</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ l, v, bold }: { l: string; v: number; bold?: boolean }) {
  return (
    <div className="row small" style={{ padding: "5px 0", borderBottom: "1px solid var(--line)", fontWeight: bold ? 800 : 400 }}>
      <span className="grow">{l}</span>
      <span className="kbd" style={{ color: v < 0 ? "var(--danger)" : v > 0 ? "var(--accent)" : undefined }}>{formatMoney(v)}</span>
    </div>
  );
}

export function HistoryScreen() {
  const w = useWorld();
  return (
    <div className="page k-history-page">
      <div className="k-history-grid">
        <aside className="k-history-aside">
          <div className="card">
            <h3>Sua Carreira</h3>
            {w.managerHistory.length === 0 && <div className="empty-state center mt6"><b>Sua história começa agora</b><div className="tiny muted">Complete a primeira temporada para ver as campanhas aqui.</div></div>}
            <div className="col gap2 mt4">
              {w.managerHistory.slice().reverse().map((h, i) => (
                <div key={i} className="row small" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                  <b style={{ width: 44 }}>{h.season}</b>
                  <Crest club={w.clubs[h.clubId]} size={18} />
                  <span className="grow">{w.clubs[h.clubId]?.name} · Série {h.div} · {h.pos ?? "-"}º</span>
                  {h.titles.map((t) => <span key={t} title={COMP_META[t]?.name}><Icon name="trophy" size={15} /></span>)}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="k-history-main">
          <div className="card">
            <h3>Histórico de Campeões das Temporadas</h3>
            <div className="k-history-seasons-grid mt6">
              {w.history.slice().reverse().map((s) => (
                <div key={s.season} className="card small k-history-season-card">
                  <b style={{ color: "var(--gold)" }}>Temporada {s.season}</b>
                  <div className="col gap4 mt4">
                    {Object.entries(s.champions).map(([comp, club]) => (
                      <div key={comp} className="row gap6 tiny" style={{ alignItems: "center" }}>
                        <span className="muted" style={{ width: 80 }}>{COMP_META[comp]?.short ?? comp}</span>
                        {w.clubs[club] && <Crest club={w.clubs[club]} size={14} />}
                        <span className="ellipsis">{w.clubs[club]?.name ?? w.formerClubs?.[club] ?? club}</span>
                      </div>
                    ))}
                  </div>
                  {s.topScorer && <div className="tiny mt4" style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="ball" size={12} /> Artilheiro: {s.topScorer.name} ({s.topScorer.goals})</div>}
                  {s.bestPlayer && <div className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="medal" size={12} /> Craque: {s.bestPlayer.name} ({s.bestPlayer.rating})</div>}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

export function LegendsScreen() {
  const w = useWorld();
  const [tier, setTier] = useState<0 | 1 | 2 | 3>(0);
  const list = LEGENDS.filter((l) => !tier || l.tier === tier).sort((a, b) => Number(!!w.legends[b.id]) - Number(!!w.legends[a.id]) || a.tier - b.tier);
  const found = LEGENDS.filter((l) => w.legends[l.id]).length;
  return (
    <div className="page">
      <div className="card small">
        ⭐ Lendas renascem como garotos de 15-16 anos nas categorias de base (fim de janeiro e meados de julho), quase sempre no clube onde foram reveladas ou viraram ídolos — e às vezes no SEU clube. Contrate-as no Mercado › Lendas!
        <div className="mt8"><b>{found}</b> de {LEGENDS.length} já apareceram.</div>
      </div>
      <div className="chips">
        {(["Todas", "Lendárias", "Épicas", "Raras"] as const).map((l, i) => (
          <button key={l} className={`chip${tier === i ? " active" : ""}`} onClick={() => setTier(i as 0 | 1 | 2 | 3)}>{l}</button>
        ))}
      </div>
      <div className="grid3">
        {list.map((l) => {
          const st = w.legends[l.id];
          const active = st?.active != null ? w.players[st.active] : undefined;
          return (
            <div key={l.id} className={`legend-card t${l.tier}${st ? "" : " locked"}`} onClick={() => active && push({ name: "player", id: active.id })}>
              {active ? <Avatar p={active} club={active.clubId ? w.clubs[active.clubId] : null} season={w.season} size={56} /> : <div style={{ fontSize: 40, height: 56 }}>{st ? "👤" : "❔"}</div>}
              <div className="nm">{st ? l.name : "???"}</div>
              <div className="tiny" style={{ color: "#d9c58a" }}>{TIER_NAMES[l.tier]} · {flag(l.nat)} · {l.pos}</div>
              {active && <div className="tiny" style={{ color: "#fff" }}>{active.clubId ? w.clubs[active.clubId].abbr : "livre"} · {w.season - active.born}a · {active.ovr}</div>}
              {st && !active && <div className="tiny muted">aposentado</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Desempenho: Automático (detecta celular fraco), Leve ou Completo. */
function PerfCard() {
  const [mode, setMode] = useState<PerfMode>(readPerfMode);
  const info = useMemo(() => deviceInfo(), []);
  const lite = mode === "leve" || (mode === "auto" && isWeakDevice(info));
  const pick = (m: PerfMode) => {
    setMode(m);
    savePerfMode(m);
    // a partida segue o modo: Leve = campo 2D; Completo = 3D em qualidade Alta
    try { localStorage.setItem("ldb.graphics.v4", m === "leve" || (m === "auto" && isWeakDevice(info)) ? "leve" : "alta"); } catch { /* */ }
  };
  const bits = [info.memory ? `${info.memory} GB de RAM` : null, info.cores ? `${info.cores} núcleos` : null, info.fps ? `${info.fps} FPS medidos` : null, info.gpu ? info.gpu.replace(/\(.*?\)/g, "").slice(0, 40) : null].filter(Boolean).join(" · ");
  return (
    <div className="card">
      <h3>Desempenho</h3>
      <div className="seg" role="group" aria-label="Modo de desempenho">
        {([["auto", "Automático"], ["leve", "Leve"], ["completo", "Completo"]] as const).map(([m, l]) => (
          <button key={m} className={mode === m ? "active" : ""} aria-pressed={mode === m} onClick={() => pick(m)}>{l}</button>
        ))}
      </div>
      <div className="small muted mt8">
        {lite
          ? "Modo leve ligado: sem desfoque e animações pesadas, sede em botões e partida no campo 2D. Ideal para celulares de entrada."
          : "Visual completo: partida em 3D (qualidade escolhida na própria partida), sede em 3D e efeitos."}
      </div>
      {bits && <div className="tiny muted mt8">Este aparelho: {bits}</div>}
    </div>
  );
}

export function SettingsScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const [sound, setSound] = useState(soundEnabled());
  const [specials, setSpecials] = useState(specialsEnabled());
  const [vol, setVol] = useState(() => Math.round(crowdVolume() * 100));
  const [hasGoal, setHasGoal] = useState(false);
  const [modModal, setModModal] = useState(false);
  useEffect(() => { loadMedia(`goal:${c.id}`).then((d) => setHasGoal(!!d)).catch(() => undefined); }, [c.id]);

  return (
    <div className="page k-settings-page">
      <div className="k-settings-grid">
        <div className="k-settings-col">
          <AdminSettingsCard />
          <PerfCard />

          <div className="card">
            <h3>Opções de Jogo</h3>
            <div className="switch"><div><b>Modo casual</b><div className="tiny muted">Sem demissão por maus resultados.</div></div>
              <input type="checkbox" checked={w.settings.casual} onChange={(e) => { update((x) => { x.settings.casual = e.target.checked; }); autosave(); }} /></div>
            <div className="switch"><div><b>Salvar automaticamente</b><div className="tiny muted">Salva após cada partida.</div></div>
              <input type="checkbox" checked={w.settings.autoSave} onChange={(e) => { update((x) => { x.settings.autoSave = e.target.checked; }); }} /></div>
            <div className="switch"><div><b>Sons da partida</b><div className="tiny muted">Torcida real, cantos e gols.</div></div>
              <input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); setSoundEnabled(e.target.checked); }} /></div>
            {sound && (
              <label className="col gap4" style={{ paddingTop: 6 }}>
                <span className="row"><b className="grow small">Volume torcida</b><span className="tiny muted">{vol}%</span></span>
                <input type="range" min={0} max={100} step={5} value={vol} aria-label="Volume da torcida" onChange={(e) => { const v = Number(e.target.value); setVol(v); setCrowdVolume(v / 100); }} />
              </label>
            )}
            <div className="switch"><div><b>Golpes especiais</b><div className="tiny muted">Efeitos visuais em lances decisivos.</div></div>
              <input type="checkbox" checked={specials} onChange={(e) => { setSpecials(e.target.checked); setSpecialsEnabled(e.target.checked); }} /></div>
            <div className="switch"><div><b>Rostos ilustrados</b><div className="tiny muted">Para quem não tem foto livre.</div></div>
              <input type="checkbox" checked={!!w.settings.cartoonFaces} onChange={(e) => { update((x) => { x.settings.cartoonFaces = e.target.checked; }); autosave(); }} /></div>
            <div className="switch"><div><b>Tema claro</b></div>
              <input type="checkbox" checked={w.settings.theme === "light"} onChange={(e) => { update((x) => { x.settings.theme = e.target.checked ? "light" : "dark"; }); autosave(); }} /></div>
            <div className="col gap4" style={{ paddingTop: 6 }}>
              <b className="small">Frequência de lendas</b>
              <div className="seg">
                {(["Desligado", "Baixa", "Média", "Alta"] as const).map((l, i) => (
                  <button key={l} className={w.settings.legendFreq === i ? "active" : ""} onClick={() => { update((x) => { x.settings.legendFreq = i as 0 | 1 | 2 | 3; }); autosave(); }}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="k-settings-col">
          <div className="card">
            <h3>Personalizar {c.name}</h3>
            <p className="tiny muted">Imagens e áudios locais (salvos no seu aparelho).</p>
            <div className="row mt6" style={{ alignItems: "center" }}>
              <Crest club={c} size={38} />
              <label className="btn sm grow">
                Trocar escudo
                <input type="file" accept="image/*" hidden onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const data = await resizeImage(f, 160);
                  update(() => { c.customCrest = data; });
                  autosave();
                }} />
              </label>
              {c.customCrest && <button className="btn sm" onClick={() => { update(() => { c.customCrest = undefined; }); autosave(); }}>Padrão</button>}
            </div>
            <div className="row mt8" style={{ alignItems: "center" }}>
              <span className="big-ic" style={{ fontSize: 20 }}><Icon name="megaphone" size={20} /></span>
              <label className="btn sm grow">
                {hasGoal ? "Trocar áudio do gol" : "Áudio do gol (hino/canto)"}
                <input type="file" accept="audio/*" hidden onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 4_000_000) { toast("Arquivo muito grande (máx. 4 MB)."); return; }
                  const reader = new FileReader();
                  reader.onload = async () => { await saveMedia(`goal:${c.id}`, reader.result as string); setHasGoal(true); toast("Áudio salvo!"); };
                  reader.readAsDataURL(f);
                }} />
              </label>
              {hasGoal && <button className="btn sm" onClick={async () => { await saveMedia(`goal:${c.id}`, null); setHasGoal(false); }}>Remover</button>}
            </div>
            <ColorEditor c={c} />
          </div>

          <div className="card">
            <h3>Central de Mods & Dados (JSON)</h3>
            <p className="tiny muted">Instale patches comunitários com novos clubes e atletas (estilo Openfoot Manager).</p>
            <button className="btn primary sm block mt6 row center gap6" onClick={() => setModModal(true)}>
              <Ic n="scroll" /> Abrir Central de Mods
            </button>
          </div>

          <div className="card">
            <h3>Backup & Dados</h3>
            <div className="grid2 mt6">
              <button className="btn sm" onClick={() => exportWorld(w)}>⬇️ Exportar save</button>
              <button className="btn sm" onClick={saveNow}><Ic n="save" /> Salvar agora</button>
            </div>
            <button className="btn sm block mt6" onClick={() => {
              let n = 0;
              update((x) => { n = repairWorld(x); });
              if (n) autosave();
              toast(n ? `${n} problema${n > 1 ? "s" : ""} corrigido${n > 1 ? "s" : ""}` : "Tudo certo ✔");
            }}><Ic n="check" /> Verificar integridade</button>
            <p className="tiny muted mt6">Dados dos elencos: Wikipedia/Wikidata ({w.dataDate}).</p>
            <button className="btn sm block mt6" onClick={() => push({ name: "credits" })}><Ic n="scroll" /> Créditos de fotos e sons</button>
          </div>
        </div>
      </div>
      {modModal && <ModdingModal onClose={() => setModModal(false)} />}
      <div style={{ height: 20 }} />
    </div>
  );
}

// ---------------------------------------------------------------- créditos
const CREDIT_GROUPS: { prefix: string; title: string }[] = [
  { prefix: "players/", title: "Fotos de jogadores e lendas" },
  { prefix: "crests/", title: "Escudos" },
  { prefix: "comps/", title: "Logos das competições" },
  { prefix: "stadiums/", title: "Estádios" },
  { prefix: "kits/", title: "Uniformes" },
  { prefix: "audio/", title: "Sons" },
];

export function CreditsScreen() {
  const [credits, setCredits] = useState<Record<string, Credit> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { loadCredits().then(setCredits); }, []);
  if (!credits) return <div className="page"><div className="empty">Carregando…</div></div>;
  const entries = Object.entries(credits);
  return (
    <div className="page">
      <div className="card small">
        <p>Elencos, estádios e datas: <b>Wikipedia</b> (CC BY-SA) e <b>Wikidata</b> (CC0).</p>
        <p className="mt8">Fotos de jogadores e estádios: <b>Wikimedia Commons</b>, com licenças livres. Cada autor está listado abaixo.</p>
        <p className="mt8">Fotos: <b>TheSportsDB.com</b> (carregadas da internet quando há conexão).</p>
        <p className="mt8">Retratos dos elencos: <b>ogol.com.br</b> e <b>site oficial do São Paulo FC</b> (uso pessoal).</p>
        <p className="mt8">Rostos dos jogadores criados pelo jogo (regens): pessoas que não existem, geradas por IA (StyleGAN, thispersondoesnotexist.com).</p>
        <p className="mt8">Escudos, logos e uniformes são marcas dos respectivos clubes e entidades. Logos de competições (CBF, CONMEBOL, federações estaduais), de fornecedoras de material e de patrocinadores, assim como nomes de veículos de imprensa e emissoras, são marcas registradas dos seus donos, usadas aqui sem autorização ou vínculo. Este é um projeto pessoal, sem fins lucrativos e não publicado.</p>
      </div>
      {CREDIT_GROUPS.map((g) => {
        const list = entries.filter(([k]) => k.startsWith(g.prefix));
        if (!list.length) return null;
        const isOpen = open === g.prefix;
        return (
          <div className="card" key={g.prefix}>
            <button className="row" style={{ width: "100%", background: "none", border: 0, color: "inherit", padding: 0 }} onClick={() => setOpen(isOpen ? null : g.prefix)}>
              <b className="grow" style={{ textAlign: "left" }}>{g.title}</b>
              <span className="muted small">{list.length} {isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && (
              <div className="list mt8">
                {list.map(([k, c]) => (
                  <div key={k} className="tiny" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                    <div><b>{c.file.replace(/_/g, " ")}</b></div>
                    <div className="muted">{c.author || "Autor desconhecido"} · {c.license}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ height: 30 }} />
    </div>
  );
}

function ColorEditor({ c }: { c: Club }) {
  return (
    <div className="row mt12 small">
      <span className="grow">Cores do clube</span>
      {[0, 1, 2].map((i) => (
        <input key={i} type="color" value={c.colors[i]} style={{ width: 38, height: 32, border: 0, background: "none" }}
          onChange={(e) => { update(() => { c.colors[i] = e.target.value; c.colors = [...c.colors] as Club["colors"]; }); autosave(); }} />
      ))}
    </div>
  );
}

export function SeasonEndScreen({ summary }: { summary: string[] }) {
  const w = useWorld();
  const last = w.history[w.history.length - 1];
  return (
    <div className="start-bg" style={{ justifyContent: "flex-start", paddingTop: "calc(24px + env(safe-area-inset-top))" }}>
      <div className="col gap12" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
        <div className="center"><div className="big-ic gold"><Icon name="trophy" size={46} /></div><h1>Fim da temporada {last?.season}</h1></div>
        {last && (
          <div className="card">
            {Object.entries(last.champions).map(([comp, club]) => (
              <div key={comp} className="row gap8" style={{ padding: "4px 0" }}><CompLogo id={comp} size={20} /><span className="muted small" style={{ width: 96 }}>{COMP_META[comp]?.short}</span>{w.clubs[club] && <Crest club={w.clubs[club]} size={20} />}<b>{w.clubs[club]?.name ?? w.formerClubs?.[club] ?? club}</b></div>
            ))}
            {last.topScorer && <div className="small mt8" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="ball" size={14} /> Artilheiro: {last.topScorer.name} ({last.topScorer.goals} gols)</div>}
          </div>
        )}
        <div className="card small" style={{ whiteSpace: "pre-line" }}>{summary.join("\n")}</div>
        {last && w.admin?.seasons.includes(last.season) && <div className="tiny center" style={{ color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><Icon name="wrench" size={12} /> Temporada com edições do administrador</div>}
        <button className="btn primary block" onClick={() => { forceBack(); setTab("home"); if (w.fired) push({ name: "fired" }); }}>Começar {w.season}</button>
      </div>
    </div>
  );
}

export function FiredScreen() {
  const w = useWorld();
  if (activeOffers(w).length) {
    return (
      <div className="start-bg">
        <div className="col gap12" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
          <div className="center"><div className="big-ic"><Icon name="trend" size={46} /></div><h1>Você foi demitido</h1><p className="muted">Mas o futebol dá voltas. Estes clubes querem você:</p></div>
          <OfferList w={w} onAccepted={() => { forceBack(); setTab("home"); }} />
        </div>
      </div>
    );
  }
  const offers = Object.values(w.clubs)
    .filter((c) => c.country === "BRA" && c.div !== "D" && c.id !== w.userClubId)
    .sort((a, b) => a.rep - b.rep)
    .slice(0, 40)
    .filter((_, i) => i % 3 === 0)
    .slice(0, 8);
  return (
    <div className="start-bg">
      <div className="col gap12" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
        <div className="center"><div className="big-ic"><Icon name="trend" size={46} /></div><h1>Você foi demitido</h1><p className="muted">Mas o futebol dá voltas. Estes clubes querem você:</p></div>
        {offers.map((c) => <ClubOffer key={c.id} w={w} c={c} />)}
      </div>
    </div>
  );
}

function ClubOffer({ w, c }: { w: World; c: Club }) {
  return (
    <div className="card tap row" onClick={() => { update((x) => fireAndRehire(x, c.id)); autosave(true); forceBack(); setTab("home"); }}>
      <Crest club={c} size={36} />
      <div className="grow"><b>{c.name}</b><div className="small muted">Série {c.div} · {c.city}/{c.region}</div></div>
      <Stars n={clubStars(clubStrength(w, c))} />
    </div>
  );
}
