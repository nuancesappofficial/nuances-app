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
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const hydrate = async () => {
      const loaded = await loadUserSettings();
      if (!active) return;
      setSettings(loaded);
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const persist = React.useCallback(async (next: UserAppSettings) => {
    setSaving(true);
    setSettings(next);
    try {
      await saveUserSettings(next);
    } finally {
      setSaving(false);
    }
  }, []);

  const updateSettings = React.useCallback(
    (updater: (prev: UserAppSettings) => UserAppSettings) => {
      const next = updater(settings);
      void persist(next);
    },
    [persist, settings]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.savingText}>{saving ? '儲存中...' : ''}</Text>
      </View>

      <ScrollView style={styles.content}>
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

          <Text style={styles.label}>CEFR 等級</Text>
          <View style={styles.optionRow}>
            {(['a2', 'b1', 'b2', 'c1', 'custom'] as const).map((value) => (
              <OptionChip
                key={value}
                label={value.toUpperCase()}
                value={value}
                selectedValue={settings.personalization.cefrPreset}
                onSelect={(selected) =>
                  updateSettings((prev) => ({
                    ...prev,
                    personalization: { ...prev.personalization, cefrPreset: selected },
                  }))
                }
              />
            ))}
          </View>
          {settings.personalization.cefrPreset === 'custom' && (
            <TextInput
              style={styles.input}
              placeholder="其他等級描述"
              value={settings.personalization.cefrCustom}
              onChangeText={(text) =>
                updateSettings((prev) => ({
                  ...prev,
                  personalization: { ...prev.personalization, cefrCustom: text },
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
  content: {
    flex: 1,
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
});
