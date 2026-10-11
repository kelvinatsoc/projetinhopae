"""Fotos reais dos troféus (Wikimedia Commons), recortadas do fundo.

1) baixa a miniatura de 960 px de cada arquivo (Special:FilePath, 1 req/4 s, espera em 429);
2) recorta o troféu do fundo com GrabCut (OpenCV) a partir de um retângulo inicial;
3) salva public/media/trophies/<id>.webp (até 512 px de altura, com transparência) e
   atualiza src/data/trophyPhotos.json e os créditos.

Sem foto aceitável, o jogo usa o modelo 3D procedural (src/ui/trophy3d.ts).

Uso: python3 scripts/fetch_trophies.py [download|cut] [ids...]
"""
from __future__ import annotations

import io
import json
import os
import sys

os.environ.setdefault("WM_INTERVAL", "4")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "trophies")
OUT = os.path.join(ROOT, "public", "media", "trophies")
INDEX = os.path.join(ROOT, "src", "data", "trophyPhotos.json")
CREDITS = os.path.join(ROOT, "public", "media", "credits.json")

# id -> (arquivo no Commons, retângulo inicial do recorte em frações (x0, y0, x1, y1))
FILES: dict[str, tuple[str, tuple[float, float, float, float]]] = {
    "wc": ("FIFA World Cup Trophy (Ank Kumar, Infosys Limited) 01.jpg", (0.2, 0.03, 0.8, 0.98)),
    "ucl": ("UEFA Champions League Trophy - cropped.JPG", (0.04, 0.02, 0.96, 0.98)),
    "uel": ("Europa league trophy.jpg", (0.15, 0.03, 0.85, 0.98)),
    "uecl": ("UEFA Europa Conference League Trophy.jpg", (0.2, 0.03, 0.8, 0.98)),
    "liberta": ("TaçaLibertadores2024.jpg", (0.15, 0.03, 0.85, 0.98)),
    "copaBR": ("Trofeu Copa do Brasil 2007.jpg", (0.15, 0.03, 0.85, 0.98)),
    "euro": ("UEFA Euro 2020 Trophy (cropped).jpg", (0.1, 0.02, 0.9, 0.98)),
    "ca": ("Copa america trofeo.jpg", (0.15, 0.03, 0.85, 0.98)),
    "eng1": ("Premier League Trophy at Manchester's National Football Museum (Ank Kumar) 01.jpg", (0.15, 0.03, 0.85, 0.98)),
    "ger1": ("Frankfurter Buchmesse 2015 - Meisterschale (cropped).JPG", (0.04, 0.04, 0.96, 0.96)),
    "esp1": ("Trofeo de La Liga 9900.jpg", (0.15, 0.03, 0.85, 0.98)),
    "ita1": ("Coppa Campioni d'Italia (Serie A).png", (0.02, 0.02, 0.98, 0.98)),
}


def download(ids: list[str]) -> None:
    import wm
    os.makedirs(RAW, exist_ok=True)
    for cid in ids:
        name, _ = FILES[cid]
        dst = os.path.join(RAW, f"{cid}.img")
        if os.path.exists(dst):
            continue
        data = wm.download(name, 960) or wm.download(name)
        if not data:
            print(f"{cid}: falhou {name}", flush=True)
            continue
        with open(dst, "wb") as f:
            f.write(data)
        print(f"{cid}: ok {name}", flush=True)


def cut(ids: list[str]) -> None:
    import cv2
    import numpy as np
    from PIL import Image

    os.makedirs(OUT, exist_ok=True)
    try:
        index = set(json.load(open(INDEX)))
    except (OSError, ValueError):
        index = set()
    try:
        credits = json.load(open(CREDITS))
    except (OSError, ValueError):
        credits = {}
    for cid in ids:
        src = os.path.join(RAW, f"{cid}.img")
        if not os.path.exists(src):
            continue
        name, (x0, y0, x1, y1) = FILES[cid]
        im = Image.open(src)
        if im.mode in ("RGBA", "LA", "P") and "A" in im.convert("RGBA").getbands() and \
                np.asarray(im.convert("RGBA"))[..., 3].min() < 10:
            rgba = im.convert("RGBA")  # já vem recortada
        else:
            rgb = np.asarray(im.convert("RGB"))[:, :, ::-1].copy()
            h, w = rgb.shape[:2]
            mask = np.zeros((h, w), np.uint8)
            rect = (int(x0 * w), int(y0 * h), int((x1 - x0) * w), int((y1 - y0) * h))
            bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
            cv2.grabCut(rgb, mask, rect, bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
            alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
            # fica só o maior pedaço conectado (o troféu) e suaviza a borda
            n, lab, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
            if n > 1:
                big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
                alpha = np.where(lab == big, 255, 0).astype(np.uint8)
            alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
            alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
            rgba = Image.fromarray(np.dstack([rgb[:, :, ::-1], alpha]), "RGBA")
        bbox = rgba.getchannel("A").getbbox()
        if bbox:
            rgba = rgba.crop(bbox)
        rgba.thumbnail((512, 512), Image.LANCZOS)
        side = max(rgba.size)
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.paste(rgba, ((side - rgba.width) // 2, side - rgba.height))
        sq.save(os.path.join(OUT, f"{cid}.webp"), "WEBP", quality=90, method=6)
        index.add(cid)
        credits[f"trophies/{cid}.webp"] = {"file": name, "author": "Wikimedia Commons (ver página do arquivo)",
                                           "license": "ver página do arquivo",
                                           "url": "https://commons.wikimedia.org/wiki/File:" + name.replace(" ", "_")}
        print(f"{cid}: recortado", flush=True)
    json.dump(sorted(index), open(INDEX, "w"), indent=1)
    with open(CREDITS, "w") as f:
        json.dump(credits, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "download"
    ids = sys.argv[2:] or list(FILES)
    (download if cmd == "download" else cut)(ids)
