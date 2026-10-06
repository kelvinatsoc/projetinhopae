// Modo Administrador (Trilha C): painel, editor completo, trapaças e ponto de restauração.
// É o jogo offline do próprio usuário: tudo liberado, só fica o selo 🛠️ nas temporadas usadas.
import { useEffect, useMemo, useState } from "react";
import { LEGENDS, TIER_NAMES } from "../../data/legends";
import {
  adminAllStaffFive, adminBoard, adminClearPin, adminClub, adminCreatePlayer, adminEditPlayer, adminFinishProjects, adminForceGem,
  adminForgotPin, adminIntake, adminLegendWave, adminMoney, adminMovePlayer, adminPoints, adminRetire, adminSetCheat, adminSetOn,
  adminSetPin, adminSetYouth, adminSpawnLegend, adminSquad, adminStaffStars, adminTakeOver, adminUndo, BOOSTS, CHEATS, lastUndo,
  legendStatus, money, OBJECTIVES, objectivesFor, type AdminPlayerPatch, type AdminResult, type ClubPatch, type CreateSpec,
} from "../../engine/admin";
import { formatDate } from "../../engine/calendar";
import { repairWorld } from "../../engine/integrity";
import { H, personalityLabel } from "../../engine/personality";
import { playerValue } from "../../engine/player";
import { ATTR_NAMES, POSITIONS, rawOvr, WEIGHTS } from "../../engine/positions";
import { ensureStaff, STAFF_INFO, STAFF_ROLES } from "../../engine/staff";
import { TRAIT_IDS, TRAITS } from "../../engine/traits";
import type { Attrs, Club, Hidden, IntakeQuality, Player, Pos, TraitId, World } from "../../engine/types";
import { hasSnapshot, type SnapshotMeta } from "../../save";
import { back, push, toast, update, useWorld } from "../../store";
import { autosave, restoreBeforeMatch } from "../actions";
import { Crest, PlayerRow, Sheet } from "../components";
import { COUNTRY_NAME, flag } from "../flags";
import "../club.css";

type Tab = "clube" | "jogadores" | "trapacas" | "mundo" | "registro";
const TABS: [Tab, string][] = [["clube", "Clube"], ["jogadores", "Jogadores"], ["trapacas", "Trapaças"], ["mundo", "Mundo"], ["registro", "Registro"]];

/** Executa uma operação do admin, redesenha, salva e mostra o resultado. */
function run(fn: (w: World) => AdminResult, quiet = false): AdminResult {
  let res: AdminResult = { ok: false, msg: "" };
  update((w) => { res = fn(w); });
  if (res.ok) autosave();
  if (!quiet || !res.ok) toast(res.ok ? `🛠️ ${res.msg}` : res.msg);
  return res;
}

// ---------------------------------------------------------------- peças pequenas
/** Linha de 5 estrelas tocáveis. */
export function StarPick({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <span className="star-pick" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={n <= value ? "on" : ""} aria-label={`${n} estrelas`} onClick={(e) => { e.stopPropagation(); onPick(n); }}>★</button>
      ))}
    </span>
  );
}

