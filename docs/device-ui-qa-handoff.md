# Nuances Cross-Device UI QA Handoff

## 1. Mission

這份文件提供給新的 LLM chat，用來檢查並修正 Nuances 在不同手機尺寸、Safe Area、顯示模式、語言與系統字體設定下的 UI。

核心目標：

- 所有主要操作在小螢幕與 Dynamic Island 裝置都可見、可按、可捲動。
- 浮動 bottom navigation 不遮住內容或 action buttons。
- Light / Dark mode 都維持既有 Nuances 視覺，不另外發明設計。
- English / Traditional Chinese UI 都不截字、不溢出、不混用語言。
- 鍵盤、modal、圖片 cropper、卡片內容和長文字都能安全適應不同高度。
- 動畫與手勢在不同更新率與不同 iPhone 感測器上維持一致。
- 修正響應式問題時，不破壞既有資訊架構、動畫節奏和資料邏輯。

本任務不是重新設計 app。先找出真實跨裝置問題，再用最小範圍修正。

## 2. Project Snapshot

Workspace:

```text
/Users/users/vibe_coding_projects/nuances-app
```

Current stack:

```text
Expo SDK 54
React Native 0.81.5
React 19.1
react-native-reanimated 4.1
react-native-safe-area-context 5.6
React Navigation 7
WatermelonDB local storage
Supabase backend
Portrait orientation only
iPhone and Android phone layouts
iPad support disabled
```

App identifiers:

```text
iOS bundle ID: com.jeffenglishlearning.nuances
Android package: com.jeffenglishlearning.nuances
Deep-link scheme: nuances://
```

Theme tokens:

- `src/theme/colors.ts`
- Dark screen background is Nuances navy.
- Light screen background is the existing warm paper tone.
- Do not hardcode new theme colors when an existing palette token is available.
- Preserve the existing metal-blue, coral action state, glow, card surfaces, typography, and sticker visual language.

## 3. Before Editing

The worktree may already contain many unrelated user changes.

Rules:

1. Run `git status --short` before editing.
2. Never reset, restore, or delete changes that were not created during this task.
3. Read the complete component and its parent flow before changing dimensions.
4. Capture a baseline screenshot before each visual fix.
5. Change one layout system at a time and retest all affected screens.
6. Prefer `useWindowDimensions()` over module-level `Dimensions.get('window')` for layouts that need to react to size changes.
7. Prefer `useSafeAreaInsets()` over model-specific top or bottom constants.
8. Do not solve clipping by globally shrinking every font or control.
9. Do not hide content with `overflow: 'hidden'` unless clipping is an intentional mask.
10. Do not add unconditional `setState` calls to layout effects. Guard updates to prevent `Maximum update depth exceeded`.

Read these existing references first:

- `DESIGN.md`
- `docs/card-stack-swipe-navigation.md`
- `docs/ghost-card-handoff.md`
- `docs/runtime-loop-guard.md`

## 4. Running the App

Install and verify:

```bash
npm install
npm run type-check
npx expo run:ios
```

Start Metro after a native build already exists:

```bash
npx expo start --dev-client
```

List available simulators:

```bash
xcrun simctl list devices available
```

Run on a selected simulator:

```bash
npx expo run:ios --device "iPhone SE (3rd generation)"
npx expo run:ios --device "iPhone 15 Pro"
npx expo run:ios --device "iPhone 15 Pro Max"
```

If a named simulator is unavailable, use the closest available size class. Do not create a new simulator unless necessary.

Useful development deep links:

```text
nuances://dev/signout
nuances://dev/reset-onboarding
nuances://dev/skip-tour
nuances://dev/replay-tour
nuances://dev/replay-video-tour
nuances://dev/tour-motion-lab
```

Example on the booted simulator:

```bash
xcrun simctl openurl booted nuances://dev/reset-onboarding
```

Internal-only tools are controlled by build environment flags. Do not expose development reset links in production UI.

## 5. Required Device Matrix

### A. Small iPhone

Target class:

```text
iPhone SE 3rd generation or equivalent 375 x 667 class
Home button
No Dynamic Island
Small vertical space
```

Primary risks:

