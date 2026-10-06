# -*- coding: utf-8 -*-
"""
Catálogo de clubes usado pelos scripts de dados.

Cada clube tem:
  id        identificador interno (slug)
  name      nome curto exibido no jogo
  full      nome oficial (se None, usa o "fullname" da Wikipedia)
  abbr      sigla de 3 letras
  region    estado (clubes brasileiros) ou país (sul-americanos, código FIFA)
  div       divisão em 2026: A, B, C, D (reserva para acessos futuros) ou F (estrangeiro)
  level     força média do elenco (overall médio dos 16 melhores)
  rep       reputação/tamanho da torcida (0-100) -> receitas, público, atração de jogadores
  colors    [camisa, secundária, terceira opcional]; None = pega da Wikipedia
  crest     padrão do escudo gerado (ver src/ui/Crest.tsx)
  wiki      título do artigo na Wikipedia em inglês
  city      cidade (None = Wikipedia)
"""

BR_CLUBS = [
    # ---------------- Série A 2026 ----------------
    dict(id="flamengo", name="Flamengo", full="Clube de Regatas do Flamengo", abbr="FLA", region="RJ", city="Rio de Janeiro", div="A", level=80, rep=100, colors=["#C8102E", "#111111"], crest="hoops", wiki="CR Flamengo"),
    dict(id="palmeiras", name="Palmeiras", full="Sociedade Esportiva Palmeiras", abbr="PAL", region="SP", city="São Paulo", div="A", level=79, rep=95, colors=["#006437", "#FFFFFF"], crest="circle", wiki="SE Palmeiras"),
    dict(id="corinthians", name="Corinthians", full="Sport Club Corinthians Paulista", abbr="COR", region="SP", city="São Paulo", div="A", level=74, rep=96, colors=["#FFFFFF", "#111111", "#C8102E"], crest="circle", wiki="SC Corinthians Paulista"),
    dict(id="sao-paulo", name="São Paulo", full="São Paulo Futebol Clube", abbr="SAO", region="SP", city="São Paulo", div="A", level=74, rep=92, colors=["#FFFFFF", "#E4002B", "#111111"], crest="triband", wiki="São Paulo FC"),
    dict(id="santos", name="Santos", full="Santos Futebol Clube", abbr="SAN", region="SP", city="Santos", div="A", level=73, rep=88, colors=["#FFFFFF", "#111111"], crest="vstripes", wiki="Santos FC"),
    dict(id="atletico-mg", name="Atlético-MG", full="Clube Atlético Mineiro", abbr="CAM", region="MG", city="Belo Horizonte", div="A", level=74, rep=89, colors=["#111111", "#FFFFFF"], crest="vstripes", wiki="Clube Atlético Mineiro"),
    dict(id="cruzeiro", name="Cruzeiro", full="Cruzeiro Esporte Clube", abbr="CRU", region="MG", city="Belo Horizonte", div="A", level=76, rep=89, colors=["#003DA5", "#FFFFFF"], crest="stars", wiki="Cruzeiro EC"),
    dict(id="gremio", name="Grêmio", full="Grêmio Foot-Ball Porto Alegrense", abbr="GRE", region="RS", city="Porto Alegre", div="A", level=73, rep=88, colors=["#0D80BF", "#111111", "#FFFFFF"], crest="vstripes3", wiki="Grêmio FBPA"),
    dict(id="internacional", name="Internacional", full="Sport Club Internacional", abbr="INT", region="RS", city="Porto Alegre", div="A", level=72, rep=88, colors=["#E5050F", "#FFFFFF"], crest="solid", wiki="Sport Club Internacional"),
    dict(id="botafogo", name="Botafogo", full="Botafogo de Futebol e Regatas", abbr="BOT", region="RJ", city="Rio de Janeiro", div="A", level=75, rep=86, colors=["#111111", "#FFFFFF"], crest="star", wiki="Botafogo FR"),
    dict(id="fluminense", name="Fluminense", full="Fluminense Football Club", abbr="FLU", region="RJ", city="Rio de Janeiro", div="A", level=75, rep=86, colors=["#7A0026", "#00613C", "#FFFFFF"], crest="vstripes3", wiki="Fluminense FC"),
    dict(id="vasco", name="Vasco da Gama", full="Club de Regatas Vasco da Gama", abbr="VAS", region="RJ", city="Rio de Janeiro", div="A", level=73, rep=90, colors=["#111111", "#FFFFFF", "#E30613"], crest="sash", wiki="CR Vasco da Gama"),
    dict(id="bahia", name="Bahia", full="Esporte Clube Bahia", abbr="BAH", region="BA", city="Salvador", div="A", level=74, rep=82, colors=["#FFFFFF", "#0055A4", "#E30613"], crest="vstripes3", wiki="Esporte Clube Bahia"),
    dict(id="vitoria", name="Vitória", full="Esporte Clube Vitória", abbr="VIT", region="BA", city="Salvador", div="A", level=70, rep=74, colors=["#D50000", "#111111"], crest="hoops", wiki="Esporte Clube Vitória"),
    dict(id="athletico-pr", name="Athletico-PR", full="Club Athletico Paranaense", abbr="CAP", region="PR", city="Curitiba", div="A", level=74, rep=80, colors=["#C8102E", "#111111"], crest="diagonal", wiki="Club Athletico Paranaense"),
    dict(id="coritiba", name="Coritiba", full="Coritiba Foot Ball Club", abbr="CFC", region="PR", city="Curitiba", div="A", level=70, rep=73, colors=["#FFFFFF", "#00703C"], crest="band", wiki="Coritiba Foot Ball Club"),
    dict(id="chapecoense", name="Chapecoense", full="Associação Chapecoense de Futebol", abbr="CHA", region="SC", city="Chapecó", div="A", level=68, rep=66, colors=["#00953B", "#FFFFFF"], crest="solid", wiki="Associação Chapecoense de Futebol"),
    dict(id="bragantino", name="Red Bull Bragantino", full="Red Bull Bragantino", abbr="RBB", region="SP", city="Bragança Paulista", div="A", level=72, rep=70, colors=["#FFFFFF", "#D20515"], crest="solid", wiki="Red Bull Bragantino"),
    dict(id="mirassol", name="Mirassol", full="Mirassol Futebol Clube", abbr="MIR", region="SP", city="Mirassol", div="A", level=71, rep=60, colors=["#FFD100", "#00843D"], crest="halves", wiki="Mirassol Futebol Clube"),
    dict(id="remo", name="Remo", full="Clube do Remo", abbr="REM", region="PA", city="Belém", div="A", level=68, rep=72, colors=["#0A2A5E", "#FFFFFF"], crest="solid", wiki="Clube do Remo"),

    # ---------------- Série B 2026 ----------------
    dict(id="america-mg", name="América-MG", full="América Futebol Clube", abbr="AME", region="MG", city="Belo Horizonte", div="B", level=66, rep=66, colors=["#00843D", "#111111", "#FFFFFF"], crest="hoops", wiki="América Futebol Clube (MG)"),
    dict(id="athletic", name="Athletic", full="Athletic Club", abbr="ATH", region="MG", city="São João del-Rei", div="B", level=62, rep=50, colors=["#111111", "#FFFFFF"], crest="vstripes", wiki="Athletic Club (MG)"),
    dict(id="atletico-go", name="Atlético-GO", full="Atlético Clube Goianiense", abbr="ACG", region="GO", city="Goiânia", div="B", level=65, rep=62, colors=["#E30613", "#111111"], crest="hoops", wiki="Atlético Clube Goianiense"),
    dict(id="avai", name="Avaí", full="Avaí Futebol Clube", abbr="AVA", region="SC", city="Florianópolis", div="B", level=64, rep=64, colors=["#0057A8", "#FFFFFF"], crest="vstripes", wiki="Avaí FC"),
    dict(id="botafogo-sp", name="Botafogo-SP", full="Botafogo Futebol Clube", abbr="BFC", region="SP", city="Ribeirão Preto", div="B", level=62, rep=55, colors=["#E30613", "#FFFFFF", "#111111"], crest="vstripes", wiki="Botafogo Futebol Clube (SP)"),
    dict(id="ceara", name="Ceará", full="Ceará Sporting Club", abbr="CEA", region="CE", city="Fortaleza", div="B", level=68, rep=74, colors=["#111111", "#FFFFFF"], crest="vstripes", wiki="Ceará Sporting Club"),
    dict(id="criciuma", name="Criciúma", full="Criciúma Esporte Clube", abbr="CRI", region="SC", city="Criciúma", div="B", level=65, rep=60, colors=["#FFD700", "#111111", "#FFFFFF"], crest="vstripes3", wiki="Criciúma Esporte Clube"),
    dict(id="cuiaba", name="Cuiabá", full="Cuiabá Esporte Clube", abbr="CUI", region="MT", city="Cuiabá", div="B", level=66, rep=58, colors=["#FFC72C", "#00843D"], crest="band", wiki="Cuiabá Esporte Clube"),
    dict(id="crb", name="CRB", full="Clube de Regatas Brasil", abbr="CRB", region="AL", city="Maceió", div="B", level=63, rep=60, colors=["#D10A11", "#FFFFFF"], crest="hoops", wiki="Clube de Regatas Brasil"),
    dict(id="fortaleza", name="Fortaleza", full="Fortaleza Esporte Clube", abbr="FOR", region="CE", city="Fortaleza", div="B", level=69, rep=76, colors=["#E30613", "#0050A0", "#FFFFFF"], crest="hoops", wiki="Fortaleza Esporte Clube"),
    dict(id="goias", name="Goiás", full="Goiás Esporte Clube", abbr="GOI", region="GO", city="Goiânia", div="B", level=66, rep=66, colors=["#006437", "#FFFFFF"], crest="solid", wiki="Goiás Esporte Clube"),
    dict(id="juventude", name="Juventude", full="Esporte Clube Juventude", abbr="JUV", region="RS", city="Caxias do Sul", div="B", level=67, rep=62, colors=["#009C3B", "#FFFFFF"], crest="vstripes", wiki="Esporte Clube Juventude"),
    dict(id="londrina", name="Londrina", full="Londrina Esporte Clube", abbr="LON", region="PR", city="Londrina", div="B", level=62, rep=55, colors=["#4FA9E2", "#FFFFFF"], crest="solid", wiki="Londrina Esporte Clube"),
    dict(id="nautico", name="Náutico", full="Clube Náutico Capibaribe", abbr="NAU", region="PE", city="Recife", div="B", level=63, rep=64, colors=["#D50032", "#FFFFFF"], crest="vstripes", wiki="Clube Náutico Capibaribe"),
    dict(id="novorizontino", name="Novorizontino", full="Grêmio Novorizontino", abbr="NOV", region="SP", city="Novo Horizonte", div="B", level=66, rep=50, colors=["#FFD700", "#111111"], crest="halves", wiki="Grêmio Novorizontino"),
    dict(id="operario-pr", name="Operário-PR", full="Operário Ferroviário Esporte Clube", abbr="OPE", region="PR", city="Ponta Grossa", div="B", level=63, rep=52, colors=["#111111", "#FFFFFF"], crest="vstripes", wiki="Operário Ferroviário Esporte Clube"),
    dict(id="ponte-preta", name="Ponte Preta", full="Associação Atlética Ponte Preta", abbr="PON", region="SP", city="Campinas", div="B", level=62, rep=62, colors=["#FFFFFF", "#111111"], crest="sash", wiki="Associação Atlética Ponte Preta"),
    dict(id="sao-bernardo", name="São Bernardo", full="São Bernardo Futebol Clube", abbr="SBE", region="SP", city="São Bernardo do Campo", div="B", level=62, rep=48, colors=["#FFD100", "#111111"], crest="vstripes", wiki="São Bernardo Futebol Clube"),
    dict(id="sport", name="Sport", full="Sport Club do Recife", abbr="SPT", region="PE", city="Recife", div="B", level=67, rep=74, colors=["#D50000", "#111111"], crest="hoops", wiki="Sport Club do Recife"),
    dict(id="vila-nova", name="Vila Nova", full="Vila Nova Futebol Clube", abbr="VNO", region="GO", city="Goiânia", div="B", level=64, rep=56, colors=["#E30613", "#FFFFFF"], crest="solid", wiki="Vila Nova Futebol Clube"),

    # ---------------- Série C 2026 ----------------
    dict(id="amazonas", name="Amazonas", full="Amazonas Futebol Clube", abbr="AMA", region="AM", city="Manaus", div="C", level=60, rep=46, colors=["#FFD100", "#111111"], crest="vstripes", wiki="Amazonas FC"),
    dict(id="anapolis", name="Anápolis", full="Anápolis Futebol Clube", abbr="ANA", region="GO", city="Anápolis", div="C", level=56, rep=38, colors=None, crest="solid", wiki="Anápolis Futebol Clube"),
    dict(id="barra-sc", name="Barra", full="Barra Futebol Clube", abbr="BAR", region="SC", city="Balneário Camboriú", div="C", level=56, rep=34, colors=None, crest="band", wiki="Barra Futebol Clube"),
    dict(id="botafogo-pb", name="Botafogo-PB", full="Botafogo Futebol Clube", abbr="BPB", region="PB", city="João Pessoa", div="C", level=58, rep=50, colors=["#111111", "#FFFFFF"], crest="star", wiki="Botafogo Futebol Clube (PB)"),
    dict(id="brusque", name="Brusque", full="Brusque Futebol Clube", abbr="BRU", region="SC", city="Brusque", div="C", level=58, rep=40, colors=None, crest="hoops", wiki="Brusque Futebol Clube"),
    dict(id="caxias", name="Caxias", full="Sociedade Esportiva e Recreativa Caxias do Sul", abbr="CAX", region="RS", city="Caxias do Sul", div="C", level=58, rep=48, colors=["#8B0A1A", "#FFFFFF", "#0050A0"], crest="solid", wiki="SER Caxias do Sul"),
    dict(id="confianca", name="Confiança", full="Associação Desportiva Confiança", abbr="CON", region="SE", city="Aracaju", div="C", level=57, rep=44, colors=["#0050A0", "#FFFFFF"], crest="vstripes", wiki="Associação Desportiva Confiança"),
    dict(id="ferroviaria", name="Ferroviária", full="Associação Ferroviária de Esportes", abbr="FER", region="SP", city="Araraquara", div="C", level=60, rep=46, colors=["#7A0026", "#FFFFFF"], crest="solid", wiki="Associação Ferroviária de Esportes"),
    dict(id="figueirense", name="Figueirense", full="Figueirense Futebol Clube", abbr="FIG", region="SC", city="Florianópolis", div="C", level=59, rep=56, colors=["#111111", "#FFFFFF"], crest="vstripes", wiki="Figueirense FC"),
    dict(id="floresta", name="Floresta", full="Floresta Esporte Clube", abbr="FLO", region="CE", city="Fortaleza", div="C", level=57, rep=32, colors=None, crest="solid", wiki="Floresta Esporte Clube"),
    dict(id="guarani", name="Guarani", full="Guarani Futebol Clube", abbr="GUA", region="SP", city="Campinas", div="C", level=60, rep=60, colors=["#00843D", "#FFFFFF"], crest="solid", wiki="Guarani FC"),
    dict(id="inter-limeira", name="Inter de Limeira", full="Associação Atlética Internacional", abbr="INL", region="SP", city="Limeira", div="C", level=56, rep=40, colors=["#111111", "#FFFFFF"], crest="vstripes", wiki="Associação Atlética Internacional (Limeira)"),
    dict(id="itabaiana", name="Itabaiana", full="Associação Olímpica de Itabaiana", abbr="ITA", region="SE", city="Itabaiana", div="C", level=56, rep=36, colors=None, crest="solid", wiki="Associação Olímpica de Itabaiana"),
    dict(id="ituano", name="Ituano", full="Ituano Futebol Clube", abbr="ITU", region="SP", city="Itu", div="C", level=59, rep=42, colors=["#D50000", "#111111"], crest="hoops", wiki="Ituano FC"),
    dict(id="maranhao", name="Maranhão", full="Maranhão Atlético Clube", abbr="MAC", region="MA", city="São Luís", div="C", level=55, rep=36, colors=None, crest="band", wiki="Maranhão Atlético Clube"),
    dict(id="maringa", name="Maringá", full="Maringá Futebol Clube", abbr="MAR", region="PR", city="Maringá", div="C", level=57, rep=36, colors=None, crest="solid", wiki="Maringá Futebol Clube"),
    dict(id="paysandu", name="Paysandu", full="Paysandu Sport Club", abbr="PAY", region="PA", city="Belém", div="C", level=61, rep=70, colors=["#4FA9E2", "#FFFFFF"], crest="vstripes", wiki="Paysandu Sport Club"),
    dict(id="santa-cruz", name="Santa Cruz", full="Santa Cruz Futebol Clube", abbr="SCZ", region="PE", city="Recife", div="C", level=59, rep=66, colors=["#111111", "#FFFFFF", "#D50000"], crest="hoops", wiki="Santa Cruz Futebol Clube"),
    dict(id="volta-redonda", name="Volta Redonda", full="Volta Redonda Futebol Clube", abbr="VRE", region="RJ", city="Volta Redonda", div="C", level=60, rep=40, colors=None, crest="solid", wiki="Volta Redonda FC"),
    dict(id="ypiranga-rs", name="Ypiranga", full="Ypiranga Futebol Clube", abbr="YPI", region="RS", city="Erechim", div="C", level=57, rep=36, colors=["#FFD100", "#00843D"], crest="band", wiki="Ypiranga Futebol Clube"),

    # ------- Série D (clubes reservas para acesso em temporadas futuras) -------
    dict(id="portuguesa", name="Portuguesa", full="Associação Portuguesa de Desportos", abbr="POR", region="SP", city="São Paulo", div="D", level=56, rep=55, colors=["#D50000", "#00843D", "#FFFFFF"], crest="band", wiki="Associação Portuguesa de Desportos"),
    dict(id="abc", name="ABC", full="ABC Futebol Clube", abbr="ABC", region="RN", city="Natal", div="D", level=55, rep=54, colors=["#111111", "#FFFFFF"], crest="vstripes", wiki="ABC Futebol Clube"),
    dict(id="csa", name="CSA", full="Centro Sportivo Alagoano", abbr="CSA", region="AL", city="Maceió", div="D", level=55, rep=55, colors=["#0050A0", "#FFFFFF"], crest="vstripes", wiki="Centro Sportivo Alagoano"),
    dict(id="sampaio-correa", name="Sampaio Corrêa", full="Sampaio Corrêa Futebol Clube", abbr="SAM", region="MA", city="São Luís", div="D", level=54, rep=50, colors=["#FFD100", "#00843D", "#D50000"], crest="vstripes3", wiki="Sampaio Corrêa Futebol Clube"),
    dict(id="joinville", name="Joinville", full="Joinville Esporte Clube", abbr="JEC", region="SC", city="Joinville", div="D", level=54, rep=50, colors=["#D50000", "#111111", "#FFFFFF"], crest="vstripes3", wiki="Joinville Esporte Clube"),
    dict(id="tombense", name="Tombense", full="Tombense Futebol Clube", abbr="TOM", region="MG", city="Tombos", div="D", level=55, rep=30, colors=None, crest="solid", wiki="Tombense Futebol Clube"),
    dict(id="america-rn", name="América-RN", full="América Futebol Clube", abbr="ARN", region="RN", city="Natal", div="D", level=54, rep=50, colors=["#D50000", "#FFFFFF"], crest="solid", wiki="América Futebol Clube (RN)"),
    dict(id="ferroviario-ce", name="Ferroviário", full="Ferroviário Atlético Clube", abbr="FCE", region="CE", city="Fortaleza", div="D", level=54, rep=40, colors=None, crest="hoops", wiki="Ferroviário Atlético Clube (CE)"),
    dict(id="brasil-pelotas", name="Brasil de Pelotas", full="Grêmio Esportivo Brasil", abbr="GEB", region="RS", city="Pelotas", div="D", level=53, rep=46, colors=["#D50000", "#111111"], crest="hoops", wiki="Grêmio Esportivo Brasil"),
    dict(id="parana", name="Paraná", full="Paraná Clube", abbr="PRC", region="PR", city="Curitiba", div="D", level=53, rep=50, colors=["#0050A0", "#D50000", "#FFFFFF"], crest="triband", wiki="Paraná Clube"),
    dict(id="santo-andre", name="Santo André", full="Esporte Clube Santo André", abbr="ESA", region="SP", city="Santo André", div="D", level=53, rep=42, colors=["#0050A0", "#FFFFFF"], crest="solid", wiki="Esporte Clube Santo André"),
    dict(id="treze", name="Treze", full="Treze Futebol Clube", abbr="TRE", region="PB", city="Campina Grande", div="D", level=52, rep=44, colors=["#111111", "#FFFFFF"], crest="vstripes", wiki="Treze Futebol Clube"),
]

