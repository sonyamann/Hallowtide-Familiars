// The web app's request handling: the handle form, a run's page (loading),
// the share page (both cards, at /s/<id>), the card images, and the fonts.
// Runs are worked through a small queue inside the app, so a burst of
// requests waits its turn; each visitor may start only a few an hour.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { looksLikeEmail } from "../ghost.ts";
import { InvalidHandleError, normalizeHandle } from "../handle.ts";
import type { ErrorCode } from "./copy.ts";
import { BASE, formPage, HOME_CARDS, loadingPage, resultPage, type Look, type Signup } from "./pages.ts";
import { IMAGES, RunError, type ImageName, type Prepare } from "./produce.ts";
import type { Run, Store } from "./store.ts";

export interface AppOptions {
  store: Store;
  prepare: Prepare;
  look: Look;
  imageDir: string;
  fontDir: string;
  // The web pages' own pictures: the loading page's and the form page's.
  webArtDir: string;
  // Handles that must never be fetched, read afresh for each request.
  optedOut: () => Set<string>;
  // How many runs are worked at once.
  concurrency?: number;
  // How many new runs one visitor may start in an hour.
  runsPerHour?: number;
  // Read visitors' addresses from the proxy's X-Forwarded-For.
  trustProxy?: boolean;
  // The site's public origin, e.g. https://studio.sonyasupposedly.com, for
  // the share page's address in link previews.
  publicUrl: string;
  now?: () => Date;
  // Adds an address to the newsletter; without it, the signup isn't shown.
  subscribe?: ((email: string) => Promise<void>) | null;
  log?: (message: string) => void;
}

export interface App {
  handle(req: IncomingMessage, res: ServerResponse): void;
  // Resolves once no run is waiting or being worked.
  idle(): Promise<void>;
}

const RUN_ID = "[2-9a-km-np-z]{10}";
const WEB_ART: Record<string, string> = { "loading.webp": "image/webp", ...Object.fromEntries(HOME_CARDS.map((name) => [`${name}.jpg`, "image/jpeg"])) };
const MAX_BODY = 2048;
// Newsletter signups allowed from one visitor in an hour.
const SIGNUPS_PER_HOUR = 5;
const SIGNUP_STATES = new Set(["done", "invalid", "failed"]);

