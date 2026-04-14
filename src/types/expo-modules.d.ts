declare module 'expo-av' {
  export const Audio: any;
}

declare module 'expo-speech' {
  export type SpeechOptions = {
    language?: string;
    pitch?: number;
    rate?: number;
    useApplicationAudioSession?: boolean;
    voice?: string;
    onDone?: () => void;
    onStopped?: () => void;
    onError?: (error: Error) => void;
  };
  export type Voice = {
    identifier: string;
    name: string;
    quality: string;
    language: string;
  };
  export function stop(): Promise<void>;
  export function speak(text: string, options?: SpeechOptions): void;
  export function getAvailableVoicesAsync(): Promise<Voice[]>;
}
