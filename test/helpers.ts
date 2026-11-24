import type { RawPage, RawTweet } from "../src/types.ts";

// Builds made-up API responses, so no real person's tweets live in the repo.

export const HANDLE = "specimen";

const AUTHOR = {
  userName: "Specimen",
  followers: 1000,
  following: 100,
  favouritesCount: 5000,
  statusesCount: 500,
  createdAt: "Sun Mar 06 23:26:29 +0000 2011",
};

let nextId = 1000;

// Tweets are one hour apart, newest first, starting at noon on Oct 1, 2026.
export function tweet(overrides: Partial<RawTweet> = {}): RawTweet {
  const id = nextId++;
  const at = new Date(Date.UTC(2026, 9, 1, 12) - (id - 1000) * 3_600_000);
  const text = overrides.text ?? "A plain post about lanterns";
  return {
    id: String(id),
    text,
    createdAt: xDate(at),
    lang: "en",
    isReply: false,
    inReplyToUsername: null,
    displayTextRange: [0, Array.from(text).length],
    likeCount: 10,
    replyCount: 1,
    retweetCount: 1,
    quoteCount: 0,
    viewCount: 1000,
    author: AUTHOR,
    entities: {},
    quoted_tweet: null,
    retweeted_tweet: null,
    ...overrides,
  };
}

export function replyTo(username: string, body: string, overrides: Partial<RawTweet> = {}): RawTweet {
  const prefix = `@${username} `;
  return tweet({
    text: prefix + body,
    isReply: true,
    inReplyToUsername: username,
    displayTextRange: [prefix.length, prefix.length + body.length],
    entities: { user_mentions: [{ screen_name: username, indices: [0, prefix.length - 1] }] },
    ...overrides,
  });
}

export function page(tweets: RawTweet[], next?: string): RawPage {
  return { status: "success", msg: "success", data: { pin_tweet: null, tweets }, has_next_page: !!next, next_cursor: next ?? "" };
}

export function times<T>(n: number, make: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

function xDate(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`;
}
