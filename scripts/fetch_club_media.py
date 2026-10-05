# -*- coding: utf-8 -*-
"""
Mídia real dos clubes: escudos oficiais, fotos dos estádios e logos dos campeonatos.

Fontes (sempre pela Wikimedia, via scripts/wm.py, que controla a taxa de acesso):
  - Wikidata: QID do clube, P154 (logotipo), P115 (estádio), P1083 (capacidade), P18 (imagem)
  - Wikipedia em português: campo "imagem" da Info/Futebol/clube (arquivo do Commons)
  - Wikipedia em inglês: campo "image"/"logo" da infobox (pode ser logotipo não livre local)

Saídas:
  public/media/crests/<clubId>.webp      escudo 256x256 com transparência
  public/media/stadiums/<QIDdoEstádio>.webp  foto 640x360 (16:9)
  public/media/comps/<chave>.webp        logo do campeonato 256x256
  scripts/cache/club_media.json          dados coletados (QIDs, arquivos escolhidos, estádios)
  scripts/cache/credits_clubs.json       autoria/licença de cada arquivo publicado

O script é retomável: arquivos brutos ficam em scripts/cache/club_media_raw/ e nada é
baixado de novo. Rode por etapas (ou "all"):
    python3 scripts/fetch_club_media.py all
    python3 scripts/fetch_club_media.py resolve|entities|crests|stadiums|comps|credits|qa
"""
from __future__ import annotations

import hashlib
import html
import io
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402
from clubs_catalog import ALL_CLUBS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache")
DATA = os.path.join(CACHE, "club_media.json")
CREDITS = os.path.join(CACHE, "credits_clubs.json")
RAWDIR = os.path.join(CACHE, "club_media_raw")
MEDIA = os.path.join(ROOT, "public", "media")
QA_DIR = "/tmp/claude-0/qa"
EN_API = "https://en.wikipedia.org/w/api.php"
PT_API = "https://pt.wikipedia.org/w/api.php"

# Campeonatos do jogo -> título do artigo na Wikipedia em inglês
COMPS = {
    "serieA": "Campeonato Brasileiro Série A",
    "serieB": "Campeonato Brasileiro Série B",
    "serieC": "Campeonato Brasileiro Série C",
    "copaBR": "Copa do Brasil",
    "liberta": "Copa Libertadores",
    "sula": "Copa Sudamericana",
}

# Títulos da Wikipedia em inglês que mudaram em relação ao catálogo
TITLE_OVERRIDES = {"amazonas": "Amazonas Futebol Clube"}

# Correções manuais depois da conferência visual.
# Escudo: clubId -> (arquivo, "commons" | "en")
CREST_OVERRIDES: dict[str, tuple[str, str]] = {}
# Estádio do clube: clubId -> QID do estádio (quando o P115 do Wikidata está errado/ausente)
VENUE_OVERRIDES: dict[str, str] = {}
# Foto do estádio: QID -> arquivo do Commons (quando a P18 é ruim: mapa, planta, foto escura...)
STADIUM_IMG_OVERRIDES: dict[str, str] = {}
# Logo de campeonato: chave -> (arquivo, "commons" | "en")
COMP_OVERRIDES: dict[str, tuple[str, str]] = {}

# P31 aceitos como "clube de futebol"
CLUB_TYPES = {"Q476028", "Q847017", "Q103229495", "Q15944511", "Q1194951", "Q20639856", "Q17270000"}


# ---------------------------------------------------------------- utilidades
def load(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, path)


def chunks(seq, n):
    seq = list(seq)
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def claim_value(c):
    s = c.get("mainsnak", {})
    if s.get("snaktype") != "value":
        return None
    v = s.get("datavalue", {}).get("value")
    if isinstance(v, dict):
        if "id" in v:
            return v["id"]
        if "amount" in v:
            try:
                return int(float(v["amount"]))
            except ValueError:
                return None
        if "time" in v:
            return v["time"]
    return v


def qual_time(c, prop):
    vals = []
    for q in c.get("qualifiers", {}).get(prop, []):
        t = q.get("datavalue", {}).get("value", {})
        if isinstance(t, dict) and t.get("time"):
            vals.append(t["time"])
    return max(vals) if vals else ""


