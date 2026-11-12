from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

from focus_target_locator import (
    locate_focus_target,
    refine_repeated_dark_tiles_target,
    refine_warm_action_target,
    save_focus_evidence,
)


ROOT = Path(__file__).resolve().parents[1]
BASES = ROOT / "bases"
DELIVERABLES = ROOT / "deliverables"
QA_LAYERS = ROOT / "qa-layers"
REFERENCE = ROOT.parents[0] / "final-traditional-chinese"
RAW_ROOT = ROOT.parents[0] / "raw"
FINAL_ROOT = ROOT.parents[0] / "final"

SF_ROUNDED = "/System/Library/Fonts/SFNSRounded.ttf"
SF_COMPACT_ROUNDED = "/System/Library/Fonts/SFCompactRounded.ttf"
HIRAGINO = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
PINGFANG = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc"
KOREAN = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

FILENAMES = (
    "00-ios-share-sheet.png",
    "01-upload.png",
    "02-select-word.png",
    "03-create-card.png",
    "04-real-usage.png",
    "05-pronunciation.png",
    "06-quiz.png",
)

# Inner screens, visually traced from the clean phone bases.
SCREENS = {
    1: (232, 819, 1057, 2668),
    2: (229, 822, 1072, 2614),
    3: (217, 819, 1045, 2662),
    4: (226, 720, 1054, 2665),
    5: (229, 756, 1051, 2584),
    6: (244, 774, 1047, 2519),
}

# Source rectangles of the enlargement layer in the Traditional Chinese master.
# These never move and preserve its effects exactly.
REFERENCE_POPOVERS = {
    1: (78, 2180, 1212, 2370),
    2: (88, 1798, 1202, 2024),
    3: (82, 1540, 1208, 1932),
    4: (74, 1070, 1216, 1602),
    5: (72, 1662, 1218, 2012),
    6: (94, 1933, 1185, 2158),
}

# The normal layer stays fixed. Only the independent enlargement moves until it
# visually covers the same raw UI element.
POPOVER_DESTINATIONS = {
    1: (78, 2290),
    2: (88, 1625),
    3: (82, 1450),
    4: (74, 930),
    5: (72, 1662),
    6: (94, 2110),
}

# These boxes teach the visual locator which semantic component to find in the
# Traditional reference. They are never used to crop another locale.
REFERENCE_TARGETS = {
    1: (48, 2182, 1158, 2365),
    2: (72, 1240, 1134, 1490),
    3: (62, 1120, 1144, 1450),
    4: (62, 335, 1144, 820),
    5: (73, 1472, 1133, 1888),
    6: (70, 1770, 1136, 2028),
}

TRADITIONAL_RAW_FILES = (
    "01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.32.07.png",
    "02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.37.22.png",
    "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 16.57.20.png",
    "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 16.57.27.png",
    "04-quick-quiz-question/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.07.04.png",
    "05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.07.19.png",
)

PANEL_RAW_INDEX = {1: 0, 2: 1, 3: 2, 4: 3, 5: 5, 6: 4}

RAW_FILES = {
    "01-English-US": (
        "01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.57.39.png",
        "02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.57.48.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.55.51.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.55.56.png",
        "04-quick-quiz-question/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 19.55.08.png",
        "05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 19.55.25.png",
    ),
    "04-Japanese": (
        "01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.53.26.png",
        "02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.53.52.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.18.44.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.18.50.png",
        "04-quick-quiz-question/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.11.44.png",
        "05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.11.54.png",
    ),
    "03-Chinese-Simplified": (
        "01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.52.27.png",
        "02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.53.03.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.23.06.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.23.11.png",
        "04-quick-quiz-question/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.10.57.png",
        "05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.11.15.png",
    ),
    "05-Korean": (
        "01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.54.57.png",
        "02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.55.14.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.23.42.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.23.46.png",
        "04-quick-quiz-question/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.12.29.png",
        "05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.12.43.png",
    ),
    "06-Spanish-Spain": (
        "01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.55.39.png",
        "02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.55.49.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.54.35.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.54.43.png",
        "04-quick-quiz-question/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.13.17.png",
        "05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.13.27.png",
    ),
    "07-French-France": (
        "01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.57.08.png",
        "02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.57.17.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.55.09.png",
        "03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 17.55.13.png",
        "04-quick-quiz-question/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.14.03.png",
        "05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.14.20.png",
    ),
}

