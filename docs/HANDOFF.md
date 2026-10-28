# Lendas da Base: passagem de bastão

Este documento é para quem vai continuar o desenvolvimento do jogo: uma pessoa ou outro agente de IA (Antigravity, Gemini/Argon, Cursor etc.). Ele resume o que existe, as regras do projeto e a fila de tarefas pendentes, já em ordem.

## 1. O que é o jogo
- **Lendas da Base** é um manager de futebol para celular Android. O dono joga num Galaxy S24 Ultra; um amigo dele tem um Redmi 10A, bem fraco.
- É um app de uso pessoal. O dono autorizou nomes, escudos, uniformes, patrocinadores e fotos reais.
- **Ligas:** Brasil completo (Séries A–D, 27 estaduais com clubes reais, Copa do Brasil, Libertadores e Sul-Americana) e o mundo: ENG, ESP, ITA, GER, FRA, POR, NED, TUR, SCO, ARG, KSA, JPN e MLS.
- **Competições:** Champions, Europa League e Conference, Champions da Ásia, Mundial de Clubes e Intercontinental.
- **Seleções:** datas FIFA, Copa 2026, Copa América e Euro, e o cargo de técnico de seleção acumulado com o clube.
- **Idioma:** todo texto do jogo em **português do Brasil**, nunca de Portugal. Há uma lista negra em `tests/ptbr.test.ts`.

## 2. Stack e comandos
- Vite 8, React 19, TypeScript strict, vitest, Capacitor 8 (Android) e three.js (carregado sob demanda).
- `npm ci`: instala.
- `npm run dev`: servidor local (abrir com viewport de celular, 412×915).
- `npx tsc --noEmit -p .`: checagem de tipos, **obrigatória antes de todo commit**.
- `npx vitest run`: testes, cerca de 290, **obrigatório tudo verde**. Com `CI=1` os testes estatísticos usam N menor.
- **APK:** o workflow `.github/workflows/android.yml` roda a cada push nas branches `main` e `claude/**`, gera o APK assinado e publica na release fixa `apk-latest`: https://github.com/kelvinatsoc/projetinhopae/releases/tag/apk-latest
- **APK local:** `npx vite build && npx cap sync android && cd android && ./gradlew assembleDebug`.

## 3. Branch e fluxo
- A branch de trabalho atual é `claude/ecstatic-tesla-mamls5`, que funciona como principal. Faça push nela, ou abra a sua a partir dela.
- Mensagens de commit em português.
- O usuário pediu **UMA TAREFA POR VEZ**: termine, teste, faça push, avise e só então comece a próxima.

## 4. Mapa do código
- `src/engine/`: motor determinístico, sem DOM. Usa um rng próprio (`rng.ts`); nunca use `Math.random` no motor.
  - Mundo: `world.ts` (`createWorld`, `migrateWorld`, `SAVE_VERSION`), `game.ts` (avançar dias, `applyResult`, `afterUserMatch`), `season.ts` e `calendar.ts`.
  - Partidas: `match.ts` é o MatchSim completo, usado nos jogos do Brasil e do usuário. `fastsim.ts` é uma simulação Poisson para os jogos estrangeiros.
  - Competições: `competitions.ts`, `continental.ts`, `uefa.ts`, `international.ts`, `worldLeagues.ts` e `estaduais.ts`.
  - Auxiliar técnico: `assistant.ts`, com Monte Carlo em `refineAnalysis`, ordens ao vivo e substituições automáticas. As instruções rápidas ficam em `shouts.ts`.
  - Grupo: `dressing.ts` (entrosamento por jogo, `chemMatchDelta`, moral), `chemistry.ts` (química dos pares) e `narrative.ts` (torcida).
  - Mercado: `transfers.ts` e `worldMoney.ts`, com preço limitado a 2× o valor.
  - Outros módulos: `powers.ts` (loja de poderes estilo Mario Strikers), `customKit.ts` (3º uniforme), `sponsors.ts` (contratos de fornecedor e master) e `stadiumLook.ts` (personalização e reformas do estádio).
- `src/ui/`: React.
  - Tema: `theme.css`, identidade "Noite de Estádio": fundo escuro, cor do clube como marca, verde-limão só para números, fontes Barlow e Barlow Condensed.
  - Telas em `screens/` (Home, Squad, Match, Tactics, Club, Powers etc.).
  - `match3d/`: renderizador 3D da partida (PBR, torcida reativa, chegada do ônibus, rituais, zoom livre, golpes especiais).
  - `MatchView.tsx`: escolhe entre 3D e 2D. `MatchDash.tsx`: painel de estatísticas ao vivo.
  - `hq/`: mapa 3D da sede (`HqRenderer.ts`, `stadium.ts`, `city.ts`, `geo.ts` e `ClubHQ.tsx`).
  - Uniformes: `kitTexture.ts`, com `makeKitTexture(clubId, which)`.
  - Desempenho: `perf.ts`, detecção de aparelho fraco e modo leve.
  - Áudio: `audio.ts` (mixer) e `torcida.ts` (`crowdMood`, `crowdExodus`).
  - Troféus: `trophies.ts` e `trophy3d.ts` (modelos 3D).
  - Fase da partida: `MatchPhase.tsx`.
