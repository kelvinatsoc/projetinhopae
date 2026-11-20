// Complexo Interativo do Clube em RPG HD-2D (Sea of Stars / Pocket League Story / Pixel Cup Soccer)
// Os 3 núcleos (Estádio, CT Profissional e Base Cotia) rodam ao vivo a 60 FPS no Hd2dWorldCanvas
// com os jogadores reais do clube treinando no campo, trocando passes e ganhando +XP ao toque.
import { useState, type ReactNode } from "react";
import type { Club } from "../../engine/types";
import { facLevel } from "../../engine/facilities";
import { getWorld, push, setTab } from "../../store";
import { haptic } from "../haptics";
import { Icon } from "../components";
import "../club.css";
import "./hq.css";
import { Hd2dStadium, type Hd2dStadiumVariant, type Hd2dTimeOfDay } from "./Hd2dStadium";
import { Hd2dWorldCanvas } from "./Hd2dWorldCanvas";

export type ComplexSite = "stadium" | "training" | "academy";

interface Hd2dComplexProps {
  club: Club;
  matchToday?: boolean;
  defaultSite?: ComplexSite;
  fallback?: ReactNode;
}

export function Hd2dComplex({ club, matchToday = false, defaultSite = "stadium" }: Hd2dComplexProps) {
  const hour = new Date().getHours();
  const [timeOfDay, setTimeOfDay] = useState<Hd2dTimeOfDay>(() =>
    matchToday || hour >= 19 || hour < 6 ? "night" : hour >= 16 ? "sunset" : "day"
  );
  const [activeSite, setActiveSite] = useState<ComplexSite>(defaultSite);
  const [stadiumVariant, setStadiumVariant] = useState<Hd2dStadiumVariant>("auto");

  const world = getWorld();
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
      {/* Barra de Controle Superior: Seletor dos 3 Núcleos Vivos + Horário HD-2D */}
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

      {/* Área Central: Mundo HD-2D Interativo a 60 FPS */}
      <div className="hd2d-viewport-box">
        {activeSite === "stadium" && (
          <div className="hd2d-scene-container">
            <Hd2dStadium
              club={club}
              look={club.look}
              timeOfDay={timeOfDay}
              variant={stadiumVariant}
              height={238}
              stadiumName={club.stadium}
              capacity={club.capacity}
            />

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

            <div className="hd2d-scene-meta">
              <div className="hd2d-meta-info">
                <div className="hd2d-meta-title">
                  <Icon name="stadium" size={16} />
                  <b>{club.stadium}</b>
                  <span className="hd2d-tag ok">HD-2D 60 FPS</span>
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
                  <Icon name="wrench" size={14} /> Reformar Estádio
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
                  <Icon name="coins" size={14} /> Bilheteria
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSite === "training" && (
          <div className="hd2d-scene-container">
            <div
              className="hd2d-scene-svg-wrap"
              style={{
                height: 238,
                position: "relative",
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                background: "#090d16",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 12px 30px rgba(0,0,0,0.6)",
              }}
            >
              <Hd2dWorldCanvas
                club={club}
                world={world}
                site="ct"
                timeOfDay={timeOfDay}
                height="100%"
                onPlayerClick={(pid) => {
                  if (world?.players[pid]) push({ name: "player", id: pid });
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "12px",
                  background: "rgba(9, 13, 22, 0.88)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(56, 189, 248, 0.38)",
                  padding: "5px 12px",
                  borderRadius: "9px",
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#f8fafc",
                  pointerEvents: "none",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8", display: "inline-block", marginRight: 6, boxShadow: "0 0 8px #38bdf8" }} />
                CT Profissional Ao Vivo · Toque num jogador em campo para abrir a ficha!
              </div>
            </div>

            <div className="hd2d-scene-meta">
              <div className="hd2d-meta-info">
                <div className="hd2d-meta-title">
                  <Icon name="dumbbell" size={16} />
                  <b>Centro de Treinamento Profissional</b>
                  <span className="hd2d-tag info">Nível {trainLv}/5</span>
                </div>
                <div className="hd2d-meta-sub">
                  Departamento Médico: <b>Nível {medLv}/5</b> · Atletas do elenco treinando em tempo real
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
            <div
              className="hd2d-scene-svg-wrap"
              style={{
                height: 238,
                position: "relative",
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid rgba(74, 222, 128, 0.38)",
                background: "#090d16",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 12px 30px rgba(0,0,0,0.6)",
              }}
            >
              <Hd2dWorldCanvas
                club={club}
                world={world}
                site="academy"
                timeOfDay={timeOfDay}
                height="100%"
                onPlayerClick={(pid) => {
                  if (world?.players[pid]) push({ name: "player", id: pid });
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "12px",
                  background: "rgba(9, 13, 22, 0.88)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(74, 222, 128, 0.4)",
                  padding: "5px 12px",
                  borderRadius: "9px",
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#f8fafc",
                  pointerEvents: "none",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", display: "inline-block", marginRight: 6, boxShadow: "0 0 8px #4ade80" }} />
                CFA Cotia Ao Vivo · Joias da Base treinando (toque numa promessa!)
              </div>
            </div>

            <div className="hd2d-scene-meta">
              <div className="hd2d-meta-info">
                <div className="hd2d-meta-title">
                  <Icon name="sprout" size={16} />
                  <b>Centro de Formação de Atletas (CFA Cotia)</b>
                  <span className="hd2d-tag ok">Nível {youthLv}/5</span>
                </div>
                <div className="hd2d-meta-sub">
                  Safra Anual de Talentos · Evolução em Tempo Real · Sub-17 e Sub-20
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