COPY = {
    "01-English-US": (
        ("Save it now.\nLearn it later.", "Send any English you find to Nuances."),
        ("Upload anytime.\nLearn when you’re ready.", "Save images and text now. Learn them later."),
        ("Select words\nwith one tap.", "Long-press any word in an image to select it."),
        ("Build your own\nflashcards.", "Turn the English you find into personal study cards."),
        ("Learn how it’s\nreally used.", "See collocations, context, and examples together."),
        ("Check every sound\nfor accuracy.", "See each sound clearly and know what to improve."),
        ("Review your cards\nwith quick challenges.", "Practise repeatedly with your own content."),
    ),
    "04-Japanese": (
        ("アプリを開かず\nあとで学べる", "気になる英語を Nuances にシェア"),
        ("いつでも保存\nあとで学習", "画像や文章を先に保存、学ぶのはあとで"),
        ("ワンタップで\n単語を選択", "画像の単語を長押ししてすぐ選択"),
        ("自分だけの\n単語カードを作成", "出会った英語を自分の学習カードに"),
        ("自然な使い方が\nわかる", "コロケーション・文脈・例文をまとめて確認"),
        ("音ごとの\n発音精度を確認", "一音ずつ見えるから改善点がわかる"),
        ("ミニチャレンジで\nカードを復習", "自分のコンテンツで繰り返し練習"),
    ),
    "03-Chinese-Simplified": (
        ("不用打开 App\n也能先存下", "看到想学的英文，分享给 Nuances"),
        ("随时上传\n有空再学", "图片和文字先存着，想学时再处理"),
        ("一指选词", "长按图片上的单词，立即选取"),
        ("创建你的\n专属单词卡", "把遇到的英文变成自己的学习内容"),
        ("学会最地道的用法", "搭配词、语境和例句一次看懂"),
        ("测试每个音的\n发音准确度", "每个音都看得见，知道哪里要调整"),
        ("用小挑战复习\n自己的单词卡", "用自己的内容反复练习"),
    ),
    "05-Korean": (
        ("앱을 열지 않고\n먼저 저장", "배우고 싶은 영어를 Nuances에 공유하세요"),
        ("언제든 저장하고\n나중에 학습", "이미지와 글을 먼저 저장하고 편할 때 배우세요"),
        ("한 번의 터치로\n단어 선택", "이미지 속 단어를 길게 눌러 바로 선택하세요"),
        ("나만의\n단어 카드", "마주친 영어를 나만의 학습 카드로 만드세요"),
        ("자연스러운\n쓰임을 익히세요", "연어·문맥·예문을 함께 확인하세요"),
        ("각 소리의\n발음 정확도", "소리별로 확인하고 개선할 점을 알아보세요"),
        ("짧은 챌린지로\n나의 카드 복습", "나만의 콘텐츠로 반복 연습하세요"),
    ),
    "06-Spanish-Spain": (
        ("Guárdalo sin abrir\nla app", "Comparte con Nuances el inglés que quieras aprender."),
        ("Guarda ahora.\nAprende después.", "Guarda imágenes y texto y estúdianlos cuando quieras."),
        ("Elige palabras\ncon un toque.", "Mantén pulsada cualquier palabra de una imagen."),
        ("Crea tus propias\ntarjetas.", "Convierte el inglés que encuentres en material personal."),
        ("Aprende cómo se\nusa de verdad.", "Consulta colocaciones, contexto y ejemplos juntos."),
        ("Comprueba cada\nsonido al pronunciar.", "Ve cada sonido y descubre qué puedes mejorar."),
        ("Repasa tus tarjetas\ncon minirretos.", "Practica una y otra vez con tu propio contenido."),
    ),
    "07-French-France": (
        ("Enregistrez sans\nouvrir l’app", "Partagez avec Nuances l’anglais que vous voulez apprendre."),
        ("Enregistrez maintenant.\nApprenez plus tard.", "Gardez images et textes, puis apprenez à votre rythme."),
        ("Sélectionnez d’un\nseul geste.", "Appuyez longuement sur un mot dans une image."),
        ("Créez vos propres\nfiches.", "Transformez l’anglais rencontré en fiches personnelles."),
        ("Apprenez l’anglais\ntel qu’il se parle.", "Voyez collocations, contexte et exemples ensemble."),
        ("Vérifiez chaque son\nde votre prononciation.", "Visualisez chaque son et ce qu’il faut améliorer."),
        ("Révisez vos fiches\navec des mini-défis.", "Entraînez-vous avec le contenu qui vous appartient."),
    ),
}