- `src/data/`:
  - `database.json`: Brasil.
  - `world.json`: mundo, carregado por `import()` dinâmico.
  - `kits.json` e `kitOverrides.json`: uniformes.
  - `clubSites.json`: coordenadas reais de estádio, CT e sede.
  - `stadiumModels.json`: estádios paramétricos.
  - `media.json` e `legendMedia.json`: índice de mídia.
- `scripts/`: pipelines Python retomáveis que buscam dados e mídia.
- `public/media/`: escudos, fotos, estádios, logos, uniformes e áudio. Os créditos ficam em `public/media/credits.json`.

## 5. Regras importantes (não violar)
1. Nada de scraping do ogol (Cloudflare) nem do Google Maps.
2. Não use assets de FIFA, PES, EA ou Konami (proprietários). Fotos só da Wikimedia Commons, da Wikidata (P18) e do TheSportsDB (chave pública 3).
3. Nada de áudio do YouTube nem de músicas protegidas. Só fontes livres (Commons, Freesound CC), com créditos.
4. Não crie contas em sites de terceiros.
5. Ritmo das fontes:
   - Wikipedia: só `index.php?action=raw`, 1 requisição a cada 4 s, com backoff no 429.
   - Wikidata: 1 a cada 3 s.
   - TheSportsDB: 1 a cada 2 s.
   - Nominatim/OSM: 1 por segundo, com User-Agent.
6. O motor é determinístico: os testes de calibração (`tests/season.test.ts`, `assistantQuality`, `marketSanity` etc.) precisam continuar passando. Não mude os resultados das partidas sem querer.
7. Saves antigos precisam continuar abrindo: migração idempotente em `migrateWorld` e `migrateDynamics`. Suba `SAVE_VERSION` só quando for inevitável.
8. O APK tem que rodar tanto no S24 Ultra (qualidade máxima) quanto no Redmi 10A (modo leve automático).

## 6. O que já está pronto (resumo)
- Mundo inteiro com dados reais, mais estaduais 100% reais.
- **Partida 3D moderna:**
  - bola com física e trajetória, sem teletransporte;
  - jogadores com movimento suave;
  - torcida que esvazia na goleada, chegada do ônibus com sinalizadores, rituais e zoom.
- Golpes especiais e a Loja de Poderes: compra com dinheiro do clube, barra de carga e botão ATIVAR na partida.
- Modo leve: 2D, sem efeitos e com autosave num Web Worker.
- **Auxiliar técnico:**
  - substituições automáticas (opcionais), rodízio entre jogos próximos;
  - ordens contextuais (final fora de casa, agregado, amarelado, ponta adversário).
- Painel completo na aba Lances (momentum, xG, passes, zonas, notas, fôlego) e instruções rápidas estilo FM.
- Entrosamento, clima do grupo e torcida variando a cada jogo, com setinhas ▲/▼.
- Economia coerente (preço pedido de 1 a 1,5× o valor, máximo 2×; salários realistas).
- **Uniformes:**
  - reais, com fornecedor e patrocinador;
  - aba "Uniformes", 3º uniforme personalizável por temporada;
  - contratos de marca com propostas no último ano.
- 34 logos de campeonato em alta qualidade, troféus 3D, animação de campeão e fase da partida (FINAL, ida e volta, agregado).
- **São Paulo no mapa da sede (Tarefa A concluída em `a75e906`):**
  - Pipeline 3D PBR moderno em `src/ui/hq/` (`HqRenderer.ts`, `stadium.ts`, `city.ts`, `ClubHQ.tsx`), sem qualquer efeito retrô/PS1 (removidos dithering, vertex snapping, flat shading e pixelRatio baixo);
  - Pós-processamento completo no modo alto (`EffectComposer`: `RenderPass` + `SAOPass` + `UnrealBloomPass` + `SMAAPass`), `PCFSoftShadowMap` 2048², `ACESFilmicToneMapping`, domo de céu com sol/lua e nuvens volumétricas;
  - **Morumbis** fiel ao estádio real (oval tricolor, anel superior em balanço com friso vermelho, cobertura translúcida, torres de iluminação com lens flare, placares de LED e bandeiras tricolores animadas);
  - **CT da Barra Funda** às margens do Rio Tietê com água animada e reflexo especular, **CT de Cotia** arborizado com alojamento da base e **Sede Social** com piscinas azuis, quadras e carros/pedestres animados nas avenidas;
  - Controle de horário (`☀ Dia`, `🌅 Tarde`, `🌙 Noite`) direto no HUD 3D.
