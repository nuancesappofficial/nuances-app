# assets/

This is the only asset folder in the repo. It has three parts.

## 1. App assets (in use, top level)

These ship inside the app. Code and `app.json` point at these exact paths, so do not rename or move them.

| Folder | Used by |
| --- | --- |
| `app_icons/` | `app.json` (icon, splash, Android adaptive icon), splash screens, `icon_cutout2.png` in several screens |
| `fonts/` | `app.json` font plugin, `src/theme/stickerFonts.ts`, `src/theme/authFonts.ts` |
| `onboarding_q1_assets/`, `onboarding_q2_assets/`, `onboarding_q3_assets/` | onboarding hero illustrations (`*-cutout.png` only) |
| `phonics/` | `src/services/pronunciation/bundledPhonics.ts` |
| `tutorial/` | video tour and demo card. `app.json` bundles `assets/tutorial/**/*` into the app |

The untracked files in `app_icons/` (`app_icon_squircle.png`, `camera_cutout_clean.png`, `native_snackbar_*.png`) are new work in progress and were left in place.

## 2. `store/`: App Store and Google Play listing material (current)

Not shipped in the app (`.easignore` excludes it).

| Folder | What |
| --- | --- |
| `store/metadata/` | listing text per language. Read by `scripts/check-app-store-readiness.js` |
| `store/app-store/screenshots/final-v2/<lang>/` | **current** screenshots (`01–09_ios.png` / `01–09_play.png`) |
| `store/app-store/screenshots/` (other folders) | older sets and raw captures, used by `scripts/generate-*` and `tools/compose_app_store_series.swift` |
| `store/app-store/header/`, `store/app-store/header-video/` | App Store header image and video per language |
| `store/google-play/feature-graphic/`, `store/google-play/screenshots/` | Google Play feature graphic and screenshots |
| `store/screenshot-generator/` | scripts that build the screenshots (see its README) |
| `store/references/` | competitor screenshots used as reference |
| `store/Google_Play_Store_badge_TW.svg`, `store/google-play-icon-512.png` | badge and 512px icon |

## 3. `archive/`: old or unused (nothing points here)

Kept for history. Safe to ignore. Not shipped (`.easignore` excludes it).

| Folder | What |
| --- | --- |
| `archive/app/` | app images no code uses: old icons, full-size onboarding originals before cutout, old demo card and share video, `unused/` |
| `archive/store/2026-10-17-old-ui/` | store screenshots of the old UI |
| `archive/store/old-play-09-screens/` | replaced Google Play screenshot 09 |

## Rules

- New image for the app: put it in the matching top-level folder and `require()` it.
- New store material: under `store/`.
- No longer used: move it to `archive/` (with `git mv`), do not delete.
