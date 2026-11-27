export type TimelineZone = 'UTC' | 'Europe/Berlin';

/** Calendar midnight in the recap zone, including Berlin daylight-saving offsets. */
export function calendarMidnight(year: number, month: number, day: number, zone: TimelineZone = 'UTC'): number {
  const utc = Date.UTC(year, month, day);
  if (zone === 'UTC') return utc;
  const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(utc).find(part => part.type === 'timeZoneName')?.value;
  const match = offset?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) throw new Error('Recap timezone unavailable');
  const minutes = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1);
  return utc - minutes * 60000;
}
