import { useEffect, useMemo, useState } from "react";
import type { Div } from "../../engine/types";
import type { WorldData } from "../../data/worldTypes";
import { createWorld, type Database, type DbClub } from "../../engine/world";
import { createScenarioWorld, SCENARIO_BY_ID, SCENARIOS } from "../../engine/scenarios";
import "../progression.css";
import { mediaUrl } from "../mediaUrl";
import { deleteSave, importWorldFile, lastSaveId, listSaves, loadWorld, type SaveMeta } from "../../save";
import { back, push, resetNav, toast, useNav } from "../../store";
import { autosave, loadDatabase, loadWorldFile, openWorld, startNewWorld } from "../actions";
import { clubStars, Crest, stadiumSrc, Stars, visibleColor, Ic, Icon } from "../components";
import type { CSSProperties } from "react";
import { flag } from "../flags";
import type { Club } from "../../engine/types";

export function StartScreen() {
  // "Novo jogo" e "Carregar" entram na pilha de navegação: o botão voltar do Android (e do navegador)
  // tira essa entrada e a tela volta ao menu, em vez de minimizar o app.
  const nav = useNav();
  const [sub, setSub] = useState<"new" | "load" | "scenarios">("new");
  const mode: "menu" | "new" | "load" | "scenarios" = nav.stack.length ? sub : "menu";
  const setMode = (m: "menu" | "new" | "load" | "scenarios") => {
    if (m === "menu") { if (nav.stack.length) back(); return; }
    setSub(m);
    if (!nav.stack.length) push({ name: "tab" });
  };
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    listSaves().then(setSaves).catch(() => setSaves([]));
  }, [mode]);

  const last = saves.find((s) => s.id === lastSaveId()) ?? saves[0];

  async function open(id: string) {
    setBusy(true);
    try {
      const w = await loadWorld(id);
      if (w) { resetNav(); await openWorld(w); }
      else toast("Jogo salvo não encontrado.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(f: File) {
    try {
      const w = await importWorldFile(f);
      resetNav();
      await openWorld(w);
      autosave(true);
    } catch {
      toast("Arquivo inválido.");
    }
  }

  if (mode === "new") return <NewGame onBack={() => setMode("menu")} />;
  if (mode === "scenarios") return <Scenarios onBack={() => setMode("menu")} />;

  return (
    <div className="start-bg">
      <div className="start-stadium" aria-hidden="true"><img src={mediaUrl("stadiums/Q155174.webp")} alt="" decoding="async" /></div>
      <div className="col gap12 start-panel" style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <div className="center" style={{ marginBottom: 18 }}>
          <div className="start-ball"><Icon name="ball" size={44} /></div>
          <span className="status-pill" style={{ margin: "14px 0 10px" }}>Temporada 2026 · elencos reais</span>
          <div className="logo">Lendas <span>da Base</span></div>
          <p className="muted">Jogo de técnico de futebol brasileiro. Séries A, B e C, Copa do Brasil, Libertadores e Sul-Americana — e lendas renascendo nas categorias de base.</p>
        </div>
        {mode === "menu" && (
          <>
            {last && (
              <button className="btn primary block" disabled={busy} onClick={() => open(last.id)}>
                ▶ Continuar — {last.clubName} ({last.season}){last.admin ? " 🛠️" : ""}
              </button>
            )}
            <button className="btn gold block" onClick={() => setMode("new")}>＋ Novo jogo</button>
            <button className="btn block" onClick={() => setMode("scenarios")}><Ic n="target" size={18} /> Desafios</button>
            {saves.length > 0 && <button className="btn block" onClick={() => setMode("load")}>Carregar jogo salvo</button>}
            <label className="btn ghost block">
              Importar arquivo de save
              <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
            <p className="tiny muted center mt12">
              Elencos reais coletados da Wikipedia/Wikidata. Escudos e rostos são gerados pelo jogo; você pode trocar por imagens suas.
            </p>
          </>
        )}
        {mode === "load" && (
          <div className="card">
            <div className="card-title"><h2>Jogos salvos</h2><button className="btn sm" onClick={() => setMode("menu")}>Voltar</button></div>
            <div className="list">
              {saves.map((s) => (
                <div key={s.id} className="list-item">
                  <div className="grow" onClick={() => open(s.id)}>
                    <b>{s.clubName}</b> · temporada {s.season} {s.admin && <span className="tag" style={{ color: "var(--gold)" }}>🛠️ editado</span>}
                    <div className="small muted">{s.manager} · salvo em {new Date(s.savedAt).toLocaleString("pt-BR")}</div>
                  </div>
                  {confirmDel === s.id ? (
                    <button className="btn sm danger" onClick={async () => { setConfirmDel(null); await deleteSave(s.id); setSaves(await listSaves()); }}>Confirmar</button>
                  ) : (
                    <button className="btn sm" onClick={() => setConfirmDel(s.id)}>Apagar</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const DIV_LABEL: Record<string, string> = { A: "Série A", B: "Série B", C: "Série C" };

function NewGame({ onBack }: { onBack: () => void }) {
  const [db, setDb] = useState<Database | null>(null);
  const [world, setWorld] = useState<WorldData | undefined>(undefined);
  const [div, setDiv] = useState<string>("A");
  const [clubId, setClubId] = useState<string | null>(null);
  const [name, setName] = useState(() => {
    try { return localStorage.getItem("managerName") ?? ""; } catch { return ""; }
  });
  const [casual, setCasual] = useState(true);
  const [legendFreq, setLegendFreq] = useState<0 | 1 | 2 | 3>(2);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadDatabase().then(setDb);
    loadWorldFile().then(setWorld);
  }, []);

  // clubes do exterior (abas por liga) quando há dados do mundo
  const all = useMemo(() => (db ? [...db.clubs, ...(world?.clubs ?? [])] : []), [db, world]);
  const clubs = useMemo(() => {
    const lg = world?.leagues.find((l) => l.id === div);
    const list = lg ? all.filter((c) => lg.clubs.includes(c.id)) : all.filter((c) => c.div === div && !(world?.clubs.some((x) => x.id === c.id)));
    return list.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  }, [all, div, world]);
  const selected = all.find((c) => c.id === clubId);

  function start() {
    if (!db || !clubId) return;
    setCreating(true);
    try { localStorage.setItem("managerName", name); } catch { /* ignore */ }
    setTimeout(async () => {
      const w = createWorld(db, { managerName: name.trim() || "Professor", clubId, settings: { casual, legendFreq }, world });
      resetNav();
      startNewWorld(w);
    }, 30);
  }

  return (
    <div className="page" style={{ maxWidth: 560, margin: "0 auto", paddingTop: 16, paddingBottom: 120 }}>
      <div className="row">
        <button className="btn sm" onClick={onBack}><Icon name="back" size={18} /> Voltar</button>
        <h2 className="grow center">Novo jogo</h2>
        <span style={{ width: 70 }} />
      </div>
      <label className="field">
        Nome do técnico
        <input className="text" value={name} placeholder="Ex.: Professor Kelvin" onChange={(e) => setName(e.target.value)} maxLength={30} />
      </label>
      <h3>Escolha seu clube</h3>
      <div className="seg">
        {(["A", "B", "C"] as Div[]).map((d) => (
          <button key={d} className={div === d ? "active" : ""} onClick={() => setDiv(d)}>{DIV_LABEL[d]}</button>
        ))}
      </div>
      {world && (
        <div className="chips">
          {world.leagues.map((l) => (
            <button key={l.id} className={`chip${div === l.id ? " active" : ""}`} onClick={() => setDiv(l.id)}>{flag(l.country)} {l.short}</button>
          ))}
        </div>
      )}
      {!db && <div className="empty">Carregando elencos…</div>}
      {!db && <div className="club-pick-grid">{Array.from({ length: 9 }, (_, i) => <div key={i} className="skeleton" style={{ height: 110 }} />)}</div>}
      {selected && <PickPreview c={selected} />}
      <div className="club-pick-grid">
        {clubs.map((c) => (
          <ClubPick key={c.id} c={c} selected={c.id === clubId} onClick={() => setClubId(c.id)} />
        ))}
      </div>
      <div className="card flat">
        <div className="switch">
          <div><b>Modo casual</b><div className="small muted">Você nunca é demitido.</div></div>
          <input type="checkbox" checked={casual} onChange={(e) => setCasual(e.target.checked)} />
        </div>
        <div className="col gap8" style={{ paddingTop: 10 }}>
          <b>Frequência de lendas nas bases</b>
          <div className="seg">
            {(["Desligado", "Baixa", "Média", "Alta"] as const).map((l, i) => (
              <button key={l} className={legendFreq === i ? "active" : ""} onClick={() => setLegendFreq(i as 0 | 1 | 2 | 3)}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 12px calc(12px + env(safe-area-inset-bottom))", background: "var(--bg2)", borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 536, margin: "0 auto" }}>
          <button className="btn primary block" disabled={!selected || creating} onClick={start}>
            {creating ? "Montando o mundo do futebol…" : selected ? `Assumir o ${selected.name}` : "Escolha um clube"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Scenarios({ onBack }: { onBack: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const def = sel ? SCENARIO_BY_ID[sel] : undefined;

  async function start() {
    if (!sel) return;
    setCreating(true);
    const db = await loadDatabase();
    let name = "Professor";
    try { name = localStorage.getItem("managerName")?.trim() || name; } catch { /* ignore */ }
    setTimeout(() => {
      try {
        const w = createScenarioWorld(db, sel, { managerName: name });
        resetNav();
        startNewWorld(w);
      } catch (e) {
        console.error(e);
        toast("Não foi possível montar o desafio.");
        setCreating(false);
      }
    }, 30);
  }

  return (
    <div className="page" style={{ maxWidth: 560, margin: "0 auto", paddingTop: 16, paddingBottom: 120 }}>
      <div className="row">
        <button className="btn sm" onClick={onBack}><Icon name="back" size={18} /> Voltar</button>
        <h2 className="grow center">Desafios</h2>
        <span style={{ width: 70 }} />
      </div>
      <p className="small muted">Cenários prontos com objetivo, vitória e derrota. Depois do desafio, a carreira continua normalmente.</p>
      <div className="col gap8">
        {SCENARIOS.map((s) => (
          <div key={s.id} className="card tap" onClick={() => setSel(s.id)}
            style={{ outline: sel === s.id ? "2px solid var(--accent)" : undefined }}>
            <div className="row">
              <span style={{ fontSize: 28 }}>{s.emoji}</span>
              <div className="grow"><b>{s.title}</b><div className="tiny diff">{"★".repeat(s.difficulty)}{"☆".repeat(3 - s.difficulty)}</div></div>
            </div>
            {sel === s.id && (
              <>
                <div className="small mt8">{s.desc}</div>
                <div className="small mt8"><Ic n="target" /> <b>{s.goal}</b></div>
              </>
            )}
          </div>
        ))}
      </div>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 12px calc(12px + env(safe-area-inset-bottom))", background: "var(--bg2)", borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 536, margin: "0 auto" }}>
          <button className="btn primary block" disabled={!def || creating} onClick={start}>
            {creating ? "Montando o cenário…" : def ? `Aceitar o desafio ${def.emoji}` : "Escolha um desafio"}
          </button>
        </div>
      </div>
    </div>
  );
}

function fakeClub(c: DbClub): Club {
  return { ...c, colors: [...c.colors, "#fff", "#fff"].slice(0, 3), crest: c.crest } as unknown as Club;
}

/** Vitrine do clube escolhido: foto do estádio, escudo e dados. */
function PickPreview({ c }: { c: DbClub }) {
  const photo = stadiumSrc(c);
  const col = visibleColor(c.colors);
  return (
    <div className="pick-preview" style={{ background: `linear-gradient(135deg, ${col}, #0d1322)` }}>
      {photo && <img className="bgimg" src={photo} alt="" decoding="async" />}
      <div className="row" style={{ width: "100%" }}>
        <Crest club={fakeClub(c)} size={60} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="ellipsis" style={{ fontSize: 28 }}>{c.name}</h2>
          <div className="small ellipsis" style={{ opacity: 0.9 }}>{flag("BRA")} {c.city}/{c.region} · <Ic n="stadium" size={13} /> {c.stadium}</div>
          <Stars n={clubStars(c.level)} />
        </div>
      </div>
    </div>
  );
}

function ClubPick({ c, selected, onClick }: { c: DbClub; selected: boolean; onClick: () => void }) {
  return (
    <div data-club-pick className={`club-pick${selected ? " sel" : ""}`} onClick={onClick} style={{ "--c": visibleColor(c.colors) } as CSSProperties}>
      <Crest club={fakeClub(c)} size={46} />
      <b>{c.name}</b>
      <span className="stars"><Stars n={clubStars(c.level)} /></span>
    </div>
  );
}
