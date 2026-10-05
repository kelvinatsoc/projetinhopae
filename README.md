# ⚽ Lendas da Base

Manager de futebol **casual, feito para o celular**, inspirado no Football Manager, mas enxuto e 100% brasileiro:

- **Elencos reais de 2026**: Séries A, B e C do Brasileirão e 78 clubes sul-americanos. São 156 clubes e cerca de 4.700 jogadores, com nome, posição, idade e nacionalidade.
- **Campeonatos oficiais**: Brasileirão Série A, B (com o novo playoff de acesso) e C, Copa do Brasil, Libertadores e Sul-Americana, com acesso, rebaixamento e vagas continentais.
- **Lendas renascendo na base** ⭐: Pelé, Maradona, Ronaldo, Zico, Garrincha, Ronaldinho, Zidane, Cruyff e mais de 100 ídolos aparecem aos poucos como garotos de 15–16 anos. Normalmente surgem no clube onde foram revelados ou viraram ídolos, e às vezes no **seu** clube. Tem até um álbum para colecionar.
- **Partida ao vivo** com narração em português, som de torcida, substituições e mudança de mentalidade. Também dá para ir direto ao "resultado rápido".
- **Gestão simplificada**: escalação e tática (9 formações), mercado de transferências, contratos, finanças, categorias de base, evolução, aposentadoria e novos talentos (regens) a cada ano.
- **Rostos gerados** que envelhecem: barba, rugas, cabelo branco. Os **escudos** são gerados com as cores oficiais de cada clube. Você pode trocar por **fotos, escudos e áudio da torcida seus**.
- **PWA**: dá para instalar na tela inicial do celular e jogar **offline**. O jogo é salvo automaticamente no próprio aparelho.

## Como jogar no celular

1. Publique o jogo (veja "Publicar no GitHub Pages" abaixo) ou rode localmente com `npm run dev`. O comando mostra um endereço `http://192.168.x.x:5173` que abre no celular conectado ao mesmo Wi-Fi.
2. Abra o endereço no navegador do celular:
   - **Android (Chrome)**: menu ⋮ › *Adicionar à tela inicial*.
   - **iPhone (Safari)**: botão compartilhar › *Adicionar à Tela de Início*.
3. Pronto: o jogo abre em tela cheia e funciona sem internet.

## Rodar no computador

Requer [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm run dev        # servidor de desenvolvimento (com --host, acessível pelo celular)
npm test           # simula temporadas inteiras e confere o motor do jogo
npm run build      # gera a versão final em dist/
```

## Publicar no GitHub Pages

1. No GitHub, abra **Settings › Pages** e, em *Build and deployment › Source*, escolha **GitHub Actions**.
2. Faça merge na branch `main`. O workflow `.github/workflows/deploy.yml` testa, compila e publica sozinho.
3. O jogo fica em `https://<seu-usuario>.github.io/projetinhopae/`.

## Atualizar os elencos

Os elencos vêm da Wikipedia e do Wikidata. Para baixar a versão mais recente (demora alguns minutos por causa do limite de requisições):

```bash
pip install requests
python3 scripts/fetch_squads.py         # elencos + datas de nascimento (Wikipedia/Wikidata)
python3 scripts/fetch_pt_positions.py   # posições detalhadas (Wikipedia em português)
python3 scripts/build_database.py       # gera src/data/database.json
```

- Clubes, divisões, cores, força e reputação ficam em `scripts/clubs_catalog.py`. É ali que você troca os times de uma divisão ou adiciona clubes.
- Não existe base pública e aberta com as notas do FIFA/EA FC, porque esses dados são proprietários. Por isso o **overall é estimado** pela força do clube, pela fama do jogador (em quantos idiomas ele tem artigo na Wikipedia) e pela idade. Para corrigir alguém:
  - no jogo: perfil do jogador › **✏️ Editar jogador** (nome, overall, potencial e posição);
  - nos dados: dicionários `OVERRIDES` (notas) e `POS_OVERRIDES` (posições) em `scripts/build_database.py`.

## Fotos, escudos, uniformes e cantos das torcidas

Fotos de jogadores, escudos oficiais, uniformes e gravações de torcidas têm direitos autorais ou são marcas registradas. Por isso **não vêm no repositório**. No lugar deles:

- **rostos** gerados com a biblioteca [facesjs](https://github.com/zengm-games/facesjs) (Apache-2.0). Cada jogador tem um rosto único que envelhece e veste as cores do clube;
- **escudos** desenhados pelo jogo com as cores e o padrão de cada clube (listras, faixa, estrela…);
- **sons** sintetizados: ambiente de torcida, apito, explosão no gol e "uhhh".

Para uso pessoal, você pode colocar os seus:

- **foto do jogador**: perfil › 📷 *Trocar foto* (do celular ou por link);
- **escudo e cores**: Clube › Configurações › *Trocar escudo* / *Cores do clube*;
- **canto/hino nos gols**: Clube › Configurações › *Áudio do gol*.

Tudo isso fica salvo só no seu aparelho.

## Como o código está organizado

```
scripts/            coleta e preparação dos dados reais (Python)
src/data/           banco de dados gerado, lendas e nomes para novos talentos
src/engine/         regras do jogo, sem interface (dá para testar no Node)
  world.ts          cria um novo jogo a partir do banco de dados
  game.ts           laço principal: avançar dias, aplicar resultados
  match.ts          motor de partida minuto a minuto (+ commentary.ts)
  competitions.ts   tabelas, mata-matas, sorteios e fases
  season.ts         fim de temporada: acesso, rebaixamento, vagas, aposentadorias
  youth.ts          base, regens e lendas renascidas
  transfers.ts      mercado, propostas e IA dos clubes
  finance.ts        TV, patrocínio, bilheteria, premiações e salários
src/ui/             interface React (telas em src/ui/screens)
src/save.ts         salvar/carregar no IndexedDB do navegador
tests/              simulações de temporadas completas (Vitest)
```

Para mexer no equilíbrio das partidas, use `TUNING` em `src/engine/match.ts`. Com os valores atuais, a média é de ~2,4 gols, ~25 finalizações e ~47% de vitórias do mandante.

## Próximos passos (ideias)

- Campeonatos estaduais (Paulistão, Carioca, Mineiro, Gaúcho…) no começo do ano
- Empréstimos e cláusulas de contrato
- Treinos com foco individual e "olheiros" para revelar o potencial
- Copa do Mundo de Clubes e convocações para a Seleção
- Fotos "realistas" geradas por IA para os regens (precisaria de uma API de imagens com chave própria)
- Editor completo de clubes e importação de pacotes de fotos

## Créditos

- Elencos: [Wikipedia](https://www.wikipedia.org/) (CC BY-SA) e [Wikidata](https://www.wikidata.org/) (CC0), coletados em outubro de 2026
- Rostos: [facesjs](https://github.com/zengm-games/facesjs) (Apache-2.0)
- Projeto pessoal e sem fins lucrativos. Nomes de clubes, competições e jogadores pertencem aos respectivos donos.
