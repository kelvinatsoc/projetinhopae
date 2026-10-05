// Comissão técnica (Trilha C): 5 cargos com estrelas e um botão "Trocar".
import { useEffect, useState } from "react";
import { formatMoney } from "../../engine/finance";
import { ensureStaff, hireStaff, staffAccepts, staffCandidates, staffSeverance, STAFF_INFO, STAFF_ROLES } from "../../engine/staff";
import type { Club, StaffMember, StaffRole, World } from "../../engine/types";
import { toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Sheet, Stars, textOn } from "../components";
import { flag } from "../flags";
import "../club.css";

/** Frase curta com o efeito das estrelas de cada cargo (3★ = normal). */
export function staffEffect(role: StaffRole, s: number): string {
  switch (role) {
    case "tre": {
      const v = 4 * s - 12;
      return v === 0 ? "Jogadores evoluem no ritmo normal" : `Jogadores evoluem ${Math.abs(v)}% mais ${v > 0 ? "rápido" : "devagar"}`;
    }
    case "fis": {
      const v = 5 * s - 15;
      const rec = (0.3 * (s - 3)).toFixed(1).replace(".", ",");
      return v === 0 ? "Lesões e recuperação no ritmo normal" : `Lesões duram ${Math.abs(v)}% ${v > 0 ? "menos" : "mais"} · recuperação ${s > 3 ? "+" : ""}${rec}/dia`;
    }
    case "olh": {
      const m = 1 + Math.floor(s / 2);
      return `Observa ${2 + Math.floor(s / 2)} jogadores por vez · ${m} ${m > 1 ? "missões" : "missão"}`;
    }
    case "bas":
      return `${s >= 4 ? "Relatório da base confiável" : s === 3 ? "Relatório da base quase sempre certo" : "Relatório da base pouco confiável"}${s > 3 ? " · garotos mais profissionais" : s < 3 ? " · garotos menos profissionais" : ""}`;
    case "aux":
      return `Acerta ${50 + 10 * s}% das sugestões de preleção`;
  }
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

function StaffAvatar({ s, club }: { s: StaffMember; club: Club }) {
  return <div className="staff-av" style={{ background: club.colors[0], color: textOn(club.colors[0]) }}>{initials(s.name)}</div>;
}

export function StaffScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const [open, setOpen] = useState<StaffRole | null>(null);
  useEffect(() => { if (!w.staff || STAFF_ROLES.some((r) => !w.staff?.[r])) update((x) => { ensureStaff(x); }); }, [w.staff]);
  if (!w.staff) return <div className="page"><div className="empty">Montando a comissão…</div></div>;
  const total = STAFF_ROLES.reduce((s, r) => s + (w.staff?.[r]?.wage ?? 0), 0);
  return (
    <div className="page">
      <div className="card small">
        👔 Sua comissão técnica trabalha nos bastidores: mais estrelas, mais efeito. Toque num cargo para trocar o profissional.
        <div className="mt8">Folha da comissão: <b>{formatMoney(total)}/mês</b></div>
      </div>
      {STAFF_ROLES.map((r) => {
        const s = w.staff?.[r];
        if (!s) return null;
        return (
          <div key={r} className="card tap" onClick={() => setOpen(r)}>
            <div className="row">
              <StaffAvatar s={s} club={club} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small muted">{STAFF_INFO[r].emoji} {STAFF_INFO[r].label}</div>
                <b className="ellipsis" style={{ display: "block" }}>{s.name}</b>
                <div className="small muted">{flag(s.nat)} {w.season - s.born} anos · <Stars n={s.stars} /></div>
              </div>
              <span className="muted">›</span>
            </div>
            <div className="small mt8">{formatMoney(s.wage)}/mês · contrato até {s.until}</div>
            <div className="staff-effect">{staffEffect(r, s.stars)}</div>
          </div>
        );
      })}
      <div className="tiny muted center">Contratos renovam sozinhos (+10%) no fim do ano.</div>
      {open && <StaffSheet w={w} role={open} onClose={() => setOpen(null)} />}
      <div style={{ height: 30 }} />
    </div>
  );
}

function StaffSheet({ w, role, onClose }: { w: World; role: StaffRole; onClose: () => void }) {
  const club = w.clubs[w.userClubId];
  const cur = w.staff?.[role];
  const [list, setList] = useState<StaffMember[] | null>(null);
  const [pick, setPick] = useState<StaffMember | null>(null);
  if (!cur) return null;

  function search() {
    let l: StaffMember[] = [];
    update((x) => { l = staffCandidates(x, role); });
    setList(l);
  }

  return (
    <Sheet title={`${STAFF_INFO[role].emoji} ${STAFF_INFO[role].label}`} onClose={onClose}>
      <div className="row">
        <StaffAvatar s={cur} club={club} />
        <div className="grow">
          <b>{cur.name}</b>
          <div className="small muted">{flag(cur.nat)} {w.season - cur.born} anos · <Stars n={cur.stars} /></div>
          <div className="staff-effect">{staffEffect(role, cur.stars)}</div>
        </div>
      </div>
      {!list && <button className="btn primary block mt12" onClick={search}>🔄 Procurar substituto</button>}
      {list && (
        <>
          <h3 className="mt12">Candidatos</h3>
          <div className="tiny muted">A lista muda a cada janela de transferências.</div>
          <div className="list mt8">
            {list.map((c) => {
              const ok = staffAccepts(w, c);
              return (
                <div key={c.id} className="list-item">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="ellipsis" style={{ display: "block" }}>{flag(c.nat)} {c.name}</b>
                    <div className="small"><Stars n={c.stars} /> · {formatMoney(c.wage)}/mês · <span style={{ color: ok ? "var(--accent)" : "var(--danger)" }}>{ok ? "aceita vir" : "não quer vir (clube pequeno demais)"}</span></div>
                    <div className="tiny muted">{staffEffect(role, c.stars)}</div>
                  </div>
                  <button className="btn sm primary" disabled={!ok} onClick={() => setPick(c)}>Contratar</button>
                </div>
              );
            })}
            {!list.length && <div className="empty">Ninguém disponível nesta janela.</div>}
          </div>
        </>
      )}
      {pick && (
        <Sheet title={`Contratar ${pick.name}?`} onClose={() => setPick(null)}>
          <p className="small">O atual sai e recebe 3 salários de rescisão ({formatMoney(staffSeverance(w, role))}).</p>
          <p className="small mt8">Novo salário: <b>{formatMoney(pick.wage)}/mês</b> · contrato até {w.season + 2}.</p>
          <div className="grid2 mt12">
            <button className="btn" onClick={() => setPick(null)}>Cancelar</button>
            <button className="btn primary" onClick={() => {
              let r = { ok: false, msg: "" };
              update((x) => { r = hireStaff(x, pick); });
              toast(r.msg);
              if (r.ok) { autosave(); setPick(null); onClose(); }
            }}>Contratar</button>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}
