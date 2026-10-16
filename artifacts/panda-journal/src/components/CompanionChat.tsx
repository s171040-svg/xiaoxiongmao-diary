import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BookOpen, Gift as GiftIcon, ImagePlus, Pause, Play, RotateCw, SendHorizontal, Trash2, Wrench, X } from 'lucide-react';
import type { CompanionController } from '@/hooks/use-companion';
import type { ChatMessage, DeveloperEvent, DeveloperPose, MemoryKind, PerformanceAction } from '@/lib/companion-types';
import type { JournalEntry } from '@/lib/journal-types';
import { splitReply } from '@/lib/reply-rhythm';
import { VoiceButton } from '@/components/VoiceButton';
import { PetStage } from '@/components/PetStage';
import { GiftDrop } from '@/components/GiftDrop';
import { EmotionCheckIn } from '@/components/EmotionCheckIn';
import './CompanionChat.css';

const DevGiftTool = import.meta.env.DEV ? lazy(() => import('@/components/DevGiftTool')) : null;
const kindLabel: Record<MemoryKind, string> = { worry: '烦恼', idea: '点子', action: '行动' };
const catLabel: Record<string, string> = { leisure: '日常', idea: '点子', worry: '烦恼' };
const devActionOptions: { action: PerformanceAction; label: string }[] = [
  { action: 'bamboo', label: '啃竹子' },
  { action: 'jump', label: '蹦跳' },
  { action: 'somersault', label: '翻跟斗' },
  { action: 'tail', label: '追尾巴' },
  { action: 'cuddle', label: '蹭蹭撒娇' },
];
const devPoseOptions: { pose: DeveloperPose; label: string }[] = [
  { pose: 'idle', label: '发呆' },
  { pose: 'lying', label: '趴着' },
  { pose: 'sleeping', label: '睡觉' },
  { pose: 'peeking', label: '趴着回头看' },
];
const devEventOptions: { event: DeveloperEvent; label: string; durationMs: number; persistent?: boolean }[] = [
  { event: 'startle', label: '被吓一跳', durationMs: 1150 },
  { event: 'grab', label: '被提起发懵', durationMs: 2500 },
  { event: 'dizzy-drop', label: '松手后眩晕跌落', durationMs: 3520 },
  { event: 'world-fall', label: '掉出世界再回来', durationMs: 13100 },
  { event: 'bath-drop', label: '掉进浴缸洗澡', durationMs: 5000, persistent: true },
  { event: 'bath-rub', label: '浴球搓洗', durationMs: 5000, persistent: true },
  { event: 'dirty-bath', label: '脏兮兮状态洗澡', durationMs: 5000, persistent: true },
  { event: 'dirty-bath-rub', label: '脏兮兮状态浴球搓洗', durationMs: 5000, persistent: true },
  { event: 'dirty-fly-chase', label: '脏兮兮小熊猫被苍蝇追', durationMs: 7000, persistent: true },
];
type DevTestSelection =
  | { kind: 'action'; action: PerformanceAction }
  | { kind: 'pose'; pose: DeveloperPose }
  | { kind: 'event'; event: DeveloperEvent };
type ScheduledDevTest = DevTestSelection & { token: number };
const devActionLabel = (action: PerformanceAction) => devActionOptions.find(option => option.action === action)?.label ?? action;
const devPoseLabel = (pose: DeveloperPose) => devPoseOptions.find(option => option.pose === pose)?.label ?? pose;
const devEventOption = (event: DeveloperEvent) => devEventOptions.find(option => option.event === event)!;
const fmt = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });

function removeActionAsides(text: string) {
  return text.replace(/（[^）]*）|\([^)]*\)/gu, '').replace(/\s+/gu, ' ').trim();
}

function Modal({ title, sub, onClose, children, testid }: { title: string; sub: string; onClose: () => void; children: React.ReactNode; testid: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <dialog ref={ref} className="cc-dialog" aria-labelledby={`${testid}-t`} data-testid={testid}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <header className="cc-dhead">
        <div><h2 id={`${testid}-t`}>{title}</h2><p>{sub}</p></div>
        <button type="button" className="cc-icon" aria-label="关闭" onClick={onClose} autoFocus data-testid={`${testid}-close`}><X size={18} /></button>
      </header>
      {children}
    </dialog>
  );
}

