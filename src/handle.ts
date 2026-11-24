export class InvalidHandleError extends Error {}

// Accepts "@Name", "name", or a profile URL, and returns the lowercase handle.
export function normalizeHandle(input: string): string {
  let h = input.trim();
  const url = h.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)/i);
  if (url?.[1]) h = url[1];
  h = h.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) {
    throw new InvalidHandleError(`not a valid X handle: ${input}`);
  }
  return h.toLowerCase();
}

// One handle per line; blank lines and # comments are ignored.
export function parseHandleList(fileText: string): Set<string> {
  const out = new Set<string>();
  for (const line of fileText.split("\n")) {
    const entry = line.replace(/#.*/, "").trim();
    if (entry) out.add(normalizeHandle(entry));
  }
  return out;
}
