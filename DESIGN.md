# Nuances Design Specs

## button glowing effect

Use this effect when a button should feel powered-on, premium, or high-priority without changing its base brand color.

### Purpose
- Adds a Stark Tech / hardware-like glow to an existing button.
- The effect must not redefine the button's semantic or brand color.
- Use it for primary action buttons that should feel energized, such as upload, premium, generate, or confirm actions.

### Specs
- Keep the original `backgroundColor` token.
- Keep the original `borderColor` token unless the button is explicitly selected or active.
- Add cyan glow shadow:
  - `shadowColor: '#00E5FF'`
  - `shadowOpacity: 0.28`
  - `shadowRadius: 18`
  - `shadowOffset: { width: 0, height: 8 }`
  - `elevation: 6`

### Press Behavior
- Preserve the existing press scale or opacity behavior of the component.
- Do not add layout-shifting transforms.
- Recommended pressed scale: `0.95` to `0.985`, depending on button size.

### Do
- Apply this effect on top of existing color tokens.
- Use it to communicate importance, energy, or active affordance.
- Keep text contrast unchanged and readable.

### Don't
- Do not change a button's base color just to apply this effect.
- Do not use multiple glow colors on the same screen unless they represent different semantic states.
- Do not apply to low-priority links, restore buttons, close buttons, or passive settings rows.

### React Native Example
```ts
button: {
  backgroundColor: EXISTING_BUTTON_COLOR,
  borderColor: EXISTING_BUTTON_BORDER_COLOR,
  shadowColor: '#00E5FF',
  shadowOpacity: 0.28,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
}
```

## pressable animation

Use this interaction pattern for tappable cards, buttons, chips, and icon controls so every press feels physical, responsive, and consistent.

### Purpose
- Gives touch targets a tactile pressed state without making the layout jump.
- Makes the UI feel native, immediate, and hardware-like.
- Should be subtle enough that it supports the action instead of becoming the action.

### Specs
- Use `Pressable` style callback when possible:
  - `style={({ pressed }) => [baseStyle, pressed ? pressedStyle : null]}`
- Recommended pressed transform:
  - Large primary buttons: `transform: [{ scale: 0.985 }]`
  - Medium buttons / cards: `transform: [{ scale: 0.96 }]`
  - Small icon buttons: `transform: [{ scale: 0.94 }]`
- Recommended opacity:
  - Primary CTAs: `opacity: 0.94`
  - Secondary buttons: `opacity: 0.88`
  - Disabled state should be separate from pressed state.
- Press feedback should happen instantly on touch down.
- Keep the pressed state local to the touched element only.

### Haptics
- Use haptics for meaningful actions, not every tiny tap.
- Recommended mapping:
  - Navigation / open modal: light impact
  - Confirm / generate / upload: light or medium impact
  - Wrong answer / API completed / warning: heavier buzz-style feedback
- Do not delay haptics until async work finishes unless the haptic represents completion.

### Do
- Keep transforms small and fast.
- Preserve existing colors unless the component has an explicit active/selected state.
- Combine with `button glowing effect` only for high-priority actions.
- Use pressed scale instead of moving `top`, `left`, `margin`, or layout properties.

### Don't
- Do not animate layout-affecting properties for press feedback.
- Do not use huge scale changes that make the UI feel rubbery.
- Do not apply glow to every pressable item.
- Do not make Close, Restore, passive settings rows, or low-priority text links visually compete with primary CTAs.

### React Native Example
```tsx
<Pressable
  style={({ pressed }) => [
    styles.button,
    pressed ? styles.buttonPressed : null,
  ]}
>
  <Text>Action</Text>
</Pressable>
```

```ts
buttonPressed: {
  opacity: 0.94,
  transform: [{ scale: 0.985 }],
}
```

## ghost card animation

Use this pattern when an async action should feel like a premium instrument actively processing data, not like a generic loading spinner. The loading UI must mimic the final UI structure so the transition from loading to result has no layout shock.

### Core Principle
- The loading state is a ghost version of the final component.
- Keep the same container size, margins, background, border radius, and action-zone position as the finished UI.
- Do not replace the final UI with a generic spinner-only screen.
- Do not move the user's viewport after the async result returns unless the user explicitly triggered a new generation that requires tracking.

### State Machine
- `idle`: final UI shell is empty or ready.
- `processing`: show ghost shell, subtle pulse, and cycling status copy.
- `revealing`: API result is available; reveal final content top-down.
- `success`: final content is stable and fully interactive.
- `failed`: keep the same shell position and show a concise fail state with retry affordance.

### Motion
- Use one primary motion at a time: pulse, typing/reveal, or waveform. Do not animate every element.
- Status text may cycle every `1400-1800ms`.
- Reveal content top-down with short staggered stages, typically `140-260ms` between major sections.
- Text reveal should feel deliberate but not slow. Prefer `45-65ms` ticks for typewriter-style body text.
- Use `FadeIn/FadeOut` or opacity transitions for ghost status text.
- Avoid animating layout properties such as `top`, `left`, `margin`, or dynamic container height.

### Color Tones
- Hardware blue: `#4EAFF4` for active processing, active borders, and primary analysis glow.
- Cyan glow: `#00E5FF` for powered-on shadows only, using `button glowing effect` rules.
- Fail coral: `#FF6B6B` for failed states, warning icons, and retry emphasis.
- Dark ghost surface: `rgba(30,41,59,0.62)` with `#334155` border.
- Light ghost surface: `#F8FAFC` or `rgba(15,23,42,0.04)` with subtle slate borders.
- Placeholder/status text should be smaller, dimmer, and visually separate from real generated content.

### Create Word Example
- `processing`: show the front card shell first with dim cycling text such as `Analyzing linguistic context...` where real content will later appear.
- `revealing`: fill the front card top-down: word -> part of speech -> definition -> sentence/translation -> context.
- `revealing`: then reveal the back card sections: collocation -> example -> personal notes.
- `success`: keep the completed card in place and put the `Save` button below it.
- `failed`: do not create a fake empty card. Show a fail panel in the same flow with the failed word, error message, and a coral glowing `Retry` button.

### Pronunciation Coach Example
- `processing`: after recording stops, keep the pronunciation coach modal fixed. The result panel becomes a ghost score card with blank score, blank phoneme blocks, and cycling status text such as `Mapping phonemes...`.
- `revealing`: once Azure returns, reveal score first, then phoneme blocks, then feedback summary.
- `success`: controls remain at the same vertical position; retry and speaker controls become active without moving.
- `failed`: replace the result panel with a fail ghost state that explains the error and tells the user to tap the mic to retry.

### Accessibility
- Avoid excessive motion and keep the animation count low.
- Loading text must provide real feedback, not decorative copy only.
- Failed states must be visible in the component itself, not only in native alerts.
- Preserve contrast in both light and dark mode.
