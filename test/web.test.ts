import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { loadActiveConfig, loadEdition } from "../src/content.ts";
import { CONTENT_DIR, FONT_DIR } from "../src/paths.ts";
import type { Card } from "../src/select.ts";
import { createApp } from "../src/web/app.ts";
import { dailyBudget } from "../src/web/budget.ts";
import { loadWebCopy } from "../src/web/copy.ts";
import { esc } from "../src/web/pages.ts";
import { RunError, type Prepare } from "../src/web/produce.ts";
import { openStore } from "../src/web/store.ts";

const edition = loadEdition(loadActiveConfig().edition);
const copy = loadWebCopy(edition.id);
const PNG = Buffer.from("\x89PNG made up", "latin1");

// A stand-in for the pipeline: no network, and a card with only what the
// pages read. `builds` counts how often the slow part ran.
let builds = 0;
const prepare: Prepare = async (handle) => {
  if (handle === "nobody") throw new RunError("no_specimen");
  if (handle === "broken") throw new Error("the instruments broke");
  if (handle === "spendthrift") throw new RunError("resting");
  return {
    key: `key-${handle}`,
    async build() {
      builds++;
      const card = {
        handle,
        ink: edition.inks[0]!,
        diagnosis: { title: "Of the Ghost Moth", handle: `@${handle}`, binomial: { genus: "Phalaena", epithet: "spectralis" }, verdict: { id: "v", text: "It <circleth> the lamp." } },
      } as unknown as Card;
      return { card, screened: handle !== "unscreened", images: { diagnosis: PNG, scorecard: PNG, preview: PNG } };
    },
  };
};

// A stand-in for Ghost: it records addresses, and fails for one of them.
const subscribed: string[] = [];
const subscribe = async (email: string) => {
  if (email === "down@example.com") throw new Error("Ghost 503");
  subscribed.push(email);
};

const dir = mkdtempSync(join(tmpdir(), "bestiary-web-"));
const store = openStore(join(dir, "test.db"));
const app = createApp({
  store,
  prepare,
  look: { copy, faces: { title: "wondertype-regular.ttf", body: "toren-proportional.ttf", label: "fifteentwenty-bold.ttf" }, ink: { paper: "#111", key: "#eee", accent: "#f70", fill: "#0f0" } },
  imageDir: join(dir, "images"),
  fontDir: FONT_DIR,
  webArtDir: join(CONTENT_DIR, "editions", edition.id, "art", "web"),
  optedOut: () => new Set(["hermit"]),
  log: () => {},
  runsPerHour: 3,
  trustProxy: true,
  publicUrl: "https://studio.example/",
  subscribe,
});
const server = createServer(app.handle).listen(0);
const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
after(() => {
  server.close();
  store.close();
});

const get = (path: string) => fetch(origin + path, { redirect: "manual" });
// Each submission comes from a visitor of its own, unless one is named.
let visitors = 0;
const submit = (handle: string, from = `10.0.0.${++visitors}`) =>
  fetch(`${origin}/hallowtide`, { method: "POST", redirect: "manual", headers: { "x-forwarded-for": `203.0.113.9, ${from}` }, body: new URLSearchParams({ handle }) });

// A run's finished cards, by way of its own address.
async function sharePage(runPage: string): Promise<{ address: string; html: string }> {
  const res = await get(runPage);
  assert.equal(res.status, 303);
  const address = res.headers.get("location")!;
  return { address, html: await (await get(address)).text() };
}

test("the form page offers the handle form", async () => {
  const res = await get("/hallowtide");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes(esc(copy.form.heading)));
  assert.match(html, /<form method="post" action="\/hallowtide">/);
  // Every page's header leads back to the studio and to this project.
  assert.ok(html.includes(`<a href="/">${esc(copy.studioName)}</a><a href="/hallowtide">${esc(copy.siteName)}</a>`));
  assert.equal((await get("/")).headers.get("location"), "/hallowtide");
  // Three sample cards fan out above the heading, and all three are served.
  const cards = [...html.matchAll(/<img src="(\/hallowtide\/art\/home-[\w-]+\.jpg)"/g)].map((m) => m[1]!);
  assert.equal(cards.length, 3);
  for (const card of cards) assert.equal((await get(card)).headers.get("content-type"), "image/jpeg");
  assert.equal((await get("/hallowtide/art/passwd")).status, 404);
});

