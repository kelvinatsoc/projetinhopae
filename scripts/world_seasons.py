# -*- coding: utf-8 -*-
"""Descobre os clubes de cada liga 2026/27 a partir do artigo da temporada na Wikipedia.

Saída: scripts/cache/world/seasons.json  {liga: [título do artigo do clube, ...]}
Uso: python3 scripts/world_seasons.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from world_http import CACHE, wiki_raw  # noqa: E402

SEASONS = {
    "eng1": "2026–27 Premier League", "esp1": "2026–27 La Liga", "ita1": "2026–27 Serie A",
    "ger1": "2026–27 Bundesliga", "fra1": "2026–27 Ligue 1", "por1": "2026–27 Primeira Liga",
    "ned1": "2026–27 Eredivisie", "tur1": "2026–27 Süper Lig", "sco1": "2026–27 Scottish Premiership",
    "arg1": "2026 Argentine Primera División", "ksa1": "2026–27 Saudi Pro League",
    "jpn1": "2026–27 J1 League", "usa1": "2026 Major League Soccer season",
}
CLUBISH = re.compile(r"F\.C\.|FC|C\.F\.|CF|S\.C\.|SC|A\.C\.|AC|S\.K\.|SK|Club|Calcio|United|City|Athletic|Rovers|"
                     r"Wanderers|Albion|Hotspur|Villa|Palace|Forest|Spor|Real|Atlético|Sporting|Benfica|Porto|"
                     r"Olympique|Stade|Racing|Borussia|Bayer|Bayern|Eintracht|VfB|VfL|TSG|SV|1\.|Hertha|Werder|"
                     r"Union|Ajax|PSV|Feyenoord|AZ|Twente|Celtic|Rangers|Hearts|Hibernian|Al[- ]|Kashima|Urawa|"
                     r"Vissel|Kawasaki|Sanfrecce|Gamba|Cerezo|Yokohama|Nagoya|Inter|Galaxy|Sounders|Toronto|"
                     r"Vancouver|Revolution|Dynamo|Timbers|Crew|Fire|Earthquakes|Minnesota|Orlando|Austin|"
                     r"Nashville|Charlotte|Atlanta|Philadelphia|D\.C\.|Sporting Kansas|Colorado|Real Salt|"
                     r"San Diego|St\. Louis|Houston|Dallas|Montréal|New York|Los Angeles|Cincinnati|Seattle|"
                     r"Juventud|Boca|River|Independiente|Estudiantes|Gimnasia|Huracán|Lanús|Talleres|Belgrano|"
                     r"Vélez|Newell|Rosario|Godoy|Tigre|Platense|Banfield|Barracas|Sarmiento|Unión|Instituto|"
                     r"Aldosivi|Riestra|Argentinos|San Lorenzo|Defensa|Central|Atlético|Gremio|Estrela", re.I)


def section(text, names):
    heads = [(m.start(), m.group(2).strip()) for m in re.finditer(r"^(={2,4})\s*(.*?)\s*\1\s*$", text, re.M)]
    for i, (pos, h) in enumerate(heads):
        if any(n in h.lower() for n in names):
            lvl = None
            end = len(text)
            for pos2, _ in heads[i + 1:]:
                end = pos2
                break
            # inclui subseções enquanto o nome continuar relevante
            j = i + 1
            while j < len(heads) and any(n in heads[j][1].lower() for n in names + ["location", "personnel", "stadium"]):
                end = heads[j + 1][0] if j + 1 < len(heads) else len(text)
                j += 1
            return text[pos:end]
    return ""


def teams_of(text):
    locs = []
    for m in re.finditer(r"Location map~[^\n]*?label\s*=\s*[^\n]*?\[\[([^\]|#]+)", text):
        t = m.group(1).strip()
        if t not in locs and not re.search(r"(Stadium|Stadion|Estadio|Arena|Park)", t):
            locs.append(t)
    if len(locs) >= 8:
        return locs
    return teams_table(text)


def teams_table(text):
    sec = section(text, ["stadiums and locations", "teams", "clubs", "personnel", "participating"])
    if not sec:
        return []
    out = []
    for row in re.split(r"\n\|-", sec):
        cells = [c for c in re.split(r"\n\s*[|!]", row) if c.strip()]
        for c in cells[:2]:
            m = re.search(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]", c)
            if m and CLUBISH.search(m.group(1)) and not re.search(r"(Stadium|Stadion|Estadio|Estádio|Arena|Park|"
                                                                   r"Ground|season|League|Liga|Field|Stade)", m.group(1)):
                t = m.group(1).strip()
                if t not in out:
                    out.append(t)
                break
    return out


def main():
    res = {}
    for k, t in SEASONS.items():
        text, ft = wiki_raw(t)
        res[k] = teams_of(text or "")
        print(k, ft, len(res[k]), res[k])
    json.dump(res, open(os.path.join(CACHE, "seasons.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
