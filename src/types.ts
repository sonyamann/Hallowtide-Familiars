// Shapes of the TwitterAPI.io "user/last_tweets" response, limited to the
// fields the pipeline reads. Live responses carry many more.

export interface RawAuthor {
  userName?: string;
  id?: string;
  followers?: number;
  following?: number;
  favouritesCount?: number;
  statusesCount?: number;
  createdAt?: string;
}

export interface RawTweet {
  id: string;
  text?: string;
  createdAt?: string;
  lang?: string;
  isReply?: boolean;
  inReplyToUsername?: string | null;
  conversationId?: string;
  displayTextRange?: [number, number] | null;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
  quoteCount?: number;
  viewCount?: number | null;
  author?: RawAuthor;
  entities?: {
    urls?: { expanded_url?: string }[];
    user_mentions?: { screen_name?: string; indices?: [number, number] }[];
  } | null;
  extendedEntities?: { media?: unknown[] } | null;
  quoted_tweet?: { author?: RawAuthor } | null;
  retweeted_tweet?: unknown | null;
}

export interface RawPage {
  status?: string;
  msg?: string;
  message?: string;
  data?: { tweets?: RawTweet[]; pin_tweet?: unknown } | null;
  has_next_page?: boolean;
  next_cursor?: string;
}

export interface Snapshot {
  // sha256 of the raw pages; the same pages always give the same id.
  id: string;
  handle: string;
  fetchedAt: string;
  pages: RawPage[];
}

export type TweetKind = "original" | "reply" | "selfReply" | "retweet";

export interface Tweet {
  id: string;
  createdAt: number;
  // "original" includes quote tweets; "selfReply" is a thread continuation.
  kind: TweetKind;
  isQuote: boolean;
  // Visible text: no reply prefix, no links, entities decoded.
  text: string;
  length: number;
  hasLink: boolean;
  hasMedia: boolean;
  // Mentions the author typed, not the automatic reply prefix or themselves.
  mentions: number;
  likes: number;
  replies: number;
  retweets: number;
  quotes: number;
  views: number | null;
  quotedFollowers: number | null;
  lang: string | null;
}

export interface Profile {
  handle: string;
  followers: number;
  following: number;
  likesGiven: number;
  statuses: number;
  joinedYear: number | null;
}
