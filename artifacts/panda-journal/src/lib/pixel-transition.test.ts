import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  PIXELLAB_TRANSITION_FRAME_FILES,
  PIXEL_TRANSITION_FRAME_MS,
  pixelTransitionBlocksRoomWalking,
  playPixelTransitionFrames,
  type PixelTransitionPhase,
} from './pixel-transition';

class FakeScheduler {
  private nextId = 1;
  private now = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();

  setTimeout = (callback: () => void, delayMs: number) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + delayMs, callback });
    return id;
  };

  clearTimeout = (id: number) => {
    this.timers.delete(id);
  };

  advanceBy(durationMs: number) {
    const endAt = this.now + durationMs;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= endAt)
        .sort(([, left], [, right]) => left.at - right.at)[0];
      if (!next) break;
      const [id, timer] = next;
      this.timers.delete(id);
      this.now = timer.at;
      timer.callback();
    }
    this.now = endAt;
  }

  get pendingCount() {
    return this.timers.size;
  }
}

const transitionEntries = Object.entries(PIXELLAB_TRANSITION_FRAME_FILES) as [
  keyof typeof PIXELLAB_TRANSITION_FRAME_FILES,
  string[],
][];

test('stair turns keep the walking route alive while stationary transitions still pause it', () => {
  assert.equal(pixelTransitionBlocksRoomWalking(null, null), false);
  for (const direction of ['entering', 'waking'] as const) {
    assert.equal(pixelTransitionBlocksRoomWalking('climb-up', direction), false);
    for (const [key] of transitionEntries) {
      if (key !== 'climb-up') assert.equal(pixelTransitionBlocksRoomWalking(key, direction), true);
    }
    assert.equal(pixelTransitionBlocksRoomWalking(null, direction), true);
  }
});

test('every enabled transition has at least five real image frames for entering and waking', () => {
  const assetRoot = [
    resolve(process.cwd(), 'public/static/panda'),
    resolve(process.cwd(), 'artifacts/panda-journal/public/static/panda'),
  ].find(path => existsSync(path));
  assert.ok(assetRoot, 'could not locate the panda image asset directory');

  for (const [key, files] of transitionEntries) {
    assert.ok(files.length >= 5, `${key} should provide at least five frames`);
    for (const file of files) {
      assert.ok(existsSync(resolve(assetRoot, file)), `${key} is missing frame asset ${file}`);
    }

    for (const direction of ['entering', 'waking'] as const) {
      const scheduler = new FakeScheduler();
      const shownFrames: string[] = [];
      let completed = false;
      let phase: PixelTransitionPhase = null;
      playPixelTransitionFrames(files, direction, scheduler, {
        onFrame: frame => { if (frame) shownFrames.push(frame); },
        onPhase: nextPhase => { phase = nextPhase; },
        onComplete: () => { completed = true; },
      });

      scheduler.advanceBy(PIXEL_TRANSITION_FRAME_MS * files.length);
      assert.equal(shownFrames.length, files.length, `${key} ${direction} should display every frame`);
      assert.deepEqual(shownFrames, direction === 'entering' ? files : [...files].reverse(),
        `${key} ${direction} should display frames in the correct order`);
      assert.equal(completed, true, `${key} ${direction} should finish`);
      assert.equal(phase, null, `${key} ${direction} should clear its transition state`);
    }
  }
});

for (const interruption of ['chat', 'drag', 'wake'] as const) {
  test(`a ${interruption} interruption stops stale transition frames and leaves the panda in a current state`, () => {
    const scheduler = new FakeScheduler();
    const shownFrames: string[] = [];
    let phase: PixelTransitionPhase = null;
    let activity: 'lying' | 'roaming' = 'lying';
    let oldSequenceCompleted = false;
    const lyingFrames = PIXELLAB_TRANSITION_FRAME_FILES.lying;
    const cancel = playPixelTransitionFrames(lyingFrames, 'entering', scheduler, {
      onFrame: frame => { if (frame) shownFrames.push(frame); },
      onPhase: nextPhase => { phase = nextPhase; },
      onComplete: () => { oldSequenceCompleted = true; },
    });

    scheduler.advanceBy(PIXEL_TRANSITION_FRAME_MS * 2);
    const oldFramesShown = shownFrames.length;
    assert.ok(oldFramesShown > 0 && oldFramesShown < lyingFrames.length);

    cancel();
    activity = 'roaming';

    if (interruption === 'wake') {
      playPixelTransitionFrames(lyingFrames, 'waking', scheduler, {
        onFrame: frame => { if (frame) shownFrames.push(frame); },
        onPhase: nextPhase => { phase = nextPhase; },
        onComplete: () => { activity = 'roaming'; },
      });
      scheduler.advanceBy(PIXEL_TRANSITION_FRAME_MS * lyingFrames.length);
    } else {
      assert.equal(phase, null, `${interruption} should remove the active frame phase`);
      assert.equal(scheduler.pendingCount, 0, `${interruption} should clear the scheduled frame`);
      scheduler.advanceBy(PIXEL_TRANSITION_FRAME_MS * (lyingFrames.length + 2));
    }

    assert.equal(oldSequenceCompleted, false, `${interruption} must not complete the stale entry`);
    assert.equal(activity, 'roaming', `${interruption} must not leave the panda in the old pose`);
    assert.equal(phase, null, `${interruption} must leave no stale transition state`);
    assert.equal(shownFrames.length, oldFramesShown + (interruption === 'wake' ? lyingFrames.length : 0),
      `${interruption} must not play any more frames from the stale sequence`);
  });
}
