# -*- coding: utf-8 -*-
"""
Sons reais da partida: ambiente de torcida, explosão no gol, "uhhh", apito do árbitro e
cantos de torcida de alguns clubes, todos gravações com licença livre do Wikimedia Commons.

Fontes (sempre pela Wikimedia, via scripts/wm.py, que controla a taxa de acesso):
  - Commons: busca no espaço "Arquivo" (list=search, srnamespace=6, filetype:audio) e
    categorias de áudio (list=categorymembers), metadados de licença (imageinfo/extmetadata).

Saídas:
  public/media/audio/<nome>.m4a          AAC estéreo/mono, loudnorm, cortado (ver SELECTION)
  public/media/audio/credits.json        {"audio/<nome>.m4a": {file, author, license, url}}
  scripts/cache/audio_candidates.json    candidatos encontrados (título, licença, duração...)
  scripts/cache/audio_raw/               arquivos originais baixados (não são baixados de novo)

Etapas (ou "all" = search + download + build + credits):
    python3 scripts/fetch_audio.py search      # busca candidatos e grava o cache
    python3 scripts/fetch_audio.py list        # mostra os candidatos (filtra licenças livres)
    python3 scripts/fetch_audio.py download    # baixa os arquivos usados em SELECTION
    python3 scripts/fetch_audio.py probe       # ffprobe/volumedetect dos arquivos baixados
    python3 scripts/fetch_audio.py build       # corta, normaliza e converte para .m4a
    python3 scripts/fetch_audio.py credits     # grava public/media/audio/credits.json
"""
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache")
CANDS = os.path.join(CACHE, "audio_candidates.json")
RAWDIR = os.path.join(CACHE, "audio_raw")
OUTDIR = os.path.join(ROOT, "public", "media", "audio")
CREDITS = os.path.join(OUTDIR, "credits.json")

AUDIO_EXT = (".ogg", ".oga", ".opus", ".wav", ".flac", ".mp3", ".webm", ".mid")
FREE_RE = re.compile(r"(cc[ -]?by|cc0|public domain|domínio público|pd|gfdl|fal|free art|attribution)", re.I)
NONFREE_RE = re.compile(r"(\bnc\b|non-?commercial|\bnd\b|no ?deriv|fair use|non-free)", re.I)

# Buscas no Commons (o filtro filetype:audio deixa só áudio)
QUERIES = [
    # português
    "torcida", "torcida cantando", "torcida futebol", "estádio", "estádio futebol", "Maracanã",
    "arquibancada", "gol torcida", "grito de gol", "hino clube", "apito árbitro", "apito",
    "canto torcida", "futebol", "jogo de futebol", "Mineirão", "Pacaembu", "Morumbi",
    # inglês
    "football crowd", "soccer crowd", "soccer fans chanting", "stadium crowd", "crowd cheering",
    "crowd cheering goal", "goal celebration", "football supporters", "football chant",
    "crowd", "stadium", "referee whistle", "whistle", "sports whistle", "crowd ooh",
    "crowd groan", "audience applause", "fans singing", "ultras", "football match",
    "soccer match", "football stadium ambience", "crowd ambience", "crowd noise",
    # espanhol
    "hinchada", "cancha", "hinchas cantando", "estadio fútbol", "afición", "barra brava",
    "silbato árbitro", "gol estadio",
    # clubes
    "Flamengo", "Corinthians", "Palmeiras", "Grêmio", "Internacional Porto Alegre",
    "Atlético Mineiro", "Cruzeiro", "Vasco da Gama", "Botafogo", "Fluminense", "São Paulo FC",
    "Santos FC", "Bahia", "Boca Juniors", "River Plate", "Peñarol", "Nacional Montevideo",
    "Colo-Colo", "Racing Club", "Independiente", "San Lorenzo", "Sport Recife", "Athletico Paranaense",
    "Fortaleza", "Ceará", "Vitória", "Coritiba", "Olimpia", "Cerro Porteño", "Alianza Lima",
    "Universitario", "Millonarios", "Atlético Nacional", "Barcelona SC", "LDU Quito",
]

# Categorias de áudio (com subcategorias até MAX_DEPTH)
CATEGORIES = [
    "Audio files of football", "Sounds of football", "Football chants", "Crowd sounds",
    "Audio files of stadiums", "Whistles", "Sounds of whistles", "Audio files of crowds",
    "Sounds of crowds", "Football songs", "Association football audio", "Audio files of sports",
    "Sounds of sports", "Cheering", "Sounds of cheering", "Applause", "Sounds of applause",
    "Audio files of association football", "Football supporters' chants", "Chants",
    "Referee whistles", "Sound effects", "Crowd noise", "Audio files of Brazil",
    "Audio files of Argentina", "Football anthems", "Club anthems",
]
MAX_DEPTH = 2

