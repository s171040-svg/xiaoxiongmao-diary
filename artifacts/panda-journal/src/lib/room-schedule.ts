export const ROOM_SCHEDULE_LEAD_MS = 60 * 60 * 1000;

export type RoomSchedule = {
  id: string;
  title: string;
  eventAt: number;
  remindAt: number;
  status: 'pending' | 'cancelled' | 'completed';
  remindedAt?: number;
};

export type RoomScheduleParse =
  | { ok: true; title: string; eventAt: number; remindAt: number }
  | { ok: false; message: string };

type DateParts = {
  year: number | null;
  month: number;
  day: number;
  start: number;
  end: number;
};

type ParsedTime =
  | { ok: true; hour: number; minute: number; dayOffset: number; start: number; end: number }
  | { ok: false; message: string };

export interface ScheduleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

function chineseNumber(value: string): number {
  if (/^\d+$/u.test(value)) return Number(value);
  if (value === '十') return 10;
  let total = 0;
  let current = 0;
  for (const character of value) {
    if (character === '十') {
      total += (current || 1) * 10;
      current = 0;
    } else if (Object.hasOwn(DIGITS, character)) {
      current = DIGITS[character];
    } else {
      return Number.NaN;
    }
  }
  return total + current;
}

function localDateAt(now: Date, offsetDays: number) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() + offsetDays);
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function parseDate(text: string, now: Date): DateParts | null {
  const patterns: { regex: RegExp; read: (match: RegExpExecArray) => Omit<DateParts, 'start' | 'end'> }[] = [
    {
      regex: /(\d{4})\s*(?:年|[-/])\s*(\d{1,2})\s*(?:月|[-/])\s*(\d{1,2})\s*(?:日|号)?/u,
      read: match => ({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }),
    },
    {
      regex: /(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)/u,
      read: match => ({ year: null, month: Number(match[1]), day: Number(match[2]) }),
    },
  ];
  for (const { regex, read } of patterns) {
    const match = regex.exec(text);
    if (match) return { ...read(match), start: match.index, end: match.index + match[0].length };
  }

  const relative = /(大后天|后天|明天|明日|今天|今日)/u.exec(text);
  if (relative) {
    const offsets: Record<string, number> = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3 };
    return {
      ...localDateAt(now, offsets[relative[0]]),
      start: relative.index,
      end: relative.index + relative[0].length,
    };
  }

  const weekday = /((?:下|本|这)?(?:周|星期))([一二三四五六日天])/u.exec(text);
  if (!weekday) return null;
  const target = weekday[2] === '日' || weekday[2] === '天' ? 0 : chineseNumber(weekday[2]);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (today.getDay() + 6) % 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - mondayOffset);
  const prefix = weekday[1];
  const dayOffset = target === 0 ? 6 : target - 1;
  if (prefix.startsWith('下')) weekStart.setDate(weekStart.getDate() + 7);
  else if (prefix === '周' || prefix === '星期') {
    const forward = (target - today.getDay() + 7) % 7 || 7;
    weekStart.setTime(today.getTime());
    weekStart.setDate(today.getDate() + forward);
    return {
      year: weekStart.getFullYear(), month: weekStart.getMonth() + 1, day: weekStart.getDate(),
      start: weekday.index, end: weekday.index + weekday[0].length,
    };
  }
  weekStart.setDate(weekStart.getDate() + dayOffset);
  return {
    year: weekStart.getFullYear(), month: weekStart.getMonth() + 1, day: weekStart.getDate(),
    start: weekday.index, end: weekday.index + weekday[0].length,
  };
}

function parseTime(text: string): ParsedTime {
  const regex = /(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*(?:([:：])\s*(\d{1,2})|(点钟|点|时)(?:\s*(半|一刻|三刻|\d{1,2}(?:分钟|分)?))?)/u;
  const match = regex.exec(text);
  if (!match) return { ok: false, message: '我还没找到具体时间。可以写“明天下午三点开会”。' };

  const period = match[1] || '';
  let hour = chineseNumber(match[2]);
  let minute = match[3] ? Number(match[4]) : 0;
  if (!match[3] && match[6]) {
    const minuteText = match[6].replace(/分钟?$|分$/u, '');
    minute = minuteText === '半' ? 30
      : minuteText === '一刻' ? 15
        : minuteText === '三刻' ? 45
          : chineseNumber(minuteText);
  }
  const colonTime = Boolean(match[3]);
  let dayOffset = 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { ok: false, message: '这个时间我没认出来，请检查小时和分钟。' };
  }
  const twelveHour = hour >= 1 && hour <= 12;
  if (!period && twelveHour) {
    return { ok: false, message: `“${match[0].trim()}”不确定是上午还是下午，请补上时段。` };
  }
  if (period && hour > 12) return { ok: false, message: '写了上午或下午时，请用 1 到 12 点。' };
  if (!period && colonTime && (hour < 0 || hour > 23)) {
    return { ok: false, message: '24 小时制的小时要在 0 到 23 之间。' };
  }
  if (colonTime && !period && hour === 0) {
    return { ok: true, hour, minute, dayOffset, start: match.index, end: match.index + match[0].length };
  }
  if (period === '凌晨' || period === '清晨' || period === '早上' || period === '上午') {
    if (hour === 12) hour = 0;
  } else if (period === '中午') {
    if (hour < 11) hour += 12;
  } else if (period === '下午' || period === '傍晚' || period === '晚上' || period === '夜里') {
    if ((period === '晚上' || period === '夜里') && hour === 12) {
      hour = 0;
      dayOffset = 1;
    } else if (hour < 12) hour += 12;
  } else if (!colonTime && (hour < 0 || hour > 23)) {
    return { ok: false, message: '小时要在 0 到 23 之间。' };
  }
  return { ok: true, hour, minute, dayOffset, start: match.index, end: match.index + match[0].length };
}

