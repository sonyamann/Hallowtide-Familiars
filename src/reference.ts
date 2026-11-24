import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CalibrationTables } from "./calibration.ts";
import type { ScoreTables } from "./classify.ts";
import { CALIBRATION_DIR } from "./paths.ts";

export function loadTables(version: string): CalibrationTables {
  return JSON.parse(readFileSync(join(CALIBRATION_DIR, version, "tables.json"), "utf8")) as CalibrationTables;
}

// Score tables belong to one calibration version and one edition.
export function scoresFile(version: string, edition: string): string {
  return join(CALIBRATION_DIR, version, `${edition}.scores.json`);
}

export function loadScores(version: string, edition: string): ScoreTables {
  const file = scoresFile(version, edition);
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ScoreTables;
  } catch {
    throw new Error(`${file} not found. Run \`npm run spread\` to build it.`);
  }
}
