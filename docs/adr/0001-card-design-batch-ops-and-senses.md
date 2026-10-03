# Card Design Hierarchy, Batch Selection, and Supplementary Senses

In the card UI and deck management, we resolved three key architectural and interaction design trade-offs:
1. Section Badge Hierarchy: We unified card section titles (front Context and back Collocations, Synonyms, Antonyms, Cultural Background, Supplementary Senses) using a subtle tinted capsule badge (`bg-slate-200/60` / `bg-slate-800`), separating section labels from internal nuance slider axis text.
2. Removal of Three-Dots Menu in Favor of Long-Press Batch Selection: The individual three-dot menu on each card row is completely eliminated to clean visual noise. Single-gesture long-press with haptic feedback now triggers Batch Selection Mode, causing selectable checkboxes to emerge and a bottom floating dock to handle batch folder moves and batch deletes.
3. Contextual Card Subject with Supplementary Senses on Back Face: Each flashcard strictly represents a single contextual word meaning as its primary subject. Secondary meanings and alternative parts of speech are generated as concise supplementary senses (`{ pos, definition }`, max 2) placed in a dedicated section at the bottom of the card's back face.
