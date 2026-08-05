---
name: create-app-store-screenshots
description: Plan, build, visually validate, and localize premium Apple App Store screenshot series from authentic raw app screenshots. Use when Codex must create iPhone App Store preview images, design a connected panoramic screenshot story, composite phones and enlarged UI highlights, preserve fixed OCR/example content, localize captions and UI across languages, or repair fuzzy text, translated fixed content, distorted callouts, clipped highlights, inconsistent captions, and panorama seams.
---

# Create App Store Screenshots

Build screenshot systems as deterministic layered compositions. Use image generation only for approved artwork or phone-shell creation; never ask it to reproduce UI, captions, OCR, or precise highlights.

## Required reading

Read [references/workflow.md](references/workflow.md) completely before starting any series. Read [references/visual-contract.md](references/visual-contract.md) before composing, localizing, or reviewing pixels.

## Operating interface

Accept a project root plus available brand assets and raw screenshots. Produce:

- an approved story/copy/highlight/panorama plan;
- a first-language reference series;
- localized layered renders;
- `1290 × 2796` RGB PNG exports;
- a no-gap horizontal contact sheet;
- machine-readable validation results and visual QA evidence.

Keep complexity behind one renderer interface when code is warranted, for example:

```python
render_locale(locale, panels=all_panels)
publish_locale(locale)
```

Treat the rendered PNG as the testing seam. Test visible behavior, not private crop constants.

## Mandatory gates

1. **Inventory gate** — Inspect every raw screenshot; report order, dimensions, locale, duplicates, missing states, and likely feature. Do not create images yet.
2. **Plan gate** — Propose story sequence, benefit-led copy, one semantic highlight target per panel, and the continuous panorama. Wait for explicit approval.
3. **Reference gate** — Create only the panorama, then only the first panel, then the complete first-language series. Obtain approval at each requested checkpoint.
4. **Localization gate** — Lock background, phone geometry, lighting, caption system, and highlight form. Render one target language at a time from that language's raw UI.
5. **Delivery gate** — Validate exports, inspect the contact sheet, inspect highlight close-ups, and report failures rather than silently accepting them.

## Non-negotiable localization rules

- Locate the semantic source component visually in each locale. Never reuse another language's absolute target XY.
- Keep fixed learning content fixed: OCR blocks, English example images, English tokens, IPA symbols, and other explicitly invariant content must not be translated.
- Use localized raw screenshots for language-specific navigation, buttons, notifications, quiz answers, and system UI.
- Derive highlights from existing pixels. Do not imagine or regenerate a UI module.
- Type captions with a real font after raster composition. Never use generated text.
- Preserve the approved reference's highlight form, color treatment, depth, and complete bounds; replace only content that is genuinely locale-specific.

## Deterministic tools

Run with a Python environment containing Pillow:

```bash
python scripts/validate_exports.py path/to/final/locale --count 7
python scripts/make_contact_sheet.py path/to/final/locale path/to/contact-sheet.png
```

Run `scripts/test_skill_scripts.py` after modifying either helper.

## Stop conditions

Stop and explain the evidence when raw screenshots are missing, a source UI ratio cannot fit the phone without distortion, a required localized state is unavailable, or a highlight cannot be derived cleanly. Do not solve those gaps with invented UI.
