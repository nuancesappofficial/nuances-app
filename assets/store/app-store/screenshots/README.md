# App Store screenshot source files

Each language uses the same folder and filename structure under `raw`.

```text
<language>/iphone-6.9/
  01-capture/
    01-capture.png
  02-text-image-import/
    01-text-image-import.png
  03-real-context/
    01-card-front.png
    02-card-back.png
  04-quick-quiz-question/
    01-quick-quiz.png
  05-pronunciation-score/
    01-mock-pronunciation-result.png
```

- `03-real-context` intentionally contains both the front and back of the same
  localized `nuances` demo card.
- `04-quick-quiz-question` must show one of the two non-pronunciation tutorial
  questions.
- `05-pronunciation-score` uses the tutorial's deterministic local mock score.
  It does not call Azure or consume a pronunciation quota.
