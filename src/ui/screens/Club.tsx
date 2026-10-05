import { useEffect, useState } from "react";
import { LEGENDS, TIER_NAMES } from "../../data/legends";
import { COMP_META } from "../../engine/competitions";
import { annualSponsor, annualTV, EXPENSE_LABELS, formatMoney, INCOME_LABELS, wageBill } from "../../engine/finance";
import { clubStrength, squadOf } from "../../engine/lineup";
import { POS_ORDER } from "../../engine/positions";
import { repairWorld } from "../../engine/integrity";
import { fireAndRehire } from "../../engine/season";
import type { Club, World } from "../../engine/types";
import { exportWorld, saveWorld } from "../../save";
import { forceBack, push, resetNav, setTab, setWorld, toast, update, useWorld } from "../../store";
import { autosave, saveNow } from "../actions";
import { loadMedia, saveMedia, setSoundEnabled, soundEnabled } from "../audio";
import { Avatar, Bar, clubStars, CompLogo, Crest, PlayerRow, StadiumPhoto, Stars } from "../components";
import { loadCredits, type Credit } from "../credits";
import { flag } from "../flags";
import { resizeImage } from "./Player";
import { AdminSettingsCard } from "./Admin";

export function ClubScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const titles = c.trophies.length;
  return (
    <div className="page">
      <div className="hero" style={{ background: `linear-gradient(135deg, ${c.colors[0]}, ${c.colors[1]})` }}>
        <div className="row">
          <Crest club={c} size={64} />
          <div className="grow">
            <h2>{c.full}</h2>
            <div className="small" style={{ opacity: 0.9 }}>{c.city}/{c.region} · {c.nickname || ""}</div>
            <div className="small mt8"><Stars n={clubStars(clubStrength(w, c))} /></div>
          </div>
        </div>
        <div className="small mt12">🏟️ {c.stadium} · {c.capacity.toLocaleString("pt-BR")} lugares</div>
      </div>

      <div className="grid3">
        <div className="stat-box"><b style={{ fontSize: 14 }}>{formatMoney(c.balance)}</b><span>saldo</span></div>
        <div className="stat-box"><b style={{ fontSize: 14 }}>{formatMoney(wageBill(w, c))}</b><span>folha/mês</span></div>
        <div className="stat-box"><b>{titles}</b><span>títulos (no jogo)</span></div>
      </div>

      <StadiumPhoto club={c} />

      <div className="card tap" onClick={() => push({ name: "board" })}>
        <div className="card-title"><h3>Diretoria</h3><span className="small">{Math.round(w.board.confidence)}%</span></div>
        <Bar v={w.board.confidence} />
        <div className="small mt8">🎯 {w.board.objective}</div>
      </div>

      <div className="col gap8">
        <MenuItem icon="⭐" label="Álbum de Lendas" sub="Lendas que renasceram nas bases" onClick={() => push({ name: "legends" })} />
        <MenuItem icon="🌱" label="Categorias de base" sub={`${c.players.filter((id) => w.players[id]?.youth).length} jogadores`} onClick={() => push({ name: "youth" })} />
        <MenuItem icon="🏋️" label="Treino" sub="Foco do time, intensidade e treino individual" onClick={() => push({ name: "training" })} />
        <MenuItem icon="👔" label="Comissão técnica" sub="Auxiliar, treinador, preparador, olheiro e base" onClick={() => push({ name: "staff" })} />
        <MenuItem icon="🏛️" label="Diretoria e obras" sub="Pedidos, estádio, CT e base" onClick={() => push({ name: "board" })} />
        <MenuItem icon="🤝" label="Vestiário" sub="Clima do elenco, conversas e promessas" onClick={() => push({ name: "dressing" })} />
        <MenuItem icon="🤝" label="Patrocínios" sub="Camisa, nome do estádio e material esportivo" onClick={() => push({ name: "sponsors" })} />
        <MenuItem icon="🏗️" label="Estrutura" sub="Estádio, CT, base e departamento médico" onClick={() => push({ name: "facilities" })} />
        <MenuItem icon="💰" label="Finanças" sub="Receitas, despesas e salários" onClick={() => push({ name: "finances" })} />
        <MenuItem icon="📜" label="Histórico" sub="Campeões e suas temporadas" onClick={() => push({ name: "history" })} />
        <MenuItem icon="🔎" label="Ver página do clube" sub="Elenco e informações" onClick={() => push({ name: "club", id: c.id })} />
        <MenuItem icon="⚙️" label="Configurações" sub="Modo casual, lendas, som, escudo, créditos" onClick={() => push({ name: "settings" })} />
        {w.admin?.on && <MenuItem icon="🛠️" label="Painel do administrador" sub="Editor, trapaças e ponto de restauração" onClick={() => push({ name: "admin" })} />}
      </div>

      <div className="grid2">
        <button className="btn" onClick={saveNow}>💾 Salvar</button>
        <button className="btn" onClick={async () => { await saveWorld(w); setWorld(null); resetNav(); }}>🚪 Sair para o menu</button>
      </div>
      <div style={{ height: 30 }} />
    </div>
  );
}

