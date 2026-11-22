import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, adjustHungerState, initialState, idleDelay, localDay, performancePlan, contextFor, receiveReply, recordUserMessage, waitingForAnswer, tickCompanion, welcome, beginTrip, startGiftDrop, collectGift, feedGift, canFeedGift, feedActionForGift, favoriteGift, injectTestGift, markPendingInterrupted, deliverSpacePoliceLetter, eatSpacePoliceLetter, fileSpacePoliceLetter, markSpacePoliceLetterOpened, paySpacePoliceFine, placeSpacePolicePoop, packSpacePolicePoop, moveSpacePolicePoopBag, disposeSpacePolicePoopBag, finishSpacePolicePoopDisposal, GIFT_DROP_MS, CAPTURED_HOMECOMING_DURATION_MS, CAPTURED_TRIP_EXTRA_MS, SPACE_POLICE_LETTER_EAT_DELAY_MS, DAY, MINUTE, COMPANION_KEY, readState, writeState, tryStartIdleWorldFall, markWorldFallReturned, markPetWashed, markPetDried, tickDirtyHealth, tickPetPoop, tickPetPoopHealth, redeemFoxMerchantLetter, openFoxMerchantLetter, IDLE_FALL_AFTER_MS, DIRTY_HEALTH_DECAY_INTERVAL_MS } from './companion-store';
import type { CompanionState } from './companion-types';
import {
  CARE_STAT_DECAY_INTERVAL_MS,
  acknowledgeCareStatInteraction,
  decayCareStatState,
  mergeSharedCareStats,
  recordCareStatInteraction,
} from './companion-store';

const now = new Date(2026, 9, 8, 12).getTime();
function sample(): CompanionState {
  return { ...initialState(now), userName: '小乐', nextIdleAt: now + 5 * MINUTE, nextTripAt: now + 40 * MINUTE,
    messages: [{ id: 'user1', role: 'user', text: '我叫小乐，唱歌唱了很久，有点累，明天还要排练。', createdAt: now, status: 'pending' }] };
}

test('each returned snack maps to its own food animation and stays out of random actions', () => {
  const snacks = [
    ['🍌', 'eat-banana'],
    ['🥕', 'eat-carrot'],
    ['🐟', 'eat-fish'],
    ['🍬', 'eat-candy'],
    ['🍓', 'eat-strawberry'],
    ['🍪', 'eat-cookie'],
    ['🎋', 'eat-bamboo'],
  ] as const;
  for (const [emoji, action] of snacks) {
    const gift = { id: action, emoji, item: action, animal: '朋友', story: '礼物', receivedAt: now };
    assert.equal(canFeedGift(gift), true);
    assert.equal(feedActionForGift(gift), action);
    assert.equal(ACTIONS.includes(action), false);
  }
  assert.equal(feedActionForGift({
    id: 'keepsake', emoji: '🌰', item: '松果', animal: '松鼠', story: '纪念品', receivedAt: now,
  }), undefined);
});

test('care interactions increase growth and only their related stat', () => {
  const start = initialState(now);
  const health = recordCareStatInteraction(start, 'health', now + 1, 'health-1');
  assert.deepEqual(
    [health.careStats.growth, health.careStats.health, health.careStats.bond],
    [51, 51, 50],
  );
  const bond = recordCareStatInteraction(health, 'bond', now + 2, 'bond-1');
  assert.deepEqual(
    [bond.careStats.growth, bond.careStats.health, bond.careStats.bond],
    [52, 51, 51],
  );
  assert.equal(recordCareStatInteraction(bond, 'bond', now + 3, 'bond-1'), bond);
});

test('all numeric care stats decay by one at each six-hour idle boundary, never below zero', () => {
  const start = initialState(now);
  const low = {
    ...start,
    careStats: { ...start.careStats, growth: 2, health: 1, bond: 0 },
  };
  assert.equal(decayCareStatState(low, now + CARE_STAT_DECAY_INTERVAL_MS - 1), low);
  const firstStep = decayCareStatState(low, now + CARE_STAT_DECAY_INTERVAL_MS);
  assert.deepEqual(
    [firstStep.careStats.growth, firstStep.careStats.health, firstStep.careStats.bond],
    [1, 0, 0],
  );
  assert.equal(firstStep.careStats.hunger, 100, 'care-stat decay does not consume hunger');
  const secondStep = decayCareStatState(firstStep, now + 2 * CARE_STAT_DECAY_INTERVAL_MS);
  assert.deepEqual(
    [secondStep.careStats.growth, secondStep.careStats.health, secondStep.careStats.bond],
    [0, 0, 0],
  );
});

test('world fall requires more than five idle minutes and repeats only after clean drying', () => {
  const start = sample();
  assert.equal(tryStartIdleWorldFall(start, now + IDLE_FALL_AFTER_MS, () => 0).shouldFall, false);
  const first = tryStartIdleWorldFall(start, now + IDLE_FALL_AFTER_MS + 1, () => 0);
  assert.equal(first.shouldFall, true);
  assert.equal(first.state.worldEcology?.fallCycle, 'needs-clean');
  const returned = markWorldFallReturned(first.state, now + IDLE_FALL_AFTER_MS + 5000);
  assert.equal(returned.careStats.health, 47, 'returning from the fall costs three health');
  assert.equal(returned.worldEcology?.dirtySince, now + IDLE_FALL_AFTER_MS + 5000);
  assert.equal(tryStartIdleWorldFall(returned, now + IDLE_FALL_AFTER_MS + 10 * MINUTE, () => 0).shouldFall, false);

  const washed = markPetWashed(returned, now + 12 * MINUTE);
  assert.equal(washed.worldEcology?.dirtySince, undefined);
  const dried = markPetDried(washed, now + 13 * MINUTE);
  assert.equal(dried.worldEcology?.fallCycle, 'after-clean');
  assert.equal(tryStartIdleWorldFall(dried, now + 18 * MINUTE, () => 0).shouldFall, false);
  const failedRoll = tryStartIdleWorldFall(dried, now + 18 * MINUTE + 1, () => 0.99);
  assert.equal(failedRoll.shouldFall, false);
  assert.equal(tryStartIdleWorldFall(failedRoll.state, now + 18 * MINUTE + 50_000, () => 0).shouldFall, false);
  const nextMinute = tryStartIdleWorldFall(failedRoll.state, now + 19 * MINUTE + 2, () => 0);
  assert.equal(nextMinute.shouldFall, true);
});

