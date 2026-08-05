export type RecognizedWordPressAction = 'select' | 'edit';

export function isRecognizedTextEditingAvailable(): boolean {
  return true;
}

export function resolveRecognizedWordPressAction(
  isEditModeActive: boolean
): RecognizedWordPressAction {
  return isEditModeActive ? 'edit' : 'select';
}
