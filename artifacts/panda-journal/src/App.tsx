import { useEffect, useRef, useState } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ArrowDownRight, ArrowRight, HeartPulse, LockKeyhole, Sparkles } from 'lucide-react';
import {
  getGetCoopHouseholdQueryKey,
  useCreateCoopShareNote,
  useDeliverNextCoopShareNote,
  useGetCoopHousehold,
  useRecordCoopCareStatInteraction,
  useUpdateCoopState,
  type CoopCareStats,
  type CoopSharedState,
} from '@workspace/api-client-react';
import { CompanionChat } from '@/components/CompanionChat';
import { CoopHub } from '@/components/CoopHub';
import { StatsTemplate } from '@/components/StatsTemplate';
import { PetCharacterProvider, usePetCharacter } from '@/hooks/use-pet-character';
import { PetCharacterPicker } from '@/components/PetCharacterPicker';
import { useCompanion } from '@/hooks/use-companion';
import { isDesktop } from '@/lib/desktop';
import { queryClient } from '@/lib/query-client';
import { readRoomFurnitureLayout } from '@/lib/room-furniture-layout';
import './landing.css';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.PROD
  ? `${window.location.origin}/api/__clerk`
  : undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#a85e4d',
    colorForeground: '#35463a',
    colorMutedForeground: '#7b8577',
    colorDanger: '#ad594f',
    colorBackground: '#f7f2e5',
    colorInput: '#fffaf0',
    colorInputForeground: '#35463a',
    colorNeutral: '#d8d0be',
    fontFamily: '"DM Sans", "Noto Serif SC", sans-serif',
    borderRadius: '0.65rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#f7f2e5] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#d9d0bd] shadow-[4px_5px_0_#dfd5c1]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#35463a] font-medium',
    headerSubtitle: 'text-[#7b8577]',
    socialButtonsBlockButtonText: 'text-[#35463a]',
    formFieldLabel: 'text-[#526354]',
    footerActionLink: 'text-[#a85e4d] font-semibold',
    footerActionText: 'text-[#7b8577]',
    dividerText: 'text-[#879082]',
    identityPreviewEditButton: 'text-[#a85e4d]',
    formFieldSuccessText: 'text-[#5f805e]',
    alertText: 'text-[#9a5147]',
    logoBox: 'rounded-none',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#d8d0be] bg-[#fffaf0] hover:bg-[#f1ead8]',
    formButtonPrimary: 'bg-[#a85e4d] hover:bg-[#934d43] text-[#fff3df]',
    formFieldInput: 'border-[#d8d0be] bg-[#fffaf0] text-[#35463a]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#ded7c7]',
    alert: 'bg-[#f5e3d7] border-[#d9aa91]',
    otpCodeFieldInput: 'border-[#d8d0be] bg-[#fffaf0] text-[#35463a]',
    formFieldRow: 'gap-1',
    main: 'gap-4',
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) client.clear();
    previousUserId.current = userId;
  }), [addListener, client]);
  return null;
}

