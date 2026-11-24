# Bestiary — Spec v0.3 (Familiars Edition)

Oct 2, 2026 · @Sonya Mann · changes since v0.1 are listed at the end

## Concept

A free web app at `studio.sonyasupposedly.com` turns an X handle into two shareable images that cast the account as a medieval-bestiary creature: a **diagnosis card** and a **scorecard**. It exists for fun and to grow the Sonya Supposedly newsletter on Ghost.

The first release is a Halloween **Familiars Edition**, launched as a limited drop: 8 species, 6 of which come in 3 variants (ghost, vampire, monstrous), for 20 possible results. Later editions (a holiday edition, possibly the full bestiary) reuse the same pipeline with new content.

It is a deliberately small precursor to Autozine. It builds the same plumbing (fetch, filter, render, share, abuse controls) without Autozine's content library, quiz or payments.

**Principles**

- All user-facing copy is pre-written and vetted. Claude drafts, Sonya edits. Nothing is generated at request time.
- An LLM may classify and select, never author. Cheap models only; no high-tier inference as a core mechanic.
- Same handle + same tweet snapshot = the same images, byte for byte.
- Handle only: no display name or profile photo on any output.
- Images are the primary share format; links get a good preview as a fallback.

## Scope

v1 ships one loop: handle in, two cards out, share or email them. Everything else waits for real usage.

**In v1**

- Handle entry, fetch, filtering and feature extraction
- The Familiars Edition: 8 species and 3 variants (20 results), assigned by rules against a calibration set
- Diagnosis card, scorecard and a link-preview image
- Download, native share on mobile, X web-intent share
- "Email me the hi-res set" via Postmark, with an optional newsletter checkbox that adds the person to Ghost
- Caching, rate limits, bot protection, a spend cap, an opt-out list

**Later, not v1**

- A Bierce *Devil's Dictionary* gloss on the scorecard (v1.1)
- Molting: a monthly re-diagnosis
- Later editions with new rosters (a holiday edition, possibly the full bestiary)
- An Instagram-sized format
- Copy for non-English accounts
- Accounts, logins, payments, gifts

## Outputs

Each run produces three images and one share page. Cards are 1080 × 1350 (4:5 portrait). On a phone, X fits a single image inside a 4:5 box, so this is the largest uncropped shape there; on the web the box is roughly square, and the card takes about 80% of it. Two or more images in one post show as a carousel that crops each to about 6:5 around its centre, so the diagnosis card keeps its title and creature in the middle band, and the share action posts it alone.

| Output | Size (px) | Job | Contents |
| --- | --- | --- | --- |
| Diagnosis card | 1080 × 1350 | The share hook; must read at thumbnail size | Illustration, title, Latin binomial, @handle, one-line verdict, rarity stamp, edition mark, footer |
| Scorecard | 1080 × 1350 | Detail for people who click through | Four humours, Habitat, generosity, Diet, Call, three Natures, evidence tier, edition mark, footer |
| Link preview | 1200 × 630 | Open Graph and X large-image card for the share page | A wide layout of its own (built Oct 6), since the tall card would be cropped or unreadable: the creature and rarity stamp on the left; handle, title, Latin binomial, and verdict on the right. No footer: apps print the site's address under a preview themselves |
| Share page | `/hallowtide/s/<id>` | Fallback when someone shares a link | Both cards, a "make your own" button; unlisted, `noindex` |

**Footer on both cards:** "A Bestiary of Familiars · @sonyasupposedly" (changed Oct 8 from "The Bestiary of Sonya Supposedly · studio.sonyasupposedly.com"). Shared images carry no working link, so this printed attribution is the growth loop: it now points to Sonya's X account, not the site's address.

**Edition mark on both cards,** driven by the edition config: "Hallowtide MMXXVI" (shortened Oct 8).

**Diagnosis card**

- Illustration, large, two-color riso style: the species drawing with its variant treatment
- Title in blackletter: variant + species, e.g. "Of the Vampire Moth"; the werewolf is simply "Of the Werewolf"
- Latin binomial under it (see Classification)
- @handle
- Verdict: one pre-written line, picked per result and handle
- Rarity stamp, e.g. "Rare · 3% of specimens"

**Scorecard**

- **Four humours**, each a Roman-numeral score out of x:

| Humour | Measures |
| --- | --- |
| Sanguine | Engagement per tweet, relative to follower count |
| Choleric | Reply and quote-tweet rate |
| Melancholic | Long posts and self-thread share |
| Phlegmatic | Posting consistency (low day-to-day variance) |

