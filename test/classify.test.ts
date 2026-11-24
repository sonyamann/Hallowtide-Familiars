import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, handleSeed, rawScore } from "../src/classify.ts";
import { loadActiveConfig, loadEdition } from "../src/content.ts";
import { buildTables } from "../src/calibration.ts";
import { account, analyze, EDITION, SCORES, TABLES } from "./edition-fixture.ts";
import { replyTo, times, tweet } from "./helpers.ts";

test("a trait's score is the mean of its signals, or the best one with 'max'", () => {
  const percentiles = { a: 80, b: 30 };
  const signals = [
    { measure: "a", direction: "high" as const },
    { measure: "b", direction: "low" as const },
  ];
  assert.equal(rawScore({ slug: "t", name: "T", signals }, percentiles), 75);
  assert.equal(rawScore({ slug: "t", name: "T", signals, combine: "max" }, percentiles), 80);
  // One unknown signal makes the whole trait unknown.
  assert.equal(rawScore({ slug: "t", name: "T", signals: [...signals, { measure: "c", direction: "high" }] }, percentiles), null);
});

test("species goes to the strongest trait, then variant likewise", () => {
  const asker = classify(EDITION, TABLES, SCORES, account(30, 0));
  assert.equal(asker.species, "asker");
  assert.equal(asker.runnerUp, "linker");
  assert.ok(asker.margin! > 0);

  const linker = classify(EDITION, TABLES, SCORES, account(0, 30));
  assert.equal(linker.species, "linker");
  assert.equal(linker.variant, "stitched");
  assert.equal(linker.route, "signals");
});

test("a rare species wins whenever it qualifies; marked without variants, it gets none", () => {
  const long = "A very long and civil post about lanterns and their keeping ".repeat(6);
  const shifter = classify(EDITION, TABLES, SCORES, account(30, 0, 20, long));
  assert.equal(shifter.species, "shifter");
  assert.equal(shifter.variant, null);
  assert.equal(shifter.runnerUp, "asker");
});

test("too few tweets of its own is the thin-evidence species; marked without variants, it gets none", () => {
  const few = classify(EDITION, TABLES, SCORES, analyze(times(29, () => tweet())));
  assert.deepEqual([few.route, few.species, few.variant], ["thin", "quiet", null]);
});

test("almost only replies is the replier species, with a variant as usual", () => {
  const replier = classify(EDITION, TABLES, SCORES, analyze([...times(10, () => tweet()), ...times(50, () => replyTo("someone", "no"))]));
  assert.deepEqual([replier.route, replier.species], ["replier", "linker"]);
  assert.equal(replier.variant, "hungry");
});

test("plenty of tweets but too few scorable species is thin evidence", () => {
  // 15 originals and 15 thread replies: not a replier, and only one
  // ordinary species can be scored.
  const thin = classify(EDITION, TABLES, SCORES, analyze([...times(15, () => tweet()), ...times(15, () => replyTo("Specimen", "more"))]));
  assert.deepEqual([thin.route, thin.species], ["thin", "quiet"]);
});

test("classification is repeatable, and the handle seed is stable", () => {
  const a = classify(EDITION, TABLES, SCORES, account(10, 10));
  const b = classify(EDITION, TABLES, SCORES, account(10, 10));
  assert.deepEqual(a, b);
  assert.equal(handleSeed("Specimen"), handleSeed("specimen"));
  assert.notEqual(handleSeed("specimen"), handleSeed("specimen2"));
});

test("the active edition's content files load and name real measures", () => {
  const active = loadActiveConfig();
  const edition = loadEdition(active.edition);
  assert.equal(edition.id, active.edition);
  assert.ok(edition.species.length > 0 && edition.variants.length > 0);
  assert.equal(edition.species.filter((s) => s.rare).length, 1);
  assert.equal(edition.species.filter((s) => s.route === "thin").length, 1);
  assert.equal(edition.species.filter((s) => s.route === "replier").length, 1);

  const full = analyze([
    ...times(30, () => tweet({ quoted_tweet: { author: { followers: 50_000 } } })),
    ...times(30, () => replyTo("someone", "no")),
  ]);
  const tables = buildTables("test", [full], [[]]);
  const known = new Set([...Object.keys(tables.measures), ...Object.keys(tables.peers)]);
  for (const trait of [...edition.species, ...edition.variants]) {
    for (const { measure } of trait.signals) assert.ok(known.has(measure), `${trait.slug}: unknown measure ${measure}`);
  }
});
