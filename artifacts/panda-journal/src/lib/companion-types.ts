export type MemoryKind = 'worry' | 'idea' | 'action';
export type PerformanceAction = 'bamboo' | 'roll' | 'jump' | 'spin' | 'somersault' | 'tail' | 'tumble' | 'cuddle';
export type DeveloperPose = 'idle' | 'lying' | 'sleeping' | 'peeking';
export type DeveloperEvent = 'startle' | 'grab' | 'dizzy-drop' | 'world-fall' | 'bath-drop' | 'bath-rub' | 'dirty-bath' | 'dirty-bath-rub' | 'dirty-fly-chase';
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
export type PetEffect = {
  action: PerformanceAction | 'idle';
  stage: 'present' | 'performing' | 'fallen' | 'returning' | 'away';
  duration: number; token: number; carrying?: string; userName?: string;
};
export type CompanionState = {
  version: 1; messages: ChatMessage[]; diary: DiaryMemory[]; gifts: Gift[];
  userName: string; draft: string; draftPhoto?: string; lastUserAt: number;
  nextIdleAt: number; proactiveDay: string; proactiveCount: number;
  nextTripAt: number; trip?: { id: string; returnAt: number; gift: Omit<Gift, 'receivedAt'> };
  privateQuestionsPaused?: boolean;
  pendingGift?: Gift; giftDropStartedAt?: number;
};
