# X Bestiary

Turns an X handle into bestiary cards. [SPEC.md](SPEC.md) is the source of truth; this file only covers how to run what exists so far.

## What's built

Build steps 1 to 4 of the spec: from a handle to two drawn cards. The copy is real; the creature drawings are stand-ins.

- **Analyze CLI:** fetches a handle's recent tweets, saves them as a snapshot, sorts them, and prints the signals and features as JSON.
- **Calibration script:** runs the same analysis over a list of handles and writes the percentile tables every account is ranked against.
- **Classifier:** assigns a species and a variant from the active edition's content files.
- **Card selection:** picks the verdict, natures, humour bands, Habitat, generosity, rarity and evidence tier.
- **Own-words screen:** the Call and Diet show the user's own words, so they pass a blocklist, a personal-details check and the Jev classifier first.

## Setup

1. Node 22 is installed at `~/.local/opt/node`. Check with `node -v` in a new terminal window.
2. Install the project's tools (only needed once, or after `package.json` changes):

```bash
npm install
```

3. Keys live in `.env`, which is never committed: `TWITTERAPI_KEY` for tweets and `TYPESAFE_API_KEY` for the classifier.

## Commands

Analyze a handle. A snapshot under 7 days old is reused, so repeat runs cost nothing:

```bash
npm run analyze -- @sonyasupposedly
```

Force a new fetch (about $0.03 for 200 tweets):

```bash
npm run analyze -- @sonyasupposedly --refresh
```

Build calibration tables from a list of handles (one per line). Snapshots are reused, so if a run is interrupted, run the same command again. `--max-requests` is the spend cap; 5,000 requests is about $15 at most:

```bash
npm run calibrate -- data/calibration/handles-v1.txt --version v1 --max-requests 5000
```

It refuses to overwrite an existing version, because recalibration changes everyone's results. Pick a new version name, or add `--force`.

Find more handles for calibration by searching recent tweets by language and topic. It skips handles already in the first file and writes the new ones to the second (about 90 requests, under $0.30):

```bash
npm run source-handles -- data/calibration/handles.txt data/calibration/handles-expansion.txt
```

Classify a handle into a species and variant, with the scores behind the choice:

```bash
npm run classify -- @sonyasupposedly
```

Print a proof of both cards for a handle. Add `--json` for the full record with line ids, or `--no-screen` to skip the classifier (the Call and Diet are then left out):

```bash
npm run card -- @sonyasupposedly
```

Draw both cards and the link preview for a handle as PNG files in `out/`:

```bash
npm run render -- @sonyasupposedly
```

Run the web app at http://localhost:3000/hallowtide (set `PORT` to change the port). Its database is `data/bestiary.db` and its rendered cards are in `data/images/`:

```bash
npm run web
```

Draw the diagnosis card for every result on one sheet, for reviewing the art (`out/art-sheet.png`, and each card at full size as `out/gallery-<result>.png`). It also draws every link preview (`out/preview-sheet.png`):

```bash
npm run art-sheet
```

Show how the calibration accounts spread across species and variants. Run this after changing any species or variant file; it also rebuilds the score tables the classifier needs:

```bash
npm run spread
```

Run the tests and the type check:

```bash
npm test
```

```bash
npm run typecheck
```

## Where things live

| Path | What it holds |
| --- | --- |
| `src/cli.ts` | The `analyze` command: gate, fetch, snapshot, print |
| `src/twitterapi.ts` | The TwitterAPI.io fetch, with paging and a request cap |
| `src/snapshot.ts` | Saving and reusing snapshots |
| `src/tweets.ts` | Sorting tweets into originals, replies, thread replies and retweets |
| `src/signals.ts` | The 14 signals from the spec's Signal definitions table |
| `src/features.ts` | Humour inputs, Habitat, Diet terms, most-used phrase |
| `src/measures.ts` | Flattens an analysis into rankable numbers, with shrinkage for small samples |
| `src/calibration.ts` | Builds the percentile tables and looks up percentiles |
| `src/calibrate.ts` | The `calibrate` command |
| `src/source-handles.ts` | The `source-handles` command |
| `src/content.ts` | Loads an edition's content files; a missing field is an error |
| `src/classify.ts` | Two-stage assignment: species, then variant |
| `src/select.ts` | Chooses everything on both cards from the content files |
| `src/own-words.ts`, `src/jev.ts` | Call and Diet candidates, the blocklist and personal-details checks, the classifier screen |
| `src/web/` | The web app: request handling and the run queue (`app.ts`), the pipeline wrapper (`produce.ts`), the pages (`pages.ts`), the SQLite store (`store.ts`), and the entry point (`server.ts`) |
| `src/render/` | The renderer: text layout (`type.ts`), creature drawings in two inks (`figure.ts`), the two card templates (`cards.ts`), the link preview (`preview.ts`), and SVG to PNG (`png.ts`) |
| `fonts/` | The three bundled font families and their licenses |
| `content/editions/<id>/art/` | The pictures, each as a cut-out (a JPEG and an outline mask) in `pictures/`; the stand-in SVG drawings and variant props |
| `art-incoming/` | The pictures as supplied; `python3 tools/separate-flat.py` cuts them out |
| `src/ghost.ts` | Adds newsletter signups through the Ghost Admin API (copied from Divination Diagnosis; not wired in yet) |
| `tools/deploy.sh`, `tools/hallowtide.service`, `tools/backup-hallowtide` | Deploying to the studio server (needs `STUDIO_HOST`, the server's `user@host`, in `.env`), and the app's service and nightly backup there; the server's setup notes (`HOSTING.md`) are private |
| `src/pipeline.ts` | The whole run after the fetch, used by the `card` command and later the web app |
| `content/screen.json`, `content/blocklist.txt` | The screening questions and threshold; the word blocklist |
| `src/spread.ts`, `src/classify-cli.ts`, `src/card-cli.ts` | The `spread`, `classify` and `card` commands |
| `content/editions/<id>/` | One edition: species files, variants, edition settings |
| `config/active.json` | Which edition and calibration version are live |
| `calibration/<version>/tables.json` | The percentile tables. Committed; no handles or tweet text |
| `config/opt-out.txt` | Handles that must never be fetched |
| `data/` | Snapshots of real tweets, the calibration handle list and per-account results. Never committed |
| `test/` | Tests, using made-up tweets only |

## License

The code is under the MIT License (see `LICENSE`). Bundled fonts keep their own licenses, which sit beside them.