- **Redesign completo do app "Arquibancada Pro" (Tarefa B concluída em `f6932b8`):**
  - **Início (`src/ui/screens/Home.tsx`):** Card de Próximo Jogo com CTA integrado (`▶ Jogar Partida / Continuar` + `Escalação`), Pulse Strip de 4 colunas (`Confiança`, `Química`, `Grupo`, `Torcida`), 4 pílulas rápidas sem duplicar a barra inferior, Mini-Tabela com `SG` e `Forma` (V/E/D) e Fita de Notícias;
  - **Elenco (`src/ui/screens/Squad.tsx`, `src/ui/components.tsx`):** KPI Bar unificada (`Força XI`, `Química`, `Folha/Mês`, botão 1-toque `⚡ Escalar` e alternância Lista/Cartas), filtros + ordenação em 1 linha, e `PlayerRow` (`prow-modern`) com nomes completos sem truncar, pílula `XI`, condição física colorida e badges na linha de metadados;
  - **Campo Tático (`src/ui/screens/Tactics.tsx`):** Seletores rápidos em 1 linha (`📐 Formação`, `🔥 Mentalidade`, `⚡ Pressão`, `✨ Escalar`, `🔗 Linhas`, `🎯 Bola parada`), gramado no topo imediato e **Banco de Reservas (9/9)** logo abaixo para trocas sem rolagem;
  - **Mercado (`src/ui/screens/Market.tsx`):** Banner da janela + saldo em caixa, busca com gaveta **`⚙ Filtros`** (`Sheet`) e resultados imediatos no topo;
  - **Clube (`src/ui/screens/Club.tsx`):** Hero com KPIs integrados (`Saldo Atual`, `Folha / Mês`, `Sala de Troféus`), **Sede 3D (`<ClubHQ />`)** em destaque e grade 3×3 de gestão.

## 7. FILA DE TAREFAS PENDENTES (fazer nesta ordem, uma de cada vez)

> **Status das tarefas anteriores:**
> - ✅ **Tarefa A (Mapa 3D da sede com gráficos modernos):** Concluída (`a75e906`).
> - ✅ **Tarefa B (Redesign completo do app "Arquibancada Pro"):** Concluída (`f6932b8`).

### Tarefa C: pendências menores e polimento
1. ✅ **Desarmes desequilibrados** no painel ao vivo (concluído): calibrado em `MatchSim.track()` (`src/engine/match.ts`) com contrapressão do time com a bola e amortecimento do lado recuado no RNG próprio (`this.xr`), sem tocar no placar, testado em `tests/liveDash.test.ts`.
2. ✅ **Logos que faltam** (concluído): todas as 43 competições (`public/media/comps/*.webp`) completas, incluindo Premier League (`eng1`), Carioca (`est-RJ`), Mineiro (`est-MG`), Paranaense (`est-PR`), Goiano (`est-GO`), Cearense (`est-CE`), Pernambucano (`est-PE`), Baiano (`est-BA`) e Parazão (`est-PA`), mais compatibilidade Windows em `scripts/wm.py`.
3. ✅ **Fotos das Lendas** (concluído): cobertura expandida de 47 para **93 de 105 lendas** com foto real (`public/media/players/<QID>.webp`), detecção facial aprimorada com YuNet ONNX (OpenCV 5+ / Windows) em `scripts/fetch_player_photos.py`, mapeamento atualizado em `src/data/legendMedia.json`, `src/data/media.json` e `public/media/credits.json`.
4. ✅ **Padrões de uniforme** (concluído para os prioritários): foco estrito nos 115 clubes prioritários (Brasileirão Séries A e B, principais concorrentes da Copa Libertadores e maiores potências europeias / recorrentes do Mundial de Clubes: Real Madrid, Barcelona, Man City, Liverpool, Arsenal, Chelsea, Bayern, Dortmund, Leverkusen, PSG, Inter, Milan, Juventus, Benfica, Porto, Sporting, Al-Hilal, Inter Miami etc.). Baixados 855 novos padrões e contornos da Wikimedia Commons (totalizando 1.601 estampas catalogadas em `public/media/kits/credits.json`), atingindo 100% de cobertura com padrões reais nos 115 clubes prioritários, preservando integralmente todos os 460 clubes em `src/data/kits.json`.
5. ✅ **Áudio de torcida real** (concluído): 11 gravações autênticas de torcida brasileira e da Seleção baixadas da Wikimedia Commons e processadas em AAC mono normalizado (-18 LUFS) em `public/media/audio/br/` (`arquibancada.m4a`, `canto.m4a`, `gol.m4a`, `gol2.m4a`, `uh.m4a`, `vaia.m4a`, `ole.m4a`, `selecao.m4a`, `selecao-canto.m4a`, `vasco-canto.m4a`, `vasco-gol.m4a`), com créditos completos em `public/media/audio/credits.json` e no índice geral `public/media/credits.json`.
6. ✅ **46 escudos de clubes de estadual faltando** (concluído): pipeline `scripts/fetch_club_media.py` estendido com suporte a repositório local da Wikipédia em português (`wiki="pt"`), resolvendo 100% dos 222 clubes do catálogo (`public/media/crests/*.webp`, zero clubes faltando) e registrando todos os créditos em `scripts/cache/credits_clubs.json` e `public/media/credits.json` (1.886 arquivos catalogados).
7. ✅ **Média de gols calibrada** (concluído): calibrada a fórmula de gols esperados em `src/engine/fastsim.ts` (`base` de `[1.36, 1.05]` para `[1.32, 1.02]` e divisor do expoente de 14 para 16), enquadrando França (`fra1`: 2,54) e Escócia (`sco1`: 2,52) na faixa alvo; em `src/engine/match.ts`, adicionada gestão de ritmo e fechamento defensivo em desvantagem (`isCont`, `ease` em vantagens de 2+ gols e `contMult: 0.94`), calibrando Libertadores para ~2,50–2,60 e Sul-Americana para ~2,46–2,50, mantendo a Série A intocada e determinística (2,40 gols/jogo, aprovada em `tests/season.test.ts`).
8. ✅ **Valores de mercado avaliados e equilibrados** (concluído): análise econômica aprofundada da paridade de poder de compra e orçamentos dos clubes (`worldBalance` em `src/engine/worldMoney.ts`). Constatado que orçamentos reais dos maiores clubes europeus no jogo giram entre R$ 250M e R$ 430M (~€45M a €71M). Valores nominais de R$ 300M–R$ 430M para superestrelas (Haaland / Mbappé) representam com exatidão o teto de liquidez do mercado sem paralisar o sistema de transferências por insolvência dos compradores (`buyer.balance * 0.6`).
9. ✅ **Confiança da diretoria sem travamento** (concluído): implementados rendimentos decrescentes progressivos em `boardAfterMatch` (`src/engine/season.ts`) quando a confiança ultrapassa 90% (`d *= Math.max(0.08, (99 - conf) / 16)`), com teto dinâmico de 99% em partidas comuns, reservando os 100% como recompensa máxima de fim de temporada para títulos conquistados e metas superadas.
10. ✅ **Autosave no modo leve otimizado** (concluído): eliminado o engasgo síncrono de ~314 ms que derrubava a taxa de quadros para 19 FPS. Em `src/savePack.ts`, `packPlayers` foi reescrito em passagem única pré-alocada por colunas (+50% de velocidade). Em `src/save.ts` e `src/saveWorker.ts`, a passagem de dados para o Web Worker foi convertida de cópia profunda estruturada do objeto World (`structuredClone`) para serialização de string limpa (`rawJson: JSON.stringify(w)`), reduzindo o tempo de postMessage a quase 0 ms no thread principal. Em `src/ui/actions.ts`, o autosave em segundo plano é suspenso durante a partida ao vivo (`inMatch`) e executado suavemente ao apito final.

