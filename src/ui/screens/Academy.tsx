// Base FM26: as 3 notas da base, relatório da próxima safra, lista com potencial em estrelas e o Dia da Peneira.
import { useState } from "react";
import { withWorldRng } from "../../engine/common";
import { squadOf } from "../../engine/lineup";
import { personalityLabel } from "../../engine/personality";
import { age } from "../../engine/player";
import { POS_NAME } from "../../engine/positions";
import { potStars, starsFor } from "../../engine/scouting";
import { TRAITS } from "../../engine/traits";
import type { Player } from "../../engine/types";
import { isGem, Q_LABEL, Q_STARS, resolvePeneira, youthCap, youthCoach, youthCount, youthFac, youthRec } from "../../engine/youth";
import { back, push, toast, update, useWorld } from "../../store";
import { autosave } from "../actions";
import { Avatar, Icon, PlayerRow, PosBadge, Stars } from "../components";
import type React from "react";
import "../manage.css";

// Stars imported from components

/** Nova tela da base (rota "youth" e aba Base do Elenco). */
export function AcademyScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const rec = youthRec(club), fac = youthFac(club), coach = youthCoach(club);
  const cap = youthCap(club);
  const top = squadOf(w, club).map((p) => p.ovr).sort((a, b) => b - a).slice(0, 16);
  const level = top.length ? top.reduce((s, x) => s + x, 0) / top.length : club.level;
  const youth = club.players.map((id) => w.players[id]).filter((p) => p?.youth)
    .map((p) => ({ p, s: potStars(w, p, club) }))
    .sort((a, b) => b.s - a.s || b.p.pot - a.p.pot);
  const prev = w.intakePreview;
  const preview = prev && (prev.season === w.season + 1 || (prev.season === w.season && w.day < 25)) ? prev : null;
  const pending = w.peneira?.kids.length ?? 0;

  return (
    <div className="page k-academy-page">
      <div className="k-academy-grid">
        <aside className="k-academy-aside">
          <div className="card">
            <h3 className="row gap8"><Icon name="sprout" size={18} /> Categorias de Base</h3>
            <div className="mt6">
              <Rating icon={<Icon name="search" size={18} />} name="Captação" n={rec} text="mais garotos e joias" />
              <Rating icon={<Icon name="crane" size={18} />} name="Instalações" n={fac} text={`até ${cap} na base`} />
              <Rating icon={<Icon name="briefcase" size={18} />} name="Treinadores" n={coach} text="evolução acelerada" />
            </div>
            <button className="btn sm ghost mt8 block" onClick={() => push({ name: "facilities" })}>Obras em Estrutura ›</button>
          </div>

          {pending > 0 ? (
            <div className="card tap" onClick={() => push({ name: "peneira" })} style={{ borderColor: "var(--gold)", background: "linear-gradient(135deg, #3b2e05, #172a21)" }}>
              <b className="row gap6"><Icon name="sprout" size={16} /> Dia da Peneira!</b>
              <div className="tiny mt4">{pending} garoto{pending === 1 ? "" : "s"} aguardando teste.</div>
              <button className="btn gold sm block mt6 row center gap6"><Icon name="sprout" size={14} /> Avaliar Peneira</button>
            </div>
          ) : (
            <div className="card flat small">
              {preview ? (
                <>
                  <span className="row center gap4">Próxima safra: <Stars count={Q_STARS[preview.shown]} size={11} /> <b>{Q_LABEL[preview.shown]}</b></span>
                  {(preview.shown === "boa" || preview.shown === "dourada") && <div className="muted mt4 tiny">Destaque: um {POS_NAME[preview.pos].toLowerCase()}.</div>}
                </>
              ) : (
                <div className="tiny muted row center gap4"><Icon name="binoculars" size={13} /> Olheiros avaliando a safra. Relatório em 1/nov; chegada em janeiro.</div>
              )}
            </div>
          )}

          <div className="card small">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Ocupação:</span><b>{youthCount(w, club)} de {cap} vagas</b>
            </div>
            <div className="tiny muted mt4">Lendas do futebol mundial podem renascer aqui!</div>
          </div>
        </aside>

        <main className="k-academy-main">
          <div className="card flat">
            <div className="card-title">
              <h3>Promessas & Joias Sub-20 ({youth.length})</h3>
              <span className="tiny muted">Estrelas = potencial relativo</span>
            </div>
            <div className="list mt6">
              {youth.map(({ p, s }) => {
                const ready = p.ovr >= level - 6;
                const loan = !ready && age(p, w.season) >= 18 && p.ovr < level - 10;
                return (
                  <div key={p.id}>
                    <PlayerRow p={p} club={club} season={w.season} onClick={() => push({ name: "player", id: p.id })}
                      right={<Stars count={s} size={11} />} />
                    {(ready || loan) && (
                      <div style={{ margin: "-4px 0 6px 56px" }}>
                        {ready && <span className="tag good row gap4"><Icon name="check" size={12} /> Pronto para o profissional</span>}
                        {loan && <span className="tag row gap4"><Icon name="swap" size={12} /> Empréstimo recomendado</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {!youth.length && <div className="empty">Nenhum jogador nas categorias de base.</div>}
          </div>
        </main>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

function Rating({ icon, name, n, text }: { icon: React.ReactNode; name: string; n: number; text: string }) {
  return (
    <div className="rating-row">
      <span style={{ width: 24, display: "inline-flex", alignItems: "center" }}>{icon}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small row center gap4"><b>{name}</b> <Stars count={n} size={11} /></div>
        <div className="tiny muted">{text}</div>
      </div>
    </div>
  );
}

export function PeneiraScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const pn = w.peneira;
  if (!pn || !pn.kids.length) {
    return (
      <div className="page">
        <div className="card center">
          <b className="row center gap6"><Icon name="sprout" size={18} /> Nenhuma peneira pendente</b>
          <div className="small muted mt8">Os novos garotos chegam todo fim de janeiro, depois da Copinha.</div>
          <button className="btn block mt12" style={{ minHeight: 44 }} onClick={() => back()}>Voltar</button>
        </div>
      </div>
    );
  }
  const cap = youthCap(club);
  const count = youthCount(w, club);
  const free = Math.max(0, cap - count);
  const flip = (id: number) => setFlipped((s) => new Set(s).add(id));
  const act = (sign: number[], release: number[]) => {
    const before = w.peneira?.kids.length ?? 0;
    update(() => withWorldRng(w, () => resolvePeneira(w, sign, release)));
    autosave();
    const after = w.peneira?.kids.length ?? 0;
    if (sign.length && before - after < sign.length + release.length) toast("Base cheia: promova ou dispense alguém para abrir vaga.");
    if (!w.peneira) { toast("Peneira encerrada!"); back(); }
  };
  const best = pn.kids.slice().sort((a, b) => b.pot - a.pot).map((k) => k.id);

  return (
    <div className="page">
      <div className="card flat small row" style={{ justifyContent: "space-between" }}>
        <span>Vagas na base: <b>{count}</b> de {cap}</span>
        <span className="muted">{pn.kids.length} garoto{pn.kids.length === 1 ? "" : "s"}</span>
      </div>
      <div className="small muted" style={{ padding: "0 4px" }}>Toque nas cartas para conhecer os garotos. Quem você não assinar em 30 dias é avaliado pelo coordenador.</div>
      <div className="pn-grid">
        {pn.kids.map((k) => (
          <KidCard key={k.id} k={k} level={club.level} open={flipped.has(k.id)} onFlip={() => flip(k.id)}
            onSign={() => act([k.id], [])} onRelease={() => act([], [k.id])} canSign={free > 0} />
        ))}
      </div>
      <div className="grid2">
        <button className="btn row center gap6" style={{ minHeight: 44 }} onClick={() => setFlipped(new Set(pn.kids.map((k) => k.id)))}><Icon name="refresh" size={16} /> Virar todas</button>
        <button className="btn primary row center gap6" style={{ minHeight: 44 }} disabled={!free} onClick={() => act(best.slice(0, free), [])}><Icon name="edit" size={16} /> Assinar todos os que cabem</button>
      </div>
      {!free && <div className="small muted center">Base cheia: promova ou dispense alguém da base para abrir vaga.</div>}
      <div style={{ height: 40 }} />
    </div>
  );
}

function KidCard({ k, level, open, onFlip, onSign, onRelease, canSign }: {
  k: Player; level: number; open: boolean; onFlip: () => void; onSign: () => void; onRelease: () => void; canSign: boolean;
}) {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const gem = isGem(k);
  const traits = (k.traits ?? []).filter((t) => !TRAITS[t].bad);
  return (
    <div className="pn-card">
      <div className={`pn-inner${open ? " flipped" : ""}`}>
        <div className="pn-face pn-back" onClick={onFlip}>
          <div style={{ fontSize: 40, display: "flex", justifyContent: "center" }}><Icon name="sprout" size={40} /></div>
          <b className="small">Toque para virar</b>
        </div>
        <div className={`pn-face pn-front${gem ? " gem" : ""}`}>
          {gem && <span className="tag legend row gap4"><Icon name="sparkle" size={12} /> Joia rara</span>}
          <Avatar p={k} club={club} season={w.season} size={gem ? 48 : 56} />
          <b className="small ellipsis" style={{ maxWidth: "100%" }}>{k.name}</b>
          <div className="row gap4 tiny muted" style={{ justifyContent: "center" }}>
            <PosBadge pos={k.pos} /> {age(k, w.season)}a · pé {k.foot === "E" ? "esq." : k.foot === "A" ? "ambos" : "dir."} · <b style={{ color: "var(--text)" }}>{k.ovr}</b>
          </div>
          <div className="tiny">Potencial <Stars n={starsFor(k.pot, level)} /></div>
          <div className="tiny" style={{ minHeight: 16 }}>{traits.map((t) => `${TRAITS[t].label}`).join(" · ")}</div>
          <div className="tiny muted">{personalityLabel(k)}</div>
        </div>
      </div>
      {open && (
        <div className="pn-actions">
          <button className="btn primary row center gap4" disabled={!canSign} onClick={onSign}><Icon name="edit" size={14} /> Assinar</button>
          <button className="btn row center gap4" onClick={onRelease}><Icon name="close" size={14} /> Dispensar</button>
        </div>
      )}
    </div>
  );
}

/** Cartão no Início quando há uma peneira pendente. */
export function PeneiraHomeCard() {
  const w = useWorld();
  const n = w.peneira?.kids.length ?? 0;
  if (!n) return null;
  return (
    <div className="card tap" onClick={() => push({ name: "peneira" })} style={{ borderColor: "var(--gold)", background: "linear-gradient(135deg, #3b2e05, #172a21)" }}>
      <div className="row gap8">
        <span style={{ width: 28, display: "inline-flex", alignItems: "center" }}><Icon name="sprout" size={24} /></span>
        <div className="grow">
          <b>Dia da peneira!</b>
          <div className="small">{n} garoto{n === 1 ? "" : "s"} esperando sua avaliação</div>
        </div>
        <span className="small muted">avaliar ›</span>
      </div>
    </div>
  );
}
