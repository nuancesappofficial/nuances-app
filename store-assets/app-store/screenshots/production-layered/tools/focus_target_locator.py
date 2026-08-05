from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


@dataclass(frozen=True)
class FocusTargetResult:
    box: tuple[int, int, int, int]
    confidence: float
    score_gap: float


class FocusTargetNotFound(RuntimeError):
    def __init__(self, best_candidate: FocusTargetResult, threshold: float) -> None:
        self.best_candidate = best_candidate
        super().__init__(
            f"Focus Target confidence {best_candidate.confidence:.3f} "
            f"is below threshold {threshold:.3f}"
        )


def _visual_feature(image: Image.Image, size: tuple[int, int]) -> np.ndarray:
    prepared = image.convert("RGB").resize(size, Image.Resampling.LANCZOS)
    prepared = prepared.filter(ImageFilter.GaussianBlur(radius=0.6))
    return np.asarray(prepared, dtype=np.float32)


def _similarity(reference: np.ndarray, candidate: np.ndarray) -> float:
    colour_distance = np.sqrt(np.mean(np.square(reference - candidate)))
    return max(0.0, 1.0 - float(colour_distance) / 255.0)


def locate_focus_target(
    screen: Image.Image,
    visual_reference: Image.Image,
    *,
    confidence_threshold: float = 0.72,
    target_feature_width: int = 72,
    height_scales: tuple[float, ...] = (0.90, 1.0, 1.10, 1.22),
) -> FocusTargetResult:
    """Locate a semantic Focus Target by its reference appearance, not coordinates."""
    if visual_reference.width <= 0 or visual_reference.height <= 0:
        raise ValueError("visual_reference must not be empty")

    reduction = min(1.0, target_feature_width / visual_reference.width)
    feature_screen_size = (
        max(1, round(screen.width * reduction)),
        max(1, round(screen.height * reduction)),
    )
    screen_feature = _visual_feature(screen, feature_screen_size)

    candidates: list[tuple[float, tuple[int, int, int, int]]] = []
    reference_width = max(2, round(visual_reference.width * reduction))
    base_height = max(2, round(visual_reference.height * reduction))

    for height_scale in height_scales:
        reference_height = max(2, round(base_height * height_scale))
        if reference_width > feature_screen_size[0] or reference_height > feature_screen_size[1]:
            continue
        reference_feature = _visual_feature(visual_reference, (reference_width, reference_height))
        for y in range(feature_screen_size[1] - reference_height + 1):
            for x in range(feature_screen_size[0] - reference_width + 1):
                candidate = screen_feature[y : y + reference_height, x : x + reference_width]
                score = _similarity(reference_feature, candidate)
                candidates.append((score, (x, y, x + reference_width, y + reference_height)))

    if not candidates:
        raise ValueError("visual_reference is larger than screen")

    candidates.sort(key=lambda item: item[0], reverse=True)
    best_score, coarse_box = candidates[0]
    non_overlapping_scores = [
        score
        for score, box in candidates[1:]
        if box[2] <= coarse_box[0]
        or box[0] >= coarse_box[2]
        or box[3] <= coarse_box[1]
        or box[1] >= coarse_box[3]
    ]
    runner_up = non_overlapping_scores[0] if non_overlapping_scores else 0.0

    inverse = 1.0 / reduction
    box = tuple(round(value * inverse) for value in coarse_box)
    box = (
        max(0, box[0]),
        max(0, box[1]),
        min(screen.width, box[2]),
        min(screen.height, box[3]),
    )
    result = FocusTargetResult(
        box=box,
        confidence=best_score,
        score_gap=max(0.0, best_score - runner_up),
    )
    if result.confidence < confidence_threshold:
        raise FocusTargetNotFound(result, confidence_threshold)
    return result


