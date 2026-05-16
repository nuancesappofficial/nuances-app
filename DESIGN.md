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
