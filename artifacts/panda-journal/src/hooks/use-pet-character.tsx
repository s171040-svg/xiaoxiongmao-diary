import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { useGetPetCharacter, useChoosePetCharacter } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { desktopCharacterSelection } from '@/lib/desktop-character-selection';

export type PetCharacterId = 'panda' | 'xiaobai';
const useCharacterState = () => {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const client = useQueryClient();
  // Including identity prevents one account's permanent choice flashing in another.
  const queryKey = ['pet-character', userId ?? 'guest'];
  const query = useGetPetCharacter({ query: {
    queryKey, enabled: !!isLoaded && !!isSignedIn, staleTime: 0,
    refetchOnMount: 'always', refetchOnWindowFocus: true, refetchInterval: 10_000,
    refetchIntervalInBackground: !!window.pandaDesktop,
  }, request: { cache: 'no-store' } });
  const mutation = useChoosePetCharacter();
  const characterId: PetCharacterId = isSignedIn && query.data?.characterId === 'xiaobai' ? 'xiaobai' : 'panda';
  return {
    characterId, name: characterId === 'xiaobai' ? '小白' : '小熊猫',
    authLoaded: !!isLoaded,
    selection: isSignedIn ? query.data : undefined,
    isSignedIn: !!isSignedIn, isLoading: !isLoaded || (!!isSignedIn && query.isPending),
    error: query.error, saving: mutation.isPending,
    choose: async (id: PetCharacterId) => {
      if (!isSignedIn) throw new Error('请先登录账号。');
      try {
        const result = await mutation.mutateAsync({ data: { characterId: id } });
        client.setQueryData(queryKey, result);
      } finally {
        await client.invalidateQueries({ queryKey });
      }
    },
    retry: () => void query.refetch(),
  };
};
type PetCharacterState = ReturnType<typeof useCharacterState>;
const Context = createContext<PetCharacterState | null>(null);
export function PetCharacterProvider({ children }: { children: ReactNode }) {
  const value = useCharacterState();
  useEffect(() => {
    window.pandaDesktop?.syncDesktopCharacter?.(desktopCharacterSelection({
      authLoaded: value.authLoaded, signedIn: value.isSignedIn,
      loading: value.isLoading, error: !!value.error, selection: value.selection,
    }));
  }, [value.authLoaded, value.characterId, value.error, value.isLoading, value.isSignedIn, value.selection?.locked]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePetCharacter() {
  const context = useContext(Context);
  // A provider-less web preview is not a confirmed account selection.
  if (!context) return {
    characterId: 'panda' as const, name: '小熊猫', selection: undefined,
    authLoaded: false, isSignedIn: false, isLoading: false, error: null, saving: false,
    choose: async () => { throw new Error('请在养成主页登录并选定角色。'); },
    retry: () => {},
  };
  return context;
}
/** Only new pet narration is adapted; users' words and stored history are untouched. */
export function usePetNarration() {
  const { characterId } = usePetCharacter();
  return useMemo(() => (text: string) => characterId === 'xiaobai'
    ? text.replaceAll('小熊猫', '小白') : text, [characterId]);
}
