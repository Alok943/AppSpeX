import {
  RateLimitError,
  ProviderServerError,
  ProviderRequestError,
} from "@/lib/gateway/types";

/** Rough token estimate when a provider omits usage data (~4 chars/token). */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/** Map an HTTP error status to the right (retryable vs not) error subtype. */
export function throwForStatus(status: number, detail: string): never {
  if (status === 429) throw new RateLimitError(`429 rate limited: ${detail}`);
  if (status >= 500) throw new ProviderServerError(`${status} server error: ${detail}`);
  throw new ProviderRequestError(`${status} request error: ${detail}`);
}

/** Read a short slice of an error body without throwing. */
export async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
