// The web pages' words, from the edition's content. Code writes none of them.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_DIR } from "../paths.ts";

export type ErrorCode = "invalid_handle" | "opted_out" | "no_specimen" | "too_many" | "resting" | "failed" | "not_found";

export interface WebCopy {
  // This project's name, and the name of the studio site it lives on.
  siteName: string;
  studioName: string;
  footer: string;
  form: { heading: string; intro: string; label: string; placeholder: string; button: string };
  loading: { heading: string; line: string };
  result: { heading: string; diagnosis: string; scorecard: string; download: string; again: string };
  // The newsletter signup under the cards.
  newsletter: { title: string; text: string; label: string; placeholder: string; button: string; done: string; invalid: string; failed: string };
  errors: Record<ErrorCode, string>;
}

const SHAPE: { [K in keyof WebCopy]: WebCopy[K] extends string ? null : string[] } = {
  siteName: null,
  studioName: null,
  footer: null,
  form: ["heading", "intro", "label", "placeholder", "button"],
  loading: ["heading", "line"],
  result: ["heading", "diagnosis", "scorecard", "download", "again"],
  newsletter: ["title", "text", "label", "placeholder", "button", "done", "invalid", "failed"],
  errors: ["invalid_handle", "opted_out", "no_specimen", "too_many", "resting", "failed", "not_found"],
};

// Anything missing is an error, as with the rest of the content.
export function loadWebCopy(edition: string): WebCopy {
  const file = join(CONTENT_DIR, "editions", edition, "web.json");
  const copy = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  for (const [section, fields] of Object.entries(SHAPE)) {
    const value = copy[section];
    if (fields === null ? typeof value !== "string" || !value : !value) throw new Error(`${file}: missing "${section}"`);
    for (const field of fields ?? []) {
      const text = (value as Record<string, unknown>)[field];
      if (typeof text !== "string" || !text) throw new Error(`${file}: missing "${section}.${field}"`);
    }
  }
  return copy as unknown as WebCopy;
}
