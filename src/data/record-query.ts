import type { Database, SqlValue } from 'sql.js';
import type { TimelineData, TimelineMonth, TimelineWeek } from '../components/monthly-timeline';
import { recapQueries } from './recap-sql-catalog';
import { accountPrefixes } from './database-accounts';
import { calendarMidnight } from './timeline-calendar';
import { calculateFriendsTimeline } from './timeline-query';
import { monthlyRecord, unavailableRecords, type RecordPageData, type RecordId } from './record-pages';

/** Aggregate all nine candidate layouts independently. Eligibility is intentionally deferred. */
export function calculateRecordPages(db: Database, account: string, now = Date.now(), friendTimeline?: TimelineData): RecordPageData[] {
  if (!accountPrefixes(db).includes(account)) throw new Error('Choose an account');
  const year = 2026, timeZone = 'Europe/Berlin' as const;
  const from = calendarMidnight(year, 0, 1, timeZone);
  const cutoff = Math.min(now, calendarMidnight(year + 1, 0, 1, timeZone));
  const uuid = account.slice(3);
  const self = `usr_${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
  const parameters: Record<string, string | number> = { ':self_id': self, ':from_utc': new Date(from).toISOString(), ':to_utc': new Date(cutoff).toISOString() };
  const periods = Array.from({ length: 12 }, (_, month) => {
    parameters[`:month_start_${month}`] = calendarMidnight(year, month, 1, timeZone) / 1000;
    parameters[`:month_end_${month}`] = Math.min(cutoff, calendarMidnight(year, month + 1, 1, timeZone)) / 1000;
    return `(${month}, :month_start_${month}, :month_end_${month})`;
  });
  parameters[':year_start_s'] = from / 1000;
  parameters[':year_end_s'] = cutoff / 1000;
  const buckets = `periods(month, start_s, end_s) AS (VALUES ${periods.join(',')})`;
  function query(sql: string): Record<string, SqlValue>[] {
    const statement = db.prepare(sql.replaceAll('{{account}}', account));
    try {
      statement.bind(Object.fromEntries(Object.entries(parameters).filter(([key]) => sql.includes(key))));
      const rows: Record<string, SqlValue>[] = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally { statement.free(); }
  }
  interface Coverage { first: number; last: number }
  function chart(topic: string, unit: string, values: number[], coverage: Coverage): TimelineData {
    const months: TimelineMonth[] = values.map((value, month) => {
      const start = calendarMidnight(year, month, 1, timeZone);
      const end = calendarMidnight(year, month + 1, 1, timeZone);
      if (start >= cutoff) return { value: null, status: 'future' };
      if (end <= coverage.first || start >= coverage.last) return { value: null, status: 'missing' };
      return { value, partial: coverage.first > start || coverage.last < end || cutoff < end };
    });
    return { topic, unit, year, timeZone, months };
  }
  function sectionWeeks(values: readonly number[], coverage: Coverage): TimelineWeek[] {
    const weeks: TimelineWeek[] = [];
    for (let month = 0; month < 12; month++) for (const segment of [0, 1, 2, 3] as const) {
      const start = calendarMidnight(year, month, segment * 7 + 1, timeZone);
      const end = segment === 3 ? calendarMidnight(year, month + 1, 1, timeZone) : calendarMidnight(year, month, (segment + 1) * 7 + 1, timeZone);
      weeks.push({ month, segment, start: new Date(start).toISOString(), end: new Date(end).toISOString(), value: start >= cutoff || end <= coverage.first || start >= coverage.last ? null : values[month * 4 + segment] ?? 0 });
    }
    return weeks;
  }
  function countWeeks(events: string, aggregate: string, coverage: Coverage): TimelineWeek[] {
    const weeks = sectionWeeks([], coverage);
    const entries = weeks.map((week, index) => {
      parameters[`:count_week_start_${index}`] = Date.parse(week.start) / 1000;
      parameters[`:count_week_end_${index}`] = Math.min(cutoff, Date.parse(week.end)) / 1000;
      return `(${index},:count_week_start_${index},:count_week_end_${index})`;
    });
    const rows = query(`WITH sections(index_id,start_s,end_s) AS (VALUES ${entries.join(',')}), events AS (${events})
      SELECT s.index_id,${aggregate} AS value FROM sections s LEFT JOIN events e
      ON s.end_s>s.start_s AND e.at_s>=s.start_s AND e.at_s<s.end_s GROUP BY s.index_id ORDER BY s.index_id;`);
    for (const row of rows) if (weeks[Number(row.index_id)]!.value !== null) weeks[Number(row.index_id)]!.value = Number(row.value);
    return weeks;
  }
  function hourWeeks(coverage: Coverage, worldId?: string): TimelineWeek[] {
    const weeks: TimelineWeek[] = [];
    const entries: string[] = [];
    if (worldId) parameters[':highlighted_world'] = worldId;
    for (let month = 0; month < 12; month++) for (const segment of [0, 1, 2, 3] as const) {
      const index = weeks.length;
      const start = calendarMidnight(year, month, segment * 7 + 1, timeZone);
      const end = segment === 3 ? calendarMidnight(year, month + 1, 1, timeZone) : calendarMidnight(year, month, (segment + 1) * 7 + 1, timeZone);
      parameters[`:record_week_start_${index}`] = start / 1000;
      parameters[`:record_week_end_${index}`] = Math.min(cutoff, end) / 1000;
      entries.push(`(${index},:record_week_start_${index},:record_week_end_${index})`);
      weeks.push({ month, segment, start: new Date(start).toISOString(), end: new Date(end).toISOString(), value: start >= cutoff || end <= coverage.first || start >= coverage.last ? null : 0 });
    }
    const rows = query(visits + `, sections(index_id,start_s,end_s) AS (VALUES ${entries.join(',')})
      SELECT s.index_id, COALESCE(SUM(MAX(0,MIN(v.end_s,s.end_s)-MAX(v.start_s,s.start_s))),0)/3600.0 AS hours
      FROM sections s LEFT JOIN visits v ON s.end_s>s.start_s AND v.start_s<s.end_s AND v.end_s>s.start_s
      ${worldId ? 'AND v.world_id=:highlighted_world' : ''}
      GROUP BY s.index_id ORDER BY s.index_id;`);
    for (const row of rows) if (weeks[Number(row.index_id)]!.value !== null) weeks[Number(row.index_id)]!.value = Number(row.hours);
    return weeks;
  }
  const records = new Map<RecordId, RecordPageData>(unavailableRecords().map(item => [item.id, item]));
  function safe(id: RecordId, calculate: () => RecordPageData) {
    try { records.set(id, calculate()); } catch { /* Missing tables leave only this record unavailable. */ }
  }
  const terminal = '\nSELECT COUNT(*) AS intervals FROM visits;';
  const base = recapQueries.find(item => item.name === 'Shared visit intervals')!.sql;
  const visits = base.endsWith(terminal) ? base.slice(0, -terminal.length) : '';
  let visitCoverage: Coverage = { first: Infinity, last: -Infinity };
  if (visits) {
    try {
      const coverage = query(visits + ' SELECT MIN(visit_start) AS first_s,MAX(visit_end) AS last_s FROM corrected_visits;')[0]!;
      visitCoverage = { first: coverage.first_s === null ? Infinity : Number(coverage.first_s) * 1000,
        last: coverage.last_s === null ? -Infinity : Number(coverage.last_s) * 1000 };
      const days: { start: number; end: number; month: number; date: string }[] = [];
      const entries: string[] = [];
      for (let month = 0; month < 12; month++) {
        const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        for (let day = 1; day <= count; day++) {
          const index = days.length;
          const start = calendarMidnight(year, month, day, timeZone);
          const end = calendarMidnight(year, month, day + 1, timeZone);
          days.push({ start, end, month, date: `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}` });
          parameters[`:day_start_${index}`] = start / 1000;
          parameters[`:day_end_${index}`] = Math.min(cutoff, end) / 1000;
          entries.push(`(${index}, :day_start_${index}, :day_end_${index})`);
        }
      }
      const daily = query(visits + `, daily(index_id,start_s,end_s) AS (VALUES ${entries.join(',')})
        SELECT d.index_id, COALESCE(SUM(MAX(0,MIN(v.end_s,d.end_s)-MAX(v.start_s,d.start_s))),0) AS seconds
        FROM daily d LEFT JOIN visits v ON d.end_s>d.start_s AND v.start_s<d.end_s AND v.end_s>d.start_s
        GROUP BY d.index_id ORDER BY d.index_id;`);
      const hours = new Array<number>(12).fill(0), active = new Array<number>(12).fill(0);
      const activeSections = new Array<number>(48).fill(0);
      const allStreaks: { start: string; end: string; length: number }[] = [];
      let runEnd = '';
      let run = 0, best = 0, runStart = '', bestStart = '', bestEnd = '';
      let bestRanges: { start: string; end: string }[] = [];
      for (const row of daily) {
        const day = days[Number(row.index_id)]!;
        const seconds = Number(row.seconds);
        hours[day.month]! += seconds / 3600;
        if (seconds > 0) {
          active[day.month]!++;
          activeSections[day.month * 4 + Math.min(3, Math.floor((Number(day.date.slice(-2)) - 1) / 7))]!++;
          runEnd = day.date;
          if (!run) runStart = day.date;
          run++;
          if (run > best) { best = run; bestStart = runStart; bestEnd = day.date; bestRanges = [{ start: runStart, end: day.date }]; }
          else if (run === best) bestRanges.push({ start: runStart, end: day.date });
        } else {
          if (run) allStreaks.push({ start: runStart, end: runEnd, length: run });
          run = 0;
        }
      }
      if (run) allStreaks.push({ start: runStart, end: runEnd, length: run });
      const hoursTimeline = chart('Recorded time', 'hours', hours, visitCoverage);
      hoursTimeline.weeks = hourWeeks(visitCoverage);
      records.set('time', monthlyRecord('time', hoursTimeline));
      const daysTimeline = chart('Days played', 'days', active, visitCoverage);
      daysTimeline.weeks = sectionWeeks(activeSections, visitCoverage);
      records.set('days', monthlyRecord('days', daysTimeline));
      records.set('streak', {
        id: 'streak', status: 'ready', year, value: best, month: null, streaks: allStreaks, yearlyTotal: active.reduce((sum, days) => sum + days, 0),
        ...(best ? { range: { start: bestStart, end: bestEnd }, ranges: bestRanges } : {}),
      });
    } catch { /* Other record types can still be calculated. */ }
    safe('world-time', () => {
      const rows = query(visits + `, ${buckets}
        SELECT p.month,v.world_id,MAX(NULLIF(v.world_name,'')) AS world_name,
          SUM(MAX(0,MIN(v.end_s,p.end_s)-MAX(v.start_s,p.start_s)))/3600.0 AS hours
        FROM visits v JOIN periods p ON p.end_s>p.start_s AND v.start_s<p.end_s AND v.end_s>p.start_s
        GROUP BY p.month,v.world_id ORDER BY hours DESC,p.month,v.world_id;`);
      const winner = rows[0];
      const values = new Array<number>(12).fill(0);
      if (winner) for (const row of rows) if (row.world_id === winner.world_id) values[Number(row.month)] = Number(row.hours);
      const worldTimeline = chart('Time in the highlighted world', 'hours', values, visitCoverage);
      worldTimeline.weeks = hourWeeks(visitCoverage, winner ? String(winner.world_id) : undefined);
      return monthlyRecord('world-time', worldTimeline, { label: winner ? String(winner.world_name || 'A recorded world') : undefined, worldId: winner ? String(winner.world_id) : undefined });
    });
  }
  function counts(id: RecordId, topic: string, unit: string, events: string, aggregate = 'COUNT(e.item)') {
    safe(id, () => {
      const rows = query(`WITH ${buckets}, events AS (${events})
        SELECT p.month,${aggregate} AS value FROM periods p LEFT JOIN events e
        ON p.end_s>p.start_s AND e.at_s>=p.start_s AND e.at_s<p.end_s GROUP BY p.month ORDER BY p.month;`);
      const values = new Array<number>(12).fill(0);
      for (const row of rows) values[Number(row.month)] = Number(row.value);
      const first = query(`WITH events AS (${events}) SELECT MIN(at_s) AS first_s FROM events;`)[0]?.first_s;
      const coverage = { first: first === null || first === undefined ? Infinity : Number(first) * 1000, last: cutoff };
      const timeline = chart(topic, unit, values, coverage);
      timeline.weeks = countWeeks(events, aggregate, coverage);
      // Count distinct entities over the entire period, not once per month.
      // A repeated world/instance/avatar in different months is still one entity.
      const yearlyTotal = aggregate.includes('DISTINCT')
        ? Number(query(`WITH events AS (${events})
            SELECT ${aggregate} AS value FROM events e
            WHERE e.at_s >= :year_start_s AND e.at_s < :year_end_s;`)[0]!.value)
        : undefined;
      return monthlyRecord(id, timeline, { yearlyTotal });
    });
  }
  counts('discoveries', 'Worlds first discovered', 'worlds', "SELECT world_id AS item,MIN(unixepoch(created_at,'subsec')) AS at_s FROM gamelog_location WHERE location GLOB 'wrld_*:*' AND world_id GLOB 'wrld_*' GROUP BY world_id");
  safe('friends', () => monthlyRecord('friends', friendTimeline ?? calculateFriendsTimeline(db, account, now)));
  counts('instances', 'Different instances visited', 'instances', "SELECT location AS item,unixepoch(created_at,'subsec') AS at_s FROM gamelog_location WHERE location GLOB 'wrld_*:*'", 'COUNT(DISTINCT e.item)');
  counts('worlds', 'Different worlds visited', 'worlds', "SELECT world_id AS item,unixepoch(created_at,'subsec') AS at_s FROM gamelog_location WHERE location GLOB 'wrld_*:*' AND world_id GLOB 'wrld_*'", 'COUNT(DISTINCT e.item)');
  counts('avatars', 'Cached avatar uploads', 'avatars', "SELECT id AS item,unixepoch(created_at,'subsec') AS at_s FROM cache_avatar WHERE author_id=:self_id AND id GLOB 'avtr_*'", 'COUNT(DISTINCT e.item)');
  return [...records.values()];
}
