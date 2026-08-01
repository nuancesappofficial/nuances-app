let pendingReset: Promise<void> | null = null;
let releasePendingReset: (() => void) | null = null;

export function beginFreshTestAccountReset(): void {
  pendingReset = new Promise<void>((resolve) => {
    releasePendingReset = resolve;
  });
}

export function finishFreshTestAccountReset(): void {
  releasePendingReset?.();
  releasePendingReset = null;
  pendingReset = null;
}

export async function waitForFreshTestAccountReset(): Promise<void> {
  await pendingReset;
}
