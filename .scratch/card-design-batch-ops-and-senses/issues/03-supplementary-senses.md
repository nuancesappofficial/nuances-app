# 03 — Supplementary Senses on Card Back & AI Schema

**What to build:**
Extend the AI card generation prompt and payload schema to include supplementary senses (max 2 other meanings/parts of speech outside the card context). Render these supplementary senses in a dedicated section at the bottom of the card back under a Section Badge. Deploy updated Supabase edge function if affected.

**Blocked by:** 01 — Section Badge & Metric Sliders Hierarchy

**Status:** closed

- [x] Extend AI generation payload schema and prompt to include `supplementary_senses: { pos: string, definition: string }[]` (max 2)
- [x] Add parsing and validation for `supplementary_senses` in payload parser with unit tests
- [x] Render "其他釋義" section on card back below cultural background using the unified Section Badge
- [x] Ensure dynamic layout calculations handle optional supplementary senses without clipping
- [x] If Edge Function is updated, deploy via `npx supabase functions deploy` and verify output
