import SwiftUI
import UIKit

// 1. 新增此擴充功能來處理 iOS 版本的相容性
extension View {
  @ViewBuilder
  func hideTabBarBackgroundIfAvailable() -> some View {
    if #available(iOS 16.0, *) {
      self.toolbarBackground(.hidden, for: .tabBar)
    } else {
      self
    }
  }
}

public struct LiquidTabBarView: View {
  @Binding var selectedTabIndex: Int
  let onTabSelect: (Int) -> Void
  let onAddPress: () -> Void
  let showsAddButton: Bool

  public init(
    selectedTabIndex: Binding<Int>,
    onTabSelect: @escaping (Int) -> Void,
    onAddPress: @escaping () -> Void,
    showsAddButton: Bool = true
  ) {
    _selectedTabIndex = selectedTabIndex
    self.onTabSelect = onTabSelect
    self.onAddPress = onAddPress
    self.showsAddButton = showsAddButton
  }

  public var body: some View {
    ZStack(alignment: .topTrailing) {
      TabView(selection: $selectedTabIndex) {
        Color.clear
          .tag(0)
          .tabItem {
            Image(systemName: "tray.full")
          }

        Color.clear
          .tag(1)
          .tabItem {
            Image(systemName: "rectangle.portrait.on.rectangle.portrait.angled")
          }

        Color.clear
          .tag(2)
          .tabItem {
            Image(systemName: "person.circle")
          }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .tabViewStyle(.automatic)
      .background(Color.clear)
      .hideTabBarBackgroundIfAvailable()
      .environment(\.colorScheme, .dark)

      if showsAddButton {
        Button(action: {
          onAddPress()
        }) {
          Image(systemName: "plus")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 36, height: 36)
            .background(.regularMaterial, in: Circle())
        }
        .padding(.trailing, 18)
        .padding(.top, 6)
        .buttonStyle(.plain)
      }
    }
    .frame(height: 86)
    .background(Color.clear)
    .ignoresSafeArea(.container, edges: .bottom)
    .hideTabBarBackgroundIfAvailable()
    .onAppear {
      configureTransparentTabBarAppearance()
      let clamped = clamp(selectedTabIndex)
      if selectedTabIndex != clamped { selectedTabIndex = clamped }
    }
    .onChange(of: selectedTabIndex) { newValue in
      let clamped = clamp(newValue)
      if clamped != newValue {
        selectedTabIndex = clamped
        return
      }
      onTabSelect(clamped)
    }
  }

  private func clamp(_ index: Int) -> Int {
    min(2, max(0, index))
  }

  private func configureTransparentTabBarAppearance() {
    let appearance = UITabBarAppearance()
    appearance.configureWithTransparentBackground()
    appearance.backgroundColor = .clear
    appearance.backgroundEffect = nil
    appearance.shadowImage = UIImage()
    appearance.shadowColor = .clear
    let itemAppearance = UITabBarItemAppearance()
    itemAppearance.normal.titleTextAttributes = [.foregroundColor: UIColor.clear]
    itemAppearance.selected.titleTextAttributes = [.foregroundColor: UIColor.clear]
    itemAppearance.normal.titlePositionAdjustment = UIOffset(horizontal: 0, vertical: 10)
    itemAppearance.selected.titlePositionAdjustment = UIOffset(horizontal: 0, vertical: 10)
    appearance.stackedLayoutAppearance = itemAppearance
    appearance.inlineLayoutAppearance = itemAppearance
    appearance.compactInlineLayoutAppearance = itemAppearance

    let tabBar = UITabBar.appearance()
    tabBar.isTranslucent = true
    tabBar.backgroundImage = UIImage()
    tabBar.shadowImage = UIImage()
    tabBar.backgroundColor = .clear
    tabBar.barTintColor = .clear
    tabBar.isOpaque = false
    tabBar.standardAppearance = appearance
    if #available(iOS 15.0, *) {
      tabBar.scrollEdgeAppearance = appearance
    }
  }
}