test("a handle becomes a run, which shows both cards once it is done", async () => {
  const res = await submit("https://x.com/Specimen");
  assert.equal(res.status, 303);
  const page = res.headers.get("location")!;
  assert.match(page, /^\/hallowtide\/r\/[a-z2-9]{10}$/);
  await app.idle();

  // Once done, the run's page leads to its share page.
  const { address, html } = await sharePage(page);
  assert.equal(address, page.replace("/r/", "/s/"));
  assert.ok(html.includes(`${page}/diagnosis.png`));
  assert.ok(html.includes(`${page}/scorecard.png?download=1`));
  // Words from the card are escaped on the page.
  assert.ok(html.includes("It &#60;circleth&#62; the lamp."));

  const image = await get(`${page}/scorecard.png?download=1`);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(image.headers.get("content-disposition"), 'attachment; filename="specimen-hallowtide-scorecard.png"');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);
});

test("the same handle leads to the same page, and the cards are made once", async () => {
  const first = (await submit("@repeat")).headers.get("location")!;
  await app.idle();
  const before = builds;
  const second = (await submit("repeat")).headers.get("location")!;
  await app.idle();
  assert.notEqual(second, first);
  assert.equal((await sharePage(second)).address, first.replace("/r/", "/s/"));
  assert.equal((await get(second.replace("/r/", "/s/"))).headers.get("location"), first.replace("/r/", "/s/"));
  assert.equal(builds, before);
});

test("the share page carries the link-preview tags", async () => {
  const page = (await submit("sharer")).headers.get("location")!;
  await app.idle();
  const { address, html } = await sharePage(page);
  const full = `https://studio.example${address}`;
  assert.ok(html.includes(`<meta property="og:url" content="${full}">`));
  assert.ok(html.includes(`<meta property="og:image" content="https://studio.example${page}/preview.png">`));
  assert.ok(html.includes(`<meta property="og:title" content="@sharer: Of the Ghost Moth">`));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(!html.includes("x.com/intent"));
});

test("the share page offers the newsletter, and says how the signup went", async () => {
  const page = (await submit("reader")).headers.get("location")!;
  await app.idle();
  const { address, html } = await sharePage(page);
  assert.ok(html.includes(`<form method="post" action="${address}/subscribe">`));
  assert.ok(html.includes(esc(copy.newsletter.title)));
  const signUp = (fields: Record<string, string>, from = "10.7.7.7") =>
    fetch(`${origin}${address}/subscribe`, { method: "POST", redirect: "manual", headers: { "x-forwarded-for": from }, body: new URLSearchParams(fields) });
  const outcome = async (res: Response) => {
    assert.equal(res.status, 303);
    const back = res.headers.get("location")!;
    assert.ok(back.startsWith(`${address}?signup=`) && back.endsWith("#newsletter"), back);
    return (await get(back)).text();
  };

  assert.ok((await outcome(await signUp({ email: " owl@example.com " }))).includes(esc(copy.newsletter.done)));
  assert.deepEqual(subscribed, ["owl@example.com"]);
  assert.ok((await outcome(await signUp({ email: "not an address" }))).includes(esc(copy.newsletter.invalid)));
  assert.ok((await outcome(await signUp({ email: "down@example.com" }))).includes(esc(copy.newsletter.failed)));
  // A bot that fills in the hidden field is told it worked, and nothing is sent.
  assert.ok((await outcome(await signUp({ email: "bot@example.com", website: "spam" }))).includes(esc(copy.newsletter.done)));
  assert.deepEqual(subscribed, ["owl@example.com"]);
  // Five tries an hour from one visitor (two are used above); others are not held back.
  for (const n of [3, 4, 5]) await signUp({ email: `try${n}@example.com` });
  assert.ok((await outcome(await signUp({ email: "try6@example.com" }))).includes(esc(copy.newsletter.failed)));
  await signUp({ email: "other@example.com" }, "10.7.7.8");
  assert.deepEqual(subscribed, ["owl@example.com", "try3@example.com", "try4@example.com", "try5@example.com", "other@example.com"]);
});

