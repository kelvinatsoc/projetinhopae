# -*- coding: utf-8 -*-
"""
Fotos reais das Lendas (src/data/legends.ts) — complementa fetch_player_photos.py para as lendas
que ficaram sem foto. NUNCA usa assets de FIFA/PES/EA/Konami (proprietários).

Fontes, em ordem de preferência (a primeira com rosto recortável vence):
  1. Wikidata P18 -> Wikimedia Commons (Special:FilePath?width=400), só licenças livres;
  2. Wikipedia (en/pt) pageimages, só imagens livres (pilicense=free), conferidas no extmetadata;
  3. TheSportsDB searchplayers.php (chave pública 3): cutout ou thumb do jogador aposentado
     (imagens da comunidade, uso com atribuição) — último recurso.

Ritmo: Commons 1 req/4 s (com backoff exponencial em 429/5xx), TheSportsDB 1 req/2 s.
Saída: public/media/players/<QID>.webp (160x160, mesmo padrão das demais fotos), mapa em
src/data/legendMedia.json e src/data/media.json, créditos em public/media/credits.json e em
scripts/cache/credits_legends.json (para o build_media_index.py preservá-los).

Retomável: o progresso fica em scripts/cache/legend_photos.json; lendas já resolvidas são puladas.
    python3 scripts/fetch_legend_photos.py            # processa as lendas sem foto
    python3 scripts/fetch_legend_photos.py --redo pele # refaz uma lenda
"""
from __future__ import annotations

import html
import io
import json
import os
import re
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_player_photos as fpp  # noqa: E402  (reaproveita títulos, detector de rosto e recorte)

ROOT = fpp.ROOT
CACHE = fpp.CACHE
STATE = os.path.join(CACHE, "legend_photos.json")
CREDITS_CACHE = os.path.join(CACHE, "credits_legends.json")
OUT_DIR = fpp.OUT_DIR
LEGEND_MEDIA = fpp.LEGEND_MEDIA
MEDIA_JSON = os.path.join(ROOT, "src", "data", "media.json")
CREDITS_PUBLIC = os.path.join(ROOT, "public", "media", "credits.json")

UA = "LendasDaBaseBot/1.0 (https://github.com/kelvinatsoc/projetinhopae) python-requests"
S = requests.Session()
S.headers["User-Agent"] = UA
WD_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKI_API = {"en": "https://en.wikipedia.org/w/api.php", "pt": "https://pt.wikipedia.org/w/api.php"}
TSDB = "https://www.thesportsdb.com/api/v1/json/3/searchplayers.php"
PACE = {"wm": 4.0, "tsdb": 2.0}
_last = {"wm": 0.0, "tsdb": 0.0}
FREE = re.compile(r"(^|\b)(cc[- ]?by|cc0|public domain|pd|gfdl|attribution|no restrictions|copyrighted free use|fal)", re.I)


def get(url, params=None, kind="wm", tries=6):
    """GET educado: intervalo por servidor e backoff exponencial em 429/5xx (respeita Retry-After)."""
    for i in range(tries):
        wait = _last[kind] + PACE[kind] - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[kind] = time.time()
        try:
            r = S.get(url, params=params, timeout=60)
        except requests.RequestException:
            time.sleep(4 * 2 ** i)
            continue
        if r.status_code == 429 or r.status_code >= 500:
            ra = r.headers.get("retry-after", "")
            delay = min(int(ra) if ra.isdigit() else 8 * 2 ** i, 900)
            print(f"    {r.status_code}: esperando {delay}s", flush=True)
            time.sleep(delay)
            continue
        return r
    return None


def jget(url, params, kind="wm"):
    r = get(url, {**params, "format": "json"}, kind)
    try:
        return r.json() if r is not None and r.status_code == 200 else None
    except ValueError:
        return None


def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


# ------------------------------------------------------------------ resolução

def resolve_qid(title):
    d = jget(WD_API, {"action": "wbgetentities", "sites": "enwiki", "titles": title, "props": "claims|sitelinks",
                      "sitefilter": "enwiki|ptwiki", "redirects": "yes"})
    for q, e in ((d or {}).get("entities") or {}).items():
        if q.startswith("Q"):
            return q, e
    return None, None


