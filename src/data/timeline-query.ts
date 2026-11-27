import type { TimePlayedSessionData, DaysPlayedData } from './time-played-data';
import type { Database } from 'sql.js';
import type { TimelineData, TimelineWeek, TimelineMonth } from '../components/monthly-timeline';
import { recapQueries } from './recap-sql-catalog';
import { accountPrefixes } from './database-accounts';
import { calendarMidnight } from './timeline-calendar';

export type TimelineMetric = 'hours' | 'friends-added';

export interface TimelineLoadResult { ok: boolean; data?: TimelineData; sessionData?: TimePlayedSessionData; daysData?: DaysPlayedData; sessionCount?: number; message: string }


/** Count recorded sessions using the same corrected visits and five-minute/offline breaks as the diagnostics. */
export function calculateSessionCount(db: Database, account: string, now = Date.now()): number {
  if (!accountPrefixes(db).includes(account)) throw new Error('Choose an account');
  const uuid = account.slice(3);
  const selfId = `usr_${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
  const base = recapQueries.find(query => query.name === 'Top 3 longest estimated play sessions')!.sql;
  const terminal = base.indexOf("\nSELECT strftime", base.indexOf('session_totals AS'));
  if (terminal < 0) throw new Error('Session query unavailable');
  const statement = db.prepare(base.slice(0, terminal) + '\nSELECT COUNT(*) FROM session_totals;');
  try {
    statement.bind({ ':self_id': selfId, ':from_utc': new Date(calendarMidnight(2026, 0, 1, 'Europe/Berlin')).toISOString(), ':to_utc': new Date(Math.min(now, calendarMidnight(2027, 0, 1, 'Europe/Berlin'))).toISOString() });
    return statement.step() ? Number(statement.get()[0]) : 0;
  } finally { statement.free(); }
}

/** Existing corrected visit logic, aggregated into 48 periods in one read-only query. */
export function calculateTimeline(db: Database, account: string, now = Date.now()): TimelineData {
  if (!accountPrefixes(db).includes(account)) throw new Error('Choose an account');
  const uuid = account.slice(3);
  const selfId = `usr_${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
  const year = 2026, timeZone = 'Europe/Berlin';
  const cutoff = Math.min(now, calendarMidnight(year + 1, 0, 1, timeZone));
  const base = recapQueries.find(query => query.name === 'Shared visit intervals')!.sql;
  const terminal = '\nSELECT COUNT(*) AS intervals FROM visits;';
  if (!base.endsWith(terminal)) throw new Error('Visit query unavailable');
  const weeks: TimelineWeek[] = [];
  const parameters: Record<string, string | number> = { ':self_id': selfId, ':from_utc': new Date(calendarMidnight(year, 0, 1, timeZone)).toISOString(), ':to_utc': new Date(cutoff).toISOString() };
  const entries: string[] = [];
  for (let month = 0; month < 12; month++) for (const segment of [0, 1, 2, 3] as const) {
    const index = weeks.length;
    const start = calendarMidnight(year, month, segment * 7 + 1, timeZone);
    const end = segment === 3 ? calendarMidnight(year, month + 1, 1, timeZone) : calendarMidnight(year, month, (segment + 1) * 7 + 1, timeZone);
    weeks.push({ month, segment, start: new Date(start).toISOString(), end: new Date(end).toISOString(), value: null });
    entries.push(`(${month}, ${segment}, :start_${index}, :end_${index})`);
    parameters[`:start_${index}`] = start / 1000;
    parameters[`:end_${index}`] = Math.min(end, cutoff) / 1000;
  }
  const sql = base.slice(0, -terminal.length) + `
    , buckets(month, segment, start_s, end_s) AS (VALUES ${entries.join(', ')}),
    coverage AS (SELECT MIN(visit_start) AS first_s, MAX(visit_end) AS last_s FROM corrected_visits)
    SELECT b.month, b.segment,
           COALESCE(SUM(MAX(0, MIN(v.end_s, b.end_s) - MAX(v.start_s, b.start_s))), 0) AS seconds,
           c.first_s, c.last_s
    FROM buckets AS b CROSS JOIN coverage AS c
    LEFT JOIN visits AS v ON b.end_s > b.start_s AND v.end_s > b.start_s AND v.start_s < b.end_s
    GROUP BY b.month, b.segment ORDER BY b.month, b.segment;`;
  const statement = db.prepare(sql);
  let first = Infinity, last = -Infinity;
  try {
    statement.bind(parameters);
    while (statement.step()) {
      const row = statement.get();
      const index = Number(row[0]) * 4 + Number(row[1]);
      const week = weeks[index]!;
      if (row[3] !== null) first = Number(row[3]) * 1000;
      if (row[4] !== null) last = Number(row[4]) * 1000;
      const start = Date.parse(week.start), end = Date.parse(week.end);
      if (start < cutoff && end > first && start < last) week.value = Number(row[2]) / 3600;
    }
  } finally { statement.free(); }
  const months: TimelineMonth[] = Array.from({ length: 12 }, (_, month) => {
    const start = calendarMidnight(year, month, 1, timeZone), end = calendarMidnight(year, month + 1, 1, timeZone);
    if (start >= cutoff) return { value: null, status: 'future' };
    const sections = weeks.slice(month * 4, month * 4 + 4);
    if (sections.every(week => week.value === null)) return { value: null, status: 'missing' };
    return { value: sections.reduce((sum, week) => sum + (week.value ?? 0), 0), partial: first > start || last < end || cutoff < end };
  });
  return { topic: 'Estimated recorded time', year, unit: 'hours', timeZone, months, weeks };
}

/** First retained friendship per person, not re-adds. Only counts leave the worker. */
export function calculateFriendsTimeline(db: Database, account: string, now = Date.now()): TimelineData {
  if (!accountPrefixes(db).includes(account)) throw new Error('Choose an account');
  const uuid = account.slice(3);
  const selfId = `usr_${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
  const year = 2026, timeZone = 'Europe/Berlin';
  const cutoff = Math.min(now, calendarMidnight(year + 1, 0, 1, timeZone));
  const weeks: TimelineWeek[] = [];
  const entries: string[] = [];
  const parameters: Record<string, string | number> = { ':self_id': selfId };
  for (let month = 0; month < 12; month++) for (const segment of [0, 1, 2, 3] as const) {
    const index = weeks.length;
    const start = calendarMidnight(year, month, segment * 7 + 1, timeZone);
    const end = segment === 3 ? calendarMidnight(year, month + 1, 1, timeZone) : calendarMidnight(year, month, (segment + 1) * 7 + 1, timeZone);
    weeks.push({ month, segment, start: new Date(start).toISOString(), end: new Date(end).toISOString(), value: null });
    entries.push(`(${month}, ${segment}, :start_${index}, :end_${index})`);
    parameters[`:start_${index}`] = start / 1000;
    parameters[`:end_${index}`] = Math.min(end, cutoff) / 1000;
  }
  const statement = db.prepare(`WITH first_transitions AS (
    SELECT user_id, created_at, type,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
    FROM "${account}_friend_log_history"
    WHERE type IN ('Friend', 'Unfriend') AND user_id GLOB 'usr_*' AND user_id <> :self_id
  ), coverage AS (SELECT MIN(unixepoch(created_at)) AS first_s FROM first_transitions),
  buckets(month, segment, start_s, end_s) AS (VALUES ${entries.join(', ')}),
  new_friends AS (SELECT unixepoch(created_at) AS added_s FROM first_transitions WHERE rn = 1 AND type = 'Friend')
  SELECT b.month, b.segment, COUNT(f.added_s), c.first_s
  FROM buckets b CROSS JOIN coverage c
  LEFT JOIN new_friends f ON f.added_s >= b.start_s AND f.added_s < b.end_s
  GROUP BY b.month, b.segment ORDER BY b.month, b.segment`);
  let first = Infinity;
  try {
    statement.bind(parameters);
    while (statement.step()) {
      const row = statement.get();
      if (row[3] !== null) first = Number(row[3]) * 1000;
      const week = weeks[Number(row[0]) * 4 + Number(row[1])]!;
      if (Date.parse(week.start) < cutoff && Date.parse(week.end) > first) week.value = Number(row[2]);
    }
  } finally { statement.free(); }
  const months: TimelineMonth[] = Array.from({ length: 12 }, (_, month) => {
    const start = calendarMidnight(year, month, 1, timeZone), end = calendarMidnight(year, month + 1, 1, timeZone);
    if (start >= cutoff) return { value: null, status: 'future' };
    const sections = weeks.slice(month * 4, month * 4 + 4);
    if (sections.every(week => week.value === null)) return { value: null, status: 'missing' };
    return { value: sections.reduce((sum, week) => sum + (week.value ?? 0), 0), partial: first > start || cutoff < end };
  });
  return { topic: 'Friends added', year, unit: 'friends', timeZone, months, weeks };
}
