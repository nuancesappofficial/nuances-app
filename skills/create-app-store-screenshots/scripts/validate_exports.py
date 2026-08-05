#!/usr/bin/env python3
import argparse
from pathlib import Path
import re
import sys

from PIL import Image


ORDERED_NAME = re.compile(r"^(\d{2})-[a-z0-9][a-z0-9-]*\.png$", re.IGNORECASE)


def validate(directory: Path, expected_count: int | None) -> list[str]:
    errors: list[str] = []
    files = sorted(directory.glob("*.png"))
    if expected_count is not None and len(files) != expected_count:
        errors.append(f"expected {expected_count} PNGs, found {len(files)}")

    indexes: list[int] = []
    for path in files:
        match = ORDERED_NAME.match(path.name)
        if not match:
            errors.append(f"invalid sequential filename: {path.name}")
            continue
        indexes.append(int(match.group(1)))
        try:
            with Image.open(path) as image:
                if image.format != "PNG":
                    errors.append(f"{path.name}: expected PNG, got {image.format}")
                if image.size != (1290, 2796):
                    errors.append(f"{path.name}: expected 1290x2796, got {image.width}x{image.height}")
                if image.mode not in ("RGB", "RGBA"):
                    errors.append(f"{path.name}: expected RGB/RGBA, got {image.mode}")
        except OSError as error:
            errors.append(f"{path.name}: unreadable image: {error}")

    if indexes and indexes != list(range(len(indexes))):
        errors.append(f"filenames are not contiguous from 00: {indexes}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate App Store screenshot exports")
    parser.add_argument("directory", type=Path)
    parser.add_argument("--count", type=int)
    args = parser.parse_args()
    if not args.directory.is_dir():
        parser.error(f"not a directory: {args.directory}")
    errors = validate(args.directory, args.count)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"validated {len(list(args.directory.glob('*.png')))} exports in {args.directory}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
