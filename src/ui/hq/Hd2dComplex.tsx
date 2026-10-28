// Complexo do Clube HD-2D (Sea of Stars / Final Fantasy / RPG 16-32bit moderno)
// Foco simplificado nos 3 pilares do clube: Estádio, CT Profissional e Categorias de Base.
// Livre do mapa 3D procedural pesado, com renderização instantânea, fluida e temática.
import { useState, type ReactNode } from "react";
import type { Club } from "../../engine/types";
import { facLevel } from "../../engine/facilities";
import { push, setTab } from "../../store";
import { haptic } from "../haptics";
import { Icon } from "../components";
import { Hd2dStadium, type Hd2dTimeOfDay } from "./Hd2dStadium";

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


  const stadiumLv = facLevel(club, "stadium");
  const trainLv = facLevel(club, "training");
  const youthLv = facLevel(club, "youth");
  const medLv = facLevel(club, "medical");

  const TIME_BTNS: [Hd2dTimeOfDay, string][] = [
    ["day", "Dia"],
    ["sunset", "Tarde"],
    ["night", "Noite"],
  ];

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
              height={230}
              stadiumName={club.stadium}
              capacity={club.capacity}
            />

            {/* Painel de Metadados e Ações do Estádio */}
            <div className="hd2d-scene-meta">
              <div className="hd2d-meta-info">
                <div className="hd2d-meta-title">
                  <Icon name="stadium" size={16} />
                  <b>{club.stadium}</b>
                  <span className="hd2d-tag ok">Oficial</span>
                </div>
                <div className="hd2d-meta-sub">
                  Capacidade: <b>{club.capacity.toLocaleString("pt-BR")} lugares</b> · Estrutura Nível {stadiumLv}/10
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
                height: 230,
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                background:
                  timeOfDay === "day"
                    ? "radial-gradient(ellipse at 50% 20%, #38bdf8 0%, #0284c7 100%)"
                    : timeOfDay === "sunset"
                    ? "radial-gradient(ellipse at 50% 20%, #fb923c 0%, #4c1d95 100%)"
                    : "radial-gradient(ellipse at 50% 20%, #0f172a 0%, #020617 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.45)",
              }}
            >
              <svg viewBox="0 0 600 360" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
                {/* Céu noturno */}
                {timeOfDay === "night" && (
                  <g opacity="0.8">
                    <circle cx="90" cy="35" r="1.5" fill="#ffffff" />
                    <circle cx="210" cy="55" r="1.2" fill="#cbd5e1" />
                    <circle cx="340" cy="30" r="1.8" fill="#fef08a" />
                    <circle cx="480" cy="45" r="1.5" fill="#ffffff" />
                  </g>
                )}

                {/* Base do Terreno do CT */}
                <polygon points="300,70 560,180 300,310 40,180" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                <polygon points="40,180 300,310 300,335 40,205" fill="#0f172a" />
                <polygon points="560,180 300,310 300,335 560,205" fill="#090d16" />

                {/* Pista de Corrida Externa */}
                <polygon points="300,85 530,180 300,295 70,180" fill="#7f1d1d" opacity="0.8" />

                {/* Campo Principal de Treino Tático */}
                <polygon points="220,120 380,185 220,250 60,185" fill="#16a34a" stroke="#ffffff" strokeWidth="1.5" />
                <line x1="140" y1="152" x2="300" y2="218" stroke="#ffffff" strokeWidth="1.2" opacity="0.9" />
                <ellipse cx="220" cy="185" rx="22" ry="10" fill="none" stroke="#ffffff" strokeWidth="1.2" />

                {/* Cones de Treino Laranja */}
                <g fill="#ea580c">
                  <polygon points="120,170 125,160 130,170" />
                  <polygon points="150,180 155,170 160,180" />
                  <polygon points="180,190 185,180 190,190" />
                  <polygon points="210,200 215,190 220,200" />
                </g>

                {/* Bonecos de Treino para Cobrança de Falta */}
                <g fill="#eab308" stroke="#0f172a" strokeWidth="0.8">
                  <circle cx="280" cy="185" r="3.5" />
                  <rect x="277.5" y="188.5" width="5" height="12" rx="1" />
                  <circle cx="290" cy="189" r="3.5" />
                  <rect x="287.5" y="192.5" width="5" height="12" rx="1" />
                  <circle cx="300" cy="193" r="3.5" />
                  <rect x="297.5" y="196.5" width="5" height="12" rx="1" />
                </g>

                {/* Trave do Campo de Treino */}
                <line x1="80" y1="178" x2="80" y2="168" stroke="#ffffff" strokeWidth="2" />
                <line x1="90" y1="182" x2="90" y2="172" stroke="#ffffff" strokeWidth="2" />
                <line x1="80" y1="168" x2="90" y2="172" stroke="#ffffff" strokeWidth="2" />

                {/* Prédio Moderno da Academia & Fisiologia (CT Barra Funda) */}
                <g id="gym-building" transform="translate(340, 110)">
                  {/* Paredes */}
                  <polygon points="60,30 160,70 160,150 60,110" fill="#0284c7" stroke="#0c4a6e" strokeWidth="2" />
                  <polygon points="0,55 60,30 60,110 0,135" fill="#0369a1" stroke="#0c4a6e" strokeWidth="2" />
                  <polygon points="0,55 60,30 160,70 100,95" fill="#38bdf8" opacity="0.9" />

                  {/* Janelas reflexivas / Vidraça da Academia */}
                  <g fill="#bae6fd" opacity="0.8">
                    <rect x="75" y="55" width="20" height="25" rx="1" />
                    <rect x="105" y="67" width="20" height="25" rx="1" />
                    <rect x="135" y="79" width="18" height="25" rx="1" />
                    <rect x="15" y="75" width="15" height="20" rx="1" />
                    <rect x="35" y="65" width="15" height="20" rx="1" />
                  </g>
                  {/* Letreiro */}
                  <text x="110" y="50" fill="#f8fafc" fontSize="8" fontWeight="900" fontFamily="sans-serif">
                    CENTRO DE PERFORMANCE
                  </text>
                </g>

                {/* Iluminação de Treino Noturna */}
                {timeOfDay === "night" && (
                  <g opacity="0.5">
                    <polygon points="340,90 200,160 360,230" fill="rgba(254, 240, 138, 0.4)" />
                  </g>
                )}
              </svg>

              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "12px",
                  background: "rgba(15, 23, 42, 0.85)",
                  backdropFilter: "blur(8px)",
                  padding: "4px 10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#f8fafc",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8", display: "inline-block", marginRight: 6 }} />
                CT Profissional · Preparação Física & DM
              </div>
            </div>

            {/* Painel de Metadados e Ações do CT */}
            <div className="hd2d-scene-meta">
              <div className="hd2d-meta-info">
                <div className="hd2d-meta-title">
                  <Icon name="dumbbell" size={16} />
                  <b>Centro de Treinamento Profissional</b>
                  <span className="hd2d-tag info">Nível {trainLv}/10</span>
                </div>
                <div className="hd2d-meta-sub">
                  Departamento Médico: <b>Nível {medLv}/10</b> · Preparação Física e Análise de Desempenho
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
                height: 230,
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                background:
                  timeOfDay === "day"
                    ? "radial-gradient(ellipse at 50% 20%, #86efac 0%, #15803d 100%)"
                    : timeOfDay === "sunset"
                    ? "radial-gradient(ellipse at 50% 20%, #fdba74 0%, #701a75 100%)"
                    : "radial-gradient(ellipse at 50% 20%, #064e3b 0%, #022c22 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.45)",
              }}
            >
              <svg viewBox="0 0 600 360" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
                {/* Céu */}
                {timeOfDay === "night" && (
                  <g opacity="0.8">
                    <circle cx="100" cy="40" r="1.5" fill="#ffffff" />
                    <circle cx="250" cy="30" r="1.2" fill="#fef08a" />
                    <circle cx="450" cy="50" r="1.5" fill="#ffffff" />
                  </g>
                )}

                {/* Base do Terreno Campestre */}
                <polygon points="300,70 560,180 300,310 40,180" fill="#14532d" stroke="#166534" strokeWidth="2" />
                <polygon points="40,180 300,310 300,335 40,205" fill="#052e16" />
                <polygon points="560,180 300,310 300,335 560,205" fill="#021f0f" />

                {/* Campo da Base Sub-17 / Sub-20 */}
                <polygon points="180,120 340,185 180,250 20,185" fill="#22c55e" stroke="#ffffff" strokeWidth="1.5" />
                <line x1="100" y1="152" x2="260" y2="218" stroke="#ffffff" strokeWidth="1.2" opacity="0.9" />
                <ellipse cx="180" cy="185" rx="20" ry="9" fill="none" stroke="#ffffff" strokeWidth="1.2" />

                {/* Alojamento dos Garotos da Base (Casa da Base / Chalés Cotia) */}
                <g id="housing-building" transform="translate(350, 105)">
                  {/* Telhado Estilo RPG Sea of Stars */}
                  <polygon points="70,10 170,50 120,80 20,40" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="1.5" />
                  {/* Paredes */}
                  <polygon points="20,40 120,80 120,150 20,110" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5" />
                  <polygon points="120,80 170,50 170,120 120,150" fill="#fde68a" stroke="#d97706" strokeWidth="1.5" />

                  {/* Janelas acolhedoras e portas */}
                  <g fill="#92400e">
                    <rect x="40" y="65" width="14" height="18" rx="1" />
                    <rect x="75" y="80" width="14" height="18" rx="1" />
                    <rect x="60" y="115" width="16" height="28" rx="2" fill="#78350f" />
                  </g>
                  {/* Letreiro */}
                  <text x="95" y="35" fill="#ffffff" fontSize="8" fontWeight="900" fontFamily="sans-serif">
                    CFA COTIA · BASE
                  </text>
                </g>

                {/* Árvores e Pomar em Pixel Art */}
                <g id="trees">
                  {/* Árvore 1 */}
                  <circle cx="280" cy="115" r="14" fill="#15803d" />
                  <circle cx="280" cy="110" r="10" fill="#22c55e" />
                  <rect x="278" y="125" width="4" height="12" fill="#78350f" />

                  {/* Árvore 2 */}
                  <circle cx="320" cy="140" r="16" fill="#15803d" />
                  <circle cx="320" cy="134" r="12" fill="#4ade80" />
                  <rect x="318" y="150" width="4" height="12" fill="#78350f" />

                  {/* Árvore 3 */}
                  <circle cx="240" cy="270" r="14" fill="#15803d" />
                  <circle cx="240" cy="265" r="10" fill="#22c55e" />
                  <rect x="238" y="280" width="4" height="10" fill="#78350f" />
                </g>

                {/* Portal dos Campeões / Troféus de Base */}
                <g id="trophy-arch" transform="translate(140, 240)">
                  <path d="M 0,15 Q 25,0 50,15" fill="none" stroke="#eab308" strokeWidth="3" />
                  <text x="25" y="12" fill="#fef08a" fontSize="6.5" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">
                    BERÇO DE CRAQUES
                  </text>
                </g>
              </svg>

              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "12px",
                  background: "rgba(15, 23, 42, 0.85)",
                  backdropFilter: "blur(8px)",
                  padding: "4px 10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#f8fafc",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", display: "inline-block", marginRight: 6 }} />
                CFA Cotia · Alojamento & Celeiro de Joias
              </div>
            </div>

            {/* Painel de Metadados e Ações da Base */}
            <div className="hd2d-scene-meta">
              <div className="hd2d-meta-info">
                <div className="hd2d-meta-title">
                  <Icon name="sprout" size={16} />
                  <b>Centro de Formação de Atletas (CFA)</b>
                  <span className="hd2d-tag ok">Nível {youthLv}/10</span>
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
