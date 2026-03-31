import ExpoModulesCore
import SwiftUI

final class LiquidTabBarState: ObservableObject {
  @Published var selectedTabIndex: Int = 0
  @Published var showsAddButton: Bool = true
}

private struct LiquidTabBarRootView: View {
  @ObservedObject var state: LiquidTabBarState
  let onTabSelect: (Int) -> Void
  let onAddPress: () -> Void

  var body: some View {
    LiquidTabBarView(
      selectedTabIndex: Binding<Int>(
        get: { state.selectedTabIndex },
        set: { state.selectedTabIndex = min(2, max(0, $0)) }
      ),
      onTabSelect: onTabSelect,
      onAddPress: onAddPress,
      showsAddButton: state.showsAddButton
    )
  }
}

public final class LiquidTabBarNativeView: ExpoView {
  private let state = LiquidTabBarState()
  let onTabSelect = EventDispatcher()
  let onAddPress = EventDispatcher()
  private var hostingController: UIHostingController<LiquidTabBarRootView>?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    isOpaque = false
    clipsToBounds = false
    setupSwiftUIView()
  }

  private func setupSwiftUIView() {
    let root = LiquidTabBarRootView(
      state: state,
      onTabSelect: { [weak self] index in
        guard let self else { return }
        let clamped = Self.clampIndex(index)
        self.onTabSelect([
          "selectedTabIndex": clamped
        ])
      },
      onAddPress: { [weak self] in
        guard let self else { return }
        self.onAddPress([:])
      }
    )

    let host = UIHostingController(rootView: root)
    host.view.backgroundColor = .clear
    host.view.isOpaque = false
    host.view.clipsToBounds = false
    host.view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(host.view)
    NSLayoutConstraint.activate([
      host.view.topAnchor.constraint(equalTo: topAnchor),
      host.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      host.view.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])
    hostingController = host
  }

  func setSelectedTabIndex(_ index: Int) {
    let clamped = Self.clampIndex(index)
    DispatchQueue.main.async {
      if self.state.selectedTabIndex != clamped {
        self.state.selectedTabIndex = clamped
      }
    }
  }

  func setShowsAddButton(_ shows: Bool) {
    DispatchQueue.main.async {
      if self.state.showsAddButton != shows {
        self.state.showsAddButton = shows
      }
    }
  }

  private static func clampIndex(_ index: Int) -> Int {
    min(2, max(0, index))
  }
}

public class LiquidTabBarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiquidTabBar")

    View(LiquidTabBarNativeView.self) {
      Events("onTabSelect", "onAddPress")

      Prop("selectedTabIndex") { (view: LiquidTabBarNativeView, selectedTabIndex: Int) in
        view.setSelectedTabIndex(selectedTabIndex)
      }

      Prop("showsAddButton") { (view: LiquidTabBarNativeView, showsAddButton: Bool) in
        view.setShowsAddButton(showsAddButton)
      }
    }
  }
}
