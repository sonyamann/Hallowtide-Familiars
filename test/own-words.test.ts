import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ClassifierError, type Answers, type Ask } from "../src/jev.ts";
import {
  callCandidates,
  chooseOwnWords,
  classifierVersion,
  cleanForCard,
  containsBlocked,
  hasPii,
  screen,
  type ScreenConfig,
} from "../src/own-words.ts";
import { buildCard } from "../src/pipeline.ts";
import { makeSnapshot } from "../src/snapshot.ts";
import { tweetsOf } from "../src/tweets.ts";
import { EDITION, SCORES, TABLES } from "./edition-fixture.ts";
import { HANDLE, page, times, tweet } from "./helpers.ts";

const Q = { instructions: "?", true: "yes", false: "no" };
const CONFIG: ScreenConfig = {
  model: "test-model",
  blockAt: 0.35,
  call: { minLength: 20, maxLength: 80, candidates: 3, minKeptAfterCleaning: 0.9 },
  diet: { candidates: 5 },
  tweetQuestions: { distress: Q, hostile: Q },
  termQuestions: { sensitive: Q },
  dietQuestions: { not_a_noun: Q },
};
const BLOCKLIST = new Set(["blorp", "very bad phrase"]);

// A stand-in classifier: anything mentioning "funeral" or "gin" is flagged,
// and words ending in "ly" are not nouns.
const calls: string[] = [];
const fakeAsk: Ask = async (state, questions) => {
  calls.push(state);
  const flagged = /funeral|gin/.test(state);
  return Object.fromEntries(Object.keys(questions).map((q) => [q, (q === "not_a_noun" ? /ly\b/.test(state) : flagged) ? 0.9 : 0.02])) as Answers;
};

const candidatesFor = (texts: Record<string, number>, extra: Parameters<typeof tweet>[0] = {}) =>
  callCandidates(
    tweetsOf(HANDLE, [page(Object.entries(texts).map(([text, likeCount]) => tweet({ text, likeCount, ...extra })))]),
    CONFIG,
    BLOCKLIST,
  );

test("blocked words and phrases are caught whole, not inside other words", () => {
  assert.equal(containsBlocked("What a Blorp.", BLOCKLIST), true);
  assert.equal(containsBlocked("so many blorps", BLOCKLIST), true);
  assert.equal(containsBlocked("a very bad phrase indeed", BLOCKLIST), true);
  assert.equal(containsBlocked("blorpish behaviour, a very badly phrased idea", BLOCKLIST), false);
});

test("mechanical personal details are caught", () => {
  for (const text of ["mail me at a.b@example.com", "call 415 555 0134", "ask @someone", "I live at 14 Elm Street"]) {
    assert.equal(hasPii(text), true, text);
  }
  assert.equal(hasPii("I walked 14 miles to see 3 lanterns in 2026"), false);
});

test("text is cleaned to what the card fonts can draw", () => {
  assert.equal(cleanForCard("Lanterns 🏮 are “good” — très bien 日本"), "Lanterns are “good” — très bien");
});

test("Call candidates are plain, stand-alone English originals, best-liked first", () => {
  const got = candidatesFor({
    "A fine long post about the keeping of lanterns": 5,
    "Another fine post, this one about moths at night": 50,
    "Too short": 999,
    "This post goes on and on well past the length that a card could ever hold, lantern after lantern": 999,
    "A post with a blorp in it, which is not allowed": 999,
    "🏮🏮🏮🏮🏮🏮🏮🏮🏮🏮 mostly lanterns in this one": 999,
  });
  assert.deepEqual(got.map((c) => c.likes), [50, 5]);

  const text = "A fine long post about the keeping of lanterns";
  assert.equal(candidatesFor({ [text]: 5 }, { lang: "fr" }).length, 0);
  assert.equal(candidatesFor({ [text]: 5 }, { quoted_tweet: { author: { followers: 1 } } }).length, 0);
  assert.equal(candidatesFor({ [text]: 5 }, { extendedEntities: { media: [{}] } }).length, 0);
  assert.equal(candidatesFor({ [text]: 5 }, { entities: { urls: [{ expanded_url: "https://example.com" }] } }).length, 0);
});

test("the Call is the best-liked post that passes the screen", async () => {
  const candidates = candidatesFor({ "My week was mostly a funeral, sadly": 90, "The lanterns were lit and all was well": 10 });
  const labels = await screen(candidates, ["lanterns", "gin"], null, CONFIG, fakeAsk);
  const own = chooseOwnWords(EDITION, CONFIG, BLOCKLIST, labels, candidates, ["gin", "lanterns"], null);
  assert.deepEqual(own.call, { source: "tweet", text: "The lanterns were lit and all was well" });
  assert.deepEqual(own.diet, ["lanterns"]);
});