- CTA or save buttons below the fold.
- Modal body and keyboard competing for height.
- Bottom tab bar covering quiz/settings actions.
- Large headings consuming too much space.
- Membership options and legal footer overlap.

### B. Standard Dynamic Island iPhone

Target class:

```text
iPhone 15 Pro or similar 6.1-inch Dynamic Island device
```

Primary risks:

- Header, title, close button, or logo entering the top inset.
- Tutorial spotlight tooltip covering the highlighted target.
- Safe Area calculated differently from newer models.
- DeviceMotion tilt normalization behaving asymmetrically.

### C. Newer Pro iPhone

Target class:

```text
iPhone 16/17 Pro class if available
```

Primary risks:

- Layout that accidentally looks correct only on the developer's current phone.
- Hardcoded measurements tuned to a single screen.
- Sensor output differences hidden by device-specific calibration.

### D. Max-size iPhone

Target class:

```text
iPhone 15/16/17 Pro Max class
```

Primary risks:

- Excessive empty space.
- Cards and albums expanding beyond intended max width.
- Tooltip or modal content drifting too far from its target.
- Fixed-height content appearing vertically disconnected.

### E. Android Edge-to-edge

Target class:

```text
One compact Android phone
One modern Pixel-sized phone
Gesture navigation enabled
```

`app.json` enables Android edge-to-edge. Verify status bar, navigation gesture area, keyboard resize, back behavior, shadows/elevation, and absolute overlays.

### F. Physical Devices

At minimum test one older/standard iPhone and one newer iPhone physically.

Simulator-only QA is insufficient for:

- Camera
- Microphone recording and metering
- Azure pronunciation audio
- DeviceMotion tilt sticker
- Haptic border collisions
- Share extension
- Native notifications
- Sign in with Apple
- RevenueCat sandbox purchase UI

## 6. Environment Matrix

Every critical screen should be checked under:

| Dimension | Values |
| --- | --- |
| Theme | Light, Dark |
| UI language | English, Traditional Chinese |
| Content length | Short word, long word, multi-word phrase, long translation |
| Text size | Default, larger accessibility size |
| Network | Normal, slow response, failed response |
| Keyboard | Closed, open, switching fields |
| Account state | New user, onboarded user, premium/paywall path |
| Data volume | Empty, normal, many albums/cards/cache items |

Language changes must update the whole visible screen immediately. Watch for English first-frame flashes before Chinese state hydration completes.

## 7. Global Layout Contracts

### Safe Area

- Top headers must use the real top inset, not a guessed Dynamic Island height.
- Bottom actions must remain above both the home indicator and floating tab bar.
- Full-screen decorative backgrounds may extend edge-to-edge; interactive content may not.
- Modals with top close/cancel/save controls must never place the crop frame beneath those controls.

### Floating Bottom Navigation

Main implementation:

```text
src/navigation/RootNavigator.tsx
```

The liquid tab bar is absolutely positioned near the bottom and uses `useSafeAreaInsets()`. Main screens must reserve enough bottom content inset for:

```text
tab bar height + tab bar vertical offset + safe-area bottom + visual breathing room
```

Do not fix an overlap only by moving the tab bar. Usually the scroll container needs a matching `contentContainerStyle.paddingBottom`.

Required behavior:

- Last item can scroll completely above the navbar.
- Last CTA remains tappable.
- Tab bar badge is not clipped.
- Tab bar hides on second-layer screens and returns only after pop completes.
- Pressing Cache tab always returns to the Cache root, not a deeper stale layer.

### Scroll Containers

- Use `flexGrow: 1` when content should center while short but scroll when tall.
- Do not combine a fixed body height with variable translations unless overflow behavior is intentional.
- Preserve the user's current scroll position when async content completes unless the product rule explicitly calls for auto-scroll.
- Verify nested horizontal and vertical gestures independently.

### Text

- A single vocabulary word should stay on one line when the design requires it.
- Long phrases may reduce font size to a defined minimum or switch to the approved stacked option layout.
- Never truncate the answer itself without a way to read it.
- Chinese and English strings need independent measurement; do not assume one language's width.
- Buttons must support translation length without making the touch target smaller than approximately 44 points.
- Validate custom sticker fonts and fallback system fonts separately.

### Keyboard