- **Habitat:** posting pace and tenure, e.g. "Sighted daily since MMXI." Pace is posts per day, bucketed into about five pre-written phrases (several a day, daily, weekly, monthly, rarer).
- **Generosity:** likes given per post, phrased as a *generous* or *miserly* familiar
- **Observations:** a block of its own for the user's own words, set apart from the card's voice. Each item has a pre-written lead-in, so the modern words read as evidence the scribes took down, and the words themselves are set in the mono face.
  - **Diet:** top 3–5 distinctive terms, e.g. "It is known to feed upon: …"
  - **Call:** a quoted top tweet, filtered (see Data pipeline), e.g. "Its cry hath been set down thus: …"; falls back to their most-used phrase, then to nothing
- **Natures:** three pre-written lines, each tied to a real metric
- **Evidence tier:** classification confidence from sample size. Too thin a sample is the black cat, the lowest tier, with a thin scorecard: the humours need 30 tweets, so they are replaced by an in-world line that the cat would not be measured

Nothing on either card depends on time of day, because no time zone is available.

No raw follower counts anywhere: small accounts should not look small.

## Data pipeline

One fetch per handle per week; everything after the fetch is pure code except one cheap classifier call.

1. **Gate.** Normalize the handle, check the opt-out list, check the cache (a snapshot under 7 days old is reused).
2. **Fetch** from TwitterAPI.io's [Get User Last Tweets](https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets) endpoint with `includeReplies=true`: about 200 tweets, replies included, plus profile data from the author fields. Pages hold up to 20 tweets and are often shorter, so follow the cursor until there are enough tweets or no pages left, with a hard cap on requests. The endpoint can run out well short of the account's lifetime count. On long posts `displayTextRange` ends at the "show more" cut, so read the full `text`. Replies are needed for the Choleric score and for the werewolf, aloofness and appetite signals; they are never quoted and never feed Diet.
3. **Snapshot.** Store the raw JSON; its hash is the snapshot id.
4. **Filter.** Sort tweets into originals, quotes, replies and plain retweets. Originals and quote tweets feed Diet and Call; replies feed signals only. Plain retweets count only toward the assemblage signal; their text and engagement numbers belong to someone else and are ignored.
5. **Call candidates.** From plain English originals only: drop quote tweets, link, media and @mention posts, very short posts and anything over the Call length cap. Strip emoji and any characters the card fonts lack; if too much is lost, drop the candidate. Then a pattern screen for mechanical personal details (handles, emails, phone numbers, street addresses) and the word blocklist. The best-liked dozen go on to the classifier.
6. **Sensitivity screen.** Jev (TypeSafe's classifier, pinned to a version) answers yes/no questions about each Call candidate and each candidate Diet term, one small request per item. Questions for posts: distress (grief, illness, death), feeling low (a setback, a bad day, or the author running themselves down; added Oct 8), hostility (slurs, harassment), someone in the author's own life (family, friends, colleagues, named or not), and adult content. A question can set its own stricter threshold; distress does. Questions for terms: sensitive subject, and identity or politics. An item is rejected when any answer reaches the block threshold. The questions and threshold live in `content/screen.json`. Answers are saved with the snapshot, so a rerun gives the same card. If the classifier fails, the card is made without the Call and Diet and is not cached; unscreened text is never shown.
7. **Signals and features** (pure code):
   - the signals in the table below, which drive species and variant
   - humour inputs: engagement per tweet relative to followers, reply and quote rates, average length, posts per day and day-to-day variance
   - top distinctive terms, scored against the calibration set's term frequencies
   - most-used phrase (2–4 words)
   - posts per day and account creation year, for Habitat

No time zone is inferred and no posting-hour logic exists.

**Signal definitions**

All signals come from fields in the user and tweet objects; none need extra API calls or a time zone. Formulas are starting points for calibration, not final.

| Signal | Source fields | Starting formula | Minimum sample |
| --- | --- | --- | --- |
| Likes given per post | `author.favouritesCount`, `author.statusesCount` | favouritesCount ÷ statusesCount | statusesCount ≥ 50 |
| Best-vs-typical gap | `likeCount` on originals | max likes ÷ median likes | 20 originals |
| Aloofness | `isReply`, `entities.user_mentions`, `author.following`, `author.followers` | low reply + mention share; low following ÷ followers | 30 tweets |
| Question rate | `text` on originals | share of originals containing "?" | 20 originals |
| Replies received per like | `replyCount`, `likeCount` | sum replies ÷ sum likes, originals only | 20 originals |
| Self-thread share | `conversationId`, `isReply`, `inReplyToUsername` | share of tweets replying to self in own conversation | 30 tweets |
| Link share | `entities.urls` | share of tweets with a link | 30 tweets |
| Quotes up | `quoted_tweet.author.followers`, `author.followers` | share of quotes whose target has ≥ 10× the user's followers, ranked against accounts of similar size | 5 quotes |
| Quotes received per like | `quoteCount`, `likeCount` | sum quotes ÷ sum likes, originals only | 20 originals |
| Originals-vs-replies gap | `text`, `isReply` | difference in average length (optionally tone tag) | 15 of each |
| Seen not heard | `viewCount`, `likeCount`, `replyCount`, `retweetCount` | engagement ÷ views | 20 tweets with views |
| Silences | `createdAt` | longest gap and gap variance between posts | 30 tweets |
| Appetite | `isReply`, `entities.user_mentions` | reply share + mention rate | 30 tweets |
| Assemblage | `entities.urls`, `retweeted_tweet`, `quoted_tweet` | share of reposts, quotes and links | 30 tweets |

- **Small counts:** pull ratios toward the calibration average when counts are small (shrinkage), so one viral post or zero views doesn't decide a species.
- **Unknowns:** below a signal's minimum sample, that signal is unknown, never zero.
- **Peer ranking:** Quotes up is ranked against the 100 calibration accounts nearest in follower count, not the whole set. Ranked against everyone it mostly measured being small. Very large accounts tie near the middle, so they are effectively never moths.

## Classification

Users are scored as percentiles against a fixed calibration set, then assigned a species and a variant from the active edition.

**Calibration.** Fetch 500–1,000 varied accounts once and store their signals. Each user's signals become percentiles against this set. The set and its tables are versioned; recalibration is a deliberate release, never automatic.

**Roster.** Each result is one species plus one variant, except the werewolf (the rare result) and the black cat (too little to read), which have no variants. Six species compete on their signals; the werewolf, the black cat and the moth's second route are assigned by rules.

| Familiar | Lore | Poster type | Signal |
| --- | --- | --- | --- |
| Owl | Sees all from the branch; flies silently | The attentive lurker | Likes given per post (lifetime) |
| Toad | Ugly and venomous, but wears a jewel in its head | Usually unremarkable, occasional big hit | Gap between best post and typical post |
| Black cat | Keeps its own counsel | Gives little away | Rule: too little posted to read (under 30 tweets of its own, or too few species scorable) |
| Bat | Finds its way by echoes | Asks so others answer | Question rate, and replies received per like |
| Spider | Weaves webs | Builds threads and link-webs | Self-thread share plus link share |
| Moth | Drawn to the flame | Circles the big accounts; lives in other people's threads | Quotes accounts much larger than itself, more than its peers do. Also by rule: posts almost only replies (at most 14 originals, at least 70% of its own tweets replying to others) |
| Goat | The scapegoat | Draws the crowd's ire | Quotes received per like: gets quoted more than it gets liked |
| Werewolf (rare) | Changes form | Long-form in its posts, brief in its replies | Large gap between the length of originals and replies; in practice, long-form posters |

| Variant | Axis | Signal |
| --- | --- | --- |
| Ghost | Presence | Seen but not heard: high views, low engagement, or long silences |
| Vampire | Appetite | Feeds on others: replies and mentions |
| Monstrous | Assemblage | Stitched from others' parts: links, reposts, quotes. Frankenstein's monster in all but name: "Monstrous" reads better as an adjective and sidesteps the creature-or-doctor pedants |

**Assignment**

1. Score every signal as a percentile against the calibration set.
2. **Thin evidence:** under 30 tweets of its own → black cat, no variant.
3. **Rare:** the werewolf wins whenever its gap signal clears a high threshold (target \~5%), no variant.
4. **Constant repliers:** at most 14 originals and at least 70% of its own tweets replying to others → moth. Such accounts can't be scored on the species that need 20 originals.
5. **Otherwise, species** = the strongest of the six ordinary species. Each species' score (the mean of its signal percentiles, black-cat-style "low" signals inverted) is re-ranked against the calibration set's scores for that species, so one-signal and multi-signal species compete fairly. If fewer than 4 species can be scored → black cat.
6. **Variant** = whichever of the three variant scores, re-ranked the same way, is highest. Ties break on the handle seed.

Unknown signals are left out: a species whose signals are unknown can't be chosen. The rule thresholds live in the edition's content files.

Rarity percentages on the stamp come from the calibration set. Target spread: no species above \~25%, werewolf near its target.

**Humour scores.** Each humour maps its percentile to a band (e.g. I–V). Band copy is pre-written.

**Copy selection.** Rules pick the verdict and a default set of natures. Optionally, a cheap model ranks the species' pre-written natures against the user's tweets and returns ids only. The model never returns text that reaches the card.

**Latin name.** The genus is fixed per species and the epithet is fixed per variant: *spectralis* (ghost), *sanguisuga* (vampire, "bloodsucker"), *consuta* (monstrous, "stitched"). The moth is *Phalaena*, Linnaeus's retired catch-all genus for moths. *Consuta* is a feminine form, so the monstrous epithet has three forms (*consuta*, *consutus*, *consutum*) and each genus records its Latin gender. Nothing in the binomial is derived from the user's tweets.

**Determinism**

- Species and variant = a function of signals only, apart from the handle-seeded variant tie-break.
- Flavor (which verdict and which natures break a tie) = a random generator seeded on the handle, so it stays stable across reruns. The palette follows the variant, not the seed.
- Cache key = hash of (snapshot + edition + content version + calibration version + classifier version). Same key, same bytes.
- Fonts are bundled with the app and pinned; the renderer never reads system fonts. Renders are tested for byte-identical output.

## Content inventory

The writing and art are the critical path, not the code. Eight base drawings plus two overlay sets cover all 20 results. Copy counts below are estimates carried over from the earlier per-creature rates, to be confirmed.

| Item | Count | Notes |
| --- | --- | --- |
| Species | 8 | Name, Latin genus, signal profile, anchor points |
| Variants | 3 | Name, Latin epithet, signal, ink treatment or props |
| Base illustrations | 8 | Two-layer riso SVG (key line + fill), one per species; the werewolf and black cat have no variants |
| Overlay prop sets | 2 | Vampire and monstrous |
| Verdicts | 3–5 per species (\~32) | One line on the diagnosis card |
| Species natures | 6–8 per species (\~55) | Each tied to a metric |
| Shared natures | \~40 | Keyed to signals, usable by any species |
| Humour band copy | 4 humours × 5 bands | Short phrase per band |
| Generosity copy | A few bands | Generous through miserly |
| Habitat pace phrases | \~5 | Several a day through rarer, each joined to tenure |
| System copy | \~15 strings | Thin scorecard line, errors, loading, email, share text, edition mark |

**Art layers**

| Layer | How it's made |
| --- | --- |
| The 20 results | One finished picture each, from Sonya (Oct 6). Since Oct 9 the cards show each picture as a cut-out in its own colours and texture, trimmed along its outline; re-inking in the palette lost too much of the originals' character. Each picture is stored as a JPEG and a mask of its outline |
| Stand-in drawings | The 8 two-layer SVGs and the vampire and monstrous props remain as a fallback for any result without a picture |

A scorecard with a band of paper to spare at the bottom shows the rarity stamp there, enlarged (decided Oct 9, replacing a small one-ink silhouette that read poorly for the dark-bodied vampires); the black cat's, which has far more room, shows the picture itself.

`tools/separate-flat.py` makes the cut-outs from the files in `art-incoming/` and holds each picture's settings. Props are not drawn over a picture.

**IP guardrails**

- Monstrous: stitches and lightning only. **No flat-topped head, no neck bolts**; that look is Universal's 1931 makeup design.
- Vampire: cape and fangs only. **No widow's peak or medallion** (Universal's Lugosi Dracula look).
- The variant is named "Monstrous" on the cards, not "Frankenstein".

