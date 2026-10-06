# -*- coding: utf-8 -*-
"""
Clubes reais que só disputam os estaduais (fora da pirâmide nacional A–C do jogo).

Entram no banco com "minor": <UF> (não contam na Série D, que mantém o tamanho) e substituem os
antigos clubes fictícios. Campos extras em relação a clubs_catalog.py:
  rs     chave do clube em scripts/data/estaduais_src/real-squads.json (elenco 2026 do oGol,
         vindo do projeto Arquibancada do dono do jogo) — None = sem elenco empacotado
  pt     título do artigo na Wikipedia em português (usado quando não há artigo em inglês e para
         buscar a predefinição "Elenco" do clube)
  sd     disputa a Série D 2026 (en.wikipedia "2026 Campeonato Brasileiro Série D")
  ground (nome, capacidade) provisórios, quando o Wikidata não tiver o estádio

Força: Série D 2026 -> level 50–54; só estadual -> 48–51. rep 10–40 (tradição/torcida).
Cores None -> extraídas do escudo oficial (build_database.py).

Fonte do elenco, nesta ordem: real-squads (rs) -> "Elenco" da pt.wiki -> elenco gerado no jogo
com semente fixa pelo id do clube (flag "gs" no banco).
"""


def E(id, name, full, abbr, uf, city, level, rep, rs=None, wiki=None, pt=None, sd=False, colors=None, ground=None):
    return dict(id=id, name=name, full=full, abbr=abbr, region=uf, city=city, div="D", level=level, rep=rep,
                colors=colors, crest="solid", wiki=wiki or full, pt=pt or full, rs=rs, sd=sd, minor=uf,
                ground=ground)


