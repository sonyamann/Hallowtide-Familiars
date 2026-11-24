import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPng } from "../src/render/png.ts";
import { balance, baseline, measure, textBlock, textLine, wrap } from "../src/render/type.ts";

test("text is measured from the bundled fonts", () => {
  // Space Mono is monospaced: every character is 0.612 of the size.
  assert.equal(Math.round(measure("abc", "mono", 100)), 184);
  assert.equal(measure("abc", "mono", 100, 10), measure("abc", "mono", 100) + 30);
  assert.ok(measure("Of the Moth", "black", 76) > 300);
});

test("lines break at the given width, and can be shorter at the top", () => {
  const runs = [{ text: "the quick brown fox jumps over the lazy dog", face: "mono" as const }];
  // At size 10 each character is 6.12 wide, so 20 characters fit in 123.
  assert.deepEqual(wrap(runs, 10, 123).map((l) => l.runs[0]!.text), ["the quick brown fox", "jumps over the lazy", "dog"]);
  const stepped = wrap(runs, 10, (line) => (line === 0 ? 62 : 123));
  assert.deepEqual(stepped.map((l) => l.runs[0]!.text), ["the quick", "brown fox jumps over", "the lazy dog"]);
});

test("balanced lines are as even as they will go, in the same number of lines", () => {
  const runs = [{ text: "the quick brown fox jumps over the lazy dog", face: "mono" as const }];
  assert.deepEqual(wrap(runs, 10, 230).map((l) => l.runs[0]!.text), ["the quick brown fox jumps over the", "lazy dog"]);
  assert.deepEqual(balance(runs, 10, 230).map((l) => l.runs[0]!.text), ["the quick brown fox", "jumps over the lazy dog"]);
  // A single line stays as it is.
  assert.equal(balance(runs, 10, 500).length, 1);
});

test("a run in another face keeps its own style inside the line", () => {
  const [line] = wrap([{ text: "plain ", face: "serifItalic" }, { text: "roman", face: "serif" }], 18, 500);
  const svg = textLine(line!, 0, 20, { face: "serifItalic", size: 18, fill: "#000" });
  assert.match(svg, /^<text [^>]*font-style="italic"/);
  assert.match(svg, /<tspan [^>]*font-style="normal"[^>]*>roman<\/tspan>/);
});

test("the same SVG always renders to the same PNG bytes", () => {
  const lines = wrap([{ text: "It hath a candle of its own, and yet is ever found at its neighbour's.", face: "serif" }], 24, 300);
  const block = textBlock(lines, 20, 34, { face: "serif", size: 24, fill: "#2A43A6" }, 20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="160"><rect width="340" height="160" fill="#F3EEE3"/>
<circle cx="250" cy="110" r="40" fill="#FF4F9A"/><g style="mix-blend-mode:multiply">${block.svg}</g></svg>`;
  const first = renderPng(svg);
  assert.deepEqual(renderPng(svg), first);
  assert.equal(first.subarray(1, 4).toString(), "PNG");
  assert.ok(baseline("serif", 24, 34) > 17);
});

// --- The card templates, against the real edition content.

import { loadActiveConfig, loadEdition } from "../src/content.ts";
import { diagnosisSvg, scorecardSvg } from "../src/render/cards.ts";
import { previewSvg } from "../src/render/preview.ts";
import type { Card } from "../src/select.ts";

const edition = loadEdition(loadActiveConfig().edition);
const LONGEST_HANDLE = "@fifteen_chars_x";
// As long as the Call is allowed to be.
const LONG_CALL = "Something people from outside the valley will never understand about the lanterns here is how long it takes to trim them all before the first frost, and how nobody ever thanks you for it, not once, in years.".slice(0, 220);

function cardFor(speciesSlug: string, variantSlug: string | null, verdictIndex: number, natures: Card["scorecard"]["natures"]): Card {
  const species = edition.species.find((s) => s.slug === speciesSlug)!;
  const variant = edition.variants.find((v) => v.slug === variantSlug) ?? null;
  const { system } = edition;
  const epithet = variant ? (typeof variant.epithet === "string" ? variant.epithet : variant.epithet[species.gender!]) : species.epithet!;
  const title = variant
    ? system.title.withVariant.replace("{variant}", variant.name).replace("{species}", species.name)
    : system.title.plain.replace("{species}", species.name);
  const longest = <T extends { text: string }>(list: T[]) => list.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  return {
    handle: LONGEST_HANDLE.slice(1),
    edition: edition.id,
    route: "signals",
    species: speciesSlug,
    variant: variantSlug,
    ink: edition.inks[0]!,
    diagnosis: {
      title,
      binomial: { genus: species.genus, epithet },
      handle: LONGEST_HANDLE,
      verdict: species.verdicts[verdictIndex]!,
      rarity: { band: "very-rare", percent: 0.1, text: "Very rare · 0.1% of specimens" },
      mark: edition.mark,
      footer: system.footer,
    },
    scorecard: {
      humours: species.route === "thin" ? null : edition.humours.map((h) => ({ id: h.id, name: h.name, band: 5, score: "III of V", line: longest(h.bands) })),
      unmeasured: species.route === "thin" ? system.humours.unmeasured : null,
      habitat: { pace: "x", text: `${longest(system.habitat.pace).text} since MDCCCLXXXVIII` },
      generosity: longest(system.generosity.bands),
      natures,
      observations: {
        heading: system.observations.heading,
        diet: { lead: system.observations.diet, terms: ["lamplighting", "candlemakers", "apothecaries", "weathervanes"] },
        call: { lead: system.observations.callPost, text: LONG_CALL, source: "tweet" },
      },
      evidence: { tier: "iii", label: longest(system.evidence.tiers.map((t) => ({ text: t.label }))).text },
      mark: edition.mark,
      footer: system.footer,
    },
  };
}

test("every title and verdict fits the diagnosis card and the link preview", () => {
  for (const species of edition.species) {
    const variants = species.variants === false ? [null] : edition.variants.map((v) => v.slug);
    for (const variant of variants) {
      species.verdicts.forEach((v, i) => {
        if (v.variant && v.variant !== variant) return;
        assert.doesNotThrow(() => diagnosisSvg(edition, cardFor(species.slug, variant, i, [])), `${species.slug}/${variant}/${v.id}`);
        assert.doesNotThrow(() => previewSvg(edition, cardFor(species.slug, variant, i, [])), `preview ${species.slug}/${variant}/${v.id}`);
      });
    }
  }
});

test("the fullest possible scorecard fits: longest natures, lines, Diet, and Call", () => {
  const byLength = (a: { text: string }, b: { text: string }) => b.text.length - a.text.length;
  for (const species of edition.species) {
    // The three longest natures this species could ever show together.
    const natures = [...species.natures, ...edition.sharedNatures].sort(byLength).slice(0, 3);
    const variant = species.variants === false ? null : "monstrous";
    assert.doesNotThrow(() => scorecardSvg(edition, cardFor(species.slug, variant, 0, natures)), species.slug);
  }
});

test("a card renders to the same bytes every time", () => {
  const card = cardFor("moth", "vampire", 0, edition.species.find((s) => s.slug === "moth")!.natures.slice(0, 3));
  for (const svg of [diagnosisSvg(edition, card), scorecardSvg(edition, card)]) {
    assert.deepEqual(renderPng(svg), renderPng(svg));
  }
  assert.equal(diagnosisSvg(edition, card), diagnosisSvg(edition, card));
});