**Workflow.** Claude drafts one species at a time; Sonya edits. Copy lives in versioned content files, each string with an id. The drafts and Sonya's edits are kept in `drafts/`.

**Status, Oct 6:** first full pass of the copy is written and edited: all eight species, the shared natures, the humour bands, and the system lines. No placeholder text remains. What was written: 46 verdicts, 63 species natures, 18 shared natures, 20 humour bands.

**Review before launch.** Because the output space is finite, render every species × variant × verdict × nature combination into a review sheet and read it for accidental cruelty or awkward pairings.

**Look.** Halloween, decided Oct 6: flat, bold shapes on a dark ground, after vintage die-cut paper decorations and hard-candy lollipops. The cream riso look of the *Rabbit in the Margins* folios was dropped for the cards, because grain and pale paper read poorly at thumbnail size. The folio still sets the layout and the voice.

**Palettes.** Each has a dark ground, a body colour, a bone-white line and type colour, and an accent used for the frame, halo, stamp, and the shadow under the blackletter. The variant sets the palette, so a variant can be told by colour alone: ghost light (green) for ghosts, blood moon (red and amber) for vampires, witch's brew (purple and acid green) for the monstrous. The black cat is jack-o'-lantern (orange and green) and the werewolf witching hour (orange and purple). Since the cards began showing the pictures as cut-outs, each palette's body and accent colours are sampled from its own pictures (Oct 9), so the frame, title shadow, stamp, and silhouette match the art: ghosts are peach and sage, vampires red-orange and amber-orange, the monstrous violet and yellow-green.

