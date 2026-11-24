import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSnapshot } from "../src/analyze.ts";
import { buildTables, percentileOf, percentilesOf, type CalibrationTables } from "../src/calibration.ts";
import { measuresOf } from "../src/measures.ts";
import { makeSnapshot } from "../src/snapshot.ts";
import type { RawTweet } from "../src/types.ts";
import { HANDLE, page, times, tweet } from "./helpers.ts";

const NOW = new Date("2026-10-02T00:00:00Z");

function analyze(tweets: RawTweet[]) {
  const analysis = analyzeSnapshot(makeSnapshot(HANDLE, [page(tweets)], NOW));
  assert.ok(analysis);
  return analysis;
}

// An account with `total` plain posts, `questions` of which ask something.
function asker(questions: number, total: number) {
  return analyze([
    ...times(questions, () => tweet({ text: "Is it so?" })),
    ...times(total - questions, () => tweet()),
  ]);
}

function tablesWith(measures: Record<string, number[]>): CalibrationTables {
  return { version: "test", accounts: 0, snapshots: "", priors: {}, measures, peers: {}, terms: { accounts: 0, counts: {} } };
}

test("percentiles run from 0 to 100, with ties in the middle of their group", () => {
  const tables = tablesWith({ m: [0, 0, 0, 0, 1, 2, 3, 4, 5, 6] });
  assert.equal(percentileOf(tables, "m", 0, 1000), 20);
  assert.equal(percentileOf(tables, "m", 3, 1000), 65);
  assert.equal(percentileOf(tables, "m", 99, 1000), 100);
  assert.equal(percentileOf(tables, "m", -1, 1000), 0);
  assert.equal(percentileOf(tables, "missing", 1, 1000), null);
});

test("peer-ranked measures compare an account with others its own size", () => {
  const tables = tablesWith({});
  // Small accounts quote upward most of the time; large ones almost never.
  tables.peers.m = {
    neighbours: 4,
    followers: [100, 200, 300, 400, 500_000, 600_000, 700_000, 800_000],
    values: [0.6, 0.7, 0.8, 0.9, 0, 0.05, 0.1, 0.15],
  };
  // 0.5 is low for a small account and very high for a large one.
  assert.equal(percentileOf(tables, "m", 0.5, 250), 0);
  assert.equal(percentileOf(tables, "m", 0.5, 650_000), 100);
  assert.equal(percentileOf(tables, "m", 0.7, 250), 37.5);
});

test("unknown signals have no measure", () => {
  const measures = measuresOf(asker(2, 5));
  assert.equal("questionRate.share" in measures, false);
  assert.equal("humour.melancholic.averageLength" in measures, false);
  // Lifetime likes given comes from the profile, so it is known.
  assert.equal(measures["likesGivenPerPost.ratio"], 10);
});

test("small samples are pulled toward the calibration average", () => {
  const small = asker(20, 20);
  const large = asker(200, 200);
  const priors = { "questionRate.share": { mean: 0.1, weight: 10 } };
  assert.equal(measuresOf(small)["questionRate.share"], 1);
  // (20 + 10 × 0.1) ÷ (20 + 10) for the small account; the large one barely moves.
  assert.equal(measuresOf(small, priors)["questionRate.share"], 21 / 30);
  assert.equal(measuresOf(large, priors)["questionRate.share"], 201 / 210);
});

test("tables hold pooled averages, sorted measures and shared terms", () => {
  const accounts = [asker(0, 40), asker(10, 40), asker(30, 40)];
  const tables = buildTables("test", accounts, [["moon", "cheese"], ["moon"], ["owl"]]);

  assert.equal(tables.accounts, 3);
  assert.deepEqual(tables.priors["questionRate.share"], { mean: 40 / 120, weight: 10 });
  const shares = tables.measures["questionRate.share"]!;
  assert.equal(shares.length, 3);
  assert.deepEqual(shares, [...shares].sort((a, b) => a - b));
  // Terms used by a single account are dropped.
  assert.deepEqual(tables.terms, { accounts: 3, counts: { moon: 2 } });

  const percentiles = percentilesOf(tables, accounts[2]!);
  assert.equal(percentiles["questionRate.share"], (100 * 2.5) / 3);
});

test("the same accounts in any order give the same tables", () => {
  const a = asker(5, 40);
  const b = asker(25, 40);
  const forward = buildTables("test", [a, b], [["x"], ["y"]]);
  const reverse = buildTables("test", [b, a], [["y"], ["x"]]);
  assert.equal(JSON.stringify(forward), JSON.stringify(reverse));
});
