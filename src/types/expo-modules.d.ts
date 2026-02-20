declare module 'expo-av' {
  export const Audio: any;
}

declare module 'expo-speech' {
  export function stop(): void;
  export function speak(text: string, options?: Record<string, unknown>): void;
}
