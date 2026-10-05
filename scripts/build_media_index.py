# -*- coding: utf-8 -*-
"""
Junta os índices da mídia empacotada em public/media/.

Entradas (as que existirem):
  scripts/cache/credits_*.json        créditos gerados pelos scripts de coleta (escudos, estádios,
                                      logos, fotos de jogadores...)
  public/media/audio/credits.json     créditos dos sons (fetch_audio.py)
  public/media/kits/credits.json      créditos dos uniformes (fetch_kits.py)
  src/data/legendMedia.json           fotos das lendas (fetch_player_photos.py)

Saídas:
  public/media/credits.json   {"<caminho em public/media>": {file, author, license, url}}, ordenado e
                              compacto; só entram arquivos que existem de fato
  src/data/media.json         {"comps": {"serieA": true, ...}, "legends": {...}}

Idempotente: pode rodar quantas vezes quiser (rode por último, depois das coletas).
    python3 scripts/build_media_index.py
"""
from __future__ import annotations

import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache")
MEDIA = os.path.join(ROOT, "public", "media")
OUT_CREDITS = os.path.join(MEDIA, "credits.json")
OUT_MEDIA = os.path.join(ROOT, "src", "data", "media.json")
LEGENDS = os.path.join(ROOT, "src", "data", "legendMedia.json")
FIELDS = ("file", "author", "license", "url")


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as ex:
        print(f"  ignorado {os.path.relpath(path, ROOT)}: {ex}")
        return None


def write_if_changed(path, text):
    old = None
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            old = f.read()
    if old == text:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)
    return True


def main():
    sources = sorted(glob.glob(os.path.join(CACHE, "credits_*.json")))
    for sub in ("audio", "kits"):
        p = os.path.join(MEDIA, sub, "credits.json")
        if os.path.exists(p):
            sources.append(p)
    credits, missing = {}, 0
    for src in sources:
        data = load(src) or {}
        sub = os.path.basename(os.path.dirname(src)) if src.startswith(MEDIA) else None
        n = 0
        for path, c in data.items():
            if not isinstance(c, dict):
                continue
            path = path.lstrip("/")
            if sub and not path.startswith(sub + "/"):
                path = f"{sub}/{path}"
            if not os.path.exists(os.path.join(MEDIA, path)):
                missing += 1
                continue
            credits[path] = {k: str(c.get(k) or "") for k in FIELDS}
            n += 1
        print(f"  {os.path.relpath(src, ROOT)}: {n} arquivos")
    text = json.dumps(dict(sorted(credits.items())), ensure_ascii=False, separators=(",", ":"))
    changed = write_if_changed(OUT_CREDITS, text)
    print(f"credits.json: {len(credits)} arquivos ({missing} sem arquivo, ignorados)"
          f"{'' if changed else ' — sem mudanças'}")

    comps = {os.path.basename(f)[:-5]: True for f in sorted(glob.glob(os.path.join(MEDIA, "comps", "*.webp")))}
    legends = (load(LEGENDS) or {}) if os.path.exists(LEGENDS) else {}
    media = {"comps": comps, "legends": legends}
    changed = write_if_changed(OUT_MEDIA, json.dumps(media, ensure_ascii=False, separators=(",", ":")))
    print(f"media.json: {len(comps)} logos de competições, {len(legends)} lendas"
          f"{'' if changed else ' — sem mudanças'}")


if __name__ == "__main__":
    main()
