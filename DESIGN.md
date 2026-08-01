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
- Default pressed scale: `0.99` with `opacity: 0.96`, matching the album settings change-cover tile.
- Use deeper press only for deliberately emphasized CTAs, and keep it no stronger than `scale: 0.985`.

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

Nuances has two pressable treatments. Choose by interaction character rather
than applying one pressed transform everywhere.

### Type A: Soft Pressable (existing)

- Use for primary CTAs, cards, tiles, chips, image upload controls, and actions
  that should feel gently cushioned.
- Preserve the existing small scale response: `0.99` by default and `0.985` for
  emphasized CTAs.
- Pair with `opacity: 0.96` by default or `0.94` for emphasized CTAs.
- The album settings change-cover tile remains the baseline implementation.

### Type B: Rigid Pressable

- Use for precise utility controls where the target must feel fixed in place,
  such as the Card Detail album picker.
- Do not scale or translate the control.
- On touch-down, use an immediate local surface/border change plus
  `opacity: 0.78-0.9`; the control's geometry must not move.
- A subtle brand-color tint may identify the pressed surface, but it must not
  become a persistent selected state.
- Use light haptics only when opening a meaningful destination or modal.

Use this interaction pattern for tappable cards, buttons, chips, and icon controls so every press feels physical, responsive, and consistent.

### Purpose

- Gives touch targets a tactile pressed state without making the layout jump.
- Makes the UI feel native, immediate, and hardware-like.
- Should be subtle enough that it supports the action instead of becoming the action.

### Specs

- Use `Pressable` style callback when possible:
  - `style={({ pressed }) => [baseStyle, pressed ? pressedStyle : null]}`
- Recommended pressed transform:
  - Default buttons, cards, tiles, image upload buttons, and card rows: `transform: [{ scale: 0.99 }]`
  - Emphasized primary CTAs only: `transform: [{ scale: 0.985 }]`
  - Icon-only controls: prefer `transform: [{ scale: 0.99 }]`; use `0.985` only when the icon needs a stronger physical response.
- Recommended opacity:
  - Default pressed state: `opacity: 0.96`
  - Emphasized primary CTAs: `opacity: 0.94`
  - Disabled state should be separate from pressed state.
- Press feedback should happen instantly on touch down.
- Keep the pressed state local to the touched element only.
- The album settings change-cover tile is the baseline for subtle press motion: `opacity: 0.96` and `scale: 0.99`.

### Haptics

- Use haptics for meaningful actions, not every tiny tap.
- Recommended mapping:
  - Navigation / open modal: light impact
  - Confirm / generate / upload: light or medium impact
  - Wrong answer / API completed / warning: heavier buzz-style feedback
- Do not delay haptics until async work finishes unless the haptic represents completion.

### Do

- Keep transforms small and fast.
- Keep press displacement visually minimal; the interaction should feel like a slight hardware click, not a rubbery shrink.
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
  opacity: 0.96,
  transform: [{ scale: 0.99 }],
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

## mask and copy highlight

Use this effect when the app needs to freeze the real interface, dim the surrounding UI, and show a faithful copy of one focused element above the mask. There are two official variants: guided tour highlights and long-press preview highlights.

### Purpose

- Focus the user's attention on one existing UI element without changing the underlying screen layout.
- Preserve spatial context by showing the highlighted element exactly where it lives.
- Prevent accidental actions while the tutorial or highlight layer is active.
- Reuse the same mental model as the album-grid long-press mask/copy interaction.

### Two Types

- Type A: Guided Tour Highlight
  - Use for onboarding-complete global tour and first-run feature education.
  - Only the highlighted target is pressable. Tapping the surrounding mask never advances.
  - Keep one global overlay mounted and move its transparent cutout between measured targets.
  - The cutout exposes the real component at scale `1`; do not render a cloned replacement.
  - Show a low-emphasis `Skip tutorial` action in the safe-area top-right corner.
  - Use short coach-card copy and show compact progress for the 13-step tour.

