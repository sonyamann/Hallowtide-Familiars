import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_FAMILY, fontFiles } from "./type.ts";

// SVG in, PNG bytes out. resvg uses no browser and no system libraries, and
// is given only the bundled fonts, so the same SVG gives the same PNG on any
// machine.
export function renderPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: DEFAULT_FAMILY },
    fitTo: { mode: "original" },
  });
  return resvg.render().asPng();
}