test('dirty health loses exactly 1.5 per minute and a bath stops the loss', () => {
  const started = {
    ...sample(),
    careStats: { ...sample().careStats, health: 10 },
    worldEcology: { ...sample().worldEcology!, fallCycle: 'needs-clean' as const, dirtySince: now, dirtyHealthAppliedMinutes: 0 },
  };
  const beforeDecay = tickDirtyHealth(started, '小熊猫', now + DIRTY_HEALTH_DECAY_INTERVAL_MS - 1).state;
  assert.equal(beforeDecay.careStats.health, 10);
  assert.equal(beforeDecay.worldEcology?.sick, true);
  const afterMinute = tickDirtyHealth(beforeDecay, '小熊猫', now + DIRTY_HEALTH_DECAY_INTERVAL_MS);
  assert.equal(afterMinute.state.careStats.health, 8.5);
  const washed = markPetWashed(afterMinute.state, now + DIRTY_HEALTH_DECAY_INTERVAL_MS + 1);
  assert.equal(tickDirtyHealth(washed, '小熊猫', now + 8 * MINUTE).state, washed);
  const desktopTick = tickCompanion(started, now + MINUTE);
  assert.equal(desktopTick.state.careStats.health, 10);
  const webTick = tickCompanion(started, now + MINUTE, Math.random, { enableWorldEcology: true, petName: '小熊猫' });
  assert.equal(webTick.state.careStats.health, 8.5);
});

test('web-room pet poop is created once per minute, but not by the desktop tick', () => {
  const state = sample();
  const beforeDue = tickPetPoop(state, now + MINUTE - 1);
  assert.equal(beforeDue, state);
  const created = tickPetPoop(state, now + MINUTE);
  assert.equal(created.spacePoliceLetters?.filter(letter => letter.kind === 'pet-poop').length, 1);
  assert.equal(created.spacePoliceLetters?.find(letter => letter.kind === 'pet-poop')?.poop?.createdAt, now + MINUTE);

  const desktopTick = tickCompanion(state, now + MINUTE);
  assert.equal(desktopTick.state.spacePoliceLetters?.some(letter => letter.kind === 'pet-poop'), false);
  const webTick = tickCompanion(state, now + MINUTE, Math.random, { enableWorldEcology: true });
  assert.equal(webTick.state.spacePoliceLetters?.filter(letter => letter.kind === 'pet-poop').length, 1);
});

test('each uncleared poop begins costing one health per minute after five minutes', () => {
  const letter = {
    id: 'automatic-poop',
    deliveredAt: now,
    kind: 'pet-poop' as const,
    poop: { phase: 'fresh' as const, createdAt: now, healthAppliedMinutes: 0 },
  };
  const state = { ...sample(), spacePoliceLetters: [letter] };
  assert.equal(tickPetPoopHealth(state, '小熊猫', now + 5 * MINUTE).state.careStats.health, 50);
  const firstLoss = tickPetPoopHealth(state, '小熊猫', now + 6 * MINUTE);
  assert.equal(firstLoss.state.careStats.health, 49);
  assert.equal(firstLoss.state.spacePoliceLetters?.[0]?.poop?.healthAppliedMinutes, 1);
  const secondLoss = tickPetPoopHealth(firstLoss.state, '小熊猫', now + 7 * MINUTE);
  assert.equal(secondLoss.state.careStats.health, 48);
  const disposed = {
    ...state,
    spacePoliceLetters: [{ ...letter, poop: { ...letter.poop, phase: 'disposed' as const, disposedAt: now + 4 * MINUTE } }],
  };
  assert.equal(tickPetPoopHealth(disposed, '小熊猫', now + 12 * MINUTE).state.careStats.health, 50);
});

test('fever latches at health 20 while health zero keeps the fox merchant event', () => {
  const state = { ...sample(), careStats: { ...sample().careStats, health: 20 } };
  const fever = tickPetPoopHealth(state, '小熊猫', now);
  assert.equal(fever.state.worldEcology?.sick, true);
  assert.equal(fever.state.foxMerchantLetter, undefined);
  const gifts = Array.from({ length: 5 }, (_, index) => ({
    id: `snack-${index}`, emoji: '🍬', item: '糖果', animal: '朋友', story: '礼物', receivedAt: now,
  }));
  const zero = tickDirtyHealth({ ...state, careStats: { ...state.careStats, health: 0 }, gifts }, '小熊猫', now);
  assert.equal(zero.event, 'captured');
  assert.equal(zero.state.worldEcology?.sick, true);
  assert.equal(redeemFoxMerchantLetter(zero.state, now + 1).worldEcology?.sick, false);
});

test('local storage accepts fractional health and preserves it across reloads', () => {
  const state = { ...sample(), careStats: { ...sample().careStats, health: 47.5 } };
  const values = new Map<string, string>();
  writeState({ setItem: (key, value) => values.set(key, value) }, state);
  const restored = readState({ getItem: key => values.get(key) ?? null }, now + 1);
  assert.equal(restored.careStats.health, 47.5);
});

