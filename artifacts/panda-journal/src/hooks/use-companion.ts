import { useCallback, useEffect, useRef, useState } from 'react';
import { companionChat, type CompanionResponse } from '@workspace/api-client-react';
import { isDesktop } from '@/lib/desktop';
import { isQuietHours } from '@/lib/quiet-hours';
import { replyFrame, replyRhythm } from '@/lib/reply-rhythm';
import type { ChatMessage, CompanionState, PerformanceAction, PetEffect } from '@/lib/companion-types';
import type { JournalEntry } from '@/lib/journal-types';
import { assistant, contextFor, id, initialState, markPendingInterrupted, readState, receiveReply, recordUserMessage, performancePlan, tickCompanion, welcome, writeState, startGiftDrop, collectGift, favoriteGift, feedGift, injectTestGift, GIFT_DROP_MS, COMPANION_KEY, type TestGiftInput } from '@/lib/companion-store';

function initial() {
  try {
    const state = readState(localStorage);
    return { state: markPendingInterrupted(state), error: '' };
  } catch { return { state: initialState(), error: '本机聊天记录暂时无法读取，没有覆盖原数据。' }; }
}
function legacy(): JournalEntry[] {
  try { const data: unknown = JSON.parse(localStorage.getItem('little-panda-journal-v1') ?? '[]'); return Array.isArray(data) ? data as JournalEntry[] : []; }
  catch { return []; }
}
function photoData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d'); URL.revokeObjectURL(url);
      if (!context) { reject(new Error('无法处理照片。')); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('照片暂时无法读取。')); }; image.src = url;
  });
}
export function useCompanion() {
  const [loaded] = useState(initial);
  const [state, setState] = useState(loaded.state);
  const current = useRef(state);
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [replyDisplay, setReplyDisplay] = useState<{ id: string; text: string } | null>(null);
  const alive = useRef(true);
  const [status, setStatus] = useState(loaded.error || '小熊猫是 AI 陪伴角色；聊天和日记只保存在本机。');
  const [error, setError] = useState(Boolean(loaded.error));
  const [isPhotoLoading, setPhotoLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(listening), photoLoadingRef = useRef(isPhotoLoading);
  listeningRef.current = listening; photoLoadingRef.current = isPhotoLoading;
  const [nightMode, setNightMode] = useState(isQuietHours);
  const [legacyEntries] = useState(legacy);
  const [pet, setPet] = useState<PetEffect>({ action: 'idle', stage: state.trip ? 'away' : 'present', duration: 3000, token: 0 });
  const petRef = useRef(pet);
  const timers = useRef<number[]>([]);
  const welcomeAt = useRef(0), queuedPerformance = useRef(false);
  const visible = useRef(!isDesktop() && document.visibilityState === 'visible');
  const report = useCallback((e: unknown) => {
    setError(true);
    setStatus(e instanceof DOMException && e.name === 'QuotaExceededError'
      ? '本机保存空间不足，没有清空已有聊天；新内容尚未保存，请先移除草稿照片。'
      : e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']*': Error: /, '') : '暂时无法保存，草稿仍在本机。');
  }, []);
  const transact = useCallback((change: (s: CompanionState) => CompanionState) => {
    const next = change(readState(localStorage));
    writeState(localStorage, next); current.current = next; setState(next); return next;
  }, []);
  const motion = useCallback((next: PetEffect) => {
    petRef.current = next; setPet(next); window.pandaDesktop?.companionMotion(next);
  }, []);
  const notify = useCallback((text: string) => { window.pandaDesktop?.notifyMessage(text); }, []);
  const append = useCallback((text: string, kind: ChatMessage['kind'] = 'event') => {
    transact(s => ({ ...s, messages: [...s.messages, assistant(text, kind)] })); notify(text);
  }, [notify, transact]);
  const later = useCallback((fn: () => void, ms: number) => {
    const timer = window.setTimeout(() => { timers.current = timers.current.filter(t => t !== timer); fn(); }, ms); timers.current.push(timer);
  }, []);
  const settle = useRef<() => void>(() => {});
  const addTestGift = useCallback((input: TestGiftInput) => {
    if (!import.meta.env.DEV) throw new Error('开发者礼物工具仅在开发环境可用。');
    try {
      const next = transact(s => injectTestGift(s, input));
      setError(false);
      setStatus(`${input.item.trim()} 已加入本地小礼物。`);
      return next.gifts.at(-1)?.id;
    }
    catch (e) { report(e); throw e; }
  }, [report, transact]);
  const collectPresent = useCallback((giftId: string) => {
    try { transact(s => startGiftDrop(s, giftId)); } catch (e) { report(e); }
  }, [report, transact]);
  useEffect(() => {
    const gift = state.pendingGift;
    window.pandaDesktop?.showGift(gift, state.giftDropStartedAt);
    if (!gift || !state.giftDropStartedAt) return;
    const timer = window.setTimeout(() => {
      try {
        const next = transact(s => collectGift(s, gift.id));
        if (!next.pendingGift) {
          setStatus('小礼物收好啦，可以去小礼物里看看。');
          motion({ ...petRef.current, carrying: undefined });
        }
      } catch (e) { report(e); }
    }, Math.max(0, state.giftDropStartedAt + GIFT_DROP_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [state.pendingGift, state.giftDropStartedAt, motion, report, transact]);
  useEffect(() => window.pandaDesktop?.onGiftClick(collectPresent), [collectPresent]);
  const perform = useCallback(() => {
    if (petRef.current.stage !== 'present') { queuedPerformance.current = true; return; }
    const plan = performancePlan();
    const base: PetEffect = {
      ...petRef.current,
      ...plan,
      duration: plan.action === 'bamboo' ? Math.max(plan.duration, 7000) : plan.duration,
      stage: 'performing',
      token: Date.now(),
      userName: current.current.userName,
    };
    motion(base);
    const done = () => {
      motion({ ...base, action: 'idle', stage: 'present', duration: 3000 });
      try { append('怎么样怎么样？小熊猫表演得好不好呀？'); } catch (e) { report(e); }
      settle.current();
    };
    if (plan.drops) {
      later(() => {
        motion({ ...base, stage: 'fallen' });
        try { append('呜哇——！'); } catch (e) { report(e); }
        const audio = new Audio(`${import.meta.env.BASE_URL}audio/panda-fall.mp3`);
        audio.volume = 0.55;
        void audio.play().catch(() => { setStatus('浏览器暂时不允许播放声音；小熊猫的动作和文字仍会显示。'); });
        later(() => {
          motion({ ...base, stage: 'returning' });
          later(() => {
            try { append('唔……小熊猫刚才掉出去了。吓死小熊猫了。'); } catch (e) { report(e); }
            done();
          }, 2500);
        }, 5000);
      }, base.duration / 2);
    } else later(done, base.duration);
  }, [append, later, motion, report]);
  const performTestAction = useCallback((action: PerformanceAction) => {
    if (!import.meta.env.DEV) throw new Error('动作检测仅在开发环境可用。');
    if (['roll', 'spin', 'tumble'].includes(action)) return false;
    if (petRef.current.stage !== 'present') return false;
    const base: PetEffect = {
      ...petRef.current,
      action,
      stage: 'performing',
      duration: action === 'bamboo' ? 7000 : 3500,
      token: Date.now(),
      userName: current.current.userName,
    };
    motion(base);
    later(() => {
      if (petRef.current.token !== base.token || petRef.current.stage !== 'performing') return;
      motion({ ...base, action: 'idle', stage: 'present', duration: 3000 });
      settle.current();
    }, base.duration);
    return true;
  }, [later, motion]);
  settle.current = () => { if (queuedPerformance.current) { queuedPerformance.current = false; perform(); } };
  const greet = useCallback((manual = false) => {
    if (!manual && Date.now() - welcomeAt.current < 300) return;
    welcomeAt.current = Date.now();
    try {
      const next = manual ? transact(s => ({ ...s, messages: [...s.messages, assistant(`唔，${s.userName ? s.userName + '，' : ''}小熊猫在这里陪你呀。（它轻轻靠过来）`, 'chat')] }))
        : transact(s => welcome(s));
      notify(next.messages.at(-1)!.text);
    } catch (e) { report(e); }
  }, [notify, report, transact]);
  useEffect(() => {
    if (loaded.error) return;
    try {
      // Recover unfinished replies after a crash without dropping user bubbles.
      transact(markPendingInterrupted);
      motion(petRef.current);
    } catch (e) { report(e); }
    if (visible.current) greet();
    const visibility = (show: boolean) => {
      const reopening = show && !visible.current; visible.current = show;
      if (reopening) greet();
    };
    const change = () => { if (!isDesktop()) visibility(document.visibilityState === 'visible'); };
    document.addEventListener('visibilitychange', change);
    const off = window.pandaDesktop?.onCompanionVisibility(visibility);
    void window.pandaDesktop?.companionVisibility().then(visibility).catch(report);
    const offGreeting = window.pandaDesktop?.onCompanionGreet(() => greet(true));
    const sync = (event: StorageEvent) => { if (event.key === COMPANION_KEY) { try { const next = readState(localStorage); current.current = next; setState(next); } catch (e) { report(e); } } };
    window.addEventListener('storage', sync);
    const timer = window.setInterval(() => {
      setNightMode(isQuietHours());
      if (listeningRef.current || photoLoadingRef.current || petRef.current.stage === 'performing' || petRef.current.stage === 'fallen' || petRef.current.stage === 'returning') return;
      const tick = () => {
        try {
          const previous = readState(localStorage);
          if (busyRef.current && !(previous.trip && Date.now() >= previous.trip.returnAt)) return;
          const result = tickCompanion(previous, Date.now());
          if (result.state !== previous) {
            writeState(localStorage, result.state); current.current = result.state; setState(result.state);
          }
          if (result.text) notify(result.text);
          if (result.event === 'departure') motion({ ...petRef.current, stage: 'away', token: Date.now(), carrying: undefined });
          if (result.event === 'gift') {
            motion({ ...petRef.current, stage: 'returning', token: Date.now(), carrying: result.state.pendingGift?.emoji });
            later(() => { motion({ ...petRef.current, stage: 'present', action: 'idle' }); settle.current(); }, 2500);
          }
        } catch (e) { report(e); }
      };
      // Elect a tick owner across browser tabs; no server-side diary is created.
      if (navigator.locks) void navigator.locks.request('panda-companion-clock', { ifAvailable: true }, lock => { if (lock) tick(); });
      else tick();
    }, 1000);
    return () => {
      clearInterval(timer); document.removeEventListener('visibilitychange', change); window.removeEventListener('storage', sync);
      off?.(); offGreeting?.();
    };
  }, [greet, loaded.error, motion, notify, report, later, transact]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; timers.current.forEach(clearTimeout); };
  }, []);
  async function requestReply(messageId: string) {
    busyRef.current = true; setBusy(true); setError(false); setStatus('小熊猫在认真听…');
    setReplyDisplay(null);
    const sentAt = Date.now();
    const pause = 500 + Math.random() * 1000;
    notify('唔……');
    try {
      const input = contextFor(readState(localStorage), messageId);
      const response: CompanionResponse = window.pandaDesktop ? await window.pandaDesktop.chat(input) : await companionChat(input);
      const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
      await wait(Math.max(0, sentAt + pause - Date.now()));
      if (!alive.current) return;
      const plan = replyRhythm(response.reply, Math.random, pause);
      const next = transact(s => receiveReply(s, messageId, response));
      const replyId = next.messages.at(-1)!.id;
      if (plan.duration > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        for (let index = 0; index < plan.characters.length && alive.current; index++) {
          await wait(plan.interval);
          if (!alive.current) break;
          const text = plan.characters.slice(0, index + 1).join('');
          setReplyDisplay({ id: replyId, text });
          notify(text);
        }
      }
      if (!alive.current) return;
      setReplyDisplay(null);
      setStatus(response.memories.length ? '聊天已保存在本机，日记本也悄悄记下啦。' : '聊天已保存在本机。');
      notify(response.reply);
      if (response.action === 'performance') perform();
    } catch (e) {
      // ApiError carries safe provider message under data.error.
      const api = e as { data?: { error?: string } };
      const reason = (api?.data?.error || (e instanceof Error ? e.message : '暂时无法连接 AI 服务，请稍后重试。'))
        .replace(/^Error invoking remote method '[^']*': Error: /, '').slice(0, 180);
      try { transact(s => ({ ...s, messages: s.messages.map(m => m.id === messageId ? { ...m, status: 'failed', failureReason: reason } : m) })); }
      catch (storageError) { report(storageError); }
      report(new Error(reason));
    } finally { busyRef.current = false; if (alive.current) { setBusy(false); setReplyDisplay(null); } }
  }
  async function send(textOverride?: string) {
    if (busyRef.current || isPhotoLoading || listening) return;
    const text = (textOverride ?? current.current.draft).trim();
    if (!text) { report(new Error('照片只留在本机，先配上一句话再发送吧。')); return; }
    const message: ChatMessage = { id: id(), role: 'user', text, photo: current.current.draftPhoto, createdAt: Date.now(), status: 'pending', kind: 'chat' };
    try {
      transact(s => recordUserMessage(s, message));
    } catch (e) { report(e); return; }
    await requestReply(message.id);
  }
  async function retryMessage(messageId: string) {
    if (busyRef.current) return;
    if (current.current.messages.filter(m => m.role === 'user').at(-1)?.id !== messageId) { report(new Error('这条后面已有新消息，请继续聊，不重复发送旧消息。')); return; }
    try { transact(s => ({ ...s, messages: s.messages.map(m => m.id === messageId ? { ...m, status: 'pending', failureReason: undefined } : m) })); }
    catch (e) { report(e); return; }
    await requestReply(messageId);
  }
  async function choosePhoto(file?: File) {
    if (!file || busyRef.current) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) { report(new Error('请选择小于 8MB 的图片。')); return; }
    setPhotoLoading(true);
    try { const draftPhoto = await photoData(file); transact(s => ({ ...s, draftPhoto })); setError(false); setStatus('照片已放好，仅存在本机。'); }
    catch (e) { report(e); } finally { setPhotoLoading(false); }
  }
  return {
    state, draft: state.draft, photo: state.draftPhoto, busy, replyDisplay, isPhotoLoading, listening, setListening, collectPresent,
    status, error, nightMode, pet, legacyEntries, send, retryMessage, choosePhoto, perform,
    setDraft: (draft: string) => { try { transact(s => ({ ...s, draft })); } catch (e) { report(e); } },
    removePhoto: () => { try { transact(s => ({ ...s, draftPhoto: undefined })); } catch (e) { report(e); } },
    removeDiary: (memoryId: string) => { try { transact(s => ({ ...s, diary: s.diary.filter(m => m.id !== memoryId) })); } catch (e) { report(e); } },
    favoriteGift: (giftId: string) => { try { transact(s => favoriteGift(s, giftId)); } catch (e) { report(e); } },
    feedGift: (giftId: string) => {
      try {
        const before = current.current;
        const next = transact(s => feedGift(s, giftId));
        if (next.messages.length !== before.messages.length) {
          notify(next.messages.at(-1)!.text);
          if (petRef.current.stage === 'present') {
            const effect: PetEffect = { ...petRef.current, action: 'bamboo', stage: 'performing', duration: 7000, token: Date.now() };
            motion(effect);
            later(() => { motion({ ...effect, action: 'idle', stage: 'present', duration: 3000 }); settle.current(); }, effect.duration);
          }
        }
      } catch (e) { report(e); }
    },
    ...(import.meta.env.DEV ? { addTestGift, performTestAction } : {}),
  };
}
export type CompanionController = ReturnType<typeof useCompanion>;
