import { useState } from "react";
import { formatMoney } from "../../engine/finance";
import { squadOf } from "../../engine/lineup";
import { push, setTab, useWorld } from "../../store";
import { Icon } from "../components";

type MoreSubTab = "all" | "market" | "club" | "comps" | "career";

export function MoreScreen() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const [sub, setSub] = useState<MoreSubTab>("all");
  const youthCount = squadOf(w, club, true).filter((p) => p.youth).length;
  const offersCount = w.career?.offers.length ?? 0;
  const bidsCount = (w.offers ?? []).filter((b) => b.status === "pending" && (b.to === club.id || b.from === club.id)).length;

  return (
    <div className="k-page">
      <nav className="k-subtabs" aria-label="Categorias da Central">
        <button className={sub === "all" ? "active" : ""} onClick={() => setSub("all")}>Visão Geral dos Módulos</button>
        <button className={sub === "market" ? "active" : ""} onClick={() => setSub("market")}>Mercado & Olheiros</button>
        <button className={sub === "club" ? "active" : ""} onClick={() => setSub("club")}>Clube & Sede 3D</button>
        <button className={sub === "comps" ? "active" : ""} onClick={() => setSub("comps")}>Competições & Calendário</button>
        <button className={sub === "career" ? "active" : ""} onClick={() => setSub("career")}>Carreira & Sala de Troféus</button>
      </nav>

      <div className="k-more-grid">
        {(sub === "all" || sub === "market") && (
          <section className="k-mod-col">
            <header className="k-mod-hd" style={{ color: "#a59bff" }}>
              <Icon name="swap" size={15} />
              <span>Mercado, Olheiros & Contratos</span>
            </header>
            <button className="k-mod-card" style={{ borderLeftColor: "#5842f4" }} onClick={() => setTab("market")}>
              <b>Busca de Jogadores</b>
              <small>Filtros por posição, idade, valor, atributo e contrato</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#10b981" }} onClick={() => { localStorage.setItem("ldb.marketTab", "scouting"); setTab("market"); }}>
              <b>Rede de Olheiros</b>
              <small>Missões por região, conhecimento e relatórios com estrelas</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#f59e0b" }} onClick={() => { localStorage.setItem("ldb.marketTab", "targets"); setTab("market"); }}>
              <b>Lista de Interesse & Propostas {bidsCount > 0 ? `(${bidsCount})` : ""}</b>
              <small>Alvos monitorados, cláusulas e negociações ativas</small>
            </button>
          </section>
        )}

        {(sub === "all" || sub === "club") && (
          <section className="k-mod-col">
            <header className="k-mod-hd" style={{ color: "#10b981" }}>
              <Icon name="club" size={15} />
              <span>Clube, Finanças & Diretoria</span>
            </header>
            <button className="k-mod-card" style={{ borderLeftColor: "#10b981" }} onClick={() => push({ name: "finances" })}>
              <b>Finanças & Patrocínios ({formatMoney(club.balance)})</b>
              <small>Receitas, despesas, folha salarial, cotas e projeção</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#38bdf8" }} onClick={() => setTab("club")}>
              <b>Instalações & Sede 3D ({club.stadium})</b>
              <small>Complexo 3D, estádio, CT profissional e melhorias</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#a59bff" }} onClick={() => push({ name: "board" })}>
              <b>Diretoria ({Math.round(w.board.confidence)}% confiança)</b>
              <small>Expectativas por competição, metas e reuniões/pedidos</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#f59e0b" }} onClick={() => push({ name: "staff" })}>
              <b>Comissão Técnica</b>
              <small>Auxiliar, preparadores, médicos, olheiros e analistas</small>
            </button>
          </section>
        )}

        {(sub === "all" || sub === "club") && (
          <section className="k-mod-col">
            <header className="k-mod-hd" style={{ color: "#f59e0b" }}>
              <Icon name="cone" size={15} />
              <span>Treinos, Base & Vestiário</span>
            </header>
            <button className="k-mod-card" style={{ borderLeftColor: "#f59e0b" }} onClick={() => push({ name: "training" })}>
              <b>Centro de Treinamento</b>
              <small>Foco coletivo, intensidade, treino individual e evolução</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#10b981" }} onClick={() => push({ name: "youth" })}>
              <b>Categorias de Base ({youthCount} jovens)</b>
              <small>Sub-17 e Sub-20, safra anual, peneira e transição</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#ef4444" }} onClick={() => push({ name: "dressing" })}>
              <b>Centro Médico & Vestiário</b>
              <small>Lesões, moral com motivo, líderes, promessas e conversas</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#38bdf8" }} onClick={() => push({ name: "kits", id: club.id })}>
              <b>Uniformes & Identidade</b>
              <small>Camisas titular, reserva e personalização do clube</small>
            </button>
          </section>
        )}

        {(sub === "all" || sub === "comps" || sub === "career") && (
          <section className="k-mod-col">
            <header className="k-mod-hd" style={{ color: "#38bdf8" }}>
              <Icon name="trophy" size={15} />
              <span>Competições, Calendário & Carreira</span>
            </header>
            <button className="k-mod-card" style={{ borderLeftColor: "#38bdf8" }} onClick={() => setTab("comps")}>
              <b>Calendário & Competições</b>
              <small>Agenda de jogos, tabelas, chaves de copas e artilharia</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#10b981" }} onClick={() => push({ name: "nts" })}>
              <b>Seleções Nacionais & Mundo</b>
              <small>Convocações, Copa do Mundo e ligas internacionais</small>
            </button>
            <button className="k-mod-card" style={{ borderLeftColor: "#a59bff" }} onClick={() => push({ name: "career" })}>
              <b>Minha Carreira {offersCount > 0 ? `(${offersCount} ofertas)` : ""}</b>
              <small>Currículo do treinador, reputação e propostas de clubes</small>
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button className="k-mod-card" style={{ borderLeftColor: "#f59e0b" }} onClick={() => push({ name: "trophies" })}>
                <b>Sala de Troféus</b>
                <small>Taças 3D e histórico</small>
              </button>
              <button className="k-mod-card" style={{ borderLeftColor: "#64748b" }} onClick={() => push({ name: "settings" })}>
                <b>Configurações</b>
                <small>Modo leve e saves</small>
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