test('poop age, applied penalties, timer, and fever state survive local reloads', () => {
  const state = {
    ...sample(),
    spacePoliceLetters: [{
      id: 'persisted-poop',
      deliveredAt: now,
      kind: 'pet-poop' as const,
      poop: { phase: 'fresh' as const, x: 0.5, y: 0.6, createdAt: now, healthAppliedMinutes: 2 },
    }],
    worldEcology: { ...sample().worldEcology!, lastPetPoopAt: now - MINUTE, sick: true },
  };
  const values = new Map<string, string>();
  writeState({ setItem: (key, value) => values.set(key, value) }, state);
  const restored = readState({ getItem: key => values.get(key) ?? null }, now + 6 * MINUTE);
  assert.equal(restored.spacePoliceLetters?.[0]?.poop?.createdAt, now);
  assert.equal(restored.spacePoliceLetters?.[0]?.poop?.healthAppliedMinutes, 2);
  assert.equal(restored.worldEcology?.lastPetPoopAt, now - MINUTE);
  assert.equal(restored.worldEcology?.sick, true);
  const resumed = tickPetPoopHealth(restored, '小熊猫', now + 8 * MINUTE);
  assert.equal(resumed.state.spacePoliceLetters?.[0]?.poop?.healthAppliedMinutes, 3);
  assert.equal(resumed.state.careStats.health, 49);
  assert.equal(resumed.state.worldEcology?.sick, true);
});

test('health reaching zero either captures for five unused food gifts or resets care state', () => {
  const gifts = Array.from({ length: 5 }, (_, index) => ({
    id: `food-${index}`, emoji: '🍬', item: '糖果', animal: '朋友', story: '礼物', receivedAt: now,
  }));
  const state = {
    ...sample(),
    careStats: { ...sample().careStats, health: 1 },
    gifts,
    worldEcology: { ...sample().worldEcology!, fallCycle: 'needs-clean' as const, dirtySince: now, dirtyHealthAppliedMinutes: 0 },
  };
  const captured = tickDirtyHealth(state, '小白', now + MINUTE);
  assert.equal(captured.event, 'captured');
  assert.equal(captured.state.foxMerchantLetter?.status, 'captured');
  assert.equal(captured.state.foxMerchantLetter?.foxName, '小白专属狐贩子');
  const opened = openFoxMerchantLetter(captured.state, now + MINUTE + 1);
  assert.equal(opened.foxMerchantLetter?.openedAt, now + MINUTE + 1);
  const rescued = redeemFoxMerchantLetter(opened, now + MINUTE + 2);
  assert.equal(rescued.foxMerchantLetter?.status, 'rescued');
  assert.equal(rescued.gifts.filter(gift => gift.fedAt).length, 5);
  assert.equal(rescued.careStats.health, 50);

  const short = {
    ...state,
    gifts: gifts.slice(0, 3),
    diary: [{ id: 'keep-diary', kind: 'idea' as const, text: '仍保留', createdAt: now, sourceMessageId: 'user1' }],
  };
  const reset = tickDirtyHealth(short, '小熊猫', now + MINUTE);
  assert.equal(reset.event, 'reset');
  assert.equal(reset.state.foxMerchantLetter?.status, 'reset');
  assert.equal(reset.state.careStats.health, 50);
  assert.equal(reset.state.careStats.growth, 50);
  assert.equal(reset.state.diary[0]?.id, 'keep-diary');
  assert.equal(reset.state.gifts.length, 3);

  const nearZero = {
    ...state,
    careStats: { ...state.careStats, health: 2 },
    worldEcology: { ...state.worldEcology!, fallCycle: 'needs-clean' as const },
  };
  const capturedOnReturn = markWorldFallReturned(nearZero, now + 2 * MINUTE, '小白');
  assert.equal(capturedOnReturn.careStats.health, 0);
  assert.equal(capturedOnReturn.foxMerchantLetter?.status, 'captured');
  assert.equal(capturedOnReturn.foxMerchantLetter?.petName, '小白');
});

test('shared stats merge pending local care once and acknowledge server confirmation', () => {
  const start = initialState(now);
  const local = recordCareStatInteraction(start, 'bond', now + 100, 'pending-1');
  const server = {
    ...start.careStats,
    growth: 60,
    health: 55,
    bond: 58,
    lastInteractionAt: now + 50,
    lastDecayAt: now + 50,
    revision: 3,
    lastInteractionCategory: 'health' as const,
  };
  const merged = mergeSharedCareStats(local, server);
  assert.deepEqual(
    [merged.careStats.growth, merged.careStats.health, merged.careStats.bond],
    [61, 55, 59],
  );
  const confirmed = acknowledgeCareStatInteraction(merged, 'pending-1', {
    ...server,
    growth: 61,
    bond: 59,
    lastInteractionAt: now + 100,
    lastDecayAt: now + 100,
    revision: 4,
    lastInteractionCategory: 'bond',
    recentInteractionIds: ['pending-1'],
  });
  assert.equal(confirmed.pendingCareStatInteractions.length, 0);
  assert.deepEqual(
    [confirmed.careStats.growth, confirmed.careStats.health, confirmed.careStats.bond],
    [61, 55, 59],
  );
});

test('hunger changes are bounded, timestamped, and survive shared-stat merging', () => {
  const start = initialState(now);
  const local = adjustHungerState(start, -8, now + 10);
  assert.deepEqual([local.careStats.hunger, local.careStats.hungerUpdatedAt], [92, now + 10]);
  assert.equal(adjustHungerState(local, -200, now + 20).careStats.hunger, 0);
  assert.equal(adjustHungerState(start, 1, now + 30).careStats.hunger, 100);

  const olderRemote = { ...start.careStats, hunger: 97, hungerUpdatedAt: now + 5 };
  assert.equal(mergeSharedCareStats(local, olderRemote).careStats.hunger, 92);
  const newerRemote = { ...start.careStats, hunger: 85, hungerUpdatedAt: now + 15 };
  assert.equal(mergeSharedCareStats(local, newerRemote).careStats.hunger, 85);
});

