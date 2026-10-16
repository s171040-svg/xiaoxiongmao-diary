import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, initialState, idleDelay, localDay, performancePlan, contextFor, receiveReply, recordUserMessage, waitingForAnswer, tickCompanion, welcome, beginTrip, startGiftDrop, collectGift, feedGift, favoriteGift, injectTestGift, markPendingInterrupted, GIFT_DROP_MS, DAY, MINUTE, COMPANION_KEY, readState, writeState } from './companion-store';
import type { CompanionState } from './companion-types';

const now = new Date(2026, 9, 8, 12).getTime();
function sample(): CompanionState {
  return { ...initialState(now), userName: '小乐', nextIdleAt: now + 5 * MINUTE, nextTripAt: now + 40 * MINUTE,
    messages: [{ id: 'user1', role: 'user', text: '我叫小乐，唱歌唱了很久，有点累，明天还要排练。', createdAt: now, status: 'pending' }] };
}
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
test('five performance choices exclude rolling and only jumps can fall at ten percent', () => {
  assert.deepEqual(ACTIONS, ['bamboo', 'jump', 'somersault', 'tail', 'cuddle']);
  for (let i = 0; i < ACTIONS.length; i++) {
    const values = [i / ACTIONS.length + 0.01, 0.5, 0.099];
    const plan = performancePlan(() => values.shift() ?? 0);
    assert.equal(plan.duration, 3500);
    assert.equal(plan.drops, ['jump', 'somersault'].includes(plan.action));
  }
  const values = [1 / ACTIONS.length + 0.01, 0, 0.1];
  assert.equal(performancePlan(() => values.shift() ?? 0).drops, false);
});
test('excursions take thirty to one hundred twenty seconds and gift settlement is durable and one-time', () => {
  for (const value of [0, 1]) {
    const state = beginTrip(sample(), now, () => value);
    assert.equal(state.trip!.returnAt - now, 30_000 + value * 90_000);
    const pending = tickCompanion(state, state.trip!.returnAt - 1, () => 0);
    assert.equal(pending.state.gifts.length, 0);
    const back = tickCompanion(pending.state, state.trip!.returnAt, () => 0);
    assert.equal(back.event, 'gift'); assert.equal(back.state.gifts.length, 0);
    assert.match(back.state.pendingGift!.story, /给小乐/);
    const clicked = startGiftDrop(back.state, back.state.pendingGift!.id, state.trip!.returnAt);
    assert.equal(collectGift(clicked, clicked.pendingGift!.id, state.trip!.returnAt + GIFT_DROP_MS - 1).gifts.length, 0);
    const stored = collectGift(clicked, clicked.pendingGift!.id, state.trip!.returnAt + GIFT_DROP_MS);
    assert.equal(stored.gifts.length, 1);
    assert.equal(collectGift(stored, clicked.pendingGift!.id, state.trip!.returnAt + GIFT_DROP_MS + 1).gifts.length, 1);
  }
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
  state = feedGift(state, gift.id, now + 1);
  assert.equal(state.gifts[0].fedAt, now + 1);
  const once = state.messages.length;
  state = feedGift(state, gift.id, now + 2);
  assert.equal(state.messages.length, once); assert.equal(state.gifts[0].story, gift.story);
  const flower = { ...gift, id: 'flower', emoji: '🌸' };
  assert.equal(feedGift({ ...state, gifts: [flower] }, 'flower', now).gifts[0].fedAt, undefined);
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