## 8. Como validar visualmente
- Rode `npm run dev` e abra no Chromium/Playwright com viewport 412×915, DPR 3.
- Tire screenshots das telas alteradas.
- Para o modo leve, simule com CPU throttling 6× no DevTools.
- O 3D só pode ser julgado de verdade num celular. O ideal é gerar o APK pela release e o usuário testar.

## 9. Histórico recente de Handoff
- **17/10/2026 (Antigravity):**
  - Concluída **Tarefa A** (`a75e906`): reconstrução completa do mapa 3D da sede (`src/ui/hq/`) com PBR, sombras suaves, céu dinâmico (`Dia`/`Tarde`/`Noite`), SSAO + Bloom + SMAA, Rio Tietê com água animada, tráfego e arquitetura fiel do São Paulo FC (Morumbis, CT Barra Funda, CT Cotia e Sede Social).
  - Concluída **Tarefa B** (`f6932b8`): redesign completo UI/UX "Arquibancada Pro" nas 5 abas principais (`Home.tsx`, `Squad.tsx`, `Tactics.tsx`, `Market.tsx`, `Club.tsx`, `components.tsx`, `App.tsx`, `theme.css`), validado com 294 testes verdes e screenshots em 412×915.
  - Concluída **Tarefa C.1** (`febf1f4`): equilíbrio de desarmes no painel ao vivo (`src/engine/match.ts`, `tests/liveDash.test.ts`), evitando placares de desarmes irreais como 31 × 6 em jogos de posse dominante sem alterar o RNG principal das partidas.
  - Concluída **Tarefa C.2** (`f6a6830`): download e recorte em 512px WebP das 9 logos de competições faltantes (`eng1`, `est-RJ`, `est-MG`, `est-PR`, `est-GO`, `est-CE`, `est-PE`, `est-BA`, `est-PA`) em `public/media/comps/`.
- **18/10/2026 (Antigravity):**
  - Concluída **Tarefa C.3** (`db042bb`): cobertura de fotos das Lendas ampliada de 47 para **93 de 105 lendas** em `public/media/players/` com detecção facial YuNet ONNX compatível com OpenCV 5 e Windows, atualizando `src/data/legendMedia.json`, `src/data/media.json` e `public/media/credits.json`.
  - Concluída **Tarefa C.4** (`69ebd48`): foco estrito nos 115 clubes prioritários (Brasileirão Séries A e B, Libertadores e gigantes europeus / Mundial de Clubes). Adicionada flag `--priority` em `scripts/fetch_kits.py`, corrigido `fcntl` no Windows em `scripts/world_http.py`, baixados 855 novos padrões da Wikimedia Commons (total de 1.601 estampas em `public/media/kits/credits.json`), atingindo 100% de cobertura nos 115 clubes prioritários e preservando todos os 460 clubes em `src/data/kits.json`.
  - Concluída **Tarefa C.5** (`4396e18`): download e corte de 11 áudios de torcida reais em formato AAC mono normalizado (-18 LUFS) em `public/media/audio/br/`, ajustada compatibilidade de encoding e Whisper em `scripts/fetch_torcida.py` e catalogados todos os créditos em `public/media/audio/credits.json` e `public/media/credits.json`.
  - Concluídas **Tarefas C.6 a C.10 (Batch Final de Polimento)**:
    - **C.6**: 222/222 escudos oficiais (100% de cobertura nos clubes do jogo, zero ausências) com suporte a `pt.wikipedia.org` em `scripts/fetch_club_media.py`.
    - **C.7**: Calibração exata das médias de gols (França: 2,54; Escócia: 2,52; Libertadores: ~2,55; Sul-Americana: ~2,48; Série A: 2,40) dentro do intervalo 2,4–2,9 em `src/engine/fastsim.ts` e `src/engine/match.ts`.
    - **C.8**: Avaliação e harmonização econômica do valor de mercado das superestrelas com a liquidez orçamentária dos clubes compradores em `src/engine/worldMoney.ts` e `src/engine/player.ts`.
    - **C.9**: Confiança da diretoria livre de travamento em 100 durante sequências vitoriosas através de curva assintótica e teto dinâmico em `src/engine/season.ts`.
    - **C.10**: Otimização do pipeline de salvamento no modo leve (passagem de dados por JSON string e pack colunar pré-alocado em `src/savePack.ts`, `src/save.ts` e `src/saveWorker.ts`, com deferência de salvamento durante a partida em `src/ui/actions.ts`), eliminando travamentos de 19 FPS.