test('legacy companion records receive a neutral stats baseline without losing history', () => {
  const legacy = { ...initialState(now), messages: [{ id: 'old', role: 'user', text: 'still here', createdAt: now }] } as unknown as Record<string, unknown>;
  delete legacy.careStats;
  delete legacy.pendingCareStatInteractions;
  const migrated = readState({ getItem: () => JSON.stringify(legacy) }, now + 1000);
  assert.equal(migrated.messages[0].text, 'still here');
  assert.deepEqual(
    [migrated.careStats.growth, migrated.careStats.health, migrated.careStats.bond],
    [50, 50, 50],
  );
  assert.equal(migrated.careStats.lastInteractionAt, now + 1000);
});

test('older saved care stats gain a full hunger meter without losing other values', () => {
  const legacy = { ...initialState(now), careStats: { ...initialState(now).careStats } } as unknown as Record<string, any>;
  delete legacy.careStats.hunger;
  delete legacy.careStats.hungerUpdatedAt;
  const migrated = readState({ getItem: () => JSON.stringify(legacy) }, now + 1000);
  assert.equal(migrated.careStats.growth, 50);
  assert.equal(migrated.careStats.hunger, 100);
  assert.equal(migrated.careStats.hungerUpdatedAt, now + 1000);
});
test('pending messages recovered after restart are distinguished from AI request failures', () => {
  const state = sample();
  const recovered = markPendingInterrupted(state);
  assert.equal(recovered.messages[0].status, 'interrupted');
  assert.equal(state.messages[0].status, 'pending');
  assert.equal(markPendingInterrupted(recovered), recovered);
});
test('idle time is between five and ten minutes', () => {
  assert.equal(idleDelay(() => 0), 5 * MINUTE); assert.equal(idleDelay(() => 1), 10 * MINUTE);
  assert.equal(tickCompanion(sample(), now + 4 * MINUTE).event, undefined);
  assert.equal(tickCompanion(sample(), now + 5 * MINUTE, () => 0).event, 'proactive');
});
test('proactive quota stays four across persistence and resets on the next local day', () => {
  let state = { ...sample(), nextTripAt: now + 2 * DAY };
  for (let i = 1; i <= 4; i++) {
    state = tickCompanion(state, now + i * 11 * MINUTE, () => 0).state;
    state = recordUserMessage(state, { id: `reply${i}`, role: 'user', text: '愿意分享，今天吃到蛋糕啦。', createdAt: now + i * 11 * MINUTE });
  }
  assert.equal(state.proactiveCount, 4);
  assert.equal(tickCompanion(state, now + 55 * MINUTE, () => 0).event, undefined);
  const tomorrow = now + DAY;
  state = { ...state, nextTripAt: tomorrow + DAY };
  const result = tickCompanion(state, tomorrow, () => 0);
  assert.equal(result.state.proactiveCount, 1); assert.equal(result.state.proactiveDay, localDay(tomorrow));
});
test('unanswered questions stay pending after reload, reopening, events and midnight', () => {
  let state = tickCompanion(sample(), now + 5 * MINUTE, () => 0).state;
  assert.equal(waitingForAnswer(state), true);
  state = { ...state, nextTripAt: now + 10 * DAY };
  state = welcome(JSON.parse(JSON.stringify(state)), now + 10 * MINUTE);
  assert.doesNotMatch(state.messages.at(-1)!.text, /[？?]/);
  assert.equal(tickCompanion(state, now + 15 * MINUTE, () => 0).event, undefined);
  const tomorrow = tickCompanion(state, now + DAY, () => 0);
  assert.equal(tomorrow.event, undefined);
  assert.equal(tomorrow.state.proactiveCount, 0);
  assert.equal(waitingForAnswer(tomorrow.state), true);
});
test('questions alternate caring/private and refusal pauses private invitations until explicit consent', () => {
  let state = tickCompanion(sample(), now + 5 * MINUTE, () => 0).state;
  assert.match(state.messages.at(-1)!.text, /开心的小事/);
  state = recordUserMessage(state, { id: 'reply', role: 'user', text: '今天吃到好吃的蛋糕。', createdAt: now + 6 * MINUTE });
  state = tickCompanion(state, now + 16 * MINUTE, () => 0).state;
  assert.match(state.messages.at(-1)!.text, /难过/);
  state = recordUserMessage(state, { id: 'refuse', role: 'user', text: '不想说。', createdAt: now + 17 * MINUTE });
  assert.equal(state.privateQuestionsPaused, true);
  state = { ...state, diary: [{ id: 'd', kind: 'worry', text: '不想再聊的心事', createdAt: now - 3 * DAY, sourceMessageId: 'reply' }] };
  state = tickCompanion(state, now + 27 * MINUTE, () => 0).state;
  assert.equal(state.messages.at(-1)!.kind, 'proactive');
  assert.doesNotMatch(state.messages.at(-1)!.text, /心事|难过|后来怎么样/);
  state = recordUserMessage(state, { id: 'consent', role: 'user', text: '现在愿意说了。', createdAt: now + 28 * MINUTE });
  assert.equal(state.privateQuestionsPaused, false);
});
test('reopening follow-up questions share the daily limit and do not replace an unanswered question', () => {
  const state = { ...sample(), proactiveCount: 4, diary: [{ id: 'd', kind: 'action' as const,
    text: '明天排练', createdAt: now - 3 * DAY, sourceMessageId: 'user1' }] };
  assert.equal(welcome(state, now).messages.at(-1)?.kind, 'welcome');
  const asked = welcome({ ...state, proactiveCount: 3 }, now);
  assert.equal(asked.proactiveCount, 4);
  assert.equal(asked.messages.at(-1)?.kind, 'followup');
  assert.equal(welcome(asked, now + 1).messages.at(-1)?.kind, 'welcome');
});
test('provider receives text context only, capped at forty and twenty-four notes', () => {
  const state = sample();
  for (let i = 0; i < 60; i++) state.messages.push({ id: `u${i}`, role: 'user', text: `具体细节${i}`, photo: 'data:image/jpeg;base64,private', createdAt: now + i });
  const input = contextFor(state, 'u59');
  assert.equal(input.messages.length, 40); assert.equal(input.messages.at(-1)?.content, '具体细节59');
  assert.equal(input.userName, '小乐'); assert.ok(!JSON.stringify(input).includes('private'));
});
test('AI result and diary extraction are one persisted state; duplicate notes are not re-added', () => {
  const response = { reply: '唔，小乐唱了这么久，小熊猫陪你坐会儿呀。（它轻轻靠过来）', userName: '小乐',
    memories: [{ kind: 'action' as const, text: '明天排练' }, { kind: 'worry' as const, text: '唱歌很久很累' }], action: 'none' as const };
  let state = receiveReply(sample(), 'user1', response, now + 10);
  assert.equal(state.messages[0].status, 'sent'); assert.equal(state.diary.length, 2);
  state = receiveReply(state, 'user1', response, now + 20);
  assert.equal(state.diary.length, 2); assert.equal(state.userName, '小乐');
});
test('specific notebook follow-up becomes due after two full days, once only', () => {
  const state = { ...sample(), diary: [{ id: 'd1', kind: 'action' as const, text: '明天排练', createdAt: now, sourceMessageId: 'user1' }] };
  assert.equal(welcome(state, now + 2 * DAY - 1).messages.at(-1)?.kind, 'welcome');
  const next = welcome(state, now + 2 * DAY);
  assert.equal(next.messages.at(-1)?.kind, 'followup');
  assert.match(next.messages.at(-1)!.text, /小乐.*明天排练.*后来怎么样/);
  assert.equal(welcome(next, now + 2 * DAY + 1000).messages.at(-1)?.kind, 'welcome');
});
test('random performance falls remain available for desktop but can be disabled for the web room', () => {
  assert.deepEqual(ACTIONS, ['bamboo', 'jump', 'somersault', 'tail']);
  for (let i = 0; i < ACTIONS.length; i++) {
    const values = [i / ACTIONS.length + 0.01, 0.5, 0.099];
    const plan = performancePlan(() => values.shift() ?? 0);
    assert.equal(plan.duration, 3500);
    assert.equal(plan.action, ACTIONS[i]);
    assert.equal(plan.drops, ['jump', 'somersault'].includes(plan.action));
  }
  const webValues = [0.3, 0.5];
  assert.equal(performancePlan(() => webValues.shift() ?? 0, false).drops, false);
});
test('excursions take thirty to one hundred twenty seconds and gift settlement is durable and one-time', () => {
  for (const value of [0, 1]) {
    const state = beginTrip(sample(), now, () => value);
    const captured = value === 1;
    assert.equal(state.trip!.captured, captured);
    assert.equal(state.trip!.returnAt - now, 30_000 + value * 90_000 + (captured ? CAPTURED_TRIP_EXTRA_MS : 0));
    const pending = tickCompanion(state, state.trip!.returnAt - 1, () => 0);
    assert.equal(pending.state.gifts.length, 0);
    const back = tickCompanion(pending.state, state.trip!.returnAt, () => 0);
    assert.equal(back.event, 'gift'); assert.equal(back.state.gifts.length, 0);
    assert.match(back.state.pendingGift!.story, /给小乐/);
    assert.equal(back.capturedReturn, captured);
    const clicked = startGiftDrop(back.state, back.state.pendingGift!.id, state.trip!.returnAt);
    assert.equal(collectGift(clicked, clicked.pendingGift!.id, state.trip!.returnAt + GIFT_DROP_MS - 1).gifts.length, 0);
    const stored = collectGift(clicked, clicked.pendingGift!.id, state.trip!.returnAt + GIFT_DROP_MS);
    assert.equal(stored.gifts.length, 1);
    assert.equal(collectGift(stored, clicked.pendingGift!.id, state.trip!.returnAt + GIFT_DROP_MS + 1).gifts.length, 1);
  }
});
test('captured outing adds a return delay and keeps the homecoming form until interaction', () => {
  const trip = beginTrip(sample(), now, () => 1);
  assert.equal(trip.trip!.captured, true);
  assert.match(trip.messages.at(-1)!.text, /太可爱.*抱走/);
  const returned = tickCompanion(trip, trip.trip!.returnAt, () => 0);
  assert.equal(returned.capturedReturn, true);
  assert.equal(returned.state.returnEvent?.kind, 'captured');
  assert.equal(returned.state.returnEvent?.until, trip.trip!.returnAt + CAPTURED_HOMECOMING_DURATION_MS);
  assert.equal(returned.state.returnEvent?.awaitingInteraction, true);
  assert.equal(returned.state.spacePoliceLetter?.deliveredAt, trip.trip!.returnAt);
  assert.equal(returned.state.spacePoliceLetters?.length, 1);
  assert.equal(returned.state.spacePoliceLetters?.[0].deliveredAt, trip.trip!.returnAt);
  assert.match(returned.text!, /找回来啦.*呆呆的/);
  const afterWait = tickCompanion(returned.state, returned.state.returnEvent!.until + 1, () => 0);
  assert.equal(afterWait.state.returnEvent?.awaitingInteraction, true);
  assert.equal(afterWait.state.spacePoliceLetter?.deliveredAt, trip.trip!.returnAt);
  const openedAt = trip.trip!.returnAt + 60 * MINUTE;
  const opened = markSpacePoliceLetterOpened(afterWait.state, openedAt);
  assert.equal(opened.spacePoliceLetter?.openedAt, openedAt);
  assert.equal(markSpacePoliceLetterOpened(opened, openedAt + 1), opened);
  const data = new Map<string, string>();
  writeState({ setItem: (key, value) => data.set(key, value) }, opened);
  const restored = readState({ getItem: key => data.get(key) ?? null }, openedAt + 1);
  assert.equal(restored.spacePoliceLetter?.openedAt, openedAt);
  const legacyReturn = { ...afterWait.state, spacePoliceLetter: undefined };
  const migrated = readState({ getItem: () => JSON.stringify(legacyReturn) }, openedAt + 1);
  assert.equal(migrated.spacePoliceLetter?.deliveredAt, trip.trip!.returnAt);
});
test('space police mailbox keeps multiple letters and updates read state per letter', () => {
  const first = deliverSpacePoliceLetter(sample(), now, () => 'space-letter-1');
  const second = deliverSpacePoliceLetter(first, now + 1000, () => 'space-letter-2');
  assert.equal(second.spacePoliceLetters?.length, 2);
  assert.equal(second.spacePoliceLetter?.deliveredAt, now + 1000);

  const oldLetterOpened = markSpacePoliceLetterOpened(second, now + 2000, 'space-letter-1');
  assert.equal(oldLetterOpened.spacePoliceLetters?.find(letter => letter.id === 'space-letter-1')?.openedAt, now + 2000);
  assert.equal(oldLetterOpened.spacePoliceLetters?.find(letter => letter.id === 'space-letter-2')?.openedAt, undefined);
  assert.equal(oldLetterOpened.spacePoliceLetter?.openedAt, undefined);

  const activeOpened = markSpacePoliceLetterOpened(oldLetterOpened, now + 3000);
  assert.equal(activeOpened.spacePoliceLetter?.openedAt, now + 3000);
  assert.equal(activeOpened.spacePoliceLetters?.find(letter => letter.id === 'space-letter-2')?.openedAt, now + 3000);
  assert.equal(markSpacePoliceLetterOpened(activeOpened, now + 4000), activeOpened);

  const data = new Map<string, string>();
  writeState({ setItem: (key, value) => data.set(key, value) }, activeOpened);
  const restored = readState({ getItem: key => data.get(key) ?? null }, now + 4000);
  assert.deepEqual(restored.spacePoliceLetters, activeOpened.spacePoliceLetters);
});
test('an unfiled space police envelope is eaten after five minutes and the letter remains archived', () => {
  const delivered = deliverSpacePoliceLetter(sample(), now, () => 'letter-to-eat');
  const eatenAt = now + SPACE_POLICE_LETTER_EAT_DELAY_MS;
  const eaten = eatSpacePoliceLetter(delivered, delivered.spacePoliceLetter!.deliveredAt, eatenAt);
  assert.equal(SPACE_POLICE_LETTER_EAT_DELAY_MS, 5 * MINUTE);
  assert.equal(eaten.spacePoliceLetter?.eatenAt, eatenAt);
  assert.equal(eaten.spacePoliceLetters?.[0].eatenAt, eatenAt);
  assert.deepEqual(eaten.spacePoliceLetters?.[0].poop, { phase: 'pending', createdAt: eatenAt, healthAppliedMinutes: 0 });
  assert.match(eaten.messages.at(-1)!.text, /好奇.*吃掉.*拉肚子/);
  assert.equal(eatSpacePoliceLetter(eaten, delivered.spacePoliceLetter!.deliveredAt, eatenAt + 1), eaten);

  const placed = placeSpacePolicePoop(eaten, eatenAt - SPACE_POLICE_LETTER_EAT_DELAY_MS, 0.4, 0.6);
  assert.deepEqual(placed.spacePoliceLetters?.[0].poop, {
    phase: 'fresh', x: 0.4, y: 0.6, createdAt: eatenAt, healthAppliedMinutes: 0,
  });
  const bagged = packSpacePolicePoop(placed, delivered.spacePoliceLetter!.deliveredAt, eatenAt + 1000);
  assert.equal(bagged.spacePoliceLetters?.[0].poop?.phase, 'bagged');
  const moved = moveSpacePolicePoopBag(bagged, delivered.spacePoliceLetter!.deliveredAt, 0.5, 0.7);
  assert.deepEqual([moved.spacePoliceLetters?.[0].poop?.x, moved.spacePoliceLetters?.[0].poop?.y], [0.5, 0.7]);
  const disposing = disposeSpacePolicePoopBag(moved, delivered.spacePoliceLetter!.deliveredAt, 0.7, 0.8, eatenAt + 2000);
  assert.equal(disposing.spacePoliceLetters?.[0].poop?.phase, 'disposing');
  const disposed = finishSpacePolicePoopDisposal(disposing, delivered.spacePoliceLetter!.deliveredAt);
  assert.equal(disposed.spacePoliceLetters?.[0].poop?.phase, 'disposed');
  const saved = new Map<string, string>();
  writeState({ setItem: (key, value) => saved.set(key, value) }, disposed);
  assert.equal(readState({ getItem: key => saved.get(key) ?? null }, eatenAt + 3000).spacePoliceLetters?.[0].poop?.phase, 'disposed');

  const legacyEaten = {
    ...delivered,
    spacePoliceLetter: { ...delivered.spacePoliceLetter!, eatenAt },
    spacePoliceLetters: [{ ...delivered.spacePoliceLetters![0], eatenAt }],
  };
  const migratedEaten = readState({ getItem: () => JSON.stringify(legacyEaten) }, eatenAt + 1);
  assert.equal(migratedEaten.spacePoliceLetter?.poop?.phase, 'pending');
  assert.equal(migratedEaten.spacePoliceLetters?.[0].poop?.phase, 'pending');
});
test('filing a space police envelope prevents it from being eaten and protects old saved letters', () => {
  const delivered = deliverSpacePoliceLetter(sample(), now, () => 'letter-to-file');
  const filedAt = now + 10_000;
  const filed = fileSpacePoliceLetter(delivered, delivered.spacePoliceLetter!.deliveredAt, filedAt);
  assert.equal(filed.spacePoliceLetter?.filedAt, filedAt);
  assert.equal(filed.spacePoliceLetters?.[0].filedAt, filedAt);
  assert.equal(fileSpacePoliceLetter(filed, delivered.spacePoliceLetter!.deliveredAt, filedAt + 1), filed);
  assert.equal(eatSpacePoliceLetter(filed, delivered.spacePoliceLetter!.deliveredAt, now + SPACE_POLICE_LETTER_EAT_DELAY_MS), filed);

  const legacy = {
    ...delivered,
    spacePoliceLetter: { deliveredAt: now },
    spacePoliceLetters: [{ id: 'legacy-letter', deliveredAt: now }],
  };
  const migratedAt = now + 20_000;
  const restored = readState({ getItem: () => JSON.stringify(legacy) }, migratedAt);
  assert.equal(restored.spacePoliceLetter?.filedAt, undefined);
  assert.equal(restored.spacePoliceLetter?.eatAfterAt, migratedAt + SPACE_POLICE_LETTER_EAT_DELAY_MS);
  assert.equal(restored.spacePoliceLetters?.[0].eatAfterAt, migratedAt + SPACE_POLICE_LETTER_EAT_DELAY_MS);
});