- Inputs and primary actions must remain reachable while the keyboard is open.
- Tapping outside may dismiss the keyboard only if it does not trigger another hidden action.
- Quiz typing actions must not be covered by the keyboard.
- Image/text upload modal tabs must retain stable height when the keyboard appears.

### Modal and Overlay

- Every modal must have a visible dismissal route unless intentionally mandatory.
- Transparent/invisible modal layers must never remain mounted and block touches.
- Mask-and-copy highlights must measure the current target with `measureInWindow()` after layout settles.
- Tutorial clone uses `pointerEvents="none"`; the intended target or controlled overlay owns interaction.
- Modal content must stay within Safe Area and remain scrollable on compact devices.

### Animation

- Animate `transform` and `opacity` with the native driver/Reanimated where possible.
- Do not animate `left`, `top`, `width`, or `height` with a native-driven React Native `Animated` node.
- Never move one Animated node between JS and native drivers.
- Avoid layout-state updates every frame.
- Verify 60 Hz and 120 Hz physical devices when possible.
- Reduced performance on one screen should be profiled before lowering animation quality globally.

## 8. Screen-by-Screen QA

### 8.1 Splash and Loading Transition

Main files:

- `src/components/UI/shared/AnimatedSplashV2.tsx`
- `App.tsx`

Check:

- App icon appears immediately without emoji or placeholder.
- Background is opaque and does not reveal the app too early.
- Logo and background exit together according to the current animation contract.
- No blank navy-only frame during warm resume or auth hydration.
- Shapes cover all corners on every aspect ratio.
- No blur is introduced into the geometric animation.
- Completion callback fires once and does not leave an invisible blocking view.

### 8.2 Auth Screen

Main ownership is in `App.tsx` and its auth UI helpers.

Check:

- `Nuances` title stays below Dynamic Island/notch.
- Cutout icon can travel across its intended bounds without being clipped by hidden padding.
- Bottom boundary is the top of auth buttons.
- Apple and Google buttons remain fully above home indicator.
- Buttons have the existing light press feedback.
- Tilt and haptics stop while an auth action is processing.
- Light and dark system modes both keep the intentional navy auth background and readable white text.
- Loading and error alerts do not overflow in Chinese.

### 8.3 Onboarding

Main files:

- `src/screens/flow/OnboardingFlow.tsx`
- `src/components/UI/shared/OnboardingHeroTriplet.tsx`

Check:

- System/native language is available before first paint; no English-to-Chinese flash.
- Question title, sticker labels, progress, and continue button fit on small screens.
- Hero and labels enter in sync with the title.
- Sticker assets do not leave the viewport on narrow phones.
- Selected state uses the approved glow without rectangular active backgrounds.
- Multi-select and single-select questions keep their correct interaction rules.
- Continue button stays visible and uses the Upload-button shape/font treatment.
- No back function if the current product decision still disables going backward.
- Completion runs loading animation and then tour without an unmasked dashboard frame.

### 8.4 Global Tour

Main files:

- `src/contexts/AppTourContext.tsx`
- `src/components/UI/shared/TutorialSpotlight.tsx`
- `src/features/tour/`

Check:

- Tour starts once per user and does not recur on every app launch.
- Skip control stays inside top Safe Area and does not cover product controls.
- Mask enters slowly/smoothly with the documented blur transition.
- Highlight copy is exact size, correctly measured, and not independently pressable.
- Only the intended action advances each step.
- Sticky-note explanation and moving arrow remain visible without covering the target.
- Navigation transitions briefly reveal the actual UI before the next mask appears.
- Cache flow includes swipe-to-process, not only Create-button guidance.
- Create Card save guidance appears only after the user reaches the bottom.
- Album/card-detail steps match current product sequence.

Use the development replay deep links rather than corrupting user profile state.

### 8.5 Deck Main Screen

Main files:

- `src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx`
- `src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx`

Check:

- Album grid columns and spacing fit all widths.
- Album icons do not become so tall that Quick Quiz is hidden by navbar.
- More than one album page has correct horizontal paging and dot indicator.
- Album order does not change unless the user rearranges it in settings.
- Word Pop toggle/state works and chosen album source is respected.
- Word Pop uses slideshow only, not breathing text.
- Quick Quiz and tuning/equalizer button remain separately visible.
- New Words state returns to Quick Quiz after reviewed IDs update.
- Today's activity heatmap shows every weekday, especially Sunday, on all widths.
- Word stickers retain the minimum `intellect`-sized footprint and shrink only for longer words.