## Funnel

Both cards are free and ungated; email is an optional delivery step that doubles as the newsletter opt-in.

1. Person enters a handle and sees a loading state while the fetch runs.
2. Both cards appear, with three actions:
   - **Share:** by the share page's address, which shows the link preview wherever it is pasted, or by downloading a card. The native share sheet and a "Post on X" link were built Oct 20 and removed Oct 31 at Sonya's request.
   - **Download** each card as a PNG.
   - **Email me the hi-res set:** an email field plus an unchecked checkbox, "Also subscribe me to Sonya Supposedly."
3. On email submit, Postmark sends one delivery email. It links to a download page on the studio site; no attachments.
4. If the box is checked, the server calls Ghost's Admin API `members.add` with `send_email: false`, the newsletter's id and the label `bestiary`. Ghost sends nothing.
5. For subscribers, the delivery email says plainly that they are now on the Sonya Supposedly list, with Ghost's unsubscribe link.

**Email setup**

- Postmark sends from a dedicated subdomain (e.g. `mail.studio.sonyasupposedly.com`) with its own SPF, DKIM and DMARC records. Bounces from junk addresses then don't touch the newsletter's sending domain.
- Use Postmark's paid tier from launch; a viral day must not hit a free-tier cap.
- Reject disposable email domains at the form.
- The newsletter checkbox is separate from delivery and unchecked by default (EU/UK opt-in rules; not legal advice).

