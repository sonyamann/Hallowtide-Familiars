import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSnapshot } from "../src/analyze.ts";
import { classify } from "../src/classify.ts";
import { fill, roman, selectCard } from "../src/select.ts";
import { NO_OWN_WORDS } from "../src/own-words.ts";
import { makeSnapshot } from "../src/snapshot.ts";
import { account, EDITION, SCORES, TABLES } from "./edition-fixture.ts";
import { HANDLE, page, times, tweet } from "./helpers.ts";

const card = (analysis: ReturnType<typeof account>, own = NO_OWN_WORDS) =>
  selectCard(EDITION, TABLES, SCORES, analysis, classify(EDITION, TABLES, SCORES, analysis), own);

test("templates are filled from content, and a missing value is an error", () => {
  assert.equal(fill("Of the {variant} {species}", { variant: "Vampire", species: "Moth" }), "Of the Vampire Moth");
  assert.throws(() => fill("{label} · {percent}%", { label: "Rare" }), /percent/);
});

test("roman numerals cover scores and years", () => {
  assert.deepEqual([1, 4, 5, 9, 2011, 2026].map(roman), ["I", "IV", "V", "IX", "MMXI", "MMXXVI"]);
});

test("a full card: title, binomial, verdict for the variant, three natures", () => {
  const c = card(account(30, 0));
  assert.equal(c.species, "asker");
  assert.equal(c.diagnosis.title, `Of the ${c.variant === "hungry" ? "Hungry" : "Stitched"} Asker`);
  assert.equal(c.diagnosis.binomial.genus, "G");
  // The asker's genus is masculine, so a gendered epithet takes that form.
  assert.equal(c.diagnosis.binomial.epithet, c.variant === "hungry" ? "e" : "consutus");
  assert.equal(c.diagnosis.handle, "@specimen");
  assert.ok(["asker.verdict", `asker.verdict.${c.variant}`].includes(c.diagnosis.verdict.id));
  // The species' own matching nature comes first, then fallbacks fill to three.
  assert.equal(c.scorecard.natures.length, 3);
  assert.equal(c.scorecard.natures[0]!.id, "asker.asks");
  assert.equal(c.scorecard.humours!.length, 1);
  assert.match(c.scorecard.humours![0]!.score, /^[IV]+ of V$/);
  assert.equal(c.scorecard.habitat.text, "Busy since MMXI");
  assert.equal(c.scorecard.evidence.tier, "ii");
});

test("the thin card has no humours, no variant and the lowest evidence tier", () => {
  const thin = analyzeSnapshot(makeSnapshot(HANDLE, [page(times(10, () => tweet()))], new Date("2026-10-02")))!;
  const c = card(thin);
  assert.equal(c.species, "quiet");
  assert.equal(c.diagnosis.title, "Of the Quiet");
  assert.equal(c.diagnosis.binomial.epithet, "e");
  assert.equal(c.scorecard.humours, null);
  assert.equal(c.scorecard.unmeasured, "not measured");
  assert.equal(c.scorecard.evidence.tier, "i");
  assert.equal(c.scorecard.natures.length, 3);
});

test("the user's own words appear only when supplied already screened, behind lead-ins", () => {
  assert.equal(card(account(10, 10)).scorecard.observations, null);

  const post = card(account(10, 10), { call: { source: "tweet", text: "A plain post" }, diet: ["lanterns"] });
  assert.deepEqual(post.scorecard.observations, {
    heading: "Observations",
    diet: { lead: "It eats:", terms: ["lanterns"] },
    call: { lead: "It cries:", source: "tweet", text: "A plain post" },
  });

  // A most-used phrase is introduced differently from a whole post.
  const phrase = card(account(10, 10), { call: { source: "phrase", text: "moon cheese" }, diet: null });
  assert.deepEqual(phrase.scorecard.observations, {
    heading: "Observations",
    diet: null,
    call: { lead: "It says:", source: "phrase", text: "moon cheese" },
  });
});

test("the same account always gets the same card", () => {
  assert.deepEqual(card(account(10, 10)), card(account(10, 10)));
});
