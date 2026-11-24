// Type for the cards: the bundled fonts, text measuring, and line breaking.
// SVG has no automatic text layout, so lines are broken here and each line is
// placed as its own <text> element.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import opentype from "opentype.js";
import { FONT_DIR } from "../paths.ts";

// "typed" is for the user's own words; it needs a wide character set.
export type Face = "serif" | "serifItalic" | "mono" | "monoBold" | "black" | "typed";

// Which font file plays each role. These are the Rabbit folio's; an edition
// can name its own (see `withFaces`).
export type FaceFiles = Record<Face, string>;
const FOLIO_FACES: FaceFiles = {
  serif: "IMFeENrm28P.ttf",
  serifItalic: "IMFeENit28P.ttf",
  mono: "SpaceMono-Regular.ttf",
  monoBold: "SpaceMono-Bold.ttf",
  black: "UnifrakturMaguntia-Book.ttf",
  typed: "SpaceMono-Regular.ttf",
};

interface Loaded {
  font: opentype.Font;
  family: string;
  style: "normal" | "italic";
  weight: number;
}

// A font's family, weight, and slant are read from the file itself, so the
// SVG asks for exactly the face the file declares.
const loaded = new Map<string, Loaded>();
function load(file: string): Loaded {
  let entry = loaded.get(file);
  if (!entry) {
    const bytes = readFileSync(join(FONT_DIR, file));
    const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const names = font.names as unknown as Record<string, Record<string, Record<string, string>> | undefined>;
    const name = (key: string) => {
      for (const platform of ["windows", "macintosh", "unicode"]) {
        const value = names[platform]?.[key];
        if (value) return value.en ?? Object.values(value)[0];
      }
      return undefined;
    };
    const family = name("fontFamily");
    if (!family) throw new Error(`${file}: no family name`);
    const os2 = font.tables.os2 as { usWeightClass?: number; fsSelection?: number } | undefined;
    entry = { font, family, style: (os2?.fsSelection ?? 0) & 1 ? "italic" : "normal", weight: os2?.usWeightClass ?? 400 };
    loaded.set(file, entry);
  }
  return entry;
}

let faces: FaceFiles = FOLIO_FACES;
const used = new Set<string>(Object.values(FOLIO_FACES));

// Runs `draw` with an edition's own fonts in place of the folio's.
export function withFaces<T>(files: Partial<FaceFiles> | undefined, draw: () => T): T {
  const previous = faces;
  faces = { ...FOLIO_FACES, ...files };
  for (const file of Object.values(faces)) used.add(file);
  try {
    return draw();
  } finally {
    faces = previous;
  }
}

// Stand-ins for characters a plain-ASCII font lacks. A middle dot becomes a
// raised full stop (RAISED marks where). Switching to another font for the
// odd character is not an option: the renderer then redraws the whole line
// in that font.
const RAISED = "\u0001";
const STAND_INS: Record<string, string> = { "·": RAISED, "“": '"', "”": '"', "‘": "'", "’": "'", "—": "-", "–": "-", "…": "..." };

function drawable(text: string, face: Face): string {
  const f = load(faces[face]).font;
  let out = "";
  for (const ch of text) {
    if (ch === " " || f.charToGlyphIndex(ch) !== 0) out += ch;
    else if (STAND_INS[ch] !== undefined) out += STAND_INS[ch];
    else throw new Error(`${faces[face]} cannot draw "${ch}" (in "${text}")`);
  }
  return out;
}

// The renderer is given exactly the files in use and never looks at system
// fonts.
export function fontFiles(): string[] {
  return [...used].sort().map((file) => join(FONT_DIR, file));
}
export const DEFAULT_FAMILY = "IM FELL English";

function font(face: Face): opentype.Font {
  return load(faces[face]).font;
}

// Width of a run of text: the sum of each character's advance. Kerning and
// ligatures are ignored, so this runs a touch wide, which is the safe side.
export function measure(text: string, face: Face, size: number, letterSpacing = 0): number {
  const f = font(face);
  let units = 0;
  let count = 0;
  for (const ch of drawable(text, face).replaceAll(RAISED, ".")) {
    units += f.charToGlyph(ch).advanceWidth ?? 0;
    count++;
  }
  return (units * size) / f.unitsPerEm + letterSpacing * count;
}

// Where the baseline sits below the top of a line box, as a browser would
// place it: the font's own height centred in the line height.
export function baseline(face: Face, size: number, lineHeight: number): number {
  const f = font(face);
  const ascent = (f.ascender * size) / f.unitsPerEm;
  const descent = (-f.descender * size) / f.unitsPerEm;
  return (lineHeight - (ascent + descent)) / 2 + ascent;
}

