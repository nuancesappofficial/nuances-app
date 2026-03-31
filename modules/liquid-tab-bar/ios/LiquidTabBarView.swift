import SwiftUI

private struct LiquidTabItem: Identifiable {
  let id: Int
  let title: String
  let symbol: String
}

public struct LiquidTabBarView: View {
  @Binding var selectedTabIndex: Int
  let onTabSelect: (Int) -> Void
  let onAddPress: () -> Void

  @State private var isExpanded: Bool = true
  @State private var collapseTask: Task<Void, Never>?

  private let tabButtonSize: CGFloat = 64
  private let tabInnerPadding: CGFloat = 6

  private let liquidTabs: [LiquidTabItem] = [
    .init(id: 0, title: "Cache", symbol: "tray.full"),
    .init(id: 1, title: "Card", symbol: "rectangle.portrait.on.rectangle.portrait.angled"),
    .init(id: 2, title: "Profile", symbol: "person.circle")
  ]

  public init(
    selectedTabIndex: Binding<Int>,
    onTabSelect: @escaping (Int) -> Void,
    onAddPress: @escaping () -> Void
  ) {
    _selectedTabIndex = selectedTabIndex
    self.onTabSelect = onTabSelect
    self.onAddPress = onAddPress
  }

  public var body: some View {
    GeometryReader { proxy in
      let totalWidth = max(proxy.size.width, tabButtonSize * 4)
      let expandedSlotWidth = totalWidth / 4
      let leftWidth = isExpanded ? expandedSlotWidth * 3 : tabButtonSize
      let addSlotWidth = isExpanded ? expandedSlotWidth : tabButtonSize
      let horizontalGap: CGFloat = isExpanded ? 0 : 16

      HStack(alignment: .bottom, spacing: horizontalGap) {
        leftCluster(expandedWidth: expandedSlotWidth * 3)
          .frame(width: leftWidth, height: tabButtonSize, alignment: .leading)

        if !isExpanded {
          Spacer(minLength: 0)
        }

        addButton
          .frame(width: addSlotWidth, height: tabButtonSize, alignment: .center)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(height: tabButtonSize)
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 20)
    .padding(.bottom, 30)
    .animation(.spring(response: 0.36, dampingFraction: 0.78), value: selectedTabIndex)
    .animation(.spring(response: 0.36, dampingFraction: 0.78), value: isExpanded)
    .onAppear {
      let clamped = clamp(selectedTabIndex)
      if selectedTabIndex != clamped { selectedTabIndex = clamped }
      resetIdleTimer()
    }
    .onChange(of: selectedTabIndex) { newValue in
      let clamped = clamp(newValue)
      if clamped != newValue { selectedTabIndex = clamped }
      if isExpanded {
        withAnimation(.spring(response: 0.36, dampingFraction: 0.78)) {
          isExpanded = true
        }
        resetIdleTimer()
      }
    }
    .onDisappear {
      collapseTask?.cancel()
      collapseTask = nil
    }
  }

  private func leftCluster(expandedWidth: CGFloat) -> some View {
    ZStack(alignment: .leading) {
      Capsule()
        .fill(.ultraThinMaterial)
        .environment(\.colorScheme, .dark)
        .overlay(
          Capsule()
            .stroke(Color.white.opacity(0.26), lineWidth: 0.55)
        )
        .overlay(
          Capsule()
            .stroke(
              LinearGradient(
                colors: [Color.white.opacity(0.30), Color.white.opacity(0.02)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              ),
              lineWidth: 0.8
            )
            .padding(1.5)
        )
        .shadow(color: .black.opacity(0.20), radius: 10, y: 5)
        .overlay(alignment: .leading) {
          Capsule()
            .fill(
              LinearGradient(
                colors: [Color.white.opacity(0.34), Color.white.opacity(0.16)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .frame(width: indicatorWidth(expandedWidth: expandedWidth), height: tabButtonSize - 12)
            .offset(x: indicatorOffsetX(expandedWidth: expandedWidth))
            .blur(radius: isExpanded ? 0.6 : 0.9)
            .shadow(color: .white.opacity(0.10), radius: 4, y: 0)
            .allowsHitTesting(false)
        }
        .compositingGroup()

      if isExpanded {
        HStack(spacing: 0) {
          ForEach(liquidTabs) { item in
            let isActive = item.id == selectedTabIndex

            Button(action: {
              if !isActive {
                select(item.id)
              }
              resetIdleTimer()
            }) {
              VStack(spacing: 4) {
                Image(systemName: item.symbol)
                  .font(.system(size: 20, weight: isActive ? .bold : .medium))
                Text(item.title)
                  .font(.system(size: 11, weight: .bold))
              }
              .foregroundColor(isActive ? .white : .white.opacity(0.62))
              .frame(maxWidth: .infinity, maxHeight: .infinity)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
        .padding(tabInnerPadding)
      } else {
        Button(action: {
          withAnimation(.spring(response: 0.36, dampingFraction: 0.78)) {
            isExpanded = true
          }
          resetIdleTimer()
        }) {
          Image(systemName: liquidTabs[clamp(selectedTabIndex)].symbol)
            .font(.system(size: 22, weight: .bold))
            .foregroundColor(.white)
            .frame(width: tabButtonSize, height: tabButtonSize)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
    .frame(width: isExpanded ? expandedWidth : tabButtonSize, height: tabButtonSize, alignment: .leading)
  }

  private var addButton: some View {
    Button(action: {
      onAddPress()
      resetIdleTimer()
    }) {
      Image(systemName: "plus")
        .font(.system(size: 24, weight: .semibold))
        .foregroundColor(.white)
        .frame(width: tabButtonSize, height: tabButtonSize)
        .background(.ultraThinMaterial, in: Circle())
        .environment(\.colorScheme, .dark)
        .overlay(
          Circle().stroke(Color.white.opacity(0.22), lineWidth: 0.55)
        )
        .overlay(
          Circle()
            .stroke(
              LinearGradient(
                colors: [Color.white.opacity(0.28), Color.white.opacity(0.03)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              ),
              lineWidth: 0.8
            )
            .padding(1.5)
        )
        .shadow(color: .black.opacity(0.20), radius: 10, y: 5)
    }
    .buttonStyle(.plain)
  }

  private func select(_ index: Int) {
    let clamped = clamp(index)
    if selectedTabIndex != clamped {
      selectedTabIndex = clamped
      onTabSelect(clamped)
    }
  }

  private func clamp(_ index: Int) -> Int {
    min(2, max(0, index))
  }

  private func indicatorWidth(expandedWidth: CGFloat) -> CGFloat {
    if isExpanded {
      let slotWidth = (expandedWidth - tabInnerPadding * 2) / CGFloat(liquidTabs.count)
      return max(slotWidth - 8, tabButtonSize - 12)
    }
    return tabButtonSize - 12
  }

  private func indicatorOffsetX(expandedWidth: CGFloat) -> CGFloat {
    if isExpanded {
      let slotWidth = (expandedWidth - tabInnerPadding * 2) / CGFloat(liquidTabs.count)
      return tabInnerPadding + slotWidth * CGFloat(clamp(selectedTabIndex)) + (slotWidth - indicatorWidth(expandedWidth: expandedWidth)) / 2
    }
    // Collapse to the left-most icon coordinate.
    return 6
  }

  private func resetIdleTimer() {
    collapseTask?.cancel()
    collapseTask = Task {
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      if Task.isCancelled { return }
      await MainActor.run {
        withAnimation(.spring(response: 0.36, dampingFraction: 0.78)) {
          isExpanded = false
        }
      }
    }
  }
}
