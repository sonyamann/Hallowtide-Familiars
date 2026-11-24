import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeSnapshot } from "../src/analyze.ts";
import { InvalidHandleError, normalizeHandle, parseHandleList } from "../src/handle.ts";
import { loadFreshSnapshot, makeSnapshot, saveSnapshot } from "../src/snapshot.ts";
import { parseXDate, tweetsOf } from "../src/tweets.ts";
import { ApiError, fetchTimeline } from "../src/twitterapi.ts";
import type { RawPage } from "../src/types.ts";
import { HANDLE, page, replyTo, times, tweet } from "./helpers.ts";

const NOW = new Date("2026-10-02T00:00:00Z");

function analyze(pages: RawPage[]) {
  const analysis = analyzeSnapshot(makeSnapshot(HANDLE, pages, NOW));
  assert.ok(analysis);
  return analysis;
}

test("handles are normalized from @names and profile URLs", () => {
  assert.equal(normalizeHandle(" @SonyaSupposedly "), "sonyasupposedly");
  assert.equal(normalizeHandle("https://x.com/Some_One/status/1?s=20"), "some_one");
  assert.equal(normalizeHandle("twitter.com/abc"), "abc");
  assert.throws(() => normalizeHandle("not a handle"), InvalidHandleError);
  assert.throws(() => normalizeHandle("sixteen_chars_xx"), InvalidHandleError);
});

test("the opt-out list ignores comments and case", () => {
  const list = parseHandleList("# header\n@Private_Person # asked on Oct 1\n\nother\n");
  assert.deepEqual([...list], ["private_person", "other"]);
});

test("X dates parse as UTC", () => {
  assert.equal(parseXDate("Thu Oct 01 18:48:57 +0000 2026"), Date.UTC(2026, 9, 1, 18, 48, 57));
  assert.equal(parseXDate("yesterday"), null);
});

test("tweets are sorted into originals, replies, thread replies and retweets", () => {
  const tweets = tweetsOf(HANDLE, [
    page([
      tweet(),
      tweet({ quoted_tweet: { author: { followers: 50_000 } } }),
      replyTo("someone", "an answer"),
      replyTo("Specimen", "and another thing"),
      tweet({ text: "RT @other: their words", retweeted_tweet: {} }),
    ]),
  ]);
  assert.deepEqual(tweets.map((t) => t.kind), ["original", "original", "reply", "selfReply", "retweet"]);
  assert.deepEqual(tweets.map((t) => t.isQuote), [false, true, false, false, false]);
});

test("visible text drops the reply prefix and links, and prefix mentions don't count", () => {
  const [reply, post] = tweetsOf(HANDLE, [
    page([
      replyTo("someone", "fair point"),
      tweet({
        text: "Tom &amp; Jerry, says @friend https://t.co/abc",
        entities: {
          user_mentions: [{ screen_name: "friend", indices: [22, 29] }],
          urls: [{ expanded_url: "https://example.com/story" }],
        },
      }),
    ]),
  ]);
  assert.equal(reply!.text, "fair point");
  assert.equal(reply!.mentions, 0);
  assert.equal(post!.text, "Tom & Jerry, says @friend");
  assert.equal(post!.mentions, 1);
  assert.equal(post!.hasLink, true);
});

test("long posts keep their full text past the 'show more' cut", () => {
  const long = "word ".repeat(100).trim();
  const [post] = tweetsOf(HANDLE, [page([tweet({ text: long, displayTextRange: [0, 277] })])]);
  assert.equal(post!.length, 499);
});

test("links to X itself are not outside links", () => {
  const [post] = tweetsOf(HANDLE, [page([tweet({ entities: { urls: [{ expanded_url: "https://x.com/a/status/1" }] } })])]);
  assert.equal(post!.hasLink, false);
});

test("duplicate tweets across pages are counted once", () => {
  const same = tweet();
  assert.equal(tweetsOf(HANDLE, [page([same]), page([same])]).length, 1);
});

test("signals match the spec's starting formulas", () => {
  const { signals, counts } = analyze([
    page([
      ...times(10, () => tweet({ text: "Is this a question?", likeCount: 2, replyCount: 5 })),
      ...times(9, () => tweet({ likeCount: 10, replyCount: 1 })),
      tweet({ likeCount: 500, replyCount: 0, quoteCount: 30 }),
      ...times(4, () => tweet({ likeCount: 10, entities: { urls: [{ expanded_url: "https://example.com" }] } })),
      ...times(6, () => tweet({ quoted_tweet: { author: { followers: 20_000 } } })),
      ...times(2, () => tweet({ quoted_tweet: { author: { followers: 500 } } })),
      ...times(16, () => replyTo("someone", "short")),
      ...times(8, () => replyTo("Specimen", "thread continues")),
      ...times(4, () => tweet({ text: "RT @other: theirs", retweeted_tweet: {}, likeCount: 9999 })),
    ]),
  ]);

  assert.deepEqual(counts, {
    tweets: 60,
    originals: 32,
    quotes: 8,
    repliesToOthers: 16,
    selfReplies: 8,
    retweets: 4,
    spanDays: 59 / 24,
  });

  assert.equal(signals.likesGivenPerPost!.values.ratio, 10);
  // Median original has 10 likes; the best has 500. Retweets' likes are ignored.
  assert.equal(signals.bestVsTypicalGap!.values.ratio, 50);
  assert.equal(signals.questionRate!.values.share, 10 / 32);
  // 30 quotes against 730 likes across the originals.
  assert.equal(signals.quotesReceivedPerLike!.values.ratio, 30 / 730);
  assert.equal(signals.selfThreadShare!.values.share, 8 / 56);
  assert.equal(signals.linkShare!.values.share, 4 / 56);
  assert.equal(signals.quotesUp!.values.share, 6 / 8);
  assert.equal(signals.aloofness!.values.replyShare, 16 / 56);
  assert.equal(signals.aloofness!.values.followingPerFollower, 0.1);
  assert.equal(signals.appetite!.values.score, 16 / 56);
  // 4 retweets + 8 quotes + 4 link posts out of 60.
  assert.equal(signals.assemblage!.values.share, 16 / 60);
  assert.equal(signals.silences!.values.longestGapHours, 1);
  // Originals are 27 or 19 characters; replies are 5.
  assert.ok(signals.originalsVsRepliesGap!.values.lengthGap! > 15);
  assert.ok(Object.values(signals).every((s) => s.known));
});

