// The web app's records, in one SQLite file. A run is one request for a
// handle and has a public id; a result is a finished set of cards, kept
// under its cache key so the same snapshot and content give the same cards.

import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { Card } from "../select.ts";

export interface Run {
  id: string;
  handle: string;
  status: "pending" | "done" | "failed";
  // An error code from the web copy, when the run failed.
  error: string | null;
  resultKey: string | null;
  createdAt: string;
}

export interface Result {
  key: string;
  handle: string;
  card: Card;
  // False when the classifier could not be reached: such a result is shown
  // but never reused, so a later run tries the screen again.
  screened: boolean;
}

export interface Store {
  createRun(handle: string, now: Date): Run;
  getRun(id: string): Run | null;
  latestRun(handle: string): Run | null;
  // The earliest run that finished with this result: its page is the one
  // every later run for the same cards leads to.
  firstRunFor(resultKey: string): Run | null;
  finishRun(id: string, resultKey: string): void;
  failRun(id: string, error: string): void;
  saveResult(result: Result, now: Date): void;
  getResult(key: string): Result | null;
  // Paid TwitterAPI requests made on a day (YYYY-MM-DD, UTC).
  spent(day: string): number;
  spend(day: string, requests: number): void;
  close(): void;
}

interface RunRow {
  id: string;
  handle: string;
  status: Run["status"];
  error: string | null;
  result_key: string | null;
  created_at: string;
}

// Ten characters from an alphabet with no look-alikes.
function newId(): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  return Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
}

export function openStore(file: string): Store {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      result_key TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_handle ON runs (handle, created_at);
    CREATE TABLE IF NOT EXISTS results (
      key TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      card TEXT NOT NULL,
      screened INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS spend (
      day TEXT PRIMARY KEY,
      requests INTEGER NOT NULL
    );
  `);
  // A run still pending when the app starts was cut off by a restart.
  db.prepare("UPDATE runs SET status = 'failed', error = 'failed' WHERE status = 'pending'").run();

  const run = (row: RunRow | undefined): Run | null =>
    row ? { id: row.id, handle: row.handle, status: row.status, error: row.error, resultKey: row.result_key, createdAt: row.created_at } : null;

  return {
    createRun(handle, now) {
      const created: Run = { id: newId(), handle, status: "pending", error: null, resultKey: null, createdAt: now.toISOString() };
      db.prepare("INSERT INTO runs (id, handle, status, created_at) VALUES (?, ?, 'pending', ?)").run(created.id, handle, created.createdAt);
      return created;
    },
    getRun(id) {
      return run(db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined);
    },
    latestRun(handle) {
      return run(db.prepare("SELECT * FROM runs WHERE handle = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(handle) as RunRow | undefined);
    },
    firstRunFor(resultKey) {
      return run(db.prepare("SELECT * FROM runs WHERE result_key = ? AND status = 'done' ORDER BY created_at, rowid LIMIT 1").get(resultKey) as RunRow | undefined);
    },
    finishRun(id, resultKey) {
      db.prepare("UPDATE runs SET status = 'done', result_key = ? WHERE id = ?").run(resultKey, id);
    },
    failRun(id, error) {
      db.prepare("UPDATE runs SET status = 'failed', error = ? WHERE id = ?").run(error, id);
    },
    saveResult(result, now) {
      db.prepare("INSERT OR REPLACE INTO results (key, handle, card, screened, created_at) VALUES (?, ?, ?, ?, ?)").run(
        result.key,
        result.handle,
        JSON.stringify(result.card),
        result.screened ? 1 : 0,
        now.toISOString(),
      );
    },
    getResult(key) {
      const row = db.prepare("SELECT * FROM results WHERE key = ?").get(key) as { key: string; handle: string; card: string; screened: number } | undefined;
      return row ? { key: row.key, handle: row.handle, card: JSON.parse(row.card) as Card, screened: row.screened === 1 } : null;
    },
    spent(day) {
      const row = db.prepare("SELECT requests FROM spend WHERE day = ?").get(day) as { requests: number } | undefined;
      return row?.requests ?? 0;
    },
    spend(day, requests) {
      db.prepare("INSERT INTO spend (day, requests) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET requests = requests + excluded.requests").run(day, requests);
    },
    close() {
      db.close();
    },
  };
}