FONT_BY_LOCALE = {
    "01-English-US": SF_ROUNDED,
    "03-Chinese-Simplified": PINGFANG,
    "04-Japanese": HIRAGINO,
    "05-Korean": KOREAN,
    "06-Spanish-Spain": SF_ROUNDED,
    "07-French-France": SF_ROUNDED,
}

# Measured from the Traditional master. The panorama intentionally shifts the
# first caption left and the second right; later captions sit near centre.
REFERENCE_CAPTION_LAYOUTS = {
    0: {"centre_x": 479, "title_top": 185, "title_height": 296, "subtitle_top": 536, "subtitle_height": 43},
    1: {"centre_x": 760, "title_top": 186, "title_height": 299, "subtitle_top": 540, "subtitle_height": 44},
    2: {"centre_x": 646, "title_top": 190, "title_height": 300, "subtitle_top": 546, "subtitle_height": 43},
    3: {"centre_x": 644, "title_top": 191, "title_height": 300, "subtitle_top": 546, "subtitle_height": 43},
    4: {"centre_x": 645, "title_top": 190, "title_height": 300, "subtitle_top": 546, "subtitle_height": 43},
    5: {"centre_x": 644, "title_top": 190, "title_height": 301, "subtitle_top": 546, "subtitle_height": 43},
    6: {"centre_x": 643, "title_top": 180, "title_height": 294, "subtitle_top": 525, "subtitle_height": 43},
}

TITLE_OVERRIDES = {
    ("01-English-US", 1): "Upload anytime.\nLearn when you’re\nready.",
}

FINAL_FOLDER_BY_LOCALE = {
    "01-English-US": "01-english-us",
    "03-Chinese-Simplified": "03-simplified-chinese",
    "04-Japanese": "04-japanese",
    "05-Korean": "05-korean",
    "06-Spanish-Spain": "06-spanish-spain",
    "07-French-France": "07-french-france",
}

NOTIFICATION_COPY = {
    "01-English-US": "Catch you later",
    "03-Chinese-Simplified": "收到🫡",
    "04-Japanese": "またあとで",
    "05-Korean": "나중에 봐요",
    "06-Spanish-Spain": "Hasta luego",
    "07-French-France": "À plus tard",
}

QUIZ_LABELS = {
    "01-English-US": "small, subtle differences",
    "03-Chinese-Simplified": "细微、细小的差异",
    "04-Japanese": "細かい・わずかな違い",
    "05-Korean": "작고 미세한 차이",
    "06-Spanish-Spain": "diferencias pequeñas y sutiles",
    "07-French-France": "de petites différences subtiles",
}


def normalize(path: Path) -> Image.Image:
    source = Image.open(path).convert("RGB")
    width = round(source.width * 2796 / source.height)
    source = source.resize((width, 2796), Image.Resampling.LANCZOS)
    left = (width - 1290) // 2
    return source.crop((left, 0, left + 1290, 2796))


def rounded_mask(size: tuple[int, int], radius: int, feather: int = 0) -> Image.Image:
    mask = Image.new("L", size, 0)
    inset = feather * 2
    ImageDraw.Draw(mask).rounded_rectangle(
        (inset, inset, size[0] - inset - 1, size[1] - inset - 1),
        radius=max(1, radius - inset), fill=255
    )
    return mask.filter(ImageFilter.GaussianBlur(feather)) if feather else mask


def paste_screen(canvas: Image.Image, raw: Image.Image, panel: int) -> None:
    target = SCREENS[panel]
    screen = raw.resize((target[2] - target[0], target[3] - target[1]), Image.Resampling.LANCZOS)
    mask = rounded_mask(screen.size, 78)
    canvas.paste(screen, target[:2], mask)


def add_shadow(canvas: Image.Image, target: tuple[int, int, int, int], radius: int = 42) -> None:
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    d.rounded_rectangle((target[0] + 4, target[1] + 20, target[2] + 4, target[3] + 20), radius=radius, fill=(0, 15, 30, 145))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    canvas.paste(shadow, (0, 0), shadow)