Known regression to reproduce on both iPhone 15 Pro and newer Pro device:

```text
Sunday column previously rendered without blocks on one device class.
```

### 8.6 Album View and Card Detail

Main files:

- `src/screens/flow/DeckScreenFlow/AlbumViewFlow.tsx`
- `src/screens/flow/DeckScreenFlow/CardDetailFlow.tsx`
- `src/components/UI/DeckScreenUI/CardDetailCarouselUI.tsx`
- `src/components/UI/DeckScreenUI/CardDetailCarouselCardUI.tsx`
- `src/components/UI/DeckScreenUI/CardDetailHeaderActionsUI.tsx`

Check:

- Edge swipe pop works without fighting the horizontal card carousel.
- Card widths, snap interval, and side insets adapt to current screen width.
- Four card actions distribute evenly and outer icons align with card edges.
- Heart switches state cleanly without blur/press-scale artifact.
- Front/back sections scroll when detailed content exceeds card height.
- Definition remains a concise translation; context can grow independently.
- Collocations/examples and their translations are fully readable.
- Semantic relations do not push essential actions out of reach.
- Personal notes are accessible and not merely below an unreachable fixed body.
- Album picker uses the same album icon/image appearance as the main grid.
- No obsolete oval `x cards` badge appears.
- All section labels follow current UI language.

Navigation architecture details are in `docs/card-stack-swipe-navigation.md`.

### 8.7 Cache Screen and Today's Upload

Main files:

- `src/screens/flow/CacheScreenFlow/index.tsx`
- `src/components/UI/CacheScreenUI/CacheStackUI.tsx`
- `src/components/UI/CacheScreenUI/CacheCardUI.tsx`
- `src/components/UI/CacheScreenUI/CacheInputModalUI.tsx`

Check:

- Today's Upload area grows when content requires more room.
- Empty/non-empty blur state covers both container and text as intended.
- Cache stack is local-only and UI must not imply cloud synchronization.
- Multiple shared/imported images produce the right number of cards.
- Right swipe processing remains reachable and visually obvious.
- Add/upload control is not covered by the floating tab bar.
- Tilt sticker uses equal normalized sensitivity in all four directions.
- Border collision matches the visible boundary with no invisible wall.
- Tilt haptics only run while Cache screen is active.

Known physical-device regression:

```text
Right tilt previously felt damped on iPhone 15 but normal on a newer iPhone,
while the other three directions matched. Test calibrated/normalized sensor math
without lowering sensitivity globally.
```

### 8.8 Upload, Camera, and Image Cropper Modals

Main files:

- `src/components/UI/CacheScreenUI/CacheInputModalUI.tsx`
- `src/components/UI/CacheScreenUI/CameraModalUI.tsx`
- `src/components/ImageCropperModal.tsx`
- `src/components/UI/DeckScreenUI/AlbumSettingsModalUI.tsx`

Check:

- Image and text tabs have stable, intentional height.
- Only the intended upload circle is pressable where specified.
- Camera opens on a physical device and handles denied permission.
- Cropper always becomes visible above the parent modal.
- Cancel/Confirm stay above image content and remain tappable.
- Pinch zoom supports both enlarging and shrinking within valid bounds.
- Album-cover crop mask matches the actual grid cover silhouette.
- Replacing an existing cover refreshes preview immediately without closing/reopening the settings modal.
- Cropped image fully fills the final cover shape.
- Chinese and English labels both fit.
- Do not display the technical term `OCR` in user-facing UI.

### 8.9 Create Card and Ghost Card

Main files:

- `src/screens/flow/CacheScreenFlow/CreateCardFlow.tsx`
- `src/components/UI/CacheScreenUI/CreateCardGhostPreviewSceneUI.tsx`

Check:

