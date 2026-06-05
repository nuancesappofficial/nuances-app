import React from 'react';
import { Animated } from 'react-native';

export function useCardDetailPlayback() {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isTtsDownloading, setIsTtsDownloading] = React.useState(false);
  const [pronunciationDownloadTarget, setPronunciationDownloadTarget] = React.useState<string | null>(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const [hasRecorded, setHasRecorded] = React.useState(false);

  const waveformValues = React.useRef(Array.from({ length: 24 }, () => new Animated.Value(8))).current;
  const recordingRef = React.useRef<any | null>(null);
  const lastRecordingUriRef = React.useRef<string | null>(null);
  const userRecordingSoundRef = React.useRef<any | null>(null);
  const waveformPointerRef = React.useRef(0);
  const ttsDownloadCountRef = React.useRef(0);

  return {
    isPlaying,
    setIsPlaying,
    isTtsDownloading,
    setIsTtsDownloading,
    pronunciationDownloadTarget,
    setPronunciationDownloadTarget,
    isRecording,
    setIsRecording,
    hasRecorded,
    setHasRecorded,
    waveformValues,
    recordingRef,
    lastRecordingUriRef,
    userRecordingSoundRef,
    waveformPointerRef,
    ttsDownloadCountRef,
  };
}
