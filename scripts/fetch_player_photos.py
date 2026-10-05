# -*- coding: utf-8 -*-
"""
Fotos reais dos jogadores (e das lendas) a partir do Wikimedia Commons — só licenças livres.

Etapas (cada uma é idempotente; o progresso fica em scripts/cache/player_media.json):
  qids      junta os QIDs do Wikidata de cada jogador de raw.json. Quem não tem QID é resolvido
            pelo título da Wikipedia em inglês e, depois, pela lista do elenco na Wikipedia em
            português (mesma regra do pt_match de build_database.py). Novos mapeamentos vão para
            scripts/cache/player_qids_extra.json.
  entities  baixa as entidades do Wikidata (P106 ocupação, P569 nascimento, P18 imagem,
            P373 categoria no Commons, links das Wikipedias).
  validate  aceita o QID só se for jogador de futebol (P106 = Q937857) e, quando as duas datas
            são conhecidas, se o ano de nascimento bater (±1). Evita homônimos (ex.: beisebol).
  pageimg   imagem principal dos artigos pt/en (só imagens livres) para quem não tem P18.
  legends   resolve o QID de cada lenda (src/data/legends.ts) com títulos conferidos à mão.
  photos    baixa a imagem, detecta o rosto (OpenCV DNN res10 SSD) e recorta um retrato quadrado
            de cabeça e ombros, 160x160 WebP em public/media/players/<QID>.webp.
  credits   autor e licença de cada arquivo usado (extmetadata). Apaga fotos não livres.
            Gera scripts/cache/credits_players.json e src/data/legendMedia.json.
  report    cobertura por divisão e tamanho total.

Uso:
    python3 scripts/fetch_player_photos.py all          # roda tudo (pode ser repetido)
    python3 scripts/fetch_player_photos.py photos       # só uma etapa
    timeout 540 python3 scripts/fetch_player_photos.py photos; echo exit=$?   # em blocos

Requer: pip install opencv-python-headless "opencv-python-headless<5" numpy pillow
(o OpenCV 5 removeu o leitor de modelos Caffe usado pelo detector de rostos).
"""
from __future__ import annotations

import html
import io
import json
import os
import re
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402
from clubs_catalog import ALL_CLUBS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache")
RAW = os.path.join(CACHE, "raw.json")
PT_SQUADS = os.path.join(CACHE, "pt_squads.json")
STATE = os.path.join(CACHE, "player_media.json")
EXTRA = os.path.join(CACHE, "player_qids_extra.json")
CREDITS = os.path.join(CACHE, "credits_players.json")
MODELS = os.path.join(CACHE, "models")
OUT_DIR = os.path.join(ROOT, "public", "media", "players")
LEGENDS_TS = os.path.join(ROOT, "src", "data", "legends.ts")
LEGEND_MEDIA = os.path.join(ROOT, "src", "data", "legendMedia.json")

EN_API = "https://en.wikipedia.org/w/api.php"
PT_API = "https://pt.wikipedia.org/w/api.php"
WIKI_API = {"commons.wikimedia.org": wm.COMMONS_API, "en.wikipedia.org": EN_API, "pt.wikipedia.org": PT_API}
FOOTBALLER = "Q937857"
OUT_SIZE = 160
MAX_TRIES = 4  # imagens tentadas por jogador

PROTO_URL = "https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/deploy.prototxt"
MODEL_URL = ("https://raw.githubusercontent.com/opencv/opencv_3rdparty/dnn_samples_face_detector_20170830/"
             "res10_300x300_ssd_iter_140000.caffemodel")

