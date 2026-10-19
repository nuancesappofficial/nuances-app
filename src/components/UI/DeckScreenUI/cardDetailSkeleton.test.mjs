import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('CardDetailSkeletonUI 元件必須存在並包含卡片形狀與脈動動畫', () => {
  const skeletonPath = join(__dirname, 'CardDetailSkeletonUI.tsx');
  assert.ok(existsSync(skeletonPath), 'CardDetailSkeletonUI.tsx 必須存在');

  const source = readFileSync(skeletonPath, 'utf8');

  // 1. 脈動動畫檢查：必須使用 Reanimated 的 withRepeat 與 withTiming 驅動 opacity
  assert.ok(
    /withRepeat\s*\(\s*withTiming/.test(source),
    'Skeleton 必須使用 withRepeat(withTiming(...)) 驅動脈動效果',
  );

  // 2. 卡片結構檢查：必須具備如同真實卡片的 detailPaper 結構與圓角
  assert.ok(
    /borderRadius:\s*30/.test(source) || /styles\.detailPaper/.test(source),
    'Skeleton 必須具備與真卡片一致的 30px 圓角外框',
  );

  // 3. 骨架內容區塊檢查：必須包含圖片、單字、標籤與例句區塊
  assert.ok(
    /skeletonMedia|heroMedia/.test(source),
    'Skeleton 必須包含頂部媒體/圖片骨架區塊',
  );
  assert.ok(
    /skeletonWord|skeletonTitle/.test(source),
    'Skeleton 必須包含單字標題骨架區塊',
  );
  // 4. 精確對齊檢查：必須包含頂部滿版媒體 heroMediaWrap 與底部卡片操作列 cardActionRow
  assert.ok(
    /heroMediaWrap/.test(source),
    'Skeleton 必須包含與真卡片一致的頂部媒體 heroMediaWrap 結構',
  );
  assert.ok(
    /cardActionRow/.test(source),
    'Skeleton 必須包含與真卡片一致的底部 4 顆操作列 cardActionRow 結構',
  );
  assert.ok(
    /paddingHorizontal:\s*18/.test(source) || /detailCardScrollContent/.test(source),
    'Skeleton 必須具備與真卡片一致的 18px 水平邊距以確保尺寸完全一致',
  );
});

test('CardDetailFlow 不應再包含死路畫面「找不到這張卡片」', () => {
  const cardDetailPath = join(__dirname, '../../../../src/screens/flow/DeckScreenFlow/CardDetailFlow.tsx');
  const source = readFileSync(cardDetailPath, 'utf8');

  // 斷言：已刪除「找不到這張卡片」
  assert.ok(
    !source.includes('找不到這張卡片'),
    'CardDetailFlow.tsx 不應包含「找不到這張卡片」字樣',
  );

  // 斷言：引入並使用 CardDetailSkeletonUI
  assert.ok(
    source.includes('CardDetailSkeletonUI'),
    'CardDetailFlow.tsx 必須使用 CardDetailSkeletonUI 呈現骨架屏',
  );

  // 斷言：載入完成時平滑過渡（Easing transition）
  assert.ok(
    /skeletonFadeAnim|isSkeletonMounted/.test(source),
    'CardDetailFlow.tsx 必須包含骨架屏平滑淡出 Easing 過渡機制',
  );
});
