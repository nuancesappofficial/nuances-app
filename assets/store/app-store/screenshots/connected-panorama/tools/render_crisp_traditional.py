from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "02-Chinese-Traditional" / "typography-final" / "clean-backgrounds" / "source"
OUTPUT = ROOT / "02-Chinese-Traditional" / "typography-final" / "app-store-6.9"
FONT = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc"

PANELS = [
    ("00-ios-share-sheet.png", "不用開 App\n也能先存著", "看到想學的英文，分享給 Nuances", "left"),
    ("01-upload.png", "隨時上傳\n有空再學", "圖片與文字先收著，想學時再處理", "offset"),
    ("02-select-word.png", "一指選字", "長按照片上的單字，立即選取", "center"),
    ("03-create-card.png", "建立你的\n專屬字卡", "把遇見的英文變成自己的學習內容", "center"),
    ("04-real-usage.png", "學會最道地用法", "搭配詞、語境與例句一次看懂", "center"),
    ("05-pronunciation.png", "測驗每個音的\n發音準確度", "每個音都看得見，知道哪裡要調整", "center"),
    ("06-quiz.png", "用小挑戰複習\n自己的字卡", "用自己的內容反覆練習", "center"),
]


def fit_font(text: str, max_width: int, initial: int, index: int = 10) -> ImageFont.FreeTypeFont:
    size = initial
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    while size >= 24:
        font = ImageFont.truetype(FONT, size=size, index=index)
        bounds = probe.multiline_textbbox((0, 0), text, font=font, spacing=8, align="center")
        if bounds[2] - bounds[0] <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(FONT, size=72, index=index)


def render_panel(filename: str, title: str, subtitle: str, alignment: str) -> None:
    source = Image.open(SOURCE / filename).convert("RGB")
    scaled_width = round(source.width * 2796 / source.height)
    source = source.resize((scaled_width, 2796), Image.Resampling.LANCZOS)
    left = (scaled_width - 1290) // 2
    image = source.crop((left, 0, left + 1290, 2796))
    draw = ImageDraw.Draw(image)
    w, _ = image.size

    title_size = 170 if "\n" not in title else 150
    max_width = 940 if alignment == "left" else (980 if alignment == "offset" else 1130)
    title_font = fit_font(title, max_width, title_size)
    subtitle_font = fit_font(subtitle, max_width, 48, index=2)

    if alignment == "left":
        x, anchor, text_align = 42, "la", "left"
        title_y = 145
    elif alignment == "offset":
        x, anchor, text_align = 760, "ma", "center"
        title_y = 150
    else:
        x, anchor, text_align = w // 2, "ma", "center"
        title_y = 155 if "\n" in title else 235

    draw.multiline_text(
        (x, title_y),
        title,
        font=title_font,
        fill=(24, 86, 207),
        spacing=2,
        align=text_align,
        anchor=anchor,
        stroke_width=0,
    )
    title_box = draw.multiline_textbbox(
        (x, title_y), title, font=title_font, spacing=2, align=text_align, anchor=anchor
    )
    subtitle_y = title_box[3] + 42
    draw.text(
        (x, subtitle_y),
        subtitle,
        font=subtitle_font,
        fill=(18, 39, 56),
        anchor=anchor,
        align=text_align,
    )
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT / filename, optimize=True)


def contact_sheet() -> None:
    files = [OUTPUT / panel[0] for panel in PANELS]
    width, height = 258, 559
    sheet = Image.new("RGB", (width * len(files), height))
    for index, file in enumerate(files):
        panel = Image.open(file).convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
        sheet.paste(panel, (index * width, 0))
    sheet.save(OUTPUT / "panorama-contact-sheet.jpg", quality=95)


if __name__ == "__main__":
    for panel in PANELS:
        render_panel(*panel)
    contact_sheet()
