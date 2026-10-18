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
3. **Fotos das Lendas:** são 47 de 105. Rode de novo `python3 scripts/fetch_legend_photos.py`, que retoma de onde parou. **Cuidado:** `fetch_player_photos.py credits` sobrescreve `legendMedia.json`.
4. **Padrões de uniforme:** ainda faltam cerca de 1.200 imagens do Commons. Rode `python3 scripts/fetch_kits.py build style`, depois `python3 scripts/fetch_kits.py --world info download build style`, de novo `python3 scripts/fetch_kits.py style`, e faça commit do `kits.json`.
5. **Áudio de torcida real** (fontes CC já identificadas): rode `scripts/fetch_torcida.py`.
6. **46 escudos de clubes de estadual faltando:** rode `python3 scripts/fetch_club_media.py crests credits`.
7. **Gols:** um pouco altos na França (2,99), na Escócia (3,02), na Libertadores (3,1) e na Sul-Americana (3,0). O alvo é de 2,4 a 2,9 por jogo.
8. **Valores de mercado baixos** em relação ao real (Haaland ≈ €50 mi no jogo, contra ≈ €180 mi): avaliar com cuidado, porque afeta os orçamentos.
9. **Diretoria:** a confiança ainda pode travar em 100 numa sequência longa de vitórias.
10. **Autosave no modo leve:** ainda derruba a partida para uns 19 FPS por um instante (custo de copiar o jogo para o worker).

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
  - Concluída **Tarefa C.2**: download e recorte em 512px WebP das 9 logos de competições faltantes (`eng1`, `est-RJ`, `est-MG`, `est-PR`, `est-GO`, `est-CE`, `est-PE`, `est-BA`, `est-PA`) em `public/media/comps/`.

