import type { TimelineData } from '../components/monthly-timeline';

export const worldsDefinitions = [
  { id: 'discoveries', title: 'New worlds discovered', unit: 'worlds discovered', note: 'First recorded visits in 2026, checked against all retained history. Earlier unrecorded visits may be missing.' },
  { id: 'visits', title: 'Your most visited worlds', unit: 'recorded visits', note: 'Your top 10 by recorded visits. Returning to an instance counts as another visit; visits do not establish favourites.' },
  { id: 'time', title: 'Where you spent your time', unit: 'estimated hours', note: 'Your top 10 by corrected recorded time. Visits are clipped to the recap period.' },
  { id: 'owned', title: 'Your instances', unit: 'recorded instances', note: 'Dated by first recorded visit; home instances are included. Ownership does not prove creation. Public, group-owned and never-visited instances are not covered by personal ownership tags.' },
] as const;

export type WorldsId = typeof worldsDefinitions[number]['id'];
export interface WorldEntry {
  worldId: string;
  name: string;
  value: number;
  imageUrl?: string;
  detail?: string;
}
export interface WorldsPageData {
  id: WorldsId;
  status: 'ready' | 'unavailable';
  total: number;
  uniqueWorlds?: number;
  entries: WorldEntry[];
  reserve?: WorldEntry;
  timeline?: TimelineData;
  breakdown?: { label: string; value: number }[];
  detail?: string;
  source?: 'recorded-aggregate';
}
export function unavailableWorlds(): WorldsPageData[] {
  return worldsDefinitions.map(({ id }) => ({ id, status: 'unavailable', total: 0, entries: [] }));
}