test("one visitor may start only a few new runs an hour", async () => {
  for (const handle of ["busy1", "busy2", "busy3"]) assert.equal((await submit(handle, "10.9.9.9")).status, 303);
  const refused = await submit("busy4", "10.9.9.9");
  assert.equal(refused.status, 429);
  assert.ok((await refused.text()).includes(esc(copy.errors.too_many)));
  // Others are not held back, and joining a run under way costs nothing.
  assert.equal((await submit("busy4", "10.9.9.10")).status, 303);
  const waiting = store.createRun("busy5", new Date());
  assert.equal((await submit("busy5", "10.9.9.9")).headers.get("location"), `/hallowtide/r/${waiting.id}`);
  store.failRun(waiting.id, "failed");
  await app.idle();
});

test("the daily budget refuses new fetches once the day's requests are spent", () => {
  const budgetStore = openStore(join(dir, "budget.db"));
  let day = new Date("2026-10-20T23:00:00Z");
  const logged: string[] = [];
  const budget = dailyBudget(budgetStore, 20, () => day, (m) => logged.push(m));
  assert.ok(budget.allows());
  budget.spend(12);
  assert.ok(budget.allows());
  budget.spend(9);
  assert.ok(!budget.allows());
  assert.ok(!budget.allows());
  assert.equal(logged.length, 1);
  // The count starts again on the next UTC day.
  day = new Date("2026-10-21T00:30:00Z");
  assert.ok(budget.allows());
  budgetStore.close();
});

test("a card made without the screen is shown but made again next time", async () => {
  await submit("unscreened");
  await app.idle();
  const before = builds;
  await submit("unscreened");
  await app.idle();
  assert.equal(builds, before + 1);
});

test("a run that is still pending shows the loading page, which watches for the end", async () => {
  const run = store.createRun("patience", new Date());
  const html = await (await get(`/hallowtide/r/${run.id}`)).text();
  assert.ok(html.includes("@patience"));
  assert.match(html, /<noscript><meta http-equiv="refresh"/);
  assert.ok(html.includes(`/hallowtide/r/${run.id}/status`));
  assert.deepEqual(await (await get(`/hallowtide/r/${run.id}/status`)).json(), { status: "pending" });
  assert.equal((await get("/hallowtide/art/loading.webp")).headers.get("content-type"), "image/webp");
  assert.equal((await get(`/hallowtide/r/${run.id}/diagnosis.png`)).status, 404);
  // A second request for the handle joins the run already under way.
  assert.equal((await submit("patience")).headers.get("location"), `/hallowtide/r/${run.id}`);
  store.failRun(run.id, "failed");
});

test("failures are told in the page's own words", async () => {
  const invalid = await submit("not a handle!");
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.text()).includes(esc(copy.errors.invalid_handle)));

  const hermit = await submit("hermit");
  assert.equal(hermit.status, 403);
  assert.ok((await hermit.text()).includes(esc(copy.errors.opted_out)));

  for (const [handle, error] of [["nobody", "no_specimen"], ["broken", "failed"], ["spendthrift", "resting"]] as const) {
    const page = (await submit(handle)).headers.get("location")!;
    await app.idle();
    assert.ok((await (await get(page)).text()).includes(esc(copy.errors[error])), handle);
  }

  const missing = await get("/hallowtide/r/2222222222");
  assert.equal(missing.status, 404);
  assert.ok((await missing.text()).includes(esc(copy.errors.not_found)));
});

test("only the pages' own fonts are served", async () => {
  const font = await get("/hallowtide/fonts/wondertype-regular.ttf");
  assert.equal(font.status, 200);
  assert.equal(font.headers.get("content-type"), "font/ttf");
  assert.equal((await get("/hallowtide/fonts/SpaceMono-Bold.ttf")).status, 404);
  assert.equal((await get("/hallowtide/fonts/..%2Fpackage.json")).status, 404);
});