- **27/10/2026 (Antigravity):**
  - **Orientação 100% Horizontal & Immersive Sticky Fullscreen (`android/`, `src/native.ts`):** Ocultação completa e permanente da barra de status (bateria, relógio, notificações) e barra de navegação no Android (`WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`, `layoutInDisplayCutoutMode = SHORT_EDGES`, `android:windowFullscreen="true"` e `SystemBars.hide()`). Bloqueio da escala de fonte do sistema no WebView (`textZoom = 100`).
  - **Ajuste Proporcional FM Widescreen (`src/ui/screens/`, `src/ui/theme.css`):**
    - Perfil do Jogador (`Player.tsx`): Reestruturado de layout vertical de 320px para grid 2 colunas estilo FM (`.k-player-grid`), com card lateral compacto (`.k-fm-card`, foto 76px, OVR 26px, 6 atributos-chave) e coluna principal com abas de radar, atributos técnicos/físicos/mentais, funções ideais, estatísticas e carreira sem rolagem excessiva.
    - Finanças (`Club.tsx`): Banner com 4 KPIs horizontais (`.k-fin-kpis`) e grid de 3 colunas (`Receitas`, `Despesas`, `Previsão/Ingressos`) substituindo listas verticais desproporcionais.
    - Treinos (`Training.tsx`): Grid de 2 colunas (`Foco da Equipe` à esquerda, `Treino Individual & Destaques` à direita).
    - Campeonatos (`Comps.tsx`): Grid de 2 colunas para Tabela de Classificação e Jogos da Rodada lado a lado.
    - Prancheta Tática (`theme.css`): Gramado com altura flexível (`flex: 1`), eliminando os 20px de overflow vertical em telas 800x360.
    - Tela Inicial (`StartScreen.tsx`): Botões compactos de modo de jogo e vitrine oficial do São Paulo FC calibrada para proporções horizontais.
  - **Build Android Release (`LendasDaBase.apk`):** Compilação bem-sucedida do APK release em Gradle 8.14 com Java/Kotlin 17 (`app-release.apk`, 56.58 MB), copiado para a raiz como `LendasDaBase.apk` e `lendas-da-base.apk`.
  - **Redesign Widescreen Completo de Todas as Telas Secundárias (`src/ui/`, `src/ui/screens/`, `src/ui/theme.css`):**
    - `Staff.tsx` (Comissão Técnica): Layout 2 colunas (`.k-staff-grid`) com resumo da folha, média de estrelas e explicativo à esquerda, grade de cargos à direita.
    - `Board.tsx` (Diretoria): Layout 2 colunas (`.k-board-grid`) com status de confiança, objetivos da temporada à esquerda e solicitações de verba à direita.
    - `Dressing.tsx` (Vestiário): Layout 2 colunas (`.k-dressing-grid`) com entrosamento, clima e líderes à esquerda; elenco com minutos, moral e botão de conversa rápida à direita.
    - `Academy.tsx` (Base & Peneira): Layout 2 colunas (`.k-academy-grid`) com instalações de base e vagas à esquerda; grade de 4 colunas de candidatos na peneira (`.pn-grid`) à direita.
    - `Facilities.tsx` (Instalações): Grid 2×2 compacta com banner no topo (`.k-fac-grid`).
    - `Sponsors.tsx` (Patrocínios): Grid 2 colunas (`.k-sponsors-grid`) com espaços Master, Mangas, Costas e Shorts.
    - `TrophyRoom.tsx` (Sala de Troféus): Layout 2 colunas (`.k-trophy-grid`) com estante 3D e troféu selecionado à esquerda; galeria e recordes à direita.
    - `Career.tsx` (Carreira): Layout 2 colunas (`.k-career-grid`) com reputação e títulos à esquerda; histórico e ofertas de outros clubes à direita.
    - `Uniforms.tsx` (Uniformes): Grade 3 colunas (`.k-uniforms-grid`) com kits Home, Away e 3rd Kit lado a lado.
    - `StadiumLook.tsx` (Meu Estádio): Layout 2 colunas (`.k-stadium-grid`) com capacidade e naming rights à esquerda; reformas em grade 2 colunas à direita.
    - `Powers.tsx` (Loja de Poderes): Layout 2 colunas (`.k-powers-grid`) com poderes equipados à esquerda e catálogo 2 colunas à direita.
    - `Club.tsx` (Configurações, Informações do Clube, Histórico de Campeões): Redesenhados em 2 colunas (`.k-settings-grid`, `.k-clubinfo-grid`, `.k-history-grid`).
    - `Match.tsx` (Pré-Jogo): Grid 2 colunas (`.k-prematch-grid`) com hero, coletiva e vestiário à esquerda; prancheta escalada e ações imediatas à direita.
    - `Home.tsx` (Notícias): Feed em grade 2 colunas (`.k-news-grid`).
  - **Auditoria Visual Automatizada (Playwright 800×360):** 16 telas capturadas com sucesso em `audit/` sem overflow vertical ou horizontal.

