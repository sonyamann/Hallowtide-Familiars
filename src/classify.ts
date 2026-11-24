import { createHash } from "node:crypto";
import type { Analysis } from "./analyze.ts";
import { percentilesOf, type CalibrationTables } from "./calibration.ts";
import type { Edition, Species, Trait } from "./content.ts";
import type { Measures } from "./measures.ts";

// How every calibration account scores on each species and variant, sorted
// ascending. A user's raw score is re-ranked against these, so that a trait
// built from one signal can be compared fairly with one that averages several
// (averaging pulls scores toward the middle).
export interface ScoreTables {
  edition: string;
  calibration: string;
  species: Record<string, number[]>;
  variants: Record<string, number[]>;
  // How many calibration accounts got each result ("species" and
  // "species/variant"), out of `accounts`: the rarity stamp.
  accounts: number;
  resultCounts: Record<string, number>;
}

export interface Result {
  handle: string;
  edition: string;
  calibration: string;
  // How the species was reached: compared on signals, or by one of the rules.
  route: "signals" | "rare" | "replier" | "thin";
  species: string;
  variant: string | null;
  // Re-ranked scores, 0–100; null where the trait's signals are unknown.
  speciesScores: Record<string, number | null>;
  variantScores: Record<string, number | null>;
  // The second-placed species and how far behind it was, for reviewing close calls.
  runnerUp: string | null;
  margin: number | null;
}

// A trait's score from the account's percentiles, or null if any of its
// signals is unknown or it has none.
export function rawScore(trait: Trait, percentiles: Measures): number | null {
  if (!trait.signals.length) return null;
  const parts: number[] = [];
  for (const { measure, direction } of trait.signals) {
    const p = percentiles[measure];
    if (p === undefined) return null;
    parts.push(direction === "high" ? p : 100 - p);
  }
  return trait.combine === "max" ? Math.max(...parts) : parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function buildScoreTables(edition: Edition, tables: CalibrationTables, analyses: Analysis[]): ScoreTables {
  const species: Record<string, number[]> = Object.fromEntries(edition.species.map((s) => [s.slug, []]));
  const variants: Record<string, number[]> = Object.fromEntries(edition.variants.map((v) => [v.slug, []]));
  for (const analysis of analyses) {
    const percentiles = percentilesOf(tables, analysis);
    for (const [traits, into] of [[edition.species, species], [edition.variants, variants]] as const) {
      for (const trait of traits) {
        const score = rawScore(trait, percentiles);
        if (score !== null) into[trait.slug]!.push(round(score));
      }
    }
  }
  for (const list of [...Object.values(species), ...Object.values(variants)]) list.sort((a, b) => a - b);
  const scores: ScoreTables = { edition: edition.id, calibration: tables.version, species, variants, accounts: 0, resultCounts: {} };
  // Rarity needs the finished score tables, so the accounts are classified last.
  const counts: Record<string, number> = {};
  for (const analysis of analyses) {
    const r = classify(edition, tables, scores, analysis);
    for (const key of r.variant ? [r.species, `${r.species}/${r.variant}`] : [r.species]) counts[key] = (counts[key] ?? 0) + 1;
  }
  scores.accounts = analyses.length;
  scores.resultCounts = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
  return scores;
}

// Two stages: species first, then variant. Species and variant depend on the
// signals only; the handle seed is used solely to break exact ties. In order:
//   thin     too little to read: the "thin" species
//   rare     the rare species qualifies: it wins
//   replier  almost only replies: the "replier" species
//   signals  otherwise the strongest of the ordinary species
// A species marked `"variants": false` never gets a variant.
export function classify(edition: Edition, tables: CalibrationTables, scores: ScoreTables, analysis: Analysis): Result {
  const percentiles = percentilesOf(tables, analysis);
  const seed = handleSeed(analysis.handle);

  const speciesScores: Record<string, number | null> = {};
  let rare: string | null = null;
  for (const s of edition.species) {
    const raw = rawScore(s, percentiles);
    speciesScores[s.slug] = raw === null ? null : s.rare ? raw : rerank(scores.species[s.slug], raw);
    if (s.rare && raw !== null && raw >= s.rare.minScore) rare ??= s.slug;
  }
  const variantScores: Record<string, number | null> = {};
  for (const v of edition.variants) {
    const raw = rawScore(v, percentiles);
    variantScores[v.slug] = raw === null ? null : rerank(scores.variants[v.slug], raw);
  }

  const result = { handle: analysis.handle, edition: edition.id, calibration: tables.version, speciesScores, variantScores };
  const byRoute = (route: Species["route"]) => edition.species.find((s) => s.route === route)!.slug;

  const ordinary = edition.species.filter((s) => !s.rare && s.route !== "thin" && speciesScores[s.slug] !== null).map((s) => s.slug);
  const ranked = rank(ordinary, speciesScores, seed);
  const runnerUp = ranked[1] ?? null;
  const margin = runnerUp === null ? null : speciesScores[ranked[0]!]! - speciesScores[runnerUp]!;

  const { counts } = analysis;
  const authored = counts.tweets - counts.retweets;
  const replyShare = authored ? counts.repliesToOthers / authored : 0;
  let route: Result["route"];
  let species: string;
  if (authored < edition.thin.minTweets) [route, species] = ["thin", byRoute("thin")];
  else if (rare) [route, species] = ["rare", rare];
  else if (counts.originals <= edition.replier.maxOriginals && replyShare >= edition.replier.minReplyShare) {
    [route, species] = ["replier", byRoute("replier")];
  } else if (ordinary.length < edition.thin.minEligibleSpecies) [route, species] = ["thin", byRoute("thin")];
  else [route, species] = ["signals", ranked[0]!];

  const hasVariants = edition.species.find((s) => s.slug === species)!.variants !== false;
  const known = edition.variants.filter((v) => variantScores[v.slug] !== null).map((v) => v.slug);
  const variant = hasVariants ? rank(known.length ? known : edition.variants.map((v) => v.slug), variantScores, seed)[0]! : null;

  // The margin only means something when species were compared. For the rare
  // species, the runner-up is the ordinary species it displaced.
  return {
    ...result,
    route,
    species,
    variant,
    runnerUp: route === "signals" ? runnerUp : route === "rare" ? (ranked[0] ?? null) : null,
    margin: route === "signals" ? margin : null,
  };
}

// Highest score first. Exact ties are ordered by the handle seed, so the same
// handle always resolves them the same way.
function rank(slugs: string[], scores: Record<string, number | null>, seed: number): string[] {
  const order = [...slugs].sort();
  const rotated = order.map((_, i) => order[(i + seed) % order.length]!);
  return rotated.sort((a, b) => (scores[b] ?? -1) - (scores[a] ?? -1));
}

// Where a raw score falls among the calibration accounts' scores, 0–100.
function rerank(sorted: number[] | undefined, raw: number): number {
  if (!sorted?.length) throw new Error("score tables are missing a trait; run `npm run spread` to rebuild them");
  const v = round(raw);
  let below = 0;
  let equal = 0;
  for (const x of sorted) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (100 * (below + equal / 2)) / sorted.length;
}

// A stable number from the handle, for flavour choices and tie-breaks.
export function handleSeed(handle: string): number {
  return createHash("sha256").update(handle.toLowerCase()).digest().readUInt32BE(0);
}

function round(value: number): number {
  return Number(value.toPrecision(6));
}
