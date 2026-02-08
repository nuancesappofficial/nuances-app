import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

export default function AddCacheItemScreen({ onClose, onSaved }: Props) {
  const [contentType, setContentType] = React.useState<
    'text' | 'url' | 'image' | 'video'
  >('text');
  const [contentText, setContentText] = React.useState('');
  const [contentUrl, setContentUrl] = React.useState('');
  const [keywords, setKeywords] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    if (!contentText && !contentUrl) {
      Alert.alert('錯誤', '請輸入內容或 URL');
      return;
    }

    setSaving(true);

    try {
      const collection = database.get<CachedItem>('cached_items');

      await database.write(async () => {
        await collection.create((item) => {
          item.userId = 'demo-user'; // TODO: Replace with actual user ID
          item.contentType = contentType;
          item.contentText = contentText || undefined;
          item.contentUrl = contentUrl || undefined;
          item.userKeywords = keywords || undefined;
          item.sourceApp = 'Manual Entry';
          item.aiAnalysisCompleted = false;
          item.convertedToCard = false;
          
          // Set expiration for free tier (24 hours)
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          item.expiresAt = expiresAt;
        });
      });

      Alert.alert('成功', '已保存到快取！', [
        {
          text: '確定',
          onPress: () => {
            onSaved();
            onClose();
          },
        },
      ]);
    } catch (error) {
      console.error('Error saving cached item:', error);
      Alert.alert('錯誤', '保存失敗，請重試');
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add to Cache</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.saveButton}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.label}>Content Type</Text>
        <View style={styles.typeSelector}>
          {(['text', 'url', 'image', 'video'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeButton,
                contentType === type && styles.typeButtonActive,
              ]}
              onPress={() => setContentType(type)}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  contentType === type && styles.typeButtonTextActive,
                ]}
              >
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {contentType === 'text' && (
          <>
            <Text style={styles.label}>Content *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="輸入文字內容..."
              value={contentText}
              onChangeText={setContentText}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </>
        )}

        {contentType === 'url' && (
          <>
            <Text style={styles.label}>URL *</Text>
            <TextInput
              style={styles.input}
              placeholder="https://example.com"
              value={contentUrl}
              onChangeText={setContentUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
          </>
        )}

        {(contentType === 'image' || contentType === 'video') && (
          <>
            <Text style={styles.label}>URL or Path *</Text>
            <TextInput
              style={styles.input}
              placeholder="輸入圖片/影片 URL..."
              value={contentUrl}
              onChangeText={setContentUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
            <Text style={styles.hint}>
              提示：實際應用中會使用圖片選擇器
            </Text>
          </>
        )}

        <Text style={styles.label}>
          Keywords (Optional)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="例如：explain grammar, IELTS context"
          value={keywords}
          onChangeText={setKeywords}
          autoCapitalize="none"
        />
        <Text style={styles.hint}>
          添加關鍵字來指導 AI 分析這段內容
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  typeButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 150,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
