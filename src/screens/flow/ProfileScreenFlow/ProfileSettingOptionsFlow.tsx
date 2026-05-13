import React from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import StickerFontPreview from '../../../components/UI/ProfileScreenUI/StickerFontPreview';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type { DeckAlbum } from '../../../components/UI/DeckScreenUI/deckTypes';
import { buildDeckAlbums, loadDeckAlbumPreferences } from '../../../features/deck/albums';
import {
  DEFAULT_USER_SETTINGS,
  isTTSVoiceCompatibleWithAIReplyLanguage,
  loadUserSettings,
  type MainScreenAlbumGridCount,
  resolveTTSVoiceForLanguage,
  saveUserSettings,
  type AIReplyLanguage,
  type TTSVoice,
  type UserAppSettings,
  withUpdatedTTSVoiceForLanguage,
} from '@services/settings/userSettings';
import { CONTAINER_NEON_GLOW, CONTAINER_NEON_OUTLINE, MODAL_CTA_COLOR, TEXT_ON_CTA, resolveThemeColors } from '../../../theme/colors';
import { STICKER_FONT_OPTIONS, type StickerFontKey } from '../../../theme/stickerFonts';

type SettingOptionKind = 'ai' | 'voice' | 'font' | 'main';

type Props = {
  navigation: any;
  route: {
    params?: {
      kind?: SettingOptionKind;
    };
  };
};