function Diary({ c, onClose }: { c: CompanionController; onClose: () => void }) {
  const [tab, setTab] = useState<'new' | 'old'>('new');
  const [confirm, setConfirm] = useState<string | null>(null);
  const diary = [...c.state.diary].sort((a, b) => b.createdAt - a.createdAt);
  const old: JournalEntry[] = [...c.legacyEntries].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Modal title="日记本" sub="小熊猫从聊天里自动记下的心事，只保存在本机。" onClose={onClose} testid="dialog-diary">
      <div className="cc-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')} type="button">自动记录 {diary.length}</button>
        <button role="tab" aria-selected={tab === 'old'} className={tab === 'old' ? 'on' : ''} onClick={() => setTab('old')} type="button">旧日记 {old.length}</button>
      </div>
      {tab === 'new' ? (diary.length ? diary.map((m) => {
        const src = c.state.messages.find((x) => x.id === m.sourceMessageId);
        return (
          <article className="cc-card" key={m.id} data-testid={`card-diary-${m.id}`}>
            <div className="cc-meta"><span className={`cc-tag k-${m.kind}`}>{kindLabel[m.kind]}</span><time>{fmt.format(m.createdAt)}</time></div>
            <p>{m.text}</p>
            {src && <blockquote>来自：{src.text.slice(0, 60)}</blockquote>}
            {confirm === m.id ? (
              <div className="cc-confirm" role="alert">删除这条记录？
                <button type="button" className="cc-danger" onClick={() => { c.removeDiary(m.id); setConfirm(null); }}>确认删除</button>
                <button type="button" onClick={() => setConfirm(null)}>取消</button></div>
            ) : <button type="button" className="cc-del" onClick={() => setConfirm(m.id)}><Trash2 size={13} /> 删除</button>}
          </article>);
      }) : <p className="cc-empty">还没有记录。聊到烦恼、点子或打算时，小熊猫会悄悄记下。</p>)
      : (old.length ? old.map((e) => (
        <article className="cc-card" key={e.id}>
          <div className="cc-meta"><span className="cc-tag">{catLabel[e.category] ?? e.category}</span><time>{fmt.format(e.createdAt)}</time></div>
          <p>{e.text}</p>
          {e.photo && <img src={e.photo} alt="旧日记照片" />}
          {e.reply && <blockquote>{e.reply}</blockquote>}
        </article>)) : <p className="cc-empty">没有旧版日记。</p>)}
      {tab === 'old' && <p className="cc-note">旧日记为只读。</p>}
    </Modal>
  );
}

function Gifts({ c, onClose }: { c: CompanionController; onClose: () => void }) {
  const gifts = [...c.state.gifts].sort((a, b) => b.receivedAt - a.receivedAt);
  return (
    <Modal title="小礼物" sub="小熊猫出门遇见的朋友，和带回来的东西。" onClose={onClose} testid="dialog-gifts">
      {gifts.length ? gifts.map((g) => (
        <article className="cc-card cc-gift" key={g.id}>
          <span className="cc-gemoji" aria-hidden="true">{g.emoji}</span>
          <div><strong>{g.item}</strong><small>来自 {g.animal} · {fmt.format(g.receivedAt)}</small>
            <details><summary>看看带回来的故事</summary><p>{g.story}</p></details>
            <div className="cc-gift-actions">
              <button type="button" onClick={() => c.favoriteGift(g.id)} aria-pressed={Boolean(g.favorite)}>{g.favorite ? '已收藏 · 取消' : '收藏'}</button>
              {['🍌', '🥕', '🐟', '🍬'].includes(g.emoji) && <button type="button" disabled={Boolean(g.fedAt)} onClick={() => c.feedGift(g.id)}>{g.fedAt ? '已喂给小熊猫' : '喂小熊猫'}</button>}
              {!['🍌', '🥕', '🐟', '🍬'].includes(g.emoji) && <small>纪念小物，留着收藏</small>}
            </div>
          </div>
        </article>)) : <p className="cc-empty">还没有礼物。小熊猫偶尔会出门，回来时带点什么。</p>}
    </Modal>
  );
}

