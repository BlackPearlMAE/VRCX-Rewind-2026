import initSqlJs from 'sql.js';
import { test, expect } from '@playwright/test';
import { databaseFixture } from '../fixtures/database';
import { calculateRecordPages } from '../../src/data/record-query';
import { calculateTimeline } from '../../src/data/timeline-query';
import { recordYearlyDetail, recordYearlyTotal } from '../../src/data/record-pages';
import { recordedRecordDemo } from '../../src/data/recorded-record-demo';
import { daysAttendanceRecord } from '../../src/data/days-attendance-record';

test('records preserve missing coverage, partial months, recorded zeros and future periods', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await databaseFixture('benchmark'));
  try {
    db.run("INSERT INTO gamelog_location VALUES (2,'2026-06-15T05:00:00.000Z','wrld_test:2','wrld_test','Synthetic world',3600000);");
    const account = 'usr' + '1'.repeat(32), now = Date.parse('2026-11-26T12:00:00.000Z');
    const expected = calculateTimeline(db, account, now);
    const records = calculateRecordPages(db, account, now);
    for (const id of ['time', 'days', 'world-time']) {
      const timeline = records.find(r => r.id === id)!.timeline!;
      for (let month = 0; month < 12; month++) {
        expect(timeline.months[month]!.status).toBe(expected.months[month]!.status);
        expect(timeline.months[month]!.partial).toBe(expected.months[month]!.partial);
        if (expected.months[month]!.value === null) expect(timeline.months[month]!.value).toBeNull();
      }
      expect(timeline.months[4]!.value).toBe(0); // May is observed between retained visits.
      expect(timeline.weeks!.slice(0, 12).every(w => w.value === null)).toBe(true);
      expect(timeline.weeks!.slice(24).every(w => w.value === null)).toBe(true);
    }
    const worlds = records.find(r => r.id === 'worlds')!.timeline!;
    expect(worlds.months.slice(0, 3).every(m => m.status === 'missing' && m.value === null)).toBe(true);
    expect(worlds.months[3]!.partial).toBe(true);
    expect(worlds.months[10]!.partial).toBe(true);
    expect(worlds.months[11]!.status).toBe('future');
  } finally { db.close(); }
});

test('yearly totals deduplicate across months and exclude events outside the recap', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await databaseFixture('benchmark'));
  try {
    const account = 'usr' + '1'.repeat(32);
    const self = 'usr_11111111-1111-1111-1111-111111111111';
    db.run(`INSERT INTO gamelog_location VALUES
      (2,'2026-05-15T05:00:00.000Z','wrld_test:1','wrld_test','Synthetic world',3600000),
      (3,'2026-05-16T05:00:00.000Z','wrld_test:2','wrld_test','Synthetic world',3600000),
      (4,'2026-06-15T05:00:00.000Z','wrld_other:1','wrld_other','Other world',3600000),
      (5,'2026-12-15T05:00:00.000Z','wrld_future:1','wrld_future','Future world',3600000);`);
    db.run('INSERT INTO cache_avatar VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', ['avtr_one', self, '2026-04-15T05:00:00Z', 'avtr_one', self, '2026-05-15T05:00:00Z', 'avtr_two', self, '2026-12-15T05:00:00Z']);
    const records = calculateRecordPages(db, account, Date.parse('2026-11-26T12:00:00Z'));
    const record = (id: string) => records.find(r => r.id === id)!;
    expect(record('worlds').yearlyTotal).toBe(2);
    expect(record('instances').yearlyTotal).toBe(3);
    expect(record('avatars').yearlyTotal).toBe(1);
    expect(record('discoveries').yearlyTotal).toBe(2);
    expect(record('streak').yearlyTotal).toBe(record('days').yearlyTotal);
  } finally { db.close(); }
});


test('all nine synthetic records have a yearly detail and attendance uses raw days', () => {
  expect(recordedRecordDemo).toHaveLength(9);
  for (const record of recordedRecordDemo) {
    expect(recordYearlyDetail(record)).not.toBe('');
    expect(recordYearlyTotal(record)).toBeGreaterThanOrEqual(record.value);
  }
  const days = recordedRecordDemo.find(record => record.id === 'days')!;
  expect(daysAttendanceRecord(days.timeline!).yearlyTotal).toBe(227);
  expect(recordYearlyDetail(daysAttendanceRecord(days.timeline!))).toBe('227 days played this year');
  const worlds = recordedRecordDemo.find(record => record.id === 'worlds')!;
  expect(recordYearlyDetail({ ...worlds, yearlyTotal: undefined })).toBe('');
  expect(recordYearlyDetail({ ...worlds, status: 'unavailable' })).toBe('');
});
