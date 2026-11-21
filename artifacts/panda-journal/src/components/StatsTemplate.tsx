import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, Leaf, ShieldCheck, Sparkles } from 'lucide-react';
import { getGetCoopHouseholdQueryKey, useGetCoopHousehold } from '@workspace/api-client-react';
import { CARE_STAT_DECAY_INTERVAL_MS, COMPANION_KEY, decayCareStatState, decayCareStats, normalizeCareStats, readState, writeState } from '@/lib/companion-store';
import type { CareStats } from '@/lib/companion-types';
import './StatsTemplate.css';
import { PetCharacterPicker } from './PetCharacterPicker';
import { usePetCharacter } from '@/hooks/use-pet-character';

type StatMeterProps = {
  label: string;
  value: number;
  note: string;
  tone: 'growth' | 'health' | 'bond' | 'hunger';
};

function StatMeter({ label, value, note, tone }: StatMeterProps) {
  return (
    <article className={`stats-meter stats-meter-${tone}`}>
      <div className="stats-meter-top"><span>{label}</span><strong>{value}<small> / 100</small></strong></div>
      <div className="stats-meter-track" role="meter" aria-label={`${label}当前值`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><i style={{ width: `${value}%` }} /></div>
      <p>{note}</p>
    </article>
  );
}

function readLocalCareStats(): { stats: CareStats | null; error: string } {
  try {
    const raw = localStorage.getItem(COMPANION_KEY);
    const state = readState(localStorage);
    const decayed = decayCareStatState(state, Date.now());
    let needsMigration = !raw;
    if (raw) {
      try {
        const stored: unknown = JSON.parse(raw);
        needsMigration = !stored || typeof stored !== 'object' || !('careStats' in stored);
      } catch { /* readState reports invalid records without overwriting them */ }
    }
    if (decayed !== state || needsMigration) writeState(localStorage, decayed);
    return { stats: decayed.careStats, error: '' };
  } catch {
    return { stats: null, error: '本机数值记录暂时无法读取；原有记录没有被覆盖。' };
  }
}

export function StatsTemplate() {
  const petCharacter = usePetCharacter();
  const { isSignedIn } = useAuth();
  const household = useGetCoopHousehold({ query: {
    queryKey: getGetCoopHouseholdQueryKey(),
    enabled: !!isSignedIn,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    staleTime: 0,
  } });
  const [localSnapshot, setLocalSnapshot] = useState(() => readLocalCareStats());
  const localStats = localSnapshot.stats;
  const storageError = localSnapshot.error;
  useEffect(() => {
    const refresh = () => {
      const result = readLocalCareStats();
      setLocalSnapshot(result);
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('panda-care-stats-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('panda-care-stats-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const sharedStats = household.data?.sharedState.careStats;
  const careStats = sharedStats ? decayCareStats(normalizeCareStats(sharedStats), Date.now()) : localStats;
  const sharedRecord = Boolean(sharedStats);
  const hasInteraction = Boolean(careStats && (careStats.recentInteractionIds.length || careStats.revision));
  const mood = !hasInteraction
    ? { title: '安静', message: '完成一次互动后，这里会显示最近的反应。', source: '尚无互动记录' }
    : careStats?.lastInteractionCategory === 'health'
    ? { title: '舒服', message: '照料之后，小熊猫的状态更放松了。', source: '照料互动' }
    : careStats?.lastInteractionCategory === 'bond'
      ? { title: '亲近', message: '陪伴和玩耍让小熊猫更愿意靠近你。', source: '陪伴互动' }
      : careStats?.lastInteractionCategory === 'growth'
        ? { title: '满足', message: '每一次照料都在小熊猫的成长里留下痕迹。', source: '成长互动' }
        : { title: '安静', message: '完成一次互动后，这里会显示最近的反应。', source: '尚无互动记录' };
  const decayHours = CARE_STAT_DECAY_INTERVAL_MS / (60 * 60 * 1000);
  return (
    <main className="stats-template-page">
      <div className="stats-template-shell">
        <header className="stats-template-nav">
          <Link href="/" className="stats-back"><ArrowLeft size={15} /> 返回首页</Link>
          <Link href="/" className="stats-brand"><span>熊</span>小熊猫日记</Link>
          <span className="stats-nav-tag">{sharedRecord ? '共同档案' : '本机档案'}</span>
        </header>

        <section className="stats-intro">
          <div>
            <p className="stats-eyebrow">A GENTLE GROWTH RECORD</p>
            <h1>一起照看的日子，<br /><em>会慢慢留下痕迹。</em></h1>
            <p className="stats-lede">这里记录{petCharacter.name}的实时状态。每次有效互动都会逐步提升相关数值；心情跟随最近一次互动的反应。</p>
          </div>
          <aside className="stats-sample-stamp">
            <span>当前状态</span>
            <strong>{hasInteraction ? '正在成长' : '等待互动'}</strong>
            <small>数值范围 0–100</small>
          </aside>
        </section>

        <div className="stats-demo-notice" role="note">
          <ShieldCheck size={17} />
          <p><strong>数值变化规则</strong><span>成长、健康与羁绊按互动增加；网页中清醒时饥饿值每分钟下降 1 格，睡觉暂停，吃零食增加 1 格。桌面版不自动下降。</span></p>
          <span className="stats-demo-chip">LIVE STATS</span>
        </div>
        {storageError && !sharedRecord && <p className="stats-storage-error" role="alert">{storageError}</p>}

        <PetCharacterPicker />
        <section className="stats-panda-panel" aria-labelledby="panda-stats-heading">
          <div className="stats-panda-heading">
            {petCharacter.characterId === 'xiaobai'
              ? <img src={`${import.meta.env.BASE_URL}static/xiaobai/idle.png`} width="60" height="60" style={{ imageRendering: 'pixelated' }} alt="" />
              : <div className="stats-panda-mark" aria-hidden="true"><i /><b /><span /></div>}
            <div><p className="stats-kicker">YOUR LITTLE COMPANION</p><h2 id="panda-stats-heading">{petCharacter.name}的成长档案</h2></div>
            <span className="stats-level">同步状态 <b>{sharedRecord ? '两人共用' : '当前设备'}</b></span>
          </div>
          <div className="stats-meters">
            <StatMeter label="成长" value={careStats?.growth ?? 0} note="每次有效互动 +1" tone="growth" />
            <StatMeter label="健康" value={careStats?.health ?? 0} note="喂食、洗澡等照料互动 +1" tone="health" />
            <StatMeter label="饥饿值" value={careStats?.hunger ?? 100} note="网页清醒时每分钟 -1；睡觉暂停；吃零食 +1" tone="hunger" />
            <article className="stats-mood-card">
              <div className="stats-mood-heading"><span className="stats-mood-icon"><Sparkles size={16} /></span><span>此刻心情</span><span className="stats-reaction-label">最近互动反应</span></div>
              <strong>{mood.title}</strong>
              <p>{mood.message}</p>
              <div className="stats-mood-source"><span /> 最近一次互动 · {mood.source}</div>
            </article>
          </div>
          <div className="stats-growth-foot">
            <span><Leaf size={14} />{careStats ? `上次互动：${hasInteraction ? new Date(careStats.lastInteractionAt).toLocaleString('zh-CN') : '尚无记录'}` : '数值暂不可用'}</span>
            <span>无互动满 {decayHours} 小时后开始衰减</span>
          </div>
          <div className="stats-bond-row">
            <StatMeter label="羁绊" value={careStats?.bond ?? 0} note="聊天、抚摸、逗玩等陪伴互动 +1" tone="bond" />
          </div>
        </section>

        <section className="stats-other-card" aria-labelledby="other-animal-template-heading">
          <div className="stats-other-intro">
            <span className="stats-other-symbol" aria-hidden="true">+</span>
            <div>
              <p>字段结构预览</p>
              <h3 id="other-animal-template-heading">其他动物档案模板</h3>
              <small>目前尚未接入其他动物的真实档案</small>
            </div>
            <ArrowRight className="stats-other-arrow" size={15} aria-hidden="true" />
          </div>
          <div className="stats-other-values" aria-label="其他动物档案字段示例">
            <div><span>成长</span><strong>—<small> / 100</small></strong><i><b style={{ width: '0%' }} /></i></div>
            <div><span>健康</span><strong>—<small> / 100</small></strong><i><b style={{ width: '0%' }} /></i></div>
            <div><span>羁绊</span><strong>—<small> / 100</small></strong><i><b style={{ width: '0%' }} /></i></div>
            <div><span>心情</span><strong className="stats-word-value">待互动</strong><i><b style={{ width: '0%' }} /></i></div>
          </div>
          <p className="stats-other-foot"><Sparkles size={14} />这里只展示可复用的档案字段；接入其他动物后，再按它们各自的互动规则累计和衰减数值。</p>
        </section>

        <section className="stats-companion-section">
          <div className="stats-section-heading">
            <div><p className="stats-kicker">HOW VALUES CHANGE</p><h2>互动留下变化，闲置会慢慢回落</h2></div>
            <span className="stats-outline-tag">每步 1 点</span>
          </div>
          <div className="stats-rule-list">
            <article><span className="stats-rule-number">01</span><div><strong>成长</strong><p>每次有效照料、聊天、抚摸或玩耍，成长增加 1 点。</p></div></article>
            <article><span className="stats-rule-number">02</span><div><strong>健康与羁绊</strong><p>照料互动只增加健康；陪伴互动只增加羁绊，不会一次把所有数值都加满。</p></div></article>
            <article><span className="stats-rule-number">03</span><div><strong>闲置衰减</strong><p>每次有效互动后重新计时；连续 6 小时没有有效互动后开始衰减，此后每满 6 小时三项各减 1 点，最低为 0。</p></div></article>
            <article><span className="stats-rule-number">04</span><div><strong>饥饿值</strong><p>网页版每清醒一分钟减少 1 格；睡觉时暂停，喂食零食增加 1 格。桌面版不自动减少。</p></div></article>
          </div>
        </section>

        <footer className="stats-template-footer">
          <span>小熊猫日记</span>
          <p>{sharedRecord ? '数值与共同房间同步；聊天和日记仍保存在各自设备。' : '单人档案保存在当前设备。'}</p>
          <Link href="/room" className="stats-footer-link">回到小房间 <ArrowLeft size={14} /></Link>
        </footer>
      </div>
    </main>
  );
}
