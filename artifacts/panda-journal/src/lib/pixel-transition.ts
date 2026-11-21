export type PixelTransitionKey =
  | 'idle'
  | 'chew'
  | 'jump'
  | 'cuddle'
  | 'tail'
  | 'somersault'
  | 'lying'
  | 'sleep'
  | 'peeking'
  | 'captured-homecoming'
  | 'climb-up'
  | 'leaf-play';

export type PixelTransitionDirection = 'entering' | 'waking';
export type PixelTransitionPhase = `frames-${PixelTransitionDirection}` | null;

/** Stair-turn frames change the pose while the existing walking route keeps advancing. */
export function pixelTransitionBlocksRoomWalking(
  key: PixelTransitionKey | null,
  direction: PixelTransitionDirection | null,
): boolean {
  return direction !== null && key !== 'climb-up';
}

const numberedFrames = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}.png`);

export const PIXELLAB_TRANSITION_FRAME_FILES: Record<PixelTransitionKey, string[]> = {
  idle: numberedFrames('transitions/pixellab-walk-to-idle', 5),
  chew: numberedFrames('transitions/pixellab-walk-to-chew', 5),
  jump: numberedFrames('transitions/pixellab-walk-to-jump', 5),
  cuddle: numberedFrames('transitions/pixellab-walk-to-cuddle', 5),
  tail: numberedFrames('transitions/pixellab-walk-to-tail', 7),
  somersault: numberedFrames('transitions/idle-to-back-pawing', 7),
  lying: numberedFrames('transitions/pixellab-walk-to-lying', 5),
  sleep: numberedFrames('transitions/pixellab-walk-to-sleep', 7),
  peeking: numberedFrames('transitions/pixellab-walk-to-peeking', 5),
  'captured-homecoming': numberedFrames('frames/captured-homecoming-exit', 6),
  'climb-up': numberedFrames('transitions/walk-to-climb-up', 6),
  'leaf-play': numberedFrames('transitions/idle-to-leaf-play', 6),
};

export interface PixelTransitionScheduler {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timer: number): void;
}

export interface PixelTransitionCallbacks {
  onFrame(frame: string | null): void;
  onPhase(phase: PixelTransitionPhase): void;
  onComplete(): void;
}

export const PIXEL_TRANSITION_FRAME_MS = 80;

export function playPixelTransitionFrames(
  frames: string[],
  direction: PixelTransitionDirection,
  scheduler: PixelTransitionScheduler,
  callbacks: PixelTransitionCallbacks,
  frameDurationMs = PIXEL_TRANSITION_FRAME_MS,
): () => void {
  let timer: number | null = null;
  let cancelled = false;
  let index = 0;
  const orderedFrames = direction === 'entering' ? frames : [...frames].reverse();

  callbacks.onPhase(`frames-${direction}`);

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (timer !== null) scheduler.clearTimeout(timer);
    timer = null;
    callbacks.onFrame(null);
    callbacks.onPhase(null);
  };

  const showNextFrame = () => {
    if (cancelled) return;
    if (index >= orderedFrames.length) {
      timer = null;
      cancelled = true;
      callbacks.onFrame(null);
      callbacks.onPhase(null);
      callbacks.onComplete();
      return;
    }

    callbacks.onFrame(orderedFrames[index]);
    index += 1;
    timer = scheduler.setTimeout(showNextFrame, frameDurationMs);
  };

  showNextFrame();
  return cancel;
}
