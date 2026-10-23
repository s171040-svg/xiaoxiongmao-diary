export const BORED_SEARCH_IDLE_MS = 5 * 60 * 1000;

export function isBoredSearchDue(lastUserActivityAt: number, now: number): boolean {
  return now - lastUserActivityAt >= BORED_SEARCH_IDLE_MS;
}