- Source image/context/keyword controls fit compact screens.
- AI depth dropdown stays within viewport and uses onboarding Q3 icons.
- Did You Mean appears near the top and supports accept, reject, and custom correction.
- Each card renders front then back in selection order.
- First selected card stays first; last selected card stays last.
- Auto-scroll centers the next actively generated card, not the final Save scene.
- User scroll position is preserved when all cards finish.
- No completion shake/haptic remains at Save scene.
- Save button is reachable and says only the localized Save label.
- Streaming partial text does not cause layout jumps or repeated measure loops.
- Both light and dark card surfaces match final Card Detail.
- Long detailed cards scroll rather than truncate.

Full contract: `docs/ghost-card-handoff.md`.

### 8.10 Quick Quiz and New Words

Main file:

- `src/screens/flow/DeckScreenFlow/ReviewFlow.tsx`

Check:

- Question and actions fit on small screens without bottom-navbar overlap.
- Front shows the original example sentence with a real blank, then translation on a separate line.
- No answer leakage from extra examples or translated brackets.
- Each vocabulary item appears once per normal quiz run, except one allowed spelling makeup question.
- Long phrases switch to thin stacked answer rectangles.
- Long translated answer options may use two lines without clipping.
- A single word is not split across two lines.
- Answer screen distinguishes green Correct, blue Solution, and red Wrong.
- Correct answer and user's wrong answer use separate containers.
- Back side stays concise enough that Next remains reachable.
- Typing quiz stays above keyboard and shows target translation.
- Pronunciation button is centered and prominent on the question card.
- Recording waveform appears only while recording and reacts to mic volume.
- Pronunciation question availability is deterministic enough that two users with comparable banks do not see unexplained extremes.
- Turning off New Words Only immediately updates Deck button state.

### 8.11 Pronunciation Coach

Main files:

- `src/components/UI/DeckScreenUI/PronunciationCoachUI.tsx`
- `src/components/UI/DeckScreenUI/PronunciationPhonemeSectionUI.tsx`
- `src/screens/flow/DeckScreenFlow/hooks/useCardDetailPronunciation.ts`

Check:

- Modal is not an oversized empty body before recording.
- Word and IPA guidance are visible on first open.
- Waveform appears only during recording and stays close to controls.
- Recording controls retain a stable vertical position across states.
- Result score never overlaps controls.
- IPA blocks wrap into equal-size rows; second row must not shrink.
- Whole-word button remains available after scoring.
- IPA block press plays the phoneme only.
- Cached audio uses active silhouette immediately.
- Cloud download shows loading buffer only while actually downloading.
- Closing during recording stops and disposes the recording.
- Phrase questions assess the complete phrase, not only the first word.

### 8.12 Profile, Settings, and Membership

Main files:

- `src/components/UI/ProfileScreenUI/ProfileMainScreenUI.tsx`
- `src/screens/flow/ProfileScreenFlow/ProfileSettingsFlow.tsx`
- `src/screens/flow/ProfileScreenFlow/ProfileSettingOptionsFlow.tsx`
- `src/components/UI/ProfileScreenUI/PaywallFooter.tsx`

Check:

- Main profile screen scrolls when heatmap pushes settings downward.
- Delete Account remains a normal reachable settings row, not behind navbar.
- Second-layer settings use the same smooth stack-card navigation behavior as album/card flows.
- Interactive page swipe back remains smooth and does not create state-update loops.
- Native-style reminder/word-pop toggles align correctly on all widths.
- Font word-size percentage slider remains usable at both ends.
- Membership background remains navy in light and dark mode.
- Weekly/monthly/yearly options keep title and price on one line where required.
- CTA remains above Privacy Policy and Terms links.
- Footer stays above home indicator and never overlays CTA.
- Membership content can scroll on compact phones without cutting off purchase actions.

### 8.13 Notifications and Deep Links

Check:

- Cache notification opens Cache root screen.
- Reminder permission prompt and settings row fit both languages.
- Share receipt notification count is readable for multiple images.
- Update-required screen respects current build number and Safe Area.
- Deep-link navigation does not leave a blank background-only screen.

## 9. Responsive Implementation Guidance

Prefer derived layout values:

```ts
const { width, height } = useWindowDimensions();
const insets = useSafeAreaInsets();

const isCompactHeight = height < 740;
const horizontalPadding = Math.max(16, Math.min(28, width * 0.055));
const contentWidth = Math.min(width - horizontalPadding * 2, 560);
```

