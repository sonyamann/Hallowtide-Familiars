// calibrate <handles file> --version <name> [--max-requests N] [--concurrency N] [--force]
//
// Fetches every handle in the list (reusing fresh snapshots, so an
// interrupted run can simply be started again), then writes:
//   calibration/<version>/tables.json      percentile tables; committed
//   data/calibration/<version>/accounts.jsonl   one analysis per account; not committed
//   data/calibration/<version>/report.json      what happened to each handle; not committed

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeSnapshot, type Analysis } from "./analyze.ts";
import { buildTables } from "./calibration.ts";
import { termPostCounts } from "./features.ts";
import { gatherSnapshot } from "./gather.ts";
import { parseHandleList } from "./handle.ts";
import { CALIBRATION_DIR, DATA_DIR, OPT_OUT_FILE, SNAPSHOT_DIR } from "./paths.ts";
import { tweetsOf } from "./tweets.ts";
import { ApiError } from "./twitterapi.ts";

// Stop early if the API keeps failing, e.g. when credits run out.
const MAX_FAILURES_IN_A_ROW = 5;

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const listFile = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const version = option("version");
if (!listFile || !version) {
  console.error("usage: npm run calibrate -- <handles file> --version <name> [--max-requests N] [--concurrency N] [--force]");
  process.exit(1);
}
// The spend cap for this run: at most this many paid API requests.
const maxRequests = Number(option("max-requests") ?? 5000);
const concurrency = Number(option("concurrency") ?? 4);

const tablesFile = join(CALIBRATION_DIR, version, "tables.json");
if (existsSync(tablesFile) && !args.includes("--force")) {
  console.error(`${tablesFile} already exists. Recalibration is a deliberate release: pick a new version, or pass --force.`);
  process.exit(1);
}

const optedOut = parseHandleList(readFileSync(OPT_OUT_FILE, "utf8"));
const handles = [...parseHandleList(readFileSync(listFile, "utf8"))].sort();
const now = new Date();

const outcomes: Record<string, string> = {};
const analyses = new Map<string, Analysis>();
const terms = new Map<string, string[]>();
let requests = 0;
let failuresInARow = 0;
let next = 0;

async function worker(): Promise<void> {
  while (next < handles.length) {
    const handle = handles[next++]!;
    if (optedOut.has(handle)) {
      outcomes[handle] = "opted_out";
      continue;
    }
    if (requests >= maxRequests || failuresInARow >= MAX_FAILURES_IN_A_ROW) {
      outcomes[handle] = "skipped";
      continue;
    }
    try {
      const gathered = await gatherSnapshot(handle, { snapshotDir: SNAPSHOT_DIR, apiKey: process.env.TWITTERAPI_KEY, now });
      requests += gathered.requests;
      failuresInARow = 0;
      const analysis = analyzeSnapshot(gathered.snapshot);
      if (!analysis) {
        outcomes[handle] = "no_specimen";
        continue;
      }
      outcomes[handle] = "ok";
      analyses.set(handle, analysis);
      const originals = tweetsOf(handle, gathered.snapshot.pages).filter((t) => t.kind === "original");
      terms.set(handle, [...termPostCounts(originals).keys()]);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      failuresInARow++;
      outcomes[handle] = `api_error: ${err.message}`;
    }
    const done = Object.keys(outcomes).length;
    if (done % 25 === 0) console.error(`${done}/${handles.length} handles, ${requests} requests`);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

const tally: Record<string, number> = {};
for (const outcome of Object.values(outcomes)) {
  const kind = outcome.split(":")[0]!;
  tally[kind] = (tally[kind] ?? 0) + 1;
}
console.error(`Done: ${JSON.stringify(tally)}, ${requests} requests`);

const runDir = join(DATA_DIR, "calibration", version);
mkdirSync(runDir, { recursive: true });
const ordered = [...analyses.keys()].sort();
writeFileSync(join(runDir, "report.json"), JSON.stringify({ version, requests, tally, outcomes }, null, 2));
writeFileSync(join(runDir, "accounts.jsonl"), ordered.map((h) => JSON.stringify(analyses.get(h))).join("\n") + "\n");

if (tally.skipped || tally.api_error) {
  console.error("Some handles were skipped or failed, so no tables were written. Run the same command again to pick up where it stopped.");
  process.exit(1);
}

const tables = buildTables(version, ordered.map((h) => analyses.get(h)!), ordered.map((h) => terms.get(h)!));
mkdirSync(join(CALIBRATION_DIR, version), { recursive: true });
writeFileSync(tablesFile, JSON.stringify(tables));
console.error(`Wrote ${tablesFile} from ${tables.accounts} accounts`);
