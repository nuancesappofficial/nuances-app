# 01 — Section Badge & Metric Sliders Hierarchy

**What to build:**
Unify section titles across both card front (Context) and card back (Collocations, Synonyms, Antonyms, Cultural Background) using a subtle tinted capsule badge (SectionBadgeUI). Reduce the font weight and color intensity of nuance metric slider boundary labels so the section title stands out clearly without visual conflict.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] Wrap "語境" (Context) header on card front in a subtle tinted capsule badge style token
- [x] Update all back face section headers (搭配詞, 同義詞, 反義詞, 文化背景) to use the same Section Badge visual token
- [x] Adjust nuance metric slider axis labels (隨意, 正式, 微妙, 強烈) to text-slate-400 and smaller typography so they don't compete with the section header
- [x] Run dynamic layout tests to confirm no text clipping or line-snapping regressions