function SignInPage() {
  return <div className="auth-screen"><div className="auth-note"><span className="auth-mark">熊</span><p>回到你和小熊猫的小房间。</p></div>
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="auth-screen"><div className="auth-note"><span className="auth-mark">熊</span><p>从一间只属于你的房间开始。</p></div>
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function Landing() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="landing-brand"><span className="landing-mark">熊</span><span>小熊猫日记<small>A SMALL ROOM FOR BIG FEELINGS</small></span></Link>
        <nav><a href="#how-it-works">怎么陪伴</a><a href="#privacy">关于隐私</a><Link href="/stats-template">成长档案示例</Link></nav>
        <div className="landing-auth">
          <Link href="/sign-in" className="landing-login">登录</Link>
          <Link href="/sign-up" className="landing-signup">开始照看 <ArrowRight size={15} /></Link>
        </div>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-eyebrow"><span /> 一间慢慢长大的像素小屋</p>
          <h1>把今天说给<br /><em>小熊猫听。</em></h1>
          <p className="landing-deck">在一间暖暖的小房间里，和小熊猫聊一会儿、写下心情。它会记得你愿意留下的日记，也会在你需要时安静陪着。</p>
          <div className="landing-actions">
            <Link href="/room" className="landing-cta">单人开始照看 <ArrowRight size={17} /></Link>
            <Link href="/sign-up" className="landing-text-link">创建账号，邀请另一位玩家 <ArrowDownRight size={15} /></Link>
          </div>
          <div className="landing-trust"><LockKeyhole size={14} /><span>聊天与日记保存在你的设备上</span><i /></div>
          <Link href="/stats-template" className="landing-text-link stats-template-entry">先看看成长档案示例 <ArrowRight size={14} /></Link>
        </div>
        <div className="landing-scene cover-scene" role="img" aria-label="小熊猫在自己的像素房间里休息">
          <div
            className="cover-room-backdrop"
            style={{ backgroundImage: `url("${basePath}/static/room/room-background-pixellab.png?v=cover-room-2")` }}
            aria-hidden="true"
          />
          <div className="cover-scene-shade" aria-hidden="true" />
          <div className="cover-scene-label" aria-hidden="true">小熊猫的房间</div>
          <div className="cover-panda-shadow" aria-hidden="true" />
          <img
            className="cover-panda"
            src={`${basePath}/static/panda/idle.png?v=cover-panda-1`}
            alt=""
            aria-hidden="true"
          />
          <div className="cover-caption" aria-hidden="true">
            <span>16:42</span>
            <span>今天慢一点也没关系</span>
          </div>
        </div>
        <div className="hero-index">01 — 04</div>
      </section>

      <section className="landing-manifesto" id="how-it-works">
        <div className="manifesto-number">01<br /><span>照看日常</span></div>
        <div><p className="landing-eyebrow">A COMPANION, NOT A CHECKLIST</p><h2>不必把每一天，<br />都过成一件大事。</h2></div>
        <p className="manifesto-copy">聊聊窗外的雨、今天有点累，或者刚刚想到的小计划。小熊猫会在房间里活动，也会把你愿意留下的心情，安静地收进本地日记。</p>
      </section>

      <section className="landing-steps">
        <article className="step-card step-chat"><span>01 / TALK</span><h3>说一会儿</h3><p>随手聊两句，或认真讲讲心里的事。小熊猫会记住上下文，接住你的话。</p><div className="step-chat-art"><span>今天想和你待一会儿。</span><i /></div></article>
        <article className="step-card step-journal"><span>02 / KEEP</span><h3>留下心情</h3><p>自动整理的日记只在本机保存。共同照看时，小熊猫只带回情绪摘要；你可以把不想分享的标记出来。</p><div className="step-journal-art"><b>今天的心情</b><i /><i /><i /></div></article>
        <article className="step-card step-room"><span>03 / ROOM</span><h3>布置小房间</h3><p>挪动家具、看看小熊猫在做什么。日子有自己的节奏，房间也是。</p><div className="step-room-art"><i /><b /><span /></div></article>
      </section>

      <section className="landing-coop">
        <div className="coop-pixel-art" aria-hidden="true"><span className="coop-pixel-window" /><span className="coop-pixel-seat" /><span className="coop-pixel-plant" /><span className="coop-pixel-floor" /></div>
        <div><p className="landing-eyebrow">WHEN YOU WANT TO SHARE</p><h2>也可以，让一个人<br />和你一起照看它。</h2><p>共同房间只容纳两位玩家。房间布置会一起保存；私人聊天和日记不会共享。小熊猫先提供低细节的情绪摘要，你可以排除不想带走的内容；轻松又不具体的开心日常会自动带回。</p><Link href="/sign-up" className="landing-text-link">了解共同照看 <ArrowRight size={15} /></Link></div>
      </section>

      <section className="landing-privacy" id="privacy">
        <div className="privacy-title"><p className="landing-eyebrow">A QUIET PROMISE</p><h2>你说的话，<br /><em>由你决定去向。</em></h2></div>
        <div className="privacy-list">
          <article><span>01</span><div><strong>先是你的空间</strong><p>聊天、照片和日记历史保存在当前设备，属于你自己的小房间。</p></div></article>
          <article><span>02</span><div><strong>你决定哪些不分享</strong><p>小熊猫会把新日记整理成只含情绪的摘要；你可逐条排除，其他纸条会在它出门回来时带给另一位照看者。</p></div></article>
          <article><span>03</span><div><strong>不会把原话带走</strong><p>另一位照看者只会看到短标题和情绪摘要，不会看到聊天原文或个人日记。</p></div></article>
        </div>
      </section>
      <footer className="landing-footer"><span>小熊猫日记</span><p>一间小屋，一只慢慢长大的小熊猫。</p><Link href="/sign-up" className="footer-link">打开房门 <ArrowRight size={14} /></Link></footer>
    </main>
  );
}

