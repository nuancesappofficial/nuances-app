# App Store screenshot workflow

## Contents

1. Discovery and planning
2. First-language reference
3. Four-layer renderer
4. Highlight construction
5. Localization
6. Testing and review
7. Folder contract

## 1. Discovery and planning

Inspect files before asking questions that the filesystem can answer. Use image dimensions, OCR, thumbnails, and visual inspection to build a raw inventory. Confirm:

- app name, icon, brand colors, target device and supported locales;
- intended or inferred screenshot order;
- feature benefit demonstrated by each raw state;
- which screenshot is the canonical source for each panel;
- which visible content is locale-specific versus language-invariant;
- visual references and prohibited treatments.

Propose a table with panel number, raw source, user benefit, headline, subtitle, semantic highlight target, invariant content, and composition note. Use concrete benefits. Keep one feature and one highlight per panel.

Design the panorama as one wide artwork with `panel_count × 1290` width and `2796` height. Approve it before adding phones. Crop panels from the master; never generate panel edges independently or repair seams after composition.

## 2. First-language reference

Create in vertical slices:

1. Render the connected background and a no-gap panorama proof.
2. Add the phone shell and authentic raw screen to panel 00 only.
3. Add one highlight derived from source UI pixels.
4. Add typed headline and subtitle.
5. Obtain approval; lock typography, phone geometry, lighting, screen rectangle, highlight depth, and layer order.
6. Complete the remaining first-language panels and inspect the full contact sheet.

The approved series becomes the **visual reference**. It defines form and effects, not content that should be localized.

## 3. Four-layer renderer

Compose in this order:

### Layer 1 — panorama base and phone shell

Use the approved panorama crop and complete upright phone shell. Keep the phone front-facing and proportional. The shell may already be part of the locked base if that improves consistency.

### Layer 2 — authentic raw UI

Paste the locale's raw screenshot into the measured screen rectangle. Clip it to the display shape. Scale uniformly; never stretch width and height independently. Report incompatible ratios.

### Layer 3 — enlarged UI highlight

Find the semantic source component in the locale raw screenshot and derive the enlarged content from those pixels. Place it above both the screen and background. Keep every edge, shadow, outline, and glow inside the canvas.

### Layer 4 — typed caption

Draw headline and subtitle with installed fonts. Measure glyph bounds, fit to approved maximum width and pixel height, and position by reference text blocks. Match visual scale rather than blindly copying a point size across scripts.

Save a pre-caption QA image when useful so typography and composition can be diagnosed separately.

## 4. Highlight construction

Use a visual locator seeded by the canonical reference component. Match by image features, color, geometry, and nearby structure. Refine the candidate with panel-specific visual evidence such as warm action colors, repeated dark tiles, or selected-state colors.

Do not use one locale's absolute target XY for another locale. Mapping a visually found locale target into a known phone screen rectangle is allowed.

Choose one construction mode:

- **Direct localized crop** — Use when all highlight content belongs to localized UI. Crop, uniformly enlarge, apply a rounded mask, restrained soft shadow, and subtle outline.
- **Reference-form overlay** — Use when content is invariant or the reference contains an essential effect. Preserve the complete approved reference overlay and locate it dynamically over the locale's semantic source target.
- **Reference shell + localized content** — Use for localized quiz answers, notifications, or labels whose visual container must match the reference. Remove only old glyph pixels with a seamless background reconstruction, then type localized text. Verify no rectangular patch or muddy interpolation remains.

Never use image generation for these modes. It causes fuzzy glyphs, translated invariant content, hallucinated controls, distorted edges, and misaligned enlargements.

## 5. Localization

Create an explicit content policy before rendering:

| Content | Default policy |
|---|---|
| Headline and subtitle | Localize and typeset |
| Navigation, buttons, system UI | Use locale raw screenshot |
| Quiz answer label | Localize inside approved shell |
| Notification message | Localize; preserve icon, app title, time, and glass |
| OCR tokens and English word blocks | Preserve source English |
| Example images and embedded English | Preserve source pixels |
| IPA symbols and pronunciation scores | Preserve symbols, numbers, and approved green/orange state colors |

Localize one language at a time. First render one representative panel to catch font, wrapping, and source-position changes. Then render the full locale and inspect its contact sheet before proceeding.

## 6. Testing and review

Use red → green vertical slices for defects. Define expected output from an independent source: approved reference pixels, literal dimensions, approved caption bounding boxes, or documented color thresholds.

Test at the rendered-PNG seam:

- exact dimensions, mode, PNG format, count, and sequential filenames;
- phone aspect and full-body visibility;
- caption pixel height, bounding box, safe margins, and line wrapping;
- raw-pixel fidelity and aspect ratio inside highlight centers;
- complete highlight bounds and rounded-corner alpha;
- presence of required green/orange state colors;
- absence of repair rectangles, opaque duplicate pills, or damaged fixed labels;
- visual-target movement when synthetic or real locale layouts move;
- background seam continuity.

After automated checks, inspect full-resolution panels and a no-gap contact sheet. Automation cannot approve aesthetics alone.

## 7. Folder contract

```text
store-assets/app-store/screenshots/
  raw/[locale]/iphone-6.9/[panel-feature]/...
  working/
    panorama/
    bases/
    layers/[locale]/iphone-6.9/
    qa/[locale]/iphone-6.9/
  final/[locale]/
    00-feature-name.png
    01-feature-name.png
```

Never overwrite raw inputs. Preserve user-created or unrelated files in dirty worktrees.
