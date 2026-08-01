# Card View / Deck Screen Swipe Navigation Architecture

## Short Answer

Card View 從螢幕左側向右 swipe，回到 Deck Screen 的能力不是 `PagerView`。

它來自：

- `@react-navigation/stack`
- iOS 預設的 horizontal card transition
- `gestureEnabled: true`
- React Navigation stack 的 interactive pop gesture

`react-native-pager-view` 雖然存在於 `package.json`，但目前 app source 沒有實際 import 或使用它。

## Main Files

- `src/navigation/RootNavigator.tsx`
  - 建立 Deck、Cache、Profile 三個獨立 navigation stacks。
  - 設定 `presentation: 'card'`、`gestureEnabled` 與 `gestureResponseDistance`。
  - 控制進入第二層頁面時隱藏 bottom tab bar。
- `src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx`
  - 點擊 album 後 push `AlbumView`。
- `src/screens/flow/DeckScreenFlow/AlbumViewFlow.tsx`
  - Album 內的 Card View。
  - 返回按鈕使用 `navigation.goBack()`。
  - 點擊單張卡片後 push `CardDetail`。
- `src/screens/flow/DeckScreenFlow/CardDetailFlow.tsx`
  - Card Detail 畫面。
  - 返回按鈕使用 `navigation.goBack()`。
- `src/components/UI/DeckScreenUI/CardDetailCarouselUI.tsx`
  - Card Detail 內部卡片左右切換。
  - 使用 horizontal `Reanimated.FlatList`，不是 stack swipe，也不是 PagerView。

## Navigation Hierarchy

Deck tab 內部有自己的 `NavigationContainer` 與 `CardsStackNav`：

```text
RootNavigator
  -> Deck tab scene
     -> NavigationIndependentTree
        -> NavigationContainer
           -> CardsStackNav.Navigator
              -> CardsList / Deck (DeckMainFlow)
              -> AlbumView (AlbumViewFlow)
              -> CardDetail (CardDetailFlow)
              -> DayView
              -> CardReview
```

典型 route stack：

```text
DeckMainFlow
  -> navigation.navigate('AlbumView')
AlbumViewFlow
  -> navigation.navigate('CardDetail')
CardDetailFlow
```

當使用者在 Card Detail 左邊緣向右 swipe：

```text
CardDetail -> pop -> AlbumView
```

當使用者在 Album View 左邊緣向右 swipe：

```text
AlbumView -> pop -> DeckMainFlow
```

這和點擊返回按鈕執行的 `navigation.goBack()` 是同一個 stack pop 行為。差別只在於 swipe 是互動式控制 transition progress。

## Why the Swipe Works

`RootNavigator.tsx` 使用的是：

```ts
import { createStackNavigator } from '@react-navigation/stack';
```

Deck stack 的 navigator 預設開啟 gesture：

```tsx
<CardsStackNav.Navigator
  screenOptions={{ headerShown: false, gestureEnabled: true }}
>
```

Album 與 Card Detail 都以 card route push：

```tsx
<CardsStackNav.Screen
  name="AlbumView"
  component={SyncAlbumViewFlow}
  options={{ presentation: 'card' }}
/>

<CardsStackNav.Screen
  name="CardDetail"
  component={SyncCardDetailFlow}
  options={{
    presentation: 'card',
    gestureEnabled: true,
    gestureResponseDistance: 28,
  }}
/>
```

在 iOS，`@react-navigation/stack` 的 default transition 是 `SlideFromRightIOS`：

- `gestureDirection: 'horizontal'`
- 新頁面由右側進入
- interactive pop 時，新頁面跟著手指向右移動
- 前一層頁面同步從左側露出
- 放手後依位移與速度決定完成 pop 或回彈取消

因此它看起來像 iOS native navigation controller 的 swipe-back，但目前專案使用的是 `@react-navigation/stack`，不是 `createNativeStackNavigator`。

## Gesture Activation Area

`CardDetail` 明確設定：

```ts
gestureResponseDistance: 28
```

也就是返回手勢主要從螢幕左邊約 28 pt 的區域開始。這個設定很重要，因為 Card Detail 內部還有水平卡片 carousel。如果整個畫面都能觸發 pop gesture，返回手勢會和卡片左右切換互相搶 gesture。

`AlbumView` 沒有指定 `gestureResponseDistance`，所以使用 `@react-navigation/stack` 的 horizontal default，目前套件預設是 50 pt。

建議所有包含 horizontal list/carousel 的第二層頁面都明確使用較窄的 edge response distance，例如 28 pt。

## What PagerView Is Not Doing

目前 `react-native-pager-view` 只存在於 dependency：

```json
"react-native-pager-view": "6.9.1"
```

但 app source 沒有 `PagerView` import。因此它目前不負責：

- Album View 回 Deck
- Card Detail 回 Album View
- Card Detail 內的卡片切換
- Deck / Cache / Profile 主頁籤切換

如果確認未來也不會使用，可另行盤點後移除 dependency；不要只因為 package 存在就判斷畫面正在使用它。

## Card Detail Carousel Is Separate

Card Detail 內切換不同單字卡使用：

```tsx
<Reanimated.FlatList
  horizontal
  snapToInterval={snapInterval}
  decelerationRate="fast"
  disableIntervalMomentum
/>
```

它的用途是：

```text
Card A <-> Card B <-> Card C
```

Stack pop gesture 的用途是：

```text
CardDetail screen -> AlbumView screen
```

兩者都使用水平手勢，但層級與責任不同：

