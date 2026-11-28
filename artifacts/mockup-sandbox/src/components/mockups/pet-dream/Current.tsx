import { useState } from 'react';
import './_group.css';
import sleep from './_sleep.png';

// Extracted from PetStage's existing sleep-only JSX. Room/auth state is stubbed.
export function Current() {
  const [dreamOpen, setDreamOpen] = useState(false);
  const dreamText = '梦见自己坐着竹叶船顺河漂流，萤火虫一路替它照亮前方。';
  const dreamPopoverId = 'extracted-panda-dream';
  return <main className="dream-extract">
    <div className="dream-extract-anchor">
      <img src={sleep} alt="" width={60} height={60} />
      <button type="button"
        className={`ps-dream-cloud ps-dream-cloud-right${dreamOpen ? ' ps-dream-cloud-open' : ''}`}
        aria-label={dreamOpen ? '收起小熊猫的梦' : '查看小熊猫的梦'}
        aria-expanded={dreamOpen} aria-controls={dreamPopoverId}
        title={dreamOpen ? '收起梦境' : '点击查看小熊猫的梦'}
        data-testid="panda-dream-cloud" onPointerDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); setDreamOpen(open => !open); }}>
        <span aria-hidden="true">☁️</span>
      </button>
      {dreamOpen && <div id={dreamPopoverId} className="ps-dream-popover ps-dream-popover-right"
        role="group" aria-label="小熊猫的梦境" data-testid="panda-dream-popover">
        <button type="button" className="ps-dream-close" aria-label="关闭梦境"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); setDreamOpen(false); }}>×</button>
        <strong>小熊猫的梦</strong><p>{dreamText}</p>
      </div>}
    </div>
  </main>;
}
