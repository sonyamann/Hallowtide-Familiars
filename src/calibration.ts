import { createHash } from "node:crypto";
import type { Analysis } from "./analyze.ts";
import { measuresOf, PEER_RANKED, ratioCounts, RATIOS, type Measures, type Priors } from "./measures.ts";

// The versioned reference set that every account is ranked against. It holds
// numbers and vocabulary only: no handles and no tweet text.
export interface CalibrationTables {
  version: string;
  accounts: number;
  // Hash of the snapshot ids that went in, so a table can be traced to its data.
  snapshots: string;
  priors: Priors;
  // Every known value of each measure across the set, sorted ascending.
  measures: Record<string, number[]>;
  // Peer-ranked measures: each account's follower count beside its value, in
  // follower order, and how many nearest accounts to rank against.
  peers: Record<string, { neighbours: number; followers: number[]; values: number[] }>;
  // For Diet: how many accounts use each term, out of `accounts`.
  terms: { accounts: number; counts: Record<string, number> };
}

const MIN_ACCOUNTS_PER_TERM = 2;

export function buildTables(version: string, analyses: Analysis[], termsByAccount: Iterable<string>[]): CalibrationTables {
  // Pass 1: the pooled average of each ratio, across accounts where it is known.
  const priors: Priors = {};
  for (const [id, spec] of Object.entries(RATIOS)) {
    let num = 0;
    let den = 0;
    for (const analysis of analyses) {
      const parts = ratioCounts(analysis, id);
      if (!parts || !analysis.signals[id.split(".")[0]!]!.known) continue;
      num += parts.num;
      den += parts.den;
    }
    if (den > 0) priors[id] = { mean: num / den, weight: spec.weight };
  }

  // Pass 2: each account's measures, shrunk toward those averages.
  const measures: Record<string, number[]> = {};
  const pairs: Record<string, [followers: number, value: number][]> = {};
  for (const analysis of analyses) {
    for (const [id, value] of Object.entries(measuresOf(analysis, priors))) {
      if (id in PEER_RANKED) (pairs[id] ??= []).push([analysis.profile.followers, round(value)]);
      else (measures[id] ??= []).push(round(value));
    }
  }
  for (const values of Object.values(measures)) values.sort((a, b) => a - b);

  const peers: CalibrationTables["peers"] = {};
  for (const id of Object.keys(pairs).sort()) {
    const sorted = pairs[id]!.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    peers[id] = { neighbours: PEER_RANKED[id]!, followers: sorted.map((p) => p[0]), values: sorted.map((p) => p[1]) };
  }

  const termCounts = new Map<string, number>();
  for (const terms of termsByAccount) {
    for (const term of new Set(terms)) termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }
  const counts: Record<string, number> = {};
  for (const term of [...termCounts.keys()].sort()) {
    if (termCounts.get(term)! >= MIN_ACCOUNTS_PER_TERM) counts[term] = termCounts.get(term)!;
  }

  const ids = analyses.map((a) => a.snapshotId).sort().join("\n");
  return {
    version,
    accounts: analyses.length,
    snapshots: createHash("sha256").update(ids).digest("hex"),
    priors,
    measures: Object.fromEntries(Object.entries(measures).sort(([a], [b]) => (a < b ? -1 : 1))),
    peers,
    terms: { accounts: analyses.length, counts },
  };
}

// Where a value falls in the calibration set, from 0 to 100. Ties sit in the
// middle of their group, so a value shared by everyone scores 50. Peer-ranked
// measures are compared only with the accounts nearest in follower count.
export function percentileOf(tables: CalibrationTables, measure: string, value: number, followers: number): number | null {
  const peers = tables.peers[measure];
  const pool = peers ? nearestBySize(peers, followers) : tables.measures[measure];
  if (!pool?.length) return null;
  const v = round(value);
  let below = 0;
  let equal = 0;
  for (const x of pool) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (100 * (below + equal / 2)) / pool.length;
}

// The values of the accounts closest in size, judged on a log scale so that
// 1,000 vs 2,000 followers counts the same as 100,000 vs 200,000.
function nearestBySize(peers: CalibrationTables["peers"][string], followers: number): number[] {
  const size = Math.log10(followers + 1);
  return peers.followers
    .map((f, i) => ({ distance: Math.abs(Math.log10(f + 1) - size), i }))
    .sort((a, b) => a.distance - b.distance || a.i - b.i)
    .slice(0, peers.neighbours)
    .map(({ i }) => peers.values[i]!);
}

// Every known measure of an account as a percentile.
export function percentilesOf(tables: CalibrationTables, analysis: Analysis): Measures {
  const out: Measures = {};
  for (const [id, value] of Object.entries(measuresOf(analysis, tables.priors))) {
    const p = percentileOf(tables, id, value, analysis.profile.followers);
    if (p !== null) out[id] = p;
  }
  return out;
}

// Six significant digits: keeps the table small and comparisons exact.
function round(value: number): number {
  return Number(value.toPrecision(6));
}
