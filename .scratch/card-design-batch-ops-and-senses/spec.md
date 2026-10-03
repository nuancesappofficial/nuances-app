# Spec: Card Visual Hierarchy, Long-Press Batch Operations, and Supplementary Senses

## Problem Statement

When studying and managing cards, learners encounter three distinct friction points:
1. **Visual Hierarchy Clutter**: On the card front, the section title "語境" (Context) blends in with the nuance slider axis labels ("隨意", "正式", "微妙", "強烈"), making it hard to parse section structure at a glance.
2. **Card Management Burden**: Learners need to organize cards into folders (albums) or delete unwanted cards in bulk. Currently, each card displays a repetitive three-dot menu that only handles single-card deletion/editing, adding visual noise to every row without offering bulk multi-select capabilities.
3. **Polysemy Visibility**: English words frequently have multiple meanings or parts of speech (e.g., `frame` as a noun vs. `frame` as a verb). Users studying a word in one context wonder about its other common senses without having their flashcard overloaded.

## Solution

1. **Unified Section Badge**: Convert the front "Context" title and all back-face section headers into clean, subtle tinted capsule badges. Dim the nuance slider boundary text so the section title and axis labels are clearly differentiated.
2. **Long-Press Batch Selection Mode**: Completely remove the three-dot button from card rows. Long-pressing any card triggers haptic feedback, enters Batch Selection Mode, marks the card as selected, reveals circular checkboxes on all cards, and presents a bottom action bar with "Move to Folder" and "Delete".
3. **Supplementary Senses on Card Back**: Retain single-context purity on the card front. Prompt the AI card generator to provide up to 2 concise supplementary senses (part of speech and traditional Chinese definition) rendered in a dedicated section badge block at the bottom of the card back.

## User Stories

1. As a learner viewing a card, I want the "語境" header to be visually distinct from the nuance slider labels, so that I can immediately orient myself to the card sections without confusion.
2. As a learner flipping to the back of a card, I want all section headers (搭配詞, 同義詞, 反義詞, 文化背景) to share the same capsule badge design, so that the card's visual language is cohesive.
3. As a learner browsing my deck, I want clean card rows without redundant three-dot icons, so that my deck view feels focused and uncluttered.
4. As a learner organizing my deck, I want to long-press any card with haptic feedback to start selecting multiple cards, so that I can organize cards quickly using natural gestures.
5. As a learner in batch selection mode, I want to tap any card to toggle its checkbox, so that selecting multiple items requires minimal effort.
6. As a learner with multiple cards selected, I want to tap "Move to Folder", select a destination album, and see all selected cards moved together, so that I don't have to repeat the action card by card.
7. As a learner with multiple cards selected, I want to tap "Delete" and receive a confirmation dialog with the exact selection count, so that I can safely bulk delete cards without accidental data loss.
8. As a learner in batch selection mode, I want a clear "Cancel" or "Done" button at the top, so that I can exit selection mode at any time and return to normal browsing.
9. As a learner memorizing a word with multiple meanings, I want to see its other common definitions and parts of speech on the back face of the card, so that I know its other senses without cluttering my primary flashcard context.
10. As a learner reviewing supplementary senses, I want them to remain brief and unbloated (limited to 1–2 senses with part of speech and concise definition), so that my review pace remains quick and effective.

## Implementation Decisions

### Section Badge & Slider Refinements
- The section title component across card faces will be wrapped in a dedicated badge style token (`SectionBadgeUI`) utilizing subtle tinted background padding and small bold tracking.
- The nuance metric slider axis labels will have reduced visual prominence (`text-slate-400` / muted typography), ensuring the section badge takes visual precedence.

### Batch Selection State & Interactions
- Card row UI will remove the trailing three-dot icon button completely.
- A new interactive state machine for card selection (`selectedCardIds: Set<string>`, `isBatchSelectionActive: boolean`) will be introduced in the deck card view screen.
- Long-press on a card row executes haptic feedback (`Haptics.selectionAsync()` / `impactAsync()`), adds the card to `selectedCardIds`, and activates `isBatchSelectionActive`.
- In batch selection mode, cards display animated circular checkboxes in place of trailing icons. Regular tapping toggles selection.
- A floating bottom dock (`BatchActionDockUI`) mounts at the bottom safe area with action buttons:
  - Counter indicator: `已選取 N 張`
  - Move to Album: opens album picker bottom sheet.
  - Delete: opens confirmation alert and triggers batch database deletion.
  - Header displays a "Done / 取消" button to exit batch mode.

### Supplementary Senses Data Model & AI Prompt
- Extend the AI card generation schema to include `supplementary_senses`:
```ts
type SupplementarySense = {
  pos: string; // e.g. "n.", "v.", "adj."
  definition: string; // e.g. "陷害；誣陷", "框架"
};
```
- Restrict AI prompt generation to return at most 2 significant senses distinct from the card's current context.
- Update card back layout component to render an optional section titled "其他釋義" using `SectionBadgeUI`.

## Testing Decisions

- **Domain & Layout Logic**: Test that dynamic card back layout calculations reserve proper budget height for the supplementary senses block without overflowing or clipping other sections.
- **Batch Selection Reducer/State**: Unit test batch selection actions (toggle selection, select all, deselect all, clear on exit, bulk move ids filter, bulk delete ids filter).
- **AI Payload Parsing**: Verify that `parseCoreStream` and card payload validation correctly parse valid `supplementary_senses` arrays, clamp items to max 2, and handle cards without supplementary senses gracefully.

## Out of Scope

- Editing card contents within the batch selection flow.
- Interactive switching of primary flashcard front context between different senses during active SRS review.
- Custom reordering of cards inside folders.

## Further Notes

- All changes adhere to [CONTEXT.md](file:///Users/users/vibe_coding_projects/nuances-app/CONTEXT.md) and [0001-card-design-batch-ops-and-senses.md](file:///Users/users/vibe_coding_projects/nuances-app/docs/adr/0001-card-design-batch-ops-and-senses.md).
