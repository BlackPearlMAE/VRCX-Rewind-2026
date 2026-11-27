import { test, expect } from '@playwright/test';
import { daysAttendanceRecord } from '../../src/data/days-attendance-record';
import type { TimelineData } from '../../src/components/monthly-timeline';

function attendance(year: number, values: (number | null)[]): TimelineData {
  return { topic: 'Days played', year, unit: 'days', months: values.map(value => value === null ? { value: null, status: 'future' as const } : { value }) };
}

test('full months tie at 100 percent regardless of their length', () => {
  const raw = attendance(2026, [31,28,30,30,0,0,0,0,0,0,null,null]);
  const record = daysAttendanceRecord(raw);
  expect(record.value).toBe(31);

  expect(record.months).toEqual([0,1,3]);
  expect(record.timeline!.months[2]!.rankValue).toBeCloseTo(30 / 31 * 100);
  expect(record.timeline!.months[10]).toEqual({ value: null, status: 'future' });
  expect(record.label).toBeUndefined();
  expect(raw.months[0]!.value).toBe(31);
  expect(raw.unit).toBe('days');
});

test('leap February uses 29 days and ranking uses unrounded percentages', () => {
  const record = daysAttendanceRecord(attendance(2028, [30,28,0,0,0,0,0,0,0,0,0,0]));
  expect(record.months).toEqual([0]);
  expect(record.timeline!.months[1]!.rankValue).toBeCloseTo(28 / 29 * 100);
});

test('weekly contributions use their calendar month and partial months retain the full denominator', () => {
  const raw = attendance(2026, [0,0,0,0,0,0,0,0,0,0,22,null]);
  raw.months[10] = { value: 22, partial: true };
  raw.weeks = [{ month: 10, segment: 0, start: '2026-11-01T00:00:00Z', end: '2026-11-08T00:00:00Z', value: 7 }];
  const record = daysAttendanceRecord(raw);
  expect(record.value).toBe(22);
  expect(record.timeline!.months[10]!.partial).toBe(true);
  expect(record.timeline!.months[10]!.rankValue).toBeCloseTo(22 / 30 * 100);
  expect(record.timeline!.weeks![0]!.value).toBe(7);
});
