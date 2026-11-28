import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Check, Clock3, Trash2, X } from 'lucide-react';
import {
  collectRoomScheduleReminders,
  parseRoomScheduleText,
  readRoomSchedules,
  writeRoomSchedules,
  type RoomSchedule,
} from '@/lib/room-schedule';
import './RoomScheduleAssistant.css';

type Props = {
  open: boolean;
  storageKey: string;
  onOpenChange: (open: boolean) => void;
};

const eventTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
});
const reminderTime = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function RoomScheduleAssistant({ open, storageKey, onOpenChange }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState<RoomSchedule[]>([]);
  const [alerts, setAlerts] = useState<RoomSchedule[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [view, setView] = useState<'compose' | 'list'>('compose');
  const [clock, setClock] = useState(Date.now());
  const parsed = useMemo(() => parseRoomScheduleText(draft, clock), [clock, draft]);
  const ordered = useMemo(() => [...items].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return a.eventAt - b.eventAt;
  }), [items]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    setDraft('');
    setAlerts([]);
    setSaved('');
    setView('compose');
    const load = () => {
      try {
        setItems(readRoomSchedules(window.localStorage, storageKey));
        setError('');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '本机日程暂时无法读取。');
      }
    };
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) load();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  useEffect(() => {
    const checkReminders = () => {
      try {
        const current = readRoomSchedules(window.localStorage, storageKey);
        const result = collectRoomScheduleReminders(current, Date.now());
        if (result.changed) writeRoomSchedules(window.localStorage, storageKey, result.items);
        setItems(result.items);
        if (result.due.length) {
          setAlerts(existing => [
            ...existing,
            ...result.due.filter(note => !existing.some(old => old.id === note.id)),
          ]);
        }
        setError('');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '本机日程暂时无法读取。');
      }
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 15_000);
    document.addEventListener('visibilitychange', checkReminders);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkReminders);
    };
  }, [storageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const persist = (next: RoomSchedule[]) => {
    try {
      writeRoomSchedules(window.localStorage, storageKey, next);
      setItems(next);
      setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '日程没有保存，请检查浏览器储存空间。');
      return false;
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = parseRoomScheduleText(draft, Date.now());
    if (!current.ok || error) return;
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const note: RoomSchedule = {
      id,
      title: current.title,
      eventAt: current.eventAt,
      remindAt: current.remindAt,
      status: 'pending',
    };
    if (!persist([note, ...items])) return;
    setDraft('');
    setSaved(`记下啦：${note.title}，我会在 ${reminderTime.format(note.remindAt)} 提醒你。`);
    setClock(Date.now());
  };

  const changeStatus = (note: RoomSchedule, status: RoomSchedule['status']) => {
    const next = items.map(item => item.id === note.id ? { ...item, status } : item);
    persist(next);
  };

  const remove = (note: RoomSchedule) => {
    if (!window.confirm(`要删除“${note.title}”这条安排吗？`)) return;
    persist(items.filter(item => item.id !== note.id));
    setAlerts(current => current.filter(alert => alert.id !== note.id));
  };

  return (
    <>
      {alerts.length > 0 && (
        <aside className="rsa-reminder-stack" aria-live="polite" aria-label="日程提醒">
          {alerts.map(note => (
            <div className="rsa-reminder" role="status" key={note.id} data-testid={`status-room-reminder-${note.id}`}>
              <CalendarClock size={18} aria-hidden="true" />
              <span><strong>小熊猫提醒你</strong>{note.title}</span>
              <button type="button" onClick={() => setAlerts(current => current.filter(item => item.id !== note.id))}
                aria-label={`关闭${note.title}提醒`} data-testid={`button-dismiss-reminder-${note.id}`}>
                <X size={16} />
              </button>
            </div>
          ))}
        </aside>
      )}
      <dialog
        ref={dialogRef}
        className="cc-dialog rsa-dialog"
        aria-labelledby="rsa-title"
        data-testid="dialog-room-schedule"
        onCancel={event => { event.preventDefault(); onOpenChange(false); }}
        onClick={event => { if (event.target === event.currentTarget) onOpenChange(false); }}
      >
        <header className="cc-dhead">
          <div>
            <h2 id="rsa-title">小熊猫日程助手</h2>
            <p>写下一件要记住的事，我会提前一小时提醒你。</p>
          </div>
          <button type="button" className="cc-icon" aria-label="关闭日程助手"
            onClick={() => onOpenChange(false)} data-testid="button-close-room-schedule">
            <X size={18} />
          </button>
        </header>
        <nav className="rsa-tabs" aria-label="日程助手页面">
          <button type="button" aria-pressed={view === 'compose'} className={view === 'compose' ? 'active' : ''}
            onClick={() => setView('compose')} data-testid="button-compose-schedule">写安排</button>
          <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')} data-testid="button-list-schedules">
            我的日程 <span>{items.filter(item => item.status === 'pending').length}</span>
          </button>
        </nav>
        {view === 'compose' ? (
          <form className="rsa-compose" onSubmit={submit}>
            <label htmlFor="rsa-message">用一句话告诉我</label>
            <textarea
              id="rsa-message"
              rows={3}
              maxLength={240}
              value={draft}
              onChange={event => { setDraft(event.target.value); setSaved(''); }}
              placeholder="例如：明天下午三点和客户开会"
              autoFocus
              data-testid="input-room-schedule"
            />
            <div className={`rsa-parse ${parsed.ok ? 'success' : ''}`} role="status" data-testid="status-schedule-parse">
              {parsed.ok ? (
                <>
                  <strong>{parsed.title}</strong>
                  <span><Clock3 size={14} /> {eventTime.format(parsed.eventAt)}</span>
                  <span>提醒时间：{reminderTime.format(parsed.remindAt)}</span>
                </>
              ) : <span>{draft.trim() ? parsed.message : '写好日期、上午／下午、时间和事项后，我会先帮你核对。'}</span>}
            </div>
            {saved && <p className="rsa-saved" role="status" data-testid="status-schedule-saved"><Check size={15} />{saved}</p>}
            {error && <p className="rsa-error" role="alert" data-testid="status-schedule-error">{error}</p>}
            <p className="rsa-privacy">只保存在这个浏览器中；网页关闭期间不会检查提醒，也不会同步到其他设备。</p>
            <button className="cc-send rsa-submit" type="submit" disabled={!parsed.ok || Boolean(error)}
              data-testid="button-send-room-schedule">发送给小熊猫</button>
          </form>
        ) : (
          <section className="rsa-list" aria-label="已保存日程">
            {error && <p className="rsa-error" role="alert" data-testid="status-schedule-error">{error}</p>}
            {ordered.length === 0
              ? <p className="cc-empty" data-testid="text-empty-schedules">还没有安排。写一句话，我会帮你记住。</p>
              : ordered.map(note => (
                <article className="rsa-item" key={note.id} data-testid={`card-room-schedule-${note.id}`}>
                  <div>
                    <strong>{note.title}</strong>
                    <time dateTime={new Date(note.eventAt).toISOString()}>{eventTime.format(note.eventAt)}</time>
                    <span className={`rsa-status ${note.status}`}>
                      {note.status === 'pending' ? `提前一小时提醒 · ${reminderTime.format(note.remindAt)}`
                        : note.status === 'cancelled' ? '已取消' : '已结束'}
                    </span>
                  </div>
                  <div className="rsa-item-actions">
                    {note.status === 'pending' && (
                      <button type="button" onClick={() => changeStatus(note, 'cancelled')}
                        data-testid={`button-cancel-schedule-${note.id}`}>取消</button>
                    )}
                    {note.status === 'cancelled' && note.eventAt > Date.now() + 60 * 60 * 1000 && (
                      <button type="button" onClick={() => changeStatus(note, 'pending')}
                        data-testid={`button-restore-schedule-${note.id}`}>恢复</button>
                    )}
                    <button type="button" className="danger" aria-label={`删除${note.title}`}
                      onClick={() => remove(note)} data-testid={`button-delete-schedule-${note.id}`}>
                      <Trash2 size={14} /> 删除
                    </button>
                  </div>
                </article>
              ))}
          </section>
        )}
      </dialog>
    </>
  );
}
