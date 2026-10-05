# -*- coding: utf-8 -*-
"""
Fornecedora de material e patrocinador master reais (2025/26) de cada clube.

Fontes: infobox da Wikipedia em português (campos "material" e "patrocinio") para clubes
brasileiros e da Wikipedia em espanhol ("patrocinador", "marca"/"proveedor") para os demais.
Depois aplica SPONSOR_FIX (conferência manual dos principais clubes) e normaliza os nomes
das marcas. Cache de wikitexto em scripts/cache/sponsors/.

Saída: src/data/sponsorsReal.json  {clubId: {kit?, shirt?, stadium?, src}}
Uso: python3 scripts/fetch_sponsors.py
"""
from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402
from clubs_catalog import ALL_CLUBS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache", "sponsors")
OUT = os.path.join(ROOT, "src", "data", "sponsorsReal.json")

# conferência manual (2025/26) dos clubes de maior exposição, onde a infobox costuma atrasar.
# "stadium" só onde existe naming rights de verdade.
SPONSOR_FIX = {
    "flamengo": {"kit": "adidas", "shirt": "Betano"},
    "palmeiras": {"kit": "Puma", "shirt": "Sportingbet", "stadium": "Allianz Parque"},
    "corinthians": {"kit": "Nike", "shirt": "Esportes da Sorte", "stadium": "Neo Química Arena"},
    "sao-paulo": {"kit": "New Balance", "shirt": "Superbet", "stadium": "MorumBIS"},
    "atletico-mg": {"stadium": "Arena MRV"},
    "athletico-pr": {"stadium": "Ligga Arena"},
    "gremio": {"shirt": "Banrisul"},
    "internacional": {"kit": "adidas", "shirt": "Banrisul"},
    "fluminense": {"kit": "Umbro", "shirt": "Superbet"},
    "vasco": {"kit": "Kappa", "shirt": "Betfair"},
    "fortaleza": {"kit": "Leão 1918"},
    "coritiba": {"kit": "Diadora"},
    "vitoria": {"kit": "Volt"},
}
STADIUM_NAMING = {"Allianz Parque", "Neo Química Arena", "MorumBIS", "Arena MRV", "Ligga Arena", "Nubank Parque"}

# grafias oficiais
BRAND_NORM = {
    "adidas": "adidas", "nike": "Nike", "puma": "Puma", "umbro": "Umbro", "new balance": "New Balance",
    "kappa": "Kappa", "volt": "Volt", "volt sport": "Volt", "reebok": "Reebok", "joma": "Joma",
    "diadora": "Diadora", "le coq sportif": "Le Coq Sportif", "macron": "Macron", "hummel": "Hummel",
    "topper": "Topper", "penalty": "Penalty", "betano": "Betano", "superbet": "Superbet",
    "sportingbet": "Sportingbet", "betfair": "Betfair", "pixbet": "Pixbet", "estrela bet": "EstrelaBet",
    "estrelabet": "EstrelaBet", "esportes da sorte": "Esportes da Sorte",
    "vbet": "Vbet", "betnacional": "Betnacional", "kto": "KTO", "parimatch": "Parimatch",
    "banrisul": "Banrisul", "caixa": "Caixa", "banco do brasil": "Banco do Brasil", "bmg": "BMG",
    "charrua": "Charrua", "athleta": "Athleta", "lupo": "Lupo", "magnum": "Magnum",
}


def safe(t):
    return re.sub(r"[^\w\-]+", "_", t)


def raw(wiki, title):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"{wiki}_{safe(title)}.txt")
    if os.path.exists(p):
        return open(p, encoding="utf-8").read()
    text = ""
    for _ in range(3):
        r = wm.get(f"https://{wiki}.wikipedia.org/w/index.php", {"title": title, "action": "raw"})
        text = r.text if r is not None and r.status_code == 200 else ""
        m = re.match(r"\s*#(?:REDIRECT|REDIRECIONAMENTO|REDIRECCIÓN)\s*\[\[([^\]|#]+)", text, re.I)
        if not m:
            break
        title = m.group(1).strip()
    open(p, "w", encoding="utf-8").write(text)
    return text


def titles():
    p = os.path.join(CACHE, "titles.json")
    if os.path.exists(p):
        return json.load(open(p))
    os.makedirs(CACHE, exist_ok=True)
    out = {}
    clubs = list(ALL_CLUBS)
    for i in range(0, len(clubs), 40):
        batch = clubs[i:i + 40]
        r = wm.api(wm.WIKIDATA_API, {"action": "wbgetentities", "sites": "enwiki",
                                     "titles": "|".join(c["wiki"] for c in batch), "props": "sitelinks",
                                     "sitefilter": "enwiki|ptwiki|eswiki", "redirects": "yes"})
        by = {}
        for e in (r or {}).get("entities", {}).values():
            sl = e.get("sitelinks", {})
            if "enwiki" in sl:
                by[sl["enwiki"]["title"]] = {k[:2]: v["title"] for k, v in sl.items()}
        for c in batch:
            out[c["id"]] = by.get(c["wiki"].replace("_", " "), {"en": c["wiki"]})
    json.dump(out, open(p, "w"), ensure_ascii=False, indent=1)
    return out


def field(text, names):
    for n in names:
        m = re.search(r"^\s*\|\s*" + n + r"\s*=([^\n]*)", text, re.M | re.I)
        if m and m.group(1).strip():
            return m.group(1)
    return None


def clean(v):
    if not v:
        return None
    v = re.sub(r"<ref[^>]*/>|<ref.*?</ref>|<ref.*$", "", v, flags=re.S)
    v = re.sub(r"\{\{(?:pequeno|small|nowrap)\|([^{}]*)\}\}", r"\1", v, flags=re.I)
    v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    v = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"\[https?://\S+\s*([^\]]*)\]", r"\1", v)
    v = re.split(r"<br\s*/?>|,|;|/| e | y | & ", v)[0]
    v = re.sub(r"<[^>]+>|'''?|\(.*?\)|\(.*$", "", v).strip(" .:-*")
    if not v or len(v) > 32 or v.lower() in ("nenhum", "nenhuma", "ninguno", "sem patrocínio", "-", "—", "n/a"):
        return None
    return BRAND_NORM.get(v.lower(), v)


def build():
    t = titles()
    out = {}
    for c in ALL_CLUBS:
        cid = c["id"]
        tl = t.get(cid, {})
        rec = {}
        for wiki in (["pt", "es"] if c["div"] != "F" else ["es", "pt"]):
            if not tl.get(wiki):
                continue
            text = raw(wiki, tl[wiki])
            kit = clean(field(text, ["material", "fornecedor", "marca", "proveedor", "patrocinador_técnico"]))
            shirt = clean(field(text, ["patrocinio", "patrocínio", "patrocinador", "patrocinador_principal"]))
            if kit or shirt:
                rec = {"kit": kit, "shirt": shirt, "src": f"{wiki}wiki:{tl[wiki]}"}
                break
        if cid in SPONSOR_FIX:
            rec.update(SPONSOR_FIX[cid])
            rec["src"] = (rec.get("src") or "") + "+manual"
        out[cid] = {k: v for k, v in rec.items() if v}
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    miss = [k for k, v in out.items() if not v.get("kit") or not v.get("shirt")]
    print(f"{len(out)} clubes; incompletos: {len(miss)} {miss}")


if __name__ == "__main__":
    build()