const AI_LANGUAGE_OPTIONS: Array<{ code: AIReplyLanguage; label: string }> = [
  { code: 'zh-TW', label: '繁中' },
  { code: 'zh-CN', label: '简中' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

const TTS_VOICE_OPTIONS: Array<{ code: TTSVoice; label: string }> = [
  { code: 'en-US-JennyNeural', label: 'EN-US Jenny' },
  { code: 'en-US-GuyNeural', label: 'EN-US Guy' },
  { code: 'en-GB-SoniaNeural', label: 'EN-GB Sonia' },
  { code: 'ja-JP-NanamiNeural', label: '日本語 Nanami' },
  { code: 'ko-KR-SunHiNeural', label: '한국어 SunHi' },
  { code: 'zh-TW-HsiaoChenNeural', label: '繁中 曉臻' },
  { code: 'zh-CN-XiaoxiaoNeural', label: '简中 晓晓' },
];

function getTitle(kind: SettingOptionKind): string {
  if (kind === 'ai') return 'Language';
  if (kind === 'voice') return 'Voice';
  if (kind === 'main') return 'Main screen';
  return 'Font';
}

export default function ProfileSettingOptionsFlow({ navigation, route }: Props) {
  const kind = route.params?.kind ?? 'ai';
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = colorScheme === 'light';
  const [settings, setSettings] = React.useState<UserAppSettings>(DEFAULT_USER_SETTINGS);
  const [mainScreenAlbums, setMainScreenAlbums] = React.useState<DeckAlbum[]>([]);

  React.useEffect(() => {
    if (kind !== 'ai' && kind !== 'voice' && kind !== 'font' && kind !== 'main') {
      navigation.goBack();
      return;
    }

    void loadUserSettings()
      .then(setSettings)
      .catch((error) => {
        console.error('[ProfileSettingOptions] load settings failed:', error);
      });
  }, [kind, navigation]);

  React.useEffect(() => {
    if (kind !== 'main') return;
    let cancelled = false;
    void (async () => {
      try {
        const [cards, prefs] = await Promise.all([
          database.get<Card>('cards').query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc)).fetch(),
          loadDeckAlbumPreferences(),
        ]);
        if (cancelled) return;
        setMainScreenAlbums(buildDeckAlbums(cards, {}, prefs));
      } catch (error) {
        console.error('[ProfileSettingOptions] load main screen albums failed:', error);
        if (!cancelled) setMainScreenAlbums([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const visibleTTSVoiceOptions = React.useMemo(
    () =>
      TTS_VOICE_OPTIONS.filter((item) =>
        isTTSVoiceCompatibleWithAIReplyLanguage(item.code, settings.aiReplyLanguage)
      ),
    [settings.aiReplyLanguage]
  );

  const persistSettings = React.useCallback(async (next: UserAppSettings) => {
    await saveUserSettings(next);
    setSettings(next);
  }, []);

  const orderedMainScreenAlbums = React.useMemo(() => {
    const orderIndex = new Map(settings.mainScreenAlbumOrder.map((albumId, index) => [albumId, index]));
    return [...mainScreenAlbums].sort((a, b) => {
      const aOrder = orderIndex.get(a.id);
      const bOrder = orderIndex.get(b.id);
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      const aLatest = a.latestCards[0]?.createdAtMs ?? 0;
      const bLatest = b.latestCards[0]?.createdAtMs ?? 0;
      return bLatest - aLatest;
    });
  }, [mainScreenAlbums, settings.mainScreenAlbumOrder]);

  const handleSelectLanguage = React.useCallback(
    async (language: AIReplyLanguage) => {
      try {
        const nextVoice = resolveTTSVoiceForLanguage(settings, language);
        const nextSettings = withUpdatedTTSVoiceForLanguage(settings, language, nextVoice);
        await persistSettings(nextSettings);
      } catch (error) {
        console.error('[ProfileSettingOptions] update language failed:', error);
        Alert.alert('更新失敗', '無法儲存語言設定，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleSelectVoice = React.useCallback(
    async (voice: TTSVoice) => {
      try {
        const nextSettings = withUpdatedTTSVoiceForLanguage(settings, settings.aiReplyLanguage, voice);
        await persistSettings(nextSettings);
      } catch (error) {
        console.error('[ProfileSettingOptions] update voice failed:', error);
        Alert.alert('更新失敗', '無法儲存語音設定，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleSelectFont = React.useCallback(
    async (fontKey: StickerFontKey) => {
      try {
        const nextSettings = { ...settings, stickerFontKey: fontKey };
        await persistSettings(nextSettings);
      } catch (error) {
        console.error('[ProfileSettingOptions] update sticker font failed:', error);
        Alert.alert('更新失敗', '無法儲存貼紙字體，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleSelectMainScreenAlbumGridCount = React.useCallback(
    async (count: MainScreenAlbumGridCount) => {
      try {
        if (settings.mainScreenAlbumGridCount === count) return;
        await persistSettings({ ...settings, mainScreenAlbumGridCount: count });
      } catch (error) {
        console.error('[ProfileSettingOptions] update main screen grid failed:', error);
        Alert.alert('更新失敗', '無法儲存主畫面格數，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleToggleWordPop = React.useCallback(async () => {
    try {
      await persistSettings({
        ...settings,
        mainScreenWordPopEnabled: !settings.mainScreenWordPopEnabled,
      });
    } catch (error) {
      console.error('[ProfileSettingOptions] update word pop visibility failed:', error);
      Alert.alert('更新失敗', '無法儲存 Word pop 顯示設定，請稍後再試。');
    }
  }, [persistSettings, settings]);

  const handleMoveAlbum = React.useCallback(
    async (albumId: string, direction: 'up' | 'down') => {
      try {
        const albumIds = orderedMainScreenAlbums.map((album) => album.id);
        const currentOrder = [
          ...settings.mainScreenAlbumOrder.filter((id) => albumIds.includes(id)),
          ...albumIds.filter((id) => !settings.mainScreenAlbumOrder.includes(id)),
        ];
        const currentIndex = currentOrder.indexOf(albumId);
        if (currentIndex < 0) return;
        const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex < 0 || nextIndex >= currentOrder.length) return;
        const nextOrder = [...currentOrder];
        [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
        await persistSettings({ ...settings, mainScreenAlbumOrder: nextOrder });
      } catch (error) {
        console.error('[ProfileSettingOptions] update album order failed:', error);
        Alert.alert('更新失敗', '無法儲存相簿順序，請稍後再試。');
      }
    },
    [orderedMainScreenAlbums, persistSettings, settings]
  );

  const rows = React.useMemo(() => {
    if (kind === 'ai') {
      return AI_LANGUAGE_OPTIONS.map((item) => ({
        key: item.code,
        selected: item.code === settings.aiReplyLanguage,
        content: <Text style={[styles.settingLabel, { color: palette.textOnContainer }]}>{item.label}</Text>,
        onPress: () => void handleSelectLanguage(item.code),
      }));
    }

    if (kind === 'voice') {
      return visibleTTSVoiceOptions.map((item) => ({
        key: item.code,
        selected: item.code === resolveTTSVoiceForLanguage(settings, settings.aiReplyLanguage),
        content: <Text style={[styles.settingLabel, { color: palette.textOnContainer }]}>{item.label}</Text>,
        onPress: () => void handleSelectVoice(item.code),
      }));
    }

    if (kind === 'font') {
      return STICKER_FONT_OPTIONS.map((item) => ({
      key: item.key,
      selected: item.key === settings.stickerFontKey,
      content: <StickerFontPreview label="Nuances" fontKey={item.key} />,
      onPress: () => void handleSelectFont(item.key),
      }));
    }

    return [];
  }, [handleSelectFont, handleSelectLanguage, handleSelectVoice, kind, palette.textOnContainer, settings, visibleTTSVoiceOptions]);

  const previewAlbums = orderedMainScreenAlbums.slice(0, settings.mainScreenAlbumGridCount);
  const previewFillerCount = Math.max(0, settings.mainScreenAlbumGridCount - previewAlbums.length);

  if (kind === 'main') {
    return (
      <View style={[styles.root, { backgroundColor: palette.screenBg }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} activeOpacity={0.86} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={20} color={palette.textOnBg} />
              <Text style={[styles.backText, { color: palette.textOnBg }]}>Back</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: palette.textOnBg }]}>Main screen</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={styles.mainScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.mainPreviewCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                },
              ]}
            >
              <View style={styles.mainSectionHeader}>
                <Text style={[styles.mainSectionTitle, { color: palette.textOnContainer }]}>Grid preview</Text>
                <Text style={[styles.mainSectionMeta, { color: palette.secondaryText }]}>
                  {settings.mainScreenAlbumGridCount} per page
                </Text>
              </View>
              <View style={styles.previewGrid}>
                {previewAlbums.map((album) => (
                  <View key={`preview-${album.id}`} style={styles.previewAlbumCell}>
                    <View
                      style={[
                        styles.previewAlbumCover,
                        {
                          backgroundColor: album.coverImageUri ? palette.modalOptionBg : album.color || palette.modalOptionBg,
                          borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                        },
                      ]}
                    >
                      {album.coverImageUri ? (
                        <Image source={{ uri: album.coverImageUri }} style={styles.previewAlbumImage} resizeMode="cover" />
                      ) : (
                        <Text style={styles.previewAlbumEmoji}>{album.emoji || '📁'}</Text>
                      )}
                    </View>
                    <Text style={[styles.previewAlbumName, { color: palette.textOnContainer }]} numberOfLines={1}>
                      {album.name}
                    </Text>
                  </View>
                ))}
                {Array.from({ length: previewFillerCount }).map((_, index) => (
                  <View key={`preview-filler-${index}`} style={styles.previewAlbumCell}>
                    <View
                      style={[
                        styles.previewAlbumCover,
                        styles.previewAlbumFiller,
                        {
                          backgroundColor: palette.modalOptionBg,
                          borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                        },
                      ]}
                    >
                      <View style={[styles.previewFillerLine, styles.previewFillerLineOne]} />
                      <View style={[styles.previewFillerLine, styles.previewFillerLineTwo]} />
                      <View style={[styles.previewFillerLine, styles.previewFillerLineThree]} />
                      <View style={styles.previewFillerPlusCircle}>
                        <Text style={styles.previewFillerPlusText}>+</Text>
                      </View>
                    </View>
                    <Text style={[styles.previewAlbumName, { color: palette.secondaryText }]} numberOfLines={1}>
                      Empty
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              style={[
                styles.card,
                styles.mainSettingsCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                  shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                  shadowOpacity: isLight ? 0.08 : 0.18,
                },
              ]}
            >
              <View style={styles.mainBlock}>
                <Text style={[styles.mainSectionTitle, { color: palette.textOnContainer }]}>Albums per page</Text>
                <View style={styles.segmentRow}>
                  {([3, 6, 9] as MainScreenAlbumGridCount[]).map((count) => {
                    const active = settings.mainScreenAlbumGridCount === count;
                    return (
                      <Pressable
                        key={`main-count-${count}`}
                        style={({ pressed }) => [
                          styles.segmentButton,
                          {
                            backgroundColor: active ? '#4EAFF4' : palette.modalOptionBg,
                            borderColor: active ? '#4EAFF4' : isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                          },
                          pressed ? styles.pressed : null,
                        ]}
                        onPress={() => void handleSelectMainScreenAlbumGridCount(count)}
                      >
                        <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : palette.textOnContainer }]}>
                          {count}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: isLight ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.32)' }]} />

              <View style={styles.wordPopRow}>
                <View>
                  <Text style={[styles.settingLabel, { color: palette.textOnContainer }]}>Word pop</Text>
                  <Text style={[styles.mainSectionMeta, { color: palette.secondaryText }]}>Show section on main screen</Text>
                </View>
                <Switch
                  value={settings.mainScreenWordPopEnabled}
                  onValueChange={() => void handleToggleWordPop()}
                  trackColor={{ false: palette.modalOptionBg, true: MODAL_CTA_COLOR }}
                  thumbColor={TEXT_ON_CTA}
                  ios_backgroundColor={palette.modalOptionBg}
                />
              </View>
            </View>

            <View
              style={[
                styles.card,
                styles.mainSettingsCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                  shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                  shadowOpacity: isLight ? 0.08 : 0.18,
                },
              ]}
            >
              <View style={styles.mainBlock}>
                <Text style={[styles.mainSectionTitle, { color: palette.textOnContainer }]}>Album sequence</Text>
              </View>
              {orderedMainScreenAlbums.map((album, index) => (
                <React.Fragment key={album.id}>
                  <View style={styles.sequenceRow}>
                    <View style={styles.sequenceIdentity}>
                      <View style={[styles.sequenceIcon, { backgroundColor: album.color || palette.modalOptionBg }]}>
                        <Text style={styles.sequenceEmoji}>{album.emoji || '📁'}</Text>
                      </View>
                      <Text style={[styles.settingLabel, { color: palette.textOnContainer }]} numberOfLines={1}>
                        {album.name}
                      </Text>
                    </View>
                    <View style={styles.sequenceControls}>
                      <TouchableOpacity
                        style={[styles.reorderButton, index === 0 ? styles.reorderButtonDisabled : null]}
                        disabled={index === 0}
                        onPress={() => void handleMoveAlbum(album.id, 'up')}
                      >
                        <Ionicons name="chevron-up" size={18} color={palette.textOnContainer} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.reorderButton, index === orderedMainScreenAlbums.length - 1 ? styles.reorderButtonDisabled : null]}
                        disabled={index === orderedMainScreenAlbums.length - 1}
                        onPress={() => void handleMoveAlbum(album.id, 'down')}
                      >
                        <Ionicons name="chevron-down" size={18} color={palette.textOnContainer} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {index < orderedMainScreenAlbums.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: isLight ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.32)' }]} />
                  ) : null}
                </React.Fragment>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.screenBg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.86} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={palette.textOnBg} />
            <Text style={[styles.backText, { color: palette.textOnBg }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: palette.textOnBg }]}>{getTitle(kind)}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.containerBg,
              borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
              shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
              shadowOpacity: isLight ? 0.08 : 0.18,
            },
          ]}
        >
          {rows.map((row, index) => (
            <React.Fragment key={row.key}>
              <TouchableOpacity style={styles.row} activeOpacity={0.9} onPress={row.onPress}>
                {row.content}
                {row.selected ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={palette.textOnContainer}
                    style={styles.rowIcon}
                  />
                ) : null}
              </TouchableOpacity>
              {index < rows.length - 1 ? (
                <View
                  style={[
                    styles.divider,
                    { backgroundColor: isLight ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.32)' },
                  ]}
                />
              ) : null}
            </React.Fragment>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    marginTop: 8,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 64,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  headerSpacer: {
    minWidth: 64,
  },
  card: {
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
  },
  row: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowIcon: {
    width: 20,
    textAlign: 'right',
    marginLeft: 12,
  },
  divider: {
    height: 1,
    marginHorizontal: 14,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 34,
    gap: 16,
  },
  mainPreviewCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  mainSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mainSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  mainSectionMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  previewAlbumCell: {
    width: '31%',
  },
  previewAlbumCover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewAlbumImage: {
    width: '100%',
    height: '100%',
  },
  previewAlbumEmoji: {
    fontSize: 24,
  },
  previewAlbumFiller: {
    position: 'relative',
  },
  previewFillerLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(78,175,244,0.16)',
  },
  previewFillerLineOne: {
    top: 28,
    opacity: 0.52,
  },
  previewFillerLineTwo: {
    top: 44,
    opacity: 0.34,
  },
  previewFillerLineThree: {
    top: 60,
    opacity: 0.22,
  },
  previewFillerPlusCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4EAFF4',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  previewFillerPlusText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '700',
    marginTop: -2,
  },
  previewAlbumName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
  },
  mainSettingsCard: {
    marginTop: 0,
    marginHorizontal: 0,
  },
  mainBlock: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  segmentRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 16,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  wordPopRow: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  sequenceRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sequenceIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sequenceIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sequenceEmoji: {
    fontSize: 18,
  },
  sequenceControls: {
    flexDirection: 'row',
    gap: 4,
  },
  reorderButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderButtonDisabled: {
    opacity: 0.3,
  },
});
