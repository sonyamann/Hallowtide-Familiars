import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

// Real tweets and handle lists. Never committed.
export const DATA_DIR = join(ROOT, "data");
export const SNAPSHOT_DIR = join(DATA_DIR, "snapshots");
// Classifier answers, saved per snapshot.
export const LABELS_DIR = join(DATA_DIR, "labels");

export const CONFIG_DIR = join(ROOT, "config");
export const OPT_OUT_FILE = join(CONFIG_DIR, "opt-out.txt");

// Versioned copy and roster, one folder per edition.
export const CONTENT_DIR = join(ROOT, "content");

// Rendered images from the command-line tools. Never committed.
export const OUT_DIR = join(ROOT, "out");

// The pinned, bundled font files. The renderer uses no others.
export const FONT_DIR = join(ROOT, "fonts");

// Versioned percentile tables. Committed; they hold no handles or tweet text.
export const CALIBRATION_DIR = join(ROOT, "calibration");

// The web app's database and rendered images. Never committed.
export const DB_FILE = join(DATA_DIR, "bestiary.db");
export const IMAGE_DIR = join(DATA_DIR, "images");
