declare const Deno: any;

type DependencyState = {
  failures: number;
  openUntil: number;
  probeInFlight: boolean;
  updatedAt: number;
};

type ConcurrencyState = {
  count: number;
  resetAt: number;
};

export class DependencyUnavailableError extends Error {
  readonly reason: 'circuit_open' | 'concurrency_limited';
  readonly retryAfterMs: number;

  constructor(
    dependency: string,
    reason: 'circuit_open' | 'concurrency_limited',
    retryAfterMs: number
  ) {
    super(
      reason === 'circuit_open'
        ? `${dependency} circuit is open`
        : `${dependency} concurrency limit reached`
    );
    this.name = 'DependencyUnavailableError';
    this.reason = reason;
    this.retryAfterMs = Math.max(250, retryAfterMs);
  }
}

const FAILURE_THRESHOLD = Math.max(
  2,
  Number(Deno.env.get('DEPENDENCY_CIRCUIT_FAILURE_THRESHOLD') ?? '5')
);
const OPEN_MS = Math.max(
  5_000,
  Number(Deno.env.get('DEPENDENCY_CIRCUIT_OPEN_MS') ?? '30000')
);
const MAX_CONCURRENCY = Math.max(
  1,
  Number(Deno.env.get('DEPENDENCY_MAX_CONCURRENCY') ?? '40')
);
const LEASE_MS = Math.max(
  5_000,
  Number(Deno.env.get('DEPENDENCY_CONCURRENCY_LEASE_MS') ?? '60000')
);

let kvPromise: Promise<any | null> | null = null;

async function getKv(): Promise<any | null> {
  if (kvPromise) return kvPromise;
  kvPromise = (async () => {
    if (typeof Deno?.openKv !== 'function') return null;
    try {
      return await Deno.openKv();
    } catch (error) {
      console.warn('[dependency-guard] Deno KV unavailable; using timeout-only protection', error);
      return null;
    }
  })();
  return kvPromise;
}

function circuitKey(dependency: string): unknown[] {
  return ['dependency-guard', 'circuit', dependency];
}

function concurrencyKey(dependency: string): unknown[] {
  return ['dependency-guard', 'concurrency', dependency];
}

async function updateWithRetry(
  kv: any,
  key: unknown[],
  mutate: (value: any) => any
): Promise<any> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await kv.get(key);
    const next = mutate(entry.value);
    const result = await kv.atomic().check(entry).set(key, next).commit();
    if (result.ok) return next;
  }
  throw new Error('Dependency guard state contention');
}

async function acquireCircuit(kv: any, dependency: string): Promise<boolean> {
  const now = Date.now();
  const key = circuitKey(dependency);
  let probeAcquired = false;
  await updateWithRetry(kv, key, (raw: DependencyState | null) => {
    const state: DependencyState = raw ?? {
      failures: 0,
      openUntil: 0,
      probeInFlight: false,
      updatedAt: now,
    };
    if (state.openUntil > now) {
      throw new DependencyUnavailableError(
        dependency,
        'circuit_open',
        state.openUntil - now
      );
    }
    if (state.failures >= FAILURE_THRESHOLD) {
      if (state.probeInFlight) {
        throw new DependencyUnavailableError(dependency, 'circuit_open', 1_000);
      }
      probeAcquired = true;
      return { ...state, probeInFlight: true, updatedAt: now };
    }
    return state;
  });
  return probeAcquired;
}

async function releaseProbe(kv: any, dependency: string): Promise<void> {
  const now = Date.now();
  await updateWithRetry(
    kv,
    circuitKey(dependency),
    (raw: DependencyState | null) => ({
      failures: raw?.failures ?? 0,
      openUntil: raw?.openUntil ?? 0,
      probeInFlight: false,
      updatedAt: now,
    })
  );
}

async function acquireConcurrency(kv: any, dependency: string): Promise<void> {
  const now = Date.now();
  await updateWithRetry(
    kv,
    concurrencyKey(dependency),
    (raw: ConcurrencyState | null) => {
      const expired = !raw || raw.resetAt <= now;
      const state: ConcurrencyState = expired
        ? { count: 0, resetAt: now + LEASE_MS }
        : raw;
      if (state.count >= MAX_CONCURRENCY) {
        throw new DependencyUnavailableError(
          dependency,
          'concurrency_limited',
          Math.min(2_000, Math.max(250, state.resetAt - now))
        );
      }
      return {
        count: state.count + 1,
        resetAt: Math.max(state.resetAt, now + LEASE_MS),
      };
    }
  );
}

async function releaseConcurrency(kv: any, dependency: string): Promise<void> {
  const now = Date.now();
  await updateWithRetry(
    kv,
    concurrencyKey(dependency),
    (raw: ConcurrencyState | null) => ({
      count: Math.max(0, (raw?.resetAt ?? 0) <= now ? 0 : (raw?.count ?? 1) - 1),
      resetAt: raw?.resetAt ?? now + LEASE_MS,
    })
  );
}

async function recordResult(
  kv: any,
  dependency: string,
  succeeded: boolean
): Promise<void> {
  const now = Date.now();
  await updateWithRetry(
    kv,
    circuitKey(dependency),
    (raw: DependencyState | null) => {
      if (succeeded) {
        return {
          failures: 0,
          openUntil: 0,
          probeInFlight: false,
          updatedAt: now,
        } satisfies DependencyState;
      }
      const failures = (raw?.failures ?? 0) + 1;
      return {
        failures,
        openUntil: failures >= FAILURE_THRESHOLD ? now + OPEN_MS : 0,
        probeInFlight: false,
        updatedAt: now,
      } satisfies DependencyState;
    }
  );
}

export async function withDependencyGuard<T>(
  dependency: string,
  operation: () => Promise<T>,
  options: { isFailure?: (value: T) => boolean } = {}
): Promise<T> {
  const kv = await getKv();
  if (!kv) return operation();

  const probeAcquired = await acquireCircuit(kv, dependency);
  try {
    await acquireConcurrency(kv, dependency);
  } catch (error) {
    if (probeAcquired) {
      await releaseProbe(kv, dependency).catch(() => undefined);
    }
    throw error;
  }
  let succeeded = false;
  try {
    const value = await operation();
    succeeded = !(options.isFailure?.(value) ?? false);
    return value;
  } finally {
    await Promise.allSettled([
      recordResult(kv, dependency, succeeded),
      releaseConcurrency(kv, dependency),
    ]);
  }
}
