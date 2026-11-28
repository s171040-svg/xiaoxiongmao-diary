import assert from 'node:assert/strict';
import { formatLocalAlarmTime } from './RoomAlarmClock';

assert.equal(formatLocalAlarmTime(new Date(2026, 9, 20, 7, 28)), '07:28');
assert.equal(formatLocalAlarmTime(new Date(2026, 9, 20, 0, 5)), '00:05');
assert.equal(formatLocalAlarmTime(new Date(2026, 9, 20, 13, 42)), '13:42');
assert.equal(formatLocalAlarmTime(new Date(2026, 9, 20, 23, 59)), '23:59');

console.log('PASS alarm display follows local time in the existing 24-hour format');