def claim_files(e, prop="P18"):
    out = []
    for c in (e.get("claims") or {}).get(prop, []):
        v = (c.get("mainsnak") or {}).get("datavalue", {}).get("value")
        if isinstance(v, str):
            out.append(v)
    return out


def birth_year(e):
    for c in (e.get("claims") or {}).get("P569", []):
        v = (c.get("mainsnak") or {}).get("datavalue", {}).get("value") or {}
        m = re.match(r"[+-](\d{4})", v.get("time", ""))
        if m:
            return int(m.group(1))
    return None


def file_meta(name):
    """Licença/autor de um arquivo do Commons (extmetadata)."""
    d = jget(COMMONS_API, {"action": "query", "titles": "File:" + name, "prop": "imageinfo",
                           "iiprop": "extmetadata|url", "iiextmetadatafilter": "LicenseShortName|Artist|LicenseUrl|Credit"})
    for pg in ((d or {}).get("query") or {}).get("pages", {}).values():
        ii = (pg.get("imageinfo") or [{}])[0]
        md = ii.get("extmetadata") or {}
        lic = strip((md.get("LicenseShortName") or {}).get("value"))
        return {"license": lic, "author": strip((md.get("Artist") or {}).get("value")) or strip((md.get("Credit") or {}).get("value")),
                "licenseUrl": (md.get("LicenseUrl") or {}).get("value"), "url": ii.get("descriptionurl"),
                "free": bool(lic and FREE.search(lic) and "non-free" not in lic.lower() and "fair use" not in lic.lower())}
    return None


def page_images(e):
    out = []
    for lang in ("en", "pt"):
        t = ((e.get("sitelinks") or {}).get(f"{lang}wiki") or {}).get("title")
        if not t:
            continue
        d = jget(WIKI_API[lang], {"action": "query", "titles": t, "prop": "pageimages", "piprop": "name", "pilicense": "free"})
        for pg in ((d or {}).get("query") or {}).get("pages", {}).values():
            if pg.get("pageimage"):
                out.append(pg["pageimage"])
    return out


def tsdb_candidates(name, full, by):
    out = []
    for q in dict.fromkeys([name, full]):
        d = jget(TSDB, {"p": q}, "tsdb")
        for pl in (d or {}).get("player") or []:
            if (pl.get("strSport") or "") != "Soccer":
                continue
            y = int((pl.get("dateBorn") or "0000")[:4] or 0)
            if by and y and abs(y - by) > 1:
                continue
            for k in ("strCutout", "strThumb", "strRender"):
                if pl.get(k):
                    out.append((pl[k], pl.get("idPlayer"), k))
        if out:
            break
    return out


# ------------------------------------------------------------------ imagem

def square_top(im):
    """Recorte quadrado no topo (cutouts do TheSportsDB já vêm enquadrados em cabeça e ombros)."""
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    return im.crop((left, 0, left + side, side)).resize((fpp.OUT_SIZE, fpp.OUT_SIZE))


def to_portrait(data, allow_top=False):
    import numpy as np
    try:
        im = fpp.decode(data)
    except Exception:  # noqa: BLE001
        return None, "decode"
    try:
        faces = fpp.detect_faces(np.array(im)[:, :, ::-1].copy(), conf=0.5)
    except Exception:  # noqa: BLE001  (OpenCV falha em imagens muito estreitas)
        faces = []
    out, info = fpp.crop_portrait(im, faces)
    if out is None and allow_top and faces:
        return square_top(im), "top"
    return out, info


def save_webp(img, q):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, q + ".webp")
    img.save(path, "WEBP", quality=80, method=6)
    return path


