import type { CompanionInput, CompanionResponse } from '@workspace/api-client-react';
import type { CareStatCategory, CareStats, ChatMessage, CompanionState, DiaryMemory, Gift, PendingCareStatInteraction, PerformanceAction, SharedCareStats, SpacePoliceLetter, SpacePoop } from './companion-types';

export const COMPANION_KEY = 'little-panda-companion-v1';
export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export const PROACTIVE_LIMIT = 4;
export const GIFT_DROP_MS = 1800;
export const CAPTURED_TRIP_CHANCE = 0.1;
export const CAPTURED_TRIP_EXTRA_MS = 2 * MINUTE;
export const CAPTURED_HOMECOMING_DURATION_MS = 8000;
export const SPACE_POLICE_LETTER_EAT_DELAY_MS = 5 * MINUTE;
export const CARE_STAT_DECAY_INTERVAL_MS = 6 * 60 * MINUTE;
export const canFeedGift = (gift: Gift) => ['🍌', '🥕', '🐟', '🍬', '🍓', '🍪', '🎋'].includes(gift.emoji);
const FEED_ACTION_BY_EMOJI: Record<string, PerformanceAction> = {
  '🍌': 'eat-banana',
  '🥕': 'eat-carrot',
  '🐟': 'eat-fish',
  '🍬': 'eat-candy',
  '🍓': 'eat-strawberry',
  '🍪': 'eat-cookie',
  '🎋': 'eat-bamboo',
};
export const feedActionForGift = (gift: Gift): PerformanceAction | undefined =>
  canFeedGift(gift) ? FEED_ACTION_BY_EMOJI[gift.emoji] : undefined;
const CARE_STAT_CATEGORIES: CareStatCategory[] = ['health', 'bond', 'growth'];

export function initialCareStats(now = Date.now()): CareStats {
  return {
    growth: 50,
    health: 50,
    bond: 50,
    hunger: 100,
    hungerUpdatedAt: now,
    lastInteractionAt: now,
    lastDecayAt: now,
    revision: 0,
    lastInteractionCategory: 'growth',
    recentInteractionIds: [],
  };
}

export function normalizeCareStats(stats: SharedCareStats, hungerUpdatedAtFallback = stats.lastInteractionAt): CareStats {
  return {
    ...stats,
    hunger: stats.hunger ?? 100,
    hungerUpdatedAt: stats.hungerUpdatedAt ?? hungerUpdatedAtFallback,
  };
}

function validCareStats(value: unknown): value is CareStats {
  if (!value || typeof value !== 'object') return false;
  const stats = value as CareStats;
  return [stats.growth, stats.health, stats.bond].every(item => Number.isInteger(item) && item >= 0 && item <= 100)
    && (stats.hunger === undefined || (Number.isInteger(stats.hunger) && stats.hunger >= 0 && stats.hunger <= 100))
    && (stats.hungerUpdatedAt === undefined || (Number.isSafeInteger(stats.hungerUpdatedAt) && stats.hungerUpdatedAt >= 0))
    && [stats.lastInteractionAt, stats.lastDecayAt, stats.revision].every(item => Number.isSafeInteger(item) && item >= 0)
    && CARE_STAT_CATEGORIES.includes(stats.lastInteractionCategory)
    && Array.isArray(stats.recentInteractionIds)
    && stats.recentInteractionIds.length <= 128
    && stats.recentInteractionIds.every(item => typeof item === 'string' && item.length > 0 && item.length <= 80);
}

export function adjustHungerState(state: CompanionState, amount: number, now = Date.now()): CompanionState {
  if (!Number.isSafeInteger(amount)) throw new Error('饥饿值变化必须是整数。');
  const currentHunger = state.careStats.hunger ?? 100;
  const hunger = Math.max(0, Math.min(100, currentHunger + amount));
  if (hunger === currentHunger) return state;
  return {
    ...state,
    careStats: { ...state.careStats, hunger, hungerUpdatedAt: now },
  };
}

export function decayCareStats(stats: CareStats, now = Date.now()): CareStats {
  const lastInteractionAt = Math.min(stats.lastInteractionAt, now);
  const lastDecayAt = Math.min(stats.lastDecayAt, now);
  const elapsedSteps = Math.floor(Math.max(0, now - lastInteractionAt) / CARE_STAT_DECAY_INTERVAL_MS);
  const appliedSteps = Math.floor(Math.max(0, lastDecayAt - lastInteractionAt) / CARE_STAT_DECAY_INTERVAL_MS);
  const steps = Math.max(0, elapsedSteps - appliedSteps);
  if (!steps && lastInteractionAt === stats.lastInteractionAt && lastDecayAt === stats.lastDecayAt) return stats;
  return {
    ...stats,
    growth: Math.max(0, stats.growth - steps),
    health: Math.max(0, stats.health - steps),
    bond: Math.max(0, stats.bond - steps),
    lastInteractionAt,
    lastDecayAt: Math.min(now, lastDecayAt + steps * CARE_STAT_DECAY_INTERVAL_MS),
  };
}

