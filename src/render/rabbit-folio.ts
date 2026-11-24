// The renderer test from the spec: the reference "Supposed Rabbit" folio
// rebuilt as SVG and rendered without a browser. It exercises everything the
// cards need: three font families, the multiply blend of two inks, a halftone
// dot pattern, a rotated stamp, a drop capital, and wrapped text in columns.
//
//   npm run rabbit    writes out/rabbit-folio.svg and out/rabbit-folio.png

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderPng } from "./png.ts";
import { baseline, measure, n, textBlock, textLine, wrap, type Run, type TextStyle } from "./type.ts";

const W = 900;
const H = 1350;
const PAPER = "#F3EEE3";
const BLUE = "#2A43A6";
const PINK = "#FF4F9A";
// Misregistration: the second ink sits slightly off the first.
const OFFSET = { x: 3, y: 2 };
const MULTIPLY = ' style="mix-blend-mode:multiply"';

const LEFT = 77;
const RIGHT = 823;
const WIDTH = RIGHT - LEFT;
const GAP = 26;

const parts: string[] = [];
let y = 65;

const rule = (at: number, dash = "") =>
  `<line x1="${LEFT}" x2="${RIGHT}" y1="${n(at)}" y2="${n(at)}" stroke="${BLUE}" stroke-width="1"${dash && ` stroke-dasharray="${dash}"`}/>`;

// Blackletter with the second ink showing from beneath it.
function twoInk(text: string, x: number, at: number, size: number, shift: { x: number; y: number }, anchor: TextStyle["anchor"] = "start"): string {
  const style: TextStyle = { face: "black", size, fill: BLUE, anchor };
  return textLine(text, x + shift.x, at + shift.y, { ...style, fill: PINK }) + textLine(text, x, at, style, MULTIPLY);
}

// --- Frame: paper and a double border.
parts.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);
for (const inset of [28.83, 32.17]) {
  parts.push(`<rect x="${inset}" y="${inset}" width="${n(W - 2 * inset)}" height="${n(H - 2 * inset)}" fill="none" stroke="${BLUE}" stroke-width="1.67"/>`);
}

// --- Running head.
{
  const style: TextStyle = { face: "mono", size: 12, fill: BLUE, letterSpacing: 1.68 };
  const at = y + baseline("mono", 12, 17.8);
  parts.push(textLine("FOLIO XVIJ", LEFT, at, style));
  parts.push(textLine("A BESTIARY OF PROVISIONAL CREATURES", (LEFT + RIGHT) / 2, at, { ...style, anchor: "middle" }));
  parts.push(textLine("ANNO MMXXVI", RIGHT, at, { ...style, anchor: "end" }));
  y += 17.8 + 10;
  parts.push(rule(y));
  y += 1 + GAP;
}

// --- Title and binomial.
{
  const lineHeight = 76 * 1.05;
  parts.push(twoInk("Of the Supposed Rabbit", W / 2, y + baseline("black", 76, lineHeight), 76, OFFSET, "middle"));
  y += lineHeight + 14;
  const gloss = "Lepus hyperstitionis — the beast that becometh real by being spoken of";
  const block = textBlock(wrap([{ text: gloss, face: "serifItalic" }], 21, WIDTH), y, 26, { face: "serifItalic", size: 21, fill: BLUE, anchor: "middle" }, W / 2);
  parts.push(block.svg);
  y += block.height + GAP;
}

