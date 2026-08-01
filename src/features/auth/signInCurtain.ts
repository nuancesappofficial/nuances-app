export type SignInCurtainState = Readonly<{
  visible: boolean;
  ready: boolean;
}>;

export type SignInCurtainEvent =
  | 'sign-in-started'
  | 'session-ready'
  | 'sign-in-returned'
  | 'sign-in-aborted'
  | 'animation-completed';

export function createHiddenSignInCurtain(): SignInCurtainState {
  return {
    visible: false,
    ready: false,
  };
}

export function transitionSignInCurtain(
  state: SignInCurtainState,
  event: SignInCurtainEvent
): SignInCurtainState {
  switch (event) {
    case 'sign-in-started':
      return {
        visible: true,
        ready: false,
      };
    case 'session-ready':
      return state.visible
        ? {
            visible: true,
            ready: true,
          }
        : state;
    case 'sign-in-returned':
      return state;
    case 'sign-in-aborted':
    case 'animation-completed':
      return createHiddenSignInCurtain();
  }
}
