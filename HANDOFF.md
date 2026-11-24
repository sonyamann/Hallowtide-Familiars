# Handoff note

Oct 9, 2026. Written at the end of the second long working session, for a fresh Claude Code thread with Sonya. The next job is **pass 2 of the web app: sharing**.

## Read these first

1. **[SPEC.md](SPEC.md)** is the source of truth and is current. "Outputs", "Funnel", and "Open decisions" are the parts that matter for pass 2.
2. **[README.md](README.md)** has every command and a map of the files.
3. **This note** covers the state of the work, what pass 2 involves, and what only this session knew.

## Where things stand

Everything is committed; the last commit is `c3ab55f` and the working tree is clean. All 63 tests and the type check pass (`npm test`, `npm run typecheck`).

| Build step (from the spec) | State |
| --- | --- |
| 1. Analyze CLI | Done |
| 2. Calibration | Done: v1, 712 accounts |
| 3. Classifier and selection | Done |
| 4. Card templates and renderer | Done: both cards and the link preview. Art reviewed and settled |
| 5. Web app | **Pass 1 done; pass 2 (sharing) is next; pass 3 (going live) after** |
| 6. Email and newsletter | Not started |
| 7. Ops | Not started |
| 8. Review export | Not started |

Halloween is the hard edge. The aim discussed was to be live by about October 20.

## The web app as it is (pass 1)

```bash
npm run web
```

It serves http://localhost:3000/hallowtide. The code is in `src/web/`:

| File | What it does |
| --- | --- |
| `server.ts` | Entry point: loads content, opens the database, starts the server |
| `app.ts` | Request handling and the queue that works runs (two at a time) |
| `produce.ts` | Wraps the pipeline: snapshot, cache key, card, and the three images |
| `pages.ts` | The pages as HTML strings, with their CSS. `BASE` is `/hallowtide` |
| `store.ts` | SQLite, through Node's built-in `node:sqlite`: runs and results |
| `copy.ts` | Loads and checks the page copy |

How it behaves:

- **Routes:** `/` redirects to `/hallowtide`; `GET /hallowtide` is the form; `POST /hallowtide` starts a run; `/hallowtide/r/<id>` is the run's page (loading, then both cards); `/hallowtide/r/<id>/status` is JSON for the loading page; `/hallowtide/r/<id>/{diagnosis,scorecard,preview}.png` are the images (`?download=1` to download).
- **A run** is one request for a handle, with a ten-character public id. **A result** is a finished set of cards, stored under its cache key (snapshot + edition + content version + calibration + classifier policy).
- **The same cards always live at one address:** a later run with the same result redirects to the first run that made it.
- **A card made without the classifier is shown but never reused**, as the spec requires.
- **Every page has a header** with two links: "Supposedly Studio" (to `/`, the future studio homepage) and "Hallowtide Familiars" (to the form). The footer reads "A Bestiary of Familiars · Hallowtide MMXXVI".
- **The loading page** shows Sonya's jack-o'-lantern with a candle flickering behind its cut-out face (a four-second cycle). It has the app's only script, which polls the status address so the flicker isn't interrupted; without scripts the page reloads itself.
- **Page copy** is in `content/editions/familiars-2026/web.json`. Sonya has approved it. Code writes no words.
- **Tests** are in `test/web.test.ts`, with a stand-in for the pipeline, so they make no network calls.

**The server reads content only when it starts.** After any change to content, palettes, or art, restart it, or it will serve the old version. This caught us once.

## Pass 2: sharing

What the spec asks for (see "Outputs" and "Funnel"):

1. **The share page, `/hallowtide/s/<id>`:** both cards and a "make your own" button, `noindex`, with Open Graph and X large-image card tags pointing at the link preview. The preview image is already rendered and served for every run (`preview.png`).
2. **Desktop share:** download, plus an X web-intent link with prefilled text and the share page's address.
3. **Phone share:** the native share sheet with the diagnosis card attached as a file (Web Share API), so it can go straight into the X app. This needs a little script on the results page.

Things to decide with Sonya before or while building:

- **Is the share page the same as the run page?** The run page already shows both cards at a stable address. The simplest route may be one page with the share tags on it, and `/s/<id>` as its public address. The spec names them separately; ask.
- **The share text.** The prefilled words for the X post are copy, so Sonya writes or approves them. Draft two or three options.
- **Absolute addresses.** Open Graph tags need full URLs, so the app needs to know its public origin (an environment variable, with a localhost default).
- **Link previews can't be tested on localhost.** X and other apps fetch the preview from the public internet. Testing needs the app deployed, or a tunnel; check the tags' markup locally and verify for real in pass 3.
- **Web Share with files inside X's in-app browser** is an open item in the spec and needs real iPhone and Android tests, which only Sonya can do. Build it with a fallback to download when sharing isn't available.

