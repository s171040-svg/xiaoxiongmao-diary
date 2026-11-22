import type { PetSaveSnapshot } from '@workspace/api-client-react';
import { COMPANION_KEY, initialState, readState } from './companion-store';
import { readRoomFurnitureLayout, ROOM_FURNITURE_LAYOUT_KEY } from './room-furniture-layout';
import { normalizeRoomProps } from './room-props';

const PREFIX = 'little-panda-';
export const ACCOUNT_OWNER_KEY = 'little-panda-account-owner';
export const accountCacheKey = (userId: string) => `little-panda-account-cache:${userId}`;
export type AccountCache = {
  values: Record<string, string>; revision: number; dirty: boolean;
  pendingWrite?: { snapshot: PetSaveSnapshot; revision: number };
};
export function canRestorePendingLocal(cache: AccountCache | null, remote: { snapshot: PetSaveSnapshot | null; revision: number }) {
  if (!cache?.dirty) return false;
  if (cache.revision === remote.revision) return true;
  const pending = cache.pendingWrite;
  if (!pending || pending.revision + 1 !== remote.revision) return false;
  // A reload can interrupt the response after the database has already committed.
  const canonical = (value: unknown) => JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry);
  return canonical(pending.snapshot) === canonical(remote.snapshot);
}
const isGameplayKey = (key: string) => key.startsWith(PREFIX) && !key.startsWith('little-panda-account-');
export function captureLocalValues(storage: Storage): Record<string, string> {
  const values: Record<string, string> = {};
  for (let n = 0; n < storage.length; n++) {
    const key = storage.key(n);
    if (key && isGameplayKey(key)) values[key] = storage.getItem(key)!;
  }
  return values;
}
export function restoreLocalValues(storage: Storage, values: Record<string, string>) {
  for (const key of Object.keys(captureLocalValues(storage))) storage.removeItem(key);
  for (const [key, value] of Object.entries(values)) if (isGameplayKey(key)) storage.setItem(key, value);
  if (!storage.getItem(COMPANION_KEY)) storage.setItem(COMPANION_KEY, JSON.stringify(initialState()));
}
export function readAccountCache(storage: Storage, userId: string): AccountCache | null {
  const raw = storage.getItem(accountCacheKey(userId));
  return raw ? JSON.parse(raw) as AccountCache : null;
}
export function snapshotPet(storage: Storage): PetSaveSnapshot {
  const state = readState(storage);
  const props: unknown = JSON.parse(storage.getItem('little-panda-room-props-v1') ?? 'null');
  const { nextTripAt, trip, returnEvent, spacePoliceLetter, spacePoliceLetters,
    recentGiftStories, pendingGift, giftDropStartedAt } = state;
  return {
    room: {
      gifts: state.gifts, careStats: state.careStats,
      furnitureLayout: readRoomFurnitureLayout(storage), placedProps: normalizeRoomProps(props),
      worldEcology: state.worldEcology, foxMerchantLetter: state.foxMerchantLetter,
    },
    pet: JSON.parse(JSON.stringify({ nextTripAt, trip, returnEvent, spacePoliceLetter,
      spacePoliceLetters, recentGiftStories, pendingGift, giftDropStartedAt })),
  };
}
export function applyPetSnapshot(storage: Storage, snapshot: PetSaveSnapshot) {
  const local = readState(storage);
  const fields = ['nextTripAt', 'trip', 'returnEvent', 'spacePoliceLetter', 'spacePoliceLetters',
    'recentGiftStories', 'pendingGift', 'giftDropStartedAt'] as const;
  const pet = Object.fromEntries(fields.map(key => [key, snapshot.pet[key]]));
  // Chat and diary always come from this account's local cache, never the server.
  const candidate = {
    ...local, ...pet, nextTripAt: snapshot.pet.nextTripAt ?? local.nextTripAt,
    gifts: snapshot.room.gifts, careStats: snapshot.room.careStats ?? local.careStats,
    worldEcology: snapshot.room.worldEcology ?? local.worldEcology,
    foxMerchantLetter: snapshot.room.foxMerchantLetter,
    pendingCareStatInteractions: [],
  };
  // Validate before touching the current save.
  const validated = readState({ getItem: key => key === COMPANION_KEY ? JSON.stringify(candidate) : null });
  storage.setItem(COMPANION_KEY, JSON.stringify(validated));
  storage.setItem(ROOM_FURNITURE_LAYOUT_KEY, JSON.stringify({ version: 1, positions: snapshot.room.furnitureLayout }));
  storage.setItem('little-panda-room-props-v1', JSON.stringify(normalizeRoomProps(snapshot.room.placedProps)));
}
