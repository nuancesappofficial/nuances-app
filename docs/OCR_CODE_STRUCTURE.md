# OCR 和圖片標註功能程式碼架構

**完整流程：** 上傳圖片 → 標註 → OCR 識別 → AI 分析 → 創建卡片

---

## 📁 核心文件清單

### 1. 圖片標註 UI 組件
**文件：** `src/components/ImageAnnotation.tsx` (418 行)
**作用：** 提供手指繪製 Bounding Box 的互動介面

### 2. OCR 服務
**文件：** `src/services/ocr/ocrService.ts` (196 行)
**作用：** 使用 OpenAI Vision API 提取圖片文字

### 3. 圖片上傳畫面
**文件：** `src/screens/AddCacheItemScreen.tsx` (525 行)
**作用：** 處理圖片選擇、上傳、觸發標註工具

### 4. 卡片創建畫面
**文件：** `src/screens/CreateCardScreen.tsx` (559 行)
**作用：** 觸發 OCR、AI 分析、生成學習卡片

### 5. OpenAI API 服務
**文件：** `src/services/ai/openaiService.ts` (246 行)
**作用：** 統一的 OpenAI API 調用接口

---

## 🎯 完整流程圖

```
用戶操作
    ↓
[AddCacheItemScreen.tsx]
    - pickImage() / takePhoto()
    - 設置 selectedImage
    - 自動開啟標註工具
    ↓
[ImageAnnotation.tsx]
    - 顯示圖片
    - PanResponder 捕獲觸控
    - 繪製 Bounding Box
    - 保存標註座標
    ↓
返回 [AddCacheItemScreen.tsx]
    - 保存到 WatermelonDB
    - imageAnnotations: JSON
    ↓
用戶點擊「創建卡片」
    ↓
[CreateCardScreen.tsx]
    - performAnalysis()
    - 判斷是否有標註
    ↓
[ocrService.ts]
    - extractTextFromAnnotations()
    - 或 extractTextFromImage()
    ↓
[openaiService.ts]
    - callOpenAI()
    - Vision API 提取文字
    ↓
返回 [CreateCardScreen.tsx]
    - AI 分析文字
    - 生成定義、音標、標籤
    - 創建學習卡片
```

---

## 📄 1. ImageAnnotation.tsx

**位置：** `src/components/ImageAnnotation.tsx`

### 主要功能區塊：

#### A. State 管理 (第 32-45 行)
```typescript
const [annotations, setAnnotations] = useState<BoundingBox[]>([]);
const [currentBox, setCurrentBox] = useState<{...} | null>(null);
const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
const [isDrawing, setIsDrawing] = useState(false);
```

**作用：**
- `annotations`: 已完成的標註列表
- `currentBox`: 正在繪製的框（開始和當前座標）
- `imageSize`: 圖片原始尺寸
- `containerSize`: 顯示容器尺寸（用於計算相對座標）
- `isDrawing`: 是否在標註模式

---

#### B. PanResponder 觸控處理 (第 47-111 行)

**1. 開始觸控 (onPanResponderGrant)**
```typescript
onPanResponderGrant: (evt) => {
  if (!isDrawing) return;
  const { locationX, locationY } = evt.nativeEvent;
  setCurrentBox({
    startX: locationX,
    startY: locationY,
    currentX: locationX,
    currentY: locationY,
  });
}
```
**作用：** 記錄拖動起始點

**2. 拖動中 (onPanResponderMove)**
```typescript
onPanResponderMove: (evt) => {
  if (!isDrawing || !currentBox) return;
  const { locationX, locationY } = evt.nativeEvent;
  setCurrentBox({
    ...currentBox,
    currentX: locationX,
    currentY: locationY,
  });
}
```
**作用：** 實時更新當前座標（藍色虛線框跟隨）

**3. 放開觸控 (onPanResponderRelease)**
```typescript
onPanResponderRelease: () => {
  // 計算相對座標（0-1）
  const relativeBox: BoundingBox = {
    id: Date.now().toString(),
    x: Math.min(currentBox.startX, currentBox.currentX) / containerSize.width,
    y: Math.min(currentBox.startY, currentBox.currentY) / containerSize.height,
    width: Math.abs(currentBox.currentX - currentBox.startX) / containerSize.width,
    height: Math.abs(currentBox.currentY - currentBox.startY) / containerSize.height,
  };
  
  // 過濾太小的框
  if (relativeBox.width > 0.02 && relativeBox.height > 0.02) {
    setAnnotations([...annotations, relativeBox]);
    onAnnotationsChange([...annotations, relativeBox]);
  }
}
```
**作用：** 
- 轉換像素座標為相對座標（0-1 範圍）
- 過濾太小的框（< 2% 容器大小）
- 保存到 annotations 列表

