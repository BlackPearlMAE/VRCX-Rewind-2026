import type { TimelineData } from '../components/monthly-timeline';
import { monthlyRecord, sumRecordedMonths } from './record-pages';

/** Adjust only ranking for month length; keep the original days-page presentation. */
export function daysAttendanceRecord(source: TimelineData) {
  const daysInMonth = (month: number) => new Date(Date.UTC(source.year, month + 1, 0)).getUTCDate();
  const scores: TimelineData = { ...source, months: source.months.map((entry, month) => entry.value === null ? entry : { ...entry, value: entry.value / daysInMonth(month) * 100 }) };
  const result = monthlyRecord('days', scores);
  result.yearlyTotal = sumRecordedMonths(source);
  result.value = Math.max(0, ...(result.months ?? []).map(month => source.months[month]!.value!));
  result.timeline = { ...source, months: source.months.map((entry, month) => entry.value === null ? entry : { ...entry, rankValue: scores.months[month]!.value! }) };
  return result;
}