**Events to track**

handle entered → cards rendered → shared (mobile native / web intent) → downloaded → email submitted → subscribed. Also: share-page visits that start a new run.

## Infrastructure and ops

A small web app, one database and object storage; rendering runs inside the app, with no browser and no separate worker. Every third-party key stays server-side.

| Component | Proposed choice | Why |
| --- | --- | --- |
| Web app | TypeScript on Node 22 LTS, on Node's built-in HTTP server: plain HTML and CSS, no framework (decided Oct 7). The only script is on the loading page, where it watches for the run to finish. Any host with a persistent disk | Handle form, results, share and download pages |
| Renderer | SVG templates → resvg → PNG, in the web app | Cards are fixed layouts with finite copy; resvg needs no browser and gives the same bytes on every platform. Text is wrapped in code. Playwright (headless Chromium) is the fallback if the look can't be matched |
| Database | SQLite, through Node's built-in `node:sqlite` module (decided Oct 7): one file, nothing to run. The module is still marked experimental in Node 22 | Runs, results, emails. Snapshots and labels are files on disk |
| Image storage | Object storage (S3 or R2) | Rendered PNGs served by URL |
| Tweets | TwitterAPI.io | Chosen for Autozine; same accepted risk |
| Sensitivity screen | Jev (TypeSafe), version pinned | About 20 small requests per user, well under a tenth of a cent in total; no fallback classifier, by decision |
| Email | Postmark | Delivery email only |
| Newsletter | Ghost Admin API, custom integration key | Silent member add |

**Abuse and cost controls**

- Per-IP rate limit and bot protection (e.g. Cloudflare Turnstile) on the handle form
- Daily spend cap on TwitterAPI.io, with an alert
- Opt-out list checked at fetch time, plus a takedown form
- A queue on fetches and renders, so a spike degrades to waiting rather than errors

**Environment variables:** `TWITTERAPI_KEY`, `TYPESAFE_API_KEY`, `POSTMARK_TOKEN`, `GHOST_ADMIN_URL`, `GHOST_ADMIN_KEY`, `GHOST_NEWSLETTER_ID`, plus storage and database credentials.

