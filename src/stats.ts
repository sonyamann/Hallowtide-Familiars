export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: number[]): number | null {
  return values.length ? sum(values) / values.length : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// Standard deviation divided by the mean: spread relative to size.
export function coefficientOfVariation(values: number[]): number | null {
  const m = mean(values);
  if (m === null || m === 0) return null;
  const variance = sum(values.map((v) => (v - m) ** 2)) / values.length;
  return Math.sqrt(variance) / m;
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}
