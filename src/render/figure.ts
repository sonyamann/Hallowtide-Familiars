// Composes a creature's drawing in two inks. A drawing is an SVG with two
// groups: "fill" (solid shapes in the second ink) and "key" (the line work
// in the first ink, multiplied over the fill). A variant may swap the solid
// fill for halftone dots, or add props at the species' anchor points.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Layers, Species, Variant } from "../content.ts";
import { CONTENT_DIR } from "../paths.ts";
import { n } from "./type.ts";

export interface Inks {
  key: string;
  fill: string;
  accent: string;
  paper: string;
  // True on light paper, where one ink darkens another as in print. On a
  // dark ground the inks are opaque and the later one simply covers.
  multiply: boolean;
}

export function blend(inks: Inks): string {
  return inks.multiply ? ' style="mix-blend-mode:multiply"' : "";
}

// Misregistration: the fill ink sits slightly off the key line, in output pixels.
const OFFSET = { x: 3, y: 2 };
const STROKE = 'fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';

// A finished picture, shown in its own colours and cut out along its
// outline. The picture is square and sits in the same box a drawing would.
function printed(edition: string, layers: Layers, x: number, y: number, side: number, id: string): string {
  const box = `x="${n(x)}" y="${n(y)}" width="${n(side)}" height="${n(side)}"`;
  const data = (file: string) => readFileSync(join(artDir(edition), file)).toString("base64");
  return `<defs><mask id="${id}-cut" maskUnits="userSpaceOnUse" ${box}><image ${box} href="data:image/png;base64,${data(layers.cut)}"/></mask></defs>
<image ${box} href="data:image/jpeg;base64,${data(layers.image)}" mask="url(#${id}-cut)"/>`;
}

function artDir(edition: string): string {
  return join(CONTENT_DIR, "editions", edition, "art");
}

function group(svg: string, id: string): string {
  return svg.match(new RegExp(`<g id="${id}">([\\s\\S]*?)</g>`))?.[1] ?? "";
}

function pictureOf(species: Species, variant: Variant | null): Layers | undefined {
  return variant ? species.art.pictures?.[variant.slug] : species.art.layers;
}

// Draws the figure `width` pixels wide with its top-left corner at x, y.
// `id` must be unique within the page; it names the dot pattern.
export function figure(edition: string, species: Species, variant: Variant | null, inks: Inks, x: number, y: number, width: number, id: string): string {
  const picture = pictureOf(species, variant);
  if (picture) {
    const side = (width * 225) / 240;
    return printed(edition, picture, x + (width - side) / 2, y, side, id);
  }
  const art = readFileSync(join(artDir(edition), species.art.file), "utf8");
  const box = art.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!box) throw new Error(`${species.art.file}: needs a viewBox starting at 0 0`);
  const [vbW, vbH] = [Number(box[1]), Number(box[2])];
  const scale = width / vbW;
  const place = `translate(${n(x)} ${n(y)}) scale(${n(scale)})`;
  const shifted = `translate(${n(x + OFFSET.x)} ${n(y + OFFSET.y)}) scale(${n(scale)})`;

  const dots = `url(#${id}-dots)`;
  const ghost = variant?.treatment === "dots";
  const fillPaint = ghost ? dots : inks.fill;
  const paint = (markup: string, ink: string) => markup.replaceAll("INK", ink).replaceAll("PAPER", inks.paper);

  const props = variant?.props ? readFileSync(join(artDir(edition), "props", variant.props), "utf8") : "";
  const anchors = species.art.anchors;
  const at = (anchor: "head" | "shoulders" | "mouth", markup: string) =>
    markup && anchors ? `<g transform="translate(${anchors[anchor].join(" ")}) scale(${species.art.propScale ?? 1})">${markup}</g>` : "";

  const out: string[] = [
    `<defs><pattern id="${id}-dots" width="6.4" height="6.4" patternUnits="userSpaceOnUse"><circle cx="3.2" cy="3.2" r="1.3" fill="${inks.fill}"/></pattern><pattern id="${id}-halo" width="6.4" height="6.4" patternUnits="userSpaceOnUse"><circle cx="3.2" cy="3.2" r="1.3" fill="${inks.accent}"/></pattern></defs>`,
  ];
  // A halftone halo behind the creature. The ghost has none: its body is the dots.
  if (!ghost) out.push(`<g transform="${place}"><circle cx="${n(vbW / 2)}" cy="${n(vbH / 2 - 4)}" r="${n(vbW * 0.42)}" fill="url(#${id}-halo)" opacity="${inks.multiply ? 0.55 : 0.8}"/></g>`);
  // Props behind the body, solid: in the key ink on paper, in the accent on a dark ground.
  if (props) out.push(`<g transform="${place}" fill="${inks.multiply ? inks.key : inks.accent}">${at("shoulders", group(props, "shoulders-back"))}</g>`);
  // The body, in the second ink, slightly off register.
  out.push(`<g transform="${shifted}" fill="${fillPaint}">${paint(group(art, "fill"), fillPaint)}</g>`);
  // The key line, multiplied over it so the inks overprint.
  out.push(`<g transform="${place}"${blend(inks)}><g ${STROKE} stroke="${inks.key}">${paint(group(art, "key"), inks.key)}</g></g>`);
  if (props) {
    // Props in front: sparks in the second ink, then line work and paper-white fangs.
    out.push(`<g transform="${shifted}" fill="${inks.fill}">${at("head", group(props, "head-spark"))}</g>`);
    out.push(
      `<g transform="${place}" ${STROKE} stroke="${inks.key}">${at("head", group(props, "head-spark"))}${at("head", group(props, "head-front"))}${at("shoulders", group(props, "shoulders-front"))}${paint(at("mouth", group(props, "mouth-front")), inks.key)}</g>`,
    );
  }
  return out.join("\n");
}