# Títulos da Wikipedia em inglês das lendas (nomes ambíguos resolvidos à mão)
LEGEND_TITLES = {
    "pele": "Pelé", "ronaldo": "Ronaldo (Brazilian footballer)", "ronaldinho": "Ronaldinho",
    "garrincha": "Garrincha", "zico": "Zico (footballer)", "romario": "Romário", "rivaldo": "Rivaldo",
    "kaka": "Kaká", "socrates": "Sócrates (footballer)", "rivellino": "Roberto Rivellino",
    "roberto-carlos": "Roberto Carlos (footballer)", "cafu": "Cafu", "jairzinho": "Jairzinho",
    "didi": "Didi (footballer, born 1928)", "leonidas": "Leônidas da Silva", "zizinho": "Zizinho",
    "falcao": "Paulo Roberto Falcão", "nilton-santos": "Nílton Santos (footballer, born 1925)",
    "carlos-alberto": "Carlos Alberto Torres", "tostao": "Tostão", "gerson": "Gérson",
    "djalma-santos": "Djalma Santos", "bebeto": "Bebeto", "adriano": "Adriano (footballer, born February 1982)",
    "ademir": "Ademir (footballer, born 1922)", "careca": "Careca", "reinaldo": "Reinaldo (footballer, born 1957)",
    "friedenreich": "Arthur Friedenreich", "junior": "Júnior (footballer, born 1954)",
    "marcelo": "Marcelo (footballer, born 1988)", "juninho-pernambucano": "Juninho Pernambucano",
    "domingos-da-guia": "Domingos da Guia", "aldair": "Aldair", "lucio": "Lúcio", "cerezo": "Toninho Cerezo",
    "dunga": "Dunga", "mauro-silva": "Mauro Silva", "alex": "Alex (footballer, born 1977)",
    "ze-roberto": "Zé Roberto", "fred": "Fred (footballer, born 1983)", "taffarel": "Cláudio Taffarel",
    "gylmar": "Gylmar dos Santos Neves", "julio-cesar": "Júlio César (footballer, born 1979)",
    "marcos": "Marcos (footballer, born 1973)", "dida": "Dida (footballer, born 1973)",
    "rogerio-ceni": "Rogério Ceni", "maradona": "Diego Maradona", "di-stefano": "Alfredo Di Stéfano",
    "batistuta": "Gabriel Batistuta", "riquelme": "Juan Román Riquelme", "kempes": "Mario Kempes",
    "sivori": "Omar Sívori", "passarella": "Daniel Passarella", "francescoli": "Enzo Francescoli",
    "schiaffino": "Juan Alberto Schiaffino", "obdulio": "Obdulio Varela", "spencer": "Alberto Spencer",
    "figueroa": "Elías Figueroa", "zamorano": "Iván Zamorano", "salas": "Marcelo Salas",
    "caszely": "Carlos Caszely", "cubillas": "Teófilo Cubillas", "valderrama": "Carlos Valderrama",
    "higuita": "René Higuita", "chilavert": "José Luis Chilavert", "romerito": "Julio César Romero",
    "cruyff": "Johan Cruyff", "zidane": "Zinedine Zidane", "beckenbauer": "Franz Beckenbauer",
    "puskas": "Ferenc Puskás", "eusebio": "Eusébio", "platini": "Michel Platini",
    "van-basten": "Marco van Basten", "yashin": "Lev Yashin", "gerd-muller": "Gerd Müller",
    "george-best": "George Best", "maldini": "Paolo Maldini", "baggio": "Roberto Baggio",
    "henry": "Thierry Henry", "gullit": "Ruud Gullit", "baresi": "Franco Baresi",
    "matthaus": "Lothar Matthäus", "figo": "Luís Figo", "iniesta": "Andrés Iniesta", "xavi": "Xavi",
    "buffon": "Gianluigi Buffon", "ibrahimovic": "Zlatan Ibrahimović", "pirlo": "Andrea Pirlo",
    "totti": "Francesco Totti", "shevchenko": "Andriy Shevchenko", "hugo-sanchez": "Hugo Sánchez",
    "charlton": "Bobby Charlton", "kahn": "Oliver Kahn", "casillas": "Iker Casillas",
    "bergkamp": "Dennis Bergkamp", "cannavaro": "Fabio Cannavaro", "drogba": "Didier Drogba",
    "etoo": "Samuel Eto'o", "weah": "George Weah", "stoichkov": "Hristo Stoichkov",
    "hagi": "Gheorghe Hagi", "gerrard": "Steven Gerrard", "rooney": "Wayne Rooney",
    "del-piero": "Alessandro Del Piero", "schmeichel": "Peter Schmeichel",
}

# Fotos escolhidas à mão (arquivos do Commons) — principalmente lendas em fotos da época de
# jogador, já que o jogo mostra a lenda renascida como garoto. QID -> nome do arquivo.
MANUAL_FILES: dict[str, str] = {}

# Arquivos que nunca devem ser usados (rosto errado, foto feia, recorte ruim...)
BAD_FILES: set[str] = set()

# QIDs que não devem ganhar foto (identidade duvidosa conferida à mão)
BAD_QIDS: set[str] = set()


# ------------------------------------------------------------------ utilidades

def load(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0, sort_keys=True)
    os.replace(tmp, path)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", " ", s)


def tokens(s):
    stop = {"de", "da", "do", "dos", "das", "e", "futebolista", "jr", "junior", "filho", "neto"}
    return {t for t in norm(s).split() if len(t) > 2 and t not in stop}


def clean_name(n):
    n = re.sub(r"\s*\((?:captain|vice-captain|c|vc)\)\s*", " ", n, flags=re.I)
    n = re.sub(r"\s+", " ", n).strip(" ,;*")
    return n


