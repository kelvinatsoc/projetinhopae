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
import { Avatar, PlayerRow, PosBadge, Stars } from "../components";
import "../manage.css";

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

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
    <div className="page">
      <div className="card">
        <h3>🌱 Categorias de base</h3>
        <div className="mt8">
          <Rating icon="🔍" name="Captação" n={rec} text="mais garotos e mais joias" />
          <Rating icon="🏫" name="Instalações" n={fac} text={`garotos chegam mais prontos · até ${cap} na base`} />
          <Rating icon="🎓" name="Treinadores" n={coach} text="garotos evoluem mais rápido e safras melhores" />
        </div>
        <button className="btn sm ghost mt8" style={{ minHeight: 40 }} onClick={() => push({ name: "board" })}>Melhorar na Diretoria ›</button>
      </div>

      {pending > 0 ? (
        <div className="card tap" onClick={() => push({ name: "peneira" })} style={{ borderColor: "var(--gold)", background: "linear-gradient(135deg, #3b2e05, #172a21)" }}>
          <b>🌱 Dia da peneira!</b>
          <div className="small mt8">{pending} garoto{pending === 1 ? "" : "s"} esperando sua avaliação.</div>
          <button className="btn gold block mt8" style={{ minHeight: 44 }}>🌱 Avaliar a peneira</button>
        </div>
      ) : (
        <div className="card flat small">
          {preview ? (
            <>Próxima safra: <span style={{ color: "var(--gold)" }}>{stars(Q_STARS[preview.shown])}</span> <b>{Q_LABEL[preview.shown]}</b> <span className="muted">(relatório de 1/nov)</span>
              {(preview.shown === "boa" || preview.shown === "dourada") && <div className="muted mt8">Destaque esperado: um {POS_NAME[preview.pos].toLowerCase()}.</div>}
            </>
          ) : (
            <>🔎 Os olheiros da base ainda estão avaliando… O relatório da próxima safra sai em 1º de novembro; os garotos chegam no fim de janeiro.</>
          )}
        </div>
      )}

      <div className="row small muted" style={{ justifyContent: "space-between", padding: "0 4px" }}>
        <span>Vagas na base: <b>{youthCount(w, club)}</b> de {cap}</span>
        <span>Lendas podem renascer aqui! ⭐</span>
      </div>
      <div className="card flat" style={{ padding: "2px 10px" }}>
        <div className="list">
          {youth.map(({ p, s }) => {
            const ready = p.ovr >= level - 6;
            const loan = !ready && age(p, w.season) >= 18 && p.ovr < level - 10;
            return (
              <div key={p.id}>
                <PlayerRow p={p} club={club} season={w.season} onClick={() => push({ name: "player", id: p.id })}
                  right={<span className="tiny" style={{ color: "var(--gold)", whiteSpace: "nowrap" }}>{stars(s)}</span>} />
                {(ready || loan) && (
                  <div style={{ margin: "-4px 0 6px 56px" }}>
                    {ready && <span className="tag good">✅ Pronto para o profissional</span>}
                    {loan && <span className="tag">📤 Empréstimo recomendado</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!youth.length && <div className="empty">Nenhum jogador nas categorias de base.</div>}
      </div>
      <div className="tiny muted center">Estrelas = potencial em relação ao seu time. Promova quem estiver pronto no perfil do jogador.</div>
      <div style={{ height: 40 }} />
    </div>
  );
}

function Rating({ icon, name, n, text }: { icon: string; name: string; n: number; text: string }) {
  return (
    <div className="rating-row">
      <span style={{ fontSize: 18, width: 24 }}>{icon}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small"><b>{name}</b> <span style={{ color: "var(--gold)" }}>{stars(n)}</span></div>
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
          <b>🌱 Nenhuma peneira pendente</b>
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
        <button className="btn" style={{ minHeight: 44 }} onClick={() => setFlipped(new Set(pn.kids.map((k) => k.id)))}>🔄 Virar todas</button>
        <button className="btn primary" style={{ minHeight: 44 }} disabled={!free} onClick={() => act(best.slice(0, free), [])}>✍️ Assinar todos os que cabem</button>
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
          <div style={{ fontSize: 40 }}>🌱</div>
          <b className="small">Toque para virar</b>
        </div>
        <div className={`pn-face pn-front${gem ? " gem" : ""}`}>
          {gem && <span className="tag legend">💎 Joia rara</span>}
          <Avatar p={k} club={club} season={w.season} size={gem ? 48 : 56} />
          <b className="small ellipsis" style={{ maxWidth: "100%" }}>{k.name}</b>
          <div className="row gap4 tiny muted" style={{ justifyContent: "center" }}>
            <PosBadge pos={k.pos} /> {age(k, w.season)}a · pé {k.foot === "E" ? "esq." : k.foot === "A" ? "ambos" : "dir."} · <b style={{ color: "var(--text)" }}>{k.ovr}</b>
          </div>
          <div className="tiny">Potencial <Stars n={starsFor(k.pot, level)} /></div>
          <div className="tiny" style={{ minHeight: 16 }}>{traits.map((t) => `${TRAITS[t].emoji} ${TRAITS[t].label}`).join(" · ")}</div>
          <div className="tiny muted">🧠 {personalityLabel(k)}{k.traits?.includes("PAV") ? " 🌋" : ""}</div>
        </div>
      </div>
      {open && (
        <div className="pn-actions">
          <button className="btn primary" disabled={!canSign} onClick={onSign}>✍️ Assinar</button>
          <button className="btn" onClick={onRelease}>👋 Dispensar</button>
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
        <span style={{ fontSize: 28 }}>🌱</span>
        <div className="grow">
          <b>Dia da peneira!</b>
          <div className="small">{n} garoto{n === 1 ? "" : "s"} esperando sua avaliação</div>
        </div>
        <span className="small muted">avaliar ›</span>
      </div>
    </div>
  );
}