---

#### C. UI 渲染 (第 143-280 行)

**1. 工具列 (第 143-170 行)**
```typescript
<View style={styles.toolbar}>
  <TouchableOpacity onPress={() => setIsDrawing(!isDrawing)}>
    <Text>{isDrawing ? '✏️ 標註中' : '✏️ 開始標註'}</Text>
  </TouchableOpacity>
  {annotations.length > 0 && (
    <TouchableOpacity onPress={clearAll}>
      <Text>🗑️ 清除全部</Text>
    </TouchableOpacity>
  )}
  <Text>{annotations.length} 個標註</Text>
</View>
```
**作用：** 控制標註模式、清除、顯示計數

**2. 圖片容器 (第 172-193 行)**
```typescript
<View style={styles.imageContainer} onLayout={(e) => {
  const { width, height } = e.nativeEvent.layout;
  setContainerSize({ width, height });
}}>
  <Image source={{ uri: imageUri }} />
</View>
```
**作用：** 顯示圖片並記錄容器尺寸

**3. 標註覆蓋層 (第 195-252 行)**
```typescript
<View style={styles.annotationOverlay} {...panResponder.panHandlers}>
  {/* 已完成的標註 - 綠色框 */}
  {annotations.map((box) => (
    <View style={[styles.boundingBox, {...計算位置}]} />
  ))}
  
  {/* 正在繪製的框 - 藍色虛線框 */}
  {currentBox && isDrawing && (
    <View style={[styles.drawingBox, {...計算位置}]} />
  )}
</View>
```
**作用：** 
- 渲染所有標註框
- 實時顯示正在繪製的框

---

## 📄 2. ocrService.ts

**位置：** `src/services/ocr/ocrService.ts`

### 主要功能：

#### A. 全圖 OCR (第 24-89 行)

```typescript
export async function extractTextFromImage(
  imageUri: string
): Promise<OCRResult> {
  // 1. 檢查 OpenAI 配置
  if (!isOpenAIConfigured()) {
    return mockOCR();
  }

  // 2. 將圖片轉 base64
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: 'base64',
  });

  // 3. 調用 OpenAI Vision API
  const response = await callOpenAI(
    [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Extract ALL text from this image. Return ONLY a JSON object...`
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64}`,
          },
        },
      ],
    }],
    {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1000,
    }
  );

  // 4. 解析 JSON 結果
  const result = JSON.parse(response);
  return {
    fullText: result.fullText || '',
    confidence: result.confidence || 0.9,
  };
}
```

**作用：**
- 提取整張圖片的所有文字
- 使用 GPT-4o-mini Vision API
- 返回文字和信心度

---

#### B. 標註區域 OCR (第 95-146 行)

```typescript
export async function extractTextFromRegion(
  imageUri: string,
  boundingBox: {x, y, width, height}  // 相對座標 0-1
): Promise<string> {
  // 1. 裁剪圖片到指定區域
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
  
  const croppedImage = await manipulateAsync(
    imageUri,
    [{
      crop: {
        originX: boundingBox.x * imageWidth,
        originY: boundingBox.y * imageHeight,
        width: boundingBox.width * imageWidth,
        height: boundingBox.height * imageHeight,
      },
    }],
    { compress: 0.8, format: SaveFormat.JPEG }
  );

  // 2. 對裁剪後的圖片進行 OCR
  const result = await extractTextFromImage(croppedImage.uri);
  return result.fullText;
}
```

**作用：**
- 根據 Bounding Box 裁剪圖片
- 只對選定區域進行 OCR
- 提高識別精確度

---

#### C. 批量處理標註 (第 152-175 行)

```typescript
export async function extractTextFromAnnotations(
  imageUri: string,
  annotations: Array<{id, x, y, width, height}>
): Promise<Array<{id, text}>> {
  const results = await Promise.all(
    annotations.map(async (annotation) => {
      const text = await extractTextFromRegion(imageUri, annotation);
      return { id: annotation.id, text };
    })
  );
  return results;
}
```

**作用：**
- 並行處理多個標註區域
- 返回每個區域的識別文字
- 保留區域 ID 對應關係

---

## 📄 3. CreateCardScreen.tsx

**位置：** `src/screens/CreateCardScreen.tsx`

### 關鍵功能：觸發 OCR

#### OCR 處理邏輯 (第 46-102 行)