test("below its minimum sample a signal is unknown, never zero", () => {
  const analysis = analyze([page(times(5, () => tweet({ viewCount: null })))]);
  const { signals } = analysis;
  assert.equal(signals.questionRate!.known, false);
  assert.equal(signals.questionRate!.values.share, 0);
  assert.equal(signals.quotesUp!.known, false);
  assert.equal(signals.quotesUp!.values.share, null);
  assert.equal(signals.seenNotHeard!.known, false);
  // The lifetime counts come from the profile, not the sample.
  assert.equal(signals.likesGivenPerPost!.known, true);
  assert.equal(analysis.unknownSignals.length, 13);
});

test("features cover habitat, terms and the most-used phrase", () => {
  const { features } = analyze([
    page([
      ...times(3, (i) => tweet({ text: `The moon cheese theory holds ${i}` })),
      tweet({ text: "Cheese again" }),
      replyTo("someone", "cheese cheese cheese"),
    ]),
  ]);
  // Five posts an hour apart, all on one day.
  assert.deepEqual(features.habitat, { postsPerDay: 5, joinedYear: 2011 });
  // Replies never feed Diet: "cheese" is counted in 4 posts, not 5.
  assert.deepEqual(features.terms[0], { term: "cheese", posts: 4 });
  assert.deepEqual(features.mostUsedPhrase, { phrase: "moon cheese theory holds", posts: 3 });
  assert.equal(features.englishShare, 1);
});

test("the same pages always give the same snapshot id and analysis", () => {
  const pages = [page(times(40, () => tweet()))];
  const a = makeSnapshot(HANDLE, pages, NOW);
  const b = makeSnapshot(HANDLE, structuredClone(pages), new Date("2027-01-01T00:00:00Z"));
  assert.equal(a.id, b.id);
  assert.match(a.id, /^[0-9a-f]{64}$/);
  assert.deepEqual(analyzeSnapshot(a)!.signals, analyzeSnapshot(b)!.signals);
});

test("an account with no tweets is no specimen", () => {
  assert.equal(analyzeSnapshot(makeSnapshot(HANDLE, [page([])], NOW)), null);
});

test("snapshots are reused for 7 days, then refetched", () => {
  const dir = mkdtempSync(join(tmpdir(), "bestiary-"));
  const snapshot = makeSnapshot(HANDLE, [page([tweet()])], NOW);
  saveSnapshot(dir, snapshot);
  assert.equal(loadFreshSnapshot(dir, HANDLE, new Date("2026-10-08T23:00:00Z"))?.id, snapshot.id);
  assert.equal(loadFreshSnapshot(dir, HANDLE, new Date("2026-10-09T01:00:00Z")), null);
  assert.equal(loadFreshSnapshot(dir, "nobody", NOW), null);
});

function fakeApi(pages: RawPage[], calls: URL[]): typeof fetch {
  return (async (url: URL) => {
    calls.push(url);
    return new Response(JSON.stringify(pages[calls.length - 1]));
  }) as unknown as typeof fetch;
}

test("fetching follows the cursor until there are enough tweets", async () => {
  const calls: URL[] = [];
  const pages = [page(times(20, () => tweet()), "c1"), page(times(4, () => tweet()), "c2"), page(times(20, () => tweet()), "c3")];
  const got = await fetchTimeline(HANDLE, { apiKey: "test", targetTweets: 30, fetchImpl: fakeApi(pages, calls) });
  assert.equal(got.length, 3);
  assert.equal(calls[0]!.searchParams.get("includeReplies"), "true");
  assert.equal(calls[0]!.searchParams.get("cursor"), null);
  assert.equal(calls[2]!.searchParams.get("cursor"), "c2");
});

test("fetching stops at the last page and at the request cap", async () => {
  const short: URL[] = [];
  await fetchTimeline(HANDLE, { apiKey: "test", fetchImpl: fakeApi([page([tweet()])], short) });
  assert.equal(short.length, 1);

  const capped: URL[] = [];
  const endless = times(5, (i) => page([tweet()], `c${i}`));
  await fetchTimeline(HANDLE, { apiKey: "test", maxRequests: 3, fetchImpl: fakeApi(endless, capped) });
  assert.equal(capped.length, 3);
});

test("a dropped connection is retried", async () => {
  let calls = 0;
  const flaky = (async () => {
    if (++calls === 1) throw new TypeError("terminated");
    return new Response(JSON.stringify(page([tweet()])));
  }) as unknown as typeof fetch;
  const got = await fetchTimeline(HANDLE, { apiKey: "test", fetchImpl: flaky, retryDelayMs: 0 });
  assert.equal(got.length, 1);
  assert.equal(calls, 2);
});

test("an API failure throws rather than returning a partial run", async () => {
  const failing = [page(times(20, () => tweet()), "c1"), { status: "error", msg: "out of credits" }];
  await assert.rejects(fetchTimeline(HANDLE, { apiKey: "test", fetchImpl: fakeApi(failing, []) }), ApiError);
});