test('paying the space police fine consumes only the selected souvenir and saves its receipt once', () => {
  const gift = { id: 'gift-to-pay', emoji: '🍌', item: '香蕉', animal: '猴子', story: '猴子送的香蕉', receivedAt: now };
  const keep = { id: 'gift-to-keep', emoji: '🌸', item: '花瓣', animal: '蝴蝶', story: '蝴蝶送的花瓣', receivedAt: now + 1 };
  const lettered = deliverSpacePoliceLetter({ ...sample(), gifts: [gift, keep] }, now, () => 'fine-letter');

  const paid = paySpacePoliceFine(lettered, 'fine-letter', gift.id, now + 2);
  assert.deepEqual(paid.gifts, [keep]);
  assert.deepEqual(paid.spacePoliceLetters?.[0].finePayment, {
    paidAt: now + 2, giftId: gift.id, emoji: gift.emoji, item: gift.item,
  });
  assert.equal(paySpacePoliceFine(paid, 'fine-letter', keep.id, now + 3), paid);

  const data = new Map<string, string>();
  writeState({ setItem: (key, value) => data.set(key, value) }, paid);
  const restored = readState({ getItem: key => data.get(key) ?? null }, now + 4);
  assert.deepEqual(restored.spacePoliceLetters?.[0].finePayment, paid.spacePoliceLetters?.[0].finePayment);
  assert.deepEqual(restored.gifts, [keep]);
});

