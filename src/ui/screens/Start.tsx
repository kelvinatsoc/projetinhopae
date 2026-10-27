import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Club, Div } from "../../engine/types";
import type { WorldData } from "../../data/worldTypes";
import { createWorld, type Database, type DbClub } from "../../engine/world";
import { createScenarioWorld, SCENARIOS } from "../../engine/scenarios";
import { REAL_SPONSORS } from "../../engine/sponsors";
import "../progression.css";
import { mediaUrl } from "../mediaUrl";
import { deleteSave, importWorldFile, lastSaveId, listSaves, loadWorld, type SaveMeta } from "../../save";
import { back, push, resetNav, toast, useNav } from "../../store";
import { autosave, loadDatabase, loadWorldFile, openWorld, SPFC_REAL_2026, startNewWorld } from "../actions";
import { clubStars, CompLogo, Crest, GIcon, Ic, Icon, stadiumSrc, Stars, visibleColor } from "../components";
import { crestFor, KitShirt } from "../Uniforms";
import { flag } from "../flags";

function fakeClub(c: DbClub): Club {
  return { ...c, colors: [...c.colors, "#fff", "#fff"].slice(0, 3), crest: c.crest } as unknown as Club;
}

export function StartScreen() {
  const nav = useNav();
  const [sub, setSub] = useState<"new" | "load" | "scenarios">("new");
  const mode: "menu" | "new" | "load" | "scenarios" = nav.stack.length ? sub : "menu";
  const setMode = (m: "menu" | "new" | "load" | "scenarios") => {
    if (m === "menu") {
      if (nav.stack.length) back();
      return;
    }
    setSub(m);
    if (!nav.stack.length) push({ name: "tab" });
  };
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [db, setDb] = useState<Database | null>(null);

  useEffect(() => {
    listSaves().then(setSaves).catch(() => setSaves([]));
    loadDatabase().then(setDb).catch(() => {});
  }, [mode]);

  const last = saves.find((s) => s.id === lastSaveId()) ?? saves[0];
  const spfcClub = db?.clubs.find((c) => c.id === "sao-paulo");
  const spfcStars = useMemo(() => {
    if (!db) return [];
    const priority = ["Lucas Moura", "Jonathan Calleri", "Robert Arboleda", "Pablo Maia", "Luciano", "Rafael", "Ferreira"];
    return db.players
      .filter((p) => p.c === "sao-paulo")
      .sort((a, b) => {
        const ia = priority.indexOf(a.n);
        const ib = priority.indexOf(b.n);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return b.o - a.o;
      })
      .slice(0, 5);
  }, [db]);

  async function open(id: string) {
    setBusy(true);
    try {
      const w = await loadWorld(id);
      if (w) {
        resetNav();
        await openWorld(w);
      } else {
        toast("Jogo salvo não encontrado.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function quickStartSpfc() {
    setBusy(true);
    try {
      const [loadedDb, loadedWorld] = await Promise.all([loadDatabase(), loadWorldFile()]);
      let mgr = "Treinador";
      try {
        mgr = localStorage.getItem("managerName")?.trim() || mgr;
      } catch {
        /* ignore */
      }
      const w = createWorld(loadedDb, {
        managerName: mgr,
        clubId: "sao-paulo",
        settings: { casual: true, legendFreq: 2 },
        world: loadedWorld,
      });
      resetNav();
      startNewWorld(w);
    } catch {
      toast("Erro ao iniciar carreira rápida.");
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
    <div className="k-start-shell">
      <div className="k-start-bg" aria-hidden="true">
        <img src={mediaUrl("stadiums/Q155174.webp")} alt="" decoding="async" />
        <div className="k-start-bg-overlay" />
      </div>

      {/* Topbar Widescreen */}
      <header className="k-start-topbar">
        <div className="k-start-brand">
          <div className="k-start-logo-badge">
            <Icon name="ball" size={20} />
          </div>
          <div>
            <div className="k-start-brand-title">
              LENDAS <span>DA BASE</span>
            </div>
            <div className="k-start-brand-sub">
              FOOTBALL MANAGER MOBILE · TEMPORADA 2026 · ELENCOS REAIS
            </div>
          </div>
        </div>

        <div className="k-start-top-meta">
          <span className="k-start-pill">
            <Icon name="trophy" size={13} /> Séries A, B, C, Copa do Brasil & Libertadores
          </span>
          <span className="k-start-pill spfc">
            <Icon name="stadium" size={13} /> MorumBIS Edition · São Paulo FC
          </span>
        </div>
      </header>

      {/* Grid Widescreen em 2 Colunas */}
      <div className="k-start-grid">
        {/* Coluna Esquerda: Continuar Carreira + Vitrine Oficial do São Paulo FC */}
        <section className="k-start-hero-col">
          {last && (
            <div className="k-start-save-card">
              <div className="k-start-save-head">
                <span className="k-start-tag-live">CARREIRA ATIVA</span>
                <span className="k-start-save-season">
                  Temporada {last.season} · Salvo em {new Date(last.savedAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <div className="k-start-save-club">
                {db && db.clubs.find((x) => x.id === last.clubId) ? (
                  <Crest club={fakeClub(db.clubs.find((x) => x.id === last.clubId)!)} size={48} />
                ) : (
                  <div className="k-start-logo-badge"><Icon name="shield" size={22} /></div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="k-start-save-name">{last.clubName}</div>
                  <div className="k-start-save-sub">
                    Técnico: <b>{last.manager}</b> {last.admin ? "· Editor Ativo" : ""}
                  </div>
                </div>
                <button
                  className="btn primary k-start-cta"
                  disabled={busy}
                  onClick={() => open(last.id)}
                >
                  ▶ Continuar — {last.clubName} ({last.season})
                </button>
              </div>
            </div>
          )}

          {/* Vitrine Oficial São Paulo FC */}
          <div className="k-start-spfc-showcase">
            <div className="k-start-spfc-banner">
              <img src={mediaUrl("stadiums/Q155174.webp")} alt="MorumBIS" />
              <div className="k-start-spfc-banner-grad" />
              <div className="k-start-spfc-head">
                {spfcClub && <Crest club={fakeClub(spfcClub)} size={50} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="k-start-spfc-badge">DESTAQUE OFICIAL · TRICOLOR PAULISTA</div>
                  <div className="k-start-spfc-title">São Paulo Futebol Clube</div>
                  <div className="k-start-spfc-sub">
                    MorumBIS (66.795) · Superbet · New Balance · CFA Laudo Natel (Cotia)
                  </div>
                </div>
                {spfcClub && (
                  <KitShirt
                    clubId="sao-paulo"
                    which={0}
                    width={40}
                    supplier="New Balance"
                    sponsor="Superbet"
                    crest={crestFor(fakeClub(spfcClub))}
                    colors={spfcClub.colors}
                  />
                )}
                <button className="btn gold sm" disabled={busy} onClick={quickStartSpfc}>
                  <Ic n="play" size={14} /> Assumir o São Paulo
                </button>
              </div>
            </div>

            <div className="k-start-spfc-body">
              <div className="k-start-spfc-honors">
                <span className="k-honor-pill"><b>3×</b> Mundial (92, 93, 05)</span>
                <span className="k-honor-pill"><b>3×</b> Libertadores</span>
                <span className="k-honor-pill"><b>6×</b> Brasileirão</span>
                <span className="k-honor-pill"><b>1×</b> Copa do Brasil (23)</span>
                <span className="k-honor-pill"><b>1×</b> Supercopa Rei (24)</span>
              </div>
              {spfcStars.length > 0 && (
                <div className="k-start-spfc-stars">
                  {spfcStars.map((p) => {
                    const spec = SPFC_REAL_2026[p.n];
                    const ovr = spec?.ovr ?? p.o;
                    const pos = spec?.pos ?? p.p;
                    const no = spec?.num ?? p.no;
                    return (
                      <div key={p.n} className="k-start-star-chip">
                        {p.pi && (
                          <img
                            src={mediaUrl(`players/${p.pi}.webp`)}
                            alt={p.n}
                            className="k-start-star-img"
                          />
                        )}
                        <span className="k-start-star-ovr">{ovr}</span>
                        <span className="k-start-star-pos">{pos}</span>
                        <span className="k-start-star-name">
                          {no ? `#${no} ` : ""}{p.n}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Coluna Direita: Menu Principal ou Lista de Saves */}
        <section className="k-start-menu-col">
          {mode === "menu" ? (
            <>
              <button className="k-start-mode-btn primary" onClick={() => setMode("new")}>
                <div className="k-start-mode-ico">
                  <GIcon slug="jogar" size={22} />
                </div>
                <div className="k-start-mode-txt">
                  <div className="k-start-mode-title">＋ Novo jogo</div>
                  <div className="k-start-mode-desc">
                    Escolha seu clube nas Séries A, B, C ou no exterior e monte sua dinastia.
                  </div>
                </div>
                <Ic n="chevRight" size={18} />
              </button>

              <button className="k-start-mode-btn" onClick={() => setMode("scenarios")}>
                <div className="k-start-mode-ico warn">
                  <Ic n="target" size={20} />
                </div>
                <div className="k-start-mode-txt">
                  <div className="k-start-mode-title">Desafios</div>
                  <div className="k-start-mode-desc">
                    Cenários com objetivo e prazo definidos: Gigante na B, Só a Base e Operação Milagre.
                  </div>
                </div>
                <Ic n="chevRight" size={18} />
              </button>

              {saves.length > 0 && (
                <button className="k-start-mode-btn" onClick={() => setMode("load")}>
                  <div className="k-start-mode-ico info">
                    <GIcon slug="carreira" size={22} />
                  </div>
                  <div className="k-start-mode-txt">
                    <div className="k-start-mode-title">Carregar jogo salvo ({saves.length})</div>
                    <div className="k-start-mode-desc">
                      Gerencie ou alterne entre suas carreiras salvas no aparelho.
                    </div>
                  </div>
                  <Ic n="chevRight" size={18} />
                </button>
              )}

              <label className="k-start-mode-btn" style={{ cursor: "pointer" }}>
                <div className="k-start-mode-ico info">
                  <GIcon slug="salvar" size={22} />
                </div>
                <div className="k-start-mode-txt">
                  <div className="k-start-mode-title">Importar arquivo de save</div>
                  <div className="k-start-mode-desc">
                    Restaure um backup (.json) exportado de outro dispositivo.
                  </div>
                </div>
                <Ic n="chevRight" size={18} />
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
                />
              </label>

              <div className="k-start-foot-note">
                <Ic n="shield" size={13} /> Interface FM24/FM26 Modern Dark · 100% Horizontal Widescreen · Elencos Reais 2026
              </div>
            </>
          ) : (
            <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div className="card-title">
                <h2>Jogos salvos</h2>
                <button className="btn sm" onClick={() => setMode("menu")}>Voltar</button>
              </div>
              <div className="list" style={{ overflowY: "auto", flex: 1 }}>
                {saves.map((s) => (
                  <div key={s.id} className="list-item">
                    <div className="grow" style={{ cursor: "pointer" }} onClick={() => open(s.id)}>
                      <b>{s.clubName}</b> · temporada {s.season}{" "}
                      {s.admin && <span className="tag" style={{ color: "var(--gold)" }}>Editado</span>}
                      <div className="small muted">
                        {s.manager} · salvo em {new Date(s.savedAt).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    {confirmDel === s.id ? (
                      <button
                        className="btn sm danger"
                        onClick={async () => {
                          setConfirmDel(null);
                          await deleteSave(s.id);
                          setSaves(await listSaves());
                        }}
                      >
                        Confirmar
                      </button>
                    ) : (
                      <button className="btn sm" onClick={() => setConfirmDel(s.id)}>
                        Apagar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const DIV_LABEL: Record<string, string> = { A: "Série A", B: "Série B", C: "Série C" };

function NewGame({ onBack }: { onBack: () => void }) {
  const [db, setDb] = useState<Database | null>(null);
  const [world, setWorld] = useState<WorldData | undefined>(undefined);
  const [div, setDiv] = useState<string>("A");
  const [clubId, setClubId] = useState<string | null>("sao-paulo");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("managerName") ?? "";
    } catch {
      return "";
    }
  });
  const [casual, setCasual] = useState(true);
  const [legendFreq, setLegendFreq] = useState<0 | 1 | 2 | 3>(2);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadDatabase().then(setDb);
    loadWorldFile().then(setWorld);
  }, []);

  const all = useMemo(() => (db ? [...db.clubs, ...(world?.clubs ?? [])] : []), [db, world]);
  const clubs = useMemo(() => {
    const lg = world?.leagues.find((l) => l.id === div);
    const list = lg
      ? all.filter((c) => lg.clubs.includes(c.id))
      : all.filter((c) => c.div === div && !world?.clubs.some((x) => x.id === c.id));
    const filtered = search.trim()
      ? list.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
      : list;
    return filtered.sort((a, b) => {
      if (a.id === "sao-paulo") return -1;
      if (b.id === "sao-paulo") return 1;
      return b.level - a.level || a.name.localeCompare(b.name);
    });
  }, [all, div, world, search]);

  const selected = all.find((c) => c.id === clubId) ?? clubs[0];
  const isSpfc = selected?.id === "sao-paulo";
  const sponsors = selected ? REAL_SPONSORS[selected.id] : undefined;

  const topPlayers = useMemo(() => {
    if (!db || !selected) return [];
    const spfcPriority = ["Lucas Moura", "Jonathan Calleri", "Robert Arboleda", "Pablo Maia", "Luciano", "Rafael", "Ferreira"];
    return db.players
      .filter((p) => p.c === selected.id)
      .sort((a, b) => {
        if (selected.id === "sao-paulo") {
          const ia = spfcPriority.indexOf(a.n);
          const ib = spfcPriority.indexOf(b.n);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
        }
        return b.o - a.o;
      })
      .slice(0, 6);
  }, [db, selected]);

  function start() {
    if (!db || !selected) return;
    setCreating(true);
    try {
      localStorage.setItem("managerName", name);
    } catch {
      /* ignore */
    }
    setTimeout(async () => {
      const w = createWorld(db, {
        managerName: name.trim() || "Professor",
        clubId: selected.id,
        settings: { casual, legendFreq },
        world,
      });
      resetNav();
      startNewWorld(w);
    }, 30);
  }

  return (
    <div className="k-newgame-shell">
      {/* Topbar Horizontal de Seleção de Clube */}
      <header className="k-newgame-topbar">
        <button className="btn sm" onClick={onBack}>
          <Icon name="back" size={16} /> Voltar
        </button>
        <div className="k-newgame-title">
          <Ic n="shield" size={15} /> Escolha seu clube
        </div>
        <div className="k-newgame-divs">
          {(["A", "B", "C"] as Div[]).map((d) => (
            <button
              key={d}
              className={`k-div-tab ${div === d ? "active" : ""}`}
              onClick={() => {
                setDiv(d);
                const first = all.find((c) => c.div === d);
                if (d === "A") setClubId("sao-paulo");
                else if (first) setClubId(first.id);
              }}
            >
              <CompLogo id={d} size={15} />
              <span>{DIV_LABEL[d]}</span>
            </button>
          ))}
          {world?.leagues.slice(0, 4).map((l) => (
            <button
              key={l.id}
              className={`k-div-tab ${div === l.id ? "active" : ""}`}
              onClick={() => {
                setDiv(l.id);
                if (l.clubs[0]) setClubId(l.clubs[0]);
              }}
            >
              <span>{flag(l.country)} {l.short}</span>
            </button>
          ))}
        </div>
        <div className="k-newgame-search">
          <Ic n="search" size={13} />
          <input
            type="text"
            placeholder="Buscar clube..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      {/* Corpo em 2 Colunas Horizontais */}
      <div className="k-newgame-grid">
        {/* Coluna Esquerda: Grade/Lista de Clubes */}
        <div className="k-newgame-list">
          {!db && <div className="empty">Carregando elencos…</div>}
          <div className="club-pick-grid k-club-pick-grid">
            {clubs.map((c) => (
              <ClubPick
                key={c.id}
                c={c}
                selected={selected?.id === c.id}
                onClick={() => setClubId(c.id)}
              />
            ))}
          </div>
        </div>

        {/* Coluna Direita: Vitrine Completa do Clube + Configurações + Botão Iniciar */}
        <div className="k-newgame-detail">
          {selected ? (
            <>
              <PickPreview c={selected} />

              <div className="k-newgame-detail-body">
                {/* KPIs Reais do Clube */}
                <div className="k-newgame-kpis">
                  <div className="k-newgame-kpi">
                    <span>Capacidade Estádio</span>
                    <b style={{ color: "#10b981" }}>{selected.capacity.toLocaleString("pt-BR")} lug.</b>
                  </div>
                  <div className="k-newgame-kpi">
                    <span>Força / Nível</span>
                    <b style={{ color: "#facc15" }}>{selected.level} / 95</b>
                  </div>
                  <div className="k-newgame-kpi">
                    <span>Patrocínio Master</span>
                    <b>{sponsors?.shirt ?? "Disponível"}</b>
                  </div>
                  <div className="k-newgame-kpi">
                    <span>Fornecedora</span>
                    <b>{sponsors?.kit ?? "Marca Própria"}</b>
                  </div>
                </div>

                {/* Dossiê Especial São Paulo FC */}
                {isSpfc && (
                  <div className="k-spfc-dossier">
                    <div className="k-spfc-dossier-title">
                      <Ic n="trophy" size={13} /> TRICOLOR PAULISTA · HISTÓRIA & ESTRUTURA REAL
                    </div>
                    <div className="k-spfc-dossier-grid">
                      <span><b>3× Mundial:</b> 1992, 1993, 2005</span>
                      <span><b>3× Libertadores:</b> 1992, 1993, 2005</span>
                      <span><b>6× Brasileirão:</b> 77, 86, 91, 06, 07, 08</span>
                      <span><b>Copa do Brasil:</b> 2023 · <b>Supercopa:</b> 2024</span>
                      <span><b>CT Profissional:</b> Barra Funda</span>
                      <span><b>Base (#MadeInCotia):</b> CFA Laudo Natel</span>
                    </div>
                  </div>
                )}

                {/* Principais Jogadores do Elenco */}
                {topPlayers.length > 0 && (
                  <div className="k-newgame-squad-preview">
                    <div className="k-newgame-sec-title">
                      <Ic n="star" size={12} /> DESTAQUES DO ELENCO ({db?.players.filter((p) => p.c === selected.id).length ?? 0} atletas)
                    </div>
                    <div className="k-newgame-stars-row">
                      {topPlayers.map((p) => {
                        const spec = selected.id === "sao-paulo" ? SPFC_REAL_2026[p.n] : undefined;
                        const ovr = spec?.ovr ?? p.o;
                        const pos = spec?.pos ?? p.p;
                        const no = spec?.num ?? p.no;
                        return (
                          <div key={p.n} className="k-newgame-star-card">
                            {p.pi ? (
                              <img
                                src={mediaUrl(`players/${p.pi}.webp`)}
                                alt={p.n}
                                className="k-newgame-star-img"
                              />
                            ) : (
                              <div className="k-newgame-star-fallback">{pos}</div>
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="k-newgame-star-name">
                                {no ? `#${no} ` : ""}{p.n}
                              </div>
                              <div className="k-newgame-star-meta">
                                <span>{pos}</span> · <b style={{ color: "#10b981" }}>OVR {ovr}</b>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Opções da Carreira + Botão Assumir Clube */}
                <div className="k-newgame-options-row">
                  <label className="k-newgame-input-wrap">
                    <span>TÉCNICO:</span>
                    <input
                      className="text"
                      value={name}
                      placeholder="Ex.: Professor Kelvin"
                      onChange={(e) => setName(e.target.value)}
                      maxLength={30}
                    />
                  </label>

                  <label className="k-newgame-fast-toggle" title="Modo casual: você nunca é demitido">
                    <input
                      type="checkbox"
                      checked={casual}
                      onChange={(e) => setCasual(e.target.checked)}
                    />
                    <span>Modo casual</span>
                  </label>

                  <div className="k-newgame-legends-seg" title="Frequência de lendas nas bases">
                    {(["Desl.", "Baixa", "Média", "Alta"] as const).map((l, i) => (
                      <button
                        key={l}
                        className={legendFreq === i ? "active" : ""}
                        onClick={() => setLegendFreq(i as 0 | 1 | 2 | 3)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="btn primary block k-newgame-submit"
                  disabled={!selected || creating}
                  onClick={start}
                >
                  {creating
                    ? "Montando o mundo do futebol…"
                    : `Assumir o ${selected.name} ▶`}
                </button>
              </div>
            </>
          ) : (
            <div className="empty">Escolha um clube à esquerda</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Scenarios({ onBack }: { onBack: () => void }) {
  const [sel, setSel] = useState<string | null>(SCENARIOS[0]?.id ?? null);
  const [creating, setCreating] = useState(false);

  async function start() {
    if (!sel) return;
    setCreating(true);
    const db = await loadDatabase();
    let name = "Professor";
    try {
      name = localStorage.getItem("managerName")?.trim() || name;
    } catch {
      /* ignore */
    }
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
    <div className="k-newgame-shell">
      <header className="k-newgame-topbar">
        <button className="btn sm" onClick={onBack}>
          <Icon name="back" size={16} /> Voltar
        </button>
        <div className="k-newgame-title">
          <Ic n="target" size={15} /> Desafios & Cenários
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>
          Cenários com objetivo, vitória e derrota · depois a carreira segue livre
        </div>
      </header>

      <div className="k-scenarios-grid">
        {SCENARIOS.map((s) => (
          <div
            key={s.id}
            className={`k-scenario-card tap ${sel === s.id ? "active" : ""}`}
            onClick={() => setSel(s.id)}
          >
            <div className="k-scenario-head">
              <div className="k-start-mode-ico warn">
                <Ic n="trophy" size={18} />
              </div>
              <div className="grow">
                <div className="k-scenario-title">{s.title}</div>
                <div className="tiny diff">
                  {"★".repeat(s.difficulty)}
                  {"☆".repeat(3 - s.difficulty)}
                </div>
              </div>
            </div>
            <p className="k-scenario-desc">{s.desc}</p>
            <div className="small" style={{ color: "var(--gold)", fontWeight: 700 }}>
              <Ic n="target" size={13} /> {s.goal}
            </div>
            {sel === s.id && (
              <button
                className="btn primary sm"
                disabled={creating}
                onClick={(e) => {
                  e.stopPropagation();
                  start();
                }}
              >
                {creating ? "Montando o cenário…" : `Aceitar o desafio ▶`}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vitrine do clube escolhido: foto do estádio, escudo, camisa e dados. */
function PickPreview({ c }: { c: DbClub }) {
  const photo = stadiumSrc(c);
  const col = visibleColor(c.colors);
  const sponsors = REAL_SPONSORS[c.id];
  const fc = fakeClub(c);
  return (
    <div
      className="pick-preview k-pick-preview"
      style={{ background: `linear-gradient(135deg, ${col}, #0d1322)` }}
    >
      {photo && <img className="bgimg" src={photo} alt="" decoding="async" />}
      <div className="row" style={{ width: "100%", gap: 12, alignItems: "center" }}>
        <Crest club={fc} size={52} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="ellipsis" style={{ fontSize: 22, margin: 0 }}>{c.name}</h2>
          <div className="small ellipsis" style={{ opacity: 0.92 }}>
            {flag("BRA")} {c.city}/{c.region} · <Ic n="stadium" size={12} />{" "}
            {sponsors?.stadium ?? c.stadium} ({c.capacity.toLocaleString("pt-BR")} lug.)
          </div>
          <Stars n={clubStars(c.level)} />
        </div>
        <KitShirt
          clubId={c.id}
          which={0}
          width={42}
          supplier={sponsors?.kit ?? null}
          sponsor={sponsors?.shirt ?? null}
          crest={crestFor(fc)}
          colors={fc.colors}
        />
      </div>
    </div>
  );
}

function ClubPick({ c, selected, onClick }: { c: DbClub; selected: boolean; onClick: () => void }) {
  return (
    <div
      data-club-pick
      className={`club-pick${selected ? " sel" : ""}`}
      onClick={onClick}
      style={{ "--c": visibleColor(c.colors) } as CSSProperties}
    >
      <Crest club={fakeClub(c)} size={38} />
      <b>{c.name}</b>
      <span className="stars">
        <Stars n={clubStars(c.level)} />
      </span>
    </div>
  );
}
