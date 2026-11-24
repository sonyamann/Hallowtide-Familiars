import type { Profile, RawAuthor, RawPage, RawTweet, Tweet, TweetKind } from "./types.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parses X's date format, e.g. "Thu Oct 01 18:48:57 +0000 2026".
export function parseXDate(value: string | undefined): number | null {
  const m = value?.match(/^\w{3} (\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2}) \+0000 (\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!);
  if (month < 0) return null;
  return Date.UTC(Number(m[6]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}

// The account's own author record, taken from any tweet in the pages.
export function profileOf(handle: string, pages: RawPage[]): Profile | null {
  let author: RawAuthor | undefined;
  for (const page of pages) {
    author = page.data?.tweets?.find((t) => t.author?.userName?.toLowerCase() === handle)?.author;
    if (author) break;
  }
  if (!author) return null;
  const joined = parseXDate(author.createdAt) ?? Date.parse(author.createdAt ?? "");
  return {
    handle,
    followers: author.followers ?? 0,
    following: author.following ?? 0,
    likesGiven: author.favouritesCount ?? 0,
    statuses: author.statusesCount ?? 0,
    joinedYear: Number.isNaN(joined) ? null : new Date(joined).getUTCFullYear(),
  };
}

// Flattens the pages into one de-duplicated list, newest first.
export function tweetsOf(handle: string, pages: RawPage[]): Tweet[] {
  const byId = new Map<string, Tweet>();
  for (const page of pages) {
    for (const raw of page.data?.tweets ?? []) {
      if (byId.has(raw.id)) continue;
      const tweet = parseTweet(handle, raw);
      if (tweet) byId.set(raw.id, tweet);
    }
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
}

function parseTweet(handle: string, raw: RawTweet): Tweet | null {
  const createdAt = parseXDate(raw.createdAt);
  if (createdAt === null) return null;

  const rawText = raw.text ?? "";
  const isRetweet = raw.retweeted_tweet != null || rawText.startsWith("RT @");
  const replyTo = raw.inReplyToUsername?.toLowerCase();
  const kind: TweetKind = isRetweet ? "retweet" : !raw.isReply ? "original" : replyTo === handle ? "selfReply" : "reply";

  // displayTextRange counts code points. Its start skips the automatic reply
  // prefix. Its end is ignored: on long posts it marks the "show more" cut,
  // not the end of the text.
  const start = raw.displayTextRange?.[0] ?? 0;
  const text = decodeEntities(Array.from(rawText).slice(start).join(""))
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const mentions = (raw.entities?.user_mentions ?? []).filter(
    (m) => (m.indices?.[0] ?? 0) >= start && m.screen_name?.toLowerCase() !== handle,
  ).length;

  // Links to X itself are quote or media links, not outside links.
  const hasLink = (raw.entities?.urls ?? []).some((u) => {
    const host = hostOf(u.expanded_url);
    return host !== null && !/(^|\.)(x|twitter)\.com$/.test(host);
  });

  const quotedFollowers = raw.quoted_tweet?.author?.followers;

  return {
    id: raw.id,
    createdAt,
    kind,
    isQuote: !isRetweet && raw.quoted_tweet != null,
    text,
    length: Array.from(text).length,
    hasLink,
    hasMedia: (raw.extendedEntities?.media?.length ?? 0) > 0,
    mentions,
    likes: raw.likeCount ?? 0,
    replies: raw.replyCount ?? 0,
    retweets: raw.retweetCount ?? 0,
    quotes: raw.quoteCount ?? 0,
    views: typeof raw.viewCount === "number" ? raw.viewCount : null,
    quotedFollowers: typeof quotedFollowers === "number" ? quotedFollowers : null,
    lang: raw.lang ?? null,
  };
}

function hostOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

function decodeEntities(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}