test("the Diet keeps only nouns, and the noun question is not asked of the phrase", async () => {
  const labels = await screen([], ["honestly", "lanterns", "really", "candles"], "truly lovely", CONFIG, fakeAsk);
  assert.deepEqual(Object.keys(labels.terms["lanterns"]!), ["sensitive", "not_a_noun"]);
  assert.deepEqual(Object.keys(labels.terms["truly lovely"]!), ["sensitive"]);
  const own = chooseOwnWords(EDITION, CONFIG, BLOCKLIST, labels, [], ["honestly", "lanterns", "really", "candles"], "truly lovely");
  assert.deepEqual(own.diet, ["lanterns", "candles"]);
  assert.deepEqual(own.call, { source: "phrase", text: "truly lovely" });
});

test("with no passing post, the Call falls back to the phrase, then to nothing", async () => {
  const candidates = candidatesFor({ "My week was mostly a funeral, sadly": 90 });
  const labels = await screen(candidates, [], "moon cheese", CONFIG, fakeAsk);
  Object.assign(labels.terms, (await screen([], [], "gin and tonic", CONFIG, fakeAsk)).terms);
  const withPhrase = chooseOwnWords(EDITION, CONFIG, BLOCKLIST, labels, candidates, [], "moon cheese");
  assert.deepEqual(withPhrase, { call: { source: "phrase", text: "moon cheese" }, diet: null });
  assert.equal(chooseOwnWords(EDITION, CONFIG, BLOCKLIST, labels, candidates, [], "gin and tonic").call, null);
  // A phrase that was never screened is not shown.
  assert.equal(chooseOwnWords(EDITION, CONFIG, BLOCKLIST, labels, candidates, [], "unscreened phrase").call, null);
});

test("a question can set its own, stricter threshold", () => {
  const candidates = candidatesFor({ "The lanterns were lit and all was well": 1 });
  const labels = { classifier: "x", tweets: { [candidates[0]!.id]: { distress: 0.25, hostile: 0.25 } }, terms: {} };
  const pick = (config: ScreenConfig) => chooseOwnWords(EDITION, config, BLOCKLIST, labels, candidates, [], null).call;
  assert.ok(pick(CONFIG));
  assert.equal(pick({ ...CONFIG, tweetQuestions: { distress: { ...Q, blockAt: 0.2 }, hostile: Q } }), null);
});

test("a classifier failure stops the screen rather than passing things through", async () => {
  const failing: Ask = async () => {
    throw new Error("down");
  };
  await assert.rejects(screen(candidatesFor({ "The lanterns were lit and all was well": 1 }), [], null, CONFIG, failing));
});

test("the classifier version changes with the policy", () => {
  assert.notEqual(classifierVersion(CONFIG), classifierVersion({ ...CONFIG, blockAt: 0.5 }));
  assert.notEqual(classifierVersion(CONFIG), classifierVersion({ ...CONFIG, model: "other" }));
});

test("the pipeline saves labels, so a second run asks the classifier nothing", async () => {
  const ref = { edition: EDITION, tables: TABLES, scores: SCORES, blocklist: BLOCKLIST, screenConfig: CONFIG };
  const snapshot = makeSnapshot(HANDLE, [page(times(40, () => tweet({ text: "The lanterns were lit and all was well" })))], new Date("2026-10-02"));
  const dir = mkdtempSync(join(tmpdir(), "bestiary-labels-"));

  calls.length = 0;
  const first = await buildCard(ref, snapshot, fakeAsk, dir);
  assert.ok(calls.length > 0);
  assert.equal(first!.card.scorecard.observations?.call?.text, "The lanterns were lit and all was well");

  calls.length = 0;
  const second = await buildCard(ref, snapshot, fakeAsk, dir);
  assert.equal(calls.length, 0);
  assert.deepEqual(second!.card, first!.card);

  assert.equal(first!.screened, true);

  // If the classifier fails, the card is still made, without their words,
  // and nothing is saved, so the next run screens again.
  const down: Ask = async () => {
    throw new ClassifierError("down");
  };
  const outageDir = mkdtempSync(join(tmpdir(), "bestiary-labels-"));
  const outage = await buildCard(ref, snapshot, down, outageDir);
  assert.deepEqual([outage!.screened, outage!.card.scorecard.observations], [false, null]);
  assert.equal(outage!.card.species, first!.card.species);
  assert.equal((await buildCard(ref, snapshot, fakeAsk, outageDir))!.screened, true);

  // Without a classifier, none of the user's own words are shown.
  const unscreened = await buildCard(ref, snapshot, null, mkdtempSync(join(tmpdir(), "bestiary-labels-")));
  assert.equal(unscreened!.card.scorecard.observations, null);
});
