import importlib.util
import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/generate-app-store-button-screenshots.py"


def load_generator():
    spec = importlib.util.spec_from_file_location("app_store_buttons", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class AppStoreButtonScreenshotTests(unittest.TestCase):
    def test_each_non_traditional_locale_has_six_ordered_messages(self):
        generator = load_generator()
        self.assertEqual(
            set(generator.COPY),
            {
                "01-English-US",
                "03-Chinese-Simplified",
                "04-Japanese",
                "05-Korean",
                "06-Spanish-Spain",
                "07-French-France",
            },
        )
        for messages in generator.COPY.values():
            self.assertEqual(list(messages), list(generator.SCREEN_KEYS))
            self.assertTrue(all(1 <= len(line) <= 2 for line in messages.values()))

    def test_render_preserves_app_store_dimensions_and_uncovered_pixels(self):
        generator = load_generator()
        source = Image.new("RGB", generator.CANVAS_SIZE, (7, 31, 51))
        rendered = generator.render_screenshot(source, ("Upload anytime.", "Learn later."))
        self.assertEqual(rendered.size, generator.CANVAS_SIZE)
        self.assertEqual(rendered.getpixel((20, 20)), source.getpixel((20, 20)))
        self.assertNotEqual(rendered.getpixel((generator.BUTTON_LEFT + 20, generator.BUTTON_TOP + 80)), source.getpixel((20, 20)))

    def test_second_screen_clears_original_action_button_below_overlay(self):
        generator = load_generator()
        background = (7, 31, 51)
        source = Image.new("RGB", generator.CANVAS_SIZE, background)
        for y in range(generator.BUTTON_BOTTOM, generator.BUTTON_BOTTOM + 90):
            for x in range(generator.BUTTON_LEFT, generator.BUTTON_RIGHT):
                source.putpixel((x, y), (74, 173, 236))

        rendered = generator.render_screenshot(
            source,
            ("Select words with one tap.",),
            clear_original_action=True,
        )

        pixel = rendered.getpixel((generator.CANVAS_SIZE[0] // 2, generator.BUTTON_BOTTOM + 70))
        distance_to_background = sum(abs(a - b) for a, b in zip(pixel, background))
        distance_to_old_button = sum(abs(a - b) for a, b in zip(pixel, (74, 173, 236)))
        self.assertLess(distance_to_background, distance_to_old_button)


if __name__ == "__main__":
    unittest.main()
