#!/usr/bin/env python3
import argparse
from pathlib import Path

from PIL import Image


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a no-gap horizontal App Store contact sheet")
    parser.add_argument("directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--panel-width", type=int, default=258)
    args = parser.parse_args()
    files = sorted(args.directory.glob("[0-9][0-9]-*.png"))
    if not files:
        parser.error(f"no sequential PNG files in {args.directory}")
    if args.panel_width < 1:
        parser.error("--panel-width must be positive")

    panel_height = round(2796 * args.panel_width / 1290)
    sheet = Image.new("RGB", (args.panel_width * len(files), panel_height), "white")
    for index, path in enumerate(files):
        with Image.open(path) as image:
            panel = image.convert("RGB").resize(
                (args.panel_width, panel_height), Image.Resampling.LANCZOS
            )
        sheet.paste(panel, (index * args.panel_width, 0))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output)
    print(f"created {args.output} from {len(files)} panels")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
