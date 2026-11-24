import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR, CONTENT_DIR } from "./paths.ts";

// One measure a species or variant keys on, and which end of it counts.
export interface SignalRef {
  measure: string;
  direction: "high" | "low";
}

// A trait is scored from its signals' percentiles: their mean by default, or
// the highest one when any single signal is enough ("max").
export interface Trait {
  slug: string;
  name: string;
  signals: SignalRef[];
  combine?: "mean" | "max";
}

// A pre-written line with a stable id. Every word on a card is one of these.
export interface Line {
  id: string;
  text: string;
}

// A nature applies when every condition holds: the measure's percentile is at
// least minPercentile from the named end. No conditions: it always applies.
export interface Nature extends Line {
  when: (SignalRef & { minPercentile: number })[];
}

export type Gender = "f" | "m" | "n";

export interface Species extends Trait {
  genus: string;
  // The genus's Latin gender, which a variant's epithet may need to agree
  // with. Required for species that take variants.
  gender?: Gender;
  // Only for species without variants, which have no variant to supply one.
  epithet?: string;
  // A rare species is never chosen by comparison. It is assigned whenever its
  // score reaches minScore.
  rare?: { minScore: number };
  // false: this species is never given a variant.
  variants?: boolean;
  // The palette for a species without variants; a variant brings its own.
  palette?: string;
  // Rule-based routes, set by the edition's thresholds:
  //   "thin": accounts that give too little away to be read; no signals of its
  //           own. Exactly one species has it.
  //   "replier": accounts that post almost only replies, too few originals to
  //           score. The species also competes on its own signals as usual.
  route?: "thin" | "replier";
  // The drawing: a two-layer SVG in the edition's art folder. Species that
  // take variants also say where props attach, in the drawing's own
  // coordinates, and how large to draw them.
  // A finished picture replaces the drawing. The cards show it as a cut-out
  // in its own colours: `image`, masked by its outline, `cut`. Each is a
  // file in the art folder: `layers` for a species without variants,
  // `pictures` by variant slug for the rest. Props are not drawn over one.
  art: {
    file: string;
    anchors?: Record<"head" | "shoulders" | "mouth", [number, number]>;
    propScale?: number;
    layers?: Layers;
    pictures?: Record<string, Layers>;
  };
  // A verdict with `variant` is only for that variant.
  verdicts: (Line & { variant?: string })[];
  natures: Nature[];
}

export type Layers = { image: string; cut: string };

export interface Variant extends Trait {
  // One form for every genus, or a form per gender where the Latin changes.
  epithet: string | Record<Gender, string>;
  // How the variant changes the drawing: "dots" replaces the solid fill with
  // halftone dots; `props` names an overlay file in the art folder's props.
  treatment?: "dots";
  props?: string;
  // The palette every result with this variant is printed in, so the variant
  // can be told by colour alone.
  palette?: string;
}

export interface Humour {
  id: string;
  name: string;
  signals: SignalRef[];
  // Five bands, lowest first; the humour's percentile picks one by fifths.
  bands: Line[];
}

export interface SystemCopy {
  footer: string;
  title: { withVariant: string; plain: string };
  handle: string;
  rarity: { template: string; bands: { id: string; upToPercent: number; label: string }[] };
  habitat: { template: string; pace: (Line & { minPostsPerDay: number })[] };
  generosity: { measure: string; bands: (Line & { upToPercentile: number })[] };
  humours: { scoreTemplate: string; unmeasured: string };
  evidence: { tiers: { id: string; minTweets: number; label: string }[]; heavyPosterDays: number };
  // The block that holds the user's own words. Each lead-in introduces them
  // in the card's voice, so they read as evidence the scribes took down.
  observations: { heading: string; diet: string; callPost: string; callPhrase: string };
}

export interface Edition {
  id: string;
  name: string;
  mark: string;
  // Below minTweets of its own, or with fewer than minEligibleSpecies
  // scorable, an account takes the "thin" route.
  thin: { minTweets: number; minEligibleSpecies: number };
  // At most maxOriginals originals, and at least minReplyShare of its own
  // tweets replying to others: the "replier" route.
  replier: { maxOriginals: number; minReplyShare: number };
  // Diet shows this many terms, only for accounts at least this English.
  diet: { terms: number; minEnglishShare: number };
  // A palette: `key` for line work and type, `fill` for the creature's body.
  // Optional: `accent`, a third colour for halos, stamps, and the shadow
  // under blackletter (defaults to `fill`); and `paper`, its own ground. A
  // palette with its own paper is treated as light inks on a dark ground, so
  // its inks are laid over each other and not multiplied.
  inks: { id: string; key: string; fill: string; accent?: string; paper?: string }[];
  paper: string;
  // Font files, from the fonts folder, for any of the five type roles:
  // "black" (titles and numerals), "serif", "serifItalic", "mono", "monoBold".
  // "typed" sets the user's own words and needs a wide character set.
  faces?: Partial<Record<"black" | "serif" | "serifItalic" | "mono" | "monoBold" | "typed", string>>;
  // The small labels on the scorecard.
  headings: Record<"humours" | "natures" | "habitat" | "generosity" | "diet" | "call", string>;
  species: Species[];
  variants: Variant[];
  humours: Humour[];
  sharedNatures: Nature[];
  system: SystemCopy;
}

