# -*- coding: utf-8 -*-
"""
Confere se o build é idempotente: roda build_database.py num arquivo temporário e compara com
src/data/database.json (clubes, jogadores e o campo "pi" dos retratos). Sai com código 1 se diferir.

Uso: python3 scripts/check_idempotent.py
"""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "src", "data", "database.json")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "database.json")
        env = {**os.environ, "DB_OUT": out}
        subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build_database.py")], env=env, check=True,
                       stdout=subprocess.DEVNULL)
        new = json.load(open(out, encoding="utf-8"))
    old = json.load(open(DB, encoding="utf-8"))
    problems = []
    oc, nc = {c["id"]: c for c in old["clubs"]}, {c["id"]: c for c in new["clubs"]}
    for cid in sorted(set(oc) | set(nc)):
        if oc.get(cid) != nc.get(cid):
            problems.append(f"clube {cid}: {oc.get(cid)} != {nc.get(cid)}")
    key = lambda p: (p["c"], p["n"], p["b"])  # noqa: E731
    op, np_ = {key(p): p for p in old["players"]}, {key(p): p for p in new["players"]}
    for k in sorted(set(op) | set(np_)):
        if op.get(k) != np_.get(k):
            problems.append(f"jogador {k}: {op.get(k)} != {np_.get(k)}")
    pi_old = sum(1 for p in old["players"] if p.get("pi"))
    pi_new = sum(1 for p in new["players"] if p.get("pi"))
    print(f"clubes {len(oc)}/{len(nc)}, jogadores {len(op)}/{len(np_)}, com retrato (pi) {pi_old}/{pi_new}")
    for line in problems[:20]:
        print("  " + line[:300])
    if problems:
        print(f"NÃO idempotente: {len(problems)} diferenças")
        sys.exit(1)
    print("ok: build idempotente")


if __name__ == "__main__":
    main()