function MenuItem({ icon, label, sub, onClick }: { icon: string; label: string; sub: string; onClick: () => void }) {
  return (
    <div className="card tap row" onClick={onClick} style={{ padding: 12 }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <div className="grow"><b>{label}</b><div className="small muted">{sub}</div></div>
      <span className="muted">›</span>
    </div>
  );
}

export function ClubInfoScreen({ id }: { id: string }) {
  const w = useWorld();
  const c = w.clubs[id];
  if (!c) return <div className="page"><div className="empty">Clube não encontrado.</div></div>;
  const squad = squadOf(w, c).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr);
  const youth = c.players.map((pid) => w.players[pid]).filter((p) => p?.youth);
  return (
    <div className="page">
      <div className="hero" style={{ background: `linear-gradient(135deg, ${c.colors[0]}, ${c.colors[1]})` }}>
        <div className="row">
          <Crest club={c} size={58} />
          <div className="grow">
            <h2>{c.name}</h2>
            <div className="small" style={{ opacity: 0.9 }}>{c.full}</div>
            <div className="small">{c.country === "BRA" ? `${c.city}/${c.region}` : `${flag(c.country)} ${c.city || c.country}`} · {c.div === "F" ? "Exterior" : `Série ${c.div}`}</div>
          </div>
        </div>
        <div className="small mt12">🏟️ {c.stadium} ({c.capacity.toLocaleString("pt-BR")}) {c.founded ? `· fundado em ${c.founded}` : ""}</div>
      </div>
      <StadiumPhoto club={c} />
      <div className="grid3">
        <div className="stat-box"><b>{Math.round(clubStrength(w, c))}</b><span>força</span></div>
        <div className="stat-box"><b>{squad.length}</b><span>jogadores</span></div>
        <div className="stat-box"><b>{c.trophies.length}</b><span>títulos (jogo)</span></div>
      </div>
      {c.trophies.length > 0 && (
        <div className="card small">🏆 {c.trophies.slice(-8).map((t) => `${COMP_META[t.comp]?.short ?? t.name} ${t.season}`).join(" · ")}</div>
      )}
      <div className="card flat" style={{ padding: "2px 10px" }}>
        <div className="list">
          {squad.map((p) => <PlayerRow key={p.id} p={p} club={c} season={w.season} onClick={() => push({ name: "player", id: p.id })} />)}
        </div>
      </div>
      {youth.length > 0 && (
        <>
          <h3>Base</h3>
          <div className="card flat" style={{ padding: "2px 10px" }}>
            <div className="list">{youth.map((p) => <PlayerRow key={p.id} p={p} club={c} season={w.season} onClick={() => push({ name: "player", id: p.id })} />)}</div>
          </div>
        </>
      )}
      <div style={{ height: 30 }} />
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
    <div className="page">
      <div className="grid2">
        <div className="stat-box"><b style={{ fontSize: 15 }}>{formatMoney(c.balance)}</b><span>saldo atual</span></div>
        <div className="stat-box"><b style={{ fontSize: 15, color: totalIn - totalOut >= 0 ? "var(--accent)" : "var(--danger)" }}>{formatMoney(totalIn - totalOut)}</b><span>resultado em {w.season}</span></div>
      </div>
      <div className="card">
        <h3>Receitas {w.season}</h3>
        {Object.entries(INCOME_LABELS).map(([k, l]) => <Line key={k} l={l} v={inc[k] ?? 0} />)}
        <Line l="Total" v={totalIn} bold />
      </div>
      <div className="card">
        <h3>Despesas {w.season}</h3>
        {Object.entries(EXPENSE_LABELS).map(([k, l]) => <Line key={k} l={l} v={-(exp[k] ?? 0)} />)}
        <Line l="Total" v={-totalOut} bold />
      </div>
      <div className="card small">
        <h3>Previsão anual</h3>
        <Line l="TV" v={annualTV(c)} />
        <Line l="Patrocínios" v={annualSponsor(c)} />
        <Line l="Salários (12 meses)" v={-wageBill(w, c) * 12} />
        <div className="muted tiny mt8">Bilheteria depende do público: preço médio do ingresso R$ {c.ticket}. Premiações são pagas no fim da temporada.</div>
        <div className="row gap8 mt8">
          <span>Ingresso:</span>
          <button className="btn sm" onClick={() => { update(() => { c.ticket = Math.max(10, c.ticket - 10); }); autosave(); }}>−</button>
          <b>R$ {c.ticket}</b>
          <button className="btn sm" onClick={() => { update(() => { c.ticket = Math.min(300, c.ticket + 10); }); autosave(); }}>+</button>
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
    <div className="page">
      <div className="card">
        <h3>Sua carreira</h3>
        {w.managerHistory.length === 0 && <div className="small muted mt8">Complete uma temporada para ver o histórico.</div>}
        {w.managerHistory.slice().reverse().map((h, i) => (
          <div key={i} className="row small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <b style={{ width: 44 }}>{h.season}</b>
            <Crest club={w.clubs[h.clubId]} size={18} />
            <span className="grow">{w.clubs[h.clubId]?.name} · Série {h.div} · {h.pos ?? "-"}º</span>
            {h.titles.map((t) => <span key={t} title={COMP_META[t]?.name}>🏆</span>)}
            {h.admin && <span title="Temporada com edições do administrador">🛠️</span>}
          </div>
        ))}
      </div>
      {w.history.slice().reverse().map((s) => (
        <div key={s.season} className="card small">
          <b>{s.season}</b>
          {Object.entries(s.champions).map(([comp, club]) => (
            <div key={comp} className="row gap8 mt8"><span className="muted" style={{ width: 110 }}>{COMP_META[comp]?.short}</span><Crest club={w.clubs[club]} size={16} />{w.clubs[club]?.name}</div>
          ))}
          {s.topScorer && <div className="mt8">⚽ Artilheiro da Série A: {s.topScorer.name} ({s.topScorer.goals})</div>}
          {s.bestPlayer && <div>🌟 Craque da Série A: {s.bestPlayer.name} (nota {s.bestPlayer.rating})</div>}
        </div>
      ))}
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

export function SettingsScreen() {
  const w = useWorld();
  const c = w.clubs[w.userClubId];
  const [sound, setSound] = useState(soundEnabled());
  const [hasGoal, setHasGoal] = useState(false);
  useEffect(() => { loadMedia(`goal:${c.id}`).then((d) => setHasGoal(!!d)).catch(() => undefined); }, [c.id]);

  return (
    <div className="page">
      <AdminSettingsCard />
      <div className="card">
        <h3>Jogo</h3>
        <div className="switch"><div><b>Modo casual</b><div className="small muted">Sem demissão por maus resultados.</div></div>
          <input type="checkbox" checked={w.settings.casual} onChange={(e) => { update((x) => { x.settings.casual = e.target.checked; }); autosave(); }} /></div>
        <div className="switch"><div><b>Salvar automaticamente</b><div className="small muted">Salva depois de cada jogo.</div></div>
          <input type="checkbox" checked={w.settings.autoSave} onChange={(e) => { update((x) => { x.settings.autoSave = e.target.checked; }); }} /></div>
        <div className="switch"><div><b>Sons da partida</b><div className="small muted">Torcida, apito e gol (sintetizados).</div></div>
          <input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); setSoundEnabled(e.target.checked); }} /></div>
        <div className="switch"><div><b>Rostos ilustrados</b><div className="small muted">Para jogadores reais sem foto livre (em vez da silhueta).</div></div>
          <input type="checkbox" checked={!!w.settings.cartoonFaces} onChange={(e) => { update((x) => { x.settings.cartoonFaces = e.target.checked; }); autosave(); }} /></div>
        <div className="switch"><div><b>Tema claro</b></div>
          <input type="checkbox" checked={w.settings.theme === "light"} onChange={(e) => { update((x) => { x.settings.theme = e.target.checked ? "light" : "dark"; }); autosave(); }} /></div>
        <div className="col gap8" style={{ paddingTop: 10 }}>
          <b>Frequência de lendas</b>
          <div className="seg">
            {(["Desligado", "Baixa", "Média", "Alta"] as const).map((l, i) => (
              <button key={l} className={w.settings.legendFreq === i ? "active" : ""} onClick={() => { update((x) => { x.settings.legendFreq = i as 0 | 1 | 2 | 3; }); autosave(); }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Personalizar o {c.name}</h3>
        <p className="small muted">Use imagens e áudios seus (ficam só neste aparelho).</p>
        <div className="row">
          <Crest club={c} size={44} />
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
        <div className="row mt12">
          <span style={{ fontSize: 26 }}>📣</span>
          <label className="btn sm grow">
            {hasGoal ? "Trocar áudio do gol (canto/hino)" : "Áudio do gol (canto/hino)"}
            <input type="file" accept="audio/*" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 4_000_000) { toast("Arquivo muito grande (máx. 4 MB)."); return; }
              const reader = new FileReader();
              reader.onload = async () => { await saveMedia(`goal:${c.id}`, reader.result as string); setHasGoal(true); toast("Áudio salvo! Toca nos gols do seu time."); };
              reader.readAsDataURL(f);
            }} />
          </label>
          {hasGoal && <button className="btn sm" onClick={async () => { await saveMedia(`goal:${c.id}`, null); setHasGoal(false); }}>Remover</button>}
        </div>
        <ColorEditor c={c} />
      </div>

      <div className="card">
        <h3>Backup</h3>
        <div className="grid2 mt8">
          <button className="btn sm" onClick={() => exportWorld(w)}>⬇️ Exportar save</button>
          <button className="btn sm" onClick={saveNow}>💾 Salvar agora</button>
        </div>
        <button className="btn sm block mt8" onClick={() => {
          let n = 0;
          update((x) => { n = repairWorld(x); });
          if (n) autosave();
          toast(n ? `${n} problema${n > 1 ? "s" : ""} corrigido${n > 1 ? "s" : ""}` : "Tudo certo ✔");
        }}>🩺 Verificar save</button>
        <p className="tiny muted mt8">Dados dos elencos: Wikipedia/Wikidata ({w.dataDate}). Notas estimadas pelo jogo — edite no perfil do jogador.</p>
        <button className="btn sm block mt8" onClick={() => push({ name: "credits" })}>📜 Créditos das fotos, escudos e sons</button>
      </div>
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
        <p className="mt8">Rostos dos jogadores criados pelo jogo (regens): pessoas que não existem, geradas por IA (StyleGAN, thispersondoesnotexist.com).</p>
        <p className="mt8">Escudos, logos e uniformes são marcas dos respectivos clubes e entidades. Este é um projeto pessoal, sem fins lucrativos.</p>
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
        <div className="center"><div style={{ fontSize: 48 }}>🏆</div><h1>Fim da temporada {last?.season}</h1></div>
        {last && (
          <div className="card">
            {Object.entries(last.champions).map(([comp, club]) => (
              <div key={comp} className="row gap8" style={{ padding: "4px 0" }}><CompLogo id={comp} size={20} /><span className="muted small" style={{ width: 96 }}>{COMP_META[comp]?.short}</span><Crest club={w.clubs[club]} size={20} /><b>{w.clubs[club]?.name}</b></div>
            ))}
            {last.topScorer && <div className="small mt8">⚽ Artilheiro: {last.topScorer.name} ({last.topScorer.goals} gols)</div>}
          </div>
        )}
        <div className="card small" style={{ whiteSpace: "pre-line" }}>{summary.join("\n")}</div>
        {last && w.admin?.seasons.includes(last.season) && <div className="tiny center" style={{ color: "var(--gold)" }}>🛠️ Temporada com edições do administrador</div>}
        <button className="btn primary block" onClick={() => { forceBack(); setTab("home"); if (w.fired) push({ name: "fired" }); }}>Começar {w.season}</button>
      </div>
    </div>
  );
}

export function FiredScreen() {
  const w = useWorld();
  const offers = Object.values(w.clubs)
    .filter((c) => c.country === "BRA" && c.div !== "D" && c.id !== w.userClubId)
    .sort((a, b) => a.rep - b.rep)
    .slice(0, 40)
    .filter((_, i) => i % 3 === 0)
    .slice(0, 8);
  return (
    <div className="start-bg">
      <div className="col gap12" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
        <div className="center"><div style={{ fontSize: 48 }}>📉</div><h1>Você foi demitido</h1><p className="muted">Mas o futebol dá voltas. Estes clubes querem você:</p></div>
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
