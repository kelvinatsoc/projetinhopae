# Instruções para agentes de IA

Antes de qualquer tarefa, leia `docs/HANDOFF.md`. Ele tem o mapa do código, as regras do projeto e a fila de tarefas pendentes em ordem.

Regras essenciais:
- Todo texto do jogo em português do Brasil.
- Faça uma tarefa por vez.
- Antes de cada commit, rode `npx tsc --noEmit -p .` e `npx vitest run`, e só comite com tudo verde.
- O motor é determinístico: não use `Math.random` no motor e não quebre os testes de calibração.
- Não use assets de FIFA, PES, EA ou Konami, não faça scraping do ogol nem do Google Maps e não crie contas em sites.
