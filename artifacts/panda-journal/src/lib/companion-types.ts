export type MemoryKind = 'worry' | 'idea' | 'action';
export type CareStatCategory = 'health' | 'bond' | 'growth';
export type CareStats = {
  growth: number;
  health: number;
  bond: number;
  lastInteractionAt: number;
  lastDecayAt: number;
  revision: number;
  lastInteractionCategory: CareStatCategory;
  recentInteractionIds: string[];
};
export type PendingCareStatInteraction = {
  interactionId: string;
  category: CareStatCategory;
  occurredAt: number;
};
export type PerformanceAction =
  | 'bamboo' | 'roll' | 'jump' | 'spin' | 'somersault' | 'tail' | 'tumble' | 'cuddle'
  | 'captured-homecoming' | 'climb-up'
  | 'eat-banana' | 'eat-carrot' | 'eat-fish' | 'eat-candy' | 'eat-strawberry' | 'eat-cookie' | 'eat-bamboo';
export type DeveloperPose = 'idle' | 'lying' | 'sleeping' | 'peeking' | 'bored-searching';
export type DeveloperEvent = 'startle' | 'grab' | 'dirty-grab' | 'dizzy-drop' | 'world-fall' | 'bath-drop' | 'bath-rub' | 'dirty-bath' | 'dirty-bath-rub' | 'dirty-fly-chase' | 'toy-teaser' | 'toy-laser' | 'toy-curious' | 'toy-brake' | 'toy-wall-dizzy' | 'jar-peeking' | 'trash-can';
export type ChatMessage = {
  id: string; role: 'user' | 'assistant'; text: string; createdAt: number;
  photo?: string; status?: 'pending' | 'interrupted' | 'failed' | 'sent'; failureReason?: string;
  kind?: 'chat' | 'welcome' | 'proactive' | 'followup' | 'event';
  clearMindMode?: boolean;
};
export type DiaryMemory = {
  id: string; kind: MemoryKind; text: string; createdAt: number;
  sourceMessageId: string; followedUpAt?: number;
};
export type Gift = {
  id: string; emoji: string; item: string; animal: string; story: string; receivedAt: number;
  favorite?: boolean; fedAt?: number;
};
export type SpacePoop = {
  phase: 'pending' | 'fresh' | 'bagged' | 'disposing' | 'disposed';
  x?: number; y?: number; packedAt?: number; disposedAt?: number;
};
export type SpacePoliceLetter = {
  id: string; deliveredAt: number; openedAt?: number; filedAt?: number; eatenAt?: number; eatAfterAt?: number;
  poop?: SpacePoop;
  finePayment?: { paidAt: number; giftId: string; emoji: string; item: string };
};
export type PetEffect = {
  action: PerformanceAction | 'idle';
  stage: 'present' | 'performing' | 'fallen' | 'returning' | 'away';
  duration: number; token: number; carrying?: string; userName?: string; actionPreview?: boolean;
};
export type CompanionState = {
  version: 1; messages: ChatMessage[]; diary: DiaryMemory[]; gifts: Gift[];
  careStats: CareStats; pendingCareStatInteractions: PendingCareStatInteraction[];
  userName: string; draft: string; draftPhoto?: string; lastUserAt: number;
  nextIdleAt: number; proactiveDay: string; proactiveCount: number;
  nextTripAt: number;
  trip?: { id: string; returnAt: number; gift: Omit<Gift, 'receivedAt'>; captured?: boolean };
  returnEvent?: { kind: 'captured'; until: number; awaitingInteraction?: boolean };
  spacePoliceLetter?: { deliveredAt: number; openedAt?: number; filedAt?: number; eatenAt?: number; eatAfterAt?: number; poop?: SpacePoop };
  spacePoliceLetters?: SpacePoliceLetter[];
  recentGiftStories?: string[];
  privateQuestionsPaused?: boolean;
  pendingGift?: Gift; giftDropStartedAt?: number;
};
