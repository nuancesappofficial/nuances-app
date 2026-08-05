from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS_ROOT = ROOT.parent
FINAL_ROOT = SCREENSHOTS_ROOT / "final"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from render_localized import callout_geometry, locate_panel_focus, screen_box_to_canvas, soft_callout_shadow


FINAL_FOLDERS = (
    "01-english-us",
    "02-traditional-chinese",
    "03-simplified-chinese",
    "04-japanese",
    "05-korean",
    "06-spanish-spain",
    "07-french-france",
)


def test_delivery_contract() -> None:
    """The delivery seam is seven ordered, App Store-sized PNGs per locale."""
    for locale in ("01-English-US",):
        output = ROOT / "deliverables" / locale / "iphone-6.9"
        files = sorted(output.glob("[0-9][0-9]-*.png"))
        assert len(files) == 7, (locale, files)
        for file in files:
            with Image.open(file) as image:
                assert image.size == (1290, 2796), (file, image.size)
                assert image.mode == "RGB", (file, image.mode)


def test_final_localized_delivery_contract() -> None:
    """Final contains seven clearly ordered screenshots in each language folder."""
    for folder in FINAL_FOLDERS:
        output = FINAL_ROOT / folder
        files = sorted(output.glob("[0-9][0-9]-*.png"))
        assert [file.name for file in files] == [
            "00-ios-share-sheet.png",
            "01-upload.png",
            "02-select-word.png",
            "03-create-card.png",
            "04-real-usage.png",
            "05-pronunciation.png",
            "06-quiz.png",
        ], (folder, files)
        for file in files:
            with Image.open(file) as image:
                assert image.size == (1290, 2796), (file, image.size)
                assert image.mode == "RGB", (file, image.mode)


def test_upload_highlight_preserves_raw_pixels_and_aspect_ratio() -> None:
    """The enlarged Upload action is an undistorted crop from the locale raw UI."""
    raw_path = (
        SCREENSHOTS_ROOT
        / "raw"
        / "01-English-US"
        / "iphone-6.9"
        / "01-capture"
        / "Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.57.39.png"
    )
    output_path = ROOT / "deliverables" / "01-English-US" / "iphone-6.9" / "01-upload.png"

    with Image.open(raw_path) as raw, Image.open(output_path) as output:
        raw = raw.convert("RGB")
        focus = locate_panel_focus(raw, 1)
        destination, target_size = callout_geometry(focus.box, raw.size, 1)
        expected = raw.crop(focus.box).resize(target_size, Image.Resampling.LANCZOS)
        actual = output.convert("RGB").crop(
            (
                destination[0],
                destination[1],
                destination[0] + target_size[0],
                destination[1] + target_size[1],
            )
        )

    # Ignore rounded corners; the centre must be the raw UI crop pixel-for-pixel.
    inset = (70, 24, target_size[0] - 70, target_size[1] - 24)
    difference = ImageChops.difference(expected.crop(inset), actual.crop(inset))
    assert difference.getbbox() is None, "Upload highlight was distorted or inherited reference pixels"


def test_upload_3d_shadow_has_soft_alpha_without_an_opaque_second_pill() -> None:
    shadow = soft_callout_shadow((1134, 150), radius=62)
    alpha = shadow.getchannel("A")
    histogram = alpha.histogram()
    values = {value for value, count in enumerate(histogram) if count}

    assert len(values) >= 24, "shadow edge is not smoothly feathered"
    assert max(values) < 150, "shadow is opaque enough to read as a second pill"
    assert alpha.getbbox() is not None


def test_english_upload_caption_is_large_and_vertically_centred_above_phone() -> None:
    output_path = ROOT / "deliverables" / "01-English-US" / "iphone-6.9" / "01-upload.png"
    with Image.open(output_path) as output:
        pixels = np.asarray(output.convert("RGB"))

    # Stay clear of the blue panorama ribbon at the left edge.
    region = pixels[60:570, 350:940]
    blue = (
        (np.abs(region[:, :, 0].astype(int) - 24) <= 2)
        & (np.abs(region[:, :, 1].astype(int) - 86) <= 2)
        & (np.abs(region[:, :, 2].astype(int) - 207) <= 2)
    )
    ys, xs = np.nonzero(blue)
    assert len(xs) > 1000, "English Upload title was not found"
    title_height = int(ys.max() - ys.min() + 1)
    title_centre_y = 60 + (int(ys.min()) + int(ys.max())) / 2
    assert 294 <= title_height <= 302, title_height
    assert 332 <= title_centre_y <= 339, title_centre_y

    subtitle_region = pixels[500:590, 250:1270]
    dark = (
        (np.abs(subtitle_region[:, :, 0].astype(int) - 18) <= 2)
        & (np.abs(subtitle_region[:, :, 1].astype(int) - 39) <= 2)
        & (np.abs(subtitle_region[:, :, 2].astype(int) - 56) <= 2)
    )
    subtitle_ys, _ = np.nonzero(dark)
    assert 539 <= 500 + int(subtitle_ys.min()) <= 541
    assert 582 <= 500 + int(subtitle_ys.max()) <= 585


