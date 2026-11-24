// The web pages, as HTML strings. Every word comes from the web copy or the
// card. The pages are plain HTML and CSS; only the loading page has a
// script, which watches for the run to finish.

import type { Card } from "../select.ts";
import type { ErrorCode, WebCopy } from "./copy.ts";

export const BASE = "/hallowtide";

// The sample cards fanned out on the form page, left to right.
export const HOME_CARDS = ["home-owl-ghost", "home-bat-vampire", "home-moth-monstrous"];

export interface Look {
  copy: WebCopy;
  // Font files by role, served from BASE/fonts.
  faces: { title: string; body: string; label: string };
  // The colours of a page with no result on it.
  ink: { paper: string; key: string; accent: string; fill: string };
}

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// The label font has no middle dot, so text joined by one is set as spans
// and the dots are drawn between them.
function dotted(text: string): string {
  return text.split(" · ").map((part) => `<span>${esc(part)}</span>`).join(" ");
}

function fill(template: string, handle: string): string {
  return template.replace("{handle}", handle);
}

function page(look: Look, title: string, body: string, ink = look.ink, head = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
${head}<style>
@font-face { font-family: "Title"; src: url("${BASE}/fonts/${look.faces.title}"); font-display: swap; }
@font-face { font-family: "Body"; src: url("${BASE}/fonts/${look.faces.body}"); font-display: swap; }
@font-face { font-family: "Label"; src: url("${BASE}/fonts/${look.faces.label}"); font-display: swap; }
:root { --paper: ${ink.paper}; --key: ${ink.key}; --accent: ${ink.accent}; --fill: ${ink.fill}; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: var(--paper); color: var(--key); font: 20px/1.5 "Body", Georgia, serif; }
main { flex: 1; display: flex; flex-direction: column; justify-content: center; width: 100%; max-width: 1100px; margin: 0 auto; padding: 48px 20px; text-align: center; }
h1 { margin: 0 0 16px; font: 400 clamp(36px, 7vw, 64px)/1.05 "Title", Georgia, serif; text-shadow: 0.04em 0.03em 0 var(--accent); text-wrap: balance; }
p { margin: 0 auto 24px; max-width: 34em; text-wrap: pretty; }
.label, button, .button, header, footer, input { font-family: "Label", ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase; }
form { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin: 32px 0; }
label { position: absolute; left: -9999px; }
input { width: min(100%, 320px); padding: 14px 16px; font-size: 18px; text-transform: none; color: var(--key); background: transparent; border: 2px solid var(--key); }
input::placeholder { color: var(--key); opacity: 0.5; }
button, .button { display: inline-block; padding: 14px 20px; font-size: 15px; color: var(--paper); background: var(--accent); border: 2px solid var(--accent); cursor: pointer; text-decoration: none; }
.button.quiet { color: var(--key); background: transparent; border-color: var(--key); }
.newsletter { width: min(100%, 560px); margin: 16px auto 40px; padding: 28px 20px 8px; border-top: 1px dashed var(--key); border-bottom: 1px dashed var(--key); }
.newsletter h2 { margin: 0 0 8px; font: 400 clamp(26px, 5vw, 36px)/1.1 "Title", Georgia, serif; text-shadow: 0.04em 0.03em 0 var(--accent); }
.newsletter form { margin: 20px 0; }
.newsletter .said { font-style: italic; }
.website { position: absolute; left: -9999px; }
:focus-visible { outline: 3px solid var(--fill); outline-offset: 3px; }
.error { color: var(--paper); background: var(--key); padding: 12px 16px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 32px; margin: 40px 0; }
figure { margin: 0; }
figure img { display: block; width: 100%; height: auto; }
figcaption { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; font-size: 14px; }
header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 24px; padding: 18px 0; margin: 0 20px; font-size: 13px; border-bottom: 1px dashed var(--key); }
header a { color: var(--key); text-decoration: none; }
header a:hover { color: var(--accent); }
footer { padding: 20px; font-size: 12px; text-align: center; border-top: 1px dashed var(--key); margin: 0 20px; }
footer span { white-space: nowrap; }
footer span:not(:last-child)::after { content: ""; display: inline-block; width: 0.35em; height: 0.35em; margin: 0 0.5em 0 0.9em; border-radius: 50%; background: currentColor; vertical-align: middle; }
.fan { display: flex; justify-content: center; align-items: center; width: min(100%, 560px); margin: 0 auto 36px; padding: 12px 0; }
.fan img { display: block; width: 32%; height: auto; box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55); }
.fan img:nth-child(1) { transform: rotate(-7deg) translate(7%, 4%); }
.fan img:nth-child(2) { position: relative; z-index: 1; width: 37%; }
.fan img:nth-child(3) { transform: rotate(7deg) translate(-7%, 4%); }
.lantern { position: relative; width: min(100%, 340px); aspect-ratio: 1; margin: 0 auto 28px; }
.lantern > * { position: absolute; inset: 0; width: 100%; height: 100%; }
.candle { inset: 26% 22% 30% 26%; width: auto; height: auto; background: radial-gradient(circle at 50% 62%, #fff6c4 0, #ffd23a 22%, #ff9a1f 60%); }
@media (prefers-reduced-motion: no-preference) { .candle { animation: flicker 4s ease-in-out infinite; } }
@keyframes flicker { 0%, 100% { opacity: 0.95; } 12% { opacity: 0.74; } 24% { opacity: 1; } 41% { opacity: 0.84; } 52% { opacity: 0.6; } 63% { opacity: 0.96; } 78% { opacity: 0.8; } 88% { opacity: 1; } }
</style>
</head>
<body>
<header><a href="/">${esc(look.copy.studioName)}</a><a href="${BASE}">${esc(look.copy.siteName)}</a></header>
<main>
${body}
</main>
<footer>${dotted(look.copy.footer)}</footer>
</body>
</html>
`;
}

function form(look: Look, value = ""): string {
  const { form: f } = look.copy;
  return `<form method="post" action="${BASE}">
<label for="handle">${esc(f.label)}</label>
<input id="handle" name="handle" value="${esc(value)}" placeholder="${esc(f.placeholder)}" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="60" required>
<button type="submit">${esc(f.button)}</button>
</form>`;
}

// Every page has a header with two ways home: the studio site this project
// lives on (the root of the same domain), and this project's own form.
// The handle form, with an error above it when the last try failed.
export function formPage(look: Look, error?: ErrorCode, value = ""): string {
  const { form: f, errors } = look.copy;
  // An error needs to be seen at once, so the cards step aside for it.
  const fan = error ? "" : `<div class="fan" aria-hidden="true">${HOME_CARDS.map((name) => `<img src="${BASE}/art/${name}.jpg" width="540" height="675" alt="">`).join("")}</div>\n`;
  const body = `${fan}<h1>${esc(f.heading)}</h1>
<p>${esc(f.intro)}</p>
${error ? `<p class="error" role="alert">${esc(errors[error])}</p>` : ""}
${form(look, value)}`;
  return page(look, look.copy.siteName, body);
}

// Shown while a run is pending: a jack-o'-lantern whose carved face is cut
// out of the picture, with a candle flickering behind it. A script asks
// after the run and turns the page when it is done, so the candle is not
// interrupted; without scripts, the page reloads itself instead.
export function loadingPage(look: Look, runId: string, handle: string): string {
  const { loading } = look.copy;
  const heading = fill(loading.heading, handle);
  const body = `<div class="lantern" aria-hidden="true"><div class="candle"></div><img src="${BASE}/art/loading.webp" width="720" height="720" alt=""></div>
<h1>${esc(heading)}</h1>
<p>${esc(loading.line)}</p>
<script>
setInterval(async () => {
  try {
    const res = await fetch("${BASE}/r/${runId}/status", { cache: "no-store" });
    if ((await res.json()).status !== "pending") location.reload();
  } catch {}
}, 1500);
</script>`;
  return page(look, heading, body, look.ink, '<noscript><meta http-equiv="refresh" content="2"></noscript>\n');
}

// The newsletter form: where it posts, and how the last try went.
export interface Signup {
  action: string;
  state?: "done" | "invalid" | "failed";
}

// The newsletter signup under the cards. The "website" field is hidden from
// people and catches simple bots.
function newsletter(look: Look, signup: Signup): string {
  const n = look.copy.newsletter;
  const said = signup.state === "done" ? "" : signup.state ? `<p class="said" role="alert">${esc(signup.state === "invalid" ? n.invalid : n.failed)}</p>` : "";
  const form =
    signup.state === "done"
      ? `<p class="said" role="status">${esc(n.done)}</p>`
      : `<form method="post" action="${esc(signup.action)}">
<label for="email">${esc(n.label)}</label>
<input type="email" id="email" name="email" placeholder="${esc(n.placeholder)}" autocomplete="email" required maxlength="254">
<input class="website" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<button type="submit">${esc(n.button)}</button>
</form>
${said}`;
  return `<section class="newsletter" id="newsletter">
<h2>${esc(n.title)}</h2>
<p>${esc(n.text)}</p>
${form}
</section>`;
}

// The share page: both cards, each with a download link, in the result's
// own palette. Its head carries the link-preview
// tags, so a shared address shows the wide preview card.
export function resultPage(look: Look, runId: string, card: Card, publicUrl: string, signup: Signup | null = null): string {
  const { result } = look.copy;
  const d = card.diagnosis;
  const ink = { paper: card.ink.paper ?? look.ink.paper, key: card.ink.key, accent: card.ink.accent ?? card.ink.fill, fill: card.ink.fill };
  const images = `${BASE}/r/${runId}`;
  const address = `${publicUrl}${BASE}/s/${runId}`;
  const title = `${d.handle}: ${d.title}`;
  const figure = (name: "diagnosis" | "scorecard", label: string, alt: string) => `<figure>
<img src="${images}/${name}.png" width="1080" height="1350" alt="${esc(alt)}">
<figcaption><span class="label">${esc(label)}</span><a class="button" href="${images}/${name}.png?download=1">${esc(result.download)}</a></figcaption>
</figure>`;
  const diagnosisAlt = `${d.title} (${d.binomial.genus} ${d.binomial.epithet}). ${d.verdict.text}`;
  const meta = [
    ["og:type", "website"],
    ["og:site_name", look.copy.siteName],
    ["og:title", title],
    ["og:description", d.verdict.text],
    ["og:url", address],
    ["og:image", `${publicUrl}${images}/preview.png`],
    ["og:image:width", "1200"],
    ["og:image:height", "630"],
    ["og:image:alt", diagnosisAlt],
  ]
    .map(([property, content]) => `<meta property="${property}" content="${esc(content!)}">`)
    .concat([`<meta name="twitter:card" content="summary_large_image">`, `<link rel="canonical" href="${esc(address)}">`])
    .join("\n");
  const body = `<h1>${esc(fill(result.heading, card.handle))}</h1>
<div class="cards">
${figure("diagnosis", result.diagnosis, diagnosisAlt)}
${figure("scorecard", result.scorecard, `${result.scorecard}: ${d.title}`)}
</div>
<p><a class="button quiet" href="${BASE}">${esc(result.again)}</a></p>
${signup ? newsletter(look, signup) : ""}`;
  return page(look, title, body, ink, meta + "\n");
}
