/**
 * Structured details about why an Edge Function call failed.
 *
 * The server always says why it refused a request in the JSON body
 * (`reason`, `paywallType`, `planType`). Error messages lose that once they are
 * flattened to strings, so the client copies these fields onto the thrown Error
 * and errorTranslation reads them first.
 *
 * Pure module (no React Native / Supabase imports) so it can be unit tested.
 */

/** A failure that happened on the device before any server answer arrived. */
export type ClientFailure = 'network' | 'timeout';

export type EdgeErrorInfo = {
  status: number | null;
  reason: string | null;
  paywallType: string | null;
  planType: string | null;
  clientFailure: ClientFailure | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Reads the structured fields from a non-2xx Edge Function response. */
export function readEdgeErrorBody(
  status: number,
  parsedBody: unknown
): EdgeErrorInfo {
  const body =
    parsedBody && typeof parsedBody === 'object'
      ? (parsedBody as Record<string, unknown>)
      : {};
  return {
    status,
    reason: readString(body.reason),
    paywallType: readString(body.paywallType),
    planType: readString(body.planType),
    clientFailure: null,
  };
}

/** Copies the non-empty fields of `info` onto `error` and returns it. */
export function attachEdgeErrorInfo<T extends Error>(
  error: T,
  info: Partial<EdgeErrorInfo> | null | undefined
): T {
  if (!info) return error;
  const target = error as T & Partial<EdgeErrorInfo>;
  if (typeof info.status === 'number') target.status = info.status;
  if (info.reason) target.reason = info.reason;
  if (info.paywallType) target.paywallType = info.paywallType;
  if (info.planType) target.planType = info.planType;
  if (info.clientFailure) target.clientFailure = info.clientFailure;
  return error;
}
