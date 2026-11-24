// analyze @handle [--refresh]
//
// Gate, fetch, snapshot, filter, then print signals and features as JSON.

import { specimenFromArgs } from "./specimen.ts";

const { analysis, requests, fetchedAt } = await specimenFromArgs("npm run analyze -- @handle [--refresh]");
console.error(requests ? `Fetched ${requests} pages` : `Using cached snapshot from ${fetchedAt}`);
console.log(JSON.stringify(analysis, null, 2));
