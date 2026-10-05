import { useEffect, useMemo, useState } from "react";
import type { Div } from "../../engine/types";
import { createWorld, type Database, type DbClub } from "../../engine/world";
import { deleteSave, importWorldFile, lastSaveId, listSaves, loadWorld, type SaveMeta } from "../../save";
import { toast } from "../../store";
import { autosave, loadDatabase, openWorld, startNewWorld } from "../actions";
import { clubStars, Crest, Stars } from "../components";
import { flag } from "../flags";
import type { Club } from "../../engine/types";

export function StartScreen() {
  const [mode, setMode] = useState<"menu" | "new" | "load">("menu");
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSaves().then(setSaves).catch(() => setSaves([]));
  }, [mode]);

  const last = saves.find((s) => s.id === lastSaveId()) ?? saves[0];

  async function open(id: string) {
    setBusy(true);
    try {
      const w = await loadWorld(id);
      if (w) await openWorld(w);
      else toast("Jogo salvo não encontrado.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(f: File) {
    try {
      const w = await importWorldFile(f);
      await openWorld(w);
      autosave(true);
    } catch {
      toast("Arquivo inválido.");
    }
  }

  if (mode === "new") return <NewGame onBack={() => setMode("menu")} />;

  return (
    <div className="start-bg">
      <div className="col gap12" style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <div className="center" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 54 }}>⚽</div>
          <div className="logo">Lendas <span>da Base</span></div>
          <p className="muted">Manager de futebol brasileiro. Séries A, B e C, Copa do Brasil, Libertadores e Sul-Americana — e lendas renascendo nas categorias de base.</p>
        </div>
        {mode === "menu" && (
          <>
            {last && (
              <button className="btn primary block" disabled={busy} onClick={() => open(last.id)}>
                ▶ Continuar — {last.clubName} ({last.season})
              </button>
            )}
            <button className="btn gold block" onClick={() => setMode("new")}>＋ Novo jogo</button>
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
                    <b>{s.clubName}</b> · temporada {s.season}
                    <div className="small muted">{s.manager} · salvo em {new Date(s.savedAt).toLocaleString("pt-BR")}</div>
                  </div>
                  <button className="btn sm danger" onClick={async () => { if (confirm("Apagar este jogo salvo?")) { await deleteSave(s.id); setSaves(await listSaves()); } }}>Apagar</button>
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
  const [div, setDiv] = useState<Div>("A");
  const [clubId, setClubId] = useState<string | null>(null);
  const [name, setName] = useState(() => {
    try { return localStorage.getItem("managerName") ?? ""; } catch { return ""; }
  });
  const [casual, setCasual] = useState(true);
  const [legendFreq, setLegendFreq] = useState<0 | 1 | 2 | 3>(2);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadDatabase().then(setDb);
  }, []);

  const clubs = useMemo(() => (db ? db.clubs.filter((c) => c.div === div).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)) : []), [db, div]);
  const selected = db?.clubs.find((c) => c.id === clubId);

  function start() {
    if (!db || !clubId) return;
    setCreating(true);
    try { localStorage.setItem("managerName", name); } catch { /* ignore */ }
    setTimeout(() => {
      const w = createWorld(db, { managerName: name.trim() || "Professor", clubId, settings: { casual, legendFreq } });
      startNewWorld(w);
    }, 30);
  }

  return (
    <div className="page" style={{ maxWidth: 560, margin: "0 auto", paddingTop: 16, paddingBottom: 120 }}>
      <div className="row">
        <button className="btn sm" onClick={onBack}>← Voltar</button>
        <h2 className="grow center">Novo jogo</h2>
        <span style={{ width: 70 }} />
      </div>
      <label className="field">
        Nome do treinador
        <input className="text" value={name} placeholder="Ex.: Professor Kelvin" onChange={(e) => setName(e.target.value)} maxLength={30} />
      </label>
      <h3>Escolha seu clube</h3>
      <div className="seg">
        {(["A", "B", "C"] as Div[]).map((d) => (
          <button key={d} className={div === d ? "active" : ""} onClick={() => setDiv(d)}>{DIV_LABEL[d]}</button>
        ))}
      </div>
      {!db && <div className="empty">Carregando elencos…</div>}
      <div className="card flat" style={{ padding: 4 }}>
        <div className="list">
          {clubs.map((c) => (
            <ClubPick key={c.id} c={c} selected={c.id === clubId} onClick={() => setClubId(c.id)} />
          ))}
        </div>
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

function ClubPick({ c, selected, onClick }: { c: DbClub; selected: boolean; onClick: () => void }) {
  const fake = { ...c, colors: [...c.colors, "#fff", "#fff"].slice(0, 3), crest: c.crest } as unknown as Club;
  return (
    <div className="list-item" onClick={onClick} style={{ background: selected ? "color-mix(in srgb, var(--accent) 18%, transparent)" : undefined, borderRadius: 10, padding: "9px 8px" }}>
      <Crest club={fake} size={34} />
      <div className="grow">
        <b>{c.name}</b>
        <div className="small muted ellipsis">{flag("BRA")} {c.city}/{c.region} · {c.stadium}</div>
      </div>
      <Stars n={clubStars(c.level)} />
    </div>
  );
}
