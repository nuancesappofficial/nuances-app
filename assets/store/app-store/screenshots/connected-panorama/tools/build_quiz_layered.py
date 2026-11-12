from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "02-Chinese-Traditional" / "layers" / "06-quiz" / "background-phone-empty.png"
RAW = ROOT.parent / "raw" / "02-Chinese-Traditional" / "iphone-6.9" / "04-quick-quiz-question" / "Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.07.04.png"
OUTPUT = ROOT / "02-Chinese-Traditional" / "app-store-6.9" / "06-quiz-layered-v2.png"

PINGFANG = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc"


def font(size: int, weight: str = "semibold"):
    return ImageFont.truetype(PINGFANG, size=size, index=10 if weight == "semibold" else 2)


def normalized_base() -> Image.Image:
    source = Image.open(BASE).convert("RGB")
    width = round(source.width * 2796 / source.height)
    source = source.resize((width, 2796), Image.Resampling.LANCZOS)
    left = (width - 1290) // 2
    return source.crop((left, 0, left + 1290, 2796))


def insert_raw_screen(canvas: Image.Image) -> None:
    raw = Image.open(RAW).convert("RGB")
    target = (244, 774, 1047, 2519)
    raw = raw.resize((target[2] - target[0], target[3] - target[1]), Image.Resampling.LANCZOS)

    mask = Image.new("L", canvas.size)
    ImageDraw.Draw(mask).rounded_rectangle(target, radius=88, fill=255)
    layer = Image.new("RGB", canvas.size)
    layer.paste(raw, target[:2])
    canvas.paste(layer, (0, 0), mask)


def add_answer_highlight(canvas: Image.Image) -> None:
    # Locked to final-traditional-chinese/06-quiz.png.
    x0, y0, x1, y1 = 94, 1933, 1185, 2158

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((x0 + 4, y0 + 24, x1 + 4, y1 + 24), radius=66, fill=(0, 20, 15, 125))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    canvas.paste(shadow, (0, 0), shadow)

    card = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((x0, y0, x1, y1), radius=66, fill=(17, 49, 40, 252), outline=(84, 207, 92, 255), width=7)

    circle = (145, y0 + 52, 281, y0 + 188)
    draw.ellipse(circle, fill=(47, 120, 66, 255), outline=(93, 224, 101, 255), width=5)
    draw.line((180, y0 + 124, 211, y0 + 154), fill=(111, 239, 118, 255), width=13)
    draw.line((207, y0 + 153, 251, y0 + 101), fill=(111, 239, 118, 255), width=13)

    draw.text(((x0 + x1) // 2 + 55, (y0 + y1) // 2), "細微差異", font=font(69), fill=(105, 233, 111, 255), anchor="mm")
    canvas.paste(card, (0, 0), card)


def add_caption(canvas: Image.Image) -> None:
    draw = ImageDraw.Draw(canvas)
    title = "用小挑戰複習\n自己的字卡"
    title_font = font(148)
    subtitle_font = font(48, "regular")
    draw.multiline_text((645, 145), title, font=title_font, fill=(24, 86, 207), anchor="ma", align="center", spacing=0)
    title_box = draw.multiline_textbbox((645, 145), title, font=title_font, anchor="ma", align="center", spacing=0)
    draw.text((645, title_box[3] + 38), "用自己的內容反覆練習", font=subtitle_font, fill=(18, 39, 56), anchor="ma")


def main() -> None:
    canvas = normalized_base()
    insert_raw_screen(canvas)
    add_answer_highlight(canvas)
    add_caption(canvas)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
