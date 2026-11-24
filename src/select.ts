import type { Analysis } from "./analyze.ts";
import { percentilesOf, type CalibrationTables } from "./calibration.ts";
import { handleSeed, rawScore, type Result, type ScoreTables } from "./classify.ts";
import type { Edition, Line, Nature, Species, Variant } from "./content.ts";
import type { Measures } from "./measures.ts";
import type { OwnWords } from "./own-words.ts";

// Everything both cards show, already chosen. Each piece of text is a content
// line (kept with its id for review and tests) or a content template filled
// with names, numbers and the user's own terms. No text is written here.
export interface Card {
  handle: string;
  edition: string;
  route: Result["route"];
  species: string;
  variant: string | null;
  ink: { id: string; key: string; fill: string; accent?: string; paper?: string };
  diagnosis: {
    title: string;
    binomial: { genus: string; epithet: string };
    handle: string;
    verdict: Line;
    rarity: { band: string; percent: number; text: string };
    mark: string;
    footer: string;
  };
  scorecard: {
    // Null on the thin scorecard, which shows `unmeasured` instead.
    humours: { id: string; name: string; band: number; score: string; line: Line }[] | null;
    unmeasured: string | null;
    habitat: { pace: string; text: string };
    generosity: Line | null;
    // The user's own words, already screened, each behind a lead-in from the
    // content files. They sit in a block of their own, set apart from the
    // card's voice. Null when neither is shown.
    observations: {
      heading: string;
      diet: { lead: string; terms: string[] } | null;
      call: { lead: string; text: string; source: "tweet" | "phrase" } | null;
    } | null;
    natures: Line[];
    evidence: { tier: string; label: string };
    mark: string;
    footer: string;
  };
}

const NATURES_SHOWN = 3;

export function selectCard(
  edition: Edition,
  tables: CalibrationTables,
  scores: ScoreTables,
  analysis: Analysis,
  result: Result,
  own: OwnWords,
): Card {
  const seed = handleSeed(analysis.handle);
  const percentiles = percentilesOf(tables, analysis);
  const species = edition.species.find((s) => s.slug === result.species)!;
  const variant = edition.variants.find((v) => v.slug === result.variant) ?? null;
  const { system } = edition;
  const thin = result.route === "thin";

  const title = variant
    ? fill(system.title.withVariant, { variant: variant.name, species: species.name })
    : fill(system.title.plain, { species: species.name });

  const verdicts = species.verdicts.filter((v) => !v.variant || v.variant === result.variant);
  const verdict = line(pick(verdicts, seed));

  const key = variant ? `${species.slug}/${variant.slug}` : species.slug;
  const percent = (100 * (scores.resultCounts[key] ?? 0)) / Math.max(scores.accounts, 1);
  const rarityBand = system.rarity.bands.find((b) => percent <= b.upToPercent) ?? system.rarity.bands.at(-1)!;
  const shownPercent = percent < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);

  const humours = thin
    ? null
    : edition.humours.map((h) => {
        // A humour whose inputs are unknown sits in the middle band.
        const p = rawScore({ slug: h.id, name: h.name, signals: h.signals }, percentiles) ?? 50;
        const band = Math.min(4, Math.floor(p / 20));
        return {
          id: h.id,
          name: h.name,
          band: band + 1,
          score: fill(system.humours.scoreTemplate, { numeral: roman(band + 1) }),
          line: line(h.bands[band]!),
        };
      });

  const postsPerDay = analysis.features.habitat.postsPerDay ?? 0;
  const pace = system.habitat.pace.find((p) => postsPerDay >= p.minPostsPerDay) ?? system.habitat.pace.at(-1)!;
  const year = analysis.features.habitat.joinedYear;
  const habitat = { pace: pace.id, text: fill(system.habitat.template, { pace: pace.text, year: year ? roman(year) : "" }) };

  const generosityP = percentiles[system.generosity.measure];
  const generosity =
    generosityP === undefined ? null : line(system.generosity.bands.find((b) => generosityP <= b.upToPercentile) ?? system.generosity.bands.at(-1)!);

  return {
    handle: analysis.handle,
    edition: edition.id,
    route: result.route,
    species: species.slug,
    variant: variant?.slug ?? null,
    // The variant sets the palette, or the species if it has no variant. An
    // edition that names none falls back to the handle seed.
    ink: edition.inks.find((i) => i.id === (variant?.palette ?? species.palette)) ?? pick(edition.inks, seed >>> 8),
    diagnosis: {
      title,
      binomial: { genus: species.genus, epithet: epithetFor(species, variant) },
      handle: fill(system.handle, { handle: analysis.handle }),
      verdict,
      rarity: { band: rarityBand.id, percent: shownPercent, text: fill(system.rarity.template, { label: rarityBand.label, percent: String(shownPercent) }) },
      mark: edition.mark,
      footer: system.footer,
    },
    scorecard: {
      humours,
      unmeasured: thin ? system.humours.unmeasured : null,
      habitat,
      generosity,
      observations:
        own.diet || own.call
          ? {
              heading: system.observations.heading,
              diet: own.diet && { lead: system.observations.diet, terms: own.diet },
              call: own.call && {
                lead: own.call.source === "tweet" ? system.observations.callPost : system.observations.callPhrase,
                ...own.call,
              },
            }
          : null,
      natures: natures(species.natures, edition.sharedNatures, percentiles, seed),
      evidence: evidence(edition, analysis, thin),
      mark: edition.mark,
      footer: system.footer,
    },
  };
}

