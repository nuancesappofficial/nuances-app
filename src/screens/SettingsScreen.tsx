import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  DEFAULT_USER_SETTINGS,
  type UserAppSettings,
  loadUserSettings,
  saveUserSettings,
} from '@services/settings/userSettings';

const PROFICIENCY_LEVEL_OPTIONS: Record<string, string[]> = {
  cefr: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  ielts: ['4.0-5.0', '5.5-6.0', '6.5-7.0', '7.5-8.0', '8.5-9.0'],
  toefl: ['0-45', '46-60', '61-80', '81-100', '101-120'],
  toeic: ['10-250', '255-400', '405-600', '605-780', '785-900', '905-990'],
  gept: ['初級', '中級', '中高級', '高級', '優級'],
};

type Props = {
  navigation: any;
};

type OptionChipProps<T extends string> = {
  label: string;
  value: T;
  selectedValue: T;
  onSelect: (value: T) => void;
};

function OptionChip<T extends string>({
  label,
  value,
  selectedValue,
  onSelect,
}: OptionChipProps<T>) {
  const active = value === selectedValue;
  return (
    <TouchableOpacity
      style={[styles.optionChip, active && styles.optionChipActive]}
      onPress={() => onSelect(value)}
    >
      <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = React.useState<UserAppSettings>(DEFAULT_USER_SETTINGS);
  const [savedSettings, setSavedSettings] = React.useState<UserAppSettings>(DEFAULT_USER_SETTINGS);
  const [saving, setSaving] = React.useState(false);
  const [saveNotice, setSaveNotice] = React.useState('');

  React.useEffect(() => {
    let active = true;
    const hydrate = async () => {
      const loaded = await loadUserSettings();
      if (!active) return;
      setSettings(loaded);
      setSavedSettings(loaded);
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const persist = React.useCallback(async () => {
    setSaving(true);
    try {
      await saveUserSettings(settings);
      setSavedSettings(settings);
      setSaveNotice('已儲存');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  React.useEffect(() => {
    if (!saveNotice) return;
    const timer = setTimeout(() => setSaveNotice(''), 1800);
    return () => clearTimeout(timer);
  }, [saveNotice]);

  const updateSettings = React.useCallback(
    (updater: (prev: UserAppSettings) => UserAppSettings) => {
      const next = updater(settings);
      setSettings(next);
    },
    [settings]
  );

  const hasUnsavedChanges = React.useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [savedSettings, settings]
  );

  const levelOptions = React.useMemo(() => {
    const standard = settings.personalization.proficiencyStandardPreset;
    return PROFICIENCY_LEVEL_OPTIONS[standard] ?? [];
  }, [settings.personalization.proficiencyStandardPreset]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={[styles.savingText, saveNotice ? styles.savedNotice : null]}>
          {saving ? '儲存中...' : saveNotice || (hasUnsavedChanges ? '未儲存' : '')}
        </Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clipboard 模式</Text>
          <View style={styles.row}>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowTitle}>主動偵測剪貼簿</Text>
              <Text style={styles.rowSubtitle}>
                開啟後，回到 App 時會自動讀取剪貼簿（iOS 可能跳貼上授權）。
              </Text>
            </View>
            <Switch
              value={settings.clipboardMode === 'active'}
              onValueChange={(enabled) =>
                updateSettings((prev) => ({
                  ...prev,
                  clipboardMode: enabled ? 'active' : 'passive',
                }))
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>權限模式（測試）</Text>
          <View style={styles.row}>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowTitle}>模擬訂閱模式</Text>
              <Text style={styles.rowSubtitle}>
                開啟=訂閱模式；關閉=訪客模式（會觸發受限提示）。
              </Text>
            </View>
            <Switch
              value={settings.entitlementMode === 'premium'}
              onValueChange={(enabled) =>
                updateSettings((prev) => ({
                  ...prev,
                  entitlementMode: enabled ? 'premium' : 'guest',
                }))
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personalization</Text>

          <Text style={styles.label}>學習目標</Text>
          <View style={styles.optionRow}>
            <OptionChip
              label="IELTS"
              value="ielts"
              selectedValue={settings.personalization.learningGoalPreset}
              onSelect={(value) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, learningGoalPreset: value },
                }))
              }
            />
            <OptionChip
              label="Casual"
              value="casual"
              selectedValue={settings.personalization.learningGoalPreset}
              onSelect={(value) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, learningGoalPreset: value },
                }))
              }
            />
            <OptionChip
              label="Professional"
              value="professional"
              selectedValue={settings.personalization.learningGoalPreset}
              onSelect={(value) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, learningGoalPreset: value },
                }))
              }
            />
            <OptionChip
              label="Other"
              value="custom"
              selectedValue={settings.personalization.learningGoalPreset}
              onSelect={(value) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, learningGoalPreset: value },
                }))
              }
            />
          </View>
          {settings.personalization.learningGoalPreset === 'custom' && (
            <TextInput
              style={styles.input}
              placeholder="例如：商務口說、文法精修..."
              value={settings.personalization.learningGoalCustom}
              onChangeText={(text) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, learningGoalCustom: text },
                }))
              }
            />
          )}

          <Text style={styles.label}>英語能力標準</Text>
          <View style={styles.optionRow}>
            {(
              ['cefr', 'ielts', 'toefl', 'toeic', 'gept', 'custom'] as const
            ).map((value) => (
              <OptionChip
                key={value}
                label={value.toUpperCase()}
                value={value}
                selectedValue={settings.personalization.proficiencyStandardPreset}
                onSelect={(selected) =>
                  updateSettings((prev) => ({
                    ...prev,
                    personalization: {
                      ...prev.personalization,
                      proficiencyStandardPreset: selected,
                      proficiencyLevelPreset:
                        PROFICIENCY_LEVEL_OPTIONS[selected]?.[0] ?? 'custom',
                    },
                  }))
                }
              />
            ))}
          </View>
          {settings.personalization.proficiencyStandardPreset === 'custom' && (
            <TextInput
              style={styles.input}
              placeholder="輸入自訂標準（例如：Cambridge）"
              value={settings.personalization.proficiencyStandardCustom}
              onChangeText={(text) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: {
                    ...prev.personalization,
                    proficiencyStandardCustom: text,
                  },
                }))
              }
            />
          )}

          <Text style={styles.label}>能力值區間</Text>
          {settings.personalization.proficiencyStandardPreset !== 'custom' && (
            <View style={styles.optionRow}>
              {levelOptions.map((value) => (
                <OptionChip
                  key={value}
                  label={value}
                  value={value}
                  selectedValue={settings.personalization.proficiencyLevelPreset}
                  onSelect={(selected) =>
                    updateSettings((prev) => ({
                      ...prev,
                      personalization: {
                        ...prev.personalization,
                        proficiencyLevelPreset: selected,
                        proficiencyLevelCustom: '',
                      },
                    }))
                  }
                />
              ))}
              <OptionChip
                label="Other"
                value="custom"
                selectedValue={settings.personalization.proficiencyLevelPreset}
                onSelect={(selected) =>
                  updateSettings((prev) => ({
                    ...prev,
                    personalization: {
                      ...prev.personalization,
                      proficiencyLevelPreset: selected,
                    },
                  }))
                }
              />
            </View>
          )}
          {(settings.personalization.proficiencyStandardPreset === 'custom' ||
            settings.personalization.proficiencyLevelPreset === 'custom') && (
            <TextInput
              style={styles.input}
              placeholder="輸入你的能力範圍（例如：IELTS 6.5-7.0）"
              value={settings.personalization.proficiencyLevelCustom}
              onChangeText={(text) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: {
                    ...prev.personalization,
                    proficiencyLevelCustom: text,
                  },
                }))
              }
            />
          )}

          <Text style={styles.label}>產業領域</Text>
          <View style={styles.optionRow}>
            <OptionChip
              label="Medical"
              value="medical"
              selectedValue={settings.personalization.domainPreset}
              onSelect={(selected) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, domainPreset: selected },
                }))
              }
            />
            <OptionChip
              label="Tech"
              value="technology"
              selectedValue={settings.personalization.domainPreset}
              onSelect={(selected) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, domainPreset: selected },
                }))
              }
            />
            <OptionChip
              label="Business"
              value="business"
              selectedValue={settings.personalization.domainPreset}
              onSelect={(selected) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, domainPreset: selected },
                }))
              }
            />
            <OptionChip
              label="Other"
              value="custom"
              selectedValue={settings.personalization.domainPreset}
              onSelect={(selected) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, domainPreset: selected },
                }))
              }
            />
          </View>
          {settings.personalization.domainPreset === 'custom' && (
            <TextInput
              style={styles.input}
              placeholder="例如：法律、餐旅、藝術..."
              value={settings.personalization.domainCustom}
              onChangeText={(text) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, domainCustom: text },
                }))
              }
            />
          )}

          <Text style={styles.label}>解釋語氣</Text>
          <View style={styles.optionRow}>
            <OptionChip
              label="簡短"
              value="brief"
              selectedValue={settings.personalization.tonePreset}
              onSelect={(selected) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, tonePreset: selected },
                }))
              }
            />
            <OptionChip
              label="詳細"
              value="detailed"
              selectedValue={settings.personalization.tonePreset}
              onSelect={(selected) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, tonePreset: selected },
                }))
              }
            />
            <OptionChip
              label="Other"
              value="custom"
              selectedValue={settings.personalization.tonePreset}
              onSelect={(selected) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, tonePreset: selected },
                }))
              }
            />
          </View>
          {settings.personalization.tonePreset === 'custom' && (
            <TextInput
              style={styles.input}
              placeholder="例如：考試導向、口語導向..."
              value={settings.personalization.toneCustom}
              onChangeText={(text) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, toneCustom: text },
                }))
              }
            />
          )}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, (!hasUnsavedChanges || saving) && styles.saveButtonDisabled]}
          onPress={() => {
            void persist();
          }}
          disabled={!hasUnsavedChanges || saving}
        >
          <Text style={styles.saveButtonText}>{saving ? '儲存中...' : '儲存設定'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 22,
    color: '#333',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  savingText: {
    width: 70,
    textAlign: 'right',
    fontSize: 12,
    color: '#777',
  },
  savedNotice: {
    color: '#2e7d32',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2f3b4a',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2f3b4a',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#6b7785',
    marginTop: 4,
    lineHeight: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b4958',
    marginTop: 10,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: '#ccd5df',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  optionChipActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e9',
  },
  optionChipText: {
    fontSize: 13,
    color: '#4a5663',
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: '#2e7d32',
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#dbe2ea',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#2f3b4a',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  saveButton: {
    backgroundColor: '#2e7d32',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9e9e9e',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
