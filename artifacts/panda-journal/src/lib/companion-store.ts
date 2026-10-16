import type { CompanionInput, CompanionResponse } from '@workspace/api-client-react';
import type { ChatMessage, CompanionState, DiaryMemory, Gift, PerformanceAction } from './companion-types';

export const COMPANION_KEY = 'little-panda-companion-v1';
export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export const PROACTIVE_LIMIT = 4;
export const GIFT_DROP_MS = 1800;
export const canFeedGift = (gift: Gift) => ['🍌', '🥕', '🐟', '🍬'].includes(gift.emoji);
export function startGiftDrop(state: CompanionState, giftId: string, now = Date.now()): CompanionState {
  return state.pendingGift?.id === giftId && !state.giftDropStartedAt
    ? { ...state, giftDropStartedAt: now } : state;
}
export function collectGift(state: CompanionState, giftId: string, now = Date.now()): CompanionState {
  if (!state.pendingGift || state.pendingGift.id !== giftId || !state.giftDropStartedAt
    || now < state.giftDropStartedAt + GIFT_DROP_MS) return state;
  return { ...state, pendingGift: undefined, giftDropStartedAt: undefined,
    gifts: state.gifts.some(g => g.id === giftId) ? state.gifts : [...state.gifts, { ...state.pendingGift, receivedAt: now }],
    nextTripAt: now + tripDelay() };
}
export function favoriteGift(state: CompanionState, giftId: string): CompanionState {
  return { ...state, gifts: state.gifts.map(g => g.id === giftId ? { ...g, favorite: !g.favorite } : g) };
}
export function feedGift(state: CompanionState, giftId: string, now = Date.now()): CompanionState {
  const gift = state.gifts.find(g => g.id === giftId);
  if (!gift || gift.fedAt || !canFeedGift(gift)) return state;
  return { ...state, gifts: state.gifts.map(g => g.id === giftId ? { ...g, fedAt: now } : g),
    messages: [...state.messages, assistant(`唔，${state.userName ? state.userName + '，' : ''}${gift.item}收到啦，小熊猫咔嚓咔嚓吃掉啦。（它开心地嚼了嚼，蹭蹭你）`, 'event', now)] };
}
export const ACTIONS: PerformanceAction[] = ['bamboo', 'jump', 'somersault', 'tail', 'cuddle'];
export const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export function localDay(now: number) { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
export const idleDelay = (random = Math.random) => (5 + random() * 5) * MINUTE;
export const tripDelay = (random = Math.random) => (20 + random() * 20) * MINUTE;
export function initialState(now = Date.now()): CompanionState {
  return { version: 1, messages: [], diary: [], gifts: [], userName: '', draft: '',
    lastUserAt: now, nextIdleAt: now + idleDelay(), proactiveDay: localDay(now),
    proactiveCount: 0, nextTripAt: now + tripDelay() };
}
export function readState(storage: Pick<Storage, 'getItem'>, now = Date.now()): CompanionState {
  const raw = storage.getItem(COMPANION_KEY);
  if (!raw) return initialState(now);
  const value = JSON.parse(raw) as CompanionState;
  if (value.version !== 1 || !Array.isArray(value.messages) || !Array.isArray(value.diary) || !Array.isArray(value.gifts)
    || typeof value.userName !== 'string' || typeof value.draft !== 'string'
    || ![value.lastUserAt, value.nextIdleAt, value.proactiveCount, value.nextTripAt].every(Number.isFinite)
    || value.messages.some(m => !m || typeof m.id !== 'string' || !['user', 'assistant'].includes(m.role)
      || typeof m.text !== 'string' || !Number.isFinite(m.createdAt))
    || value.diary.some(m => !m || !['worry', 'idea', 'action'].includes(m.kind) || typeof m.text !== 'string' || !Number.isFinite(m.createdAt))) {
    throw new Error('本机聊天记录暂时无法读取；没有覆盖原记录。');
  }
  return value;
}
export function writeState(storage: Pick<Storage, 'setItem'>, state: CompanionState) {
  storage.setItem(COMPANION_KEY, JSON.stringify(state));
}
export type TestGiftInput = Pick<Gift, 'emoji' | 'item' | 'animal' | 'story'>;
export function injectTestGift(
  state: CompanionState,
  input: TestGiftInput,
  now = Date.now(),
  makeId: () => string = id,
): CompanionState {
  const normalize = (value: string, label: string, maxLength: number) => {
    const text = value.trim();
    if (!text) throw new Error(`请填写${label}。`);
    if (Array.from(text).length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符。`);
    return text;
  };
  const emoji = normalize(input.emoji, '礼物 emoji', 12);
  const item = normalize(input.item, '物品名称', 40);
  const animal = normalize(input.animal, '来源动物', 40);
  const story = normalize(input.story, '礼物故事', 300);
  const giftId = makeId();
  if (!giftId || state.gifts.some(gift => gift.id === giftId)
    || state.pendingGift?.id === giftId || state.trip?.gift.id === giftId) {
    throw new Error('新礼物编号重复了，请再试一次。');
  }
  const gift: Gift = { id: giftId, emoji, item, animal, story, receivedAt: now };
  return { ...state, gifts: [...state.gifts, gift] };
}
export function markPendingInterrupted(state: CompanionState): CompanionState {
  let changed = false;
  const messages = state.messages.map(message => {
    if (message.role !== 'user' || message.status !== 'pending') return message;
    changed = true;
    return { ...message, status: 'interrupted' as const, failureReason: undefined };
  });
  return changed ? { ...state, messages } : state;
}
export function assistant(text: string, kind: ChatMessage['kind'] = 'chat', now = Date.now()): ChatMessage {
  return { id: id(), role: 'assistant', text, kind, createdAt: now, status: 'sent' };
}
export function contextFor(state: CompanionState, messageId: string): CompanionInput {
  const index = state.messages.findIndex(m => m.id === messageId);
  if (index < 0 || state.messages[index].role !== 'user') throw new Error('没有找到要回复的消息。');
  return {
    messages: state.messages.slice(0, index + 1).filter(m => m.text.trim()).slice(-40).map(m => ({ role: m.role, content: m.text })),
    userName: state.userName,
    memories: state.diary.slice(-24).map(m => ({ kind: m.kind, text: m.text })),
  };
}
export function receiveReply(state: CompanionState, messageId: string, response: CompanionResponse, now = Date.now()): CompanionState {
  const source = state.messages.find(m => m.id === messageId);
  if (!source) throw new Error('原消息暂时无法读取。');
  const diary = [...state.diary];
  for (const m of response.memories) {
    const text = m.text.trim();
    if (!diary.some(old => old.kind === m.kind && old.text.replace(/\s/g, '') === text.replace(/\s/g, ''))) {
      diary.push({ id: id(), kind: m.kind, text, createdAt: source.createdAt, sourceMessageId: source.id });
    }
  }
  return { ...state, diary, userName: response.userName || state.userName,
    messages: [...state.messages.map(m => m.id === messageId ? { ...m, status: 'sent' as const } : m), assistant(response.reply, 'chat', now)] };
}
export function overdueMemory(state: CompanionState, now: number): DiaryMemory | undefined {
  if (state.privateQuestionsPaused) return undefined;
  return state.diary.find(m => !m.followedUpAt && now >= m.createdAt + 2 * DAY);
}
export function waitingForAnswer(state: CompanionState): boolean {
  // Derive this from persisted history, so reloads, midnight and pet events
  // cannot accidentally clear an unanswered invitation.
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.role === 'user') return false;
    if (m.role === 'assistant' && m.kind !== 'event' && /[？?]/.test(m.text)) return true;
  }
  return false;
}
export function recordUserMessage(state: CompanionState, message: ChatMessage): CompanionState {
  const refuses = /不想说|不愿意说|不想聊|不聊这个|别问|不要问|不方便说|暂时不说|不说了|不想告诉/.test(message.text);
  const optsIn = /(?:现在|这次|其实)?(?:想说了|愿意说了|可以问|愿意聊心事|愿意聊私事)/.test(message.text);
  return { ...state, messages: [...state.messages, message], draft: '', draftPhoto: undefined,
    privateQuestionsPaused: refuses ? true : optsIn ? false : state.privateQuestionsPaused,
    lastUserAt: message.createdAt, nextIdleAt: message.createdAt + idleDelay() };
}
export function welcome(state: CompanionState, now = Date.now()): CompanionState {
  const current = state.proactiveDay === localDay(now) ? state : { ...state, proactiveDay: localDay(now), proactiveCount: 0 };
  const due = !waitingForAnswer(current) && current.proactiveCount < PROACTIVE_LIMIT ? overdueMemory(current, now) : undefined;
  const name = state.userName ? `${state.userName}，` : '';
  const text = due
    ? `唔，${name}你上次说的「${due.text.slice(0, 100)}」，后来怎么样啦？（它轻轻靠过来）`
    : `诶，${name}回来啦，小熊猫在这儿陪着你哦。（它轻轻挪出一个位置）`;
  return { ...current, proactiveCount: current.proactiveCount + (due ? 1 : 0),
    messages: [...state.messages, assistant(text, due ? 'followup' : 'welcome', now)],
    diary: state.diary.map(m => m.id === due?.id ? { ...m, followedUpAt: now } : m) };
}
export function performancePlan(random = Math.random) {
  const action = ACTIONS[Math.min(ACTIONS.length - 1, Math.floor(random() * ACTIONS.length))];
  const duration = 2000 + random() * 3000;
  const drops = ['jump', 'somersault'].includes(action) && random() < 0.1;
  return { action, duration, drops };
}
const souvenirs = [
  { emoji: '🍌', item: '香蕉', animal: '猴子' }, { emoji: '🥕', item: '胡萝卜', animal: '兔子' },
  { emoji: '🌰', item: '松果', animal: '松鼠' }, { emoji: '🐟', item: '小鱼', animal: '小猫' },
  { emoji: '🍬', item: '糖果', animal: '老爷爷' }, { emoji: '🌸', item: '花瓣', animal: '蝴蝶' },
];
export function beginTrip(state: CompanionState, now = Date.now(), random = Math.random): CompanionState {
  const pick = souvenirs[Math.min(souvenirs.length - 1, Math.floor(random() * souvenirs.length))];
  const gift: Omit<Gift, 'receivedAt'> = { ...pick, id: id(),
    story: `唔，小熊猫遇到了${pick.animal}，${pick.animal}送给小熊猫${pick.item}，给${state.userName || '你'}呀。（它把${pick.item}捧过来）` };
  return { ...state, trip: { id: gift.id, gift, returnAt: now + 30_000 + random() * 90_000 },
    messages: [...state.messages, assistant(`诶，${state.userName ? state.userName + '，' : ''}小熊猫出去逛一圈，一会儿回来哦。（它轻轻挥挥爪子）`, 'event', now)] };
}
export function tickCompanion(state: CompanionState, now: number, random = Math.random): {
  state: CompanionState; event?: 'proactive' | 'departure' | 'gift'; text?: string;
} {
  let next = state.proactiveDay === localDay(now) ? state : { ...state, proactiveDay: localDay(now), proactiveCount: 0 };
  if (next.trip && now >= next.trip.returnAt) {
    const gift: Gift = { ...next.trip.gift, receivedAt: now };
    next = { ...next, trip: undefined, nextTripAt: now + tripDelay(random),
      pendingGift: gift, giftDropStartedAt: undefined,
      messages: [...next.messages, assistant(gift.story, 'event', now)] };
    return { state: next, event: 'gift', text: gift.story };
  }
  if (next.trip) return { state: next };
  if (next.pendingGift) {
    next = collectGift(next, next.pendingGift.id, now);
  }
  if (now >= next.nextIdleAt && now - next.lastUserAt >= 5 * MINUTE
    && next.proactiveCount < PROACTIVE_LIMIT && !waitingForAnswer(next)) {
    const name = next.userName ? `${next.userName}，` : '';
    const due = overdueMemory(next, now);
    const caring = [
      '今天有没有什么开心的小事，想和小熊猫分享一下呀？',
      '最近有没有什么好玩的事情，愿意说给小熊猫听听呢？',
      '有没有什么事情，想和小熊猫分享一下嘛？',
      '今天心情怎么样，愿意让小熊猫听听呀？',
      '最近有没有吃到什么好吃的，想和小熊猫说说呢？',
      '今天有没有看到什么好看的，想和小熊猫分享一下嘛？',
      '今天有没有对自己好一点，愿意说说呀？',
    ];
    const privateQuestions = [
      '最近有没有什么难过的事，愿意和小熊猫说说呀？',
      '有没有不方便和别人说的事，愿意让小熊猫陪着听听呢？',
      '有没有什么心事，愿意和小熊猫分享一点嘛？',
      '最近有没有让你觉得有压力的事，愿意说说呀？',
      '有没有藏在心里很久的事，愿意让小熊猫听听呢？',
      '最近是真的开心，还是也有不开心的时候，愿意说说嘛？',
      '有没有想做但还没敢做的事，愿意和小熊猫说说呀？',
      '有没有对自己失望的时候，愿意让小熊猫陪着听听呢？',
      '最近睡得怎么样，愿意和小熊猫说说嘛？',
      '最近有没有很累却没说的时候，愿意说给小熊猫听听呀？',
    ];
    const choices = !next.privateQuestionsPaused && next.proactiveCount % 2 === 1 ? privateQuestions : caring;
    const last = [...next.messages].reverse().find(m => m.kind === 'proactive')?.text;
    const available = choices.filter(question => !last?.includes(question));
    const question = available[Math.min(available.length - 1, Math.floor(random() * available.length))];
    const text = due ? `唔，${name}你上次说的「${due.text.slice(0, 100)}」，后来怎么样啦？（它轻轻靠过来）`
      : `唔，${name}${question}${next.proactiveCount % 3 === 2 ? '🐾' : ''}（它安静地靠过来，抬头看你）`;
    next = { ...next, proactiveCount: next.proactiveCount + 1, nextIdleAt: now + idleDelay(random),
      diary: next.diary.map(m => m.id === due?.id ? { ...m, followedUpAt: now } : m),
      messages: [...next.messages, assistant(text, due ? 'followup' : 'proactive', now)] };
    return { state: next, event: 'proactive', text };
  }
  if (!next.pendingGift && now >= next.nextTripAt && now - next.lastUserAt >= MINUTE) {
    next = beginTrip(next, now, random);
    return { state: next, event: 'departure', text: next.messages.at(-1)!.text };
  }
  return { state: next };
}