def test_english_select_and_usage_captions_match_the_large_title_scale() -> None:
    """Panels 02 and 04 use the same prominent title scale as the other cards."""
    for filename in ("02-select-word.png", "04-real-usage.png"):
        output_path = ROOT / "deliverables" / "01-English-US" / "iphone-6.9" / filename
        with Image.open(output_path) as output:
            pixels = np.asarray(output.convert("RGB"))
        region = pixels[120:540, 80:1210]
        blue = (
            (np.abs(region[:, :, 0].astype(int) - 24) <= 2)
            & (np.abs(region[:, :, 1].astype(int) - 86) <= 2)
            & (np.abs(region[:, :, 2].astype(int) - 207) <= 2)
        )
        ys, _ = np.nonzero(blue)
        assert len(ys) > 1000, (filename, "title missing")
        title_height = int(ys.max() - ys.min() + 1)
        assert 285 <= title_height <= 305, (filename, title_height)


def test_notification_rewrite_does_not_touch_the_nuances_title() -> None:
    """Only the message is localized; the fixed app title stays pixel-identical."""
    english_path = ROOT / "deliverables" / "01-English-US" / "iphone-6.9" / "00-ios-share-sheet.png"
    reference_path = ROOT.parent / "final-traditional-chinese" / "00-ios-share-sheet.png"
    with Image.open(english_path) as english, Image.open(reference_path) as reference:
        title_box = (286, 1012, 552, 1070)
        difference = ImageChops.difference(
            english.convert("RGB").crop(title_box), reference.convert("RGB").crop(title_box)
        )
    assert difference.getbbox() is None, "localized message cleanup damaged the Nuances title"


def test_select_word_highlight_uses_the_complete_reference_word_row() -> None:
    """The enlarged OCR tokens are fixed English content and must not be ceiling-clipped."""
    output_path = ROOT / "deliverables" / "01-English-US" / "iphone-6.9" / "02-select-word.png"
    reference_path = ROOT.parent / "final-traditional-chinese" / "02-select-word.png"
    raw_path = (
        SCREENSHOTS_ROOT / "raw" / "01-English-US" / "iphone-6.9" / "02-text-image-import"
        / "Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.57.48.png"
    )
    with Image.open(output_path) as output, Image.open(reference_path) as reference, Image.open(raw_path) as raw:
        # Independent source of truth: the known-good Traditional master overlay.
        expected = reference.convert("RGB").crop((88, 1798, 1202, 2024))
        focus = locate_panel_focus(raw.convert("RGB"), 2)
        mapped = screen_box_to_canvas(focus.box, raw.size, 2)
        destination = ((mapped[0] + mapped[2] - expected.width) // 2,
                       (mapped[1] + mapped[3] - expected.height) // 2)
        actual = output.convert("RGB").crop((destination[0], destination[1],
                                             destination[0] + expected.width,
                                             destination[1] + expected.height))
    inset = (60, 16, expected.width - 60, expected.height - 16)
    assert ImageChops.difference(expected.crop(inset), actual.crop(inset)).getbbox() is None


def test_pronunciation_highlight_keeps_full_height_and_score_colours() -> None:
    """All IPA glyphs and scores fit, with green passes and the orange weak sound."""
    output_path = ROOT / "deliverables" / "01-English-US" / "iphone-6.9" / "05-pronunciation.png"
    with Image.open(output_path) as output:
        pixels = np.asarray(output.convert("RGB"))[1500:2150]
    green = (pixels[:, :, 1] > pixels[:, :, 0] * 1.25) & (pixels[:, :, 1] > pixels[:, :, 2] * 1.15)
    orange = (pixels[:, :, 0] > 180) & (pixels[:, :, 1] > 90) & (pixels[:, :, 1] < pixels[:, :, 0] * .85)
    assert int(green.sum()) > 9000, "IPA pass colours are missing"
    assert int(orange.sum()) > 2500, "IPA weak-sound colour is missing"


def test_quiz_highlight_is_a_clean_green_pass_state() -> None:
    """The correct option uses the master's saturated green treatment, not gray interpolation."""
    output_path = ROOT / "deliverables" / "01-English-US" / "iphone-6.9" / "06-quiz.png"
    with Image.open(output_path) as output:
        pixels = np.asarray(output.convert("RGB"))[1900:2350]
    vivid_green = (pixels[:, :, 1] > pixels[:, :, 0] * 1.45) & (pixels[:, :, 1] > pixels[:, :, 2] * 1.20)
    assert int(vivid_green.sum()) > 18000, "PASS highlight is gray or muddy"
    # The repaired label field must merge into the original glass without a box edge.
    full = np.asarray(Image.open(output_path).convert("RGB"), dtype=int)
    top_jump = np.abs(full[2165, 350:940] - full[2164, 350:940]).mean()
    bottom_jump = np.abs(full[2284, 350:940] - full[2283, 350:940]).mean()
    assert max(top_jump, bottom_jump) < 3.0, (top_jump, bottom_jump)


if __name__ == "__main__":
    test_delivery_contract()
    test_final_localized_delivery_contract()
    test_upload_highlight_preserves_raw_pixels_and_aspect_ratio()
    test_upload_3d_shadow_has_soft_alpha_without_an_opaque_second_pill()
    test_english_upload_caption_is_large_and_vertically_centred_above_phone()
    test_english_select_and_usage_captions_match_the_large_title_scale()
    test_notification_rewrite_does_not_touch_the_nuances_title()
    test_select_word_highlight_uses_the_complete_reference_word_row()
    test_pronunciation_highlight_keeps_full_height_and_score_colours()
    test_quiz_highlight_is_a_clean_green_pass_state()
    print("delivery contract passed")
