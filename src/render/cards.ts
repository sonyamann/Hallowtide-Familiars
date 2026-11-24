// The two card templates, 1080 × 1350 (4:5 portrait, the largest shape X
// shows uncropped on a phone). Each takes a finished Card (every word
// already chosen) and returns SVG. Nothing here decides what a card says;
// it only decides where things go.
//
// When two images share a post, X crops each to about 6:5 around its centre,
// which on these cards is the band from y = 217 to y = 1132. The diagnosis
// card keeps its title and creature inside that band.

import type { Edition } from "../content.ts";
import type { Card } from "../select.ts";
import { blend, figure, type Inks } from "./figure.ts";
import { balance, baseline, measure, n, textBlock, textLine, withFaces, wrap, type Run, type TextStyle } from "./type.ts";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const LEFT = 78;
const RIGHT = CARD_WIDTH - 78;
const WIDTH = RIGHT - LEFT;
const CENTRE = CARD_WIDTH / 2;
const TOP = 86;
// The specimen strip's dashed rule; everything else must end above it.
const STRIP = 1262;
const BOTTOM = STRIP - 26;

export class LayoutError extends Error {}

// A piece of a card laid out from y = 0, to be placed once its height is known.
interface Block {
  svg: string;
  height: number;
}

export function inksOf(edition: Edition, card: Card): Inks {
  const { key, fill, accent, paper } = card.ink;
  return { key, fill, accent: accent ?? fill, paper: paper ?? edition.paper, multiply: paper === undefined };
}

function place(block: Block, y: number): string {
  return `<g transform="translate(0 ${n(y)})">\n${block.svg}\n</g>`;
}

// Paper, the double border, and the specimen strip along the bottom.
function frame(inks: Inks, stripLeft: string, stripRight: string): string {
  const strip: TextStyle = { face: "mono", size: 12, fill: inks.key, letterSpacing: 1.2 };
  const at = STRIP + 12 + baseline("mono", 12, 18);
  return [
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${inks.paper}"/>`,
    ...[30.83, 34.17].map(
      (i) => `<rect x="${i}" y="${i}" width="${n(CARD_WIDTH - 2 * i)}" height="${n(CARD_HEIGHT - 2 * i)}" fill="none" stroke="${inks.accent}" stroke-width="${inks.multiply ? 1.67 : 2.4}"/>`,
    ),
    `<line x1="${LEFT}" x2="${RIGHT}" y1="${STRIP}" y2="${STRIP}" stroke="${inks.key}" stroke-width="1" stroke-dasharray="3 2"/>`,
    textLine(stripLeft.toUpperCase(), LEFT, at, strip),
    textLine(stripRight.toUpperCase(), RIGHT, at, { ...strip, anchor: "end" }),
  ].join("\n");
}

// Blackletter with the second ink showing from beneath it.
export function twoInk(text: string, x: number, y: number, size: number, inks: Inks, anchor: TextStyle["anchor"] = "start"): string {
  const shift = Math.max(2, size / 25);
  const style: TextStyle = { face: "black", size, fill: inks.key, anchor };
  return textLine(text, x + shift, y + shift * 0.7, { ...style, fill: inks.accent }) + textLine(text, x, y, style, blend(inks));
}

export const STAMP_HEIGHT = 46;

// The rarity stamp: a tilted double-ruled label, its right edge at `right`.
// `scale` enlarges it about its centre.
export function stamp(text: string, right: number, top: number, inks: Inks, scale = 1): string {
  const style: TextStyle = { face: "monoBold", size: 15, fill: inks.key, anchor: "middle", letterSpacing: 2.4 };
  const label = text.toUpperCase();
  const w = measure(label, "monoBold", 15, 2.4) + 40;
  const h = STAMP_HEIGHT;
  const x = right - w;
  const [cx, cy] = [n(x + w / 2), n(top + h / 2)];
  return `<g transform="rotate(-7 ${cx} ${cy}) translate(${cx} ${cy}) scale(${scale}) translate(-${cx} -${cy})">
<rect x="${n(x)}" y="${n(top)}" width="${n(w)}" height="${h}" fill="${inks.paper}" fill-opacity="0.85"/>
<rect x="${n(x + 0.67)}" y="${n(top + 0.67)}" width="${n(w - 1.33)}" height="${n(h - 1.33)}" fill="none" stroke="${inks.accent}" stroke-width="1.33"/>
<rect x="${n(x + 3.33)}" y="${n(top + 3.33)}" width="${n(w - 6.67)}" height="${n(h - 6.67)}" fill="none" stroke="${inks.accent}" stroke-width="1.33"/>
${textLine(label, x + w / 2 + 1, top + 12 + baseline("monoBold", 15, 22), style)}</g>`;
}