def soft_callout_shadow(size: tuple[int, int], radius: int) -> Image.Image:
    """Return a reference-like 3D shadow without an opaque duplicate silhouette."""
    padding = 48
    width, height = size
    layer_size = (width + padding * 2, height + padding * 2 + 28)
    combined = Image.new("RGBA", layer_size, (0, 0, 0, 0))

    ambient_alpha = Image.new("L", layer_size, 0)
    ImageDraw.Draw(ambient_alpha).rounded_rectangle(
        (padding, padding + 20, padding + width - 1, padding + 20 + height - 1),
        radius=radius,
        fill=62,
    )
    ambient_alpha = ambient_alpha.filter(ImageFilter.GaussianBlur(24))
    ambient = Image.new("RGBA", layer_size, (19, 35, 48, 0))
    ambient.putalpha(ambient_alpha)
    combined = Image.alpha_composite(combined, ambient)

    contact_alpha = Image.new("L", layer_size, 0)
    ImageDraw.Draw(contact_alpha).rounded_rectangle(
        (padding + 3, padding + 8, padding + width - 4, padding + 8 + height - 1),
        radius=max(1, radius - 3),
        fill=78,
    )
    contact_alpha = contact_alpha.filter(ImageFilter.GaussianBlur(10))
    contact = Image.new("RGBA", layer_size, (8, 24, 38, 0))
    contact.putalpha(contact_alpha)
    return Image.alpha_composite(combined, contact)


def popover_layer(panel: int) -> Image.Image:
    ref = Image.open(REFERENCE / FILENAMES[panel]).convert("RGBA")
    source = REFERENCE_POPOVERS[panel]
    return ref.crop(source)


def paste_popover(canvas: Image.Image, layer: Image.Image, panel: int) -> None:
    destination = POPOVER_DESTINATIONS[panel]
    mask = rounded_mask(layer.size, 62 if panel in (1, 6) else 48, feather=3)
    canvas.paste(layer, destination, mask)


def traditional_focus_reference(panel: int) -> Image.Image:
    raw_index = PANEL_RAW_INDEX[panel]
    path = (
        RAW_ROOT
        / "02-Chinese-Traditional"
        / "iphone-6.9"
        / TRADITIONAL_RAW_FILES[raw_index]
    )
    return Image.open(path).convert("RGB").crop(REFERENCE_TARGETS[panel])


def locate_panel_focus(raw: Image.Image, panel: int):
    focus = locate_focus_target(raw, traditional_focus_reference(panel))
    if panel == 1:
        focus = refine_warm_action_target(raw, focus)
    elif panel == 5:
        focus = refine_repeated_dark_tiles_target(raw, focus)
    return focus


def screen_box_to_canvas(
    box: tuple[int, int, int, int],
    raw_size: tuple[int, int],
    panel: int,
) -> tuple[int, int, int, int]:
    screen = SCREENS[panel]
    scale_x = (screen[2] - screen[0]) / raw_size[0]
    scale_y = (screen[3] - screen[1]) / raw_size[1]
    return (
        round(screen[0] + box[0] * scale_x),
        round(screen[1] + box[1] * scale_y),
        round(screen[0] + box[2] * scale_x),
        round(screen[1] + box[3] * scale_y),
    )