function applyCareStatGain(
  stats: CareStats,
  category: CareStatCategory,
  interactionId: string,
  occurredAt: number,
): CareStats {
  if (stats.recentInteractionIds.includes(interactionId)) return stats;
  const at = Math.max(stats.lastInteractionAt, occurredAt);
  const decayed = decayCareStats(stats, at);
  return {
    ...decayed,
    growth: Math.min(100, decayed.growth + 1),
    health: category === 'health' ? Math.min(100, decayed.health + 1) : decayed.health,
    bond: category === 'bond' ? Math.min(100, decayed.bond + 1) : decayed.bond,
    lastInteractionAt: at,
    lastDecayAt: at,
    lastInteractionCategory: category,
    recentInteractionIds: [...decayed.recentInteractionIds, interactionId].slice(-128),
  };
}

function replayPendingCareInteractions(stats: CareStats, pending: PendingCareStatInteraction[]): CareStats {
  return pending.reduce(
    (current, interaction) => applyCareStatGain(current, interaction.category, interaction.interactionId, interaction.occurredAt),
    stats,
  );
}

export function recordCareStatInteraction(
  state: CompanionState,
  category: CareStatCategory,
  now = Date.now(),
  interactionId = id(),
): CompanionState {
  if (state.careStats.recentInteractionIds.includes(interactionId)
    || state.pendingCareStatInteractions.some(item => item.interactionId === interactionId)) return state;
  const pending: PendingCareStatInteraction = { interactionId, category, occurredAt: now };
  return {
    ...state,
    careStats: applyCareStatGain(state.careStats, category, interactionId, now),
    pendingCareStatInteractions: [...state.pendingCareStatInteractions, pending],
  };
}

export function mergeSharedCareStats(state: CompanionState, sharedStats: SharedCareStats): CompanionState {
  const current = state.careStats;
  const useLocal = current.revision > sharedStats.revision
    || (current.revision === sharedStats.revision && (
      current.lastInteractionAt > sharedStats.lastInteractionAt
      || (current.lastInteractionAt === sharedStats.lastInteractionAt && current.lastDecayAt > sharedStats.lastDecayAt)
    ));
  const base = useLocal ? current : sharedStats;
  const hungerSource = normalizeCareStats(
    (current.hungerUpdatedAt ?? 0) > (sharedStats.hungerUpdatedAt ?? 0) ? current : sharedStats,
  );
  const merged = { ...base, hunger: hungerSource.hunger, hungerUpdatedAt: hungerSource.hungerUpdatedAt };
  return { ...state, careStats: replayPendingCareInteractions(merged, state.pendingCareStatInteractions) };
}

export function acknowledgeCareStatInteraction(
  state: CompanionState,
  interactionId: string,
  sharedStats: SharedCareStats,
): CompanionState {
  const pending = state.pendingCareStatInteractions.filter(item => item.interactionId !== interactionId);
  const hungerSource = normalizeCareStats(
    (state.careStats.hungerUpdatedAt ?? 0) > (sharedStats.hungerUpdatedAt ?? 0)
      ? state.careStats
      : sharedStats,
  );
  const merged = { ...sharedStats, hunger: hungerSource.hunger, hungerUpdatedAt: hungerSource.hungerUpdatedAt };
  return {
    ...state,
    pendingCareStatInteractions: pending,
    careStats: replayPendingCareInteractions(merged, pending),
  };
}

export function clearPendingCareStatInteractions(state: CompanionState): CompanionState {
  return state.pendingCareStatInteractions.length
    ? { ...state, pendingCareStatInteractions: [] }
    : state;
}