function rule(y: number, inks: Inks, x1 = LEFT, x2 = RIGHT): string {
  return `<line x1="${n(x1)}" x2="${n(x2)}" y1="${n(y)}" y2="${n(y)}" stroke="${inks.key}" stroke-width="1"/>`;
}

// A small capital label followed by a rule to the right edge.
function heading(text: string, inks: Inks): Block {
  const style: TextStyle = { face: "monoBold", size: 14, fill: inks.key, letterSpacing: 3 };
  const label = text.toUpperCase();
  const end = LEFT + measure(label, "monoBold", 14, 3) + 14;
  return { svg: textLine(label, LEFT, baseline("monoBold", 14, 21), style) + rule(10.5, inks, end), height: 21 };
}

// Stacks blocks top to bottom with a gap after each.
function stack(items: [block: Block, gapAfter: number][]): Block {
  let y = 0;
  const svg: string[] = [];
  items.forEach(([block, gap], i) => {
    svg.push(place(block, y));
    y += block.height + (i < items.length - 1 ? gap : 0);
  });
  return { svg: svg.join("\n"), height: y };
}

function wrapSvg(svg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">\n${svg}\n</svg>\n`;
}

// The diagnosis card, top to bottom: handle, title, Latin name, the
// creature with its rarity stamp, and the verdict.
export function diagnosisSvg(edition: Edition, card: Card): string {
  return withFaces(edition.faces, () => diagnosis(edition, card));
}

function diagnosis(edition: Edition, card: Card): string {
  const inks = inksOf(edition, card);
  const d = card.diagnosis;
  const species = edition.species.find((s) => s.slug === card.species)!;
  const variant = edition.variants.find((v) => v.slug === card.variant) ?? null;
  const parts = [frame(inks, d.mark, d.footer)];

  // Handle, between two short rules.
  {
    const style: TextStyle = { face: "monoBold", size: 26, fill: inks.key, anchor: "middle", letterSpacing: 2 };
    const y = TOP + 26;
    const half = measure(d.handle, "monoBold", 26, 2) / 2 + 24;
    parts.push(textLine(d.handle, CENTRE + 1, y + baseline("monoBold", 26, 36), style));
    parts.push(rule(y + 18, inks, LEFT, CENTRE - half), rule(y + 18, inks, CENTRE + half, RIGHT));
  }

  // Title: the largest size that fits on one line, or two lines.
  let size = 108;
  while (size > 76 && measure(d.title, "black", size) > WIDTH) size -= 2;
  const titleLines = wrap([{ text: d.title, face: "black" }], size, WIDTH);
  if (titleLines.length > 2) throw new LayoutError(`title too long for the diagnosis card: ${d.title}`);
  const titleLine = size * 1.02;
  let y = titleLines.length === 1 ? 222 : 190;
  for (const line of titleLines) {
    parts.push(twoInk(line.runs[0]!.text, CENTRE, y + baseline("black", size, titleLine), size, inks, "middle"));
    y += titleLine;
  }
  y += 22;
  parts.push(textLine(`${d.binomial.genus} ${d.binomial.epithet}`, CENTRE, y + baseline("serifItalic", 32, 42), { face: "serifItalic", size: 32, fill: inks.key, anchor: "middle" }));
  y += 42;

  // The creature, with the rarity stamp tilted over its lower corner. It
  // takes the room the title and the verdict leave, up to a limit.
  const lines = balance([{ text: d.verdict.text, face: "serif" }], 38, WIDTH - 40);
  const lineHeight = 52;
  const height = lines.length * lineHeight;
  const figureY = y + 26;
  const figureHeight = Math.min(660, BOTTOM - figureY - 30 - height - 56);
  const figureWidth = (figureHeight * 240) / 225;
  const figureX = CENTRE - figureWidth / 2;
  parts.push(figure(edition.id, species, variant, inks, figureX, figureY, figureWidth, "fig"));
  parts.push(stamp(d.rarity.text, Math.min(figureX + figureWidth + 150, RIGHT - 8), figureY + figureHeight - STAMP_HEIGHT - 6, inks));

  // The verdict, centred in the space that is left.
  const verdictTop = figureY + figureHeight + 30;
  if (verdictTop + height > BOTTOM) throw new LayoutError(`diagnosis card overflows: ${d.verdict.id}`);
  parts.push(rule(verdictTop, inks));
  const block = textBlock(lines, verdictTop + (BOTTOM - verdictTop - height) / 2, lineHeight, { face: "serif", size: 38, fill: inks.key, anchor: "middle" }, CENTRE);
  parts.push(block.svg);

  return wrapSvg(parts.join("\n"));
}

