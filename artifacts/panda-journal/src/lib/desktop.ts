import type { Category } from './journal-types';
import type { CompanionInput, CompanionResponse } from '@workspace/api-client-react';
import type { Gift, PetEffect } from './companion-types';
import type { DesktopCharacterSelection } from './desktop-character-selection';

export interface DesktopPetState {
  mode: 'desktop' | 'room';
  characterId: 'panda' | 'xiaobai';
  identityReady: boolean;
  identityStatus?: string;
  paused: boolean;
}

declare global {
  interface Window {
    pandaDesktop?: {
      desktopPetState: () => Promise<DesktopPetState>;
      onDesktopPetState: (callback: (state: DesktopPetState) => void) => () => void;
      syncDesktopCharacter: (selection: DesktopCharacterSelection) => void;
      enterDesktop: () => Promise<DesktopPetState>;
      returnHome: () => Promise<DesktopPetState>;
      chat: (input: CompanionInput) => Promise<CompanionResponse>;
      companionMotion: (effect: PetEffect) => void;
      notifyMessage: (text: string) => void;
      onCompanionVisibility: (callback: (visible: boolean) => void) => () => void;
      onCompanionGreet: (callback: () => void) => () => void;
      companionVisibility: () => Promise<boolean>;
      showGift: (gift: Gift | undefined, startedAt?: number) => void;
      onGiftClick: (callback: (id: string) => void) => () => void;
      hideJournal: () => void;
      entrySaved: () => void;
      classifyJournalEntry: (input: { text: string }) => Promise<{
        category: Category;
        hasActionableGoal: boolean;
        reply: string;
      }>;
    };
  }
}

export const isDesktop = () => Boolean(window.pandaDesktop);
