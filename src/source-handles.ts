// source-handles <existing handles file> <output file>
//
// Widens the calibration set beyond the survey list. Searches recent tweets by
// language and topic, and writes the handles of their authors, grouped as
// non-English, large and everyday accounts. Search finds active, visible
// accounts, so this is a convenience sample, not a representative one.

import { readFileSync, writeFileSync } from "node:fs";
import { parseHandleList } from "./handle.ts";
import { OPT_OUT_FILE } from "./paths.ts";
import { parseXDate } from "./tweets.ts";
import type { RawAuthor } from "./types.ts";

const ENDPOINT = "https://api.twitterapi.io/twitter/tweet/advanced_search";
const PAGES_PER_QUERY = 2;

interface Group {
  name: string;
  queryType: "Latest" | "Top";
  queries: string[];
  minFollowers: number;
  maxFollowers: number;
  perQuery: number;
  total: number;
}

const LANGUAGES = ["ja", "es", "pt", "ar", "tr", "id", "fr", "ko", "de", "hi"];
const BIG_TOPICS = ["", "football", "NBA", "music", "election", "movie", "news", "science", "art", "cooking", "climate"];
const EVERYDAY_TOPICS = [
  "garden", "knitting", "my kids", "teacher", "nurse", "baseball", "recipe", "hiking", "book club", "church",
  "farming", "my dog", "painting", "guitar", "fishing", "night shift", "college", "wedding", "commute", "birdwatching",
];

const GROUPS: Group[] = [
  {
    name: "non-English, small to mid",
    queryType: "Latest",
    queries: LANGUAGES.map((lang) => `lang:${lang} min_faves:10 -filter:replies`),
    minFollowers: 100,
    maxFollowers: 100_000,
    perQuery: 10,
    total: 100,
  },
  {
    name: "large, 100,000+ followers",
    queryType: "Top",
    queries: [
      ...BIG_TOPICS.map((topic) => `${topic} lang:en min_faves:3000 -filter:replies`.trim()),
      ...["ja", "es", "pt"].map((lang) => `lang:${lang} min_faves:3000 -filter:replies`),
    ],
    minFollowers: 100_000,
    maxFollowers: Infinity,
    perQuery: 10,
    total: 100,
  },
  {
    name: "everyday English, small to mid",
    queryType: "Latest",
    queries: EVERYDAY_TOPICS.map((topic) => `"${topic}" lang:en min_faves:3 -filter:replies -filter:links`),
    minFollowers: 50,
    maxFollowers: 20_000,
    perQuery: 6,
    total: 100,
  },
];

interface SearchAuthor extends RawAuthor {
  type?: string;
  isAutomated?: boolean;
  possiblySensitive?: boolean;
}
interface SearchPage {
  tweets?: { author?: SearchAuthor }[];
  has_next_page?: boolean;
  next_cursor?: string;
}

const [existingFile, outFile] = process.argv.slice(2);
const apiKey = process.env.TWITTERAPI_KEY;
if (!existingFile || !outFile || !apiKey) {
  console.error("usage: npm run source-handles -- <existing handles file> <output file>   (needs TWITTERAPI_KEY in .env)");
  process.exit(1);
}

const taken = new Set([...parseHandleList(readFileSync(existingFile, "utf8")), ...parseHandleList(readFileSync(OPT_OUT_FILE, "utf8"))]);
let requests = 0;

async function search(query: string, queryType: string): Promise<SearchAuthor[]> {
  const authors: SearchAuthor[] = [];
  let cursor = "";
  for (let page = 0; page < PAGES_PER_QUERY; page++) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("query", query);
    url.searchParams.set("queryType", queryType);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { "X-API-Key": apiKey! } });
    requests++;
    if (!res.ok) throw new Error(`search failed: HTTP ${res.status}`);
    const body = (await res.json()) as SearchPage;
    for (const t of body.tweets ?? []) if (t.author) authors.push(t.author);
    if (!body.has_next_page || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  return authors;
}

// Real, established, ordinary accounts only: no bots, no brand-new accounts,
// nothing flagged sensitive.
function eligible(author: SearchAuthor, group: Group): boolean {
  const followers = author.followers ?? 0;
  const joined = parseXDate(author.createdAt);
  return (
    author.type === "user" &&
    !author.isAutomated &&
    !author.possiblySensitive &&
    (author.statusesCount ?? 0) >= 200 &&
    joined !== null &&
    new Date(joined).getUTCFullYear() <= 2025 &&
    followers >= group.minFollowers &&
    followers <= group.maxFollowers
  );
}

const lines = ["# Calibration handles found by search, to widen the survey list. One per line."];
for (const group of GROUPS) {
  const picked: string[] = [];
  for (const query of group.queries) {
    let fromThisQuery = 0;
    for (const author of await search(query, group.queryType)) {
      const handle = author.userName?.toLowerCase();
      if (!handle || taken.has(handle) || !eligible(author, group)) continue;
      if (fromThisQuery >= group.perQuery || picked.length >= group.total) break;
      taken.add(handle);
      picked.push(handle);
      fromThisQuery++;
    }
  }
  console.error(`${group.name}: ${picked.length} handles`);
  lines.push(`# ${group.name}`, ...picked);
}

writeFileSync(outFile, lines.join("\n") + "\n");
console.error(`Wrote ${outFile} after ${requests} search requests`);
