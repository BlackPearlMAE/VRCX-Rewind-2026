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

/** Find real monthly maxima and ties; selection and ordering happen separately. */
export function monthlyRecord(id: RecordId, timeline: TimelineData, extra: Partial<RecordPageData> = {}): RecordPageData {
  let value = 0;
  let month: number | null = null;
  timeline.months.forEach((entry, index) => {
    if (entry.value !== null && entry.value > value) { value = entry.value; month = index; }
  });
  const months = value > 0 ? timeline.months.flatMap((entry, index) => entry.value !== null && Math.abs(entry.value - value) <= .000001 ? [index] : []) : [];
  return { id, status: 'ready', value, month, months, timeline, ...extra };
}