Do not spread `isCompactHeight` conditionals across many components. Centralize a small set of meaningful size decisions near the screen root and pass semantic values down.

For bottom spacing:

```ts
const bottomContentInset = insets.bottom + tabBarHeight + tabBarOffset + 16;
```

For long content, first prefer:

1. Scrollable body.
2. Flexible gaps and bounded max widths.
3. Approved font scaling with a readable minimum.
4. Alternate stacked layout for truly long options.

Do not use arbitrary per-device model checks such as `if iPhone15`. Solve by dimensions, Safe Area, text measurement, or normalized sensor ranges.

## 10. Visual QA Workflow

For each issue:

1. Record device model, viewport, theme, language, and text-size setting.
2. Capture the broken baseline screenshot.
3. Identify whether the cause is Safe Area, fixed dimensions, text measurement, scroll inset, absolute positioning, or animation state.
4. Make the smallest structural fix.
5. Capture an after screenshot on the failing device.
6. Retest one smaller and one larger device.
7. Retest both languages if text layout changed.
8. Retest both themes if colors, shadows, borders, or masks changed.
9. Retest the prior and next navigation layers.
10. Run static checks before reporting completion.

Suggested evidence naming:

```text
qa/<screen>-<device>-<theme>-<language>-before.png
qa/<screen>-<device>-<theme>-<language>-after.png
```

## 11. Acceptance Checklist

### Geometry

- [ ] No content enters notch/Dynamic Island unintentionally.
- [ ] No CTA is behind home indicator or floating navbar.
- [ ] No invisible overlay blocks touch.
- [ ] No text is clipped by internal padding.
- [ ] Long content is readable by wrapping, scaling, stacking, or scrolling.
- [ ] Modal controls remain visible above media and keyboard.

### Interaction

- [ ] Every visible button has a matching touch area.
- [ ] Horizontal swipe gestures do not steal vertical scrolling.
- [ ] Stack swipe-back works from the intended edge.
- [ ] Press animation remains lightweight and responsive.
- [ ] Haptics happen only on intentional interaction/state transitions.

### State

- [ ] Async completion does not jump scroll unexpectedly.
- [ ] Warm resume never leaves an empty screen.
- [ ] Theme/language does not flash stale defaults.
- [ ] Loading, failure, empty, and completed states all fit.
- [ ] Tour and modal overlays unmount cleanly.

### Regression

- [ ] iPhone 15-class and newer Pro tilt behavior match.
- [ ] Sunday heatmap blocks render.
- [ ] Settings/Delete Account are not behind navbar.
- [ ] Quiz answer/actions remain reachable with detailed content.
- [ ] Pronunciation IPA rows use equal block sizes.
- [ ] Membership footer does not overlap CTA.
- [ ] Image cropper is visible, interactive, and correctly masked.

## 12. Required Verification Commands

Run after implementation:

```bash
npm run type-check
npm run lint
git diff --check
```

If native configuration or native modules changed:

```bash
npx expo run:ios
```

Do not run destructive clean/reset commands unless the user explicitly approves them. A Metro cache clear is not a substitute for understanding a layout bug.

## 13. Reporting Format for the New Chat

Report findings first, ordered by severity:

```text
P0: Privacy/security/data exposure
P1: Main action inaccessible, crash, blank screen, blocked navigation
P2: Clipping, overlap, wrong Safe Area, broken language/theme
P3: Spacing, polish, minor animation inconsistency
```

Each finding should include:

```text
Device / viewport
Theme and UI language
Exact reproduction steps
Root cause
Files and lines involved
Fix made
Devices retested
Residual risk
```

Do not say that cross-device QA is complete after testing only one simulator.

## 14. Suggested Opening Prompt for the New Chat

```text
Use docs/device-ui-qa-handoff.md as the source of truth. Audit Nuances across the required device, theme, language, keyboard, and content-length matrix. Start with the small iPhone and iPhone 15 Pro classes, capture baseline evidence, and report findings by severity before making broad changes. Fix issues end-to-end with minimal responsive changes, preserve the existing design system and user worktree, then run type-check, lint, and git diff --check. Do not declare completion until each changed screen has been retested on at least one smaller and one larger device.
```