| Interaction | Implementation | Scope |
| --- | --- | --- |
| 左邊緣右滑返回上一頁 | `@react-navigation/stack` | Screen navigation |
| Card Detail 左右換卡 | horizontal `Reanimated.FlatList` | Current screen content |
| 點擊 bottom tab 換主頁 | absolute tab scenes + opacity animation | Root tab selection |

## Main Tabs Are Also Not PagerView

Deck、Cache、Profile 三個主頁目前使用三個 absolute-positioned scenes：

```tsx
<Animated.View style={[styles.tabScene, { opacity: tabOpacities[0] }]} />
<Animated.View style={[styles.tabScene, { opacity: tabOpacities[1] }]} />
<Animated.View style={[styles.tabScene, { opacity: tabOpacities[2] }]} />
```

切換 tab 時執行 opacity animation，並用 `pointerEvents` 與 `zIndex` 決定 active scene。這也不是 `PagerView`，而且目前沒有用 pan gesture 讓使用者左右拖曳主 tab。

## Bottom Tab Bar Synchronization

第二層頁面會經過 `withNavBarSync` wrapper：

```ts
function withNavBarSync(Component) {
  return function WrappedComponent(props) {
    const tabSwipeContext = React.useContext(TabSwipeContext);

    React.useEffect(() => {
      tabSwipeContext?.setTabBarHidden?.(true);
      return () => tabSwipeContext?.setTabBarHidden?.(false);
    }, [tabSwipeContext]);

    return <Component {...props} />;
  };
}
```

它只負責：

- 第二層 screen mount 時隱藏 bottom tab bar
- screen unmount 時恢復 bottom tab bar

它不負責 swipe-back transition，也沒有逐 frame 綁定 navigation gesture progress。

目前 tab bar 的 show/hide 是獨立的 300ms `translateY` animation。因此在 interactive swipe-back 過程中，screen transition 很跟手，但 tab bar 通常要等 route pop/unmount 後才開始出現，不是 1:1 跟著手指。

## Extra Album View Fade

`AlbumViewFlow` mount 時另外執行一個 520ms opacity animation：

```ts
screenOpacity.setValue(0);
Animated.timing(screenOpacity, {
  toValue: 1,
  duration: 520,
  useNativeDriver: true,
}).start();
```

這不是 swipe-back 的來源，只是 Album View 內容自己的進場 fade。React Navigation 同時已經在執行 iOS card slide，因此這是第二層動畫。

若未來感覺進入 Album View 有拖慢、畫面延遲顯示或 transition 疊加，應優先檢查這個額外 fade 是否仍有必要。

## Why This Feels Smooth

這條 Deck navigation 通常較順，主要原因是：

- screen navigation 交給成熟的 stack gesture controller。
- transition progress 由手指直接驅動，不需要在每幀 set React state。
- 返回只做 stack pop，不需要自製 modal dismiss state machine。
- `gestureResponseDistance` 限定邊緣區域，減少與 horizontal carousel 衝突。
- 前一個 screen 已存在於 stack，swipe 時可直接露出，不必臨時重新建立畫面。
- `AlbumViewFlow` 使用預載 cache，降低 push 後等待資料的時間。

## Reusing This Structure

若 Settings 第二層、其他 full-page modal 或功能頁也需要同樣順暢的 page swipe return，建議沿用相同架構：

1. 將第二層內容做成真正的 stack screen。
2. 使用同一個 `createStackNavigator`。
3. route 設定 `presentation: 'card'`。
4. 設定 `gestureEnabled: true`。
5. 有 horizontal content 時設定較窄的 `gestureResponseDistance`。
6. 返回按鈕只呼叫 `navigation.goBack()`。
7. 不要在 swipe progress 中透過 React state 每幀同步動畫。
8. 避免 screen 本身再疊一個長時間進出場動畫。
9. modal 或 sheet 僅用於真正的 overlay，不用來模擬 full-page navigation。

共用選項可維持：

```ts
const IOS_CARD_SCREEN_OPTIONS = {
  presentation: 'card' as const,
  gestureEnabled: true,
  gestureResponseDistance: 28,
};
```

## Do Not Replace It with PagerView

`PagerView` 適合：

- 同層級分頁
- onboarding pages
- tab pages
- 固定頁數的水平內容

它不適合直接取代 navigation history，因為它本身不處理：

- route params
- push / pop history
- hardware back
- deep links
- nested navigation state
- screen lifecycle
- interactive navigation dismissal

Card View 回 Deck 是 navigation hierarchy，不是同層級 pagination，因此 stack 是正確架構。

## Regression Checklist

- [ ] Deck 點 album 後 push `AlbumView`，不是開 full-screen modal。
- [ ] Album View 左邊緣右滑可回 Deck。
- [ ] Album View 返回按鈕使用 `navigation.goBack()`。
- [ ] Album 內點卡片後 push `CardDetail`。
- [ ] Card Detail 左邊緣右滑可回 Album View。
- [ ] Card Detail 的水平 carousel 仍可正常左右換卡。
- [ ] carousel swipe 不會誤觸 screen pop。
- [ ] pop gesture 取消時畫面能回彈，不會留下錯誤 route state。
- [ ] 第二層 screen 顯示時 bottom tab bar 隱藏。
- [ ] pop 完成後 bottom tab bar 恢復。
- [ ] 不在 navigation gesture 過程中每幀 set React state。
- [ ] 不把 `PagerView` 誤認為目前 swipe-back 的實作者。