Pass 3 (after this): a host with a persistent disk, image storage, rate limits and bot protection, the daily spend cap, the opt-out list and takedown form, and a studio homepage at `/`.

## Decisions made this session that are easy to get wrong

These are all in the spec, but several reversed earlier choices:

- **The art is shown as cut-outs of Sonya's originals, in their own colours.** Re-inking the pictures in the card's palette was built first and dropped: it lost their texture. Each picture is stored as a JPEG and an outline mask in `content/editions/familiars-2026/art/pictures/`.
- **Each creature keeps the black from the original art.** Black enclosed by a creature's colours is part of the creature, not background. Where a black body runs into the black ground, the outline is closed along an edge measured from the picture.
- **The palettes were retuned to the art:** each one's body and accent colours are sampled from its own pictures.
- **The one-ink silhouettes are gone.** A scorecard with a band to spare at the bottom shows the rarity stamp there, enlarged. The black cat's scorecard, which has more room, still shows the full picture.
- **Names:** the site is "Hallowtide Familiars", served under `/hallowtide`. The card mark is "Hallowtide MMXXVI". The card footer is "A Bestiary of Familiars · @sonyasupposedly", which points to Sonya's X account and no longer carries the site's address.
- **The Diet is nouns only,** by an extra classifier question.
- **The Call skips downcast posts** (a setback, a bad day, self-deprecation), by an extra classifier question. Posts about the author's own body or health are allowed if they aren't downcast: Sonya decided this on purpose.
- **Kept as they were, after trials:** bone-white titles (not orange), and a 220-character Call (not 140).
- **Golden-image tests are still deferred,** at Sonya's request, because the look may change again.
- **The content version is 19.** Bump `content/VERSION` on any change to copy, palettes, or art, so saved cards are remade.

## The art tool

`tools/separate-flat.py` cuts each picture out of its background (Python, with Pillow and NumPy). Originals are in `art-incoming/`; `python3 tools/separate-flat.py [name ...]` rewrites the cut-outs and the species files' art entries. Each picture has one line of settings at the top of the file, and the header comments explain every option.

- It takes about two minutes to run on all twenty.
- **It rewrites the species JSON files every time.** Don't run a modified copy of it against the real content folder.
- `npm run art-sheet` draws every result's diagnosis card (`out/art-sheet.png`, `out/gallery-<result>.png`) and every link preview (`out/preview-sheet.png`).
- Three pictures were replaced by Sonya during the review (the monstrous bat, vampire toad, and vampire owl); the earlier versions are still in `art-incoming/`.
- The stand-in SVG drawings and props in `art/` are unused now, and could be removed.

## Known rough edges

- **`data/bestiary.db` holds local test runs,** including a sample run `2222222223` that I kept pending to view the loading page. It fails itself on the next server start. The database is not committed.
- **The loading picture's square edge shows** against the page. Sonya is fine with it.
- **A scorecard with both a Diet and a Call has no room for the stamp,** so the stamp appears on some scorecards and not others. Sonya is fine with it.
- **The production host renders the same bytes** as this Mac: confirmed Oct 19 (details in the private `HOSTING.md`).
- **`node:sqlite` is marked experimental in Node 22.** It has worked without trouble.
- **`.claude/launch.json`** lets the desktop app start the web server (`bestiary-web`, port 3000) and a static viewer for `out/` (`mockups`, port 3001).

## Things only this session knew

- **Node 22 lives at `~/.local/opt/node`.** If `node` isn't found in a shell, run `export PATH="$HOME/.local/bin:$PATH"`. Node 24 needs macOS 13.5; this Mac is on 13.0.1.
- **Keys are in `.env`:** `TWITTERAPI_KEY` and `TYPESAFE_API_KEY`. Never commit it. A fresh handle costs about $0.03 to fetch; handles with a saved snapshot under a week old cost nothing.
- **`data/` and `out/` are never committed.** `data/` holds tweet snapshots, classifier answers, the database, and rendered cards.
- **The renderer cannot mix fonts inside one line when a character is missing.** See the comments in `src/render/type.ts`. On the web pages, the label font has no middle dot, so `pages.ts` draws the dots itself.
- **resvg draws JPEG and PNG images embedded in SVG, but not WebP.**

## How Sonya likes to work

- **Explain options plainly, with a table, then give one recommendation.** She prefers the simpler stack.
- **Show, don't describe.** Render options side by side; every design decision was made by looking.
- **Her art:** fix real defects, and leave texture, flecks, and colours alone. Don't draw additions to her pictures; if something is missing, say so and she will supply a new picture or edit it herself. When she says something is wrong, look closely at the original and measure before changing anything.
- **Review things one at a time.** She went through all twenty familiars one by one.
- **Copy:** drafts go in `drafts/`, she edits, then it goes into the content files. Offer two or three variations. Nothing may imply an account is small or does poorly.
- **Oxford comma, always.**
- **Ask before committing.** She says yes, often with "commit the working tree changes with a sensible message".