## 10. Passagem de bastão para o Claude Code (Antigravity, 27/10/2026)

### 📌 Resumo do Estado Atual
- **Branch Ativa:** `claude/ecstatic-tesla-mamls5` (sincronizada com `origin/claude/ecstatic-tesla-mamls5`).
- **Último Commit:** `02a7c16` (*feat: complete FM widescreen mobile redesign across all remaining game screens*).
- **Orientação:** 100% horizontal / paisagem obrigatória (`sensorLandscape` no manifesto Android e `lockOrientation("landscape")` no web).
- **Fullscreen Imersivo:** Barra de status (bateria, relógio, notificações) e barra de navegação ocultadas permanentemente via `WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` em `MainActivity.java` e `styles.xml`.
- **Layouts:** 100% das telas principais e secundárias migradas para grids multi-coluna (2 a 4 colunas) pensadas para viewports móveis de 800×360 a 915×412 px (estilo FM Mobile).
- **Build & APK:** APK release de produção gerado com sucesso pelo Gradle (`BUILD SUCCESSFUL`), disponível na raiz como `LendasDaBase.apk` e `lendas-da-base.apk` (56,58 MB).

### 🛠️ Comandos Chave (Atenção ao Windows PowerShell)
No PowerShell do Windows, os scripts `.ps1` do npm/npx podem ser bloqueados pela política de execução. Utilize as seguintes formas seguras:
- **Checagem de Tipos:** `cmd.exe /c "npm run typecheck"` ou `npx.cmd tsc --noEmit -p .`
- **Testes Unitários:** `npx.cmd vitest run`
- **Build de Produção Web:** `cmd.exe /c "npm run build"`
- **Sincronização com Android:** `cmd.exe /c "npx cap sync android"`
- **Compilação do APK Release:** `cmd.exe /c "cd android && gradlew.bat assembleRelease"`
- **Servidor Local de Teste:** `npx.cmd vite --port 5199 --strictPort --host 127.0.0.1`

### 📱 Estrutura das Telas Reformuladas
- `src/ui/screens/Player.tsx`: Perfil FM em 2 colunas com card lateral compacto e abas técnicas/mentais/físicas.
- `src/ui/screens/Club.tsx`: Finanças (4 KPIs + 3 colunas), Configurações (2 colunas), Clube Info (2 colunas) e Histórico (2 colunas).
- `src/ui/screens/Training.tsx`: Foco da Equipe vs. Treino Individual lado a lado.
- `src/ui/screens/Comps.tsx`: Tabela de Classificação e Rodada lado a lado.
- `src/ui/screens/Staff.tsx`: Resumo da comissão técnica e grade 2 colunas de cargos.
- `src/ui/screens/Board.tsx`: Confiança e objetivos da diretoria vs. solicitações de verba.
- `src/ui/screens/Dressing.tsx`: Clima e entrosamento vs. elenco com moral e conversa rápida.
- `src/ui/screens/Academy.tsx`: Instalações de Cotia vs. peneira em 4 colunas.
- `src/ui/Facilities.tsx`: Grade 2×2 das instalações do clube.
- `src/ui/Sponsors.tsx`: Grade 2 colunas com contratos Master, Mangas, Costas e Calção.
- `src/ui/TrophyRoom.tsx`: Estante 3D à esquerda e galeria/recordes à direita.
- `src/ui/Career.tsx`: Reputação do treinador à esquerda e histórico/ofertas à direita.
- `src/ui/Uniforms.tsx`: Grade 3 colunas com uniformes 1, 2 e 3.
- `src/ui/StadiumLook.tsx`: MorumBIS à esquerda e catálogo de reformas à direita.
- `src/ui/screens/Powers.tsx`: Poderes equipados à esquerda e loja à direita.
- `src/ui/screens/Match.tsx`: Pré-jogo em 2 colunas (hero + coletiva à esquerda, prancheta + botão jogar à direita).
- `src/ui/screens/Home.tsx`: Feed de notícias em 2 colunas.
- `src/ui/theme.css`: Seção 10 contém todas as classes de grid, cards e proporções widescreen.

