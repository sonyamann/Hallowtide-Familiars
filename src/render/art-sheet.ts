// art-sheet: the diagnosis card for every result, one row per variant, for
// reviewing the pictures in their palettes. Writes out/art-sheet.png, and
// each card at full size to out/gallery-<result>.png. Also writes every
// result's link preview: out/preview-sheet.png and out/preview-<result>.png.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadActiveConfig, loadEdition, type Species, type Variant } from "../content.ts";
import { OUT_DIR } from "../paths.ts";
import type { Card } from "../select.ts";
import { CARD_HEIGHT, CARD_WIDTH, diagnosisSvg } from "./cards.ts";
import { renderPng } from "./png.ts";
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, previewSvg } from "./preview.ts";

const edition = loadEdition(loadActiveConfig().edition);
const { system } = edition;
const SCALE = 0.4;
const W = CARD_WIDTH * SCALE;
const H = CARD_HEIGHT * SCALE;

function cardFor(species: Species, variant: Variant | null): Card {
  const palette = variant?.palette ?? species.palette;
  const epithet = variant ? (typeof variant.epithet === "string" ? variant.epithet : variant.epithet[species.gender!]) : species.epithet!;
  const title = variant
    ? system.title.withVariant.replace("{variant}", variant.name).replace("{species}", species.name)
    : system.title.plain.replace("{species}", species.name);
  return {
    handle: "specimen",
    edition: edition.id,
    route: "signals",
    species: species.slug,
    variant: variant?.slug ?? null,
    ink: edition.inks.find((i) => i.id === palette) ?? edition.inks[0]!,
    diagnosis: {
      title,
      binomial: { genus: species.genus, epithet },
      handle: "@specimen",
      verdict: species.verdicts.find((v) => v.variant === variant?.slug) ?? species.verdicts[0]!,
      rarity: { band: "uncommon", percent: 6, text: "Uncommon · 6% of specimens" },
      mark: edition.mark,
      footer: system.footer,
    },
    scorecard: { humours: null, unmeasured: null, habitat: { pace: "", text: "" }, generosity: null, observations: null, natures: [], evidence: { tier: "", label: "" }, mark: edition.mark, footer: system.footer },
  };
}

const withVariants = edition.species.filter((s) => s.variants !== false);
const rows: [Species, Variant | null][][] = [
  ...edition.variants.map((v) => withVariants.map((s): [Species, Variant] => [s, v])),
  edition.species.filter((s) => s.variants === false).map((s): [Species, null] => [s, null]),
];

mkdirSync(OUT_DIR, { recursive: true });
const cols = Math.max(...rows.map((r) => r.length));
const parts = [`<rect width="${cols * W}" height="${rows.length * H}" fill="#000"/>`];
rows.forEach((row, r) => {
  row.forEach(([species, variant], c) => {
    const png = renderPng(diagnosisSvg(edition, cardFor(species, variant)));
    writeFileSync(join(OUT_DIR, `gallery-${species.slug}${variant ? `-${variant.slug}` : ""}.png`), png);
    parts.push(`<image x="${c * W}" y="${r * H}" width="${W}" height="${H}" href="data:image/png;base64,${png.toString("base64")}"/>`);
  });
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * W}" height="${rows.length * H}">\n${parts.join("\n")}\n</svg>\n`;
writeFileSync(join(OUT_DIR, "art-sheet.png"), renderPng(svg));
console.log("Wrote out/art-sheet.png");

// The link previews, four across.
const all = rows.flat();
const PW = PREVIEW_WIDTH * 0.5;
const PH = PREVIEW_HEIGHT * 0.5;
const previews = all.map(([species, variant], i) => {
  const png = renderPng(previewSvg(edition, cardFor(species, variant)));
  writeFileSync(join(OUT_DIR, `preview-${species.slug}${variant ? `-${variant.slug}` : ""}.png`), png);
  return `<image x="${(i % 4) * PW}" y="${Math.floor(i / 4) * PH}" width="${PW}" height="${PH}" href="data:image/png;base64,${png.toString("base64")}"/>`;
});
const sheetHeight = Math.ceil(all.length / 4) * PH;
writeFileSync(join(OUT_DIR, "preview-sheet.png"), renderPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${4 * PW}" height="${sheetHeight}"><rect width="${4 * PW}" height="${sheetHeight}" fill="#000"/>${previews.join("")}</svg>`));
console.log("Wrote out/preview-sheet.png");