def process(row, title, st):
    q, e = resolve_qid(title)
    if not q:
        return {"status": "no-qid"}
    by = birth_year(e)
    tried = []
    commons = list(dict.fromkeys(claim_files(e) + page_images(e)))
    for fn in commons[:4]:
        if fn in fpp.BAD_FILES:
            continue
        meta = file_meta(fn)
        if not meta or not meta["free"]:
            tried.append(f"{fn}: não livre ({(meta or {}).get('license')})")
            continue
        r = get("https://commons.wikimedia.org/wiki/Special:FilePath/" + requests.utils.quote(fn.replace(" ", "_")), {"width": 400})
        if r is None or r.status_code != 200 or not r.headers.get("content-type", "").startswith("image/"):
            tried.append(f"{fn}: download")
            continue
        img, info = to_portrait(r.content)
        if img is None:
            tried.append(f"{fn}: {info}")
            continue
        save_webp(img, q)
        return {"status": "ok", "qid": q, "source": "commons", "file": fn, "author": meta["author"] or "desconhecido",
                "license": meta["license"], "url": meta["url"], "licenseUrl": meta.get("licenseUrl")}
    for url, pid, kind in tsdb_candidates(row["name"], row["full"], by)[:3]:
        r = get(url + ("/medium" if kind != "strCutout" else ""), kind="tsdb")
        if r is None or r.status_code != 200:
            r = get(url, kind="tsdb")
        if r is None or r.status_code != 200:
            tried.append(f"tsdb {pid}: download")
            continue
        img, info = to_portrait(r.content, allow_top=True)
        if img is None:
            tried.append(f"tsdb {pid}: {info}")
            continue
        save_webp(img, q)
        return {"status": "ok", "qid": q, "source": "thesportsdb", "file": url.rsplit("/", 1)[-1],
                "author": "TheSportsDB (comunidade)", "license": "TheSportsDB — uso com atribuição",
                "url": f"https://www.thesportsdb.com/player/{pid}"}
    return {"status": "none", "qid": q, "tried": tried}


# ------------------------------------------------------------------ saída

def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, data, compact=False):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        if compact:
            f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        else:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
    os.replace(tmp, path)


def publish(st):
    lm = load(LEGEND_MEDIA, {})
    credits_cache = load(CREDITS_CACHE, {})
    pub = load(CREDITS_PUBLIC, {})
    for lid, m in st.items():
        if m.get("status") != "ok" or not os.path.exists(os.path.join(OUT_DIR, m["qid"] + ".webp")):
            continue
        lm[lid] = m["qid"]
        c = {k: m.get(k) or "" for k in ("file", "author", "license", "url")}
        credits_cache[f"players/{m['qid']}.webp"] = c
        pub[f"players/{m['qid']}.webp"] = c
    write_json(LEGEND_MEDIA, dict(sorted(lm.items())))
    write_json(CREDITS_CACHE, credits_cache)
    write_json(CREDITS_PUBLIC, dict(sorted(pub.items())), compact=True)
    media = load(MEDIA_JSON, {"comps": {}})
    media["legends"] = dict(sorted(lm.items()))
    write_json(MEDIA_JSON, media, compact=True)
    return lm


def main():
    redo = set(sys.argv[sys.argv.index("--redo") + 1:]) if "--redo" in sys.argv else set()
    os.makedirs(CACHE, exist_ok=True)
    st = load(STATE, {})
    have = load(LEGEND_MEDIA, {})
    rows = fpp.legend_rows()
    for row in rows:
        lid = row["id"]
        if lid not in redo and (lid in have or st.get(lid, {}).get("status") in ("ok", "none", "no-qid")):
            continue
        title = fpp.LEGEND_TITLES.get(lid)
        if not title:
            st[lid] = {"status": "no-title"}
            continue
        print(f"{lid} ({title})...", flush=True)
        st[lid] = process(row, title, st)
        print(f"   -> {st[lid]['status']} {st[lid].get('source', '')} {st[lid].get('tried', '')}", flush=True)
        write_json(STATE, st)
    lm = publish(st)
    missing = [r["id"] for r in rows if r["id"] not in lm]
    print(f"cobertura: {len(lm)}/{len(rows)} lendas com foto; sem foto: {', '.join(missing) or '-'}")


if __name__ == "__main__":
    main()