def callout_geometry(
    focus_box: tuple[int, int, int, int],
    raw_size: tuple[int, int],
    panel: int,
) -> tuple[tuple[int, int], tuple[int, int]]:
    reference = REFERENCE_POPOVERS[panel]
    width = reference[2] - reference[0]
    source_width = focus_box[2] - focus_box[0]
    source_height = focus_box[3] - focus_box[1]
    height = round(source_height * width / source_width)
    mapped = screen_box_to_canvas(focus_box, raw_size, panel)
    centre_x = (mapped[0] + mapped[2]) // 2
    centre_y = (mapped[1] + mapped[3]) // 2
    x = max(0, min(1290 - width, centre_x - width // 2))
    y = max(0, min(2796 - height, centre_y - height // 2))
    return (x, y), (width, height)


def add_raw_popover(canvas: Image.Image, raw: Image.Image, panel: int):
    """Build a clean callout from the locale's visually located raw UI pixels."""
    focus = locate_panel_focus(raw, panel)
    content = raw.crop(focus.box).convert("RGB")
    destination, content_size = callout_geometry(focus.box, raw.size, panel)
    content = content.resize(content_size, Image.Resampling.LANCZOS)
    radius = 62 if panel == 1 else 48
    shadow = soft_callout_shadow(content.size, radius)
    canvas.paste(
        shadow,
        (destination[0] - 48, destination[1] - 48),
        shadow,
    )
    canvas.paste(content, destination, rounded_mask(content.size, radius))
    outline = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(outline).rounded_rectangle(
        (
            destination[0] + 1,
            destination[1] + 1,
            destination[0] + content.width - 2,
            destination[1] + content.height - 2,
        ),
        radius=radius,
        outline=(255, 255, 255, 78),
        width=3,
    )
    canvas.paste(outline, (0, 0), outline)
    return focus


def add_located_reference_popover(canvas: Image.Image, raw: Image.Image, panel: int):
    """Preserve the master's complete effect while deriving placement from local UI."""
    focus = locate_panel_focus(raw, panel)
    layer = popover_layer(panel)
    mapped = screen_box_to_canvas(focus.box, raw.size, panel)
    centre_x = (mapped[0] + mapped[2]) // 2
    centre_y = (mapped[1] + mapped[3]) // 2
    destination = (
        max(0, min(1290 - layer.width, centre_x - layer.width // 2)),
        max(0, min(2796 - layer.height, centre_y - layer.height // 2)),
    )
    shadow = soft_callout_shadow(layer.size, 48)
    canvas.paste(shadow, (destination[0] - 48, destination[1] - 48), shadow)
    canvas.paste(layer, destination, rounded_mask(layer.size, 48, feather=3))
    return focus, destination


def add_localized_quiz_popover(canvas: Image.Image, locale: str) -> None:
    """Keep the master's pass treatment, replacing only its localized answer label."""
    layer = popover_layer(6)

    draw = ImageDraw.Draw(layer)
    # Extend each untouched glass row through the old glyphs. This preserves the
    # master's vertical glow without introducing a rectangular repair patch.
    for y in range(55, 174):
        colour = layer.getpixel((230, y))
        draw.line((230, y, 1036, y), fill=colour, width=1)
    font_path = FONT_BY_LOCALE[locale]
    label = QUIZ_LABELS[locale]
    label_font = fit_font(label, font_path, 55, 730)
    draw.text((636, 113), label, font=label_font, fill=(83, 223, 100), anchor="mm")
    paste_popover(canvas, layer, 6)


def fit_font(
    text: str,
    path: str,
    initial: int,
    max_width: int,
    variation: str | None = None,
) -> ImageFont.FreeTypeFont:
    size = initial
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    while size >= 50:
        font = ImageFont.truetype(path, size=size)
        if variation:
            font.set_variation_by_name(variation)
        box = probe.multiline_textbbox((0, 0), text, font=font, spacing=0, align="center")
        if box[2] - box[0] <= max_width:
            return font
        size -= 2
    font = ImageFont.truetype(path, size=50)
    if variation:
        font.set_variation_by_name(variation)
    return font


def fit_font_to_reference_box(
    text: str,
    path: str,
    max_width: int,
    max_pixel_height: int,
    variation: str | None = None,
) -> ImageFont.FreeTypeFont:
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    for size in range(220, 19, -2):
        font = ImageFont.truetype(path, size=size)
        if variation:
            font.set_variation_by_name(variation)
        box = probe.multiline_textbbox((0, 0), text, font=font, spacing=0, align="center")
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_pixel_height:
            return font
    font = ImageFont.truetype(path, size=20)
    if variation:
        font.set_variation_by_name(variation)
    return font


def draw_text_at_reference_box(
    canvas: Image.Image,
    text: str,
    font: ImageFont.FreeTypeFont,
    centre_x: int,
    pixel_top: int,
    fill: tuple[int, int, int],
    *,
    multiline: bool,
) -> None:
    draw = ImageDraw.Draw(canvas)
    if multiline:
        box = draw.multiline_textbbox((0, 0), text, font=font, spacing=0, align="center")
    else:
        box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    position = (centre_x - width / 2 - box[0], pixel_top - box[1])
    if multiline:
        draw.multiline_text(position, text, font=font, fill=fill, align="center", spacing=0)
    else:
        draw.text(position, text, font=font, fill=fill)


def add_caption(canvas: Image.Image, locale: str, panel: int) -> None:
    title, subtitle = COPY[locale][panel]
    title = TITLE_OVERRIDES.get((locale, panel), title)
    layout = REFERENCE_CAPTION_LAYOUTS[panel]
    is_latin = locale in ("01-English-US", "06-Spanish-Spain", "07-French-France")
    font_path = SF_COMPACT_ROUNDED if is_latin else FONT_BY_LOCALE[locale]
    title_variation = "Semibold" if is_latin else None
    subtitle_variation = "Medium" if is_latin else None
    safe_width = max(400, 2 * min(layout["centre_x"], 1290 - layout["centre_x"]) - 48)
    title_font = fit_font_to_reference_box(
        title,
        font_path,
        max_width=min(1160, safe_width),
        max_pixel_height=layout["title_height"],
        variation=title_variation,
    )
    subtitle_font = fit_font_to_reference_box(
        subtitle,
        font_path,
        max_width=min(1140, safe_width),
        max_pixel_height=layout["subtitle_height"],
        variation=subtitle_variation,
    )
    draw_text_at_reference_box(
        canvas,
        title,
        title_font,
        layout["centre_x"],
        layout["title_top"],
        (24, 86, 207),
        multiline=True,
    )
    draw_text_at_reference_box(
        canvas,
        subtitle,
        subtitle_font,
        layout["centre_x"],
        layout["subtitle_top"],
        (18, 39, 56),
        multiline=False,
    )


def add_notification(canvas: Image.Image, locale: str) -> None:
    ref = Image.open(REFERENCE / FILENAMES[0]).convert("RGB")
    target = (72, 965, 1218, 1175)
    crop = ref.crop(target)
    mask = rounded_mask(crop.size, 62, feather=4)
    canvas.paste(crop, target[:2], mask)

    # Remove only the old notification phrase, preserving icon, title, time and glass effect.
    draw = ImageDraw.Draw(canvas)
    for y in range(1074, 1146):
        left = canvas.getpixel((270, y))
        right = canvas.getpixel((800, y))
        for x in range(270, 801):
            ratio = (x - 270) / 530
            colour = tuple(round(left[c] * (1 - ratio) + right[c] * ratio) for c in range(3))
            canvas.putpixel((x, y), colour)
    font_path = FONT_BY_LOCALE[locale]
    message = NOTIFICATION_COPY[locale]
    draw.text((286, 1102), message, font=ImageFont.truetype(font_path, 46), fill=(238, 244, 250), anchor="lm")



def raw_images(locale: str) -> list[Image.Image]:
    base = RAW_ROOT / locale / "iphone-6.9"
    return [Image.open(base / relative).convert("RGB") for relative in RAW_FILES[locale]]


def render_locale(locale: str, panels: tuple[int, ...] = tuple(range(7))) -> None:
    output = DELIVERABLES / locale / "iphone-6.9"
    qa_output = QA_LAYERS / locale / "iphone-6.9"
    output.mkdir(parents=True, exist_ok=True)
    qa_output.mkdir(parents=True, exist_ok=True)
    raws = raw_images(locale)

    for panel in panels:
        filename = FILENAMES[panel]
        canvas = normalize(BASES / filename)
        if panel == 0:
            add_notification(canvas, locale)
        else:
            # Panel-to-raw mapping: 01 capture, 02 import, 03 front, 04 back, 05 pronunciation, 06 quiz.
            raw_index = PANEL_RAW_INDEX[panel]
            raw = raws[raw_index]
            paste_screen(canvas, raw, panel)
            if panel == 6:
                add_localized_quiz_popover(canvas, locale)
            elif panel in (2, 5):
                focus, _ = add_located_reference_popover(canvas, raw, panel)
                save_focus_evidence(raw, focus, qa_output / f"focus-{filename}")
            else:
                focus = add_raw_popover(canvas, raw, panel)
                save_focus_evidence(raw, focus, qa_output / f"focus-{filename}")
        # QA artifact intentionally stops before typography. Captions are the final layer.
        canvas.save(qa_output / filename, optimize=True)
        add_caption(canvas, locale, panel)
        canvas.save(output / filename, optimize=True)

    sheet = Image.new("RGB", (258 * 7, 559), "white")
    for panel, filename in enumerate(FILENAMES):
        image = Image.open(output / filename).convert("RGB").resize((258, 559), Image.Resampling.LANCZOS)
        sheet.paste(image, (panel * 258, 0))
    sheet.save(output / "panorama-contact-sheet.jpg", quality=95)


def publish_locale(locale: str) -> Path:
    """Render one locale and publish its seven ordered PNGs to final."""
    render_locale(locale)
    source = DELIVERABLES / locale / "iphone-6.9"
    destination = FINAL_ROOT / FINAL_FOLDER_BY_LOCALE[locale]
    destination.mkdir(parents=True, exist_ok=True)
    for filename in FILENAMES:
        shutil.copy2(source / filename, destination / filename)
    return destination


if __name__ == "__main__":
    render_locale("01-English-US", panels=(1,))
