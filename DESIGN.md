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
  - The full-screen mask is pressable; tapping anywhere advances to the next step.
  - Clone scale is always `1`; the copy must stay the exact same size as the original element.
  - Clone must use `pointerEvents="none"` so underlying app actions never fire.
  - Do not show skip, close, or secondary controls in mandatory first-run tours.
  - Use short tooltip copy and keep the user moving forward.

- Type B: Long-Press Preview Highlight
  - Use for album grid long-press, card long-press, and contextual preview menus.
  - Default clone scale is still `1`; any preview pop or enlargement must be explicitly designed for that interaction, not inherited from the global tour default.
  - May show contextual controls such as settings, delete, album actions, or drag targets.
  - May dismiss by release, outside tap, completed action, or native confirmation flow depending on the interaction.
  - Keep the copied element visually faithful, but contextual controls may have their own active/hover states.

### Structure
- Measure the target child with `measureInWindow` after layout is stable.
- Render a full-screen modal or overlay above the app.
- Add a dark translucent mask across the entire screen.
- Render a cloned copy of the measured child above the mask.
- Position the clone using the measured `pageX`, `pageY`, `width`, and `height`.
- Show a short tooltip near the clone for Type A; show contextual controls near the clone for Type B.

### Visual Specs
- Mask color: `rgba(0,0,0,0.78)` to `rgba(0,0,0,0.86)`.
- Blur is required whenever the platform supports it. Use a dark blur layer underneath the dim mask so the mask appears soft and intentional instead of an abrupt flat black sheet.
- Recommended full-screen tour blur: `BlurView tint="dark" intensity={90-100}`.
- Recommended local modal tour blur: `BlurView tint="dark" intensity={60-75}`.
- Type A clone scale: `1`. Global tour copy must stay exact size.
- Type B clone scale: default `1`; enlargement is allowed only if that specific long-press preview interaction calls for a preview pop.
- Clone should not add new colors, borders, or fake styling unless the original element already has them.
- Tooltip surface: app navy / container tone, usually `rgba(2,33,61,0.94)`.
- Tooltip border: subtle metal blue, e.g. `rgba(137,206,255,0.38)`.
- Tooltip shadow: subtle cyan glow, not a primary CTA glow.

### Motion
- Mask fade-in: `140-180ms`.
- Type A clone fade-in: match the mask timing and keep scale fixed at `1`.
- Type B clone entry: may use a subtle spring or preview pop only when the interaction needs a physical long-press response.
- Tooltip fade-in: `160-200ms`.
- Avoid layout animation on the real child. The real screen should remain still behind the overlay.
- Do not animate `top`, `left`, or other layout properties after the clone is positioned.

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
- Set the cloned component to `pointerEvents="none"`.
- Do not allow the underlying real button/card to execute its normal action through the overlay.
- For Type A mandatory tours, make the full-screen mask pressable and advance on any tap.
- For Type B previews, dismiss or trigger actions only from the overlay's designed controls or release gesture.

### Zero-Latency Tour Start
- If the highlight starts immediately after onboarding, set the tour state synchronously before navigating to the dashboard.
- Do not wait for a Supabase/profile fetch to start the first tour frame.
- The first dashboard frame should already render the mask if the user just completed onboarding.

### Global Tour Tempo
- The global app tour must never jump directly from one mask to the next.
- Every step transition follows this rhythm:
  - User taps the highlighted copy or the guided action.
  - Current mask fades out.
  - User sees the full, unmasked real UI for about `400-450ms`.
  - If a screen/tab change is needed, run that navigation while unmasked.
  - The next mask appears only after the destination UI is visible and stable.
- For tab/page moves in the tour, use a slower instructional transition than normal navigation:
  - Recommended tour tab transition duration: `600-650ms`.
  - Recommended post-navigation settle before next mask: `350-450ms`.
- The intended feel is:
  - `press -> mask vanished -> real UI/page movement -> mask reappears`
- Do not show a black mask while the target component has not been measured.
- Do not open a second full-screen modal spotlight inside another modal.
- Modal-in-modal highlights must use a local mask/copy layer inside that modal instead:
  - Apply a local blur + dim layer only over the modal surface.
  - Copy the target action button at its exact in-modal position.
  - Show the same floating tooltip box style used by full-screen tour steps.
  - Tapping the local mask/copy should trigger the same action as the real highlighted button.
- Do not place tour instructions as static helper text inside the modal container when the rest of the tour uses floating tooltip boxes.

### Nuances Global Tour Flow
- The first-run tour is task-based, not a static feature list.
- The tour teaches the user to make one real card through the existing UI:
  - Step 1: explain the sample sentence on the Deck screen.
  - Step 2: move to Cache and highlight the real `Upload` button with mask/copy.
  - Step 3: open the real Upload modal and guide the user to paste: `I had to wing it during the presentation.`
  - Step 4: guide the real `Add` button in the Upload modal.
  - Step 5: in Create Word, use mask/copy to guide the user to choose the real `wing` token chip.
  - Step 6: guide the real generate button.
  - Step 7: guide the real save button.
  - Step 8: guide putting the card into an album.
  - Step 9: guide Pronunciation Coach.
  - Step 10: guide Quick Quiz.
- Do not create temporary tutorial-only pages for OCR, target selection, card generation, or quiz.
- Do not preload the sample sentence into the visible text field. The user should be guided to paste it into the real field.
- The Create Word target selection step must highlight the actual `wing` chip with Type A mask/copy, and tapping the mask must perform the same selection action the chip would perform.
- Upload modal `Paste` and `Add` steps must use modal-local mask/copy with blur and floating tooltip, not static inline instructions.

### Do
- Reuse the actual child component as the visual source of truth.
- Keep the clone visually faithful to the original element.
- Keep Type A tooltip copy short and instructional.
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
    <BlurView tint="dark" intensity={100} pointerEvents="none" style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.84)' }]} />
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
  <ContextActions actions={["settings", "delete"]} />
</LongPressHighlight>
```
