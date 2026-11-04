// Complexo do Clube HD-2D (Sea of Stars / Octopath Traveler / RPG 16-32bit moderno)
// Foco nos 3 pilares do clube: Estádio, CT Profissional e Categorias de Base (Cotia) com artes
// isométricas em pixel art de alta definição e iluminação volumétrica por horário.
import { useState, type ReactNode } from "react";
import type { Club } from "../../engine/types";
import { facLevel } from "../../engine/facilities";
import { push, setTab } from "../../store";
import { haptic } from "../haptics";
import { Icon } from "../components";
import { mediaUrl } from "../mediaUrl";
import { Hd2dStadium, type Hd2dStadiumVariant, type Hd2dTimeOfDay } from "./Hd2dStadium";

export type ComplexSite = "stadium" | "training" | "academy";

interface Hd2dComplexProps {
  club: Club;
  matchToday?: boolean;
  fallback?: ReactNode;
}

export function Hd2dComplex({ club, matchToday = false }: Hd2dComplexProps) {
  const hour = new Date().getHours();
  const [timeOfDay, setTimeOfDay] = useState<Hd2dTimeOfDay>(() =>
    matchToday || hour >= 19 || hour < 6 ? "night" : hour >= 16 ? "sunset" : "day"
  );
  const [activeSite, setActiveSite] = useState<ComplexSite>("stadium");
  const [stadiumVariant, setStadiumVariant] = useState<Hd2dStadiumVariant>("auto");

  const stadiumLv = facLevel(club, "stadium");
  const trainLv = facLevel(club, "training");
  const youthLv = facLevel(club, "youth");
  const medLv = facLevel(club, "medical");

  const TIME_BTNS: [Hd2dTimeOfDay, string][] = [
    ["day", "Dia"],
    ["sunset", "Tarde"],
    ["night", "Noite"],
  ];

  const timeFilter =
    timeOfDay === "day"
      ? "brightness(1.06) saturate(1.1)"
      : timeOfDay === "sunset"
      ? "sepia(0.18) saturate(1.25) contrast(1.06)"
      : "brightness(0.78) contrast(1.18) saturate(1.12) hue-rotate(-10deg)";

  return (
    <div className="hd2d-complex-card">
      {/* Barra de Controle Superior: Seletor dos 3 Núcleos + Horário HD-2D */}
      <header className="hd2d-complex-header">
        <div className="hd2d-site-selector" role="tablist">
          <button
            className={`hd2d-site-tab ${activeSite === "stadium" ? "active" : ""}`}
            onClick={() => {
              haptic("tap");
              setActiveSite("stadium");
            }}
          >
            <Icon name="stadium" size={16} />
            <span>Estádio</span>
            <span className="hd2d-badge">Lv {stadiumLv}</span>
          </button>

          <button
            className={`hd2d-site-tab ${activeSite === "training" ? "active" : ""}`}
            onClick={() => {
              haptic("tap");
              setActiveSite("training");
            }}
          >
            <Icon name="dumbbell" size={16} />
            <span>CT Profissional</span>
            <span className="hd2d-badge">Lv {trainLv}</span>
          </button>

          <button
            className={`hd2d-site-tab ${activeSite === "academy" ? "active" : ""}`}
            onClick={() => {
              haptic("tap");
              setActiveSite("academy");
            }}
          >
            <Icon name="sprout" size={16} />
            <span>Base (Cotia)</span>
            <span className="hd2d-badge">Lv {youthLv}</span>
          </button>
        </div>

        {/* Alternador de Horário estilo Sea of Stars */}
        <div className="hd2d-time-toggle">
          {TIME_BTNS.map(([t, label]) => (
            <button
              key={t}
              className={`hd2d-time-btn ${timeOfDay === t ? "active" : ""}`}
              onClick={() => {
                haptic("tap");
                setTimeOfDay(t);
              }}
              title={`Ver em modo ${label}`}
            >
              {t === "day" && <Icon name="sun" size={13} />}
              {t === "sunset" && <Icon name="flame" size={13} />}
              {t === "night" && <Icon name="sparkle" size={13} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Área Central: Visualização HD-2D */}
      <div className="hd2d-viewport-box">
        {activeSite === "stadium" && (
          <div className="hd2d-scene-container">
            <Hd2dStadium
              club={club}
              look={club.look}
              timeOfDay={timeOfDay}
              variant={stadiumVariant}
              height={235}
              stadiumName={club.stadium}
              capacity={club.capacity}
            />

            {/* Seletor rápido de arquitetura HD-2D */}
            <div className="row gap6 mt6" style={{ flexWrap: "wrap" }}>
              {([
                ["auto", "Padrão do Clube"],
                ["morumbis", "Monumental (3 Anéis)"],
                ["arena", "Arena Coberta Moderna"],
                ["caldeirao", "Caldeirão Clássico"],
              ] as [Hd2dStadiumVariant, string][]).map(([v, label]) => (
                <button
                  key={v}
                  className={`chip ${stadiumVariant === v ? "active" : ""}`}
                  style={{ fontSize: 11, padding: "4px 10px" }}
                  onClick={() => {
                    haptic("tap");
                    setStadiumVariant(v);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Painel de Metadados e Ações do Estádio */}
            <div className="hd2d-scene-meta">
              <div className="hd2d-meta-info">
                <div className="hd2d-meta-title">
                  <Icon name="stadium" size={16} />
                  <b>{club.stadium}</b>
                  <span className="hd2d-tag ok">HD-2D</span>
                </div>
                <div className="hd2d-meta-sub">
                  Capacidade: <b>{club.capacity.toLocaleString("pt-BR")} lugares</b> · Estrutura Nível {stadiumLv}/5
                </div>
              </div>
              <div className="hd2d-meta-actions">
                <button
                  className="btn gold sm"
                  onClick={() => {
                    haptic("tap");
                    push({ name: "stadiumLook" });
                  }}
                >
                  <Icon name="wrench" size={14} /> Personalizar Estádio
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    haptic("tap");
                    push({ name: "facilities" });
                  }}
                >
                  <Icon name="crane" size={14} /> Obras & Níveis
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    haptic("tap");
                    push({ name: "finances" });
                  }}
                >
                  <Icon name="coins" size={14} /> Ingressos & Renda
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSite === "training" && (
          <div className="hd2d-scene-container">
            {/* Diorama Isométrico HD-2D do CT Profissional */}
            <div
              className="hd2d-scene-svg-wrap"
              style={{
                height: 235,
                position: "relative",
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                background: "#090d16",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 28px rgba(0,0,0,0.55)",
              }}
            >
              <img
                src={mediaUrl("hd2d/training-ct.jpg")}
                alt="Centro de Treinamento Profissional HD-2D"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center 50%",
                  display: "block",
                  filter: timeFilter,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background: "linear-gradient(180deg, transparent 55%, rgba(9, 13, 22, 0.72) 100%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "12px",
                  background: "rgba(9, 13, 22, 0.86)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  padding: "5px 11px",
                  borderRadius: "9px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#f8fafc",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8", display: "inline-block", marginRight: 6, boxShadow: "0 0 8px #38bdf8" }} />
                CT Profissional · Campos Táticos, Fisiologia & DM
              </div>
            </div>

            {/* Painel de Metadados e Ações do CT */}
            <div className="hd2d-scene-meta">
              <div className="hd2d-meta-info">
                <div className="hd2d-meta-title">
                  <Icon name="dumbbell" size={16} />
                  <b>Centro de Treinamento Profissional</b>
                  <span className="hd2d-tag info">Nível {trainLv}/5</span>
                </div>
                <div className="hd2d-meta-sub">
                  Departamento Médico: <b>Nível {medLv}/5</b> · Preparação Física e Análise de Desempenho
                </div>
              </div>
              <div className="hd2d-meta-actions">
                <button
                  className="btn gold sm"
                  onClick={() => {
                    haptic("tap");
                    push({ name: "training" });
                  }}
                >
                  <Icon name="dumbbell" size={14} /> Foco & Intensidade
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    haptic("tap");
                    setTab("tactics");
                  }}
                >
                  <Icon name="board" size={14} /> Prancheta Tática
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    haptic("tap");
                    push({ name: "dressing" });
                  }}
                >
                  <Icon name="chat" size={14} /> Vestiário & Moral
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSite === "academy" && (
          <div className="hd2d-scene-container">
            {/* Diorama Isométrico HD-2D da Base (CFA Cotia) */}
            <div
              className="hd2d-scene-svg-wrap"
              style={{
                height: 235,
                position: "relative",
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                background: "#090d16",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 28px rgba(0,0,0,0.55)",
              }}
            >
              <img
                src={mediaUrl("hd2d/academy-cotia.jpg")}
                alt="Centro de Formação de Atletas HD-2D"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center 52%",
                  display: "block",
                  filter: timeFilter,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background: "linear-gradient(180deg, transparent 55%, rgba(9, 13, 22, 0.72) 100%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "12px",
                  background: "rgba(9, 13, 22, 0.86)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  padding: "5px 11px",
                  borderRadius: "9px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#f8fafc",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", display: "inline-block", marginRight: 6, boxShadow: "0 0 8px #4ade80" }} />
                CFA Cotia · Alojamento & Celeiro de Craques
              </div>
            </div>

            {/* Painel de Metadados e Ações da Base */}
            <div className="hd2d-scene-meta">
              <div className="hd2d-meta-info">
                <div className="hd2d-meta-title">
                  <Icon name="sprout" size={16} />
                  <b>Centro de Formação de Atletas (CFA)</b>
                  <span className="hd2d-tag ok">Nível {youthLv}/5</span>
                </div>
                <div className="hd2d-meta-sub">
                  Safra Anual de Talentos · Olheiros Integrados · Sub-17 e Sub-20
                </div>
              </div>
              <div className="hd2d-meta-actions">
                <button
                  className="btn gold sm"
                  onClick={() => {
                    haptic("tap");
                    push({ name: "peneira" });
                  }}
                >
                  <Icon name="sprout" size={14} /> Dia da Peneira
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    haptic("tap");
                    push({ name: "youth" });
                  }}
                >
                  <Icon name="squad" size={14} /> Elenco da Base
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    haptic("tap");
                    push({ name: "staff" });
                  }}
                >
                  <Icon name="binoculars" size={14} /> Comissão da Base
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
