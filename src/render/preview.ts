// The link-preview image, 1200 × 630: what a feed or a chat shows when
// someone posts the link to a result's share page. Previews are wide, so
// this is its own layout from the diagnosis card's parts: the creature on
// the left with its rarity stamp; the handle, title, Latin name, and
// verdict on the right. There is no footer: apps print the site's address
// under a preview themselves.

import type { Edition } from "../content.ts";
import type { Card } from "../select.ts";
import { inksOf, LayoutError, stamp, STAMP_HEIGHT, twoInk } from "./cards.ts";
import { figure } from "./figure.ts";
import { balance, baseline, measure, n, textBlock, textLine, withFaces, wrap } from "./type.ts";

export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 630;

const MARGIN = 64;
const PICTURE = 440;
const LEFT = MARGIN + PICTURE + 56;
const RIGHT = PREVIEW_WIDTH - MARGIN;
const WIDTH = RIGHT - LEFT;
// The text sits between these.
const TOP = 70;
const BOTTOM = PREVIEW_HEIGHT - 70;

// The title on two lines: the template's lead-in ("Of the"), then the
// creature's name, so the name is never split.
function titleLines(edition: Edition, title: string): string[] {
  const { withVariant, plain } = edition.system.title;
  for (const template of [withVariant, plain]) {
    const lead = template.slice(0, template.indexOf("{")).trim();
    if (lead && title.startsWith(`${lead} `)) return [lead, title.slice(lead.length + 1)];
  }
  return [title];
}

export function previewSvg(edition: Edition, card: Card): string {
  return withFaces(edition.faces, () => preview(edition, card));
}

function preview(edition: Edition, card: Card): string {
  const inks = inksOf(edition, card);
  const d = card.diagnosis;
  const species = edition.species.find((s) => s.slug === card.species)!;
  const variant = edition.variants.find((v) => v.slug === card.variant) ?? null;

  const parts = [
    `<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${inks.paper}"/>`,
    ...[20, 23.4].map(
      (i) => `<rect x="${i}" y="${i}" width="${n(PREVIEW_WIDTH - 2 * i)}" height="${n(PREVIEW_HEIGHT - 2 * i)}" fill="none" stroke="${inks.accent}" stroke-width="2.4"/>`,
    ),
  ];

  // The creature. `figure` draws a square a little narrower than the width
  // it is given, so ask for the width that makes the square PICTURE across.
  const pictureTop = (PREVIEW_HEIGHT - PICTURE) / 2;
  const asked = (PICTURE * 240) / 225;
  parts.push(figure(edition.id, species, variant, inks, MARGIN - (asked - PICTURE) / 2, pictureTop, asked, "fig"));
  parts.push(stamp(d.rarity.text, MARGIN + PICTURE + 30, pictureTop + PICTURE - STAMP_HEIGHT - 4, inks));

  // The text: the largest title and verdict that fit together.
  const handleLine = 30;
  const nameLine = 38;
  const fixed = handleLine + 14 + 6 + nameLine + 18 + 18;
  const lines = titleLines(edition, d.title);
  let fit: { size: number; verdictSize: number; verdictLines: ReturnType<typeof wrap> } | undefined;
  for (const verdictSize of [32, 30, 28, 26]) {
    const verdictLines = balance([{ text: d.verdict.text, face: "serif" }], verdictSize, WIDTH);
    for (let size = 84; size >= 56 && !fit; size -= 2) {
      const height = fixed + lines.length * size * 1.02 + verdictLines.length * verdictSize * 1.36;
      if (lines.every((l) => measure(l, "black", size) <= WIDTH) && height <= BOTTOM - TOP) fit = { size, verdictSize, verdictLines };
    }
    if (fit) break;
  }
  if (!fit) throw new LayoutError(`link preview overflows: ${d.title} / ${d.verdict.id}`);

  const titleLine = fit.size * 1.02;
  const verdictLine = fit.verdictSize * 1.36;
  const height = fixed + lines.length * titleLine + fit.verdictLines.length * verdictLine;
  let y = TOP + (BOTTOM - TOP - height) / 2;
  parts.push(textLine(d.handle, LEFT, y + baseline("monoBold", 22, handleLine), { face: "monoBold", size: 22, fill: inks.key, letterSpacing: 1.6 }));
  y += handleLine + 14;
  for (const line of lines) {
    parts.push(twoInk(line, LEFT, y + baseline("black", fit.size, titleLine), fit.size, inks));
    y += titleLine;
  }
  y += 6;
  parts.push(textLine(`${d.binomial.genus} ${d.binomial.epithet}`, LEFT, y + baseline("serifItalic", 28, nameLine), { face: "serifItalic", size: 28, fill: inks.key }));
  y += nameLine + 18;
  parts.push(`<line x1="${LEFT}" x2="${RIGHT}" y1="${n(y)}" y2="${n(y)}" stroke="${inks.key}" stroke-width="1"/>`);
  y += 18;
  parts.push(textBlock(fit.verdictLines, y, verdictLine, { face: "serif", size: fit.verdictSize, fill: inks.key }, LEFT).svg);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">\n${parts.join("\n")}\n</svg>\n`;
}
