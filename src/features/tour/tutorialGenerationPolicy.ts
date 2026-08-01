export type TutorialGenerationSource = 'bundled-fixture' | 'cloud';

export function resolveTutorialGenerationSource(params: {
  isTutorial: boolean;
  isBundledDemoContent: boolean;
}): TutorialGenerationSource {
  return params.isTutorial && params.isBundledDemoContent
    ? 'bundled-fixture'
    : 'cloud';
}
