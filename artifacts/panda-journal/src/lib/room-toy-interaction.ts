import {
  isWalkableRoomSegment, nearestWalkableRoomPoint, planRoomWalkPath,
  pointAlongRoomWalkPath, roomWalkPathLength, type RoomPoint,
} from './room-plane';

export type ToyPhase = 'waiting' | 'curious' | 'approach' | 'watching' | 'excited' | 'rush' | 'brake' | 'dizzy' | 'recover' | 'laser-pounce';
export type ToySprite = 'toy-curious' | 'toy-teaser' | 'toy-brake' | 'toy-wall-dizzy' | 'toy-laser';
export interface ToyRuntime {
  phase: ToyPhase;
  since: number;
  noticed: boolean;
  lastShake: number;
  velocity: { u: number; v: number };
  slideFrom: RoomPoint;
  recoverSprite: ToySprite;
  exciteDelay: number;
}
export const TOY_FRAMES = 8;
export const TOY_ART_VERSION = 'toy-redraw-2';
export function createToyRuntime(now = 0): ToyRuntime {
  return { phase: 'waiting', since: now, noticed: false, lastShake: -Infinity,
    velocity: { u: 0, v: 0 }, slideFrom: { u: .5, v: .5 }, recoverSprite: 'toy-curious', exciteDelay: 0 };
}
function enter(state: ToyRuntime, phase: ToyPhase, now: number) {
  state.phase = phase;
  state.since = now;
}
export function shakeToy(state: ToyRuntime, now: number): boolean {
  if (now - state.lastShake < 900 || ['rush', 'brake', 'dizzy', 'recover', 'excited'].includes(state.phase)) return false;
  state.lastShake = now;
  state.exciteDelay = state.phase === 'curious' || state.phase === 'watching' ? 720 : 0;
  enter(state, state.noticed ? 'excited' : 'curious', now);
  state.noticed = true;
  return true;
}

/** A shake requires back-and-forth travel, not a click or a single relocation. */
export function createShakeDetector() {
  let last: { x: number; y: number; time: number } | null = null;
  let direction = { x: 0, y: 0 };
  let travel = 0;
  return {
    reset() { last = null; travel = 0; direction = { x: 0, y: 0 }; },
    move(x: number, y: number, time: number) {
      if (!last || time - last.time > 650) {
        last = { x, y, time }; travel = 0; direction = { x: 0, y: 0 }; return false;
      }
      const dx = x - last.x, dy = y - last.y;
      last = { x, y, time };
      const distance = Math.hypot(dx, dy);
      if (distance < 3) return false;
      travel += distance;
      const reversed = dx * direction.x + dy * direction.y < -0.25;
      direction = { x: dx / distance, y: dy / distance };
      if (reversed && travel >= 32) { travel = 0; return true; }
      return false;
    },
  };
}

export function toyVisual(state: ToyRuntime, now: number): { sprite: ToySprite | null; frame: number } {
  const elapsed = Math.max(0, now - state.since);
  const forward = Math.min(TOY_FRAMES, 1 + Math.floor(elapsed / 90));
  switch (state.phase) {
    case 'curious': return { sprite: 'toy-curious', frame: elapsed < 1050 ? forward : Math.max(1, 8 - Math.floor((elapsed - 1050) / 80)) };
    case 'watching': return { sprite: 'toy-curious', frame: forward };
    case 'excited': return elapsed < state.exciteDelay
      ? { sprite: 'toy-curious', frame: Math.max(1, 8 - Math.floor(elapsed / 90)) }
      : { sprite: 'toy-teaser', frame: Math.min(8, 1 + Math.floor((elapsed - state.exciteDelay) / 90)) };
    case 'rush': return { sprite: 'toy-teaser', frame: 5 + Math.floor(elapsed / 100) % 4 };
    case 'brake': return { sprite: 'toy-brake', frame: forward };
    case 'dizzy': return { sprite: 'toy-wall-dizzy', frame: elapsed < 720 ? forward : 5 + Math.floor(elapsed / 140) % 4 };
    case 'laser-pounce': return { sprite: 'toy-laser', frame: forward };
    case 'recover': {
      const chain: ToySprite[] = state.recoverSprite === 'toy-wall-dizzy'
        ? ['toy-wall-dizzy', 'toy-brake', 'toy-teaser']
        : state.recoverSprite === 'toy-brake' ? ['toy-brake', 'toy-teaser'] : [state.recoverSprite];
      return { sprite: chain[Math.min(chain.length - 1, Math.floor(elapsed / 720))],
        frame: Math.max(1, 8 - Math.floor((elapsed % 720) / 90)) };
    }
    default: return { sprite: null, frame: 0 };
  }
}