## Edge cases

Every failure renders as an in-world card, never a broken page.

| Case | Handling |
| --- | --- |
| Protected, suspended or nonexistent account | "No specimen found" card |
| Fewer than 30 tweets of its own, mostly reposts, or too few species scorable | Black cat, lowest evidence tier, thin scorecard |
| Posts almost only replies | Moth, by rule, with its variant as usual |
| No safe Call candidate | Most-used phrase; if that fails the blocklist, omit the Call |
| Top term fails the blocklist | Next term; if none pass, omit Diet |
| Non-English account | Signals and species still work; skip Diet and Call (v1) |
| Sparse `viewCount` | The ghost falls back to silences |
| Long handle | Fixed truncation rule and a fallback font for characters the display faces lack |
| Heavy poster (200 tweets = 2 days) | Silences and Phlegmatic are less reliable; lower evidence tier |
| Handle on the opt-out list | Polite refusal, no fetch |
| TwitterAPI.io down | "The scribes are away" message; nothing cached from a partial run |
| Classifier down | The card is made without the Call and Diet, and is not cached, so a later run screens again. No fallback classifier |
| Traffic spike | Queue with a visible wait |

## Open decisions and things to verify

Grouped by what each one blocks.

**Before design**

- [x] Card dimensions: 1080 × 1350, decided Oct 6 from Sonya's screenshots of X on phone and web (a first attempt at 16:9 was dropped: it is the smallest shape on both). Unknown: how the audience splits between phone and web; square would suit a mostly-web audience better
- [x] The art: Sonya supplied a picture for each of the 20 results (Oct 6) and replaced three of them (the monstrous bat, vampire toad, and vampire owl). She reviewed all 20 one by one on Oct 9; the cards show them as cut-outs in their own colours
- [x] The roster: 8 species and 3 variants (see Classification)
- [x] Latin names, settled Oct 6: *Strix* (owl), *Bufo* (toad), *Vespertilio* (bat), *Aranea* (spider), *Phalaena* (moth), *Capra* (goat), *Lupus versipellis* (werewolf), *Felis taciturna* (black cat). Variant epithets: *spectralis*, *sanguisuga*, and *consuta* with masculine and neuter forms

**Before building**

- [x] TwitterAPI.io, checked Oct 1, 2026: `includeReplies` is off by default; up to 20 tweets per page; $0.15 per 1,000 tweets (about $0.03 per handle, $15–30 for calibration); minimum $0.00015 per call. Live responses nest tweets under `data.tweets`, which the docs don't show, and include plain retweets
- [x] Field checks, run on 412 accounts and 63,104 tweets (calibration v0, Oct 2):
  - `author.favouritesCount`: returned and non-zero on every account (the owl is safe)
  - `quoted_tweet.author.followers`: present on 99% of quote tweets (the moth is safe)
  - `viewCount`: present on effectively all tweets from 2023 on, zero before about 2022 (the ghost is safe on recent tweets)
  - **`source` fails:** it reads "Twitter for iPhone" on every tweet, so it is a placeholder, not the real client
