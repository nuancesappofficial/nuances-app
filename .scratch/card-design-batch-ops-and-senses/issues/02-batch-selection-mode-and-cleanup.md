# 02 — Long-Press Batch Selection Mode & Deck Row Cleanup

**What to build:**
Remove the three-dot button from every card row. Support long-press on any card row with haptic feedback to enter Batch Selection Mode. In this mode, replace row action with a circular checkbox, allow single-tap toggling of card selections, and mount a floating bottom action dock supporting batch folder movement and batch deletion with confirmation alert.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] Remove the trailing three-dot icon button from CardViewUI rows
- [x] Add long-press gesture with Haptics.selectionAsync() on card rows to activate Batch Selection Mode
- [x] Render circular checkboxes on cards in Batch Selection Mode with tap-to-toggle selection
- [x] Implement BatchActionDockUI displaying selection counter, "移動到資料夾" (Move to Folder), and "刪除" (Delete with confirmation)
- [x] Add header "取消 / 完成" button to exit Batch Selection Mode and clear selections
- [x] Add unit tests for batch selection state logic (toggle, select all, batch delete/move filters)
