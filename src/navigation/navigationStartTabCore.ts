export interface ResolveInitialTabIndexParams {
  startTutorialOnMount?: boolean;
  hasCacheItems?: boolean;
  initialTabIndexProp?: number;
}

export function resolveInitialTabIndex(params: ResolveInitialTabIndexParams): number {
  if (params.startTutorialOnMount) return 1;
  if (typeof params.initialTabIndexProp === 'number') return params.initialTabIndexProp;
  if (params.hasCacheItems) return 1;
  return 0;
}
