import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCoopHouseholdQueryKey,
  useCreateCoopHousehold,
  useCreateCoopInvitation,
  useGetCoopHousehold,
  useJoinCoopHousehold,
  useUpdateCoopShareNote,
  type CoopSharedState,
} from '@workspace/api-client-react';
import { ArrowLeft, Clipboard, DoorOpen, HeartHandshake, LockKeyhole, RefreshCw, UsersRound } from 'lucide-react';
import './CoopHub.css';

type Props = {
  onClose: () => void;
  sharedSnapshot: CoopSharedState;
  onHouseholdCreated?: () => void;
};

const dateLabel = (value: number) => new Intl.DateTimeFormat('zh-CN', {
  month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(value);

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return '刚才没有连上共同房间，请稍后再试。';
}

export function CoopHub({ onClose, sharedSnapshot, onHouseholdCreated }: Props) {
  const queryClient = useQueryClient();
  const household = useGetCoopHousehold({
    query: { queryKey: getGetCoopHouseholdQueryKey(), refetchOnWindowFocus: true, refetchInterval: 30_000, staleTime: 0 },
  });
  const createHousehold = useCreateCoopHousehold();
  const createInvitation = useCreateCoopInvitation();
  const joinHousehold = useJoinCoopHousehold();
  const updateNote = useUpdateCoopShareNote();
  const [code, setCode] = useState('');
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState('');
  const data = household.data;
  const busy = createHousehold.isPending || createInvitation.isPending || joinHousehold.isPending;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetCoopHouseholdQueryKey() });

  const startHousehold = async () => {
    setFormError('');
    try {
      await createHousehold.mutateAsync({ data: { sharedState: sharedSnapshot } });
      onHouseholdCreated?.();
      setInvitation(null);
      await invalidate();
    } catch (error) { setFormError(errorText(error)); }
  };

  const makeInvitation = async () => {
    setFormError('');
    try {
      const result = await createInvitation.mutateAsync(undefined);
      setInvitation(result);
      await invalidate();
    } catch (error) { setFormError(errorText(error)); }
  };

  const join = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.trim().length < 8) return;
    setFormError('');
    try {
      await joinHousehold.mutateAsync({ data: { code: code.trim().toUpperCase() } });
      setCode('');
      await invalidate();
    } catch (error) { setFormError(errorText(error)); }
  };

  const toggleExcluded = async (id: string, excluded: boolean) => {
    setFormError('');
    try {
      await updateNote.mutateAsync({ id, data: { excluded } });
      await invalidate();
    } catch (error) { setFormError(errorText(error)); }
  };

  const copyCode = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setFormError('暂时无法复制，请手动记下邀请码。'); }
  };

  return (
    <main className="coop-hub" aria-label="共同照看中心">
      <div className="coop-hub-frame">
        <header className="coop-header">
          <button className="coop-back" type="button" onClick={onClose}><ArrowLeft size={16} /> 回到房间</button>
          <div className="coop-brand"><span className="coop-stamp">熊</span><span>小熊猫日记<small>共同照看</small></span></div>
          <div className="coop-private-mark"><LockKeyhole size={14} /> 日记与聊天仍只属于你</div>
        </header>

        <section className="coop-intro">
          <div className="coop-intro-copy">
            <p className="coop-kicker">A LITTLE ROOM, SHARED</p>
            <h1>让小熊猫，<br /><em>住进两个人的日常。</em></h1>
            <p>一起布置房间、照顾同一只小熊猫。它只会带去简短的心情摘要，不会转述你们的聊天或日记。</p>
          </div>
          <div className="coop-room-illustration" aria-hidden="true">
            <span className="coop-window"><i /><i /><i /><i /></span>
            <span className="coop-shelf" />
            <span className="coop-plant" />
            <span className="coop-panda">
              <i className="ear left" /><i className="ear right" />
              <i className="face"><b /><b /><em /></i>
            </span>
            <span className="coop-floor" />
            <span className="coop-rug" />
          </div>
        </section>

        {(household.isError || formError) && (
          <div className="coop-alert" role="alert">
            <span>{formError || '共同房间暂时无法读取。你仍可以稍后重试，或先尝试建立 / 加入房间。'}</span>
            {household.isError && <button type="button" onClick={() => void household.refetch()}><RefreshCw size={14} /> 重试</button>}
          </div>
        )}

        {household.isLoading ? (
          <section className="coop-loading" aria-label="正在读取共同房间">
            <div className="coop-skeleton-line" /><div className="coop-skeleton-card" /><div className="coop-skeleton-card short" />
          </section>
        ) : data ? (
          <>
            <section className="coop-household-card">
              <div className="coop-household-heading">
                <div className="coop-icon-tile"><UsersRound size={21} /></div>
                <div><p className="coop-kicker">YOUR HOUSEHOLD</p><h2>共同小房间</h2></div>
                <span className="coop-member-count">{data.memberCount} / 2 位照看者</span>
              </div>
              <div className="coop-players" aria-label="房间成员">
                <div className="coop-player"><span className="coop-avatar">你</span><span><strong>你</strong><small>玩家 {data.playerNumber}</small></span><i className="online-dot" /></div>
                <div className={`coop-player ${data.memberCount === 1 ? 'waiting' : ''}`}>
                  <span className="coop-avatar partner">{data.memberCount === 2 ? '伴' : '+'}</span>
                  <span><strong>{data.memberCount === 2 ? '另一位照看者' : '空着的小椅子'}</strong><small>{data.memberCount === 2 ? '已加入房间' : '等待第二位玩家'}</small></span>
                  {data.memberCount === 1 && <span className="coop-waiting-dot" />}
                </div>
              </div>
              {data.sharedState.gifts.length > 0 && (
                <div className="coop-shared-gifts">
                  <div><strong>房间里的小礼物</strong><small>由两位照看者一起收藏</small></div>
                  <div className="coop-gift-list">{data.sharedState.gifts.slice(-4).reverse().map(gift => (
                    <span key={gift.id} title={`来自 ${gift.animal}`}>{gift.item}</span>
                  ))}</div>
                </div>
              )}
              {data.memberCount === 1 && data.playerNumber === 1 && (
                <div className="coop-invite-box">
                  <div><strong>邀请一位你信任的人</strong><small>每个小房间只有两位玩家。邀请码仅供第二位玩家加入。</small></div>
                  {invitation ? (
                    <div className="coop-code-row">
                      <code>{invitation.code}</code>
                      <button type="button" onClick={() => void copyCode()}><Clipboard size={14} />{copied ? '已复制' : '复制邀请码'}</button>
                      <small>有效至 {dateLabel(invitation.expiresAt)}</small>
                    </div>
                  ) : (
                    <button className="coop-primary" type="button" onClick={() => void makeInvitation()} disabled={busy}>
                      <DoorOpen size={16} />{createInvitation.isPending ? '正在准备…' : '生成邀请码'}
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="coop-notes-grid">
              <article className="coop-note-panel">
                <div className="coop-section-title"><div><p className="coop-kicker">READY WHEN PANDA RETURNS</p><h2>出门前的小纸条</h2></div><span className="coop-count">{data.queuedNotes.length}</span></div>
                <p className="coop-section-copy">新日记会先整理成只含情绪的纸条。轻松又不具体的开心日常默认自动带回；其他纸条也会带回，除非你标记不分享。</p>
                {data.queuedNotes.length ? data.queuedNotes.map(note => (
                  <article className={`coop-note ${note.excluded ? 'excluded' : ''}`} key={note.id}>
                    <div className="coop-note-top"><span className={`coop-category ${note.category}`}>{note.automatic ? '轻松日常 · 自动带回' : note.category === 'worry' ? '心情' : note.category === 'idea' ? '灵感' : '日常'}</span><time>{dateLabel(note.createdAt)}</time></div>
                    <strong>{note.title}</strong><p>{note.message}</p>
                    <button className="coop-exclude" type="button" disabled={updateNote.isPending} onClick={() => void toggleExcluded(note.id, !note.excluded)}>
                      {note.excluded ? '重新加入传递' : '这次先不传递'}
                    </button>
                  </article>
                )) : (
                  <div className="coop-empty"><span className="coop-empty-mark"><HeartHandshake size={19} /></span><strong>这里还没有纸条</strong><p>小熊猫会把新的日常整理成心情纸条；你可以逐条排除不想带给对方的内容。</p></div>
                )}
              </article>

              <article className="coop-note-panel inbox-panel">
                <div className="coop-section-title"><div><p className="coop-kicker">A SMALL NOTE FROM THEM</p><h2>小熊猫带回来的</h2></div><span className="coop-count">{data.inbox.length}</span></div>
                <p className="coop-section-copy">这里只展示情绪摘要与短标题，不会出现原始聊天文字或私人日记。</p>
                {data.inbox.length ? [...data.inbox].sort((a, b) => b.createdAt - a.createdAt).map(note => (
                  <article className="coop-note received" key={note.id}>
                    <div className="coop-note-top"><span className={`coop-category ${note.category}`}>{note.automatic ? '开心日常' : '心情纸条'}</span><time>{dateLabel(note.createdAt)}</time></div>
                    <strong>{note.title}</strong><p>{note.message}</p>
                  </article>
                )) : (
                  <div className="coop-empty"><span className="coop-empty-mark"><HeartHandshake size={19} /></span><strong>今天还没有新消息</strong><p>有些特别开心、又不太具体的小心情，也可能由小熊猫悄悄带来。</p></div>
                )}
              </article>
            </section>
            <p className="coop-footer-note">共享的是房间和照看日常；每个人的聊天与日记，依然留在各自设备里。</p>
          </>
        ) : (
          <section className="coop-start-grid">
            <article className="coop-start-card primary-start">
              <span className="coop-step">01 / 开始</span>
              <h2>把现在的房间，<br />变成两个人的家。</h2>
              <p>保留本机现有布置，建立一个只容纳两位玩家的共同房间。聊天和日记不会被上传。</p>
              <button className="coop-primary" type="button" disabled={busy} onClick={() => void startHousehold()}>
                <HeartHandshake size={17} />{createHousehold.isPending ? '正在整理房间…' : '建立共同房间'}
              </button>
            </article>
            <article className="coop-start-card">
              <span className="coop-step">02 / 加入</span>
              <h2>朋友已经准备好<br />一间小房间？</h2>
              <p>输入对方生成的邀请码，成为第二位照看者。一个房间最多两个人。</p>
              <form className="coop-join-form" onSubmit={join}>
                <label htmlFor="coop-code">邀请码</label>
                <input id="coop-code" value={code} onChange={event => setCode(event.target.value.toUpperCase().slice(0, 12))} minLength={8} maxLength={12} autoComplete="off" placeholder="输入 8–12 位邀请码" />
                <button className="coop-secondary" type="submit" disabled={busy || code.trim().length < 8}>{joinHousehold.isPending ? '正在加入…' : '加入房间'}</button>
              </form>
            </article>
          </section>
        )}
        <button className="coop-close-bottom" type="button" onClick={onClose}>保存好心情，回到小熊猫身边</button>
      </div>
    </main>
  );
}