function localRoomSnapshot(
  gifts: ReturnType<typeof useCompanion>['state']['gifts'],
  careStats: ReturnType<typeof useCompanion>['state']['careStats'],
): CoopSharedState {
  let placedProps: Record<string, boolean> = { bed: true, rack: true, tub: true };
  let furnitureLayout: CoopSharedState['furnitureLayout'] = {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem('little-panda-room-props-v1') ?? 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)) placedProps = { ...placedProps, ...value as Record<string, boolean> };
  } catch { /* keep the room's existing defaults */ }
  try { furnitureLayout = readRoomFurnitureLayout(localStorage); } catch { /* keep the room's empty saved layout */ }
  return {
    gifts: gifts.map(gift => ({ ...gift })),
    furnitureLayout,
    placedProps,
    careStats,
  };
}

function Room() {
  const petCharacter = usePetCharacter();
  const companion = useCompanion({ allowRandomPerformanceFall: isDesktop() });
  const client = useQueryClient();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const household = useGetCoopHousehold({ query: {
    queryKey: getGetCoopHouseholdQueryKey(),
    enabled: !!isSignedIn,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    staleTime: 0,
  } });
  const createShareNote = useCreateCoopShareNote();
  const updateCoopState = useUpdateCoopState();
  const recordSharedCareInteraction = useRecordCoopCareStatInteraction();
  const deliverNote = useDeliverNextCoopShareNote();
  const [hubOpen, setHubOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'preparing' | 'error'>('idle');
  const lastAppliedSharedState = useRef('');
  const householdRef = useRef(household.data);
  const lastSubmittedSharedState = useRef('');
  const seenDiaryIds = useRef<Set<string> | null>(null);
  const mergeSharedGiftsRef = useRef(companion.mergeSharedGifts);
  const mergeSharedCareStatsRef = useRef(companion.mergeSharedCareStats);
  const acknowledgeCareStatInteractionRef = useRef(companion.acknowledgeCareStatInteraction);
  const companionRef = useRef(companion);
  const processingCareInteractions = useRef(new Set<string>());
  const updateSharedStateRef = useRef(updateCoopState.mutateAsync);
  const recordSharedCareInteractionRef = useRef(recordSharedCareInteraction.mutateAsync);
  const deliverNextRef = useRef(deliverNote.mutateAsync);
  const createShareNoteRef = useRef(createShareNote.mutateAsync);
  const previousStage = useRef(companion.pet.stage);
  householdRef.current = household.data;
  companionRef.current = companion;
  mergeSharedGiftsRef.current = companion.mergeSharedGifts;
  mergeSharedCareStatsRef.current = companion.mergeSharedCareStats;
  acknowledgeCareStatInteractionRef.current = companion.acknowledgeCareStatInteraction;
  updateSharedStateRef.current = updateCoopState.mutateAsync;
  recordSharedCareInteractionRef.current = recordSharedCareInteraction.mutateAsync;
  deliverNextRef.current = deliverNote.mutateAsync;
  createShareNoteRef.current = createShareNote.mutateAsync;

  const sharedStateFingerprint = household.data ? JSON.stringify(household.data.sharedState) : '';
  useEffect(() => {
    if (!household.data || !sharedStateFingerprint || sharedStateFingerprint === lastAppliedSharedState.current) return;
    lastAppliedSharedState.current = sharedStateFingerprint;
    mergeSharedGiftsRef.current(household.data.sharedState.gifts);
    if (household.data.sharedState.careStats) {
      mergeSharedCareStatsRef.current(household.data.sharedState.careStats as CoopCareStats);
    }
    const { furnitureLayout, placedProps } = household.data.sharedState;
    window.dispatchEvent(new CustomEvent('panda-coop-shared-state', { detail: { furnitureLayout, placedProps } }));
  }, [household.data, sharedStateFingerprint]);

  const pendingCareInteractionsFingerprint = JSON.stringify(companion.state.pendingCareStatInteractions);
  useEffect(() => {
    const activeHousehold = householdRef.current;
    if (!activeHousehold || !companion.state.pendingCareStatInteractions.length) return undefined;
    let cancelled = false;
    const flushPendingCareInteractions = async () => {
      for (const interaction of companionRef.current.state.pendingCareStatInteractions) {
        if (cancelled) return;
        if (processingCareInteractions.current.has(interaction.interactionId)) continue;
        processingCareInteractions.current.add(interaction.interactionId);
        try {
          const response = await recordSharedCareInteractionRef.current({
            data: {
              interactionId: interaction.interactionId,
              category: interaction.category,
              occurredAt: interaction.occurredAt,
            },
          });
          acknowledgeCareStatInteractionRef.current(interaction.interactionId, response.careStats as CoopCareStats);
          client.setQueryData(getGetCoopHouseholdQueryKey(), (old: typeof activeHousehold | undefined) => old
            ? { ...old, sharedState: { ...old.sharedState, careStats: response.careStats } }
            : old);
        } catch {
          return;
        } finally {
          processingCareInteractions.current.delete(interaction.interactionId);
        }
      }
    };
    void flushPendingCareInteractions();
    const retryTimer = window.setInterval(() => { void flushPendingCareInteractions(); }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
    };
  }, [pendingCareInteractionsFingerprint, household.data?.householdId, client]);

  const localCareStatsFingerprint = JSON.stringify(companion.state.careStats);
  const sharedCareStatsFingerprint = JSON.stringify(household.data?.sharedState.careStats ?? null);
  useEffect(() => {
    const activeHousehold = householdRef.current;
    if (!activeHousehold || companionRef.current.state.pendingCareStatInteractions.length) return;
    const careStats = companionRef.current.state.careStats;
    if (JSON.stringify(activeHousehold.sharedState.careStats ?? null) === JSON.stringify(careStats)) return;
    const sharedState: CoopSharedState = { ...activeHousehold.sharedState, careStats };
    const fingerprint = JSON.stringify(sharedState);
    if (fingerprint === lastSubmittedSharedState.current) return;
    lastSubmittedSharedState.current = fingerprint;
    void updateSharedStateRef.current({ data: { sharedState } })
      .then(updated => {
        client.setQueryData(getGetCoopHouseholdQueryKey(), old =>
          old ? { ...old, sharedState: updated.sharedState } : old);
      })
      .catch(() => { lastSubmittedSharedState.current = ''; });
  }, [localCareStatsFingerprint, sharedCareStatsFingerprint, pendingCareInteractionsFingerprint, client]);

  const localGiftFingerprint = JSON.stringify(companion.state.gifts);
  const sharedGiftFingerprint = JSON.stringify(household.data?.sharedState.gifts ?? []);
  useEffect(() => {
    const activeHousehold = householdRef.current;
    if (!activeHousehold) return;
    const localGifts = companion.state.gifts.map(gift => ({ ...gift }));
    const sharedGifts = activeHousehold.sharedState.gifts;
    const merged = [...new Map([...sharedGifts, ...localGifts].map(gift => [gift.id, gift])).values()].slice(-300);
    if (JSON.stringify(merged) === JSON.stringify(sharedGifts)) return;
    const sharedState = { ...activeHousehold.sharedState, gifts: merged };
    const fingerprint = JSON.stringify(sharedState);
    if (fingerprint === lastSubmittedSharedState.current) return;
    lastSubmittedSharedState.current = fingerprint;
    void updateSharedStateRef.current({ data: { sharedState } })
      .then(updated => {
        client.setQueryData(getGetCoopHouseholdQueryKey(), old =>
          old ? { ...old, sharedState: updated.sharedState } : old);
        return client.invalidateQueries({ queryKey: getGetCoopHouseholdQueryKey() });
      })
      .catch(() => { lastSubmittedSharedState.current = ''; });
  }, [localGiftFingerprint, sharedGiftFingerprint, client]);

  useEffect(() => {
    let timer = 0;
    const onRoomChange = (event: Event) => {
      const detail = (event as CustomEvent<{ furnitureLayout?: CoopSharedState['furnitureLayout']; placedProps?: Record<string, boolean> }>).detail;
      const activeHousehold = householdRef.current;
      if (!activeHousehold || !detail) return;
      const sharedState: CoopSharedState = {
        ...activeHousehold.sharedState,
        furnitureLayout: detail.furnitureLayout ?? {},
        placedProps: detail.placedProps ?? {},
      };
      const fingerprint = JSON.stringify(sharedState);
      if (fingerprint === JSON.stringify(activeHousehold.sharedState) || fingerprint === lastSubmittedSharedState.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        lastSubmittedSharedState.current = fingerprint;
        try {
          const updated = await updateSharedStateRef.current({ data: { sharedState } });
          client.setQueryData(getGetCoopHouseholdQueryKey(), (old: typeof activeHousehold | undefined) =>
            old ? { ...old, sharedState: updated.sharedState } : old);
          await client.invalidateQueries({ queryKey: getGetCoopHouseholdQueryKey() });
        } catch {
          lastSubmittedSharedState.current = '';
        }
      }, 320);
    };
    window.addEventListener('panda-coop-room-change', onRoomChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('panda-coop-room-change', onRoomChange);
    };
  }, [client]);

  useEffect(() => {
    const before = previousStage.current;
    previousStage.current = companion.pet.stage;
    if (before !== 'away' && before !== 'returning') return;
    if (companion.pet.stage !== 'present' || household.data?.memberCount !== 2 || deliverNote.isPending) return;
    void deliverNextRef.current(undefined)
      .then(() => client.invalidateQueries({ queryKey: getGetCoopHouseholdQueryKey() }))
      .catch(() => undefined);
  }, [companion.pet.stage, household.data?.memberCount, deliverNote.isPending, client]);

  const diaryIdsFingerprint = JSON.stringify(companion.state.diary.map(entry => entry.id));
  useEffect(() => {
    const entries = companion.state.diary;
    const currentIds = new Set(entries.map(entry => entry.id));
    if (!isSignedIn || household.data?.memberCount !== 2) {
      seenDiaryIds.current = currentIds;
      return;
    }
    if (!seenDiaryIds.current) {
      seenDiaryIds.current = currentIds;
      return;
    }
    const newEntries = entries.filter(entry => !seenDiaryIds.current?.has(entry.id));
    seenDiaryIds.current = currentIds;
    if (!newEntries.length) return;

    setShareStatus('preparing');
    void Promise.allSettled(
      newEntries.map(entry => createShareNoteRef.current({ data: { text: entry.text } })),
    ).then(results => {
      const failed = results.some(result => result.status === 'rejected');
      setShareStatus(failed ? 'error' : 'idle');
      if (!failed) void client.invalidateQueries({ queryKey: getGetCoopHouseholdQueryKey() });
    });
  }, [diaryIdsFingerprint, isSignedIn, household.data?.memberCount, client]);

  return (
    <div className="room-page">
      <div inert={!isDesktop() && petCharacter.isSignedIn && (!petCharacter.selection?.locked || petCharacter.isLoading || !!petCharacter.error)}>
        <CompanionChat companion={companion} roomOnly={!isDesktop()} />
      </div>
      {!isDesktop() && !hubOpen && <PetCharacterPicker compact onJoinHousehold={() => setHubOpen(true)} />}
      <header className="room-account-bar">
        <Link href="/stats-template" className="room-coop-open"><HeartPulse size={15} />成长档案 · {petCharacter.name}</Link>
        <button type="button" className="room-coop-open" onClick={() => {
          if (!isSignedIn) {
            setLocation('/sign-up');
            return;
          }
          setHubOpen(true);
        }}><Sparkles size={15} />共同照看</button>
        <span className="room-account-status">
          {shareStatus === 'preparing' ? '小熊猫正在整理新的心情' : shareStatus === 'error' ? '有一条心情暂时未整理成功' : household.data?.memberCount === 2 ? '两个人的小房间' : '你的私人小房间'}
        </span>
        {isSignedIn
          ? <button type="button" className="room-signout" onClick={() => void signOut({ redirectUrl: basePath || '/' })} aria-label="退出账号">退出</button>
          : <button type="button" className="room-signout" onClick={() => setLocation('/sign-in')}>登录</button>}
      </header>
      {hubOpen && <CoopHub
        onClose={() => setHubOpen(false)}
        onHouseholdCreated={companion.clearPendingCareStatInteractions}
        sharedSnapshot={localRoomSnapshot(companion.state.gifts, companion.state.careStats)}
      />}
    </div>
  );
}

function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/room" /></Show><Show when="signed-out"><Landing /></Show></>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: '欢迎回来', subtitle: '回到你的小熊猫房间' } },
        signUp: { start: { title: '打开房间的门', subtitle: '创建账号，开始照看小熊猫' } },
      }}
      routerPush={to => setLocation(stripBase(to))}
      routerReplace={to => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <PetCharacterProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/stats-template" component={StatsTemplate} />
          <Route path="/room" component={Room} />
          <Route><Redirect to="/" /></Route>
        </Switch>
        </PetCharacterProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
