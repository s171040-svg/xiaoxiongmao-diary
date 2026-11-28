import manifest from './panda-animation-manifest.json';

/** One transient click reaction, never an autonomous action or a care-stat change. */
export function punchDuration(reduced = false): number {
  return reduced ? manifest.punch.reducedDurationMs
    : manifest.punch.frameCount * manifest.punch.frameIntervalMs;
}

export function punchFrameAt(elapsed: number, reduced = false): number | null {
  if (elapsed < 0 || elapsed >= punchDuration(reduced)) return null;
  return reduced ? manifest.punch.impactFrame
    : Math.min(manifest.punch.frameCount - 1, Math.floor(elapsed / manifest.punch.frameIntervalMs));
}
