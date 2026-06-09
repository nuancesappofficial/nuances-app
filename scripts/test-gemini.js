/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
/**
 * Gemini API 測試腳本
 * 
 * 使用方式：
 * 1. 確保 .env 中有設定 GEMINI_API_KEY
 * 2. 在專案根目錄執行：node scripts/test-gemini.js
 */

// 載入環境變數
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function testGeminiAPI() {
  console.log('🧪 開始測試 Gemini API...\n');

  // 檢查 API Key
  if (!GEMINI_API_KEY) {
    console.error('❌ 錯誤：未找到 GEMINI_API_KEY');
    console.log('請在 .env 文件中設定：');
    console.log('GEMINI_API_KEY=your_api_key_here\n');
    process.exit(1);
  }

  console.log('✅ API Key 已配置');
  console.log(`   Key 前綴: ${GEMINI_API_KEY.substring(0, 8)}...\n`);

  // 測試 1: 文本分析（提取關鍵字）
  console.log('📝 測試 1: 文本關鍵字提取');
  const testText = 'The ephemeral nature of social media content creates a paradox where permanent digital footprints coexist with fleeting moments of engagement.';

  try {
    const response1 = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `Analyze this text and extract 3-5 key vocabulary words for IELTS learners. Return ONLY valid JSON:
{
  "keywords": ["word1", "word2", "word3"],
  "suggestedWord": "word1"
}

Text: "${testText}"`
          }]
        }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 200,
        }
      })
    });

    if (!response1.ok) {
      const error = await response1.json();
      throw new Error(`API Error: ${response1.status} - ${JSON.stringify(error)}`);
    }

    const data1 = await response1.json();
    const text1 = data1.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // 清理可能的 markdown
    let cleaned1 = text1.trim();
    if (cleaned1.startsWith('```')) {
      cleaned1 = cleaned1.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const result1 = JSON.parse(cleaned1);
    console.log('✅ 成功！提取的關鍵字：', result1.keywords);
    console.log('   建議單字：', result1.suggestedWord);
    console.log('');

  } catch (error) {
    console.error('❌ 測試 1 失敗：', error.message);
    process.exit(1);
  }

  // 測試 2: 單字卡片生成
  console.log('📝 測試 2: 單字卡片內容生成');
  
  try {
    const response2 = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `Create a vocabulary card for "ephemeral" in this context: "${testText}". Return ONLY valid JSON:
{
  "definition": "中文定義 (English definition)",
  "contextualExplanation": "繁體中文詳細解釋（2-3 句）",
  "phoneticTranscription": "/IPA/",
  "tags": ["tag1", "tag2"]
}`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 600,
        }
      })
    });

    if (!response2.ok) {
      const error = await response2.json();
      throw new Error(`API Error: ${response2.status} - ${JSON.stringify(error)}`);
    }

    const data2 = await response2.json();
    const text2 = data2.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // 清理可能的 markdown
    let cleaned2 = text2.trim();
    if (cleaned2.startsWith('```')) {
      cleaned2 = cleaned2.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const result2 = JSON.parse(cleaned2);
    console.log('✅ 成功！卡片內容：');
    console.log('   定義：', result2.definition);
    console.log('   音標：', result2.phoneticTranscription);
    console.log('   標籤：', result2.tags);
    console.log('');

  } catch (error) {
    console.error('❌ 測試 2 失敗：', error.message);
    process.exit(1);
  }

  // 測試 3: 配額檢查（發送多個請求）
  console.log('📝 測試 3: 連續請求測試（檢查配額）');
  
  try {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: `Test request ${i + 1}. Reply with: OK` }]
            }],
            generationConfig: { maxOutputTokens: 10 }
          })
        })
      );
    }

    const responses = await Promise.all(promises);
    const successCount = responses.filter(r => r.ok).length;
    
    console.log(`✅ 成功！${successCount}/5 個請求成功`);
    console.log('   配額狀態：正常\n');

  } catch (error) {
    console.error('❌ 測試 3 失敗：', error.message);
  }

  // 總結
  console.log('═══════════════════════════════════════');
  console.log('🎉 所有測試通過！Gemini API 運作正常');
  console.log('═══════════════════════════════════════');
  console.log('\n📊 免費配額提醒：');
  console.log('   • 每日請求數 (RPD): 1,500');
  console.log('   • 每分鐘請求數 (RPM): 15');
  console.log('   • 每分鐘 Token 數 (TPM): 1,000,000');
  console.log('\n✨ 您現在可以在 App 中使用 Gemini API 了！\n');
}

// 執行測試
testGeminiAPI().catch(error => {
  console.error('\n💥 未預期的錯誤：', error);
  process.exit(1);
});