### 🧪 Como Rodar e Testar Novas Alterações
1. Sempre manter proporções pensadas para telas horizontais (800×360 px / proporção 20:9 e 16:9).
2. Não reintroduzir elementos com alturas fixas excessivas (`> 300px`) que causem overflow desnecessário.
3. Não quebrar o determinismo do motor em `src/engine/` (nunca usar `Math.random` — usar sempre `this.xr` ou `rng.ts`).
4. Ao rodar `git push`, a release `apk-latest` no GitHub Actions é disparada automaticamente.

## 11. Gráficos 2D HD (Sea of Stars / Final Fantasy), Sede 3 Pilares e Menu Iniciar (Antigravity, 27/10/2026)

### 📌 Resumo da Entrega
- **Complexo do Clube em 2D HD (Sea of Stars / RPG 16-32bit):**
  - Removido o mapa 3D procedural pesado de tráfego/cidade (`ProceduralCampus.tsx`), eliminando engasgos de GPU em dispositivos modestos (Galaxy A31/A5, Redmi).
  - Implementado `Hd2dComplex.tsx` com foco estrito nos 3 pilares fundamentais solicitados:
    1. **Estádio Principal** (MorumBIS / Arena do clube com arquibancadas, cobertura, refletores e telão).
    2. **CT Profissional** (Barra Funda: campos de treino tático, academia de musculação, departamento médico e alojamento).
    3. **Categorias de Base** (CFA Cotia: campos de base, alojamento das joias, quadra poliesportiva e refeitório).
  - Cada pilar possui identificação de nível de instalação (`Lv X`), badge visual, ciclo atmosférico dinâmico (Dia ☀️, Tarde 🌅, Noite 🌙) e atalhos rápidos contextuais.
- **Renderizador de Estádios 2D HD (`Hd2dStadium.tsx` & `StadiumLook.tsx`):**
  - Novo componente leve e responsivo que desenha o estádio do clube em projeção isométrica HD-2D, reagindo a cada reforma visual em tempo real:
    - Cores e padrões das arquibancadas (anel duplo, degradê, listras do clube).
    - Tipos de cobertura (anel clássico, marquise moderna, camarotes suspensos, pétalas arquitetônicas).
    - Fachada externa (pilastras romanas, pele de vidro espelhada, concreto aparente).
    - Holofotes volumétricos com iluminação de jogo noturno, placar eletrônico com escudo e capacidade oficial.
- **Menu Iniciar Totalmente Reformulado (`Start.tsx`):**
  - Vitrine de gala destacando o São Paulo FC com miniatura 2D HD do MorumBIS, galeria de títulos mundiais/continentais e brasão oficial.
  - Eliminação de caracteres e glifos legados (`▶`, `＋`).
  - Botões de modos de jogo modernizados com ícones Lucide vetoriais: Carreira Livre (`Sparkles`), Cenários Oficiais (`Target`), Modo Treinador (`Briefcase`) e Carregar Save (`Save`).
- **Substituição de Ícones Antigos (Adequação Visual Completa):**
  - Substituição de emojis e ícones antigos por ícones vetoriais modernos Lucide (`Icon` / `Ic`) em todas as telas:
    - `Club.tsx`: botões da sede, tiles de menu e cabeçalhos.
    - `StadiumLook.tsx`: todas as opções de reforma, setores e naming rights.
    - `Dressing.tsx`: entrosamento, lideranças, moral do vestiário e conversas rápidas.
    - `Board.tsx`: metas da diretoria, pedidos de verba e feedbacks.
    - `Facilities.tsx`: cards de estrutura, obras e evolução.
    - `Sponsors.tsx`: slots master, mangas, calção e contratos.
    - `Academy.tsx`: captação, instalações, peneira e cartas dos garotos.
    - `TrophyRoom.tsx`: estante, galeria de troféus, recordes históricos e linha do tempo.
    - `Staff.tsx`: comissão técnica, cargos e busca de substitutos.
    - `SetPieces.tsx`: batedores de faltas/pênaltis e jogadas de escanteio.
    - `Uniforms.tsx`: uniformes 1, 2 e 3º kit.
    - `Player.tsx`: botões de ação do atleta (comprar, renovar, treinar, promover, emprestar, etc.).
- **Builds e Verificações:**
  - TypeScript: `tsc --noEmit -p .` aprovado com 0 erros.
  - Vitest: 51 suites de teste e 310 testes passaram com sucesso.
  - Vite: Build de produção concluído com sucesso.
  - Android: `npx cap sync android` sincronizado.
  - Gradle: `gradlew assembleRelease` gerou APK de 55,31 MB na raiz (`LendasDaBase.apk` e `lendas-da-base.apk`).







## 12. Integração Completa das Mecânicas do Openfoot Manager (Antigravity, 27/10/2026)

