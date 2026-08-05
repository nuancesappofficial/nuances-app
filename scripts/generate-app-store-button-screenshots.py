#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RAW_ROOT = ROOT / "store-assets/app-store/screenshots/raw"
OUT_ROOT = ROOT / "store-assets/app-store/screenshots/button-preview-6.9"
CANVAS_SIZE = (1290, 2796)

BUTTON_LEFT = 86
BUTTON_TOP = 2262
BUTTON_RIGHT = 1204
BUTTON_BOTTOM = 2622
BUTTON_RADIUS = 88
BUTTON_FILL = (101, 185, 247, 255)
BUTTON_BORDER = (126, 204, 255, 210)
TEXT_FILL = (248, 246, 249, 255)

SCREEN_KEYS = (
    "01-capture",
    "02-text-image-import",
    "03-real-context-front",
    "04-real-context-back",
    "05-pronunciation-score",
    "06-quick-quiz-question",
)

COPY: dict[str, dict[str, tuple[str, ...]]] = {
    "01-English-US": {
        "01-capture": ("Upload anytime.", "Learn later."),
        "02-text-image-import": ("Select words with one tap.",),
        "03-real-context-front": ("Build your own flashcards.",),
        "04-real-context-back": ("Learn how it’s really used.",),
        "05-pronunciation-score": ("Test every sound", "for accuracy."),
        "06-quick-quiz-question": ("Review your cards", "with quick challenges."),
    },
    "03-Chinese-Simplified": {
        "01-capture": ("随时上传 有空再学",),
        "02-text-image-import": ("一指选词",),
        "03-real-context-front": ("建立你的专属单词卡",),
        "04-real-context-back": ("学会最地道的用法",),
        "05-pronunciation-score": ("测验每个音的", "发音准确度"),
        "06-quick-quiz-question": ("用小挑战复习", "自己的单词卡"),
    },
    "04-Japanese": {
        "01-capture": ("いつでも保存 あとで学習",),
        "02-text-image-import": ("指一本で単語を選択",),
        "03-real-context-front": ("自分だけの単語カード",),
        "04-real-context-back": ("リアルな使い方を学ぶ",),
        "05-pronunciation-score": ("一音ずつ発音を", "正確にチェック"),
        "06-quick-quiz-question": ("ミニチャレンジで", "自分のカードを復習"),
    },
    "05-Korean": {
        "01-capture": ("언제든 올리고 나중에 학습",),
        "02-text-image-import": ("한 번에 단어 선택",),
        "03-real-context-front": ("나만의 단어 카드 만들기",),
        "04-real-context-back": ("진짜 쓰임새까지 학습",),
        "05-pronunciation-score": ("소리마다 발음", "정확도 측정"),
        "06-quick-quiz-question": ("미니 챌린지로", "내 카드 복습"),
    },
    "06-Spanish-Spain": {
        "01-capture": ("Guárdalo ahora.", "Aprende después."),
        "02-text-image-import": ("Elige palabras con un toque.",),
        "03-real-context-front": ("Crea tus propias tarjetas.",),
        "04-real-context-back": ("Aprende cómo se usa de verdad.",),
        "05-pronunciation-score": ("Mide la precisión", "de cada sonido."),
        "06-quick-quiz-question": ("Repasa tus tarjetas", "con retos breves."),
    },
    "07-French-France": {
        "01-capture": ("Enregistrez maintenant.", "Apprenez plus tard."),
        "02-text-image-import": ("Choisissez un mot d’un geste.",),
        "03-real-context-front": ("Créez vos propres cartes.",),
        "04-real-context-back": ("Apprenez l’usage authentique.",),
        "05-pronunciation-score": ("Testez chaque son", "avec précision."),
        "06-quick-quiz-question": ("Révisez vos cartes", "avec de petits défis."),
    },
}

FONT_PATHS = {
    "01-English-US": "/System/Library/Fonts/SFNSRounded.ttf",
    "03-Chinese-Simplified": "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "04-Japanese": "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/b7a6a6575a699e801915b73b9e1e75c74a3404ce.asset/AssetData/YuGothic-Bold.otf",
    "05-Korean": "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "06-Spanish-Spain": "/System/Library/Fonts/SFNSRounded.ttf",
    "07-French-France": "/System/Library/Fonts/SFNSRounded.ttf",
}


def font_for(locale: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATHS[locale], size=size)


