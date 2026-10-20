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

test('CreateCardGhostPreviewSceneUI 必須對齊最新卡片版型與骨架屏狀態', () => {
  const ghostPath = join(__dirname, '../CacheScreenUI/CreateCardGhostPreviewSceneUI.tsx');
  assert.ok(existsSync(ghostPath), 'CreateCardGhostPreviewSceneUI.tsx 必須存在');

  const source = readFileSync(ghostPath, 'utf8');

  // 1. 正面音標行（音標 + 喇叭）
  assert.ok(
    /previewIpaRow/.test(source) && /previewSpeakerBtn/.test(source),
    'Ghost Card 必須包含獨立音標列與喇叭按鈕',
  );

  // 2. 釋義行（詞性 Badge + 釋義）
  assert.ok(
    /previewMeaningRow/.test(source) && /previewPosChip/.test(source),
    'Ghost Card 必須包含詞性 Badge 與釋義橫條',
  );

  // 3. 底部操作列（練發音 Practice 膠囊按鈕 + 3 顆次要操作圖示）
  assert.ok(
    /practiceButton/.test(source) && /secondaryActions/.test(source),
    'Ghost Card 必須包含練發音膠囊與 3 顆次要按鈕操作列',
  );

  // 4. Thinking 骨架佔位區塊
  assert.ok(
    /skeletonIpaLine/.test(source) && /skeletonPracticePill/.test(source),
    'Ghost Card 必須在 thinking 載入期間呈現對齊新版的骨架脈動佔位',
  );

  // 5. 背面章節揭露順序遮罩（搭配詞 -> 近/反義字 -> 例句，杜絕跨章節搶顯）
  assert.ok(
    /showBackCollocation\s*\?\s*1\s*:\s*0/.test(source),
    'Ghost Card 搭配詞區塊必須綁定 showBackCollocation 遮罩',
  );
  assert.ok(
    /showBackSemanticRelations\s*\?\s*1\s*:\s*0/.test(source),
    'Ghost Card 近/反義字區塊必須綁定 showBackSemanticRelations 遮罩',
  );
  assert.ok(
    /showBackExample\s*\?\s*1\s*:\s*0/.test(source),
    'Ghost Card 例句區塊必須綁定 showBackExample 遮罩，防止搶在近/反義字前顯現',
  );
});

test('CreateCardFlow 必須優先呈現 post-crop 裁切後圖片', () => {
  const createCardFlowPath = join(__dirname, '../../../screens/flow/CacheScreenFlow/CreateCardFlow.tsx');
  const source = readFileSync(createCardFlowPath, 'utf8');

  assert.ok(
    /source=\{\{\s*uri:\s*croppedCardImageUri\s*\|\|\s*originalImageUri/.test(source),
    'CreateCardFlow 來源圖片預覽必須優先展示 croppedCardImageUri (post-cropped image)',
  );
});