# Arquivos escolhidos -> saída. Cada item: arquivo do Commons, trecho (início, duração em s),
# taxa de bits, canais e se é um laço (crossfade do fim com o início para não "pular").
SELECTION: list[dict] = []

# Cantos de torcida por clube (id do jogo -> nome da saída em SELECTION)
CLUB_CHANTS: dict[str, str] = {}


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)


def strip_html(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def is_audio(title: str) -> bool:
    return title.lower().endswith(AUDIO_EXT)


def search_titles(query: str, limit=100) -> list[str]:
    out = []
    j = wm.api(wm.COMMONS_API, {"action": "query", "list": "search", "srnamespace": 6,
                                 "srsearch": f"{query} filetype:audio", "srlimit": limit})
    for it in (j or {}).get("query", {}).get("search", []):
        out.append(it["title"])
    return out


def category_files(cat: str, depth=0, seen=None) -> list[str]:
    seen = seen if seen is not None else set()
    if cat in seen:
        return []
    seen.add(cat)
    files, cont = [], {}
    while True:
        j = wm.api(wm.COMMONS_API, {"action": "query", "list": "categorymembers",
                                     "cmtitle": f"Category:{cat}", "cmtype": "file|subcat",
                                     "cmlimit": 500, **cont})
        if not j:
            break
        for m in j.get("query", {}).get("categorymembers", []):
            t = m["title"]
            if m["ns"] == 6 and is_audio(t):
                files.append(t)
            elif m["ns"] == 14 and depth < MAX_DEPTH:
                files += category_files(t.split(":", 1)[1], depth + 1, seen)
        if "continue" not in j:
            break
        cont = j["continue"]
    return files


def file_meta(titles: list[str]) -> dict[str, dict]:
    out = {}
    for i in range(0, len(titles), 50):
        j = wm.api(wm.COMMONS_API, {"action": "query", "titles": "|".join(titles[i:i + 50]),
                                     "prop": "imageinfo|categories", "cllimit": 500,
                                     "iiprop": "url|size|mime|extmetadata|mediatype",
                                     "iiextmetadatafilter": "LicenseShortName|Artist|Credit|ImageDescription|UsageTerms|Attribution"})
        for p in (j or {}).get("query", {}).get("pages", []):
            ii = (p.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata", {})
            out[p["title"]] = {
                "duration": ii.get("duration"),
                "size": ii.get("size"),
                "mime": ii.get("mime"),
                "url": ii.get("descriptionurl"),
                "license": strip_html(md.get("LicenseShortName", {}).get("value")),
                "author": strip_html(md.get("Artist", {}).get("value")) or strip_html(md.get("Credit", {}).get("value")),
                "attribution": strip_html(md.get("Attribution", {}).get("value")),
                "desc": strip_html(md.get("ImageDescription", {}).get("value"))[:300],
                "cats": [c["title"].split(":", 1)[1] for c in p.get("categories", [])],
            }
    return out


def is_free(lic: str) -> bool:
    return bool(lic) and bool(FREE_RE.search(lic)) and not NONFREE_RE.search(lic)


def search():
    db = load(CANDS, {})
    found: dict[str, set] = {}
    for q in QUERIES:
        for t in search_titles(q):
            found.setdefault(t, set()).add(f"q:{q}")
        print(f"busca {q!r}: {len(found)} no total", flush=True)
    for c in CATEGORIES:
        for t in category_files(c):
            found.setdefault(t, set()).add(f"c:{c}")
        print(f"categoria {c!r}: {len(found)} no total", flush=True)
    titles = [t for t in found if is_audio(t)]
    new = [t for t in titles if t not in db]
    meta = file_meta(new)
    for t in titles:
        if t in meta:
            db[t] = meta[t]
        if t in db:
            db[t]["via"] = sorted(set(db[t].get("via", [])) | found[t])
    save(CANDS, db)
    print(f"{len(db)} candidatos gravados em {CANDS}")


def list_cands(pattern=""):
    db = load(CANDS, {})
    rx = re.compile(pattern, re.I) if pattern else None
    for t, m in sorted(db.items()):
        if not is_free(m.get("license", "")):
            continue
        blob = f"{t} {m.get('desc', '')} {' '.join(m.get('cats', []))}"
        if rx and not rx.search(blob):
            continue
        dur = m.get("duration") or 0
        print(f"{dur:7.1f}s {m.get('size', 0) / 1e6:6.2f}MB {m.get('license', '')[:14]:14} {t[5:]}"
              f"  | {m.get('desc', '')[:90]}")


def raw_path(title: str) -> str:
    return os.path.join(RAWDIR, wm.norm_file(title))


def download(titles=None):
    os.makedirs(RAWDIR, exist_ok=True)
    titles = titles or sorted({s["file"] for s in SELECTION})
    for t in titles:
        p = raw_path(t)
        if os.path.exists(p) and os.path.getsize(p) > 0:
            continue
        data = wm.download(t)
        if not data:
            print(f"falhou: {t}")
            continue
        with open(p, "wb") as f:
            f.write(data)
        print(f"baixado: {t} ({len(data) / 1e6:.2f} MB)", flush=True)


def probe(titles=None):
    names = titles or sorted(os.listdir(RAWDIR))
    for n in names:
        p = raw_path(n) if titles else os.path.join(RAWDIR, n)
        if not os.path.exists(p):
            continue
        info = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                               "format=duration:stream=codec_name,sample_rate,channels",
                               "-of", "compact=p=0:nk=1", p], capture_output=True, text=True).stdout
        vol = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", p, "-af", "volumedetect",
                              "-f", "null", "-"], capture_output=True, text=True).stderr
        mean = re.search(r"mean_volume: (\S+)", vol)
        peak = re.search(r"max_volume: (\S+)", vol)
        print(f"{os.path.basename(p)}: {info.strip().replace(chr(10), ' / ')} "
              f"mean={mean and mean.group(1)} max={peak and peak.group(1)}")