def fit_font(locale: str, lines: tuple[str, ...], max_width: int) -> ImageFont.FreeTypeFont:
    for size in range(78, 49, -2):
        candidate = font_for(locale, size)
        if max(ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), line, font=candidate)[2] for line in lines) <= max_width:
            return candidate
    return font_for(locale, 48)


def render_screenshot(
    source: Image.Image,
    lines: tuple[str, ...],
    locale: str = "01-English-US",
    clear_original_action: bool = False,
) -> Image.Image:
    canvas = source.convert("RGBA")
    if canvas.size != CANVAS_SIZE:
        canvas = canvas.resize(CANVAS_SIZE, Image.Resampling.LANCZOS)

    if clear_original_action:
        background = canvas.getpixel((16, CANVAS_SIZE[1] - 16))
        cleanup = ImageDraw.Draw(canvas)
        cleanup.rectangle(
            (0, BUTTON_TOP + 120, CANVAS_SIZE[0], CANVAS_SIZE[1]),
            fill=background,
        )

    glow = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rounded_rectangle(
        (BUTTON_LEFT - 4, BUTTON_TOP + 8, BUTTON_RIGHT + 4, BUTTON_BOTTOM + 16),
        radius=BUTTON_RADIUS + 4,
        fill=(0, 229, 255, 34),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    canvas = Image.alpha_composite(canvas, glow)

    layer = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle(
        (BUTTON_LEFT, BUTTON_TOP, BUTTON_RIGHT, BUTTON_BOTTOM),
        radius=BUTTON_RADIUS,
        fill=BUTTON_FILL,
        outline=BUTTON_BORDER,
        width=3,
    )

    title_font = fit_font(locale, lines, BUTTON_RIGHT - BUTTON_LEFT - 120)
    boxes = [draw.textbbox((0, 0), line, font=title_font) for line in lines]
    heights = [box[3] - box[1] for box in boxes]
    gap = 18 if len(lines) == 2 else 0
    total_height = sum(heights) + gap
    y = BUTTON_TOP + (BUTTON_BOTTOM - BUTTON_TOP - total_height) / 2
    for line, box, height in zip(lines, boxes, heights):
        width = box[2] - box[0]
        draw.text(
            ((CANVAS_SIZE[0] - width) / 2 - box[0], y - box[1]),
            line,
            font=title_font,
            fill=TEXT_FILL,
        )
        y += height + gap

    return Image.alpha_composite(canvas, layer).convert("RGB")


def raw_files(locale: str) -> dict[str, Path]:
    base = RAW_ROOT / locale / "iphone-6.9"
    context = sorted((base / "03-real-context").glob("*.png"))
    return {
        "01-capture": sorted((base / "01-capture").glob("*.png"))[0],
        "02-text-image-import": sorted((base / "02-text-image-import").glob("*.png"))[0],
        "03-real-context-front": context[0],
        "04-real-context-back": context[1],
        "05-pronunciation-score": sorted((base / "05-pronunciation-score").glob("*.png"))[0],
        "06-quick-quiz-question": sorted((base / "04-quick-quiz-question").glob("*.png"))[0],
    }


def make_contact_sheet(paths: list[Path], out_path: Path) -> None:
    thumbs = []
    for path in paths:
        image = Image.open(path).convert("RGB")
        image.thumbnail((258, 560), Image.Resampling.LANCZOS)
        thumbs.append(image.copy())
    sheet = Image.new("RGB", (1640, 620), "#071F33")
    for index, image in enumerate(thumbs):
        x = 20 + index * 270 + (258 - image.width) // 2
        y = 30 + (560 - image.height) // 2
        sheet.paste(image, (x, y))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, quality=95)


def generate_locale(locale: str) -> list[Path]:
    output_dir = OUT_ROOT / locale
    output_dir.mkdir(parents=True, exist_ok=True)
    inputs = raw_files(locale)
    outputs = []
    for key in SCREEN_KEYS:
        output = output_dir / f"{key}.png"
        rendered = render_screenshot(
            Image.open(inputs[key]),
            COPY[locale][key],
            locale,
            clear_original_action=key == "02-text-image-import",
        )
        rendered.save(output, quality=95)
        outputs.append(output)
    make_contact_sheet(outputs, output_dir / "00-contact-sheet.png")
    return outputs


def main() -> None:
    for locale in COPY:
        for path in generate_locale(locale):
            print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
