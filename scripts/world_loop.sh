#!/bin/sh
# Roda as etapas do fetch_world.py em blocos retomáveis (para rodar com nohup em segundo plano).
# Uso: nohup sh scripts/world_loop.sh > scripts/cache/world/loop.log 2>&1 &
cd "$(dirname "$0")/.." || exit 1
for i in $(seq 1 40); do
  python3 scripts/fetch_world.py wiki details teams media --max-seconds 1500
  python3 scripts/fetch_world.py photos --max-seconds 900
  if grep -q "COMPLETO" scripts/cache/world/loop.log 2>/dev/null; then break; fi
done
echo LOOP-FIM