def ranked(claims, prop, time_prop="P580"):
    """Valores de uma propriedade do mais atual para o mais antigo:
    sem data de término (P582) > posto preferido > início (ou data) mais recente."""
    out = []
    for c in claims.get(prop, []):
        if c.get("rank") == "deprecated":
            continue
        v = claim_value(c)
        if v is None:
            continue
        ended = bool(c.get("qualifiers", {}).get("P582"))
        out.append({
            "value": v, "rank": c.get("rank"), "ended": ended,
            "start": qual_time(c, time_prop), "end": qual_time(c, "P582"),
        })
    out.sort(key=lambda x: (not x["ended"], x["rank"] == "preferred", x["start"]), reverse=True)
    return out


def raw_path(wiki, name, width):
    h = hashlib.md5(f"{wiki}|{wm.norm_file(name)}|{width}".encode()).hexdigest()[:16]
    return os.path.join(RAWDIR, h + ".bin")


def fetch_raw(name, width, wiki="commons"):
    """Baixa (com cache) um arquivo da Wikimedia. wiki: "commons" ou "en"."""
    host = "commons.wikimedia.org" if wiki == "commons" else "en.wikipedia.org"
    os.makedirs(RAWDIR, exist_ok=True)
    tries = [width, None] if width else [None]
    for w in tries:
        p = raw_path(wiki, name, w)
        if os.path.exists(p):
            if os.path.getsize(p) == 0:
                continue  # tentativa anterior falhou
            with open(p, "rb") as f:
                return f.read()
        data = wm.download(name, w, wiki=host)
        if data and not data[:200].lstrip().startswith((b"<?xml", b"<svg")):
            with open(p, "wb") as f:
                f.write(data)
            return data
        # SVG original (sem miniatura) não serve: marca a falha e tenta o próximo
        with open(p, "wb") as f:
            f.write(b"")
    return None