// Three natures: those whose conditions the account meets most strongly,
// with at least one of the species' own, then fallbacks with no conditions.
function natures(own: Nature[], shared: Nature[], percentiles: Measures, seed: number): Line[] {
  const strength = (n: Nature): number | null => {
    if (!n.when.length) return null;
    let weakest = Infinity;
    for (const c of n.when) {
      const p = percentiles[c.measure];
      if (p === undefined) return null;
      const fromEnd = c.direction === "high" ? p : 100 - p;
      if (fromEnd < c.minPercentile) return null;
      weakest = Math.min(weakest, fromEnd);
    }
    return weakest;
  };
  // Strongest first; of two equally strong, the more demanding one.
  const demand = (n: Nature) => Math.max(0, ...n.when.map((c) => c.minPercentile));
  const byStrength = (list: Nature[]) =>
    seeded(list.filter((n) => strength(n) !== null), seed).sort((a, b) => strength(b)! - strength(a)! || demand(b) - demand(a));

  // No two natures about the same trait: a card should say three things.
  const chosen: Nature[] = [];
  const traits = new Set<string>();
  const take = (n: Nature) => {
    if (chosen.length >= NATURES_SHOWN || n.when.some((c) => traits.has(c.measure))) return;
    chosen.push(n);
    for (const c of n.when) traits.add(c.measure);
  };
  const ownMatches = byStrength(own);
  if (ownMatches[0]) take(ownMatches[0]);
  for (const n of byStrength([...ownMatches.slice(1), ...shared])) take(n);
  for (const n of seeded(own.filter((n) => !n.when.length), seed)) take(n);
  return chosen.map(line);
}

function evidence(edition: Edition, analysis: Analysis, thin: boolean): Card["scorecard"]["evidence"] {
  const { tiers, heavyPosterDays } = edition.system.evidence;
  const authored = analysis.counts.tweets - analysis.counts.retweets;
  let index = thin ? 0 : tiers.findLastIndex((t) => authored >= t.minTweets);
  // A sample covering only a few days says little about rhythm and silences.
  if (analysis.counts.spanDays < heavyPosterDays) index = Math.min(index, tiers.length - 2);
  const tier = tiers[Math.max(index, 0)]!;
  return { tier: tier.id, label: tier.label };
}

// The variant supplies the epithet, in the form that agrees with the genus;
// a species without variants carries its own.
function epithetFor(species: Species, variant: Variant | null): string {
  if (!variant) return species.epithet!;
  return typeof variant.epithet === "string" ? variant.epithet : variant.epithet[species.gender!];
}

// Fills {placeholders} in a content template. Every placeholder must have a
// value, so a template can't silently show a gap.
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`template "${template}" needs a value for {${name}}`);
    return values[name]!;
  });
}

export function roman(n: number): string {
  const numerals: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [value, numeral] of numerals) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

function line(l: Line): Line {
  return { id: l.id, text: l.text };
}

function pick<T>(list: T[], seed: number): T {
  return list[seed % list.length]!;
}

// A stable shuffle by the handle seed, so equal-strength choices vary between
// people but never between runs.
function seeded<T extends { id: string }>(list: T[], seed: number): T[] {
  const key = (id: string) => {
    let h = seed;
    for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
    return h;
  };
  return [...list].sort((a, b) => key(a.id) - key(b.id) || (a.id < b.id ? -1 : 1));
}
