// The two places a card shows the user's own words: the Call (a quoted post,
// or failing that their most-used phrase) and Diet (their distinctive terms).
// Nothing reaches a card from here without passing the blocklist, the PII
// patterns and the classifier screen.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Analysis } from "./analyze.ts";
import type { CalibrationTables } from "./calibration.ts";
import type { Edition } from "./content.ts";
import type { Answers, Ask, NoulQuestion } from "./jev.ts";
import { CONTENT_DIR } from "./paths.ts";
import type { Tweet } from "./types.ts";

export interface ScreenConfig {
  model: string;
  // An item is rejected when any question's probability of "yes" reaches this,
  // or reaches the question's own blockAt where it has one.
  blockAt: number;
  call: { minLength: number; maxLength: number; candidates: number; minKeptAfterCleaning: number };
  diet: { candidates: number };
  tweetQuestions: Record<string, NoulQuestion>;
  termQuestions: Record<string, NoulQuestion>;
  // Asked of Diet terms only, on top of the term questions.
  dietQuestions: Record<string, NoulQuestion>;
}

export interface Candidate {
  id: string;
  text: string;
  likes: number;
}

// The classifier's answers, saved with the snapshot so a rerun is identical.
export interface Labels {
  classifier: string;
  tweets: Record<string, Answers>;
  terms: Record<string, Answers>;
}

export interface OwnWords {
  call: { source: "tweet" | "phrase"; text: string } | null;
  diet: string[] | null;
}

export const NO_OWN_WORDS: OwnWords = { call: null, diet: null };

export function loadScreenConfig(): ScreenConfig {
  return JSON.parse(readFileSync(join(CONTENT_DIR, "screen.json"), "utf8")) as ScreenConfig;
}

// Changes whenever the model, the questions or the threshold change, so
// saved labels and cached cards from an older policy are never reused.
export function classifierVersion(config: ScreenConfig): string {
  const policy = JSON.stringify([config.blockAt, config.tweetQuestions, config.termQuestions, config.dietQuestions]);
  return `${config.model}-${createHash("sha256").update(policy).digest("hex").slice(0, 8)}`;
}

export function containsBlocked(text: string, blocklist: Set<string>): boolean {
  const lower = text.toLowerCase().replace(/’/g, "'");
  const words = lower.match(/[\p{L}\p{N}']+/gu) ?? [];
  // Simple plurals count too: "blorps" is caught by "blorp".
  const blocked = (w: string) => blocklist.has(w) || (w.endsWith("s") && blocklist.has(w.slice(0, -1))) || (w.endsWith("es") && blocklist.has(w.slice(0, -2)));
  if (words.some(blocked)) return true;
  const padded = ` ${words.join(" ")} `;
  for (const entry of blocklist) {
    if (entry.includes(" ") && padded.includes(` ${entry} `)) return true;
  }
  return false;
}

// Mechanical personal details: handles, emails, phone numbers, long numbers
// and street addresses. Names of private people are left to the classifier.
export function hasPii(text: string): boolean {
  return (
    /@\w/.test(text) ||
    /\b[\w.+-]+@[\w-]+\.[\w.]+\b/.test(text) ||
    /(?:\+?\d[\s().-]?){7,}/.test(text) ||
    /\b\d+\s+(?:\w+\s+){0,3}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|court|ct|way)\b\.?/i.test(text)
  );
}

// Keeps only what the card fonts can draw: Latin letters and common
// punctuation. Emoji and other scripts are removed.
export function cleanForCard(text: string): string {
  return text
    .replace(/[^ -~ -ÿ‘’“”–—…]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Posts that could be the Call, best-liked first. Only plain English
// originals that stand alone: no quote tweets, links, media or mentions.
export function callCandidates(tweets: Tweet[], config: ScreenConfig, blocklist: Set<string>): Candidate[] {
  const { minLength, maxLength, candidates, minKeptAfterCleaning } = config.call;
  const out: Candidate[] = [];
  for (const t of tweets) {
    if (t.kind !== "original" || t.isQuote || t.hasLink || t.hasMedia || t.mentions > 0 || t.lang !== "en") continue;
    const text = cleanForCard(t.text);
    if (text.length < minLength || text.length > maxLength) continue;
    if (text.length < minKeptAfterCleaning * t.text.length) continue;
    if (hasPii(text) || containsBlocked(text, blocklist)) continue;
    out.push({ id: t.id, text, likes: t.likes });
  }
  return out.sort((a, b) => b.likes - a.likes || (a.id < b.id ? -1 : 1)).slice(0, candidates);
}

// The account's most distinctive terms: used often by them, rarely by the
// calibration set. Most distinctive first.
export function dietCandidates(tables: CalibrationTables, analysis: Analysis, blocklist: Set<string>, limit: number): string[] {
  const n = tables.terms.accounts;
  return analysis.features.terms
    .filter(({ term }) => !blocklist.has(term))
    .map(({ term, posts }) => ({ term, score: posts * Math.log((n + 1) / ((tables.terms.counts[term] ?? 0) + 1)) }))
    .sort((a, b) => b.score - a.score || (a.term < b.term ? -1 : 1))
    .slice(0, limit)
    .map((t) => t.term);
}

// Asks the classifier about every candidate post, Diet term, and the most
// used phrase, a few at a time. Diet terms get the Diet questions as well.
// Each item goes in its own small request, because unrelated text in the
// state makes the classifier less accurate. Throws if any request fails, so
// a partial screen is never used.
export async function screen(candidates: Candidate[], dietTerms: string[], phrase: string | null, config: ScreenConfig, ask: Ask): Promise<Labels> {
  const labels: Labels = { classifier: classifierVersion(config), tweets: {}, terms: {} };
  const jobs: (() => Promise<void>)[] = [
    ...candidates.map((c) => async () => void (labels.tweets[c.id] = await ask(c.text, config.tweetQuestions))),
    ...dietTerms.map((term) => async () => void (labels.terms[term] = await ask(term, { ...config.termQuestions, ...config.dietQuestions }))),
    ...(phrase !== null && !dietTerms.includes(phrase) ? [async () => void (labels.terms[phrase] = await ask(phrase, config.termQuestions))] : []),
  ];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]!();
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return labels;
}

// Picks the Call and Diet from what passed. An item with no label was never
// screened and is treated as rejected.
export function chooseOwnWords(
  edition: Edition,
  config: ScreenConfig,
  blocklist: Set<string>,
  labels: Labels,
  candidates: Candidate[],
  dietTerms: string[],
  phrase: string | null,
): OwnWords {
  // Every question must have an answer, and every answer must be under its threshold.
  const passes = (answers: Answers | undefined, questions: Record<string, NoulQuestion>) =>
    answers !== undefined && Object.entries(questions).every(([name, q]) => (answers[name] ?? 1) < (q.blockAt ?? config.blockAt));

  const tweet = candidates.find((c) => passes(labels.tweets[c.id], config.tweetQuestions));
  const phraseOk = phrase !== null && !containsBlocked(phrase, blocklist) && !hasPii(phrase) && passes(labels.terms[phrase], config.termQuestions);
  const call: OwnWords["call"] = tweet ? { source: "tweet", text: tweet.text } : phraseOk ? { source: "phrase", text: phrase } : null;

  const diet = dietTerms.filter((term) => passes(labels.terms[term], { ...config.termQuestions, ...config.dietQuestions })).slice(0, edition.diet.terms);
  return { call, diet: diet.length ? diet : null };
}
