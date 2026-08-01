#!/usr/bin/env python3
from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RAW_ROOT = ROOT / "store-assets/app-store/screenshots/raw"
OUT_ROOT = ROOT / "store-assets/app-store/screenshots/preview"

CANVAS_SIZE = (1290, 2796)
FONT_REGULAR = "/System/Library/Fonts/SFNS.ttf"
IOS_STATUS_BAR_CROP_PX = 164
TITLE_FONT_CANDIDATES = [
    "/Library/Fonts/Microsoft JhengHei Bold.ttf",
    "/Library/Fonts/Microsoft JhengHei.ttf",
    "/System/Library/Fonts/Supplemental/Microsoft JhengHei Bold.ttf",
    "/System/Library/Fonts/Supplemental/Microsoft JhengHei.ttf",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/SFNS.ttf",
]


ENGLISH_US_COPY = {
    "01-capture": ("Capture instantly.", ""),
    "02-text-image-import": ("Text or images.", ""),
    "03-real-context-a": ("Real context.", ""),
    "03-real-context-b": ("Every nuance.", ""),
    "04-quick-quiz-question": ("Quick quizzes.", ""),
    "05-pronunciation-score": ("Pronunciation score.", ""),
}


def resolve_title_font_path() -> str:
    for path in TITLE_FONT_CANDIDATES:
        if Path(path).exists():
            return path
    return FONT_REGULAR


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(resolve_title_font_path() if bold else FONT_REGULAR, size=size)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if draw.textbbox((0, 0), candidate, font=fnt)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_centered_lines(
    draw: ImageDraw.ImageDraw,
    lines: Iterable[str],
    y: int,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    line_gap: int,
) -> int:
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=fnt)
        x = (CANVAS_SIZE[0] - (bbox[2] - bbox[0])) // 2
        draw.text((x, y), line, font=fnt, fill=fill)
        y += bbox[3] - bbox[1] + line_gap
    return y


def sample_app_background(raw: Image.Image) -> tuple[int, int, int]:
    sample_y = min(raw.height - 1, IOS_STATUS_BAR_CROP_PX + 24)
    samples = [
        raw.getpixel((12, sample_y)),
        raw.getpixel((raw.width - 13, sample_y)),
        raw.getpixel((raw.width // 2, sample_y)),
        raw.getpixel((12, min(raw.height - 1, sample_y + 120))),
        raw.getpixel((raw.width - 13, min(raw.height - 1, sample_y + 120))),
    ]
    return tuple(round(sum(pixel[channel] for pixel in samples) / len(samples)) for channel in range(3))


def make_preview(raw_path: Path, out_path: Path, title: str, subtitle: str) -> None:
    raw = Image.open(raw_path).convert("RGB")
    bg_color = sample_app_background(raw)
    canvas = Image.new("RGB", CANVAS_SIZE, bg_color)
    draw = ImageDraw.Draw(canvas)

    raw = raw.crop((0, IOS_STATUS_BAR_CROP_PX, raw.width, raw.height))
    max_w = CANVAS_SIZE[0]
    max_h = 2480
    scale = min(max_w / raw.width, max_h / raw.height)
    shot_size = (math.floor(raw.width * scale), math.floor(raw.height * scale))
    shot = raw.resize(shot_size, Image.Resampling.LANCZOS)

    x = (CANVAS_SIZE[0] - shot_size[0]) // 2
    y = CANVAS_SIZE[1] - shot_size[1]

    title_font = font(132, bold=True)
    subtitle_font = font(34)
    title_lines = wrap_text(draw, title, title_font, 1080)
    subtitle_lines = wrap_text(draw, subtitle, subtitle_font, 980)
    text_block_height = len(title_lines) * 148 + (len(subtitle_lines) * 46 if subtitle else 0)
    text_y = max(54, (y - text_block_height) // 2)
    text_y = draw_centered_lines(draw, title_lines, text_y, title_font, (248, 250, 252), 10)
    if subtitle:
        draw_centered_lines(draw, subtitle_lines, text_y + 14, subtitle_font, (186, 212, 231), 8)

    canvas.paste(shot, (x, y))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, quality=95)


def english_raw_files() -> list[tuple[str, Path]]:
    base = RAW_ROOT / "01-English-US/iphone-6.9"
    pairs: list[tuple[str, Path]] = []
    for folder in ["01-capture", "02-text-image-import", "04-quick-quiz-question", "05-pronunciation-score"]:
        files = sorted((base / folder).glob("*.png"))
        if files:
            pairs.append((folder, files[0]))
    context_files = sorted((base / "03-real-context").glob("*.png"))
    if context_files:
        pairs.insert(2, ("03-real-context-a", context_files[0]))
    if len(context_files) > 1:
        pairs.insert(3, ("03-real-context-b", context_files[1]))
    return pairs


def make_contact_sheet(paths: list[Path], out_path: Path) -> None:
    thumbs: list[Image.Image] = []
    for path in paths:
        img = Image.open(path).convert("RGB")
        img.thumbnail((260, 564), Image.Resampling.LANCZOS)
        thumbs.append(img.copy())

    sheet = Image.new("RGB", (len(thumbs) * 300 + 40, 620), "#071F33")
    for i, img in enumerate(thumbs):
        x = 20 + i * 300 + (260 - img.width) // 2
        y = 28 + (564 - img.height) // 2
        sheet.paste(img, (x, y))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, quality=95)


def main() -> None:
    output_paths: list[Path] = []
    out_base = OUT_ROOT / "01-English-US/iphone-6.9"
    for index, (key, raw_path) in enumerate(english_raw_files(), start=1):
        title, subtitle = ENGLISH_US_COPY[key]
        out_path = out_base / f"{index:02d}-{key}.png"
        make_preview(raw_path, out_path, title, subtitle)
        output_paths.append(out_path)
    make_contact_sheet(output_paths, out_base / "00-contact-sheet.png")
    print("\n".join(str(path.relative_to(ROOT)) for path in output_paths))
    print((out_base / "00-contact-sheet.png").relative_to(ROOT))


if __name__ == "__main__":
    main()
