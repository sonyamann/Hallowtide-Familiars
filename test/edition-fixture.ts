import assert from "node:assert/strict";
import { analyzeSnapshot } from "../src/analyze.ts";
import { buildTables } from "../src/calibration.ts";
import { buildScoreTables } from "../src/classify.ts";
import type { Edition } from "../src/content.ts";
import { makeSnapshot } from "../src/snapshot.ts";
import type { RawTweet } from "../src/types.ts";
import { HANDLE, page, replyTo, times, tweet } from "./helpers.ts";

// A made-up edition and calibration set, shared by the classifier and card tests.

const NOW = new Date("2026-10-02T00:00:00Z");

export function analyze(tweets: RawTweet[]) {
  const analysis = analyzeSnapshot(makeSnapshot(HANDLE, [page(tweets)], NOW));
  assert.ok(analysis);
  return analysis;
}

// A made-up edition: two ordinary species (one also takes constant
// repliers), a rare one, a thin-evidence one, and two variants.
function copyFor(slug: string) {
  return {
    art: { file: "moth.svg", anchors: { head: [120, 100] as [number, number], shoulders: [120, 98] as [number, number], mouth: [120, 90] as [number, number] }, propScale: 1 },
    verdicts: [{ id: `${slug}.verdict`, text: `${slug} verdict` }, { id: `${slug}.verdict.hungry`, text: `hungry ${slug} verdict`, variant: "hungry" }],
    natures: [
      { id: `${slug}.asks`, text: `${slug} asks`, when: [{ measure: "questionRate.share", direction: "high" as const, minPercentile: 75 }] },
      ...[1, 2, 3].map((i) => ({ id: `${slug}.general.${i}`, text: `${slug} general ${i}`, when: [] })),
    ],
  };
}

const band = (prefix: string) => [1, 2, 3, 4, 5].map((i) => ({ id: `${prefix}.${i}`, text: `${prefix} ${i}` }));
export const EDITION: Edition = {
  id: "test",
  name: "Test",
  mark: "Test",
  thin: { minTweets: 30, minEligibleSpecies: 2 },
  replier: { maxOriginals: 19, minReplyShare: 0.5 },
  species: [
    { ...copyFor("asker"), slug: "asker", name: "Asker", genus: "G", gender: "m", signals: [{ measure: "questionRate.share", direction: "high" }] },
    { ...copyFor("linker"), slug: "linker", name: "Linker", genus: "G", gender: "f", signals: [{ measure: "linkShare.share", direction: "high" }], route: "replier" },
    { ...copyFor("quiet"), slug: "quiet", name: "Quiet", genus: "G", epithet: "e", signals: [], route: "thin", variants: false },
    {
      ...copyFor("shifter"),
      slug: "shifter",
      name: "Shifter",
      epithet: "e",
      genus: "G",
      signals: [{ measure: "originalsVsRepliesGap.lengthGap", direction: "high" }],
      rare: { minScore: 90 },
      variants: false,
    },
  ],
  variants: [
    { slug: "hungry", name: "Hungry", epithet: "e", signals: [{ measure: "appetite.score", direction: "high" }] },
    { slug: "stitched", name: "Stitched", epithet: { f: "consuta", m: "consutus", n: "consutum" }, signals: [{ measure: "assemblage.share", direction: "high" }] },
  ],
  diet: { terms: 2, minEnglishShare: 0.5 },
  inks: [{ id: "ink", key: "#2A43A6", fill: "#FF4F9A" }],
  paper: "#F3EEE3",
  headings: { humours: "Humours", natures: "Natures", habitat: "Habitat", generosity: "Generosity", diet: "Diet", call: "Call" },
  humours: [{ id: "curious", name: "Curious", signals: [{ measure: "questionRate.share", direction: "high" }], bands: band("curious") }],
  sharedNatures: [{ id: "shared.links", text: "shares links", when: [{ measure: "linkShare.share", direction: "high", minPercentile: 75 }] }],
  system: {
    footer: "footer",
    title: { withVariant: "Of the {variant} {species}", plain: "Of the {species}" },
    handle: "@{handle}",
    rarity: { template: "{label} {percent}%", bands: [{ id: "rare", upToPercent: 20, label: "Rare" }, { id: "common", upToPercent: 100, label: "Common" }] },
    habitat: { template: "{pace} since {year}", pace: [{ id: "busy", minPostsPerDay: 1, text: "Busy" }, { id: "quiet", minPostsPerDay: 0, text: "Quiet" }] },
    generosity: { measure: "likesGivenPerPost.ratio", bands: [{ id: "kind", upToPercentile: 100, text: "Kind" }] },
    humours: { scoreTemplate: "{numeral} of V", unmeasured: "not measured" },
    evidence: { tiers: [{ id: "i", minTweets: 0, label: "Low" }, { id: "ii", minTweets: 40, label: "High" }], heavyPosterDays: 1 },
    observations: { heading: "Observations", diet: "It eats:", callPost: "It cries:", callPhrase: "It says:" },
  },
};

const LINK = { entities: { urls: [{ expanded_url: "https://example.com" }] } };

// 40 originals, some asking questions and some carrying links, plus replies.
export function account(questions: number, links: number, replies = 0, originalText = "A plain post about lanterns") {
  return analyze([
    ...times(questions, () => tweet({ text: "Is it so?" })),
    ...times(links, () => tweet({ text: originalText, ...LINK })),
    ...times(40 - questions - links, () => tweet({ text: originalText })),
    ...times(replies, () => replyTo("someone", "no")),
  ]);
}

const CALIBRATION = [account(0, 0), account(5, 5), account(10, 10), account(20, 2), account(2, 20), account(15, 15, 20)];
export const TABLES = buildTables("test", CALIBRATION, CALIBRATION.map(() => []));
export const SCORES = buildScoreTables(EDITION, TABLES, CALIBRATION);

