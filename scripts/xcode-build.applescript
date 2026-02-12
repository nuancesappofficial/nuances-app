-- 自動化 Xcode 構建的 AppleScript
-- 用於解決命令行工具無法識別模擬器的問題

tell application "Xcode"
	activate
	delay 2
	
	tell application "System Events"
		tell process "Xcode"
			-- 點擊 Run 按鈕 (Cmd+R)
			keystroke "r" using {command down}
		end tell
	end tell
end tell

return "✅ Xcode 構建已觸發！請等待 5-10 分鐘..."
