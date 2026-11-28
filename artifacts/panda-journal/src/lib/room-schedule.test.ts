import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectRoomScheduleReminders,
  parseRoomScheduleText,
  readRoomSchedules,
  writeRoomSchedules,
  type RoomSchedule,
  type ScheduleStorage,
} from './room-schedule';

class MemoryStorage implements ScheduleStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const now = new Date(2026, 10, 28, 10, 0).getTime();

test('natural language dates create a fixed one-hour reminder preview', () => {
  const parsed = parseRoomScheduleText('明天下午六点和同事开会', now);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.title, '和同事开会');
  assert.equal(parsed.eventAt, new Date(2026, 10, 29, 18, 0).getTime());
  assert.equal(parsed.remindAt, new Date(2026, 10, 29, 17, 0).getTime());
});

test('ambiguous times and events less than one hour away cannot be saved', () => {
  assert.match(parseRoomScheduleText('明天三点开会', now).ok
    ? '' : parseRoomScheduleText('明天三点开会', now).message, /上午还是下午/u);
  const near = parseRoomScheduleText('今天上午十点五十九分开会', now);
  assert.equal(near.ok, false);
  if (!near.ok) assert.match(near.message, /至少要在一小时以后/u);
});

test('local schedule records are preserved and reminder is claimed only once', () => {
  const storage = new MemoryStorage();
  const parsed = parseRoomScheduleText('明天下午六点开会', now);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const item: RoomSchedule = {
    id: 'meeting-1',
    title: parsed.title,
    eventAt: parsed.eventAt,
    remindAt: parsed.remindAt,
    status: 'pending',
  };
  writeRoomSchedules(storage, 'schedules', [item]);
  assert.deepEqual(readRoomSchedules(storage, 'schedules'), [item]);

  const due = collectRoomScheduleReminders([item], item.remindAt);
  assert.equal(due.due.length, 1);
  assert.equal(due.items[0].remindedAt, item.remindAt);
  const repeated = collectRoomScheduleReminders(due.items, item.remindAt + 1000);
  assert.equal(repeated.due.length, 0);
  const completed = collectRoomScheduleReminders(due.items, item.eventAt);
  assert.equal(completed.items[0].status, 'completed');

  writeRoomSchedules(storage, 'schedules', due.items);
  assert.equal(storage.getItem('schedules.bak'), JSON.stringify({ version: 1, items: [item] }));
});

test('corrupt local data is rejected instead of silently replaced', () => {
  const storage = new MemoryStorage();
  storage.setItem('schedules', '{broken');
  assert.throws(() => readRoomSchedules(storage, 'schedules'), /保护记录/u);
});
