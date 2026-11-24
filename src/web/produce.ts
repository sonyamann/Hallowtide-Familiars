// One handle in, a finished result out: fetch (or reuse) the snapshot, then
// build the card and render its three images. Split in two so the app can
// look for a saved result before doing the slow part.

import { createHash } from "node:crypto";
import { gatherSnapshot } from "../gather.ts";
import { jevClient } from "../jev.ts";
import { classifierVersion } from "../own-words.ts";
import { buildCard, type Reference } from "../pipeline.ts";
import { diagnosisSvg, scorecardSvg } from "../render/cards.ts";
import { renderPng } from "../render/png.ts";
import { previewSvg } from "../render/preview.ts";
import type { Card } from "../select.ts";
import { ApiError } from "../twitterapi.ts";
import type { Budget } from "./budget.ts";
import type { ErrorCode } from "./copy.ts";

export const IMAGES = ["diagnosis", "scorecard", "preview"] as const;
export type ImageName = (typeof IMAGES)[number];

// A failure the person should be told about, by its code in the web copy.
export class RunError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface Built {
  card: Card;
  screened: boolean;
  images: Record<ImageName, Buffer>;
}

export interface Prepared {
  // The cache key: the same snapshot, content, calibration, and classifier
  // policy always give the same cards.
  key: string;
  build(): Promise<Built>;
}

export type Prepare = (handle: string) => Promise<Prepared>;

export interface PipelineOptions {
  snapshotDir: string;
  labelsDir: string;
  twitterKey: string | undefined;
  jevKey: string | undefined;
  contentVersion: string;
  calibration: string;
  // The daily spend cap; without it, fetches are never refused.
  budget?: Budget;
}

export function pipeline(ref: Reference, opts: PipelineOptions): Prepare {
  const ask = opts.jevKey ? jevClient({ apiKey: opts.jevKey, model: ref.screenConfig.model }) : null;
  const versions = [ref.edition.id, opts.contentVersion, opts.calibration, classifierVersion(ref.screenConfig)];

  return async (handle) => {
    let snapshot;
    const beforeFetch = () => {
      if (opts.budget && !opts.budget.allows()) throw new RunError("resting");
    };
    try {
      let requests;
      ({ snapshot, requests } = await gatherSnapshot(handle, { snapshotDir: opts.snapshotDir, apiKey: opts.twitterKey, now: new Date(), beforeFetch }));
      opts.budget?.spend(requests);
    } catch (err) {
      if (err instanceof ApiError) throw new RunError("failed");
      throw err;
    }
    return {
      key: createHash("sha256").update([snapshot.id, ...versions].join("|")).digest("hex").slice(0, 32),
      async build() {
        const run = await buildCard(ref, snapshot, ask, opts.labelsDir);
        if (!run) throw new RunError("no_specimen");
        return {
          card: run.card,
          screened: run.screened,
          images: {
            diagnosis: renderPng(diagnosisSvg(ref.edition, run.card)),
            scorecard: renderPng(scorecardSvg(ref.edition, run.card)),
            preview: renderPng(previewSvg(ref.edition, run.card)),
          },
        };
      },
    };
  };
}