// --- Two columns: the account on the left, the figure on the right.
{
  const top = y;
  const leftWidth = ((WIDTH - 36) * 1.3) / 2.3;
  const rightX = LEFT + leftWidth + 36;
  const rightWidth = WIDTH - 36 - leftWidth;
  const body: TextStyle = { face: "serif", size: 18, fill: BLUE };
  const it = (text: string): Run => ({ text, face: "serifItalic" });
  const rm = (text: string): Run => ({ text, face: "serif" });

  // Drop capital: four lines of the first paragraph run beside it.
  const capWidth = measure("T", "black", 96) + 12;
  const capBaseline = top + 6 + baseline("black", 96, 96 * 0.82);
  parts.push(textLine("T", LEFT + 4, capBaseline + 3, { face: "black", size: 96, fill: PINK }));
  parts.push(textLine("T", LEFT, capBaseline, { face: "black", size: 96, fill: BLUE }, MULTIPLY));

  const paragraphs: { runs: Run[]; indent: number }[] = [
    {
      indent: 4,
      runs: [rm("he Supposed Rabbit dwelleth in the margins, where the scribes set down those things they did not altogether believe. It is reported of her that she is born of rumour: that a thing said thrice becometh a burrow, and a burrow said thrice becometh a warren.")],
    },
    {
      indent: 0,
      runs: [rm("Hunters pursue her with nets of evidence, sorted by tiers, yet she is never taken as "), it("Certain"), rm(". She is entered in the ledger only as "), it("Probable"), rm(", and this pleaseth her well, for it is her true name.")],
    },
    {
      indent: 0,
      runs: [rm("Some say she is a fiction. Others answer that a fiction which moveth crowds hath legs enough, and that the question is not whether she is real, but how real she is becoming.")],
    },
  ];
  let leftY = top;
  for (const p of paragraphs) {
    const lines = wrap(p.runs, 18, (i) => (i < p.indent ? leftWidth - capWidth : leftWidth));
    const block = textBlock(lines, leftY, 27, body, (i) => (i < p.indent ? LEFT + capWidth : LEFT));
    parts.push(block.svg);
    leftY += block.height + 14;
  }

  // Halftone dots behind the figure.
  const cx = rightX + 28 + 145;
  const cy = top + 36 + 145;
  parts.push(
    `<defs><pattern id="dots" width="9" height="9" patternUnits="userSpaceOnUse" x="${n(rightX + 28)}" y="${n(top + 36)}"><circle cx="4.5" cy="4.5" r="1.8" fill="${PINK}"/></pattern></defs>`,
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="145" fill="url(#dots)" opacity="0.55"/>`,
  );

  // The figure: a fill layer in the second ink, shifted, then the key line
  // in the first ink multiplied over it.
  const place = `translate(${n(rightX)} ${top + 30}) scale(${n(340 / 240)})`;
  parts.push(`<g transform="translate(${OFFSET.x} ${OFFSET.y}) ${place}" fill="${PINK}">
<ellipse cx="112" cy="152" rx="56" ry="46"/><circle cx="64" cy="104" r="29"/>
<ellipse cx="56" cy="48" rx="10" ry="34" transform="rotate(-14 56 48)"/><ellipse cx="80" cy="50" rx="10" ry="34" transform="rotate(12 80 50)"/>
<circle cx="168" cy="146" r="13"/><ellipse cx="132" cy="196" rx="32" ry="9"/><circle cx="212" cy="198" r="14"/></g>`);
  parts.push(`<g transform="${place}"${MULTIPLY}><g fill="none" stroke="${BLUE}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
<ellipse cx="112" cy="152" rx="56" ry="46"/><circle cx="64" cy="104" r="29"/>
<ellipse cx="56" cy="48" rx="10" ry="34" transform="rotate(-14 56 48)"/><ellipse cx="80" cy="50" rx="10" ry="34" transform="rotate(12 80 50)"/>
<path d="M57 28 L60 68 M80 30 L77 70"/><circle cx="168" cy="146" r="13"/><ellipse cx="132" cy="196" rx="32" ry="9"/><ellipse cx="66" cy="188" rx="13" ry="7"/>
<path d="M38 108 l-4 3 M40 116 q8 4 14 -1"/><path d="M92 128 q22 -9 44 0 M88 144 q26 -9 54 0 M92 160 q24 -9 50 0 M100 176 q18 -7 36 0"/>
<path d="M66 182 L18 92"/><path d="M18 92 C 6 70 14 46 30 34 C 34 58 30 80 24 102"/><path d="M22 70 l8 -4 M20 80 l9 -3 M17 60 l10 -6"/>
<circle cx="212" cy="198" r="14"/><path d="M212 198 m-8 0 a8 8 0 1 1 8 8 a4.5 4.5 0 1 1 -4 -5"/><path d="M224 212 L188 212 q-7 0 -7 -7 M183 205 l-5 -12 M188 205 l-1 -13"/></g>
<circle cx="55" cy="98" r="3.4" fill="${BLUE}"/></g>`);

  // The stamp: a tilted box with a double border and see-through paper.
  {
    const small: TextStyle = { face: "monoBold", size: 13, fill: BLUE, anchor: "middle", letterSpacing: 2.08 };
    const big: TextStyle = { face: "monoBold", size: 18, fill: BLUE, anchor: "middle", letterSpacing: 4.32 };
    const boxW = Math.max(measure("Evidence Tier ij", "monoBold", 13, 2.08), measure("PROBABLE", "monoBold", 18, 4.32)) + 28 + 8;
    const boxH = 19.3 + 26.7 + 16 + 8;
    const x = rightX + rightWidth + 4 - boxW;
    const top2 = top + 380 - 6 - boxH;
    parts.push(`<g transform="rotate(-9 ${n(x + boxW / 2)} ${n(top2 + boxH / 2)})">
<rect x="${n(x)}" y="${n(top2)}" width="${n(boxW)}" height="${n(boxH)}" fill="${PAPER}" fill-opacity="0.8"/>
<rect x="${n(x + 0.67)}" y="${n(top2 + 0.67)}" width="${n(boxW - 1.33)}" height="${n(boxH - 1.33)}" fill="none" stroke="${PINK}" stroke-width="1.33"/>
<rect x="${n(x + 3.33)}" y="${n(top2 + 3.33)}" width="${n(boxW - 6.67)}" height="${n(boxH - 6.67)}" fill="none" stroke="${PINK}" stroke-width="1.33"/>
${textLine("Evidence Tier ij", x + boxW / 2 + 1, top2 + 12 + baseline("monoBold", 13, 19.3), small)}
${textLine("PROBABLE", x + boxW / 2 + 2, top2 + 12 + 19.3 + baseline("monoBold", 18, 26.7), big)}</g>`);
  }

  // Caption under the figure.
  const caption = "fig. j — the Rabbit, armed with a quill, confronting the Snail of Consensus, as she is commonly depicted in the margins";
  const cap = textBlock(wrap([it(caption)], 15, rightWidth), top + 390, 21, { face: "serifItalic", size: 15, fill: BLUE, anchor: "middle" }, rightX + rightWidth / 2);
  parts.push(cap.svg);

  y = Math.max(leftY - 14, top + 390 + cap.height) + GAP;
}

// --- Natures, in two columns.
{
  const head: TextStyle = { face: "monoBold", size: 13, fill: BLUE, letterSpacing: 2.86 };
  const label = "OF HER NATURES";
  parts.push(textLine(label, LEFT, y + baseline("monoBold", 13, 19.3), head));
  const labelEnd = LEFT + measure(label, "monoBold", 13, 2.86) + 14;
  parts.push(`<line x1="${n(labelEnd)}" x2="${RIGHT}" y1="${n(y + 9.6)}" y2="${n(y + 9.6)}" stroke="${BLUE}" stroke-width="1"/>`);
  y += 19.3 + 16;

  const natures = [
    "She holdeth every belief as a merchant holdeth foreign coin: good for spending, but weighed twice.",
    "She knoweth the craft of enchantment too well to be enchanted by her own, and so must disagree with herself, and commit.",
    "She cutteth pages and gluteth them anew, and the pages, so rearranged, say things they never said before.",
    "She buyeth books at three pieces of silver and readeth them a twelvemonth hence: chiefly of murders, wicked households, and kings long dead.",
    "She speaketh to the tribes of the builders in their own tongue, and they follow her into the field.",
    "Her coat is printed all over with flowers, in the soft colours of a pale summer, and she will not be dressed in beige.",
  ];
  const numerals = ["j.", "ij.", "iij.", "iv.", "v.", "vj."];
  const colWidth = (WIDTH - 36) / 2;
  const lineHeight = 16.5 * 1.45;
  for (let row = 0; row < natures.length / 2; row++) {
    let rowHeight = 0;
    for (let col = 0; col < 2; col++) {
      const i = row * 2 + col;
      const x = LEFT + col * (colWidth + 36);
      parts.push(twoInk(numerals[i]!, x, y + baseline("black", 26, 26), 26, { x: 2, y: 2 }));
      const lines = wrap([{ text: natures[i]!, face: "serif" }], 16.5, colWidth - 46);
      const block = textBlock(lines, y, lineHeight, { face: "serif", size: 16.5, fill: BLUE }, x + 46);
      parts.push(block.svg);
      rowHeight = Math.max(rowHeight, block.height);
    }
    y += rowHeight + 16;
  }
  y += GAP - 16;
}

// --- Moralitas, between two rules.
{
  parts.push(rule(y));
  y += 1 + 16;
  parts.push(twoInk("Moralitas", W / 2, y + baseline("black", 30, 30), 30, { x: 2, y: 2 }, "middle"));
  y += 30 + 8;
  const runs: Run[] = [
    { text: "Herein is figured the nature of all stories: that what is printed often enough walketh about on its own legs. Let the maker of fictions mind which ones she feedeth. And should she wish to believe a thing wholly, she cannot do it alone — ", face: "serifItalic" },
    { text: "heal me, and I shall be healed.", face: "serif" },
  ];
  const block = textBlock(wrap(runs, 18.5, WIDTH - 80), y, 18.5 * 1.5, { face: "serifItalic", size: 18.5, fill: BLUE, anchor: "middle" }, W / 2);
  parts.push(block.svg);
  y += block.height + 16;
  parts.push(rule(y));
  y += 1 + GAP;
}

// --- Specimen strip.
{
  parts.push(rule(y, "3 2"));
  y += 1 + 10;
  const style: TextStyle = { face: "mono", size: 11, fill: BLUE, letterSpacing: 1.1 };
  // The two halves share the width in proportion to their length, as the
  // reference's flex row does.
  const leftText = "SPECIMEN Nº 0017 · INDICATIONS: CHRONIC CERTAINTY";
  const rightText = "SIDE EFFECTS MAY INCLUDE NEW BELIEFS · KEEP OUT OF REACH OF CONSENSUS";
  const [lw, rw] = [measure(leftText, "mono", 11, 1.1), measure(rightText, "mono", 11, 1.1)];
  const share = (WIDTH - 16) / (lw + rw);
  const left = wrap([{ text: leftText, face: "mono" }], 11, lw * share, 1.1);
  const right = wrap([{ text: rightText, face: "mono" }], 11, rw * share, 1.1);
  parts.push(textBlock(left, y, 16.5, style, LEFT).svg);
  parts.push(textBlock(right, y, 16.5, { ...style, anchor: "end" }, RIGHT).svg);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join("\n")}\n</svg>\n`;

const out = join(import.meta.dirname, "..", "..", "out");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "rabbit-folio.svg"), svg);
const started = performance.now();
const png = renderPng(svg);
writeFileSync(join(out, "rabbit-folio.png"), png);
console.log(`Wrote out/rabbit-folio.png (${png.length} bytes) in ${Math.round(performance.now() - started)} ms`);
