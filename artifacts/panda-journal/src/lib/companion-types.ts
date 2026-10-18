export type MemoryKind = 'worry' | 'idea' | 'action';
export type PerformanceAction = 'bamboo' | 'roll' | 'jump' | 'spin' | 'somersault' | 'tail' | 'tumble' | 'cuddle' | 'captured-homecoming';
export type DeveloperPose = 'idle' | 'lying' | 'sleeping' | 'peeking';
export type DeveloperEvent = 'startle' | 'grab' | 'dirty-grab' | 'dizzy-drop' | 'world-fall' | 'bath-drop' | 'bath-rub' | 'dirty-bath' | 'dirty-bath-rub' | 'dirty-fly-chase';
export type ChatMessage = {
  id: string; role: 'user' | 'assistant'; text: string; createdAt: number;
  photo?: string; status?: 'pending' | 'interrupted' | 'failed' | 'sent'; failureReason?: string;
  kind?: 'chat' | 'welcome' | 'proactive' | 'followup' | 'event';
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