```typescript
const performAnalysis = async () => {
  setAnalyzing(true);
  
  try {
    let textToAnalyze = cachedItem.contentText || '';

    // 【重點】如果是圖片類型，先進行 OCR
    if (cachedItem.contentType === 'image' && cachedItem.imageStoragePath) {
      console.log('[CreateCard] Performing OCR on image');
      
      // 檢查 OpenAI 配置
      if (!isOCRAvailable()) {
        Alert.alert('需要 OpenAI API', '圖片文字識別需要 OpenAI API 金鑰...');
        return;
      }

      // 解析標註數據
      const annotations = cachedItem.imageAnnotations 
        ? JSON.parse(cachedItem.imageAnnotations)
        : [];

      if (annotations.length > 0) {
        // 【有標註】提取標註區域的文字
        console.log(`[CreateCard] Extracting text from ${annotations.length} annotations`);
        const results = await extractTextFromAnnotations(
          cachedItem.imageStoragePath,
          annotations
        );
        
        // 合併所有區域的文字
        textToAnalyze = results
          .map((r) => r.text)
          .filter((t) => t.trim())
          .join(' ');
        
        console.log('[CreateCard] Extracted text from annotations:', textToAnalyze);
      } else {
        // 【無標註】提取整張圖片的文字
        console.log('[CreateCard] Extracting text from full image');
        const ocrResult = await extractTextFromImage(cachedItem.imageStoragePath);
        textToAnalyze = ocrResult.fullText;
        
        console.log('[CreateCard] Extracted text from image:', textToAnalyze);
      }

      // 檢查是否識別到文字
      if (!textToAnalyze.trim()) {
        Alert.alert('未識別到文字', '圖片中未識別到任何文字...');
        return;
      }
    }

    // OCR 完成後，繼續 AI 分析
    const analysis = await analyzeText(
      textToAnalyze,
      cachedItem.userKeywords,
      'ielts'
    );
    
    // 填入分析結果
    setTargetWord(analysis.suggestedWord);
    setDefinition(analysis.definition);
    // ...
  } catch (error) {
    console.error('Analysis error:', error);
  } finally {
    setAnalyzing(false);
  }
};
```

**作用：**
1. 判斷是否為圖片類型
2. 檢查是否有標註
3. 有標註：提取標註區域 → 批量 OCR
4. 無標註：提取全圖 → 單次 OCR
5. 合併識別文字
6. 傳給 AI 分析生成定義

---

## 📄 4. AddCacheItemScreen.tsx

**位置：** `src/screens/AddCacheItemScreen.tsx`

### 圖片上傳與標註觸發

#### A. 選擇圖片 (第 36-61 行)

```typescript
const pickImage = async () => {
  // 1. 請求權限
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('權限需求', '需要相簿權限...');
    return;
  }

  // 2. 啟動圖片選擇器
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,  // 不預裁剪
    quality: 1,           // 高品質以利 OCR
  });

  if (!result.canceled && result.assets[0]) {
    // 3. 保存圖片 URI
    setSelectedImage(result.assets[0].uri);
    setContentUrl(result.assets[0].uri);
    setContentType('image');
    
    // 4. 自動開啟標註工具
    setTimeout(() => {
      setShowAnnotationTool(true);
    }, 300);
  }
};
```

**作用：**
- 請求相簿權限
- 選擇圖片（高品質、不裁剪）
- 自動彈出標註工具

---

#### B. 標註工具 Modal (第 310-346 行)

```typescript
<Modal
  visible={showAnnotationTool}
  animationType="slide"
  onRequestClose={() => setShowAnnotationTool(false)}
  presentationStyle="fullScreen"
>
  <View style={styles.modalContainer}>
    <View style={styles.modalHeader}>
      <TouchableOpacity onPress={() => {
        console.log('[AddCache] Closing annotation tool, annotations:', imageAnnotations.length);
        setShowAnnotationTool(false);
      }}>
        <Text>✓ 完成</Text>
      </TouchableOpacity>
      <Text>{imageAnnotations.length} 個</Text>
    </View>

    {selectedImage && (
      <ImageAnnotation
        imageUri={selectedImage}
        onAnnotationsChange={(annotations) => {
          console.log('[AddCache] Annotations updated:', annotations.length);
          setImageAnnotations(annotations);
        }}
        initialAnnotations={imageAnnotations}
      />
    )}
  </View>
</Modal>
```

**作用：**
- 全屏 Modal 顯示標註工具
- 實時更新標註數據
- 關閉時保留標註

---

#### C. 保存標註數據 (第 112-138 行)

```typescript
const performSave = async () => {
  try {
    await database.write(async () => {
      await collection.create((item) => {
        item.contentType = contentType;
        
        // 【重點】保存圖片標註（JSON 字串）
        if (imageAnnotations.length > 0) {
          item.imageAnnotations = JSON.stringify(imageAnnotations);
        }
        
        // 保存圖片路徑
        if (selectedImage) {
          item.imageStoragePath = selectedImage;
        }
        
        // 其他欄位...
      });
    });
  } catch (error) {
    console.error('Error saving cached item:', error);
  }
};
```