- [x] Habitat: posting pace replaces the client, decided Oct 2
- [x] Goat signal: quotes received per like, decided Oct 2. Getting ratioed was too rare to rank on (90th percentile about 2% of originals), and replies + quotes per like duplicated the bat (correlation 0.97). The measure shows provoking a response more than approval; it cannot tell ire from praise
- [x] Moth signal: ranked against accounts of similar size, decided Oct 2. Against the whole set the median share was 67% for accounts under 2,000 followers and 4% above 100,000
- [x] Werewolf signal: kept as the length gap, decided Oct 2. In practice it picks out long-form posters (median original 454 characters against 117), and the lore is read loosely to fit. Accounts with under 15 replies can't qualify
- [ ] Goat signal leans toward large accounts (27% of them against 9% of the survey list); tune with the moth-style peer ranking if it persists
- [x] Close calls: no hysteresis, decided Oct 2. A quarter of accounts win their species by under 5 points, and simulating each account a week apart changed about 13% of species. Repeat runs are expected to be rare, and a different result later is acceptable
- [x] Diet screening: Diet terms go through the same sensitivity screen as the Call, as well as the blocklist, decided Oct 5. The first real proof put "intoxicated" and "consent" in Diet, which no profanity list would catch
- [x] The Call skips posts where the author is feeling low, decided Oct 8 after a card quoted "incredibly bombed a job interview today, horrible". A new question at the usual threshold scored eight such posts 0.89–0.97 and eleven of twelve ordinary ones 0.25 or under; a mildly self-deprecating joke scored 0.53 and is dropped too. The candidate pool went from 12 posts to 16
- [x] Diet is nouns only, decided Oct 8: Diet terms get one more classifier question, "is it something other than a noun?", at the usual threshold. On sample words it scored nouns 0.03–0.19 and other words 0.88–0.97; words that are both ("love", "building") pass. The candidate pool went from 10 terms to 16 to make up for the ones dropped. The most-used phrase is not asked this question
- [x] Word blocklist: built Oct 5 from cuss (words rated likely profane, MIT) and Shutterstock's LDNOOBW list (CC BY 4.0), 1,575 entries, editable by hand
- [x] Calibration set v1 (Oct 2): 712 accounts. 412 from the survey list plus 300 found by search: 100 non-English across ten languages, 100 with 100,000+ followers, 100 everyday English accounts. Search finds active, visible accounts, so it is a convenience sample
- [ ] Rough species and variant spread on the calibration set: no species above \~25%, werewolf near its target
- [x] Classifier: Jev, decided Oct 5
- [ ] Screen thresholds: first check done Oct 5 on 200 Call candidates (120 random, 80 chosen by keyword), labelled by Claude rather than by hand. The original settings let through 4 of 22 flagged posts, so distress now blocks at 0.2 and the private-person question was reworded to cover anyone in the author's life, named or not. With those changes 38 of 39 flagged posts are blocked, along with about 18% of ordinary candidates. Still needed: Sonya's review of the disagreements, since the labels are a second opinion and not hers
- [x] Renderer: SVG and resvg confirmed Oct 6. The Rabbit folio rebuilt as SVG matches the reference: the multiply blend, all three font families, the halftone dots, the rotated stamp, and every line break. It renders in under 100 ms and gives identical bytes on repeat runs. Playwright is not needed. Confirmed Oct 19 on the production host (the studio Droplet, Linux x86_64): all 20 diagnosis cards and the link-preview sheet are byte-identical to the development machine's
- [x] PII screen: patterns in TypeScript for mechanical details, plus a classifier question for naming a private person, decided Oct 5. Presidio is not used

**Before launch**