function Slider({ label, value, min, max, step = 1, fmt, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; fmt?: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="adm-slider">
      <span className="top"><span>{label}</span><b>{fmt ? fmt(value) : value}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Escolher um clube (busca por nome). */
function ClubPicker({ title, onPick, onClose, exclude }: { title: string; onPick: (c: Club) => void; onClose: () => void; exclude?: string | null }) {
  const w = useWorld();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.values(w.clubs)
      .filter((c) => c.id !== exclude && (!t || c.name.toLowerCase().includes(t) || c.full.toLowerCase().includes(t)))
      .sort((a, b) => a.div.localeCompare(b.div) || b.rep - a.rep)
      .slice(0, 80);
  }, [w, q, exclude]);
  return (
    <Sheet title={title} onClose={onClose}>
      <input className="text" placeholder="Buscar clube…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="list mt8">
        {list.map((c) => (
          <div key={c.id} className="list-item" onClick={() => onPick(c)}>
            <Crest club={c} size={30} />
            <div className="grow"><b>{c.name}</b><div className="small muted">{c.div === "F" ? `${flag(c.country)} Exterior` : `Série ${c.div}`}</div></div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function Confirm({ title, text, yes, danger, onYes, onClose }: { title: string; text: string; yes: string; danger?: boolean; onYes: () => void; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="small">{text}</p>
      <div className="grid2 mt12">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className={`btn ${danger ? "danger" : "primary"}`} onClick={() => { onYes(); onClose(); }}>{yes}</button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Configurações
/** Cartão nas Configurações para ligar o Modo Administrador. */
export function AdminSettingsCard() {
  const w = useWorld();
  const on = !!w.admin?.on;
  const [sheet, setSheet] = useState<null | "activate" | "pin" | "forgot" | "newpin">(null);
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");

  function activate(newPin?: string) {
    update((x) => adminSetOn(x, true, newPin));
    autosave();
    setSheet(null);
    setPin("");
    toast("🛠️ Modo administrador ligado!");
  }

  return (
    <div className="card" style={on ? { borderColor: "#8a6a00" } : undefined}>
      <h3>🛠️ Perfil administrador</h3>
      <div className="switch">
        <div><b>Ativar modo administrador</b><div className="small muted">Edite dinheiro, jogadores, lendas e ligue trapaças.</div></div>
        <input type="checkbox" checked={on} onChange={(e) => {
          if (!e.target.checked) { update((x) => adminSetOn(x, false)); autosave(); toast("Modo administrador desligado."); return; }
          setPin("");
          setSheet(w.admin?.pin ? "pin" : "activate");
        }} />
      </div>
      {on && (
        <div className="col gap8 mt8">
          <button className="btn gold block" onClick={() => push({ name: "admin" })}>🛠️ Abrir o painel do administrador</button>
          {w.admin?.pin
            ? <button className="btn sm" onClick={() => { update((x) => { adminClearPin(x); }); autosave(); toast("Senha removida."); }}>🔓 Remover a senha</button>
            : <button className="btn sm" onClick={() => { setPin(""); setSheet("newpin"); }}>🔒 Criar senha de 4 números</button>}
        </div>
      )}
      {w.admin?.everUsed && <div className="tiny muted mt8">Este save já tem o selo 🛠️ (temporadas: {w.admin.seasons.join(", ")}).</div>}

      {sheet === "activate" && (
        <Sheet title="Ativar o modo administrador?" onClose={() => setSheet(null)}>
          <p className="small">Com ele você pode editar tudo: dinheiro, jogadores, lendas, diretoria e ligar trapaças. É o seu jogo — divirta-se! As temporadas em que você usar o modo ganham o selo 🛠️ no histórico (só para você saber).</p>
          <label className="field mt12">Criar senha de 4 números (opcional)
            <input className="text pin-input" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" />
          </label>
          <p className="tiny muted">A senha é só uma trava para crianças: fica guardada no próprio save.</p>
          <div className="grid2 mt12">
            <button className="btn" onClick={() => setSheet(null)}>Cancelar</button>
            <button className="btn gold" disabled={pin.length > 0 && pin.length < 4} onClick={() => activate(pin.length === 4 ? pin : undefined)}>Ativar</button>
          </div>
        </Sheet>
      )}
      {sheet === "pin" && (
        <Sheet title="🔒 Digite a senha" onClose={() => setSheet(null)}>
          <input className="text pin-input" inputMode="numeric" maxLength={4} value={pin} autoFocus placeholder="••••"
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(v);
              if (v.length === 4) {
                if (v === w.admin?.pin) activate();
                else { toast("Senha errada."); setPin(""); }
              }
            }} />
          <button className="btn ghost block mt12" onClick={() => { setName(""); setSheet("forgot"); }}>Esqueci a senha</button>
        </Sheet>
      )}
      {sheet === "forgot" && (
        <Sheet title="Esqueci a senha" onClose={() => setSheet(null)}>
          <p className="small">Digite o nome do técnico deste save para apagar a senha.</p>
          <input className="text mt8" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do técnico" />
          <button className="btn primary block mt12" onClick={() => {
            let okName = false;
            update((x) => { okName = adminForgotPin(x, name); });
            if (okName) { autosave(); toast("Senha apagada."); setPin(""); setSheet("activate"); }
            else toast("Nome não confere.");
          }}>Apagar a senha</button>
        </Sheet>
      )}
      {sheet === "newpin" && (
        <Sheet title="🔒 Criar senha" onClose={() => setSheet(null)}>
          <input className="text pin-input" inputMode="numeric" maxLength={4} value={pin} autoFocus placeholder="••••" onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          <p className="tiny muted mt8">A senha é só uma trava para crianças: fica guardada no próprio save.</p>
          <button className="btn primary block mt12" disabled={pin.length !== 4} onClick={() => { update((x) => { adminSetPin(x, pin); }); autosave(); toast("Senha criada."); setSheet(null); }}>Salvar senha</button>
        </Sheet>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- painel
export function AdminScreen() {
  const w = useWorld();
  const [tab, setTab] = useState<Tab>("clube");
  if (!w.admin?.on) {
    return (
      <div className="page">
        <div className="card center">
          <div style={{ fontSize: 40 }}>🛠️</div>
          <b>O modo administrador está desligado</b>
          <p className="small muted">Ligue em Clube › Configurações.</p>
          <button className="btn gold block mt12" onClick={() => { update((x) => adminSetOn(x, true)); autosave(); }}>Ligar agora</button>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <div className="seg adm-seg">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "clube" && <ClubTab />}
      {tab === "jogadores" && <PlayersTab />}
      {tab === "trapacas" && <CheatsTab />}
      {tab === "mundo" && <WorldTab />}
      {tab === "registro" && <LogTab />}
      <div style={{ height: 30 }} />
    </div>
  );
}

// ---------------------------------------------------------------- 1) Clube
function ClubTab() {
  const w = useWorld();
  const [clubId, setClubId] = useState(w.userClubId);
  const [picker, setPicker] = useState(false);
  const [takeOver, setTakeOver] = useState(false);
  const c = w.clubs[clubId] ?? w.clubs[w.userClubId];
  const isUser = c.id === w.userClubId;
  const [setValue, setSetValue] = useState("");
  const [draft, setDraft] = useState<{ rep: number; capacity: number; ticket: number }>({ rep: c.rep, capacity: c.capacity, ticket: c.ticket });
  const [conf, setConf] = useState(Math.round(w.board.confidence));
  useEffect(() => { setDraft({ rep: c.rep, capacity: c.capacity, ticket: c.ticket }); }, [c.id, c.rep, c.capacity, c.ticket]);
  useEffect(() => { setConf(Math.round(w.board.confidence)); }, [w.board.confidence]);
  useEffect(() => { if (isUser && !w.staff) update((x) => { ensureStaff(x); }); }, [isUser, w.staff]);
  const dirty = draft.rep !== c.rep || draft.capacity !== c.capacity || draft.ticket !== c.ticket;
  const level = (k: keyof ClubPatch, v: number) => run((x) => adminClub(x, c.id, { [k]: v }));

  return (
    <>
      <div className="card row">
        <Crest club={c} size={40} />
        <div className="grow"><b>{c.name}</b><div className="small muted">{isUser ? "Seu clube" : c.div === "F" ? "Exterior" : `Série ${c.div}`}</div></div>
        <button className="btn sm" onClick={() => setPicker(true)}>Editar outro clube</button>
      </div>

      <div className="card">
        <div className="card-title"><h3>💰 Saldo</h3><b style={{ color: c.balance < 0 ? "var(--danger)" : "var(--accent)" }}>{money(c.balance)}</b></div>
        <div className="chip-wrap">
          {[1e6, 1e7, 1e8].map((v) => <button key={v} className="chip" onClick={() => run((x) => adminMoney(x, c.id, { add: v }))}>+{money(v)}</button>)}
          {c.balance < 0 && <button className="chip" onClick={() => run((x) => adminMoney(x, c.id, { set: 0 }))}>Zerar dívida</button>}
        </div>
        <div className="row gap8 mt8">
          <input className="text grow" inputMode="decimal" placeholder="Definir saldo (em milhões)" value={setValue} onChange={(e) => setSetValue(e.target.value.replace(/[^\d,.-]/g, ""))} />
          <button className="btn sm" disabled={!setValue} onClick={() => {
            const v = Number(setValue.replace(",", ".")) * 1e6;
            if (!Number.isFinite(v)) { toast("Valor inválido."); return; }
            run((x) => adminMoney(x, c.id, { set: v }));
            setSetValue("");
          }}>Definir</button>
        </div>
        <div className="tiny muted mt8">Entra nas Finanças como “Ajuste do administrador”. Limite: R$ 10 bi.</div>
      </div>

      <div className="card">
        <h3>🏗️ Estrutura</h3>
        {([["facilities", "🏋️ CT (Estrutura)"], ["youthLevel", "🔍 Captação da base"], ["youthFac", "🏫 Instalações da base"], ["youthCoach", "🎓 Treinadores da base"]] as [keyof ClubPatch, string][]).map(([k, l]) => (
          <div key={k} className="adm-row">
            <span className="grow small">{l}</span>
            <StarPick value={(c[k] as number | undefined) ?? c.youthLevel} onPick={(n) => level(k, n)} />
          </div>
        ))}
        <Slider label="Reputação" value={draft.rep} min={1} max={100} onChange={(v) => setDraft({ ...draft, rep: v })} />
        <Slider label="Capacidade do estádio" value={draft.capacity} min={1000} max={120000} step={500} fmt={(v) => v.toLocaleString("pt-BR")} onChange={(v) => setDraft({ ...draft, capacity: v })} />
        <Slider label="Ingresso médio" value={draft.ticket} min={5} max={300} fmt={(v) => `R$ ${v}`} onChange={(v) => setDraft({ ...draft, ticket: v })} />
        {dirty && <button className="btn primary block mt8" onClick={() => run((x) => adminClub(x, c.id, draft))}>Aplicar</button>}
        <button className="btn sm block mt8" disabled={!c.fac?.builds.length} onClick={() => run((x) => adminFinishProjects(x, c.id))}>⚡ Concluir obras agora{c.fac?.builds.length ? ` (${c.fac.builds.length})` : ""}</button>
      </div>

      {isUser && (
        <div className="card">
          <h3>🏛️ Diretoria</h3>
          <Slider label="Confiança da diretoria" value={conf} min={0} max={100} fmt={(v) => `${v}%`} onChange={setConf} />
          {conf !== Math.round(w.board.confidence) && <button className="btn primary block" onClick={() => run((x) => adminBoard(x, conf))}>Aplicar confiança</button>}
          <div className="small muted mt8">Objetivo da temporada</div>
          <div className="chip-wrap mt8">
            {objectivesFor(c.div).map((code) => (
              <button key={code} className={`chip${w.board.objectiveCode === code ? " active" : ""}`} onClick={() => run((x) => adminBoard(x, undefined, code))}>{OBJECTIVES[code]}</button>
            ))}
          </div>
        </div>
      )}

      {isUser && w.staff && (
        <div className="card">
          <h3>👔 Comissão técnica</h3>
          {STAFF_ROLES.map((r) => (
            <div key={r} className="adm-row">
              <span className="grow small ellipsis">{STAFF_INFO[r].emoji} {STAFF_INFO[r].label}</span>
              <StarPick value={w.staff?.[r]?.stars ?? 3} onPick={(n) => run((x) => adminStaffStars(x, r, n))} />
            </div>
          ))}
          <button className="btn gold block mt8" onClick={() => run(adminAllStaffFive)}>⭐ Comissão técnica toda 5★</button>
        </div>
      )}

      {!isUser && (
        <div className="card">
          <button className="btn gold block" onClick={() => setTakeOver(true)}>🤝 Assumir este clube</button>
          <div className="tiny muted mt8">Você vira o técnico do {c.name} na hora, sem ser demitido. As notícias continuam.</div>
        </div>
      )}

      {picker && <ClubPicker title="Editar qual clube?" onClose={() => setPicker(false)} onPick={(x) => { setClubId(x.id); setPicker(false); }} />}
      {takeOver && <Confirm title={`Assumir o ${c.name}?`} text="Você deixa o clube atual e começa a treinar este agora mesmo." yes="Assumir"
        onClose={() => setTakeOver(false)} onYes={() => { const r = run((x) => adminTakeOver(x, c.id)); if (r.ok) setClubId(c.id); }} />}
    </>
  );
}

// ---------------------------------------------------------------- 2) Jogadores
function PlayersTab() {
  const w = useWorld();
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<null | "create" | "legend">(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return w.clubs[w.userClubId].players.map((id) => w.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 60);
    const out: Player[] = [];
    for (const p of Object.values(w.players)) {
      if (p.name.toLowerCase().includes(t)) out.push(p);
      if (out.length >= 60) break;
    }
    return out.sort((a, b) => b.ovr - a.ovr);
  }, [w, q]);
  return (
    <>
      <div className="grid2">
        <button className="btn" onClick={() => setSheet("create")}>➕ Criar jogador</button>
        <button className="btn gold" onClick={() => setSheet("legend")}>⭐ Invocar lenda</button>
      </div>
      <input className="text" placeholder="Buscar qualquer jogador do mundo…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="small muted">{q.trim().length < 2 ? "Seu elenco (toque para abrir e usar o 🛠️ Editor completo)" : `${list.length} encontrados`}</div>
      <div className="card flat" style={{ padding: "2px 10px" }}>
        <div className="list">
          {list.map((p) => <PlayerRow key={p.id} p={p} club={p.clubId ? w.clubs[p.clubId] : null} season={w.season} showClub onClick={() => push({ name: "player", id: p.id })} />)}
          {!list.length && <div className="empty">Ninguém com esse nome.</div>}
        </div>
      </div>
      {sheet === "create" && <CreatePlayerSheet onClose={() => setSheet(null)} />}
      {sheet === "legend" && <LegendSheet onClose={() => setSheet(null)} />}
    </>
  );
}

const NATS = Object.keys(COUNTRY_NAME);

function CreatePlayerSheet({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<CreateSpec>({ name: "", pos: "ATA", age: 17, nat: "BRA", ovr: 65, pot: 85, foot: "D", height: 180, dest: "youth" });
  const [destKind, setDestKind] = useState<"youth" | "squad" | "free" | "club">("youth");
  const [club, setClub] = useState<Club | null>(null);
  const [picker, setPicker] = useState(false);
  const set = (patch: Partial<CreateSpec>) => setS((x) => ({ ...x, ...patch, pot: Math.max(patch.pot ?? x.pot, patch.ovr ?? x.ovr) }));
  return (
    <Sheet title="➕ Criar jogador" onClose={onClose}>
      <label className="field">Nome
        <input className="text" maxLength={40} value={s.name} placeholder="Ex.: Kelvinho" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="small muted mt8">Posição</div>
      <div className="chip-wrap mt8">
        {POSITIONS.map((p) => <button key={p} className={`chip${s.pos === p ? " active" : ""}`} onClick={() => set({ pos: p })}>{p}</button>)}
      </div>
      <Slider label="Idade" value={s.age} min={15} max={40} fmt={(v) => `${v} anos`} onChange={(v) => set({ age: v })} />
      <Slider label="Overall" value={s.ovr} min={30} max={99} onChange={(v) => set({ ovr: v })} />
      <Slider label="Potencial" value={s.pot} min={s.ovr} max={99} onChange={(v) => set({ pot: v })} />
      <Slider label="Altura" value={s.height} min={150} max={210} fmt={(v) => `${v} cm`} onChange={(v) => set({ height: v })} />
      <div className="grid2 mt8">
        <label className="field">Nacionalidade
          <select className="text" value={s.nat} onChange={(e) => set({ nat: e.target.value })}>
            {NATS.map((n) => <option key={n} value={n}>{flag(n)} {COUNTRY_NAME[n]}</option>)}
          </select>
        </label>
        <label className="field">Pé
          <select className="text" value={s.foot} onChange={(e) => set({ foot: e.target.value as Player["foot"] })}>
            <option value="D">Direito</option><option value="E">Esquerdo</option><option value="A">Ambos</option>
          </select>
        </label>
      </div>
      <div className="small muted mt12">Destino</div>
      <div className="seg mt8">
        {([["youth", "Minha base"], ["squad", "Meu elenco"], ["free", "Livre"], ["club", "Outro clube"]] as const).map(([k, l]) => (
          <button key={k} className={destKind === k ? "active" : ""} onClick={() => { setDestKind(k); if (k === "club") setPicker(true); }}>{l}</button>
        ))}
      </div>
      {destKind === "club" && <button className="btn sm block mt8" onClick={() => setPicker(true)}>{club ? `Clube: ${club.name} (trocar)` : "Escolher clube"}</button>}
      {destKind === "youth" && s.age > 20 && <div className="tiny muted mt8">Com mais de 20 anos ele vai direto para o elenco profissional.</div>}
      <button className="btn primary block mt12" disabled={!s.name.trim() || (destKind === "club" && !club)} onClick={() => {
        const dest: CreateSpec["dest"] = destKind === "club" ? { club: club!.id } : destKind;
        let pid: number | undefined;
        const r = run((x) => { const res = adminCreatePlayer(x, { ...s, dest }); pid = res.pid; return res; });
        if (r.ok && pid != null) { onClose(); push({ name: "player", id: pid }); }
      }}>Criar {s.name.trim() || "jogador"}</button>
      {picker && <ClubPicker title="Para qual clube?" onClose={() => setPicker(false)} onPick={(c) => { setClub(c); setPicker(false); }} />}
    </Sheet>
  );
}

function LegendSheet({ onClose }: { onClose: () => void }) {
  const w = useWorld();
  const [q, setQ] = useState("");
  const list = LEGENDS.filter((l) => !q.trim() || l.name.toLowerCase().includes(q.trim().toLowerCase()) || l.full.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  return (
    <Sheet title="⭐ Invocar lenda" onClose={onClose}>
      <input className="text" placeholder={`Buscar entre ${LEGENDS.length} lendas…`} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list mt8">
        {list.map((l) => {
          const st = legendStatus(w, l);
          const activeClub = st.k === "active" && st.clubId ? w.clubs[st.clubId] : null;
          const mine = st.k === "active" && st.clubId === w.userClubId;
          return (
            <div key={l.id} className="list-item">
              <div className="grow">
                <b>{l.name}</b> <span className="tiny muted">{flag(l.nat)} {l.pos} · {TIER_NAMES[l.tier]}</span>
                <div className="tiny" style={{ color: st.k === "free" ? "var(--accent)" : st.k === "active" ? "var(--gold)" : undefined }}>
                  {st.k === "free" ? "disponível" : st.k === "active" ? `ativa no ${activeClub?.name ?? "mercado (livre)"}` : "em espera"}
                </div>
              </div>
              {st.k === "active" ? (
                mine ? <button className="btn sm" onClick={() => { onClose(); push({ name: "player", id: st.pid }); }}>Ver</button>
                  : <button className="btn sm gold" onClick={() => run((x) => adminMovePlayer(x, st.pid, x.userClubId, false))}>Trazer para o meu clube</button>
              ) : (
                <button className="btn sm gold" onClick={() => run((x) => adminSpawnLegend(x, l.id))}>Renascer na minha base</button>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 3) Trapaças
const QUALITIES: [IntakeQuality, string][] = [["fraca", "Fraca"], ["normal", "Normal"], ["boa", "Boa"], ["dourada", "Dourada"]];

function CheatsTab() {
  const w = useWorld();
  const cheats = w.admin?.cheats ?? {};
  const [q, setQ] = useState<IntakeQuality>("boa");
  return (
    <>
      <div className="card">
        <h3>Trapaças</h3>
        <div className="tiny muted">Só valem para o seu time.</div>
        {CHEATS.map((c) => (
          <div key={c.key} className="switch">
            <div><b>{c.label}</b><div className="small muted">{c.desc}</div></div>
            <input type="checkbox" checked={!!cheats[c.key]} onChange={(e) => run((x) => adminSetCheat(x, c.key, e.target.checked), true)} />
          </div>
        ))}
        <div className="col gap8" style={{ paddingTop: 10 }}>
          <b>Turbo do time</b>
          <div className="seg">
            {BOOSTS.map((b) => (
              <button key={b} className={(cheats.boost ?? 0) === b ? "active" : ""} onClick={() => run((x) => adminSetCheat(x, "boost", b), true)}>{b ? `+${b * 100}%` : "Desligado"}</button>
            ))}
          </div>
          <div className="tiny muted">Seu time joga um pouco mais forte nas partidas.</div>
        </div>
      </div>

      <div className="card">
        <h3>Na hora</h3>
        <div className="adm-grid">
          <button className="btn" onClick={() => run((x) => adminSquad(x, "heal"))}>🚑 Curar elenco</button>
          <button className="btn" onClick={() => run((x) => adminSquad(x, "cond"))}>🔋 Condição 100%</button>
          <button className="btn" onClick={() => run((x) => adminSquad(x, "morale"))}>😄 Moral máxima</button>
          <button className="btn" onClick={() => run((x) => adminSquad(x, "cards"))}>🟨 Zerar cartões e suspensões</button>
          <button className="btn" onClick={() => run((x) => adminSquad(x, "renew"))}>📝 Renovar todos (+2 anos)</button>
          <button className="btn" onClick={() => run(adminForceGem)} disabled={!!w.forceGem}>💎 {w.forceGem ? "Joia garantida ✔" : "Garantir joia rara na próxima peneira"}</button>
        </div>
        <button className="btn gold block mt8" onClick={() => run(adminLegendWave)}>⭐ Onda de lendas agora</button>
      </div>

      <div className="card">
        <h3>🌱 Nova peneira agora</h3>
        <div className="seg">
          {QUALITIES.map(([k, l]) => <button key={k} className={q === k ? "active" : ""} onClick={() => setQ(k)}>{l}</button>)}
        </div>
        <button className="btn primary block mt8" onClick={() => run((x) => adminIntake(x, q))}>🌱 Chamar garotos ({QUALITIES.find((x) => x[0] === q)![1].toLowerCase()})</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 4) Mundo
function WorldTab() {
  const w = useWorld();
  const [snap, setSnap] = useState<SnapshotMeta | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [comp, setComp] = useState(() => (["serieA", "serieB", "serieC"].find((id) => w.comps[id]?.teams.includes(w.userClubId)) ?? "serieA"));
  useEffect(() => { hasSnapshot(w.saveId).then(setSnap).catch(() => setSnap(null)); }, [w.saveId]);
  const table = w.comps[comp]?.table ?? [];
  return (
    <>
      {snap && (
        <div className="card">
          <h3>⏪ Voltar no tempo</h3>
          <p className="small">Ponto de restauração: {formatDate(snap.season, snap.day)} {snap.season}, antes do jogo contra <b>{snap.opp}</b>.</p>
          <button className="btn gold block mt8" onClick={() => setConfirm(true)}>⏪ Voltar para antes do último jogo</button>
        </div>
      )}
      {!snap && <div className="card small muted">⏪ Com o modo ligado, o jogo guarda um ponto de restauração antes de cada partida sua. Depois do próximo jogo, você poderá voltar no tempo aqui.</div>}

      <div className="card">
        <h3>⚖️ Ajustar pontos</h3>
        <div className="seg">
          {(["serieA", "serieB", "serieC"] as const).filter((id) => w.comps[id]).map((id) => (
            <button key={id} className={comp === id ? "active" : ""} onClick={() => setComp(id)}>{w.comps[id].short}</button>
          ))}
        </div>
        <div className="mt8">
          {table.map((r, i) => (
            <div key={r.club} className="adm-pts" style={r.club === w.userClubId ? { fontWeight: 800 } : undefined}>
              <span style={{ width: 20 }} className="muted">{i + 1}</span>
              <Crest club={w.clubs[r.club]} size={18} />
              <span className="nm">{w.clubs[r.club]?.name}</span>
              <b style={{ width: 26, textAlign: "right" }}>{r.pts}</b>
              {[-3, -1, 1, 3].map((d) => (
                <button key={d} className="btn sm" onClick={() => run((x) => adminPoints(x, comp, r.club, d), true)}>{d > 0 ? `+${d}` : d}</button>
              ))}
            </div>
          ))}
        </div>
      </div>
      {confirm && snap && (
        <Confirm title="Voltar para antes do jogo?" text={`Tudo o que aconteceu depois de ${formatDate(snap.season, snap.day, false)} (jogo contra ${snap.opp}) será desfeito.`} yes="⏪ Voltar"
          onClose={() => setConfirm(false)} onYes={() => { void restoreBeforeMatch(); }} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- 5) Registro
function LogTab() {
  const w = useWorld();
  const undo = lastUndo(w);
  const log = (w.admin?.log ?? []).slice().reverse();
  return (
    <>
      <div className="col gap8">
        <button className="btn block" disabled={!undo} onClick={() => run(adminUndo)}>↩️ Desfazer última edição{undo ? `: ${undo.label}` : ""}</button>
        <button className="btn block" onClick={() => {
          let n = 0;
          update((x) => { n = repairWorld(x); });
          if (n) autosave();
          toast(n ? `${n} problema${n > 1 ? "s" : ""} corrigido${n > 1 ? "s" : ""}` : "Tudo certo ✔");
        }}>🩺 Verificar e reparar save</button>
      </div>
      <div className="card">
        <h3>Registro</h3>
        {!log.length && <div className="small muted">Nenhuma edição ainda.</div>}
        {log.map((e, i) => (
          <div key={i} className="adm-log"><span className="muted">{formatDate(e.season, e.day, false)} {e.season} — </span>{e.text}</div>
        ))}
      </div>
      <button className="btn danger block" onClick={() => { update((x) => adminSetOn(x, false)); autosave(); toast("Modo administrador desligado."); back(); }}>Desligar modo administrador</button>
    </>
  );
}

// ---------------------------------------------------------------- editor completo
type EdTab = "basico" | "atributos" | "jogadas" | "estado" | "contrato";
const ED_TABS: [EdTab, string][] = [["basico", "Básico"], ["atributos", "Atributos"], ["jogadas", "Jogadas"], ["estado", "Estado"], ["contrato", "Contrato"]];
const ATTRS: (keyof Attrs)[] = ["vel", "fin", "pas", "dri", "def", "fis", "gol"];
const HID_LABELS: [keyof typeof H, string][] = [["pro", "Profissionalismo"], ["amb", "Ambição"], ["loy", "Lealdade"], ["temp", "Temperamento"], ["con", "Consistência"], ["big", "Jogos grandes"], ["inj", "Propensão a lesão"]];

/** Ajuste determinístico dos atributos para um overall (a prévia não mexe no gerador do jogo). */
function fitDraft(a: Attrs, pos: Pos, target: number): Attrs {
  const out = { ...a };
  const wts = WEIGHTS[pos];
  for (let i = 0; i < 12; i++) {
    const diff = target - rawOvr(out, pos);
    if (!diff) break;
    const step = Math.sign(diff) * Math.max(1, Math.abs(diff) >> 1);
    for (const k in wts) {
      const key = k as keyof Attrs;
      out[key] = Math.max(1, Math.min(99, out[key] + step));
    }
  }
  return out;
}

/** Editor completo do jogador (substitui o ✏️ quando o admin está ligado). */
export function AdminPlayerEditor({ p, onClose }: { p: Player; onClose: () => void }) {
  const w = useWorld();
  const [tab, setTab] = useState<EdTab>("basico");
  const [d, setD] = useState(() => ({
    name: p.name, nat: p.nat, age: w.season - p.born, height: p.height, foot: p.foot, pos: p.pos, sec: p.sec.slice(),
    attrs: { ...p.attrs }, pot: p.pot, traits: (p.traits ?? []).slice(), hid: (p.hid ?? [10, 10, 10, 10, 10, 10, 8]).slice() as Hidden,
    morale: p.morale, cond: p.cond, fame: p.fame, heal: false, clearCards: false, wage: p.wage, contractEnd: p.contractEnd, clause: p.clause ?? 0,
  }));
  const [sheet, setSheet] = useState<null | "move" | "retire">(null);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const ovr = rawOvr(d.attrs, d.pos);
  const best3 = POSITIONS.map((pos) => ({ pos, v: rawOvr(d.attrs, pos) })).sort((a, b) => b.v - a.v).slice(0, 3);
  const user = w.clubs[w.userClubId];
  const atOther = !!p.clubId && p.clubId !== w.userClubId;
  const value = playerValue(p, w.season);
  const hidLabel = personalityLabel({ ...p, hid: d.hid });
  const banned = Object.values(p.bans).some((b) => b > 0) || Object.values(p.yel).some((b) => b > 0);

  function save() {
    const patch: AdminPlayerPatch = {
      name: d.name, nat: d.nat, age: d.age, height: d.height, foot: d.foot, pos: d.pos, sec: d.sec, attrs: d.attrs,
      pot: Math.max(d.pot, ovr), traits: d.traits as TraitId[], hid: d.hid, morale: d.morale, cond: d.cond, fame: d.fame,
      heal: d.heal || undefined, clearCards: d.clearCards || undefined, wage: d.wage, contractEnd: d.contractEnd, clause: d.clause,
    };
    if (d.age === w.season - p.born) delete patch.age; // não mexe na base sem mudar a idade
    const r = run((x) => adminEditPlayer(x, p.id, patch));
    if (r.ok) onClose();
  }
  const act = (fn: (x: World) => AdminResult) => { const r = run(fn); if (r.ok) onClose(); };

  return (
    <Sheet title={`🛠️ ${p.name}`} onClose={onClose}>
      <div className="seg adm-seg">
        {ED_TABS.map(([k, l]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "basico" && (
        <div className="col gap8 mt8">
          <label className="field">Nome
            <input className="text" maxLength={40} value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <div className="grid2">
            <label className="field">Nacionalidade
              <select className="text" value={d.nat} onChange={(e) => set({ nat: e.target.value })}>
                {(NATS.includes(p.nat) ? NATS : [p.nat, ...NATS]).map((n) => <option key={n} value={n}>{flag(n)} {COUNTRY_NAME[n] ?? n}</option>)}
              </select>
            </label>
            <label className="field">Pé
              <select className="text" value={d.foot} onChange={(e) => set({ foot: e.target.value as Player["foot"] })}>
                <option value="D">Direito</option><option value="E">Esquerdo</option><option value="A">Ambos</option>
              </select>
            </label>
          </div>
          <div className="adm-row">
            <span className="grow small">Idade</span>
            <button className="btn sm" onClick={() => set({ age: Math.max(15, d.age - 1) })}>−</button>
            <b style={{ width: 72, textAlign: "center", whiteSpace: "nowrap" }}>{d.age} anos</b>
            <button className="btn sm" onClick={() => set({ age: Math.min(45, d.age + 1) })}>+</button>
          </div>
          <Slider label="Altura" value={d.height} min={150} max={210} fmt={(v) => `${v} cm`} onChange={(v) => set({ height: v })} />
          <div className="small muted">Posição principal</div>
          <div className="chip-wrap">
            {POSITIONS.map((x) => <button key={x} className={`chip${d.pos === x ? " active" : ""}`} onClick={() => set({ pos: x, sec: d.sec.filter((s) => s !== x) })}>{x}</button>)}
          </div>
          <div className="small muted">Posições secundárias (até 3)</div>
          <div className="chip-wrap">
            {POSITIONS.filter((x) => x !== d.pos).map((x) => {
              const on = d.sec.includes(x);
              return <button key={x} className={`chip${on ? " active" : ""}`} disabled={!on && d.sec.length >= 3} onClick={() => set({ sec: on ? d.sec.filter((s) => s !== x) : [...d.sec, x] })}>{x}</button>;
            })}
          </div>
          {d.age > 20 && p.youth && !p.legend && <div className="tiny muted">Com mais de 20 anos ele sobe para o profissional.</div>}
        </div>
      )}

      {tab === "atributos" && (
        <div className="mt8">
          <div className="adm-banner">Overall na posição ({d.pos}): <b>{ovr}</b> · Melhores: {best3.map((b) => `${b.pos} ${b.v}`).join(" · ")}</div>
          {ATTRS.map((k) => (
            <Slider key={k} label={ATTR_NAMES[k]} value={d.attrs[k]} min={1} max={99} onChange={(v) => set({ attrs: { ...d.attrs, [k]: v } })} />
          ))}
          <Slider label="Ajustar overall para…" value={ovr} min={30} max={99} onChange={(v) => set({ attrs: fitDraft(d.attrs, d.pos, v) })} />
          <Slider label="Potencial" value={Math.max(d.pot, ovr)} min={ovr} max={99} onChange={(v) => set({ pot: v })} />
        </div>
      )}

      {tab === "jogadas" && (
        <div className="mt8">
          <div className="small muted">Jogadas preferidas (até 5)</div>
          <div className="chip-wrap mt8">
            {TRAIT_IDS.map((t) => {
              const on = d.traits.includes(t);
              return (
                <button key={t} className={`chip${on ? " active" : ""}`} disabled={!on && d.traits.length >= 5} title={TRAITS[t].desc}
                  onClick={() => set({ traits: on ? d.traits.filter((x) => x !== t) : [...d.traits, t] })}>{TRAITS[t].emoji} {TRAITS[t].label}</button>
              );
            })}
          </div>
          <div className="adm-banner mt12">Personalidade: <b>{hidLabel}</b></div>
          {HID_LABELS.map(([k, l]) => (
            <Slider key={k} label={l} value={d.hid[H[k]]} min={1} max={20} onChange={(v) => { const h = d.hid.slice() as Hidden; h[H[k]] = v; set({ hid: h }); }} />
          ))}
        </div>
      )}

      {tab === "estado" && (
        <div className="mt8">
          <Slider label="Moral" value={d.morale} min={0} max={100} onChange={(v) => set({ morale: v })} />
          <Slider label="Condição física" value={d.cond} min={0} max={100} fmt={(v) => `${v}%`} onChange={(v) => set({ cond: v })} />
          <Slider label="Fama" value={d.fame} min={0} max={100} onChange={(v) => set({ fame: v })} />
          <div className="grid2 mt8">
            <button className={`btn${d.heal ? " primary" : ""}`} disabled={!p.injury} onClick={() => set({ heal: !d.heal })}>🚑 {p.injury ? (d.heal ? "Vai curar ✔" : `Curar lesão (${p.injury}d)`) : "Sem lesão"}</button>
            <button className={`btn${d.clearCards ? " primary" : ""}`} disabled={!banned} onClick={() => set({ clearCards: !d.clearCards })}>🟨 {banned ? (d.clearCards ? "Vai zerar ✔" : "Zerar cartões") : "Sem cartões"}</button>
          </div>
        </div>
      )}

      {tab === "contrato" && (
        <div className="mt8">
          <div className="adm-row">
            <span className="grow small">Salário</span>
            <button className="btn sm" onClick={() => set({ wage: Math.round(d.wage * 0.9) })}>−10%</button>
            <b style={{ minWidth: 76, textAlign: "center" }} className="small">{money(d.wage)}/mês</b>
            <button className="btn sm" onClick={() => set({ wage: Math.max(1000, Math.round(d.wage * 1.1)) })}>+10%</button>
          </div>
          <div className="small muted mt8">Contrato até</div>
          <div className="chip-wrap mt8">
            {Array.from({ length: 7 }, (_, i) => w.season + i).map((y) => <button key={y} className={`chip${d.contractEnd === y ? " active" : ""}`} onClick={() => set({ contractEnd: y })}>{y}</button>)}
          </div>
          <div className="small muted mt8">Multa rescisória</div>
          <div className="chip-wrap mt8">
            {[0, 1.5, 3, 6].map((m) => {
              const v = Math.round(value * m);
              return <button key={m} className={`chip${Math.abs(d.clause - v) < 1 || (!m && !d.clause) ? " active" : ""}`} onClick={() => set({ clause: v })}>{m ? `${String(m).replace(".", ",")}× (${money(v)})` : "Sem multa"}</button>;
            })}
          </div>
          <div className="divider" />
          <div className="col gap8 mt8">
            {atOther && (
              <div className="grid2">
                <button className="btn gold" onClick={() => act((x) => adminMovePlayer(x, p.id, x.userClubId, false))}>⚡ Contratar de graça</button>
                <button className="btn" onClick={() => act((x) => adminMovePlayer(x, p.id, x.userClubId, true))}>⚡ Pagando {money(value)}</button>
              </div>
            )}
            {!p.clubId && <button className="btn gold" onClick={() => act((x) => adminMovePlayer(x, p.id, x.userClubId, false))}>⚡ Contratar agora para o {user.name}</button>}
            <button className="btn" onClick={() => setSheet("move")}>🔁 Transferir para… (grátis, na hora)</button>
            {p.clubId && (p.youth
              ? <button className="btn" onClick={() => act((x) => adminSetYouth(x, p.id, false))}>⬆️ Subir ao profissional</button>
              : <button className="btn" onClick={() => act((x) => adminSetYouth(x, p.id, true))}>🌱 Mandar para a base</button>)}
            {p.clubId && <button className="btn" onClick={() => act((x) => adminMovePlayer(x, p.id, null))}>🆓 Liberar (fica livre)</button>}
            <button className="btn danger" onClick={() => setSheet("retire")}>👴 Aposentar agora</button>
          </div>
        </div>
      )}

      <div className="sheet-foot">
        <button className="btn primary block" onClick={save}>Salvar</button>
      </div>
      {sheet === "move" && <ClubPicker title={`Transferir ${p.name} para…`} exclude={p.clubId} onClose={() => setSheet(null)} onPick={(c) => { setSheet(null); act((x) => adminMovePlayer(x, p.id, c.id, false)); }} />}
      {sheet === "retire" && <Confirm title={`Aposentar ${p.name}?`} text="Ele pendura as chuteiras na hora e sai do jogo. Não dá para desfazer." yes="Aposentar" danger
        onClose={() => setSheet(null)} onYes={() => { const r = run((x) => adminRetire(x, p.id)); if (r.ok) { onClose(); back(); } }} />}
    </Sheet>
  );
}