export function decayCareStatState(state: CompanionState, now = Date.now()): CompanionState {
  const careStats = decayCareStats(state.careStats, now);
  return careStats === state.careStats ? state : { ...state, careStats };
}

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
  const fedState = adjustHungerState(state, 1, now);
  return { ...fedState, gifts: fedState.gifts.map(g => g.id === giftId ? { ...g, fedAt: now } : g),
    messages: [...fedState.messages, assistant(`唔，${fedState.userName ? fedState.userName + '，' : ''}${gift.item}收到啦，小熊猫咔嚓咔嚓吃掉啦。（它开心地嚼了嚼，蹭蹭你）`, 'event', now)] };
}
export const ACTIONS: PerformanceAction[] = ['bamboo', 'jump', 'somersault', 'tail'];
export const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export function localDay(now: number) { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
export const idleDelay = (random = Math.random) => (5 + random() * 5) * MINUTE;
export const tripDelay = (random = Math.random) => (20 + random() * 20) * MINUTE;
export function initialState(now = Date.now()): CompanionState {
  return { version: 1, messages: [], diary: [], gifts: [], userName: '', draft: '',
    spacePoliceLetters: [], lastUserAt: now, nextIdleAt: now + idleDelay(), proactiveDay: localDay(now),
    proactiveCount: 0, nextTripAt: now + tripDelay(),
    careStats: initialCareStats(now), pendingCareStatInteractions: [] };
}
export function readState(storage: Pick<Storage, 'getItem'>, now = Date.now()): CompanionState {
  const raw = storage.getItem(COMPANION_KEY);
  if (!raw) return initialState(now);
  const value = JSON.parse(raw) as CompanionState;
  const invalidSpacePoop = (poop: SpacePoop) => !poop
    || !['pending', 'fresh', 'bagged', 'disposing', 'disposed'].includes(poop.phase)
    || (poop.phase !== 'pending' && (!Number.isFinite(poop.x) || !Number.isFinite(poop.y)
      || poop.x! < 0 || poop.x! > 1 || poop.y! < 0 || poop.y! > 1))
    || (poop.packedAt !== undefined && !Number.isFinite(poop.packedAt))
    || (poop.disposedAt !== undefined && !Number.isFinite(poop.disposedAt));
  const invalidSpacePoliceLetter = (letter: SpacePoliceLetter) => !letter || typeof letter.id !== 'string'
    || !Number.isFinite(letter.deliveredAt)
    || (letter.openedAt !== undefined && !Number.isFinite(letter.openedAt))
    || (letter.filedAt !== undefined && !Number.isFinite(letter.filedAt))
    || (letter.eatenAt !== undefined && !Number.isFinite(letter.eatenAt))
    || (letter.eatAfterAt !== undefined && !Number.isFinite(letter.eatAfterAt))
    || (letter.poop !== undefined && invalidSpacePoop(letter.poop))
    || (letter.finePayment !== undefined && (!letter.finePayment
      || !Number.isFinite(letter.finePayment.paidAt)
      || typeof letter.finePayment.giftId !== 'string'
      || typeof letter.finePayment.emoji !== 'string'
      || typeof letter.finePayment.item !== 'string'));
  if (value.version !== 1 || !Array.isArray(value.messages) || !Array.isArray(value.diary) || !Array.isArray(value.gifts)
    || typeof value.userName !== 'string' || typeof value.draft !== 'string'
    || (value.trip?.captured !== undefined && typeof value.trip.captured !== 'boolean')
    || (value.returnEvent !== undefined && (!value.returnEvent || value.returnEvent.kind !== 'captured'
      || !Number.isFinite(value.returnEvent.until)
      || (value.returnEvent.awaitingInteraction !== undefined && typeof value.returnEvent.awaitingInteraction !== 'boolean')))
    || (value.spacePoliceLetter !== undefined && (!value.spacePoliceLetter
      || !Number.isFinite(value.spacePoliceLetter.deliveredAt)
      || (value.spacePoliceLetter.openedAt !== undefined && !Number.isFinite(value.spacePoliceLetter.openedAt))
      || (value.spacePoliceLetter.filedAt !== undefined && !Number.isFinite(value.spacePoliceLetter.filedAt))
      || (value.spacePoliceLetter.eatenAt !== undefined && !Number.isFinite(value.spacePoliceLetter.eatenAt))
       || (value.spacePoliceLetter.eatAfterAt !== undefined && !Number.isFinite(value.spacePoliceLetter.eatAfterAt))
       || (value.spacePoliceLetter.poop !== undefined && invalidSpacePoop(value.spacePoliceLetter.poop))))
    || (value.spacePoliceLetters !== undefined && (!Array.isArray(value.spacePoliceLetters)
      || value.spacePoliceLetters.some(invalidSpacePoliceLetter)))
    || (value.recentGiftStories !== undefined && (!Array.isArray(value.recentGiftStories)
      || value.recentGiftStories.some(story => typeof story !== 'string')))
    || (value.careStats !== undefined && !validCareStats(value.careStats))
    || (value.pendingCareStatInteractions !== undefined && (!Array.isArray(value.pendingCareStatInteractions)
      || value.pendingCareStatInteractions.some(item => !item || typeof item.interactionId !== 'string'
        || !item.interactionId || item.interactionId.length > 80 || !CARE_STAT_CATEGORIES.includes(item.category)
        || !Number.isSafeInteger(item.occurredAt) || item.occurredAt < 0)))
    || ![value.lastUserAt, value.nextIdleAt, value.proactiveCount, value.nextTripAt].every(Number.isFinite)
    || value.messages.some(m => !m || typeof m.id !== 'string' || !['user', 'assistant'].includes(m.role)
      || typeof m.text !== 'string' || !Number.isFinite(m.createdAt))
    || value.diary.some(m => !m || !['worry', 'idea', 'action'].includes(m.kind) || typeof m.text !== 'string' || !Number.isFinite(m.createdAt))) {
    throw new Error('本机聊天记录暂时无法读取；没有覆盖原记录。');
  }
  let letters: SpacePoliceLetter[] = value.spacePoliceLetters ?? (value.spacePoliceLetter ? [{
    id: `legacy-space-police-${value.spacePoliceLetter.deliveredAt}`,
    ...value.spacePoliceLetter,
  }] : []);
  if (value.spacePoliceLetter && !letters.some(letter => letter.deliveredAt === value.spacePoliceLetter!.deliveredAt)) {
    letters = [...letters, { id: `legacy-space-police-${value.spacePoliceLetter.deliveredAt}`, ...value.spacePoliceLetter }];
  }
  letters = letters.map(letter => letter.eatenAt !== undefined && !letter.poop
    ? { ...letter, poop: { phase: 'pending' } }
    : letter);
  let activeSpacePoliceLetter = value.spacePoliceLetter;
  if (activeSpacePoliceLetter?.eatenAt !== undefined && !activeSpacePoliceLetter.poop) {
    activeSpacePoliceLetter = { ...activeSpacePoliceLetter, poop: { phase: 'pending' } };
    letters = letters.map(letter => letter.deliveredAt === activeSpacePoliceLetter!.deliveredAt
      ? { ...letter, poop: activeSpacePoliceLetter!.poop }
      : letter);
  } else if (activeSpacePoliceLetter && !activeSpacePoliceLetter.poop) {
    const archivedActive = letters.find(letter => letter.deliveredAt === activeSpacePoliceLetter!.deliveredAt);
    if (archivedActive?.poop) activeSpacePoliceLetter = { ...activeSpacePoliceLetter, poop: archivedActive.poop };
  }
  let restored: CompanionState = {
    ...value,
    careStats: normalizeCareStats(value.careStats ?? initialCareStats(now), now),
    pendingCareStatInteractions: value.pendingCareStatInteractions ?? [],
    ...(activeSpacePoliceLetter ? { spacePoliceLetter: activeSpacePoliceLetter } : {}),
    spacePoliceLetters: letters,
  };
  if (restored.returnEvent?.kind === 'captured' && restored.returnEvent.awaitingInteraction !== false && !restored.spacePoliceLetter) {
    const deliveredAt = Math.max(0, restored.returnEvent.until - CAPTURED_HOMECOMING_DURATION_MS);
    const archiveEntry: SpacePoliceLetter = { id: `legacy-space-police-${deliveredAt}`, deliveredAt };
    restored = { ...restored, spacePoliceLetter: { deliveredAt },
      spacePoliceLetters: letters.some(letter => letter.deliveredAt === deliveredAt) ? letters : [...letters, archiveEntry] };
  }
  const activeLetter = restored.spacePoliceLetter;
  if (activeLetter && activeLetter.eatAfterAt === undefined
    && activeLetter.filedAt === undefined && activeLetter.eatenAt === undefined) {
    const eatAfterAt = now + SPACE_POLICE_LETTER_EAT_DELAY_MS;
    const archive = restored.spacePoliceLetters ?? [];
    const archived = archive.some(letter => letter.deliveredAt === activeLetter.deliveredAt)
      ? archive.map(letter => letter.deliveredAt === activeLetter.deliveredAt ? { ...letter, eatAfterAt } : letter)
      : [...archive, { id: `legacy-space-police-${activeLetter.deliveredAt}`, deliveredAt: activeLetter.deliveredAt, eatAfterAt }];
    restored = { ...restored, spacePoliceLetter: { ...activeLetter, eatAfterAt }, spacePoliceLetters: archived };
  }
  return restored;
}
export function deliverSpacePoliceLetter(
  state: CompanionState,
  deliveredAt = Date.now(),
  makeId: () => string = id,
): CompanionState {
  const letterId = makeId();
  const letters = state.spacePoliceLetters ?? [];
  if (!letterId || letters.some(letter => letter.id === letterId)) throw new Error('来信编号重复了，请再试一次。');
  const eatAfterAt = deliveredAt + SPACE_POLICE_LETTER_EAT_DELAY_MS;
  return { ...state, spacePoliceLetter: { deliveredAt, eatAfterAt },
    spacePoliceLetters: [...letters, { id: letterId, deliveredAt, eatAfterAt }] };
}
export function markSpacePoliceLetterOpened(state: CompanionState, now = Date.now(), letterId?: string): CompanionState {
  const letters: SpacePoliceLetter[] = state.spacePoliceLetters ?? (state.spacePoliceLetter ? [{
    id: `legacy-space-police-${state.spacePoliceLetter.deliveredAt}`,
    ...state.spacePoliceLetter,
  }] : []);
  const letter = letterId
    ? letters.find(entry => entry.id === letterId)
    : state.spacePoliceLetter;
  if (!letter) return state;
  const archiveNeedsUpdate = letters.some(entry => (letterId ? entry.id === letterId : entry.deliveredAt === letter.deliveredAt)
    && entry.openedAt === undefined);
  const activeNeedsUpdate = state.spacePoliceLetter?.deliveredAt === letter.deliveredAt
    && state.spacePoliceLetter.openedAt === undefined;
  if (!archiveNeedsUpdate && !activeNeedsUpdate) return state;
  return {
    ...state,
    ...(activeNeedsUpdate ? { spacePoliceLetter: { ...state.spacePoliceLetter!, openedAt: now } } : {}),
    spacePoliceLetters: letters.map(entry =>
      (letterId ? entry.id === letterId : entry.deliveredAt === letter.deliveredAt)
        ? { ...entry, openedAt: entry.openedAt ?? now }
        : entry),
  };
}
export function fileSpacePoliceLetter(state: CompanionState, deliveredAt: number, now = Date.now()): CompanionState {
  const activeLetter = state.spacePoliceLetter;
  if (!activeLetter || activeLetter.deliveredAt !== deliveredAt
    || activeLetter.filedAt !== undefined || activeLetter.eatenAt !== undefined) return state;
  const letters = state.spacePoliceLetters ?? [];
  const archived = letters.some(letter => letter.deliveredAt === deliveredAt)
    ? letters.map(letter => letter.deliveredAt === deliveredAt
      ? { ...letter, openedAt: letter.openedAt ?? now, filedAt: now }
      : letter)
    : [...letters, { id: `legacy-space-police-${deliveredAt}`, deliveredAt, openedAt: now, filedAt: now, eatAfterAt: activeLetter.eatAfterAt }];
  return {
    ...state,
    spacePoliceLetter: { ...activeLetter, openedAt: activeLetter.openedAt ?? now, filedAt: now },
    spacePoliceLetters: archived,
  };
}
export function eatSpacePoliceLetter(state: CompanionState, deliveredAt: number, now = Date.now()): CompanionState {
  const activeLetter = state.spacePoliceLetter;
  if (!activeLetter || activeLetter.deliveredAt !== deliveredAt
    || activeLetter.filedAt !== undefined || activeLetter.eatenAt !== undefined) return state;
  const letters = state.spacePoliceLetters ?? [];
  const archived = letters.some(letter => letter.deliveredAt === deliveredAt)
    ? letters.map(letter => letter.deliveredAt === deliveredAt ? { ...letter, eatenAt: now, poop: { phase: 'pending' as const } } : letter)
    : [...letters, { id: `legacy-space-police-${deliveredAt}`, deliveredAt, eatenAt: now, eatAfterAt: activeLetter.eatAfterAt, poop: { phase: 'pending' as const } }];
  return {
    ...state,
    spacePoliceLetter: { ...activeLetter, eatenAt: now, poop: { phase: 'pending' } },
    spacePoliceLetters: archived,
    messages: [...state.messages, assistant('唔……小熊猫太好奇，把信封吃掉了。肚子咕噜咕噜的，拉肚子了。', 'event', now)],
  };
}
function updateSpacePolicePoop(
  state: CompanionState,
  deliveredAt: number,
  update: (poop: SpacePoop) => SpacePoop,
): CompanionState {
  const source = state.spacePoliceLetters ?? (state.spacePoliceLetter ? [{
    id: `legacy-space-police-${state.spacePoliceLetter.deliveredAt}`,
    ...state.spacePoliceLetter,
  }] : []);
  const letter = source.find(entry => entry.deliveredAt === deliveredAt);
  if (!letter?.poop) return state;
  const poop = update(letter.poop);
  if (poop === letter.poop) return state;
  const spacePoliceLetters = source.map(entry => entry.deliveredAt === deliveredAt ? { ...entry, poop } : entry);
  return {
    ...state,
    spacePoliceLetters,
    ...(state.spacePoliceLetter?.deliveredAt === deliveredAt
      ? { spacePoliceLetter: { ...state.spacePoliceLetter, poop } }
      : {}),
  };
}
const clampRoomRatio = (value: number) => Math.max(0.02, Math.min(0.98, value));
export function placeSpacePolicePoop(state: CompanionState, deliveredAt: number, x: number, y: number): CompanionState {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return state;
  return updateSpacePolicePoop(state, deliveredAt, poop => poop.phase === 'pending'
    ? { phase: 'fresh', x: clampRoomRatio(x), y: clampRoomRatio(y) }
    : poop);
}
export function packSpacePolicePoop(state: CompanionState, deliveredAt: number, now = Date.now()): CompanionState {
  return updateSpacePolicePoop(state, deliveredAt, poop => poop.phase === 'fresh'
    ? { ...poop, phase: 'bagged', packedAt: now }
    : poop);
}
export function moveSpacePolicePoopBag(state: CompanionState, deliveredAt: number, x: number, y: number): CompanionState {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return state;
  return updateSpacePolicePoop(state, deliveredAt, poop => poop.phase === 'bagged'
    ? { ...poop, x: clampRoomRatio(x), y: clampRoomRatio(y) }
    : poop);
}
export function disposeSpacePolicePoopBag(
  state: CompanionState,
  deliveredAt: number,
  x: number,
  y: number,
  now = Date.now(),
): CompanionState {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return state;
  return updateSpacePolicePoop(state, deliveredAt, poop => poop.phase === 'bagged'
    ? { ...poop, phase: 'disposing', x: clampRoomRatio(x), y: clampRoomRatio(y), disposedAt: now }
    : poop);
}
export function finishSpacePolicePoopDisposal(state: CompanionState, deliveredAt: number): CompanionState {
  return updateSpacePolicePoop(state, deliveredAt, poop => poop.phase === 'disposing'
    ? { ...poop, phase: 'disposed' }
    : poop);
}
export function paySpacePoliceFine(
  state: CompanionState,
  letterId: string,
  giftId: string,
  now = Date.now(),
): CompanionState {
  const letters = state.spacePoliceLetters ?? [];
  const letter = letters.find(entry => entry.id === letterId);
  const gift = state.gifts.find(entry => entry.id === giftId);
  if (!letter || letter.finePayment || !gift) return state;
  const finePayment = { paidAt: now, giftId: gift.id, emoji: gift.emoji, item: gift.item };
  return {
    ...state,
    gifts: state.gifts.filter(entry => entry.id !== giftId),
    spacePoliceLetters: letters.map(entry => entry.id === letterId ? { ...entry, finePayment } : entry),
  };
}
export function writeState(storage: Pick<Storage, 'setItem'>, state: CompanionState) {
  storage.setItem(COMPANION_KEY, JSON.stringify(state));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('panda-care-stats-updated'));
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
export function performancePlan(random = Math.random, allowWorldFall = true) {
  const action = ACTIONS[Math.min(ACTIONS.length - 1, Math.floor(random() * ACTIONS.length))];
  const duration = 2000 + random() * 3000;
  const drops = allowWorldFall && ['jump', 'somersault'].includes(action) && random() < 0.1;
  return { action, duration, drops };
}
const souvenirs = [
  { emoji: '🍌', item: '香蕉', animal: '猴子', stories: [
    '猴子在树梢发现一串熟香蕉，挑了最香的一根分给小熊猫。小熊猫一路捧回来，想先给你看看。',
    '小熊猫和猴子在林边歇脚，猴子把藏好的香蕉拿出来分享，还拜托小熊猫替它问你一声好。',
    '猴子荡到树下时，递给小熊猫一根金黄的香蕉，说这是今天找到的最好吃的一根，想让你也收下。',
  ] },
  { emoji: '🥕', item: '胡萝卜', animal: '兔子', stories: [
    '兔子在菜地边拔出一根脆脆的胡萝卜，分给路过的小熊猫。小熊猫把它抱稳了，带回来送给你。',
    '小熊猫陪兔子找了半天胡萝卜，最后找到一根又直又漂亮的，兔子笑着把它交给小熊猫带回来。',
    '兔子刚收好一篮胡萝卜，就挑出最鲜嫩的一根送给小熊猫，说想和你分享今天的收获。',
  ] },
  { emoji: '🌰', item: '松果', animal: '松鼠', stories: [
    '松鼠在松针堆里找到一颗完整的大松果，仔细擦干净后送给小熊猫。小熊猫把这份森林小礼物带给你。',
    '松鼠爬上树枝摇了摇，落下一颗香香的松果，挑给小熊猫当作路上的纪念品，让它拿回来给你。',
    '小熊猫帮松鼠把滚远的松果找了回来，松鼠便把另一颗圆滚滚的送给它，说这颗要带回去给你。',
  ] },
  { emoji: '🐟', item: '小鱼', animal: '小猫', stories: [
    '小猫在溪边钓到一条亮闪闪的小鱼，装进小篮子里送给小熊猫，托它回来和你分享这份惊喜。',
    '小猫蹲在水边等了好久，终于钓到今天第一条小鱼。它把小鱼交给小熊猫，说想让你也看看。',
    '小熊猫陪小猫在溪边听水声，小猫把刚钓到的小鱼送给它当礼物，小熊猫一路小心地带回来了。',
  ] },
  { emoji: '🍬', item: '糖果', animal: '老爷爷', stories: [
    '路边的老爷爷从小布袋里拿出一颗水果糖送给小熊猫，叮嘱它慢慢带回去，和你一起分享甜味。',
    '老爷爷看见小熊猫在花园边散步，笑着递给它一颗包装亮晶晶的糖果，说这是给你的小礼物。',
    '小熊猫帮老爷爷捡起滚到椅子下的糖果，老爷爷便另外挑了一颗新的送给它，让它带回来给你。',
  ] },
  { emoji: '🌸', item: '花瓣', animal: '蝴蝶', stories: [
    '蝴蝶在花丛里挑了一片完整的粉色花瓣送给小熊猫，还绕着它飞了一圈，像是在说这份也想送给你。',
    '小熊猫和蝴蝶在暖暖的阳光下追了一小会儿，蝴蝶落下一片花瓣送给它，让它带回来装点你的小礼物盒。',
    '蝴蝶停在一朵刚开的花上，轻轻碰落一片花瓣送给小熊猫。小熊猫把它护好，带回来给你看。',
  ] },
  { emoji: '🍓', item: '野莓串', animal: '小刺猬', stories: [
    '小刺猬在林边摘了一串熟透的野莓，挑了最大最甜的一串，叫它“野莓串”，托小熊猫带回来给你。',
    '小熊猫陪小刺猬找到叶子底下的野莓，小刺猬把洗干净的莓果串成野莓串，郑重地请它带回来给你。',
    '小刺猬在灌木丛里发现一串红彤彤的野莓串，留给小熊猫带回来给你当路上点心。',
  ] },
  { emoji: '🍪', item: '竹叶饼干', animal: '小熊', stories: [
    '小熊烤好一片竹叶饼干，香香脆脆的，还特意装进小纸袋托小熊猫带回来给你。',
    '小熊第一次做竹叶饼干，边缘有一点点歪，不过味道可香啦。它让小熊猫把最好的一块带回来给你。',
    '小熊和小熊猫一起在厨房等饼干出炉，小熊把刚放凉的竹叶饼干包好，请小熊猫带回来给你。',
  ] },
  { emoji: '🎋', item: '嫩竹笋', animal: '竹鼠', stories: [
    '竹鼠在竹林里找到一根刚冒头的嫩竹笋，擦掉泥土后装好，请小熊猫带回来给你看看。',
    '小熊猫和竹鼠沿着竹林散步，竹鼠发现一根鲜嫩的嫩竹笋，决定让小熊猫带回来给你。',
    '竹鼠把自己留着的嫩竹笋分给小熊猫，还说这是今天在竹林里找到的最新鲜的一根，带回来给你尝尝。',
  ] },
  { emoji: '🧶', item: '毛线球', animal: '小猫', stories: [
    '小猫把一颗软软的毛线球送给小熊猫，说可以带回来给你，等你有空时一起滚着玩。',
    '小猫追着毛线球滚了好几圈，最后把毛线球送给小熊猫，请它带回来给你玩。',
    '小猫挑了一颗颜色最暖的毛线球送给小熊猫，还叮嘱它带回来给你时不要把线团滚散啦。',
  ] },
  { emoji: '🪁', item: '小纸风筝', animal: '麻雀', stories: [
    '麻雀在树枝上发现一只迷路的小纸风筝，理好细线后请小熊猫带回来给你，等有风时一起玩。',
    '小熊猫帮麻雀把缠在树梢的风筝线解开，麻雀把修好的小纸风筝送给它，请它带回来给你看看。',
    '麻雀捡到一只轻飘飘的小纸风筝，和小熊猫把线轴卷整齐，再托它带回来给你。',
  ] },
  { emoji: '🪀', item: '木陀螺', animal: '松鼠', stories: [
    '松鼠用一小块光滑的木头做了个木陀螺，转起来飞快。它把陀螺送给小熊猫带回来给你。',
    '松鼠在树洞里翻出一只木陀螺，擦得亮亮的，交给小熊猫说带回来给你当玩具。',
    '小熊猫看松鼠玩木陀螺看得入迷，松鼠就把自己新做的一只送给它，让它带回来给你。',
  ] },
];
export function beginTrip(state: CompanionState, now = Date.now(), random = Math.random): CompanionState {
  const pick = souvenirs[Math.min(souvenirs.length - 1, Math.floor(random() * souvenirs.length))];
  const recentGiftStories = state.recentGiftStories ?? [];
  const unusedStories = pick.stories.filter(story => !recentGiftStories.includes(story));
  const storyChoices = unusedStories.length ? unusedStories : pick.stories;
  const story = storyChoices[Math.min(storyChoices.length - 1, Math.floor(random() * storyChoices.length))];
  const personalizedStory = state.userName ? story.replaceAll('给你', `给${state.userName}`) : story;
  const captured = random() >= 1 - CAPTURED_TRIP_CHANCE;
  const returnAt = now + 30_000 + random() * 90_000 + (captured ? CAPTURED_TRIP_EXTRA_MS : 0);
  const gift: Omit<Gift, 'receivedAt'> = {
    id: id(), emoji: pick.emoji, item: pick.item, animal: pick.animal,
    story: `${state.userName ? `${state.userName}，` : ''}${personalizedStory}` };
  const { returnEvent: _returnEvent, ...stateWithoutReturnEvent } = state;
  return { ...stateWithoutReturnEvent, recentGiftStories: [...recentGiftStories, story].slice(-12),
    trip: { id: gift.id, gift, returnAt, captured },
    messages: [...state.messages, assistant(captured
      ? `哎呀，小熊猫太可爱，被路过的人抱走啦！大家正在找它，小熊猫会晚一点回家哦。`
      : `诶，${state.userName ? state.userName + '，' : ''}小熊猫出去逛一圈，一会儿回来哦。（它轻轻挥挥爪子）`, 'event', now)] };
}
export function tickCompanion(state: CompanionState, now: number, random = Math.random,
  options: { allowDeparture?: boolean } = {}): {
  state: CompanionState; event?: 'proactive' | 'departure' | 'gift'; text?: string; capturedReturn?: boolean;
} {
  let next = decayCareStatState(state, now);
  next = next.proactiveDay === localDay(now) ? next : { ...next, proactiveDay: localDay(now), proactiveCount: 0 };
  if (next.returnEvent && !next.returnEvent.awaitingInteraction && now >= next.returnEvent.until) {
    const { returnEvent: _expiredReturnEvent, ...stateWithoutReturnEvent } = next;
    next = stateWithoutReturnEvent;
  }
  if (next.trip && now >= next.trip.returnAt) {
    const gift: Gift = { ...next.trip.gift, receivedAt: now };
    const capturedReturn = next.trip.captured === true;
    const text = capturedReturn
      ? `小熊猫终于被找回来啦……它还呆呆的，脑袋里好像只剩下“好可爱”这几个字。${gift.story}`
      : gift.story;
    const { returnEvent: _previousReturnEvent, ...stateWithoutReturnEvent } = next;
    const returnedState: CompanionState = { ...stateWithoutReturnEvent, trip: undefined, nextTripAt: now + tripDelay(random),
      ...(capturedReturn ? { returnEvent: { kind: 'captured' as const, until: now + CAPTURED_HOMECOMING_DURATION_MS, awaitingInteraction: true } } : {}),
      pendingGift: gift, giftDropStartedAt: undefined,
      messages: [...next.messages, assistant(text, 'event', now)] };
    next = capturedReturn ? deliverSpacePoliceLetter(returnedState, now) : returnedState;
    return { state: next, event: 'gift', text, capturedReturn };
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
  if (options.allowDeparture !== false && !next.pendingGift && now >= next.nextTripAt && now - next.lastUserAt >= MINUTE) {
    next = beginTrip(next, now, random);
    return { state: next, event: 'departure', text: next.messages.at(-1)!.text };
  }
  return { state: next };
}
