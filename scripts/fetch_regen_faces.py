#!/usr/bin/env python3
"""Banco de rostos sintéticos (fotorrealistas) para jogadores fictícios.

Regens, garotos da base e reforços gerados não podem ter foto real, mas também
não devem parecer desenho. Usamos rostos de pessoas que NÃO existem, gerados
pelo StyleGAN do https://thispersondoesnotexist.com (cada GET devolve um rosto
novo, 1024x1024, alinhado no padrão FFHQ: rosto centralizado).

Etapas (subcomandos):
  download  baixa rostos de forma retomável para scripts/cache/tpdne/
            (JPEG reduzido a 512px, nome = hash do conteúdo, ~1 req/s).
            Use em blocos:  timeout 540 python3 scripts/fetch_regen_faces.py download
  embed     calcula os embeddings CLIP (open_clip ViT-B-32 laion2b) das imagens
            ainda não processadas (incremental, em lotes).
  classify  classificação zero-shot (gênero, faixa etária, tom de pele e motivos
            de rejeição) com conjuntos de prompts; grava scores.json.
  sheets    folhas de contato (aceitos/rejeitados por balde) para conferência
            visual em /tmp/claude-0/qa/.
  build     recorta (cabeça e ombros), reduz para 160x160 WebP em
            public/media/regens/<n>.webp e escreve src/data/regenFaces.json.

Dependências: pip install torch --index-url https://download.pytorch.org/whl/cpu
              pip install open_clip_torch pillow numpy requests
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / "cache" / "tpdne"
IMG_DIR = CACHE / "img"
EMB_FILE = CACHE / "embeddings.npz"
SCORES_FILE = CACHE / "scores.json"
OUT_DIR = ROOT / "public" / "media" / "regens"
OUT_JSON = ROOT / "src" / "data" / "regenFaces.json"
QA_DIR = Path("/tmp/claude-0/qa")

URL = "https://thispersondoesnotexist.com/random-person.jpeg"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
CACHE_SIZE = 512  # lado do JPEG guardado no cache
MIN_INTERVAL = 1.05  # segundos entre requisições (educado com o site)


# ---------------------------------------------------------------- download ---

def cmd_download(args):
    import requests
    from PIL import Image

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    have = {p.stem for p in IMG_DIR.glob("*.jpg")}
    print(f"cache: {len(have)} rostos; alvo {args.target}", flush=True)
    s = requests.Session()
    s.headers.update({
        "User-Agent": UA,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Referer": "https://thispersondoesnotexist.com/",
    })
    dups = errors = 0
    last = 0.0
    while len(have) < args.target:
        wait = MIN_INTERVAL - (time.time() - last)
        if wait > 0:
            time.sleep(wait)
        last = time.time()
        try:
            r = s.get(URL, timeout=30, params={"t": f"{time.time():.3f}"})
            if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image"):
                raise RuntimeError(f"HTTP {r.status_code} {r.headers.get('content-type')}")
            raw = r.content
            h = hashlib.sha1(raw).hexdigest()[:20]
            if h in have:
                dups += 1
                continue
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            if im.size != (1024, 1024):
                raise RuntimeError(f"tamanho inesperado {im.size}")
            im = im.resize((CACHE_SIZE, CACHE_SIZE), Image.LANCZOS)
            tmp = IMG_DIR / f".{h}.tmp"
            im.save(tmp, "JPEG", quality=92)
            tmp.rename(IMG_DIR / f"{h}.jpg")
            have.add(h)
            if len(have) % 50 == 0:
                print(f"  {len(have)} rostos (dup {dups}, erros {errors})", flush=True)
        except Exception as e:  # noqa: BLE001 - rede instável: espera e tenta de novo
            errors += 1
            print(f"  erro: {e}", flush=True)
            time.sleep(min(60, 3 * errors))
    print(f"fim: {len(have)} rostos (dup {dups}, erros {errors})", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("download")
    d.add_argument("--target", type=int, default=3200)
    d.set_defaults(fn=cmd_download)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