test('space police fine leaves the collection unchanged when the letter or selected souvenir is missing', () => {
  const gift = { id: 'kept-gift', emoji: '🌰', item: '松果', animal: '松鼠', story: '松鼠送的松果', receivedAt: now };
  const state = deliverSpacePoliceLetter({ ...sample(), gifts: [gift] }, now, () => 'fine-letter');
  assert.equal(paySpacePoliceFine(state, 'missing-letter', gift.id, now + 1), state);
  assert.equal(paySpacePoliceFine(state, 'fine-letter', 'missing-gift', now + 1), state);
  assert.deepEqual(state.gifts, [gift]);
});

test('legacy single space police letter migrates into the mailbox archive', () => {
  const { spacePoliceLetters: _letters, ...legacyState } = {
    ...sample(),
    spacePoliceLetter: { deliveredAt: now, openedAt: now + 500 },
  };
  const restored = readState({ getItem: () => JSON.stringify(legacyState) }, now + 1000);
  assert.deepEqual(restored.spacePoliceLetters, [{
    id: `legacy-space-police-${now}`,
    deliveredAt: now,
    openedAt: now + 500,
    eatAfterAt: now + 1000 + SPACE_POLICE_LETTER_EAT_DELAY_MS,
  }]);
});

test('gift trips tell varied stories that match the souvenir and avoid immediate repeats', () => {
  const first = beginTrip(sample(), now, () => 0);
  const firstGift = first.trip!.gift;
  const second = beginTrip(first, now + 1, () => 0);
  const secondGift = second.trip!.gift;
  assert.equal(firstGift.item, '香蕉');
  assert.equal(firstGift.animal, '猴子');
  assert.match(firstGift.story, /猴子|香蕉/);
  assert.notEqual(secondGift.story, firstGift.story);
  assert.match(secondGift.story, /猴子|香蕉/);
  assert.equal(second.recentGiftStories?.length, 2);
});
test('new gift pool includes all approved food and toy gifts with matching stories', () => {
  const approvedGifts = [
    { item: '野莓串', animal: '小刺猬', emoji: '🍓', edible: true },
    { item: '竹叶饼干', animal: '小熊', emoji: '🍪', edible: true },
    { item: '嫩竹笋', animal: '竹鼠', emoji: '🎋', edible: true },
    { item: '毛线球', animal: '小猫', emoji: '🧶', edible: false },
    { item: '小纸风筝', animal: '麻雀', emoji: '🪁', edible: false },
    { item: '木陀螺', animal: '松鼠', emoji: '🪀', edible: false },
  ];
  approvedGifts.forEach((expected, index) => {
    const values = [(index + 6.2) / 12, 0, 0, 0];
    const gift = beginTrip(sample(), now, () => values.shift() ?? 0).trip!.gift;
    assert.equal(gift.item, expected.item);
    assert.equal(gift.animal, expected.animal);
    assert.equal(gift.emoji, expected.emoji);
    assert.match(gift.story, new RegExp(expected.item));
    assert.equal(canFeedGift(gift), expected.edible);
  });
});
test('uncollected gifts survive reload and cannot be replaced by a new excursion', () => {
  const arrival = tickCompanion(beginTrip(sample(), now, () => 0), now + 120_000, () => 0).state;
  const restored = JSON.parse(JSON.stringify({ ...arrival, nextTripAt: now - 1 }));
  const later = tickCompanion(restored, now + DAY, () => 0).state;
  assert.equal(later.pendingGift.id, arrival.pendingGift!.id);
  assert.equal(later.trip, undefined); assert.equal(later.gifts.length, 0);
  const clicked = startGiftDrop(arrival, arrival.pendingGift!.id, now + 120_000);
  assert.equal(startGiftDrop(clicked, clicked.pendingGift!.id, now + 121_000).giftDropStartedAt, now + 120_000);
  assert.equal(tickCompanion(clicked, now + 120_000 + GIFT_DROP_MS, () => 0).state.gifts.length, 1);
});
test('favorites persist and feeding consumes a food gift once, retaining its story', () => {
  const gift = { id: 'banana', emoji: '🍌', item: '香蕉', animal: '猴子', story: '猴子送的香蕉', receivedAt: now };
  let state = { ...sample(), gifts: [gift] };
  state = favoriteGift(state, gift.id);
  assert.equal(state.gifts[0].favorite, true);
  state = { ...state, careStats: { ...state.careStats, hunger: 30 } };
  state = feedGift(state, gift.id, now + 1);
  assert.equal(state.gifts[0].fedAt, now + 1);
  assert.equal(state.careStats.hunger, 31, 'feeding one snack restores one hunger point');
  const once = state.messages.length;
  state = feedGift(state, gift.id, now + 2);
  assert.equal(state.messages.length, once); assert.equal(state.gifts[0].story, gift.story);
  const flower = { ...gift, id: 'flower', emoji: '🌸' };
  assert.equal(feedGift({ ...state, gifts: [flower] }, 'flower', now).gifts[0].fedAt, undefined);
});
test('new food gifts can be fed while the new toys stay collectible', () => {
  const foods = [
    { id: 'berries', item: '野莓串', emoji: '🍓' },
    { id: 'cookie', item: '竹叶饼干', emoji: '🍪' },
    { id: 'shoot', item: '嫩竹笋', emoji: '🎋' },
  ];
  const toys = [
    { id: 'yarn', item: '毛线球', emoji: '🧶' },
    { id: 'kite', item: '小纸风筝', emoji: '🪁' },
    { id: 'top', item: '木陀螺', emoji: '🪀' },
  ];
  for (const gift of foods) {
    const state = feedGift({ ...sample(), gifts: [{ ...gift, animal: '朋友', story: '带回来的礼物', receivedAt: now }] }, gift.id, now + 1);
    assert.equal(state.gifts[0].fedAt, now + 1);
  }
  for (const gift of toys) {
    const state = feedGift({ ...sample(), gifts: [{ ...gift, animal: '朋友', story: '带回来的礼物', receivedAt: now }] }, gift.id, now + 1);
    assert.equal(state.gifts[0].fedAt, undefined);
  }
});
test('developer gift injection appends a unique persisted gift that can be favorited and fed', () => {
  const existing = { id: 'existing', emoji: '🌸', item: '花瓣', animal: '蝴蝶', story: '原来的故事', receivedAt: now };
  const original = { ...sample(), gifts: [existing] };
  const created = injectTestGift(original, { emoji: '🍌', item: '测试香蕉', animal: '测试猴子', story: '这是开发环境注入的香蕉。' }, now + 1, () => 'dev-gift-1');
  assert.equal(original.gifts.length, 1);
  assert.equal(created.gifts.length, 2);
  assert.deepEqual(created.gifts[0], existing);
  assert.equal(created.gifts[1].receivedAt, now + 1);
  const favorited = favoriteGift(created, 'dev-gift-1');
  assert.equal(favorited.gifts[1].favorite, true);
  const fed = feedGift(favorited, 'dev-gift-1', now + 2);
  assert.equal(fed.gifts[1].fedAt, now + 2);
  assert.equal(fed.gifts[1].story, '这是开发环境注入的香蕉。');
});
test('developer gift injection rejects missing, overlong and colliding input without mutating prior gifts', () => {
  const original = { ...sample(), gifts: [{ id: 'occupied', emoji: '🌰', item: '松果', animal: '松鼠', story: '已有', receivedAt: now }] };
  const valid = { emoji: '🥕', item: '胡萝卜', animal: '兔子', story: '兔子送来的胡萝卜。' };
  assert.throws(() => injectTestGift(original, { ...valid, item: '  ' }, now, () => 'new-id'), /物品名称/);
  assert.throws(() => injectTestGift(original, { ...valid, story: '故事'.repeat(151) }, now, () => 'new-id'), /礼物故事/);
  assert.throws(() => injectTestGift(original, valid, now, () => 'occupied'), /编号重复/);
  assert.equal(original.gifts.length, 1);
  assert.equal(original.gifts[0].id, 'occupied');
});
test('local chat/draft/name/trip survive reload; broken state is not overwritten', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
  const state = { ...beginTrip(sample(), now, () => 0), draft: '没发完的话', draftPhoto: 'data:image/jpeg;base64,local' };
  writeState(storage, state); assert.deepEqual(readState(storage), state);
  memory.set(COMPANION_KEY, 'broken');
  assert.throws(() => readState(storage)); assert.equal(memory.get(COMPANION_KEY), 'broken');
});
