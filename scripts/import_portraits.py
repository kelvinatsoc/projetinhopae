#!/usr/bin/env python3
"""Importa retratos do projeto Arquibancada (do dono do jogo) como fotos empacotadas.

Fontes (pasta do Arquibancada, padrão /tmp/claude-0/arq/arquibancada):
  public/portraits/catalog/sources.json  -> {id: {name, club, photo, source (ogol.com.br)}}
  lib/player-portraits.json              -> São Paulo FC (site oficial), {id: {name, photo, credit}}

Para cada jogador real de src/data/database.json procura, no MESMO clube, um retrato cujo nome
bata (sem acentos; nome completo, apelido de uma palavra, primeiro+último nome). Casos ambíguos
(dois candidatos ou dois jogadores nossos para o mesmo retrato) são pulados.
Copia como WebP 160x160 para public/media/players/<chave>.webp (chave "o<id ogol>" ou "s<n>")
e grava src/data/portraits.json {"nome|ano": chave}; também marca "pi" no database.json
(o build_database.py relê portraits.json).

Uso: python3 scripts/import_portraits.py [pasta_do_arquibancada]
"""
import json, os, re, sys, unicodedata, collections
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/arq/arquibancada"
DB = os.path.join(ROOT, "src/data/database.json")
OUT = os.path.join(ROOT, "src/data/portraits.json")
MEDIA = os.path.join(ROOT, "public/media/players")
SIZE = 160

# nome do clube no Arquibancada -> id do nosso banco (o resto casa pelo nome normalizado)
CLUB_ALIASES = {"Athletic Club": "athletic", "LDU": "ldu-quito", "Nacional": "nacional-uru", "Paraná Clube": "parana",
                "Ypiranga-RS": "ypiranga-rs", "Red Bull Bragantino": "bragantino", "Vasco da Gama": "vasco"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return " ".join(t for t in re.split(r"[^a-z0-9]+", s) if t)


def keys_for(name):
    """Formas de um nome usadas para casar (a primeira é a mais forte)."""
    t = norm(name).split()
    ks = [" ".join(t)]
    if len(t) >= 2:
        ks.append(f"{t[0]} {t[-1]}")
    return ks


def convert(src, dst, crop_top):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    if crop_top and h > w:  # retrato vertical (SPFC): quadrado na parte de cima, onde está o rosto
        top = int(h * 0.08)
        im = im.crop((0, top, w, top + w))
    else:
        s = min(w, h)
        im = im.crop(((w - s) // 2, 0, (w - s) // 2 + s, s))
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    im.save(dst, "WEBP", quality=72, method=6)


def main():
    db = json.load(open(DB))
    clubs = {c["id"]: c for c in db["clubs"]}
    by_name = {norm(c["name"]): c["id"] for c in db["clubs"]}
    # retratos por clube nosso
    portraits = collections.defaultdict(list)  # club id -> [(name, file, key, crop)]
    cat = json.load(open(os.path.join(ARQ, "public/portraits/catalog/sources.json")))
    unknown = collections.Counter()
    for pid, e in cat.items():
        cid = CLUB_ALIASES.get(e["club"]) or by_name.get(norm(e["club"]))
        if not cid:
            unknown[e["club"]] += 1
            continue
        portraits[cid].append((e["name"], os.path.join(ARQ, "public", e["photo"].lstrip("/")), "o" + pid.lstrip("-"), False))
    for pid, e in json.load(open(os.path.join(ARQ, "lib/player-portraits.json"))).items():
        if "/spfc/" in e.get("photo", ""):
            portraits["sao-paulo"].append((e["name"], os.path.join(ARQ, "public", e["photo"].lstrip("/")), "s" + pid.lstrip("-"), True))

    out = {}
    stats = collections.defaultdict(lambda: [0, 0])
    used = set()
    for cid, plist in portraits.items():
        ours = [p for p in db["players"] if p["c"] == cid]
        # índice: forma do nome -> retratos / jogadores nossos
        pidx, oidx = collections.defaultdict(set), collections.defaultdict(set)
        for i, (n, *_r) in enumerate(plist):
            t = norm(n).split()
            for k in keys_for(n):
                pidx[k].add(i)
        for j, p in enumerate(ours):
            t = norm(p["n"]).split()
            forms = keys_for(p["n"]) + ([t[0], t[-1]] if len(t) >= 2 else [])
            for k in forms:
                oidx[k].add(j)
        match = {}
        for j, p in enumerate(ours):
            t = norm(p["n"]).split()
            for k in keys_for(p["n"]) + ([t[0], t[-1]] if len(t) >= 2 else []):
                cands = pidx.get(k, set())
                if len(cands) == 1 and len(oidx[k]) == 1:
                    match[j] = next(iter(cands)); break
                if len(cands) > 1:
                    break  # ambíguo: não arrisca
        # retratos de uma palavra ("Calleri") contra nosso nome completo: só se único dos dois lados
        for i, (n, *_r) in enumerate(plist):
            if i in match.values():
                continue
            k = norm(n)
            if " " in k:
                continue
            js = [j for j in oidx.get(k, ()) if j not in match]
            if len(js) == 1 and len(oidx[k]) == 1:
                match[js[0]] = i
        # um retrato não pode servir dois jogadores
        cnt = collections.Counter(match.values())
        for j, i in match.items():
            if cnt[i] > 1:
                continue
            p = ours[j]
            n, src, key, crop = plist[i]
            if not os.path.exists(src):
                continue
            dst = os.path.join(MEDIA, key + ".webp")
            if not os.path.exists(dst):
                convert(src, dst, crop)
            out[f"{p['n']}|{p.get('b')}"] = key
            used.add(key)
    for p in db["players"]:
        d = clubs[p["c"]]["div"]
        stats[d][0] += 1
        k = out.get(f"{p['n']}|{p.get('b')}")
        if k:
            stats[d][1] += 1
            p["pi"] = k
        else:
            p.pop("pi", None)
    with open(OUT, "w") as f:
        json.dump(dict(sorted(out.items())), f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    with open(DB, "w") as f:
        json.dump(db, f, ensure_ascii=False, separators=(",", ":"))
    for d in sorted(stats):
        n, h = stats[d]
        print(f"div {d}: {h}/{n} com retrato ({100 * h / max(n, 1):.0f}%)")
    print("clubes do Arquibancada fora do nosso banco:", len(unknown))
    size = sum(os.path.getsize(os.path.join(MEDIA, k + ".webp")) for k in used)
    print(f"{len(out)} retratos, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
