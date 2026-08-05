#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys
import tempfile

from PIL import Image


HERE = Path(__file__).resolve().parent


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, check=False)


def test_validate_exports() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        Image.new("RGB", (1290, 2796), "red").save(root / "00-first.png")
        Image.new("RGB", (1290, 2796), "blue").save(root / "01-second.png")
        result = run(sys.executable, str(HERE / "validate_exports.py"), str(root), "--count", "2")
        assert result.returncode == 0, result.stderr

        Image.new("RGB", (1200, 2796), "black").save(root / "01-second.png")
        result = run(sys.executable, str(HERE / "validate_exports.py"), str(root), "--count", "2")
        assert result.returncode != 0
        assert "1290x2796" in result.stderr


def test_make_contact_sheet_has_no_gaps_and_keeps_order() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        Image.new("RGB", (1290, 2796), "red").save(root / "00-first.png")
        Image.new("RGB", (1290, 2796), "blue").save(root / "01-second.png")
        output = root / "contact.png"
        result = run(
            sys.executable, str(HERE / "make_contact_sheet.py"), str(root), str(output),
            "--panel-width", "129",
        )
        assert result.returncode == 0, result.stderr
        with Image.open(output) as sheet:
            assert sheet.size == (258, 280)
            assert sheet.getpixel((64, 140))[0] > 240
            assert sheet.getpixel((193, 140))[2] > 240


if __name__ == "__main__":
    test_validate_exports()
    test_make_contact_sheet_has_no_gaps_and_keeps_order()
    print("skill script contracts passed")
