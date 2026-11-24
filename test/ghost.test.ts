import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { adminToken, ghostClient, looksLikeEmail } from "../src/ghost.ts";

const KEY = "abc123:" + "0f".repeat(32);

test("the admin token is a five-minute HS256 JWT for /admin/, signed with the hex secret", () => {
  const [head, body, sig] = adminToken(KEY, 1_700_000_000_000).split(".");
  assert.deepEqual(JSON.parse(Buffer.from(head!, "base64url").toString()), { alg: "HS256", typ: "JWT", kid: "abc123" });
  assert.deepEqual(JSON.parse(Buffer.from(body!, "base64url").toString()), { iat: 1_700_000_000, exp: 1_700_000_300, aud: "/admin/" });
  const expected = createHmac("sha256", Buffer.from("0f".repeat(32), "hex")).update(`${head}.${body}`).digest("base64url");
  assert.equal(sig, expected);
});

test("subscribe posts the member with its labels; an existing member counts as done", async () => {
  const calls: { url: string; body: unknown }[] = [];
  let status = 201;
  let reply = "{}";
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(reply, { status });
  }) as unknown as typeof fetch;
  const ghost = ghostClient({ url: "https://example.com/", adminKey: KEY, labels: ["Divination Diagnosis"], fetch: fake });
  await ghost.subscribe("a@example.com");
  assert.equal(calls[0]!.url, "https://example.com/ghost/api/admin/members/");
  assert.deepEqual(calls[0]!.body, { members: [{ email: "a@example.com", labels: [{ name: "Divination Diagnosis" }] }] });
  status = 422;
  reply = '{"errors":[{"message":"Member already exists. Attempting to add member with existing email address"}]}';
  await ghost.subscribe("a@example.com");
  status = 500;
  reply = "oops";
  await assert.rejects(ghost.subscribe("b@example.com"));
});

test("email check", () => {
  assert.ok(looksLikeEmail("a@b.co"));
  assert.ok(!looksLikeEmail("a@b"));
  assert.ok(!looksLikeEmail("a b@c.com"));
});
