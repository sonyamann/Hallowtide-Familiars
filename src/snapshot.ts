import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RawPage, Snapshot } from "./types.ts";

export const SNAPSHOT_MAX_AGE_DAYS = 7;

export function makeSnapshot(handle: string, pages: RawPage[], fetchedAt: Date): Snapshot {
  const id = createHash("sha256").update(JSON.stringify(pages)).digest("hex");
  return { id, handle, fetchedAt: fetchedAt.toISOString(), pages };
}

// Snapshots live at <dir>/<handle>/<fetch time>-<id prefix>.json.
export function saveSnapshot(dir: string, snapshot: Snapshot): string {
  const folder = join(dir, snapshot.handle);
  mkdirSync(folder, { recursive: true });
  const stamp = snapshot.fetchedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const path = join(folder, `${stamp}-${snapshot.id.slice(0, 12)}.json`);
  writeFileSync(path, JSON.stringify(snapshot));
  return path;
}

// The newest snapshot for the handle, if it is still inside the cache window.
export function loadFreshSnapshot(dir: string, handle: string, now: Date): Snapshot | null {
  let files: string[];
  try {
    files = readdirSync(join(dir, handle)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return null;
  }
  const newest = files.at(-1);
  if (!newest) return null;
  const snapshot = JSON.parse(readFileSync(join(dir, handle, newest), "utf8")) as Snapshot;
  const ageDays = (now.getTime() - Date.parse(snapshot.fetchedAt)) / 86_400_000;
  return ageDays < SNAPSHOT_MAX_AGE_DAYS ? snapshot : null;
}
