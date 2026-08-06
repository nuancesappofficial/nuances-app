export type PronunciationPlanType = 'free' | 'trial' | 'lite' | 'premium';

/**
 * Pronunciation usage is metered by the server across Coach and Quiz.
 * The client must not pre-empt that shared quota for any authenticated plan.
 */
export function canAttemptPronunciationAssessment(
  _planType: PronunciationPlanType
): boolean {
  return true;
}
