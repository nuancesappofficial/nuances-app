import type { AIBreakdownMode } from '@services/settings/userSettings';

export interface AIPersonalizationOptions {
  learningGoal?: 'ielts' | 'casual' | 'professional';
  proficiencyStandard?: string;
  proficiencyLevel?: string;
  domain?: string;
  tone?: string;
  replyLanguage?: 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko' | 'es' | 'fr';
  aiBreakdownMode?: AIBreakdownMode;
}
