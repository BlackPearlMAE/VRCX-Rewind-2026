import type { TimelineData } from '../components/monthly-timeline';
import { calendarMidnight } from './timeline-calendar';
import type { PlaySessionSample, TimePlayedSessionData } from './time-played-data';

/** Invented sessions matching the saved monthly hours, not recovered session history.
 * Weekly shapes remain the separate saved chart snapshot. November is partial.
 */
export function syntheticSessionDemo(timeline: TimelineData): TimePlayedSessionData {
  const timeZone = 'Europe/Berlin' as const;
  const activeDayCounts = [24, 18, 22, 23, 23, 18, 23, 24, 21, 25, 12, 0];
  const sessions: PlaySessionSample[] = [];
  const months: TimePlayedSessionData['months'][number][] = [];
  for (let month = 0; month < 12; month++) {
    const hours = timeline.months[month]?.value;
    if (hours === null || hours === undefined) {
      months.push({ month, totalHours: 0, activeDays: 0, sessionCount: 0 });
      continue;
    }
    const count = activeDayCounts[month]!;
    const availableDays = month === 10 ? 17 : new Date(Date.UTC(timeline.year, month + 1, 0)).getUTCDate();
    const totalMinutes = Math.round(hours * 60);
    const weights = Array.from({ length: count }, (_, index) => [.96, 1.04, .98, 1.02][index % 4]!);
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    let assignedMinutes = 0;
    for (let index = 0; index < count; index++) {
      const day = 1 + Math.floor(index * availableDays / count);
      const minutes = index === count - 1 ? totalMinutes - assignedMinutes : Math.floor(totalMinutes * weights[index]! / weightTotal);
      assignedMinutes += minutes;
      const firstMinutes = Math.floor(minutes * (index % 2 ? .43 : .49));
      let start = calendarMidnight(timeline.year, month, day, timeZone) + 30 * 60000;
      for (const duration of [firstMinutes, minutes - firstMinutes]) {
        const end = start + duration * 60000;
        sessions.push({ id: `synthetic-session-${sessions.length + 1}`, startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString() });
        start = end + 45 * 60000;
      }
    }
    months.push({ month, totalHours: totalMinutes / 60, activeDays: count, sessionCount: count * 2 });
  }
  const durations = sessions.map(session => (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 3600000);
  const totalHours = months.reduce((sum, month) => sum + month.totalHours, 0);
  const yearHours = (calendarMidnight(timeline.year + 1, 0, 1, timeZone) - calendarMidnight(timeline.year, 0, 1, timeZone)) / 3600000;
  return {
    source: 'synthetic', timeZone,
    coverage: { start: new Date(calendarMidnight(timeline.year, 0, 1, timeZone)).toISOString(), endExclusive: new Date(calendarMidnight(timeline.year, 10, 18, timeZone)).toISOString() },
    sessions, months,
    summary: {
      totalHours, fullDaysEquivalent: totalHours / 24, percentOfYear: totalHours / yearHours * 100,
      activeDays: months.reduce((sum, month) => sum + month.activeDays, 0), sessionCount: sessions.length,
      averageSessionHours: sessions.length ? totalHours / sessions.length : 0,
      longestSessionHours: durations.length ? Math.max(...durations) : 0,
    },
  };
}

/** Separate timezone samples for future session aggregation work. Not added to the saved totals. */
export const sessionBoundarySamples: readonly PlaySessionSample[] = [
  { id: 'synthetic-cross-midnight', startedAt: '2026-01-10T22:30:00Z', endedAt: '2026-01-11T01:30:00Z' },
  { id: 'synthetic-cross-month', startedAt: '2026-01-31T22:30:00Z', endedAt: '2026-02-01T01:30:00Z' },
  { id: 'synthetic-dst-forward', startedAt: '2026-03-29T00:30:00Z', endedAt: '2026-03-29T02:30:00Z' },
  { id: 'synthetic-dst-backward', startedAt: '2026-10-25T00:30:00Z', endedAt: '2026-10-25T02:30:00Z' },
];
