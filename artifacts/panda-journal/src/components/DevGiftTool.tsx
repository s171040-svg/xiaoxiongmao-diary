import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TestGiftInput } from '@/lib/companion-store';

type Props = { onCreate: (input: TestGiftInput) => void; onClose: () => void };

export default function DevGiftTool({ onCreate, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitted = useRef(false);
  const [emoji, setEmoji] = useState('');
  const [item, setItem] = useState('');
  const [animal, setAnimal] = useState('');
  const [story, setStory] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.current) return;
    const gift = { emoji: emoji.trim(), item: item.trim(), animal: animal.trim(), story: story.trim() };
    if (!gift.emoji || !gift.item || !gift.animal || !gift.story) {
      setError('请把 emoji、物品名称、来源动物和故事都填好。');
      return;
    }
    try {
      submitted.current = true;
      onCreate(gift);
      onClose();
    } catch (cause) {
      submitted.current = false;
      setError(cause instanceof Error ? cause.message : '礼物没有保存，请检查后重试。');
    }
  }

  return (
    <dialog ref={dialogRef} className="cc-dialog cc-dev-gift" aria-labelledby="dev-gift-title"
      data-testid="dialog-dev-gift"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <header className="cc-dhead">
        <div>
          <h2 id="dev-gift-title">开发测试礼物</h2>
          <p>只写入当前设备的本地礼物盒，不会同步到服务端。</p>
        </div>
        <button type="button" className="cc-icon" aria-label="关闭" onClick={onClose} autoFocus data-testid="dialog-dev-gift-close">×</button>
      </header>
      <form className="cc-dev-gift-form" noValidate onSubmit={submit}>
        <label>
          礼物 emoji
          <input value={emoji} onChange={event => setEmoji(event.target.value)} required maxLength={12}
            placeholder="例如 🍌" data-testid="input-dev-gift-emoji" />
        </label>
        <label>
          物品名称
          <input value={item} onChange={event => setItem(event.target.value)} required maxLength={40}
            placeholder="例如 香蕉" data-testid="input-dev-gift-item" />
        </label>
        <label>
          来源动物
          <input value={animal} onChange={event => setAnimal(event.target.value)} required maxLength={40}
            placeholder="例如 猴子" data-testid="input-dev-gift-animal" />
        </label>
        <label>
          带回来的故事
          <textarea value={story} onChange={event => setStory(event.target.value)} required maxLength={300}
            rows={3} placeholder="写一句礼物来源故事" data-testid="input-dev-gift-story" />
        </label>
        {error && <p className="cc-dev-gift-error" role="alert" data-testid="dev-gift-error">{error}</p>}
        <div className="cc-dev-gift-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" className="cc-send" data-testid="button-dev-gift-create">加入小礼物</button>
        </div>
      </form>
    </dialog>
  );
}
