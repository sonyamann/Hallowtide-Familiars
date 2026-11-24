// Shared by the commands that take a handle: gate, gather, analyze. Failures
// print {"error": "<code>"} and exit; the codes are for machines.

import { readFileSync } from "node:fs";
import { analyzeSnapshot, type Analysis } from "./analyze.ts";
import { gatherSnapshot, MissingApiKeyError } from "./gather.ts";
import { InvalidHandleError, normalizeHandle, parseHandleList } from "./handle.ts";
import { OPT_OUT_FILE, SNAPSHOT_DIR } from "./paths.ts";
import { ApiError } from "./twitterapi.ts";
import type { Snapshot } from "./types.ts";

export function fail(error: string, detail?: string): never {
  console.log(JSON.stringify(detail ? { error, detail } : { error }, null, 2));
  process.exit(1);
}

// Reads `@handle [--refresh]` from the command line and returns its analysis.
export async function specimenFromArgs(usage: string): Promise<{ analysis: Analysis; snapshot: Snapshot; requests: number; fetchedAt: string }> {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  if (!input) fail("usage", usage);

  let handle: string;
  try {
    handle = normalizeHandle(input);
  } catch (err) {
    if (err instanceof InvalidHandleError) fail("invalid_handle", err.message);
    throw err;
  }
  if (parseHandleList(readFileSync(OPT_OUT_FILE, "utf8")).has(handle)) fail("opted_out");

  try {
    const { snapshot, requests } = await gatherSnapshot(handle, {
      snapshotDir: SNAPSHOT_DIR,
      apiKey: process.env.TWITTERAPI_KEY,
      now: new Date(),
      refresh: args.includes("--refresh"),
    });
    const analysis = analyzeSnapshot(snapshot);
    if (!analysis) fail("no_specimen");
    return { analysis, snapshot, requests, fetchedAt: snapshot.fetchedAt };
  } catch (err) {
    if (err instanceof MissingApiKeyError) fail("missing_api_key", err.message);
    if (err instanceof ApiError) fail("api_error", err.message);
    throw err;
  }
}