export interface ActiveConfig {
  edition: string;
  calibration: string;
}

// Natures without conditions a species must have, so three can always be shown.
const MIN_FALLBACK_NATURES = 3;

export function loadActiveConfig(): ActiveConfig {
  const file = join(CONFIG_DIR, "active.json");
  const config = readJson(file) as Partial<ActiveConfig>;
  return { edition: required(config.edition, file, "edition"), calibration: required(config.calibration, file, "calibration") };
}

// Words that must never appear on a card, lowercase.
export function loadBlocklist(): Set<string> {
  const text = readFileSync(join(CONTENT_DIR, "blocklist.txt"), "utf8");
  return new Set(text.split("\n").map((l) => l.replace(/#.*/, "").trim().toLowerCase()).filter(Boolean));
}

// Reads an edition's content files. Anything missing is an error: code never
// fills a gap in the content.
export function loadEdition(id: string): Edition {
  const dir = join(CONTENT_DIR, "editions", id);
  const editionFile = join(dir, "edition.json");
  const edition = readJson(editionFile) as Partial<Edition>;
  if (edition.id !== id) throw new Error(`${editionFile}: id must be "${id}"`);

  const variantsFile = join(dir, "variants.json");
  const variants = (readJson(variantsFile) as Partial<Variant>[]).map((v) => ({
    ...trait(v, variantsFile),
    epithet: required(v.epithet, variantsFile, "epithet"),
    ...(v.treatment ? { treatment: v.treatment } : {}),
    ...(v.props ? { props: v.props } : {}),
    ...(v.palette ? { palette: v.palette } : {}),
  }));
  const variantSlugs = new Set(variants.map((v) => v.slug));

  const speciesDir = join(dir, "species");
  const species = readdirSync(speciesDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const file = join(speciesDir, f);
      const s = readJson(file) as Partial<Species>;
      if (`${s.slug}.json` !== f) throw new Error(`${file}: slug must match the file name`);
      if (s.route && s.route !== "thin" && s.route !== "replier") throw new Error(`${file}: route must be "thin" or "replier"`);
      const verdicts = lines(required(s.verdicts, file, "verdicts"), file, "verdicts");
      for (const v of verdicts) {
        if (v.variant && !variantSlugs.has(v.variant)) throw new Error(`${file}: verdict ${v.id} names unknown variant "${v.variant}"`);
      }
      const natures = naturesOf(required(s.natures, file, "natures"), file);
      if (natures.filter((n) => !n.when.length).length < MIN_FALLBACK_NATURES) {
        throw new Error(`${file}: needs at least ${MIN_FALLBACK_NATURES} natures with no conditions`);
      }
      return {
        ...trait(s, file, s.route === "thin"),
        genus: required(s.genus, file, "genus"),
        ...(s.variants === false ? { variants: false, epithet: required(s.epithet, file, "epithet") } : { gender: genderOf(s, file) }),
        ...(s.rare ? { rare: s.rare } : {}),
        ...(s.route ? { route: s.route } : {}),
        ...(s.palette ? { palette: s.palette } : {}),
        art: artOf(s, file),
        verdicts,
        natures,
      };
    });
  for (const route of ["thin", "replier"]) {
    if (species.filter((s) => s.route === route).length !== 1) throw new Error(`${speciesDir}: exactly one species needs route "${route}"`);
  }

  const humoursFile = join(dir, "humours.json");
  const humours = (readJson(humoursFile) as Partial<Humour>[]).map((h) => {
    const bands = lines(required(h.bands, humoursFile, "bands"), humoursFile, "bands");
    if (bands.length !== 5) throw new Error(`${humoursFile}: humour ${h.id} needs exactly 5 bands`);
    return { ...trait({ ...h, slug: h.id }, humoursFile), id: required(h.id, humoursFile, "id"), bands };
  });

  const sharedFile = join(dir, "natures-shared.json");
  const sharedNatures = naturesOf(readJson(sharedFile) as Partial<Nature>[], sharedFile);

  const systemFile = join(dir, "system.json");
  const system = readJson(systemFile) as SystemCopy;
  for (const field of ["footer", "title", "handle", "rarity", "habitat", "generosity", "humours", "evidence", "observations"] as const) {
    required(system[field], systemFile, field);
  }

  const result: Edition = {
    id,
    name: required(edition.name, editionFile, "name"),
    mark: required(edition.mark, editionFile, "mark"),
    thin: required(edition.thin, editionFile, "thin"),
    replier: required(edition.replier, editionFile, "replier"),
    diet: required(edition.diet, editionFile, "diet"),
    inks: required(edition.inks, editionFile, "inks"),
    paper: required(edition.paper, editionFile, "paper"),
    ...(edition.faces ? { faces: edition.faces } : {}),
    headings: required(edition.headings, editionFile, "headings"),
    species,
    variants,
    humours,
    sharedNatures,
    system,
  };
  const palettes = new Set(result.inks.map((i) => i.id));
  for (const named of [...species, ...variants]) {
    if (named.palette && !palettes.has(named.palette)) throw new Error(`${dir}: ${named.slug} names unknown palette "${named.palette}"`);
  }
  checkUniqueIds(result, dir);
  return result;
}

function trait(t: Partial<Trait>, file: string, noSignals = false): Trait {
  const signals = noSignals ? (t.signals ?? []) : required(t.signals, file, "signals");
  if (noSignals && signals.length) throw new Error(`${file}: a "thin" species has no signals`);
  if (!noSignals && !signals.length) throw new Error(`${file}: signals is empty`);
  for (const s of signals) {
    if (!s.measure || (s.direction !== "high" && s.direction !== "low")) {
      throw new Error(`${file}: each signal needs a measure and a direction of "high" or "low"`);
    }
  }
  return { slug: required(t.slug, file, "slug"), name: required(t.name, file, "name"), signals, ...(t.combine ? { combine: t.combine } : {}) };
}

function artOf(s: Partial<Species>, file: string): Species["art"] {
  const art = required(s.art, file, "art");
  required(art.file, file, "art.file");
  if (s.variants !== false) required(art.anchors, file, "art.anchors");
  for (const [name, layers] of [["layers", art.layers] as const, ...Object.entries(art.pictures ?? {})]) {
    for (const mask of Object.values(layers ?? {})) {
      if (!existsSync(join(dirname(dirname(file)), "art", mask))) throw new Error(`${file}: art ${name} names a missing file "${mask}"`);
    }
  }
  return art;
}

function genderOf(s: Partial<Species>, file: string): Gender {
  const gender = required(s.gender, file, "gender");
  if (!["f", "m", "n"].includes(gender)) throw new Error(`${file}: gender must be "f", "m" or "n"`);
  return gender;
}

function lines<T extends Partial<Line>>(list: T[], file: string, field: string): (T & Line)[] {
  if (!list.length) throw new Error(`${file}: ${field} is empty`);
  for (const l of list) {
    if (!l.id || !l.text) throw new Error(`${file}: every entry in ${field} needs an id and text`);
  }
  return list as (T & Line)[];
}

function naturesOf(list: Partial<Nature>[], file: string): Nature[] {
  return lines(list, file, "natures").map((n) => {
    const when = required(n.when, file, `when (nature ${n.id})`);
    for (const c of when) {
      if (!c.measure || (c.direction !== "high" && c.direction !== "low") || typeof c.minPercentile !== "number") {
        throw new Error(`${file}: nature ${n.id} has a condition without measure, direction and minPercentile`);
      }
    }
    return { id: n.id, text: n.text, when };
  });
}

// Ids are how copy is reviewed and tested, so no two lines may share one.
function checkUniqueIds(edition: Edition, dir: string): void {
  const all = [
    ...edition.species.flatMap((s) => [...s.verdicts, ...s.natures]),
    ...edition.sharedNatures,
    ...edition.humours.flatMap((h) => h.bands),
    ...edition.system.habitat.pace,
    ...edition.system.generosity.bands,
  ].map((l) => l.id);
  const seen = new Set<string>();
  for (const id of all) {
    if (seen.has(id)) throw new Error(`${dir}: line id "${id}" is used twice`);
    seen.add(id);
  }
}

function required<T>(value: T | undefined, file: string, field: string): T {
  if (value === undefined || value === null || value === "") throw new Error(`${file}: missing "${field}"`);
  return value;
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}
