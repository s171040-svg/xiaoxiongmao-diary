import { useEffect, useRef, useState } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ArrowDownRight, ArrowRight, LockKeyhole } from 'lucide-react';
import { CompanionChat } from '@/components/CompanionChat';
import { AccountPetSave, useAccountPetSave } from '@/components/AccountPetSave';
import { PetCharacterProvider, usePetCharacter } from '@/hooks/use-pet-character';
import { PetCharacterPicker } from '@/components/PetCharacterPicker';
import { useCompanion } from '@/hooks/use-companion';
import { isDesktop } from '@/lib/desktop';
import { queryClient } from '@/lib/query-client';
import { advanceHungerClock, createHungerClock } from '@/lib/hunger';
import './landing.css';

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.PROD ? `${window.location.origin}/api/__clerk` : undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#a85e4d', colorForeground: '#35463a', colorMutedForeground: '#7b8577',
    colorDanger: '#ad594f', colorBackground: '#f7f2e5', colorInput: '#fffaf0',
    colorInputForeground: '#35463a', colorNeutral: '#d8d0be',
    fontFamily: '"DM Sans", "Noto Serif SC", sans-serif', borderRadius: '0.65rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#f7f2e5] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#d9d0bd] shadow-[4px_5px_0_#dfd5c1]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#35463a] font-medium', headerSubtitle: 'text-[#7b8577]',
    socialButtonsBlockButtonText: 'text-[#35463a]', formFieldLabel: 'text-[#526354]',
    footerActionLink: 'text-[#a85e4d] font-semibold', footerActionText: 'text-[#7b8577]',
    dividerText: 'text-[#879082]', identityPreviewEditButton: 'text-[#a85e4d]',
    formFieldSuccessText: 'text-[#5f805e]', alertText: 'text-[#9a5147]',
    logoBox: 'rounded-none', logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#d8d0be] bg-[#fffaf0] hover:bg-[#f1ead8]',
    formButtonPrimary: 'bg-[#a85e4d] hover:bg-[#934d43] text-[#fff3df]',
    formFieldInput: 'border-[#d8d0be] bg-[#fffaf0] text-[#35463a]',
    footerAction: 'bg-transparent', dividerLine: 'bg-[#ded7c7]',
    alert: 'bg-[#f5e3d7] border-[#d9aa91]',
    otpCodeFieldInput: 'border-[#d8d0be] bg-[#fffaf0] text-[#35463a]',
    formFieldRow: 'gap-1', main: 'gap-4',
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
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/room`} /></div>;
}
function SignUpPage() {
  return <div className="auth-screen"><div className="auth-note"><span className="auth-mark">熊</span><p>用邮箱创建账号，保存你的专属小伙伴。</p></div>
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/room`} /></div>;
}
function Landing() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="landing-brand"><span className="landing-mark">熊</span><span>小熊猫日记<small>A SMALL ROOM FOR BIG FEELINGS</small></span></Link>
        <nav><a href="#how-it-works">怎么陪伴</a><a href="#privacy">关于隐私</a></nav>
        <div className="landing-auth"><Link href="/sign-in" className="landing-login">登录</Link><Link href="/sign-up" className="landing-signup">开始照看 <ArrowRight size={15} /></Link></div>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-eyebrow"><span /> 一间慢慢长大的像素小屋</p>
          <h1>把今天说给<br /><em>小熊猫听。</em></h1>
          <p className="landing-deck">在一间暖暖的小房间里，和小熊猫聊一会儿、写下心情。它会记得你愿意留下的日记，也会在你需要时安静陪着。</p>
          <div className="landing-actions"><Link href="/sign-in" className="landing-cta">邮箱登录，开始照看 <ArrowRight size={17} /></Link><Link href="/sign-up" className="landing-text-link">创建个人账号 <ArrowDownRight size={15} /></Link></div>
          <div className="landing-trust"><LockKeyhole size={14} /><span>宠物进度随账号保存，聊天与日记留在本机</span><i /></div>
        </div>
        <div className="landing-scene cover-scene" role="img" aria-label="小熊猫在自己的像素房间里休息">
          <div className="cover-room-backdrop" style={{ backgroundImage: `url("${basePath}/static/room/room-background-pixellab.png?v=cover-room-2")` }} aria-hidden="true" />
          <div className="cover-scene-shade" aria-hidden="true" /><div className="cover-scene-label" aria-hidden="true">小熊猫的房间</div><div className="cover-panda-shadow" aria-hidden="true" />
          <img className="cover-panda" src={`${basePath}/static/panda/idle.png?v=cover-panda-1`} alt="" aria-hidden="true" />
          <div className="cover-caption" aria-hidden="true"><span>16:42</span><span>今天慢一点也没关系</span></div>
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
        <article className="step-card step-journal"><span>02 / KEEP</span><h3>留下心情</h3><p>自动整理的日记只在本机保存，不会再向其他玩家传递心情摘要。</p><div className="step-journal-art"><b>今天的心情</b><i /><i /><i /></div></article>
        <article className="step-card step-room"><span>03 / ROOM</span><h3>布置小房间</h3><p>挪动家具、看看小熊猫在做什么。日子有自己的节奏，房间也是。</p><div className="step-room-art"><i /><b /><span /></div></article>
      </section>
      <section className="landing-privacy" id="privacy">
        <div className="privacy-title"><p className="landing-eyebrow">A QUIET PROMISE</p><h2>你的伙伴，<br /><em>你的私人小房间。</em></h2></div>
        <div className="privacy-list">
          <article><span>01</span><div><strong>邮箱账号保护伙伴</strong><p>登录同一账号即可读取已保存的宠物、养成数值、礼物和房间布置。</p></div></article>
          <article><span>02</span><div><strong>只保留单人照看</strong><p>不再邀请、加入或共享房间，每个账号独立保存自己的养成进度。</p></div></article>
          <article><span>03</span><div><strong>私人记录留在本机</strong><p>聊天、照片和日记不上传到宠物存档，也不向其他玩家分享。</p></div></article>
        </div>
      </section>
      <footer className="landing-footer"><span>小熊猫日记</span><p>一间小屋，一只慢慢长大的小熊猫。</p><Link href="/sign-up" className="footer-link">打开房门 <ArrowRight size={14} /></Link></footer>
    </main>
  );
}
function Room() {
  const petCharacter = usePetCharacter();
  const companion = useCompanion({ allowRandomPerformanceFall: false, enableRoomEcology: !isDesktop(), petName: petCharacter.name });
  const companionRef = useRef(companion);
  companionRef.current = companion;
  const [desktopError, setDesktopError] = useState('');
  const { signOut } = useClerk();
  const save = useAccountPetSave();
  useEffect(() => {
    if (isDesktop()) return;
    const sleeping = () => document.querySelector('[data-testid="button-panda"]')?.getAttribute('data-sleeping') === 'true';
    let clock = createHungerClock(Date.now(), sleeping());
    const advance = () => {
      const now = Date.now(), result = advanceHungerClock(clock, now, sleeping());
      clock = result.clock;
      if (result.lostPoints > 0) companionRef.current.adjustHunger(-result.lostPoints, now);
    };
    const timer = window.setInterval(advance, 1000);
    const observer = new MutationObserver(advance);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-sleeping'] });
    document.addEventListener('visibilitychange', advance);
    return () => { window.clearInterval(timer); observer.disconnect(); document.removeEventListener('visibilitychange', advance); };
  }, []);
  return <div className="room-page">
    <CompanionChat companion={companion} roomOnly
      roomInteractionLocked={!petCharacter.selection?.locked || petCharacter.isLoading || !!petCharacter.error}
      roomToolbarExtras={<nav className="room-toolbar-account" aria-label="房间与账号功能">
        {isDesktop() && <button type="button" className="room-coop-open"
          disabled={petCharacter.isLoading || !!petCharacter.error || !petCharacter.selection?.locked}
          onClick={async () => {
            setDesktopError('');
            try { await window.pandaDesktop!.enterDesktop(); }
            catch (error) { setDesktopError(error instanceof Error ? error.message : '桌宠暂时没有启动，请重试'); }
          }}>出门到桌面</button>}
        {desktopError && <span role="alert">{desktopError}</span>}
        <span className="room-account-status" data-testid="account-save-status" data-error={save.error || undefined} role={save.error ? 'alert' : 'status'}>{save.text}</span>
        {save.error && <button type="button" className="account-save-retry" onClick={save.retry}>重新读取</button>}
        <button type="button" className="room-signout" onClick={async () => {
          if (await save.flush()) await signOut({ redirectUrl: basePath || '/' });
        }} aria-label="退出账号">退出</button>
      </nav>} />
    <PetCharacterPicker compact />
  </div>;
}
function Authenticated() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="account-save-loading">正在确认账号…</main>;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <Room />;
}
function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/room" /></Show><Show when="signed-out"><Landing /></Show></>;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: '欢迎回来', subtitle: '回到你的小熊猫房间' } }, signUp: { start: { title: '打开房间的门', subtitle: '创建账号，开始照看小熊猫' } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator />
      <PetCharacterProvider><AccountPetSave><Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/stats-template">{() => <Redirect to="/room" />}</Route>
        <Route path="/room">{() => <Authenticated />}</Route>
        <Route><Redirect to="/" /></Route>
      </Switch></AccountPetSave></PetCharacterProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}
export default function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
