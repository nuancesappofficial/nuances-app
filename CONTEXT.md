# Learning Cards

This context describes the learning content presented on a card and the language
used when that content must share limited card space.

## Language

**Card Section**:
A named portion of a learning card that owns a fixed share of the card's visible
space while collapsed.
_Avoid_: Block, panel

**Collapsed Allocation**:
The maximum visible share reserved for a Card Section before its excess content
is folded.
_Avoid_: Minimum height, default height

**Expanded Section**:
A Card Section whose full content is available through animated expansion and
vertical scrolling.
_Avoid_: Full mode, open block

**Learning Term**:
The smallest reusable English word or established English expression that
preserves the meaning the learner encountered in context.
An incomplete grammatical fragment, such as a verb followed only by a
determiner, is not a Learning Term.
_Avoid_: Target token, card title

**Selected Span**:
The exact source-language text selected by the learner for card creation. It is
evidence for resolving the Learning Term, not necessarily the final Learning
Term itself.
_Avoid_: Learning Term, canonical subject

**Lemma**:
The reusable single-word dictionary form appropriate to the Selected Span's
part of speech in context. Phrase resolution is considered only when the Lemma
does not preserve the encountered meaning.
_Avoid_: Stem, mechanically stripped word

**Collocation**:
A reusable multi-word usage pattern built around a Learning Term whose meaning
does not require replacing that Learning Term with the whole pattern.
_Avoid_: Phrase, example

**Complete Learning Card**:
A learning card whose generated learning content includes at least one valid
Collocation paired with a complete example sentence. A card with both fields
empty is incomplete and must not be persisted as successfully generated.
_Avoid_: Partial card, empty enrichment

**Reference Pronunciation**:
A curated natural-voice recording tied to a specific Learning Card. Every
pronunciation entry point for that card uses the same recording, including card
details and quizzes.
_Avoid_: Device voice, generated fallback

# First-Run Journey

**Onboarding**:
The required setup questions that establish a new learner's language and
learning preferences.

**Video Tour**:
The full-screen instructional video sequence shown immediately after
Onboarding.

**Tutorial**:
The interactive in-app spotlight walkthrough shown after the Video Tour. It
starts on the Cache screen.

The required first-run order is:
`Onboarding → Video Tour → Tutorial → App`.

**Greeting**:
The “Now it’s your turn” choice shown immediately after Tutorial completion,
offering Upload or the iOS Share Sheet.

**Starter Allowance**:
The lifetime allowance of 20 AI-generated cards available to a non-Premium
learner. The next cloud AI request opens the Paywall.

**Ghost Preview Page**:
The progressively assembled card for one Learning Term during a multi-card
creation run. When creation advances to the next Ghost Preview Page, the
incoming card is aligned to the viewport rather than left partially clipped.

**Optimistic Card Save**:
The local durable save that begins as soon as a generated card appears. Cloud
sync continues in the background and does not require a separate save action.

**Creation Done Action**:
The action shown after all requested cards have appeared. It returns the learner
to the app; it does not initiate card persistence.
