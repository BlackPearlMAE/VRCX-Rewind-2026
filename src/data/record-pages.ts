import type { TimelineData } from '../components/monthly-timeline';

export const recordDefinitions = [
  { id: 'time', title: 'Most recorded time in VRChat', kicker: 'You spent the most time in VRChat in', unit: 'hours played', singular: 'hour played', caption: 'Your busiest month for recorded playtime.' },
  { id: 'days', title: 'Most days played', kicker: 'You showed up most often in', unit: 'days played', singular: 'day played', caption: 'The month you played on the most different days.' },
  { id: 'streak', title: 'Longest streak of days played', kicker: 'Your longest streak ran from', unit: 'days in a row', singular: 'day', caption: 'Your longest run of consecutive days played.' },
  { id: 'world-time', title: 'Most time in one world', kicker: 'Your most played world peaked in', unit: 'hours played', singular: 'hour played', caption: 'Your biggest monthly total in a single world.' },
  { id: 'discoveries', title: 'Most worlds discovered', kicker: 'You discovered the most in', unit: 'new worlds', singular: 'new world', caption: 'Worlds first seen in your retained VRCX history.' },
  { id: 'friends', title: 'Most new friends added', kicker: 'You made the most new connections in', unit: 'new friends', singular: 'new friend', caption: 'Your biggest month for first recorded friend additions.' },
  { id: 'instances', title: 'Most different instances visited', kicker: 'You did the most instance hopping in', unit: 'different instances', singular: 'different instance', caption: 'Distinct instances visited during your busiest month.' },
  { id: 'worlds', title: 'Most different worlds visited', kicker: 'You traveled the most in', unit: 'different worlds visited', singular: 'different world visited', caption: 'Distinct worlds visited during your busiest month.' },
  { id: 'avatars', title: 'Most avatars uploaded', kicker: 'You brought the most new looks to VRChat in', unit: 'avatars uploaded', singular: 'avatar uploaded', caption: 'Uploads found in your retained avatar cache.' },
] as const;
export type RecordId = typeof recordDefinitions[number]['id'];
export interface RecordPageData {
  id: RecordId;
  status: 'ready' | 'unavailable';
  value: number;
  /** Recorded total across the recap period, not a sum of distinct monthly counts. */
  yearlyTotal?: number;

  year?: number;
  month: number | null;
  months?: readonly number[];
  timeline?: TimelineData;
  label?: string;
  worldId?: string;
  imageUrl?: string;
  range?: { start: string; end: string };
  ranges?: readonly { start: string; end: string }[];
  streaks?: readonly { start: string; end: string; length: number }[];
  note?: string;
}

export function unavailableRecords(message = 'This record is not available in the retained history.'): RecordPageData[] {
  return recordDefinitions.map(item => ({ id: item.id, status: 'unavailable', value: 0, month: null, note: message }));
}

/** Only additive metrics can be reconstructed from their monthly buckets. */
export function sumRecordedMonths(timeline: TimelineData): number | undefined {
  const values = timeline.months.flatMap(entry => entry.value === null ? [] : [entry.value]);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

export function recordYearlyTotal(record: RecordPageData): number | undefined {
  if (record.status !== 'ready') return undefined;
  if (record.yearlyTotal !== undefined) return record.yearlyTotal;
  if (record.id === 'streak') return record.streaks?.reduce((sum, streak) => sum + streak.length, 0);
  if (record.id === 'worlds' || record.id === 'instances' || record.id === 'avatars') return undefined;
  return record.timeline ? sumRecordedMonths(record.timeline) : undefined;
}

export function recordYearlyDetail(record: RecordPageData): string {
  const total = recordYearlyTotal(record);
  if (total === undefined || !Number.isFinite(total) || total < 0) return '';
  const value = Math.round(total);
  const number = value.toLocaleString('en-US');
  const noun = (singular: string, plural: string) => value === 1 ? singular : plural;
  switch (record.id) {
    case 'time': return `${number} recorded ${noun('hour', 'hours')} this year`;
    case 'days':
    case 'streak': return `${number} ${noun('day', 'days')} played this year`;
    case 'world-time': return `${number} recorded ${noun('hour', 'hours')} in this world this year`;
    case 'discoveries': return `${number} new ${noun('world', 'worlds')} discovered this year`;
    case 'friends': return `${number} new ${noun('friend', 'friends')} this year`;
    case 'instances': return `${number} different ${noun('instance', 'instances')} visited this year`;
    case 'worlds': return `${number} different ${noun('world', 'worlds')} visited this year`;
    case 'avatars': return `${number} ${noun('avatar', 'avatars')} uploaded this year`;
  }
}

/** Find real monthly maxima and ties; selection and ordering happen separately. */
export function monthlyRecord(id: RecordId, timeline: TimelineData, extra: Partial<RecordPageData> = {}): RecordPageData {
  let value = 0;
  let month: number | null = null;
  timeline.months.forEach((entry, index) => {
    if (entry.value !== null && entry.value > value) { value = entry.value; month = index; }
  });
  const months = value > 0 ? timeline.months.flatMap((entry, index) => entry.value !== null && Math.abs(entry.value - value) <= .000001 ? [index] : []) : [];
  const result: RecordPageData = { id, status: 'ready', value, month, months, timeline, ...extra };
  result.yearlyTotal = recordYearlyTotal(result);
  return result;
}
