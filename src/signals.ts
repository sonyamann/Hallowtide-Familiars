import { coefficientOfVariation, mean, median, ratio, sum } from "./stats.ts";
import type { Profile, Tweet } from "./types.ts";

// One row of the spec's Signal definitions table. Below its minimum sample a
// signal is unknown (known: false), never zero. `counts` keeps the raw
// numerators and denominators so calibration can shrink small samples toward
// the reference average.
export interface Signal {
  known: boolean;
  sample: number;
  minSample: number;
  values: Record<string, number | null>;
  counts?: Record<string, number>;
}

export type Signals = Record<string, Signal>;

function signal(sample: number, minSample: number, values: Signal["values"], counts?: Signal["counts"]): Signal {
  const known = sample >= minSample && Object.values(values).every((v) => v !== null);
  return counts ? { known, sample, minSample, values, counts } : { known, sample, minSample, values };
}

export function computeSignals(profile: Profile, tweets: Tweet[]): Signals {
  // "Authored" is everything the user wrote: all but plain retweets.
  const authored = tweets.filter((t) => t.kind !== "retweet");
  const originals = tweets.filter((t) => t.kind === "original");
  const repliesToOthers = tweets.filter((t) => t.kind === "reply");
  const selfReplies = tweets.filter((t) => t.kind === "selfReply");
  const retweets = tweets.filter((t) => t.kind === "retweet");
  const quotes = authored.filter((t) => t.isQuote);

  const replyShare = ratio(repliesToOthers.length, authored.length);
  const mentioning = originals.filter((t) => t.mentions > 0).length;
  const mentionRate = ratio(mentioning, originals.length);

  const likes = originals.map((t) => t.likes);
  const totalLikes = sum(likes);
  const totalReplies = sum(originals.map((t) => t.replies));
  const medianLikes = median(likes);

  const questions = originals.filter((t) => /[?？]/.test(t.text)).length;
  const totalQuotes = sum(originals.map((t) => t.quotes));
  const linked = authored.filter((t) => t.hasLink).length;

  const quotesWithSize = quotes.filter((t) => t.quotedFollowers !== null);
  const quotesUp = quotesWithSize.filter((t) => t.quotedFollowers! >= 10 * Math.max(profile.followers, 1)).length;

  const viewed = authored.filter((t) => t.views !== null && t.views > 0);
  const engagement = sum(viewed.map((t) => t.likes + t.replies + t.retweets));
  const views = sum(viewed.map((t) => t.views!));

  // Tweets arrive newest first, so each gap is one post to the next older one.
  const gapsHours = tweets.slice(1).map((t, i) => (tweets[i]!.createdAt - t.createdAt) / 3_600_000);

  const assembled = tweets.filter((t) => t.kind === "retweet" || t.isQuote || t.hasLink).length;

  return {
    likesGivenPerPost: signal(
      profile.statuses,
      50,
      { ratio: ratio(profile.likesGiven, profile.statuses) },
      { likesGiven: profile.likesGiven, statuses: profile.statuses },
    ),
    bestVsTypicalGap: signal(
      originals.length,
      20,
      // A median of zero likes is floored at one so the ratio stays finite.
      { ratio: medianLikes === null ? null : Math.max(...likes) / Math.max(medianLikes, 1) },
      { maxLikes: likes.length ? Math.max(...likes) : 0, medianLikes: medianLikes ?? 0 },
    ),
    aloofness: signal(
      authored.length,
      30,
      { replyShare, mentionRate, followingPerFollower: profile.following / Math.max(profile.followers, 1) },
      { repliesToOthers: repliesToOthers.length, authored: authored.length, mentioning, originals: originals.length },
    ),
    questionRate: signal(
      originals.length,
      20,
      { share: ratio(questions, originals.length) },
      { questions, originals: originals.length },
    ),
    repliesReceivedPerLike: signal(
      originals.length,
      20,
      { ratio: ratio(totalReplies, totalLikes) },
      { replies: totalReplies, likes: totalLikes },
    ),
    selfThreadShare: signal(
      authored.length,
      30,
      { share: ratio(selfReplies.length, authored.length) },
      { selfReplies: selfReplies.length, authored: authored.length },
    ),
    linkShare: signal(authored.length, 30, { share: ratio(linked, authored.length) }, { linked, authored: authored.length }),
    quotesUp: signal(
      quotesWithSize.length,
      5,
      { share: ratio(quotesUp, quotesWithSize.length) },
      { quotesUp, quotes: quotesWithSize.length },
    ),
    quotesReceivedPerLike: signal(
      originals.length,
      20,
      { ratio: ratio(totalQuotes, totalLikes) },
      { quotes: totalQuotes, likes: totalLikes },
    ),
    originalsVsRepliesGap: signal(
      Math.min(originals.length, repliesToOthers.length),
      15,
      {
        lengthGap: gap(mean(originals.map((t) => t.length)), mean(repliesToOthers.map((t) => t.length))),
      },
      { originals: originals.length, repliesToOthers: repliesToOthers.length },
    ),
    seenNotHeard: signal(viewed.length, 20, { engagementPerView: ratio(engagement, views) }, { engagement, views }),
    silences: signal(tweets.length, 30, {
      longestGapHours: gapsHours.length ? Math.max(...gapsHours) : null,
      gapVariation: coefficientOfVariation(gapsHours),
    }),
    appetite: signal(
      authored.length,
      30,
      // Reply share plus mention rate; the two parts are listed under aloofness.
      { score: replyShare === null || mentionRate === null ? null : replyShare + mentionRate },
      { repliesToOthers: repliesToOthers.length, authored: authored.length, mentioning, originals: originals.length },
    ),
    assemblage: signal(
      tweets.length,
      30,
      { share: ratio(assembled, tweets.length) },
      { assembled, retweets: retweets.length, quotes: quotes.length, linked, tweets: tweets.length },
    ),
  };
}

function gap(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}