function Bubble({ m, canRetry, c }: { m: ChatMessage; canRetry: boolean; c: CompanionController }) {
  const mine = m.role === 'user';
  const display = c.replyDisplay?.id === m.id ? splitReply(c.replyDisplay.text) : null;
  return (
    <div className={`cc-row ${mine ? 'me' : 'bot'}`}>
      <div className={`cc-bubble${m.status === 'pending' ? ' pending' : ''}${m.status === 'failed' ? ' failed' : ''}${m.status === 'interrupted' ? ' interrupted' : ''}`} data-testid={`message-${m.id}`}>
        {m.photo && <img src={m.photo} alt="发送的照片" />}
        {display
          ? <p className="cc-thinking-copy" aria-live="off" aria-label="小熊猫正在把话慢慢说出来"><span aria-hidden="true">{splitReply(m.text).map((char, i) => (
              <span className="cc-thought-char" key={i}><span className="cc-char-space">{char}</span><span>{display[i] || '\u00a0'}</span></span>
            ))}</span></p>
          : <p>{m.text}</p>}
      </div>
      <div className="cc-stamp">
        <time>{clock.format(m.createdAt)}</time>
        {m.status === 'pending' && <span>发送中…</span>}
        {m.status === 'interrupted' && <span className="err">上次发送时中断了</span>}
        {m.status === 'failed' && <span className="err" title={m.failureReason}>小熊猫没收到回应{m.failureReason ? `：${m.failureReason}` : ''}</span>}
        {canRetry && <button type="button" onClick={() => void c.retryMessage(m.id)} disabled={c.busy} data-testid="button-retry"><RotateCw size={12} /> 重试</button>}
      </div>
    </div>
  );
}

