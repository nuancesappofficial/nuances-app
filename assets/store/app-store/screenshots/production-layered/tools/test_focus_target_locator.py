from pathlib import Path
import sys

from PIL import Image, ImageDraw


TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

from focus_target_locator import (
    FocusTargetNotFound,
    FocusTargetResult,
    locate_focus_target,
    refine_repeated_dark_tiles_target,
    refine_warm_action_target,
)


def make_fixture(target_xy: tuple[int, int]) -> tuple[Image.Image, Image.Image, tuple[int, int, int, int]]:
    canvas = Image.new("RGB", (420, 520), (12, 38, 65))
    draw = ImageDraw.Draw(canvas)
    x, y = target_xy
    box = (x, y, x + 250, y + 62)
    draw.rounded_rectangle(box, radius=18, fill=(239, 112, 108), outline=(255, 176, 170), width=3)
    draw.rectangle((x + 102, y + 24, x + 148, y + 38), fill=(245, 245, 245))
    reference = canvas.crop(box)
    return canvas, reference, box


def test_locator_follows_visual_target_instead_of_reference_xy() -> None:
    _, reference, _ = make_fixture((30, 80))
    moved, _, expected = make_fixture((124, 371))

    result = locate_focus_target(moved, reference, confidence_threshold=0.55)

    assert abs(result.box[0] - expected[0]) <= 4, (result, expected)
    assert abs(result.box[1] - expected[1]) <= 4, (result, expected)
    assert result.confidence >= 0.55


def test_locator_rejects_a_screen_without_the_visual_target() -> None:
    _, reference, _ = make_fixture((30, 80))
    blank = Image.new("RGB", (420, 520), (12, 38, 65))

    try:
        locate_focus_target(blank, reference, confidence_threshold=0.55)
    except FocusTargetNotFound as error:
        assert error.best_candidate.confidence < 0.55
    else:
        raise AssertionError("blank screen was accepted as a Focus Target")


def test_warm_action_refinement_removes_surrounding_screen_background() -> None:
    screen, _, expected = make_fixture((124, 371))
    coarse = FocusTargetResult(box=(100, 340, 400, 470), confidence=0.9, score_gap=0.2)

    refined = refine_warm_action_target(screen, coarse)

    assert abs(refined.box[0] - expected[0]) <= 2, (refined, expected)
    assert abs(refined.box[1] - expected[1]) <= 2, (refined, expected)
    assert abs(refined.box[2] - expected[2]) <= 2, (refined, expected)
    assert abs(refined.box[3] - expected[3]) <= 2, (refined, expected)


def test_repeated_tile_refinement_finds_the_visual_row_after_it_moves() -> None:
    screen = Image.new("RGB", (620, 760), (32, 41, 58))
    draw = ImageDraw.Draw(screen)
    for left in (54, 194, 334, 474):
        draw.rounded_rectangle((left, 406, left + 110, 548), radius=22, fill=(54, 65, 83))
    coarse = FocusTargetResult(box=(40, 500, 580, 690), confidence=0.92, score_gap=0.1)

    refined = refine_repeated_dark_tiles_target(screen, coarse)

    assert abs(refined.box[0] - 54) <= 4, refined
    assert abs(refined.box[1] - 406) <= 4, refined
    assert abs(refined.box[2] - 584) <= 4, refined
    assert abs(refined.box[3] - 549) <= 4, refined


if __name__ == "__main__":
    test_locator_follows_visual_target_instead_of_reference_xy()
    test_locator_rejects_a_screen_without_the_visual_target()
    test_warm_action_refinement_removes_surrounding_screen_background()
    test_repeated_tile_refinement_finds_the_visual_row_after_it_moves()
    print("focus target locator contract passed")