### 1. Contexto e Motivação
A partir da análise das principais mecânicas do repositório Openfoot Manager (`https://github.com/openfootmanager/openfootmanager`), integramos ao *Lendas da Base* quatro pilares essenciais de gerenciamento e motor de jogo:
1. **Match Engine & Narração por Zonas:** Aprofundamento do motor 2D/3D no grid 3x3 do campo (alas esquerda/direita e funil central), com instruções setoriais de foco e combate que afetam a criação de jogadas e narração ambiente viva.
2. **Instruções Táticas Avançadas por Setor:** Controle direto de `focus` (alas, equilibrado, centro) e `tackling` (cauteloso, normal, agressivo) visíveis e configuráveis no menu de táticas.
3. **Boletim Procedural, Notícias & Rumores de Mercado:** Feed dinâmico no inbox com sondagens de clubes europeus por revelações da base, boletins táticos do auxiliar técnico e repercussão de imprensa/torcida, acionado no `dailyTick` via RNG desacoplado (sem afetar determinismo do save).
4. **Central de Mods & Dados Comunitários (JSON Custom DB):** Sistema completo para download de template JSON e importação de clubes e atletas criados pela comunidade, acessível na tela inicial (`Start.tsx`) e nas configurações (`Club.tsx`).

---

### 2. Principais Modificações por Arquivo

#### `src/engine/types.ts` & `src/engine/tactics.ts`
- Adicionados os campos `focus` (`0 = alas`, `1 = equilibrado`, `2 = centro`) e `tackling` (`0 = cauteloso`, `1 = normal`, `2 = agressivo`) à interface `TeamInstr`.
- Registradas metadados e opções na constante `TI_INFO`, permitindo seleção automática na tela de táticas (`Tactics.tsx`).
- Calculados os efeitos em `instructionFx`:
  - `focus === 0`: bônus em jogadas abertas (`open`), xG de finalização por pontas e laterais.
  - `focus === 2`: bônus pelo meio (`mid`), triangulações dos meias.
  - `tackling === 0`: menor risco de cartões (`card: 0.7`), menor desgaste físico, ligeira queda no desarme.
  - `tackling === 2`: bônus defensivo (`def: 1.08`), aumento de cartões (`card: 1.4`) e maior fadiga.
  - Registrado `focusLane` em `TacticFx` para consumo direto pelo motor de jogo.

#### `src/engine/match.ts` & `src/engine/commentary.ts`
- Atualizado `pickOnPitch` em `match.ts` com ponderação dinâmica de posições e jogadores de acordo com o foco setorial selecionado.
- Adicionadas frases de narração específicas em `commentary.ts`:
  - `zoneWing`: jogadas individuais pelas pontas, cruzamentos e infiltrações na linha de fundo.
  - `zoneMid`: triangulações no meio-campo, passes em profundidade e tabelas pelo funil central.
  - `zoneDef`: desarmes precisos ou antecipações agressivas na linha defensiva.
  - `pressMomentum`: momentos de pressão alta abafando a saída de bola do adversário.

#### `src/engine/rumors.ts` & `src/engine/game.ts`
- Criado gerador procedural `proceduralNewsTick(w)` integrado ao loop diário (`dailyTick`).
- **Garantia de Determinismo:** Uso de gerador pseudo-aleatório local independente (`makeRng(hashString(...))`), garantindo que a geração de notícias não consuma chamadas do RNG global (`w.rng`), mantendo determinismo estrito em todas as simulações e testes de temporada.
- Geração de notícias em 3 categorias:
  - Rumores de transferências internacionais (clubes europeus sondando jovens promessas).
  - Boletins de desempenho da comissão técnica analisando o impacto tático em campo.
  - Noticiário da imprensa e engajamento da torcida.

#### `src/engine/modding.ts` & `src/ui/ModdingModal.tsx`
- Implementado parser resiliente de pacotes de dados JSON (`ModPackage`).
- Função `applyModToWorld(w, mod)` para inserção e atualização atômica de clubes (`Club`) e jogadores (`Player`), gerando atributos, atributos ocultos e faces de forma consistente.
- Modal `ModdingModal` com abas para:
  - Instalar / importar arquivos `.json` de mods com pré-visualização de quantidade de clubes e atletas incluídos.
  - Baixar template oficial formatado (`lendas-da-base-mod-template.json`) para criadores de conteúdo da comunidade.
- Integração nas telas:
  - `Start.tsx`: botão com ícone de pergaminho "Central de Mods & Dados (JSON)" no menu principal.
  - `Club.tsx`: card dedicado na aba de configurações.

---

### 3. Testes Automatizados e Validação
- **`tests/modding.test.ts`:**
  - Validação de importação de clubes e atletas de teste.
  - Verificação de atributos e elenco consistente.
  - Exportação de template JSON válido.
- **`tests/tactics_zones.test.ts`:**
  - Verificação do cálculo de multiplicadores táticos de foco e combate em `instructionFx`.
  - Verificação da renderização e geração de frases de comentários por zonas (`zoneWing`, `zoneMid`, `pressMomentum`).
- **`tests/training.test.ts`:**
  - Execução completa do teste de deriva em 3 temporadas (`semente 99`), confirmando aprovação e estabilidade matemática total.

---

### 4. Build de Produção e Compilação Android
- `npx tsc --noEmit -p .`: 0 erros de compilação TypeScript.
- `npm run build`: bundle web minificado e assets otimizados via Vite.
- `npx cap sync android`: ativos copiados para a plataforma nativa.
- `gradlew assembleRelease`: compilação do APK de release concluída com sucesso (`BUILD SUCCESSFUL in 1m 44s`).
- APK gerado: `LendasDaBase.apk` e `lendas-da-base.apk` (55,31 MB) atualizados na raiz do repositório.
