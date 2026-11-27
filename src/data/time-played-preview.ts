import { calendarMidnight } from './timeline-calendar';
import type { TimelineData } from '../components/monthly-timeline';
import type { TimePlayedSessionData, DaysPlayedData } from './time-played-data';

export type TimePlayedVariant = 'hours-general' | 'hours-medium' | 'hours-high' | 'days-general' | 'days-medium' | 'days-high';

/** Temporary demo copy controls; these choices do not establish automatic thresholds. */
export function timePlayedPreview(source: TimelineData, sessions: TimePlayedSessionData | undefined, variant: TimePlayedVariant, recordedDays?: DaysPlayedData, now = Date.now()) {
  const yearDays = (Date.UTC(source.year + 1, 0, 1) - Date.UTC(source.year, 0, 1)) / 86400000;
  const timeZone = source.timeZone ?? 'Europe/Berlin';
  const yearStart = calendarMidnight(source.year, 0, 1, timeZone);
  const yearEnd = calendarMidnight(source.year + 1, 0, 1, timeZone);
  // A saved demo is frozen at its capture date; live data defaults to execution time.
  const savedCutoff = recordedDays?.coverage.endExclusive ?? sessions?.coverage.endExclusive;
  const snapshotTime = savedCutoff ? Date.parse(savedCutoff) : now;
  const referenceTime = Math.min(now, Number.isFinite(snapshotTime) ? snapshotTime : now);
  const cutoff = Math.max(yearStart, Math.min(referenceTime, yearEnd));
  const dateParts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
  const part = (at: number, name: string) => Number(dateParts.formatToParts(new Date(at)).find(item => item.type === name)?.value);
  const elapsedDays = cutoff <= yearStart ? 0 : Math.min(yearDays,
    (Date.UTC(part(cutoff - 1, 'year'), part(cutoff - 1, 'month') - 1, part(cutoff - 1, 'day')) - Date.UTC(source.year, 0, 1)) / 86400000 + 1);
  const elapsedHours = (cutoff - yearStart) / 3600000;
  const complete = referenceTime >= yearEnd;
  const period = complete ? 'the year' : 'the year so far';
  const yearPhrase = part(now, 'year') === source.year ? 'this year' : `in ${source.year}`;
  const daysMode = variant.startsWith('days-');
  const monthlyDays = Array.from({ length: 12 }, () => new Set<number>());
  const sectionDays = Array.from({ length: 48 }, () => new Set<number>());
  const calendar = new Intl.DateTimeFormat('en', { timeZone: sessions?.timeZone ?? source.timeZone ?? 'Europe/Berlin', year: 'numeric', month: 'numeric', day: 'numeric' });
  for (const session of sessions?.sessions ?? []) {
    const parts = calendar.formatToParts(new Date(session.startedAt));
    const part = (name: string) => Number(parts.find(item => item.type === name)?.value);
    if (part('year') !== source.year) continue;
    const month = part('month') - 1;
    const day = part('day');
    monthlyDays[month]!.add(day);
    sectionDays[month * 4 + Math.min(3, Math.floor((day - 1) / 7))]!.add(day);
  }
  const timeline: TimelineData = daysMode ? (recordedDays?.timeline ?? {
    ...source, topic: 'Days played', unit: 'days',
    months: source.months.map((month, index) => month.value === null ? month : { ...month, value: monthlyDays[index]!.size }),
    weeks: source.weeks?.map(week => ({ ...week, value: week.value === null ? null : sectionDays[week.month * 4 + week.segment]!.size })),
  }) : source;
  const hours = source.months.reduce((sum, month) => sum + (month.value ?? 0), 0);
  const days = recordedDays ? recordedDays.timeline.months.reduce((sum, month) => sum + (month.value ?? 0), 0) : monthlyDays.reduce((sum, month) => sum + month.size, 0);
  const denominator = daysMode ? elapsedDays : elapsedHours;
  const percentage = denominator > 0 ? ((daysMode ? days : hours) / denominator) * 100 : 0;
  const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(percentage);
  const fullDays = Math.floor(hours / 24).toLocaleString('en-US');
  const copy = {
    'hours-general': { title: 'You spent', comparison: `in VRChat ${yearPhrase}.` },
    'hours-medium': { title: `You really got into VRChat ${yearPhrase}.`, comparison: `That’s ${percent}% of ${period}.` },
    'hours-high': { title: `You went all in ${yearPhrase}.`, comparison: `That’s ${fullDays} whole days, or ${percent}% of ${period}. WOW.` },
    'days-general': { title: 'You jumped into VRChat on', comparison: `${yearPhrase}.` },
    'days-medium': { title: 'You kept coming back.', comparison: `in VRChat. That’s ${percent}% of ${period}.` },
    'days-high': { title: 'VRChat was part of your routine. You showed up on', comparison: `${yearPhrase}. That’s ${percent}% of ${period}. WOW.` },
  }[variant];
  const averageHoursPerPlayedDay = days > 0 ? hours / days : 0;
  const preferredMetric = days > 0 && averageHoursPerPlayedDay <= 4 ? 'days' : 'hours';
  return { timeline, ...copy, daysMode, hours, days, averageHoursPerPlayedDay, preferredMetric };
}
