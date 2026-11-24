// A minimal client for Jev, TypeSafe's classifier. It answers yes/no
// questions about a piece of text with a probability; it never writes text.

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const REQUEST_TIMEOUT_MS = 20_000;

export class ClassifierError extends Error {}

export interface NoulQuestion {
  instructions: string;
  true: string;
  false: string;
  // This question's own rejection threshold, if stricter or looser than the
  // default. Used by the screen; not sent to the classifier.
  blockAt?: number;
}

// Each question's probability of "yes", from 0 to 1.
export type Answers = Record<string, number>;

export type Ask = (state: string, questions: Record<string, NoulQuestion>) => Promise<Answers>;

export function jevClient(opts: { apiKey: string; model: string; fetchImpl?: typeof fetch; retryDelayMs?: number }): Ask {
  const { apiKey, model, fetchImpl = fetch, retryDelayMs = 500 } = opts;
  return async (state, questions) => {
    const body = JSON.stringify({
      state,
      model,
      questions: Object.fromEntries(
        Object.entries(questions).map(([name, q]) => [
          name,
          { type: "noul", instructions: q.instructions, criteria: { true: q.true, false: q.false } },
        ]),
      ),
    });
    const attempts = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if ((res.status === 429 || res.status >= 500) && attempt < attempts) {
          await sleep(retryDelayMs * attempt);
          continue;
        }
        if (!res.ok) throw new ClassifierError(`HTTP ${res.status}`);
        const json = (await res.json()) as { answers?: Record<string, { noul?: number }> };
        const answers: Answers = {};
        for (const name of Object.keys(questions)) {
          const noul = json.answers?.[name]?.noul;
          if (typeof noul !== "number") throw new ClassifierError(`no answer for "${name}"`);
          answers[name] = noul;
        }
        return answers;
      } catch (err) {
        if (err instanceof ClassifierError) throw err;
        if (attempt < attempts) {
          await sleep(retryDelayMs * attempt);
          continue;
        }
        throw new ClassifierError(`network error: ${(err as Error).message}`);
      }
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
