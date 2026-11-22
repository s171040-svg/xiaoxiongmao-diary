import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { useLocation } from 'wouter';
import { getPetSave, updatePetSave, type PetSaveSnapshot } from '@workspace/api-client-react';
import { ACCOUNT_OWNER_KEY, accountCacheKey, applyPetSnapshot, captureLocalValues,
  canRestorePendingLocal, readAccountCache, restoreLocalValues, snapshotPet } from '@/lib/account-pet-save';
import './AccountPetSave.css';

type SaveStatus = { text: string; error: boolean; retry: () => void; flush: () => Promise<boolean> };
const Context = createContext<SaveStatus>({ text: '正在读取存档', error: false, retry: () => {}, flush: async () => false });
export const useAccountPetSave = () => useContext(Context);

export function AccountPetSave({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [path] = useLocation();
  const [readyUser, setReadyUser] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const [status, setStatus] = useState('正在读取账号存档…');
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt(n => n + 1);
  const generation = useRef(0);
  const needsSave = useRef(false);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const inGame = path === '/room';
  useEffect(() => {
    if (!isLoaded) return;
    const gen = ++generation.current;
    setReadyUser(null);
    setFailure('');
    if (!isSignedIn || !userId) {
      // Signed-out players must not mount the previous account's room.
      return;
    }
    let cancelled = false;
    let timer = 0;
    let revision = 0;
    let lastCloud = '';
    let writing = false;
    let blocked = false;
    let pendingWrite: { snapshot: PetSaveSnapshot; revision: number } | undefined;
    const owns = () => !cancelled && generation.current === gen
      && localStorage.getItem(ACCOUNT_OWNER_KEY) === userId;
    const cache = (dirty: boolean) => {
      localStorage.setItem(accountCacheKey(userId), JSON.stringify({
        values: captureLocalValues(localStorage), revision, dirty, pendingWrite,
      }));
    };
    const save = async (): Promise<boolean> => {
      if (!owns() || writing || blocked) return false;
      try {
        const snapshot = snapshotPet(localStorage);
        const fingerprint = JSON.stringify(snapshot);
        cache(fingerprint !== lastCloud);
        if (fingerprint === lastCloud) return true;
        writing = true;
        setStatus('正在保存…');
        pendingWrite = { snapshot, revision };
        cache(true);
        const result = await updatePetSave({ snapshot, revision });
        if (!owns()) return false;
        revision = result.revision;
        pendingWrite = undefined;
        lastCloud = fingerprint;
        needsSave.current = false;
        cache(JSON.stringify(snapshotPet(localStorage)) !== lastCloud);
        setStatus('个人存档已保存');
        setFailure('');
        return true;
      } catch (error) {
        if (!owns()) return false;
        const conflict = (error as { status?: number }).status === 409;
        blocked = conflict;
        setFailure(conflict
          ? '其他窗口已有更新，已停止覆盖；本机进度仍保留。请重新读取。'
          : '账号存档暂未保存；本机进度仍保留，联网后会重试。');
        return false;
      } finally { writing = false; }
    };
    flushRef.current = save;
    const init = async () => {
      try {
        setStatus('正在读取账号存档…');
        const owner = localStorage.getItem(ACCOUNT_OWNER_KEY);
        // Archive the previous account before switching the active local slots.
        if (owner && owner !== userId) {
          const old = readAccountCache(localStorage, owner);
          localStorage.setItem(accountCacheKey(owner), JSON.stringify({
            values: captureLocalValues(localStorage), revision: old?.revision ?? 0, dirty: old?.dirty ?? true,
            pendingWrite: old?.pendingWrite,
          }));
        }
        const cached = readAccountCache(localStorage, userId);
        const values = cached?.values ?? (!owner || owner === userId ? captureLocalValues(localStorage) : {});
        const result = await getPetSave({ cache: 'no-store' });
        if (cancelled || gen !== generation.current) return;
        restoreLocalValues(localStorage, values);
        localStorage.setItem(ACCOUNT_OWNER_KEY, userId);
        revision = result.revision;
        // Unsynced progress is reusable only against the same cloud revision.
        const pendingLocal = canRestorePendingLocal(cached, result);
        if (result.snapshot && !pendingLocal) {
          const local = snapshotPet(localStorage);
          if (result.migrated) {
            const gifts = new Map(result.snapshot.room.gifts.map(gift => [gift.id, gift]));
            for (const gift of local.room.gifts) {
              const old = gifts.get(gift.id);
              gifts.set(gift.id, { ...old, ...gift, fedAt: Math.max(old?.fedAt ?? 0, gift.fedAt ?? 0) || undefined });
            }
            applyPetSnapshot(localStorage, {
              room: { ...result.snapshot.room, gifts: [...gifts.values()] },
              pet: { ...local.pet, ...result.snapshot.pet },
            });
          } else applyPetSnapshot(localStorage, result.snapshot);
        }
        lastCloud = result.snapshot && !pendingLocal && !result.migrated ? JSON.stringify(snapshotPet(localStorage)) : '';
        cache(!!pendingLocal || !result.snapshot || !!result.migrated);
        setReadyUser(userId);
        setStatus(result.migrated ? '原共同房间已保留为个人存档' : '个人存档已读取');
        if (cached?.dirty && cached.revision !== result.revision && !pendingLocal) {
          setFailure('已读取账号较新的存档。旧的未同步进度仍保留在本机备份中。');
          localStorage.setItem(`${accountCacheKey(userId)}:recovery`, JSON.stringify(cached));
        }
        timer = window.setInterval(() => { void save(); }, 2000);
        await save();
      } catch (error) {
        if (!cancelled) setFailure(error instanceof Error ? `存档读取失败：${error.message}` : '存档读取失败，原有记录没有被覆盖。');
      }
    };
    void init();
    const checkpoint = () => { if (owns()) { needsSave.current = true; try { cache(true); } catch { /* next save shows error */ } } };
    const leave = () => { checkpoint(); void save(); };
    window.addEventListener('panda-care-stats-updated', checkpoint);
    window.addEventListener('panda-coop-room-change', checkpoint);
    window.addEventListener('pagehide', leave);
    window.addEventListener('online', save);
    return () => {
      if (owns()) { try { cache(needsSave.current || JSON.stringify(snapshotPet(localStorage)) !== lastCloud); } catch { /* retain prior backup */ } }
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('panda-care-stats-updated', checkpoint);
      window.removeEventListener('panda-coop-room-change', checkpoint);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('online', save);
    };
  }, [isLoaded, isSignedIn, userId, attempt]);
  const ready = isSignedIn && readyUser === userId;
  if (inGame && (!isLoaded || (isSignedIn && !ready))) return (
    <main className="account-save-loading" role={failure ? 'alert' : 'status'}>
      <h1>小熊猫日记</h1><p>{failure || '正在读取你的个人宠物存档…'}</p>
      {failure && <button type="button" onClick={retry}>重试读取</button>}
    </main>
  );
  return <Context.Provider value={{ text: failure || status, error: !!failure, retry, flush: () => flushRef.current() }}>
    <div key={isSignedIn ? `${userId}:${attempt}` : 'signed-out'} style={{ display: 'contents' }}>{children}</div>
  </Context.Provider>;
}
