import { computeFeatures, type Features } from "./features.ts";
import { computeSignals, type Signals } from "./signals.ts";
import { profileOf, tweetsOf } from "./tweets.ts";
import type { Profile, Snapshot } from "./types.ts";

export interface Analysis {
  handle: string;
  snapshotId: string;
  fetchedAt: string;
  profile: Profile;
  counts: {
    tweets: number;
    originals: number;
    quotes: number;
    repliesToOthers: number;
    selfReplies: number;
    retweets: number;
    spanDays: number;
  };
  signals: Signals;
  unknownSignals: string[];
  features: Features;
}

// Pure code: the same snapshot always gives the same analysis. Returns null
// when the snapshot holds no tweets by the handle (protected, suspended,
// nonexistent or empty accounts all look like this).
export function analyzeSnapshot(snapshot: Snapshot): Analysis | null {
  const profile = profileOf(snapshot.handle, snapshot.pages);
  const tweets = tweetsOf(snapshot.handle, snapshot.pages);
  if (!profile || tweets.length === 0) return null;

  const signals = computeSignals(profile, tweets);
  const count = (kind: string) => tweets.filter((t) => t.kind === kind).length;

  return {
    handle: snapshot.handle,
    snapshotId: snapshot.id,
    fetchedAt: snapshot.fetchedAt,
    profile,
    counts: {
      tweets: tweets.length,
      originals: count("original"),
      quotes: tweets.filter((t) => t.isQuote).length,
      repliesToOthers: count("reply"),
      selfReplies: count("selfReply"),
      retweets: count("retweet"),
      spanDays: (tweets[0]!.createdAt - tweets.at(-1)!.createdAt) / 86_400_000,
    },
    signals,
    unknownSignals: Object.keys(signals).filter((name) => !signals[name]!.known),
    features: computeFeatures(profile, tweets),
  };
}