- Type B: Long-Press Preview Highlight
  - Use for album grid long-press, card long-press, and contextual preview menus.
  - Default clone scale is still `1`; any preview pop or enlargement must be explicitly designed for that interaction, not inherited from the global tour default.
  - May show contextual controls such as settings, delete, album actions, or drag targets.
  - May dismiss by release, outside tap, completed action, or native confirmation flow depending on the interaction.
  - Keep the copied element visually faithful, but contextual controls may have their own active/hover states.

### Structure

- Measure the target child with `measureInWindow` after layout is stable.
- Register the measured target with the shared `TourSpotlightProvider`.
- Render one full-screen overlay above the app and create a transparent cutout around the real target.
- Add a soft blur and translucent navy mask only outside the cutout.
- Route presses from an overlay press target at the same measured bounds to the guided action.
- Move the cutout with a spring when the target changes; never unmount and remount one modal per step.
- Show a short coach card near the cutout for Type A; show contextual controls near the copied preview for Type B.

### Visual Specs

- Mask color: translucent app navy around `rgba(1,13,25,0.52)` to `rgba(1,13,25,0.60)`.
- Blur is required whenever the platform supports it, but it must preserve enough page context for the transition to remain understandable.
- Recommended full-screen tour blur: `BlurView tint="dark" intensity={35-50}`.
- Recommended local modal tour blur: `BlurView tint="dark" intensity={60-75}`.
- Type A cutout scale: `1`. Add `6-8px` breathing room and a subtle hardware-blue focus ring.
- Type B clone scale: default `1`; enlargement is allowed only if that specific long-press preview interaction calls for a preview pop.
- The real Type A target must remain the visual source of truth.
- Coach-card surface: app navy / container tone, usually `rgba(2,33,61,0.96)`, with a light-mode white equivalent.
- Coach-card border: subtle metal blue, e.g. `rgba(137,206,255,0.34)`.
- Use one hardware-blue accent edge; do not combine a large sticky note and a bouncing arrow.

### Motion

- Mask fade-in: `160-200ms`.
- Target movement: one shared spring, approximately `220` stiffness / `27` damping.
- Type B clone entry: may use a subtle spring or preview pop only when the interaction needs a physical long-press response.
- Coach-card fade/translate-in: `180-220ms`, after a short `60-90ms` delay.
- Avoid layout animation on the real child. The real screen should remain still behind the overlay.
- Do not run decorative infinite arrow or bounce animations.
- Respect the system Reduced Motion setting. The target may move instantly while opacity and focus remain clear.

### Haptics

- Tour start: no haptic or very light impact only, so onboarding completion does not feel abrupt.
- Tour step advance: use `selectionAsync()` or light impact; never use buzz/heavy feedback for normal tour progression.
- Tour complete: use a light success-style feedback if available.
- Long-press activation: use `impactAsync(Medium)` when the preview/highlight locks in.
- Drag hover or action target changes: use `selectionAsync()` and throttle it so it cannot trigger every frame.
- Delete confirm or destructive action: use warning/heavy buzz only at the actual confirmation moment.
- Do not attach repeated haptics to passive movement, background icon tilt, idle animation, or any loop that can fire continuously.

### Interaction Rules

- While active, the overlay owns all touches.
- Do not allow the underlying real button/card to receive touches through the overlay.
- For Type A tours, only the aligned overlay press target may trigger the guided action.
- Tapping the surrounding mask does nothing.
- Keep `Skip tutorial` available without making it compete with the highlighted target.
- For Type B previews, dismiss or trigger actions only from the overlay's designed controls or release gesture.

### Zero-Latency Tour Start

- If the highlight starts immediately after onboarding, set the tour state synchronously before navigating to the dashboard.
- Do not wait for a Supabase/profile fetch to start the first tour frame.
- The first dashboard frame should already render the mask if the user just completed onboarding.

### Global Tour Tempo

