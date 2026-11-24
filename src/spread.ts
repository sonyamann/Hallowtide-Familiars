// spread [--json]
//
// Rebuilds the active edition's score tables from the calibration accounts,
// then classifies every one of them and prints how the results spread across
// species and variants. Run it after changing a species or variant profile.
//   calibration/<version>/<edition>.scores.json   score tables; committed
// Reads data/calibration/<version>/accounts.jsonl, which `calibrate` writes.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Analysis } from "./analyze.ts";
import { buildScoreTables, classify, type Result } from "./classify.ts";
import { loadActiveConfig, loadEdition } from "./content.ts";
import { DATA_DIR } from "./paths.ts";
import { loadTables, scoresFile } from "./reference.ts";

const active = loadActiveConfig();
const edition = loadEdition(active.edition);
const tables = loadTables(active.calibration);

const accountsFile = join(DATA_DIR, "calibration", active.calibration, "accounts.jsonl");
const analyses = readFileSync(accountsFile, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Analysis);

const scores = buildScoreTables(edition, tables, analyses);
writeFileSync(scoresFile(active.calibration, edition.id), JSON.stringify(scores));

const results: Result[] = analyses.map((a) => classify(edition, tables, scores, a));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results));
} else {
  const variants = edition.variants.map((v) => v.slug);
  const pct = (n: number) => `${((100 * n) / results.length).toFixed(1)}%`.padStart(7);
  const cell = (n: number | string) => String(n).padStart(13);
  const routes = ["signals", "rare", "replier", "thin"] as const;

  console.log(`${edition.id} against calibration ${tables.version}: ${results.length} accounts`);
  console.log(routes.map((r) => `${r}: ${results.filter((x) => x.route === r).length}`).join("   ") + "\n");
  console.log("species".padEnd(12) + [...variants, "no variant", "total"].map(cell).join("") + "  share");
  for (const s of edition.species) {
    const mine = results.filter((r) => r.species === s.slug);
    const row = [...variants.map((v) => mine.filter((r) => r.variant === v).length), mine.filter((r) => !r.variant).length, mine.length];
    console.log(s.slug.padEnd(12) + row.map(cell).join("") + pct(mine.length));
  }
  const row = [...variants.map((v) => results.filter((r) => r.variant === v).length), results.filter((r) => !r.variant).length, results.length];
  console.log("total".padEnd(12) + row.map(cell).join(""));
}
