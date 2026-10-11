"""Baixa as logos oficiais das competições (Wikipedia/Commons) em alta resolução.

Lê o infobox do artigo (index.php?action=raw), pega o campo logo/image e baixa o arquivo
por Special:FilePath (SVG renderizado em PNG grande pelo próprio servidor da Wikimedia).
Saída: public/media/comps/<id>.webp (512 px no lado maior, com transparência).

Uso: WM_INTERVAL=4 python3 scripts/fetch_comp_logos.py [ids...]
"""
from __future__ import annotations

import io
import os
import re
import sys
import urllib.parse

os.environ.setdefault("WM_INTERVAL", "4")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "media", "comps")
SIZE = 512

# id da competição -> (artigo da Wikipedia em inglês, arquivo forçado opcional)
ARTICLES: dict[str, tuple[str, str | None]] = {
    "serieA": ("Campeonato Brasileiro Série A", None),
    "serieB": ("Campeonato Brasileiro Série B", None),
    "serieC": ("Campeonato Brasileiro Série C", None),
    "serieD": ("Campeonato Brasileiro Série D", None),
    "copaBR": ("Copa do Brasil", None),
    "supercopa": ("Supercopa do Brasil", None),
    "liberta": ("Copa Libertadores", None),
    "sula": ("Copa Sudamericana", None),
    "recopa": ("Recopa Sudamericana", None),
    "est-SP": ("Campeonato Paulista", "LOGO PAULISTÃO 2024.svg"),
    "est-RJ": ("Campeonato Carioca", None),
    "est-MG": ("Campeonato Mineiro", None),
    "est-RS": ("Campeonato Gaúcho", None),
    "est-PR": ("Campeonato Paranaense", None),
    "est-SC": ("Campeonato Catarinense", "Campeonatocatarinense2026.jpg"),
    "est-GO": ("Campeonato Goiano", None),
    "est-CE": ("Campeonato Cearense", None),
    "est-PE": ("Campeonato Pernambucano", None),
    "est-BA": ("Campeonato Baiano", None),
    "est-PA": ("Campeonato Paraense", "Parazão 2026 logo.jpg"),
    "ucl": ("UEFA Champions League", None),
    "uel": ("UEFA Europa League", None),
    "uecl": ("UEFA Conference League", None),
    "eng1": ("Premier League", "Premier League Logo.svg"),
    "esp1": ("La Liga", None),
    "ita1": ("Serie A", None),
    "ger1": ("Bundesliga", None),
    "fra1": ("Ligue 1", None),
    "por1": ("Primeira Liga", None),
    "ned1": ("Eredivisie", None),
    "tur1": ("Süper Lig", None),
    "sco1": ("Scottish Premiership", None),
    "arg1": ("Argentine Primera División", None),
    "ksa1": ("Saudi Pro League", None),
    "jpn1": ("J1 League", None),
    "usa1": ("Major League Soccer", None),
    "wc": ("FIFA World Cup", "2026 FIFA World Cup emblem.svg"),
    "wcq": ("FIFA World Cup qualification", None),
    "ca": ("Copa América", "Conmebol Copa America 2024 Logo.svg"),
    "euro": ("UEFA European Championship", "UEFA Euro 2024 logo.svg"),
    "cwc": ("FIFA Club World Cup", None),
    "intercontinental": ("FIFA Intercontinental Cup", None),
    "acle": ("AFC Champions League Elite", None),
}

FIELD = re.compile(r"^\s*\|\s*(logo|image|current_logo|imagem|logotipo)\s*=\s*(.+?)\s*$", re.I | re.M)


def raw(title: str, depth: int = 0, wiki: str = "en.wikipedia.org") -> str | None:
    r = wm.get(f"https://{wiki}/w/index.php", {"title": title, "action": "raw"})
    if r is None or r.status_code != 200:
        return None
    m = re.match(r"#REDIRECT\s*\[\[([^\]#|]+)", r.text, re.I)
    if m and depth < 3:
        return raw(m.group(1), depth + 1, wiki)
    return r.text


def logo_file(text: str) -> str | None:
    for _, val in FIELD.findall(text):
        val = re.sub(r"<!--.*?-->", "", val).strip()
        m = re.search(r"\[\[(?:File|Image):([^|\]]+)", val, re.I)
        name = m.group(1) if m else val.split("|")[0]
        name = name.strip()
        if re.search(r"\.(svg|png|jpe?g|webp|gif)$", name, re.I):
            return name
    return None


def fetch(name: str) -> bytes | None:
    # tenta Commons e depois a Wikipedia (arquivos de uso restrito ficam lá)
    for wiki in ("en.wikipedia.org", "commons.wikimedia.org", "pt.wikipedia.org"):
        for width in ((1280, 500) if name.lower().endswith(".svg") else (960, None)):
            u = f"https://{wiki}/wiki/Special:FilePath/{urllib.parse.quote(wm.norm_file(name))}"
            if width:
                u += f"?width={width}"
            r = wm.get(u)
            if r is not None and r.status_code == 200 and r.headers.get("content-type", "").startswith("image/") \
                    and "svg" not in r.headers.get("content-type", ""):
                return r.content
    return None


def save(cid: str, data: bytes) -> None:
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((SIZE, SIZE), Image.LANCZOS)
    # quadro quadrado com margem mínima: o CSS usa object-fit: contain
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq.save(os.path.join(OUT, f"{cid}.webp"), "WEBP", quality=94, method=6)


def main(ids: list[str]) -> None:
    os.makedirs(OUT, exist_ok=True)
    for cid in ids or list(ARTICLES):
        art, forced = ARTICLES[cid]
        name = forced
        if not name:
            text = raw(art)
            name = logo_file(text or "")
            if not name and cid.startswith("est-"):
                # estaduais: o infobox da Wikipedia em português costuma ter a logo (no Commons)
                name = logo_file(raw(art + " de Futebol", wiki="pt.wikipedia.org") or "")
        if not name:
            print(f"{cid}: sem logo no artigo {art}", flush=True)
            continue
        data = fetch(name)
        if not data:
            print(f"{cid}: falhou ao baixar {name}", flush=True)
            continue
        save(cid, data)
        print(f"{cid}: ok {name} ({len(data)} B)", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