- The global app tour uses one continuous overlay rather than a separate modal per target.
- Every same-screen transition follows this rhythm:
  - User taps the highlighted target.
  - Coach copy fades out.
  - The cutout springs to the next measured target.
  - New coach copy fades in.
- For tab/page moves, lower the mask to a lighter bridge opacity while the destination mounts.
- Do not use a fixed uncovered delay. Wait for the destination target to register a valid layout.
- The intended feel is:
  - `press -> UI moves -> cutout follows -> next instruction`
- Do not show a black mask while the target component has not been measured.
- Modal targets register with the same provider; never create a second independent tour state machine.
- Do not place tour instructions as static helper text inside a modal when the rest of the tour uses coach cards.

### Nuances Global Tour Flow

- The first-run tour is task-based, not a static feature list.
- The tour teaches the user to make one real card through the existing UI:
  - Step 1: move to Cache and highlight the real `Upload` button.
  - Step 2: open the real Upload modal and guide the user to paste the sample sentence.
  - Step 3: guide the real `Add` button in the Upload modal.
  - Step 4: guide the cache-card swipe into Create Card.
  - Step 5: let the user choose any real target token.
  - Step 6: guide the real Generate button.
  - Step 7: wait until the user reaches the bottom, then guide the real Save button.
  - Step 8: return to Deck, open the newly created card by its persisted card id, and teach card flip.
  - Step 9: open Pronunciation Coach; when it closes, return to Deck.
  - Step 10: launch the real Quick Quiz and continue when the user returns.
  - Step 11: guide the real Create Album button.
  - Step 12: confirm the album.
  - Step 13: save Album Settings and complete the tour.
- Do not create temporary tutorial-only pages for OCR, target selection, card generation, or quiz.
- Do not preload the sample sentence into the visible text field. The user should be guided to paste it into the real field.
- The Create Word target selection step must accept any target chip the user chooses.
- Upload modal `Paste` and `Add` steps must use the shared target/cutout treatment, not static inline instructions.

### Do

- Keep the real Type A target visible through the cutout as the visual source of truth.
- Keep Type A coach copy short and instructional.
- Keep Type B contextual controls close to the copied element.
- Use this for dashboard tours, album long-press previews, card previews, and focused feature explanations.

### Don't

- Do not create a separate hand-drawn version of the highlighted UI.
- Do not let the clone receive touches.
- Do not allow mask taps to leak into underlying app buttons.
- Do not show skip/close controls in mandatory first-run tours.
- Do not let the screen flash unmasked before the tour starts.
- Do not use heavy haptics for normal tour steps.

### Type A React Native Example

```tsx
<TutorialSpotlight
  active={tourStep === 'STEP_1_GRID'}
  tooltip="Your personalized AI flashcards live here. Review them daily to master nuances."
  onSpotlightPress={nextStep}
>
  <View ref={targetRef} collapsable={false}>
    <AlbumGrid />
  </View>
</TutorialSpotlight>
```

```tsx
<Modal visible={active} transparent animationType="none" statusBarTranslucent>
  <Pressable style={StyleSheet.absoluteFill} onPress={onAdvance}>
    <BlurView
      tint="dark"
      intensity={100}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    />
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.84)' }]}
    />
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: layout.pageY,
        left: layout.pageX,
        width: layout.width,
        height: layout.height,
        transform: [{ scale: 1 }],
      }}
    >
      {React.cloneElement(child, { pointerEvents: 'none' })}
    </Animated.View>
  </Pressable>
</Modal>
```

### Type B Pseudo Example

```tsx
<LongPressHighlight
  active={isAlbumMenuOpen}
  targetLayout={albumLayout}
  hapticOnOpen="mediumImpact"
  hapticOnActionChange="selectionThrottled"
  onDismiss={closeAlbumMenu}
>
  <AlbumIconCopy pointerEvents="none" />
  <ContextActions actions={['settings', 'delete']} />
</LongPressHighlight>
```
