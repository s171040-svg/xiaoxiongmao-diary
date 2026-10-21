export const BATH_BALL_DRY_MS = 5000;
export const BATH_BALL_DRYING_STORAGE_KEY = 'panda-bath-ball-drying-v1';

export type BathBallDryingState = {
  wet: boolean;
  onWindowHook: boolean;
  driesAt: number | null;
};

export const INITIAL_BATH_BALL_DRYING_STATE: BathBallDryingState = {
  wet: false,
  onWindowHook: false,
  driesAt: null,
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readBathBallDryingState(
  storage: StorageLike | undefined,
  now = Date.now(),
): BathBallDryingState {
  if (!storage) return INITIAL_BATH_BALL_DRYING_STATE;
  try {
    const value: unknown = JSON.parse(storage.getItem(BATH_BALL_DRYING_STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return INITIAL_BATH_BALL_DRYING_STATE;
    const state = value as Partial<BathBallDryingState>;
    if (typeof state.wet !== 'boolean' || typeof state.onWindowHook !== 'boolean'
      || (state.driesAt !== null && typeof state.driesAt !== 'number')) {
      return INITIAL_BATH_BALL_DRYING_STATE;
    }
    if (!state.wet) return { wet: false, onWindowHook: state.onWindowHook, driesAt: null };
    if (state.onWindowHook && state.driesAt !== null && state.driesAt <= now) {
      return { wet: false, onWindowHook: true, driesAt: null };
    }
    return {
      wet: true,
      onWindowHook: state.onWindowHook,
      driesAt: state.onWindowHook ? state.driesAt : null,
    };
  } catch {
    return INITIAL_BATH_BALL_DRYING_STATE;
  }
}

export function saveBathBallDryingState(storage: StorageLike | undefined, state: BathBallDryingState) {
  try {
    storage?.setItem(BATH_BALL_DRYING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the interaction usable when browser storage is unavailable.
  }
}

export function wetBathBall(): BathBallDryingState {
  return { wet: true, onWindowHook: false, driesAt: null };
}

export function hangBathBallToDry(state: BathBallDryingState, now = Date.now()): BathBallDryingState {
  return state.wet
    ? { wet: true, onWindowHook: true, driesAt: now + BATH_BALL_DRY_MS }
    : state;
}

export function finishBathBallDrying(state: BathBallDryingState, now = Date.now()): BathBallDryingState {
  return state.wet && state.onWindowHook && state.driesAt !== null && state.driesAt <= now
    ? { wet: false, onWindowHook: true, driesAt: null }
    : state;
}