def build_one(s: dict):
    src = raw_path(s["file"])
    out = os.path.join(OUTDIR, s["out"])
    ss, dur = s.get("start", 0.0), s["dur"]
    fade = s.get("fade", 0.08)
    ch = s.get("channels", 2)
    br = s.get("bitrate", "80k")
    lufs = s.get("lufs", -16)
    pre = s.get("pre", "")  # filtros extras (passa-altas, etc.) antes do loudnorm
    chain = []
    if pre:
        chain.append(pre)
    chain.append(f"loudnorm=I={lufs}:TP=-1.5:LRA=11")
    if s.get("loop"):
        # Laço sem emenda: o fim (xf segundos) é misturado ao começo com crossfade.
        xf = s.get("xfade", 1.5)
        flt = (f"[0:a]atrim=start={ss}:duration={dur + xf},asetpts=PTS-STARTPTS,"
               f"aresample=44100,{','.join(chain)},asplit=2[a][b];"
               f"[a]atrim=start={xf}:duration={dur - xf},asetpts=PTS-STARTPTS[body];"
               f"[b]atrim=start=0:duration={xf},asetpts=PTS-STARTPTS,afade=t=in:d={xf}:curve=qsin[head];"
               f"[0:a]atrim=start={ss + dur}:duration={xf},asetpts=PTS-STARTPTS,"
               f"aresample=44100,{','.join(chain)},afade=t=out:d={xf}:curve=qsin[tail];"
               f"[tail][head]amix=inputs=2:normalize=0[seam];"
               f"[body][seam]concat=n=2:v=0:a=1[out]")
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src,
               "-filter_complex", flt, "-map", "[out]"]
    else:
        chain = [f"atrim=start={ss}:duration={dur}", "asetpts=PTS-STARTPTS", "aresample=44100",
                 *chain, f"afade=t=in:d={s.get('fadein', fade)}",
                 f"afade=t=out:st={max(0.0, dur - s.get('fadeout', fade * 4))}:d={s.get('fadeout', fade * 4)}"]
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src, "-af", ",".join(chain)]
    cmd += ["-ac", str(ch), "-ar", "44100", "-c:a", "aac", "-b:a", br, "-movflags", "+faststart", out]
    subprocess.run(cmd, check=True)
    print(f"{s['out']}: {os.path.getsize(out) / 1e3:.0f} kB")


def build():
    os.makedirs(OUTDIR, exist_ok=True)
    for s in SELECTION:
        build_one(s)
    total = sum(os.path.getsize(os.path.join(OUTDIR, f)) for f in os.listdir(OUTDIR) if f.endswith(".m4a"))
    print(f"total: {total / 1e6:.2f} MB")


def credits():
    db = load(CANDS, {})
    titles = sorted({s["file"] for s in SELECTION})
    missing = [t for t in titles if t not in db]
    if missing:
        db.update(file_meta(missing))
        save(CANDS, db)
    out = {}
    for s in SELECTION:
        m = db.get(s["file"], {})
        out[f"audio/{s['out']}"] = {
            "file": wm.norm_file(s["file"]),
            "author": m.get("attribution") or m.get("author") or "",
            "license": m.get("license") or "ver página do arquivo",
            "url": m.get("url") or f"https://commons.wikimedia.org/wiki/{wm.norm_file(s['file'])}",
        }
    save(CREDITS, out)
    print(f"{len(out)} créditos em {CREDITS}")


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "all"
    if step in ("search", "all"):
        search()
    if step == "list":
        list_cands(sys.argv[2] if len(sys.argv) > 2 else "")
    if step in ("download", "all"):
        download(sys.argv[2:] or None)
    if step == "probe":
        probe(sys.argv[2:] or None)
    if step in ("build", "all"):
        build()
    if step in ("credits", "all"):
        credits()


if __name__ == "__main__":
    main()