**作用：**
- 將標註座標序列化為 JSON
- 保存到 WatermelonDB
- `imageAnnotations` 欄位：`"[{id, x, y, width, height}, ...]"`

---

## 🔗 數據流向

### 1. 上傳階段
```
AddCacheItemScreen
    ↓
selectedImage (URI)
imageAnnotations (BoundingBox[])
    ↓
WatermelonDB CachedItem
    - imageStoragePath: "file:///.../image.jpg"
    - imageAnnotations: "[{id: '1', x: 0.2, y: 0.3, width: 0.4, height: 0.3}]"
```

### 2. OCR 階段
```
CreateCardScreen
    ↓
讀取 cachedItem.imageAnnotations
    ↓
JSON.parse() → BoundingBox[]
    ↓
ocrService.extractTextFromAnnotations()
    ↓
    對每個 BoundingBox:
    1. 裁剪圖片
    2. 轉 base64
    3. OpenAI Vision API
    4. 返回文字
    ↓
合併所有文字
    ↓
AI analyzeText()
    ↓
生成卡片定義
```

---

## 🎯 關鍵技術點

### 1. 座標系統
```typescript
// 像素座標（觸控事件）
locationX: 150, locationY: 200

// 轉換為相對座標（0-1 範圍）
x: locationX / containerWidth = 0.38
y: locationY / containerHeight = 0.29

// 保存相對座標到資料庫
// 任何螢幕尺寸都能正確還原
```

### 2. 圖片處理流程
```
原始圖片 (file:///...)
    ↓
1. ImageAnnotation: 顯示並標註
2. 保存標註座標 (相對座標)
    ↓
3. CreateCard: 讀取標註
4. expo-image-manipulator: 裁剪區域
    ↓
5. FileSystem: 轉 base64
6. OpenAI Vision API: 識別文字
    ↓
7. AI Service: 分析生成定義
8. 創建學習卡片
```

### 3. OpenAI Vision API 調用
```typescript
callOpenAI([{
  role: 'user',
  content: [
    { type: 'text', text: 'Extract ALL text...' },
    { 
      type: 'image_url', 
      image_url: { url: 'data:image/jpeg;base64,...' }
    }
  ]
}], {
  model: 'gpt-4o-mini',  // 支援 vision
  temperature: 0.3,       // 低溫度提高準確性
})
```

---

## 📊 完整文件結構

```
src/
├── components/
│   └── ImageAnnotation.tsx          ← 標註 UI (418 行)
│       - PanResponder 觸控處理
│       - 繪製 Bounding Box
│       - 座標轉換
│
├── screens/
│   ├── AddCacheItemScreen.tsx      ← 上傳圖片 (525 行)
│   │   - pickImage()
│   │   - 觸發標註 Modal
│   │   - 保存標註數據
│   │
│   └── CreateCardScreen.tsx        ← 創建卡片 (559 行)
│       - performAnalysis()
│       - 觸發 OCR
│       - AI 分析
│
└── services/
    ├── ocr/
    │   ├── ocrService.ts           ← OCR 核心 (196 行)
    │   │   - extractTextFromImage()
    │   │   - extractTextFromRegion()
    │   │   - extractTextFromAnnotations()
    │   │
    │   └── index.ts                ← 導出接口
    │
    └── ai/
        └── openaiService.ts        ← OpenAI API (246 行)
            - callOpenAI()
            - Vision API 調用
```

---

## 🔍 調試位置

如果要調試特定問題，查看這些位置：

### 問題 1：標註框顯示問題
**文件：** `ImageAnnotation.tsx`
**查看：** 第 239-252 行（渲染邏輯）
**Console：** `[ImageAnnotation] Touch start/move/end`

### 問題 2：OCR 識別失敗
**文件：** `ocrService.ts`
**查看：** 第 44-75 行（API 調用）
**Console：** `[OCR] Extracting text...`

### 問題 3：標註數據保存問題
**文件：** `AddCacheItemScreen.tsx`
**查看：** 第 112-138 行（保存邏輯）
**Console：** `[AddCache] Annotations updated`

### 問題 4：創建卡片時 OCR 觸發
**文件：** `CreateCardScreen.tsx`
**查看：** 第 46-102 行（OCR 流程）
**Console：** `[CreateCard] Performing OCR...`

---

這就是完整的 OCR 和標註功能的程式碼架構！需要我詳細解釋某個特定部分嗎？🔍
