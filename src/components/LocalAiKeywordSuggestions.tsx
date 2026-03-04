import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { recommendSmartKeywords } from '../services/ai/smartKeywordRecommender';

function parseKeywordsInput(raw: string): string[] {
  if (!raw.trim()) return [];
  return Array.from(
    new Map(
      raw
        .split(/[,\u3001\n]+/)
        .map((term) => term.trim())
        .filter(Boolean)
        .map((term) => [term.toLowerCase(), term])
    ).values()
  );
}

function toggleKeywordSelection(currentKeywords: string, nextKeyword: string): string {
  const normalizedTarget = nextKeyword.trim().toLowerCase();
  if (!normalizedTarget) return currentKeywords;

  const currentList = parseKeywordsInput(currentKeywords);
  const exists = currentList.some((item) => item.trim().toLowerCase() === normalizedTarget);
  const nextList = exists
    ? currentList.filter((item) => item.trim().toLowerCase() !== normalizedTarget)
    : [...currentList, nextKeyword.trim()];

  return nextList.join(', ');
}

type Props = {
  keywords: string;
  sourceText: string;
  onKeywordsChange: (nextKeywords: string) => void;
  title?: string;
  hint?: string;
};

export default function LocalAiKeywordSuggestions({
  keywords,
  sourceText,
  onKeywordsChange,
  title = 'AI 猜你想問？',
  hint,
}: Props) {
  const editableTerms = React.useMemo(() => parseKeywordsInput(keywords), [keywords]);
  const [suggestedKeywords, setSuggestedKeywords] = React.useState<string[]>([]);
  const [recommendationSource, setRecommendationSource] = React.useState<
    'apple_intelligence' | 'heuristic' | 'empty'
  >('empty');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const loadSuggestions = async () => {
      setLoading(true);
      const result = await recommendSmartKeywords(sourceText, { count: 3 });
      if (!active) return;
      setSuggestedKeywords(result.keywords);
      setRecommendationSource(result.source);
      setLoading(false);
    };

    void loadSuggestions();
    return () => {
      active = false;
    };
  }, [sourceText]);

  if (!loading && suggestedKeywords.length === 0) {
    return null;
  }

  const resolvedHint =
    hint ||
    (recommendationSource === 'apple_intelligence'
      ? `Apple Intelligence 已挑出這句最值得問的 ${suggestedKeywords.length} 個字，你可以點選帶入，也可以直接忽略手動輸入`
      : `本地 AI 已挑出這句最難的 ${suggestedKeywords.length} 個字，你可以點選帶入，也可以直接忽略手動輸入`);
  const sourceLabel =
    recommendationSource === 'apple_intelligence' ? 'Apple Intelligence' : '本地備案';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {!loading && <Text style={styles.sourceBadge}>{sourceLabel}</Text>}
      </View>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#4CAF50" />
          <Text style={styles.loadingText}>正在產生推薦...</Text>
        </View>
      ) : (
        <>
          <Text style={styles.hint}>{resolvedHint}</Text>
          <View style={styles.row}>
            {suggestedKeywords.map((word) => {
              const isSelected = editableTerms.some(
                (term) => term.trim().toLowerCase() === word.trim().toLowerCase()
              );
              return (
                <TouchableOpacity
                  key={word}
                  style={[styles.chip, isSelected && styles.chipActive]}
                  onPress={() => onKeywordsChange(toggleKeywordSelection(keywords, word))}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                    {word}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f3e46',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  loadingText: {
    fontSize: 12,
    color: '#6b7280',
  },
  sourceBadge: {
    fontSize: 11,
    color: '#245c2a',
    backgroundColor: '#e3f5e6',
    borderWidth: 1,
    borderColor: '#b9e2c0',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontWeight: '600',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  chipActive: {
    backgroundColor: '#4CAF50',
  },
  chipText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
});
