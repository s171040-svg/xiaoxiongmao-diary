export type CharacterId = 'panda' | 'xiaobai';
export type CharacterSyncStatus = 'loading' | 'signed-out' | 'unselected' | 'error' | 'ready';
export interface DesktopCharacterSelection {
  characterId: CharacterId;
  ready: boolean;
  status: CharacterSyncStatus;
}

/** Guest/placeholder pandas are a web preview, never an account's desktop pet. */
export function desktopCharacterSelection(input: {
  authLoaded: boolean;
  signedIn: boolean;
  loading: boolean;
  error: boolean;
  selection?: { characterId: unknown; locked: boolean };
}): DesktopCharacterSelection {
  const id = input.selection?.characterId;
  const valid = id === 'panda' || id === 'xiaobai';
  const status: CharacterSyncStatus = !input.authLoaded ? 'loading'
    : !input.signedIn ? 'signed-out'
    : input.loading ? 'loading'
    : input.error ? 'error'
    : input.selection?.locked && valid ? 'ready' : 'unselected';
  return { characterId: valid ? id : 'panda', ready: status === 'ready', status };
}