ESTADUAL_CLUBS = [
    # ---------------- com elenco 2026 (real-squads) ----------------
    E("moto-club", "Moto Club", "Moto Club de São Luís", "MOT", "MA", "São Luís", 53, 40, "-47", sd=True, colors=["#C8102E", "#111111"], ground=("Nhozinho Santos", 13000)),
    E("campinense", "Campinense", "Campinense Clube", "CAM", "PB", "Campina Grande", 51, 38, "-51", colors=["#C8102E", "#111111"], ground=("Amigão", 19000)),
    E("sergipe", "Sergipe", "Club Sportivo Sergipe", "SER", "SE", "Aracaju", 52, 34, "-54", sd=True, colors=["#C8102E", "#FFFFFF"], ground=("Batistão", 15575)),
    E("sao-jose-rs", "São José-RS", "Esporte Clube São José", "SJO", "RS", "Porto Alegre", 53, 30, "-59", sd=True, ground=("Passo d'Areia", 16000)),
    E("agua-santa", "Água Santa", "Esporte Clube Água Santa", "AGS", "SP", "Diadema", 53, 26, "-64", sd=True, ground=("Distrital do Inamar", 10000)),
    E("bangu", "Bangu", "Bangu Atlético Clube", "BAN", "RJ", "Rio de Janeiro", 50, 36, "-67", colors=["#C8102E", "#FFFFFF"], ground=("Moça Bonita", 9024)),
    E("boavista-rj", "Boavista", "Boavista Sport Club", "BOA", "RJ", "Saquarema", 52, 24, "-68", sd=True, ground=("Elcyr Resende", 8000)),
    E("madureira", "Madureira", "Madureira Esporte Clube", "MAD", "RJ", "Rio de Janeiro", 52, 32, "-70", sd=True, colors=["#FFD100", "#7A1F1F", "#0033A0"], ground=("Conselheiro Galvão", 5000)),
    E("resende", "Resende", "Resende Futebol Clube", "RES", "RJ", "Resende", 49, 18, "-71", ground=("Estádio do Trabalhador", 7400)),
    E("uberlandia", "Uberlândia", "Uberlândia Esporte Clube", "UEC", "MG", "Uberlândia", 52, 32, "-74", sd=True, colors=["#007A33", "#FFFFFF"], ground=("Parque do Sabiá", 53350)),
    E("pouso-alegre", "Pouso Alegre", "Pouso Alegre Futebol Clube", "PAF", "MG", "Pouso Alegre", 52, 22, "-75", sd=True, ground=("Manduzão", 13000)),
    E("aparecidense", "Aparecidense", "Associação Atlética Aparecidense", "APA", "GO", "Aparecida de Goiânia", 53, 26, "-77", sd=True, ground=("Annibal Batista de Toledo", 6000)),
    E("brasiliense", "Brasiliense", "Brasiliense Futebol Clube", "BSE", "DF", "Taguatinga", 51, 34, "-78", ground=("Boca do Jacaré", 27000)),
    E("gama", "Gama", "Sociedade Esportiva do Gama", "GAM", "DF", "Gama", 52, 36, "-79", sd=True, colors=["#007A33", "#FFFFFF"], ground=("Bezerrão", 20310)),
    E("altos", "Altos", "Associação Atlética de Altos", "ALT", "PI", "Altos", 52, 22, "-80", sd=True, ground=("Lindolfo Monteiro", 6000)),
    E("river-pi", "River-PI", "River Atlético Clube", "RIV", "PI", "Teresina", 50, 28, "-81", ground=("Albertão", 44200)),
    E("tocantinopolis", "Tocantinópolis", "Tocantinópolis Esporte Clube", "TOC", "TO", "Tocantinópolis", 50, 16, "-82", sd=True, ground=("Ribeirão", 3000)),
    E("capital-to", "Capital-TO", "Capital Futebol Clube", "CAP", "TO", "Palmas", 50, 16, "-83", wiki="Capital Futebol Clube (Tocantins)", pt="Capital Futebol Clube (Tocantins)", ground=("Nilton Santos", 12000)),
    E("rio-branco-ac", "Rio Branco-AC", "Rio Branco Football Club", "RBA", "AC", "Rio Branco", 49, 26, "-84", ground=("Arena da Floresta", 20000)),
    E("humaita", "Humaitá", "Sport Clube Humaitá", "HUM", "AC", "Porto Acre", 49, 14, "-85", sd=True, ground=("Arena da Floresta", 20000)),
    E("trem", "Trem", "Trem Desportivo Clube", "TRE", "AP", "Macapá", 49, 18, "-86", sd=True, ground=("Zerão", 13680)),
    E("santos-ap", "Santos-AP", "Santos Futebol Clube (AP)", "SAP", "AP", "Macapá", 48, 16, "-87", pt="Santos Futebol Clube (Amapá)", ground=("Zerão", 13680)),
    E("manaus", "Manaus", "Manaus Futebol Clube", "MAN", "AM", "Manaus", 53, 28, "-88", sd=True, ground=("Arena da Amazônia", 44000)),
    E("sao-raimundo-am", "São Raimundo-AM", "São Raimundo Esporte Clube", "SRA", "AM", "Manaus", 49, 24, "-90", wiki="São Raimundo Esporte Clube (AM)", pt="São Raimundo Esporte Clube (Amazonas)", ground=("Colina", 10400)),
    E("nacional-am", "Nacional-AM", "Nacional Futebol Clube", "NAC", "AM", "Manaus", 51, 30, "-91", sd=True, pt="Nacional Futebol Clube (Amazonas)", ground=("Arena da Amazônia", 44000)),
    E("porto-velho", "Porto Velho", "Porto Velho Esporte Clube", "PVE", "RO", "Porto Velho", 50, 16, "-92", sd=True, ground=("Aluízio Ferreira", 7000)),
    E("ji-parana", "Ji-Paraná", "Ji-Paraná Futebol Clube", "JIP", "RO", "Ji-Paraná", 48, 14, "-93", ground=("Biancão", 5000)),
    E("sao-raimundo-rr", "São Raimundo-RR", "São Raimundo Esporte Clube", "SRR", "RR", "Boa Vista", 49, 14, "-94", wiki="São Raimundo Esporte Clube (RR)", sd=True, pt="São Raimundo Esporte Clube (Roraima)", ground=("Canarinho", 6000)),
    E("gas", "GAS", "Grêmio Atlético Sampaio", "GAS", "RR", "Boa Vista", 49, 12, "-95", sd=True, ground=("Canarinho", 6000)),
    E("rio-branco-es", "Rio Branco-ES", "Rio Branco Atlético Clube", "RBE", "ES", "Cariacica", 51, 28, "-96", sd=True, colors=["#111111", "#FFFFFF"], ground=("Kleber Andrade", 21000)),
    E("desportiva", "Desportiva", "Desportiva Ferroviária", "DES", "ES", "Cariacica", 49, 24, "-97", ground=("Engenheiro Araripe", 7700)),
    E("mixto", "Mixto", "Mixto Esporte Clube", "MIX", "MT", "Cuiabá", 51, 26, "-98", sd=True, colors=["#111111", "#FFFFFF"], ground=("Dutrinha", 5000)),
    E("uniao-rondonopolis", "União Rondonópolis", "União Esporte Clube", "URO", "MT", "Rondonópolis", 51, 18, "-99", sd=True, ground=("Luthero Lopes", 9000)),
    E("operario-ms", "Operário-MS", "Operário Futebol Clube", "OMS", "MS", "Campo Grande", 50, 24, "-100", wiki="Operário Futebol Clube (MS)", sd=True, pt="Operário Futebol Clube (Mato Grosso do Sul)", colors=["#111111", "#FFFFFF"], ground=("Morenão", 45000)),
    E("dourados", "Dourados", "Dourados Atlético Clube", "DOU", "MS", "Dourados", 48, 12, "-101", ground=("Douradão", 10000)),
    E("juazeirense", "Juazeirense", "Sociedade Desportiva Juazeirense", "JUA", "BA", "Juazeiro", 52, 24, "-102", sd=True, ground=("Adauto Moraes", 6000)),
    E("duque-de-caxias", "Duque de Caxias", "Duque de Caxias Futebol Clube", "DUQ", "RJ", "Duque de Caxias", 49, 18, "-103", ground=("Marrentão", 8000)),
    E("lagarto", "Lagarto", "Lagarto Futebol Clube", "LAG", "SE", "Lagarto", 51, 18, "-104", sd=True, ground=("Barretão", 6000)),
    E("retro", "Retrô", "Retrô Futebol Clube Brasil", "RET", "PE", "Camaragibe", 54, 26, "-105", sd=True, ground=("Arena de Pernambuco", 44300)),
    E("atletico-ba", "Atlético de Alagoinhas", "Alagoinhas Atlético Clube", "AAC", "BA", "Alagoinhas", 52, 22, "-106", sd=True, ground=("Carneirão", 7000)),

    # ---------------- estaduais 2026 sem elenco empacotado (pt.wiki ou gerado) ----------------
    # Cearense
    E("iguatu", "Iguatu", "Associação Desportiva Iguatu", "IGU", "CE", "Iguatu", 51, 16, sd=True),
    E("maracana-ce", "Maracanã", "Maracanã Esporte Clube", "MEC", "CE", "Maracanaú", 51, 14, sd=True),
    E("tirol", "Tirol", "Centro de Formação de Atletas Tirol", "TIR", "CE", "Fortaleza", 50, 10, sd=True),
    E("horizonte", "Horizonte", "Horizonte Futebol Clube", "HFC", "CE", "Horizonte", 49, 12),
    # Pernambucano
    E("decisao", "Decisão", "Decisão Goiana Futebol Clube", "DEC", "PE", "Goiana", 50, 10, sd=True),
    E("jaboatao", "Jaboatão", "Associação Desportiva Jaboatão dos Guararapes", "JAB", "PE", "Jaboatão dos Guararapes", 49, 12),
    E("maguary", "Maguary", "Associação Atlética Maguary", "MAG", "PE", "Bonito", 50, 12, sd=True),
    E("vitoria-tabocas", "Vitória das Tabocas", "Associação Acadêmica e Desportiva Vitória das Tabocas", "VDT", "PE", "Vitória de Santo Antão", 49, 12),
    # Baiano
    E("jacuipense", "Jacuipense", "Esporte Clube Jacuipense", "JAC", "BA", "Riachão do Jacuípe", 51, 16, sd=True),
    E("porto-ba", "Porto", "Porto Sport Club", "PSC", "BA", "Porto Seguro", 50, 12, sd=True),
    E("bahia-de-feira", "Bahia de Feira", "Associação Desportiva Bahia de Feira", "BDF", "BA", "Feira de Santana", 50, 18),
    E("galicia", "Galícia", "Galícia Esporte Clube", "GAL", "BA", "Salvador", 49, 16),
    # Paraense
    E("tuna-luso", "Tuna Luso", "Tuna Luso Brasileira", "TUN", "PA", "Belém", 51, 30, sd=True),
    E("aguia-maraba", "Águia de Marabá", "Águia de Marabá Futebol Clube", "AGU", "PA", "Marabá", 51, 22, sd=True),
    E("cameta", "Cametá", "Cametá Sport Club", "CMT", "PA", "Cametá", 50, 16),
    E("castanhal", "Castanhal", "Castanhal Esporte Clube", "CAS", "PA", "Castanhal", 50, 16),
    E("bragantino-pa", "Bragantino-PA", "Bragantino Clube do Pará", "BRP", "PA", "Bragança", 49, 14),
    E("amazonia-pa", "Amazônia", "Amazônia Independente Futebol Clube", "AIF", "PA", "Santarém", 48, 10),
    # Goiano
    E("crac", "CRAC", "Clube Recreativo e Atlético Catalano", "CRA", "GO", "Catalão", 51, 20, sd=True),
    E("goiatuba", "Goiatuba", "Goiatuba Esporte Clube", "GEC", "GO", "Goiatuba", 50, 14, sd=True),
    E("inhumas", "Inhumas", "Inhumas Esporte Clube", "INH", "GO", "Inhumas", 50, 10, sd=True),
    # Paranaense
    E("cascavel", "Cascavel", "Futebol Clube Cascavel", "FCC", "PR", "Cascavel", 52, 22, wiki="FC Cascavel", sd=True),
    E("cianorte", "Cianorte", "Cianorte Futebol Clube", "CIA", "PR", "Cianorte", 51, 18, sd=True),
    # Catarinense
    E("marcilio-dias", "Marcílio Dias", "Clube Náutico Marcílio Dias", "CMD", "SC", "Itajaí", 51, 26, sd=True),
    # Mineiro
    E("democrata-gv", "Democrata-GV", "Esporte Clube Democrata", "DEM", "MG", "Governador Valadares", 51, 18, sd=True, pt="Esporte Clube Democrata (Governador Valadares)"),
    # Gaúcho
    E("novo-hamburgo", "Novo Hamburgo", "Esporte Clube Novo Hamburgo", "ECN", "RS", "Novo Hamburgo", 50, 24),
]
