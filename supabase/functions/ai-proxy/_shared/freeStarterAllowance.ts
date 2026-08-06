export const FREE_STARTER_CARD_LIMIT = 20;
export const FREE_STARTER_PRONUNCIATION_LIMIT = 20;

type StarterAction =
  | 'generate_card'
  | 'generate_card_stream'
  | 'generate_card_core_stream'
  | 'generate_card_enrichment_stream'
  | 'pronunciation_assess';

export function getFreeStarterActionDecision(params: {
  planType: 'free' | 'trial' | 'premium';
  action: StarterAction;
  successfulOrProcessingCards: number;
  generationAlreadyReserved: boolean;
  // Lifetime pronunciation usage for free users (independent of the card cap).
  pronunciationUsed?: number;
}): 'allow' | 'reserve' | 'reuse' | 'paywall' {
  if (params.planType !== 'free') return 'allow';
  if (params.generationAlreadyReserved) return 'reuse';
  if (params.action === 'pronunciation_assess') {
    const used = params.pronunciationUsed ?? 0;
    return used >= FREE_STARTER_PRONUNCIATION_LIMIT ? 'paywall' : 'allow';
  }
  if (params.successfulOrProcessingCards >= FREE_STARTER_CARD_LIMIT) {
    return 'paywall';
  }
  return 'reserve';
}
