# -*- coding: utf-8 -*-
"""
Fontes dos elencos dos clubes reais dos estaduais (scripts/estadual_catalog.py).

1. real-squads.json do projeto Arquibancada (elencos 2026 do oGol, do dono do jogo): copia só os
   clubes do catálogo para scripts/data/estaduais_src/real-squads.json (cópia versionada).
   Também converte os retratos desses jogadores (public/media/players/o<id>.webp, 160 px; o dono do
   jogo autorizou importar as fotos do Arquibancada).
2. Para os demais, a predefinição "Elenco" do artigo na Wikipedia em português
   (index.php?action=raw, 1 requisição a cada 4 s) -> scripts/data/estaduais_src/pt_elencos.json.
   Clubes sem elenco suficiente (< 16) ficam de fora e o jogo gera o elenco com semente fixa.

Uso: python3 scripts/fetch_estadual_squads.py [pasta_do_arquibancada]
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402
from estadual_catalog import ESTADUAL_CLUBS  # noqa: E402
from fetch_pt_positions import GENERIC, parse_elenco  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scripts", "data", "estaduais_src")
ARQ = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/arq/arquibancada"
PT_RAW = "https://pt.wikipedia.org/w/index.php"
RAW_CACHE = os.path.join(ROOT, "scripts", "cache", "pt_estaduais")
MIN_PLAYERS = 16


def raw(title):
    path = os.path.join(RAW_CACHE, re.sub(r"[^\w\-]+", "_", title) + ".txt")
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    text = ""
    for _ in range(3):  # segue redirecionamentos
        time.sleep(4)
        r = wm.get(PT_RAW, {"title": title, "action": "raw"})
        text = r.text if r is not None and r.status_code == 200 else ""
        m = re.match(r"\s*#(?:REDIRECT|REDIRECIONAMENTO)\s*\[\[([^\]|#]+)", text, re.I)
        if not m:
            break
        title = m.group(1).strip()
    os.makedirs(RAW_CACHE, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def main():
    os.makedirs(SRC, exist_ok=True)
    src = os.path.join(ARQ, "lib", "real-squads.json")
    out_rs = os.path.join(SRC, "real-squads.json")
    if os.path.exists(src):
        rs = json.load(open(src, encoding="utf-8"))
        keep = {c["rs"]: rs[c["rs"]] for c in ESTADUAL_CLUBS if c.get("rs")}
        with open(out_rs, "w", encoding="utf-8") as f:
            json.dump(keep, f, ensure_ascii=False, indent=0)
        print(f"real-squads: {len(keep)} clubes -> {out_rs}")
        # retratos (catálogo oGol do Arquibancada) -> public/media/players/o<id>.webp, 160 px
        from import_portraits import convert
        media_dir = os.path.join(ROOT, "public", "media", "players")
        n = 0
        for club in keep.values():
            for pl in club["players"]:
                srcp = os.path.join(ARQ, "public", (pl.get("photo") or "").lstrip("/"))
                dst = os.path.join(media_dir, "o" + str(pl["id"]).lstrip("-") + ".webp")
                if pl.get("photo") and os.path.exists(srcp) and not os.path.exists(dst):
                    convert(srcp, dst, False)
                    n += 1
        print(f"retratos novos: {n}")
    media = json.load(open(os.path.join(ROOT, "scripts", "cache", "club_media.json"), encoding="utf-8"))["clubs"]
    out = {}
    for c in ESTADUAL_CLUBS:
        if c.get("rs"):
            continue
        title = media.get(c["id"], {}).get("ptTitle") or c["pt"]
        text = raw(title)
        squad = parse_elenco(text)
        if not squad:
            for m in re.finditer(r"\{\{\s*(?:Predefinição:)?(Elenco[^}|\n]+)", text):
                name = m.group(1).strip()
                if name.lower() in GENERIC:
                    continue
                squad = parse_elenco(raw("Predefinição:" + name))
                if squad:
                    break
        print(f"{c['id']:<18} {len(squad):>2} jogadores ({title})")
        if len(squad) >= MIN_PLAYERS:
            out[c["id"]] = squad
    with open(os.path.join(SRC, "pt_elencos.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"pt_elencos: {len(out)} clubes")


if __name__ == "__main__":
    main()
