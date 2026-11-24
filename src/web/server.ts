// web: runs the Bestiary web app. Listens on PORT (default 3000) and HOST
// (default all addresses; 127.0.0.1 in production, behind Caddy).
// TRUST_PROXY=1 reads visitors' addresses from the proxy's X-Forwarded-For.
// PUBLIC_URL (e.g. https://studio.sonyasupposedly.com) is the address used in
// link previews; it defaults to this machine.
// DAILY_REQUEST_CAP is the day's limit on paid TwitterAPI requests (default
// 5000, about $15; a new handle takes about 10).

import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { loadActiveConfig } from "../content.ts";
import { parseHandleList } from "../handle.ts";
import { CONTENT_DIR, DATA_DIR, DB_FILE, FONT_DIR, IMAGE_DIR, LABELS_DIR, OPT_OUT_FILE, SNAPSHOT_DIR } from "../paths.ts";
import { loadReference } from "../pipeline.ts";
import { ghostClient } from "../ghost.ts";
import { createApp } from "./app.ts";
import { dailyBudget } from "./budget.ts";
import { loadWebCopy } from "./copy.ts";
import { BASE } from "./pages.ts";
import { pipeline } from "./produce.ts";
import { openStore } from "./store.ts";

const ref = loadReference();
const { edition } = ref;
const faces = edition.faces ?? {};
if (!faces.black || !faces.serif || !faces.monoBold) throw new Error("The web pages need the edition's black, serif, and monoBold fonts");
// The pages wear the palette of a card without variants; the first is the black cat's.
const ink = edition.inks[0]!;
if (!process.env.TWITTERAPI_KEY) console.error("TWITTERAPI_KEY is not set: only handles with a saved snapshot will work.");
if (!process.env.TYPESAFE_API_KEY) console.error("TYPESAFE_API_KEY is not set: cards will have no Call or Diet.");

const ghostUrl = process.env.GHOST_API_URL;
const ghostKey = process.env.GHOST_ADMIN_KEY;
if (!ghostUrl || !ghostKey) console.error("GHOST_API_URL or GHOST_ADMIN_KEY is not set: no newsletter signup on the share page.");
const ghost = ghostUrl && ghostKey ? ghostClient({ url: ghostUrl, adminKey: ghostKey, labels: ["Hallowtide Familiars"] }) : null;

const port = Number(process.env.PORT ?? 3000);
const cap = Number(process.env.DAILY_REQUEST_CAP ?? 5000);
if (!Number.isInteger(cap) || cap < 0) throw new Error("DAILY_REQUEST_CAP should be a whole number of requests");

mkdirSync(DATA_DIR, { recursive: true });
const store = openStore(DB_FILE);
const app = createApp({
  store,
  prepare: pipeline(ref, {
    snapshotDir: SNAPSHOT_DIR,
    labelsDir: LABELS_DIR,
    twitterKey: process.env.TWITTERAPI_KEY,
    jevKey: process.env.TYPESAFE_API_KEY,
    contentVersion: readFileSync(join(CONTENT_DIR, "VERSION"), "utf8").trim(),
    calibration: loadActiveConfig().calibration,
    budget: dailyBudget(store, cap),
  }),
  look: {
    copy: loadWebCopy(edition.id),
    faces: { title: faces.black, body: faces.serif, label: faces.monoBold },
    ink: { paper: ink.paper ?? edition.paper, key: ink.key, accent: ink.accent ?? ink.fill, fill: ink.fill },
  },
  imageDir: IMAGE_DIR,
  fontDir: FONT_DIR,
  webArtDir: join(CONTENT_DIR, "editions", edition.id, "art", "web"),
  optedOut: () => parseHandleList(readFileSync(OPT_OUT_FILE, "utf8")),
  trustProxy: process.env.TRUST_PROXY === "1",
  subscribe: ghost ? (email) => ghost.subscribe(email) : null,
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
});

const host = process.env.HOST;
createServer(app.handle).listen(port, host, () => console.log(`The Bestiary is open at http://localhost:${port}${BASE}`));