def pt_match(x, pt_list):
    """Igual a build_database.pt_match: número da camisa + nomes em comum."""
    xt = tokens(x["name"])
    best, best_score = None, 0
    for q in pt_list:
        qt = tokens(q["label"]) | tokens(q.get("link") or "")
        common = len(xt & qt)
        score = common * 2 + (3 if x["no"] and q["num"] and re.sub(r"[^0-9]", "", x["no"]) == q["num"] else 0)
        if common == 0 and score < 3:
            continue
        if common == 0 and norm(q["label"]).strip() not in norm(x["name"]):
            continue
        if score > best_score:
            best, best_score = q, score
    return best if best_score >= 2 else None


def chunks(seq, n=50):
    seq = list(seq)
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def year_of(s):
    m = re.match(r"[+-]?(\d{4})", s or "")
    return int(m.group(1)) if m else None


def state():
    st = load(STATE, {})
    for k in ("entities", "media", "pageimg", "titles", "players", "legends", "cat"):
        st.setdefault(k, {})
    return st


def query_titles(api, titles):
    """action=query em lote: título -> {qid, image, final}. Segue redirecionamentos."""
    out = {}
    for batch in chunks(sorted(set(titles)), 50):
        r = wm.api(api, {"action": "query", "titles": "|".join(batch), "redirects": 1,
                         "prop": "pageprops|pageimages", "ppprop": "wikibase_item", "piprop": "name"})
        if not r:
            print("  falhou um lote", file=sys.stderr)
            continue
        q = r.get("query", {})
        alias = {}
        for n in q.get("normalized", []):
            alias[n["from"]] = n["to"]
        redir = {d["from"]: d["to"] for d in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in batch:
            f = alias.get(t, t)
            f = redir.get(f, f)
            f = redir.get(f, f)
            p = pages.get(f)
            if not p or p.get("missing"):
                out[t] = {"qid": None, "image": None, "final": f}
            else:
                out[t] = {"qid": (p.get("pageprops") or {}).get("wikibase_item"),
                          "image": p.get("pageimage"), "final": f}
    return out


# ------------------------------------------------------------------ etapa 1: QIDs

def phase_qids(st):
    raw = load(RAW, {})["clubs"]
    pt_all = load(PT_SQUADS, {})
    extra = load(EXTRA, {})
    titles = st["titles"]  # "en:Title"/"pt:Title" -> {qid, image, final}

    # 1a) títulos em inglês sem QID
    need_en = sorted({p["link"] for c in raw.values() for p in c["players"]
                      if not p.get("qid") and p.get("link") and "en:" + p["link"] not in titles})
    print(f"títulos en sem QID a resolver: {len(need_en)}")
    for t, v in query_titles(EN_API, need_en).items():
        titles["en:" + t] = v
    save(STATE, st)

    # 1b) elenco da Wikipedia em português
    pending = {}
    for cid, c in raw.items():
        pt_list = pt_all.get(cid) or []
        for p in c["players"]:
            key = f"{cid}|{p['name']}"
            if p.get("qid"):
                continue
            en = titles.get("en:" + p["link"]) if p.get("link") else None
            if en and en.get("qid"):
                extra[key] = en["qid"]
                continue
            if not pt_list:
                continue
            q = pt_match({"name": clean_name(p["name"]), "no": p.get("no") or ""}, pt_list)
            if q and q.get("link"):
                pending[key] = q["link"]
    need_pt = sorted({t for t in pending.values() if "pt:" + t not in titles})
    print(f"títulos pt a resolver: {len(need_pt)} (jogadores casados com o elenco pt: {len(pending)})")
    for t, v in query_titles(PT_API, need_pt).items():
        titles["pt:" + t] = v
    n_pt = 0
    for key, t in pending.items():
        v = titles.get("pt:" + t)
        if v and v.get("qid"):
            extra[key] = v["qid"]
            n_pt += 1
    save(EXTRA, extra)
    save(STATE, st)
    print(f"QIDs extras: {len(extra)} (via pt: {n_pt})")


def player_candidates(st):
    """Lista (chave 'clube|nome', jogador, QID candidato)."""
    raw = load(RAW, {})["clubs"]
    extra = load(EXTRA, {})
    out = []
    for cid, c in raw.items():
        for p in c["players"]:
            key = f"{cid}|{p['name']}"
            q = p.get("qid") or extra.get(key)
            out.append((key, p, q))
    return out


# ------------------------------------------------------------------ etapa 2: entidades

def summarize_entity(e):
    cl = e.get("claims", {})

    def vals(pid):
        out = []
        for s in sorted(cl.get(pid, []), key=lambda s: {"preferred": 0, "normal": 1}.get(s.get("rank"), 2)):
            if s.get("rank") == "deprecated":
                continue
            dv = (s.get("mainsnak") or {}).get("datavalue")
            if dv:
                out.append(dv["value"])
        return out

    occ = [v.get("id") for v in vals("P106") if isinstance(v, dict)]
    births = [year_of(v.get("time")) for v in vals("P569") if isinstance(v, dict)]
    sl = e.get("sitelinks", {})
    lab = e.get("labels", {})
    return {
        "fb": FOOTBALLER in occ,
        "occ": occ[:6],
        "by": next((b for b in births if b), None),
        "p18": [v for v in vals("P18") if isinstance(v, str)][:3],
        "p373": next((v for v in vals("P373") if isinstance(v, str)), None),
        "en": (sl.get("enwiki") or {}).get("title"),
        "pt": (sl.get("ptwiki") or {}).get("title"),
        "label": (lab.get("pt") or lab.get("en") or {}).get("value"),
    }


def fetch_entities(st, qids):
    ents = st["entities"]
    need = sorted({q for q in qids if q and q not in ents})
    print(f"entidades a baixar: {len(need)}")
    for i, batch in enumerate(chunks(need, 50)):
        r = wm.api(wm.WIKIDATA_API, {"action": "wbgetentities", "ids": "|".join(batch),
                                     "props": "claims|labels|sitelinks", "languages": "pt|en"})
        if not r:
            print("  falhou um lote", file=sys.stderr)
            continue
        for qid, e in (r.get("entities") or {}).items():
            if e.get("missing") is not None:
                ents[qid] = {"missing": True}
                continue
            # entidade redirecionada: guarda com a chave pedida
            ents[qid] = summarize_entity(e)
            if e.get("id") and e["id"] != qid:
                ents[e["id"]] = ents[qid]
        if i % 10 == 9:
            save(STATE, st)
            print(f"  {min((i + 1) * 50, len(need))}/{len(need)}")
    save(STATE, st)


def phase_entities(st):
    fetch_entities(st, [q for _, _, q in player_candidates(st)])


# ------------------------------------------------------------------ etapa 3: validação

def phase_validate(st):
    ents = st["entities"]
    players = {}
    stats = {"sem-qid": 0, "ok": 0, "nao-futebolista": 0, "nascimento": 0, "sem-entidade": 0, "manual": 0}
    rejected = {}
    for key, p, q in player_candidates(st):
        if not q:
            stats["sem-qid"] += 1
            continue
        e = ents.get(q)
        if not e or e.get("missing"):
            stats["sem-entidade"] += 1
            continue
        if q in BAD_QIDS:
            stats["manual"] += 1
            rejected[q] = "manual"
            continue
        if not e["fb"]:
            stats["nao-futebolista"] += 1
            rejected[q] = "occupation"
            continue
        py = year_of(p.get("dob"))
        if py and e.get("by") and abs(py - e["by"]) > 1:
            stats["nascimento"] += 1
            rejected[q] = "birth"
            continue
        stats["ok"] += 1
        players[key] = q
    st["players"] = players
    st["rejected"] = rejected
    save(STATE, st)
    print("validação:", stats)


# ------------------------------------------------------------------ etapa 4: imagem dos artigos

def phase_pageimg(st):
    ents = st["entities"]
    pim = st["pageimg"]  # QID -> {"pt": file|None, "en": file|None}
    qids = set(st["players"].values()) | set(st["legends"].values())
    for wiki, api in (("pt", PT_API), ("en", EN_API)):
        want = {}
        for q in qids:
            e = ents.get(q) or {}
            t = e.get(wiki)
            if t and wiki not in pim.get(q, {}):
                want[t] = q
        print(f"imagens dos artigos {wiki}: {len(want)} títulos")
        res = query_titles(api, list(want))
        for t, q in want.items():
            pim.setdefault(q, {})[wiki] = (res.get(t) or {}).get("image")
        save(STATE, st)


# ------------------------------------------------------------------ etapa 5: lendas

def legend_rows():
    s = open(LEGENDS_TS, encoding="utf-8").read()
    rows = []
    for m in re.finditer(r'\{ id: "([^"]+)", name: "([^"]+)", full: "([^"]+)".*?era: "(\d{4})[^"]*".*?tier: (\d)', s):
        rows.append({"id": m.group(1), "name": m.group(2), "full": m.group(3),
                     "start": int(m.group(4)), "tier": int(m.group(5))})
    return rows


def phase_legends(st):
    rows = legend_rows()
    titles = st["titles"]
    need = [LEGEND_TITLES[r["id"]] for r in rows if r["id"] in LEGEND_TITLES
            and "en:" + LEGEND_TITLES[r["id"]] not in titles]
    for t, v in query_titles(EN_API, need).items():
        titles["en:" + t] = v
    missing = [r["id"] for r in rows if r["id"] not in LEGEND_TITLES]
    if missing:
        print("lendas sem título definido:", missing)
    qids = {r["id"]: (titles.get("en:" + LEGEND_TITLES.get(r["id"], "")) or {}).get("qid") for r in rows}
    fetch_entities(st, [q for q in qids.values() if q])
    ok, bad = {}, []
    for r in rows:
        q = qids.get(r["id"])
        e = st["entities"].get(q or "", {})
        by = e.get("by")
        good = bool(q) and e.get("fb") and by and r["start"] - 24 <= by <= r["start"] - 13
        if good:
            ok[r["id"]] = q
        else:
            bad.append((r["id"], LEGEND_TITLES.get(r["id"]), q, e.get("fb"), by, r["start"]))
    st["legends"] = ok
    save(STATE, st)
    print(f"lendas resolvidas: {len(ok)}/{len(rows)}")
    for b in bad:
        print("  PROBLEMA:", b)


# ------------------------------------------------------------------ etapa 6: fotos

_net = None


def face_net():
    global _net
    if _net is None:
        import cv2
        os.makedirs(MODELS, exist_ok=True)
        proto = os.path.join(MODELS, "deploy.prototxt")
        model = os.path.join(MODELS, "res10_300x300_ssd_iter_140000.caffemodel")
        for path, url in ((proto, PROTO_URL), (model, MODEL_URL)):
            if not os.path.exists(path):
                import requests
                r = requests.get(url, timeout=120)
                r.raise_for_status()
                with open(path, "wb") as f:
                    f.write(r.content)
        _net = cv2.dnn.readNetFromCaffe(proto, model)
    return _net


def detect_faces(img, conf=0.6):
    """Rostos (x1, y1, x2, y2, confiança) em pixels. Duas passagens: 300x300 (rostos grandes)
    e na resolução da imagem (rostos pequenos); resultados combinados por NMS."""
    import cv2
    import numpy as np
    net = face_net()
    h, w = img.shape[:2]
    boxes = []
    sizes = [(300, 300)]
    scale = min(1.0, 900 / max(h, w))
    sw, sh = int(w * scale) // 4 * 4, int(h * scale) // 4 * 4
    if max(sw, sh) > 360:
        sizes.append((sw, sh))
    for size in sizes:
        blob = cv2.dnn.blobFromImage(cv2.resize(img, size), 1.0, size, (104.0, 177.0, 123.0))
        net.setInput(blob)
        det = net.forward()
        for i in range(det.shape[2]):
            c = float(det[0, 0, i, 2])
            if c < conf:
                continue
            x1, y1, x2, y2 = (det[0, 0, i, 3:7] * np.array([w, h, w, h])).tolist()
            x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
            if x2 - x1 < 12 or y2 - y1 < 12:
                continue
            boxes.append((x1, y1, x2, y2, c))
    # NMS simples
    boxes.sort(key=lambda b: -b[4])
    keep = []
    for b in boxes:
        if all(iou(b, k) < 0.35 for k in keep):
            keep.append(b)
    return keep


def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0


def decode(data):
    from PIL import Image, ImageOps
    im = Image.open(io.BytesIO(data))
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    return im.convert("RGB")


# geometria do recorte (proporções da altura do rosto detectado)
CROP_SIDE = 2.2   # lado do quadrado
CROP_TOP = 0.62   # espaço acima do topo da caixa do rosto
MIN_FACE = 38     # rosto mínimo (px na imagem baixada) para não ficar borrado


def crop_portrait(im, faces):
    """Recorta o retrato. Devolve (imagem 160x160, info) ou (None, motivo)."""
    if not faces:
        return None, "no-face"
    faces = sorted(faces, key=lambda b: -(b[3] - b[1]) * (b[2] - b[0]))
    f = faces[0]
    fh = f[3] - f[1]
    fw = f[2] - f[0]
    for o in faces[1:]:
        if (o[3] - o[1]) >= 0.72 * fh:
            return None, "multi-face"
    if fh < MIN_FACE:
        return None, "small-face"
    W, H = im.size
    # caixa do SSD costuma ser estreita no topo: usa a média de largura e altura
    fs = max(fh, (fh + fw) / 2)
    side = CROP_SIDE * fs
    cx = (f[0] + f[2]) / 2
    top = f[1] - CROP_TOP * fs
    side = min(side, W, H)
    if side < 1.55 * fs:  # não dá para enquadrar cabeça e ombros
        return None, "tight"
    left = cx - side / 2
    left = min(max(0, left), W - side)
    top = min(max(0, top), H - side)
    # rosto precisa continuar aproximadamente centralizado
    off = abs((cx - left) / side - 0.5)
    if off > 0.22:
        return None, "off-center"
    box = (int(round(left)), int(round(top)), int(round(left + side)), int(round(top + side)))
    from PIL import Image
    out = im.crop(box).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    return out, {"fh": round(fh), "side": round(side), "conf": round(f[4], 2)}


def try_file(name, wiki):
    """Baixa um arquivo, detecta o rosto e recorta. (img, info) ou (None, motivo)."""
    import numpy as np
    low = name.lower()
    if low.endswith((".svg", ".gif", ".pdf", ".djvu", ".webm", ".ogv", ".ogg", ".mp4", ".tif", ".tiff")):
        if not low.endswith((".tif", ".tiff")):
            return None, "format"
    data = wm.download(name, 500, wiki=wiki)
    if not data:
        return None, "download"
    try:
        im = decode(data)
    except Exception:
        return None, "decode"
    arr = np.array(im)[:, :, ::-1].copy()
    faces = detect_faces(arr)
    if faces:
        big = max(b[3] - b[1] for b in faces)
        if big < 72 and max(im.size) < 1500:
            data2 = wm.download(name, 960, wiki=wiki)
            if data2:
                try:
                    im2 = decode(data2)
                    if im2.size[0] > im.size[0] * 1.2:
                        im = im2
                        arr = np.array(im)[:, :, ::-1].copy()
                        faces = detect_faces(arr)
                except Exception:
                    pass
    out, info = crop_portrait(im, faces)
    if out is None:
        return None, info
    info["src_w"] = im.size[0]
    return out, info


def category_files(st, cat, surname):
    """Até 10 arquivos (jpg/png) da categoria do Commons; os que têm o sobrenome primeiro."""
    if cat not in st["cat"]:
        r = wm.api(wm.COMMONS_API, {"action": "query", "list": "categorymembers", "cmtitle": "Category:" + cat,
                                    "cmtype": "file", "cmlimit": 30})
        files = [m["title"][5:] for m in ((r or {}).get("query", {}).get("categorymembers") or [])]
        st["cat"][cat] = files
    files = st["cat"][cat]
    bad = re.compile(r"logo|crest|escudo|emblem|badge|kit|team|squad|equipe|elenco|time |"
                     r"stadium|estadio|estádio|signature|assinatura|autograph|map|flag|bandeira|"
                     r"card|cromo|figurinha|trophy|trofeu|troféu|grave|tumulo|statue|estatua|estátua|"
                     r"mural|graffiti|plaque|placa|shirt|camisa|jersey|ticket", re.I)
    ok = [f for f in files if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")) and not bad.search(f)]
    sn = norm(surname).split()
    sn = sn[-1] if sn else ""
    ok.sort(key=lambda f: (0 if sn and sn in norm(f) else 1, 0 if f.lower().endswith((".jpg", ".jpeg")) else 1))
    return ok[:10]


def candidates_for(st, q, name):
    e = st["entities"].get(q) or {}
    pim = st["pageimg"].get(q) or {}
    out = []
    if q in MANUAL_FILES:
        out.append((MANUAL_FILES[q], "commons.wikimedia.org", "manual"))
    for f in e.get("p18") or []:
        out.append((f, "commons.wikimedia.org", "p18"))
    if pim.get("pt"):
        out.append((pim["pt"], "pt.wikipedia.org", "page-pt"))
    if pim.get("en"):
        out.append((pim["en"], "en.wikipedia.org", "page-en"))
    seen, uniq = set(), []
    for f, w, s in out:
        k = wm.norm_file(f)
        if k in seen or f in BAD_FILES or k in BAD_FILES:
            continue
        seen.add(k)
        uniq.append((f, w, s))
    return uniq, e.get("p373")


def process_qid(st, q, name):
    media = st["media"]
    cands, cat = candidates_for(st, q, name)
    tried = []
    reasons = []
    used_cat = False
    i = 0
    while True:
        if i >= len(cands):
            if cat and not used_cat:
                used_cat = True
                extra = [(f, "commons.wikimedia.org", "category") for f in category_files(st, cat, name)]
                known = {wm.norm_file(c[0]) for c in cands}
                extra = [c for c in extra if wm.norm_file(c[0]) not in known and c[0] not in BAD_FILES][:3]
                cands.extend(extra)
                if i >= len(cands):
                    break
            else:
                break
        if len(tried) >= MAX_TRIES:
            break
        f, wiki, src = cands[i]
        i += 1
        tried.append(f)
        out, info = try_file(f, wiki)
        if out is None:
            reasons.append(info)
            continue
        os.makedirs(OUT_DIR, exist_ok=True)
        out.save(os.path.join(OUT_DIR, q + ".webp"), "WEBP", quality=80, method=6)
        media[q] = {"status": "ok", "file": wm.norm_file(f).replace("_", " "), "wiki": wiki, "src": src,
                    **info, "tried": len(tried)}
        return "ok"
    if not tried:
        media[q] = {"status": "no-image"}
        return "no-image"
    st_ = "no-face" if all(r in ("no-face", "multi-face", "small-face", "tight", "off-center") for r in reasons) \
        else "error"
    media[q] = {"status": st_, "reasons": reasons, "tried_files": tried}
    return st_


def phase_photos(st, limit=None, only=None, redo=False):
    media = st["media"]
    names = {}
    for key, q in st["players"].items():
        names.setdefault(q, key.split("|", 1)[1])
    rows = {r["id"]: r for r in legend_rows()}
    for lid, q in st["legends"].items():
        names[q] = rows[lid]["name"] if lid in rows else lid
    todo = [q for q in names if (redo or q not in media) and (not only or q in only)]
    # lendas primeiro, depois jogadores da Série A ... estrangeiros
    leg = set(st["legends"].values())
    todo.sort(key=lambda q: (q not in leg, q))
    if limit:
        todo = todo[:limit]
    print(f"fotos a processar: {len(todo)} (já feitas: {sum(1 for v in media.values() if v.get('status') == 'ok')})")
    t0 = time.time()
    cnt = {}
    for n, q in enumerate(todo):
        try:
            res = process_qid(st, q, names[q])
        except Exception as ex:  # noqa: BLE001
            media[q] = {"status": "error", "reasons": [repr(ex)[:200]]}
            res = "error"
        cnt[res] = cnt.get(res, 0) + 1
        if n % 20 == 19:
            save(STATE, st)
            print(f"  {n + 1}/{len(todo)} {cnt} {time.time() - t0:.0f}s", flush=True)
    save(STATE, st)
    print("fotos:", cnt)


# ------------------------------------------------------------------ etapa 7: créditos

FREE = re.compile(r"^(cc[ -]?by|cc[ -]?zero|cc0|cc-pd|public domain|pd\b|pd-|gfdl|gpl|lgpl|fal\b|free art|"
                  r"attribution|copyrighted free use|no restrictions|agência brasil|abr|cc sa|"
                  r"cc[ -]by[ -]sa|cc-by-sa|creative commons)", re.I)
NONFREE = re.compile(r"\b(nc|nd|non-?commercial|no ?derivs|fair use|non-free)\b", re.I)


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def phase_credits(st):
    media = st["media"]
    meta = st.setdefault("meta", {})  # nome do arquivo -> {author, license, url, free}
    ok = {q: m for q, m in media.items() if m.get("status") == "ok"}
    by_wiki = {}
    for q, m in ok.items():
        fn = m["file"]
        if fn in meta:
            continue
        by_wiki.setdefault("commons.wikimedia.org", set()).add(fn)
    for wiki, files in by_wiki.items():
        print(f"metadados a buscar: {len(files)}")
        _fetch_meta(meta, wiki, files)
    # arquivos locais (não estão no Commons): tenta na wiki de origem
    local = {}
    for q, m in ok.items():
        info = meta.get(m["file"])
        if info and info.get("missing") and m["wiki"] != "commons.wikimedia.org" and not info.get("tried_local"):
            local.setdefault(m["wiki"], set()).add(m["file"])
    for wiki, files in local.items():
        print(f"metadados locais ({wiki}): {len(files)}")
        _fetch_meta(meta, wiki, files)
        for f in files:
            meta[f]["tried_local"] = True
    save(STATE, st)

    credits = {}
    removed = 0
    for q, m in ok.items():
        info = meta.get(m["file"]) or {}
        path = os.path.join(OUT_DIR, q + ".webp")
        if not info.get("free"):
            removed += 1
            media[q] = {**m, "status": "nonfree", "license": info.get("license")}
            if os.path.exists(path):
                os.remove(path)
            continue
        if not os.path.exists(path):
            media[q] = {"status": "error", "reasons": ["arquivo sumiu"]}
            continue
        credits[f"players/{q}.webp"] = {"file": m["file"], "author": info.get("author") or "desconhecido",
                                        "license": info.get("license") or "", "url": info.get("url")}
        if info.get("licenseUrl"):
            credits[f"players/{q}.webp"]["licenseUrl"] = info["licenseUrl"]
    save(STATE, st)
    save(CREDITS, credits)
    # mapa das lendas
    lm = {lid: q for lid, q in sorted(st["legends"].items())
          if os.path.exists(os.path.join(OUT_DIR, q + ".webp")) and f"players/{q}.webp" in credits}
    with open(LEGEND_MEDIA, "w", encoding="utf-8") as f:
        json.dump(lm, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    # mapa jogador do banco (clube|nome como em database.json) -> QID com foto
    db = {}
    for key, q in st["players"].items():
        if f"players/{q}.webp" in credits:
            cid, name = key.split("|", 1)
            db[f"{cid}|{clean_name(name)}"] = q
    st["db"] = db
    save(STATE, st)
    print(f"créditos: {len(credits)} fotos livres; removidas não livres: {removed}; lendas com foto: {len(lm)}")


def _fetch_meta(meta, wiki, files):
    api = WIKI_API[wiki]
    for batch in chunks(sorted(files), 50):
        r = wm.api(api, {"action": "query", "titles": "|".join("File:" + f for f in batch), "redirects": 1,
                         "prop": "imageinfo", "iiprop": "extmetadata|url",
                         "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|NonFree|Credit|UsageTerms"})
        if not r:
            continue
        q = r.get("query", {})
        alias = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {d["from"]: d["to"] for d in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for f in batch:
            t = alias.get("File:" + f, "File:" + f)
            t = redir.get(t, t)
            p = pages.get(t)
            if not p or not p.get("imageinfo"):
                meta[f] = {"missing": True, "free": False}
                continue
            ii = p["imageinfo"][0]
            em = ii.get("extmetadata") or {}
            g = lambda k: (em.get(k) or {}).get("value") or ""  # noqa: E731
            lic = strip_html(g("LicenseShortName"))
            nonfree = str(g("NonFree")).lower() == "true"
            free = bool(lic) and not nonfree and bool(FREE.search(lic)) and not NONFREE.search(lic)
            author = strip_html(g("Artist")) or strip_html(g("Credit"))
            if len(author) > 160:
                author = author[:157] + "..."
            meta[f] = {"author": author, "license": lic, "licenseUrl": g("LicenseUrl") or None,
                       "url": ii.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{wm.norm_file(f)}",
                       "free": free}


# ------------------------------------------------------------------ relatório

def phase_report(st):
    divs = {c["id"]: c["div"] for c in ALL_CLUBS}
    total, withq, valid, photo = {}, {}, {}, {}
    credits = load(CREDITS, {})
    for key, p, q in player_candidates(st):
        d = divs.get(key.split("|", 1)[0], "?")
        total[d] = total.get(d, 0) + 1
        if q:
            withq[d] = withq.get(d, 0) + 1
        vq = st["players"].get(key)
        if vq:
            valid[d] = valid.get(d, 0) + 1
            if f"players/{vq}.webp" in credits:
                photo[d] = photo.get(d, 0) + 1
    label = {"A": "Série A", "B": "Série B", "C": "Série C", "D": "Série D (pool)", "F": "Estrangeiros"}
    print(f"{'divisão':16} {'jogadores':>9} {'c/ QID':>7} {'válidos':>8} {'c/ foto':>8} {'%':>6}")
    for d in ("A", "B", "C", "D", "F"):
        t = total.get(d, 0)
        print(f"{label[d]:16} {t:9} {withq.get(d, 0):7} {valid.get(d, 0):8} {photo.get(d, 0):8} "
              f"{100 * photo.get(d, 0) / max(1, t):5.1f}%")
    T = sum(total.values())
    P = sum(photo.values())
    print(f"{'total':16} {T:9} {sum(withq.values()):7} {sum(valid.values()):8} {P:8} {100 * P / max(1, T):5.1f}%")
    st_counts = {}
    for m in st["media"].values():
        st_counts[m.get("status")] = st_counts.get(m.get("status"), 0) + 1
    print("status por QID:", st_counts)
    print("rejeitados (identidade):", len(st.get("rejected", {})))
    size = sum(os.path.getsize(os.path.join(OUT_DIR, f)) for f in os.listdir(OUT_DIR)) if os.path.isdir(OUT_DIR) else 0
    n = len(os.listdir(OUT_DIR)) if os.path.isdir(OUT_DIR) else 0
    print(f"arquivos: {n}  tamanho: {size / 1e6:.2f} MB  média: {size / max(1, n) / 1e3:.1f} KB")
    lm = load(LEGEND_MEDIA, {})
    print(f"lendas com foto: {len(lm)}/{len(legend_rows())}")


def main():
    args = sys.argv[1:] or ["all"]
    st = state()
    phase = args[0]
    if phase in ("qids", "all"):
        phase_qids(st)
    if phase in ("entities", "all"):
        phase_entities(st)
    if phase in ("validate", "all"):
        phase_validate(st)
    if phase in ("legends", "all"):
        phase_legends(st)
    if phase in ("pageimg", "all"):
        phase_pageimg(st)
    if phase in ("photos", "all"):
        lim = int(args[1]) if len(args) > 1 and args[1].isdigit() else None
        phase_photos(st, limit=lim)
    if phase == "redo":
        phase_photos(st, only=set(args[1:]), redo=True)
    if phase in ("credits", "all"):
        phase_credits(st)
    if phase in ("report", "all"):
        phase_report(st)


if __name__ == "__main__":
    main()