def refine_warm_action_target(
    screen: Image.Image,
    coarse: FocusTargetResult,
) -> FocusTargetResult:
    """Tighten a visually located coral/red action to its real painted bounds."""
    crop = np.asarray(screen.convert("RGB").crop(coarse.box), dtype=np.int16)
    red = crop[:, :, 0]
    green = crop[:, :, 1]
    blue = crop[:, :, 2]
    mask = (red >= 150) & (red - green >= 35) & (red - blue >= 35)
    ys, xs = np.nonzero(mask)
    if len(xs) < 50:
        raise FocusTargetNotFound(
            FocusTargetResult(coarse.box, 0.0, coarse.score_gap),
            0.5,
        )
    left = coarse.box[0] + int(xs.min())
    top = coarse.box[1] + int(ys.min())
    right = coarse.box[0] + int(xs.max()) + 1
    bottom = coarse.box[1] + int(ys.max()) + 1
    return FocusTargetResult(
        box=(left, top, right, bottom),
        confidence=coarse.confidence,
        score_gap=coarse.score_gap,
    )


def refine_repeated_dark_tiles_target(
    screen: Image.Image,
    coarse: FocusTargetResult,
) -> FocusTargetResult:
    """Find a moved horizontal row of repeated neutral dark UI tiles."""
    pixels = np.asarray(screen.convert("RGB"), dtype=np.int16)
    top = max(0, coarse.box[1] - 520)
    bottom = min(screen.height, coarse.box[3] + 120)
    region = pixels[top:bottom]
    red, green, blue = region[:, :, 0], region[:, :, 1], region[:, :, 2]
    neutral_tile = (
        (red >= 45)
        & (red <= 75)
        & (green >= 55)
        & (green <= 88)
        & (blue >= 70)
        & (blue <= 108)
        & (green > red)
        & (blue > green)
    )
    row_counts = neutral_tile.sum(axis=1)
    peak_index = int(row_counts.argmax())
    peak = int(row_counts[peak_index])
    if peak < screen.width * 0.35:
        raise FocusTargetNotFound(
            FocusTargetResult(coarse.box, 0.0, coarse.score_gap),
            0.5,
        )
    row_threshold = max(4, round(peak * 0.02))
    active = row_counts >= row_threshold
    band_top = peak_index
    misses = 0
    while band_top > 0 and misses < 3:
        band_top -= 1
        misses = 0 if active[band_top] else misses + 1
    band_top += misses
    band_bottom = peak_index + 1
    misses = 0
    while band_bottom < len(active) and misses < 3:
        misses = 0 if active[band_bottom] else misses + 1
        band_bottom += 1
    band_bottom -= misses

    band = neutral_tile[band_top:band_bottom]
    column_counts = band.sum(axis=0)
    column_threshold = max(4, round((band_bottom - band_top) * 0.04))
    columns = np.where(column_counts >= column_threshold)[0]
    if len(columns) == 0:
        raise FocusTargetNotFound(
            FocusTargetResult(coarse.box, 0.0, coarse.score_gap),
            0.5,
        )
    padding = 3
    return FocusTargetResult(
        box=(
            max(0, int(columns.min()) - padding),
            max(0, top + band_top - padding),
            min(screen.width, int(columns.max()) + 1 + padding),
            min(screen.height, top + band_bottom + padding),
        ),
        confidence=coarse.confidence,
        score_gap=coarse.score_gap,
    )


def save_focus_evidence(
    screen: Image.Image,
    result: FocusTargetResult,
    output: Path,
) -> None:
    evidence = screen.convert("RGB").copy()
    draw = ImageDraw.Draw(evidence)
    width = max(4, round(screen.width / 240))
    draw.rectangle(result.box, outline=(255, 211, 64), width=width)
    draw.text(
        (result.box[0], max(0, result.box[1] - 24)),
        f"Focus Target {result.confidence:.3f}",
        fill=(255, 211, 64),
        stroke_width=2,
        stroke_fill=(10, 25, 45),
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    evidence.save(output, optimize=True)
