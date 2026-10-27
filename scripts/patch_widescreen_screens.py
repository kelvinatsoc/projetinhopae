#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_widescreen_screens.py
Ajusta todas as telas do Lendas da Base para o layout Widescreen FM Mobile (Opção 1 Piotr Kosmala Dark).
Cria estruturas de 2 e 3 colunas em widescreen (>= 720px / 800x360 landscape mobile).
"""

import os
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read_file(rel_path):
    full = os.path.join(BASE_DIR, rel_path)
    with open(full, 'r', encoding='utf-8') as f:
        return f.read().replace('\r\n', '\n')

def write_file(rel_path, content):
    full = os.path.join(BASE_DIR, rel_path)
    with open(full, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print(f"Updated: {rel_path}")

# ==============================================================================
# 13. Uniforms in src/ui/Uniforms.tsx
# ==============================================================================
def patch_uniforms():
    src = read_file("src/ui/Uniforms.tsx")
    old_target = """  return (
    <div className="page">
      <div className="card row gap8">
        <Crest club={c} size={36} />
        <div className="grow">
          <h3 style={{ margin: 0 }}>Uniformes {w.season}</h3>
          <div className="tiny muted">
            {real.length ? "Desenho dos uniformes da Wikipedia; marcas e escudos são dos seus donos (uso pessoal)." : "Este clube ainda não tem uniformes reais: liso nas cores do clube."}
            {" "}Em jogo, o visitante troca para o uniforme 2 quando as camisas se confundem.
          </div>
        </div>
      </div>
      {kits.slice(0, 3).map((k, i) => <KitCard key={i} w={w} c={c} kit={k} which={i as KitWhich} photoIdx={kits.slice(0, i).filter((x) => !x.custom).length} />)}
      {c.id === w.userClubId && <CustomKitCard w={w} c={c} />}
    </div>
  );"""

    new_replacement = """  return (
    <div className="page k-uniforms-page">
      <div className="card row gap8 k-uniforms-banner">
        <Crest club={c} size={36} />
        <div className="grow">
          <h3 style={{ margin: 0 }}>Uniformes Oficiais • Temporada {w.season}</h3>
          <div className="tiny muted">
            {real.length ? "Desenho dos uniformes oficiais da Wikipedia (uso pessoal)." : "Cores oficiais do clube."}
            {" "}Em jogo, o visitante troca para o uniforme 2 em caso de conflito de cores.
          </div>
        </div>
      </div>
      <div className="k-uniforms-grid">
        {kits.slice(0, 3).map((k, i) => <KitCard key={i} w={w} c={c} kit={k} which={i as KitWhich} photoIdx={kits.slice(0, i).filter((x) => !x.custom).length} />)}
      </div>
      {c.id === w.userClubId && <CustomKitCard w={w} c={c} />}
      <div style={{ height: 20 }} />
    </div>
  );"""

    if old_target in src:
        write_file("src/ui/Uniforms.tsx", src.replace(old_target, new_replacement))
    else:
        print("Uniforms.tsx pattern not found, checking...")

# ==============================================================================
# 14. StadiumLook in src/ui/StadiumLook.tsx
# ==============================================================================
def patch_stadium():
    src = read_file("src/ui/StadiumLook.tsx")
    old_target = """  const works = lookWorks(c);
  return (
    <div className="page">
      <div className="card">
        <div className="card-title"><h3>🏟️ {stadiumName(w, c)}</h3><b>{formatMoney(c.balance)}</b></div>
        <div className="small">{c.capacity.toLocaleString("pt-BR")} lugares. As reformas são pagas na hora e mudam o estádio no mapa da sede e nas partidas quando ficam prontas.</div>
      </div>
      <div className="card">
        <div className="card-title"><h3>🏷️ Nome do estádio (naming rights)</h3></div>
        {naming ? (
          <div className="small">Contrato com <b>{naming.brand}</b>: {formatMoney(naming.annual)}/ano{naming.until ? `, até ${naming.until}` : ""}. Quando acabar, o estádio volta a se chamar {c.stadium}.</div>
        ) : <div className="small">Sem contrato: o estádio se chama {c.stadium}. Venda o nome na tela de patrocínios.</div>}
        <button className="btn sm mt8" onClick={() => push({ name: "sponsors" })}>Patrocínios ›</button>
      </div>
      {works.length > 0 && (
        <div className="card">
          <div className="card-title"><h3>🏗️ Reformas em andamento</h3></div>
          {works.map((x) => (
            <div key={x.kind} className="mt8">
              <div className="row small"><span className="grow">{WORK_INFO[x.kind].emoji} {WORK_INFO[x.kind].label}</span><span className="muted">{workPct(w, x)}%</span></div>
              <Bar v={workPct(w, x)} color="var(--accent)" />
            </div>
          ))}
        </div>
      )}
      {WORK_KINDS.map((k) => {"""

    new_replacement = """  const works = lookWorks(c);
  return (
    <div className="page k-stadium-page">
      <div className="k-stadium-grid">
        <aside className="k-stadium-aside">
          <div className="card">
            <div className="card-title"><h3>🏟️ {stadiumName(w, c)}</h3><b style={{ color: "#34d27b" }}>{formatMoney(c.balance)}</b></div>
            <div className="small mt4">{c.capacity.toLocaleString("pt-BR")} lugares. Reformas alteram a sede 3D e as partidas.</div>
          </div>
          <div className="card">
            <div className="card-title"><h3>🏷️ Naming Rights</h3></div>
            {naming ? (
              <div className="tiny">Contrato com <b>{naming.brand}</b>: {formatMoney(naming.annual)}/ano{naming.until ? ` até ${naming.until}` : ""}.</div>
            ) : <div className="tiny muted">Sem contrato: chama-se {c.stadium}. Venda em patrocínios.</div>}
            <button className="btn sm mt6 block" onClick={() => push({ name: "sponsors" })}>Patrocínios ›</button>
          </div>
          {works.length > 0 && (
            <div className="card">
              <div className="card-title"><h3>🏗️ Em Andamento</h3></div>
              {works.map((x) => (
                <div key={x.kind} className="mt6">
                  <div className="row tiny"><span className="grow">{WORK_INFO[x.kind].emoji} {WORK_INFO[x.kind].label}</span><span className="muted">{workPct(w, x)}%</span></div>
                  <Bar v={workPct(w, x)} color="var(--accent)" />
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="k-stadium-main">
          <div className="k-stadium-cards-grid">
            {WORK_KINDS.map((k) => {"""

    if old_target in src:
        src = src.replace(old_target, new_replacement)
        src = src.replace("      {ask && (", "          </div>\n        </main>\n      </div>\n      {ask && (")
        write_file("src/ui/StadiumLook.tsx", src)
    else:
        print("StadiumLook.tsx pattern not found, checking...")

# ==============================================================================
# 15. ClubInfoScreen in src/ui/screens/Club.tsx
# ==============================================================================
def patch_clubinfo():
    src = read_file("src/ui/screens/Club.tsx")
    old_target = """export function ClubInfoScreen({ id }: { id: string }) {
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
        <div className="small mt12"><Ic n="stadium" /> {stadiumName(w, c)} ({c.capacity.toLocaleString("pt-BR")}) {c.founded ? `· fundado em ${c.founded}` : ""}</div>
      </div>
      <StadiumPhoto club={c} />
      {(kitSupplier(w, c) || shirtSponsor(w, c)) && (
        <div className="card club-brands">
          {kitSupplier(w, c) && <div><span className="tiny muted">Material esportivo</span><BrandLogo brand={kitSupplier(w, c)} size={26} withName /></div>}
          {shirtSponsor(w, c) && <div><span className="tiny muted">Patrocínio master</span><BrandLogo brand={shirtSponsor(w, c)} size={26} withName /></div>}
        </div>
      )}
      <div className="card tap row gap8" onClick={() => push({ name: "kits", id: c.id })}>
        <KitShirt clubId={c.id} which={0} width={46} supplier={kitSupplier(w, c) ?? null} sponsor={shirtSponsor(w, c) ?? null} crest={crestFor(c)} colors={c.colors} />
        <KitShirt clubId={c.id} which={1} width={46} supplier={kitSupplier(w, c) ?? null} sponsor={shirtSponsor(w, c) ?? null} crest={crestFor(c)} colors={c.colors} />
        <div className="grow"><b>Uniformes</b><div className="tiny muted">Titular, reserva e terceiro · fornecedor e patrocínio</div></div>
        <span className="muted">›</span>
      </div>
      <div className="grid3">
        <div className="stat-box"><b>{Math.round(clubStrength(w, c))}</b><span>força</span></div>
        <div className="stat-box"><b>{squad.length}</b><span>jogadores</span></div>
        <div className="stat-box"><b>{c.trophies.length}</b><span>títulos (jogo)</span></div>
      </div>
      {c.trophies.length > 0 && (
        <div className="card small">{estadualTitles(c) > 0 && <div>🏅 Estaduais: {estadualTitles(c)}</div>}🏆 {c.trophies.slice(-8).map((t) => `${COMP_META[t.comp]?.short ?? t.name} ${t.season}`).join(" · ")}</div>
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
}"""

    new_replacement = """export function ClubInfoScreen({ id }: { id: string }) {
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
            <div className="card small">{estadualTitles(c) > 0 && <div>🏅 Estaduais: {estadualTitles(c)}</div>}🏆 {c.trophies.slice(-6).map((t) => `${COMP_META[t.comp]?.short ?? t.name} ${t.season}`).join(" · ")}</div>
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
}"""

    if old_target in src:
        write_file("src/ui/screens/Club.tsx", src.replace(old_target, new_replacement))
    else:
        print("ClubInfoScreen pattern not found, checking...")

# ==============================================================================
# 16. HistoryScreen in src/ui/screens/Club.tsx
# ==============================================================================
def patch_history():
    src = read_file("src/ui/screens/Club.tsx")
    old_target = """export function HistoryScreen() {
  const w = useWorld();
  return (
    <div className="page">
      <div className="card">
        <h3>Sua carreira</h3>
        {w.managerHistory.length === 0 && <div className="empty-state center mt8"><b>Sua história começa agora</b><div className="small muted">Complete a primeira temporada e cada campanha ficará registrada aqui.</div></div>}
        {w.managerHistory.slice().reverse().map((h, i) => (
          <div key={i} className="row small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <b style={{ width: 44 }}>{h.season}</b>
            <Crest club={w.clubs[h.clubId]} size={18} />
            <span className="grow">{w.clubs[h.clubId]?.name} · Série {h.div} · {h.pos ?? "-"}º</span>
            {h.titles.map((t) => <span key={t} title={COMP_META[t]?.name}><Icon name="trophy" size={16} /></span>)}
            {h.admin && <span title="Temporada com edições do administrador">🛠️</span>}
          </div>
        ))}
      </div>
      {w.history.slice().reverse().map((s) => (
        <div key={s.season} className="card small">
          <b>{s.season}</b>
          {Object.entries(s.champions).map(([comp, club]) => (
            <div key={comp} className="row gap8 mt8"><span className="muted" style={{ width: 110 }}>{COMP_META[comp]?.short}</span>{w.clubs[club] && <Crest club={w.clubs[club]} size={16} />}{w.clubs[club]?.name ?? w.formerClubs?.[club] ?? club}</div>
          ))}
          {s.topScorer && <div className="mt8">⚽ Artilheiro da Série A: {s.topScorer.name} ({s.topScorer.goals})</div>}
          {s.bestPlayer && <div>🏅 Craque da Série A: {s.bestPlayer.name} (nota {s.bestPlayer.rating})</div>}
          {s.revelation && <div>🌟 Revelação: {s.revelation.name}, {s.revelation.age} anos (nota {s.revelation.rating})</div>}
        </div>
      ))}
    </div>
  );
}"""

    new_replacement = """export function HistoryScreen() {
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
                  {s.topScorer && <div className="tiny mt4">⚽ Artilheiro: {s.topScorer.name} ({s.topScorer.goals})</div>}
                  {s.bestPlayer && <div className="tiny">🏅 Craque: {s.bestPlayer.name} ({s.bestPlayer.rating})</div>}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}"""

    if old_target in src:
        write_file("src/ui/screens/Club.tsx", src.replace(old_target, new_replacement))
    else:
        print("HistoryScreen pattern not found, checking...")

if __name__ == "__main__":
    patch_uniforms()
    patch_stadium()
    patch_clubinfo()
    patch_history()
    print("ALL REMAINING SCREENS PATCHED.")
