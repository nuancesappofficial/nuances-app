/**
 * The shipped sign-in surface is normal-mode only.
 *
 * Keep the policy separate from the auth screen so the public entry point
 * cannot be re-enabled accidentally by changing the React Native build flag.
 */
export function isDevTestAccountEntryEnabled(): boolean {
  return false;
}
