#!/usr/bin/env bash
# Mac MVP 測試腳本 — 請在本機終端執行（需已安裝 Node 18+）
set -e
cd "$(dirname "$0")/.."
echo "📂 專案目錄: $(pwd)"
echo "📌 Node: $(node -v) | npm: $(npm -v)"
echo ""
echo "📦 安裝依賴..."
npm install
echo ""
echo "✅ 依賴安裝完成。請選擇："
echo "  路徑 A（快速預覽）: npm start  然後在終端按 i 開 iOS 模擬器"
echo "  路徑 B（完整 MVP）:  npx expo run:ios"
echo ""
read -p "現在要啟動開發伺服器嗎？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npm start
fi
