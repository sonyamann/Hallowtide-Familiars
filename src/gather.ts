import { loadFreshSnapshot, makeSnapshot, saveSnapshot } from "./snapshot.ts";
import { fetchTimeline } from "./twitterapi.ts";
import type { Snapshot } from "./types.ts";

export interface GatherOptions {
  snapshotDir: string;
  apiKey: string | undefined;
  now: Date;
  refresh?: boolean;
  // Called before any paid request; it may throw to stop the fetch.
  beforeFetch?: () => void;
}

export class MissingApiKeyError extends Error {}

// Returns the handle's cached snapshot if it is fresh, otherwise fetches and
// saves a new one. `requests` is the number of paid API calls made.
export async function gatherSnapshot(handle: string, opts: GatherOptions): Promise<{ snapshot: Snapshot; requests: number }> {
  if (!opts.refresh) {
    const cached = loadFreshSnapshot(opts.snapshotDir, handle, opts.now);
    if (cached) return { snapshot: cached, requests: 0 };
  }
  if (!opts.apiKey) throw new MissingApiKeyError("Set TWITTERAPI_KEY in .env");
  opts.beforeFetch?.();
  const pages = await fetchTimeline(handle, { apiKey: opts.apiKey });
  const snapshot = makeSnapshot(handle, pages, opts.now);
  saveSnapshot(opts.snapshotDir, snapshot);
  return { snapshot, requests: pages.length };
}
