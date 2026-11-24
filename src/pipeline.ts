// The whole run after the fetch: analyze, classify, screen the user's own
// words, and choose everything both cards show.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeSnapshot, type Analysis } from "./analyze.ts";
import type { CalibrationTables } from "./calibration.ts";
import { classify, type Result, type ScoreTables } from "./classify.ts";
import { loadActiveConfig, loadBlocklist, loadEdition, type Edition } from "./content.ts";
import { ClassifierError, type Ask } from "./jev.ts";
import {
  callCandidates,
  chooseOwnWords,
  classifierVersion,
  dietCandidates,
  loadScreenConfig,
  NO_OWN_WORDS,
  screen,
  type Labels,
  type OwnWords,
  type ScreenConfig,
} from "./own-words.ts";
import { loadScores, loadTables } from "./reference.ts";
import { selectCard, type Card } from "./select.ts";
import { tweetsOf } from "./tweets.ts";
import type { Snapshot } from "./types.ts";

export interface Reference {
  edition: Edition;
  tables: CalibrationTables;
  scores: ScoreTables;
  blocklist: Set<string>;
  screenConfig: ScreenConfig;
}

export function loadReference(): Reference {
  const active = loadActiveConfig();
  const edition = loadEdition(active.edition);
  return {
    edition,
    tables: loadTables(active.calibration),
    scores: loadScores(active.calibration, edition.id),
    blocklist: loadBlocklist(),
    screenConfig: loadScreenConfig(),
  };
}

export interface Run {
  analysis: Analysis;
  result: Result;
  card: Card;
  // False when the classifier was skipped or failed, so the card was made
  // without the Call and Diet. Such a card must not be cached: a later run
  // should try the screen again.
  screened: boolean;
}

// Returns null when the snapshot holds no tweets (no specimen). Unscreened
// text is never shown: without a classifier (`ask` null), or if it fails, the
// card is still made, but with none of the user's own words.
export async function buildCard(ref: Reference, snapshot: Snapshot, ask: Ask | null, labelsDir: string): Promise<Run | null> {
  const analysis = analyzeSnapshot(snapshot);
  if (!analysis) return null;
  const result = classify(ref.edition, ref.tables, ref.scores, analysis);

  let own = NO_OWN_WORDS;
  let screened = false;
  if (ask) {
    try {
      own = await ownWords(ref, snapshot, analysis, ask, labelsDir);
      screened = true;
    } catch (err) {
      if (!(err instanceof ClassifierError)) throw err;
    }
  }
  return { analysis, result, card: selectCard(ref.edition, ref.tables, ref.scores, analysis, result, own), screened };
}

async function ownWords(ref: Reference, snapshot: Snapshot, analysis: Analysis, ask: Ask, labelsDir: string): Promise<OwnWords> {
  const { edition, screenConfig: config, blocklist } = ref;
  // Diet and the Call are English-only in v1.
  const english = analysis.features.englishShare;
  if (english === null || english < edition.diet.minEnglishShare) return NO_OWN_WORDS;

  const candidates = callCandidates(tweetsOf(snapshot.handle, snapshot.pages), config, blocklist);
  const dietTerms = dietCandidates(ref.tables, analysis, blocklist, config.diet.candidates);
  const phrase = analysis.features.mostUsedPhrase?.phrase ?? null;

  // Labels are saved per snapshot and policy, so a rerun gives the same card.
  const file = join(labelsDir, `${snapshot.id.slice(0, 16)}-${classifierVersion(config)}.json`);
  let labels: Labels;
  if (existsSync(file)) {
    labels = JSON.parse(readFileSync(file, "utf8")) as Labels;
  } else {
    labels = await screen(candidates, dietTerms, phrase, config, ask);
    mkdirSync(labelsDir, { recursive: true });
    writeFileSync(file, JSON.stringify(labels));
  }
  return chooseOwnWords(edition, config, blocklist, labels, candidates, dietTerms, phrase);
}