// Style and weight are always written out, so a roman run inside an italic
// line doesn't inherit the italic.
export function fontAttrs(face: Face, size: number): string {
  const f = load(faces[face]);
  return `font-family="${f.family}" font-size="${size}" font-style="${f.style}" font-weight="${f.weight}"`;
}

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// A stretch of text in one face. A paragraph is a list of runs.
export interface Run {
  text: string;
  face: Face;
}

export interface Line {
  runs: Run[];
  width: number;
}

// Breaks runs into lines. `widthAt` gives the room on each line, so the first
// few lines can be shorter (beside a drop capital, say). A single word wider
// than its line is left to overflow rather than split.
export function wrap(runs: Run[], size: number, widthAt: number | ((line: number) => number), letterSpacing = 0): Line[] {
  const room = typeof widthAt === "number" ? () => widthAt : widthAt;
  const words: Run[] = [];
  for (const run of runs) {
    for (const piece of run.text.split(/(?<=\s)/)) if (piece) words.push({ text: piece, face: run.face });
  }

  const lines: Line[] = [];
  let current: Run[] = [];
  let width = 0;
  const push = () => {
    // Trailing space doesn't count toward the line's width.
    const last = current.at(-1);
    if (last) last.text = last.text.trimEnd();
    lines.push({ runs: current, width: current.reduce((w, r) => w + measure(r.text, r.face, size, letterSpacing), 0) });
    current = [];
    width = 0;
  };
  for (const word of words) {
    const w = measure(word.text, word.face, size, letterSpacing);
    const trimmed = measure(word.text.trimEnd(), word.face, size, letterSpacing);
    if (current.length && width + trimmed > room(lines.length)) push();
    const previous = current.at(-1);
    if (previous && previous.face === word.face) previous.text += word.text;
    else current.push({ ...word });
    width += w;
  }
  if (current.length) push();
  return lines;
}

// Breaks runs into as many lines as `wrap` would, but as evenly as they will
// go, so a block doesn't end on a lone word: the narrowest width that doesn't
// add a line.
export function balance(runs: Run[], size: number, width: number, letterSpacing = 0): Line[] {
  const lines = wrap(runs, size, width, letterSpacing);
  if (lines.length < 2) return lines;
  let low = width / lines.length;
  let high = width;
  while (high - low > 1) {
    const middle = (low + high) / 2;
    if (wrap(runs, size, middle, letterSpacing).length > lines.length) low = middle;
    else high = middle;
  }
  return wrap(runs, size, high, letterSpacing);
}

export interface TextStyle {
  face: Face;
  size: number;
  fill: string;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number;
}

// One line of text at a baseline. Runs in other faces become <tspan>s.
export function textLine(line: Line | string, x: number, y: number, style: TextStyle, extra = ""): string {
  const runs = typeof line === "string" ? [{ text: line, face: style.face }] : line.runs;
  const anchor = style.anchor && style.anchor !== "start" ? ` text-anchor="${style.anchor}"` : "";
  const spacing = style.letterSpacing ? ` letter-spacing="${style.letterSpacing}"` : "";
  const lift = n(style.size * 0.28);
  // A raised full stop, then the rest of the run lowered back to the baseline.
  const inked = (text: string, face: Face) =>
    drawable(text, face)
      .split(RAISED)
      .map((part, i) => (i === 0 ? esc(part) : `<tspan dy="-${lift}">.</tspan><tspan dy="${lift}">${esc(part)}</tspan>`))
      .join("");
  const body = runs
    .map((r) => (r.face === style.face ? inked(r.text, r.face) : `<tspan ${fontAttrs(r.face, style.size)}>${inked(r.text, r.face)}</tspan>`))
    .join("");
  return `<text x="${n(x)}" y="${n(y)}" ${fontAttrs(style.face, style.size)} fill="${style.fill}" xml:space="preserve"${anchor}${spacing}${extra}>${body}</text>`;
}

// A wrapped block: lines stacked from `top`, returning the markup and the
// block's height so the next thing can be placed below it.
export function textBlock(
  lines: Line[],
  top: number,
  lineHeight: number,
  style: TextStyle,
  xAt: number | ((line: number) => number),
): { svg: string; height: number } {
  const x = typeof xAt === "number" ? () => xAt : xAt;
  const first = baseline(style.face, style.size, lineHeight);
  const svg = lines.map((line, i) => textLine(line, x(i), top + first + i * lineHeight, style)).join("\n");
  return { svg, height: lines.length * lineHeight };
}

// Numbers in the markup are rounded so the same layout always gives the same
// bytes.
export function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}