// The scorecard, top to bottom: a title band, the humours in two columns,
// Habitat and generosity, the three natures, and the observations.
export function scorecardSvg(edition: Edition, card: Card): string {
  return withFaces(edition.faces, () => scorecard(edition, card));
}

function scorecard(edition: Edition, card: Card): string {
  const inks = inksOf(edition, card);
  const d = card.diagnosis;
  const s = card.scorecard;
  const parts = [frame(inks, s.evidence.label, s.footer)];
  const label: TextStyle = { face: "monoBold", size: 13, fill: inks.key, letterSpacing: 2 };

  // Title band.
  let titleSize = 58;
  const sideWidth = Math.max(measure(d.handle, "monoBold", 18, 1.2), measure(`${d.binomial.genus} ${d.binomial.epithet}`, "serifItalic", 23));
  while (titleSize > 40 && measure(d.title, "black", titleSize) > WIDTH - sideWidth - 30) titleSize -= 2;
  parts.push(twoInk(d.title, LEFT, TOP + baseline("black", 58, 64), titleSize, inks));
  parts.push(textLine(d.handle, RIGHT, TOP + 6 + baseline("monoBold", 18, 24), { face: "monoBold", size: 18, fill: inks.key, anchor: "end", letterSpacing: 1.2 }));
  parts.push(textLine(`${d.binomial.genus} ${d.binomial.epithet}`, RIGHT, TOP + 32 + baseline("serifItalic", 23, 30), { face: "serifItalic", size: 23, fill: inks.key, anchor: "end" }));
  parts.push(rule(TOP + 76, inks));
  const top = TOP + 76 + 30;

  // The sections of the card, with the type scaled by `k`.
  const build = (k: number): Block[] => {
  const body: TextStyle = { face: "serif", size: 23 * k, fill: inks.key };

  // --- Humours: two columns, or the one line that stands in for them.
  let humours: Block;
  if (s.humours) {
    const gutter = 44;
    const colWidth = (WIDTH - gutter) / 2;
    const cells = s.humours.map((h): Block => {
      const pips = Array.from({ length: 5 }, (_, i) => {
        const cx = 176 + i * 22;
        return (
          (i < h.band ? `<circle cx="${cx + 1.5}" cy="11.5" r="7" fill="${inks.fill}"/>` : "") +
          `<circle cx="${cx}" cy="10.5" r="7" fill="none" stroke="${inks.key}" stroke-width="1.5"${blend(inks)}/>`
        );
      }).join("");
      const row = baseline("monoBold", 13, 21);
      const lines = wrap([{ text: h.line.text, face: "serifItalic" }], 23 * k, colWidth);
      const text = textBlock(lines, 28, 31 * k, { ...body, face: "serifItalic" }, 0);
      return {
        svg: textLine(h.name.toUpperCase(), 0, row, label) + pips + textLine(h.score.toUpperCase(), 176 + 5 * 22 + 4, row, { ...label, face: "mono" }) + text.svg,
        height: 28 + text.height,
      };
    });
    const rows: [Block, number][] = [];
    for (let i = 0; i < cells.length; i += 2) {
      const pair = cells.slice(i, i + 2);
      rows.push([
        {
          svg: pair.map((c, col) => `<g transform="translate(${n(LEFT + col * (colWidth + gutter))} 0)">${c.svg}</g>`).join("\n"),
          height: Math.max(...pair.map((c) => c.height)),
        },
        22,
      ]);
    }
    humours = stack([[heading(edition.headings.humours, inks), 20], ...rows]);
  } else {
    const lines = wrap([{ text: s.unmeasured!, face: "serifItalic" }], 30 * k, WIDTH);
    humours = stack([[heading(edition.headings.humours, inks), 22], [textBlock(lines, 0, 42 * k, { face: "serifItalic", size: 30 * k, fill: inks.key }, LEFT), 0]]);
  }

  // --- Habitat and generosity.
  const facts: [string, string][] = [[edition.headings.habitat, s.habitat.text]];
  if (s.generosity) facts.push([edition.headings.generosity, s.generosity.text]);
  const factBlocks = facts.map(([name, text]): [Block, number] => {
    const lines = wrap([{ text, face: "serif" }], 23 * k, WIDTH - 176);
    const block = textBlock(lines, 0, 32 * k, body, LEFT + 176);
    return [{ svg: textLine(name.toUpperCase(), LEFT, baseline("monoBold", 13, 32 * k), label) + block.svg, height: block.height }, 8];
  });

  // --- Natures.
  const natureBlocks = s.natures.map((nature, i): [Block, number] => {
    const lines = wrap([{ text: nature.text, face: "serif" }], 23 * k, WIDTH - 64);
    const block = textBlock(lines, 0, 32 * k, body, LEFT + 64);
    return [{ svg: twoInk(["j.", "ij.", "iij."][i]!, LEFT, baseline("black", 32 * k, 32 * k), 32 * k, inks) + block.svg, height: block.height }, 16 * k];
  });

  const sections: Block[] = [humours, stack(factBlocks), stack([[heading(edition.headings.natures, inks), 20], ...natureBlocks])];

  // --- Observations: the lead-in is in the card's voice; the user's own
  // words are in the mono face.
  if (s.observations) {
    const o = s.observations;
    const observed = (lead: string, words: string): [Block, number] => {
      const runs: Run[] = [
        { text: `${lead} `, face: "serifItalic" },
        { text: words, face: "typed" },
      ];
      return [textBlock(wrap(runs, 19 * k, WIDTH), 0, 29 * k, { face: "serifItalic", size: 19 * k, fill: inks.key }, LEFT), 12];
    };
    const items: [Block, number][] = [[heading(o.heading, inks), 18]];
    if (o.diet) items.push(observed(o.diet.lead, `${o.diet.terms.join(", ")}.`));
    if (o.call) items.push(observed(o.call.lead, `“${o.call.text}”`));
    sections.push(stack(items));
  }
  return sections;
  };

  // The type is set as large as fits: a card with little on it reads bigger
  // instead of sitting in empty paper. Spare room is then shared out between
  // the sections, within limits.
  const room = BOTTOM - top;
  const heightOf = (blocks: Block[]) => blocks.reduce((sum, b) => sum + b.height, 0);
  const MIN_GAP = 34;
  const scale = [1.3, 1.24, 1.18, 1.12, 1.06, 1].find((k) => {
    const blocks = build(k);
    return heightOf(blocks) + MIN_GAP * (blocks.length - 1) <= room;
  });
  if (scale === undefined) throw new LayoutError(`scorecard overflows for ${card.species}${card.variant ? `/${card.variant}` : ""}`);
  const sections = build(scale);
  const content = heightOf(sections);
  const gap = Math.min(72, (room - content) / (sections.length - 1));
  let y = top + Math.min(30, (room - content - gap * (sections.length - 1)) / 2);
  for (const section of sections) {
    parts.push(place(section, y));
    y += section.height + gap;
  }

  // Whatever paper is left at the bottom is used: the picture itself on a
  // card with very little on it (the black cat's, mostly), or the rarity
  // stamp, enlarged, where there is only a band to spare.
  const spare = BOTTOM - (y - gap);
  if (spare >= 300) {
    const species = edition.species.find((sp) => sp.slug === card.species)!;
    const variant = edition.variants.find((v) => v.slug === card.variant) ?? null;
    const width = Math.min(380, ((spare - 40) * 240) / 225);
    parts.push(figure(edition.id, species, variant, inks, CENTRE - width / 2, BOTTOM - (width * 225) / 240 - 6, width, "fig"));
  } else if (spare >= 140) {
    const width = measure(d.rarity.text.toUpperCase(), "monoBold", 15, 2.4) + 40;
    parts.push(stamp(d.rarity.text, CENTRE + width / 2, BOTTOM - spare / 2 - STAMP_HEIGHT / 2, inks, 1.3));
  }

  return wrapSvg(parts.join("\n"));
}
