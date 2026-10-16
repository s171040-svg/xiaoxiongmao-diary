import { useEffect, useRef, useState } from 'react';
import { Package, Trash2, X } from 'lucide-react';
import type { Category, JournalEntry } from '@/lib/journal-types';

type Filter = 'all' | Category;
const labels: Record<Category, string> = { leisure: '日常', idea: '点子', worry: '烦恼' };
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function MemoryBox({ entries, onRemove, disabled }: {
  entries: JournalEntry[];
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);
  const visibleEntries = entries
    .filter((entry) => filter === 'all' || entry.category === filter)
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="memory-box">
      <button className="memory-box-button" type="button" aria-haspopup="dialog"
        aria-label={`打开暂存箱，${entries.length} 页记录`} data-testid="button-memory-box"
        onClick={() => { setFilter('all'); setOpen(true); }}>
        <Package size={26} strokeWidth={1.5} aria-hidden="true" />
        <span>暂存箱{entries.length > 0 && <small>{entries.length}</small>}</span>
      </button>
      <dialog ref={dialogRef} className="memory-dialog" aria-labelledby="memory-box-title"
        data-testid="dialog-memory-box" onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <header className="memory-header">
          <div>
            <h2 id="memory-box-title"><Package size={22} strokeWidth={1.5} /> 暂存箱</h2>
            <p>你放下的每一页，都好好收在这里。</p>
          </div>
          <button className="memory-close" type="button" aria-label="关闭暂存箱"
            data-testid="button-close-memory-box" onClick={() => setOpen(false)} autoFocus><X size={20} /></button>
        </header>
        <div className="entries-head"><span className="entry-count" data-testid="text-entry-count">{entries.length} 页 · 保存在本机</span></div>
        <div className="filters" aria-label="筛选已自动分类的记录">
          {(['all', 'leisure', 'idea', 'worry'] as Filter[]).map((value) => (
            <button key={value} type="button" className={`filter-button${filter === value ? ' selected' : ''}`}
              aria-pressed={filter === value} data-testid={`filter-${value}`} onClick={() => setFilter(value)}>
              {value === 'all' ? '全部' : labels[value]}
            </button>
          ))}
        </div>
        {visibleEntries.length ? (
          <div className="entry-list" data-testid="list-entries">
            {visibleEntries.map((entry) => (
              <article className="entry-card" key={entry.id} data-testid={`card-entry-${entry.id}`}>
                <div className="entry-meta">
                  <span className={`category-tag ${entry.category}`}>{labels[entry.category]}</span>
                  <time className="entry-time" dateTime={new Date(entry.createdAt).toISOString()}>{dateFormat.format(entry.createdAt)}</time>
                </div>
                <p className="entry-text">{entry.text}</p>
                {entry.photo && <img className="memory-photo" src={entry.photo} alt="日记附上的照片" />}
                {entry.reply && <div className="saved-reply">
                  <span>小熊猫当时的回应</span><p>{entry.reply}</p>
                </div>}
                <div className="entry-bottom">
                  {entry.goal && <span className="goal-chip">一个小目标</span>}
                  <button className="delete-button" type="button" disabled={disabled} aria-label="删除这一页"
                    data-testid={`button-delete-${entry.id}`} onClick={() => onRemove(entry.id)}><Trash2 size={13} /> 删除</button>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="empty-state" data-testid="empty-entries">
          <div className="empty-mark"><Package size={20} /></div>
          <strong>{entries.length ? '这一类还没有记录' : '箱子里还很安静'}</strong>
          <p>{entries.length ? '换个分类看看。' : '写下的文字会自动收进来，不用再搬一次。'}</p>
        </div>}
      </dialog>
    </div>
  );
}
