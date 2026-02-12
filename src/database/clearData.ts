// 清除所有測試數據
import { database } from './index';

export async function clearAllData() {
  try {
    console.log('🗑️  開始清除所有數據...');

    await database.write(async () => {
      // 清除所有表的數據
      const tables = [
        'profiles',
        'cached_items',
        'cards',
        'review_history',
        'sync_metadata',
      ];

      for (const tableName of tables) {
        const collection = database.get(tableName);
        const records = await collection.query().fetch();
        
        console.log(`  刪除 ${tableName}: ${records.length} 條記錄`);
        
        for (const record of records) {
          await record.destroyPermanently();
        }
      }
    });

    console.log('✅ 所有數據已清除！');
    return { success: true };
  } catch (error) {
    console.error('❌ 清除數據失敗:', error);
    return { success: false, error };
  }
}

// 只清除測試數據（保留用戶創建的數據）
export async function clearTestDataOnly() {
  try {
    console.log('🗑️  開始清除測試數據...');

    await database.write(async () => {
      // 刪除測試用戶
      const profiles = database.get('profiles');
      const testProfiles = await profiles.query().fetch();
      
      for (const profile of testProfiles) {
        if (profile.userId === 'test-user-001' || profile.userId === 'demo-user') {
          console.log(`  刪除測試 profile: ${profile.userId}`);
          
          // 刪除相關的快取項目
          const cachedItems = database.get('cached_items');
          const userItems = await cachedItems
            .query()
            .fetch();
          
          for (const item of userItems) {
            if (item.userId === profile.userId) {
              await item.destroyPermanently();
            }
          }
          
          // 刪除相關的卡片
          const cards = database.get('cards');
          const userCards = await cards
            .query()
            .fetch();
          
          for (const card of userCards) {
            if (card.userId === profile.userId) {
              await card.destroyPermanently();
            }
          }
          
          // 刪除相關的複習歷史
          const reviewHistory = database.get('review_history');
          const userReviews = await reviewHistory
            .query()
            .fetch();
          
          for (const review of userReviews) {
            if (review.userId === profile.userId) {
              await review.destroyPermanently();
            }
          }
          
          // 刪除 profile
          await profile.destroyPermanently();
        }
      }
    });

    console.log('✅ 測試數據已清除！');
    return { success: true };
  } catch (error) {
    console.error('❌ 清除測試數據失敗:', error);
    return { success: false, error };
  }
}
