// classify @handle [--refresh]
//
// Analyzes the handle, then prints its species and variant in the active
// edition, with the scores behind the choice.

import { classify } from "./classify.ts";
import { loadActiveConfig, loadEdition } from "./content.ts";
import { loadScores, loadTables } from "./reference.ts";
import { specimenFromArgs } from "./specimen.ts";

const active = loadActiveConfig();
const edition = loadEdition(active.edition);
const tables = loadTables(active.calibration);
const scores = loadScores(active.calibration, edition.id);

const { analysis } = await specimenFromArgs("npm run classify -- @handle [--refresh]");
console.log(JSON.stringify(classify(edition, tables, scores, analysis), null, 2));