export function createApp(opts: AppOptions): App {
  const { store, prepare, look, imageDir, log = console.error, now = () => new Date() } = opts;
  const publicUrl = opts.publicUrl.replace(/\/+$/, "");
  const starts = new Map<string, number[]>();
  const signups = new Map<string, number[]>();
  const fonts = new Set(Object.values(look.faces));
  const waiting: Run[] = [];
  let working = 0;
  let whenIdle: (() => void)[] = [];

  const imagePath = (key: string, name: ImageName) => join(imageDir, key, `${name}.png`);

  async function work(run: Run): Promise<void> {
    try {
      const prepared = await prepare(run.handle);
      const saved = store.getResult(prepared.key);
      if (!saved?.screened || !IMAGES.every((name) => existsSync(imagePath(prepared.key, name)))) {
        const built = await prepared.build();
        mkdirSync(join(imageDir, prepared.key), { recursive: true });
        for (const name of IMAGES) writeFileSync(imagePath(prepared.key, name), built.images[name]);
        store.saveResult({ key: prepared.key, handle: run.handle, card: built.card, screened: built.screened }, new Date());
      }
      store.finishRun(run.id, prepared.key);
    } catch (err) {
      if (!(err instanceof RunError)) log(`run ${run.id} (@${run.handle}) failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      store.failRun(run.id, err instanceof RunError ? err.code : "failed");
    }
  }

  function pump(): void {
    while (working < (opts.concurrency ?? 2) && waiting.length) {
      const run = waiting.shift()!;
      working++;
      void work(run).finally(() => {
        working--;
        pump();
      });
    }
    if (!working && !waiting.length) {
      for (const done of whenIdle) done();
      whenIdle = [];
    }
  }

  function html(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
  }

  function redirect(res: ServerResponse, to: string): void {
    res.writeHead(303, { location: to });
    res.end();
  }

  function notFound(res: ServerResponse): void {
    html(res, 404, formPage(look, "not_found"));
  }

  function file(res: ServerResponse, path: string, type: string, headers: Record<string, string> = {}): void {
    if (!existsSync(path)) return notFound(res);
    res.writeHead(200, { "content-type": type, ...headers });
    res.end(readFileSync(path));
  }

  // The visitor's address: behind Caddy, the last X-Forwarded-For entry is
  // the one Caddy saw.
  function visitor(req: IncomingMessage): string {
    const forwarded = opts.trustProxy ? String(req.headers["x-forwarded-for"] ?? "").split(",").at(-1)?.trim() : "";
    return forwarded || req.socket.remoteAddress || "?";
  }

  // Counts one try against the visitor's hour; false once they have had
  // their share.
  function admit(tries: Map<string, number[]>, who: string, perHour: number): boolean {
    const hourAgo = now().getTime() - 3600_000;
    const recent = (tries.get(who) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= perHour) {
      tries.set(who, recent);
      return false;
    }
    tries.set(who, [...recent, now().getTime()]);
    if (tries.size > 10_000) for (const [key, times] of tries) if (!times.some((t) => t > hourAgo)) tries.delete(key);
    return true;
  }

  function start(req: IncomingMessage, res: ServerResponse, input: string): void {
    let handle: string;
    try {
      handle = normalizeHandle(input);
    } catch (err) {
      if (err instanceof InvalidHandleError) return html(res, 400, formPage(look, "invalid_handle", input));
      throw err;
    }
    if (opts.optedOut().has(handle)) return html(res, 403, formPage(look, "opted_out"));
    // Someone already waiting on this handle shares the same run.
    const latest = store.latestRun(handle);
    if (latest?.status === "pending") return redirect(res, `${BASE}/r/${latest.id}`);
    if (!admit(starts, visitor(req), opts.runsPerHour ?? 10)) return html(res, 429, formPage(look, "too_many", `@${handle}`));
    const run = store.createRun(handle, now());
    waiting.push(run);
    pump();
    redirect(res, `${BASE}/r/${run.id}`);
  }

  function runPage(res: ServerResponse, run: Run): void {
    if (run.status === "pending") return html(res, 200, loadingPage(look, run.id, run.handle));
    if (run.status === "failed") return html(res, 200, formPage(look, (run.error ?? "failed") as ErrorCode, `@${run.handle}`));
    sharePage(res, run);
  }

  // The finished cards. The same cards always live at one address: the share
  // page of the first run that made them.
  function sharePage(res: ServerResponse, run: Run, current = false, signupState?: string | null): void {
    if (run.status !== "done") return redirect(res, `${BASE}/r/${run.id}`);
    const first = store.firstRunFor(run.resultKey!) ?? run;
    if (!current || first.id !== run.id) return redirect(res, `${BASE}/s/${first.id}`);
    const result = store.getResult(run.resultKey!);
    if (!result) return notFound(res);
    const signup: Signup | null = opts.subscribe
      ? { action: `${BASE}/s/${run.id}/subscribe`, state: signupState && SIGNUP_STATES.has(signupState) ? (signupState as Signup["state"]) : undefined }
      : null;
    html(res, 200, resultPage(look, run.id, result.card, publicUrl, signup));
  }

  // The newsletter form on the share page. A filled-in honeypot is a bot and
  // is told it worked, as is an address already on the list, so the page
  // never reveals who is subscribed.
  async function subscribe(req: IncomingMessage, res: ServerResponse, run: Run, body: URLSearchParams): Promise<void> {
    const back = (state: string) => redirect(res, `${BASE}/s/${run.id}?signup=${state}#newsletter`);
    if (!opts.subscribe || run.status !== "done") return redirect(res, `${BASE}/s/${run.id}`);
    if (body.get("website")) return back("done");
    const email = (body.get("email") ?? "").trim();
    if (!looksLikeEmail(email)) return back("invalid");
    if (!admit(signups, visitor(req), SIGNUPS_PER_HOUR)) return back("failed");
    try {
      await opts.subscribe(email);
      back("done");
    } catch (err) {
      log(`newsletter signup failed: ${err instanceof Error ? err.message : String(err)}`);
      back("failed");
    }
  }

  function readBody(req: IncomingMessage, res: ServerResponse, then: (body: URLSearchParams) => void | Promise<void>): void {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on("end", () => guard(res, () => then(new URLSearchParams(body))));
  }

  function route(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "POST" && path === BASE) return readBody(req, res, (body) => start(req, res, body.get("handle") ?? ""));
    const signup = path.match(new RegExp(`^${BASE}/s/(${RUN_ID})/subscribe$`));
    if (req.method === "POST" && signup) {
      const run = store.getRun(signup[1]!);
      if (!run) return notFound(res);
      return readBody(req, res, (body) => subscribe(req, res, run, body));
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD, POST" });
      res.end();
      return;
    }
    if (path === "/") return redirect(res, BASE);
    if (path === BASE) return html(res, 200, formPage(look));

    const font = path.match(new RegExp(`^${BASE}/fonts/([\\w.-]+)$`));
    if (font && fonts.has(font[1]!)) return file(res, join(opts.fontDir, font[1]!), "font/ttf", { "cache-control": "public, max-age=604800" });

    const art = path.match(new RegExp(`^${BASE}/art/([\\w.-]+)$`));
    if (art && WEB_ART[art[1]!]) return file(res, join(opts.webArtDir, art[1]!), WEB_ART[art[1]!]!, { "cache-control": "public, max-age=604800" });

    const status = path.match(new RegExp(`^${BASE}/r/(${RUN_ID})/status$`));
    if (status) {
      const run = store.getRun(status[1]!);
      res.writeHead(run ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ status: run?.status ?? "missing" }));
      return;
    }
    const page = path.match(new RegExp(`^${BASE}/r/(${RUN_ID})$`));
    if (page) {
      const run = store.getRun(page[1]!);
      return run ? runPage(res, run) : notFound(res);
    }
    const share = path.match(new RegExp(`^${BASE}/s/(${RUN_ID})$`));
    if (share) {
      const run = store.getRun(share[1]!);
      return run ? sharePage(res, run, true, url.searchParams.get("signup")) : notFound(res);
    }
    const image = path.match(new RegExp(`^${BASE}/r/(${RUN_ID})/(${IMAGES.join("|")})\\.png$`));
    if (image) {
      const run = store.getRun(image[1]!);
      if (run?.status !== "done") return notFound(res);
      const name = image[2] as ImageName;
      const headers: Record<string, string> = { "cache-control": "public, max-age=3600" };
      if (url.searchParams.has("download")) headers["content-disposition"] = `attachment; filename="${run.handle}-hallowtide-${name}.png"`;
      return file(res, imagePath(run.resultKey!, name), "image/png", headers);
    }
    notFound(res);
  }

  function guard(res: ServerResponse, act: () => void): void {
    try {
      act();
    } catch (err) {
      log(`request failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      if (!res.headersSent) html(res, 500, formPage(look, "failed"));
      else res.end();
    }
  }

  return {
    handle: (req, res) => guard(res, () => route(req, res)),
    idle: () => (working || waiting.length ? new Promise((resolve) => whenIdle.push(resolve)) : Promise.resolve()),
  };
}
