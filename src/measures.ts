import type { Analysis } from "./analyze.ts";

// A measure is one number per account that can be ranked against the
// calibration set, named "<signal>.<value>" or "humour.<humour>.<input>".
// An unknown measure is absent from the record, never zero.
export type Measures = Record<string, number>;

// The calibration average for a ratio, and how many units of denominator it
// is worth when pulling a small sample toward it.
export type Priors = Record<string, { mean: number; weight: number }>;

// Ratios that get shrinkage, with the signal counts they are built from.
// Weights are starting points for calibration, in units of the denominator.
export const RATIOS: Record<string, { num: string; den: string; weight: number }> = {
  "aloofness.replyShare": { num: "repliesToOthers", den: "authored", weight: 10 },
  "aloofness.mentionRate": { num: "mentioning", den: "originals", weight: 10 },
  "questionRate.share": { num: "questions", den: "originals", weight: 10 },
  "repliesReceivedPerLike.ratio": { num: "replies", den: "likes", weight: 20 },
  "selfThreadShare.share": { num: "selfReplies", den: "authored", weight: 10 },
  "linkShare.share": { num: "linked", den: "authored", weight: 10 },
  "quotesUp.share": { num: "quotesUp", den: "quotes", weight: 3 },
  "quotesReceivedPerLike.ratio": { num: "quotes", den: "likes", weight: 20 },
  "seenNotHeard.engagementPerView": { num: "engagement", den: "views", weight: 2000 },
  "assemblage.share": { num: "assembled", den: "tweets", weight: 10 },
};

// Measures ranked against accounts of similar size rather than the whole
// set, with the number of nearest accounts (by follower count) to compare to.
// Quoting accounts 10× larger is easy when small and nearly impossible when
// huge, so ranked against everyone it would mostly measure size.
export const PEER_RANKED: Record<string, number> = {
  "quotesUp.share": 100,
};

// Humour inputs have no minimum of their own; below this many tweets they
// are left unknown.
const HUMOUR_MIN_TWEETS = 30;

// Flattens an analysis into measures. With priors, small-sample ratios are
// pulled toward the calibration average; without, they are raw.
export function measuresOf(analysis: Analysis, priors?: Priors): Measures {
  const out: Measures = {};

  for (const [name, signal] of Object.entries(analysis.signals)) {
    if (!signal.known) continue;
    for (const [key, value] of Object.entries(signal.values)) {
      if (value === null) continue;
      const id = `${name}.${key}`;
      const prior = priors?.[id];
      const parts = ratioCounts(analysis, id);
      out[id] = prior && parts ? (parts.num + prior.weight * prior.mean) / (parts.den + prior.weight) : value;
    }
  }

  // Appetite is the sum of two ratios, so it follows their shrunk values.
  const replyShare = out["aloofness.replyShare"];
  const mentionRate = out["aloofness.mentionRate"];
  if ("appetite.score" in out && replyShare !== undefined && mentionRate !== undefined) {
    out["appetite.score"] = replyShare + mentionRate;
  }

  if (analysis.counts.tweets >= HUMOUR_MIN_TWEETS) {
    for (const [humour, inputs] of Object.entries(analysis.features.humours)) {
      for (const [key, value] of Object.entries(inputs)) {
        if (value !== null) out[`humour.${humour}.${key}`] = value;
      }
    }
  }
  return out;
}

// The numerator and denominator behind a ratio measure, if it has them.
export function ratioCounts(analysis: Analysis, id: string): { num: number; den: number } | null {
  const spec = RATIOS[id];
  const counts = analysis.signals[id.split(".")[0]!]?.counts;
  const num = counts?.[spec?.num ?? ""];
  const den = counts?.[spec?.den ?? ""];
  return spec && num !== undefined && den !== undefined ? { num, den } : null;
}
