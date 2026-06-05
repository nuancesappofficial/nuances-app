import React from 'react';
import { Animated } from 'react-native';
import type { CloudPhonemeFeedback } from '@services/pronunciation/cloudCoach';

export function useCardDetailPronunciation() {
  const [showFeedback, setShowFeedback] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [pronunciationAnalysisError, setPronunciationAnalysisError] = React.useState<string | null>(null);
  const [pronunciationRevealStep, setPronunciationRevealStep] = React.useState(3);
  const [pronunciationScore, setPronunciationScore] = React.useState<number | null>(null);
  const [pronunciationFeedbackLines, setPronunciationFeedbackLines] = React.useState<string[]>([]);
  const [phonemeFeedback, setPhonemeFeedback] = React.useState<CloudPhonemeFeedback[]>([]);
  const [pronunciationResultsByCardId, setPronunciationResultsByCardId] = React.useState<Record<string, any>>({});
  const [lastRecordingUriByCardId, setLastRecordingUriByCardId] = React.useState<Record<string, string>>({});
  const [showPronunciationModal, setShowPronunciationModal] = React.useState(false);
  const pronunciationTargetCardIdRef = React.useRef<string | null>(null);
  const recordingTransitionRef = React.useRef(false);
  const pronunciationRevealRunIdRef = React.useRef(0);
  const pronunciationModalAnim = React.useRef(new Animated.Value(0)).current;

  return {
    showFeedback,
    setShowFeedback,
    isAnalyzing,
    setIsAnalyzing,
    pronunciationAnalysisError,
    setPronunciationAnalysisError,
    pronunciationRevealStep,
    setPronunciationRevealStep,
    pronunciationScore,
    setPronunciationScore,
    pronunciationFeedbackLines,
    setPronunciationFeedbackLines,
    phonemeFeedback,
    setPhonemeFeedback,
    pronunciationResultsByCardId,
    setPronunciationResultsByCardId,
    lastRecordingUriByCardId,
    setLastRecordingUriByCardId,
    showPronunciationModal,
    setShowPronunciationModal,
    pronunciationTargetCardIdRef,
    recordingTransitionRef,
    pronunciationRevealRunIdRef,
    pronunciationModalAnim,
  };
}