def strip_html(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def infobox_field(text, names):
    """Valor de um campo da infobox (primeira ocorrência entre os nomes dados)."""
    if not text:
        return None
    for nm in names:
        m = re.search(r"^\s*\|\s*" + nm + r"\s*=\s*([^\n]*)", text, re.M | re.I)
        if m:
            v = m.group(1)
            v = re.sub(r"<!--.*?-->", "", v).strip()
            fm = re.search(r"\[\[(?:File|Ficheiro|Arquivo|Imagem|Image):([^|\]]+)", v, re.I)
            if fm:
                v = fm.group(1)
            v = v.split("|")[0].strip()
            if re.search(r"\.(svg|png|jpe?g|gif|webp|tiff?)$", v, re.I):
                return wm.norm_file(v).replace("_", " ")
    return None


def wiki_text(api, title, cache_name):
    """Wikitext de um artigo (cache em club_media_raw/)."""
    if not title:
        return ""
    os.makedirs(RAWDIR, exist_ok=True)
    path = os.path.join(RAWDIR, cache_name + ".txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read()
    r = wm.api(api, {"action": "query", "titles": title, "redirects": 1, "prop": "revisions",
                     "rvprop": "content", "rvslots": "main"})
    txt = ""
    try:
        txt = r["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]
    except (TypeError, KeyError, IndexError):
        if r is None:
            return ""  # falha de rede: não grava cache
    with open(path, "w", encoding="utf-8") as f:
        f.write(txt)
    return txt


def pt_text(title):
    """Wikitext em português: usa scripts/cache/pt/ (fetch_pt_positions.py) ou baixa."""
    if not title:
        return ""
    path = os.path.join(CACHE, "pt", re.sub(r"[^\w\-]+", "_", title) + ".txt")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, encoding="utf-8") as f:
            return f.read()
    return wiki_text(PT_API, title, "pt_" + re.sub(r"[^\w\-]+", "_", title))


def en_text(cid, title):
    path = os.path.join(CACHE, "wikitext", cid + ".txt")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, encoding="utf-8") as f:
            return f.read()
    return wiki_text(EN_API, title, "en_" + cid)


# ---------------------------------------------------------------- etapa 1: QIDs
def resolve(db):
    clubs = db.setdefault("clubs", {})
    todo = [c for c in ALL_CLUBS if not clubs.get(c["id"], {}).get("qid")]
    print(f"resolve: {len(todo)} clubes sem QID")
    for batch in chunks(todo, 50):
        titles = [TITLE_OVERRIDES.get(c["id"], c["wiki"]) for c in batch]
        r = wm.api(EN_API, {"action": "query", "titles": "|".join(titles), "redirects": 1,
                            "prop": "pageprops", "ppprop": "wikibase_item"})
        if not r:
            print("  falha na API da Wikipedia")
            continue
        q = r.get("query", {})
        norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
        redir = {x["from"]: x["to"] for x in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for c in batch:
            t0 = TITLE_OVERRIDES.get(c["id"], c["wiki"])
            t = norm.get(t0, t0)
            t = redir.get(t, t)
            p = pages.get(t, {})
            qid = p.get("pageprops", {}).get("wikibase_item")
            clubs.setdefault(c["id"], {}).update({"enTitle": t, "qid": qid})
            if not qid:
                print(f"  sem QID: {c['id']} ({c['wiki']})")
    save(DATA, db)


# ---------------------------------------------------------------- etapa 2: entidades
def wbget(ids):
    out = {}
    for batch in chunks(ids, 50):
        r = wm.api(wm.WIKIDATA_API, {"action": "wbgetentities", "ids": "|".join(batch),
                                     "props": "claims|labels|sitelinks", "languages": "pt|en"})
        if not r:
            print("  falha no Wikidata")
            continue
        out.update(r.get("entities", {}))
    return out


def label(e, lang):
    return (e.get("labels", {}).get(lang) or {}).get("value")


def entities(db):
    clubs = db["clubs"]
    ids = sorted({v["qid"] for v in clubs.values() if v.get("qid")})
    print(f"entities: {len(ids)} clubes")
    ents = wbget(ids)
    for cid, v in clubs.items():
        e = ents.get(v.get("qid") or "")
        if not e:
            continue
        cl = e.get("claims", {})
        p31 = [x["value"] for x in ranked(cl, "P31")]
        v["p31"] = p31
        v["isClub"] = bool(set(p31) & CLUB_TYPES)
        v["labelPt"] = label(e, "pt")
        v["ptTitle"] = (e.get("sitelinks", {}).get("ptwiki") or {}).get("title")
        v["p154"] = ranked(cl, "P154")
        v["p115"] = ranked(cl, "P115")
        if not v["isClub"]:
            print(f"  ATENÇÃO {cid}: P31={p31} (não parece clube de futebol)")
    # estádios
    venue_ids = set(VENUE_OVERRIDES.values())
    for cid, v in clubs.items():
        if v.get("p115"):
            venue_ids.add(v["p115"][0]["value"])
    venues = db.setdefault("venues", {})
    vents = wbget(sorted(venue_ids))
    for q, e in vents.items():
        cl = e.get("claims", {})
        caps = ranked(cl, "P1083", time_prop="P585")
        caps.sort(key=lambda x: (x["rank"] == "preferred", x["start"]), reverse=True)
        venues[q] = {
            "labelPt": label(e, "pt"), "labelEn": label(e, "en"),
            "capacity": caps[0]["value"] if caps else None,
            "p18": [x["value"] for x in ranked(cl, "P18")],
            "p373": (ranked(cl, "P373") or [{}])[0].get("value"),
            "p31": [x["value"] for x in ranked(cl, "P31")],
        }
    save(DATA, db)
    print(f"  {len(venues)} estádios")


# ---------------------------------------------------------------- etapa 3: escudos
def file_repos(files, api=EN_API):
    """Para arquivos citados na Wikipedia em inglês: "local" (não livre) ou "shared" (Commons)."""
    out = {}
    for batch in chunks(sorted(set(files)), 50):
        r = wm.api(api, {"action": "query", "titles": "|".join("File:" + f for f in batch),
                         "prop": "imageinfo", "iiprop": "size|mime"})
        if not r:
            continue
        q = r.get("query", {})
        norm = {x["to"]: x["from"] for x in q.get("normalized", [])}
        for p in q.get("pages", []):
            t = p["title"]
            orig = norm.get(t, t)[5:]
            ii = (p.get("imageinfo") or [{}])[0]
            out[orig] = {"repo": p.get("imagerepository") or ("missing" if p.get("missing") else ""),
                         "w": ii.get("width"), "h": ii.get("height"), "mime": ii.get("mime")}
    return out


def crest_candidates(db):
    """Define o arquivo de escudo de cada clube (P154 > pt.wikipedia > en.wikipedia)."""
    clubs = db["clubs"]
    en_files = {}
    for c in ALL_CLUBS:
        v = clubs.setdefault(c["id"], {})
        v["enInfobox"] = infobox_field(en_text(c["id"], v.get("enTitle")), ["image", "logo", "clubcrest", "crest"])
        v["ptInfobox"] = infobox_field(pt_text(v.get("ptTitle")), ["imagem", "escudo", "logo"])
        if v["enInfobox"]:
            en_files[v["enInfobox"]] = None
    if en_files:
        need = [f for f in en_files if f not in db.setdefault("enRepos", {})]
        if need:
            db["enRepos"].update(file_repos(need))
    for c in ALL_CLUBS:
        v = clubs[c["id"]]
        if c["id"] in CREST_OVERRIDES:
            f, w = CREST_OVERRIDES[c["id"]]
            v["crest"] = {"file": f, "wiki": w, "source": "manual"}
        elif v.get("p154"):
            v["crest"] = {"file": v["p154"][0]["value"], "wiki": "commons", "source": "wikidata"}
        elif v.get("ptInfobox"):
            v["crest"] = {"file": v["ptInfobox"], "wiki": "commons", "source": "ptwiki"}
        elif v.get("enInfobox"):
            repo = db["enRepos"].get(v["enInfobox"], {}).get("repo")
            v["crest"] = {"file": v["enInfobox"], "wiki": "en" if repo == "local" else "commons",
                          "source": "enwiki"}
        else:
            v["crest"] = None
    save(DATA, db)


def _img():
    from PIL import Image  # noqa: F401
    return Image


def knock_out_background(im):
    """Imagem sem transparência (JPG/PNG opaco): torna transparente o fundo branco
    ligado às bordas (preenchimento a partir das bordas, tolerância pequena)."""
    import numpy as np
    from collections import deque
    a = np.asarray(im.convert("RGBA")).copy()
    h, w = a.shape[:2]
    rgb = a[:, :, :3].astype(int)
    near_white = (rgb.min(axis=2) >= 236) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= 18)
    seen = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near_white[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near_white[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and near_white[ny, nx]:
                seen[ny, nx] = True
                dq.append((ny, nx))
    a[seen, 3] = 0
    return _img().fromarray(a, "RGBA")


def to_logo_webp(data, out_path, box=256, pad=2):
    """Recorta margens transparentes/brancas e centraliza num quadro box x box."""
    import numpy as np
    Image = _img()
    im = Image.open(io.BytesIO(data))
    im.load()
    if im.mode == "P" and "transparency" in im.info:
        im = im.convert("RGBA")
    im = im.convert("RGBA")
    alpha = np.asarray(im)[:, :, 3]
    opaque = alpha.min() >= 250
    if opaque:
        im = knock_out_background(im)
        alpha = np.asarray(im)[:, :, 3]
    ys, xs = np.where(alpha > 10)
    if len(xs) == 0:
        return False
    im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    inner = box - 2 * pad
    s = min(inner / im.width, inner / im.height)
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    canvas.paste(im, ((box - nw) // 2, (box - nh) // 2), im)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.save(out_path, "WEBP", quality=90, method=6, exact=False)
    return True


def crests(db, force=False):
    crest_candidates(db)
    clubs = db["clubs"]
    ok = miss = 0
    for c in ALL_CLUBS:
        v = clubs[c["id"]]
        out = os.path.join(MEDIA, "crests", c["id"] + ".webp")
        cr = v.get("crest")
        if not cr:
            print(f"  SEM ESCUDO: {c['id']}")
            miss += 1
            continue
        stamp = f"{cr['wiki']}|{cr['file']}"
        if not force and os.path.exists(out) and v.get("crestDone") == stamp:
            ok += 1
            continue
        width = 500 if cr["wiki"] == "commons" else 250
        data = fetch_raw(cr["file"], width, cr["wiki"])
        if not data or not to_logo_webp(data, out):
            print(f"  falhou: {c['id']} {cr}")
            miss += 1
            continue
        v["crestDone"] = stamp
        ok += 1
        if ok % 20 == 0:
            save(DATA, db)
            print(f"  {ok} escudos")
    save(DATA, db)
    print(f"crests: {ok} ok, {miss} faltando")


# ---------------------------------------------------------------- etapa 4: estádios
def club_venue(v, cid):
    if cid in VENUE_OVERRIDES:
        return VENUE_OVERRIDES[cid]
    if v.get("p115"):
        return v["p115"][0]["value"]
    return None


def to_stadium_webp(data, out_path):
    Image = _img()
    from PIL import ImageOps
    im = Image.open(io.BytesIO(data))
    im = ImageOps.exif_transpose(im).convert("RGB")
    tw, th = 640, 360
    r = im.width / im.height
    if r > 16 / 9:
        nw = round(im.height * 16 / 9)
        x0 = (im.width - nw) // 2
        im = im.crop((x0, 0, x0 + nw, im.height))
    else:
        nh = round(im.width * 9 / 16)
        y0 = (im.height - nh) // 2
        im = im.crop((0, y0, im.width, y0 + nh))
    im = im.resize((tw, th), Image.LANCZOS)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path, "WEBP", quality=72, method=6)
    return True


def stadiums(db, force=False):
    clubs, venues = db["clubs"], db.get("venues", {})
    need = set()
    for c in ALL_CLUBS:
        q = club_venue(clubs.get(c["id"], {}), c["id"])
        clubs[c["id"]]["venue"] = q
        if q:
            need.add(q)
    missing_ents = [q for q in need if q not in venues]
    if missing_ents:
        for q, e in wbget(missing_ents).items():
            cl = e.get("claims", {})
            caps = ranked(cl, "P1083", time_prop="P585")
            caps.sort(key=lambda x: (x["rank"] == "preferred", x["start"]), reverse=True)
            venues[q] = {"labelPt": label(e, "pt"), "labelEn": label(e, "en"),
                         "capacity": caps[0]["value"] if caps else None,
                         "p18": [x["value"] for x in ranked(cl, "P18")],
                         "p373": (ranked(cl, "P373") or [{}])[0].get("value"),
                         "p31": [x["value"] for x in ranked(cl, "P31")]}
    ok = miss = 0
    for q in sorted(need):
        v = venues.get(q, {})
        img = STADIUM_IMG_OVERRIDES.get(q) or (v.get("p18") or [None])[0]
        v["image"] = img
        out = os.path.join(MEDIA, "stadiums", q + ".webp")
        if not img:
            v.pop("imgDone", None)
            if os.path.exists(out):
                os.remove(out)
            miss += 1
            continue
        if not force and os.path.exists(out) and v.get("imgDone") == img:
            ok += 1
            continue
        data = fetch_raw(img, 960, "commons")
        if not data:
            print(f"  falhou: {q} {img}")
            miss += 1
            continue
        try:
            to_stadium_webp(data, out)
        except Exception as ex:  # noqa: BLE001
            print(f"  erro ao converter {q}: {ex}")
            miss += 1
            continue
        v["imgDone"] = img
        ok += 1
        if ok % 20 == 0:
            save(DATA, db)
            print(f"  {ok} estádios")
    save(DATA, db)
    print(f"stadiums: {ok} com foto, {miss} sem foto, {len(need)} estádios")


# ---------------------------------------------------------------- etapa 5: campeonatos
def comps(db):
    cdb = db.setdefault("comps", {})
    r = wm.api(EN_API, {"action": "query", "titles": "|".join(COMPS.values()), "redirects": 1,
                        "prop": "pageprops", "ppprop": "wikibase_item"})
    q = r.get("query", {}) if r else {}
    norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
    redir = {x["from"]: x["to"] for x in q.get("redirects", [])}
    pages = {p["title"]: p for p in q.get("pages", [])}
    for key, title in COMPS.items():
        t = redir.get(norm.get(title, title), norm.get(title, title))
        cdb.setdefault(key, {}).update({"enTitle": t,
                                        "qid": pages.get(t, {}).get("pageprops", {}).get("wikibase_item")})
    ents = wbget([v["qid"] for v in cdb.values() if v.get("qid")])
    en_logo = {}
    for key, v in cdb.items():
        e = ents.get(v.get("qid") or "", {})
        v["p154"] = ranked(e.get("claims", {}), "P154")
        r = wm.api(EN_API, {"action": "query", "titles": v["enTitle"], "prop": "revisions",
                            "rvprop": "content", "rvslots": "main"})
        txt = ""
        try:
            txt = r["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]
        except (TypeError, KeyError, IndexError):
            pass
        v["enInfobox"] = infobox_field(txt, ["logo", "image"])
        if v["enInfobox"]:
            en_logo[v["enInfobox"]] = None
    repos = file_repos(list(en_logo)) if en_logo else {}
    for key, v in cdb.items():
        if key in COMP_OVERRIDES:
            f, w = COMP_OVERRIDES[key]
            v["logo"] = {"file": f, "wiki": w, "source": "manual"}
        elif v["p154"]:
            v["logo"] = {"file": v["p154"][0]["value"], "wiki": "commons", "source": "wikidata"}
        elif v.get("enInfobox"):
            repo = repos.get(v["enInfobox"], {}).get("repo")
            v["logo"] = {"file": v["enInfobox"], "wiki": "en" if repo == "local" else "commons",
                         "source": "enwiki"}
        else:
            v["logo"] = None
        lg = v["logo"]
        if not lg:
            print(f"  sem logo: {key}")
            continue
        data = fetch_raw(lg["file"], 500 if lg["wiki"] == "commons" else 250, lg["wiki"])
        out = os.path.join(MEDIA, "comps", key + ".webp")
        if data and to_logo_webp(data, out):
            print(f"  {key}: {lg['file']} ({lg['source']})")
        else:
            print(f"  falhou: {key} {lg}")
    save(DATA, db)


# ---------------------------------------------------------------- etapa 6: créditos
NONFREE_AUTHOR = {"crests": "logotipo oficial do clube (marca registrada)",
                  "comps": "logotipo oficial da competição (marca registrada)"}


def commons_meta(files, cache):
    need = [f for f in sorted(set(files)) if f not in cache]
    for batch in chunks(need, 50):
        r = wm.api(wm.COMMONS_API, {"action": "query", "titles": "|".join("File:" + f for f in batch),
                                    "prop": "imageinfo", "iiprop": "extmetadata|url",
                                    "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|Credit"})
        if not r:
            continue
        q = r.get("query", {})
        norm = {x["to"]: x["from"] for x in q.get("normalized", [])}
        for p in q.get("pages", []):
            orig = norm.get(p["title"], p["title"])[5:]
            ii = (p.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata", {})
            cache[orig] = {
                "author": strip_html(md.get("Artist", {}).get("value")) or
                strip_html(md.get("Credit", {}).get("value")) or "desconhecido",
                "license": strip_html(md.get("LicenseShortName", {}).get("value")) or "ver página do arquivo",
                "url": ii.get("descriptionurl") or wm.file_url(orig).replace("Special:FilePath/", "File:"),
            }
    return cache


def credits(db):
    entries = {}
    for c in ALL_CLUBS:
        v = db["clubs"].get(c["id"], {})
        cr = v.get("crest")
        if cr and os.path.exists(os.path.join(MEDIA, "crests", c["id"] + ".webp")):
            entries[f"crests/{c['id']}.webp"] = (cr["file"], cr["wiki"], "crests")
    for q, v in db.get("venues", {}).items():
        if v.get("imgDone") and os.path.exists(os.path.join(MEDIA, "stadiums", q + ".webp")):
            entries[f"stadiums/{q}.webp"] = (v["imgDone"], "commons", "stadiums")
    for key, v in db.get("comps", {}).items():
        lg = v.get("logo")
        if lg and os.path.exists(os.path.join(MEDIA, "comps", key + ".webp")):
            entries[f"comps/{key}.webp"] = (lg["file"], lg["wiki"], "comps")
    meta = db.setdefault("commonsMeta", {})
    commons_meta([f for f, w, _ in entries.values() if w == "commons"], meta)
    out = {}
    for path, (f, w, kind) in sorted(entries.items()):
        fn = wm.norm_file(f).replace("_", " ")
        if w == "commons":
            m = meta.get(fn) or meta.get(f) or {}
            out[path] = {"file": fn, "author": m.get("author", "desconhecido"),
                         "license": m.get("license", "ver página do arquivo"),
                         "url": m.get("url") or "https://commons.wikimedia.org/wiki/File:" + wm.norm_file(f)}
        else:
            out[path] = {"file": fn, "author": NONFREE_AUTHOR.get(kind, "marca registrada"),
                         "license": "uso não livre (Wikipedia)",
                         "url": "https://en.wikipedia.org/wiki/File:" + wm.norm_file(f)}
    save(DATA, db)
    with open(CREDITS, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1, sort_keys=True)
    print(f"credits: {len(out)} arquivos -> {CREDITS}")


# ---------------------------------------------------------------- conferência visual
def qa(db):
    """Folhas de contato em /tmp/claude-0/qa/ (escudos em fundo escuro e claro, estádios)."""
    Image = _img()
    from PIL import ImageDraw
    os.makedirs(QA_DIR, exist_ok=True)
    ids = [c["id"] for c in ALL_CLUBS]
    for bg, tag in (((12, 23, 18), "dark"), ((240, 240, 236), "light")):
        for part in range(0, len(ids), 60):
            sub = ids[part:part + 60]
            cols, cell = 10, 120
            rows = (len(sub) + cols - 1) // cols
            sheet = Image.new("RGB", (cols * cell, rows * (cell + 14)), bg)
            d = ImageDraw.Draw(sheet)
            for i, cid in enumerate(sub):
                x, y = (i % cols) * cell, (i // cols) * (cell + 14)
                p = os.path.join(MEDIA, "crests", cid + ".webp")
                if os.path.exists(p):
                    im = Image.open(p).convert("RGBA").resize((100, 100), Image.LANCZOS)
                    sheet.paste(im, (x + 10, y + 4), im)
                d.text((x + 4, y + cell - 4), cid[:18], fill=(255, 80, 80) if tag == "dark" else (160, 0, 0))
            sheet.save(os.path.join(QA_DIR, f"crests_{tag}_{part // 60}.png"))
    venues = sorted({db["clubs"][c].get("venue") for c in ids if db["clubs"].get(c, {}).get("venue")})
    files = [q for q in venues if os.path.exists(os.path.join(MEDIA, "stadiums", q + ".webp"))]
    for part in range(0, len(files), 30):
        sub = files[part:part + 30]
        cols, cw, ch = 5, 256, 144
        rows = (len(sub) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cw, rows * (ch + 14)), (20, 20, 20))
        d = ImageDraw.Draw(sheet)
        for i, q in enumerate(sub):
            x, y = (i % cols) * cw, (i // cols) * (ch + 14)
            im = Image.open(os.path.join(MEDIA, "stadiums", q + ".webp")).resize((cw - 4, ch), Image.LANCZOS)
            sheet.paste(im, (x + 2, y))
            v = db["venues"].get(q, {})
            d.text((x + 4, y + ch), f"{q} {(v.get('labelPt') or v.get('labelEn') or '')[:30]}", fill=(255, 255, 0))
        sheet.save(os.path.join(QA_DIR, f"stadiums_{part // 30}.png"))
    comps_ = [k for k in COMPS if os.path.exists(os.path.join(MEDIA, "comps", k + ".webp"))]
    if comps_:
        sheet = Image.new("RGB", (len(comps_) * 140, 280), (12, 23, 18))
        sheet.paste(Image.new("RGB", (len(comps_) * 140, 140), (240, 240, 236)), (0, 140))
        for i, k in enumerate(comps_):
            im = Image.open(os.path.join(MEDIA, "comps", k + ".webp")).convert("RGBA").resize((120, 120))
            sheet.paste(im, (i * 140 + 10, 10), im)
            sheet.paste(im, (i * 140 + 10, 150), im)
        sheet.save(os.path.join(QA_DIR, "comps.png"))
    print(f"qa: folhas em {QA_DIR}")


def main():
    stages = sys.argv[1:] or ["all"]
    force = "--force" in stages
    stages = [s for s in stages if not s.startswith("--")]
    if stages == ["all"]:
        stages = ["resolve", "entities", "crests", "stadiums", "comps", "credits", "qa"]
    db = load(DATA, {})
    t0 = time.time()
    for st in stages:
        if st == "resolve":
            resolve(db)
        elif st == "entities":
            entities(db)
        elif st == "crests":
            crests(db, force)
        elif st == "stadiums":
            stadiums(db, force)
        elif st == "comps":
            comps(db)
        elif st == "credits":
            credits(db)
        elif st == "qa":
            qa(db)
        else:
            print(f"etapa desconhecida: {st}")
    print(f"pronto em {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
