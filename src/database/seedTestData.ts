// 測試數據種子腳本 - 用於展示完整的 MVP 功能
import { database } from './index';
import Profile from './models/Profile';
import CachedItem from './models/CachedItem';
import Card from './models/Card';

export async function seedTestData() {
  try {
    console.log('🌱 開始植入測試數據...');

    await database.write(async () => {
      // 1. 創建測試用戶 Profile
      const profilesCollection = database.get<Profile>('profiles');
      const existingProfiles = await profilesCollection.query().fetch();
      
      let profile: Profile;
      if (existingProfiles.length === 0) {
        profile = await profilesCollection.create((p) => {
          p.userId = 'test-user-001';
          p.email = 'test@nuances.app';
          p.displayName = '測試用戶';
          p.learningGoal = 'ielts';
          p.targetLanguage = 'en-US';
          p.nativeLanguage = 'zh-TW';
          p.subscriptionTier = 'free';
        });
        console.log('✅ 創建了測試用戶 Profile');
      } else {
        profile = existingProfiles[0];
        console.log('✅ 使用現有用戶 Profile');
      }

      // 2. 創建測試 Cached Items
      const cachedItemsCollection = database.get<CachedItem>('cached_items');
      const existingItems = await cachedItemsCollection.query().fetch();

      if (existingItems.length === 0) {
        // 文本快取項目
        await cachedItemsCollection.create((item) => {
          item.userId = profile.userId;
          item.contentType = 'text';
          item.contentText = 'The ephemeral nature of cherry blossoms reminds us to appreciate fleeting moments of beauty in our lives.';
          item.sourceApp = 'Safari';
          item.userKeywords = 'ephemeral, fleeting';
          item.aiAnalysisCompleted = true;
          item.aiHighlightedTerms = ['ephemeral', 'fleeting', 'cherry blossoms'];
          item.convertedToCard = true;
        });

        await cachedItemsCollection.create((item) => {
          item.userId = profile.userId;
          item.contentType = 'text';
          item.contentText = 'Despite the arduous journey ahead, she maintained her resilience and optimistic outlook.';
          item.sourceApp = 'Notes';
          item.userKeywords = 'arduous, resilience';
          item.aiAnalysisCompleted = true;
          item.convertedToCard = true;
        });

        await cachedItemsCollection.create((item) => {
          item.userId = profile.userId;
          item.contentType = 'url';
          item.contentUrl = 'https://www.bbc.com/news/science-environment';
          item.contentText = 'Scientists have made a breakthrough in quantum computing...';
          item.sourceApp = 'Chrome';
          item.aiAnalysisCompleted = false;
          item.convertedToCard = false;
        });

        await cachedItemsCollection.create((item) => {
          item.userId = profile.userId;
          item.contentType = 'text';
          item.contentText = 'The ambiguous statement left everyone perplexed about the company\'s future direction.';
          item.userKeywords = 'ambiguous, perplexed';
          item.aiAnalysisCompleted = true;
          item.convertedToCard = false;
        });

        console.log('✅ 創建了 4 個測試 Cached Items');
      }

      // 3. 創建測試 Cards
      const cardsCollection = database.get<Card>('cards');
      const existingCards = await cardsCollection.query().fetch();

      if (existingCards.length === 0) {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

        // 待複習的卡片（已過期）
        await cardsCollection.create((card) => {
          card.userId = profile.userId;
          card.targetWord = 'ephemeral';
          card.targetPhrase = 'ephemeral beauty';
          card.originalSentence = 'The ephemeral nature of cherry blossoms reminds us to appreciate fleeting moments.';
          card.definition = '短暫的；轉瞬即逝的 (lasting for a very short time)';
          card.contextualExplanation = '用來描述持續時間很短、很快就會消失的事物，常用於文學或哲學語境。';
          card.phoneticTranscription = '/ɪˈfem.ər.əl/';
          card.tags = ['IELTS', 'Advanced', 'Literature'];
          card.difficultyLevel = 8;
          card.easeFactor = 2.5;
          card.intervalDays = 1;
          card.repetitions = 1;
          card.nextReviewAt = oneDayAgo; // 需要複習
          card.lastReviewedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        });

        await cardsCollection.create((card) => {
          card.userId = profile.userId;
          card.targetWord = 'resilience';
          card.targetPhrase = 'show resilience';
          card.originalSentence = 'Despite the arduous journey ahead, she maintained her resilience and optimistic outlook.';
          card.definition = '韌性；復原力 (the ability to recover quickly from difficulties)';
          card.contextualExplanation = '指面對困難、壓力或創傷後快速恢復的能力，是心理學和個人發展中的重要概念。';
          card.phoneticTranscription = '/rɪˈzɪl.i.əns/';
          card.tags = ['IELTS', 'Psychology', 'Character'];
          card.difficultyLevel = 7;
          card.easeFactor = 2.5;
          card.intervalDays = 1;
          card.repetitions = 0;
          card.nextReviewAt = oneDayAgo; // 需要複習
        });

        // 未來才需要複習的卡片
        await cardsCollection.create((card) => {
          card.userId = profile.userId;
          card.targetWord = 'arduous';
          card.originalSentence = 'The arduous climb to the summit tested everyone\'s endurance.';
          card.definition = '艱難的；費力的 (involving or requiring strenuous effort; difficult and tiring)';
          card.phoneticTranscription = '/ˈɑːr.dʒu.əs/';
          card.tags = ['IELTS', 'Intermediate'];
          card.difficultyLevel = 6;
          card.easeFactor = 2.5;
          card.intervalDays = 3;
          card.repetitions = 2;
          card.nextReviewAt = threeDaysFromNow; // 3天後複習
          card.lastReviewedAt = now;
        });

        await cardsCollection.create((card) => {
          card.userId = profile.userId;
          card.targetWord = 'serendipity';
          card.originalSentence = 'Finding this book in the old library was pure serendipity.';
          card.definition = '意外發現珍奇事物的運氣 (the occurrence of finding valuable things by chance)';
          card.contextualExplanation = '指偶然間發現有價值或令人愉快事物的幸運經歷。';
          card.phoneticTranscription = '/ˌser.ənˈdɪp.ə.ti/';
          card.tags = ['Advanced', 'Vocabulary'];
          card.difficultyLevel = 8;
          card.easeFactor = 2.5;
          card.intervalDays = 7;
          card.repetitions = 3;
          card.nextReviewAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          card.lastReviewedAt = now;
        });

        await cardsCollection.create((card) => {
          card.userId = profile.userId;
          card.targetWord = 'pragmatic';
          card.originalSentence = 'We need to take a more pragmatic approach to solving this problem.';
          card.definition = '務實的；講求實際的 (dealing with things in a practical way)';
          card.phoneticTranscription = '/præɡˈmæt.ɪk/';
          card.tags = ['IELTS', 'Business', 'Academic'];
          card.difficultyLevel = 6;
          card.easeFactor = 2.5;
          card.intervalDays = 1;
          card.repetitions = 0;
          card.nextReviewAt = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6小時前（需要複習）
        });

        console.log('✅ 創建了 5 張測試 Cards（3張待複習，2張未來複習）');
      }
    });

    console.log('🎉 測試數據植入完成！');
    console.log('');
    console.log('📊 現在您應該能看到：');
    console.log('  📚 快取頁面：4 個項目');
    console.log('  📇 卡片頁面：5 張卡片');
    console.log('  🔴 待複習：3 張卡片');
    console.log('');
    return { success: true };
  } catch (error) {
    console.error('❌ 測試數據植入失敗:', error);
    return { success: false, error };
  }
}
