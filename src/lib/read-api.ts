/**
 * Read Vercel API responses without leaking raw HTML, trace IDs, or stack traces
 * into the user-facing dashboard. Vercel may return plain text or an error
 * page when a serverless function fails before it sends JSON.
 */
export async function readApiEnvelope<T>(
  response: Response,
  fallback = 'The ASYLUM Dashboard service is temporarily unavailable.'
): Promise<{ data: T; error?: string }> {
  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Some function crashes return plain text or HTML instead of JSON.
    throw new Error(
      `${fallback} (HTTP ${response.status}). Refresh and try again; your previous change is not confirmed.`
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${fallback} (HTTP ${response.status}). Please retry.`);
  }
  const envelope = parsed as { data?: T; error?: unknown };
  if (!response.ok) {
    // The server owns user-visible error wording; do not print internal SQL.
    throw new Error(typeof envelope.error === 'string' && envelope.error.trim() && envelope.error.length <= 300
      ? envelope.error
      : `${fallback} (HTTP ${response.status}). Please retry.`);
  }
  if (!('data' in envelope)) {
    throw new Error(`${fallback} The response is missing its data. Refresh and retry.`);
  }
  return envelope as { data: T; error?: string };
}