export function advanceToy(
  state: ToyRuntime, toy: 'teaser' | 'laser', from: RoomPoint, rawTarget: RoomPoint, now: number, dt: number,
): { point: RoomPoint; walking: boolean; contact: boolean; lookU: number } {
  const target = nearestWalkableRoomPoint({ ...rawTarget, elevation: 0 });
  const dx = target.u - from.u, dy = target.v - from.v;
  const distance = Math.hypot(dx, dy);
  const fixedHeading = ['brake', 'dizzy', 'recover'].includes(state.phase);
  const result = { point: from, walking: false, contact: false, lookU: fixedHeading ? state.velocity.u : dx };
  const elapsed = now - state.since;
  if (toy === 'laser' && state.phase === 'waiting') enter(state, 'approach', now);
  if (state.phase === 'watching' && distance > .07) enter(state, 'approach', now);
  if (state.phase === 'curious' && elapsed >= 1690) enter(state, 'approach', now);
  if (state.phase === 'excited' && now - state.since >= state.exciteDelay + 720) enter(state, 'rush', now);
  if (state.phase === 'dizzy' && elapsed >= 2600) {
    state.recoverSprite = 'toy-wall-dizzy'; enter(state, 'recover', now);
  }
  if (state.phase === 'laser-pounce' && elapsed >= 900) {
    state.recoverSprite = 'toy-laser'; enter(state, 'recover', now);
  }
  const recoveryDuration = state.recoverSprite === 'toy-wall-dizzy' ? 2160
    : state.recoverSprite === 'toy-brake' ? 1440 : 720;
  if (state.phase === 'recover' && now - state.since >= recoveryDuration) {
    state.noticed = false; enter(state, 'waiting', now);
  }
  if (state.phase === 'brake') {
    const t = Math.min(1, (now - state.since) / 720);
    const slide = .085 * (1 - (1 - t) ** 2);
    const candidate = {
      u: state.slideFrom.u + state.velocity.u * slide,
      v: state.slideFrom.v + state.velocity.v * slide,
    };
    if (!isWalkableRoomSegment(from, candidate)) {
      const towardWall = (state.velocity.u < -.1 && rawTarget.u < .16)
        || (state.velocity.u > .1 && rawTarget.u > .84)
        || (state.velocity.v < -.1 && rawTarget.v < .16);
      if (towardWall) enter(state, 'dizzy', now);
      else { state.recoverSprite = 'toy-brake'; enter(state, 'recover', now); }
      return result;
    }
    result.point = candidate;
    result.walking = true;
    if (t >= 1) { state.recoverSprite = 'toy-brake'; enter(state, 'recover', now); }
    return result;
  }
  if (state.phase !== 'approach' && state.phase !== 'rush') return result;
  const rushing = state.phase === 'rush';
  if (distance < (rushing ? 1e-7 : .045)) {
    if (rushing) {
      state.slideFrom = { ...from };
      enter(state, 'brake', now);
      result.contact = true;
    } else if (toy === 'laser') {
      enter(state, 'laser-pounce', now);
      result.contact = true;
    } else enter(state, 'watching', now);
    return result;
  }
  const path = planRoomWalkPath(from, target);
  const length = roomWalkPathLength(path);
  if (length < .0001) return result;
  const speed = rushing ? .8 : toy === 'laser' ? .5 : .22;
  const reachesTarget = speed * dt >= length;
  const point = reachesTarget ? { ...target } : pointAlongRoomWalkPath(path, speed * dt / length);
  const moved = Math.hypot(point.u - from.u, point.v - from.v);
  if (moved > .00001) {
    state.velocity = { u: (point.u - from.u) / moved, v: (point.v - from.v) / moved };
    result.point = point;
    result.walking = true;
    result.lookU = point.u - from.u;
  }
  // Keep full rush speed until actual arrival, then slide FROM the contact
  // position. A proximity radius would start the brake visibly short of the toy.
  if (rushing && reachesTarget) {
    state.slideFrom = { ...point };
    enter(state, 'brake', now);
    result.contact = true;
  }
  return result;
}
