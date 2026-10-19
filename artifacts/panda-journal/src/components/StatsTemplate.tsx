import { Link } from 'wouter';
import { ArrowLeft, ArrowUpRight, HeartPulse, Leaf, ShieldCheck, Sparkles } from 'lucide-react';
import './StatsTemplate.css';

type StatMeterProps = {
  label: string;
  value: number;
  note: string;
  tone: 'growth' | 'health' | 'bond';
};

function StatMeter({ label, value, note, tone }: StatMeterProps) {
  return (
    <article className={`stats-meter stats-meter-${tone}`}>
      <div className="stats-meter-top"><span>{label}</span><strong>{value}<small> / 100</small></strong></div>
      <div className="stats-meter-track" aria-label={`${label} 示例值 ${value}，满分 100`}><i style={{ width: `${value}%` }} /></div>
      <p>{note}</p>
    </article>
  );
}

export function StatsTemplate() {
  return (
    <main className="stats-template-page">
      <div className="stats-template-shell">
        <header className="stats-template-nav">
          <Link href="/" className="stats-back"><ArrowLeft size={15} /> 返回首页</Link>
          <Link href="/" className="stats-brand"><span>熊</span>小熊猫日记</Link>
          <span className="stats-nav-tag">设计预览</span>
        </header>

        <section className="stats-intro">
          <div>
            <p className="stats-eyebrow">A GENTLE GROWTH RECORD</p>
            <h1>一起照看的日子，<br /><em>会慢慢留下痕迹。</em></h1>
            <p className="stats-lede">这是小熊猫成长档案的数据样式预览。未来，成长会随着共同照看互动累积；心情则跟随小熊猫对最近一次互动的反应。</p>
          </div>
          <aside className="stats-sample-stamp">
            <span>仅供示意</span>
            <strong>模板数据</strong>
            <small>不是账号记录</small>
          </aside>
        </section>

        <div className="stats-demo-notice" role="note">
          <ShieldCheck size={17} />
          <p><strong>独立的示例内容</strong><span>下方数字与描述均为虚构模板，不读取聊天、日记或任何账户资料，也不会保存或同步。</span></p>
          <span className="stats-demo-chip">ILLUSTRATIVE</span>
        </div>

        <section className="stats-panda-panel" aria-labelledby="panda-stats-heading">
          <div className="stats-panda-heading">
            <div className="stats-panda-mark" aria-hidden="true"><i /><b /><span /></div>
            <div><p className="stats-kicker">YOUR LITTLE COMPANION · SAMPLE</p><h2 id="panda-stats-heading">小熊猫的成长档案</h2></div>
            <span className="stats-level">成长阶段 <b>幼年 · 示例</b></span>
          </div>
          <div className="stats-meters">
            <StatMeter label="成长" value={38} note="由共同照看互动逐步累积" tone="growth" />
            <StatMeter label="健康" value={82} note="反映日常状态的示例指标" tone="health" />
            <article className="stats-mood-card">
              <div className="stats-mood-heading"><span className="stats-mood-icon"><Sparkles size={16} /></span><span>此刻心情</span><span className="stats-reaction-label">最近互动反应</span></div>
              <strong>安心</strong>
              <p>轻轻梳理后，放松地眯起眼睛。</p>
              <div className="stats-mood-source"><span /> 最近一次互动 · 梳理</div>
            </article>
          </div>
          <div className="stats-growth-foot">
            <span><Leaf size={14} /> 成长由共同照看一点点累积</span>
            <span>本卡片所有内容均为模板示例</span>
          </div>
        </section>

        <section className="stats-companion-section">
          <div className="stats-section-heading">
            <div><p className="stats-kicker">ANOTHER ANIMAL · GENERIC EXAMPLE</p><h2>其他动物，也可以有自己的档案</h2></div>
            <span className="stats-outline-tag">通用数据结构</span>
          </div>
          <article className="stats-other-card">
            <div className="stats-other-intro">
              <span className="stats-other-symbol" aria-hidden="true">鹿</span>
              <div><p>示例动物</p><h3>森林小鹿</h3><small>仅用于展示字段，不代表真实伙伴</small></div>
              <ArrowUpRight className="stats-other-arrow" size={17} />
            </div>
            <div className="stats-other-values">
              <div><span>成长</span><strong>26<small> / 100</small></strong><i><b style={{ width: '26%' }} /></i></div>
              <div><span>健康</span><strong>74<small> / 100</small></strong><i><b style={{ width: '74%' }} /></i></div>
              <div><span>心情</span><strong className="stats-word-value">好奇</strong><small className="stats-value-note">最近互动反应</small></div>
              <div><span>羁绊</span><strong>31<small> / 100</small></strong><i><b style={{ width: '31%' }} /></i></div>
            </div>
            <p className="stats-other-foot"><HeartPulse size={14} /> 成长、健康、心情与羁绊，作为独立的动物伙伴示例字段</p>
          </article>
        </section>

        <footer className="stats-template-footer">
          <span>小熊猫日记</span>
          <p>一份温柔的模板预览，不是实时状态。</p>
          <Link href="/" className="stats-footer-link">回到小房间首页 <ArrowLeft size={14} /></Link>
        </footer>
      </div>
    </main>
  );
}