export function CompanionChat({ companion: c, roomOnly = false }: { companion: CompanionController; roomOnly?: boolean }) {
  const [panel, setPanel] = useState<'diary' | 'gifts' | null>(null);
  const [devGiftOpen, setDevGiftOpen] = useState(false);
  const [devActionOpen, setDevActionOpen] = useState(false);
  const [scheduledDevTest, setScheduledDevTest] = useState<ScheduledDevTest | null>(null);
  const [developerPose, setDeveloperPose] = useState<DeveloperPose | null>(null);
  const [developerEvent, setDeveloperEvent] = useState<{ event: DeveloperEvent; token: number } | null>(null);
  const [devActionSeconds, setDevActionSeconds] = useState(2);
  const [devActionResult, setDevActionResult] = useState<{ label: string; started: boolean; durationMs: number; persistent?: boolean } | null>(null);
  const devActionToken = useRef(0);
  const [roomChatOpen, setRoomChatOpen] = useState(false);
  const [voice, setVoice] = useState<{ m: string; e: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = c.state.messages;
  const liveMessagesRef = useRef(msgs);
  liveMessagesRef.current = msgs;
  const roomChatStartIndexRef = useRef(msgs.length);
  const onRoomChatModeChange = useCallback((isChat: boolean) => {
    if (isChat) roomChatStartIndexRef.current = liveMessagesRef.current.length;
    setRoomChatOpen(isChat);
  }, []);
  useEffect(() => {
    if (!scheduledDevTest || (scheduledDevTest.kind === 'action' && !c.performTestAction)) return;
    const selection = scheduledDevTest;
    const deadline = Date.now() + 2000;
    setDevActionSeconds(2);
    const countdown = window.setInterval(() => {
      setDevActionSeconds(Math.max(1, Math.ceil((deadline - Date.now()) / 1000)));
    }, 100);
    const execution = window.setTimeout(() => {
      window.clearInterval(countdown);
      const label = selection.kind === 'action'
        ? devActionLabel(selection.action)
        : selection.kind === 'pose' ? devPoseLabel(selection.pose) : devEventOption(selection.event).label;
      const started = selection.kind === 'action'
        ? c.performTestAction?.(selection.action) ?? false
        : selection.kind === 'pose'
          ? (setDeveloperPose(selection.pose), true)
          : (setDeveloperEvent({ event: selection.event, token: selection.token }), true);
      const eventOption = selection.kind === 'event' ? devEventOption(selection.event) : null;
      setScheduledDevTest(null);
      setDevActionResult({
        label,
        started,
        durationMs: eventOption?.durationMs ?? (selection.kind === 'action' ? selection.action === 'bamboo' ? 7000 : 3500 : 5000),
        persistent: eventOption?.persistent,
      });
    }, 2000);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(execution);
    };
  }, [c.performTestAction, scheduledDevTest]);
  useEffect(() => {
    if (!developerPose) return;
    const timeout = window.setTimeout(() => setDeveloperPose(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [developerPose]);
  useEffect(() => {
    if (!devActionResult) return;
    const timeout = window.setTimeout(() => setDevActionResult(null), devActionResult.durationMs);
    return () => window.clearTimeout(timeout);
  }, [devActionResult]);
  useEffect(() => {
    if (!roomChatOpen) return;
    setDevActionOpen(false);
    setScheduledDevTest(null);
    setDeveloperPose(null);
    setDeveloperEvent(null);
  }, [roomChatOpen]);
  const scheduleDevTest = (selection: DevTestSelection) => {
    setDevActionResult(null);
    setDeveloperPose(null);
    setDeveloperEvent(null);
    setDevActionSeconds(2);
    setScheduledDevTest({ ...selection, token: ++devActionToken.current });
    setDevActionOpen(false);
  };
  const roomSessionMessages = msgs.slice(roomChatStartIndexRef.current);
  const latestRoomUser = [...roomSessionMessages].reverse().find(message => message.role === 'user');
  const latestRoomUserIndex = latestRoomUser
    ? roomSessionMessages.findIndex(message => message.id === latestRoomUser.id)
    : -1;
  const latestRoomReply = latestRoomUserIndex >= 0
    ? [...roomSessionMessages.slice(latestRoomUserIndex + 1)].reverse().find(message => message.role === 'assistant' && message.kind === 'chat')
    : undefined;
  const roomBubbleText = roomChatOpen
    ? c.busy && !c.replyDisplay
      ? '唔……'
      : latestRoomReply
        ? c.replyDisplay?.id === latestRoomReply.id ? c.replyDisplay.text : latestRoomReply.text
        : latestRoomUser?.status === 'failed'
          ? `唔……${latestRoomUser.failureReason || '小熊猫这次没有收到回应，可以再发一次呀。'}`
          : ''
    : '';
  const roomDraft = c.draft || (latestRoomUser?.status === 'failed' ? latestRoomUser.text : '');
  const canSendRoomMessage = !c.busy && !c.isPhotoLoading && !c.listening && !!roomDraft.trim();
  const sendRoomMessage = () => {
    if (!canSendRoomMessage) return;
    if (!c.draft.trim() && latestRoomUser?.status === 'failed' && roomDraft.trim() === latestRoomUser.text) {
      void c.retryMessage(latestRoomUser.id);
    } else {
      void c.send(roomDraft);
    }
  };
  const roomKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendRoomMessage();
    }
  };
  const roomNarration = [...msgs].reverse().find((message) => message.role === 'assistant')?.text;
  const roomSpeech = roomOnly && roomNarration ? removeActionAsides(roomNarration) : roomNarration;
  const roomDialogue = roomChatOpen ? roomBubbleText : roomSpeech;
  const lastAssistant = msgs.at(-1);
  const lastAssistantIndex = msgs.length - 1;
  const lastLongUser = lastAssistant?.role === 'assistant' && lastAssistant.kind === 'chat'
    ? [...msgs.slice(0, lastAssistantIndex)].reverse().find(message => message.role === 'user')
    : undefined;
  const showFeelings = Boolean(lastLongUser && splitReply(lastLongUser.text).length >= 20
    && lastAssistant?.kind === 'chat' && !/开玩笑|逗你|笑话|山竹|噎死/.test(lastLongUser.text));
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
  const lastFailed = lastUser && ['failed', 'interrupted'].includes(lastUser.status ?? '') ? lastUser.id : undefined;
  const lastId = msgs[msgs.length - 1]?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [lastId, msgs.length]);
  useEffect(() => { setVoice(null); }, [c.status]);
  const can = !c.busy && !c.isPhotoLoading && !c.listening && (c.draft.trim().length > 0 || !!c.photo);
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (can && (!roomOnly || c.draft.trim())) void c.send();
    }
  };
  const roomComposer = (
    <footer className="cc-composer cc-room-composer" data-testid="room-chat-composer">
      <textarea className="cc-room-input" value={roomDraft} onChange={(e) => c.setDraft(e.target.value)}
        onKeyDown={roomKey} rows={2} maxLength={4000}
        placeholder={c.nightMode ? '今天有什么想放下的？' : '说点什么…'} aria-label="输入消息" data-testid="input-chat" />
      <button type="button" className="cc-send" disabled={!canSendRoomMessage}
        onClick={sendRoomMessage} data-testid="button-send">发送</button>
    </footer>
  );
  const composer = (
    <footer className="cc-composer">
      {c.photo && <div className="cc-photo"><img src={c.photo} alt="待发送的照片" /><button type="button" aria-label="移除照片" onClick={c.removePhoto} data-testid="button-remove-photo"><X size={12} /></button></div>}
      <div className="cc-box">
        <textarea value={c.draft} onChange={(e) => c.setDraft(e.target.value)} onKeyDown={key} rows={2} maxLength={4000}
          placeholder={c.nightMode ? '今天有什么想放下的？' : '想说什么都可以，Enter 发送，Shift+Enter 换行'} aria-label="输入消息" data-testid="input-chat" />
        <div className="cc-tools">
          <VoiceButton text={c.draft} disabled={c.busy} onText={c.setDraft} onActive={c.setListening} onStatus={(m, e) => setVoice({ m, e })} />
          <input ref={fileRef} type="file" accept="image/*" hidden data-testid="input-photo" onChange={(e) => { void c.choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="attach-button" disabled={c.busy || c.isPhotoLoading} onClick={() => fileRef.current?.click()} data-testid="button-attach-photo"><ImagePlus size={15} /> 照片</button>
          <button type="button" className="cc-send" disabled={!can} onClick={() => void c.send()} data-testid="button-send"><SendHorizontal size={16} /> 发送</button>
        </div>
      </div>
      <p className={`cc-status${(voice ? voice.e : c.error) ? ' err' : ''}`} role="status">{voice ? voice.m : c.status}</p>
      <p className="cc-privacy">隐私：最近 40 条消息和日记要点会发送给 AI 来回应你；照片和本地历史只留在本机。</p>
    </footer>
  );
  return (
    <main className={`cc-app${c.nightMode ? ' night' : ''}${window.pandaDesktop ? ' desktop' : ''}${roomOnly ? ' room-only' : ''}`}
      data-testid="companion-chat" data-mode={c.nightMode ? 'night' : 'day'} data-room-only={roomOnly}>
      {(!roomOnly || !roomChatOpen) && <header className="cc-top">
        <div className="cc-title"><strong>小熊猫日记</strong><span>{c.nightMode ? '夜深了，轻轻聊' : '今天想聊点什么'}</span></div>
        <div className="cc-actions">
          <button type="button" onClick={() => setPanel('diary')} data-testid="button-diary"><BookOpen size={16} /> 日记本</button>
          {import.meta.env.DEV && c.performTestAction && (
            <button type="button" onClick={() => setDevActionOpen(true)} data-testid="button-dev-action"><Play size={15} /> 动作检测</button>
          )}
          <button type="button" onClick={() => setPanel('gifts')} data-testid="button-gifts"><GiftIcon size={16} /> 小礼物</button>
          {import.meta.env.DEV && DevGiftTool && c.addTestGift && (
            <button type="button" onClick={() => setDevGiftOpen(true)} data-testid="button-dev-gift"><Wrench size={15} /> 测试礼物</button>
          )}
          {window.pandaDesktop && <button type="button" aria-label="收起聊天，回到桌面" onClick={() => window.pandaDesktop?.hideJournal()} data-testid="button-hide-chat"><X size={16} /></button>}
        </div>
      </header>}
      <PetStage pet={c.pet} thinking={c.busy && !c.replyDisplay} motion={c.nightMode ? 'sleep' : 'idle'} nightMode={c.nightMode}
        developerPose={import.meta.env.DEV ? developerPose : null}
        developerEvent={import.meta.env.DEV && roomOnly ? developerEvent : null}
        debugClicks={false} showInteractionBubble={roomOnly}
        interactionBubbleText={roomOnly && roomDialogue ? removeActionAsides(roomDialogue) : undefined}
        onChatModeChange={roomOnly ? onRoomChatModeChange : undefined} />
      {!window.pandaDesktop && <GiftDrop gift={c.state.pendingGift} startedAt={c.state.giftDropStartedAt} onCollect={c.collectPresent} />}
      {roomOnly ? (
        <>
          {roomChatOpen && roomComposer}
        </>
      ) : (
        <>
          <section className="cc-scroll" aria-label="聊天记录" role="log" aria-live="polite">
            {msgs.map((m) => <Bubble key={m.id} m={m} c={c} canRetry={m.id === lastFailed} />)}
            {showFeelings && !c.busy && lastLongUser && <EmotionCheckIn key={lastAssistant?.id} source={lastLongUser.text} disabled={false} onChoose={text => void c.send(text)} />}
            {c.busy && !c.replyDisplay && <div className="cc-row bot"><div className="cc-bubble typing" aria-label="小熊猫正在想"><i /><i /><i /></div></div>}
            <div ref={endRef} />
          </section>
          {composer}
        </>
      )}
      {panel === 'diary' && <Diary c={c} onClose={() => setPanel(null)} />}
      {panel === 'gifts' && <Gifts c={c} onClose={() => setPanel(null)} />}
      {import.meta.env.DEV && devActionOpen && c.performTestAction && (
        <Modal title="动作检测" sub="选一个动作指令，小熊猫将在 2 秒后执行。倒数时换选其他动作会重新计时。"
          onClose={() => setDevActionOpen(false)} testid="dialog-dev-action">
          <h3 className="cc-dev-action-section-title">动态动作</h3>
          <div className="cc-dev-action-grid">
            {devActionOptions.map(({ action, label }) => (
              <button key={action} type="button" data-testid={`button-dev-action-${action}`}
                disabled={c.pet.stage !== 'present'} onClick={() => scheduleDevTest({ kind: 'action', action })}>
                <Play size={14} />{label}
              </button>
            ))}
          </div>
          <h3 className="cc-dev-action-section-title cc-dev-action-section-static">静态姿势</h3>
          <div className="cc-dev-action-grid">
            {devPoseOptions.map(({ pose, label }) => (
              <button key={pose} type="button" data-testid={`button-dev-pose-${pose}`}
                disabled={c.pet.stage !== 'present'} onClick={() => scheduleDevTest({ kind: 'pose', pose })}>
                <Pause size={14} />{label}
              </button>
            ))}
          </div>
          {roomOnly && (
            <>
              <h3 className="cc-dev-action-section-title cc-dev-action-section-static">特殊动作与事件</h3>
              <div className="cc-dev-action-grid">
                {devEventOptions.map(({ event, label }) => (
                  <button key={event} type="button" data-testid={`button-dev-event-${event}`}
                    disabled={c.pet.stage !== 'present'} onClick={() => scheduleDevTest({ kind: 'event', event })}>
                    <Play size={14} />{label}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="cc-dev-action-help">
            {c.pet.stage !== 'present' ? '小熊猫当前不空闲，等它回到房间后再检测。'
              : roomOnly ? '选择后面板会收起，方便观察；普通动作与姿势会自动恢复，浴缸和浴球动作可再次提起小熊猫结束。'
                : '选择后面板会收起，方便观察小熊猫；动态动作持续约 3.5 秒，静态姿势展示 5 秒后恢复。'}
          </p>
        </Modal>
      )}
      {import.meta.env.DEV && scheduledDevTest && (
        <div className="cc-dev-action-toast" role="status" aria-live="polite" data-testid="dev-action-countdown">
          <span>{scheduledDevTest.kind === 'action' ? devActionLabel(scheduledDevTest.action)
            : scheduledDevTest.kind === 'pose' ? devPoseLabel(scheduledDevTest.pose)
              : devEventOption(scheduledDevTest.event).label}指令将在 {devActionSeconds} 秒后执行</span>
          <button type="button" onClick={() => setScheduledDevTest(null)}>取消</button>
        </div>
      )}
      {import.meta.env.DEV && devActionResult && (
        <div className={`cc-dev-action-toast${devActionResult.started ? '' : ' error'}`} role="status" aria-live="polite">
          {devActionResult.started
            ? `正在展示：${devActionResult.label}${devActionResult.persistent ? '（再次提起小熊猫可结束）' : `（${(devActionResult.durationMs / 1000).toFixed(1)} 秒后恢复）`}`
            : '没有执行：小熊猫在倒数期间变忙了。'}
        </div>
      )}
      {import.meta.env.DEV && devGiftOpen && DevGiftTool && c.addTestGift && (
        <Suspense fallback={null}>
          <DevGiftTool onClose={() => setDevGiftOpen(false)} onCreate={c.addTestGift} />
        </Suspense>
      )}
    </main>
  );
}
