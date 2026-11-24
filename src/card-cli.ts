// card @handle [--refresh] [--json] [--no-screen]
//
// Prints everything both cards would show for the handle: a plain-text proof
// for reading, or the full record with line ids with --json. With
// --no-screen the classifier is skipped, so the Call and Diet are left out.

import { jevClient } from "./jev.ts";
import { LABELS_DIR } from "./paths.ts";
import { buildCard, loadReference } from "./pipeline.ts";
import { fail, specimenFromArgs } from "./specimen.ts";

const ref = loadReference();
const { snapshot } = await specimenFromArgs("npm run card -- @handle [--refresh] [--json] [--no-screen]");

const apiKey = process.env.TYPESAFE_API_KEY;
const screening = !process.argv.includes("--no-screen");
if (screening && !apiKey) fail("missing_classifier_key", "Set TYPESAFE_API_KEY in .env, or pass --no-screen");
const ask = screening ? jevClient({ apiKey: apiKey!, model: ref.screenConfig.model }) : null;

const run = await buildCard(ref, snapshot, ask, LABELS_DIR);
if (!run) fail("no_specimen");
const { card } = run;
if (screening && !run.screened) console.error("The classifier could not be reached, so this card has no Call or Diet.");

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(card, null, 2));
} else {
  const d = card.diagnosis;
  const s = card.scorecard;
  const rule = "─".repeat(64);
  console.log([
    rule,
    "DIAGNOSIS CARD" + `ink: ${card.ink.id}`.padStart(50),
    rule,
    d.title,
    `${d.binomial.genus} ${d.binomial.epithet}`,
    d.handle,
    "",
    d.verdict.text,
    "",
    d.rarity.text,
    d.mark,
    d.footer,
    "",
    rule,
    "SCORECARD",
    rule,
    ...(s.humours ? s.humours.map((h) => `${h.name.padEnd(28)} ${h.score.padEnd(10)} ${h.line.text}`) : [s.unmeasured!]),
    "",
    `Habitat     ${s.habitat.text}`,
    ...(s.generosity ? [`Generosity  ${s.generosity.text}`] : []),
    "",
    "Natures",
    ...s.natures.map((n, i) => `  ${["i", "ij", "iij"][i]}. ${n.text}`),
    "",
    ...(s.observations
      ? [
          s.observations.heading,
          ...(s.observations.diet ? [`  Diet. ${s.observations.diet.lead} ${s.observations.diet.terms.join(", ")}.`] : []),
          ...(s.observations.call ? [`  Call. ${s.observations.call.lead} “${s.observations.call.text}”`] : []),
          "",
        ]
      : []),
    s.evidence.label,
    s.mark,
    s.footer,
    rule,
  ].join("\n"));
}
