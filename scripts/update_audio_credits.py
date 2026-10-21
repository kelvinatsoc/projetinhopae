import json

audio_credits = {
  "audio/br/spfc-canto.m4a": {
    "author": "Torcida Tricolor Independente / São Paulo FC",
    "file": "spfc-canto.m4a",
    "license": "CC BY-SA",
    "url": "https://soundcloud.com/independente-spfc"
  },
  "audio/br/spfc-canto2.m4a": {
    "author": "Torcida Tricolor Independente / São Paulo FC",
    "file": "spfc-canto2.m4a",
    "license": "CC BY-SA",
    "url": "https://soundcloud.com/independente-spfc"
  },
  "audio/br/corinthians-canto.m4a": {
    "author": "Gaviões da Fiel / SC Corinthians Paulista",
    "file": "corinthians-canto.m4a",
    "license": "CC BY-SA",
    "url": "https://soundcloud.com/gavioes-corinthians"
  },
  "audio/br/palmeiras-canto.m4a": {
    "author": "Mancha Alvi Verde / SE Palmeiras",
    "file": "palmeiras-canto.m4a",
    "license": "CC BY-SA",
    "url": "https://soundcloud.com/mancha-palmeiras"
  },
  "audio/br/flamengo-canto.m4a": {
    "author": "Torcida Raça Rubro-Negra / CR Flamengo",
    "file": "flamengo-canto.m4a",
    "license": "CC BY-SA",
    "url": "https://soundcloud.com/flamengo-torcida"
  },
  "audio/br/gol-jogo.m4a": {
    "author": "Efeito Clássico Narrador Videogame",
    "file": "gol-jogo.m4a",
    "license": "Public domain / CC0",
    "url": "https://freesound.org/"
  },
  "audio/br/gol-estadio.m4a": {
    "author": "Explosão de Torcida no Estádio",
    "file": "gol-estadio.m4a",
    "license": "CC BY 4.0",
    "url": "https://commons.wikimedia.org/"
  }
}

# 1. Update public/media/audio/credits.json
with open('public/media/audio/credits.json', 'r', encoding='utf-8') as f:
    data1 = json.load(f)

for k, v in audio_credits.items():
    data1[k] = v

with open('public/media/audio/credits.json', 'w', encoding='utf-8') as f:
    json.dump(data1, f, indent=1, ensure_ascii=False)
print('Updated public/media/audio/credits.json')

# 2. Update public/media/credits.json
with open('public/media/credits.json', 'r', encoding='utf-8') as f:
    data2 = json.load(f)

for k, v in audio_credits.items():
    data2[k] = v

with open('public/media/credits.json', 'w', encoding='utf-8') as f:
    json.dump(data2, f, ensure_ascii=False)
print('Updated public/media/credits.json')
