// render @handle [--refresh] [--no-screen]
//
// Draws both cards and the link preview for the handle and writes them to
// out/ as PNG files.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jevClient } from "./jev.ts";
import { LABELS_DIR, OUT_DIR } from "./paths.ts";
import { buildCard, loadReference } from "./pipeline.ts";
import { diagnosisSvg, scorecardSvg } from "./render/cards.ts";
import { previewSvg } from "./render/preview.ts";
import { renderPng } from "./render/png.ts";
import { fail, specimenFromArgs } from "./specimen.ts";

const ref = loadReference();
const { snapshot } = await specimenFromArgs("npm run render -- @handle [--refresh] [--no-screen]");

const apiKey = process.env.TYPESAFE_API_KEY;
const screening = !process.argv.includes("--no-screen");
if (screening && !apiKey) fail("missing_classifier_key", "Set TYPESAFE_API_KEY in .env, or pass --no-screen");
const run = await buildCard(ref, snapshot, screening ? jevClient({ apiKey: apiKey!, model: ref.screenConfig.model }) : null, LABELS_DIR);
if (!run) fail("no_specimen");
if (screening && !run.screened) console.error("The classifier could not be reached, so the scorecard has no Call or Diet.");

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, svg] of [
  ["diagnosis", diagnosisSvg(ref.edition, run.card)],
  ["scorecard", scorecardSvg(ref.edition, run.card)],
  ["preview", previewSvg(ref.edition, run.card)],
] as const) {
  const file = join(OUT_DIR, `${run.card.handle}-${name}.png`);
  writeFileSync(file, renderPng(svg));
  console.log(`Wrote ${file}`);
}
