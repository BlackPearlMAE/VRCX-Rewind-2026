import initSqlJs from 'sql.js';
import { test, expect } from '@playwright/test';
import { databaseFixture } from '../fixtures/database';
import { calculateRecordPages } from '../../src/data/record-query';
import { calculateTimeline } from '../../src/data/timeline-query';

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
