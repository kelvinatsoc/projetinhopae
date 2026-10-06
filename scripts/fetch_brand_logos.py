# -*- coding: utf-8 -*-
"""
Logos oficiais de marcas (material esportivo e patrocinadores) e de competições.

Marcas: as fornecedoras/patrocinadores de src/data/sponsorsReal.json + o pool de marcas
das ofertas (src/engine/brands.json). Para cada marca procura o artigo na Wikipedia (en, depois pt),
pega a imagem principal do artigo (a logo da infobox) e baixa a miniatura PNG de 250px
(a Wikimedia já converte SVG→PNG), salva como WebP pequeno.

Logos são marcas registradas dos seus donos; uso pessoal, não publicado.

Saídas:
  public/media/brands/<slug>.webp     src/data/brandLogos.json {marca: "<slug>"}
  public/media/comps/<compId>.webp
  scripts/cache/credits_brands.json   créditos (lidos por build_media_index.py)
Uso: python3 scripts/fetch_brand_logos.py [brands|comps]
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import unicodedata

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache", "logos")
MEDIA = os.path.join(ROOT, "public", "media")
REAL = os.path.join(ROOT, "src", "data", "sponsorsReal.json")
POOL = os.path.join(ROOT, "src", "engine", "brands.json")
OUT = os.path.join(ROOT, "src", "data", "brandLogos.json")
CREDITS = os.path.join(ROOT, "scripts", "cache", "credits_brands.json")

# artigo da Wikipedia de cada marca quando o nome sozinho é ambíguo
TITLES = {
    "Nike": "Nike, Inc.", "adidas": "Adidas", "Puma": "Puma (brand)", "Umbro": "Umbro",
    "New Balance": "New Balance", "Kappa": "Kappa (company)", "Reebok": "Reebok", "Joma": "Joma",
    "Diadora": "Diadora", "Le Coq Sportif": "Le Coq Sportif", "Mizuno": "Mizuno Corporation",
    "Macron": "Macron (sportswear)", "Topper": "Topper (sports)", "Penalty": "Penalty (company)",
    "Volt": "pt:Volt Sport", "Athleta": "pt:Athleta (empresa)", "Lupo": "pt:Lupo (empresa)",
    "Hummel": "Hummel International", "Lotto": "Lotto Sport Italia", "Kelme": "Kelme", "Fila": "Fila (company)",
    "Marathon": "es:Marathon Sports",
    "Betano": "Betano", "Superbet": "Superbet", "Sportingbet": "Sportingbet", "Betfair": "Betfair",
    "Pixbet": "pt:Pixbet", "EstrelaBet": "pt:EstrelaBet", "Esportes da Sorte": "pt:Esportes da Sorte",
    "Betnacional": "pt:Betnacional", "KTO": "pt:KTO (empresa)", "Novibet": "Novibet", "Vbet": "VBET",
    "Betsson": "Betsson", "Banrisul": "Banrisul", "Caixa": "Caixa Econômica Federal",
    "Banco do Brasil": "Banco do Brasil", "BRB": "Banco de Brasília", "Nubank": "Nubank", "Itaú": "Itaú Unibanco",
    "Bradesco": "Banco Bradesco", "Banco Inter": "Banco Inter", "C6 Bank": "C6 Bank",
    "Mercado Livre": "Mercado Libre", "Azul": "Azul Brazilian Airlines", "LATAM": "LATAM Airlines Brasil",
    "Gol": "Gol Linhas Aéreas", "Claro": "Claro Brasil", "Vivo": "Vivo (telecommunications)", "TIM": "TIM Brasil",
    "Brahma": "Brahma beer", "Havaianas": "Havaianas", "Magalu": "Magazine Luiza", "Casas Bahia": "Casas Bahia",
    "Hapvida": "Hapvida", "Unimed": "Unimed", "Red Bull": "Red Bull", "Allianz": "Allianz",
    "Neo Química": "pt:Hypera Pharma", "MRV": "MRV Engenharia", "Ligga": "pt:Ligga Telecom", "Sicredi": "Sicredi",
    "Banpará": "pt:Banpará", "Antel": "Antel", "Tigo": "Tigo", "Banco Pichincha": "Banco Pichincha",
    "Pilsener": "es:Pilsener (Ecuador)", "Paceña": "es:Cerveza Paceña", "Kia Motors": "Kia", "Suzuki": "Suzuki",
    "BYD": "BYD Auto", "Leroy Merlin": "Leroy Merlin", "Snickers": "Snickers", "1xBet": "1xBet",
    "Aurora": "pt:Cooperativa Central Aurora Alimentos", "Guaraná Poty": "pt:Guaraná Poty", "Mondelez": "Mondelez International",
    "Blaze": "pt:Blaze (empresa)", "H2bet": "pt:H2bet", "Viva Sorte": "pt:Viva Sorte",
}
# arquivo exato na Commons quando o artigo não traz a logo
FILES = {
    "Betano": "Betano logo.svg", "Superbet": "Superbet Logo.svg", "Esportes da Sorte": "Esportes da Sorte.png",
    "EstrelaBet": "Estrela Bet logo.png", "Betnacional": "Betnacional-logo.png",
    "Penalty": "Logotipo da Penalty (2024).svg", "Athleta": "Athleta sportsbrand logo.png",
}
# imagens que não são a logo (foto da sede, logo do grupo, da federação)
BLOCK = {"BYD", "Kia Motors", "Tigo", "comp-est-MG", "comp-est-PR"}
COMPS = {
    "serieA": "Campeonato Brasileiro Série A", "serieB": "Campeonato Brasileiro Série B",
    "serieC": "Campeonato Brasileiro Série C", "copaBR": "Copa do Brasil",
    "liberta": "Copa Libertadores", "sula": "Copa Sudamericana",
    "est-SP": "Campeonato Paulista", "est-RJ": "Campeonato Carioca", "est-MG": "Campeonato Mineiro",
    "est-RS": "Campeonato Gaúcho", "est-PR": "Campeonato Paranaense", "est-SC": "Campeonato Catarinense",
    "est-GO": "Campeonato Goiano", "est-CE": "Campeonato Cearense", "est-PE": "Campeonato Pernambucano",
    "est-BA": "Campeonato Baiano", "est-PA": "Campeonato Paraense",
}
BAD = re.compile(r"(stadium|estadio|est[áa]dio|arena|map|flag|bandeira|headquarters|sede|building|photo|\.jpe?g$)", re.I)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        return d


def page_image(title):
    """(wiki, arquivo) da imagem principal do artigo, seguindo redirecionamentos."""
    wiki = "en"
    if ":" in title and title.split(":")[0] in ("pt", "es", "en"):
        wiki, title = title.split(":", 1)
    r = wm.api(f"https://{wiki}.wikipedia.org/w/api.php", {"action": "query", "titles": title, "redirects": 1,
                                                          "prop": "pageprops", "ppprop": "page_image|page_image_free"})
    for p in (r or {}).get("query", {}).get("pages", []):
        title = p.get("title", title)
        pp = p.get("pageprops", {})
        img = pp.get("page_image") or pp.get("page_image_free")
        if img and "logo" in img.lower():
            return wiki, img
    # imagens não livres (a maioria das logos) não viram page_image: lê o campo logo/image da infobox
    r = wm.get(f"https://{wiki}.wikipedia.org/w/index.php", {"title": title, "action": "raw"})
    text = r.text if r is not None and r.status_code == 200 else ""
    for key in ("logo", "logotipo", "logo_image", "image", "imagem", "imagen"):
        m = re.search(r"^\s*\|\s*" + key + r"\s*=\s*(?:\[\[)?(?:(?:File|Ficheiro|Arquivo|Imagem|Image|Archivo):)?([^|\]\n{}=]+\.(?:svg|png|gif))",
                      text, re.M | re.I)
        if m:
            return wiki, m.group(1).strip().replace(" ", "_")
    return wiki, None


def host(wiki):
    return "commons.wikimedia.org" if wiki == "commons" else f"{wiki}.wikipedia.org"


def license_of(wiki, name):
    r = wm.api(f"https://{host(wiki)}/w/api.php", {"action": "query", "titles": "File:" + name,
                                                          "prop": "imageinfo", "iiprop": "extmetadata|url"})
    for p in (r or {}).get("query", {}).get("pages", []):
        for ii in p.get("imageinfo", []):
            m = ii.get("extmetadata", {})
            return {"license": (m.get("LicenseShortName") or {}).get("value", "trademark"),
                    "author": re.sub(r"<[^>]+>", "", (m.get("Artist") or {}).get("value", "")) or "owner",
                    "url": ii.get("descriptionurl", "")}
    return {"license": "trademark", "author": "owner", "url": ""}


def fetch(key, title, dest, wide=False, logo_only=True):
    os.makedirs(CACHE, exist_ok=True)
    memo = os.path.join(CACHE, slug(key) + ".json")
    if key in BLOCK:
        return None
    info = jload(memo, None)
    if info is None and key in FILES:
        info = {"wiki": "commons", "file": FILES[key].replace(" ", "_")}
        json.dump(info, open(memo, "w"))
    if info is None:
        wiki, name = page_image(title)
        if not name and ":" not in title:
            for alt in ("pt:" + title, "pt:" + title + " de Futebol"):
                wiki, name = page_image(alt)
                if name:
                    break
        info = {"wiki": wiki, "file": name}
        json.dump(info, open(memo, "w"))
    name = info.get("file")
    if not name or ("logo" not in name.lower() and (not name.lower().endswith((".svg", ".png")) or BAD.search(name))):
        return None
    if os.path.exists(dest):
        return info
    data = wm.download(name, 250, host(info["wiki"]))
    if not data:
        return None
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    im.thumbnail((160, 160) if not wide else (200, 200))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    im.save(dest, "WEBP", quality=88, method=6)
    info.update(license_of(info["wiki"], name))
    json.dump(info, open(memo, "w"))
    return info


def brands():
    real = jload(REAL, {})
    pool = jload(POOL, {})
    names = set()
    for v in real.values():
        names.update(x for x in (v.get("kit"), v.get("shirt")) if x)
    for k in ("kit", "shirt", "stadium"):
        names.update(x if isinstance(x, str) else x["logo"] for x in pool.get(k, []))
    names.update(pool.get("stadiumBrands", {}).values())
    out, credits = {}, jload(CREDITS, {})
    for n in sorted(names):
        title = TITLES.get(n)
        if not title:
            continue  # sem artigo conferido: melhor sem logo que com a logo errada
        s = slug(n)
        info = fetch(n, title, os.path.join(MEDIA, "brands", s + ".webp"))
        if info:
            out[n] = s
            credits[f"brands/{s}.webp"] = {"file": info["file"], "author": info.get("author", "owner"),
                                           "license": info.get("license", "trademark"), "url": info.get("url", "")}
            print("ok", n)
        else:
            print("--", n)
    json.dump(dict(sorted(out.items())), open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(credits, open(CREDITS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(out), "logos de marcas")


def comps():
    credits = jload(CREDITS, {})
    for cid, title in COMPS.items():
        info = fetch("comp-" + cid, title, os.path.join(MEDIA, "comps", cid + ".webp"), wide=True, logo_only=False)
        print("ok" if info else "--", cid, info and info.get("file"))
        if info:
            credits[f"comps/{cid}.webp"] = {"file": info["file"], "author": info.get("author", "owner"),
                                            "license": info.get("license", "trademark"), "url": info.get("url", "")}
    json.dump(credits, open(CREDITS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    what = sys.argv[1:] or ["brands", "comps"]
    if "comps" in what:
        comps()
    if "brands" in what:
        brands()
