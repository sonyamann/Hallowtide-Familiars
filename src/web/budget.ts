// The daily spend cap on TwitterAPI.io. A new handle costs about 10 paid
// requests (about $0.03); a handle with a snapshot under a week old costs
// nothing and is never refused. Once the day's requests reach the cap, new
// fetches wait for the next UTC day.

import type { Store } from "./store.ts";

export interface Budget {
  allows(): boolean;
  spend(requests: number): void;
}

export function dailyBudget(store: Store, cap: number, now = () => new Date(), log: (message: string) => void = console.error): Budget {
  const today = () => now().toISOString().slice(0, 10);
  let warned = "";
  return {
    allows() {
      const day = today();
      if (store.spent(day) < cap) return true;
      if (warned !== day) log(`daily fetch cap reached: ${cap} requests on ${day}; new handles wait until tomorrow (UTC)`);
      warned = day;
      return false;
    },
    spend(requests) {
      if (requests > 0) store.spend(today(), requests);
    },
  };
}
