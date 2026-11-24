import type { RawPage } from "./types.ts";

const ENDPOINT = "https://api.twitterapi.io/twitter/user/last_tweets";

const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {}

export interface FetchOptions {
  apiKey: string;
  // Stop once this many distinct tweets are in hand.
  targetTweets?: number;
  // Hard cap on paid requests per handle, whatever the pages contain.
  maxRequests?: number;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}

// Pages hold up to 20 tweets and are often shorter, so this follows the
// cursor until there are enough tweets or no pages left. It throws on any
// failure, so a partial run is never returned or cached.
export async function fetchTimeline(handle: string, opts: FetchOptions): Promise<RawPage[]> {
  const { apiKey, targetTweets = 200, maxRequests = 15, fetchImpl = fetch, retryDelayMs = 1000 } = opts;
  const pages: RawPage[] = [];
  const seen = new Set<string>();
  let cursor = "";

  for (let request = 0; request < maxRequests; request++) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("userName", handle);
    url.searchParams.set("includeReplies", "true");
    if (cursor) url.searchParams.set("cursor", cursor);

    const page = await getPage(url, apiKey, fetchImpl, retryDelayMs);
    pages.push(page);

    const before = seen.size;
    for (const t of page.data?.tweets ?? []) seen.add(t.id);

    if (seen.size >= targetTweets) break;
    if (!page.has_next_page || !page.next_cursor) break;
    // A page with nothing new means the cursor has stopped advancing.
    if (seen.size === before && request > 0) break;
    cursor = page.next_cursor;
  }
  return pages;
}

async function getPage(url: URL, apiKey: string, fetchImpl: typeof fetch, retryDelayMs: number): Promise<RawPage> {
  const attempts = 3;
  for (let attempt = 1; ; attempt++) {
    let page: RawPage;
    try {
      // Without a timeout, one stalled connection hangs the whole run.
      const res = await fetchImpl(url, { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if ((res.status === 429 || res.status >= 500) && attempt < attempts) {
        await sleep(retryDelayMs * attempt);
        continue;
      }
      if (!res.ok) throw new ApiError(`HTTP ${res.status}`);
      page = (await res.json()) as RawPage;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // The connection failed, or dropped while the body was being read.
      if (attempt < attempts) {
        await sleep(retryDelayMs * attempt);
        continue;
      }
      throw new ApiError(`network error: ${(err as Error).message}`);
    }
    if (page.status !== "success") {
      throw new ApiError(page.msg ?? page.message ?? "unknown API error");
    }
    return page;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
