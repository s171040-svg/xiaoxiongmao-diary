import { useMemo, useState, type FormEvent } from 'react';
import { emotionOptions } from '@/lib/emotion-options';

export function EmotionCheckIn({ source, disabled, onChoose }: { source: string; disabled: boolean; onChoose: (text: string) => void }) {
  const [custom, setCustom] = useState('');
  const options = useMemo(() => emotionOptions(source), [source]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = custom.trim();
    if (!text || disabled) return;
    onChoose(text);
    setCustom('');
  };

  return (
    <section className="cc-feelings" aria-label="选一个最贴近现在的感受" data-testid="emotion-check-in">
      <p>现在更像哪一种？也可以自己写</p>
      <div className="cc-feeling-options">
        {options.map(option => <button type="button" key={option} disabled={disabled} onClick={() => onChoose(option)}>{option}</button>)}
      </div>
      <form onSubmit={submit}>
        <input value={custom} onChange={event => setCustom(event.target.value)} maxLength={120} placeholder="也可以用自己的话说说" aria-label="自定义现在的感受" />
        <button type="submit" disabled={disabled || !custom.trim()}>发送</button>
      </form>
    </section>
  );
}