- [ ] Launch date for the edition; Halloween is the hard edge
- [ ] Postmark sending subdomain and DNS records
- [ ] Data retention: how long snapshots, tweet text and emails are kept
- [ ] Privacy policy and terms (emails and third parties' tweets are stored)
- [ ] Success thresholds: share rate, email capture rate, subscribe rate

## Claude Code handoff

Build the pipeline end to end with placeholder content first; real copy and art drop in later as content files.

**Context for Claude Code**

- This spec is the source of truth. Autozine is a separate, larger project: don't import its quiz, asset library, tarot, corpus or payment features.
- The owner is a writer, not a full-time engineer. Prefer boring, well-documented tools, explain setup steps plainly, and keep the codebase small.
- **Code never writes copy.** Every user-facing string comes from versioned content files by id. If a string is missing, fail loudly; don't improvise text.
- **Model calls classify or rank only.** Their outputs are labels and ids, never text that reaches a card.
- **Determinism is a requirement, not a nicety.** No unseeded randomness, no wall-clock values in renders, pinned fonts.
- Show the handle only; never the display name or profile photo.
- **Nothing about the roster is hard-coded.** Species, variants and edition names come from the active edition's content files; the active edition is a config value. The edition id and the variant are part of the result record and the cache key.
- **Don't infer time zones.**

**Build order**

1. **Analyze CLI:** `analyze @handle` fetches, snapshots, filters and prints signals and features as JSON. Test on 5 varied accounts.
2. **Calibration script:** runs over a list of handles and writes versioned percentile tables.
3. **Classifier and selection,** using stub content: the 8 species and 3 variants as placeholder content files under the edition. Two-stage assignment: species first, then variant; the werewolf and black cat skip the variant stage.
4. **Card templates and renderer:** SVG templates → resvg → PNG. Start with the Rabbit folio test under Open decisions. Support a base SVG, an optional ink treatment (ghost) and optional prop overlays placed by the species' anchor points, plus the edition mark. Add golden-image tests: the same snapshot must produce identical bytes.
5. **Web app:** handle form, results page, downloads, Web Share on mobile, X web intent, share page with Open Graph and X card tags. *Pass 1 built Oct 7 (`npm run web`): the form, a loading page with a candle-lit jack-o'-lantern, and a results page with both cards and downloads. The same cards always live at one address. Every page has a header with two links home: the studio site (the root of the domain, still to be built) and this project, which the pages call Hallowtide Familiars and serve under `/hallowtide` (Oct 8). Still to come: sharing and the share page, then hosting and abuse controls.*
6. **Email and newsletter** behind feature flags: Postmark delivery; Ghost `members.add` with `send_email: false`, the `bestiary` label and the newsletter id.
7. **Ops:** rate limiting, Turnstile, spend cap and alert, opt-out list, request queue.
8. **Review export:** a script that renders every species × variant combination, with each verdict and nature, into a sheet for editorial review.

**Suggested content layout**

- `content/editions/<edition-id>/` holds one edition; the first id is `familiars-2026`
- `species/<slug>.json`: name, genus, signal profile, verdicts, natures, illustration file, anchor points; optionally `rare`, `route` (`thin` or `replier`) and `"variants": false`
- `variants.json`: name, epithet, signal, ink treatment or props
- `natures-shared.json`, `humours.json`, `system.json`: footer, title and other templates, rarity bands, Habitat pace phrases, generosity bands, evidence tiers, the thin-scorecard line
- Each nature carries `when` conditions on measure percentiles; a species needs at least three with no conditions, so three can always be shown
- `content/blocklist.txt`: words never shown on a card
- `content/screen.json`: the classifier's questions, block threshold and Call limits
- `content/VERSION`: bumped on every content change, part of the cache key

**Design reference.** The folios on the *Rabbit in the Margins* canvas set the look. The reference folios are HTML at 900 × 1350; the cards are rebuilt from them as SVG. The folio's fonts are IM Fell English, UnifrakturMaguntia and Space Mono (Google Fonts, OFL). The Familiars Edition cards use their own, chosen Oct 6: WonderType for titles, Toren for body text and the user's own words, and FifteenTwenty for the handle and labels. All are bundled with the app, with licenses, in `fonts/`; an edition names its font files in its content. Paper is #F3EEE3. Ink pairs: #2A43A6 + #FF4F9A, #0E6B62 + #FFB000. Overlapping inks multiply. Misregistration is a small fixed offset of the second ink layer.

## Changes since v0.1

- **Renderer:** SVG templates and resvg replace HTML/CSS and Playwright. This removes the render worker and the headless browser; Playwright stays as the fallback.
- **Runtime:** Node 22 LTS. Node 24 needs macOS 13.5 or later, and the development Mac is on 13.0.1.
- **TwitterAPI.io:** parameters and pricing verified; the fetch step now follows the cursor rather than counting pages.
- **Call:** emoji and unsupported characters are stripped, since there is no browser font fallback.
- **New open decision:** how to run the PII screen, given Presidio is Python-only.

## Changes since v0.2

From the Familiars Edition change note (Oct 1, 2026).

- **Roster:** the 12-creature bestiary is replaced by the Familiars Edition: 8 species and 3 variants (22 results at the time; 20 after the first spread, below).
- **Signals:** every species and variant keys on fields TwitterAPI.io returns. All posting-hour and time zone logic is gone.
- **Latin name:** genus per species, epithet per variant. The user's top term moves to Diet, and the epithet fallback list is dropped.
- **Scorecard:** Habitat is client and tenure; Melancholic is long posts plus self-thread share; a generosity line is added.
- **Editions:** content lives under `content/editions/<edition-id>/`; the edition is in the cache key and marked on both cards.
- **Art:** base drawings plus ghost treatment and prop overlays, with IP guardrails.
- **Halloween look (Oct 6):** dark grounds and flat colour replace cream riso; palettes follow the variant; cards are 1080 × 1350.
- **After calibration v0 (Oct 2):** Habitat's client became posting pace, because the API's `source` field is a placeholder. The goat's signal became quotes received per like. The moth is ranked against accounts of its own size.
- **After the first spread (Oct 2):** Juvenile Specimen is gone. Accounts with too little to read become the black cat, which loses its signals and variants, because its aloofness signal mostly picked out broadcast-style accounts. Constant repliers become moths by rule (at most 14 originals, 70%+ replies); the moth balanced better than the bat. The roster is now 20 results. Hysteresis is dropped: a different result on a later run is acceptable.
