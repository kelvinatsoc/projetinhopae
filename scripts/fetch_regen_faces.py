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
  sweep     folha ordenada por um score (ex.: "sweep glasses --lo .2 --hi .6
            --male") para escolher limiares.
  build     recorta (rosto inteiro, para o avatar redondo), reduz para 160x160
            WebP em public/media/regens/<n>.webp e escreve src/data/regenFaces.json.

Fluxo completo:
  timeout 540 python3 scripts/fetch_regen_faces.py download   (repetir)
  python3 scripts/fetch_regen_faces.py embed && ... classify && ... sheets && ... build

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


# ------------------------------------------------------------------- CLIP ---

CLIP_ARCH, CLIP_TAG = "ViT-B-32", "laion2b_s34b_b79k"


def load_clip():
    import open_clip
    import torch

    torch.set_num_threads(2)  # a máquina é dividida com outros processos
    model, _, preprocess = open_clip.create_model_and_transforms(CLIP_ARCH, pretrained=CLIP_TAG)
    model.eval()
    return model, preprocess, open_clip.get_tokenizer(CLIP_ARCH)


def load_embeddings():
    import numpy as np

    if not EMB_FILE.exists():
        return [], np.zeros((0, 512), dtype=np.float32)
    z = np.load(EMB_FILE)
    return list(z["names"]), z["feats"].astype(np.float32)


def cmd_embed(args):
    import numpy as np
    import torch
    from PIL import Image

    names, feats = load_embeddings()
    done = set(names)
    todo = sorted(p.stem for p in IMG_DIR.glob("*.jpg") if p.stem not in done)
    print(f"embeddings: {len(names)} prontos, {len(todo)} novos", flush=True)
    if not todo:
        return
    model, preprocess, _ = load_clip()
    new_feats = []
    t0 = time.time()
    for i in range(0, len(todo), args.batch):
        chunk = todo[i:i + args.batch]
        x = torch.stack([preprocess(Image.open(IMG_DIR / f"{h}.jpg").convert("RGB")) for h in chunk])
        with torch.no_grad():
            f = model.encode_image(x)
            f = f / f.norm(dim=-1, keepdim=True)
        new_feats.append(f.numpy().astype(np.float32))
        n = i + len(chunk)
        if (i // args.batch) % 5 == 0 or n == len(todo):
            print(f"  {n}/{len(todo)} ({n / (time.time() - t0):.1f} img/s)", flush=True)
    names += todo
    feats = np.concatenate([feats] + new_feats)
    tmp = EMB_FILE.with_suffix(".tmp.npz")
    np.savez(tmp, names=np.array(names), feats=feats.astype(np.float16))
    tmp.rename(EMB_FILE)
    print(f"ok: {len(names)} embeddings", flush=True)


# ------------------------------------------------------- classificação -------
# Cada classe é a média dos embeddings de vários prompts (ensemble), aplicada
# a vários modelos de frase. Os limiares abaixo foram calibrados olhando as
# folhas de contato (aceitos x rejeitados).

TEMPLATES = [
    "a photo of {}.",
    "a close-up portrait photo of {}.",
    "a headshot of {}.",
    "a photo of the face of {}.",
]

GENDER = {
    "male": ["a man", "a boy", "a young man", "a guy", "a teenage boy"],
    "female": ["a woman", "a girl", "a young woman", "a lady", "a teenage girl"],
}

# segunda opinião, focada em rostos andróginos (meninas de cabelo curto etc.)
GENDER2 = {
    "male": ["a man with short hair", "a boy with short hair", "a teenage boy with short hair",
             "a young man with a masculine face"],
    "female": ["a woman with short hair", "a girl with short hair", "a teenage girl with short hair",
               "a tomboy girl", "a young woman with a pixie haircut"],
}

# centro (anos) de cada faixa, para a idade esperada
AGE_CENTER = {"child": 8, "teen": 16, "twenties": 24, "thirties": 34, "middle": 48, "old": 68}
AGE = {
    "child": ["a child", "a little boy", "a young kid under ten years old", "a toddler"],
    "teen": ["a teenage boy", "a teenager", "a 16 year old boy", "an adolescent boy", "a high school boy"],
    "twenties": ["a man in his twenties", "a young adult man", "a 24 year old man", "a college student"],
    "thirties": ["a man in his thirties", "a 35 year old man", "an adult man in his early thirties"],
    "middle": ["a middle-aged man", "a man in his forties", "a man in his fifties", "a 50 year old man"],
    "old": ["an old man", "an elderly man", "a senior man with gray hair", "a grandfather", "a 70 year old man"],
}

SKIN = {
    "light": ["a white man", "a caucasian man", "a man with fair skin", "a european man", "a man with pale skin"],
    "medium": ["a latino man", "a hispanic man", "a mixed-race man with light brown skin",
               "a middle eastern man", "a man with olive skin"],
    "dark": ["a black man", "an african man", "a man with dark brown skin", "an african american man",
             "an afro-brazilian man", "a black man with very dark skin"],
    "asian": ["an east asian man", "a chinese man", "a japanese man", "a korean man"],
}

# motivos de rejeição: (prompts positivos, prompts neutros) -> P(positivo)
NEUTRAL = ["a person", "a person's face", "a portrait of a person"]
REJECTS = {
    "glasses": (["a person wearing glasses", "a person wearing eyeglasses", "a person wearing sunglasses",
                 "a person with spectacles"], NEUTRAL),
    "hat": (["a person wearing a hat", "a person wearing a baseball cap", "a person wearing a hood",
             "a person wearing a beanie", "a person wearing a headscarf", "a person wearing a headband"], NEUTRAL),
    "multi": (["two people", "a photo of two people side by side", "a group of people",
               "a person with another face next to them"], ["a single person", "a portrait of one person"]),
    "makeup": (["a person wearing heavy makeup", "a person wearing lipstick and eye makeup",
                "a person with eyeliner and mascara"], NEUTRAL),
    "artifact": (["a distorted, deformed face", "a glitchy image with strange artifacts",
                  "a blurry, corrupted, melted face", "a face with a weird deformation"],
                 ["a clear, high quality photo of a face", "a sharp portrait photo"]),
    "tilt": (["a head tilted to the side", "a face in profile", "a person looking sideways",
              "a person looking away from the camera"], ["a frontal face looking at the camera",
                                                         "a person looking straight at the camera"]),
    "notphoto": (["a painting", "a drawing", "a cartoon", "a 3D render", "a doll"],
                 ["a photograph", "a real photo of a person"]),
    "occluded": (["a person covering their face with a hand", "a person holding a microphone",
                  "a person wearing headphones", "a person with something in front of their face",
                  "a person resting their chin on their hand", "a person with a hand touching their face"],
                 NEUTRAL),
}


def class_matrix(model, tok, groups: dict):
    """Embeddings normalizados (uma linha por classe) a partir do ensemble de prompts."""
    import torch

    rows = []
    for phrases in groups.values():
        texts = [t.format(p) for p in phrases for t in TEMPLATES]
        with torch.no_grad():
            e = model.encode_text(tok(texts)).detach()
        e = e / e.norm(dim=-1, keepdim=True)
        m = e.mean(0)
        rows.append(m / m.norm())
    return torch.stack(rows).numpy()


def softmax(x, axis=-1):
    import numpy as np

    x = x - x.max(axis=axis, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=axis, keepdims=True)


# Tom de pele medido nos pixels (complementa o CLIP, que confunde negros com
# pardos): ITA (individual typology angle) = atan((L* - 50) / b*) no espaço
# CIELAB, em amostras das bochechas e do dorso do nariz (posições FFHQ).
TONE_FILE = CACHE / "tone.json"
TONE_PATCHES = [(388, 620), (636, 620), (512, 560)]  # centros na escala 1024
TONE_HALF = 22  # meia-largura do recorte (escala 1024)


def srgb_to_lab(rgb):
    import numpy as np

    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return L, a, b


def skin_tone(h):
    import math

    import numpy as np
    from PIL import Image

    im = Image.open(IMG_DIR / f"{h}.jpg").convert("RGB")
    k = im.size[0] / 1024
    px = []
    for cx, cy in TONE_PATCHES:
        box = tuple(round(v * k) for v in (cx - TONE_HALF, cy - TONE_HALF, cx + TONE_HALF, cy + TONE_HALF))
        px.append(np.asarray(im.crop(box), dtype=np.float64).reshape(-1, 3))
    L, _, b = srgb_to_lab(np.concatenate(px))
    Lm, bm = float(np.median(L)), float(np.median(b))
    return {"L": round(Lm, 1), "ita": round(math.degrees(math.atan2(Lm - 50, max(bm, 1e-3))), 1)}


def cmd_classify(args):
    import numpy as np

    names, feats = load_embeddings()
    tone = json.loads(TONE_FILE.read_text()) if TONE_FILE.exists() else {}
    for h in names:
        if h not in tone:
            tone[h] = skin_tone(h)
    TONE_FILE.write_text(json.dumps(tone))
    model, _, tok = load_clip()
    scale = float(model.logit_scale.exp().item())
    out = {}

    def probs(groups):
        return softmax(scale * feats @ class_matrix(model, tok, groups).T)

    g = probs(GENDER)
    g2 = probs(GENDER2)
    a = probs(AGE)
    s = probs(SKIN)
    rej = {k: probs({"pos": pos, "neg": neg})[:, 0] for k, (pos, neg) in REJECTS.items()}
    centers = np.array([AGE_CENTER[k] for k in AGE])
    for i, h in enumerate(names):
        out[h] = {
            "male": round(float(g[i, 0]), 4),
            "male2": round(float(g2[i, 0]), 4),
            "age": {k: round(float(a[i, j]), 4) for j, k in enumerate(AGE)},
            "ageY": round(float(a[i] @ centers), 1),
            "skin": {k: round(float(s[i, j]), 4) for j, k in enumerate(SKIN)},
            "rej": {k: round(float(v[i]), 4) for k, v in rej.items()},
            **tone[h],
        }
    SCORES_FILE.write_text(json.dumps(out))
    print(f"ok: {len(out)} rostos classificados", flush=True)


# ----------------------------------------------------------------- seleção ---

MIN_MALE, MIN_MALE2 = 0.97, 0.93
MIN_MALE_LOGIT = 8.0  # logit(male) + logit(male2): corta os andróginos da faixa limítrofe
REJ_MAX = {"glasses": 0.25, "hat": 0.6, "multi": 0.3, "makeup": 0.5, "artifact": 0.5,
           "tilt": 0.4, "notphoto": 0.5, "occluded": 0.5}
MAX_CHILD = 0.25
MAX_OLD = 0.25  # P(middle) + P(old)
AGE_MIN, AGE_MAX = 14.0, 38.0
MIN_SKIN = 0.5
SKIN_ORDER = ["light", "medium", "dark", "asian"]
AGE_ORDER = ["teen", "young", "adult"]
TEEN_BELOW, ADULT_FROM = 22.0, 28.0  # limites na idade esperada do CLIP


def age_bucket(sc) -> str:
    """teen (<=19 no jogo), young (20-27), adult (28+), pela idade esperada do CLIP."""
    y = sc["ageY"]
    if y < TEEN_BELOW:
        return "teen"
    if y < ADULT_FROM:
        return "young"
    return "adult"



def male_logit(sc) -> float:
    import math

    lg = lambda p: math.log(min(p, 0.9999) / (1 - min(p, 0.9999)))  # noqa: E731
    return lg(sc["male"]) + lg(sc["male2"])


def judge(sc) -> tuple[bool, str]:
    """(aceito?, motivo) para um rosto."""
    if sc["male"] < MIN_MALE or sc["male2"] < MIN_MALE2 or male_logit(sc) < MIN_MALE_LOGIT:
        return False, "gender"
    for k, lim in REJ_MAX.items():
        if sc["rej"][k] > lim:
            return False, k
    a = sc["age"]
    if a["child"] > MAX_CHILD or sc["ageY"] < AGE_MIN:
        return False, "child"
    if a["middle"] + a["old"] > MAX_OLD or sc["ageY"] > AGE_MAX:
        return False, "old"
    if max(sc["skin"].values()) < MIN_SKIN:
        return False, "skin?"
    return True, "ok"


# O StyleGAN do site quase não gera negros (truncamento puxa para a média do
# FFHQ), e o CLIP joga pardos escuros em "medium". Quem fica em "medium" mas
# com fatia relevante de "dark" vai para "dark" (afro-brasileiros de pele mais
# clara também são lidos como negros no jogo).
DARK_SHARE = 0.02


def skin_of(sc) -> str:
    sk = sc["skin"]
    best = max(sk, key=sk.get)
    if best == "medium" and sk["dark"] / (sk["dark"] + sk["medium"]) >= DARK_SHARE:
        return "dark"
    return best


def load_scores():
    return json.loads(SCORES_FILE.read_text())


# ------------------------------------------------------------ recorte -------
# Imagens FFHQ: olhos perto de y=480/1024, queixo ~930-980. Um recorte mais
# fechado corta queixo e cabelo; o avatar do jogo é um círculo (object-fit:
# cover), então usamos quase a imagem toda, deixando de fora só a marca d'água
# "StyleGAN2 (Karras et al.)" no canto inferior direito (y > ~1000).
CROP_1024 = (24, 16, 1000, 992)  # x0, y0, x1, y1 na escala 1024
OUT_SIZE = 160
WEBP_Q = 80


def crop_face(im):
    k = im.size[0] / 1024
    box = tuple(round(v * k) for v in CROP_1024)
    return im.crop(box)


# ----------------------------------------------------------------- folhas ---

def contact_sheet(items, path, cols=10, cell=128, title=""):
    """items: lista de (hash, legenda)."""
    from PIL import Image, ImageDraw

    rows = max(1, (len(items) + cols - 1) // cols)
    cap = 14
    sheet = Image.new("RGB", (cols * cell, rows * (cell + cap) + 18), "white")
    d = ImageDraw.Draw(sheet)
    d.text((4, 3), title, fill="black")
    for i, (h, label) in enumerate(items):
        im = crop_face(Image.open(IMG_DIR / f"{h}.jpg").convert("RGB")).resize((cell, cell), Image.LANCZOS)
        x, y = (i % cols) * cell, 18 + (i // cols) * (cell + cap)
        sheet.paste(im, (x, y))
        d.text((x + 2, y + cell + 1), label[:24], fill="black")
    sheet.save(path, quality=85)


def cmd_sheets(args):
    QA_DIR.mkdir(parents=True, exist_ok=True)
    scores = load_scores()
    rng = random.Random(args.seed)
    acc, rej = {}, {}
    for h, sc in scores.items():
        ok, why = judge(sc)
        if ok:
            acc.setdefault(f"{age_bucket(sc)}-{skin_of(sc)}", []).append(h)
        else:
            rej.setdefault(why, []).append(h)
    for key in sorted(acc):
        hs = acc[key]
        sample = rng.sample(hs, min(args.n, len(hs)))
        items = [(h, f"{scores[h]['ageY']:.0f}y {max(scores[h]['skin'].values()):.2f}") for h in sample]
        contact_sheet(items, QA_DIR / f"acc_{key}.jpg", title=f"ACEITOS {key}: {len(hs)}")
    for why in sorted(rej):
        hs = rej[why]
        sample = rng.sample(hs, min(args.n, len(hs)))
        items = [(h, f"{why} {scores[h]['rej'].get(why, scores[h]['male']):.2f} {scores[h]['ageY']:.0f}y")
                 for h in sample]
        contact_sheet(items, QA_DIR / f"rej_{why}.jpg", title=f"REJEITADOS {why}: {len(hs)}")
    tot = sum(len(v) for v in acc.values())
    print(f"aceitos {tot}/{len(scores)} ({100 * tot / max(1, len(scores)):.1f}%)")
    for key in sorted(acc):
        print(f"  {key:16s} {len(acc[key])}")
    print("rejeições:", {k: len(v) for k, v in sorted(rej.items(), key=lambda kv: -len(kv[1]))})


def cmd_sweep(args):
    """Folha ordenada por um score (para escolher limiares): faixa [lo, hi] de rej[key] (ou 'male')."""
    QA_DIR.mkdir(parents=True, exist_ok=True)
    scores = load_scores()

    def val(sc):
        if args.key in ("male", "male2"):
            return sc[args.key]
        if args.key in ("ageY",):
            return sc["ageY"]
        if args.key.startswith("skin:"):
            return sc["skin"][args.key[5:]]
        if args.key.startswith("age:"):
            return sc["age"][args.key[4:]]
        return sc["rej"][args.key]

    pool = [(val(sc), h) for h, sc in scores.items()
            if args.lo <= val(sc) <= args.hi and (not args.male or sc["male"] >= MIN_MALE)]
    pool.sort()
    if len(pool) > args.n:  # amostra espalhada pela faixa
        step = len(pool) / args.n
        pool = [pool[int(i * step)] for i in range(args.n)]
    items = [(h, f"{v:.3f}") for v, h in pool]
    name = args.key.replace(":", "_")
    contact_sheet(items, QA_DIR / f"sweep_{name}.jpg", title=f"{args.key} em [{args.lo}, {args.hi}]")
    print(f"{len(items)} itens -> {QA_DIR / f'sweep_{name}.jpg'}")


# ------------------------------------------------------------------ build ---

def cmd_build(args):
    import numpy as np
    from PIL import Image

    scores = load_scores()
    names, feats = load_embeddings()
    idx = {h: i for i, h in enumerate(names)}
    acc = {}
    for h, sc in scores.items():
        ok, _ = judge(sc)
        if ok:
            acc.setdefault((age_bucket(sc), skin_of(sc)), []).append(h)

    # descarta quase-duplicatas (mesmo rosto gerado duas vezes)
    chosen = []
    kept = np.zeros((0, feats.shape[1]), dtype=np.float32)
    dup = 0
    for key in sorted(acc, key=lambda k: (AGE_ORDER.index(k[0]), SKIN_ORDER.index(k[1]))):
        hs = sorted(acc[key], key=lambda h: -max(scores[h]["skin"].values()))
        hs = hs[:args.cap_bucket]
        for h in hs:
            f = feats[idx[h]]
            if len(kept) and float((kept @ f).max()) > 0.95:
                dup += 1
                continue
            kept = np.vstack([kept, f[None]])
            chosen.append((key, h))
    chosen = chosen[:args.max]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.webp"):
        old.unlink()
    faces = []
    for n, ((age, skin), h) in enumerate(chosen):
        im = crop_face(Image.open(IMG_DIR / f"{h}.jpg").convert("RGB"))
        im = im.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
        im.save(OUT_DIR / f"{n}.webp", "WEBP", quality=WEBP_Q, method=6)
        faces.append({"id": n, "age": age, "skin": skin})
    OUT_JSON.write_text(json.dumps({"faces": faces}, separators=(",", ":")) + "\n")
    size = sum(p.stat().st_size for p in OUT_DIR.glob("*.webp"))
    counts = {}
    for f in faces:
        counts[f"{f['age']}-{f['skin']}"] = counts.get(f"{f['age']}-{f['skin']}", 0) + 1
    print(f"ok: {len(faces)} rostos ({dup} quase-duplicatas descartadas), {size / 1e6:.2f} MB")
    for k in sorted(counts):
        print(f"  {k:16s} {counts[k]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("download")
    d.add_argument("--target", type=int, default=3200)
    d.set_defaults(fn=cmd_download)
    e = sub.add_parser("embed")
    e.add_argument("--batch", type=int, default=32)
    e.set_defaults(fn=cmd_embed)
    c = sub.add_parser("classify")
    c.set_defaults(fn=cmd_classify)
    s = sub.add_parser("sheets")
    s.add_argument("--n", type=int, default=80)
    s.add_argument("--seed", type=int, default=1)
    s.set_defaults(fn=cmd_sheets)
    w = sub.add_parser("sweep")
    w.add_argument("key")
    w.add_argument("--lo", type=float, default=0.0)
    w.add_argument("--hi", type=float, default=1.0)
    w.add_argument("--n", type=int, default=80)
    w.add_argument("--male", action="store_true", help="só rostos já aprovados como masculinos")
    w.set_defaults(fn=cmd_sweep)
    b = sub.add_parser("build")
    b.add_argument("--max", type=int, default=1500)
    b.add_argument("--cap-bucket", type=int, default=200)
    b.set_defaults(fn=cmd_build)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
