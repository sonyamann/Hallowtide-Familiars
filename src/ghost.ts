// The Ghost Admin API, for the newsletter signup on the result page. The admin
// key ("id:secret") signs a five-minute token per request; it never reaches
// the browser.

import { createHmac } from "node:crypto";

export interface GhostOptions {
  // The site, e.g. https://sonyasupposedly.com
  url: string;
  adminKey: string;
  // Labels put on every member added here, so the source shows in Ghost.
  labels?: string[];
  fetch?: typeof fetch;
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

export function adminToken(adminKey: string, now = Date.now()): string {
  const [id, secret] = adminKey.split(":");
  if (!id || !secret) throw new Error("GHOST_ADMIN_KEY should look like id:secret");
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }));
  const body = b64url(JSON.stringify({ iat, exp: iat + 300, aud: "/admin/" }));
  const sig = createHmac("sha256", Buffer.from(secret, "hex")).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export class GhostError extends Error {}

export function ghostClient(opts: GhostOptions) {
  const doFetch = opts.fetch ?? fetch;
  const api = `${opts.url.replace(/\/+$/, "")}/ghost/api/admin`;
  const headers = () => ({ authorization: `Ghost ${adminToken(opts.adminKey)}`, "accept-version": "v5.0", "content-type": "application/json" });

  return {
    // Adds the address as a free member. One already on the list counts as
    // done, so the page never reveals who is subscribed.
    async subscribe(email: string): Promise<void> {
      const res = await doFetch(`${api}/members/`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ members: [{ email, labels: (opts.labels ?? []).map((name) => ({ name })) }] }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return;
      const text = await res.text();
      if (res.status === 422 && /already exists/i.test(text)) return;
      throw new GhostError(`Ghost ${res.status}: ${text.slice(0, 300)}`);
    },
    // A read-only call to check the key and address.
    async ping(): Promise<number> {
      const res = await doFetch(`${api}/newsletters/?limit=1&fields=id`, { headers: headers(), signal: AbortSignal.timeout(8000) });
      return res.status;
    },
  };
}

// A plain check, enough to catch typos; Ghost does the rest.
export function looksLikeEmail(text: string): boolean {
  return text.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}