# Clubes sul-americanos (para Libertadores e Sul-Americana). colors=None -> Wikipedia.
F = lambda id, name, abbr, country, level, rep, wiki, crest="solid", colors=None, city=None: dict(
    id=id, name=name, full=None, abbr=abbr, region=country, city=city, div="F", level=level, rep=rep,
    colors=colors, crest=crest, wiki=wiki)

FOREIGN_CLUBS = [
    # Argentina
    F("river-plate", "River Plate", "RIV", "ARG", 77, 95, "Club Atlético River Plate", "sash", ["#FFFFFF", "#E30613"]),
    F("boca-juniors", "Boca Juniors", "BOC", "ARG", 76, 96, "Boca Juniors", "band", ["#103F79", "#F3B229"]),
    F("racing", "Racing", "RAC", "ARG", 75, 85, "Racing Club de Avellaneda", "vstripes", ["#6CACE4", "#FFFFFF"]),
    F("independiente", "Independiente", "IND", "ARG", 73, 85, "Club Atlético Independiente", "solid", ["#E30613", "#FFFFFF"]),
    F("san-lorenzo", "San Lorenzo", "SLO", "ARG", 72, 80, "San Lorenzo de Almagro", "vstripes", ["#1B3E8F", "#E30613"]),
    F("estudiantes", "Estudiantes", "EST", "ARG", 74, 78, "Estudiantes de La Plata", "vstripes", ["#E30613", "#FFFFFF"]),
    F("velez", "Vélez Sarsfield", "VEL", "ARG", 73, 76, "Club Atlético Vélez Sarsfield", "chevron", ["#FFFFFF", "#1B3E8F"]),
    F("lanus", "Lanús", "LAN", "ARG", 73, 70, "Club Atlético Lanús", "solid", ["#7A0026", "#FFFFFF"]),
    F("rosario-central", "Rosario Central", "ROS", "ARG", 72, 76, "Rosario Central", "vstripes", ["#1B3E8F", "#F3C300"]),
    F("talleres", "Talleres", "TAL", "ARG", 73, 72, "Talleres de Córdoba", "vstripes", ["#1B2A5E", "#FFFFFF"]),
    F("argentinos-juniors", "Argentinos Juniors", "ARJ", "ARG", 72, 64, "Argentinos Juniors", "sash", ["#E30613", "#FFFFFF"]),
    F("platense", "Platense", "PLA", "ARG", 70, 56, "Club Atlético Platense", "band", ["#FFFFFF", "#5C3A21"]),
    F("independiente-rivadavia", "Independiente Rivadavia", "IRV", "ARG", 70, 54, "Independiente Rivadavia", "solid", ["#1B3E8F", "#FFFFFF"]),
    F("tigre", "Tigre", "TIG", "ARG", 70, 58, "Club Atlético Tigre", "band", ["#1B3E8F", "#E30613"]),
    F("barracas-central", "Barracas Central", "BCE", "ARG", 69, 50, "Barracas Central", "vstripes", ["#E30613", "#FFFFFF"]),
    F("riestra", "Deportivo Riestra", "RIE", "ARG", 68, 44, "Deportivo Riestra", "solid", ["#111111", "#FFFFFF"]),
    # Uruguai
    F("penarol", "Peñarol", "PEN", "URU", 71, 86, "Peñarol", "vstripes", ["#F3C300", "#111111"]),
    F("nacional-uru", "Nacional", "NAC", "URU", 71, 86, "Club Nacional de Football", "band", ["#FFFFFF", "#1B3E8F", "#E30613"]),
    F("liverpool-uru", "Liverpool", "LIV", "URU", 67, 54, "Liverpool F.C. (Montevideo)", "vstripes", ["#111111", "#1B3E8F"]),
    F("defensor", "Defensor Sporting", "DEF", "URU", 67, 58, "Defensor Sporting", "solid", ["#5B2A86", "#FFFFFF"]),
    F("juventud-uru", "Juventud", "JLP", "URU", 64, 40, "Juventud de Las Piedras", "solid", None),
    F("boston-river", "Boston River", "BOS", "URU", 64, 38, "Boston River", "vstripes", None),
    F("racing-uru", "Racing Montevideo", "RCM", "URU", 64, 40, "Racing Club de Montevideo", "vstripes", None),
    F("mvd-city-torque", "Montevideo City Torque", "MCT", "URU", 65, 40, "Montevideo City Torque", "solid", ["#6CACE4", "#FFFFFF"]),
    F("danubio", "Danubio", "DAN", "URU", 65, 52, "Danubio F.C.", "sash", ["#FFFFFF", "#111111"]),
    # Paraguai
    F("olimpia", "Olimpia", "OLI", "PAR", 70, 82, "Club Olimpia", "band", ["#FFFFFF", "#111111"]),
    F("cerro-porteno", "Cerro Porteño", "CER", "PAR", 70, 82, "Cerro Porteño", "vstripes", ["#1B3E8F", "#E30613"]),
    F("libertad-par", "Libertad", "LIB", "PAR", 70, 66, "Club Libertad", "vstripes", ["#111111", "#FFFFFF"]),
    F("guarani-par", "Guaraní", "GUR", "PAR", 66, 58, "Club Guaraní", "vstripes", ["#F3C300", "#111111"]),
    F("nacional-par", "Nacional (PAR)", "NAP", "PAR", 65, 50, "Club Nacional", "band", None),
    F("2-de-mayo", "2 de Mayo", "DMA", "PAR", 63, 36, "Club 2 de Mayo", "solid", None),
    F("trinidense", "Sportivo Trinidense", "TRI", "PAR", 63, 34, "Sportivo Trinidense", "solid", None),
    F("recoleta", "Recoleta", "REC", "PAR", 63, 32, "Recoleta FC", "solid", None),
    F("general-caballero", "General Caballero", "GCJ", "PAR", 62, 30, "Club General Caballero (Juan León Mallorquín)", "solid", None),
    # Chile
    F("colo-colo", "Colo-Colo", "COL", "CHI", 70, 88, "Colo-Colo", "solid", ["#FFFFFF", "#111111"]),
    F("u-de-chile", "Universidad de Chile", "UCH", "CHI", 69, 82, "Club Universidad de Chile", "solid", ["#1B3E8F", "#E30613"]),
    F("u-catolica", "Universidad Católica", "UCA", "CHI", 69, 74, "Club Deportivo Universidad Católica", "cross", ["#FFFFFF", "#1B3E8F", "#E30613"]),
    F("coquimbo", "Coquimbo Unido", "COQ", "CHI", 67, 50, "Coquimbo Unido", "vstripes", ["#F3C300", "#111111"]),
    F("ohiggins", "O'Higgins", "OHI", "CHI", 66, 50, "O'Higgins F.C.", "solid", ["#6CACE4", "#FFFFFF"]),
    F("huachipato", "Huachipato", "HUA", "CHI", 66, 46, "Huachipato FC", "vstripes", ["#1B3E8F", "#111111"]),
    F("audax", "Audax Italiano", "AUD", "CHI", 65, 44, "Audax Italiano", "solid", ["#00843D", "#FFFFFF"]),
    F("palestino", "Palestino", "PAE", "CHI", 65, 48, "Club Deportivo Palestino", "vstripes3", ["#E30613", "#00843D", "#FFFFFF"]),
    F("cobresal", "Cobresal", "COB", "CHI", 64, 36, "C.D. Cobresal", "solid", None),
    # Colômbia
    F("atletico-nacional", "Atlético Nacional", "NAL", "COL", 71, 86, "Atlético Nacional", "vstripes", ["#00843D", "#FFFFFF"]),
    F("millonarios", "Millonarios", "MIL", "COL", 69, 82, "Millonarios F.C.", "solid", ["#1B3E8F", "#FFFFFF"]),
    F("santa-fe", "Independiente Santa Fe", "SFE", "COL", 68, 74, "Independiente Santa Fe", "solid", ["#E30613", "#FFFFFF"]),
    F("junior", "Junior", "JUN", "COL", 69, 76, "Atlético Junior", "vstripes", ["#E30613", "#FFFFFF", "#1B3E8F"]),
    F("tolima", "Deportes Tolima", "TOL", "COL", 68, 62, "Deportes Tolima", "solid", ["#7A0026", "#F3C300"]),
    F("medellin", "Independiente Medellín", "DIM", "COL", 68, 70, "Independiente Medellín", "solid", ["#E30613", "#1B3E8F"]),
    F("america-cali", "América de Cali", "AMC", "COL", 68, 78, "América de Cali", "solid", ["#E30613", "#FFFFFF"]),
    F("bucaramanga", "Atlético Bucaramanga", "BUC", "COL", 67, 54, "Atlético Bucaramanga", "solid", ["#F3C300", "#00843D"]),
    # Equador
    F("ldu-quito", "LDU Quito", "LDU", "ECU", 72, 80, "LDU Quito", "solid", ["#FFFFFF", "#E30613", "#1B3E8F"]),
    F("independiente-del-valle", "Independiente del Valle", "IDV", "ECU", 72, 66, "Independiente del Valle", "vstripes", ["#111111", "#1B3E8F"]),
    F("barcelona-sc", "Barcelona SC", "BSC", "ECU", 69, 80, "Barcelona S.C.", "solid", ["#F3C300", "#E30613"]),
    F("emelec", "Emelec", "EME", "ECU", 67, 72, "C.S. Emelec", "hoops", ["#1B3E8F", "#6CACE4"]),
    F("u-catolica-ecu", "Universidad Católica (ECU)", "UCE", "ECU", 66, 50, "C.D. Universidad Católica (Ecuador)", "solid", ["#6CACE4", "#FFFFFF"]),
    F("orense", "Orense", "ORE", "ECU", 65, 40, "Orense S.C.", "solid", None),
    F("libertad-ecu", "Libertad (ECU)", "LIE", "ECU", 64, 34, "Libertad F.C. (Ecuador)", "solid", None),
    F("macara", "Macará", "MCA", "ECU", 64, 40, "C.S.D. Macará", "solid", None),
    F("cuenca", "Deportivo Cuenca", "CUE", "ECU", 64, 50, "Deportivo Cuenca", "solid", ["#E30613", "#111111"]),
    # Peru
    F("universitario", "Universitario", "UNI", "PER", 68, 82, "Club Universitario de Deportes", "solid", ["#F5F0DC", "#7A0026"]),
    F("alianza-lima", "Alianza Lima", "ALI", "PER", 68, 82, "Club Alianza Lima", "vstripes", ["#1B2A5E", "#FFFFFF"]),
    F("sporting-cristal", "Sporting Cristal", "SCR", "PER", 68, 74, "Sporting Cristal", "solid", ["#6CACE4", "#FFFFFF"]),
    F("cusco", "Cusco", "CUS", "PER", 64, 40, "Cusco FC", "solid", None),
    F("melgar", "Melgar", "MEL", "PER", 65, 56, "FBC Melgar", "halves", ["#E30613", "#111111"]),
    F("cienciano", "Cienciano", "CIE", "PER", 64, 56, "Cienciano", "solid", ["#E30613", "#FFFFFF"]),
    F("alianza-atletico", "Alianza Atlético", "AAT", "PER", 62, 36, "Alianza Atlético", "solid", None),
    F("garcilaso", "Deportivo Garcilaso", "GAR", "PER", 62, 34, "Deportivo Garcilaso", "solid", None),
    # Bolívia
    F("bolivar", "Bolívar", "BOL", "BOL", 67, 72, "Club Bolívar", "solid", ["#6CACE4", "#FFFFFF"]),
    F("the-strongest", "The Strongest", "STR", "BOL", 65, 70, "The Strongest", "vstripes", ["#F3C300", "#111111"]),
    F("always-ready", "Always Ready", "ARE", "BOL", 64, 44, "Club Always Ready", "solid", ["#E30613", "#FFFFFF"]),
    F("nacional-potosi", "Nacional Potosí", "NPO", "BOL", 62, 36, "C.A. Nacional Potosí", "solid", None),
    F("blooming", "Blooming", "BLO", "BOL", 62, 46, "Club Blooming", "solid", ["#6CACE4", "#FFFFFF"]),
    F("independiente-petrolero", "Independiente Petrolero", "IPE", "BOL", 61, 34, "Club Independiente Petrolero", "solid", None),
    F("guabira", "Guabirá", "GUB", "BOL", 60, 34, "Club Deportivo Guabirá", "solid", None),
    F("bulo-bulo", "San Antonio Bulo Bulo", "SAB", "BOL", 60, 30, "C.D. San Antonio Bulo Bulo", "solid", None),
    # Venezuela
    F("ucv", "Universidad Central", "UCV", "VEN", 62, 40, "Universidad Central de Venezuela F.C.", "solid", None),
    F("la-guaira", "Deportivo La Guaira", "DLG", "VEN", 62, 44, "Deportivo La Guaira F.C.", "solid", None),
    F("carabobo", "Carabobo", "CRF", "VEN", 61, 40, "Carabobo F.C.", "solid", None),
    F("tachira", "Deportivo Táchira", "TAC", "VEN", 62, 56, "Deportivo Táchira F.C.", "vstripes", ["#F3C300", "#111111"]),
    F("caracas", "Caracas", "CCS", "VEN", 62, 56, "Caracas F.C.", "solid", ["#7A0026", "#FFFFFF"]),
    F("monagas", "Monagas", "MON", "VEN", 60, 36, "Monagas S.C.", "solid", None),
    F("metropolitanos", "Metropolitanos", "MET", "VEN", 60, 32, "Metropolitanos F.C.", "solid", None),
    F("puerto-cabello", "Academia Puerto Cabello", "APC", "VEN", 61, 34, "Academia Puerto Cabello", "solid", None),
]

from estadual_catalog import ESTADUAL_CLUBS  # noqa: E402

ALL_CLUBS = BR_CLUBS + FOREIGN_CLUBS + ESTADUAL_CLUBS
