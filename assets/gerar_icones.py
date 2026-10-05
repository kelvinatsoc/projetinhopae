#!/usr/bin/env python3
"""Gera o ícone do app Android e as imagens da tela de abertura a partir de public/icons/.

Uso (precisa do Pillow: pip install pillow):  python3 assets/gerar_icones.py
Rode de novo só se o ícone do jogo mudar; os PNGs gerados ficam em android/app/src/main/res/.
"""
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
ICONE = RAIZ / "public" / "icons" / "icon-512.png"  # quadrado verde arredondado com fundo transparente
RES = RAIZ / "android" / "app" / "src" / "main" / "res"
FUNDO = (0x0C, 0x17, 0x12, 255)  # #0c1712, mesma cor do jogo

# densidades do Android: fator em relação ao mdpi (1 dp = 1 px)
DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

# tamanhos da imagem de abertura antiga (Android 11 ou menos), em pixels (largura, altura) no modo retrato
SPLASH = {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280), "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}


def redimensiona(img: Image.Image, lado: int) -> Image.Image:
    return img.resize((lado, lado), Image.LANCZOS)


def primeiro_plano(icone: Image.Image, canvas: int) -> Image.Image:
    """Camada da frente do ícone adaptável (108 dp). O escudo fica dentro da área segura de 66 dp;
    o quadrado verde passa um pouco dos 72 dp visíveis, então a máscara do celular (círculo,
    "squircle" da Samsung...) recorta só verde e o fundo #0c1712 quase nunca aparece."""
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    lado = round(canvas * 74 / 108)
    off = (canvas - lado) // 2
    out.alpha_composite(redimensiona(icone, lado), (off, off))
    return out


def redondo(icone: Image.Image, lado: int) -> Image.Image:
    """Ícone redondo para Android 7 (o escudo cabe inteiro no círculo)."""
    img = redimensiona(icone, lado * 4)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, img.size[0] - 1, img.size[1] - 1), fill=255)
    fundo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    fundo.paste(img, (0, 0), mask)
    return fundo.resize((lado, lado), Image.LANCZOS)


def splash(icone: Image.Image, w: int, h: int) -> Image.Image:
    out = Image.new("RGBA", (w, h), FUNDO)
    lado = round(min(w, h) * 0.34)
    out.alpha_composite(redimensiona(icone, lado), ((w - lado) // 2, (h - lado) // 2))
    return out.convert("RGB")


def main() -> None:
    icone = Image.open(ICONE).convert("RGBA")
    for nome, f in DENSIDADES.items():
        pasta = RES / f"mipmap-{nome}"
        pasta.mkdir(parents=True, exist_ok=True)
        primeiro_plano(icone, round(108 * f)).save(pasta / "ic_launcher_foreground.png", optimize=True)
        # ícones "legados" (Android 7): 48 dp
        redimensiona(icone, round(48 * f)).save(pasta / "ic_launcher.png", optimize=True)
        redondo(icone, round(48 * f)).save(pasta / "ic_launcher_round.png", optimize=True)

        w, h = SPLASH[nome]
        for orient, (sw, sh) in (("port", (w, h)), ("land", (h, w))):
            p = RES / f"drawable-{orient}-{nome}"
            p.mkdir(parents=True, exist_ok=True)
            splash(icone, sw, sh).save(p / "splash.png", optimize=True)
    splash(icone, 480, 320).save(RES / "drawable" / "splash.png", optimize=True)
    print("Ícones e telas de abertura gerados em", RES)


if __name__ == "__main__":
    main()
