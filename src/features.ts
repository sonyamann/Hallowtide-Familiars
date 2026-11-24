import { coefficientOfVariation, mean, ratio, sum } from "./stats.ts";
import { STOPWORDS } from "./stopwords.ts";
import type { Profile, Tweet } from "./types.ts";

// Everything the scorecard needs beyond the species and variant signals.
export interface Features {
  // Raw inputs for the four humours; bands are assigned against calibration.
  humours: {
    sanguine: { engagementPerOriginalPerFollower: number | null };
    choleric: { replyShare: number | null; quoteShare: number | null };
    melancholic: { averageLength: number | null; longPostShare: number | null; selfThreadShare: number | null };
    phlegmatic: { postsPerDay: number | null; dailyVariation: number | null };
  };
  // Posting pace and tenure. Pace is bucketed into pre-written phrases later.
  habitat: { postsPerDay: number | null; joinedYear: number | null };
  // Candidate Diet terms with the number of posts using each. Distinctiveness
  // is scored against the calibration set later.
  terms: { term: string; posts: number }[];
  mostUsedPhrase: { phrase: string; posts: number } | null;
  // Share of posts with a detected language that are in English.
  englishShare: number | null;
}

const LONG_POST_LENGTH = 280;
const DAY_MS = 86_400_000;
// Language codes X uses for posts with no real language (links, media, tags).
const NO_LANGUAGE = new Set(["und", "zxx", "qme", "qam", "qct", "qht", "qst", "art"]);

export function computeFeatures(profile: Profile, tweets: Tweet[]): Features {
  const authored = tweets.filter((t) => t.kind !== "retweet");
  const originals = tweets.filter((t) => t.kind === "original");

  const engagement = mean(originals.map((t) => t.likes + t.replies + t.retweets + t.quotes));

  const rhythm = dailyRhythm(authored);
  const withLanguage = originals.filter((t) => t.lang && !NO_LANGUAGE.has(t.lang));

  return {
    humours: {
      sanguine: {
        engagementPerOriginalPerFollower: engagement === null ? null : engagement / Math.max(profile.followers, 1),
      },
      choleric: {
        replyShare: ratio(authored.filter((t) => t.kind === "reply").length, authored.length),
        quoteShare: ratio(authored.filter((t) => t.isQuote).length, authored.length),
      },
      melancholic: {
        averageLength: mean(originals.map((t) => t.length)),
        longPostShare: ratio(originals.filter((t) => t.length > LONG_POST_LENGTH).length, originals.length),
        selfThreadShare: ratio(authored.filter((t) => t.kind === "selfReply").length, authored.length),
      },
      phlegmatic: rhythm,
    },
    habitat: { postsPerDay: rhythm.postsPerDay, joinedYear: profile.joinedYear },
    terms: topTerms(originals),
    mostUsedPhrase: mostUsedPhrase(originals),
    englishShare: ratio(withLanguage.filter((t) => t.lang === "en").length, withLanguage.length),
  };
}

// Posts per calendar day (UTC) across the sampled span, quiet days included.
function dailyRhythm(tweets: Tweet[]): Features["humours"]["phlegmatic"] {
  if (tweets.length < 2) return { postsPerDay: null, dailyVariation: null };
  const days = tweets.map((t) => Math.floor(t.createdAt / DAY_MS));
  const first = Math.min(...days);
  const perDay = new Array<number>(Math.max(...days) - first + 1).fill(0);
  for (const d of days) perDay[d - first]!++;
  return { postsPerDay: sum(perDay) / perDay.length, dailyVariation: coefficientOfVariation(perDay) };
}

// Highest count first; ties break alphabetically so output is stable.
function ranked(counts: Map<string, number>): [string, number][] {
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

function words(text: string): string[] {
  return text.toLowerCase().replace(/’/g, "'").match(/[\p{L}][\p{L}\p{N}']*/gu) ?? [];
}

// Each term with the number of posts using it. Replies never feed Diet, so
// callers pass originals only.
export function termPostCounts(originals: Tweet[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of originals) {
    for (const w of new Set(words(mentionsRemoved(t.text)))) {
      if (w.length >= 3 && !STOPWORDS.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return counts;
}

function topTerms(originals: Tweet[], limit = 40): Features["terms"] {
  return ranked(termPostCounts(originals))
    .filter(([, posts]) => posts >= 2)
    .slice(0, limit)
    .map(([term, posts]) => ({ term, posts }));
}

// The 2–4 word phrase repeated across the most posts, favouring longer ones.
function mostUsedPhrase(originals: Tweet[]): Features["mostUsedPhrase"] {
  const counts = new Map<string, number>();
  for (const t of originals) {
    const w = words(mentionsRemoved(t.text));
    const inThisPost = new Set<string>();
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= w.length; i++) {
        if (STOPWORDS.has(w[i]!) || STOPWORDS.has(w[i + n - 1]!)) continue;
        inThisPost.add(w.slice(i, i + n).join(" "));
      }
    }
    for (const phrase of inThisPost) counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  const best = [...counts]
    .filter(([, posts]) => posts >= 3)
    .map(([phrase, posts]) => ({ phrase, posts, weight: posts * phrase.split(" ").length }))
    .sort((a, b) => b.weight - a.weight || (a.phrase < b.phrase ? -1 : 1))[0];
  return best ? { phrase: best.phrase, posts: best.posts } : null;
}

function mentionsRemoved(text: string): string {
  return text.replace(/@\w+/g, " ");
}