function cleanTitle(text: string, spans: { start: number; end: number }[]): string {
  let result = text;
  for (const { start, end } of [...spans].sort((a, b) => b.start - a.start)) {
    result = `${result.slice(0, start)} ${result.slice(end)}`;
  }
  return result
    .replace(/(?:请帮我|帮我|提醒我|提醒一下|请|记得|帮忙|安排一下|安排在|安排|麻烦)/gu, ' ')
    .replace(/[，,。.!！?？:：;；、]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function parseRoomScheduleText(input: string, nowValue = Date.now()): RoomScheduleParse {
  if (!input.trim()) return { ok: false, message: '写一句你想记住的安排吧。' };
  const text = input.trim();
  if (text.length > 240) return { ok: false, message: '这句话有点长，请缩短到 240 个字以内。' };

  const now = new Date(nowValue);
  const date = parseDate(text, now);
  if (!date) return { ok: false, message: '我还不知道是哪一天。请写今天、明天、周几或具体日期。' };
  const time = parseTime(text);
  if (!time.ok) return time;
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) {
    return { ok: false, message: '这个日期不存在，请检查月份和日期。' };
  }

  let year = date.year ?? now.getFullYear();
  if (date.year == null && date.month === now.getMonth() + 1 && date.day < now.getDate()) {
    return { ok: false, message: '这个日期今年已经过去了，请确认年份或改成未来的日期。' };
  }
  if (date.year == null && date.month < now.getMonth() + 1) year += 1;
  const event = new Date(year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
  if (event.getFullYear() !== year || event.getMonth() !== date.month - 1
    || event.getDate() !== date.day || event.getHours() !== time.hour || event.getMinutes() !== time.minute) {
    return { ok: false, message: '这个日期或时间不存在，请换一种写法。' };
  }
  if (time.dayOffset) event.setDate(event.getDate() + time.dayOffset);
  const title = cleanTitle(text, [date, time]);
  if (!title) return { ok: false, message: '我认出了日期和时间，再告诉我具体要做什么吧。' };
  if (title.length > 160) return { ok: false, message: '事项名称最多 160 个字，请缩短一点。' };
  if (event.getTime() < now.getTime() + ROOM_SCHEDULE_LEAD_MS) {
    return { ok: false, message: '这件事至少要在一小时以后，才能提前一小时提醒你。' };
  }
  if (event.getTime() > now.getTime() + 10 * 366 * 24 * 60 * 60 * 1000) {
    return { ok: false, message: '日期太远了，请确认安排时间再发送。' };
  }
  return {
    ok: true,
    title,
    eventAt: event.getTime(),
    remindAt: event.getTime() - ROOM_SCHEDULE_LEAD_MS,
  };
}

export function readRoomSchedules(storage: ScheduleStorage, key: string): RoomSchedule[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('本机日程数据无法读取；为保护记录，暂时停止写入。'); }
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1
    || !('items' in data) || !Array.isArray(data.items)) {
    throw new Error('本机日程数据格式不完整；为保护记录，暂时停止写入。');
  }
  const valid = data.items.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const note = item as Partial<RoomSchedule>;
    return typeof note.id === 'string' && typeof note.title === 'string' && note.title.length > 0
      && typeof note.eventAt === 'number' && Number.isFinite(note.eventAt)
      && Number.isFinite(new Date(note.eventAt).getTime())
      && typeof note.remindAt === 'number' && Number.isFinite(note.remindAt)
      && Number.isFinite(new Date(note.remindAt).getTime())
      && ['pending', 'cancelled', 'completed'].includes(note.status ?? '')
      && (note.remindedAt === undefined || Number.isFinite(note.remindedAt));
  });
  if (!valid) throw new Error('本机日程条目不完整；为保护记录，暂时停止写入。');
  return data.items as RoomSchedule[];
}

export function writeRoomSchedules(storage: ScheduleStorage, key: string, items: RoomSchedule[]): void {
  const previous = storage.getItem(key);
  if (previous) storage.setItem(`${key}.bak`, previous);
  storage.setItem(key, JSON.stringify({ version: 1, items }));
}

export function collectRoomScheduleReminders(items: RoomSchedule[], now: number) {
  const due: RoomSchedule[] = [];
  let changed = false;
  const nextItems = items.map(item => {
    if (item.status !== 'pending') return item;
    if (item.eventAt <= now) {
      changed = true;
      return { ...item, status: 'completed' as const };
    }
    if (!item.remindedAt && item.remindAt <= now) {
      changed = true;
      const reminded = { ...item, remindedAt: now };
      due.push(reminded);
      return reminded;
    }
    return item;
  });
  return { items: nextItems, due, changed };
}
